import type { AuthState, ErrorCode } from './types.js';
import { getPasteRecoveryStatus } from './paste-recovery.js';

export const needsUserSignIn = (
  productAuth: boolean,
  authStatus: AuthState['status'],
  errorCode: ErrorCode
): boolean => productAuth && authStatus !== 'signed-in' && (
  authStatus === 'signed-out' || authStatus === 'link-sent' ||
  errorCode === 'auth-required'
);

export const getErrorStatusText = (errorCode: ErrorCode, platform: string): string => {
  switch (errorCode) {
    case 'missing-api-key':
      return 'Add API Key';
    case 'auth-required':
      return 'Needs user sign in';
    case 'usage-limit-reached':
      return 'Usage Limit Reached';
    case 'provider-budget-paused':
      return 'Service Paused';
    case 'offline':
      return 'Offline';
    case 'hotkey-unavailable':
      return 'Hotkey Unavailable';
    case 'microphone-denied':
      return 'Mic Access Required';
    case 'microphone-unavailable':
      return 'Microphone Unavailable';
    case 'accessibility-required':
      return 'Accessibility Required';
    case 'paste-failed':
      return 'Paste Failed';
    case 'paste-clipboard-only':
      return getPasteRecoveryStatus(platform);
    case 'updater-failed':
      return 'Update Failed';
    case 'activation-required':
      return 'Activation Required';
    default:
      return 'Error';
  }
};
