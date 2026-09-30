import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PASTE_REFUSAL_REASONS } from '../shared/paste-recovery.js';
import { LATENCY_PHASES } from '../shared/latency.js';
import { sanitizeServerTimingSnapshot } from '../shared/server-timing.js';
import { cleanupUsedOriginal, parseCleanupOutcome } from '../shared/cleanup-outcome.js';

const EVENTS = ['app.started', 'app.stopped', 'runtime.failed', 'capture.started', 'capture.failed', 'capture.completed', 'capture.empty', 'capture.discarded', 'capture.operation', 'capture.stage', 'capture.cleanup', 'latency', 'http.completed', 'http.failed', 'state.error', 'bundle.exported'] as const;
export type SupportEventName = typeof EVENTS[number];
const CODES = new Set('none missing-api-key auth-required auth-failed consent-required activation-required offline microphone-denied microphone-unavailable accessibility-required hotkey-unavailable transcription-failed provider-budget-paused polish-failed paste-failed paste-clipboard-only usage-limit-reached updater-failed hosted-request-failed internal-error unauthorized invalid-request rate-limit-exceeded method-not-allowed bad-request payload-too-large invalid-operation-id operation-conflict unsupported-contract processing-consent-required invalid-duration operation-id-conflict rate-limit-reached practice-grant-unavailable operation-expired operation-already-exists contract-version-required contract-version-unsupported'.split(' '));
const STAGES = new Set(['paste-target', 'requested', 'listening', 'stopped', 'canceled', 'request', 'auth', 'contract', 'consent', 'quota-precheck', 'body-read', 'body-parse', 'payload-validate', 'rate-limit', 'reserve', 'provider-start', 'stt', 'polish', 'mark-transcribed', 'response', 'service', 'paste', 'return', 'validation', 'bootstrap', 'renderer', 'main', ...LATENCY_PHASES]);
const ERROR_TYPES = new Set('Error TypeError RangeError ReferenceError SyntaxError AggregateError AbortError TimeoutError SpeakeasyError HostedProductHttpError HostedProductContractError ClipboardOnlyPasteError NonError'.split(' '));
const SOURCE_FILES = new Set(['index.js', 'pipeline.js', 'paste.js', 'paste-executor.js', 'hosted-product-client.js', 'product-api.js', 'hosted-product-errors.js', 'product-dictation-service.js', 'groq-dictation-service.js', 'groq.js', 'hosted-operation-settlement.js', 'hosted-operation-outbox.js']);
const UUID = /^(?:cap_)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTES = new Set(['/v1/transcribe', '/v1/session/bootstrap', '/v1/usage', '/v1/consent', '/v1/setup/progress', '/v1/setup/review']);
export type SupportDetails = Record<string, string | number | boolean | object>;
export interface SupportEvent { timestamp: string; sessionId: string; event: SupportEventName; details: SupportDetails }

export const isSupportFailure = (event: SupportEvent): boolean =>
  event.event.endsWith('.failed') || event.event === 'state.error' ||
  (event.event === 'capture.cleanup' && cleanupUsedOriginal(parseCleanupOutcome(event.details.cleanupOutcome)));

// This is a schema, not a string redactor: unknown fields and free-form values never enter a bundle.
export const sanitizeSupportDetails = (input: unknown): SupportDetails => {
  if (!input || typeof input !== 'object') return {};
  const source = input as Record<string, unknown>;
  const result: SupportDetails = {};
  if (PASTE_REFUSAL_REASONS.includes(source.pasteReason as typeof PASTE_REFUSAL_REASONS[number])) {
    result.pasteReason = source.pasteReason as string;
  }
  if (source.cleanupOutcome !== undefined) {
    result.cleanupOutcome = parseCleanupOutcome(source.cleanupOutcome) ?? 'unknown';
  }
  for (const key of ['captureId', 'operationId', 'correlationId']) {
    if (typeof source[key] === 'string' && UUID.test(source[key])) result[key] = source[key];
  }
  for (const key of ['code', 'serverCode']) {
    if (typeof source[key] === 'string') result[key] = CODES.has(source[key]) ? source[key] : 'unrecognized';
  }
  for (const key of ['stage', 'backendStage', 'phase']) {
    if (typeof source[key] === 'string' && STAGES.has(source[key])) result[key] = source[key];
  }
  for (const key of ['durationMs', 'audioBytes', 'transcriptChars', 'chunkCount', 'exitCode']) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e10) result[key] = value;
  }
  if (typeof source.status === 'number' && Number.isInteger(source.status) && source.status >= 100 && source.status <= 599) result.status = source.status;
  if (typeof source.errorType === 'string') result.errorType = ERROR_TYPES.has(source.errorType) ? source.errorType : 'Error';
  if (typeof source.route === 'string') result.route = ROUTES.has(source.route) ? source.route : source.route.startsWith('/v1/operations/') ? '/v1/operations/:id' : 'other';
  if (typeof source.clipboardWritten === 'boolean') result.clipboardWritten = source.clipboardWritten;
  if (typeof source.polish === 'boolean') result.polish = source.polish;
  if (['cached', 'stored', 'refreshed', 'unknown'].includes(source.tokenOutcome as string)) result.tokenOutcome = source.tokenOutcome as string;
  if (typeof source.version === 'string' && /^\d+\.\d+\.\d+$/.test(source.version)) result.version = source.version;
  if (typeof source.networkCode === 'string' && ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(source.networkCode)) result.networkCode = source.networkCode;
  if (Array.isArray(source.frames)) {
    const frames = source.frames.slice(0, 8).filter(frame => frame && typeof frame === 'object' && SOURCE_FILES.has(frame.file) && Number.isSafeInteger(frame.line) && frame.line > 0 && frame.line < 1e7 && Number.isSafeInteger(frame.column) && frame.column > 0 && frame.column < 1e7).map(frame => ({ file: frame.file, line: frame.line, column: frame.column }));
    if (frames.length) result.frames = frames;
  }
  const timings = sanitizeServerTimingSnapshot(source.serverTiming);
  if (Object.keys(timings).length) result.serverTiming = timings;
  return result;
};

