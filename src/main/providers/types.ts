import type { CleanupOutcome } from '../../shared/cleanup-outcome.js';
import type { CleanupStrength } from '../../shared/types.js';
import type { ProductUsageSnapshot } from '../../shared/product-api.js';
import type { CaptureId } from '../../shared/latency.js';
import type { ServerTimingSnapshot } from '../../shared/server-timing.js';

export interface TranscriptionInput {
  audioBuffer: ArrayBuffer;
  mimeType: string;
}

export interface Transcriber {
  transcribe(input: TranscriptionInput): Promise<string>;
}

export interface Polisher {
  polish(text: string, signal?: AbortSignal): Promise<string>;
}

export interface ServiceCaptureInput extends TranscriptionInput {
  streaming?: boolean;
  captureId: CaptureId;
  durationMs: number;
  polishBeforePaste: boolean;
  cleanupStrength: CleanupStrength;
  onPolishing?: () => void;
  operationContext?: 'dictation' | 'onboarding' | 'test';
  normalAllowanceConfirmed?: boolean;
}

export interface ServiceCaptureResult {
  text: string;
  cleanupOutcome?: CleanupOutcome;
  usage?: ProductUsageSnapshot;
  serverTiming?: ServerTimingSnapshot;
  operationId?: string;
  contractVersion?: string;
}

export interface DictationService {
  processCapture(input: ServiceCaptureInput): Promise<ServiceCaptureResult>;
}
