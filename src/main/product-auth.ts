import { safeStorage } from 'electron';
import {
  AuthResumeSingleFlight,
  isCurrentAuthResume
} from './auth-resume-singleflight.js';
import { getAppConfig } from './app-config.js';
import { selectHostedProductRuntime } from './hosted-product-runtime.js';
import { SpeakeasyError, toErrorCode } from './errors.js';
import { SessionRefreshGuard } from './session-refresh-guard.js';
import { getStore } from './store.js';
import { getProductSecureStore } from './product-secure-storage.js';
import {
  clearHostedOperationOutbox,
  getHostedOperationOutbox
} from './product-operation-outbox.js';
import {
  PendingOperationRecoveryRequiredError,
  resetLocalSignInState
} from './local-sign-in-reset.js';
import {
  SecureJsonCorruptError,
  SecureStorageUnavailableError
} from './secure-json-store.js';
import { updateAuthState, updateUsageState } from './runtime-state.js';
import {
  deriveCodeChallenge,
  generateCodeVerifier,
  generateState,
  parseAuthCallback
} from './pkce.js';
import type { ProductUsageSnapshot } from '../shared/product-api.js';

interface StoredProductSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
}

export type HostedAuthTransactionStatus =
  | 'created'
  | 'email_sent'
  | 'callback_received'
  | 'exchanged'
  | 'expired'
  | 'canceled'
  | 'superseded'
  | 'failed';

interface PendingHostedAuthTransaction {
  transactionId: string;
  codeVerifier: string;
  expectedEmail: string;
  authGeneration: number;
  expiresAt: string;
}

export interface HostedAuthSnapshot {
  secureStorageAvailable: boolean;
  secureStorageStatus: 'ready' | 'unavailable' | 'corrupt';
  signedInEmail: string;
  pendingEmail: string;
  pendingStatus: HostedAuthTransactionStatus | 'none';
  transactionId: string;
  expiresAt: string;
  message: string;
}

const HOSTED_SESSION_KEY = 'productSessionEncrypted';
const HOSTED_PENDING_KEY = 'pendingAuthTransactionEncrypted';
let hostedSession: StoredProductSession | null = null;
let hostedPending: PendingHostedAuthTransaction | null = null;
let hostedPendingStatus: HostedAuthTransactionStatus | 'none' = 'none';
let hostedSecureStorageAvailable = true;
let hostedSecureStorageStatus: HostedAuthSnapshot['secureStorageStatus'] = 'ready';

/**
 * Transient PKCE/state for an in-flight magic-link request. Held in memory only
 * — the code verifier is NEVER persisted to disk. Cleared after a successful
 * exchange or when a new link is requested. See hardening item 1.
 */
interface PendingAuthRequest {
  email: string;
  state: string;
  codeVerifier: string;
}

let pendingAuth: PendingAuthRequest | null = null;
const sessionRefreshGuard = new SessionRefreshGuard<StoredProductSession>(
  (session) => session.refreshToken
);
const hostedResumeSingleFlight =
  new AuthResumeSingleFlight<HostedAuthSnapshot>();

// ---------------------------------------------------------------------------
// Session persistence (encrypted via safeStorage)
// ---------------------------------------------------------------------------

const serializeSession = (session: StoredProductSession): string => {
  const raw = JSON.stringify(session);
  if (!safeStorage.isEncryptionAvailable()) {
    throw new SecureStorageUnavailableError();
  }
  return safeStorage.encryptString(raw).toString('base64');
};

const deserializeSession = (value: string): StoredProductSession | null => {
  if (!value) {
    return null;
  }

  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return null;
    }
    const raw = safeStorage.decryptString(Buffer.from(value, 'base64'));
    return JSON.parse(raw) as StoredProductSession;
  } catch {
    return null;
  }
};

const readStoredSession = (): StoredProductSession | null =>
  deserializeSession(getStore().get('productSession') ?? '');

const usesHostedProductRuntime = (): boolean => {
  const config = getAppConfig();
  return selectHostedProductRuntime({
    edition: config.edition,
    capabilities: config.capabilities,
    productEnvironment: config.productEnvironment,
    productApiBaseUrl: config.productApiBaseUrl,
    platform: process.platform,
    distribution: config.distribution
  }).enabled;
};

