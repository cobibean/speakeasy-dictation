import { getStore } from './store.js';
import {
  EMPTY_DICTATION_STATS,
  recordDictation,
  type DictationStats
} from '../shared/dictation-stats.js';

export const getDictationStats = (): DictationStats =>
  getStore().get('dictationStats') ?? EMPTY_DICTATION_STATS;

export const recordDictationStats = (input: {
  text: string;
  durationMs: number;
  at: Date;
}): DictationStats => {
  const next = recordDictation(getDictationStats(), input);
  getStore().set('dictationStats', next);
  return next;
};

export const getActivationNudgeShownAt = (): string =>
  getStore().get('activationNudgeShownAt') ?? '';

export const markActivationNudgeShown = (at: Date): void => {
  getStore().set('activationNudgeShownAt', at.toISOString());
};
