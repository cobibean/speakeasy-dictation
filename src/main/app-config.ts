import { app } from 'electron';
import fs from 'node:fs';
import { getUpdateRehearsalPath } from './update-rehearsal.js';
import type { AppCapabilityFlags, AppEdition, ReleaseChannel } from '../shared/types.js';
import {
  selectDistributionChannel,
  shouldUseManifestUpdater,
  type DistributionChannel
} from '../shared/platform.js';
import {
  selectAppEdition,
  selectLocalDataNamespace,
  selectProductProtocolScheme,
  selectProductApiBaseUrl,
  selectPublicPageUrl,
  selectReleaseChannel,
  selectUpdateFeedUrl
} from './app-config-policy.js';

export interface AppConfig {
  appName: string;
  appVersion: string;
  buildProfile: string;
  edition: AppEdition;
  productEnvironment: 'none' | 'staging' | 'production';
  releaseChannel: ReleaseChannel;
  protocolScheme: 'speakeasy-product' | 'speakeasy-staging' | null;
  localDataNamespace: 'speakeasy' | 'speakeasy-oss' | 'speakeasy-staging';
  supportUrl: string;
  privacyUrl: string;
  productApiBaseUrl: string;
  updateFeedUrl: string;
  githubOwner: string;
  githubRepo: string;
  windowsStoreSpike: boolean;
  windowsStore: boolean;
  distribution: DistributionChannel;
  capabilities: AppCapabilityFlags;
}

interface ProductPublicConfig {
  buildProfile?: string;
  configAuthority?: 'baked' | 'development';
  edition?: AppEdition;
  productEnvironment?: 'none' | 'staging' | 'production';
  releaseChannel?: ReleaseChannel;
  windowsStoreSpike?: boolean;
  windowsStore?: boolean;
  productApiBaseUrl?: string;
  productUpdateUrl?: string;
  supportUrl?: string;
  privacyUrl?: string;
  ossUpdateUrl?: string;
}

let productPublicConfig: ProductPublicConfig | null = null;

const getProductPublicConfig = (): ProductPublicConfig => {
  if (productPublicConfig) {
    return productPublicConfig;
  }

  try {
    productPublicConfig = JSON.parse(
      fs.readFileSync(new URL('./product-public-config.json', import.meta.url), 'utf8')
    ) as ProductPublicConfig;
  } catch {
    productPublicConfig = {};
  }

  return productPublicConfig;
};

export const getAppConfig = (): AppConfig => {
  const productConfig = getProductPublicConfig();
  const isMacStaging = productConfig.buildProfile === 'mac-staging';
  const edition = selectAppEdition(productConfig, process.env);
  const windowsStoreSpike = productConfig.windowsStoreSpike === true;
  const windowsStore = productConfig.windowsStore === true || windowsStoreSpike;
  const distribution = selectDistributionChannel({
    platform: process.platform,
    packaged: app.isPackaged,
    windowsStore
  });
  const capabilities: AppCapabilityFlags =
    windowsStoreSpike
      ? {
          byoApiKey: true,
          productAuth: false,
          hostedUsage: false,
          autoUpdate: false
        }
      : edition === 'product'
      ? {
          byoApiKey: false,
          productAuth: true,
          hostedUsage: true,
          autoUpdate: (!isMacStaging || !!getUpdateRehearsalPath(productConfig.buildProfile ?? '')) && shouldUseManifestUpdater(distribution)
        }
      : {
          byoApiKey: true,
          productAuth: false,
          hostedUsage: false,
          autoUpdate: shouldUseManifestUpdater(distribution)
        };

  return {
    appName: isMacStaging ? 'speakeasy (staging)' : edition === 'product' ? 'speakeasy.' : 'speakeasy-oss',
    appVersion: app.getVersion(),
    buildProfile: productConfig.buildProfile ?? 'development',
    edition,
    productEnvironment: productConfig.productEnvironment ?? 'none',
    releaseChannel: selectReleaseChannel(productConfig, process.env),
    protocolScheme: selectProductProtocolScheme(edition, productConfig.buildProfile),
    localDataNamespace: selectLocalDataNamespace(edition, productConfig.buildProfile),
    supportUrl: selectPublicPageUrl({
      kind: 'support',
      productConfig,
      environment: process.env,
      fallback: 'https://speakeasywords.com/support'
    }),
    privacyUrl: selectPublicPageUrl({
      kind: 'privacy',
      productConfig,
      environment: process.env,
      fallback: 'https://speakeasywords.com/privacy'
    }),
    productApiBaseUrl: selectProductApiBaseUrl(productConfig, process.env),
    updateFeedUrl: selectUpdateFeedUrl({
      edition,
      productConfig,
      environment: process.env
    }),
    githubOwner: process.env.SPEAKEASY_GITHUB_OWNER ?? '',
    githubRepo: process.env.SPEAKEASY_GITHUB_REPO ?? '',
    windowsStoreSpike,
    windowsStore,
    distribution,
    capabilities
  };
};
