import type { SetupPracticeGrantState } from './setup-bootstrap.js';

export type PracticeAttemptAllowance = 'practice-grant' | 'unavailable';

export const choosePracticeAttemptAllowance = (
  grantStatus: SetupPracticeGrantState['status'] | undefined,
  preview = false
): PracticeAttemptAllowance =>
  grantStatus === 'available' || preview ? 'practice-grant' : 'unavailable';

export const practiceAttemptUsesGrant = ({
  attemptAllowance,
  grantStatus,
  preview = false
}: {
  attemptAllowance: PracticeAttemptAllowance | null;
  grantStatus: SetupPracticeGrantState['status'] | undefined;
  preview?: boolean;
}): boolean =>
  (attemptAllowance ?? choosePracticeAttemptAllowance(grantStatus, preview)) ===
  'practice-grant';
