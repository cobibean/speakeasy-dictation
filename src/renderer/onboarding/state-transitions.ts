import type { HostedOnboardingState } from '../../shared/types';

export const shouldConfirmHostedAuth = (
  syncStep: boolean,
  activeStep: number,
  hasServerState: boolean
): boolean => syncStep && activeStep === 2 && hasServerState;

export const shouldRetryRecoveryHotkey = (
  mode: HostedOnboardingState['mode'],
  requestedStep: number | null
): boolean => mode === 'recovery' && requestedStep === 5;