const readActiveSession = async (): Promise<StoredProductSession | null> => {
  if (!usesHostedProductRuntime()) {
    return readStoredSession();
  }
  if (hostedSession) {
    return hostedSession;
  }
  hostedSession = await getProductSecureStore().read<StoredProductSession>(
    HOSTED_SESSION_KEY
  );
  return hostedSession;
};

const applyStoredSession = (session: StoredProductSession): void => {
  const store = getStore();
  store.set('productSession', serializeSession(session));
  store.set('productAuthEmail', session.email);
  updateAuthState({
    status: 'signed-in',
    email: session.email,
    pendingEmail: '',
    message: 'Signed in.'
  });
};

const storeSession = (session: StoredProductSession): void => {
  sessionRefreshGuard.recordMutation(session);
  applyStoredSession(session);
};

const storeHostedSession = async (
  session: StoredProductSession
): Promise<void> => {
  await getProductSecureStore().write(HOSTED_SESSION_KEY, session);
  hostedSession = session;
  sessionRefreshGuard.recordMutation(session);
  updateAuthState({
    status: 'signed-in',
    email: session.email,
    pendingEmail: '',
    message: 'Signed in.'
  });
};

const applyClearedSession = (): void => {
  const store = getStore();
  store.set('productSession', '');
  updateAuthState({
    status: 'signed-out',
    email: '',
    pendingEmail: usesHostedProductRuntime() ? '' : store.get('productAuthEmail') ?? '',
    message: 'Signed out.'
  });
  updateUsageState({
    status: 'unknown',
    usedSeconds: 0,
    remainingSeconds: null,
    hardLimitSeconds: null,
    usedSuccessfulDictations: 0,
    reservedSuccessfulDictations: 0,
    remainingSuccessfulDictations: null,
    hardLimitSuccessfulDictations: null,
    resetAt: '',
    message: 'Sign in to load usage.'
  });
};

const clearSession = (): void => {
  sessionRefreshGuard.recordMutation(null);
  applyClearedSession();
};

const clearHostedSession = async (): Promise<void> => {
  await getProductSecureStore().delete(HOSTED_SESSION_KEY);
  hostedSession = null;
  sessionRefreshGuard.recordMutation(null);
  applyClearedSession();
};

// ---------------------------------------------------------------------------
// Vercel-routed auth. The desktop never talks to Supabase directly; it talks to
// our Vercel API, which proxies to Supabase server-side with the service role.
// This keeps the Supabase URL/keys out of the public OSS-friendly binary and
// lets us enforce rate-limits and abuse controls. See hardening items 1 + 19.
// ---------------------------------------------------------------------------

const AUTH_TIMEOUT_MS = 15_000;

