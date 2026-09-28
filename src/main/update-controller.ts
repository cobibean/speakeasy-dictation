import { evaluateManualUpdateManifest, summarizeManualUpdaterError } from '../shared/manual-updater.js';
import type { ManualUpdateContract, ManualUpdateManifest } from '../shared/manual-updater.js';
import type { UpdaterState } from '../shared/types.js';

export interface UpdateDependencies {
  version: string;
  manifestUrl: string;
  contract: ManualUpdateContract;
  fetchManifest: (signal: AbortSignal) => Promise<unknown>;
  prepare?: (manifest: ManualUpdateManifest, progress: (percent: number) => void) => Promise<void>;
  install: () => void;
  restartBlocked: () => boolean;
  openExternal: (url: string) => Promise<void>;
  changed: (state: UpdaterState) => void;
  timeoutMs?: number;
}

/** Owns one check/download at a time. A ready update survives subsequent checks. */
export const createUpdateController = (dependencies: UpdateDependencies) => {
  let state: UpdaterState = { status: 'idle', message: 'Updates are checked automatically.', availableVersion: '' };
  let inFlight: Promise<void> | undefined;
  const set = (patch: Partial<UpdaterState>) => {
    state = { ...state, ...patch };
    dependencies.changed(state);
  };
  const runCheck = async () => {
    set({ status: 'checking', message: 'Checking for updates…', availableVersion: '', downloadUrl: undefined, progress: undefined });
    try {
      const abort = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { abort.abort(); reject(new Error('Update check timed out. Try again.')); }, dependencies.timeoutMs ?? 10_000);
      });
      let value: unknown;
      try { value = await Promise.race([dependencies.fetchManifest(abort.signal), deadline]); }
      finally { clearTimeout(timer); }
      const result = evaluateManualUpdateManifest(value, dependencies.version, dependencies.contract);
      if (result.status === 'current') {
        set({ status: 'idle', message: 'You are on the latest version.' });
        return;
      }
      const { manifest } = result;
      set({ status: 'available', availableVersion: manifest.version, downloadUrl: manifest.downloadUrl, message: `Version ${manifest.version} is available. Download the installer, quit speakeasy., replace it in Applications, and reopen.` });
      if (!manifest.automaticUpdate || !dependencies.prepare) return;
      set({ status: 'downloading', message: `Downloading version ${manifest.version}…`, progress: 0 });
      try {
        await dependencies.prepare(manifest, (progress) => set({ progress }));
        set({ status: 'downloaded', progress: 100, message: `Version ${manifest.version} is ready. Restart when you’re finished to install it. It can also install the next time you quit.` });
      } catch {
        set({ status: 'error', progress: undefined, message: 'Could not prepare the update. Try again, or download the installer.' });
      }
    } catch (error) {
      set({ status: 'error', availableVersion: '', downloadUrl: undefined, message: summarizeManualUpdaterError(error) });
    }
  };
  return {
    getState: () => state,
    check: (): Promise<void> => {
      if (state.status === 'downloaded') return Promise.resolve();
      if (!inFlight) inFlight = runCheck().finally(() => { inFlight = undefined; });
      return inFlight;
    },
    openDownload: async () => {
      if (!state.downloadUrl) return;
      try { await dependencies.openExternal(state.downloadUrl); }
      catch { set({ message: 'Could not open your browser. Try Download installer again.' }); }
    },
    install: () => {
      if (state.status !== 'downloaded') return;
      if (dependencies.restartBlocked()) {
        set({ message: 'Finish your recording or dictation before restarting.' });
        return;
      }
      try { dependencies.install(); }
      catch { set({ message: 'Could not restart. Quit and reopen speakeasy. to install the prepared update.' }); }
    }
  };
};
