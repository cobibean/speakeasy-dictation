import { getGroqPolishModel, getPolishProfile } from '../config.js';
import { SpeakeasyError, toErrorCode } from '../errors.js';
import { logLatencyMark } from '../latency-log.js';
import { GroqPolisher } from '../providers/groq/polisher.js';
import { GroqTranscriber } from '../providers/groq/transcriber.js';
import type { DictationService, ServiceCaptureInput, ServiceCaptureResult } from '../providers/types.js';
import { shouldSkipLlmPolish, withPolishTimeout } from '../../shared/polish-policy.js';

const SILENCE_HALLUCINATIONS = new Set([
  'thank you',
  'thank you.',
  'thanks for watching',
  'thanks for watching.',
  'you'
]);

export class OssDictationService implements DictationService {
  constructor(private readonly apiKey: string) {}

  async processCapture(input: ServiceCaptureInput): Promise<ServiceCaptureResult> {
    try {
      const transcriber = new GroqTranscriber(this.apiKey);
      const sttStartedAtMs = performance.now();
      let rawTranscript: string | undefined;
      try {
        rawTranscript = await transcriber.transcribe({
          audioBuffer: input.audioBuffer,
          mimeType: input.mimeType
        });
      } finally {
        logLatencyMark(input.captureId, 'main.stt_total', performance.now() - sttStartedAtMs, {
          audioBytes: input.audioBuffer.byteLength,
          mimeType: input.mimeType,
          ...(rawTranscript !== undefined ? { transcriptChars: rawTranscript.length } : {})
        });
      }

      const normalizedTranscript = rawTranscript.trim().toLowerCase();
      if (!normalizedTranscript) {
        return { text: '' };
      }

      if (input.durationMs < 1500 && SILENCE_HALLUCINATIONS.has(normalizedTranscript)) {
        return { text: '' };
      }

      if (!input.polishBeforePaste) {
        return { text: rawTranscript };
      }

      if (shouldSkipLlmPolish(rawTranscript, input.cleanupStrength)) {
        return { text: rawTranscript };
      }

      try {
        const profile = getPolishProfile(input.cleanupStrength);
        input.onPolishing?.();
        const polisher = new GroqPolisher(
          this.apiKey,
          profile.prompt,
          profile.temperature,
          getGroqPolishModel()
        );
        const polishStartedAtMs = performance.now();
        let polishedText: string | undefined;
        try {
          polishedText = await withPolishTimeout(
            (signal) => polisher.polish(rawTranscript, signal),
            rawTranscript
          );
          return { text: polishedText };
        } finally {
          logLatencyMark(
            input.captureId,
            'main.polish_total',
            performance.now() - polishStartedAtMs,
            {
              polish: true,
              cleanupStrength: input.cleanupStrength,
              transcriptChars: polishedText?.length ?? rawTranscript.length
            }
          );
        }
      } catch {
        return { text: rawTranscript };
      }
    } catch (error) {
      if (error instanceof SpeakeasyError) {
        throw error;
      }

      throw new SpeakeasyError(
        toErrorCode(error, 'transcription-failed'),
        'Transcription failed.',
        error
      );
    }
  }
}
