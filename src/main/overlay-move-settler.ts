import type { WidgetPosition } from '../shared/types.js';

interface OverlayMoveSettlerOptions {
  delayMs: number;
  schedule: (callback: () => void, delayMs: number) => unknown;
  cancel: (handle: unknown) => void;
  getPointer: () => WidgetPosition;
  settle: (point: WidgetPosition) => void;
}

export interface OverlayMoveSettler {
  onMove: () => void;
  onMouseUp: () => void;
  reset: () => void;
}

export const createOverlayMoveSettler = ({
  delayMs,
  schedule,
  cancel,
  getPointer,
  settle
}: OverlayMoveSettlerOptions): OverlayMoveSettler => {
  let movePending = false;
  let fallbackHandle: unknown = null;

  const cancelFallback = (): void => {
    if (fallbackHandle === null) return;
    cancel(fallbackHandle);
    fallbackHandle = null;
  };

  const finish = (): void => {
    if (!movePending) return;
    movePending = false;
    cancelFallback();
    settle(getPointer());
  };

  return {
    onMove: () => {
      movePending = true;
      cancelFallback();
      fallbackHandle = schedule(() => {
        fallbackHandle = null;
        if (!movePending) return;
        movePending = false;
        settle(getPointer());
      }, delayMs);
    },
    onMouseUp: finish,
    reset: () => {
      movePending = false;
      cancelFallback();
    }
  };
};
