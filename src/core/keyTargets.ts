export interface KeyTargetLike {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown | null;
}

/** Whether the focused element (or one of its ancestors) should handle navigation keys itself. */
export function controlOwnsArrowKeys(target: KeyTargetLike | null | undefined): boolean {
  if (!target) return false;
  const tagName = target.tagName.toUpperCase();
  const inputType = (target.type || "text").toLowerCase();

  if (tagName === "INPUT" && (inputType === "range" || inputType === "number")) return true;
  if (tagName === "SELECT" || tagName === "TEXTAREA" || target.isContentEditable) return true;
  return Boolean(target.closest?.("[data-owns-arrow-keys]"));
}
