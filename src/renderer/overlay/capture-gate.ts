export interface CaptureGate {
  requestStart: () => number | null;
  markRecording: (token: number) => boolean;
  isStarting: (token: number) => boolean;
  requestStop: () => 'cancel-start' | 'stop-recording' | 'ignore';
  fail: (token: number) => boolean;
  beginProcessing: () => void;
  endProcessing: () => void;
  reset: () => void;
  getState: () => 'idle' | 'starting' | 'recording' | 'processing';
}

export const createCaptureGate = (): CaptureGate => {
  let state: 'idle' | 'starting' | 'recording' | 'processing' = 'idle';
  let nextToken = 0;
  let activeToken: number | null = null;

  return {
    requestStart() {
      if (state !== 'idle') {
        return null;
      }
      state = 'starting';
      activeToken = ++nextToken;
      return activeToken;
    },
    markRecording(token) {
      if (state !== 'starting' || activeToken !== token) {
        return false;
      }
      state = 'recording';
      return true;
    },
    isStarting(token) { return state === 'starting' && activeToken === token; },
    requestStop() {
      if (state === 'starting') {
        state = 'idle';
        activeToken = null;
        return 'cancel-start';
      }
      if (state === 'recording') {
        state = 'processing';
        return 'stop-recording';
      }
      return 'ignore';
    },
    fail(token) {
      if (activeToken !== token) {
        return false;
      }
      state = 'idle';
      activeToken = null;
      return true;
    },
    beginProcessing() {
      state = 'processing';
    },
    endProcessing() {
      state = 'idle';
      activeToken = null;
    },
    reset() {
      state = 'idle';
      activeToken = null;
    },
    getState() {
      return state;
    }
  };
};
