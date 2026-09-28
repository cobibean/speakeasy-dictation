export interface AccountCleanupStore {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => unknown;
  delete: (key: string) => unknown;
}

export const clearDeletedAccountLocalState = async ({
  store,
  createDeviceId,
  clearLog
}: {
  store: AccountCleanupStore;
  createDeviceId: () => string;
  clearLog: () => void;
}): Promise<void> => {
  const authGeneration = Number(store.get('authGeneration') ?? 0);
  for (const key of [
    'productSession',
    'productSessionEncrypted',
    'pendingAuthTransactionEncrypted',
    'hostedOperationOutboxEncrypted',
    'pendingDeletionEncrypted',
    'resumeCheckpoint'
  ]) {
    store.delete(key);
  }
  store.set('authGeneration', Number.isSafeInteger(authGeneration) ? authGeneration + 1 : 1);
  store.set('deviceId', createDeviceId());
  store.set('productAuthEmail', '');
  store.set('hotkeyVerified', false);
  store.set('microphonePermissionGranted', false);
  store.set('onboardingWelcomeCompleted', false);
  store.set('setupCompletedOnce', false);
  store.set('setupReviewRequested', false);
  store.set('setupRecoveryStep', 0);
  store.set('pasteReadinessInvalid', false);
  store.set('pendingBillingConfirmation', null);
  clearLog();
};
