import { BrowserWindow } from 'electron';
import { getPreloadPath, getRendererUrl } from './renderer-paths.js';

let settingsWindow: BrowserWindow | null = null;

export const createSettingsWindow = (): BrowserWindow => {
  if (settingsWindow) {
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 420,
    height: 760,
    resizable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: getPreloadPath(),
      nodeIntegration: false
    }
  });

  settingsWindow.loadURL(getRendererUrl('settings'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return settingsWindow;
};

export const showSettingsWindow = (): void => {
  const window = settingsWindow ?? createSettingsWindow();
  window.show();
  window.focus();
};
