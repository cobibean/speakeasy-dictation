import type { AudioCapturePayload } from './types.js';

export const MAX_CAPTURE_DURATION_MS = 5 * 60 * 1000;
export const MAX_CAPTURE_AUDIO_BYTES = 64 * 1024 * 1024;

const ALLOWED_CAPTURE_MIME_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav'
]);

export type CapturePayloadValidation =
  | { valid: true }
  | { valid: false; reason: string };

export const validateAudioCapturePayload = (
  payload: unknown
): CapturePayloadValidation => {
  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, reason: 'Capture payload is missing.' };
  }

  const candidate = payload as Partial<AudioCapturePayload>;
  if (!(candidate.audioBuffer instanceof ArrayBuffer) || candidate.audioBuffer.byteLength === 0) {
    return { valid: false, reason: 'Capture audio is empty.' };
  }
  if (candidate.audioBuffer.byteLength > MAX_CAPTURE_AUDIO_BYTES) {
    return { valid: false, reason: 'Capture audio exceeds the supported size.' };
  }
  if (
    typeof candidate.durationMs !== 'number' ||
    !Number.isFinite(candidate.durationMs) ||
    candidate.durationMs <= 0 ||
    candidate.durationMs > MAX_CAPTURE_DURATION_MS + 1000
  ) {
    return { valid: false, reason: 'Capture duration is invalid or exceeds five minutes.' };
  }
  if (
    typeof candidate.mimeType !== 'string' ||
    !ALLOWED_CAPTURE_MIME_TYPES.has(candidate.mimeType.toLowerCase())
  ) {
    return { valid: false, reason: 'Capture audio format is unsupported.' };
  }

  return { valid: true };
};
