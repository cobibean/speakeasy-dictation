export type CaptureRecoveryState = 'idle' | 'starting' | 'recording' | 'processing';
export type MicrophoneInterruption = 'devicechange' | 'track-ended' | 'recorder-error';
export type MicrophoneRecoveryAction =
  | 'invalidate-device-cache'
  | 'interrupt-recording'
  | 'defer-until-next-capture';

export const getMicrophoneRecoveryAction = (
  state: CaptureRecoveryState,
  interruption: MicrophoneInterruption
): MicrophoneRecoveryAction => {
  if (interruption === 'devicechange') {
    return state === 'recording' ? 'defer-until-next-capture' : 'invalidate-device-cache';
  }
  return state === 'recording' || state === 'starting'
    ? 'interrupt-recording'
    : 'defer-until-next-capture';
};

export const getMicrophoneStatusForErrorName = (
  errorName: string
): 'denied' | 'unavailable' | 'unknown' => {
  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return 'denied';
  }
  if (
    errorName === 'NotFoundError' ||
    errorName === 'NotReadableError' ||
    errorName === 'AbortError'
  ) {
    return 'unavailable';
  }
  return 'unknown';
};
