import { app, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getAppConfig } from './app-config.js';
import { getUpdateManifestUrl } from '../shared/update-feed.js';

/** Only invoked by the explicitly isolated review-baseline build profile. */
export const runMacReviewProbe = async (): Promise<void> => {
  const config = getAppConfig();
  if (!app.isPackaged || config.buildProfile !== 'mac-review-baseline' ||
      config.productEnvironment !== 'staging' || config.protocolScheme !== null) {
    throw new Error('The baseline probe requires the isolated packaged staging profile.');
  }
  const requested = app.commandLine.getSwitchValue('baseline-report');
  const reportPath = requested || path.join(app.getPath('userData'), 'baseline-report.json');
  if (!path.isAbsolute(reportPath)) throw new Error('Baseline report path must be absolute.');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const nativeHook = createRequire(import.meta.url)('uiohook-napi');
  if (typeof nativeHook.uIOhook?.start !== 'function') throw new Error('arm64 native hook did not load.');
  // Loading the native module is intentional; starting the global key hook is not.
  const surfaces = [];
  for (const surface of ['onboarding', 'overlay', 'settings']) {
    const window = new BrowserWindow({ width: 1120, height: 800, show: false,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
    const errors: string[] = [];
    window.webContents.on('console-message', (_event, ...args) => {
      const message = args[1];
      if (typeof message === 'string' && /Uncaught|Failed to load resource/.test(message)) errors.push(message);
    });
    try {
      await window.loadFile(path.join(app.getAppPath(), 'dist/renderer', surface, 'index.html'));
      const state = await window.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(i => i.decode().catch(() => undefined)));
        return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve({
          text: document.body.innerText.slice(0, 500),
          rootChildren: document.getElementById('root')?.childElementCount ?? 0,
          imagesLoaded: [...document.images].every(i => i.complete && i.naturalWidth > 0)
        })));
        });
      })()`);
      if (!state.rootChildren || !state.imagesLoaded || errors.length) {
        throw new Error(`${surface} did not render cleanly: ${JSON.stringify({ state, errors })}`);
      }
      const screenshot = path.join(path.dirname(reportPath), `${surface}.png`);
      await fs.writeFile(screenshot, (await window.webContents.capturePage()).toPNG());
      surfaces.push({ surface, ...state, errors, screenshot });
    } finally { window.destroy(); }
  }
  await fs.writeFile(reportPath, JSON.stringify({
    kind: 'isolated-packaged-baseline-probe', createdAt: new Date().toISOString(),
    packaged: app.isPackaged, platform: process.platform, architecture: process.arch,
    versions: process.versions, appPath: app.getAppPath(), userData: app.getPath('userData'),
    config, manifestUrl: getUpdateManifestUrl(config.updateFeedUrl),
    nativeHook: 'loaded-not-started',
    shellProductVariablesPresent: Object.keys(process.env).filter(k => k.startsWith('SPEAKEASY_')),
    surfaces,
    limitations: ['No account, provider, microphone, paste or update transaction was performed.',
      'Renderer mounting without an IPC bridge is not full native workflow acceptance.',
      'Local signing is not notarization or clean-second-Mac trust proof.']
  }, null, 2) + '\n', { mode: 0o600 });
};
