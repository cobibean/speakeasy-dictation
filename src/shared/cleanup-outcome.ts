// Keep this additive wire vocabulary aligned with backend/lib/groq.ts.
export const CLEANUP_OUTCOMES = [
  'disabled', 'skipped', 'completed', 'unchanged',
  'timeout', 'provider-error', 'invalid-response'
] as const;
export type CleanupOutcome = typeof CLEANUP_OUTCOMES[number];

export const parseCleanupOutcome = (value: unknown): CleanupOutcome | undefined =>
  typeof value === 'string' && (CLEANUP_OUTCOMES as readonly string[]).includes(value)
    ? value as CleanupOutcome : undefined;

export const cleanupUsedOriginal = (outcome?: CleanupOutcome): boolean =>
  outcome === 'timeout' || outcome === 'provider-error' || outcome === 'invalid-response';

export const cleanupFallbackMessage = (outcome?: CleanupOutcome): string =>
  cleanupUsedOriginal(outcome) ? 'Cleanup unavailable — original text used' : '';
