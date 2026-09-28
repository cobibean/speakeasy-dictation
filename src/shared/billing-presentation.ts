export const BILLING_CATALOG = [
  { id: 'free', name: 'Free', price: 'US$0', allowance: '5 successful dictations/week' },
  { id: 'standard', name: 'Standard', price: 'US$5/month', allowance: '12 hours/month' },
  { id: 'pro', name: 'Pro', price: 'US$9/month', allowance: '30 hours/month' }
] as const;

interface UsagePresentationInput {
  plan?: 'free' | 'standard' | 'pro';
  remainingSuccessfulDictations?: number | null;
  hardLimitSuccessfulDictations?: number | null;
  remainingSeconds: number | null;
  hardLimitSeconds: number | null;
}

const formatDuration = (seconds: number): string => {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

export const formatUsageRemaining = (usage: UsagePresentationInput): string => {
  if (
    usage.plan === 'free' &&
    typeof usage.remainingSuccessfulDictations === 'number' &&
    typeof usage.hardLimitSuccessfulDictations === 'number'
  ) {
    return `${Math.max(0, usage.remainingSuccessfulDictations)} of ${usage.hardLimitSuccessfulDictations} dictations remaining`;
  }
  if (usage.remainingSeconds !== null && usage.hardLimitSeconds !== null) {
    return `${formatDuration(usage.remainingSeconds)} of ${formatDuration(usage.hardLimitSeconds)} remaining`;
  }
  return 'Usage pending';
};

export const formatUsageReset = (
  resetAt: string,
  locale?: string,
  timeZone?: string
): string => {
  const date = new Date(resetAt);
  if (!resetAt || Number.isNaN(date.getTime())) return 'Reset time unavailable';
  const formatted = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {})
  }).format(date);
  return `Resets ${formatted.replace(',', ' at')}`;
};

export const formatBillingDate = (value: string): string => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
};
