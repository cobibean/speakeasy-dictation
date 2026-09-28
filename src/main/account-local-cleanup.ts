import { randomUUID } from 'node:crypto';
import { clearDebugLog } from './logger.js';
import { getStore } from './store.js';
import { clearDeletedAccountLocalState } from './account-local-cleanup-core.js';

export const clearCurrentDeletedAccountLocalState = (): Promise<void> =>
  clearDeletedAccountLocalState({
    store: getStore(),
    createDeviceId: randomUUID,
    clearLog: clearDebugLog
  });
