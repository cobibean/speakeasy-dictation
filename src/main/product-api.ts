import { supportLog, supportFailure } from './support-logger.js';
import { app } from 'electron';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { getAppConfig } from './app-config.js';
import { SpeakeasyError, toErrorCode } from './errors.js';
import { mapHostedError } from './hosted-product-errors.js';
import { getStore } from './store.js';
import { getProductAccessToken } from './product-auth.js';
import { getProductSecureStore } from './product-secure-storage.js';
import {
  HostedProductClient,
  HostedProductHttpError,
  HOSTED_CONTRACT_HEADER,
  HOSTED_CONTRACT_VERSION
} from './hosted-product-client.js';
import { getHostedOperationOutbox } from './product-operation-outbox.js';
import type {
  ProductOperationAcknowledgmentResponse,
  ProductOperationStatusResponse,
  ProductBillingReturnResponse,
  ProductConsentSnapshot,
  ProductPasteAcknowledgment,
  ProductSessionBootstrapResponse,
  ProductSetupProgressResponse,
  ProductSetupReviewResponse,
  ProductSupportReceipt,
  ProductSupportSubmission,
  ProductAccountDeletionResponse,
  ProductTranscriptionRequest,
  ProductTranscriptionResponse,
  ProductUsageSnapshot
} from '../shared/product-api.js';
import type { PrivacySafeSupportEvidence } from '../shared/support-evidence.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const PENDING_DELETION_KEY = 'pendingDeletionEncrypted';

interface PendingDeletionRecovery {
  transactionId: string;
  recoveryToken: string;
}

/** fetch wrapped in an AbortController timeout. Item 8. */
const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const assertConfigured = (): void => {
  const config = getAppConfig();
  if (!config.productApiBaseUrl) {
    throw new SpeakeasyError('activation-required', 'The product API is not configured for this build.');
  }
};

const getHeaders = async (): Promise<HeadersInit> => {
  const accessToken = await getProductAccessToken();
  return {
    Authorization: `Bearer ${accessToken}`
  };
};

const createHostedClient = (): HostedProductClient => {
  const config = getAppConfig();
  assertConfigured();
  return new HostedProductClient({
    baseUrl: config.productApiBaseUrl!,
    getAccessToken: getProductAccessToken,
    appVersion: app.getVersion(),
    osVersion: `${os.type()} ${os.release()}`,
    releaseChannel: config.releaseChannel,
    onRequest: ({ error, ...details }) => error
      ? supportFailure('http.failed', error, details)
      : supportLog('http.completed', details)
  });
};


export const bootstrapProductSession = async (): Promise<ProductSessionBootstrapResponse> => {
  try {
    return await createHostedClient().bootstrap(getStore().get('deviceId'));
  } catch (error) {
    throw mapHostedError(error, 'auth-failed', 'Unable to bootstrap the product session.');
  }
};

export const advanceHostedProductSetup = async (
  setupId: string,
  completedStep: number
): Promise<ProductSetupProgressResponse> => {
  try {
    return await createHostedClient().advanceSetup(
      getStore().get('deviceId'),
      setupId,
      completedStep
    );
  } catch (error) {
    throw mapHostedError(error, 'auth-failed', 'Unable to save setup progress.');
  }
};

export const renewHostedProductSetupPractice = async (
  setupId: string
): Promise<ProductSetupReviewResponse> => {
  try {
    return await createHostedClient().renewSetupPractice(
      getStore().get('deviceId'),
      setupId
    );
  } catch (error) {
    throw mapHostedError(error, 'auth-failed', 'Unable to prepare on-the-house Setup Practice.');
  }
};

export const fetchProductUsage = async (): Promise<ProductUsageSnapshot> => {
  try {
    return await createHostedClient().usage();
  } catch (error) {
    throw mapHostedError(error, 'auth-failed', 'Unable to load product usage.');
  }
};

export const fetchHostedConsent = async (): Promise<ProductConsentSnapshot> =>
  createHostedClient().consent();