const authFetch = async (path: string, body: unknown): Promise<Response> => {
  const config = getAppConfig();
  if (!config.productApiBaseUrl) {
    throw new SpeakeasyError('activation-required', 'Hosted sign-in is not configured for this build.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    return await fetch(`${config.productApiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const hydrateProductAuthState = (): void => {
  const config = getAppConfig();
  const store = getStore();
  const pendingEmail = store.get('productAuthEmail') ?? '';
  if (!config.capabilities.productAuth) {
    updateAuthState({
      status: 'disabled',
      email: '',
      pendingEmail: '',
      message: ''
    });
    updateUsageState({
      status: 'disabled',
      usedSeconds: 0,
      remainingSeconds: null,
      hardLimitSeconds: null,
      usedSuccessfulDictations: 0,
      reservedSuccessfulDictations: 0,
      remainingSuccessfulDictations: null,
      hardLimitSuccessfulDictations: null,
      resetAt: '',
      message: ''
    });
    return;
  }

  const session = readStoredSession();
  if (!session) {
    updateAuthState({
      status: 'signed-out',
      email: '',
      pendingEmail,
      message: pendingEmail ? `Magic link last sent to ${pendingEmail}.` : 'Sign in with email.'
    });
    return;
  }

  updateAuthState({
    status: 'signed-in',
    email: session.email,
    pendingEmail: '',
    message: 'Signed in.'
  });
};

export const requestMagicLink = async (email: string): Promise<void> => {
  const config = getAppConfig();
  if (config.edition !== 'product') {
    throw new SpeakeasyError('activation-required', 'Hosted sign-in is unavailable in this edition.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new SpeakeasyError('auth-failed', 'Enter an email address to receive a sign-in link.');
  }

  if (usesHostedProductRuntime()) {
    await requestHostedAuthTransaction(normalizedEmail);
    return;
  }

  // Generate PKCE verifier + state and hold them in memory only. Issue the
  // network request BEFORE flipping the UI to "link-sent" (network-first
  // ordering, item 16) so a failure surfaces an error rather than a false
  // "sent" state.
  const codeVerifier = generateCodeVerifier();
  const state = generateState();
  const codeChallenge = deriveCodeChallenge(codeVerifier);

  try {
    const response = await authFetch('/v1/auth/magic-link', {
      email: normalizedEmail,
      state,
      codeChallenge,
      codeChallengeMethod: 'S256',
      redirectTo: `${config.protocolScheme}://auth/callback`
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }
  } catch (error) {
    pendingAuth = null;
    updateAuthState({
      status: 'error',
      pendingEmail: normalizedEmail,
      message: 'Unable to send sign-in link.'
    });
    throw new SpeakeasyError(toErrorCode(error, 'auth-failed'), 'Unable to send sign-in link.', error);
  }

  pendingAuth = { email: normalizedEmail, state, codeVerifier };
  getStore().set('productAuthEmail', normalizedEmail);
  updateAuthState({
    status: 'link-sent',
    pendingEmail: normalizedEmail,
    message: `Magic link sent to ${normalizedEmail}.`
  });
};

export const completeMagicLinkSignIn = async (callbackUrl: string): Promise<void> => {
  // Reject any callback received before a magic link was requested in this
  // process — defeats `open speakeasy-product://auth/callback?...` injection.
  if (!pendingAuth) {
    throw new SpeakeasyError('auth-failed', 'No sign-in was in progress. Request a new link.');
  }

  const { code, state: returnedState, tokenHash } = parseAuthCallback(callbackUrl);

  // Validate state matches what we generated. Mismatch => reject.
  if (!returnedState || returnedState !== pendingAuth.state) {
    pendingAuth = null;
    throw new SpeakeasyError('auth-failed', 'Sign-in link did not match this request. Request a new link.');
  }

  if (!code && !tokenHash) {
    pendingAuth = null;
    throw new SpeakeasyError('auth-failed', 'The sign-in link did not contain a sign-in token.');
  }

  const { codeVerifier, email } = pendingAuth;

  try {
    // Exchange code for tokens via Vercel, which verifies the returned user's
    // email matches the email the link was sent to before handing back tokens.
    const response = await authFetch(
      '/v1/auth/exchange',
      tokenHash
        ? {
            tokenHash,
            expectedEmail: email
          }
        : {
            code,
            codeVerifier,
            expectedEmail: email
          }
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = (await response.json()) as {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
      email?: string;
    };

    if (!payload.accessToken || !payload.refreshToken || !payload.expiresAt) {
      throw new SpeakeasyError('auth-failed', 'The sign-in exchange did not return a valid session.');
    }

    storeSession({
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt: payload.expiresAt,
      email: payload.email ?? email
    });
  } catch (error) {
    if (error instanceof SpeakeasyError) {
      throw error;
    }
    throw new SpeakeasyError(toErrorCode(error, 'auth-failed'), 'Unable to complete sign-in.', error);
  } finally {
    // The verifier and state are single-use; clear regardless of outcome.
    pendingAuth = null;
  }
};

// ---------------------------------------------------------------------------
// Token refresh — generation/session keyed so stale completions cannot restore
// or clear a session that changed while the request was in flight.
// ---------------------------------------------------------------------------

const doRefresh = async (session: StoredProductSession): Promise<StoredProductSession> => {
  const response = await authFetch('/v1/auth/refresh', {
    refreshToken: session.refreshToken
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = (await response.json()) as {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    email?: string;
  };

  const next: StoredProductSession = {
    accessToken: payload.accessToken ?? session.accessToken,
    refreshToken: payload.refreshToken ?? session.refreshToken,
    expiresAt: payload.expiresAt ?? session.expiresAt,
    email: payload.email ?? session.email
  };
  return next;
};

const refreshSession = (session: StoredProductSession): Promise<StoredProductSession> =>
  sessionRefreshGuard.refresh(
    session,
    doRefresh,
    usesHostedProductRuntime()
      ? {
          readCurrent: () => hostedSession,
          store: async (next) => {
            await getProductSecureStore().write(HOSTED_SESSION_KEY, next);
            hostedSession = next;
            updateAuthState({
              status: 'signed-in',
              email: next.email,
              pendingEmail: '',
              message: 'Signed in.'
            });
          },
          clear: clearHostedSession
        }
      : {
          readCurrent: readStoredSession,
          store: applyStoredSession,
          clear: applyClearedSession
        }
  );

export const getProductAccessToken = async (
  reportOutcome?: (outcome: 'cached' | 'stored' | 'refreshed') => void
): Promise<string> => {
  const cached = !!hostedSession;
  const report = (outcome: 'cached' | 'stored' | 'refreshed') => {
    try { reportOutcome?.(outcome); } catch { /* Diagnostics never affect authentication. */ }
  };
  const session = await readActiveSession();
  if (!session) {
    throw new SpeakeasyError('auth-required', 'Sign in is required before using the product edition.');
  }

  if (session.expiresAt > Date.now() / 1000 + 60) {
    report(cached ? 'cached' : 'stored');
    return session.accessToken;
  }

  try {
    const nextSession = await refreshSession(session);
    report('refreshed');
    return nextSession.accessToken;
  } catch (error) {
    throw new SpeakeasyError(toErrorCode(error, 'auth-failed'), 'Your session expired. Sign in again.', error);
  }
};

export const signOutProduct = async (): Promise<void> => {
  let session: StoredProductSession | null;
  try {
    session = await readActiveSession();
  } catch (error) {
    if (
      !usesHostedProductRuntime() ||
      !(error instanceof SecureStorageUnavailableError) &&
        !(error instanceof SecureJsonCorruptError)
    ) {
      throw error;
    }

    // A user-requested sign-out must remain durable even when the platform
    // secure store cannot decrypt the old session. Deleting ciphertext needs
    // no decryption and prevents access from reappearing if storage recovers.
    const store = getStore();
    store.set('authGeneration', (store.get('authGeneration') ?? 0) + 1);
    await Promise.all([
      getProductSecureStore().delete(HOSTED_SESSION_KEY),
      getProductSecureStore().delete(HOSTED_PENDING_KEY),
      clearHostedOperationOutbox()
    ]);
    hostedSession = null;
    hostedPending = null;
    hostedPendingStatus = 'none';
    sessionRefreshGuard.recordMutation(null);
    applyClearedSession();
    return;
  }
  if (usesHostedProductRuntime()) {
    const store = getStore();
    store.set('authGeneration', (store.get('authGeneration') ?? 0) + 1);
    await Promise.all([
      clearHostedSession(),
      getProductSecureStore().delete(HOSTED_PENDING_KEY),
      clearHostedOperationOutbox()
    ]);
    hostedPending = null;
    hostedPendingStatus = 'none';
  } else {
    clearSession();
    pendingAuth = null;
  }

  if (!session) {
    return;
  }

  await authFetch('/v1/auth/sign-out', { accessToken: session.accessToken }).catch(() => {
    // Best-effort server-side revocation; local sign-out already completed.
  });
};

const hostedAuthFetch = async (
  path: string,
  body: unknown
): Promise<Response> => authFetch(path, body);

const secureStorageErrorMessage =
  'Secure storage is unavailable. Sign-in is disabled until it is restored.';

const handleHostedStorageError = (error: unknown): never => {
  hostedSecureStorageAvailable = false;
  hostedSecureStorageStatus = error instanceof SecureJsonCorruptError
    ? 'corrupt'
    : 'unavailable';
  hostedSession = null;
  hostedPending = null;
  hostedPendingStatus = 'none';
  sessionRefreshGuard.recordMutation(null);
  updateAuthState({
    status: 'error',
    email: '',
    pendingEmail: '',
    message: secureStorageErrorMessage
  });
  throw new SpeakeasyError(
    'auth-failed',
    error instanceof SecureJsonCorruptError
      ? 'Encrypted sign-in state on this Mac could not be read. Reset local sign-in to continue.'
      : secureStorageErrorMessage,
    error
  );
};

export const initializeHostedProductAuth = async (): Promise<HostedAuthSnapshot> => {
  if (!usesHostedProductRuntime()) {
    hydrateProductAuthState();
    return getHostedAuthSnapshot();
  }

  try {
    const secureStore = getProductSecureStore();
    // Requiring availability even with no stored value prevents a sign-in
    // request from being sent when its verifier could not be persisted.
    hostedSession = await secureStore.read<StoredProductSession>(
      HOSTED_SESSION_KEY
    );
    const pending = await secureStore.read<PendingHostedAuthTransaction>(
      HOSTED_PENDING_KEY
    );
    hostedPending = pending;
    hostedSecureStorageAvailable = true;
    hostedSecureStorageStatus = 'ready';
    hostedPendingStatus = pending ? 'created' : 'none';

    if (hostedSession) {
      sessionRefreshGuard.recordMutation(hostedSession);
      updateAuthState({
        status: 'signed-in',
        email: hostedSession.email,
        pendingEmail: '',
        message: 'Signed in.'
      });
    } else {
      updateAuthState({
        status: pending ? 'link-sent' : 'signed-out',
        email: '',
        pendingEmail: pending?.expectedEmail ?? '',
        message: pending
          ? `Sign-in link sent to ${pending.expectedEmail}.`
          : 'Sign in with email.'
      });
    }
    return getHostedAuthSnapshot(pending);
  } catch (error) {
    return handleHostedStorageError(error);
  }
};

export const resetHostedProductLocalSignIn = async (): Promise<HostedAuthSnapshot> => {
  if (!usesHostedProductRuntime()) {
    throw new SpeakeasyError('auth-failed', 'Local Product sign-in reset is unavailable.');
  }

  const store = getStore();
  try {
    await resetLocalSignInState({
      pendingOperationCount: async () => (await getHostedOperationOutbox().list()).length,
      deleteSecureValue: (key) => getProductSecureStore().delete(key),
      getAuthGeneration: () => Number(store.get('authGeneration') ?? 0),
      setAuthGeneration: (value) => store.set('authGeneration', value)
    });
  } catch (error) {
    if (error instanceof PendingOperationRecoveryRequiredError || error instanceof SecureJsonCorruptError) {
      throw new SpeakeasyError(
        'auth-failed',
        'Pending dictation recovery must finish before local sign-in can be reset. Contact support.',
        error
      );
    }
    throw error;
  }

  hostedSession = null;
  hostedPending = null;
  hostedPendingStatus = 'none';
  hostedSecureStorageAvailable = true;
  hostedSecureStorageStatus = 'ready';
  sessionRefreshGuard.recordMutation(null);
  applyClearedSession();
  return getHostedAuthSnapshot();
};

export const requestHostedAuthTransaction = async (
  normalizedEmail: string
): Promise<void> => {
  const secureStore = getProductSecureStore();
  try {
    // A write/delete probe closes the crash window before any email is sent.
    await secureStore.write('__hostedAuthProbe', { at: Date.now() });
    await secureStore.delete('__hostedAuthProbe');
  } catch (error) {
    return handleHostedStorageError(error);
  }

  const store = getStore();
  const authGeneration = (store.get('authGeneration') ?? 0) + 1;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);

  let response: Response;
  try {
    response = await hostedAuthFetch('/v1/auth/transactions', {
      email: normalizedEmail,
      codeChallenge,
      authGeneration
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
  } catch (error) {
    updateAuthState({
      status: 'error',
      pendingEmail: normalizedEmail,
      message: 'Unable to send sign-in link.'
    });
    throw new SpeakeasyError(
      toErrorCode(error, 'auth-failed'),
      'Unable to send sign-in link.',
      error
    );
  }

  const payload = (await response.json()) as {
    transactionId?: string;
    status?: HostedAuthTransactionStatus;
    expiresAt?: string;
  };
  if (!payload.transactionId || !payload.expiresAt) {
    throw new SpeakeasyError(
      'auth-failed',
      'The sign-in service returned an invalid transaction.'
    );
  }

  const pending: PendingHostedAuthTransaction = {
    transactionId: payload.transactionId,
    codeVerifier,
    expectedEmail: normalizedEmail,
    authGeneration,
    expiresAt: payload.expiresAt
  };
  try {
    await secureStore.write(HOSTED_PENDING_KEY, pending);
  } catch (error) {
    // The server transaction remains unusable without its verifier. Fail
    // closed and do not expose a false "link sent" state.
    return handleHostedStorageError(error);
  }
  store.set('authGeneration', authGeneration);
  hostedPending = pending;
  hostedPendingStatus = payload.status ?? 'created';
  try {
    await sendHostedAuthEmail(pending);
    hostedPendingStatus = 'email_sent';
  } catch (error) {
    updateAuthState({
      status: 'error',
      pendingEmail: normalizedEmail,
      message: 'The sign-in request was saved, but email delivery needs retry.'
    });
    throw new SpeakeasyError(
      toErrorCode(error, 'auth-failed'),
      'The sign-in request was saved. Try sending the link again.',
      error
    );
  }
  updateAuthState({
    status: 'link-sent',
    email: '',
    pendingEmail: normalizedEmail,
    message: `Sign-in link sent to ${normalizedEmail}.`
  });
};

const sendHostedAuthEmail = async (
  pending: PendingHostedAuthTransaction
): Promise<void> => {
  const response = await hostedAuthFetch('/v1/auth/transaction/send', {
    transactionId: pending.transactionId,
    codeVerifier: pending.codeVerifier,
    authGeneration: pending.authGeneration
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
};

const resumeHostedPendingAuthTransaction = async (
  pending: PendingHostedAuthTransaction
): Promise<HostedAuthSnapshot> => {
  const statusResponse = await hostedAuthFetch('/v1/auth/transaction/status', {
    transactionId: pending.transactionId
  });
  if (!statusResponse.ok) {
    throw new SpeakeasyError(
      'auth-failed',
      'Unable to check sign-in status.'
    );
  }
  const statusPayload = (await statusResponse.json()) as {
    status?: HostedAuthTransactionStatus;
  };
  const status = statusPayload.status ?? 'failed';
  hostedPendingStatus = status;
  if (status === 'created') {
    await sendHostedAuthEmail(pending);
    hostedPendingStatus = 'email_sent';
    return getHostedAuthSnapshot(pending);
  }
  if (status === 'email_sent') {
    return getHostedAuthSnapshot(pending);
  }
  if (status !== 'callback_received') {
    await getProductSecureStore().delete(HOSTED_PENDING_KEY);
    hostedPending = null;
    hostedPendingStatus = 'none';
    updateAuthState({
      status: 'signed-out',
      email: '',
      pendingEmail: '',
      message: 'This sign-in link is no longer valid. Send a new link.'
    });
    throw new SpeakeasyError(
      'auth-failed',
      status === 'superseded'
        ? 'A newer sign-in request replaced this link.'
        : 'This sign-in link is no longer valid. Request a new link.'
    );
  }

  const exchangeResponse = await hostedAuthFetch(
    '/v1/auth/transaction/exchange',
    {
      transactionId: pending.transactionId,
      codeVerifier: pending.codeVerifier,
      authGeneration: pending.authGeneration
    }
  );
  if (!exchangeResponse.ok) {
    throw new SpeakeasyError(
      'auth-failed',
      'Unable to complete sign-in. Request a new link if this continues.'
    );
  }
  const session = (await exchangeResponse.json()) as StoredProductSession;
  if (
    !session.accessToken ||
    !session.refreshToken ||
    !session.expiresAt ||
    !session.email
  ) {
    throw new SpeakeasyError(
      'auth-failed',
      'The sign-in service returned an invalid session.'
    );
  }

  const secureStore = getProductSecureStore();
  const currentPending =
    await secureStore.read<PendingHostedAuthTransaction>(HOSTED_PENDING_KEY);
  if (
    !isCurrentAuthResume(
      pending,
      currentPending,
      getStore().get('authGeneration') ?? 0
    )
  ) {
    throw new SpeakeasyError(
      'auth-failed',
      'A newer sign-in request replaced this link.'
    );
  }

  await storeHostedSession(session);
  const pendingAfterStore =
    await secureStore.read<PendingHostedAuthTransaction>(HOSTED_PENDING_KEY);
  if (
    !isCurrentAuthResume(
      pending,
      pendingAfterStore,
      getStore().get('authGeneration') ?? 0
    )
  ) {
    if (hostedSession === session) {
      await clearHostedSession();
    }
    throw new SpeakeasyError(
      'auth-failed',
      'A newer sign-in request replaced this link.'
    );
  }

  await secureStore.delete(HOSTED_PENDING_KEY);
  hostedPending = null;
  hostedPendingStatus = 'none';
  return getHostedAuthSnapshot();
};

export const resumeHostedAuthTransaction = async (
  transactionHint?: string
): Promise<HostedAuthSnapshot> => {
  let pending: PendingHostedAuthTransaction | null;
  try {
    pending =
      await getProductSecureStore().read<PendingHostedAuthTransaction>(
        HOSTED_PENDING_KEY
      );
    hostedPending = pending;
  } catch (error) {
    return handleHostedStorageError(error);
  }

  if (!pending) {
    const activeResume = hostedResumeSingleFlight.get(transactionHint);
    if (activeResume) {
      return activeResume;
    }
    if (hostedSession) {
      return getHostedAuthSnapshot();
    }
    throw new SpeakeasyError(
      'auth-failed',
      'No sign-in is in progress. Request a new link.'
    );
  }
  if (transactionHint && transactionHint !== pending.transactionId) {
    throw new SpeakeasyError(
      'auth-failed',
      'That sign-in link belongs to another device or request.'
    );
  }

  return hostedResumeSingleFlight.run(pending.transactionId, () =>
    resumeHostedPendingAuthTransaction(pending)
  );
};

export const cancelHostedAuthTransaction = async (): Promise<void> => {
  const pending =
    await getProductSecureStore().read<PendingHostedAuthTransaction>(
      HOSTED_PENDING_KEY
    );
  if (!pending) {
    return;
  }
  const store = getStore();
  store.set('authGeneration', (store.get('authGeneration') ?? 0) + 1);
  await hostedAuthFetch('/v1/auth/transaction/cancel', {
    transactionId: pending.transactionId,
    codeVerifier: pending.codeVerifier,
    authGeneration: pending.authGeneration
  }).catch(() => undefined);
  await getProductSecureStore().delete(HOSTED_PENDING_KEY);
  hostedPending = null;
  hostedPendingStatus = 'none';
  updateAuthState({
    status: 'signed-out',
    email: '',
    pendingEmail: '',
    message: 'Sign-in canceled.'
  });
};

export const getHostedAuthSnapshot = (
  knownPending?: PendingHostedAuthTransaction | null
): HostedAuthSnapshot => {
  const activePending = knownPending ?? hostedPending;
  const pendingEmail =
    hostedPendingStatus === 'none' ? '' : activePending?.expectedEmail ?? '';
  return {
    secureStorageAvailable: hostedSecureStorageAvailable,
    secureStorageStatus: hostedSecureStorageStatus,
    signedInEmail: hostedSession?.email ?? '',
    pendingEmail,
    pendingStatus: hostedPendingStatus,
    transactionId: activePending?.transactionId ?? '',
    expiresAt: activePending?.expiresAt ?? '',
    message: hostedSession
      ? 'Signed in.'
      : hostedPendingStatus === 'none'
        ? 'Sign in with email.'
        : 'Check your email, then return to Speakeasy.'
  };
};

export const applyUsageSnapshot = (usage: ProductUsageSnapshot): void => {
  updateUsageState({
    status: usage.status,
    plan: usage.plan,
    usedSeconds: usage.usedSeconds,
    remainingSeconds: usage.remainingSeconds,
    hardLimitSeconds: usage.hardLimitSeconds,
    usedSuccessfulDictations: usage.usedSuccessfulDictations ?? 0,
    reservedSuccessfulDictations: usage.reservedSuccessfulDictations ?? 0,
    remainingSuccessfulDictations: usage.remainingSuccessfulDictations ?? null,
    hardLimitSuccessfulDictations: usage.hardLimitSuccessfulDictations ?? null,
    resetAt: usage.resetAt,
    message: usage.message
  });
};
