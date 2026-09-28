interface AuthResumeIdentity {
  transactionId: string;
  authGeneration: number;
}

export const isCurrentAuthResume = (
  origin: AuthResumeIdentity,
  current: AuthResumeIdentity | null,
  currentGeneration: number
): boolean =>
  current !== null &&
  current.transactionId === origin.transactionId &&
  current.authGeneration === origin.authGeneration &&
  currentGeneration === origin.authGeneration;

export class AuthResumeSingleFlight<T> {
  private active: { transactionId: string; promise: Promise<T> } | null = null;

  get(transactionId?: string): Promise<T> | null {
    if (
      !this.active ||
      (transactionId && transactionId !== this.active.transactionId)
    ) {
      return null;
    }
    return this.active.promise;
  }

  run(transactionId: string, task: () => Promise<T>): Promise<T> {
    const existing = this.get(transactionId);
    if (existing) {
      return existing;
    }

    let promise: Promise<T>;
    if (this.active) {
      promise = this.active.promise
        .catch(() => undefined)
        .then(task);
    } else {
      try {
        promise = task();
      } catch (error) {
        return Promise.reject(error);
      }
    }

    this.active = { transactionId, promise };
    void promise
      .finally(() => {
        if (this.active?.promise === promise) {
          this.active = null;
        }
      })
      .catch(() => undefined);
    return promise;
  }
}
