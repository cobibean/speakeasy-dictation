export class PendingOperationRecoveryRequiredError extends Error {
  constructor() {
    super('Pending hosted operations must be reconciled before local sign-in can be reset.');
    this.name = 'PendingOperationRecoveryRequiredError';
  }
}

export interface LocalSignInResetDependencies {
  pendingOperationCount: () => Promise<number>;
  deleteSecureValue: (key: string) => Promise<void>;
  getAuthGeneration: () => number;
  setAuthGeneration: (value: number) => void;
}

export const resetLocalSignInState = async (
  dependencies: LocalSignInResetDependencies
): Promise<void> => {
  if ((await dependencies.pendingOperationCount()) > 0) {
    throw new PendingOperationRecoveryRequiredError();
  }

  const generation = dependencies.getAuthGeneration();
  dependencies.setAuthGeneration(
    Number.isSafeInteger(generation) ? generation + 1 : 1
  );
  await dependencies.deleteSecureValue('productSessionEncrypted');
  await dependencies.deleteSecureValue('pendingAuthTransactionEncrypted');
};
