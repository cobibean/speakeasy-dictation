export interface HostedActivation<T> {
  routeNow: boolean;
  activation: T | null;
}

export class HostedBootstrapActivationGate<T> {
  private ready = false;
  private pending: T[] = [];

  constructor(initialActivation: T | null = null) {
    if (initialActivation) {
      this.pending.push(initialActivation);
    }
  }

  isOpen(): boolean {
    return this.ready;
  }

  receive(activation: T | null): HostedActivation<T> {
    if (this.ready) {
      return { routeNow: true, activation };
    }
    if (activation) {
      this.pending.push(activation);
    }
    return { routeNow: false, activation: null };
  }

  open(): T[] {
    if (this.ready) {
      return [];
    }
    this.ready = true;
    const activations = this.pending;
    this.pending = [];
    return activations;
  }
}
