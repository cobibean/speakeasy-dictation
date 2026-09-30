import type { AppEdition, ReleaseChannel } from '../shared/types.js';

export interface RuntimeProductConfig {
  buildProfile?: string;
  configAuthority?: 'baked' | 'development';
  edition?: AppEdition;
  productEnvironment?: 'none' | 'staging' | 'production';
  releaseChannel?: ReleaseChannel;
  productApiBaseUrl?: string;
  productUpdateUrl?: string;
  supportUrl?: string;
  privacyUrl?: string;
  ossUpdateUrl?: string;
}

export interface RuntimeConfigEnvironment {
  [key: string]: string | undefined;
  SPEAKEASY_EDITION?: string;
  SPEAKEASY_PRODUCT_API_BASE_URL?: string;
  SPEAKEASY_PRODUCT_UPDATE_URL?: string;
  SPEAKEASY_OSS_UPDATE_URL?: string;
  SPEAKEASY_SUPPORT_URL?: string;
  SPEAKEASY_PRIVACY_URL?: string;
  SPEAKEASY_RELEASE_CHANNEL?: string;
}

/** Streaming uses the canonical service for the baked Mac Product environment. */
export const selectStreamingUrl = (config: RuntimeProductConfig, argv: readonly string[]): string | null => {
  if (config.edition !== 'product' || argv.includes('--dictation-provider=groq')) return null;
  if (config.buildProfile === 'mac-staging' && config.productEnvironment === 'staging'
    && config.productApiBaseUrl === 'https://api-staging.speakeasywords.com') {
    return 'wss://api-staging.speakeasywords.com/v1/stream';
  }
  if (config.buildProfile === 'mac-product' && config.productEnvironment === 'production'
    && config.releaseChannel === 'stable' && config.productApiBaseUrl === 'https://api.speakeasywords.com') {
    return 'wss://api.speakeasywords.com/v1/stream';
  }
  return null;
};

export const isWindowsHostedProfile = (
  productConfig: RuntimeProductConfig
): boolean =>
  productConfig.buildProfile === 'windows-hosted-w4' ||
  productConfig.buildProfile === 'windows-hosted-w5-production';

export const hasBakedConfigAuthority = (
  productConfig: RuntimeProductConfig
): boolean => productConfig.configAuthority === 'baked';

export const selectLocalDataNamespace = (
  edition: AppEdition,
  buildProfile?: string
): 'speakeasy' | 'speakeasy-oss' | 'speakeasy-staging' =>
  edition === 'product' ? buildProfile === 'mac-staging' ? 'speakeasy-staging' : 'speakeasy' : 'speakeasy-oss';

export const selectProductProtocolScheme = (
  edition: AppEdition,
  buildProfile?: string
): 'speakeasy-product' | 'speakeasy-staging' | null =>
  edition !== 'product' || buildProfile === 'mac-review-baseline'
    ? null : buildProfile === 'mac-staging' ? 'speakeasy-staging' : 'speakeasy-product';

export const selectAppEdition = (
  productConfig: RuntimeProductConfig,
  environment: RuntimeConfigEnvironment
): AppEdition => {
  if (hasBakedConfigAuthority(productConfig)) {
    return productConfig.edition === 'product' ? 'product' : 'oss';
  }

  if (environment.SPEAKEASY_EDITION === 'product' || environment.SPEAKEASY_EDITION === 'oss') {
    return environment.SPEAKEASY_EDITION;
  }

  return productConfig.edition === 'product' ? 'product' : 'oss';
};

export const selectProductApiBaseUrl = (
  productConfig: RuntimeProductConfig,
  environment: RuntimeConfigEnvironment
): string =>
  hasBakedConfigAuthority(productConfig)
    ? productConfig.productApiBaseUrl ?? ''
    : environment.SPEAKEASY_PRODUCT_API_BASE_URL ?? productConfig.productApiBaseUrl ?? '';

export const selectReleaseChannel = (
  productConfig: RuntimeProductConfig,
  environment: RuntimeConfigEnvironment
): ReleaseChannel => {
  if (hasBakedConfigAuthority(productConfig)) {
    return productConfig.releaseChannel === 'preview' ? 'preview' : 'stable';
  }
  return environment.SPEAKEASY_RELEASE_CHANNEL === 'preview' ||
    productConfig.releaseChannel === 'preview'
    ? 'preview'
    : 'stable';
};

export const selectUpdateFeedUrl = ({
  edition,
  productConfig,
  environment
}: {
  edition: AppEdition;
  productConfig: RuntimeProductConfig;
  environment: RuntimeConfigEnvironment;
}): string => {
  if (hasBakedConfigAuthority(productConfig)) {
    return edition === 'product'
      ? productConfig.productUpdateUrl ?? ''
      : productConfig.ossUpdateUrl ?? '';
  }

  return edition === 'product'
    ? environment.SPEAKEASY_PRODUCT_UPDATE_URL ?? productConfig.productUpdateUrl ?? ''
    : environment.SPEAKEASY_OSS_UPDATE_URL ?? '';
};

export const selectPublicPageUrl = ({
  kind,
  productConfig,
  environment,
  fallback
}: {
  kind: 'support' | 'privacy';
  productConfig: RuntimeProductConfig;
  environment: RuntimeConfigEnvironment;
  fallback: string;
}): string => {
  const baked = kind === 'support' ? productConfig.supportUrl : productConfig.privacyUrl;
  if (hasBakedConfigAuthority(productConfig) && !(
    productConfig.buildProfile === 'windows-hosted-w4' ||
    productConfig.buildProfile === 'windows-store-spike'
  )) {
    // A baked Product must never silently use an old domain or shell override.
    return baked ?? (productConfig.edition === 'product' ? '' : fallback);
  }

  const environmentValue =
    kind === 'support'
      ? environment.SPEAKEASY_SUPPORT_URL
      : environment.SPEAKEASY_PRIVACY_URL;
  return environmentValue ?? baked ?? fallback;
};
