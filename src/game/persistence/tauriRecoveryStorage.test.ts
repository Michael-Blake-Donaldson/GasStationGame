import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke }));

describe('Tauri recovery storage adapter', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('exposes only fixed-slot read and compare-and-replace commands', async () => {
    invoke.mockResolvedValueOnce('old').mockResolvedValueOnce(true);
    const { tauriRecoveryStorage } = await import('./tauriRecoveryStorage');

    await expect(tauriRecoveryStorage.readSlot('recovery-slot-1')).resolves.toBe('old');
    await expect(
      tauriRecoveryStorage.replaceSlotAtomically('recovery-slot-1', 'old', 'new'),
    ).resolves.toBe(true);
    expect(invoke).toHaveBeenNthCalledWith(1, 'read_recovery_slot', {
      slotId: 'recovery-slot-1',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'replace_recovery_slot', {
      expectedSerialized: 'old',
      serialized: 'new',
      slotId: 'recovery-slot-1',
    });
  });
});
