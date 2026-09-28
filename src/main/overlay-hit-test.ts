export interface HitRect { x: number; y: number; width: number; height: number }

export const shouldIgnoreOverlayMouse = (
  point: { x: number; y: number },
  windowOrigin: { x: number; y: number },
  regions: readonly HitRect[],
  pointerHeld: boolean
): boolean => {
  if (pointerHeld) return false;
  const x = point.x - windowOrigin.x;
  const y = point.y - windowOrigin.y;
  return !regions.some(region =>
    x >= region.x && y >= region.y &&
    x < region.x + region.width && y < region.y + region.height
  );
};
