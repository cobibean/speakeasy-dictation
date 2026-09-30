export type RecordingCue = 'listening' | 'stopped';

// One instance per capture. Failed/canceled starts and duplicate events stay quiet.
export const createRecordingFeedback = (
  play: (cue: RecordingCue) => void,
  enabled: () => boolean
) => {
  let state: 'waiting' | 'listening' | 'finished' = 'waiting';
  const emit = (cue: RecordingCue) => {
    try { if (enabled()) play(cue); } catch { /* Audio feedback must never affect recording. */ }
  };
  return {
    started() {
      if (state !== 'waiting') return;
      state = 'listening';
      emit('listening');
    },
    stopped() {
      const wasListening = state === 'listening';
      state = 'finished';
      if (wasListening) emit('stopped');
    },
    cancel() { state = 'finished'; }
  };
};

let context: AudioContext | undefined;
export const prepareRecordingSounds = (): void => {
  try {
    context ??= new AudioContext({ latencyHint: 'interactive' });
    // Never delay microphone startup. If audio cannot resume, cues stay silent.
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
  } catch { /* Unsupported or unavailable audio output is harmless. */ }
};

export const playRecordingCue = (cue: RecordingCue): void => {
  if (!context || context.state !== 'running') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  const duration = 0.075;
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(cue === 'listening' ? 620 : 830, now);
  oscillator.frequency.exponentialRampToValueAtTime(cue === 'listening' ? 830 : 620, now + duration);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.055, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration - 0.008);
  gain.gain.linearRampToValueAtTime(0, now + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(now);
  oscillator.stop(now + duration);
};
