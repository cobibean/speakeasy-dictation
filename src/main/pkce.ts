import { createHash, randomBytes } from 'node:crypto';

/**
 * PKCE + state helpers for the magic-link sign-in flow. Kept in their own
 * Electron-free module so they can be unit-tested directly. See hardening
 * item 1.
 */

export const base64UrlEncode = (buffer: Buffer): string =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');

export const generateCodeVerifier = (): string => base64UrlEncode(randomBytes(32));

export const deriveCodeChallenge = (verifier: string): string =>
  base64UrlEncode(createHash('sha256').update(verifier).digest());

export const generateState = (): string => base64UrlEncode(randomBytes(16));

/**
 * Parse auth callback params out of the redirect URL. Supabase may return PKCE
 * code params or a magic-link token hash; accept the fragment too for
 * robustness against redirect variations.
 */
export const parseAuthCallback = (
  callbackUrl: string
): { state: string; code: string; tokenHash: string; type: string } => {
  const url = new URL(callbackUrl);
  const params = new URLSearchParams(
    url.search.length > 1 ? url.search : url.hash.startsWith('#') ? url.hash.slice(1) : ''
  );
  return {
    state: params.get('state') ?? '',
    code: params.get('code') ?? '',
    tokenHash: params.get('token_hash') ?? '',
    type: params.get('type') ?? ''
  };
};
