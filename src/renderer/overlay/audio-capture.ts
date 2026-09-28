export const RECORDER_TIMESLICE_MS = 250;

const MIME_TYPE_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm'] as const;

export const getPreferredMimeTypeFromSupport = (
  isTypeSupported: (candidate: string) => boolean
): string => MIME_TYPE_CANDIDATES.find(isTypeSupported) ?? '';

export const getPreferredMimeType = (): string =>
  getPreferredMimeTypeFromSupport((candidate) => MediaRecorder.isTypeSupported(candidate));

interface StoppableRecorder {
  requestData?: () => void;
  stop: () => void;
}

export const stopRecorderWithFinalData = (
  recorder: StoppableRecorder,
  warn: (message: string, error: unknown) => void = console.warn
): void => {
  if (typeof recorder.requestData === 'function') {
    try {
      recorder.requestData();
    } catch (error) {
      warn('Unable to flush recorder data before stop:', error);
    }
  }

  recorder.stop();
};
