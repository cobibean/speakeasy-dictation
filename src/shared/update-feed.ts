/** Shared by build configuration, the publisher and the manual updater. */
export const UPDATE_MANIFEST_FILENAME = 'version.json';
export const PRODUCT_RELEASE_DIRECTORY = 'releases';

export const normalizeUpdateFeedUrl = (value: string, key = 'Update feed'): string => {
  if (!value.trim()) return '';
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${key} must be an absolute HTTPS directory URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${key} must be an HTTPS directory URL without credentials, query, or fragment.`);
  }
  if (/\.(?:json|dmg|zip)\/?$/i.test(url.pathname)) {
    throw new Error(`${key} must name the feed directory, not a manifest or installer file.`);
  }
  return url.toString().replace(/\/+$/, '');
};

export const getUpdateManifestUrl = (feed: string): string | null => {
  const base = normalizeUpdateFeedUrl(feed);
  return base ? `${base}/${UPDATE_MANIFEST_FILENAME}` : null;
};

/** Check before advancing any public pointer after the immutable artifact upload. */
export const assertUpdatePublicationTarget = (feed: string, artifactUrl: string): void => {
  const artifact = new URL(artifactUrl);
  const publishedManifest = `${artifact.origin}/${PRODUCT_RELEASE_DIRECTORY}/${UPDATE_MANIFEST_FILENAME}`;
  if (artifact.protocol !== 'https:' || artifact.username || artifact.password ||
      getUpdateManifestUrl(feed) !== publishedManifest) {
    throw new Error('The artifact Blob store does not match the update feed baked into the app; public pointers were not advanced.');
  }
};
