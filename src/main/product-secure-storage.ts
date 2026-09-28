import { safeStorage } from 'electron';
import { getStore } from './store.js';
import {
  SecureJsonStore,
  type AsyncKeyValueStore,
  type AsyncSecureCipher
} from './secure-json-store.js';
import { createElectronSecureStorageNativeAdapter } from './electron-secure-storage-adapter.js';

const values: AsyncKeyValueStore = {
  get: async (key) => {
    const value = getStore().get(key as never) as unknown;
    return typeof value === 'string' && value ? value : undefined;
  },
  set: async (key, value) => {
    getStore().set(key as never, value as never);
  },
  delete: async (key) => {
    getStore().delete(key as never);
  }
};

const nativeSecureStorage = createElectronSecureStorageNativeAdapter({
  platform: process.platform,
  safeStorage
});

const cipher: AsyncSecureCipher = {
  isAvailable: async () =>
    (await nativeSecureStorage.readiness()).status === 'ready',
  keyId: () => nativeSecureStorage.keyId(),
  encrypt: (plaintext) => nativeSecureStorage.encrypt(plaintext),
  decrypt: (ciphertext) => nativeSecureStorage.decrypt(ciphertext)
};

let secureStore: SecureJsonStore | null = null;

export const getProductSecureStore = (): SecureJsonStore => {
  secureStore ??= new SecureJsonStore(values, cipher);
  return secureStore;
};

export const getProductSecureStorageReadiness = () =>
  nativeSecureStorage.readiness();
