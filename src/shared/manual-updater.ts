export interface ManualUpdateManifest {
  version: string;
  edition: 'product' | 'oss';
  architecture: 'arm64';
  bundleId: 'com.speakeasy.app' | 'com.speakeasy.oss';
  downloadUrl: string;
  sha256: string;
  sourceCommit: string;
  releaseTrust: {
    mode: 'trusted-public';
    signingAuthority: 'Developer ID Application';
    gatekeeperAccepted: true;
    notarized: true;
  };
  /** Absent on older releases, which continue to offer the DMG. */
  automaticUpdate?: { url: string; sha256: string; size: number };
  notes?: string;
}

export interface ManualUpdateContract {
  edition: 'product' | 'oss';
  bundleId: 'com.speakeasy.app' | 'com.speakeasy.oss';
  downloadOrigin: string;
}

export type ManualUpdateEvaluation =
  | { status: 'available'; manifest: ManualUpdateManifest }
  | { status: 'current'; manifest: ManualUpdateManifest };

export const summarizeManualUpdaterError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error ?? '');

  if (/\b404\b/.test(raw) || /cannot find/i.test(raw) || /not found/i.test(raw)) {
    return 'No published release found yet.';
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::|getaddrinfo|EAI_AGAIN|fetch failed/i.test(raw)) {
    return 'Could not reach the update server.';
  }

  const firstLine = raw.split('\n')[0]?.split(' Headers:')[0]?.trim() ?? '';
  const cleaned = firstLine || 'Update check failed.';
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}...` : cleaned;
};

export const isNewerManualUpdateVersion = (
  candidate: string,
  current: string
): boolean => {
  const parse = (value: string) => {
    const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(value);
    if (!match) throw new Error('Invalid update version.');
    return { core: match.slice(1, 4).map(BigInt), pre: match[4]?.split('.') };
  };
  const left = parse(candidate);
  const right = parse(current);
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] > right.core[i];
  }
  if (!left.pre || !right.pre) return !left.pre && !!right.pre;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const a = left.pre[i], b = right.pre[i];
    if (a === b) continue;
    if (a === undefined || b === undefined) return b === undefined;
    const an = /^\d+$/u.test(a), bn = /^\d+$/u.test(b);
    if (an && bn) return BigInt(a) > BigInt(b);
    if (an !== bn) return !an;
    return a > b;
  }
  return false;
};

const isManualUpdateManifest = (
  value: unknown,
  contract: ManualUpdateContract
): value is ManualUpdateManifest => {
  if (typeof value !== 'object' || value === null) return false;
  const manifest = value as ManualUpdateManifest;
  let downloadUrl: URL;
  try {
    downloadUrl = new URL(manifest.downloadUrl);
  } catch {
    return false;
  }
  const expectedArtifact = contract.edition === 'product' ? 'speakeasy' : 'speakeasy-oss';
  return (
    typeof manifest.version === 'string' &&
    /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(manifest.version) &&
    manifest.edition === contract.edition &&
    manifest.architecture === 'arm64' &&
    manifest.bundleId === contract.bundleId &&
    !downloadUrl.username && !downloadUrl.password && !downloadUrl.search && !downloadUrl.hash &&
    downloadUrl.protocol === 'https:' &&
    downloadUrl.origin === contract.downloadOrigin &&
    downloadUrl.pathname.endsWith(`/${expectedArtifact}-${manifest.version}-arm64.dmg`) &&
    /^[0-9a-f]{64}$/u.test(manifest.sha256) &&
    /^[0-9a-f]{40}$/u.test(manifest.sourceCommit) &&
    manifest.releaseTrust?.mode === 'trusted-public' &&
    manifest.releaseTrust.signingAuthority === 'Developer ID Application' &&
    manifest.releaseTrust.gatekeeperAccepted === true &&
    manifest.releaseTrust.notarized === true &&
    (manifest.automaticUpdate === undefined || isAutomaticUpdateArtifact(manifest.automaticUpdate, manifest.version, contract))
  );
};

export const evaluateManualUpdateManifest = (
  value: unknown,
  currentVersion: string,
  contract: ManualUpdateContract
): ManualUpdateEvaluation => {
  if (!isManualUpdateManifest(value, contract)) {
    throw new Error('Malformed update manifest.');
  }
  return {
    status: isNewerManualUpdateVersion(value.version, currentVersion)
      ? 'available'
      : 'current',
    manifest: value
  };
};

export const isAutomaticUpdateArtifact = (
  artifact: NonNullable<ManualUpdateManifest['automaticUpdate']>,
  version: string,
  contract: ManualUpdateContract
): boolean => {
  try {
    const url = new URL(artifact.url);
    const base = contract.edition === 'product' ? 'speakeasy' : 'speakeasy-oss';
    return url.protocol === 'https:' && url.origin === contract.downloadOrigin &&
      !url.username && !url.password && !url.search && !url.hash &&
      url.pathname.endsWith(`/${base}-${version}-arm64.zip`) &&
      /^[0-9a-f]{64}$/u.test(artifact.sha256) &&
      Number.isSafeInteger(artifact.size) && artifact.size > 0 && artifact.size <= 2_000_000_000;
  } catch { return false; }
};
