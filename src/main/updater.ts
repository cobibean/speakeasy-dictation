import { app, autoUpdater, powerMonitor, shell } from 'electron';
import { getAppConfig } from './app-config.js';
import { recordClientProductEvent } from './product-events.js';
import { updateUpdaterState } from './runtime-state.js';
import { getDisabledUpdaterMessage } from '../shared/platform.js';
import { getUpdateManifestUrl } from '../shared/update-feed.js';
import { createUpdateController } from './update-controller.js';
import { getUpdateRehearsalPath, loadUpdateRehearsal } from './update-rehearsal.js';
import { prepareNativeUpdate } from './native-update.js';

let controller: ReturnType<typeof createUpdateController> | undefined;

export const initializeUpdater = (restartBlocked: () => boolean = () => false): void => {
  const config = getAppConfig();
  if (!config.capabilities.autoUpdate || !app.isPackaged) {
    updateUpdaterState({ status: 'disabled', message: getDisabledUpdaterMessage(config.distribution, app.isPackaged), availableVersion: '', downloadUrl: undefined });
    return;
  }
  const rehearsalPath = getUpdateRehearsalPath(config.buildProfile);
  const rehearsal = rehearsalPath ? loadUpdateRehearsal(rehearsalPath) : undefined;
  const manifestUrl = getUpdateManifestUrl(rehearsal ? 'https://update-rehearsal.invalid/releases' : config.updateFeedUrl);
  if (!manifestUrl) {
    updateUpdaterState({ status: 'error', message: 'No update server configured.', availableVersion: '' });
    return;
  }
  // Keep late native failures from becoming an unhandled EventEmitter error.
  autoUpdater.on('error', () => undefined);
  let announcedVersion = '';
  controller = createUpdateController({
    version: app.getVersion(), manifestUrl,
    contract: {
      edition: config.edition,
      bundleId: config.edition === 'product' ? 'com.speakeasy.app' : 'com.speakeasy.oss',
      downloadOrigin: new URL(manifestUrl).origin
    },
    fetchManifest: rehearsal?.fetchManifest ?? (async (signal) => {
      const response = await fetch(`${manifestUrl}?t=${Date.now()}`, { signal, cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw new Error(`Update server returned ${response.status}.`);
      return response.json();
    }),
    prepare: process.platform === 'darwin' ? (manifest, progress) => prepareNativeUpdate(autoUpdater, manifest, progress, rehearsal?.fetchArtifact) : undefined,
    install: () => autoUpdater.quitAndInstall(),
    restartBlocked,
    openExternal: (url) => {
      if (rehearsal) return Promise.reject(new Error('Fixture has no public installer.'));
      void recordClientProductEvent('update_download_clicked', { availableVersion: controller?.getState().availableVersion ?? '' });
      return shell.openExternal(url);
    },
    changed: (state) => {
      if (!rehearsal && state.status === 'available' && state.availableVersion !== announcedVersion) {
        announcedVersion = state.availableVersion;
        void recordClientProductEvent('update_available', { availableVersion: announcedVersion, currentVersion: app.getVersion() });
      }
      updateUpdaterState(rehearsal ? { ...state, message: `Local update rehearsal: ${state.message}` } : state);
      rehearsal?.record({ ...state, installedVersion: app.getVersion() });
    }
  });
  updateUpdaterState(controller.getState());
  const interval = setInterval(() => { void checkForUpdates(); }, 4 * 60 * 60_000);
  interval.unref();
  let lastResumeCheck = 0;
  const resume = () => {
    if (Date.now() - lastResumeCheck < 60_000) return;
    lastResumeCheck = Date.now();
    void checkForUpdates();
  };
  powerMonitor.on('resume', resume);
  app.once('will-quit', () => { clearInterval(interval); powerMonitor.removeListener('resume', resume); });
};

export const checkForUpdates = async (): Promise<void> => { await controller?.check(); };
export const openUpdateDownload = async (): Promise<void> => { await controller?.openDownload(); };
export const installUpdate = (): void => { controller?.install(); };
