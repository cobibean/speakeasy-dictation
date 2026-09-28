export type HotkeyPlatform = NodeJS.Platform;
export type HotkeyRegistrationMode = 'push-to-hold' | 'toggle' | 'unavailable';

export interface HotkeyRegistrationDecision {
  mode: HotkeyRegistrationMode;
  reason:
    | 'windows-native-hook'
    | 'mac-accessibility-hook'
    | 'function-key-toggle-fallback'
    | 'modifier-toggle-unsupported';
}

/**
 * Electron can register function keys as standalone accelerators, but not bare
 * modifier keys. Keeping this check pure prevents an invalid Alt/Control/etc.
 * fallback from being presented as a working mode.
 */
export const getTruthfulToggleAccelerator = (label: string): string | null =>
  /^F\d+$/u.test(label) ? label : null;

/**
 * Selects the OS-facing input mechanism without importing Electron or the
 * native hook. Windows always uses the native hook because globalShortcut does
 * not expose keyup and therefore cannot implement hold-to-talk.
 */
export const selectHotkeyRegistration = (
  platform: HotkeyPlatform,
  hasMacAccessibilityPermission: boolean,
  hasTruthfulToggleAccelerator: boolean
): HotkeyRegistrationDecision => {
  if (platform === 'win32') {
    return {
      mode: 'push-to-hold',
      reason: 'windows-native-hook'
    };
  }

  if (platform === 'darwin' && hasMacAccessibilityPermission) {
    return {
      mode: 'push-to-hold',
      reason: 'mac-accessibility-hook'
    };
  }

  if (hasTruthfulToggleAccelerator) {
    return {
      mode: 'toggle',
      reason: 'function-key-toggle-fallback'
    };
  }

  return {
    mode: 'unavailable',
    reason: 'modifier-toggle-unsupported'
  };
};

export interface HoldKeyState {
  keydown: (keycode: number) => boolean;
  keyup: (keycode: number) => boolean;
  reset: () => boolean;
  isHeld: () => boolean;
}

export const HOTKEY_RECOVERY_POWER_EVENTS = [
  'suspend',
  'resume',
  'lock-screen',
  'unlock-screen'
] as const;

export const shouldClearRecoveredHotkeyError = (errorCode: string): boolean =>
  errorCode === 'hotkey-unavailable';

/**
 * Capture routing may be refreshed while a hold is active (for example when
 * the Persistent HUD is routed to `overlay` again). Only a real destination
 * change should interrupt that recording; an idempotent refresh must not act
 * like a physical key release.
 */
export const shouldInterruptRecordingForCaptureTargetChange = (
  isRecording: boolean,
  currentTarget: string,
  nextTarget: string
): boolean => isRecording && currentTarget !== nextTarget;

export const recoverHeldState = (
  holdState: Pick<HoldKeyState, 'reset'>,
  onInterrupted: () => void,
  onStop: () => void
): boolean => {
  if (!holdState.reset()) {
    return false;
  }

  onInterrupted();
  onStop();
  return true;
};

/**
 * Tracks one push-to-talk key. Returning true means the caller should emit the
 * corresponding start/stop action. Auto-repeat and unrelated keys are ignored.
 * reset() is the recovery seam used when a hook is torn down or rebound.
 */
export const createHoldKeyState = (getActiveKeycode: () => number): HoldKeyState => {
  let held = false;

  return {
    keydown(keycode) {
      if (keycode !== getActiveKeycode() || held) {
        return false;
      }

      held = true;
      return true;
    },
    keyup(keycode) {
      if (keycode !== getActiveKeycode() || !held) {
        return false;
      }

      held = false;
      return true;
    },
    reset() {
      const wasHeld = held;
      held = false;
      return wasHeld;
    },
    isHeld() {
      return held;
    }
  };
};
