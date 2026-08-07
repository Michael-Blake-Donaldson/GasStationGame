mod recovery_storage;

use recovery_storage::RecoveryStorageLock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(RecoveryStorageLock(std::sync::Mutex::new(())))
        .invoke_handler(tauri::generate_handler![
            recovery_storage::read_recovery_slot,
            recovery_storage::replace_recovery_slot
        ])
        .run(tauri::generate_context!())
        .expect("desktop application failed to start");
}
