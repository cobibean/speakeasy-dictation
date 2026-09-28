import { startActivationNudgeScheduler } from './activation-nudge-scheduler.js';
import { workflowPresetSettings } from '../shared/workflow-presets.js';
import { createSupportBundle, supportLog, supportFailure } from './support-logger.js';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  powerMonitor,
  session,
  shell,
  systemPreferences
} from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAppConfig } from './app-config.js';
import { SpeakeasyError, toErrorCode } from './errors.js';
import {
  isHotkeyRecording,
  getHotkeyLabel,
  getHotkeyMode,
  recoverHeldHotkey,
  registerHotkey,
  setHotkeyCaptureTarget,
  setHotkey,
  unregisterHotkey
} from './hotkey.js';
import {
  HOTKEY_RECOVERY_POWER_EVENTS,
  shouldClearRecoveredHotkeyError
} from './hotkey-core.js';
import {
  applyUsageSnapshot,
  cancelHostedAuthTransaction,
  completeMagicLinkSignIn,
  initializeHostedProductAuth,
  requestMagicLink,
  resetHostedProductLocalSignIn,
  resumeHostedAuthTransaction,
  signOutProduct
} from './product-auth.js';
import {
  acknowledgeHostedOperation,
  advanceHostedProductSetup,
  bootstrapProductSession,
  consumeHostedBillingReturn,
  deleteHostedProductAccount,
  fetchHostedSupportStatuses,
  hasPendingHostedAccountDeletion,
  recordHostedProcessingConsent,
  retryHostedProductAccountDeletion,
  renewHostedProductSetupPractice,
  requestCheckoutUrl,
  requestPortalUrl,
  submitHostedSupportRequest
} from './product-api.js';
import { clearCurrentDeletedAccountLocalState } from './account-local-cleanup.js';
import { loadEnvFile } from './config.js';
import {
  createOverlayWindow,
  getOverlayWindow,
  hideOverlayWindow,
  openOverlayPanel,
  sendFinalTranscript,
  sendOverlayStatus,
  sendRecordingRecovery,
  showOverlayWindow,
  setOverlayLayout,
  setOverlayFullScreenVisibility
} from './overlay.js';
import {
  closeOnboardingWindow,
  getOnboardingWindow,
  showOnboardingWindow
} from './onboarding-window.js';
import {
  resolveHostedSetupBootstrap,
  type HostedSetupBootstrapState
} from './hosted-setup-bootstrap.js';
import { HostedBootstrapActivationGate } from './hosted-bootstrap-activation-gate.js';
import { selectHostedProductRuntime } from './hosted-product-runtime.js';
import { createProtocolActivationNativeAdapter } from './protocol-activation-adapter.js';
import { toNativeReadinessBlock } from './native-adapters.js';
import { getProductSecureStorageReadiness } from './product-secure-storage.js';
import { runPipeline as runRawPipeline } from './pipeline.js';
import { maybeShowActivationNudge } from './activation-nudge.js';
import { isUpdateOperationActive, withUpdateActivity } from './update-activity.js';
import { pasteText } from './paste.js';
import {
  getRuntimeState,
  onRuntimeStateChange,
  resetLastErrorCode,
  setLastErrorCode,
  updateAuthState,
  updateBillingState,
  updateAccountLifecycleState,
  updateDiagnosticsState,
  updateNativeReadiness,
  updateUsageState
} from './runtime-state.js';
import { getStore, getGroqApiKey, setGroqApiKey } from './store.js';
import { createTray } from './tray.js';
import { initializeUpdater, checkForUpdates, openUpdateDownload, installUpdate } from './updater.js';
import { debugLog } from './logger.js';
import {
  extractProtocolUrl,
  getWindowsAppUserModelId,
  shouldRecoverHotkeyOnPowerEvents
} from './app-lifecycle.js';
import {
  selectStartupDestination,
  type ProtocolWake
} from './startup-router.js';
import {
  getMicrophonePermission,
  getAccessibilityPermission,
  reportMicrophonePermission,
  requestAccessibilityPermission,
  requestMicrophonePermission
} from './platform-service.js';
import { logLatencyMark, logLatencyMarks, normalizeCaptureId } from './latency-log.js';
import { IPC_CHANNELS } from '../shared/ipc-channels.js';
import { canKeepCompletedInstallHud, errorAfterSetupReady } from '../shared/setup-bootstrap.js';
import { createPrivacySafeSupportEvidence } from '../shared/support-evidence.js';
import { DEFAULT_HOTKEY_ID } from '../shared/hotkeys.js';
import { isCaptureId, isLatencyPhase } from '../shared/latency.js';
import { DEFAULT_WIDGET_SIZE_ID } from '../shared/widget-sizes.js';
import { DEFAULT_WIDGET_THEME_ID } from '../shared/widget-themes.js';
import { validateAudioCapturePayload } from '../shared/capture-policy.js';
import { getHostedOperationOutbox } from './product-operation-outbox.js';
import { isBillingReturnConfirmed } from '../shared/billing-confirmation.js';
import type {
  ProductBillingReturnResponse,
  ProductBillingSnapshot,
  ProductSupportSubmission
} from '../shared/product-api.js';

const isW3IdleSoak = process.env.SPEAKEASY_W3_IDLE_SOAK === '1';
import {
  ALLOWED_SETTINGS_KEYS,
  isValidSettingValue,
  type AllowedSettingKey,
  type AudioCapturePayload,
  type OnboardingPracticeCapturePayload,
  type OnboardingPracticeCaptureResult,
  type OverlayStatus,
  type SpeakeasySettings
} from '../shared/types.js';

const broadcastStatus = (status: OverlayStatus): void => {
  sendOverlayStatus(status);
};

const runPipeline: typeof runRawPipeline = (options) => withUpdateActivity(() => runRawPipeline(options));

let processingEpoch = 0;

const broadcastRuntimeState = (): void => {
  const snapshot = getRuntimeState();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.RUNTIME_CHANGED, snapshot);
    }
  }
};

