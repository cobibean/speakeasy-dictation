import { HostedOperationOutbox } from './hosted-operation-outbox.js';
import { getProductSecureStore } from './product-secure-storage.js';

export const HOSTED_OPERATION_OUTBOX_KEY = 'hostedOperationOutboxEncrypted';

let outbox: HostedOperationOutbox | null = null;

export const getHostedOperationOutbox = (): HostedOperationOutbox => {
  outbox ??= new HostedOperationOutbox({
    read: async () =>
      (await getProductSecureStore().read<string>(HOSTED_OPERATION_OUTBOX_KEY)) ?? '',
    write: async (value) => {
      await getProductSecureStore().write(HOSTED_OPERATION_OUTBOX_KEY, value);
    },
    clear: async () => {
      await getProductSecureStore().delete(HOSTED_OPERATION_OUTBOX_KEY);
    }
  });
  return outbox;
};

export const clearHostedOperationOutbox = async (): Promise<void> => {
  await getHostedOperationOutbox().clear();
};
