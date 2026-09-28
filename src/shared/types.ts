import type { CleanupOutcome } from './cleanup-outcome.js';
import type { DictationStats } from './dictation-stats.js';
import { isHotkeyId } from './hotkeys.js';
import type { LatencyMark } from './latency.js';
import type {
  MicrophonePermissionState,
  PlatformState
} from './platform.js';
import type { ProductSessionBootstrapResponse } from './product-api.js';
import type {
  ProductAccountDeletionResponse,
  ProductSupportCategory,
  ProductSupportReceipt,
  ProductSupportSubmission
} from './product-api.js';
import type { SetupBootstrapResult } from './setup-bootstrap.js';
import { isWidgetSizeId, type WidgetSize } from './widget-sizes.js';
import { isWidgetThemeId, type WidgetTheme } from './widget-themes.js';

export type OverlayStatus =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'polishing'
  | 'microphone-denied'
  | 'microphone-unavailable'
  | 'error';

export type CleanupStrength = 'minimal' | 'balanced' | 'strong';
export type WidgetForm = 'pill' | 'circle';
export type AppEdition = 'oss' | 'product';
export type ReleaseChannel = 'stable' | 'preview';
export type ErrorCode =
  | 'none'
  | 'missing-api-key'
  | 'auth-required'
  | 'auth-failed'
  | 'consent-required'
  | 'activation-required'
  | 'offline'
  | 'microphone-denied'
  | 'microphone-unavailable'
  | 'accessibility-required'
  | 'hotkey-unavailable'
  | 'transcription-failed'
  | 'provider-budget-paused'
  | 'polish-failed'
  | 'paste-failed'
  | 'paste-clipboard-only'
  | 'usage-limit-reached'
  | 'updater-failed';

export interface AppCapabilityFlags {
  byoApiKey: boolean;
  productAuth: boolean;
  hostedUsage: boolean;
  autoUpdate: boolean;
}

export type NativeCapability =
  | 'secure-storage'
  | 'activation'
  | 'microphone'
  | 'hotkey'
  | 'accessibility'
  | 'paste'
  | 'updates';

export type ProductJourney =
  | 'startup'
  | 'sign-in'
  | 'onboarding'
  | 'dictation'
  | 'billing'
  | 'account-lifecycle'
  | 'updates';

export type NativeRecoveryAction =
  | 'retry'
  | 'open-system-settings'
  | 'restart-speakeasy'
  | 'local-sign-in-reset'
  | 'contact-support';

export interface NativeReadinessBlock {
  capability: NativeCapability;
  journey: ProductJourney;
  code: string;
  recoveryActions: NativeRecoveryAction[];
}

export interface AuthState {
  status: 'disabled' | 'signed-out' | 'link-sent' | 'signed-in' | 'error';
  email: string;
  pendingEmail: string;
  message: string;
}

export interface UsageState {
  status: 'disabled' | 'unknown' | 'ready' | 'limited' | 'exhausted' | 'error';
  plan?: 'free' | 'standard' | 'pro';
  usedSeconds: number;
  remainingSeconds: number | null;
  hardLimitSeconds: number | null;
  usedSuccessfulDictations: number;
  reservedSuccessfulDictations: number;
  remainingSuccessfulDictations: number | null;
  hardLimitSuccessfulDictations: number | null;
  resetAt: string;
  message: string;
}

export interface BillingState {
  status: 'disabled' | 'unknown' | 'confirming' | 'active' | 'payment_issue' | 'inactive' | 'error';
  plan: 'free' | 'standard' | 'pro';
  paymentStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  message: string;
}

export interface UpdaterState {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  message: string;
  availableVersion: string;
  /** Verified release's DMG for first install or manual recovery. */
  progress?: number;
  downloadUrl?: string;
}

export interface DiagnosticsState {
  appName: string;
  appVersion: string;
  edition: AppEdition;
  releaseChannel: ReleaseChannel;
  hotkeyLabel: string;
  hotkeyMode: 'push-to-hold' | 'toggle' | 'unavailable';
  microphonePermission: MicrophonePermissionState;
  accessibilityPermission: 'granted' | 'missing' | 'not-required';
  signedIn: boolean;
  lastErrorCode: ErrorCode;
  lastCleanupOutcome?: CleanupOutcome;
}

export interface SpeakeasyRuntimeState {
  dictationStats: DictationStats;
  edition: AppEdition;
  releaseChannel: ReleaseChannel;
  supportUrl: string;
  privacyUrl: string;
  capabilities: AppCapabilityFlags;
  platform: PlatformState;
  auth: AuthState;
  usage: UsageState;
  billing: BillingState;
  updater: UpdaterState;
  nativeReadiness: NativeReadinessBlock | null;
  diagnostics: DiagnosticsState;
  accountLifecycle: {
    status: 'active' | 'deletion-pending' | 'deleted';
    message: string;
  };
}

export interface WidgetPosition {
  x: number;
  y: number;
}

