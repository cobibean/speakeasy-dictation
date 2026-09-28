/**
 * Curated catalog of single-key push-to-talk bindings.
 *
 * Push-to-hold needs a key that is comfortable to hold and won't disrupt normal
 * typing while held. We deliberately restrict the choices to modifier keys and
 * the upper function keys: binding a letter/number would swallow that key
 * everywhere the hotkey hook is active. Each entry maps a stable `id` (persisted
 * in settings as the `hotkey` value) to a human label and the corresponding
 * `UiohookKey` enum name the main process uses to register the global hook.
 */

export interface HotkeyOption {
  /** Stable identifier persisted in settings. Never change once shipped. */
  id: string;
  /** Human-facing label shown in the picker and diagnostics. */
  label: string;
  /** Name of the matching member on uiohook-napi's `UiohookKey` enum. */
  uiohookKey: string;
  /** Windows terminology for shared physical keys such as Option/Alt. */
  windowsLabel?: string;
}

export const HOTKEY_OPTIONS: readonly HotkeyOption[] = [
  { id: 'right-option', label: 'Right Option', windowsLabel: 'Right Alt', uiohookKey: 'AltRight' },
  { id: 'left-option', label: 'Left Option', windowsLabel: 'Left Alt', uiohookKey: 'Alt' },
  { id: 'right-command', label: 'Right Command', windowsLabel: 'Right Windows', uiohookKey: 'MetaRight' },
  { id: 'left-command', label: 'Left Command', windowsLabel: 'Left Windows', uiohookKey: 'Meta' },
  { id: 'right-control', label: 'Right Control', uiohookKey: 'CtrlRight' },
  { id: 'left-control', label: 'Left Control', uiohookKey: 'Ctrl' },
  { id: 'right-shift', label: 'Right Shift', uiohookKey: 'ShiftRight' },
  { id: 'f6', label: 'F6', uiohookKey: 'F6' },
  { id: 'f7', label: 'F7', uiohookKey: 'F7' },
  { id: 'f8', label: 'F8', uiohookKey: 'F8' },
  { id: 'f9', label: 'F9', uiohookKey: 'F9' },
  { id: 'f13', label: 'F13', uiohookKey: 'F13' },
  { id: 'f14', label: 'F14', uiohookKey: 'F14' },
  { id: 'f15', label: 'F15', uiohookKey: 'F15' },
  { id: 'f16', label: 'F16', uiohookKey: 'F16' },
  { id: 'f17', label: 'F17', uiohookKey: 'F17' },
  { id: 'f18', label: 'F18', uiohookKey: 'F18' },
  { id: 'f19', label: 'F19', uiohookKey: 'F19' }
] as const;

/** The binding used when nothing is configured (matches the store default). */
export const DEFAULT_HOTKEY_ID = 'right-option';

const HOTKEY_BY_ID = new Map<string, HotkeyOption>(HOTKEY_OPTIONS.map((option) => [option.id, option]));

export const isHotkeyId = (value: unknown): value is string =>
  typeof value === 'string' && HOTKEY_BY_ID.has(value);

/** Resolves an id to its option, falling back to the default binding. */
export const getHotkeyOption = (id: string | undefined | null): HotkeyOption =>
  (id && HOTKEY_BY_ID.get(id)) || HOTKEY_BY_ID.get(DEFAULT_HOTKEY_ID)!;

export const getHotkeyLabelById = (id: string | undefined | null): string => getHotkeyOption(id).label;

export const getHotkeyLabelForPlatform = (
  id: string | undefined | null,
  platform: NodeJS.Platform | 'macos' | 'windows' | 'unsupported'
): string => {
  const option = getHotkeyOption(id);
  return platform === 'win32' || platform === 'windows'
    ? option.windowsLabel ?? option.label
    : option.label;
};

export const getHotkeyOptionsForPlatform = (
  platform: NodeJS.Platform | 'macos' | 'windows' | 'unsupported'
): readonly HotkeyOption[] =>
  HOTKEY_OPTIONS.map((option) => ({
    ...option,
    label:
      platform === 'win32' || platform === 'windows'
        ? option.windowsLabel ?? option.label
        : option.label
  }));