const launchConfig = getAppConfig();
// Chromium can initialize Keychain storage before bootstrap/ready. Keep the
// staging name distinct from the start, without migrating Product's identity.
if (launchConfig.buildProfile === 'mac-staging') app.setName(launchConfig.appName);
const isReviewBaseline = launchConfig.buildProfile === 'mac-review-baseline';
// Set the Mac edition-owned state root before Chromium creates its singleton
// lock or electron-store opens. Product preserves its accepted namespace; OSS
// can never share Product state, cache, singleton, or secure envelopes. The
// accepted Windows package identity and state location remain untouched.
if (process.platform === 'darwin') {
  app.setPath(
    'userData',
    path.join(app.getPath('appData'), isReviewBaseline ? 'speakeasy-review-baseline' : launchConfig.localDataNamespace)
  );
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

if (process.platform === 'win32') {
  app.setAppUserModelId(getWindowsAppUserModelId(launchConfig.edition));
}

const hostedProductRuntime = selectHostedProductRuntime({
  edition: launchConfig.edition,
  capabilities: launchConfig.capabilities,
  productEnvironment: launchConfig.productEnvironment,
  productApiBaseUrl: launchConfig.productApiBaseUrl,
  platform: process.platform,
  distribution: launchConfig.distribution
});
const productActivationAdapter = createProtocolActivationNativeAdapter({
  initialArguments: process.argv,
  protocolScheme: launchConfig.protocolScheme
});
const hostedActivationGate = new HostedBootstrapActivationGate<ProtocolWake>(
  hostedProductRuntime.enabled
    ? productActivationAdapter.initialWake()
    : null
);
let queuedAuthUrl: string | null =
  !hostedProductRuntime.enabled
    ? extractProtocolUrl(process.argv, launchConfig.protocolScheme)
    : null;
let hostedSetupState: HostedSetupBootstrapState = {
  auth: {
    secureStorageAvailable: true,
    secureStorageStatus: 'ready',
    signedInEmail: '',
    pendingEmail: '',
    pendingStatus: 'none',
    transactionId: '',
    expiresAt: '',
    message: 'Sign in with email.'
  },
  setup: {
    destination: 'onboarding',
    earliestIncompleteStep: 1,
    reason: 'account-required'
  },
  server: null,
  mode: 'first-run',
  device: {
    microphoneStatus: 'unknown',
    accessibilityStatus: process.platform === 'darwin' ? 'missing' : 'not-required',
    operatingSystem: process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'unsupported',
    hotkeyId: DEFAULT_HOTKEY_ID,
    hotkeyVerified: false
  },
  canClose: false,
  requestedStep: null
};

const routeStartupSurface = ({
  protocolWake = false,
  openSettings = false
}: {
  protocolWake?: boolean;
  openSettings?: boolean;
} = {}): void => {
  const config = getAppConfig();
  const completedInstallRecovery = canKeepCompletedInstallHud({
    setupCompletedOnce: getStore().get('setupCompletedOnce'),
    mode: hostedSetupState.mode,
    serverSetupCompleted:
      hostedSetupState.server?.accountDeviceSetup.completed ?? null
  });
  const destination = selectStartupDestination({
    edition: config.edition,
    setupStatus:
      hostedProductRuntime.enabled
        ? hostedSetupState.mode !== 'first-run'
          ? 'incomplete'
          : hostedSetupState.setup.destination === 'hud' || completedInstallRecovery
            ? 'complete'
            : 'incomplete'
        : 'complete'
  });

  if (destination === 'onboarding') {
    hideOverlayWindow();
    const window = showOnboardingWindow({ protocolWake });
    window.once('closed', () => {
      if (hostedSetupState.mode === 'review') {
        getStore().set('setupReviewRequested', false);
        getStore().set('setupRecoveryStep', 0);
        void refreshHostedSetupState()
          .then(() => routeStartupSurface())
          .catch((error) => {
            debugLog(
              `Setup Review close could not refresh hosted state: ${
                error instanceof Error ? error.name : 'unknown-error'
              }`
            );
            setHotkeyCaptureTarget('overlay');
            showOverlayWindow({ active: false });
          });
      } else if (hostedSetupState.setup.destination !== 'hud') {
        setHotkeyCaptureTarget('inactive');
      } else {
        setHotkeyCaptureTarget('overlay');
      }
    });
    if (protocolWake) {
      debugLog('Opaque product protocol wake routed to the Onboarding Window');
    }
    return;
  }

  setHotkeyCaptureTarget('overlay');
  if (hostedProductRuntime.enabled && !openSettings) {
    showOverlayWindow({ active: false });
  } else {
    openOverlayPanel();
  }
};

const getSettingsSnapshot = (): SpeakeasySettings => {
  const store = getStore();
  const config = getAppConfig();

  return {
    groqApiKey: config.capabilities.byoApiKey ? getGroqApiKey() : '',
    polishBeforePaste: store.get('polishBeforePaste') ?? true,
    hotkey: store.get('hotkey') ?? DEFAULT_HOTKEY_ID,
    cleanupStrength: store.get('cleanupStrength') ?? 'minimal',
    widgetForm: store.get('widgetForm') ?? 'pill',
    widgetSize: store.get('widgetSize') ?? DEFAULT_WIDGET_SIZE_ID,
    widgetTheme: store.get('widgetTheme') ?? DEFAULT_WIDGET_THEME_ID,
    widgetOpacity: store.get('widgetOpacity') ?? 90,
    showWidgetOverFullScreenApps: store.get('showWidgetOverFullScreenApps') ?? true,
    widgetPosition: store.get('widgetPosition') ?? { x: 96, y: 96 },
    productAuthEmail: store.get('productAuthEmail') ?? ''
  };
};

const refreshDiagnostics = (): void => {
  updateDiagnosticsState({
    hotkeyLabel: getHotkeyLabel(),
    hotkeyMode: getHotkeyMode(),
    accessibilityPermission:
      process.platform === 'darwin'
        ? systemPreferences.isTrustedAccessibilityClient(false)
          ? 'granted'
          : 'missing'
        : 'not-required',
    microphonePermission: getMicrophonePermission()
  });
};

const checkAccessibilityPermission = async (): Promise<boolean> => {
  if (process.platform === 'darwin') {
    const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);

    if (!isTrusted) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'Accessibility Permission Required',
        message: `speakeasy. needs Accessibility access for ${getHotkeyLabel()} hold-to-talk.`,
        detail:
          'Without this permission, modifier-only hold-to-talk is unavailable. You can grant Accessibility access or choose a function key in Settings.',
        buttons: ['Open System Settings', 'Continue to Settings'],
        defaultId: 0
      });

      if (response === 0) {
        systemPreferences.isTrustedAccessibilityClient(true);
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      }

      refreshDiagnostics();
      return false;
    }

    refreshDiagnostics();
    return true;
  }

  refreshDiagnostics();
  return true;
};

const allowMediaPermissionForSpeakeasy = (): void => {
  const isTrustedOrigin = (requestingUrl: string): boolean => {
    return requestingUrl.startsWith('file://');
  };

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (permission === 'media') {
      return isTrustedOrigin(requestingOrigin);
    }

    return false;
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission === 'media' && isTrustedOrigin(details.requestingUrl)) {
      callback(true);
      return;
    }

    callback(false);
  });
};

const applyContentSecurityPolicy = (): void => {
  // Lock the renderer to its own origin. Transcription/network all go through
  // IPC to the main process, so the renderer never needs to fetch remote hosts.
  // In dev we relax connect/style/script to let Vite's HMR dev server work.
  const isDev = !app.isPackaged;
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  const styleSrc = "style-src 'self' 'unsafe-inline'";
  const connectSrc = isDev ? "connect-src 'self' http: ws:" : "connect-src 'self'";
  const csp = [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "img-src 'self' data:",
    "font-src 'self' data:",
    connectSrc,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'"
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });
};

const maybeBootstrapProductState = async (): Promise<void> => {
  const config = getAppConfig();
  if (!config.capabilities.productAuth) {
    return;
  }

  try {
    const session = await bootstrapProductSession();
    updateAuthState({
      status: 'signed-in',
      email: session.email,
      pendingEmail: '',
      message: 'Signed in.'
    });
    applyUsageSnapshot(session.usage);
    applyProductBillingSnapshot(session.billing);
  } catch (error) {
    const errorCode = toErrorCode(error, 'auth-failed');
    setLastErrorCode(errorCode);

    if (errorCode === 'auth-required') {
      updateAuthState({
        status: 'signed-out',
        message: 'Sign in to use hosted dictation.'
      });
      return;
    }

    updateAuthState({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unable to bootstrap product state.'
    });
  }
};

// Re-sync the plan/usage snapshot when the app regains focus. This is what
// makes a successful upgrade show up after the user pays in their browser and
// switches back, without needing to restart. Debounced so rapid focus changes
// (and focus events fired while already signed-out) don't hammer the API.
let lastFocusRefresh = 0;
const FOCUS_REFRESH_INTERVAL_MS = 5000;
const refreshMacAccessibilityRecovery = async (): Promise<void> => {
  if (
    !hostedProductRuntime.enabled ||
    process.platform !== 'darwin' ||
    !getStore().get('setupCompletedOnce')
  ) {
    return;
  }

  const permission = getAccessibilityPermission();
  const recoveryStep = getStore().get('setupRecoveryStep');
  if (permission === 'missing' && recoveryStep !== 5) {
    getStore().set('setupRecoveryStep', 5);
    await refreshHostedSetupState();
    return;
  }
};

