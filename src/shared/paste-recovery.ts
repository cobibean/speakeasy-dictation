export const PASTE_REFUSAL_REASONS = [
  'none', 'bridge-unavailable', 'target-unavailable', 'accessibility-unavailable',
  'secure-input', 'frontmost-unavailable', 'window-unavailable', 'field-unavailable',
  'field-not-editable', 'focus-changed', 'modifier-held', 'allocation-failed'
] as const;
export type PasteRefusalReason = typeof PASTE_REFUSAL_REASONS[number];
export const parsePasteRefusalReason = (value: unknown): PasteRefusalReason =>
  PASTE_REFUSAL_REASONS.includes(value as PasteRefusalReason) ? value as PasteRefusalReason : 'target-unavailable';

export const getPasteRecoveryShortcut = (platform: string): 'Command+V' | 'Ctrl+V' =>
  platform === 'darwin' || platform.toLowerCase().startsWith('mac')
    ? 'Command+V'
    : 'Ctrl+V';

export const getPasteRecoveryMessage = (platform: string): string =>
  `Automatic paste was blocked. Your text is on the clipboard; press ${getPasteRecoveryShortcut(platform)} to paste it.`;

export const getPasteRecoveryStatus = (platform: string): string =>
  `Copied — Press ${getPasteRecoveryShortcut(platform)}`;
