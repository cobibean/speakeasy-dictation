export type CaptureId = `cap_${string}`;
export type CleanupStrengthMetadata = 'minimal' | 'balanced' | 'strong';

export interface LatencyMetadata {
  audioBytes?: number;
  chunkCount?: number;
  polish?: boolean;
  cleanupStrength?: CleanupStrengthMetadata;
  transcriptChars?: number;
  mimeType?: string;
}

export const BACKEND_LATENCY_PHASES = [
  'backend.auth.total',
  'backend.quota.precheck',
  'backend.usage.reserve',
  'backend.body.parse',
  'backend.stt.total',
  'backend.polish.total',
  'backend.usage.commit',
  'backend.usage.transcribed',
  'backend.device.touch',
  'backend.response.total'
] as const;

export type BackendLatencyPhase = (typeof BACKEND_LATENCY_PHASES)[number];

export const LATENCY_PHASES = [
  'renderer.recording_request_to_listening',
  'renderer.release_to_processing',
  'renderer.recorder_stop',
  'renderer.release_to_onstop',
  'renderer.blob_construction',
  'renderer.array_buffer',
  'renderer.ipc_invoke',
  'main.ipc_handler',
  'main.pipeline_total',
  'main.service_total',
  'main.stt_total',
  'main.polish_total',
  'main.paste_total',
  ...BACKEND_LATENCY_PHASES
] as const;

export type LatencyPhase = (typeof LATENCY_PHASES)[number];

export interface LatencyMark {
  phase: LatencyPhase;
  startMs: number;
  endMs: number;
  metadata?: LatencyMetadata;
}

const CAPTURE_ID_PATTERN = /^cap_[0-9a-f-]{36}$/;
const CLEANUP_STRENGTHS = ['minimal', 'balanced', 'strong'] as const satisfies readonly CleanupStrengthMetadata[];

export const createCaptureId = (): CaptureId => {
  return `cap_${globalThis.crypto.randomUUID()}`;
};

export const isCaptureId = (value: unknown): value is CaptureId => {
  return typeof value === 'string' && CAPTURE_ID_PATTERN.test(value);
};

export const isLatencyPhase = (value: unknown): value is LatencyPhase => {
  return typeof value === 'string' && LATENCY_PHASES.includes(value as LatencyPhase);
};

const isValidTiming = (startMs: number, endMs: number): boolean => {
  return (
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    startMs >= 0 &&
    endMs >= startMs
  );
};

const isSafeCount = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
};

const isCleanupStrength = (value: unknown): value is CleanupStrengthMetadata => {
  return typeof value === 'string' && CLEANUP_STRENGTHS.includes(value as CleanupStrengthMetadata);
};

const isSafeMimeType = (value: unknown): value is string => {
  return typeof value === 'string' && /^audio\/[a-z0-9.+-]+(?:;[a-z0-9_.=+-]+)*$/i.test(value);
};

export const sanitizeLatencyMetadata = (metadata: unknown): LatencyMetadata | undefined => {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return undefined;
  }

  const safeMetadata: LatencyMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    switch (key) {
      case 'audioBytes':
      case 'chunkCount':
      case 'transcriptChars':
        if (isSafeCount(value)) {
          safeMetadata[key] = value;
        }
        break;
      case 'polish':
        if (typeof value === 'boolean') {
          safeMetadata[key] = value;
        }
        break;
      case 'cleanupStrength':
        if (isCleanupStrength(value)) {
          safeMetadata[key] = value;
        }
        break;
      case 'mimeType':
        if (isSafeMimeType(value)) {
          safeMetadata[key] = value;
        }
        break;
      default:
        break;
    }
  }

  return Object.keys(safeMetadata).length > 0 ? safeMetadata : undefined;
};

export const sanitizeLatencyMarks = (marks: unknown): LatencyMark[] => {
  if (!Array.isArray(marks)) {
    return [];
  }

  const sanitized: LatencyMark[] = [];

  for (const mark of marks) {
    if (typeof mark !== 'object' || mark === null || Array.isArray(mark)) {
      continue;
    }

    const candidate = mark as Partial<LatencyMark>;
    const { phase, startMs, endMs } = candidate;
    if (
      !isLatencyPhase(phase) ||
      typeof startMs !== 'number' ||
      typeof endMs !== 'number' ||
      !isValidTiming(startMs, endMs)
    ) {
      continue;
    }

    const metadata = sanitizeLatencyMetadata(candidate.metadata);
    sanitized.push({
      phase,
      startMs,
      endMs,
      ...(metadata ? { metadata } : {})
    });
  }

  return sanitized;
};

export const createLatencyMark = (
  phase: LatencyPhase,
  startMs: number,
  endMs: number,
  metadata?: LatencyMetadata
): LatencyMark => ({
  phase,
  startMs,
  endMs,
  ...(metadata ? { metadata } : {})
});

const roundDuration = (durationMs: number): number => {
  return Math.round(durationMs * 100) / 100;
};

export const summarizeLatencyMarks = (marks: unknown): Record<string, number> => {
  return sanitizeLatencyMarks(marks).reduce<Record<string, number>>((summary, mark) => {
    summary[mark.phase] = roundDuration(mark.endMs - mark.startMs);
    return summary;
  }, {});
};
