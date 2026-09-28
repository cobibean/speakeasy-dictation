export interface AsyncKeyValueStore {
  get: (key: string) => Promise<string | undefined>;
  set: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

export interface AsyncSecureCipher {
  isAvailable: () => Promise<boolean>;
  keyId: () => Promise<string>;
  encrypt: (plaintext: string) => Promise<string>;
  decrypt: (ciphertext: string) => Promise<string>;
}

interface SecureEnvelope<T> {
  format: 'speakeasy.secure-json.v1';
  keyId: string;
  value: T;
}

export class SecureStorageUnavailableError extends Error {
  constructor() {
    super('Secure storage is unavailable.');
    this.name = 'SecureStorageUnavailableError';
  }
}

export class SecureJsonCorruptError extends Error {
  constructor() {
    super('Encrypted local state is unreadable.');
    this.name = 'SecureJsonCorruptError';
  }
}

export class SecureJsonStore {
  constructor(
    private readonly values: AsyncKeyValueStore,
    private readonly cipher: AsyncSecureCipher
  ) {}

  async read<T>(key: string): Promise<T | null> {
    await this.requireAvailable();
    const ciphertext = await this.values.get(key);
    if (!ciphertext) {
      return null;
    }

    try {
      const plaintext = await this.cipher.decrypt(ciphertext);
      const envelope = JSON.parse(plaintext) as Partial<SecureEnvelope<T>>;
      if (
        envelope.format !== 'speakeasy.secure-json.v1' ||
        typeof envelope.keyId !== 'string' ||
        !Object.prototype.hasOwnProperty.call(envelope, 'value')
      ) {
        throw new Error('invalid secure envelope');
      }

      const currentKeyId = await this.cipher.keyId();
      if (envelope.keyId !== currentKeyId) {
        await this.write(key, envelope.value as T);
      }
      return envelope.value as T;
    } catch (error) {
      if (
        error instanceof SecureStorageUnavailableError ||
        error instanceof SecureJsonCorruptError
      ) {
        throw error;
      }
      throw new SecureJsonCorruptError();
    }
  }

  async write<T>(key: string, value: T): Promise<void> {
    await this.requireAvailable();
    const envelope: SecureEnvelope<T> = {
      format: 'speakeasy.secure-json.v1',
      keyId: await this.cipher.keyId(),
      value
    };
    const ciphertext = await this.cipher.encrypt(JSON.stringify(envelope));
    await this.values.set(key, ciphertext);
  }

  async delete(key: string): Promise<void> {
    await this.values.delete(key);
  }

  private async requireAvailable(): Promise<void> {
    if (!(await this.cipher.isAvailable())) {
      throw new SecureStorageUnavailableError();
    }
  }
}
