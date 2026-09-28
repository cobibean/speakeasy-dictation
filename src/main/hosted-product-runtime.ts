import type { AppCapabilityFlags, AppEdition } from '../shared/types.js';
import type { DistributionChannel } from '../shared/platform.js';

export interface HostedProductRuntimeSelectionInput {
  edition: AppEdition;
  capabilities: AppCapabilityFlags;
  productEnvironment: 'none' | 'staging' | 'production';
  productApiBaseUrl: string;
  platform: NodeJS.Platform;
  distribution: DistributionChannel;
}

export type HostedProductRuntimeSelection =
  | { enabled: true; kind: 'hosted-product' }
  | { enabled: false; kind: 'oss' };

const isAbsoluteHttpsOrigin = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};

/**
 * Selects the commercial lifecycle without consulting platform, distribution,
 * or packaging-profile names. Platform fields remain in the input so native
 * adapters can be selected after this Product boundary has been established.
 */
export const selectHostedProductRuntime = (
  input: HostedProductRuntimeSelectionInput
): HostedProductRuntimeSelection => {
  if (input.edition === 'oss') {
    return { enabled: false, kind: 'oss' };
  }

  if (
    !input.capabilities.productAuth ||
    !input.capabilities.hostedUsage ||
    input.capabilities.byoApiKey ||
    input.productEnvironment === 'none' ||
    !isAbsoluteHttpsOrigin(input.productApiBaseUrl)
  ) {
    throw new Error(
      'Baked Product Configuration is missing or invalid; hosted Product startup is blocked.'
    );
  }

  return { enabled: true, kind: 'hosted-product' };
};
