import type { SpeakeasyRuntimeState } from './types.js';

export interface PrivacySafeSupportEvidence {
  app: {
    name: string;
    version: string;
    edition: string;
    releaseChannel: string;
  };
  platform: SpeakeasyRuntimeState['platform'];
  input: {
    hotkeyLabel: string;
    hotkeyMode: string;
  };
  permissions: {
    microphone: string;
    accessibility: 'granted' | 'missing' | 'not-required';
  };
  nativeReadiness: SpeakeasyRuntimeState['nativeReadiness'];
  lastErrorCode: string;
}

/**
 * Deliberately allowlists support fields. Auth email/session, device id,
 * dictated text, clipboard content, window titles, and API keys are not inputs.
 */
export const createPrivacySafeSupportEvidence = (
  state: SpeakeasyRuntimeState
): PrivacySafeSupportEvidence => ({
  app: {
    name: state.diagnostics.appName,
    version: state.diagnostics.appVersion,
    edition: state.diagnostics.edition,
    releaseChannel: state.diagnostics.releaseChannel
  },
  platform: structuredClone(state.platform),
  input: {
    hotkeyLabel: state.diagnostics.hotkeyLabel,
    hotkeyMode: state.diagnostics.hotkeyMode
  },
  permissions: {
    microphone: state.diagnostics.microphonePermission,
    accessibility: state.diagnostics.accessibilityPermission
  },
  nativeReadiness: state.nativeReadiness
    ? structuredClone(state.nativeReadiness)
    : null,
  lastErrorCode: state.diagnostics.lastErrorCode
});
