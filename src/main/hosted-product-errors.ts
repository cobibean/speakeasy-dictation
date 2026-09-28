import { SpeakeasyError, toErrorCode } from './errors.js';
import { HostedProductHttpError } from './hosted-product-client.js';

export const mapHostedError = (
  error: unknown,
  fallback: 'auth-failed' | 'transcription-failed',
  message: string
): SpeakeasyError => {
  if (error instanceof SpeakeasyError) return error;
  if (error instanceof HostedProductHttpError) {
    if (error.status === 503 && error.code === 'provider-budget-paused') {
      return new SpeakeasyError(
        'provider-budget-paused',
        'Hosted transcription is temporarily paused. Contact support if it continues.',
        error
      );
    }
    if (error.status === 401) {
      return new SpeakeasyError('auth-required', 'Sign in is required before using hosted dictation.', error);
    }
    if (error.status === 402 || error.status === 429) {
      return new SpeakeasyError('usage-limit-reached', 'Usage limit reached for this account.', error);
    }
    if (error.status === 403 && error.code.startsWith('consent')) {
      return new SpeakeasyError('consent-required', 'Hosted processing consent is required.', error);
    }
    if (error.status === 426) {
      return new SpeakeasyError('activation-required', 'This app version is not compatible with the hosted service.', error);
    }
    if (error.status >= 500 && error.correlationId) {
      return new SpeakeasyError(
        fallback,
        `Hosted transcription could not start. Try again. If it repeats, contact support with code ${error.correlationId}.`,
        error
      );
    }
  }
  return new SpeakeasyError(toErrorCode(error, fallback), message, error);
};
