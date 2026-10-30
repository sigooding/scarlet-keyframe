import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CUTOUT_LAYER_COLORS,
  depthAssetLabel,
  extractClipDepthInfo,
  MAX_DEPTH_CUTOUTS,
  type ClipDepthInfo,
  type ResizableLaneKey,
  type TimelineLaneId,
} from "../core/depthLanes";
import { formatTimecode } from "../core/timing";
import { clipAtFrame, type TimelineClip } from "../sequence/animate";
import type { BrowseMediaTarget, InspectorTab, UploadMediaTarget } from "./Inspector";
import { decodeDraggedAsset } from "./MediaBin";

export interface SelectedCutoutLayerState {
  frameId: string;
  layerIndex: number;
}

export function EyeIcon({ visible = true, size = 11 }: { visible?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1.2 7C2.4 4.3 4.5 3 7 3C9.5 3 11.6 4.3 12.8 7C11.6 9.7 9.5 11 7 11C4.5 11 2.4 9.7 1.2 7Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        opacity={visible ? 1 : 0.45}
      />
      <circle
        cx="7"
        cy="7"
        r="1.75"
        fill={visible ? "currentColor" : "none"}
        stroke={visible ? "none" : "currentColor"}
        strokeWidth="1.15"
        opacity={visible ? 1 : 0.45}
      />
      {!visible && (
        <path
          d="M2.1 11.9L11.9 2.1"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function LaneEyeButton({
  laneLabel,
  testId,
  visible = true,
  onClick,
}: {
  laneLabel: string;
  testId: string;
  visible?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`track-ms-btn is-eye ${!visible ? "is-hidden-state" : ""}`}
      data-testid={testId}
      aria-label={visible ? `Hide ${laneLabel} lane` : `Show ${laneLabel} lane`}
      aria-pressed={!visible}
      title={
        visible
          ? `Hide ${laneLabel} lane (restore from TRACKS eye menu)`
          : `Show ${laneLabel} lane`
      }
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <EyeIcon visible={visible} size={10} />
    </button>
  );
}

export function LaneResizeHandle({
  laneKey,
  label,
  currentHeight,
  onResize,
  onReset,
}: {
  laneKey: ResizableLaneKey;
  label: string;
  currentHeight: number;
  onResize: (key: ResizableLaneKey, nextHeight: number) => void;
  onReset: (key: ResizableLaneKey) => void;
}) {
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={`Resize ${label} lane`}
      data-testid={`lane-resize-${laneKey}`}
      className={`lane-resize-handle ${dragging ? "is-dragging" : ""}`}
      title={`Drag to resize ${label} height (${currentHeight}px · double-click to reset)`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset(laneKey);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
          pointerId: e.pointerId,
          startY: e.clientY,
          startHeight: currentHeight,
        };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const s = dragRef.current;
        if (!s || s.pointerId !== e.pointerId) return;
        const dy = e.clientY - s.startY;
        onResize(laneKey, s.startHeight + dy);
      }}
      onPointerUp={(e) => {
        const s = dragRef.current;
        if (!s || s.pointerId !== e.pointerId) return;
        dragRef.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        setDragging(false);
      }}
    />
  );
}

export interface DepthCutoutLaneHeadersProps {
  sublaneCount: number;
  cutoutsExpanded: boolean;
  showDepthMaps: boolean;
  showDepthMapOverlay: boolean;
  showCutouts: boolean;
  mutedCutoutLayers: ReadonlySet<number>;
  depthClipCount: number;
  cutoutClipCount: number;
  depthHeight?: number;
  cutoutsHeight?: number;
  cutoutSublaneHeight?: number;
  hiddenLanes?: ReadonlySet<TimelineLaneId>;
  hiddenCutoutSublanes?: ReadonlySet<number>;
  onToggleLaneVisible?: (lane: TimelineLaneId) => void;
  onToggleCutoutSublaneVisible?: (layerIndex: number) => void;
  onShowAllCutoutSublanes?: () => void;
  onResizeLane?: (key: ResizableLaneKey, nextHeight: number) => void;
  onResetLaneHeight?: (key: ResizableLaneKey) => void;
  onToggleCutoutsExpanded: () => void;
  onAddCutoutSublane: () => void;
  onToggleShowDepthMaps: () => void;
  onToggleShowDepthMapOverlay: () => void;
  onToggleShowCutouts: () => void;
  onToggleMuteCutoutLayer: (layerIndex: number) => void;
  onFocusInspectorTab?: (tab: InspectorTab) => void;
}

function ChevronIcon({ open, size = 8 }: { open: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden="true">
      {open ? (
        <path d="M1,2.2 L7,2.2 L4,6.4 Z" fill="currentColor" />
      ) : (
        <path d="M2.2,1 L6.4,4 L2.2,7 Z" fill="currentColor" />
      )}
    </svg>
  );
}

function DepthTrackIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M6 1.4L10.6 4L6 6.6L1.4 4L6 1.4Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M1.4 6.6L6 9.2L10.6 6.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CutoutsTrackIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect
        x="1.5"
        y="3.2"
        width="6.5"
        height="6.5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M4.5 2H9.3C9.96 2 10.5 2.54 10.5 3.2V8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DepthCutoutLaneHeaders({
  sublaneCount,
  cutoutsExpanded,
  showDepthMaps,
  showDepthMapOverlay,
  showCutouts,
  mutedCutoutLayers,
  depthClipCount,
  cutoutClipCount,
  depthHeight = 32,
  cutoutsHeight = 34,
  cutoutSublaneHeight = 30,
  hiddenLanes,
  hiddenCutoutSublanes,
  onToggleLaneVisible,
  onToggleCutoutSublaneVisible,
  onShowAllCutoutSublanes,
  onResizeLane,
  onResetLaneHeight,
  onToggleCutoutsExpanded,
  onAddCutoutSublane,
  onToggleShowDepthMaps,
  onToggleShowDepthMapOverlay,
  onToggleShowCutouts,
  onToggleMuteCutoutLayer,
  onFocusInspectorTab,
}: DepthCutoutLaneHeadersProps) {
  const depthHidden = hiddenLanes?.has("depth") ?? false;
  const cutoutsHidden = hiddenLanes?.has("cutouts") ?? false;
  const hiddenSublaneCount = useMemo(() => {
    if (!hiddenCutoutSublanes) return 0;
    let count = 0;
    for (let i = 0; i < sublaneCount; i += 1) {
      if (hiddenCutoutSublanes.has(i)) count += 1;
    }
    return count;
  }, [hiddenCutoutSublanes, sublaneCount]);

  return (
    <>
      {!depthHidden && (
        <div
          className={`track-header-row is-depth ${!showDepthMaps ? "is-silenced" : ""}`}
          data-testid="track-header-depth"
          style={{
            height: depthHeight,
            minHeight: depthHeight,
            maxHeight: depthHeight,
          }}
        >
          <div className="track-header-top">
            <button
              type="button"
              className="track-header-title"
              onClick={() => onFocusInspectorTab?.("clip")}
              title="Depth maps lane — click to open Clip / Depth settings in Inspector"
            >
              <i aria-hidden>
                <DepthTrackIcon />
              </i>{" "}
              Depth Maps
              {depthClipCount > 0 && (
                <small className="track-count-pill" title={`${depthClipCount} shots with depth maps`}>
                  {depthClipCount}
                </small>
              )}
            </button>
            <div className="track-header-btns">
              <button
                type="button"
                className={`track-ms-btn is-depth-map-view ${showDepthMapOverlay ? "is-active" : ""}`}
                data-testid="track-preview-depth-map"
                aria-label="Preview greyscale depth map in viewer"
                aria-pressed={showDepthMapOverlay}
                title={
                  showDepthMapOverlay
                    ? "Hide greyscale depth map preview in viewer"
                    : "Preview greyscale depth map in viewer"
                }
                onClick={onToggleShowDepthMapOverlay}
              >
                MAP
              </button>
              <button
                type="button"
                className={`track-ms-btn is-mute ${!showDepthMaps ? "is-active" : ""}`}
                data-testid="track-mute-depth"
                aria-label="Mute Depth Maps"
                aria-pressed={!showDepthMaps}
                title={showDepthMaps ? "Bypass depth maps in viewer" : "Enable depth maps in viewer"}
                onClick={onToggleShowDepthMaps}
              >
                M
              </button>
              {onToggleLaneVisible && (
                <LaneEyeButton
                  laneLabel="Depth Maps"
                  testId="track-eye-depth"
                  visible
                  onClick={() => onToggleLaneVisible("depth")}
                />
              )}
            </div>
          </div>
          {onResizeLane && onResetLaneHeight && (
            <LaneResizeHandle
              laneKey="depth"
              label="Depth Maps"
              currentHeight={depthHeight}
              onResize={onResizeLane}
              onReset={onResetLaneHeight}
            />
          )}
        </div>
      )}

      {!cutoutsHidden && (
        <>
          <div
            className={`track-header-row is-cutouts ${cutoutsExpanded ? "is-expanded" : ""} ${!showCutouts ? "is-silenced" : ""}`}
            data-testid="track-header-cutouts"
            style={{
              height: cutoutsHeight,
              minHeight: cutoutsHeight,
              maxHeight: cutoutsHeight,
            }}
          >
            <div className="track-header-top">
              <div className="track-header-expand-group">
                <button
                  type="button"
                  className={`track-expand-btn ${cutoutsExpanded ? "is-open" : ""}`}
                  data-testid="cutouts-lane-expand-btn"
                  aria-expanded={cutoutsExpanded}
                  aria-label={cutoutsExpanded ? "Collapse cutout layers" : "Expand cutout layers"}
                  title={
                    cutoutsExpanded
                      ? "Collapse individual cutout layer lanes"
                      : "Expand individual cutout layer lanes (Cutout 1–4)"
                  }
                  onClick={onToggleCutoutsExpanded}
                >
                  <ChevronIcon open={cutoutsExpanded} size={8} />
                </button>
                <button
                  type="button"
                  className="track-header-title"
                  onClick={() => onFocusInspectorTab?.("clip")}
                  onDoubleClick={onToggleCutoutsExpanded}
                  title="Cutouts lane — click arrow or double-click to expand individual cutout layers"
                >
                  <i aria-hidden>
                    <CutoutsTrackIcon />
                  </i>{" "}
                  Cutouts
                  {cutoutClipCount > 0 && (
                    <small className="track-count-pill" title={`${cutoutClipCount} shots with cutouts`}>
                      {cutoutClipCount}
                    </small>
                  )}
                </button>
              </div>
              <div className="track-header-btns">
                {cutoutsExpanded && hiddenSublaneCount > 0 && onShowAllCutoutSublanes && (
                  <button
                    type="button"
                    className="track-ms-btn is-eye is-hidden-state"
                    data-testid="cutouts-show-hidden-sublanes-btn"
                    title={`Show ${hiddenSublaneCount} hidden cutout layer lane${hiddenSublaneCount === 1 ? "" : "s"}`}
                    onClick={onShowAllCutoutSublanes}
                  >
                    <EyeIcon visible={false} size={10} />
                    <span>{hiddenSublaneCount}</span>
                  </button>
                )}
                {cutoutsExpanded && sublaneCount < MAX_DEPTH_CUTOUTS && (
                  <button
                    type="button"
                    className="track-ms-btn is-add-layer"
                    data-testid="cutouts-add-sublane-btn"
                    aria-label="Add cutout layer lane"
                    title={`Show Cutout ${sublaneCount + 1} lane (up to ${MAX_DEPTH_CUTOUTS})`}
                    onClick={onAddCutoutSublane}
                  >
                    +
                  </button>
                )}
                <button
                  type="button"
                  className={`track-ms-btn is-mute ${!showCutouts ? "is-active" : ""}`}
                  data-testid="track-mute-cutouts"
                  aria-label="Mute Cutouts"
                  aria-pressed={!showCutouts}
                  title={showCutouts ? "Hide cutouts in viewer" : "Show cutouts in viewer"}
                  onClick={onToggleShowCutouts}
                >
                  M
                </button>
                {onToggleLaneVisible && (
                  <LaneEyeButton
                    laneLabel="Cutouts"
                    testId="track-eye-cutouts"
                    visible
                    onClick={() => onToggleLaneVisible("cutouts")}
                  />
                )}
              </div>
            </div>
            {onResizeLane && onResetLaneHeight && (
              <LaneResizeHandle
                laneKey="cutouts"
                label="Cutouts"
                currentHeight={cutoutsHeight}
                onResize={onResizeLane}
                onReset={onResetLaneHeight}
              />
            )}
          </div>

          {cutoutsExpanded &&
            Array.from({ length: sublaneCount }, (_, layerIndex) => {
              if (hiddenCutoutSublanes?.has(layerIndex)) return null;
              const layerMuted = mutedCutoutLayers.has(layerIndex);
              const color = CUTOUT_LAYER_COLORS[layerIndex] ?? CUTOUT_LAYER_COLORS[0];
              return (
                <div
                  key={`cutout-sublane-header-${layerIndex}`}
                  className={`track-header-row is-cutout-sublane ${layerMuted || !showCutouts ? "is-silenced" : ""}`}
                  data-testid={`cutout-sublane-header-${layerIndex}`}
                  style={{
                    height: cutoutSublaneHeight,
                    minHeight: cutoutSublaneHeight,
                    maxHeight: cutoutSublaneHeight,
                  }}
                >
                  <div className="cutout-sublane-header-inner">
                    <span className="kf-sublane-dot" style={{ background: color }} />
                    <span className="kf-sublane-title">Cutout {layerIndex + 1}</span>
                    <button
                      type="button"
                      className={`track-ms-btn is-mute ${layerMuted ? "is-active" : ""}`}
                      data-testid={`track-mute-cutout-${layerIndex}`}
                      aria-label={`Mute Cutout ${layerIndex + 1}`}
                      aria-pressed={layerMuted}
                      title={
                        layerMuted
                          ? `Show Cutout ${layerIndex + 1} in viewer`
                          : `Hide Cutout ${layerIndex + 1} in viewer`
                      }
                      onClick={() => onToggleMuteCutoutLayer(layerIndex)}
                    >
                      M
                    </button>
                    {onToggleCutoutSublaneVisible && (
                      <LaneEyeButton
                        laneLabel={`Cutout ${layerIndex + 1}`}
                        testId={`track-eye-cutout-${layerIndex}`}
                        visible
                        onClick={() => onToggleCutoutSublaneVisible(layerIndex)}
                      />
                    )}
                  </div>
                  {onResizeLane && onResetLaneHeight && (
                    <LaneResizeHandle
                      laneKey="cutoutSublane"
                      label={`Cutout ${layerIndex + 1}`}
                      currentHeight={cutoutSublaneHeight}
                      onResize={onResizeLane}
                      onReset={onResetLaneHeight}
                    />
                  )}
                </div>
              );
            })}
        </>
      )}
    </>
  );
}

