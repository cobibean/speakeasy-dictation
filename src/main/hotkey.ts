import { createCaptureId } from '../shared/latency.js';
import { rememberMacPasteTarget } from './native-macos-paste.js';
import { globalShortcut, systemPreferences } from 'electron';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import { getOverlayWindow, sendOverlayStatus, showOverlayWindow } from './overlay.js';
import { getOnboardingWindow } from './onboarding-window.js';
import { IPC_CHANNELS } from '../shared/ipc-channels.js';
import {
  DEFAULT_HOTKEY_ID,
  getHotkeyLabelForPlatform,
  getHotkeyOption
} from '../shared/hotkeys.js';
import { debugLog } from './logger.js';
import {
  createHoldKeyState,
  getTruthfulToggleAccelerator,
  recoverHeldState,
  selectHotkeyRegistration,
  shouldInterruptRecordingForCaptureTargetChange
} from './hotkey-core.js';

let isRecording = false;
export const isHotkeyRecording = (): boolean => isRecording;
let usingPushToHold = false;
let uiohookListening = false;
let registrationMode: 'push-to-hold' | 'toggle' | 'unavailable' = 'unavailable';
export type HotkeyCaptureTarget =
  | 'overlay'
  | 'onboarding-practice'
  | 'verification'
  | 'inactive';
let captureTarget: HotkeyCaptureTarget = 'overlay';
export const getHotkeyCaptureTarget = (): HotkeyCaptureTarget => captureTarget;
let onVerificationComplete: () => void = () => undefined;

/** Currently bound hotkey id (one of HOTKEY_OPTIONS). */
let activeHotkeyId = DEFAULT_HOTKEY_ID;

/**
 * Resolves the configured hotkey id to a uiohook keycode. Falls back to the
 * default binding when the enum member is missing for any reason.
 */
const resolveKeycode = (hotkeyId: string): number => {
  const option = getHotkeyOption(hotkeyId);
  const keycode = (UiohookKey as Record<string, number | undefined>)[option.uiohookKey];
  if (typeof keycode === 'number') {
    return keycode;
  }
  const fallback = getHotkeyOption(DEFAULT_HOTKEY_ID);
  return (UiohookKey as Record<string, number>)[fallback.uiohookKey];
};

let activeKeycode = resolveKeycode(activeHotkeyId);
const holdKeyState = createHoldKeyState(() => activeKeycode);

const startRecording = (): void => {
  if (isRecording) return;
  if (captureTarget === 'inactive') return;

  isRecording = true;
  debugLog('Hotkey held: recording start');
  if (captureTarget === 'verification') {
    getOnboardingWindow()?.webContents.send(IPC_CHANNELS.ONBOARDING_HOTKEY_DOWN);
    return;
  }
  const captureId = createCaptureId();
  if (captureTarget === 'overlay' && process.platform === 'darwin') rememberMacPasteTarget(captureId);
  if (captureTarget === 'overlay') {
    showOverlayWindow();
    sendOverlayStatus('listening');
  }

  const target = captureTarget === 'overlay'
    ? getOverlayWindow()
    : getOnboardingWindow();
  if (target && !target.isDestroyed()) {
    target.webContents.send(IPC_CHANNELS.RECORDING_START, captureId);
  }
};

type RecordingStopReason =
  | 'hotkey-release'
  | 'toggle'
  | 'capture-target-change'
  | 'hotkey-unregister'
  | 'hotkey-rebind'
  | 'lifecycle-recovery';

const stopRecording = (reason: RecordingStopReason): void => {
  if (!isRecording) return;

  isRecording = false;
  debugLog(`Recording stop: reason=${reason} target=${captureTarget}`);

  if (captureTarget === 'verification') {
    getOnboardingWindow()?.webContents.send(IPC_CHANNELS.ONBOARDING_HOTKEY_UP);
    onVerificationComplete();
    return;
  }

  const target = captureTarget === 'overlay'
    ? getOverlayWindow()
    : getOnboardingWindow();
  if (target && !target.isDestroyed()) {
    target.webContents.send(IPC_CHANNELS.RECORDING_STOP);
  }
};

export const setHotkeyCaptureTarget = (
  target: HotkeyCaptureTarget,
  verified: () => void = () => undefined
): void => {
  if (
    shouldInterruptRecordingForCaptureTargetChange(
      isRecording,
      captureTarget,
      target
    )
  ) {
    stopRecording('capture-target-change');
  }
  captureTarget = target;
  onVerificationComplete = verified;
};

const toggleRecording = (): void => {
  if (isRecording) {
    stopRecording('toggle');
  } else {
    startRecording();
  }
};

// The keydown/keyup handlers compare against `activeKeycode` (a module-level let)
// rather than a captured constant so re-binding the hotkey takes effect without
// detaching/re-attaching the listeners.
const handleKeydown = (event: { keycode: number }): void => {
  if (holdKeyState.keydown(event.keycode)) {
    startRecording();
  }
};

const handleKeyup = (event: { keycode: number }): void => {
  if (holdKeyState.keyup(event.keycode)) {
    stopRecording('hotkey-release');
  }
};

