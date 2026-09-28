import { supportLog } from './support-logger.js';
import { getAppConfig } from './app-config.js';
import { getDictationStats } from './dictation-stats-store.js';
import { getPlatformState } from './platform-service.js';
import type {
  AuthState,
  BillingState,
  DiagnosticsState,
  ErrorCode,
  NativeReadinessBlock,
  SpeakeasyRuntimeState,
  UpdaterState,
  UsageState
} from '../shared/types.js';

type RuntimeListener = (state: SpeakeasyRuntimeState) => void;

const listeners = new Set<RuntimeListener>();

const createDefaultRuntimeState = (): SpeakeasyRuntimeState => {
  const config = getAppConfig();

  const defaultAuthState: AuthState = {
    status: config.capabilities.productAuth ? 'signed-out' : 'disabled',
    email: '',
    pendingEmail: '',
    message: config.capabilities.productAuth ? 'Sign in to use hosted dictation.' : ''
  };

  const defaultUsageState: UsageState = {
    status: config.capabilities.hostedUsage ? 'unknown' : 'disabled',
    usedSeconds: 0,
    remainingSeconds: null,
    hardLimitSeconds: null,
    usedSuccessfulDictations: 0,
    reservedSuccessfulDictations: 0,
    remainingSuccessfulDictations: null,
    hardLimitSuccessfulDictations: null,
    resetAt: '',
    message: config.capabilities.hostedUsage ? 'Usage will appear after sign-in.' : ''
  };

  const defaultBillingState: BillingState = {
    status: config.capabilities.hostedUsage ? 'unknown' : 'disabled',
    plan: 'free',
    paymentStatus: '',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: '',
    message: config.capabilities.hostedUsage ? 'Billing will appear after sign-in.' : ''
  };

  const defaultUpdaterState: UpdaterState = {
    status: config.capabilities.autoUpdate ? 'idle' : 'disabled',
    message: config.capabilities.autoUpdate ? 'Updates idle.' : 'Updates unavailable.',
    availableVersion: ''
  };

  const defaultDiagnosticsState: DiagnosticsState = {
    appName: config.appName,
    appVersion: config.appVersion,
    edition: config.edition,
    releaseChannel: config.releaseChannel,
    hotkeyLabel: 'Right Option',
    hotkeyMode: 'unavailable',
    microphonePermission: 'unknown',
    accessibilityPermission: 'missing',
    signedIn: false,
    lastErrorCode: 'none'
  };

  return {
    dictationStats: getDictationStats(),
    edition: config.edition,
    releaseChannel: config.releaseChannel,
    supportUrl: config.supportUrl,
    privacyUrl: config.privacyUrl,
    capabilities: config.capabilities,
    platform: getPlatformState(),
    auth: defaultAuthState,
    usage: defaultUsageState,
    billing: defaultBillingState,
    updater: defaultUpdaterState,
    nativeReadiness: null,
    diagnostics: defaultDiagnosticsState,
    accountLifecycle: {
      status: 'active',
      message: ''
    }
  };
};

let runtimeState: SpeakeasyRuntimeState | null = null;

const ensureRuntimeState = (): SpeakeasyRuntimeState => {
  if (!runtimeState) {
    runtimeState = createDefaultRuntimeState();
  }

  return runtimeState;
};

const emit = (): void => {
  const snapshot = getRuntimeState();
  for (const listener of listeners) {
    listener(snapshot);
  }
};

export const getRuntimeState = (): SpeakeasyRuntimeState => {
  return structuredClone(ensureRuntimeState());
};

export const onRuntimeStateChange = (listener: RuntimeListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const updateAuthState = (patch: Partial<AuthState>): void => {
  const state = ensureRuntimeState();
  runtimeState = {
    ...state,
    auth: {
      ...state.auth,
      ...patch
    },
    diagnostics: {
      ...state.diagnostics,
      signedIn: patch.status !== undefined ? patch.status === 'signed-in' : state.auth.status === 'signed-in'
    }
  };
  emit();
};

export const updateUsageState = (patch: Partial<UsageState>): void => {
  const state = ensureRuntimeState();
  runtimeState = {
    ...state,
    usage: {
      ...state.usage,
      ...patch
    }
  };
  emit();
};

export const updateBillingState = (patch: Partial<BillingState>): void => {
  const state = ensureRuntimeState();
  runtimeState = {
    ...state,
    billing: { ...state.billing, ...patch }
  };
  emit();
};

export const updateUpdaterState = (patch: Partial<UpdaterState>): void => {
  const state = ensureRuntimeState();
  runtimeState = {
    ...state,
    updater: {
      ...state.updater,
      ...patch
    }
  };
  emit();
};

export const updateDiagnosticsState = (patch: Partial<DiagnosticsState>): void => {
  const state = ensureRuntimeState();
  runtimeState = {
    ...state,
    diagnostics: {
      ...state.diagnostics,
      ...patch
    }
  };
  emit();
};

export const updateAccountLifecycleState = (
  patch: Partial<SpeakeasyRuntimeState['accountLifecycle']>
): void => {
  const state = ensureRuntimeState();
  runtimeState = {
    ...state,
    accountLifecycle: { ...state.accountLifecycle, ...patch }
  };
  emit();
};

export const refreshDictationStats = (): void => {
  const state = ensureRuntimeState();
  runtimeState = { ...state, dictationStats: getDictationStats() };
  emit();
};

export const updateNativeReadiness = (
  nativeReadiness: NativeReadinessBlock | null
): void => {
  const state = ensureRuntimeState();
  runtimeState = { ...state, nativeReadiness };
  emit();
};

export const setLastErrorCode = (errorCode: ErrorCode): void => {
  if (errorCode !== 'none') supportLog('state.error', { code: errorCode });
  updateDiagnosticsState({
    lastErrorCode: errorCode
  });
};

export const resetLastErrorCode = (): void => {
  setLastErrorCode('none');
};
