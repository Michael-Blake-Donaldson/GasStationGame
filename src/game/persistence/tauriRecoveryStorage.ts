import { invoke } from '@tauri-apps/api/core';
import type { RecoverySlotId, RecoverySlotStorage } from './recoveryRotation';

export const tauriRecoveryStorage: RecoverySlotStorage = {
  readSlot: (slotId: RecoverySlotId) =>
    invoke<string | null>('read_recovery_slot', { slotId }),
  replaceSlotAtomically: (
    slotId: RecoverySlotId,
    expectedSerialized: string | null,
    serialized: string,
  ) =>
    invoke<boolean>('replace_recovery_slot', {
      expectedSerialized,
      serialized,
      slotId,
    }),
};
