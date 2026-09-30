import { randomUUID } from 'node:crypto';
import { getAppConfig } from './app-config.js';
import { selectStreamingUrl } from './app-config-policy.js';
import { getStore } from './store.js';
import { getProductAccessToken } from './product-auth.js';
import { getHostedOperationOutbox } from './product-operation-outbox.js';
import { StreamingTransport } from './streaming-transport.js';
import { SpeakeasyError } from './errors.js';
import { supportLog } from './support-logger.js';
import type { ServiceCaptureInput } from './providers/types.js';

const captures = new Map<string, StreamingTransport>();
export function beginStreamingCapture(captureId: string): boolean {
  const config = getAppConfig();
  const url = selectStreamingUrl(config, process.argv);
  if (!url) return false;
  if (captures.size) throw new SpeakeasyError('transcription-failed', 'Another live capture is active.');
  const operationId = randomUUID(), settings = getStore();
  const transport = new StreamingTransport(url, async () => {
    await getHostedOperationOutbox().rememberPending(operationId);
    return getProductAccessToken();
  }, { operationId, deviceId: settings.get('deviceId'), polishBeforePaste: settings.get('polishBeforePaste'), cleanupStrength: settings.get('cleanupStrength') });
  captures.set(captureId, transport);
  supportLog('capture.operation', { captureId, operationId, stage: 'streaming' });
  return true;
}
export function appendStreamingCapture(captureId: string, chunk: ArrayBuffer): boolean { return captures.get(captureId)?.append(chunk) ?? false; }
export function cancelStreamingCapture(captureId: string): void { captures.get(captureId)?.cancel(); captures.delete(captureId); }
export function cancelAllStreamingCaptures(): void { for (const id of captures.keys()) cancelStreamingCapture(id); }
export async function completeStreamingCapture(input: ServiceCaptureInput) {
  const session = captures.get(input.captureId);
  if (!session) throw new SpeakeasyError('transcription-failed', 'The live capture was canceled.');
  session.onPolishing = input.onPolishing;
  try { return await session.finish(); }
  finally { captures.delete(input.captureId); }
}
