import { getWidgetSizeOption, type WidgetSize } from './widget-sizes.js';
import type { WidgetEdge } from './types.js';

/** Text and hit targets have a minimum size independent of the decorative rail. */
export const getQuietWidgetLayout = (edge: WidgetEdge, size: WidgetSize, open: boolean) => {
  const scale = open ? 1 : Math.max(0.75, getWidgetSizeOption(size).scale);
  const thickness = Math.max(44, 36 * scale);
  const bookmarkLength = Math.max(80, 116 * scale);
  const bookmark = edge === 'top'
    ? { width: bookmarkLength, height: thickness }
    : { width: thickness, height: bookmarkLength };
  if (open) return edge === 'top'
    ? { width: 720, height: 600 + thickness, bookmark }
    : { width: 720 + thickness, height: 600, bookmark };
  // Keep the native canvas stable throughout dictation, including the entire
  // exit. Resizing a transparent macOS window and updating its renderer offsets
  // cannot commit atomically. Only painted elements participate in hit testing.
  return edge === 'top'
    ? { width: Math.max(280, 376 * scale), height: thickness + 64, bookmark }
    : { width: thickness + 232, height: Math.max(240, 358 * scale), bookmark };
};
