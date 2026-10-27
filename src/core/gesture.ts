import type { UndoHistory } from "./history";

// A drag (trim, keyframe move, slider sweep) is ONE undo step: the state before the gesture is recorded
// once, when the gesture ends, however many intermediate states the drag produced.
export class GestureHistory<T> {
  private base: T | null = null;
  private readonly history: UndoHistory<T>;

  constructor(history: UndoHistory<T>) {
    this.history = history;
  }

  get active(): boolean {
    return this.base !== null;
  }

  // The state the running gesture began with; a drag that measures from where it started uses this.
  get origin(): T | null {
    return this.base;
  }

  begin(current: T | null | undefined): void {
    this.base = current ?? null;
  }

  // Records the pre-gesture state if the gesture actually changed anything. Returns true when a step
  // was added to the undo history.
  commit(current: T | null | undefined): boolean {
    const base = this.base;
    this.base = null;
    if (base === null || current === null || current === undefined || current === base) return false;
    this.history.record(base);
    return true;
  }

  cancel(): void {
    this.base = null;
  }
}
