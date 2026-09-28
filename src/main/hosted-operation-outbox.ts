import type { ProductPasteAcknowledgment } from '../shared/product-api.js';

export type HostedOperationLocalResult = 'pending' | ProductPasteAcknowledgment;

export interface HostedOperationOutboxEntry {
  operationId: string;
  localResult: HostedOperationLocalResult;
}

export interface HostedOperationOutboxStorage {
  read: () => Promise<string>;
  write: (value: string) => Promise<void>;
  clear: () => Promise<void>;
}

export interface HostedOperationReconciler {
  status: (operationId: string) => Promise<{
    operationId: string;
    operationStatus: 'reserved' | 'transcribed' | 'committed' | 'released' | 'expired';
  }>;
  acknowledge: (
    operationId: string,
    acknowledgment: ProductPasteAcknowledgment
  ) => Promise<unknown>;
}

const operationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const localResults = new Set<HostedOperationLocalResult>([
  'pending',
  'pasted',
  'paste_failed',
  'discarded'
]);

const parseEntries = (serialized: string): HostedOperationOutboxEntry[] => {
  if (!serialized) return [];
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is HostedOperationOutboxEntry =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        Object.keys(entry).length === 2 &&
        typeof (entry as HostedOperationOutboxEntry).operationId === 'string' &&
        operationIdPattern.test((entry as HostedOperationOutboxEntry).operationId) &&
        localResults.has((entry as HostedOperationOutboxEntry).localResult)
    );
  } catch {
    return [];
  }
};

export class HostedOperationOutbox {
  constructor(private readonly storage: HostedOperationOutboxStorage) {}

  async list(): Promise<HostedOperationOutboxEntry[]> {
    return parseEntries(await this.storage.read());
  }

  async rememberPending(operationId: string): Promise<void> {
    if (!operationIdPattern.test(operationId)) {
      throw new Error('A valid operation ID is required.');
    }
    const entries = await this.list();
    if (entries.some((entry) => entry.operationId === operationId)) return;
    await this.storage.write(JSON.stringify([...entries, { operationId, localResult: 'pending' }]));
  }

  async markAcknowledgment(
    operationId: string,
    acknowledgment: ProductPasteAcknowledgment
  ): Promise<void> {
    const entries = await this.list();
    const next = entries.map((entry) =>
      entry.operationId === operationId
        ? { operationId, localResult: acknowledgment }
        : entry
    );
    if (!next.some((entry) => entry.operationId === operationId)) {
      next.push({ operationId, localResult: acknowledgment });
    }
    await this.storage.write(JSON.stringify(next));
  }

  async remove(operationId: string): Promise<void> {
    const entries = (await this.list()).filter((entry) => entry.operationId !== operationId);
    if (entries.length === 0) {
      await this.storage.clear();
    } else {
      await this.storage.write(JSON.stringify(entries));
    }
  }

  async clear(): Promise<void> {
    await this.storage.clear();
  }

  async reconcile(reconciler: HostedOperationReconciler): Promise<{
    acknowledged: number;
    retained: number;
    removed: number;
  }> {
    let acknowledged = 0;
    let removed = 0;
    for (const entry of await this.list()) {
      try {
        const status = await reconciler.status(entry.operationId);
        if (
          status.operationStatus === 'committed' ||
          status.operationStatus === 'released' ||
          status.operationStatus === 'expired'
        ) {
          await this.remove(entry.operationId);
          removed += 1;
          continue;
        }
        if (status.operationStatus !== 'transcribed') continue;

        await reconciler.acknowledge(
          entry.operationId,
          entry.localResult === 'pending' ? 'discarded' : entry.localResult
        );
        acknowledged += 1;
        await this.remove(entry.operationId);
        removed += 1;
      } catch {
        // Offline/auth/server failures retain the content-free record for retry.
      }
    }
    return {
      acknowledged,
      retained: (await this.list()).length,
      removed
    };
  }
}
