export const AUTH_RESEND_COOLDOWN_MS = 60_000;

export const authResendSecondsRemaining = (
  availableAt: number | undefined,
  now = Date.now()
): number => Number.isFinite(availableAt)
  ? Math.max(0, Math.ceil(((availableAt ?? 0) - now) / 1000))
  : 0;

export const isAuthEmailSentStatus = (status: unknown): boolean =>
  status === 'email_sent' || status === 'callback_received' || status === 'exchanged';
