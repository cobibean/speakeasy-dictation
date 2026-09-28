// Local dictation statistics. Pure functions; persisted in the local
// electron-store only — never sent anywhere.

export interface DictationStats {
  totalDictations: number;
  totalWords: number;
  totalDurationMs: number;
  firstDictationAt: string | null;
  lastDictationAt: string | null;
}

export const EMPTY_DICTATION_STATS: DictationStats = {
  totalDictations: 0,
  totalWords: 0,
  totalDurationMs: 0,
  firstDictationAt: null,
  lastDictationAt: null
};

export const countWords = (text: string): number => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

export const recordDictation = (
  stats: DictationStats,
  input: { text: string; durationMs: number; at: Date }
): DictationStats => ({
  totalDictations: stats.totalDictations + 1,
  totalWords: stats.totalWords + countWords(input.text),
  totalDurationMs: stats.totalDurationMs + input.durationMs,
  firstDictationAt: stats.firstDictationAt ?? input.at.toISOString(),
  lastDictationAt: input.at.toISOString()
});

// Explicit estimate label: "about N minutes of typing at 40 wpm".
export const estimateTypingMinutes = (words: number, wpm = 40): number =>
  Math.round(words / wpm);

export const formatShareText = (stats: DictationStats): string =>
  `I've dictated ${stats.totalWords.toLocaleString('en-US')} words with speakeasy. — about ${estimateTypingMinutes(stats.totalWords)} minutes of typing at 40 wpm. Open-source dictation for Mac: https://speakeasywords.com`;

const DAY_THREE_MS = 72 * 60 * 60 * 1000;

export const shouldShowDayThreeNudge = (
  stats: DictationStats,
  nudgeShownAt: string | null,
  now: Date
): boolean =>
  stats.totalDictations >= 1 &&
  stats.firstDictationAt !== null &&
  !nudgeShownAt &&
  now.getTime() - new Date(stats.firstDictationAt).getTime() >= DAY_THREE_MS;
