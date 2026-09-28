import type { AppEdition } from '../shared/types.js';

export type SetupStatus = 'incomplete' | 'complete';
export type StartupDestination = 'onboarding' | 'hud';
export type ProtocolWake =
  | { kind: 'auth'; transactionId: string | null }
  | { kind: 'billing-return'; transactionId: string | null };

export const selectStartupDestination = ({
  edition,
  setupStatus
}: {
  edition: AppEdition;
  setupStatus: SetupStatus;
}): StartupDestination => {
  if (
    edition === 'product' &&
    setupStatus === 'incomplete'
  ) {
    return 'onboarding';
  }

  return 'hud';
};

/**
 * Converts an OS activation into a content-free wake signal.
 *
 * W4a owns only window routing. It intentionally does not parse or trust the
 * opaque transaction reference; W4b will exchange it against server truth.
 */
export const createProtocolWake = (
  argv: readonly string[],
  protocolScheme: string | null
): ProtocolWake | null => {
  if (!protocolScheme) return null;
  const value = argv.find((candidate) =>
    candidate
      .toLowerCase()
      .startsWith(`${protocolScheme.toLowerCase()}://`)
  );
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/$/u, '').toLowerCase();
    const isAuthRoute =
      host === 'auth' && ['', '/wake', '/callback'].includes(path);
    const kind =
      isAuthRoute
        ? 'auth'
        : host === 'billing' && path === '/return'
          ? 'billing-return'
          : null;
    if (!kind || url.username || url.password || url.port) return null;
    const transactionId = url.searchParams.get('transaction');
    return {
      kind,
      transactionId:
        transactionId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          transactionId
        )
          ? transactionId
          : null
    };
  } catch {
    return null;
  }
};
