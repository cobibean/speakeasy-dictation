import { parseCleanupOutcome } from '../shared/cleanup-outcome.js';
import { audioFilenameForMimeType } from './audio-format.js';
import {
  parseServerTimingHeader,
  selectServerTimingHeader
} from '../shared/server-timing.js';
import type {
  ProductOperationAcknowledgmentResponse,
  ProductOperationStatusResponse,
  ProductBillingReturnResponse,
  ProductConsentSnapshot,
  ProductPasteAcknowledgment,
  ProductSessionBootstrapResponse,
  ProductSetupProgressResponse,
  ProductSetupReviewResponse,
  ProductSupportResponse,
  ProductSupportStatusResponse,
  ProductSupportSubmission,
  ProductTranscriptionRequest,
  ProductTranscriptionResponse,
  ProductUsageSnapshot
} from '../shared/product-api.js';
import { CURRENT_HOSTED_PROCESSING_CONSENT_VERSION } from '../shared/setup-bootstrap.js';

export const HOSTED_CONTRACT_VERSION = '2026-07-29.w3.5.v1' as const;
export const HOSTED_CONTRACT_HEADER = 'x-speakeasy-contract-version' as const;
export const HOSTED_OPERATION_HEADER = 'x-speakeasy-operation-id' as const;
export const HOSTED_PROCESSING_CONSENT_VERSION =
  CURRENT_HOSTED_PROCESSING_CONSENT_VERSION;

const DEFAULT_TIMEOUT_MS = 15_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;

export class HostedProductContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostedProductContractError';
  }
}

export class HostedProductHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly correlationId = '',
    public readonly stage = '',
    public readonly serverTiming = {}
  ) {
    super(message);
    this.name = 'HostedProductHttpError';
  }
}

export interface HostedProductClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
  appVersion: string;
  osVersion: string;
  releaseChannel: string;
  fetchImpl?: typeof fetch;
  onRequest?: (details: { route: string; durationMs: number; status?: number; operationId?: string; error?: unknown }) => void;
}

type VersionedResponse = { contractVersion?: unknown; operationId?: unknown };

const assertContract = (value: unknown, expectedOperationId?: string): void => {
  if (!value || typeof value !== 'object') {
    throw new HostedProductContractError('Hosted API returned an invalid response.');
  }
  const response = value as VersionedResponse;
  if (response.contractVersion !== HOSTED_CONTRACT_VERSION) {
    throw new HostedProductContractError(
      `Hosted API did not confirm contract ${HOSTED_CONTRACT_VERSION}.`
    );
  }
  if (expectedOperationId && response.operationId !== expectedOperationId) {
    throw new HostedProductContractError('Hosted API returned a different operation ID.');
  }
};

const readError = async (response: Response): Promise<HostedProductHttpError> => {
  let code = 'hosted-request-failed';
  let message = `Hosted request failed with status ${response.status}.`;
  let correlationId = response.headers.get('x-speakeasy-correlation-id') ?? '';
  try {
    const body = (await response.json()) as {
      error?: { code?: unknown; message?: unknown; correlationId?: unknown };
    };
    if (typeof body.error?.code === 'string') code = body.error.code;
    if (typeof body.error?.message === 'string') message = body.error.message;
    if (typeof body.error?.correlationId === 'string') {
      correlationId = body.error.correlationId;
    }
  } catch {
    // The status remains authoritative when the error body is unavailable.
  }
  const safeCorrelationId = /^[A-Za-z0-9-]{8,64}$/u.test(correlationId)
    ? correlationId
    : '';
  return new HostedProductHttpError(response.status, code, message, safeCorrelationId,
    response.headers.get('x-speakeasy-error-stage') ?? '',
    parseServerTimingHeader(selectServerTimingHeader(response.headers)));
};

