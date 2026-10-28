export class UndoHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private dragStart: T | undefined;
  readonly limit: number;

  constructor(limit = 80) {
    this.limit = limit;
  }

  record(previous: T): void {
    this.dragStart = undefined;
    this.past.push(previous);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  beginDrag(initial: T): void {
    if (this.dragStart === undefined) {
      this.dragStart = initial;
    }
  }

  commitDrag(finalState: T): boolean {
    const initial = this.dragStart;
    this.dragStart = undefined;
    if (initial === undefined || initial === finalState) return false;
    this.past.push(initial);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    return true;
  }

  cancelDrag(): void {
    this.dragStart = undefined;
  }

  undo(current: T): T | undefined {
    this.dragStart = undefined;
    const previous = this.past.pop();
    if (previous === undefined) return undefined;
    this.future.push(current);
    return previous;
  }

  redo(current: T): T | undefined {
    this.dragStart = undefined;
    const next = this.future.pop();
    if (next === undefined) return undefined;
    this.past.push(current);
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.dragStart = undefined;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