export const safeErrorDetails = (error: unknown): SupportDetails => {
  let current = error;
  const details: Record<string, unknown> = {};
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 5 && current && typeof current === 'object' && !seen.has(current); depth++) {
    seen.add(current);
    const item = current as Record<string, unknown>;
    details.errorType ??= current instanceof Error ? current.name : 'NonError';
    if (!details.frames && current instanceof Error && current.stack) {
      const frames = current.stack.split('\n').slice(1).flatMap(line => {
        const match = line.match(/\/([a-z-]+\.js):(\d+):(\d+)\)?$/);
        return match && SOURCE_FILES.has(match[1]) ? [{ file: match[1], line: Number(match[2]), column: Number(match[3]) }] : [];
      });
      if (frames.length) details.frames = frames;
    }
    if (typeof item.status === 'number') {
      details.status = item.status;
      details.serverCode = item.code;
      details.correlationId = item.correlationId;
      details.backendStage = item.stage;
      details.serverTiming = item.serverTiming;
    } else if (item.code !== undefined) {
      if (typeof item.code === 'string' && CODES.has(item.code)) details.code ??= item.code;
      else details.networkCode = item.code;
    }
    if (item.pasteReason !== undefined) details.pasteReason = item.pasteReason;
    if (item.clipboardWritten === true) details.clipboardWritten = true;
    current = item.cause;
  }
  return sanitizeSupportDetails(details);
};

export class SupportLogStore {
  private readonly sessionId = randomUUID();
  private writeFailures = 0;
  private readonly maxBytes: number;
  private readonly fileCount: number;
  constructor(private readonly directory: string, options: { maxBytes?: number; fileCount?: number } = {}) {
    this.maxBytes = options.maxBytes ?? 1024 * 1024;
    this.fileCount = options.fileCount ?? 5;
  }
  private file(index: number): string { return path.join(this.directory, `support-${index}.jsonl`); }
  append(event: SupportEventName, details: unknown = {}): void {
    try {
      const record: SupportEvent = { timestamp: new Date().toISOString(), sessionId: this.sessionId, event, details: sanitizeSupportDetails(details) };
      const line = JSON.stringify(record) + '\n';
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      const size = fs.existsSync(this.file(0)) ? fs.statSync(this.file(0)).size : 0;
      if (size + Buffer.byteLength(line) > this.maxBytes) {
        fs.rmSync(this.file(this.fileCount - 1), { force: true });
        for (let index = this.fileCount - 2; index >= 0; index--) {
          if (fs.existsSync(this.file(index))) fs.renameSync(this.file(index), this.file(index + 1));
        }
      }
      fs.appendFileSync(this.file(0), line, { encoding: 'utf8', mode: 0o600 });
    } catch { this.writeFailures++; }
  }
  read(): { events: SupportEvent[]; invalidRecords: number; readFailures: number; writeFailures: number } {
    const events: SupportEvent[] = [];
    let invalidRecords = 0;
    let readFailures = 0;
    for (let index = 4; index >= 0; index--) {
      try {
        const stat = fs.statSync(this.file(index));
        if (stat.size > 1024 * 1024 + 8192) { readFailures++; continue; }
        for (const line of fs.readFileSync(this.file(index), 'utf8').split('\n')) {
          if (!line) continue;
          try {
            const value = JSON.parse(line);
            if (!EVENTS.includes(value.event) || typeof value.sessionId !== 'string' || !UUID.test(value.sessionId) || typeof value.timestamp !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.timestamp) || !Number.isFinite(Date.parse(value.timestamp))) throw new Error('invalid');
            events.push({ timestamp: value.timestamp, sessionId: value.sessionId, event: value.event, details: sanitizeSupportDetails(value.details) });
          } catch { invalidRecords++; }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') readFailures++;
      }
    }
    return { events, invalidRecords, readFailures, writeFailures: this.writeFailures };
  }
  clear(): void {
    for (let index = 0; index < 5; index++) {
      try { fs.rmSync(this.file(index), { force: true }); } catch { this.writeFailures++; }
    }
  }
}
