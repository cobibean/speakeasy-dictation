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
  private mutations: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private acknowledgments: Promise<unknown> = Promise.resolve();
  private activeDeliveries = new Set<string>();
  constructor(private readonly storage: HostedOperationOutboxStorage) {}

  currentGeneration(): number { return this.generation; }
  isCurrent(generation: number): boolean { return generation === this.generation; }

  beginDelivery(operationId: string): () => void {
    this.activeDeliveries.add(operationId);
    return () => { this.activeDeliveries.delete(operationId); };
  }

  private mutate<T>(generation: number, operation: () => Promise<T>): Promise<T> {
    const next = this.mutations.then(async () => {
      if (!this.isCurrent(generation)) throw new Error('Operation ownership changed.');
      return operation();
    });
    this.mutations = next.catch(() => undefined);
    return next;
  }

  // Serialize remote acknowledgments, too: older usage snapshots must not
  // overwrite newer ones. A network failure never poisons the queue.
  enqueueAcknowledgment(generation: number, operation: () => Promise<void>): Promise<void> {
    const next = this.acknowledgments.then(async () => {
      if (this.isCurrent(generation)) await operation();
    });
    this.acknowledgments = next.catch(() => undefined);
    return next;
  }

  async list(): Promise<HostedOperationOutboxEntry[]> {
    await this.mutations;
    return parseEntries(await this.storage.read());
  }

  async rememberPending(operationId: string, generation = this.generation): Promise<void> {
    if (!operationIdPattern.test(operationId)) {
      throw new Error('A valid operation ID is required.');
    }
    return this.mutate(generation, async () => {
      const entries = parseEntries(await this.storage.read());
      if (entries.some((entry) => entry.operationId === operationId)) return;
      await this.storage.write(JSON.stringify([...entries, { operationId, localResult: 'pending' }]));
    });
  }

  async markAcknowledgment(
    operationId: string,
    acknowledgment: ProductPasteAcknowledgment,
    generation = this.generation
  ): Promise<void> {
    return this.mutate(generation, async () => {
      const entries = parseEntries(await this.storage.read());
      const next = entries.map((entry) =>
        entry.operationId === operationId
          ? { operationId, localResult: acknowledgment }
          : entry
      );
      if (!next.some((entry) => entry.operationId === operationId)) {
        next.push({ operationId, localResult: acknowledgment });
      }
      await this.storage.write(JSON.stringify(next));
    });
  }

  async remove(operationId: string, generation = this.generation): Promise<void> {
    return this.mutate(generation, async () => {
      const entries = parseEntries(await this.storage.read()).filter((entry) => entry.operationId !== operationId);
      if (entries.length === 0) {
        await this.storage.clear();
      } else {
        await this.storage.write(JSON.stringify(entries));
      }
    });
  }

  async clear(): Promise<void> {
    const generation = ++this.generation;
    await this.mutate(generation, () => this.storage.clear());
  }

  async reconcile(reconciler: HostedOperationReconciler): Promise<{
    acknowledged: number;
    retained: number;
    removed: number;
  }> {
    const generation = this.generation;
    let acknowledged = 0;
    let removed = 0;
    for (const entry of await this.list()) {
      try {
        if (!this.isCurrent(generation)) break;
        await this.enqueueAcknowledgment(generation, async () => {
          if (this.activeDeliveries.has(entry.operationId)) return;
          const status = await reconciler.status(entry.operationId);
          if (!this.isCurrent(generation) || this.activeDeliveries.has(entry.operationId)) return;
          const current = (await this.list()).find(item => item.operationId === entry.operationId);
          if (!current) return;
          if (
            status.operationStatus === 'committed' ||
            status.operationStatus === 'released' ||
            status.operationStatus === 'expired'
          ) {
            await this.remove(entry.operationId, generation);
            removed += 1;
            return;
          }
          if (status.operationStatus !== 'transcribed') return;

          await reconciler.acknowledge(
            entry.operationId,
            current.localResult === 'pending' ? 'discarded' : current.localResult
          );
          acknowledged += 1;
          await this.remove(entry.operationId, generation);
          removed += 1;
        });
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
