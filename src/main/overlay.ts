import type { SettingsCategory } from '../shared/types.js';
import { BrowserWindow, screen } from 'electron';
import { uIOhook } from 'uiohook-napi';
import { getRendererUrl, getPreloadPath } from './renderer-paths.js';
import { IPC_CHANNELS } from '../shared/ipc-channels.js';
import { getStore } from './store.js';
import type { OverlayAttachment, OverlayLayoutPayload, OverlayStatus, WidgetPosition } from '../shared/types.js';
import { getQuietWidgetLayout } from '../shared/quiet-widget-layout.js';
import {
  getAttachmentForPoint,
  getAttachmentForPosition,
  getAnchoredOverlayLayout,
  getOverlayMoveSettleDelay
} from './overlay-layout.js';
import { createOverlayMoveSettler, type OverlayMoveSettler } from './overlay-move-settler.js';
import { shouldIgnoreOverlayMouse, type HitRect } from './overlay-hit-test.js';

let overlayWindow: BrowserWindow | null = null;
let currentVisualLayout: OverlayLayoutPayload | null = null;
let overlayVisibilityRequested = false;
let displayRecoveryRegistered = false;
let applyingBounds = false;
let moveSettler: OverlayMoveSettler | null = null;
let currentAttachment: OverlayAttachment = { edge: 'right', offset: 0.42 };
let interactiveRegions: HitRect[] | null = null;
let pointerHeld = false;
let ignoringMouse = false;

// Native drag regions do not produce Chromium hover events. Use the existing
// global mouse hook and screen coordinates so the grip never becomes click-through.
const updateMouseHitTest = (): void => {
  if (!overlayWindow || !overlayWindow.isVisible()) return;
  const ignore = interactiveRegions !== null && shouldIgnoreOverlayMouse(
    screen.getCursorScreenPoint(), overlayWindow.getBounds(), interactiveRegions, pointerHeld
  );
  if (ignore === ignoringMouse) return;
  ignoringMouse = ignore;
  overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
};

const handleGlobalMouseDown = (): void => {
  if (!overlayWindow?.isVisible() || interactiveRegions === null) return;
  pointerHeld = !shouldIgnoreOverlayMouse(
    screen.getCursorScreenPoint(), overlayWindow.getBounds(), interactiveRegions, false
  );
  updateMouseHitTest();
};

// Cursor Spine is flush with the selected work-area edge, so the native window
// cannot reserve an outer shadow gutter without creating a visible gap.
const SHADOW_GUTTER = { top: 0, right: 0, bottom: 0, left: 0 };

const getInitialBounds = (): { width: number; height: number; x: number; y: number } => {
  const store = getStore();
  const storedPosition = store.get('widgetPosition') ?? { x: 96, y: 96 };
  const display = screen.getDisplayNearestPoint(storedPosition);
  const widgetSize = store.get('widgetSize') ?? 'small';
  currentAttachment = getAttachmentForPoint(storedPosition, display.workArea);
  const layout = getQuietWidgetLayout(currentAttachment.edge, widgetSize, false);
  // Stored positions refer to the visible bookmark, not its transparent canvas.
  currentAttachment = getAttachmentForPosition(storedPosition, layout.bookmark.width, layout.bookmark.height, display.workArea, currentAttachment.edge);
  const fitted = getAnchoredOverlayLayout(currentAttachment, layout, display.workArea);
  currentAttachment = { ...currentAttachment, bookmarkOffset: fitted.bookmarkOffset, railReversed: fitted.railReversed };
  currentVisualLayout = layout;

  return {
    width: fitted.width + SHADOW_GUTTER.left + SHADOW_GUTTER.right,
    height: fitted.height + SHADOW_GUTTER.top + SHADOW_GUTTER.bottom,
    x: fitted.position.x - SHADOW_GUTTER.left,
    y: fitted.position.y - SHADOW_GUTTER.top
  };
};

