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
}

export const settleHostedOperationPaste = async ({
  operationId,
  outbox,
  paste,
  acknowledge
}: HostedOperationPasteSettlement): Promise<unknown> => {
  await outbox.rememberPending(operationId);
  let acknowledgment: ProductPasteAcknowledgment = 'pasted';
  let pasteError: unknown;
  try {
    await paste();
  } catch (error) {
    acknowledgment = 'paste_failed';
    pasteError = error;
  }

  await outbox.markAcknowledgment(operationId, acknowledgment);
  let acknowledgmentResult: unknown;
  try {
    acknowledgmentResult = await acknowledge(operationId, acknowledgment);
    await outbox.remove(operationId);
  } catch {
    // Local delivery remains authoritative. The durable outbox retries later.
  }

  if (pasteError) throw pasteError;
  return acknowledgmentResult;
};
