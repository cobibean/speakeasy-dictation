import { BACKEND_LATENCY_PHASES, type BackendLatencyPhase } from './latency.js';

export type ServerTimingSnapshot = Partial<Record<BackendLatencyPhase, number>>;

interface ServerTimingHeaders {
  get(name: string): string | null;
}

const SERVER_METRIC_TO_PHASE = new Map<string, BackendLatencyPhase>(
  BACKEND_LATENCY_PHASES.map((phase) => [phase.replaceAll('.', '_'), phase])
);

const SAFE_DURATION_PATTERN = /^\d+(?:\.\d+)?$/;

const isSafeDuration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const selectServerTimingHeader = (headers: ServerTimingHeaders): string | null =>
  headers.get('server-timing') ?? headers.get('x-speakeasy-server-timing');

const tokenizeServerTimingHeader = (header: string): string[] => {
  const metrics: string[] = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;

  for (const character of header) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (inQuotes && character === '\\') {
      current += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      current += character;
      inQuotes = !inQuotes;
      continue;
    }
    if (character === ',' && !inQuotes) {
      metrics.push(current);
      current = '';
      continue;
    }
    current += character;
  }

  if (inQuotes || escaped) return [];
  metrics.push(current);
  return metrics;
};

export const sanitizeServerTimingSnapshot = (value: unknown): ServerTimingSnapshot => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const snapshot: ServerTimingSnapshot = {};
  const candidate = value as Record<string, unknown>;
  for (const phase of BACKEND_LATENCY_PHASES) {
    const durationMs = candidate[phase];
    if (isSafeDuration(durationMs)) {
      snapshot[phase] = durationMs;
    }
  }
  return snapshot;
};

export const parseServerTimingHeader = (header: string | null | undefined): ServerTimingSnapshot => {
  if (!header) return {};

  const snapshot: ServerTimingSnapshot = {};
  for (const metric of tokenizeServerTimingHeader(header)) {
    const parts = metric.trim().split(';');
    if (parts.length !== 2) continue;

    const metricName = parts[0]?.trim() ?? '';
    const durationParam = parts[1]?.trim() ?? '';
    const phase = SERVER_METRIC_TO_PHASE.get(metricName);
    if (!phase || !durationParam.startsWith('dur=')) continue;

    const rawDuration = durationParam.slice('dur='.length);
    if (!SAFE_DURATION_PATTERN.test(rawDuration)) continue;

    const durationMs = Number(rawDuration);
    if (isSafeDuration(durationMs)) {
      snapshot[phase] = durationMs;
    }
  }

  return snapshot;
};

export const extractServerTimingSnapshot = (source: unknown): ServerTimingSnapshot => {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return {};
  }
  return sanitizeServerTimingSnapshot((source as { serverTiming?: unknown }).serverTiming);
};

export const visitServerTimings = (
  source: unknown,
  visitor: (phase: BackendLatencyPhase, durationMs: number) => void
): void => {
  const snapshot = extractServerTimingSnapshot(source);
  for (const phase of BACKEND_LATENCY_PHASES) {
    const durationMs = snapshot[phase];
    if (durationMs !== undefined) {
      visitor(phase, durationMs);
    }
  }
};
