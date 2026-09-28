const { contextBridge, ipcRenderer } = require('electron');

const IPC_CHANNELS = {
  CAPTURE_PROCESS: 'capture:process',
  OVERLAY_LAYOUT_SET: 'overlay:layout-set',
  OVERLAY_MOUSE_PASSTHROUGH: 'overlay:mouse-passthrough',
  OVERLAY_ATTACHMENT_CHANGED: 'overlay:attachment-changed',
  OVERLAY_PANEL_OPEN: 'overlay:panel-open',
  ONBOARDING_PROTOCOL_WAKE: 'onboarding:protocol-wake',
  ONBOARDING_GET_STATE: 'onboarding:get-state',
  ONBOARDING_RESUME_AUTH: 'onboarding:resume-auth',
  ONBOARDING_CANCEL_AUTH: 'onboarding:cancel-auth',
  ONBOARDING_RESET_LOCAL_SIGN_IN: 'onboarding:reset-local-sign-in',
  ONBOARDING_WELCOME_COMPLETE: 'onboarding:welcome-complete',
  ONBOARDING_ADVANCE: 'onboarding:advance',
  ONBOARDING_ACCEPT_CONSENT: 'onboarding:accept-consent',
  ONBOARDING_CLOSE: 'onboarding:close',
  ONBOARDING_OPEN_MICROPHONE_SETTINGS: 'onboarding:open-microphone-settings',
  ONBOARDING_REQUEST_ACCESSIBILITY: 'onboarding:request-accessibility',
  ONBOARDING_OPEN_ACCESSIBILITY_SETTINGS: 'onboarding:open-accessibility-settings',
  ONBOARDING_OPEN_AUTOMATION_SETTINGS: 'onboarding:open-automation-settings',
  APP_RESTART: 'app:restart',
  ONBOARDING_HOTKEY_MODE_SET: 'onboarding:hotkey-mode-set',
  ONBOARDING_HOTKEY_DOWN: 'onboarding:hotkey-down',
  ONBOARDING_HOTKEY_UP: 'onboarding:hotkey-up',
  ONBOARDING_HOTKEY_VERIFIED: 'onboarding:hotkey-verified',
  ONBOARDING_CAPTURE_PROCESS: 'onboarding:capture-process',
  ONBOARDING_CAPTURE_ACK: 'onboarding:capture-ack',
  ONBOARDING_NATIVE_PASTE: 'onboarding:native-paste',
  ONBOARDING_RUN_REVIEW: 'onboarding:run-review',
  ONBOARDING_RUN_RECOVERY: 'onboarding:run-recovery',
  ONBOARDING_OPEN_PRIVACY: 'onboarding:open-privacy',
  ONBOARDING_OPEN_SUPPORT: 'onboarding:open-support',
  PERMISSIONS_MICROPHONE_STATUS: 'permissions:microphone-status',
  PERMISSIONS_MICROPHONE_REQUEST: 'permissions:microphone-request',
  PERMISSIONS_MICROPHONE_REPORT: 'permissions:microphone-report',
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_RECOVER: 'recording:recover',
  RUNTIME_CHANGED: 'runtime:changed',
  RUNTIME_GET: 'runtime:get',
  DIAGNOSTICS_SUPPORT_EVIDENCE_GET: 'diagnostics:support-evidence-get',
  DIAGNOSTICS_SUPPORT_EVIDENCE_COPY: 'diagnostics:support-evidence-copy',
  DIAGNOSTICS_SUPPORT_EVIDENCE_EXPORT: 'diagnostics:support-evidence-export',
  SUPPORT_SUBMIT: 'support:submit',
  SUPPORT_STATUSES_GET: 'support:statuses-get',
  APP_QUIT: 'app:quit',
  APP_OPEN_EXTERNAL: 'app:open-external',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_APPLY_WORKFLOW_PRESET: 'settings:apply-workflow-preset',
  SETTINGS_CHANGED: 'settings:changed',
  AUTH_WARM_SESSION: 'auth:warm-session',
  AUTH_REQUEST_MAGIC_LINK: 'auth:request-magic-link',
  AUTH_SIGN_OUT: 'auth:sign-out',
  CONSENT_WITHDRAW: 'consent:withdraw',
  ACCOUNT_DELETE: 'account:delete',
  ACCOUNT_DELETE_RETRY: 'account:delete-retry',
  ACCOUNT_DELETION_RECEIPT_COPY: 'account:deletion-receipt-copy',
  BILLING_OPEN_CHECKOUT: 'billing:open-checkout',
  BILLING_OPEN_PORTAL: 'billing:open-portal',
  BILLING_REFRESH: 'billing:refresh',
  TRANSCRIPT_FINAL: 'transcript:final',
  STATUS_UPDATE: 'status:update',
  UPDATES_CHECK: 'updates:check',
  UPDATES_INSTALL: 'updates:install',
  UPDATES_OPEN_DOWNLOAD: 'updates:open-download',
  DEBUG_LOG: 'debug:log',
  SUPPORT_EVENT: 'diagnostics:event',
  LATENCY_MARK: 'latency:mark'
};

