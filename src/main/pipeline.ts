import { supportLog, supportFailure } from './support-logger.js';
import type { CleanupOutcome } from '../shared/cleanup-outcome.js';
import { pasteText } from './paste.js';
import { acknowledgeHostedOperation } from './product-api.js';
import { getHostedOperationOutbox } from './product-operation-outbox.js';
import { settleHostedOperationPaste } from './hosted-operation-settlement.js';
import { recordClientProductEvent } from './product-events.js';
import { SpeakeasyError, toErrorCode } from './errors.js';
import { createDictationService } from './services/create-dictation-service.js';
import { logLatencyMark } from './latency-log.js';
import type { CaptureId } from '../shared/latency.js';
import { visitServerTimings } from '../shared/server-timing.js';
import type { ProductUsageSnapshot } from '../shared/product-api.js';
import { recordDictationStats } from './dictation-stats-store.js';
import { refreshDictationStats } from './runtime-state.js';
import type { AudioCapturePayload, CleanupStrength } from '../shared/types.js';

interface RunPipelineOptions extends AudioCapturePayload {
  captureId: CaptureId;
  apiKey: string;
  polishBeforePaste: boolean;
  cleanupStrength: CleanupStrength;
  onTranscribing: () => void;
  onPolishing: () => void;
  onCleanup?: (outcome?: CleanupOutcome) => void;
  onUsage: (usage: ProductUsageSnapshot) => void;
  shouldDeliver?: () => boolean;
  delivery?: 'paste' | 'return';
  operationContext?: 'dictation' | 'onboarding' | 'test';
  normalAllowanceConfirmed?: boolean;
}

export interface PipelineResult {
  text: string;
  cleanupOutcome?: CleanupOutcome;
  operationId?: string;
}

export const runPipeline = async ({
  audioBuffer,
  mimeType,
  durationMs,
  captureId,
  apiKey,
  polishBeforePaste,
  cleanupStrength,
  onTranscribing,
  onPolishing,
  onCleanup,
  onUsage,
  shouldDeliver = () => true,
  delivery = 'paste',
  operationContext = 'dictation',
  normalAllowanceConfirmed = false
}: RunPipelineOptions): Promise<PipelineResult> => {
  supportLog('capture.started', { captureId, audioBytes: audioBuffer.byteLength, durationMs, polish: polishBeforePaste });
  const service = createDictationService(apiKey);

  onCleanup?.(undefined);
  onTranscribing();
  const serviceStartedAtMs = performance.now();
  let result: Awaited<ReturnType<typeof service.processCapture>> | undefined;
  let serviceError: unknown;
  try {
    result = await service.processCapture({
      captureId,
      audioBuffer,
      mimeType,
      durationMs,
      polishBeforePaste,
      cleanupStrength,
      onPolishing,
      operationContext,
      normalAllowanceConfirmed
    });
  } catch (error) {
    supportFailure('capture.failed', error, { captureId, stage: 'service' });
    serviceError = error;
    throw error;
  } finally {
    logLatencyMark(captureId, 'main.service_total', performance.now() - serviceStartedAtMs, {
      audioBytes: audioBuffer.byteLength,
      polish: polishBeforePaste,
      cleanupStrength,
      ...(result ? { transcriptChars: result.text.length } : {})
    });
    visitServerTimings(result ?? serviceError, (phase, durationMs) => {
      logLatencyMark(captureId, phase, durationMs);
    });
  }

  supportLog('capture.cleanup', {
    captureId, operationId: result?.operationId,
    cleanupOutcome: result?.cleanupOutcome ?? 'unknown'
  });

  if (!result?.text) {
    supportLog('capture.empty', { captureId });
    return { text: '' };
  }

  // Consent withdrawal and account deletion invalidate an in-flight result.
  // The provider may already have returned, but its content must not be pasted
  // or charged after the lifecycle boundary moves.
  if (!shouldDeliver()) {
    supportLog('capture.discarded', { captureId, operationId: result.operationId });
    if (result.operationId) {
      await acknowledgeHostedOperation(result.operationId, 'discarded').catch(() => undefined);
    }
    return { text: '', operationId: result.operationId };
  }

  onCleanup?.(result.cleanupOutcome);

  if (delivery === 'return') {
    supportLog('capture.stage', { captureId, stage: 'return', operationId: result.operationId });
    if (!result.operationId) {
      throw new SpeakeasyError(
        'transcription-failed',
        'Hosted Practice did not return an operation ID.'
      );
    }
    await getHostedOperationOutbox().rememberPending(result.operationId);
    if (result.usage) onUsage(result.usage);
    return { text: result.text, operationId: result.operationId, cleanupOutcome: result.cleanupOutcome };
  }

  supportLog('capture.stage', { captureId, stage: 'paste', operationId: result.operationId });
  const pasteStartedAtMs = performance.now();
  try {
    const acknowledgment = result.operationId
      ? await settleHostedOperationPaste({
          operationId: result.operationId,
          outbox: getHostedOperationOutbox(),
          paste: () => pasteText(result.text),
          acknowledge: acknowledgeHostedOperation
        })
      : (await pasteText(result.text), undefined);
    if (
      acknowledgment &&
      typeof acknowledgment === 'object' &&
      'usage' in acknowledgment
    ) {
      onUsage(
        (acknowledgment as { usage: ProductUsageSnapshot }).usage
      );
    }
  } catch (error) {
    supportFailure('capture.failed', error, { captureId, stage: 'paste', code: toErrorCode(error, 'paste-failed'), operationId: result.operationId });
    // Best-effort reliability signal (no pasted text in metadata, only a count).
    void recordClientProductEvent('paste_failed', { transcriptChars: result.text.length });
    throw new SpeakeasyError(toErrorCode(error, 'paste-failed'), 'Unable to paste dictated text.', error);
  } finally {
    logLatencyMark(captureId, 'main.paste_total', performance.now() - pasteStartedAtMs, {
      transcriptChars: result.text.length
    });
  }

  if (result.usage && !result.operationId) {
    onUsage(result.usage);
  }

  // Local-only dictation stats: word counts and durations in electron-store.
  // The text itself is counted and discarded; stats must never fail a capture.
  if (delivery === 'paste' && operationContext === 'dictation') {
    try {
      recordDictationStats({ text: result.text, durationMs, at: new Date() });
      refreshDictationStats();
    } catch {
      // Stats are best-effort.
    }
  }

  supportLog('capture.completed', { captureId, operationId: result.operationId, transcriptChars: result.text.length });
  return { text: result.text, operationId: result.operationId, cleanupOutcome: result.cleanupOutcome };
};
