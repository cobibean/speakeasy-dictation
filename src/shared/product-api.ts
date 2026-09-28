import type { CleanupOutcome } from './cleanup-outcome.js';
import type { CleanupStrength } from './types.js';
import type { ServerTimingSnapshot } from './server-timing.js';
import type {
  AccountDeviceSetupState,
  DeviceEnrollmentState,
  SetupAccountState,
  SetupPracticeGrantState
} from './setup-bootstrap.js';

export interface ProductSessionBootstrapResponse {
  contractVersion: string;
  email: string;
  usage: ProductUsageSnapshot;
  billing: ProductBillingSnapshot;
  accountState: SetupAccountState;
  enrollment: DeviceEnrollmentState;
  accountDeviceSetup: AccountDeviceSetupState;
  practiceGrant: SetupPracticeGrantState;
}

export interface ProductBillingSnapshot {
  plan: 'free' | 'standard' | 'pro';
  status: 'active' | 'payment_issue' | 'inactive';
  paymentStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

export interface ProductSetupProgressResponse {
  contractVersion: string;
  outcome: 'advanced' | 'duplicate';
  accountDeviceSetup: AccountDeviceSetupState;
}

export interface ProductSetupReviewResponse {
  contractVersion: string;
  outcome: 'available' | 'renewed' | 'reserved' | 'recovery_required';
  practiceGrant: SetupPracticeGrantState;
}

export interface ProductUsageSnapshot {
  contractVersion?: string;
  plan: 'free' | 'standard' | 'pro';
  metric?: 'seconds' | 'successful_dictations';
  usedSeconds: number;
  remainingSeconds: number | null;
  hardLimitSeconds: number | null;
  usedSuccessfulDictations?: number;
  reservedSuccessfulDictations?: number;
  remainingSuccessfulDictations?: number | null;
  hardLimitSuccessfulDictations?: number | null;
  resetAt: string;
  status: 'ready' | 'limited' | 'exhausted';
  message: string;
}

export interface ProductTranscriptionRequest {
  audioBuffer: ArrayBuffer;
  mimeType: string;
  durationMs: number;
  polishBeforePaste: boolean;
  cleanupStrength: CleanupStrength;
  deviceId: string;
  operationId?: string;
  operationContext?: 'dictation' | 'onboarding' | 'test';
  normalAllowanceConfirmed?: boolean;
}

export interface ProductTranscriptionResponse {
  contractVersion?: string;
  operationId?: string;
  operationStatus?: 'transcribed' | 'released';
  text: string;
  cleanupOutcome?: CleanupOutcome;
  usage: ProductUsageSnapshot;
  serverTiming?: ServerTimingSnapshot;
}

export type ProductPasteAcknowledgment = 'pasted' | 'paste_failed' | 'discarded';

export interface ProductOperationAcknowledgmentResponse {
  contractVersion: string;
  operationId: string;
  operationStatus: 'committed' | 'released';
  outcome: 'committed' | 'released' | 'duplicate';
  usage: ProductUsageSnapshot;
}

export interface ProductOperationStatusResponse {
  contractVersion: string;
  operationId: string;
  operationStatus: 'reserved' | 'transcribed' | 'committed' | 'released' | 'expired';
  expiresAt?: string;
  usage: ProductUsageSnapshot;
}

export interface ProductConsentSnapshot {
  contractVersion: string;
  status: 'unknown' | 'accepted' | 'withdrawn';
  consentVersion: string | null;
  occurredAt: string | null;
  currentVersion: string;
}

export interface ProductBillingReturnResponse {
  contractVersion: string;
  status: 'consumed';
  action: 'checkout' | 'portal';
  requestedPlan: 'standard' | 'pro' | null;
  checkoutStatus?: 'completed' | 'cancelled' | 'pending';
  message: string;
}

export type ProductSupportCategory =
  | 'access'
  | 'billing'
  | 'refund'
  | 'deletion'
  | 'security'
  | 'ai_output'
  | 'other';

export interface ProductSupportSubmission {
  category: ProductSupportCategory;
  message: string;
  dictatedContent?: string;
  attachDictatedContent: boolean;
  attachmentWarningAccepted: boolean;
}

export interface ProductSupportReceipt {
  ticketId: string;
  submittedAt: string;
  status: 'received' | 'reviewing' | 'waiting_on_customer' | 'resolved' | 'closed';
}

export interface ProductSupportResponse {
  contractVersion: string;
  receipt: ProductSupportReceipt;
}

export interface ProductSupportStatusResponse {
  contractVersion: string;
  tickets: ProductSupportReceipt[];
}

export interface ProductAccountDeletionResponse {
  contractVersion: string;
  status: 'completed';
  providerCleanup: 'accepted' | 'hold';
  receipt: string;
}
