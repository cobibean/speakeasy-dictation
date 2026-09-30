// IPC Channel constants for main <-> renderer communication

export const IPC_CHANNELS = {
  // Overlay control
  OVERLAY_SHOW: 'overlay:show',
  OVERLAY_HIDE: 'overlay:hide',
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

  // Capture and processing
  CAPTURE_PROCESS: 'capture:process',
  STREAM_BEGIN: 'capture:stream-begin',
  STREAM_APPEND: 'capture:stream-append',
  STREAM_CANCEL: 'capture:stream-cancel',
  PERMISSIONS_MICROPHONE_STATUS: 'permissions:microphone-status',
  PERMISSIONS_MICROPHONE_REQUEST: 'permissions:microphone-request',
  PERMISSIONS_MICROPHONE_REPORT: 'permissions:microphone-report',

  // Recording state
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_RECOVER: 'recording:recover',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_APPLY_WORKFLOW_PRESET: 'settings:apply-workflow-preset',
  SETTINGS_CHANGED: 'settings:changed',
  RUNTIME_GET: 'runtime:get',
  RUNTIME_CHANGED: 'runtime:changed',
  DIAGNOSTICS_SUPPORT_EVIDENCE_GET: 'diagnostics:support-evidence-get',
  DIAGNOSTICS_SUPPORT_EVIDENCE_COPY: 'diagnostics:support-evidence-copy',
  DIAGNOSTICS_SUPPORT_EVIDENCE_EXPORT: 'diagnostics:support-evidence-export',
  SUPPORT_SUBMIT: 'support:submit',
  SUPPORT_STATUSES_GET: 'support:statuses-get',

  // App lifecycle
  APP_QUIT: 'app:quit',
  APP_OPEN_EXTERNAL: 'app:open-external',

  // Transcription
  TRANSCRIPT_PARTIAL: 'transcript:partial',
  TRANSCRIPT_FINAL: 'transcript:final',

  // Status updates
  STATUS_UPDATE: 'status:update',

  // Renderer → main debug logging (writes to the file log)
  DEBUG_LOG: 'debug:log',
  SUPPORT_EVENT: 'diagnostics:event',
  LATENCY_MARK: 'latency:mark',

  // Product auth
  AUTH_WARM_SESSION: 'auth:warm-session',
  AUTH_REQUEST_MAGIC_LINK: 'auth:request-magic-link',
  AUTH_SIGN_OUT: 'auth:sign-out',
  CONSENT_WITHDRAW: 'consent:withdraw',
  ACCOUNT_DELETE: 'account:delete',
  ACCOUNT_DELETE_RETRY: 'account:delete-retry',
  ACCOUNT_DELETION_RECEIPT_COPY: 'account:deletion-receipt-copy',

  // Product billing
  BILLING_OPEN_CHECKOUT: 'billing:open-checkout',
  BILLING_OPEN_PORTAL: 'billing:open-portal',
  BILLING_REFRESH: 'billing:refresh',

  // Updates
  UPDATES_CHECK: 'updates:check',
  UPDATES_OPEN_DOWNLOAD: 'updates:open-download',
  UPDATES_INSTALL: 'updates:install'
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
