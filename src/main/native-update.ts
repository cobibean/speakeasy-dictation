import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { AutoUpdater } from 'electron';
import type { ManualUpdateManifest } from '../shared/manual-updater.js';

type Artifact = NonNullable<ManualUpdateManifest['automaticUpdate']>;

export const downloadVerifiedUpdate = async (
  artifact: Artifact, destination: string, signal: AbortSignal,
  progress: (percent: number) => void,
  fetchArtifact: typeof fetch = fetch
): Promise<void> => {
  const response = await fetchArtifact(artifact.url, { signal, redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('Update download failed.');
  const hash = createHash('sha256');
  let bytes = 0;
  let lastProgress = -1;
  const verify = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > artifact.size) return callback(new Error('Update size mismatch.'));
      hash.update(chunk);
      const percent = Math.floor(bytes / artifact.size * 95);
      if (percent !== lastProgress) { lastProgress = percent; progress(percent); }
      callback(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), verify,
    createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal });
  if (bytes !== artifact.size || hash.digest('hex') !== artifact.sha256) {
    throw new Error('Update integrity check failed.');
  }
};

/** Electron 44's Squirrel validates the signature, but not the manifest's hash.
 * Serve only our already verified ZIP over a private loopback feed. Squirrel
 * then verifies it against the running app's signing requirement and owns the
 * replacement/relaunch; application code never rewrites the installed bundle.
 */
export const stageVerifiedUpdate = async (
  updater: Pick<AutoUpdater, 'setFeedURL' | 'checkForUpdates' | 'on' | 'removeListener'>,
  zipPath: string, size: number, version: string,
  timeoutMs = 20 * 60_000
): Promise<void> => {
  const token = randomBytes(32).toString('hex');
  let baseUrl = '';
  const server = createServer((request, response) => {
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === `/${token}/feed`) {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ url: `${baseUrl}/${token}/update.zip`, name: version, notes: '' }));
    } else if (request.url === `/${token}/update.zip`) {
      response.setHeader('Content-Type', 'application/zip');
      response.setHeader('Content-Length', size);
      void pipeline(createReadStream(zipPath), response).catch(() => response.destroy());
    } else response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Update bridge unavailable.');
  baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        updater.removeListener('update-downloaded', ready);
        updater.removeListener('error', failed);
        updater.removeListener('update-not-available', missing);
      };
      const ready = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error('Native update preparation failed.')); };
      const missing = () => { cleanup(); reject(new Error('Native update unavailable.')); };
      const timer = setTimeout(failed, timeoutMs);
      updater.on('update-downloaded', ready);
      updater.on('error', failed);
      updater.on('update-not-available', missing);
      try {
        updater.setFeedURL({ url: `${baseUrl}/${token}/feed`, serverType: 'default' });
        updater.checkForUpdates();
      } catch { failed(); }
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

export const prepareNativeUpdate = async (
  updater: AutoUpdater, manifest: ManualUpdateManifest, progress: (percent: number) => void,
  fetchArtifact: typeof fetch = fetch
): Promise<void> => {
  const artifact = manifest.automaticUpdate;
  if (!artifact) throw new Error('No automatic update artifact.');
  const directory = await mkdtemp(join(tmpdir(), 'speakeasy-update-'));
  const zip = join(directory, 'update.zip');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 20 * 60_000);
  try {
    await downloadVerifiedUpdate(artifact, zip, abort.signal, progress, fetchArtifact);
    clearTimeout(timer);
    await stageVerifiedUpdate(updater, zip, artifact.size, manifest.version);
  } finally {
    clearTimeout(timer);
    await rm(directory, { recursive: true, force: true });
  }
};