const refreshProductStateOnFocus = (): void => {
  if (!getAppConfig().capabilities.productAuth) {
    return;
  }
  const now = Date.now();
  if (now - lastFocusRefresh < FOCUS_REFRESH_INTERVAL_MS) {
    return;
  }
  lastFocusRefresh = now;
  void (async () => {
    await maybeBootstrapProductState();
    if (hostedProductRuntime.enabled) {
      await refreshHostedSetupState();
    }
    await refreshMacAccessibilityRecovery();
  })().catch((error) => {
    debugLog(
      `Product focus refresh remained pending: ${
        error instanceof Error ? error.name : 'unknown-error'
      }`
    );
  });
};

const applyAuthCallbackIfNeeded = async (): Promise<void> => {
  if (hostedProductRuntime.enabled) {
    queuedAuthUrl = null;
    return;
  }
  if (!queuedAuthUrl) {
    return;
  }

  const authUrl = queuedAuthUrl;
  queuedAuthUrl = null;
  if (!getAppConfig().capabilities.productAuth) {
    return;
  }

  try {
    await completeMagicLinkSignIn(authUrl);
    await maybeBootstrapProductState();
    refreshDiagnostics();
  } catch (error) {
    const errorCode = toErrorCode(error, 'auth-failed');
    setLastErrorCode(errorCode);
    updateAuthState({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unable to complete sign-in.'
    });
  }
};

const applyHostedSetupRuntime = (state: HostedSetupBootstrapState): void => {
  if (state.server) {
    updateAuthState({
      status: 'signed-in',
      email: state.server.email,
      pendingEmail: '',
      message: 'Signed in.'
    });
    applyUsageSnapshot(state.server.usage);
    applyProductBillingSnapshot(state.server.billing);
  } else if (state.setup.reason === 'account-required') {
    updateAuthState({
      status: 'signed-out',
      email: '',
      message: 'Sign in to use hosted dictation.'
    });
  }

  if (state.setup.destination === 'hud' && state.mode === 'first-run') {
    setHotkeyCaptureTarget('overlay');
    setLastErrorCode(errorAfterSetupReady(getRuntimeState().diagnostics.lastErrorCode));
  } else if (getStore().get('setupCompletedOnce')) {
    setHotkeyCaptureTarget('inactive');
    const recoveryError = state.requestedStep === 8
      ? 'paste-failed'
      : state.requestedStep === 5 && state.device.accessibilityStatus === 'missing'
        ? 'accessibility-required'
        : state.setup.reason === 'account-required'
      ? 'auth-required'
      : state.setup.reason === 'consent-required'
        ? 'consent-required'
        : state.setup.reason === 'microphone-required'
          ? 'microphone-denied'
          : state.setup.reason.includes('hotkey')
            ? 'hotkey-unavailable'
            : 'activation-required';
    setLastErrorCode(recoveryError);
  }
  broadcastRuntimeState();
};

const refreshHostedSetupState = async (): Promise<HostedSetupBootstrapState> => {
  hostedSetupState = await resolveHostedSetupBootstrap();
  applyHostedSetupRuntime(hostedSetupState);
  return hostedSetupState;
};

const applyProductBillingSnapshot = (
  billing: ProductBillingSnapshot | undefined
): void => {
  if (!billing) {
    updateBillingState({
      status: 'error',
      message: 'Billing state is unavailable. Your current server-confirmed usage remains unchanged.'
    });
    return;
  }
  updateBillingState({
    ...billing,
    currentPeriodEnd: billing.currentPeriodEnd ?? '',
    message: ''
  });
};

const pollBillingReturnConfirmation = async (
  billingReturn: ProductBillingReturnResponse
): Promise<void> => {
  if (billingReturn.checkoutStatus === 'cancelled') {
    getStore().set('pendingBillingConfirmation', null);
    updateBillingState({ message: billingReturn.message });
    broadcastRuntimeState();
    return;
  }
  getStore().set('pendingBillingConfirmation', {
    action: billingReturn.action,
    requestedPlan: billingReturn.requestedPlan
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    }
    const state = await refreshHostedSetupState().catch(() => null);
    const confirmedPlan = state?.server?.billing.plan;
    if (
      confirmedPlan &&
      isBillingReturnConfirmed(
        billingReturn.action,
        billingReturn.requestedPlan,
        confirmedPlan
      )
    ) {
      getStore().set('pendingBillingConfirmation', null);
      return;
    }
    updateBillingState({
      status: 'confirming',
      message: 'Confirming your plan…'
    });
  }
  updateBillingState({
    status: 'confirming',
    message: 'Your current confirmed plan remains active. Check again or open Billing Portal.'
  });
};

const reconcileHostedProtocolWake = async (
  wake: ProtocolWake
): Promise<void> => {
  let billingReturn: ProductBillingReturnResponse | null = null;
  if (wake.kind === 'auth') {
    await resumeHostedAuthTransaction(wake.transactionId ?? undefined).catch(
      () => undefined
    );
  } else if (wake.transactionId) {
    try {
      billingReturn = await consumeHostedBillingReturn(wake.transactionId);
      updateBillingState({
        status: 'confirming',
        message: billingReturn.message
      });
    } catch (error) {
      debugLog(
        `Billing Return remained non-authoritative: ${
          error instanceof Error ? error.name : 'unknown-error'
        }`
      );
    }
  }

  await refreshHostedSetupState().catch((error) => {
    debugLog(
      `Hosted protocol refresh remained pending: ${
        error instanceof Error ? error.name : 'unknown-error'
      }`
    );
  });
  routeStartupSurface({ protocolWake: true });
  if (
    wake.kind === 'billing-return' &&
    hostedSetupState.setup.destination === 'hud'
  ) {
    openOverlayPanel();
  }
  if (billingReturn) {
    void pollBillingReturnConfirmation(billingReturn);
  }
};

const finishHostedRecovery = async (): Promise<HostedSetupBootstrapState> => {
  getStore().set('setupRecoveryStep', 0);
  const state = await refreshHostedSetupState();
  closeOnboardingWindow();
  routeStartupSurface();
  return state;
};

const advanceCanonicalHostedStep = async (
  completedStep: number
): Promise<HostedSetupBootstrapState> => {
  const setupId = hostedSetupState.server?.accountDeviceSetup.setupId;
  if (!setupId) {
    throw new SpeakeasyError('auth-required', 'Sign in before continuing setup.');
  }
  const recoveryStep = hostedSetupState.mode === 'recovery'
    ? hostedSetupState.requestedStep
    : null;
  await advanceHostedProductSetup(setupId, completedStep);
  const state = await refreshHostedSetupState();
  if (
    recoveryStep !== null &&
    ((recoveryStep === 5 && completedStep === 6) ||
      (recoveryStep !== 5 && completedStep === recoveryStep))
  ) {
    return finishHostedRecovery();
  }
  if (completedStep === 9 && state.setup.destination === 'hud') {
    getStore().set('setupCompletedOnce', true);
    getStore().set('setupReviewRequested', false);
    getStore().set('setupRecoveryStep', 0);
    closeOnboardingWindow();
    routeStartupSurface();
  }
  return state;
};

