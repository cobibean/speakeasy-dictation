import { supportLog } from '../support-logger.js';
import { requestHostedTranscription } from '../product-api.js';
import { randomUUID } from 'node:crypto';
import { getStore } from '../store.js';
import type { DictationService, ServiceCaptureInput, ServiceCaptureResult } from '../providers/types.js';

export class ProductDictationService implements DictationService {
  async processCapture(input: ServiceCaptureInput): Promise<ServiceCaptureResult> {
    const operationId = randomUUID();
    supportLog('capture.operation', { captureId: input.captureId, operationId });
    const result = await requestHostedTranscription({
      ...input,
      deviceId: getStore().get('deviceId'),
      operationId,
      operationContext: input.operationContext ?? 'dictation',
      normalAllowanceConfirmed: input.normalAllowanceConfirmed
    });

    return {
      text: result.text,
      cleanupOutcome: result.cleanupOutcome,
      usage: result.usage,
      operationId: result.operationId,
      contractVersion: result.contractVersion,
      ...(result.serverTiming ? { serverTiming: result.serverTiming } : {})
    };
  }
}