type LaneContextMenuState =
  | {
      kind: "depth";
      frameId: string;
      clientX: number;
      clientY: number;
    }
  | {
      kind: "cutouts-summary";
      frameId: string;
      clientX: number;
      clientY: number;
    }
  | {
      kind: "cutout-layer";
      frameId: string;
      layerIndex: number;
      clientX: number;
      clientY: number;
    };

export interface DepthCutoutCanvasLanesProps {
  clips: TimelineClip[];
  visibleClips: TimelineClip[];
  pxPerFrame: number;
  selectedFrameId: string;
  selectedFrameIds: string[];
  selectedCutoutLayer: SelectedCutoutLayerState | null;
  sublaneCount: number;
  cutoutsExpanded: boolean;
  showDepthMaps: boolean;
  showCutouts: boolean;
  mutedCutoutLayers: ReadonlySet<number>;
  depthHeight?: number;
  cutoutsHeight?: number;
  cutoutSublaneHeight?: number;
  hiddenLanes?: ReadonlySet<TimelineLaneId>;
  hiddenCutoutSublanes?: ReadonlySet<number>;
  resolveMedia: (value: string | undefined) => string | undefined;
  frameFromClientX: (clientX: number) => number;
  onToggleCutoutsExpanded: () => void;
  onSelectShot: (frameId: string, additive: boolean, targetFrame?: number) => void;
  onSelectCutoutLayer: (selection: SelectedCutoutLayerState | null) => void;
  onFocusInspectorTab?: (tab: InspectorTab) => void;
  onBrowseMediaForFrame?: (frameId: string, target: BrowseMediaTarget) => void;
  onUploadMediaForFrame?: (frameId: string, target: UploadMediaTarget) => void;
  onAssignDepthMap?: (frameId: string, ref: string | undefined, label?: string) => void;
  onAssignDepthPlate?: (frameId: string, ref: string | undefined, label?: string) => void;
  onDropDepthFile?: (file: File, frameId: string) => void;
  onAddCutout?: (frameId: string, ref: string) => void;
  onSetCutoutLayer?: (
    frameId: string,
    layerIndex: number,
    cutout: { image: string; depth?: number } | null,
    label?: string,
  ) => void;
  onDropCutoutFile?: (file: File, frameId: string, layerIndex?: number) => void;
  onPreviewCutoutDepth?: (frameId: string, layerIndex: number, depth: number) => void;
  onCommitCutoutDepth?: (frameId: string, layerIndex: number, depth: number, label?: string) => void;
  onMoveCutoutLayer?: (frameId: string, fromLayer: number, toLayer: number) => void;
  onClearCutouts?: (frameId: string) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
}