const applyCurrentLayout = (): void => {
  if (!overlayWindow || !currentVisualLayout) {
    return;
  }

  const workArea = screen.getDisplayMatching(overlayWindow.getBounds()).workArea;
  const fitted = getAnchoredOverlayLayout(currentAttachment, currentVisualLayout, workArea);
  currentAttachment = {
    ...currentAttachment, bookmarkOffset: fitted.bookmarkOffset, railReversed: fitted.railReversed
  };
  const bookmarkPosition = {
    x: fitted.position.x + fitted.bookmarkOffset.x,
    y: fitted.position.y + fitted.bookmarkOffset.y
  };
  overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_ATTACHMENT_CHANGED, currentAttachment);
  const targetBounds = {
    x: fitted.position.x - SHADOW_GUTTER.left,
    y: fitted.position.y - SHADOW_GUTTER.top,
    width: Math.round(fitted.width + SHADOW_GUTTER.left + SHADOW_GUTTER.right),
    height: Math.round(fitted.height + SHADOW_GUTTER.top + SHADOW_GUTTER.bottom)
  };
  const currentBounds = overlayWindow.getBounds();
  if (
    currentBounds.x === targetBounds.x &&
    currentBounds.y === targetBounds.y &&
    currentBounds.width === targetBounds.width &&
    currentBounds.height === targetBounds.height
  ) {
    // Native dragging may already have placed the window exactly at its snap.
    getStore().set('widgetPosition', bookmarkPosition);
    return;
  }
  applyingBounds = true;
  // Animated bounds changes are unreliable for a transparent, borderless
  // window that changes aspect ratio while snapping between top and side
  // edges. Keep the native drag uninterrupted, then apply one atomic snap.
  overlayWindow.setBounds(targetBounds, false);
  getStore().set('widgetPosition', bookmarkPosition);
  setTimeout(() => {
    applyingBounds = false;
  }, 0);
};

const settleOverlayAtPoint = (pointer: WidgetPosition): void => {
  if (!overlayWindow || applyingBounds) return;
  const workArea = screen.getDisplayNearestPoint(pointer).workArea;
  const nextAttachment = getAttachmentForPoint(pointer, workArea);
  const edgeChanged = nextAttachment.edge !== currentAttachment.edge;
  const bounds = overlayWindow.getBounds();
  const bookmark = currentVisualLayout?.bookmark ?? bounds;
  const bookmarkPosition = {
    x: bounds.x + (currentAttachment.bookmarkOffset?.x ?? 0),
    y: bounds.y + (currentAttachment.bookmarkOffset?.y ?? 0)
  };
  currentAttachment = edgeChanged ? nextAttachment : getAttachmentForPosition(
    bookmarkPosition, bookmark.width, bookmark.height, workArea, nextAttachment.edge
  );
  overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_ATTACHMENT_CHANGED, currentAttachment);

  // A same-edge move keeps the current dimensions, so it can be positioned
  // immediately. Crossing edges changes aspect ratio; wait for React to report
  // the new layout and apply exactly one bounds update from setOverlayLayout.
  if (!edgeChanged) {
    applyCurrentLayout();
  }
};

const handleGlobalMouseUp = (): void => {
  moveSettler?.onMouseUp();
  pointerHeld = false;
  updateMouseHitTest();
};

const registerDisplayRecovery = (): void => {
  if (displayRecoveryRegistered) {
    return;
  }
  displayRecoveryRegistered = true;
  screen.on('display-added', () => applyCurrentLayout());
  screen.on('display-removed', () => applyCurrentLayout());
  screen.on('display-metrics-changed', () => applyCurrentLayout());
};

const showOverlayWhenReady = (
  window: BrowserWindow,
  active = false
): void => {
  const show = () => {
    if (!overlayVisibilityRequested || window.isDestroyed()) {
      return;
    }
    if (active) {
      window.show();
      window.focus();
    } else if (!window.isVisible()) {
      window.showInactive();
    }
  };

  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', show);
    return;
  }
  show();
};