// Try to register native push-to-hold. macOS requires Accessibility permission;
// Windows does not use that macOS permission gate.
const registerPushToHold = (): boolean => {
  try {
    uIOhook.on('keydown', handleKeydown);
    uIOhook.on('keyup', handleKeyup);
    uIOhook.start();
    uiohookListening = true;
    return true;
  } catch (error) {
    // A partial registration must not leave duplicate listeners behind if the
    // caller retries after a native-hook startup failure.
    uIOhook.off('keydown', handleKeydown);
    uIOhook.off('keyup', handleKeyup);
    console.error('Failed to start uiohook:', error);
    return false;
  }
};

// Function keys are valid Electron accelerators and can truthfully provide the
// legacy press-to-toggle fallback. Bare modifiers are not valid accelerators.
const registerToggleMode = (accelerator: string): boolean => {
  try {
    const registered = globalShortcut.register(accelerator, () => {
      toggleRecording();
    });

    if (registered) {
      return true;
    }
    console.error('Failed to register globalShortcut');
    return false;
  } catch (error) {
    console.error('Error registering globalShortcut:', error);
    return false;
  }
};

/**
 * Returns an Electron accelerator only where the configured key can actually
 * be registered by globalShortcut. Modifier-only bindings intentionally return
 * null because Electron accelerators require a non-modifier key.
 */
export const getToggleAccelerator = (hotkeyId: string): string | null => {
  const option = getHotkeyOption(hotkeyId);
  return getTruthfulToggleAccelerator(option.label);
};

export const registerHotkey = (hotkeyId: string = activeHotkeyId): boolean => {
  activeHotkeyId = hotkeyId;
  activeKeycode = resolveKeycode(hotkeyId);

  const hasMacAccessibilityPermission =
    process.platform === 'darwin'
      ? systemPreferences.isTrustedAccessibilityClient(false)
      : false;
  const toggleAccelerator = getToggleAccelerator(activeHotkeyId);
  const decision = selectHotkeyRegistration(
    process.platform,
    hasMacAccessibilityPermission,
    toggleAccelerator !== null
  );
  debugLog(
    `Hotkey init: platform=${process.platform} macAccessibility=${hasMacAccessibilityPermission} key=${hotkeyId} decision=${decision.mode} reason=${decision.reason}`
  );

  if (decision.mode === 'push-to-hold') {
    if (registerPushToHold()) {
      usingPushToHold = true;
      registrationMode = 'push-to-hold';
      debugLog('Hotkey mode: push-to-hold (uiohook)');
      return true;
    }

    // Do not silently change Windows hold-to-talk into a toggle interaction.
    debugLog('Hotkey mode: native push-to-hold registration failed');
    registrationMode = 'unavailable';
    return false;
  }

  if (decision.mode === 'toggle' && toggleAccelerator) {
    const result = registerToggleMode(toggleAccelerator);
    registrationMode = result ? 'toggle' : 'unavailable';
    debugLog(`Hotkey mode: toggle (globalShortcut), registered=${result}`);
    return result;
  }

  debugLog('Hotkey mode: unavailable (modifier-only toggle is unsupported)');
  registrationMode = 'unavailable';
  return false;
};

export const unregisterHotkey = (): void => {
  if (uiohookListening) {
    try {
      uIOhook.off('keydown', handleKeydown);
      uIOhook.off('keyup', handleKeyup);
      uIOhook.stop();
    } catch (error) {
      console.error('Error stopping uiohook:', error);
    }
    uiohookListening = false;
  }
  globalShortcut.unregisterAll();
  usingPushToHold = false;
  registrationMode = 'unavailable';
  if (holdKeyState.reset()) {
    stopRecording('hotkey-unregister');
  }
};

/**
 * Re-binds the push-to-talk key live, without an app restart. Tears down the
 * current binding (uiohook listeners or globalShortcut) and registers the new
 * one. Returns true if the new binding registered successfully.
 */
export interface SetHotkeyResult {
  registered: boolean;
  previousBindingRestored: boolean;
}

export const setHotkey = (hotkeyId: string): SetHotkeyResult => {
  const previousHotkeyId = activeHotkeyId;
  if (isRecording) {
    stopRecording('hotkey-rebind');
  }
  unregisterHotkey();
  if (registerHotkey(hotkeyId)) {
    return {
      registered: true,
      previousBindingRestored: false
    };
  }

  debugLog(`Hotkey rebind failed for ${hotkeyId}; restoring ${previousHotkeyId}`);
  unregisterHotkey();
  const previousBindingRestored = registerHotkey(previousHotkeyId);
  return {
    registered: false,
    previousBindingRestored
  };
};

export const isCurrentlyRecording = (): boolean => isRecording;
export const isPushToHoldMode = (): boolean => usingPushToHold;
export const getHotkeyMode = (): 'push-to-hold' | 'toggle' | 'unavailable' =>
  registrationMode;
export const getHotkeyLabel = (): string =>
  getHotkeyLabelForPlatform(activeHotkeyId, process.platform);

export const recoverHeldHotkey = (
  reason: string,
  beforeStop: () => void = () => undefined
): boolean => {
  return recoverHeldState(
    holdKeyState,
    () => {
      debugLog(`Hotkey hold recovered after ${reason}`);
      beforeStop();
    },
    () => stopRecording('lifecycle-recovery')
  );
};
