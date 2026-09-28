import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ManualUpdateManifest } from '../shared/manual-updater.js';

/** Explicit local fixture, ignored by every Product/OSS release build. */
export const getUpdateRehearsalPath = (buildProfile: string, args = process.argv): string | undefined => {
  if (buildProfile !== 'mac-staging') return undefined;
  const file = args.find(arg => arg.startsWith('--update-rehearsal='))?.slice('--update-rehearsal='.length);
  return file && path.isAbsolute(file) ? file : undefined;
};
export const loadUpdateRehearsal = (file: string) => {
  const fixture = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    mode: 'native' | 'current' | 'offline' | 'malformed'; version: string;
    zipPath?: string; sha256?: string; size?: number;
  };
  if (!['native', 'current', 'offline', 'malformed'].includes(fixture.mode)) throw Error('Unknown local update fixture.');
  if (fixture.mode === 'native' && (!fixture.zipPath || !path.isAbsolute(fixture.zipPath))) throw Error('Local update ZIP must have an absolute path.');
  const manifest: ManualUpdateManifest = {
    version: fixture.version, edition: 'product', architecture: 'arm64', bundleId: 'com.speakeasy.app',
    downloadUrl: `https://update-rehearsal.invalid/releases/speakeasy-${fixture.version}-arm64.dmg`,
    sha256: 'a'.repeat(64), sourceCommit: 'b'.repeat(40),
    releaseTrust: { mode: 'trusted-public', signingAuthority: 'Developer ID Application', gatekeeperAccepted: true, notarized: true },
    ...(fixture.mode === 'native' ? { automaticUpdate: {
      url: `https://update-rehearsal.invalid/releases/speakeasy-${fixture.version}-arm64.zip`,
      sha256: fixture.sha256!, size: fixture.size!
    } } : {})
  };
  return {
    manifest,
    fetchManifest: async () => {
      if (fixture.mode === 'offline') throw Error('fetch failed');
      if (fixture.mode === 'malformed') return {};
      return manifest;
    },
    // The normal downloader still streams and verifies length/hash before the
    // normal native staging path. This never fabricates a public trust receipt.
    fetchArtifact: (async () => new Response(Readable.toWeb(fs.createReadStream(fixture.zipPath!)) as ReadableStream)) as typeof fetch,
    record: (state: unknown) => fs.writeFileSync(`${file}.state.json`, JSON.stringify({ at: new Date().toISOString(), localRehearsal: true, state }, null, 2))
  };
};