let hotkeyVerificationSaving = false;
const completeHostedHotkeyVerification = (): void => {
  if (hotkeyVerificationSaving) return;
  hotkeyVerificationSaving = true;
  void (async () => {
    try {
      getStore().set('hotkeyVerified', true);
      if (
        hostedSetupState.mode !== 'review' &&
        hostedSetupState.server &&
        (!hostedSetupState.server.accountDeviceSetup.completedSteps.includes(6) ||
          hostedSetupState.mode === 'recovery')
      ) {
        await advanceCanonicalHostedStep(6);
      } else {
        await refreshHostedSetupState();
      }
      getOnboardingWindow()?.webContents.send(
        IPC_CHANNELS.ONBOARDING_HOTKEY_VERIFIED
      );
    } catch (error) {
      getStore().set('hotkeyVerified', false);
      debugLog(
        `Hotkey verification could not be saved: ${
          error instanceof Error ? error.name : 'unknown-error'
        }`
      );
    } finally {
      hotkeyVerificationSaving = false;
    }
  })();
};

let initialHostedProtocolWake = false;
let initialHostedBillingWake = false;
let initialHostedBillingReturn: ProductBillingReturnResponse | null = null;

const bootstrap = async (): Promise<void> => {
  const config = getAppConfig();
  app.setName(config.appName);
  loadEnvFile(app.getAppPath());
  if (config.buildProfile === 'mac-staging') {
    const { installStagingDesignReviewMenu } = await import('./staging-design-review.js');
    installStagingDesignReviewMenu();
  }

  if (hostedProductRuntime.enabled) {
    // Initialize the versioned local store before presenting the shell. This
    // migrates W1 package-identity data without starting auth, capture, or HUD.
    getStore();
    allowMediaPermissionForSpeakeasy();
    applyContentSecurityPolicy();
    createTray({
      appName: config.appName,
      openLabel: 'Open setup',
      onOpenSettings: () => {
        if (
          hostedSetupState.setup.destination === 'hud' &&
          hostedSetupState.mode === 'first-run'
        ) {
          openOverlayPanel();
        } else {
          routeStartupSurface();
        }
      },
      onQuit: () => app.quit()
    });
    if (config.edition === 'product' && app.isPackaged && config.protocolScheme) {
      app.setAsDefaultProtocolClient(config.protocolScheme);
    }
    const secureStorageBlock = toNativeReadinessBlock(
      await getProductSecureStorageReadiness()
    );
    updateNativeReadiness(secureStorageBlock);
    if (!secureStorageBlock) {
      try {
        await initializeHostedProductAuth();
      } catch (error) {
        debugLog(
          `Hosted auth initialization remained inactive: ${
            error instanceof Error ? error.name : 'unknown-error'
          }`
        );
      }
    } else {
      setHotkeyCaptureTarget('inactive');
      setLastErrorCode('auth-failed');
    }
    if (await hasPendingHostedAccountDeletion().catch(() => false)) {
      updateAccountLifecycleState({
        status: 'deletion-pending',
        message: 'Account access is blocked. Retry deletion cleanup.'
      });
      setHotkeyCaptureTarget('inactive');
    }

    ipcMain.handle(IPC_CHANNELS.ONBOARDING_GET_STATE, async () => {
      return refreshHostedSetupState();
    });
    ipcMain.handle(
      IPC_CHANNELS.ONBOARDING_RESUME_AUTH,
      async () => {
        await resumeHostedAuthTransaction();
        return refreshHostedSetupState();
      }
    );
    ipcMain.handle(
      IPC_CHANNELS.ONBOARDING_CANCEL_AUTH,
      async () => {
        await cancelHostedAuthTransaction();
        return refreshHostedSetupState();
      }
    );
    ipcMain.handle(
      IPC_CHANNELS.ONBOARDING_RESET_LOCAL_SIGN_IN,
      async () => {
        await resetHostedProductLocalSignIn();
        getStore().set('productAuthEmail', '');
        getStore().set('resumeCheckpoint', '');
        return refreshHostedSetupState();
      }
    );
    ipcMain.handle(
      IPC_CHANNELS.AUTH_REQUEST_MAGIC_LINK,
      async (_event, payload: { email: string }) => {
        await requestMagicLink(payload.email);
        await refreshHostedSetupState();
      }
    );
    ipcMain.handle(IPC_CHANNELS.AUTH_WARM_SESSION, async () => {
      await resumeHostedAuthTransaction().catch(() => undefined);
      await refreshHostedSetupState();
    });
    ipcMain.handle(IPC_CHANNELS.AUTH_SIGN_OUT, async () => {
      processingEpoch += 1;
      sendRecordingRecovery('account-signed-out');
      await signOutProduct();
      getStore().set('pendingBillingConfirmation', null);
      getStore().set('productAuthEmail', '');
      getStore().set('resumeCheckpoint', '');
      getStore().set('setupReviewRequested', false);
      getStore().set('setupRecoveryStep', 0);
      await refreshHostedSetupState();
      setHotkeyCaptureTarget('inactive');
      closeOnboardingWindow();
      showOverlayWindow();
      broadcastStatus('idle');
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, getSettingsSnapshot());
        }
      }
    });
    ipcMain.handle(IPC_CHANNELS.ONBOARDING_WELCOME_COMPLETE, async () => {
      getStore().set('onboardingWelcomeCompleted', true);
      return refreshHostedSetupState();
    });
    ipcMain.handle(IPC_CHANNELS.ONBOARDING_ACCEPT_CONSENT, async () => {
      if (hostedSetupState.mode === 'review') {
        await recordHostedProcessingConsent('accepted', 'settings');
        return refreshHostedSetupState();
      }
      await recordHostedProcessingConsent('accepted', 'onboarding');
      return advanceCanonicalHostedStep(3);
    });
    ipcMain.handle(
      IPC_CHANNELS.ONBOARDING_ADVANCE,
      async (_event, payload: { completedStep?: unknown }) => {
        const completedStep = payload?.completedStep;
        if (
          !Number.isInteger(completedStep) ||
          Number(completedStep) < 4 ||
          Number(completedStep) > 9 ||
          completedStep === 6 ||
          completedStep === 8
        ) {
          throw new SpeakeasyError('activation-required', 'That setup step cannot advance from the renderer.');
        }
        if (hostedSetupState.mode === 'review') {
          return refreshHostedSetupState();
        }
        if (completedStep === 4 && getMicrophonePermission() !== 'granted') {
          throw new SpeakeasyError('microphone-denied', 'Allow microphone access before continuing.');
        }
        if (
          completedStep === 5 &&
          getHotkeyMode() !== 'push-to-hold'
        ) {
          throw new SpeakeasyError('hotkey-unavailable', 'Choose a hotkey that registered successfully.');
        }
        return advanceCanonicalHostedStep(Number(completedStep));
      }
    );
    ipcMain.handle(IPC_CHANNELS.ONBOARDING_CLOSE, async () => {
      if (!getStore().get('setupCompletedOnce')) {
        throw new SpeakeasyError('activation-required', 'Finish setup before closing this window.');
      }
      getStore().set('setupReviewRequested', false);
      getStore().set('setupRecoveryStep', 0);
      await refreshHostedSetupState();
      setHotkeyCaptureTarget(
        hostedSetupState.setup.destination === 'hud' ? 'overlay' : 'inactive'
      );
      closeOnboardingWindow();
      routeStartupSurface();
    });
    ipcMain.handle(IPC_CHANNELS.ONBOARDING_OPEN_MICROPHONE_SETTINGS, async () => {
      await shell.openExternal(
        process.platform === 'darwin'
          ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
          : 'ms-settings:privacy-microphone'
      );
    });
    ipcMain.handle(IPC_CHANNELS.ONBOARDING_REQUEST_ACCESSIBILITY, () => {
      const granted = requestAccessibilityPermission();
      refreshDiagnostics();
      return granted;
    });
    ipcMain.handle(IPC_CHANNELS.ONBOARDING_OPEN_ACCESSIBILITY_SETTINGS, async () => {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    });
    ipcMain.handle(IPC_CHANNELS.ONBOARDING_OPEN_AUTOMATION_SETTINGS, async () => {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation');
    });
    ipcMain.handle(IPC_CHANNELS.APP_RESTART, () => {
      app.relaunch();
      app.exit(0);
    });
    ipcMain.handle(
      IPC_CHANNELS.ONBOARDING_HOTKEY_MODE_SET,
      (_event, payload: { mode?: unknown }) => {
        const mode = payload?.mode;
        if (mode === 'verification') {
          setHotkeyCaptureTarget('verification', completeHostedHotkeyVerification);
          return;
        }
        if (mode === 'practice') {
          setHotkeyCaptureTarget('onboarding-practice');
          return;
        }
        if (mode === 'inactive') {
          setHotkeyCaptureTarget('inactive');
          return;
        }
        throw new SpeakeasyError('hotkey-unavailable', 'Unknown setup hotkey mode.');
      }
    );
    ipcMain.handle(
      IPC_CHANNELS.ONBOARDING_CAPTURE_PROCESS,
      async (
        _event,
        payload: OnboardingPracticeCapturePayload
      ): Promise<OnboardingPracticeCaptureResult> => {
        const validation = validateAudioCapturePayload(payload);
        if (!validation.valid) {
          throw new SpeakeasyError('transcription-failed', validation.reason);
        }
        const grantStatus = hostedSetupState.server?.practiceGrant.status;
        if (grantStatus !== 'available') {
          throw new SpeakeasyError(
            'usage-limit-reached',
            'On-the-house Practice is unavailable. Your normal allowance will not be used.'
          );
        }
        const settings = getSettingsSnapshot();
        const result = await runPipeline({
          ...payload,
          captureId: normalizeCaptureId(payload.captureId),
          apiKey: settings.groqApiKey,
          polishBeforePaste: settings.polishBeforePaste,
          cleanupStrength: settings.cleanupStrength,
          delivery: 'return',
          operationContext: 'onboarding',
          normalAllowanceConfirmed: false,
          onTranscribing: () => {
            getOnboardingWindow()?.webContents.send(IPC_CHANNELS.STATUS_UPDATE, 'transcribing');
          },
          onPolishing: () => {
            getOnboardingWindow()?.webContents.send(IPC_CHANNELS.STATUS_UPDATE, 'polishing');
          },
          onUsage: (usage) => applyUsageSnapshot(usage)
        });
        if (!result.text || !result.operationId) {
          throw new SpeakeasyError('transcription-failed', 'Practice did not produce text.');
        }
        return { text: result.text, operationId: result.operationId, cleanupOutcome: result.cleanupOutcome };
      }
    );
    ipcMain.handle(
      IPC_CHANNELS.ONBOARDING_CAPTURE_ACK,
      async (
        _event,
        payload: { operationId?: unknown; acknowledgment?: unknown }
      ) => {
        const operationId = payload?.operationId;
        const acknowledgment = payload?.acknowledgment;
        if (
          typeof operationId !== 'string' ||
          !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(operationId) ||
          !['pasted', 'paste_failed', 'discarded'].includes(String(acknowledgment))
        ) {
          throw new SpeakeasyError('paste-failed', 'Invalid Practice acknowledgment.');
        }
        const outbox = getHostedOperationOutbox();
        await outbox.markAcknowledgment(
          operationId,
          acknowledgment as 'pasted' | 'paste_failed' | 'discarded'
        );
        const result = await acknowledgeHostedOperation(
          operationId,
          acknowledgment as 'pasted' | 'paste_failed' | 'discarded'
        );
        await outbox.remove(operationId);
        applyUsageSnapshot(result.usage);
        if (acknowledgment === 'pasted' && hostedSetupState.mode !== 'review') {
          getStore().set('pasteReadinessInvalid', false);
          return advanceCanonicalHostedStep(8);
        }
        return refreshHostedSetupState();
      }
    );
    ipcMain.handle(
      IPC_CHANNELS.ONBOARDING_NATIVE_PASTE,
      async (_event, payload: { text?: unknown }) => {
        if (typeof payload?.text !== 'string' || !payload.text.trim() || payload.text.length > 50_000) {
          throw new SpeakeasyError('paste-failed', 'Practice text is invalid.');
        }
        try {
          await pasteText(payload.text);
        } catch (error) {
          getStore().set('pasteReadinessInvalid', true);
          throw error;
        }
      }
    );
    ipcMain.handle(IPC_CHANNELS.ONBOARDING_RUN_REVIEW, async () => {
      if (!getStore().get('setupCompletedOnce')) {
        throw new SpeakeasyError('activation-required', 'Complete setup before reviewing it.');
      }
      let setupId = hostedSetupState.server?.accountDeviceSetup.setupId;
      if (!setupId) {
        setupId = (await refreshHostedSetupState()).server?.accountDeviceSetup.setupId;
      }
      if (!setupId) {
        throw new SpeakeasyError('activation-required', 'The completed setup could not be loaded.');
      }
      await renewHostedProductSetupPractice(setupId);
      getStore().set('setupReviewRequested', true);
      getStore().set('setupRecoveryStep', 0);
      await refreshHostedSetupState();
      setHotkeyCaptureTarget('inactive');
      hideOverlayWindow();
      showOnboardingWindow();
    });
    ipcMain.handle(
      IPC_CHANNELS.ONBOARDING_RUN_RECOVERY,
      async (_event, payload: { step?: unknown }) => {
        const recoveryStep = Number(payload?.step);
        if (
          !getStore().get('setupCompletedOnce') ||
          ![2, 3, 4, 5, 8].includes(recoveryStep)
        ) {
          throw new SpeakeasyError('activation-required', 'That recovery route is unavailable.');
        }
        getStore().set('setupReviewRequested', false);
        getStore().set('setupRecoveryStep', recoveryStep);
        await refreshHostedSetupState();
        setHotkeyCaptureTarget('inactive');
        hideOverlayWindow();
        showOnboardingWindow();
      }
    );
    ipcMain.handle(IPC_CHANNELS.ONBOARDING_OPEN_PRIVACY, async () => {
      await shell.openExternal(getRuntimeState().privacyUrl);
    });
    ipcMain.handle(IPC_CHANNELS.ONBOARDING_OPEN_SUPPORT, async () => {
      await shell.openExternal(getRuntimeState().supportUrl);
    });

    const queuedProtocolWakes = hostedActivationGate.open();
    for (const queuedProtocolWake of queuedProtocolWakes) {
      if (queuedProtocolWake.kind === 'auth') {
        await resumeHostedAuthTransaction(
          queuedProtocolWake.transactionId ?? undefined
        ).catch(() => undefined);
      } else if (queuedProtocolWake.transactionId) {
        const billingReturn = await consumeHostedBillingReturn(
          queuedProtocolWake.transactionId
        ).catch(() => null);
        initialHostedBillingReturn = billingReturn ?? initialHostedBillingReturn;
      }
    }
    try {
      await refreshHostedSetupState();
    } catch (error) {
      debugLog(
        `Hosted setup bootstrap remained inactive: ${
          error instanceof Error ? error.name : 'unknown-error'
        }`
      );
    }

    initialHostedProtocolWake = queuedProtocolWakes.some((wake) => wake.kind === 'auth');
    initialHostedBillingWake = queuedProtocolWakes.some((wake) => wake.kind === 'billing-return');
  }

  if (!hostedProductRuntime.enabled) {
    refreshDiagnostics();
    await checkAccessibilityPermission();
    allowMediaPermissionForSpeakeasy();
    applyContentSecurityPolicy();
  }

  const shouldCreateHostedOverlay =
    !hostedProductRuntime.enabled || getStore().get('setupCompletedOnce');
  const overlayWindow = shouldCreateHostedOverlay ? createOverlayWindow() : null;
  const shouldRegisterHostedHotkey =
    !hostedProductRuntime.enabled ||
    Boolean(
      hostedSetupState.server?.accountDeviceSetup.completedSteps.includes(5) ||
      getStore().get('setupCompletedOnce')
    );
  const hotkeyRegistered = isW3IdleSoak || !shouldRegisterHostedHotkey
    ? true
    : registerHotkey(getStore().get('hotkey') ?? DEFAULT_HOTKEY_ID);
  if (isW3IdleSoak) {
    debugLog('W3 idle evidence mode: native hotkey and external bootstraps disabled');
  }
  if (!hotkeyRegistered) {
    getStore().set('hotkeyVerified', false);
    if (hostedProductRuntime.enabled && getStore().get('setupCompletedOnce')) {
      getStore().set('setupRecoveryStep', 5);
      await refreshHostedSetupState();
    }
    setLastErrorCode('hotkey-unavailable');
    debugLog('Hotkey unavailable: native registration did not succeed');
    overlayWindow?.webContents.once('did-finish-load', () => {
      sendOverlayStatus('error');
    });
  }
  if (hostedProductRuntime.enabled) {
    await refreshMacAccessibilityRecovery();
    setHotkeyCaptureTarget(
      hostedSetupState.setup.destination === 'hud' && hostedSetupState.mode === 'first-run'
        ? 'overlay'
        : 'inactive'
    );
  }
  refreshDiagnostics();

  if (!isW3IdleSoak && shouldRecoverHotkeyOnPowerEvents(process.platform)) {
    const [suspendEvent, resumeEvent, lockEvent, unlockEvent] =
      HOTKEY_RECOVERY_POWER_EVENTS;
    const recoverWindowsLifecycle = (reason: string) => {
      recoverHeldHotkey(reason, () => sendRecordingRecovery(reason));
    };
    powerMonitor.on(suspendEvent, () => recoverWindowsLifecycle(suspendEvent));
    powerMonitor.on(resumeEvent, () => recoverWindowsLifecycle(resumeEvent));
    powerMonitor.on(lockEvent, () => recoverWindowsLifecycle(lockEvent));
    powerMonitor.on(unlockEvent, () => recoverWindowsLifecycle(unlockEvent));
  }

  if (!hostedProductRuntime.enabled) {
    createTray({
      appName: config.appName,
      onOpenSettings: openOverlayPanel,
      onQuit: () => app.quit()
    });
  }

  onRuntimeStateChange(broadcastRuntimeState);

  if (config.edition === 'product' && app.isPackaged && config.protocolScheme) {
    app.setAsDefaultProtocolClient(config.protocolScheme);
  }

  if (!isW3IdleSoak) {
    initializeUpdater(() => isHotkeyRecording() || isUpdateOperationActive());
    void maybeBootstrapProductState();
    app.on('browser-window-focus', refreshProductStateOnFocus);
    void applyAuthCallbackIfNeeded();
    setTimeout(() => {
      void checkForUpdates();
    }, 3000);
    const stopActivationNudge = startActivationNudgeScheduler(maybeShowActivationNudge);
    powerMonitor.on('resume', maybeShowActivationNudge);
    app.once('will-quit', () => {
      stopActivationNudge();
      powerMonitor.removeListener('resume', maybeShowActivationNudge);
    });
  }

  app.on('will-quit', () => {
    unregisterHotkey();
  });

  ipcMain.on(IPC_CHANNELS.SUPPORT_EVENT, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const { event, captureId, code } = payload as Record<string, unknown>;
    if (typeof event !== 'string' || !['requested', 'listening', 'stopped', 'failed', 'canceled'].includes(event)) return;
    supportLog(event === 'failed' ? 'capture.failed' : 'capture.stage', { captureId, code, stage: event });
  });

  ipcMain.on(IPC_CHANNELS.DEBUG_LOG, (_event, message: unknown) => {
    debugLog(`[renderer] ${String(message)}`);
  });

  ipcMain.on(IPC_CHANNELS.APP_QUIT, () => {
    app.quit();
  });

  // Only allowlisted HTTPS destinations open externally from the renderer.
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_event, url: unknown) => {
    if (typeof url !== 'string') {
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    const allowedHosts = new Set(['speakeasywords.com', 'x.com', 'twitter.com']);
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
      return;
    }
    await shell.openExternal(parsed.href);
  });

  ipcMain.on(IPC_CHANNELS.LATENCY_MARK, (_event, payload: unknown) => {
    if (typeof payload !== 'object' || payload === null) {
      return;
    }

    const {
      captureId,
      phase,
      durationMs
    } = payload as { captureId?: unknown; phase?: unknown; durationMs?: unknown };

    if (!isCaptureId(captureId) || !isLatencyPhase(phase) || typeof durationMs !== 'number') {
      return;
    }

    logLatencyMark(captureId, phase, durationMs);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => getSettingsSnapshot());
  ipcMain.handle(IPC_CHANNELS.RUNTIME_GET, () => {
    refreshDiagnostics();
    return getRuntimeState();
  });
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_MICROPHONE_STATUS, () => {
    const status = getMicrophonePermission();
    updateDiagnosticsState({
      microphonePermission: status
    });
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_MICROPHONE_REQUEST, async () => {
    const granted = await requestMicrophonePermission();
    updateDiagnosticsState({
      microphonePermission: getMicrophonePermission()
    });
    return granted;
  });
  ipcMain.handle(
    IPC_CHANNELS.PERMISSIONS_MICROPHONE_REPORT,
    (_event, status: unknown) => {
      const microphonePermission = reportMicrophonePermission(status);
      updateDiagnosticsState({ microphonePermission });
      if (microphonePermission === 'granted') {
        if (
          getRuntimeState().diagnostics.lastErrorCode === 'microphone-denied' ||
          getRuntimeState().diagnostics.lastErrorCode ===
            'microphone-unavailable'
        ) {
          resetLastErrorCode();
        }
      } else if (microphonePermission === 'denied') {
        setLastErrorCode('microphone-denied');
      } else if (microphonePermission === 'unavailable') {
        setLastErrorCode('microphone-unavailable');
      }
      return microphonePermission;
    }
  );
  ipcMain.handle(IPC_CHANNELS.DIAGNOSTICS_SUPPORT_EVIDENCE_GET, () =>
    createPrivacySafeSupportEvidence(getRuntimeState())
  );
  ipcMain.handle(IPC_CHANNELS.DIAGNOSTICS_SUPPORT_EVIDENCE_COPY, () => {
    clipboard.writeText(JSON.stringify(createPrivacySafeSupportEvidence(getRuntimeState()), null, 2));
  });
  ipcMain.handle(IPC_CHANNELS.DIAGNOSTICS_SUPPORT_EVIDENCE_EXPORT, async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export support bundle',
      defaultPath: `speakeasy-support-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return false;
    await writeFile(
      result.filePath,
      `${JSON.stringify(await createSupportBundle(createPrivacySafeSupportEvidence(getRuntimeState())), null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 }
    );
    supportLog('bundle.exported');
    return true;
  });
  if (hostedProductRuntime.enabled) {
    ipcMain.handle(
      IPC_CHANNELS.SUPPORT_SUBMIT,
      async (_event, payload: ProductSupportSubmission) =>
        submitHostedSupportRequest(
          payload,
          createPrivacySafeSupportEvidence(getRuntimeState())
        )
    );
    ipcMain.handle(IPC_CHANNELS.SUPPORT_STATUSES_GET, fetchHostedSupportStatuses);

    ipcMain.handle(IPC_CHANNELS.CONSENT_WITHDRAW, async () => {
      processingEpoch += 1;
      sendRecordingRecovery('consent-withdrawn');
      setHotkeyCaptureTarget('inactive');
      await recordHostedProcessingConsent('withdrawn', 'settings');
      await refreshHostedSetupState();
      setLastErrorCode('consent-required');
      updateAccountLifecycleState({
        status: 'active',
        message: 'Hosted processing is off on every device.'
      });
      broadcastStatus('idle');
    });

    const finishAccountDeletion = async (
      result: Awaited<ReturnType<typeof deleteHostedProductAccount>>
    ) => {
      processingEpoch += 1;
      sendRecordingRecovery('account-deleted');
      setHotkeyCaptureTarget('inactive');
      await signOutProduct().catch(() => undefined);
      await clearCurrentDeletedAccountLocalState();
      updateAccountLifecycleState({ status: 'deleted', message: result.receipt });
      updateAuthState({ status: 'signed-out', email: '', pendingEmail: '', message: 'Account deleted.' });
      broadcastStatus('idle');
      return result;
    };

    ipcMain.handle(
      IPC_CHANNELS.ACCOUNT_DELETE,
      async (_event, payload: { confirmation?: unknown }) => {
        try {
          return await finishAccountDeletion(
            await deleteHostedProductAccount(String(payload?.confirmation ?? ''))
          );
        } catch (error) {
          if (await hasPendingHostedAccountDeletion().catch(() => false)) {
            processingEpoch += 1;
            sendRecordingRecovery('account-deletion-pending');
            setHotkeyCaptureTarget('inactive');
            updateAccountLifecycleState({
              status: 'deletion-pending',
              message: 'Account access is blocked. Retry deletion cleanup.'
            });
          }
          throw error;
        }
      }
    );
    ipcMain.handle(IPC_CHANNELS.ACCOUNT_DELETE_RETRY, async () =>
      finishAccountDeletion(await retryHostedProductAccountDeletion())
    );
    ipcMain.handle(
      IPC_CHANNELS.ACCOUNT_DELETION_RECEIPT_COPY,
      (_event, payload: { receipt?: unknown }) => {
        if (payload?.receipt !== 'Account deleted. Limited payment and tax records remain.') {
          throw new SpeakeasyError('none', 'That deletion receipt is invalid.');
        }
        clipboard.writeText(payload.receipt);
      }
    );
  }

  ipcMain.handle(IPC_CHANNELS.SETTINGS_APPLY_WORKFLOW_PRESET, (_event, id: unknown) => {
    // Persist the two existing settings together, after validating the preset ID.
    const patch = workflowPresetSettings(id);
    const store = getStore();
    store.set({ ...store.store, ...patch });
    const settings = getSettingsSnapshot();
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, settings);
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    (_event, key: unknown, value: unknown) => {
      // Allowlist + per-key validation. The renderer is untrusted: it may NEVER
      // write `productSession`/`deviceId`, and even allowed keys must pass shape
      // validation before touching the store. See hardening item 3.
      if (typeof key !== 'string' || !ALLOWED_SETTINGS_KEYS.includes(key as AllowedSettingKey)) {
        throw new SpeakeasyError('none', `Setting "${String(key)}" cannot be written from the renderer.`);
      }

      const allowedKey = key as AllowedSettingKey;
      const config = getAppConfig();
      if (allowedKey === 'groqApiKey' && !config.capabilities.byoApiKey) {
        throw new SpeakeasyError('none', 'Groq API keys cannot be changed in this edition.');
      }

      if (!isValidSettingValue(allowedKey, value)) {
        throw new SpeakeasyError('none', `Invalid value for setting "${allowedKey}".`);
      }

      if (allowedKey === 'hotkey') {
        const hotkeyChanged = getStore().get('hotkey') !== value;
        const result = setHotkey(value as string);
        if (!result.registered) {
          refreshDiagnostics();
          setLastErrorCode('hotkey-unavailable');
          sendOverlayStatus('error');
          throw new SpeakeasyError(
            'hotkey-unavailable',
            result.previousBindingRestored
              ? 'That hotkey could not be registered. The previous binding is still active.'
              : 'Hotkey registration failed, and the previous binding could not be restored.'
          );
        }
        if (hotkeyChanged) {
          getStore().set('hotkeyVerified', false);
        }

        if (
          shouldClearRecoveredHotkeyError(
            getRuntimeState().diagnostics.lastErrorCode
          )
        ) {
          resetLastErrorCode();
          sendOverlayStatus('idle');
        }
      }

      if (allowedKey === 'showWidgetOverFullScreenApps') {
        const previous = getStore().get('showWidgetOverFullScreenApps') ?? true;
        if (previous !== value) {
          try {
            setOverlayFullScreenVisibility(value as boolean);
            getStore().set(allowedKey, value as boolean);
          } catch (error) {
            setOverlayFullScreenVisibility(previous);
            throw error;
          }
        }
      } else if (allowedKey === 'groqApiKey') {
        // Encrypted at rest via safeStorage; never written as plaintext. Item 4.
        setGroqApiKey(value as string);
      } else {
        getStore().set(allowedKey, value as SpeakeasySettings[AllowedSettingKey]);
      }

      // Re-bind the push-to-talk key live (no restart) when it changes.
      if (allowedKey === 'hotkey') {
        refreshDiagnostics();
      }

      const settings = getSettingsSnapshot();
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, settings);
        }
      }
    }
  );

  if (hostedProductRuntime.enabled) {
    ipcMain.handle(
      IPC_CHANNELS.BILLING_OPEN_CHECKOUT,
      async (_event, payload: { plan: 'standard' | 'pro' }) => {
        const plan = payload?.plan === 'pro' ? 'pro' : 'standard';
        try {
          const url = await requestCheckoutUrl(plan);
          await shell.openExternal(url);
        } catch (error) {
          setLastErrorCode(toErrorCode(error, 'activation-required'));
          throw error;
        }
      }
    );

    ipcMain.handle(IPC_CHANNELS.BILLING_OPEN_PORTAL, async () => {
      try {
        const url = await requestPortalUrl();
        await shell.openExternal(url);
      } catch (error) {
        setLastErrorCode(toErrorCode(error, 'activation-required'));
        throw error;
      }
    });

    ipcMain.handle(IPC_CHANNELS.BILLING_REFRESH, async () => {
      updateBillingState({ status: 'confirming', message: 'Confirming your plan…' });
      const pending = getStore().get('pendingBillingConfirmation');
      if (pending) {
        await pollBillingReturnConfirmation({
          contractVersion: '2026-07-29.w3.5.v1',
          status: 'consumed',
          action: pending.action,
          requestedPlan: pending.requestedPlan,
          message: 'Confirming your plan…'
        });
        return;
      }
      await refreshHostedSetupState();
    });
  }

  ipcMain.handle(IPC_CHANNELS.UPDATES_INSTALL, (event) => {
    if (event.sender !== getOverlayWindow()?.webContents) return;
    installUpdate();
  });
  ipcMain.handle(IPC_CHANNELS.UPDATES_CHECK, async () => {
    await checkForUpdates();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATES_OPEN_DOWNLOAD, async () => {
    await openUpdateDownload();
  });

  ipcMain.handle(IPC_CHANNELS.OVERLAY_LAYOUT_SET, (_event, payload) => {
    setOverlayLayout(payload);
  });
  ipcMain.handle(IPC_CHANNELS.OVERLAY_MOUSE_PASSTHROUGH, (event, ignore: unknown) => {
    const overlay = getOverlayWindow();
    if (typeof ignore !== 'boolean' || !overlay || event.sender !== overlay.webContents) return;
    overlay.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_PROCESS, async (_event, payload: AudioCapturePayload) => {
    const validation = validateAudioCapturePayload(payload);
    if (!validation.valid) {
      supportLog('capture.failed', { stage: 'validation', code: 'transcription-failed' });
      setLastErrorCode('transcription-failed');
      broadcastStatus('error');
      throw new SpeakeasyError('transcription-failed', validation.reason);
    }
    const handlerStartedAtMs = performance.now();
    const captureEpoch = processingEpoch;
    const captureId = normalizeCaptureId(payload.captureId);
    logLatencyMarks(captureId, payload.clientLatencyMarks);
    try {
      const settings = getSettingsSnapshot();

      if (hostedProductRuntime.enabled && getStore().get('pasteReadinessInvalid')) {
        setLastErrorCode('paste-failed');
        broadcastStatus('error');
        throw new SpeakeasyError(
          'paste-failed',
          'Automatic paste must be rechecked before another dictation. Open Paste Recovery.'
        );
      }

      if (config.capabilities.byoApiKey && !settings.groqApiKey) {
        setLastErrorCode('missing-api-key');
        broadcastStatus('error');
        openOverlayPanel();
        throw new SpeakeasyError('missing-api-key', 'Missing Groq API key.');
      }

      resetLastErrorCode();

      try {
        const pipelineStartedAtMs = performance.now();
        let finalTranscript = '';
        try {
          const pipelineResult = await runPipeline({
            ...payload,
            captureId,
            apiKey: settings.groqApiKey,
            polishBeforePaste: settings.polishBeforePaste,
            cleanupStrength: settings.cleanupStrength,
            onTranscribing: () => broadcastStatus('transcribing'),
            onPolishing: () => broadcastStatus('polishing'),
            onCleanup: (outcome) => updateDiagnosticsState({ lastCleanupOutcome: outcome }),
            onUsage: (usage) => applyUsageSnapshot(usage),
            shouldDeliver: () => captureEpoch === processingEpoch
          });
          finalTranscript = pipelineResult.text;
          if (hostedProductRuntime.enabled && finalTranscript) {
            getStore().set('pasteReadinessInvalid', false);
          }
        } finally {
          logLatencyMark(captureId, 'main.pipeline_total', performance.now() - pipelineStartedAtMs, {
            audioBytes: payload.audioBuffer.byteLength,
            polish: settings.polishBeforePaste,
            cleanupStrength: settings.cleanupStrength
          });
        }

        if (finalTranscript) {
          sendFinalTranscript(finalTranscript);
        }
      } catch (error) {
        const errorCode = toErrorCode(error, 'transcription-failed');
        if (
          hostedProductRuntime.enabled &&
          (errorCode === 'paste-failed' || errorCode === 'paste-clipboard-only')
        ) {
          getStore().set('pasteReadinessInvalid', true);
          if (getStore().get('setupCompletedOnce')) {
            getStore().set('setupRecoveryStep', 8);
          }
        }
        setLastErrorCode(errorCode);
        broadcastStatus(errorCode === 'microphone-denied' ? 'microphone-denied' : 'error');

        if (errorCode === 'auth-required') {
          updateAuthState({
            status: 'signed-out',
            message: 'Sign in to use hosted dictation.'
          });
        }

        if (errorCode === 'usage-limit-reached') {
          updateUsageState({
            status: 'exhausted',
            message: 'Usage limit reached.'
          });
        }

        throw error;
      }
    } finally {
      logLatencyMark(captureId, 'main.ipc_handler', performance.now() - handlerStartedAtMs);
    }
  });

  overlayWindow?.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, getSettingsSnapshot());
    overlayWindow.webContents.send(IPC_CHANNELS.RUNTIME_CHANGED, getRuntimeState());
  });

  if (hostedProductRuntime.enabled) {
    routeStartupSurface({ protocolWake: initialHostedProtocolWake });
    if (
      initialHostedBillingWake &&
      hostedSetupState.setup.destination === 'hud'
    ) {
      openOverlayPanel();
    }
    if (initialHostedBillingReturn) {
      void pollBillingReturnConfirmation(initialHostedBillingReturn);
    } else {
      const pending = getStore().get('pendingBillingConfirmation');
      if (pending) {
        void pollBillingReturnConfirmation({
          contractVersion: '2026-07-29.w3.5.v1',
          status: 'consumed',
          action: pending.action,
          requestedPlan: pending.requestedPlan,
          message: 'Confirming your plan…'
        });
      }
    }
  } else {
    routeStartupSurface();
  }
};

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (hostedProductRuntime.enabled) {
    const activation = hostedActivationGate.receive(
      productActivationAdapter.activationFromArguments([url])
    );
    if (app.isReady() && activation.routeNow) {
      const wake = activation.activation;
      routeStartupSurface({ protocolWake: wake?.kind === 'auth' });
      if (wake) {
        void reconcileHostedProtocolWake(wake);
      }
    }
    return;
  }

  // OSS owns no custom protocol. Ignore stray open-url delivery instead of
  // retaining a second, edition-confusing activation path.
});

