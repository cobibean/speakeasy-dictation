import type { SecureStorageNativeAdapter } from './native-adapters.js';

interface ElectronSafeStorageBoundary {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export const createElectronSecureStorageNativeAdapter = ({
  platform,
  safeStorage
}: {
  platform: NodeJS.Platform;
  safeStorage: ElectronSafeStorageBoundary;
}): SecureStorageNativeAdapter => {
  const supportedPlatform = platform === 'win32' || platform === 'darwin';
  const isAvailable = (): boolean =>
    supportedPlatform && safeStorage.isEncryptionAvailable();

  const unavailableCode = (): string => {
    if (platform === 'darwin') {
      return 'secure-storage-keychain-unavailable';
    }
    if (platform === 'win32') {
      return 'secure-storage-dpapi-unavailable';
    }
    return 'secure-storage-adapter-unavailable';
  };

  const assertAvailable = (): void => {
    if (!isAvailable()) {
      throw new Error('Native secure storage adapter is unavailable.');
    }
  };

  return {
    readiness: async () => ({
      status: isAvailable() ? 'ready' : 'blocked',
      capability: 'secure-storage',
      journey: 'sign-in',
      code: isAvailable()
        ? 'secure-storage-ready'
        : unavailableCode()
    }),
    keyId: async () => {
      assertAvailable();
      return platform === 'darwin'
        ? 'macos-keychain-electron-v1'
        : 'windows-dpapi-electron-v1';
    },
    encrypt: async (plaintext) => {
      assertAvailable();
      return safeStorage.encryptString(plaintext).toString('base64');
    },
    decrypt: async (ciphertext) => {
      assertAvailable();
      return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'));
    }
  };
};
