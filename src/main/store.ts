import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import { safeStorage } from 'electron';
import { getDefaultGroqApiKey } from './config.js';
import { getAppConfig } from './app-config.js';
import { SpeakeasyError } from './errors.js';
import { runLocalStoreMigrations } from './store-migrations.js';
import { EMPTY_DICTATION_STATS, type DictationStats } from '../shared/dictation-stats.js';
import { DEFAULT_HOTKEY_ID, isHotkeyId } from '../shared/hotkeys.js';
import { DEFAULT_WIDGET_SIZE_ID, isWidgetSizeId } from '../shared/widget-sizes.js';
import { DEFAULT_WIDGET_THEME_ID, normalizeWidgetThemeId } from '../shared/widget-themes.js';
import type { SpeakeasySettings } from '../shared/types.js';

export interface AppStoreSchema extends SpeakeasySettings {
  localSchemaVersion?: number;
  deviceId: string;
  authGeneration: number;
  hotkeyVerified: boolean;
  microphonePermissionGranted: boolean;
  onboardingWelcomeCompleted: boolean;
  setupCompletedOnce: boolean;
  setupReviewRequested: boolean;
  setupRecoveryStep: number;
  pasteReadinessInvalid: boolean;
  pendingBillingConfirmation: {
    action: 'checkout' | 'portal';
    requestedPlan: 'standard' | 'pro' | null;
  } | null;
  productSession: string;
  productSessionEncrypted: string;
  pendingAuthTransactionEncrypted: string;
  hostedOperationOutboxEncrypted: string;
  pendingDeletionEncrypted: string;
  resumeCheckpoint: string;
  dictationStats: DictationStats;
  activationNudgeShownAt: string;
  /**
   * Encrypted Groq API key (base64 of safeStorage ciphertext). The plaintext
   * `groqApiKey` field is retained only for backward-compat migration — once a
   * legacy plaintext key is migrated it is cleared. See hardening item 4.
   */
  groqApiKeyEncrypted: string;
}

let store: Store<AppStoreSchema> | null = null;

export const getStore = (): Store<AppStoreSchema> => {
  if (!store) {
    store = new Store<AppStoreSchema>({
      // If the on-disk JSON is corrupt, reset to defaults rather than crashing
      // on launch. Hardening item 17.
      clearInvalidConfig: true,
      defaults: {
        hotkey: DEFAULT_HOTKEY_ID,
        groqApiKey: '',
        groqApiKeyEncrypted: '',
        polishBeforePaste: true,
        dictationSounds: true,
        cleanupStrength: 'minimal',
        widgetForm: 'pill',
        widgetSize: DEFAULT_WIDGET_SIZE_ID,
        widgetTheme: DEFAULT_WIDGET_THEME_ID,
        widgetOpacity: 90,
        showWidgetOverFullScreenApps: true,
        widgetPosition: {
          x: 96,
          y: 96
        },
        productAuthEmail: '',
        deviceId: randomUUID(),
        authGeneration: 0,
        hotkeyVerified: false,
        microphonePermissionGranted: false,
        onboardingWelcomeCompleted: false,
        setupCompletedOnce: false,
        setupReviewRequested: false,
        setupRecoveryStep: 0,
        pasteReadinessInvalid: false,
        pendingBillingConfirmation: null,
        productSession: '',
        productSessionEncrypted: '',
        pendingAuthTransactionEncrypted: '',
        hostedOperationOutboxEncrypted: '',
        pendingDeletionEncrypted: '',
        resumeCheckpoint: '',
        dictationStats: EMPTY_DICTATION_STATS,
        activationNudgeShownAt: ''
      }
    });

    runLocalStoreMigrations(store, { edition: getAppConfig().edition });

    // Legacy installs stored the hotkey as a display label ("Right Option") or
    // an unrelated accelerator ("CommandOrControl+Shift+Space"); neither is a
    // valid option id. Normalize any non-id value to the default binding so the
    // picker and the hook agree.
    if (!isHotkeyId(store.get('hotkey'))) {
      store.set('hotkey', DEFAULT_HOTKEY_ID);
    }

    const normalizedWidgetTheme = normalizeWidgetThemeId(store.get('widgetTheme'));
    if (store.get('widgetTheme') !== normalizedWidgetTheme) {
      store.set('widgetTheme', normalizedWidgetTheme);
    }

    if (!isWidgetSizeId(store.get('widgetSize'))) {
      store.set('widgetSize', DEFAULT_WIDGET_SIZE_ID);
    }

    // Migrate any legacy plaintext key first, then seed an encrypted default
    // (dev only — getDefaultGroqApiKey is a no-op in packaged builds since
    // loadEnvFile is gated to dev) when nothing is stored yet.
    if (getAppConfig().capabilities.byoApiKey) {
      migratePlaintextGroqKey(store);
    }

    const defaultKey = getDefaultGroqApiKey();
    if (
      getAppConfig().capabilities.byoApiKey &&
      !store.get('groqApiKeyEncrypted') &&
      defaultKey &&
      safeStorage.isEncryptionAvailable()
    ) {
      store.set('groqApiKeyEncrypted', encrypt(defaultKey));
    }
  }

  return store;
};

const requireEncryption = (): void => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new SpeakeasyError(
      'missing-api-key',
      'Secure storage is unavailable on this system, so the Groq API key cannot be saved safely. ' +
        'Ensure your macOS login keychain is unlocked and try again.'
    );
  }
};

const encrypt = (value: string): string => {
  requireEncryption();
  return safeStorage.encryptString(value).toString('base64');
};

const decrypt = (value: string): string => {
  if (!value) {
    return '';
  }
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch {
    return '';
  }
};

/**
 * On first read after upgrade, migrate any plaintext `groqApiKey` (legacy
 * format, looks like `gsk_...`) into encrypted storage and clear the plaintext.
 */
const migratePlaintextGroqKey = (s: Store<AppStoreSchema>): void => {
  const plaintext = s.get('groqApiKey');
  if (!plaintext) {
    return;
  }

  if (safeStorage.isEncryptionAvailable()) {
    s.set('groqApiKeyEncrypted', encrypt(plaintext));
  }
  // Always clear the plaintext copy so the key never lingers unencrypted on
  // disk, even if encryption was unavailable (the user will be re-prompted).
  s.set('groqApiKey', '');
};

export const getGroqApiKey = (): string => {
  const s = getStore();
  const encrypted = s.get('groqApiKeyEncrypted');
  if (encrypted) {
    return decrypt(encrypted);
  }
  // Fallback for the brief window before migration runs.
  return s.get('groqApiKey') ?? '';
};

export const setGroqApiKey = (value: string): void => {
  const s = getStore();
  if (!value) {
    s.set('groqApiKeyEncrypted', '');
    s.set('groqApiKey', '');
    return;
  }

  s.set('groqApiKeyEncrypted', encrypt(value));
  s.set('groqApiKey', '');
};