process.on('uncaughtExceptionMonitor', (error) => supportFailure('runtime.failed', error, { stage: 'main' }));
app.on('render-process-gone', (_event, _contents, details) => supportLog('runtime.failed', { stage: 'renderer', exitCode: details.exitCode }));
app.on('will-quit', () => supportLog('app.stopped'));

app.whenReady().then(() => {
  supportLog('app.started', { version: app.getVersion() });
  // The separately identified baseline bundle is a read-only runtime/renderer
  // probe. It never initializes accounts, capture, paste or protocol ownership.
  if (isReviewBaseline) {
    void import('./mac-review-probe.js').then(({ runMacReviewProbe }) => runMacReviewProbe())
      .then(() => app.exit(0), (error) => { console.error(error); app.exit(1); });
    return;
  }
  void bootstrap().catch(error => { supportFailure('runtime.failed', error, { stage: 'bootstrap' }); throw error; });

  app.on('activate', () => {
    if (hostedProductRuntime.enabled && !hostedActivationGate.isOpen()) {
      return;
    }
    routeStartupSurface({ openSettings: true });
  });
});

app.on('second-instance', (_event, argv) => {
  if (hostedProductRuntime.enabled) {
    const activation = hostedActivationGate.receive(
      productActivationAdapter.activationFromArguments(argv)
    );
    if (!activation.routeNow) {
      return;
    }
    const protocolWake = activation.activation;
    routeStartupSurface({ protocolWake: protocolWake?.kind === 'auth' });
    if (protocolWake) {
      void reconcileHostedProtocolWake(protocolWake);
    }
    return;
  }

  openOverlayPanel();
});

// A tray app intentionally remains available after its last window closes on
// both platforms. This explicit boundary avoids Windows' default quit behavior.
app.on('window-all-closed', () => undefined);
