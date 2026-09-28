import type { WidgetPosition } from '../shared/types.js';
import type { OverlayAttachment, OverlayLayoutPayload } from '../shared/types.js';

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayGutter {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FittedOverlayLayout {
  position: WidgetPosition;
  width: number;
  height: number;
}

// macOS native draggable regions can pause briefly while the pointer first
// detaches a borderless window from its screen edge. Settling during that pause
// snaps the window back under the cursor and feels like drag resistance.
export const getOverlayMoveSettleDelay = (platform: string): number =>
  platform === 'darwin' ? 250 : 90;

export const fitOverlayToWorkArea = (
  position: WidgetPosition,
  requestedWidth: number,
  requestedHeight: number,
  workArea: WorkArea,
  gutter: OverlayGutter
): FittedOverlayLayout => {
  const availableWidth = Math.max(1, workArea.width - gutter.left - gutter.right);
  const availableHeight = Math.max(1, workArea.height - gutter.top - gutter.bottom);
  const width = Math.min(Math.max(1, requestedWidth), availableWidth);
  const height = Math.min(Math.max(1, requestedHeight), availableHeight);
  const minX = workArea.x + gutter.left;
  const minY = workArea.y + gutter.top;
  const maxX = workArea.x + workArea.width - width - gutter.right;
  const maxY = workArea.y + workArea.height - height - gutter.bottom;

  return {
    position: {
      x: Math.min(Math.max(position.x, minX), Math.max(minX, maxX)),
      y: Math.min(Math.max(position.y, minY), Math.max(minY, maxY))
    },
    width,
    height
  };
};

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));
const TRAVEL_GUTTER = 8;

// Inverse of getAttachedOverlayPosition for an actual native window position.
// A cursor's fraction of the entire screen is not a window's fraction of travel.
export const getAttachmentForPosition = (
  position: WidgetPosition,
  width: number,
  height: number,
  workArea: WorkArea,
  edge = getAttachmentForPoint(position, workArea).edge
): OverlayAttachment => {
  const horizontal = edge === 'top';
  const extent = horizontal ? workArea.width : workArea.height;
  const size = Math.min(Math.max(1, horizontal ? width : height), extent);
  const travel = Math.max(0, extent - size - TRAVEL_GUTTER * 2);
  const distance = horizontal ? position.x - workArea.x : position.y - workArea.y;
  return { edge, offset: travel > 0 ? clampUnit((distance - TRAVEL_GUTTER) / travel) : 0 };
};

export const getAttachmentForPoint = (
  point: WidgetPosition,
  workArea: WorkArea
): OverlayAttachment => {
  const leftDistance = Math.abs(point.x - workArea.x);
  const rightDistance = Math.abs(workArea.x + workArea.width - point.x);
  const topDistance = Math.abs(point.y - workArea.y);
  const edge = topDistance <= leftDistance && topDistance <= rightDistance
    ? 'top'
    : leftDistance <= rightDistance
      ? 'left'
      : 'right';
  const offset = edge === 'top'
    ? clampUnit((point.x - workArea.x) / Math.max(1, workArea.width))
    : clampUnit((point.y - workArea.y) / Math.max(1, workArea.height));

  return { edge, offset };
};

export const getAttachedOverlayPosition = (
  attachment: OverlayAttachment,
  width: number,
  height: number,
  workArea: WorkArea,
  travelGutter = TRAVEL_GUTTER
): WidgetPosition => {
  const safeWidth = Math.min(Math.max(1, width), workArea.width);
  const safeHeight = Math.min(Math.max(1, height), workArea.height);

  if (attachment.edge === 'top') {
    const travel = Math.max(0, workArea.width - safeWidth - travelGutter * 2);
    return {
      x: Math.round(workArea.x + travelGutter + travel * clampUnit(attachment.offset)),
      y: workArea.y
    };
  }

  const travel = Math.max(0, workArea.height - safeHeight - travelGutter * 2);
  return {
    x: attachment.edge === 'left' ? workArea.x : workArea.x + workArea.width - safeWidth,
    y: Math.round(workArea.y + travelGutter + travel * clampUnit(attachment.offset))
  };
};

export const getAnchoredOverlayLayout = (
  attachment: OverlayAttachment,
  layout: OverlayLayoutPayload,
  workArea: WorkArea
) => {
  const bookmark = layout.bookmark ?? layout;
  const anchor = getAttachedOverlayPosition(attachment, bookmark.width, bookmark.height, workArea);
  const width = Math.ceil(layout.width);
  const height = Math.ceil(layout.height);
  const horizontal = attachment.edge === 'top';
  const before = horizontal ? anchor.x - workArea.x : anchor.y - workArea.y;
  const after = horizontal
    ? workArea.x + workArea.width - anchor.x - bookmark.width
    : workArea.y + workArea.height - anchor.y - bookmark.height;
  const extension = horizontal ? width - bookmark.width : height - bookmark.height;
  const railReversed = extension > after - TRAVEL_GUTTER && before > after;
  const position = {
    x: horizontal
      ? anchor.x - (railReversed ? extension : 0)
      : attachment.edge === 'right' ? anchor.x - (width - bookmark.width) : anchor.x,
    y: horizontal ? anchor.y : anchor.y - (railReversed ? extension : 0)
  };
  const fitted = fitOverlayToWorkArea(position, width, height, workArea,
    { top: 0, right: 0, bottom: 0, left: 0 });
  return {
    ...fitted,
    bookmarkOffset: { x: anchor.x - fitted.position.x, y: anchor.y - fitted.position.y },
    railReversed
  };
};
