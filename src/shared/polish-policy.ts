export type CleanupStrength = import('./types.js').CleanupStrength;

export const POLISH_TIMEOUT_MS = 2_500;

const FILLER_OR_REPAIR_PATTERN =
  /\b(um+|uh+|er+|ah+|you know|i mean(?:t)?|actually|no wait|sorry|scratch that|let me rephrase|make that|correction)\b/i;
const DISCOURSE_FILLER_PATTERN = /(?:^\s*(?:well|like)\s*,|,\s*like\s*,)/i;
const ADJACENT_DUPLICATE_PATTERN = /\b([a-z][a-z'-]*)\b(?:\s+|,\s*)\1\b/i;
const SENTENCE_END_PATTERN = /[.!?]$/;

export const shouldSkipLlmPolish = (
  text: string,
  cleanupStrength: CleanupStrength
): boolean => {
  const trimmed = text.trim();
  return (
    cleanupStrength === 'minimal' &&
    trimmed.length > 0 &&
    trimmed.length <= 120 &&
    !FILLER_OR_REPAIR_PATTERN.test(trimmed) &&
    !DISCOURSE_FILLER_PATTERN.test(trimmed) &&
    !ADJACENT_DUPLICATE_PATTERN.test(trimmed) &&
    SENTENCE_END_PATTERN.test(trimmed)
  );
};

export type PolishOperation = (signal: AbortSignal) => Promise<string>;

export const withPolishTimeout = (
  operation: PolishOperation,
  fallbackText: string,
  timeoutMs = POLISH_TIMEOUT_MS
): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const finish = (action: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      action();
    };

    timeout = setTimeout(() => {
      finish(() => {
        controller.abort();
        resolve(fallbackText);
      });
    }, timeoutMs);

    void Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error))
      );
  });
