use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{AppHandle, Manager, State};

const MAX_SAVE_BYTES: usize = 16 * 1024 * 1024;
const SLOT_IDS: [&str; 3] = ["recovery-slot-0", "recovery-slot-1", "recovery-slot-2"];

pub struct RecoveryStorageLock(pub Mutex<()>);

fn slot_filename(slot_id: &str) -> Result<String, String> {
    if !SLOT_IDS.contains(&slot_id) {
        return Err("Unknown recovery slot.".to_owned());
    }
    Ok(format!("{slot_id}.json"))
}

fn recovery_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("recovery"))
        .map_err(|error| error.to_string())
}

fn read_slot_at(directory: &Path, slot_id: &str) -> Result<Option<String>, String> {
    let path = directory.join(slot_filename(slot_id)?);
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    if file.metadata().map_err(|error| error.to_string())?.len()
        > u64::try_from(MAX_SAVE_BYTES).expect("save limit fits in u64")
    {
        return Err("Recovery save exceeds the 16 MiB limit.".to_owned());
    }
    let mut bytes = Vec::new();
    file.take(u64::try_from(MAX_SAVE_BYTES + 1).expect("save read limit fits in u64"))
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > MAX_SAVE_BYTES {
        return Err("Recovery save exceeds the 16 MiB limit.".to_owned());
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "Recovery save is not valid UTF-8.".to_owned())
}

fn replace_slot_at(
    directory: &Path,
    slot_id: &str,
    expected_serialized: Option<&str>,
    serialized: &str,
) -> Result<bool, String> {
    if serialized.len() > MAX_SAVE_BYTES {
        return Err("Recovery save exceeds the 16 MiB limit.".to_owned());
    }
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    if read_slot_at(directory, slot_id)?.as_deref() != expected_serialized {
        return Ok(false);
    }

    let path = directory.join(slot_filename(slot_id)?);
    let temporary = directory.join(format!("{slot_id}.pending"));
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temporary)
        .map_err(|error| error.to_string())?;
    if let Err(error) = file
        .write_all(serialized.as_bytes())
        .and_then(|()| file.sync_all())
    {
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    drop(file);
    if let Err(error) = fs::rename(&temporary, &path) {
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    Ok(true)
}

#[tauri::command]
pub fn read_recovery_slot(
    app: AppHandle,
    lock: State<'_, RecoveryStorageLock>,
    slot_id: String,
) -> Result<Option<String>, String> {
    let _guard = lock.0.lock().map_err(|_| "Recovery lock poisoned.")?;
    read_slot_at(&recovery_directory(&app)?, &slot_id)
}

#[tauri::command]
pub fn replace_recovery_slot(
    app: AppHandle,
    lock: State<'_, RecoveryStorageLock>,
    slot_id: String,
    expected_serialized: Option<String>,
    serialized: String,
) -> Result<bool, String> {
    let _guard = lock.0.lock().map_err(|_| "Recovery lock poisoned.")?;
    replace_slot_at(
        &recovery_directory(&app)?,
        &slot_id,
        expected_serialized.as_deref(),
        &serialized,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("recovery-storage-tests")
            .join(format!("{name}-{}", std::process::id()))
    }

    #[test]
    fn compare_and_replace_rejects_stale_writers() {
        let directory = test_directory("compare-replace");
        let _ = fs::remove_dir_all(&directory);

        assert!(replace_slot_at(&directory, SLOT_IDS[0], None, "first").unwrap());
        assert!(!replace_slot_at(&directory, SLOT_IDS[0], None, "stale").unwrap());
        assert_eq!(
            read_slot_at(&directory, SLOT_IDS[0]).unwrap().as_deref(),
            Some("first")
        );
        assert!(replace_slot_at(&directory, SLOT_IDS[0], Some("first"), "second").unwrap());
        assert_eq!(
            read_slot_at(&directory, SLOT_IDS[0]).unwrap().as_deref(),
            Some("second")
        );

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_unknown_slots_and_oversized_payloads() {
        let directory = test_directory("validation");
        let _ = fs::remove_dir_all(&directory);
        assert!(read_slot_at(&directory, "../foreign").is_err());
        let oversized = "x".repeat(MAX_SAVE_BYTES + 1);
        assert!(replace_slot_at(&directory, SLOT_IDS[0], None, &oversized).is_err());
        assert!(!directory.exists());
    }

    #[test]
    fn rejects_oversized_files_before_loading_them() {
        let directory = test_directory("oversized-read");
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join(slot_filename(SLOT_IDS[0]).unwrap());
        let file = File::create(&path).unwrap();
        file.set_len(u64::try_from(MAX_SAVE_BYTES + 1).unwrap())
            .unwrap();

        assert!(read_slot_at(&directory, SLOT_IDS[0]).is_err());

        fs::remove_dir_all(directory).unwrap();
    }
}