export function DepthCutoutCanvasLanes({
  clips,
  visibleClips,
  pxPerFrame,
  selectedFrameId,
  selectedFrameIds,
  selectedCutoutLayer,
  sublaneCount,
  cutoutsExpanded,
  showDepthMaps,
  showCutouts,
  mutedCutoutLayers,
  depthHeight = 32,
  cutoutsHeight = 34,
  cutoutSublaneHeight = 30,
  hiddenLanes,
  hiddenCutoutSublanes,
  resolveMedia,
  frameFromClientX,
  onToggleCutoutsExpanded,
  onSelectShot,
  onSelectCutoutLayer,
  onFocusInspectorTab,
  onBrowseMediaForFrame,
  onUploadMediaForFrame,
  onAssignDepthMap,
  onAssignDepthPlate,
  onDropDepthFile,
  onAddCutout,
  onSetCutoutLayer,
  onDropCutoutFile,
  onPreviewCutoutDepth,
  onCommitCutoutDepth,
  onMoveCutoutLayer,
  onClearCutouts,
  onDragStart,
  onDragEnd,
}: DepthCutoutCanvasLanesProps) {
  const [dropTarget, setDropTarget] = useState<{
    lane: "depth" | "cutouts" | `cutout:${number}`;
    frameId: string;
    startFrame: number;
    durationFrames: number;
    mark: string;
    number: number;
  } | null>(null);

  const [menu, setMenu] = useState<LaneContextMenuState | null>(null);

  const depthScrubRef = useRef<{
    pointerId: number;
    frameId: string;
    layerIndex: number;
    startX: number;
    initialDepth: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const visibleDepthMapByClipId = useMemo(() => {
    const map = new Map<string, ClipDepthInfo>();
    for (const clip of visibleClips) {
      if (clip.keyframe.beat.gap) continue;
      map.set(clip.keyframe.id, extractClipDepthInfo(clip));
    }
    return map;
  }, [visibleClips]);

  const resolveShotAtClientX = useCallback(
    (clientX: number): TimelineClip | null => {
      const f = frameFromClientX(clientX);
      const hit = clipAtFrame(clips, f);
      if (!hit || hit.keyframe.beat.gap) return null;
      return hit;
    },
    [clips, frameFromClientX],
  );

  const hasDroppableImage = (event: ReactDragEvent<HTMLElement>): boolean => {
    const asset = decodeDraggedAsset(event);
    if (asset) return asset.kind === "image";
    const items = event.dataTransfer?.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].kind === "file" && (!items[i].type || items[i].type.startsWith("image/"))) {
          return true;
        }
      }
    }
    return Boolean(event.dataTransfer?.files?.length);
  };

  const handleLaneDragOver = (
    lane: "depth" | "cutouts" | `cutout:${number}`,
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    if (!hasDroppableImage(event)) return;
    const targetClip = resolveShotAtClientX(event.clientX);
    if (!targetClip) {
      setDropTarget(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropTarget((prev) => {
      if (prev && prev.lane === lane && prev.frameId === targetClip.keyframe.id) return prev;
      return {
        lane,
        frameId: targetClip.keyframe.id,
        startFrame: targetClip.startFrame,
        durationFrames: targetClip.durationFrames,
        mark: targetClip.keyframe.mark,
        number: targetClip.keyframe.number,
      };
    });
  };

  const handleLaneDrop = (
    lane: "depth" | "cutouts" | `cutout:${number}`,
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    const targetClip = resolveShotAtClientX(event.clientX);
    setDropTarget(null);
    if (!targetClip) return;
    event.preventDefault();
    event.stopPropagation();

    const frameId = targetClip.keyframe.id;
    const asset = decodeDraggedAsset(event);
    if (asset && asset.kind === "image") {
      onSelectShot(frameId, false);
      onFocusInspectorTab?.("clip");
      if (lane === "depth") {
        onAssignDepthMap?.(frameId, asset.ref, "Depth map assigned");
      } else if (lane === "cutouts") {
        onAddCutout?.(frameId, asset.ref);
      } else {
        const layerIndex = Number(lane.split(":")[1]) || 0;
        onSetCutoutLayer?.(
          frameId,
          layerIndex,
          { image: asset.ref },
          `Cutout ${layerIndex + 1} assigned`,
        );
        onSelectCutoutLayer({ frameId, layerIndex });
      }
      return;
    }

    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onSelectShot(frameId, false);
      onFocusInspectorTab?.("clip");
      if (lane === "depth") {
        onDropDepthFile?.(file, frameId);
      } else if (lane === "cutouts") {
        onDropCutoutFile?.(file, frameId);
      } else {
        const layerIndex = Number(lane.split(":")[1]) || 0;
        onDropCutoutFile?.(file, frameId, layerIndex);
        onSelectCutoutLayer({ frameId, layerIndex });
      }
    }
  };

  const menuClip = useMemo(() => {
    if (!menu) return null;
    return clips.find((c) => c.keyframe.id === menu.frameId) ?? null;
  }, [clips, menu]);

  const menuDepthInfo = useMemo(() => {
    if (!menuClip) return null;
    return extractClipDepthInfo(menuClip);
  }, [menuClip]);

  const depthHidden = hiddenLanes?.has("depth") ?? false;
  const cutoutsHidden = hiddenLanes?.has("cutouts") ?? false;

  return (
    <>
      {/* 1. Depth Maps Lane */}
      {!depthHidden && (
      <div
        className={`timeline-depth-lane ${!showDepthMaps ? "is-lane-muted" : ""}`}
        data-testid="timeline-depth-lane"
        style={{
          height: depthHeight,
          minHeight: depthHeight,
          maxHeight: depthHeight,
        }}
        onDragOver={(e) => handleLaneDragOver("depth", e)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropTarget((prev) => (prev?.lane === "depth" ? null : prev));
          }
        }}
        onDrop={(e) => handleLaneDrop("depth", e)}
        onDoubleClick={(e) => {
          const hit = resolveShotAtClientX(e.clientX);
          if (!hit) return;
          e.stopPropagation();
          onSelectShot(hit.keyframe.id, false, hit.startFrame);
          onFocusInspectorTab?.("clip");
          onBrowseMediaForFrame?.(hit.keyframe.id, "depthMap");
        }}
        onContextMenu={(e) => {
          const hit = resolveShotAtClientX(e.clientX);
          if (!hit) return;
          e.preventDefault();
          e.stopPropagation();
          onSelectShot(hit.keyframe.id, false);
          setMenu({
            kind: "depth",
            frameId: hit.keyframe.id,
            clientX: e.clientX,
            clientY: e.clientY,
          });
        }}
      >
        {visibleClips.map((clip) => {
          const info = visibleDepthMapByClipId.get(clip.keyframe.id);
          if (!info?.depthMap) return null;
          const leftPx = clip.startFrame * pxPerFrame;
          const widthPx = Math.max(2, clip.durationFrames * pxPerFrame);
          const isSelected =
            selectedFrameId === clip.keyframe.id || selectedFrameIds.includes(clip.keyframe.id);
          const thumbSrc = resolveMedia(info.depthMap);
          const label = depthAssetLabel(info.depthMap, "Depth map");
          return (
            <div
              key={`depth-${clip.keyframe.id}`}
              className={[
                "depth-lane-block",
                isSelected ? "is-selected" : "",
                info.isCarriedDepth ? "is-carried" : "",
                !showDepthMaps ? "is-muted" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-testid={`depth-block-${clip.keyframe.id}`}
              data-depth-ref={info.depthMap}
              style={{ left: leftPx, width: widthPx }}
              title={`SC ${clip.keyframe.mark} · ${label} · Depth ${Math.round(info.depthAmount * 100)}%${info.depthPlate ? " · Clean plate attached" : ""}`}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onSelectCutoutLayer(null);
                onSelectShot(
                  clip.keyframe.id,
                  e.shiftKey || e.ctrlKey || e.metaKey,
                  clip.startFrame,
                );
                onFocusInspectorTab?.("clip");
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelectShot(clip.keyframe.id, false, clip.startFrame);
                onFocusInspectorTab?.("clip");
                onBrowseMediaForFrame?.(clip.keyframe.id, "depthMap");
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectShot(clip.keyframe.id, false);
                setMenu({
                  kind: "depth",
                  frameId: clip.keyframe.id,
                  clientX: e.clientX,
                  clientY: e.clientY,
                });
              }}
            >
              {widthPx >= 26 && thumbSrc && (
                <span className="depth-lane-thumb">
                  <img src={thumbSrc} alt="" loading="lazy" decoding="async" />
                </span>
              )}
              {widthPx >= 48 && <span className="depth-lane-label">{label}</span>}
              {widthPx >= 110 && (
                <span className="depth-lane-badges">
                  {info.depthPlate && <em className="depth-plate-chip">PLATE</em>}
                  <b>{Math.round(info.depthAmount * 100)}%</b>
                </span>
              )}
            </div>
          );
        })}

        {dropTarget?.lane === "depth" && (
          <div
            className="lane-shot-drop-ghost is-depth"
            data-testid="depth-drop-ghost"
            style={{
              left: dropTarget.startFrame * pxPerFrame,
              width: Math.max(24, dropTarget.durationFrames * pxPerFrame),
            }}
          >
            <span>◈ Drop depth map · SC {dropTarget.mark}</span>
          </div>
        )}
      </div>
      )}

      {/* 2. Cutouts Summary Lane (Expandable Parent Row) */}
      {!cutoutsHidden && (
      <>
      <div
        className={`timeline-cutouts-lane ${cutoutsExpanded ? "is-expanded" : ""} ${!showCutouts ? "is-lane-muted" : ""}`}
        data-testid="timeline-cutouts-lane"
        style={{
          height: cutoutsHeight,
          minHeight: cutoutsHeight,
          maxHeight: cutoutsHeight,
        }}
        onDragOver={(e) => handleLaneDragOver("cutouts", e)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropTarget((prev) => (prev?.lane === "cutouts" ? null : prev));
          }
        }}
        onDrop={(e) => handleLaneDrop("cutouts", e)}
        onDoubleClick={(e) => {
          const hit = resolveShotAtClientX(e.clientX);
          if (!hit) return;
          e.stopPropagation();
          onSelectShot(hit.keyframe.id, false, hit.startFrame);
          onFocusInspectorTab?.("clip");
          const info = extractClipDepthInfo(hit);
          if (info.activeCutouts.length > 0 && !cutoutsExpanded) {
            onToggleCutoutsExpanded();
          } else {
            onBrowseMediaForFrame?.(hit.keyframe.id, "cutout:add");
          }
        }}
        onContextMenu={(e) => {
          const hit = resolveShotAtClientX(e.clientX);
          if (!hit) return;
          e.preventDefault();
          e.stopPropagation();
          onSelectShot(hit.keyframe.id, false);
          setMenu({
            kind: "cutouts-summary",
            frameId: hit.keyframe.id,
            clientX: e.clientX,
            clientY: e.clientY,
          });
        }}
      >
        {visibleClips.map((clip) => {
          const info = visibleDepthMapByClipId.get(clip.keyframe.id);
          const count = (info?.activeCutouts.length ?? 0) + (info?.foregroundImage ? 1 : 0);
          if (!info || count === 0) return null;
          const leftPx = clip.startFrame * pxPerFrame;
          const widthPx = Math.max(2, clip.durationFrames * pxPerFrame);
          const isSelected =
            selectedFrameId === clip.keyframe.id || selectedFrameIds.includes(clip.keyframe.id);
          const firstRef = info.activeCutouts[0]?.image ?? info.foregroundImage;
          const label = depthAssetLabel(firstRef, "Cutout");
          return (
            <div
              key={`cutout-summary-${clip.keyframe.id}`}
              className={[
                "cutout-lane-block is-summary",
                isSelected ? "is-selected" : "",
                info.isCarriedCutouts ? "is-carried" : "",
                !showCutouts ? "is-muted" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-testid={`cutout-summary-block-${clip.keyframe.id}`}
              data-cutout-count={count}
              style={{ left: leftPx, width: widthPx }}
              title={`SC ${clip.keyframe.mark} · ${count} cutout layer${count === 1 ? "" : "s"} — double-click or click badge to ${cutoutsExpanded ? "collapse" : "expand"}`}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onSelectShot(
                  clip.keyframe.id,
                  e.shiftKey || e.ctrlKey || e.metaKey,
                  clip.startFrame,
                );
                onFocusInspectorTab?.("clip");
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelectShot(clip.keyframe.id, false, clip.startFrame);
                onToggleCutoutsExpanded();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectShot(clip.keyframe.id, false);
                setMenu({
                  kind: "cutouts-summary",
                  frameId: clip.keyframe.id,
                  clientX: e.clientX,
                  clientY: e.clientY,
                });
              }}
            >
              {widthPx >= 28 && (
                <span className="cutout-thumb-stack">
                  {info.activeCutouts.slice(0, widthPx >= 90 ? 3 : 1).map((layer) => {
                    const src = resolveMedia(layer.image);
                    return src ? (
                      <span
                        key={layer.layerIndex}
                        className="cutout-alpha-thumb"
                        style={{
                          borderColor: CUTOUT_LAYER_COLORS[layer.layerIndex] ?? CUTOUT_LAYER_COLORS[0],
                        }}
                      >
                        <img src={src} alt="" loading="lazy" decoding="async" />
                      </span>
                    ) : null;
                  })}
                </span>
              )}
              {widthPx >= 56 && <span className="cutout-lane-label">{label}</span>}
              {widthPx >= 40 && (
                <button
                  type="button"
                  className={`cutout-count-badge ${cutoutsExpanded ? "is-open" : ""}`}
                  data-testid={`cutout-summary-expand-${clip.keyframe.id}`}
                  title={cutoutsExpanded ? "Collapse cutout layers" : "Expand cutout layers"}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCutoutsExpanded();
                  }}
                >
                  <ChevronIcon open={cutoutsExpanded} size={7} />
                  <span>×{count}</span>
                </button>
              )}
            </div>
          );
        })}

        {dropTarget?.lane === "cutouts" && (
          <div
            className="lane-shot-drop-ghost is-cutouts"
            data-testid="cutouts-drop-ghost"
            style={{
              left: dropTarget.startFrame * pxPerFrame,
              width: Math.max(24, dropTarget.durationFrames * pxPerFrame),
            }}
          >
            <span>✂ Add cutout layer · SC {dropTarget.mark}</span>
          </div>
        )}
      </div>

      {/* 3. Expanded Individual Cutout Layer Sub-Lanes */}
      {cutoutsExpanded &&
        Array.from({ length: sublaneCount }, (_, layerIndex) => {
          if (hiddenCutoutSublanes?.has(layerIndex)) return null;
          const laneKey = `cutout:${layerIndex}` as const;
          const layerMuted = mutedCutoutLayers.has(layerIndex) || !showCutouts;
          const layerColor = CUTOUT_LAYER_COLORS[layerIndex] ?? CUTOUT_LAYER_COLORS[0];
          return (
            <div
              key={`timeline-cutout-sublane-${layerIndex}`}
              className={`timeline-cutout-sublane ${layerMuted ? "is-lane-muted" : ""}`}
              data-testid={`timeline-cutout-sublane-${layerIndex}`}
              data-layer-index={layerIndex}
              style={{
                height: cutoutSublaneHeight,
                minHeight: cutoutSublaneHeight,
                maxHeight: cutoutSublaneHeight,
              }}
              onDragOver={(e) => handleLaneDragOver(laneKey, e)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDropTarget((prev) => (prev?.lane === laneKey ? null : prev));
                }
              }}
              onDrop={(e) => handleLaneDrop(laneKey, e)}
              onDoubleClick={(e) => {
                const hit = resolveShotAtClientX(e.clientX);
                if (!hit) return;
                e.stopPropagation();
                onSelectShot(hit.keyframe.id, false, hit.startFrame);
                onSelectCutoutLayer({ frameId: hit.keyframe.id, layerIndex });
                onFocusInspectorTab?.("clip");
                onBrowseMediaForFrame?.(hit.keyframe.id, `cutout:${layerIndex}`);
              }}
              onContextMenu={(e) => {
                const hit = resolveShotAtClientX(e.clientX);
                if (!hit) return;
                e.preventDefault();
                e.stopPropagation();
                onSelectShot(hit.keyframe.id, false);
                onSelectCutoutLayer({ frameId: hit.keyframe.id, layerIndex });
                setMenu({
                  kind: "cutout-layer",
                  frameId: hit.keyframe.id,
                  layerIndex,
                  clientX: e.clientX,
                  clientY: e.clientY,
                });
              }}
            >
              {visibleClips.map((clip) => {
                const info = visibleDepthMapByClipId.get(clip.keyframe.id);
                const slot = info?.cutoutSlots[layerIndex];
                if (!info || !slot || !slot.image) return null;

                const leftPx = clip.startFrame * pxPerFrame;
                const widthPx = Math.max(2, clip.durationFrames * pxPerFrame);
                const isClipSelected =
                  selectedFrameId === clip.keyframe.id ||
                  selectedFrameIds.includes(clip.keyframe.id);
                const isLayerSelected =
                  selectedCutoutLayer?.frameId === clip.keyframe.id &&
                  selectedCutoutLayer?.layerIndex === layerIndex;
                const src = resolveMedia(slot.image);
                const label = depthAssetLabel(slot.image, `Cutout ${layerIndex + 1}`);

                return (
                  <div
                    key={`cutout-layer-${clip.keyframe.id}-${layerIndex}`}
                    className={[
                      "cutout-lane-block is-sublane",
                      isClipSelected ? "is-clip-selected" : "",
                      isLayerSelected ? "is-selected" : "",
                      info.isCarriedCutouts ? "is-carried" : "",
                      layerMuted ? "is-muted" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-testid={`cutout-layer-block-${clip.keyframe.id}-${layerIndex}`}
                    data-cutout-ref={slot.image}
                    data-cutout-depth={slot.depth}
                    style={{
                      left: leftPx,
                      width: widthPx,
                      borderColor: isLayerSelected ? layerColor : undefined,
                      ["--cutout-accent" as string]: layerColor,
                    }}
                    title={`Cutout ${layerIndex + 1} · ${label} · Depth z=${slot.depth.toFixed(2)} (drag z badge to scrub depth, double-click to replace)`}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      onSelectCutoutLayer({ frameId: clip.keyframe.id, layerIndex });
                      onSelectShot(
                        clip.keyframe.id,
                        e.shiftKey || e.ctrlKey || e.metaKey,
                        clip.startFrame,
                      );
                      onFocusInspectorTab?.("clip");
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onSelectCutoutLayer({ frameId: clip.keyframe.id, layerIndex });
                      onSelectShot(clip.keyframe.id, false, clip.startFrame);
                      onFocusInspectorTab?.("clip");
                      onBrowseMediaForFrame?.(clip.keyframe.id, `cutout:${layerIndex}`);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectCutoutLayer({ frameId: clip.keyframe.id, layerIndex });
                      onSelectShot(clip.keyframe.id, false);
                      setMenu({
                        kind: "cutout-layer",
                        frameId: clip.keyframe.id,
                        layerIndex,
                        clientX: e.clientX,
                        clientY: e.clientY,
                      });
                    }}
                  >
                    <span className="cutout-sublane-bar" style={{ background: layerColor }} />
                    {widthPx >= 24 && src && (
                      <span className="cutout-alpha-thumb">
                        <img src={src} alt="" loading="lazy" decoding="async" />
                      </span>
                    )}
                    {widthPx >= 52 && <span className="cutout-lane-label">{label}</span>}
                    {widthPx >= 76 && (
                      <span
                        className="cutout-depth-scrub-pill"
                        data-testid={`cutout-depth-pill-${clip.keyframe.id}-${layerIndex}`}
                        title="Drag horizontally to adjust cutout parallax depth (0.00 far – 1.00 near)"
                        onPointerDown={(e: ReactPointerEvent<HTMLSpanElement>) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          depthScrubRef.current = {
                            pointerId: e.pointerId,
                            frameId: clip.keyframe.id,
                            layerIndex,
                            startX: e.clientX,
                            initialDepth: slot.depth,
                            moved: false,
                          };
                          onSelectCutoutLayer({ frameId: clip.keyframe.id, layerIndex });
                          onSelectShot(clip.keyframe.id, false);
                        }}
                        onPointerMove={(e: ReactPointerEvent<HTMLSpanElement>) => {
                          const s = depthScrubRef.current;
                          if (!s || s.pointerId !== e.pointerId) return;
                          const dx = e.clientX - s.startX;
                          if (!s.moved && Math.abs(dx) < 3) return;
                          if (!s.moved) {
                            s.moved = true;
                            onDragStart();
                          }
                          const nextDepth = Math.max(
                            0,
                            Math.min(1, Math.round((s.initialDepth + dx * 0.005) * 1000) / 1000),
                          );
                          onPreviewCutoutDepth?.(s.frameId, s.layerIndex, nextDepth);
                        }}
                        onPointerUp={(e: ReactPointerEvent<HTMLSpanElement>) => {
                          const s = depthScrubRef.current;
                          if (!s || s.pointerId !== e.pointerId) return;
                          depthScrubRef.current = null;
                          if (s.moved) {
                            const dx = e.clientX - s.startX;
                            const nextDepth = Math.max(
                              0,
                              Math.min(1, Math.round((s.initialDepth + dx * 0.005) * 1000) / 1000),
                            );
                            if (onPreviewCutoutDepth) {
                              onPreviewCutoutDepth(s.frameId, s.layerIndex, nextDepth);
                              onDragEnd(`Cutout ${s.layerIndex + 1} depth updated`);
                            } else {
                              onCommitCutoutDepth?.(
                                s.frameId,
                                s.layerIndex,
                                nextDepth,
                                `Cutout ${s.layerIndex + 1} depth updated`,
                              );
                            }
                          }
                        }}
                      >
                        z {slot.depth.toFixed(2)}
                      </span>
                    )}
                    {widthPx >= 112 && onSetCutoutLayer && (
                      <button
                        type="button"
                        className="cutout-remove-inline-btn"
                        data-testid={`cutout-remove-btn-${clip.keyframe.id}-${layerIndex}`}
                        aria-label={`Remove Cutout ${layerIndex + 1}`}
                        title={`Remove Cutout ${layerIndex + 1} from shot`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e: ReactMouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          onSetCutoutLayer(
                            clip.keyframe.id,
                            layerIndex,
                            null,
                            `Cutout ${layerIndex + 1} removed`,
                          );
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              {dropTarget?.lane === laneKey && (
                <div
                  className="lane-shot-drop-ghost is-cutouts"
                  data-testid={`cutout-sublane-drop-ghost-${layerIndex}`}
                  style={{
                    left: dropTarget.startFrame * pxPerFrame,
                    width: Math.max(24, dropTarget.durationFrames * pxPerFrame),
                    borderColor: layerColor,
                  }}
                >
                  <span>
                    ✂ Drop Cutout {layerIndex + 1} · SC {dropTarget.mark}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </>
      )}

      {/* Context Menu for Depth Maps & Cutout Lanes */}
      {menu && menuClip && menuDepthInfo && (
        <div
          className="diamond-easing-menu depth-cutout-context-menu"
          data-testid="depth-cutout-context-menu"
          role="menu"
          style={{
            left: Math.min(
              typeof window !== "undefined" ? window.innerWidth - 250 : menu.clientX,
              menu.clientX,
            ),
            top: Math.min(
              typeof window !== "undefined" ? window.innerHeight - 320 : menu.clientY,
              menu.clientY,
            ),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="diamond-menu-head">
            <span>
              {menu.kind === "depth"
                ? `Depth Map · SC ${menuClip.keyframe.mark}`
                : menu.kind === "cutouts-summary"
                  ? `Cutouts · SC ${menuClip.keyframe.mark}`
                  : `Cutout ${menu.layerIndex + 1} · SC ${menuClip.keyframe.mark}`}
            </span>
            <small>{formatTimecode(menuClip.startFrame)}</small>
          </div>

          {menu.kind === "depth" && (
            <>
              <button
                type="button"
                className="diamond-menu-item is-primary"
                data-testid="depth-menu-choose-map"
                onClick={() => {
                  const fid = menu.frameId;
                  setMenu(null);
                  onBrowseMediaForFrame?.(fid, "depthMap");
                }}
              >
                <span>{menuDepthInfo.depthMap ? "Replace depth map…" : "Choose depth map…"}</span>
              </button>
              <button
                type="button"
                className="diamond-menu-item"
                data-testid="depth-menu-upload-map"
                onClick={() => {
                  const fid = menu.frameId;
                  setMenu(null);
                  onUploadMediaForFrame?.(fid, "depthMap");
                }}
              >
                <span>Upload depth map…</span>
              </button>
              <hr className="diamond-menu-sep" />
              <button
                type="button"
                className="diamond-menu-item"
                data-testid="depth-menu-choose-plate"
                onClick={() => {
                  const fid = menu.frameId;
                  setMenu(null);
                  onBrowseMediaForFrame?.(fid, "depthPlate");
                }}
              >
                <span>
                  {menuDepthInfo.depthPlate ? "Replace clean plate…" : "Assign clean plate…"}
                </span>
              </button>
              {menuDepthInfo.depthPlate && (
                <button
                  type="button"
                  className="diamond-menu-item"
                  data-testid="depth-menu-clear-plate"
                  onClick={() => {
                    const fid = menu.frameId;
                    setMenu(null);
                    onAssignDepthPlate?.(fid, undefined, "Clean plate cleared");
                  }}
                >
                  <span>Clear clean plate</span>
                </button>
              )}
              {menuDepthInfo.depthMap && (
                <>
                  <hr className="diamond-menu-sep" />
                  <button
                    type="button"
                    className="diamond-menu-item"
                    data-testid="depth-menu-clear-map"
                    onClick={() => {
                      const fid = menu.frameId;
                      setMenu(null);
                      onAssignDepthMap?.(fid, undefined, "Depth map cleared");
                    }}
                  >
                    <span>Clear depth map</span>
                    <small>Del</small>
                  </button>
                </>
              )}
            </>
          )}

          {menu.kind === "cutouts-summary" && (
            <>
              <button
                type="button"
                className="diamond-menu-item is-primary"
                data-testid="cutouts-menu-toggle-expand"
                onClick={() => {
                  setMenu(null);
                  onToggleCutoutsExpanded();
                }}
              >
                <span>{cutoutsExpanded ? "Collapse cutout layers" : "Expand cutout layers"}</span>
                <small>{cutoutsExpanded ? "▲" : "▼"}</small>
              </button>
              <button
                type="button"
                className="diamond-menu-item"
                data-testid="cutouts-menu-add-project"
                onClick={() => {
                  const fid = menu.frameId;
                  setMenu(null);
                  onBrowseMediaForFrame?.(fid, "cutout:add");
                }}
              >
                <span>Add cutout from project…</span>
              </button>
              <button
                type="button"
                className="diamond-menu-item"
                data-testid="cutouts-menu-upload"
                onClick={() => {
                  const fid = menu.frameId;
                  setMenu(null);
                  onUploadMediaForFrame?.(fid, "cutout:add");
                }}
              >
                <span>Upload cutout PNG…</span>
              </button>
              {menuDepthInfo.activeCutouts.length > 0 && (
                <>
                  <hr className="diamond-menu-sep" />
                  <button
                    type="button"
                    className="diamond-menu-item"
                    data-testid="cutouts-menu-clear-all"
                    onClick={() => {
                      const fid = menu.frameId;
                      setMenu(null);
                      onClearCutouts?.(fid);
                    }}
                  >
                    <span>Clear all cutouts on shot</span>
                  </button>
                </>
              )}
            </>
          )}

          {menu.kind === "cutout-layer" && (() => {
            const slot = menuDepthInfo.cutoutSlots[menu.layerIndex];
            const occupied = Boolean(slot?.image);
            return (
              <>
                <button
                  type="button"
                  className="diamond-menu-item is-primary"
                  data-testid="cutout-layer-menu-choose"
                  onClick={() => {
                    const { frameId, layerIndex } = menu;
                    setMenu(null);
                    onBrowseMediaForFrame?.(frameId, `cutout:${layerIndex}`);
                  }}
                >
                  <span>
                    {occupied
                      ? `Replace Cutout ${menu.layerIndex + 1}…`
                      : `Choose Cutout ${menu.layerIndex + 1}…`}
                  </span>
                </button>
                <button
                  type="button"
                  className="diamond-menu-item"
                  data-testid="cutout-layer-menu-upload"
                  onClick={() => {
                    const { frameId, layerIndex } = menu;
                    setMenu(null);
                    onUploadMediaForFrame?.(frameId, `cutout:${layerIndex}`);
                  }}
                >
                  <span>Upload Cutout {menu.layerIndex + 1} PNG…</span>
                </button>

                {occupied && (
                  <>
                    <hr className="diamond-menu-sep" />
                    {(
                      [
                        { label: "Depth: Foreground (0.85)", depth: 0.85 },
                        { label: "Depth: Midground (0.60)", depth: 0.6 },
                        { label: "Depth: Background (0.30)", depth: 0.3 },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.depth}
                        type="button"
                        className="diamond-menu-item"
                        onClick={() => {
                          const { frameId, layerIndex } = menu;
                          setMenu(null);
                          onCommitCutoutDepth?.(
                            frameId,
                            layerIndex,
                            preset.depth,
                            `Cutout ${layerIndex + 1} depth set to ${preset.depth.toFixed(2)}`,
                          );
                        }}
                      >
                        <span>{preset.label}</span>
                      </button>
                    ))}
                    <hr className="diamond-menu-sep" />
                    {menu.layerIndex > 0 && (
                      <button
                        type="button"
                        className="diamond-menu-item"
                        data-testid="cutout-layer-menu-move-up"
                        onClick={() => {
                          const { frameId, layerIndex } = menu;
                          setMenu(null);
                          onMoveCutoutLayer?.(frameId, layerIndex, layerIndex - 1);
                          onSelectCutoutLayer({ frameId, layerIndex: layerIndex - 1 });
                        }}
                      >
                        <span>Move to Cutout {menu.layerIndex}</span>
                        <small>↑</small>
                      </button>
                    )}
                    {menu.layerIndex < MAX_DEPTH_CUTOUTS - 1 && (
                      <button
                        type="button"
                        className="diamond-menu-item"
                        data-testid="cutout-layer-menu-move-down"
                        onClick={() => {
                          const { frameId, layerIndex } = menu;
                          setMenu(null);
                          onMoveCutoutLayer?.(frameId, layerIndex, layerIndex + 1);
                          onSelectCutoutLayer({ frameId, layerIndex: layerIndex + 1 });
                        }}
                      >
                        <span>Move to Cutout {menu.layerIndex + 2}</span>
                        <small>↓</small>
                      </button>
                    )}
                    <hr className="diamond-menu-sep" />
                    <button
                      type="button"
                      className="diamond-menu-item"
                      data-testid="cutout-layer-menu-remove"
                      onClick={() => {
                        const { frameId, layerIndex } = menu;
                        setMenu(null);
                        onSetCutoutLayer?.(
                          frameId,
                          layerIndex,
                          null,
                          `Cutout ${layerIndex + 1} removed`,
                        );
                        onSelectCutoutLayer(null);
                      }}
                    >
                      <span>Remove Cutout {menu.layerIndex + 1}</span>
                      <small>Del</small>
                    </button>
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}
