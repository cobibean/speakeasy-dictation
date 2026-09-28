export interface CaptureDeadline {
  arm: (durationMs: number) => void;
  clear: () => void;
  isArmed: () => boolean;
}

interface CaptureDeadlineOptions {
  schedule: (callback: () => void, durationMs: number) => number;
  cancel: (timerId: number) => void;
  onElapsed: () => void;
}

export const createCaptureDeadline = ({
  schedule,
  cancel,
  onElapsed
}: CaptureDeadlineOptions): CaptureDeadline => {
  let timerId: number | null = null;

  const clear = () => {
    if (timerId === null) {
      return;
    }
    cancel(timerId);
    timerId = null;
  };

  return {
    arm: (durationMs) => {
      clear();
      timerId = schedule(() => {
        if (timerId === null) {
          return;
        }
        timerId = null;
        onElapsed();
      }, durationMs);
    },
    clear,
    isArmed: () => timerId !== null
  };
};
