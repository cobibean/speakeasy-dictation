import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels.js';
import { getPreloadPath, getRendererUrl } from './renderer-paths.js';

let onboardingWindow: BrowserWindow | null = null;

export const createOnboardingWindow = (): BrowserWindow => {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    return onboardingWindow;
  }

  onboardingWindow = new BrowserWindow({
    title: 'Speakeasy setup',
    width: 1120,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    center: true,
    resizable: true,
    show: false,
    backgroundColor: '#f6f0e7',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: getPreloadPath(),
      nodeIntegration: false
    }
  });

  onboardingWindow.loadURL(getRendererUrl('onboarding'));
  onboardingWindow.once('ready-to-show', () => {
    onboardingWindow?.show();
    onboardingWindow?.focus();
  });
  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
  });

  return onboardingWindow;
};

export const showOnboardingWindow = ({
  protocolWake = false
}: {
  protocolWake?: boolean;
} = {}): BrowserWindow => {
  const window = createOnboardingWindow();
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();

  if (protocolWake) {
    const notify = () => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.ONBOARDING_PROTOCOL_WAKE);
      }
    };
    if (window.webContents.isLoadingMainFrame()) {
      window.webContents.once('did-finish-load', notify);
    } else {
      notify();
    }
  }

  return window;
};

export const getOnboardingWindow = (): BrowserWindow | null => onboardingWindow;

export const closeOnboardingWindow = (): void => {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.close();
  }
};
