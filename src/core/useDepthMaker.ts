import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createDepthMaker, type ApplyCutouts, type ApplyDepthMap, type DepthMakerController, type DepthMakerState, type DepthQuality } from "./depthMaker";

const QUALITY_KEY = "frame24.depthQuality";

/** The quality chosen last time ("best" the first time). Browser storage may be blocked: then it is simply "best". */
export function readStoredQuality(storage: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): DepthQuality {
  try {
    const value = storage?.getItem(QUALITY_KEY);
    return value === "fast" || value === "best" ? value : "best";
  } catch {
    return "best";
  }
}

export function storeQuality(quality: DepthQuality, storage: Pick<Storage, "setItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  try {
    storage?.setItem(QUALITY_KEY, quality);
  } catch {
    /* not saved: the next visit starts at "best" again */
  }
}

/**
 * One depth-map / cut-out / model-download controller for the whole editor session (so something being made is not lost when
 * another shot is chosen), as React state. `apply` and `applyCutouts` put finished layers on their shot; the latest ones are
 * always used.
 */
export function useDepthMaker(deps: { apply: ApplyDepthMap; applyCutouts: ApplyCutouts }): { controller: DepthMakerController; state: DepthMakerState } {
  const applyRef = useRef(deps.apply);
  const cutoutsRef = useRef(deps.applyCutouts);
  useEffect(() => {
    applyRef.current = deps.apply;
    cutoutsRef.current = deps.applyCutouts;
  });
  const controller = useMemo(
    () =>
      createDepthMaker({
        apply: (frameId, picture, mapRef, replaced) => applyRef.current(frameId, picture, mapRef, replaced),
        applyCutouts: (frameId, picture, made) => cutoutsRef.current(frameId, picture, made),
        quality: readStoredQuality(),
        onQualityChange: (quality) => storeQuality(quality),
      }),
    [],
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  return { controller, state };
}
