import { getAppConfig } from './app-config.js';
import { getStore } from './store.js';
import { getProductAccessToken } from './product-auth.js';
import { debugLog } from './logger.js';

/**
 * Client-origin product events.
 *
 * Some lifecycle/reliability facts are only known on the desktop: a newer
 * version being available, the user clicking download, or a paste failure.
 * These are POSTed to the hosted backend's /v1/events ingest, which validates
 * them against a client allowlist and binds them to the authenticated user.
 *
 * Rules mirrored from the backend:
 *   - PRODUCT edition only. The OSS/BYOK app must never phone home.
 *   - Operational metadata ONLY — never transcript/audio/document/window/app
 *     context, pasted text, or secrets.
 *   - Best-effort: a failed event write must NEVER affect app behavior. Every
 *     call is fire-and-forget and swallows all errors.
 */

export type ClientProductEventName =
  | 'update_available'
  | 'update_download_clicked'
  | 'paste_failed';

const EVENT_TIMEOUT_MS = 8_000;

const getSystemVersion = (): string | undefined => {
  try {
    // Electron-only; returns e.g. "14.5.0" on macOS.
    const proc = process as NodeJS.Process & { getSystemVersion?: () => string };
    return typeof proc.getSystemVersion === 'function' ? proc.getSystemVersion() : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Emit a client-origin product event. Fire-and-forget: resolves to void and
 * never rejects. Callers use `void recordClientProductEvent(...)`.
 */
export const recordClientProductEvent = async (
  eventName: ClientProductEventName,
  metadata?: Record<string, string | number | boolean>
): Promise<void> => {
  try {
    const config = getAppConfig();
    // Product edition + configured backend only. OSS never phones home.
    if (!config.capabilities.productAuth || !config.productApiBaseUrl) {
      return;
    }

    // Requires a signed-in session; if signed out this throws and we bail.
    let accessToken: string;
    try {
      accessToken = await getProductAccessToken();
    } catch {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EVENT_TIMEOUT_MS);
    try {
      await fetch(`${config.productApiBaseUrl}/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          eventName,
          deviceId: getStore().get('deviceId') ?? null,
          appVersion: config.appVersion,
          osVersion: getSystemVersion(),
          releaseChannel: config.releaseChannel,
          metadata: metadata ?? {}
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    // Best-effort only: never surface to the caller's path.
    debugLog(
      `[product-events] failed to record ${eventName}: ${
        error instanceof Error ? error.name : 'NonError'
      }`
    );
  }
};
