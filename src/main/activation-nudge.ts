import { Notification } from 'electron';
import {
  getActivationNudgeShownAt,
  getDictationStats,
  markActivationNudgeShown
} from './dictation-stats-store.js';
import {
  estimateTypingMinutes,
  shouldShowDayThreeNudge
} from '../shared/dictation-stats.js';
import { openOverlayPanel } from './overlay.js';

// One-shot local nudge shown ~72h after the first successful dictation.
// Content-free: only word counts, no transcript text.
export const maybeShowActivationNudge = (): void => {
  try {
    const stats = getDictationStats();
    const shownAt = getActivationNudgeShownAt();
    if (!shouldShowDayThreeNudge(stats, shownAt || null, new Date())) {
      return;
    }
    if (!Notification.isSupported()) {
      return;
    }
    const minutes = estimateTypingMinutes(stats.totalWords);
    const notification = new Notification({
      title: 'speakeasy.',
      body: `You've dictated ${stats.totalWords.toLocaleString('en-US')} words — about ${minutes} minutes of typing at 40 wpm. Open Settings to share it.`
    });
    notification.on('click', () => {
      openOverlayPanel('help');
    });
    notification.show();
    markActivationNudgeShown(new Date());
  } catch {
    // A nudge must never affect the app.
  }
};
