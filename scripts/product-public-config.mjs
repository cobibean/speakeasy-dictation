import { normalizeUpdateFeedUrl } from '../src/shared/update-feed.ts';

const W4_PROFILE = 'windows-hosted-w4';
const W5_PROFILE = 'windows-hosted-w5-production';
const W1_PROFILE = 'windows-store-spike';

const isEnabled = (environment, key) => environment[key] === '1';

const normalizeHttpsOrigin = (value, key) => {
  if (!value) {
    return '';
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be an absolute HTTPS origin.`);
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${key} must be an absolute HTTPS origin with no credentials, path, query, or fragment.`);
  }

  return url.origin;
};

const normalizeHttpsPageUrl = (value, key) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be an absolute HTTPS URL.`);
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${key} must be an absolute HTTPS URL with no credentials, query, or fragment.`
    );
  }

  return url.toString();
};

const isProductionApprovedUrl = (value) => {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  return !(
    hostname === 'speakeasyapp.app' ||
    hostname.endsWith('.speakeasyapp.app') ||
    hostname.endsWith('.vercel.app') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.invalid') ||
    hostname.endsWith('.example') ||
    hostname.endsWith('.localhost') ||
    /^[\d.]+$/.test(hostname) || hostname.includes(':') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /(^|[.-])(staging|stage|preview|dev|development|test)([.-]|$)/u.test(hostname)
  );
};

export const isWindowsHostedProductPackage = (environment = process.env) =>
  isEnabled(environment, 'SPEAKEASY_WINDOWS_HOSTED_PRODUCT_PACKAGE');

export const isWindowsW5ReleasePackage = (environment = process.env) =>
  isEnabled(environment, 'SPEAKEASY_WINDOWS_W5_RELEASE_PACKAGE');

export const getMissingProductConfigKeys = (environment = process.env) => {
  const hostedWindows = isWindowsHostedProductPackage(environment);
  const w5Release = isWindowsW5ReleasePackage(environment);
  const storeSpike = isEnabled(environment, 'SPEAKEASY_WINDOWS_STORE_SPIKE');
  const product = environment.SPEAKEASY_EDITION === 'product';

  if (storeSpike || !product) {
    return [];
  }

  const required = w5Release
    ? [
        'SPEAKEASY_PRODUCT_API_BASE_URL',
        'SPEAKEASY_SUPPORT_URL',
        'SPEAKEASY_PRIVACY_URL'
      ]
    : hostedWindows
    ? ['SPEAKEASY_PRODUCT_API_BASE_URL']
    : ['SPEAKEASY_PRODUCT_API_BASE_URL', 'SPEAKEASY_PRODUCT_UPDATE_URL',
       'SPEAKEASY_SUPPORT_URL', 'SPEAKEASY_PRIVACY_URL'];
  return required.filter((key) => !environment[key]?.trim());
};

