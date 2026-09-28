export class StaleSessionRefreshError extends Error {
  constructor() {
    super('The session changed while its token was refreshing.');
    this.name = 'StaleSessionRefreshError';
  }
}

interface RefreshOperations<Session> {
  readCurrent: () => Session | null;
  store: (session: Session) => void | Promise<void>;
  clear: () => void | Promise<void>;
}

interface InFlightRefresh<Session> {
  generation: number;
  identity: string;
  promise: Promise<Session>;
}

export class SessionRefreshGuard<Session> {
  private generation = 0;
  private currentIdentity: string | null = null;
  private inFlight: InFlightRefresh<Session> | null = null;

  constructor(private readonly getIdentity: (session: Session) => string) {}

  recordMutation(session: Session | null): void {
    this.generation += 1;
    this.currentIdentity = session ? this.getIdentity(session) : null;
    this.inFlight = null;
  }

  refresh(
    origin: Session,
    operation: (session: Session) => Promise<Session>,
    operations: RefreshOperations<Session>
  ): Promise<Session> {
    const identity = this.getIdentity(origin);
    if (this.currentIdentity !== identity) {
      this.recordMutation(origin);
    }

    const generation = this.generation;
    if (
      this.inFlight?.generation === generation &&
      this.inFlight.identity === identity
    ) {
      return this.inFlight.promise;
    }

    const refreshPromise = this.runRefresh(
      origin,
      generation,
      identity,
      operation,
      operations
    );
    const trackedPromise = refreshPromise.finally(() => {
      if (this.inFlight?.promise === trackedPromise) {
        this.inFlight = null;
      }
    });

    this.inFlight = { generation, identity, promise: trackedPromise };
    return trackedPromise;
  }

  private async runRefresh(
    origin: Session,
    generation: number,
    identity: string,
    operation: (session: Session) => Promise<Session>,
    operations: RefreshOperations<Session>
  ): Promise<Session> {
    let nextSession: Session;
    try {
      nextSession = await operation(origin);
    } catch (error) {
      if (this.isCurrent(generation, identity, operations.readCurrent())) {
        this.recordMutation(null);
        await operations.clear();
      }
      throw error;
    }

    if (this.isCurrent(generation, identity, operations.readCurrent())) {
      this.recordMutation(nextSession);
      await operations.store(nextSession);
      return nextSession;
    }

    const currentSession = operations.readCurrent();
    if (currentSession) {
      return currentSession;
    }

    throw new StaleSessionRefreshError();
  }

  private isCurrent(
    generation: number,
    identity: string,
    currentSession: Session | null
  ): boolean {
    return (
      this.generation === generation &&
      this.currentIdentity === identity &&
      currentSession !== null &&
      this.getIdentity(currentSession) === identity
    );
  }
}
