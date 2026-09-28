import type { ProductBillingReturnResponse } from './product-api.js';

export const isBillingReturnConfirmed = (
  action: ProductBillingReturnResponse['action'],
  requestedPlan: ProductBillingReturnResponse['requestedPlan'],
  confirmedPlan: 'free' | 'standard' | 'pro'
): boolean => action === 'portal' || requestedPlan === confirmedPlan;
