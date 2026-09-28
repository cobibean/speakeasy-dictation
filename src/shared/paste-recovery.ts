export const getPasteRecoveryShortcut = (platform: string): 'Command+V' | 'Ctrl+V' =>
  platform === 'darwin' || platform.toLowerCase().startsWith('mac')
    ? 'Command+V'
    : 'Ctrl+V';

export const getPasteRecoveryMessage = (platform: string): string =>
  `Automatic paste was blocked. Your text is on the clipboard; press ${getPasteRecoveryShortcut(platform)} to paste it.`;

export const getPasteRecoveryStatus = (platform: string): string =>
  `Copied — Press ${getPasteRecoveryShortcut(platform)}`;
