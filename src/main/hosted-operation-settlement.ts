import type { ProductPasteAcknowledgment } from '../shared/product-api.js';
import type { HostedOperationOutbox } from './hosted-operation-outbox.js';

interface HostedOperationPasteSettlement {
  operationId: string;
  outbox: HostedOperationOutbox;
  paste: () => Promise<void>;
  acknowledge: (
    operationId: string,
    acknowledgment: ProductPasteAcknowledgment
  ) => Promise<unknown>;
  background?: boolean;
  isCurrent?: () => boolean;
  onAcknowledged?: (result: unknown) => void;
  onTiming?: (phase: 'pending' | 'paste' | 'persist' | 'acknowledge', durationMs: number) => void;
}

export const settleHostedOperationPaste = async ({
  operationId,
  outbox,
  paste,
  acknowledge,
  background = false,
  isCurrent = () => true,
  onAcknowledged,
  onTiming
}: HostedOperationPasteSettlement): Promise<unknown> => {
  const generation = outbox.currentGeneration();
  const endDelivery = outbox.beginDelivery(operationId);
  try {
    const timed = async <T>(phase: 'pending' | 'paste' | 'persist' | 'acknowledge', operation: () => Promise<T>) => {
      const started = performance.now();
      try { return await operation(); }
      finally { try { onTiming?.(phase, performance.now() - started); } catch { /* diagnostics only */ } }
    };
    await timed('pending', () => outbox.rememberPending(operationId, generation));
    if (!isCurrent() || !outbox.isCurrent(generation)) throw new Error('Operation ownership changed before paste.');
    let acknowledgment: ProductPasteAcknowledgment = 'pasted';
    let pasteError: unknown;
    try {
      await timed('paste', paste);
    } catch (error) {
      acknowledgment = 'paste_failed';
      pasteError = error;
    }

    await timed('persist', () => outbox.markAcknowledgment(operationId, acknowledgment, generation));
    let acknowledgmentResult: unknown;
    const settlement = outbox.enqueueAcknowledgment(generation, async () => {
      if (!isCurrent()) return;
      try {
        acknowledgmentResult = await timed('acknowledge', () => acknowledge(operationId, acknowledgment));
        if (!isCurrent() || !outbox.isCurrent(generation)) return;
        await outbox.remove(operationId, generation);
        onAcknowledged?.(acknowledgmentResult);
      } catch {
        // Local delivery remains authoritative. The durable outbox retries later.
      }
    });
    if (background) void settlement.catch(() => undefined);
    else await settlement;

    if (pasteError) throw pasteError;
    return acknowledgmentResult;
  } finally {
    endDelivery();
  }
};
