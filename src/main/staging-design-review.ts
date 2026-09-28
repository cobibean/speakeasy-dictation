import { BrowserWindow, Menu, MenuItem, session } from 'electron';
import { getAppConfig } from './app-config.js';
import { getRendererUrl } from './renderer-paths.js';

let review: BrowserWindow | null = null;

export const installStagingDesignReviewMenu = (): void => {
  if (getAppConfig().buildProfile !== 'mac-staging') return;
  const menu = Menu.getApplicationMenu();
  menu?.append(new MenuItem({
    label: 'Design review',
    submenu: [{
      label: 'Open offline design review',
      click: () => {
        if (review && !review.isDestroyed()) { review.show(); return; }
        // No production preload, IPC, persisted session, network, or permissions.
        const reviewSession = session.fromPartition('speakeasy-offline-design-review');
        reviewSession.webRequest.onBeforeRequest((details, callback) => {
          callback({ cancel: !details.url.startsWith('file:') && !details.url.startsWith('data:') });
        });
        reviewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
        reviewSession.setPermissionCheckHandler(() => false);
        review = new BrowserWindow({
          title: 'speakeasy (staging) — Offline design review',
          width: 1120, height: 820, minWidth: 760, minHeight: 640,
          backgroundColor: '#f6f0e7',
          webPreferences: { session: reviewSession, sandbox: true, contextIsolation: true, nodeIntegration: false }
        });
        review.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        review.webContents.on('will-navigate', (event, url) => {
          if (url.split('?')[0] !== getRendererUrl('design-review')) event.preventDefault();
        });
        void review.loadURL(getRendererUrl('design-review'));
        review.on('closed', () => { review = null; });
      }
    }]
  }));
  if (menu) Menu.setApplicationMenu(menu);
};
