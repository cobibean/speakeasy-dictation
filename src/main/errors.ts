import type { ErrorCode } from '../shared/types.js';
import type { ServerTimingSnapshot } from '../shared/server-timing.js';

export class SpeakeasyError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly serverTiming?: ServerTimingSnapshot
  ) {
    super(message);
    this.name = 'SpeakeasyError';
  }
}

export const isOfflineError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return /fetch failed|network|offline|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(error.message);
};

export const toErrorCode = (error: unknown, fallback: ErrorCode): ErrorCode => {
  if (error instanceof SpeakeasyError) {
    return error.code;
  }

  if (isOfflineError(error)) {
    return 'offline';
  }

  return fallback;
};
