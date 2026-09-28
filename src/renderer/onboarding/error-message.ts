const IPC_ERROR_PREFIX =
  /^Error invoking remote method '[^']+':\s*(?:SpeakeasyError:\s*)?/u;

export const toHostedOnboardingErrorMessage = (
  error: unknown,
  fallback: string
): string => {
  if (!(error instanceof Error)) return fallback;

  const message = error.message.replace(IPC_ERROR_PREFIX, '').trim();
  return message || fallback;
};
