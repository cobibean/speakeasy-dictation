/** Capture-scoped opaque targets. Never substitute a newer capture's field. */
export class PasteTargetStore<T> {
  private readonly targets = new Map<string, { target: T; at: number }>();
  constructor(private readonly limit = 8, private readonly maxAgeMs = 15 * 60_000, private readonly now = Date.now) {}
  remember(captureId: string, target: T): void {
    this.prune();
    this.targets.set(captureId, { target, at: this.now() });
    while (this.targets.size > this.limit) this.targets.delete(this.targets.keys().next().value!);
  }
  take(captureId: string): T | undefined {
    this.prune();
    const entry = this.targets.get(captureId);
    this.targets.delete(captureId);
    return entry?.target;
  }
  forget(captureId: string): void { this.targets.delete(captureId); }
  private prune(): void {
    for (const [id, entry] of this.targets) if (this.now() - entry.at >= this.maxAgeMs) this.targets.delete(id);
  }
}
