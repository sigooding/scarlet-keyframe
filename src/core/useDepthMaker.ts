import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createDepthMaker, type ApplyDepthMap, type DepthMakerController, type DepthMakerState } from "./depthMaker";

/**
 * One depth-map controller for the whole editor session (so a map being made is not lost when another shot is
 * chosen), as React state. `apply` puts a finished map on its shot; the latest one is always used.
 */
export function useDepthMaker(apply: ApplyDepthMap): { controller: DepthMakerController; state: DepthMakerState } {
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  const controller = useMemo(() => createDepthMaker({ apply: (frameId, picture, mapRef) => applyRef.current(frameId, picture, mapRef) }), []);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  return { controller, state };
}