export const recordHostedProcessingConsent = async (
  action: 'accepted' | 'withdrawn',
  source: 'onboarding' | 'settings'
): Promise<ProductConsentSnapshot> => createHostedClient().recordConsent(action, source);

export const submitHostedSupportRequest = async (
  payload: ProductSupportSubmission,
  diagnostics: PrivacySafeSupportEvidence
): Promise<ProductSupportReceipt> => {
  try {
    const response = await createHostedClient().submitSupport(
      { ...payload, diagnostics },
      randomUUID()
    );
    return response.receipt;
  } catch (error) {
    throw mapHostedError(error, 'auth-failed', 'Unable to submit the support request.');
  }
};

export const fetchHostedSupportStatuses = async (): Promise<ProductSupportReceipt[]> => {
  try {
    return (await createHostedClient().supportStatuses()).tickets;
  } catch (error) {
    throw mapHostedError(error, 'auth-failed', 'Unable to load support status.');
  }
};

const parseDeletionResponse = async (
  response: Response
): Promise<ProductAccountDeletionResponse> => {
  const body = await response.json() as {
    contractVersion?: unknown;
    status?: unknown;
    providerCleanup?: unknown;
    receipt?: unknown;
    deletion?: PendingDeletionRecovery & { status?: unknown };
    error?: { message?: unknown };
  };
  if (response.status === 503 && body.deletion?.transactionId && body.deletion.recoveryToken) {
    await getProductSecureStore().write(PENDING_DELETION_KEY, {
      transactionId: body.deletion.transactionId,
      recoveryToken: body.deletion.recoveryToken
    });
    throw new SpeakeasyError(
      'activation-required',
      typeof body.error?.message === 'string'
        ? body.error.message
        : 'Account access is blocked. Retry deletion cleanup from this app.'
    );
  }
  if (!response.ok) {
    throw new SpeakeasyError(
      response.status === 409 ? 'auth-required' : 'activation-required',
      typeof body.error?.message === 'string'
        ? body.error.message
        : 'Account deletion could not be completed.'
    );
  }
  if (
    body.contractVersion !== HOSTED_CONTRACT_VERSION ||
    body.status !== 'completed' ||
    (body.providerCleanup !== 'accepted' && body.providerCleanup !== 'hold') ||
    typeof body.receipt !== 'string'
  ) {
    throw new SpeakeasyError('activation-required', 'Account deletion returned an invalid receipt.');
  }
  await getProductSecureStore().delete(PENDING_DELETION_KEY);
  return body as ProductAccountDeletionResponse;
};

export const deleteHostedProductAccount = async (
  confirmation: string
): Promise<ProductAccountDeletionResponse> => {
  const secureStore = getProductSecureStore();
  await secureStore.write('__deletionProbe', { at: Date.now() });
  await secureStore.delete('__deletionProbe');
  const config = getAppConfig();
  assertConfigured();
  const response = await fetchWithTimeout(
    `${config.productApiBaseUrl}/v1/account/deletion`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        [HOSTED_CONTRACT_HEADER]: HOSTED_CONTRACT_VERSION,
        ...(await getHeaders())
      },
      body: JSON.stringify({ confirmation })
    },
    DEFAULT_TIMEOUT_MS
  );
  return parseDeletionResponse(response);
};

export const hasPendingHostedAccountDeletion = async (): Promise<boolean> =>
  Boolean(await getProductSecureStore().read<PendingDeletionRecovery>(PENDING_DELETION_KEY));

export const retryHostedProductAccountDeletion = async (): Promise<ProductAccountDeletionResponse> => {
  const pending = await getProductSecureStore().read<PendingDeletionRecovery>(PENDING_DELETION_KEY);
  if (!pending) {
    throw new SpeakeasyError('activation-required', 'No pending account deletion was found on this device.');
  }
  const config = getAppConfig();
  assertConfigured();
  const response = await fetchWithTimeout(
    `${config.productApiBaseUrl}/v1/account/deletion/retry`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [HOSTED_CONTRACT_HEADER]: HOSTED_CONTRACT_VERSION
      },
      body: JSON.stringify(pending)
    },
    DEFAULT_TIMEOUT_MS
  );
  return parseDeletionResponse(response);
};

