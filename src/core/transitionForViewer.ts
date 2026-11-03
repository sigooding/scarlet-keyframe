import type { ActiveTransition } from "../sequence/transitions";

export interface ViewerTransitionOptions {
  playing: boolean;
  compare: boolean;
  renderMode: boolean;
  editView: boolean;
  selectedClipId?: string | null;
  transition?: ActiveTransition;
}

/** Hides a dissolve only when paused Edit view is showing one of its participating clips alone. */
export function transitionForViewer({
  playing,
  compare,
  renderMode,
  editView,
  selectedClipId,
  transition,
}: ViewerTransitionOptions): ActiveTransition | undefined {
  if (
    renderMode ||
    playing ||
    compare ||
    !editView ||
    !transition ||
    transition.kind !== "dissolve" ||
    !selectedClipId
  ) {
    return transition;
  }

  const selectedClipIsInTransition =
    transition.outgoingClip.keyframe.id === selectedClipId ||
    transition.incomingClip.keyframe.id === selectedClipId;
  return selectedClipIsInTransition ? undefined : transition;
}
