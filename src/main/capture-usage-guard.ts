// An in-progress or failed capture has no newer snapshot to supersede an older
// acknowledgment. Reject only responses older than one already applied.
export class CaptureUsageGuard {
  private sequence = 0;
  private appliedSequence = 0;

  startCapture(): number { return ++this.sequence; }

  accept(sequence: number, sameOwner: boolean): boolean {
    if (!sameOwner || sequence < this.appliedSequence) return false;
    this.appliedSequence = sequence;
    return true;
  }
}