/**
 * Keep the preload runtime tiny and CommonJS-compatible.
 * Types are intentionally local so Electron can load this file without ESM.
 */
type Cleanup = () => void;
type StatusCallback = (status: string) => void;
type StringCallback = (value: string) => void;
type VoidCallback = () => void;
type SettingsCallback = (settings: Record<string, unknown>) => void;
type TextCallback = (text: string) => void;
type RuntimeCallback = (state: Record<string, unknown>) => void;
type OverlayAttachmentCallback = (attachment: { edge: 'left' | 'right' | 'top'; offset: number }) => void;
type LatencyMarkPayload = {
  phase: string;
  startMs: number;
  endMs: number;
  metadata?: {
    audioBytes?: number;
    chunkCount?: number;
    polish?: boolean;
    cleanupStrength?: 'minimal' | 'balanced' | 'strong';
    transcriptChars?: number;
    mimeType?: string;
  };
};
type AudioCapturePayload = {
  audioBuffer: ArrayBuffer;
  mimeType: string;
  durationMs: number;
  captureId?: string;
  clientLatencyMarks?: LatencyMarkPayload[];
};

contextBridge.exposeInMainWorld('speakeasy', {
  onRecordingStart: (callback: VoidCallback): Cleanup => {
    ipcRenderer.on(IPC_CHANNELS.RECORDING_START, callback);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_START, callback);
  },

  onRecordingStop: (callback: VoidCallback): Cleanup => {
    ipcRenderer.on(IPC_CHANNELS.RECORDING_STOP, callback);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_STOP, callback);
  },

  onRecordingRecovery: (callback: StringCallback): Cleanup => {
    const listener = (_event: unknown, reason: string) => callback(reason);
    ipcRenderer.on(IPC_CHANNELS.RECORDING_RECOVER, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_RECOVER, listener);
  },

  onStatusUpdate: (callback: StatusCallback): Cleanup => {
    const listener = (_event: unknown, status: string) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.STATUS_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STATUS_UPDATE, listener);
  },

  processAudioCapture: async (payload: AudioCapturePayload) => {
    const invokeStartedAtMs = performance.now();
    try {
      return await ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_PROCESS, payload);
    } finally {
      // The invoke duration is only known after the awaited capture IPC settles,
      // so emit it as a separate mark. Main validates the capture id, finite
      // phase taxonomy, and metadata allowlist before it reaches debugLog.
      if (typeof payload.captureId === 'string') {
        ipcRenderer.send(IPC_CHANNELS.LATENCY_MARK, {
          captureId: payload.captureId,
          phase: 'renderer.ipc_invoke',
          durationMs: performance.now() - invokeStartedAtMs
        });
      }
    }
  },

  getMicrophoneStatus: () => ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_MICROPHONE_STATUS),

  requestMicrophoneAccess: () => ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_MICROPHONE_REQUEST),

  reportMicrophoneStatus: (status: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_MICROPHONE_REPORT, status),

  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

  getRuntimeState: () => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_GET),

  getSupportEvidence: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_SUPPORT_EVIDENCE_GET),

  copySupportEvidence: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_SUPPORT_EVIDENCE_COPY),

  exportSupportEvidence: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_SUPPORT_EVIDENCE_EXPORT),

  submitSupportRequest: (payload: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPORT_SUBMIT, payload),

  getSupportTicketStatuses: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPORT_STATUSES_GET),

  quitApp: () => ipcRenderer.send(IPC_CHANNELS.APP_QUIT),

  setSettings: (key: string, value: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
  applyWorkflowPreset: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_APPLY_WORKFLOW_PRESET, id),

  requestMagicLinkSignIn: (payload: { email: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_REQUEST_MAGIC_LINK, payload),

  warmProductSession: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_WARM_SESSION),

  signOutProduct: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_SIGN_OUT),

  withdrawHostedProcessingConsent: () => ipcRenderer.invoke(IPC_CHANNELS.CONSENT_WITHDRAW),

  deleteProductAccount: (confirmation: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_DELETE, { confirmation }),

  retryProductAccountDeletion: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_DELETE_RETRY),

  copyAccountDeletionReceipt: (receipt: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_DELETION_RECEIPT_COPY, { receipt }),

  logCaptureEvent: (event: string, captureId: string | null, code?: string) => ipcRenderer.send(IPC_CHANNELS.SUPPORT_EVENT, { event, captureId, code }),
  debugLog: (message: string) => ipcRenderer.send(IPC_CHANNELS.DEBUG_LOG, message),

  openCheckout: (plan: 'standard' | 'pro') =>
    ipcRenderer.invoke(IPC_CHANNELS.BILLING_OPEN_CHECKOUT, { plan }),

  openBillingPortal: () => ipcRenderer.invoke(IPC_CHANNELS.BILLING_OPEN_PORTAL),
  refreshBilling: () => ipcRenderer.invoke(IPC_CHANNELS.BILLING_REFRESH),

  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_CHECK),

  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),

  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_INSTALL),
  openDownload: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_OPEN_DOWNLOAD),

  setOverlayLayout: (payload: { width: number; height: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_LAYOUT_SET, payload),
  setOverlayMousePassthrough: (ignore: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_MOUSE_PASSTHROUGH, ignore),

  onOverlayAttachmentChanged: (callback: OverlayAttachmentCallback): Cleanup => {
    const listener = (_event: unknown, attachment: { edge: 'left' | 'right' | 'top'; offset: number }) => callback(attachment);
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_ATTACHMENT_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_ATTACHMENT_CHANGED, listener);
  },

  onSettingsChanged: (callback: SettingsCallback): Cleanup => {
    const listener = (_event: unknown, settings: Record<string, unknown>) => callback(settings);
    ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, listener);
  },

  onFinalTranscript: (callback: TextCallback): Cleanup => {
    const listener = (_event: unknown, text: string) => callback(text);
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPT_FINAL, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TRANSCRIPT_FINAL, listener);
  },

  onRuntimeStateChanged: (callback: RuntimeCallback): Cleanup => {
    const listener = (_event: unknown, state: Record<string, unknown>) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.RUNTIME_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RUNTIME_CHANGED, listener);
  },

  onOpenPanel: (callback: (category?: 'dictation' | 'appearance' | 'account' | 'help') => void): Cleanup => {
    const listener = (_event: unknown, category: unknown) => {
      callback(category === 'dictation' || category === 'appearance' || category === 'account' || category === 'help' ? category : undefined);
    };
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_PANEL_OPEN, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_PANEL_OPEN, listener);
  },

  onOnboardingProtocolWake: (callback: VoidCallback): Cleanup => {
    ipcRenderer.on(IPC_CHANNELS.ONBOARDING_PROTOCOL_WAKE, callback);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ONBOARDING_PROTOCOL_WAKE, callback);
  },

  getHostedOnboardingState: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_GET_STATE),

  resumeHostedOnboardingAuth: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_RESUME_AUTH),

  cancelHostedOnboardingAuth: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_CANCEL_AUTH),

  resetHostedLocalSignIn: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_RESET_LOCAL_SIGN_IN),

  completeOnboardingWelcome: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_WELCOME_COMPLETE),

  advanceHostedOnboarding: (completedStep: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_ADVANCE, { completedStep }),

  acceptHostedProcessingConsent: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_ACCEPT_CONSENT),

  closeHostedOnboarding: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_CLOSE),

  openMicrophonePrivacySettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_OPEN_MICROPHONE_SETTINGS),

  requestAccessibilityAccess: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_REQUEST_ACCESSIBILITY),

  openAccessibilityPrivacySettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_OPEN_ACCESSIBILITY_SETTINGS),

  openAutomationPrivacySettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_OPEN_AUTOMATION_SETTINGS),

  restartSpeakeasy: () => ipcRenderer.invoke(IPC_CHANNELS.APP_RESTART),

  setOnboardingHotkeyMode: (mode: 'inactive' | 'verification' | 'practice') =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_HOTKEY_MODE_SET, { mode }),

  processOnboardingPractice: (payload: AudioCapturePayload & { normalAllowanceConfirmed: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_CAPTURE_PROCESS, payload),

  acknowledgeOnboardingPractice: (operationId: string, acknowledgment: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_CAPTURE_ACK, { operationId, acknowledgment }),

  pasteOnboardingPractice: (text: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_NATIVE_PASTE, { text }),

  runSetupReview: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_RUN_REVIEW),

  runSetupRecovery: (step: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_RUN_RECOVERY, { step }),

  openOnboardingPrivacy: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_OPEN_PRIVACY),

  openOnboardingSupport: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_OPEN_SUPPORT),

  onOnboardingHotkeyDown: (callback: VoidCallback): Cleanup => {
    ipcRenderer.on(IPC_CHANNELS.ONBOARDING_HOTKEY_DOWN, callback);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ONBOARDING_HOTKEY_DOWN, callback);
  },

  onOnboardingHotkeyUp: (callback: VoidCallback): Cleanup => {
    ipcRenderer.on(IPC_CHANNELS.ONBOARDING_HOTKEY_UP, callback);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ONBOARDING_HOTKEY_UP, callback);
  },

  onOnboardingHotkeyVerified: (callback: VoidCallback): Cleanup => {
    ipcRenderer.on(IPC_CHANNELS.ONBOARDING_HOTKEY_VERIFIED, callback);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ONBOARDING_HOTKEY_VERIFIED, callback);
  }
});
