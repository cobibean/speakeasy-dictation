import type { AppEdition } from '../shared/types.js';

export const LOCAL_STORE_SCHEMA_VERSION = 4;

export interface MigrationStore {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => unknown;
  delete: (key: string) => unknown;
}

export interface LocalStoreMigrationResult {
  changed: boolean;
  fromVersion: number;
  toVersion: number;
}

const readSchemaVersion = (store: MigrationStore): number => {
  const value = store.get('localSchemaVersion');
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;
};

export const runLocalStoreMigrations = (
  store: MigrationStore,
  { edition }: { edition: AppEdition }
): LocalStoreMigrationResult => {
  const fromVersion = readSchemaVersion(store);
  if (fromVersion >= LOCAL_STORE_SCHEMA_VERSION) {
    return {
      changed: false,
      fromVersion,
      toVersion: fromVersion
    };
  }

  if (edition === 'product' && fromVersion < 1) {
    // The W1 certification spike used the product package identity while
    // intentionally exposing BYOK. The real hosted-product package must remove
    // that residue without disturbing device identity or harmless preferences.
    store.delete('groqApiKey');
    store.delete('groqApiKeyEncrypted');
  }

  if (edition === 'product' && fromVersion < 2) {
    // W4b removes the legacy productSession field because historical builds
    // could store it as plaintext when safeStorage was unavailable. Sessions
    // must be re-established into the fail-closed encrypted store.
    store.delete('productSession');
    store.delete('pendingAuth');
    store.delete('productAuthEmail');
  }

  if (edition === 'product' && fromVersion < 3) {
    // Operation recovery is encrypted and content-free in W4c. Remove any
    // abandoned experimental plaintext keys before enabling the new outbox.
    store.delete('operationOutbox');
    store.delete('hostedOperationOutbox');
  }

  if (edition === 'product' && fromVersion < 4) {
    // W4d stores only content-free device/setup routing facts locally. Server
    // setup remains authoritative; these flags prevent a completed install
    // from being mistaken for a brand-new one during offline recovery.
    if (store.get('microphonePermissionGranted') === undefined) {
      store.set('microphonePermissionGranted', false);
    }
    if (store.get('onboardingWelcomeCompleted') === undefined) {
      store.set('onboardingWelcomeCompleted', false);
    }
    if (store.get('setupCompletedOnce') === undefined) {
      store.set('setupCompletedOnce', false);
    }
    if (store.get('setupReviewRequested') === undefined) {
      store.set('setupReviewRequested', false);
    }
    if (store.get('setupRecoveryStep') === undefined) {
      store.set('setupRecoveryStep', 0);
    }
  }

  store.set('localSchemaVersion', LOCAL_STORE_SCHEMA_VERSION);
  return {
    changed: true,
    fromVersion,
    toVersion: LOCAL_STORE_SCHEMA_VERSION
  };
};