export const createProductPublicConfig = (environment = process.env) => {
  const edition = environment.SPEAKEASY_EDITION === 'product' ? 'product' : 'oss';
  const windowsStoreSpike = isEnabled(environment, 'SPEAKEASY_WINDOWS_STORE_SPIKE');
  const hostedWindows = isWindowsHostedProductPackage(environment);
  const w5Release = isWindowsW5ReleasePackage(environment);
  if (hostedWindows && w5Release) {
    throw new Error('W4 and W5 Windows package profiles cannot be combined.');
  }
  if (w5Release && !isEnabled(environment, 'SPEAKEASY_WINDOWS_STORE')) {
    throw new Error('The W5 release package must explicitly select the Microsoft Store lane.');
  }
  const windowsStore =
    isEnabled(environment, 'SPEAKEASY_WINDOWS_STORE') ||
    windowsStoreSpike ||
    hostedWindows ||
    w5Release;
  const macProductEnvironment = environment.SPEAKEASY_PRODUCT_ENVIRONMENT === 'staging'
    ? 'staging'
    : 'production';
  const macProduct = edition === 'product' && !windowsStore;
  const reviewBaseline = isEnabled(environment, 'SPEAKEASY_MAC_REVIEW_BASELINE');
  const macStaging = isEnabled(environment, 'SPEAKEASY_MAC_STAGING');
  if (macStaging && (reviewBaseline || !macProduct || macProductEnvironment !== 'staging' ||
      environment.SPEAKEASY_RELEASE_CHANNEL !== 'preview')) {
    throw new Error('Mac staging app requires Product/staging/preview and cannot be a review probe.');
  }
  if (reviewBaseline && (!macProduct || macProductEnvironment !== 'staging' ||
      environment.SPEAKEASY_RELEASE_CHANNEL !== 'preview')) {
    throw new Error('Mac review baseline requires Product edition, staging and preview.');
  }
  if (macProduct && environment.SPEAKEASY_PRODUCT_ENVIRONMENT &&
      !['staging', 'production'].includes(environment.SPEAKEASY_PRODUCT_ENVIRONMENT)) {
    throw new Error('SPEAKEASY_PRODUCT_ENVIRONMENT must be staging or production.');
  }
  if (macProduct && macProductEnvironment === 'staging' &&
      environment.SPEAKEASY_RELEASE_CHANNEL !== 'preview') {
    throw new Error('A staging Mac Product must use the preview release channel.');
  }

  const productApiBaseUrl =
    windowsStoreSpike || edition !== 'product'
      ? ''
      : normalizeHttpsOrigin(
          environment.SPEAKEASY_PRODUCT_API_BASE_URL ?? '',
          'SPEAKEASY_PRODUCT_API_BASE_URL'
        );
  const productUpdateUrl =
    windowsStore || edition !== 'product'
      ? ''
      : normalizeUpdateFeedUrl(
          environment.SPEAKEASY_PRODUCT_UPDATE_URL ?? '',
          'SPEAKEASY_PRODUCT_UPDATE_URL'
        );
  const ossUpdateUrl =
    edition === 'oss'
      ? normalizeUpdateFeedUrl(
          environment.SPEAKEASY_OSS_UPDATE_URL ?? '',
          'SPEAKEASY_OSS_UPDATE_URL'
        )
        : '';

  if (macStaging && (productApiBaseUrl !== 'https://api-staging.speakeasywords.com' ||
      !productUpdateUrl.endsWith('/preview'))) {
    throw new Error('Mac staging app requires the dedicated staging API and preview feed.');
  }

  const supportUrl = w5Release || macProduct
    ? normalizeHttpsPageUrl(environment.SPEAKEASY_SUPPORT_URL ?? '', 'SPEAKEASY_SUPPORT_URL')
    : '';
  const privacyUrl = w5Release || macProduct
    ? normalizeHttpsPageUrl(environment.SPEAKEASY_PRIVACY_URL ?? '', 'SPEAKEASY_PRIVACY_URL')
    : '';
  if (
    w5Release &&
    ![productApiBaseUrl, supportUrl, privacyUrl].every(isProductionApprovedUrl)
  ) {
    throw new Error(
      'W5 public configuration must use production-approved URLs; legacy, staging, preview, local, test, and vercel.app hosts are rejected.'
    );
  }

  if (macProduct && macProductEnvironment === 'production' &&
      ![productApiBaseUrl, productUpdateUrl, supportUrl, privacyUrl].every(
        (value) => value && isProductionApprovedUrl(value))) {
    throw new Error('Mac production configuration requires production-approved API, update, support and privacy URLs; legacy, staging, preview and local/test hosts are rejected.');
  }

  const config = {
    buildProfile: w5Release
      ? W5_PROFILE
      : hostedWindows
      ? W4_PROFILE
      : windowsStoreSpike
        ? W1_PROFILE
        : edition === 'product'
          ? reviewBaseline ? 'mac-review-baseline' : macStaging ? 'mac-staging' : 'mac-product'
          : 'oss',
    configAuthority: 'baked',
    edition,
    productEnvironment: w5Release
      ? 'production'
      : windowsStoreSpike
        ? 'none'
        : hostedWindows
          ? 'staging'
          : edition === 'product'
            ? macProductEnvironment
            : 'none',
    releaseChannel:
      w5Release ||
      hostedWindows ||
      windowsStoreSpike ||
      environment.SPEAKEASY_RELEASE_CHANNEL === 'preview'
        ? 'preview'
        : 'stable',
    windowsStoreSpike,
    windowsStore,
    productApiBaseUrl,
    productUpdateUrl,
    ossUpdateUrl
  };

  return w5Release || macProduct ? { ...config, supportUrl, privacyUrl } : config;
};

export const assertMacProductPublicationConfig = (config) => {
  if (config?.configAuthority !== 'baked' || config.edition !== 'product' ||
      config.buildProfile !== 'mac-product' || config.productEnvironment !== 'production' ||
      config.releaseChannel !== 'stable') {
    throw new Error('Public Product publication requires a baked production/stable Mac Product, never a staging or review probe.');
  }
  createProductPublicConfig({
    SPEAKEASY_EDITION: 'product',
    SPEAKEASY_PRODUCT_API_BASE_URL: config.productApiBaseUrl,
    SPEAKEASY_PRODUCT_UPDATE_URL: config.productUpdateUrl,
    SPEAKEASY_SUPPORT_URL: config.supportUrl,
    SPEAKEASY_PRIVACY_URL: config.privacyUrl
  });
};
