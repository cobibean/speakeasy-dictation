import { supportLog } from './support-logger.js';
import { debugLog } from './logger.js';
import {
  createCaptureId,
  isCaptureId,
  sanitizeLatencyMarks,
  summarizeLatencyMarks,
  type CaptureId,
  type LatencyMetadata,
  type LatencyPhase
} from '../shared/latency.js';

interface LatencyLogEntry {
  captureId: CaptureId;
  phase: LatencyPhase;
  durationMs: number;
  metadata?: LatencyMetadata;
}

export const normalizeCaptureId = (captureId: unknown): CaptureId => {
  return isCaptureId(captureId) ? captureId : createCaptureId();
};

const writeLatencyLog = (entry: LatencyLogEntry): void => {
  supportLog('latency', { ...entry, ...entry.metadata });
  debugLog(`[latency] ${JSON.stringify(entry)}`);
};

export const logLatencyMark = (
  captureId: CaptureId,
  phase: LatencyPhase,
  durationMs: number,
  metadata?: Record<string, unknown>
): void => {
  const sanitizedMarks = sanitizeLatencyMarks([
    {
      phase,
      startMs: 0,
      endMs: durationMs,
      metadata
    }
  ]);
  const [mark] = sanitizedMarks;
  if (!mark) {
    return;
  }

  const summary = summarizeLatencyMarks(sanitizedMarks);
  writeLatencyLog({
    captureId,
    phase: mark.phase,
    durationMs: summary[mark.phase] ?? 0,
    ...(mark.metadata ? { metadata: mark.metadata } : {})
  });
};

export const logLatencyMarks = (captureId: CaptureId, marks: unknown): void => {
  const sanitizedMarks = sanitizeLatencyMarks(marks);

  for (const mark of sanitizedMarks) {
    const summary = summarizeLatencyMarks([mark]);
    writeLatencyLog({
      captureId,
      phase: mark.phase,
      durationMs: summary[mark.phase] ?? 0,
      ...(mark.metadata ? { metadata: mark.metadata } : {})
    });
  }
};