export interface AudioCapturePayload {
  audioBuffer: ArrayBuffer;
  mimeType: string;
  durationMs: number;
  captureId?: string;
  clientLatencyMarks?: LatencyMark[];
}

export interface SpeakeasySettings {
  groqApiKey: string;
  polishBeforePaste: boolean;
  hotkey: string;
  cleanupStrength: CleanupStrength;
  widgetForm: WidgetForm;
  widgetSize: WidgetSize;
  widgetTheme: WidgetTheme;
  widgetOpacity: number;
  showWidgetOverFullScreenApps: boolean;
  widgetPosition: WidgetPosition;
  productAuthEmail: string;
}

/**
 * Keys the renderer is allowed to write via the SETTINGS_SET IPC channel.
 *
 * The store also holds `productSession` and `deviceId`, which the renderer must
 * NEVER be able to set — otherwise a compromised renderer could pin the app to
 * an attacker-controlled session. The main-process handler rejects any key not
 * listed here. See hardening item 3.
 */
export const ALLOWED_SETTINGS_KEYS = [
  'groqApiKey',
  'polishBeforePaste',
  'hotkey',
  'cleanupStrength',
  'widgetForm',
  'widgetSize',
  'widgetTheme',
  'widgetOpacity',
  'showWidgetOverFullScreenApps',
  'widgetPosition',
  'productAuthEmail'
] as const satisfies readonly (keyof SpeakeasySettings)[];

export type AllowedSettingKey = (typeof ALLOWED_SETTINGS_KEYS)[number];

const CLEANUP_STRENGTHS: readonly CleanupStrength[] = ['minimal', 'balanced', 'strong'];
const WIDGET_FORMS: readonly WidgetForm[] = ['pill', 'circle'];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Per-key value validation for SETTINGS_SET. Returns true only when `value` is a
 * well-formed value for `key`. Garbage (wrong type, out-of-range, malformed
 * shape) is rejected so the renderer can't corrupt the store.
 */
export const isValidSettingValue = (key: AllowedSettingKey, value: unknown): boolean => {
  switch (key) {
    case 'groqApiKey':
      return typeof value === 'string' && value.length <= 512;
    case 'productAuthEmail':
      return typeof value === 'string' && value.length <= 320;
    case 'hotkey':
      return isHotkeyId(value);
    case 'showWidgetOverFullScreenApps':
    case 'polishBeforePaste':
      return typeof value === 'boolean';
    case 'cleanupStrength':
      return typeof value === 'string' && CLEANUP_STRENGTHS.includes(value as CleanupStrength);
    case 'widgetForm':
      return typeof value === 'string' && WIDGET_FORMS.includes(value as WidgetForm);
    case 'widgetSize':
      return isWidgetSizeId(value);
    case 'widgetTheme':
      return isWidgetThemeId(value);
    case 'widgetOpacity':
      return isFiniteNumber(value) && value >= 30 && value <= 90;
    case 'widgetPosition':
      return (
        typeof value === 'object' &&
        value !== null &&
        isFiniteNumber((value as WidgetPosition).x) &&
        isFiniteNumber((value as WidgetPosition).y)
      );
    default:
      return false;
  }
};

export interface OverlayLayoutPayload {
  width: number;
  height: number;
  bookmark?: { width: number; height: number };
  interactiveRegions?: Array<{ x: number; y: number; width: number; height: number }>;
}

export type WidgetEdge = 'left' | 'right' | 'top';

export interface OverlayAttachment {
  edge: WidgetEdge;
  offset: number;
  bookmarkOffset?: WidgetPosition;
  railReversed?: boolean;
}

export interface RequestMagicLinkPayload {
  email: string;
}

export interface HostedOnboardingState {
  auth: {
    secureStorageAvailable: boolean;
    secureStorageStatus: 'ready' | 'unavailable' | 'corrupt';
    signedInEmail: string;
    pendingEmail: string;
    pendingStatus:
      | 'none'
      | 'created'
      | 'email_sent'
      | 'callback_received'
      | 'exchanged'
      | 'expired'
      | 'canceled'
      | 'superseded'
      | 'failed';
    transactionId: string;
    expiresAt: string;
    message: string;
  };
  setup: SetupBootstrapResult;
  server: ProductSessionBootstrapResponse | null;
  mode: 'first-run' | 'review' | 'recovery';
  device: {
    microphoneStatus: MicrophonePermissionState;
    accessibilityStatus: 'granted' | 'missing' | 'not-required';
    operatingSystem: PlatformState['operatingSystem'];
    hotkeyId: string;
    hotkeyVerified: boolean;
  };
  canClose: boolean;
  requestedStep: number | null;
}

export interface OnboardingPracticeCaptureResult {
  text: string;
  cleanupOutcome?: CleanupOutcome;
  operationId: string;
}

export interface OnboardingPracticeCapturePayload extends AudioCapturePayload {
  normalAllowanceConfirmed: boolean;
}

export type SettingsCategory = 'dictation' | 'appearance' | 'account' | 'help';