export const requestHostedTranscription = async (
  payload: ProductTranscriptionRequest
): Promise<ProductTranscriptionResponse> => {
  try {
    if (!payload.operationId) {
      throw new Error('Hosted transcription requires a stable operation ID.');
    }
    return await createHostedClient().transcribe({ ...payload, operationId: payload.operationId });
  } catch (error) {
    throw mapHostedError(error, 'transcription-failed', 'Hosted transcription failed.');
  }
};

export const acknowledgeHostedOperation = async (
  operationId: string,
  acknowledgment: ProductPasteAcknowledgment
): Promise<ProductOperationAcknowledgmentResponse> =>
  createHostedClient().acknowledge(operationId, acknowledgment);

export const getHostedOperationStatus = async (
  operationId: string
): Promise<ProductOperationStatusResponse> => createHostedClient().status(operationId);

export const reconcileHostedOperationOutbox = async (): Promise<void> => {
  const client = createHostedClient();
  await getHostedOperationOutbox().reconcile({
    status: async (operationId) => {
      try {
        return await client.status(operationId);
      } catch (error) {
        if (error instanceof HostedProductHttpError && error.status === 404) {
          return { operationId, operationStatus: 'released' };
        }
        throw error;
      }
    },
    acknowledge: async (operationId, acknowledgment) => {
      try {
        return await client.acknowledge(operationId, acknowledgment);
      } catch (error) {
        if (error instanceof HostedProductHttpError && error.status === 410) return;
        throw error;
      }
    }
  });
};

/**
 * Create a Stripe Checkout session for `plan` and return its URL. The caller
 * (main process) opens it in the user's browser.
 */
export const requestCheckoutUrl = async (
  plan: 'starter' | 'standard' | 'pro'
): Promise<string> => {
  const config = getAppConfig();
  assertConfigured();
  try {
    const response = await fetchWithTimeout(
      `${config.productApiBaseUrl}/v1/billing/checkout`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
          ...(await getHeaders())
        },
        body: JSON.stringify({ plan })
      },
      DEFAULT_TIMEOUT_MS
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const { url } = (await response.json()) as { url?: string };
    if (!url) {
      throw new SpeakeasyError('activation-required', 'Checkout is unavailable right now.');
    }
    return url;
  } catch (error) {
    if (error instanceof SpeakeasyError) {
      throw error;
    }
    throw new SpeakeasyError(toErrorCode(error, 'activation-required'), 'Unable to start checkout.', error);
  }
};

/** Return a Stripe billing-portal URL so the user can manage their subscription. */
export const requestPortalUrl = async (): Promise<string> => {
  const config = getAppConfig();
  assertConfigured();
  try {
    const response = await fetchWithTimeout(
      `${config.productApiBaseUrl}/v1/billing/portal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getHeaders()) },
        body: JSON.stringify({})
      },
      DEFAULT_TIMEOUT_MS
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const { url } = (await response.json()) as { url?: string };
    if (!url) {
      throw new SpeakeasyError('activation-required', 'The billing portal is unavailable right now.');
    }
    return url;
  } catch (error) {
    if (error instanceof SpeakeasyError) {
      throw error;
    }
    throw new SpeakeasyError(toErrorCode(error, 'activation-required'), 'Unable to open the billing portal.', error);
  }
};

export const consumeHostedBillingReturn = async (
  transactionId: string
): Promise<ProductBillingReturnResponse> => {
  try {
    return await createHostedClient().consumeBillingReturn(transactionId);
  } catch (error) {
    throw mapHostedError(
      error,
      'auth-failed',
      'Unable to refresh the Billing Return.'
    );
  }
};
