import type {
  NativeCapability,
  NativeReadinessBlock,
  NativeRecoveryAction,
  ProductJourney
} from '../shared/types.js';
import type { ProtocolWake } from './startup-router.js';

export interface NativeAdapterReadiness {
  status: 'ready' | 'blocked';
  capability: NativeCapability;
  journey: ProductJourney;
  code: string;
}

export interface SecureStorageNativeAdapter {
  readiness(): Promise<NativeAdapterReadiness>;
  keyId(): Promise<string>;
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export interface ActivationLifecycleNativeAdapter {
  initialWake(): ProtocolWake | null;
  activationFromArguments(arguments_: readonly string[]): ProtocolWake | null;
}

export interface PermissionInputPasteNativeAdapter {
  microphoneReadiness(): Promise<NativeAdapterReadiness>;
  hotkeyReadiness(): Promise<NativeAdapterReadiness>;
  pasteReadiness(): Promise<NativeAdapterReadiness>;
}

export interface DistributionUpdateNativeAdapter {
  updateReadiness(): Promise<NativeAdapterReadiness>;
}

export interface HostedProductNativeAdapters {
  secureStorage: SecureStorageNativeAdapter;
  activation: ActivationLifecycleNativeAdapter;
  inputAndPaste: PermissionInputPasteNativeAdapter;
  distribution: DistributionUpdateNativeAdapter;
}

const recoveryActions: Record<NativeCapability, NativeRecoveryAction[]> = {
  'secure-storage': ['retry', 'local-sign-in-reset', 'contact-support'],
  activation: ['retry', 'restart-speakeasy', 'contact-support'],
  microphone: ['retry', 'open-system-settings', 'contact-support'],
  hotkey: ['retry', 'open-system-settings', 'restart-speakeasy'],
  accessibility: ['retry', 'open-system-settings', 'restart-speakeasy'],
  paste: ['retry', 'open-system-settings', 'contact-support'],
  updates: ['retry', 'contact-support']
};

const isPrivacySafeCode = (code: string): boolean =>
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(code) && code.length <= 64;

export const toNativeReadinessBlock = (
  readiness: NativeAdapterReadiness
): NativeReadinessBlock | null => {
  if (!isPrivacySafeCode(readiness.code)) {
    throw new Error('Native adapter diagnostic code must be privacy-safe.');
  }
  if (readiness.status === 'ready') {
    return null;
  }
  return {
    capability: readiness.capability,
    journey: readiness.journey,
    code: readiness.code,
    recoveryActions: [...recoveryActions[readiness.capability]]
  };
};