export interface SpeakeasyAPI {
  /** Present only on the in-memory, no-preload staging design review bridge. */
  designReview?: true;
  onRecordingStart: (callback: () => void) => () => void;
  onRecordingStop: (callback: () => void) => () => void;
  onRecordingRecovery: (callback: (reason: string) => void) => () => void;
  onStatusUpdate: (callback: (status: OverlayStatus) => void) => () => void;
  processAudioCapture: (payload: AudioCapturePayload) => Promise<void>;
  getMicrophoneStatus: () => Promise<string>;
  requestMicrophoneAccess: () => Promise<boolean>;
  reportMicrophoneStatus: (
    status: MicrophonePermissionState
  ) => Promise<MicrophonePermissionState>;
  getSettings: () => Promise<SpeakeasySettings>;
  setSettings: <K extends keyof SpeakeasySettings>(
    key: K,
    value: SpeakeasySettings[K]
  ) => Promise<void>;
  getRuntimeState: () => Promise<SpeakeasyRuntimeState>;
  getSupportEvidence: () => Promise<unknown>;
  copySupportEvidence: () => Promise<void>;
  exportSupportEvidence: () => Promise<boolean>;
  submitSupportRequest: (payload: ProductSupportSubmission) => Promise<ProductSupportReceipt>;
  getSupportTicketStatuses: () => Promise<ProductSupportReceipt[]>;
  withdrawHostedProcessingConsent: () => Promise<void>;
  deleteProductAccount: (confirmation: string) => Promise<ProductAccountDeletionResponse>;
  retryProductAccountDeletion: () => Promise<ProductAccountDeletionResponse>;
  copyAccountDeletionReceipt: (receipt: string) => Promise<void>;
  quitApp: () => void;
  onRuntimeStateChanged: (callback: (state: SpeakeasyRuntimeState) => void) => () => void;
  requestMagicLinkSignIn: (payload: RequestMagicLinkPayload) => Promise<void>;
  warmProductSession: () => Promise<void>;
  signOutProduct: () => Promise<void>;
  debugLog: (message: string) => void;
  logCaptureEvent: (event: 'requested' | 'listening' | 'stopped' | 'failed' | 'canceled', captureId: string | null, code?: ErrorCode) => void;
  openCheckout: (plan: 'standard' | 'pro') => Promise<void>;
  openBillingPortal: () => Promise<void>;
  refreshBilling: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  applyWorkflowPreset: (id: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  openDownload: () => Promise<void>;
  installUpdate: () => Promise<void>;
  setOverlayLayout: (payload: OverlayLayoutPayload) => Promise<void>;
  setOverlayMousePassthrough: (ignore: boolean) => Promise<void>;
  onOverlayAttachmentChanged: (callback: (attachment: OverlayAttachment) => void) => () => void;
  onSettingsChanged: (callback: (settings: SpeakeasySettings) => void) => () => void;
  onFinalTranscript: (callback: (text: string) => void) => () => void;
  onOpenPanel: (callback: (category?: SettingsCategory) => void) => () => void;
  onOnboardingProtocolWake: (callback: () => void) => () => void;
  getHostedOnboardingState: () => Promise<HostedOnboardingState>;
  resumeHostedOnboardingAuth: () => Promise<HostedOnboardingState>;
  cancelHostedOnboardingAuth: () => Promise<HostedOnboardingState>;
  resetHostedLocalSignIn: () => Promise<HostedOnboardingState>;
  completeOnboardingWelcome: () => Promise<HostedOnboardingState>;
  advanceHostedOnboarding: (completedStep: number) => Promise<HostedOnboardingState>;
  acceptHostedProcessingConsent: () => Promise<HostedOnboardingState>;
  closeHostedOnboarding: () => Promise<void>;
  openMicrophonePrivacySettings: () => Promise<void>;
  requestAccessibilityAccess: () => Promise<boolean>;
  openAccessibilityPrivacySettings: () => Promise<void>;
  openAutomationPrivacySettings: () => Promise<void>;
  restartSpeakeasy: () => Promise<void>;
  setOnboardingHotkeyMode: (
    mode: 'inactive' | 'verification' | 'practice'
  ) => Promise<void>;
  processOnboardingPractice: (
    payload: OnboardingPracticeCapturePayload
  ) => Promise<OnboardingPracticeCaptureResult>;
  acknowledgeOnboardingPractice: (
    operationId: string,
    acknowledgment: 'pasted' | 'paste_failed' | 'discarded'
  ) => Promise<HostedOnboardingState>;
  pasteOnboardingPractice: (text: string) => Promise<void>;
  runSetupReview: () => Promise<void>;
  runSetupRecovery: (step: number) => Promise<void>;
  openOnboardingPrivacy: () => Promise<void>;
  openOnboardingSupport: () => Promise<void>;
  onOnboardingHotkeyDown: (callback: () => void) => () => void;
  onOnboardingHotkeyUp: (callback: () => void) => () => void;
  onOnboardingHotkeyVerified: (callback: () => void) => () => void;
}

export type { ProductSupportCategory };

declare global {
  interface Window {
    speakeasy?: SpeakeasyAPI;
  }
}

export {};
