export type OperatingPlatform = 'macos' | 'windows' | 'unsupported';
export type DistributionChannel =
  | 'development'
  | 'mac-direct'
  | 'windows-store'
  | 'unpackaged';
export type MicrophonePermissionState =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'unavailable';

export interface PlatformCapabilities {
  pushToHold: boolean;
  automaticPaste: boolean;
  clipboardRecovery: boolean;
  microphoneRecovery: boolean;
  storeManagedUpdates: boolean;
}

export interface PlatformState {
  operatingSystem: OperatingPlatform;
  architecture: string;
  osRelease: string;
  distribution: DistributionChannel;
  packaged: boolean;
  launchAtLogin: boolean;
  capabilities: PlatformCapabilities;
}

export const detectOperatingPlatform = (
  platform: NodeJS.Platform
): OperatingPlatform => {
  if (platform === 'darwin') {
    return 'macos';
  }
  if (platform === 'win32') {
    return 'windows';
  }
  return 'unsupported';
};

export const selectDistributionChannel = ({
  platform,
  packaged,
  windowsStore
}: {
  platform: NodeJS.Platform;
  packaged: boolean;
  windowsStore: boolean;
}): DistributionChannel => {
  if (!packaged) {
    return 'development';
  }
  if (platform === 'win32' && windowsStore) {
    return 'windows-store';
  }
  if (platform === 'darwin') {
    return 'mac-direct';
  }
  return 'unpackaged';
};

export const getPlatformCapabilities = (
  operatingSystem: OperatingPlatform,
  distribution: DistributionChannel
): PlatformCapabilities => ({
  pushToHold: operatingSystem === 'macos' || operatingSystem === 'windows',
  automaticPaste: operatingSystem === 'macos' || operatingSystem === 'windows',
  clipboardRecovery: operatingSystem === 'macos' || operatingSystem === 'windows',
  microphoneRecovery: operatingSystem === 'macos' || operatingSystem === 'windows',
  storeManagedUpdates: distribution === 'windows-store'
});

export const shouldUseManifestUpdater = (
  distribution: DistributionChannel
): boolean => distribution !== 'windows-store';

export const getDisabledUpdaterMessage = (
  distribution: DistributionChannel,
  packaged: boolean
): string => {
  if (!packaged) {
    return 'Updates disabled in development.';
  }
  if (distribution === 'windows-store') {
    return 'Updates are managed by Microsoft Store.';
  }
  return 'Updates unavailable for this build.';
};

export const normalizeMicrophonePermission = (
  value: unknown
): MicrophonePermissionState => {
  if (value === 'granted') {
    return 'granted';
  }
  if (value === 'denied' || value === 'restricted') {
    return 'denied';
  }
  if (value === 'unavailable') {
    return 'unavailable';
  }
  return 'unknown';
};
