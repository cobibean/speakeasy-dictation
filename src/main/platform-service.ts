import { app, systemPreferences } from 'electron';
import os from 'node:os';
import { getAppConfig } from './app-config.js';
import {
  detectOperatingPlatform,
  getPlatformCapabilities,
  normalizeMicrophonePermission,
  type MicrophonePermissionState,
  type PlatformState
} from '../shared/platform.js';
import { getStore } from './store.js';

let observedWindowsMicrophonePermission: MicrophonePermissionState = 'unknown';

export const getMicrophonePermission = (): MicrophonePermissionState => {
  if (process.platform === 'darwin') {
    return normalizeMicrophonePermission(
      systemPreferences.getMediaAccessStatus('microphone')
    );
  }
  if (process.platform === 'win32') {
    return observedWindowsMicrophonePermission === 'unknown' &&
      getStore().get('microphonePermissionGranted')
      ? 'granted'
      : observedWindowsMicrophonePermission;
  }
  return 'unavailable';
};

export const reportMicrophonePermission = (
  value: unknown
): MicrophonePermissionState => {
  const normalized = normalizeMicrophonePermission(value);
  if (process.platform === 'win32') {
    observedWindowsMicrophonePermission = normalized;
    getStore().set('microphonePermissionGranted', normalized === 'granted');
  }
  return getMicrophonePermission();
};

export const requestMicrophonePermission = async (): Promise<boolean> => {
  if (process.platform === 'darwin') {
    return systemPreferences.askForMediaAccess('microphone');
  }

  // Windows prompts from getUserMedia in the renderer. Returning true here
  // means "continue to the capture attempt", not that access is pre-granted.
  return process.platform === 'win32';
};

export type AccessibilityPermissionState = 'granted' | 'missing' | 'not-required';

export const getAccessibilityPermission = (): AccessibilityPermissionState => {
  if (process.platform !== 'darwin') return 'not-required';
  return systemPreferences.isTrustedAccessibilityClient(false)
    ? 'granted'
    : 'missing';
};

export const requestAccessibilityPermission = (): boolean => {
  if (process.platform !== 'darwin') return true;
  return systemPreferences.isTrustedAccessibilityClient(true);
};

export const getPlatformState = (): PlatformState => {
  const config = getAppConfig();
  const operatingSystem = detectOperatingPlatform(process.platform);
  let launchAtLogin = false;

  try {
    launchAtLogin = app.getLoginItemSettings().openAtLogin;
  } catch {
    // Some unpackaged/test environments do not expose login-item state.
  }

  return {
    operatingSystem,
    architecture: process.arch,
    osRelease: os.release(),
    distribution: config.distribution,
    packaged: app.isPackaged,
    launchAtLogin,
    capabilities: getPlatformCapabilities(
      operatingSystem,
      config.distribution
    )
  };
};