export class HostedProductClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HostedProductClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async bootstrap(deviceId: string): Promise<ProductSessionBootstrapResponse> {
    return this.requestVersioned<ProductSessionBootstrapResponse>('/v1/session/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        appVersion: this.options.appVersion,
        osVersion: this.options.osVersion,
        releaseChannel: this.options.releaseChannel
      })
    });
  }

  async advanceSetup(
    deviceId: string,
    setupId: string,
    completedStep: number
  ): Promise<ProductSetupProgressResponse> {
    return this.requestVersioned<ProductSetupProgressResponse>('/v1/setup/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, setupId, completedStep })
    });
  }

  async renewSetupPractice(
    deviceId: string,
    setupId: string
  ): Promise<ProductSetupReviewResponse> {
    return this.requestVersioned<ProductSetupReviewResponse>('/v1/setup/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, setupId })
    });
  }

  async usage(): Promise<ProductUsageSnapshot> {
    return this.requestVersioned<ProductUsageSnapshot>('/v1/usage');
  }

  async consent(): Promise<ProductConsentSnapshot> {
    return this.requestVersioned<ProductConsentSnapshot>('/v1/consent');
  }

  async recordConsent(
    action: 'accepted' | 'withdrawn',
    source: 'onboarding' | 'settings'
  ): Promise<ProductConsentSnapshot> {
    return this.requestVersioned<ProductConsentSnapshot>('/v1/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        source,
        consentVersion: HOSTED_PROCESSING_CONSENT_VERSION,
        appVersion: this.options.appVersion
      })
    });
  }

  async submitSupport(
    payload: ProductSupportSubmission & { diagnostics: unknown },
    idempotencyKey: string
  ): Promise<ProductSupportResponse> {
    return this.requestVersioned<ProductSupportResponse>('/v1/support', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(payload)
    });
  }

  async supportStatuses(): Promise<ProductSupportStatusResponse> {
    return this.requestVersioned<ProductSupportStatusResponse>('/v1/support');
  }

  async consumeBillingReturn(
    transactionId: string
  ): Promise<ProductBillingReturnResponse> {
    return this.requestVersioned<ProductBillingReturnResponse>(
      '/v1/billing/return/consume',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId })
      }
    );
  }

  async transcribe(
    payload: ProductTranscriptionRequest & { operationId: string }
  ): Promise<ProductTranscriptionResponse> {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([payload.audioBuffer], { type: payload.mimeType }),
      audioFilenameForMimeType(payload.mimeType)
    );
    formData.append('durationMs', String(payload.durationMs));
    formData.append('polishBeforePaste', String(payload.polishBeforePaste));
    formData.append('cleanupStrength', payload.cleanupStrength);
    formData.append('deviceId', payload.deviceId);
    formData.append('appVersion', this.options.appVersion);
    formData.append('osVersion', this.options.osVersion);
    formData.append('releaseChannel', this.options.releaseChannel);
    formData.append('operationId', payload.operationId);
    formData.append('operationContext', payload.operationContext ?? 'dictation');
    formData.append(
      'normalAllowanceConfirmed',
      String(payload.normalAllowanceConfirmed ?? false)
    );

    const response = await this.request('/v1/transcribe', {
      method: 'POST',
      headers: {
        [HOSTED_OPERATION_HEADER]: payload.operationId,
        'Idempotency-Key': payload.operationId
      },
      body: formData
    }, TRANSCRIBE_TIMEOUT_MS);
    const result = (await response.json()) as ProductTranscriptionResponse;
    assertContract(result, payload.operationId);
    const parsedServerTiming = parseServerTimingHeader(
      selectServerTimingHeader(response.headers)
    );
    return {
      ...result,
      cleanupOutcome: parseCleanupOutcome(result.cleanupOutcome),
      ...(Object.keys(parsedServerTiming).length > 0
        ? { serverTiming: parsedServerTiming }
        : {})
    };
  }

  async acknowledge(
    operationId: string,
    acknowledgment: ProductPasteAcknowledgment
  ): Promise<ProductOperationAcknowledgmentResponse> {
    return this.requestVersioned<ProductOperationAcknowledgmentResponse>(
      '/v1/operations/ack',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId, acknowledgment })
      },
      DEFAULT_TIMEOUT_MS,
      operationId
    );
  }

  async status(operationId: string): Promise<ProductOperationStatusResponse> {
    return this.requestVersioned<ProductOperationStatusResponse>(
      `/v1/operations/status?operationId=${encodeURIComponent(operationId)}`,
      undefined,
      DEFAULT_TIMEOUT_MS,
      operationId
    );
  }

  private async requestVersioned<T>(
    path: string,
    init?: RequestInit,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    expectedOperationId?: string
  ): Promise<T> {
    const response = await this.request(path, init, timeoutMs);
    const result = (await response.json()) as T;
    assertContract(result, expectedOperationId);
    return result;
  }

  private async request(
    path: string,
    init: RequestInit = {},
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<Response> {
    const started = performance.now();
    let status: number | undefined;
    let failure: unknown;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const accessToken = await this.options.getAccessToken();
      const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          [HOSTED_CONTRACT_HEADER]: HOSTED_CONTRACT_VERSION,
          ...init.headers
        },
        signal: controller.signal
      });
      status = response.status;
      if (!response.ok) throw await readError(response);
      return response;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      clearTimeout(timeout);
      try {
        this.options.onRequest?.({ route: path, durationMs: performance.now() - started, status,
          operationId: new Headers(init.headers).get(HOSTED_OPERATION_HEADER) ?? undefined, error: failure });
      } catch { /* Observability must not alter requests. */ }
    }
  }
}
