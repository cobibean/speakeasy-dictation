import type { ErrorCode } from './types.js';

// Ready setup proves account/device recovery, not a successful dictation.
// Keep service failures available until the next capture resets them.
export const errorAfterSetupReady = (errorCode: ErrorCode): ErrorCode => {
  switch (errorCode) {
    case 'auth-required':
    case 'consent-required':
    case 'activation-required':
    case 'microphone-denied':
    case 'microphone-unavailable':
    case 'accessibility-required':
    case 'hotkey-unavailable':
    case 'paste-failed':
    case 'paste-clipboard-only':
      return 'none';
    default:
      return errorCode;
  }
};

export type HostedConsentStatus = 'unknown' | 'accepted' | 'withdrawn';
export const CURRENT_HOSTED_PROCESSING_CONSENT_VERSION =
  '2026-07-31.hosted-processing.v1' as const;

export interface SetupAccountState {
  authenticated: boolean;
  consentStatus: HostedConsentStatus;
  consentVersion: string | null;
}

export interface SetupDeviceState {
  installationId: string;
  microphoneReady: boolean;
  hotkeyId: string | null;
  hotkeyVerified: boolean;
}

export interface DeviceEnrollmentState {
  enrollmentId: string;
  status: 'active' | 'revoked';
}

export interface AccountDeviceSetupState {
  setupId: string;
  enrollmentId: string;
  currentStep: number;
  completedSteps: number[];
  practiceStatus: 'not_started' | 'in_progress' | 'completed';
  completed: boolean;
}

export interface SetupPracticeGrantState {
  grantId: string | null;
  status:
    | 'available'
    | 'reserved'
    | 'consumed'
    | 'normal_allowance_available'
    | 'recovery_required'
    | 'revoked';
}

export interface ResumeCheckpoint {
  setupId: string;
  enrollmentId: string;
  lastIncompleteStep: number;
}

export interface SetupBootstrapInput {
  accountState: SetupAccountState;
  deviceState: SetupDeviceState;
  enrollment: DeviceEnrollmentState | null;
  accountDeviceSetup: AccountDeviceSetupState | null;
  resumeCheckpoint: ResumeCheckpoint | null;
}

export type SetupBootstrapReason =
  | 'account-required'
  | 'consent-required'
  | 'microphone-required'
  | 'hotkey-choice-required'
  | 'hotkey-verification-required'
  | 'setup-pairing-required'
  | 'practice-required'
  | 'ready-confirmation-required'
  | 'setup-complete';

export interface SetupBootstrapResult {
  destination: 'onboarding' | 'hud';
  earliestIncompleteStep: number | null;
  reason: SetupBootstrapReason;
}

// A local permission/shortcut recovery cannot skip an earlier server requirement.
// Keep the recovery request for after account setup has caught up.
export const resolveSetupPresentation = ({
  reviewRequested,
  recoveryStep,
  setup
}: {
  reviewRequested: boolean;
  recoveryStep: number;
  setup: SetupBootstrapResult;
}): { mode: 'first-run' | 'review' | 'recovery'; requestedStep: number | null } => {
  if (reviewRequested) return { mode: 'review', requestedStep: 1 };
  if (
    recoveryStep >= 2 && recoveryStep <= 9 &&
    (setup.earliestIncompleteStep === null || setup.earliestIncompleteStep >= recoveryStep)
  ) {
    return { mode: 'recovery', requestedStep: recoveryStep };
  }
  return { mode: 'first-run', requestedStep: null };
};

export const canKeepCompletedInstallHud = ({
  setupCompletedOnce,
  mode,
  serverSetupCompleted
}: {
  setupCompletedOnce: boolean;
  mode: 'first-run' | 'review' | 'recovery';
  serverSetupCompleted: boolean | null;
}): boolean =>
  setupCompletedOnce &&
  mode === 'first-run' &&
  (serverSetupCompleted === null || serverSetupCompleted);

const onboarding = (
  earliestIncompleteStep: number,
  reason: Exclude<SetupBootstrapReason, 'setup-complete'>
): SetupBootstrapResult => ({
  destination: 'onboarding',
  earliestIncompleteStep,
  reason
});

export const reconcileSetupBootstrap = (
  input: SetupBootstrapInput
): SetupBootstrapResult => {
  if (!input.accountState.authenticated) {
    return onboarding(2, 'account-required');
  }
  const enrollment = input.enrollment;
  const setup = input.accountDeviceSetup;
  if (
    !enrollment ||
    enrollment.status !== 'active' ||
    !setup ||
    setup.enrollmentId !== enrollment.enrollmentId
  ) {
    return onboarding(7, 'setup-pairing-required');
  }
  if (
    input.accountState.consentStatus !== 'accepted' ||
    input.accountState.consentVersion !== CURRENT_HOSTED_PROCESSING_CONSENT_VERSION ||
    !setup.completedSteps.includes(3)
  ) {
    return onboarding(3, 'consent-required');
  }
  if (!input.deviceState.microphoneReady || !setup.completedSteps.includes(4)) {
    return onboarding(4, 'microphone-required');
  }
  if (!input.deviceState.hotkeyId || !setup.completedSteps.includes(5)) {
    return onboarding(5, 'hotkey-choice-required');
  }
  if (!input.deviceState.hotkeyVerified || !setup.completedSteps.includes(6)) {
    return onboarding(6, 'hotkey-verification-required');
  }

  if (!setup.completedSteps.includes(7)) {
    return onboarding(7, 'practice-required');
  }

  if (setup.practiceStatus !== 'completed' || !setup.completedSteps.includes(8)) {
    return onboarding(8, 'practice-required');
  }
  if (!setup.completed || !setup.completedSteps.includes(9)) {
    return onboarding(9, 'ready-confirmation-required');
  }

  return {
    destination: 'hud',
    earliestIncompleteStep: null,
    reason: 'setup-complete'
  };
};