// Only the widget joins full-screen Spaces; ordinary app windows stay unchanged.
// The macOS panel can join full-screen Spaces without hiding the app from the Dock.
export const setOverlayFullScreenVisibility = (enabled: boolean): void => {
  if (process.platform !== 'darwin' || !overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.setVisibleOnAllWorkspaces(enabled, {
    visibleOnFullScreen: enabled,
    skipTransformProcessType: true
  });
};

export const createOverlayWindow = (): BrowserWindow => {
  if (overlayWindow) {
    return overlayWindow;
  }

  const bounds = getInitialBounds();
  registerDisplayRecovery();

  overlayWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    resizable: false,
    movable: true,
    show: false,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: false,
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      preload: getPreloadPath(),
      nodeIntegration: false
      // NOTE: sandbox is intentionally left at its default (false) here.
      // Enabling sandbox:true broke microphone capture — getUserMedia in a
      // sandboxed renderer couldn't complete the media-permission handshake,
      // so pressing record never reached the "listening" state. Isolation is
      // still enforced via contextIsolation + nodeIntegration:false + the
      // minimal contextBridge preload.
    }
  });

  setOverlayFullScreenVisibility(getStore().get('showWidgetOverFullScreenApps') ?? true);
  overlayWindow.loadURL(getRendererUrl('overlay'));
  moveSettler = createOverlayMoveSettler({
    delayMs: getOverlayMoveSettleDelay(process.platform),
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    getPointer: () => screen.getCursorScreenPoint(),
    settle: settleOverlayAtPoint
  });
  uIOhook.on('mouseup', handleGlobalMouseUp);
  uIOhook.on('mousedown', handleGlobalMouseDown);
  uIOhook.on('mousemove', updateMouseHitTest);
  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow?.webContents.send(IPC_CHANNELS.OVERLAY_ATTACHMENT_CHANGED, currentAttachment);
  });
  if (process.env.SPEAKEASY_W3_IDLE_SOAK === '1') {
    overlayWindow.webContents.once('did-finish-load', () => {
      console.log('W3_EVIDENCE_RENDERER_READY');
    });
  }
  overlayWindow.once('ready-to-show', () => {
    if (overlayWindow) {
      showOverlayWhenReady(overlayWindow);
    }
  });
  overlayWindow.on('move', () => {
    if (!overlayWindow || applyingBounds) {
      return;
    }
    moveSettler?.onMove();
  });
  overlayWindow.on('closed', () => {
    moveSettler?.reset();
    moveSettler = null;
    uIOhook.off('mouseup', handleGlobalMouseUp);
    uIOhook.off('mousedown', handleGlobalMouseDown);
    uIOhook.off('mousemove', updateMouseHitTest);
    interactiveRegions = null;
    pointerHeld = false;
    ignoringMouse = false;
    overlayWindow = null;
    overlayVisibilityRequested = false;
  });

  return overlayWindow;
};

export const showOverlayWindow = (options?: { active?: boolean }): void => {
  overlayVisibilityRequested = true;
  const window = overlayWindow ?? createOverlayWindow();
  if (options?.active) {
    showOverlayWhenReady(window, true);
    return;
  }

  // Only call show() if not already visible — avoids stealing focus from the active app
  if (!window.isVisible()) {
    showOverlayWhenReady(window);
  }
};

export const hideOverlayWindow = (): void => {
  overlayVisibilityRequested = false;
  overlayWindow?.hide();
};

export const sendOverlayStatus = (status: OverlayStatus): void => {
  overlayWindow?.webContents.send(IPC_CHANNELS.STATUS_UPDATE, status);
};

export const sendFinalTranscript = (text: string): void => {
  overlayWindow?.webContents.send(IPC_CHANNELS.TRANSCRIPT_FINAL, text);
};

export const openOverlayPanel = (category?: SettingsCategory): void => {
  overlayVisibilityRequested = true;
  const window = overlayWindow ?? createOverlayWindow();
  showOverlayWhenReady(window, true);
  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', () => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.OVERLAY_PANEL_OPEN, category);
      }
    });
    return;
  }
  window.webContents.send(IPC_CHANNELS.OVERLAY_PANEL_OPEN, category);
};

export const sendRecordingRecovery = (reason: string): void => {
  overlayWindow?.webContents.send(IPC_CHANNELS.RECORDING_RECOVER, reason);
};

export const setOverlayLayout = ({ width, height, bookmark, interactiveRegions: regions }: OverlayLayoutPayload): void => {
  const window = overlayWindow ?? createOverlayWindow();
  interactiveRegions = Array.isArray(regions) && regions.length <= 8 && regions.every(region =>
    region && [region.x, region.y, region.width, region.height].every(Number.isFinite) &&
    region.width >= 0 && region.height >= 0
  ) ? regions : null;
  currentVisualLayout = { width, height, bookmark };
  applyCurrentLayout();
  updateMouseHitTest();
  if (overlayVisibilityRequested) {
    showOverlayWhenReady(window);
  }
};

export const getOverlayWindow = (): BrowserWindow | null => overlayWindow;
