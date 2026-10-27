import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cinematicLayer } from "../../vendor/scarlet-reel/cinematicRenderer";
import type { CinematicSettings } from "../../vendor/scarlet-reel/types";
import {
  FrameCinematicOverlays,
  FrameGrainOverlay,
  FrameLensFlareLayer,
  FrameLightGlow,
} from "./FrameCinematicOverlays";
import { FrameDepthParallaxLayer } from "./FrameDepthParallax";
import { FrameParticles, type ParticleKind } from "./FrameParticles";
import {
  activeCaptionAtLocalFrame,
  DEFAULT_CAPTION_STYLE,
  isNarrationBeat,
  normalizeCaptionStyle,
  wrapCaptionLines,
  type CaptionStyle,
} from "../core/captions";
import type { BeatAnimation, KenBurnsBox, Keyframe } from "../core/model";
import { pictureLabel, storyboardGradient } from "../core/helpers";
import { clipFrames, formatTimecode, FPS } from "../core/timing";
import {
  applyKenBurnsBoxes,
  applyPoseAtPlayhead,
  clampKenBurnsBox,
  clampPoseToPictureEdges,
  clampPropValue,
  effectiveFrameCinematic,
  evaluate,
  hasCustomTransform,
  kenBurnsBoxFromDrag,
  minZoomForRotation,
  poseToKenBurnsBox,
  zoomPoseAroundPointer,
  type EvaluatedPose,
} from "../sequence/animate";
import type { ActiveTransition } from "../sequence/transitions";

export interface CinematicPreviewProps {
  frame: Keyframe;
  localFrame?: number;
  presetFrame?: number;
  shotKeyId?: string;
  carriedStartPose?: Partial<EvaluatedPose>;
  clipDurationFrames?: number;
  playheadFrame?: number;
  totalFrames?: number;
  captionStyle?: CaptionStyle;
  imageSrc?: string;
  imagePosition?: string;
  prevOnionSrc?: string;
  nextOnionSrc?: string;
  transition?: ActiveTransition;
  outgoingImageSrc?: string;
  outgoingImagePosition?: string;
  outgoingPresetFrame?: number;
  outgoingShotKeyId?: string;
  incomingImageSrc?: string;
  incomingImagePosition?: string;
  incomingPresetFrame?: number;
  incomingShotKeyId?: string;
  videoLevel?: number;
  resolveMedia: (value: string | undefined) => string | undefined;
  playing: boolean;
  soundOn: boolean;
  showCaption: boolean;
  showMark: boolean;
  showTimecodeOverlay?: boolean;
  showSafeGuides?: boolean;
  showOnionSkin?: boolean;
  isFullscreen?: boolean;
  interactiveFraming?: boolean;
  isClipSelected?: boolean;
  kenBurnsSuppressed?: boolean;
  kenBurnsDrawStep?: "start" | "end" | null;
  kenBurnsDraftStart?: KenBurnsBox | null;
  externalEdgeWarningToken?: number;
  onToggleSafeGuides?: () => void;
  onToggleOnionSkin?: () => void;
  onToggleTimecodeOverlay?: () => void;
  onToggleMarkOverlay?: () => void;
  onToggleFullscreen?: () => void;
  onToggleKenBurns?: () => void;
  onStartKenBurnsRedraw?: () => void;
  onClearKenBurns?: () => void;
  onCompleteKenBurnsDraw?: (step: "start" | "end", box: KenBurnsBox) => void;
  onDragStart?: () => void;
  onDragEnd?: (label: string) => void;
  onPreviewAnimation?: (animation: BeatAnimation | undefined) => void;
  onCommitAnimation?: (animation: BeatAnimation | undefined, label: string) => void;
  setFocalPoint?: (value: string) => void;
}

type KBCorner = "nw" | "ne" | "sw" | "se";

export function CinematicPreview({
  frame,
  localFrame = 0,
  presetFrame,
  shotKeyId,
  carriedStartPose,
  clipDurationFrames,
  playheadFrame = 0,
  totalFrames = 0,
  captionStyle,
  imageSrc,
  imagePosition,
  prevOnionSrc,
  nextOnionSrc,
  transition,
  outgoingImageSrc,
  outgoingImagePosition,
  outgoingPresetFrame,
  outgoingShotKeyId,
  incomingImageSrc,
  incomingImagePosition,
  incomingPresetFrame,
  incomingShotKeyId,
  videoLevel = 1,
  resolveMedia,
  playing,
  soundOn,
  showCaption,
  showMark,
  showTimecodeOverlay = false,
  showSafeGuides = false,
  showOnionSkin = false,
  isFullscreen = false,
  interactiveFraming = false,
  isClipSelected = true,
  kenBurnsSuppressed = false,
  kenBurnsDrawStep = null,
  kenBurnsDraftStart = null,
  externalEdgeWarningToken = 0,
  onToggleSafeGuides,
  onToggleOnionSkin,
  onToggleTimecodeOverlay,
  onToggleMarkOverlay,
  onToggleFullscreen,
  onToggleKenBurns,
  onStartKenBurnsRedraw,
  onClearKenBurns,
  onCompleteKenBurnsDraw,
  onDragStart,
  onDragEnd,
  onPreviewAnimation,
  onCommitAnimation: _onCommitAnimation,
  setFocalPoint,
}: CinematicPreviewProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [edgeWarningMsg, setEdgeWarningMsg] = useState<string | null>(null);
  const edgeTimerRef = useRef<number | null>(null);
  const [shiftAxisGuide, setShiftAxisGuide] = useState<"x" | "y" | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [liveDrawBox, setLiveDrawBox] = useState<KenBurnsBox | null>(null);

  const triggerEdgeWarning = useCallback((msg: string) => {
    setEdgeWarningMsg(msg);
    if (edgeTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(edgeTimerRef.current);
    }
    if (typeof window !== "undefined") {
      edgeTimerRef.current = window.setTimeout(() => {
        setEdgeWarningMsg(null);
        edgeTimerRef.current = null;
      }, 1800);
    }
  }, []);

  useEffect(() => {
    if (externalEdgeWarningToken > 0) {
      triggerEdgeWarning("Picture edge reached — clamped to avoid black border");
    }
  }, [externalEdgeWarningToken, triggerEdgeWarning]);

  useEffect(() => {
    return () => {
      if (edgeTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(edgeTimerRef.current);
      }
    };
  }, []);

  const cinematic = frame.beat.gap
    ? {}
    : ((effectiveFrameCinematic(frame) || {}) as Record<string, any>);
  const ownOverlay = cinematic.vignette ? "fx-vignette" : "";
  const previewTimeSec = (presetFrame ?? localFrame) / FPS;

  const style = normalizeCaptionStyle(captionStyle ?? DEFAULT_CAPTION_STYLE);
  const resolvedClipDuration =
    clipDurationFrames !== undefined && clipDurationFrames > 0
      ? clipDurationFrames
      : clipFrames(frame);
  const activeCaption = useMemo(
    () => activeCaptionAtLocalFrame(frame.beat, resolvedClipDuration, localFrame),
    [frame.beat, resolvedClipDuration, localFrame],
  );
  const wrappedCaptionText = useMemo(
    () => (activeCaption ? wrapCaptionLines(activeCaption.text, 42).join("\n") : ""),
    [activeCaption],
  );
  const isNarration = isNarrationBeat(frame.beat);

  const hasEditablePicture =
    !frame.beat.gap && Boolean(imageSrc || (frame.picture && frame.picture.length > 0));
  const storedKenBurns = frame.beat.animation?.kenBurns;
  const showKenBurnsBoxes =
    interactiveFraming &&
    isClipSelected &&
    hasEditablePicture &&
    !playing &&
    !isFullscreen &&
    (kenBurnsDrawStep !== null || (Boolean(storedKenBurns) && !kenBurnsSuppressed));

  const canDirectFrame =
    interactiveFraming &&
    hasEditablePicture &&
    !playing &&
    !isFullscreen &&
    !showKenBurnsBoxes;

  const viewerCin = effectiveFrameCinematic(frame);
  const hasViewerDepth = Boolean(
    viewerCin?.depthMap &&
      imageSrc &&
      !String(frame.picture || "").startsWith("video:") &&
      !String(frame.picture || "").startsWith("gradient:") &&
      String(viewerCin?.mode ?? "pan") !== "dolly",
  );

  const currentEvaluatedPose = useMemo(
    () => evaluate(frame, localFrame, carriedStartPose),
    [frame, localFrame, carriedStartPose],
  );
  const currentClampedPose = useMemo(() => {
    if (hasViewerDepth) {
      return {
        zoom: Math.max(1, currentEvaluatedPose.zoom),
        x: clampPropValue("x", currentEvaluatedPose.x),
        y: clampPropValue("y", currentEvaluatedPose.y),
        rotation: clampPropValue("rotation", currentEvaluatedPose.rotation),
        clamped: currentEvaluatedPose.zoom < 1,
      };
    }
    return clampPoseToPictureEdges(currentEvaluatedPose);
  }, [currentEvaluatedPose, hasViewerDepth]);
  const poseHitsEdge =
    hasEditablePicture &&
    hasCustomTransform(frame) &&
    currentClampedPose.clamped;

  // Keep refs fresh for wheel listener without re-binding passive:false handler on every frame
  const latestRef = useRef({
    frame,
    localFrame,
    carriedStartPose,
    hasViewerDepth,
    canDirectFrame,
    onDragStart,
    onDragEnd,
    onPreviewAnimation,
    triggerEdgeWarning,
  });
  latestRef.current = {
    frame,
    localFrame,
    carriedStartPose,
    hasViewerDepth,
    canDirectFrame,
    onDragStart,
    onDragEnd,
    onPreviewAnimation,
    triggerEdgeWarning,
  };

  const wheelSessionRef = useRef<{ active: boolean; timer: number | null }>({
    active: false,
    timer: null,
  });

  useEffect(() => {
    const el = previewRef.current;
    if (!el || !interactiveFraming) return;

    const handleWheel = (event: WheelEvent) => {
      const state = latestRef.current;
      if (!state.canDirectFrame || !state.onPreviewAnimation) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      if (!wheelSessionRef.current.active) {
        wheelSessionRef.current.active = true;
        state.onDragStart?.();
      }
      if (wheelSessionRef.current.timer !== null) {
        window.clearTimeout(wheelSessionRef.current.timer);
      }
      wheelSessionRef.current.timer = window.setTimeout(() => {
        if (wheelSessionRef.current.active) {
          wheelSessionRef.current.active = false;
          wheelSessionRef.current.timer = null;
          latestRef.current.onDragEnd?.("Zoomed shot around pointer");
        }
      }, 260);

      const normX = (event.clientX - rect.left) / rect.width;
      const normY = (event.clientY - rect.top) / rect.height;

      const curRaw = evaluate(state.frame, state.localFrame, state.carriedStartPose);
      const curPose = state.hasViewerDepth
        ? {
            zoom: Math.max(1, curRaw.zoom),
            x: curRaw.x,
            y: curRaw.y,
            rotation: curRaw.rotation,
            clamped: false,
          }
        : clampPoseToPictureEdges(curRaw);
      const factor = Math.exp(-event.deltaY * 0.0018);
      const targetZoom = curPose.zoom * factor;

      const zoomed = zoomPoseAroundPointer(curPose, targetZoom, normX, normY);
      if (zoomed.clamped) {
        const minZ = minZoomForRotation(curPose.rotation);
        state.triggerEdgeWarning(
          targetZoom < minZ
            ? "Picture edge reached — cannot zoom out past picture border"
            : "Picture edge reached — clamped to avoid black border",
        );
      }

      const anim = state.frame.beat.animation;
      const includeX =
        Math.abs(zoomed.x - curPose.x) > 1e-6 ||
        Boolean(anim?.x?.length) ||
        typeof anim?.values?.x === "number";
      const includeY =
        Math.abs(zoomed.y - curPose.y) > 1e-6 ||
        Boolean(anim?.y?.length) ||
        typeof anim?.values?.y === "number";

      const nextAnim = applyPoseAtPlayhead(anim, state.localFrame, {
        zoom: zoomed.zoom,
        ...(includeX ? { x: zoomed.x } : {}),
        ...(includeY ? { y: zoomed.y } : {}),
      });
      state.onPreviewAnimation(nextAnim);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      if (wheelSessionRef.current.timer !== null) {
        window.clearTimeout(wheelSessionRef.current.timer);
        wheelSessionRef.current.timer = null;
      }
    };
  }, [interactiveFraming]);

  // Direct pan drag session
  const panSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    rectWidth: number;
    rectHeight: number;
    initialPose: { zoom: number; x: number; y: number; rotation: number };
    initialAnim: BeatAnimation | undefined;
    moved: boolean;
  } | null>(null);

  // Rotation handle drag session
  const rotateSessionRef = useRef<{
    pointerId: number;
    centerX: number;
    centerY: number;
    startAngleDeg: number;
    initialPose: { zoom: number; x: number; y: number; rotation: number };
    initialAnim: BeatAnimation | undefined;
  } | null>(null);

  // Ken Burns draw / adjust session
  const kbSessionRef = useRef<{
    pointerId: number;
    mode: "draw" | "move" | "resize";
    which: "start" | "end";
    corner?: KBCorner;
    rectLeft: number;
    rectTop: number;
    rectWidth: number;
    rectHeight: number;
    anchorX: number;
    anchorY: number;
    initialBox: KenBurnsBox;
    lastBox?: KenBurnsBox;
    otherBox: KenBurnsBox;
  } | null>(null);

  const clampedVideoLevel = Math.max(0, Math.min(1, Number.isFinite(videoLevel) ? videoLevel : 1));
  const p = transition ? Math.max(0, Math.min(1, transition.progress)) : 0;

  let outgoingWrapperStyle: CSSProperties | undefined;
  let incomingWrapperStyle: CSSProperties | undefined;

  if (transition) {
    if (transition.kind === "dissolve") {
      outgoingWrapperStyle = { opacity: 1, transition: "none", animation: "none" };
      incomingWrapperStyle = { opacity: p, transition: "none", animation: "none" };
    } else if (transition.kind === "dip-to-black") {
      const outOpacity = p < 0.5 ? Math.max(0, Math.min(1, 1 - p * 2)) : 0;
      const inOpacity = p >= 0.5 ? Math.max(0, Math.min(1, (p - 0.5) * 2)) : 0;
      outgoingWrapperStyle = { opacity: outOpacity, transition: "none", animation: "none" };
      incomingWrapperStyle = { opacity: inOpacity, transition: "none", animation: "none" };
    } else if (transition.kind === "wipe-left") {
      outgoingWrapperStyle = { opacity: 1, transition: "none", animation: "none" };
      incomingWrapperStyle = {
        opacity: 1,
        clipPath: `inset(0 0 0 ${((1 - p) * 100).toFixed(4)}%)`,
        transition: "none",
        animation: "none",
      };
    } else if (transition.kind === "wipe-right") {
      outgoingWrapperStyle = { opacity: 1, transition: "none", animation: "none" };
      incomingWrapperStyle = {
        opacity: 1,
        clipPath: `inset(0 ${((1 - p) * 100).toFixed(4)}% 0 0)`,
        transition: "none",
        animation: "none",
      };
    }
  }

  const showEdgeBanner = Boolean(edgeWarningMsg) || poseHitsEdge;

  return (
    <div
      ref={previewRef}
      className={[
        "cin-preview",
        frame.beat.gap ? "" : ownOverlay,
        canDirectFrame ? "is-direct-framing" : "",
        isPanning ? "is-panning" : "",
        showEdgeBanner ? "is-edge-clamped" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="cinematic-preview"
      data-gap={frame.beat.gap ? "true" : undefined}
      data-transition-kind={transition?.kind || "none"}
      data-transition-progress={transition ? p.toFixed(4) : undefined}
      onPointerDown={(event) => {
        if (!canDirectFrame || event.button !== 0 || !onPreviewAnimation) return;
        const target = event.target as HTMLElement | null;
        if (
          target?.closest(
            ".cin-kb-trigger-wrap, .cin-corner-toggles, .cin-rotation-gizmo, .cin-ken-burns-layer, button",
          )
        ) {
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        panSessionRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          rectWidth: rect.width,
          rectHeight: rect.height,
          initialPose: { ...currentClampedPose },
          initialAnim: frame.beat.animation,
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        const session = panSessionRef.current;
        if (!session || session.pointerId !== event.pointerId || !onPreviewAnimation) return;
        let dxPx = event.clientX - session.startX;
        let dyPx = event.clientY - session.startY;
        if (!session.moved && Math.hypot(dxPx, dyPx) < 2) return;
        if (!session.moved) {
          session.moved = true;
          setIsPanning(true);
          onDragStart?.();
        }

        let lockedAxis: "x" | "y" | null = null;
        if (event.shiftKey) {
          if (Math.abs(dxPx) >= Math.abs(dyPx)) {
            dyPx = 0;
            lockedAxis = "x";
          } else {
            dxPx = 0;
            lockedAxis = "y";
          }
        }
        setShiftAxisGuide(lockedAxis);

        const rawX = session.initialPose.x + (dxPx / session.rectWidth) * 100;
        const rawY = session.initialPose.y + (dyPx / session.rectHeight) * 100;
        const clamped = hasViewerDepth
          ? {
              zoom: Math.max(1, session.initialPose.zoom),
              x: clampPropValue("x", rawX),
              y: clampPropValue("y", rawY),
              rotation: session.initialPose.rotation,
              clamped: false,
            }
          : clampPoseToPictureEdges({
              zoom: session.initialPose.zoom,
              x: rawX,
              y: rawY,
              rotation: session.initialPose.rotation,
            });

        if (clamped.clamped) {
          triggerEdgeWarning(
            session.initialPose.zoom <= 1.0001
              ? "Zoom in first to pan — clamped at picture edge"
              : "Picture edge reached — clamped to avoid black border",
          );
        }

        const posePatch: Partial<{ zoom: number; x: number; y: number; rotation: number }> = {};
        if (lockedAxis === "x" && Math.abs(clamped.y - session.initialPose.y) < 1e-6) {
          posePatch.x = clamped.x;
        } else if (lockedAxis === "y" && Math.abs(clamped.x - session.initialPose.x) < 1e-6) {
          posePatch.y = clamped.y;
        } else {
          posePatch.x = clamped.x;
          posePatch.y = clamped.y;
        }
        if (Math.abs(clamped.zoom - session.initialPose.zoom) > 1e-6) {
          posePatch.zoom = clamped.zoom;
        }

        const nextAnim = applyPoseAtPlayhead(session.initialAnim, localFrame, posePatch);
        onPreviewAnimation(nextAnim);
      }}
      onPointerUp={(event) => {
        const session = panSessionRef.current;
        if (!session || session.pointerId !== event.pointerId) return;
        panSessionRef.current = null;
        setShiftAxisGuide(null);
        setIsPanning(false);
        if (session.moved) {
          onDragEnd?.("Framed shot position");
        } else if (event.altKey && setFocalPoint) {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
          const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
          setFocalPoint(`${Math.round(x)}% ${Math.round(y)}%`);
        }
      }}
      onPointerCancel={() => {
        const session = panSessionRef.current;
        panSessionRef.current = null;
        setShiftAxisGuide(null);
        setIsPanning(false);
        if (session?.moved) onDragEnd?.("Framed shot position");
      }}
    >
      <div
        className="cin-video-bus"
        data-testid="cinematic-video-bus"
        style={{ opacity: clampedVideoLevel, transition: "none", animation: "none" }}
      >
        {(() => {
          const outKey = transition
            ? outgoingShotKeyId || transition.outgoingClip.keyframe.id
            : undefined;
          const rawInKey = transition
            ? incomingShotKeyId || transition.incomingClip.keyframe.id
            : shotKeyId || frame.id;
          const inKey =
            transition && rawInKey === outKey
              ? transition.incomingClip.keyframe.id
              : rawInKey;

          const items = transition
            ? [
                {
                  keyId: outKey!,
                  role: "outgoing" as const,
                  testId: "transition-outgoing" as string | undefined,
                  plateTestId: "cinematic-plate-outgoing",
                  style: { ...outgoingWrapperStyle, zIndex: 1 } as CSSProperties,
                  shotFrame: transition.outgoingClip.keyframe,
                  shotLocalFrame: transition.outLocalFrame,
                  shotPresetFrame: outgoingPresetFrame ?? transition.outLocalFrame,
                  shotCarriedStartPose: transition.outgoingClip.carriedStartPose,
                  shotImageSrc: outgoingImageSrc,
                  shotImagePosition: outgoingImagePosition,
                  shotSoundOn: soundOn,
                  forceUncropped: false,
                },
                {
                  keyId: inKey,
                  role: "incoming" as const,
                  testId: "transition-incoming" as string | undefined,
                  plateTestId: "cinematic-plate",
                  style: { ...incomingWrapperStyle, zIndex: 2 } as CSSProperties,
                  shotFrame: transition.incomingClip.keyframe,
                  shotLocalFrame: transition.inLocalFrame,
                  shotPresetFrame: incomingPresetFrame ?? transition.inLocalFrame,
                  shotCarriedStartPose: transition.incomingClip.carriedStartPose,
                  shotImageSrc: incomingImageSrc,
                  shotImagePosition: incomingImagePosition,
                  shotSoundOn: false,
                  forceUncropped: false,
                },
              ]
            : [
                {
                  keyId: inKey,
                  role: "steady" as const,
                  testId: undefined,
                  plateTestId: "cinematic-plate",
                  style: {
                    opacity: 1,
                    zIndex: 2,
                    transition: "none",
                    animation: "none",
                  } as CSSProperties,
                  shotFrame: frame,
                  shotLocalFrame: localFrame,
                  shotPresetFrame: presetFrame ?? localFrame,
                  shotCarriedStartPose: carriedStartPose,
                  shotImageSrc: imageSrc,
                  shotImagePosition: imagePosition,
                  shotSoundOn: soundOn,
                  forceUncropped: showKenBurnsBoxes,
                },
              ];

          return items.map((item) => (
            <div
              key={`shot-${item.keyId}`}
              className={`cin-transition-layer cin-transition-${item.role}`}
              data-testid={item.testId}
              style={item.style}
            >
              <ShotLayer
                frame={item.shotFrame}
                seedId={item.keyId}
                localFrame={item.shotLocalFrame}
                presetFrame={item.shotPresetFrame}
                carriedStartPose={item.shotCarriedStartPose}
                imageSrc={item.shotImageSrc}
                imagePosition={item.shotImagePosition}
                resolveMedia={resolveMedia}
                soundOn={item.shotSoundOn}
                plateTestId={item.plateTestId}
                forceUncropped={item.forceUncropped}
              />
            </div>
          ));
        })()}
      </div>
      <FrameGrainOverlay active={!frame.beat.gap && Boolean(cinematic.grain)} timeSec={previewTimeSec} />

      {/* Onion skin overlay: previous and next clips' pictures at 30% opacity */}
      {showOnionSkin && (prevOnionSrc || nextOnionSrc) && (
        <div
          className="cin-onion-skin-layer"
          data-testid="viewer-onion-skin"
          aria-hidden="true"
        >
          {prevOnionSrc && (
            <div
              className="cin-onion-plate cin-onion-prev"
              data-testid="viewer-onion-prev"
              style={{
                opacity: 0.3,
                backgroundImage: prevOnionSrc.startsWith("gradient:")
                  ? prevOnionSrc.slice(9)
                  : `url(${JSON.stringify(prevOnionSrc)})`,
              }}
            />
          )}
          {nextOnionSrc && (
            <div
              className="cin-onion-plate cin-onion-next"
              data-testid="viewer-onion-next"
              style={{
                opacity: 0.3,
                backgroundImage: nextOnionSrc.startsWith("gradient:")
                  ? nextOnionSrc.slice(9)
                  : `url(${JSON.stringify(nextOnionSrc)})`,
              }}
            />
          )}
          <div className="cin-onion-legend">
            {prevOnionSrc && <span>PREV 30%</span>}
            {nextOnionSrc && <span>NEXT 30%</span>}
          </div>
        </div>
      )}

      {/* Action-safe (90%) and Title-safe (80%) guides */}
      {showSafeGuides && (
        <div
          className="cin-safe-guides"
          data-testid="viewer-safe-guides"
          aria-hidden="true"
        >
          <div className="cin-safe-box cin-action-safe" data-testid="viewer-action-safe">
            <span>ACTION SAFE 90%</span>
          </div>
          <div className="cin-safe-box cin-title-safe" data-testid="viewer-title-safe">
            <span>TITLE SAFE 80%</span>
          </div>
          <i className="cin-safe-center-h" />
          <i className="cin-safe-center-v" />
        </div>
      )}

      {shiftAxisGuide && (
        <div
          className={`cin-shift-axis-guide is-axis-${shiftAxisGuide}`}
          data-testid={`viewer-axis-guide-${shiftAxisGuide}`}
          aria-hidden="true"
        />
      )}

      {/* Round handle at the top sets rotation */}
      {canDirectFrame && onPreviewAnimation && (
        <div className="cin-rotation-gizmo" data-testid="viewer-rotation-gizmo">
          <i className="cin-rotation-stem" aria-hidden="true" />
          <button
            type="button"
            className={`cin-rotation-handle ${isRotating ? "is-dragging" : ""}`}
            data-testid="viewer-rotation-handle"
            aria-label="Rotate shot"
            title={`Drag to rotate (${currentClampedPose.rotation.toFixed(1)}°)`}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              const previewEl = previewRef.current;
              if (!previewEl) return;
              const rect = previewEl.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              const startAngleDeg = (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI;
              event.currentTarget.setPointerCapture(event.pointerId);
              onDragStart?.();
              setIsRotating(true);
              rotateSessionRef.current = {
                pointerId: event.pointerId,
                centerX: cx,
                centerY: cy,
                startAngleDeg,
                initialPose: { ...currentClampedPose },
                initialAnim: frame.beat.animation,
              };
            }}
            onPointerMove={(event) => {
              const session = rotateSessionRef.current;
              if (!session || session.pointerId !== event.pointerId) return;
              const curAngleDeg =
                (Math.atan2(event.clientY - session.centerY, event.clientX - session.centerX) *
                  180) /
                Math.PI;
              const delta = ((curAngleDeg - session.startAngleDeg + 540) % 360) - 180;
              const rawRot = clampPropValue("rotation", session.initialPose.rotation + delta);
              const clamped = clampPoseToPictureEdges({
                zoom: session.initialPose.zoom,
                x: session.initialPose.x,
                y: session.initialPose.y,
                rotation: rawRot,
              });
              if (clamped.clamped) {
                triggerEdgeWarning("Auto-clamped zoom/position so rotated frame never shows black");
              }
              const patch: Partial<{ zoom: number; x: number; y: number; rotation: number }> = {
                rotation: clamped.rotation,
              };
              if (Math.abs(clamped.zoom - session.initialPose.zoom) > 1e-6) {
                patch.zoom = clamped.zoom;
              }
              if (Math.abs(clamped.x - session.initialPose.x) > 1e-5) {
                patch.x = clamped.x;
              }
              if (Math.abs(clamped.y - session.initialPose.y) > 1e-5) {
                patch.y = clamped.y;
              }
              onPreviewAnimation(applyPoseAtPlayhead(session.initialAnim, localFrame, patch));
            }}
            onPointerUp={(event) => {
              const session = rotateSessionRef.current;
              if (!session || session.pointerId !== event.pointerId) return;
              rotateSessionRef.current = null;
              setIsRotating(false);
              onDragEnd?.("Rotated shot");
            }}
            onPointerCancel={() => {
              if (!rotateSessionRef.current) return;
              rotateSessionRef.current = null;
              setIsRotating(false);
              onDragEnd?.("Rotated shot");
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M9.5 4.2A4 4 0 1 0 10 6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M9.8 1.9v2.5H7.3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {(isRotating || Math.abs(currentClampedPose.rotation) > 0.05) && (
            <span className="cin-rotation-readout" data-testid="viewer-rotation-readout">
              {currentClampedPose.rotation.toFixed(1)}°
            </span>
          )}
        </div>
      )}

      {/* Ken Burns START / END 16:9 interactive box layer */}
      {showKenBurnsBoxes && (
        <div
          className={`cin-ken-burns-layer ${kenBurnsDrawStep ? "is-drawing" : "is-adjusting"}`}
          data-testid="ken-burns-layer"
          onPointerDown={(event) => {
            if (!kenBurnsDrawStep || event.button !== 0) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest(".cin-kb-banner-actions, button")) return;
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const ax = clamp01((event.clientX - rect.left) / rect.width);
            const ay = clamp01((event.clientY - rect.top) / rect.height);
            event.currentTarget.setPointerCapture(event.pointerId);
            const initial = clampKenBurnsBox({ x: ax, y: ay, width: 0.25 }).box;
            setLiveDrawBox(initial);
            kbSessionRef.current = {
              pointerId: event.pointerId,
              mode: "draw",
              which: kenBurnsDrawStep,
              rectLeft: rect.left,
              rectTop: rect.top,
              rectWidth: rect.width,
              rectHeight: rect.height,
              anchorX: ax,
              anchorY: ay,
              initialBox: initial,
              otherBox:
                kenBurnsDrawStep === "end" && kenBurnsDraftStart
                  ? kenBurnsDraftStart
                  : storedKenBurns?.end ?? { x: 0.1, y: 0.1, width: 0.8 },
            };
          }}
          onPointerMove={(event) => {
            const session = kbSessionRef.current;
            if (!session || session.pointerId !== event.pointerId) return;
            const px = (event.clientX - session.rectLeft) / session.rectWidth;
            const py = (event.clientY - session.rectTop) / session.rectHeight;

            if (session.mode === "draw") {
              const drawn = kenBurnsBoxFromDrag(session.anchorX, session.anchorY, px, py);
              if (drawn.clamped) {
                triggerEdgeWarning("Ken Burns 16:9 box clamped to picture edge");
              }
              session.lastBox = drawn.box;
              setLiveDrawBox(drawn.box);
              return;
            }

            if (session.mode === "move") {
              const dx = px - session.anchorX;
              const dy = py - session.anchorY;
              const moved = clampKenBurnsBox({
                x: session.initialBox.x + dx,
                y: session.initialBox.y + dy,
                width: session.initialBox.width,
              });
              if (moved.clamped) {
                triggerEdgeWarning("Ken Burns 16:9 box clamped to picture edge");
              }
              const nextStart = session.which === "start" ? moved.box : session.otherBox;
              const nextEnd = session.which === "end" ? moved.box : session.otherBox;
              const applied = applyKenBurnsBoxes(
                frame.beat.animation,
                nextStart,
                nextEnd,
                resolvedClipDuration,
              );
              onPreviewAnimation?.(applied.animation);
              return;
            }

            if (session.mode === "resize") {
              const resized = kenBurnsBoxFromDrag(session.anchorX, session.anchorY, px, py);
              if (resized.clamped) {
                triggerEdgeWarning("Ken Burns 16:9 box clamped to picture edge");
              }
              const nextStart = session.which === "start" ? resized.box : session.otherBox;
              const nextEnd = session.which === "end" ? resized.box : session.otherBox;
              const applied = applyKenBurnsBoxes(
                frame.beat.animation,
                nextStart,
                nextEnd,
                resolvedClipDuration,
              );
              onPreviewAnimation?.(applied.animation);
            }
          }}
          onPointerUp={(event) => {
            const session = kbSessionRef.current;
            if (!session || session.pointerId !== event.pointerId) return;
            kbSessionRef.current = null;
            if (session.mode === "draw") {
              const finalBox = session.lastBox ?? liveDrawBox ?? session.initialBox;
              setLiveDrawBox(null);
              onCompleteKenBurnsDraw?.(session.which, finalBox);
            } else {
              onDragEnd?.(`Adjusted Ken Burns ${session.which.toUpperCase()} box`);
            }
          }}
          onPointerCancel={() => {
            const session = kbSessionRef.current;
            kbSessionRef.current = null;
            setLiveDrawBox(null);
            if (session && session.mode !== "draw") {
              onDragEnd?.(`Adjusted Ken Burns ${session.which.toUpperCase()} box`);
            }
          }}
        >
          <div className="cin-kb-banner" data-testid="ken-burns-banner">
            <span>
              {kenBurnsDrawStep === "start"
                ? "KEN BURNS · Drag on picture to draw START (16:9)"
                : kenBurnsDrawStep === "end"
                  ? "KEN BURNS · Drag on picture to draw END (16:9)"
                  : "KEN BURNS · Drag START / END boxes or corners · Press Space to play"}
            </span>
            <div className="cin-kb-banner-actions">
              {!kenBurnsDrawStep && onStartKenBurnsRedraw && (
                <button
                  type="button"
                  data-testid="ken-burns-redraw-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartKenBurnsRedraw();
                  }}
                >
                  Redraw
                </button>
              )}
              {!kenBurnsDrawStep && onClearKenBurns && (
                <button
                  type="button"
                  data-testid="ken-burns-clear-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearKenBurns();
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {(() => {
            const dispStart =
              kenBurnsDrawStep === "start"
                ? liveDrawBox
                : kenBurnsDrawStep === "end"
                  ? kenBurnsDraftStart
                  : storedKenBurns?.start ?? null;
            const dispEnd =
              kenBurnsDrawStep === "end"
                ? liveDrawBox
                : kenBurnsDrawStep === "start"
                  ? null
                  : storedKenBurns?.end ?? null;
            const nowBox =
              !kenBurnsDrawStep && storedKenBurns
                ? poseToKenBurnsBox(currentClampedPose)
                : null;

            const startInteractiveMove = (
              which: "start" | "end",
              box: KenBurnsBox,
              other: KenBurnsBox,
              e: React.PointerEvent<HTMLElement>,
            ) => {
              if (kenBurnsDrawStep || e.button !== 0) return;
              e.stopPropagation();
              const layerEl = e.currentTarget.closest(".cin-ken-burns-layer") as HTMLElement | null;
              if (!layerEl) return;
              const rect = layerEl.getBoundingClientRect();
              layerEl.setPointerCapture(e.pointerId);
              onDragStart?.();
              kbSessionRef.current = {
                pointerId: e.pointerId,
                mode: "move",
                which,
                rectLeft: rect.left,
                rectTop: rect.top,
                rectWidth: rect.width,
                rectHeight: rect.height,
                anchorX: (e.clientX - rect.left) / rect.width,
                anchorY: (e.clientY - rect.top) / rect.height,
                initialBox: { ...box },
                otherBox: { ...other },
              };
            };

            const startInteractiveResize = (
              which: "start" | "end",
              corner: KBCorner,
              box: KenBurnsBox,
              other: KenBurnsBox,
              e: React.PointerEvent<HTMLElement>,
            ) => {
              if (kenBurnsDrawStep || e.button !== 0) return;
              e.stopPropagation();
              const layerEl = e.currentTarget.closest(".cin-ken-burns-layer") as HTMLElement | null;
              if (!layerEl) return;
              const rect = layerEl.getBoundingClientRect();
              layerEl.setPointerCapture(e.pointerId);
              onDragStart?.();
              const oppX = corner === "nw" || corner === "sw" ? box.x + box.width : box.x;
              const oppY = corner === "nw" || corner === "ne" ? box.y + box.width : box.y;
              kbSessionRef.current = {
                pointerId: e.pointerId,
                mode: "resize",
                which,
                corner,
                rectLeft: rect.left,
                rectTop: rect.top,
                rectWidth: rect.width,
                rectHeight: rect.height,
                anchorX: oppX,
                anchorY: oppY,
                initialBox: { ...box },
                otherBox: { ...other },
              };
            };

            return (
              <>
                {dispStart && dispEnd && (
                  <svg
                    className="cin-kb-vector-overlay"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <marker
                        id="kb-arrow-head"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="5"
                        markerHeight="5"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#f5a623" />
                      </marker>
                    </defs>
                    <line
                      x1={(dispStart.x + dispStart.width / 2) * 100}
                      y1={(dispStart.y + dispStart.width / 2) * 100}
                      x2={(dispEnd.x + dispEnd.width / 2) * 100}
                      y2={(dispEnd.y + dispEnd.width / 2) * 100}
                      stroke="#f5a623"
                      strokeWidth="0.45"
                      strokeDasharray="1.4 1"
                      markerEnd="url(#kb-arrow-head)"
                    />
                  </svg>
                )}

                {nowBox && (
                  <div
                    className="cin-kb-box is-now"
                    data-testid="ken-burns-now-box"
                    style={{
                      left: `${nowBox.x * 100}%`,
                      top: `${nowBox.y * 100}%`,
                      width: `${nowBox.width * 100}%`,
                      height: `${nowBox.width * 100}%`,
                    }}
                  />
                )}

                {dispStart && (
                  <div
                    className="cin-kb-box is-start"
                    data-testid="ken-burns-start-box"
                    style={{
                      left: `${dispStart.x * 100}%`,
                      top: `${dispStart.y * 100}%`,
                      width: `${dispStart.width * 100}%`,
                      height: `${dispStart.width * 100}%`,
                    }}
                    onPointerDown={(e) =>
                      dispEnd && startInteractiveMove("start", dispStart, dispEnd, e)
                    }
                  >
                    <span className="cin-kb-tag">START · {(1 / dispStart.width).toFixed(2)}×</span>
                    {!kenBurnsDrawStep &&
                      dispEnd &&
                      (["nw", "ne", "sw", "se"] as const).map((corner) => (
                        <i
                          key={corner}
                          className={`cin-kb-handle is-${corner}`}
                          data-testid={`ken-burns-start-${corner}`}
                          onPointerDown={(e) =>
                            startInteractiveResize("start", corner, dispStart, dispEnd, e)
                          }
                        />
                      ))}
                  </div>
                )}

                {dispEnd && (
                  <div
                    className="cin-kb-box is-end"
                    data-testid="ken-burns-end-box"
                    style={{
                      left: `${dispEnd.x * 100}%`,
                      top: `${dispEnd.y * 100}%`,
                      width: `${dispEnd.width * 100}%`,
                      height: `${dispEnd.width * 100}%`,
                    }}
                    onPointerDown={(e) =>
                      dispStart && startInteractiveMove("end", dispEnd, dispStart, e)
                    }
                  >
                    <span className="cin-kb-tag">END · {(1 / dispEnd.width).toFixed(2)}×</span>
                    {!kenBurnsDrawStep &&
                      dispStart &&
                      (["nw", "ne", "sw", "se"] as const).map((corner) => (
                        <i
                          key={corner}
                          className={`cin-kb-handle is-${corner}`}
                          data-testid={`ken-burns-end-${corner}`}
                          onPointerDown={(e) =>
                            startInteractiveResize("end", corner, dispEnd, dispStart, e)
                          }
                        />
                      ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Edge-clamp warning banner (shown instead of letting black show past picture edge) */}
      {showEdgeBanner && (
        <div
          className="cin-edge-warning"
          data-testid="viewer-edge-warning"
          role="status"
          aria-live="polite"
        >
          {edgeWarningMsg || "Picture edge reached — clamped to avoid black border"}
        </div>
      )}

      {frame.scene.letterbox && (
        <>
          <div className="cin-letterbox cin-letterbox-top" />
          <div className="cin-letterbox cin-letterbox-bottom" />
        </>
      )}
      {showMark && (
        <div className="cin-mark" data-testid="viewer-mark-overlay">
          SC {frame.mark} <span>·</span> BEAT {frame.number}
          {transition && (
            <>
              {" "}
              <span>·</span> {transition.kind.toUpperCase()} {Math.round(p * 100)}%
            </>
          )}
        </div>
      )}
      {showTimecodeOverlay && (
        <div className="cin-timecode-overlay" data-testid="viewer-timecode-overlay">
          <strong>{formatTimecode(playheadFrame)}</strong>
          <span>
            +{localFrame}f{totalFrames > 0 ? ` / ${formatTimecode(totalFrames)}` : ""}
          </span>
        </div>
      )}

      {/* Top-left Ken Burns button */}
      {onToggleKenBurns && !isFullscreen && (
        <div
          className="cin-kb-trigger-wrap"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={`cin-corner-btn ${showKenBurnsBoxes || kenBurnsDrawStep ? "is-active" : ""}`}
            data-testid="viewer-ken-burns-btn"
            disabled={!hasEditablePicture}
            aria-pressed={showKenBurnsBoxes || Boolean(kenBurnsDrawStep)}
            title="Draw or edit 16:9 START and END Ken Burns boxes on this clip"
            onClick={onToggleKenBurns}
          >
            Ken Burns
          </button>
        </div>
      )}

      {/* Viewer corner overlay toggles & Full Screen control */}
      {(onToggleSafeGuides ||
        onToggleOnionSkin ||
        onToggleTimecodeOverlay ||
        onToggleMarkOverlay ||
        onToggleFullscreen) && (
        <div
          className="cin-corner-toggles"
          data-testid="viewer-corner-toggles"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {onToggleSafeGuides && (
            <button
              type="button"
              className={`cin-corner-btn ${showSafeGuides ? "is-active" : ""}`}
              data-testid="viewer-toggle-safe"
              aria-pressed={showSafeGuides}
              title="Toggle action-safe (90%) and title-safe (80%) guides"
              onClick={onToggleSafeGuides}
            >
              Safe
            </button>
          )}
          {onToggleOnionSkin && (
            <button
              type="button"
              className={`cin-corner-btn ${showOnionSkin ? "is-active" : ""}`}
              data-testid="viewer-toggle-onion"
              aria-pressed={showOnionSkin}
              title="Toggle onion skin (previous and next clips' pictures at 30%)"
              onClick={onToggleOnionSkin}
            >
              Onion
            </button>
          )}
          {onToggleTimecodeOverlay && (
            <button
              type="button"
              className={`cin-corner-btn ${showTimecodeOverlay ? "is-active" : ""}`}
              data-testid="viewer-toggle-tc"
              aria-pressed={showTimecodeOverlay}
              title="Toggle timecode overlay"
              onClick={onToggleTimecodeOverlay}
            >
              TC
            </button>
          )}
          {onToggleMarkOverlay && (
            <button
              type="button"
              className={`cin-corner-btn ${showMark ? "is-active" : ""}`}
              data-testid="viewer-toggle-mark"
              aria-pressed={showMark}
              title="Toggle scene and beat overlay"
              onClick={onToggleMarkOverlay}
            >
              SC
            </button>
          )}
          {onToggleFullscreen && (
            <button
              type="button"
              className={`cin-corner-btn ${isFullscreen ? "is-active" : ""}`}
              data-testid="viewer-fullscreen-btn"
              aria-pressed={isFullscreen}
              title={isFullscreen ? "Exit full screen (F or Esc)" : "Play in full screen (F)"}
              onClick={onToggleFullscreen}
            >
              {isFullscreen ? "Exit FS" : "Full (F)"}
            </button>
          )}
        </div>
      )}

      {showCaption && wrappedCaptionText && (
        <div
          className={[
            "cin-caption",
            style.position === "top" ? "pos-top" : "pos-bottom",
            `size-${style.size.toLowerCase()}`,
            style.backgroundBox ? "has-box" : "no-box",
          ].join(" ")}
          data-testid="viewer-caption"
          data-position={style.position}
          data-size={style.size}
          data-box={style.backgroundBox ? "on" : "off"}
          data-speaker={style.showSpeaker ? "on" : "off"}
          data-italic-narration={style.italicNarration ? "on" : "off"}
        >
          {style.showSpeaker && <span>{frame.speaker}</span>}
          <p className={style.italicNarration && isNarration ? "is-italic" : undefined}>
            {wrappedCaptionText}
          </p>
        </div>
      )}
      {frame.carried && (
        <div className="cin-carried-mark">
          {frame.pictureSource === "scene" ? "SCENE PLATE" : "CARRIED PICTURE"}
        </div>
      )}
      <div className="cin-preview-crosshair" aria-hidden>
        <i />
        <b />
      </div>
    </div>
  );
}

function ShotLayer({
  frame,
  seedId,
  localFrame,
  presetFrame,
  carriedStartPose,
  imageSrc,
  imagePosition,
  resolveMedia,
  soundOn,
  plateTestId,
  forceUncropped = false,
}: {
  frame: Keyframe;
  seedId: string;
  localFrame: number;
  presetFrame: number;
  carriedStartPose?: Partial<EvaluatedPose>;
  imageSrc?: string;
  imagePosition?: string;
  resolveMedia: (value: string | undefined) => string | undefined;
  soundOn: boolean;
  plateTestId: string;
  forceUncropped?: boolean;
}) {
  const cinematic = (effectiveFrameCinematic(frame) || {}) as Record<string, any>;
  const anim = frame.beat.animation;
  const rawPose = evaluate(frame, localFrame, carriedStartPose);
  const clampedPose = clampPoseToPictureEdges(rawPose);
  const timeSec = presetFrame / FPS;
  const particleSeed = seedId || frame.id;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const picture = frame.picture || "";
  const isGradient = picture.startsWith("gradient:");
  const videoValue = picture.startsWith("video:") ? picture.slice(6) : "";
  const videoSrc = videoValue ? resolveMedia(videoValue) : undefined;
  const plateUrl = isGradient ? picture : imageSrc || storyboardGradient(picture);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !videoSrc) return;
    const targetSec = Math.max(0, localFrame / FPS);
    if (Number.isFinite(vid.duration) && vid.duration > 0) {
      vid.currentTime = targetSec % vid.duration;
    } else {
      vid.currentTime = targetSec;
    }
  }, [localFrame, videoSrc]);

  // Keyframes are the sole camera: Scarlet Reel presets & CSS film-grade animations never run on the plate.
  const effectiveCinematic = useMemo<Record<string, any>>(
    () => ({ ...cinematic, mode: "static" as const, shakeAmount: 0 }),
    [cinematic],
  );
  const plateLayerCinematic = useMemo<Record<string, any>>(
    () => ({ ...effectiveCinematic, filmGrade: false }),
    [effectiveCinematic],
  );
  const ungradedCinematic = useMemo<Record<string, any>>(
    () => ({ ...effectiveCinematic, colorGrade: undefined, filmGrade: false }),
    [effectiveCinematic],
  );
  const layer = useMemo(
    () => cinematicLayer(plateLayerCinematic, plateUrl),
    [plateLayerCinematic, plateUrl],
  );
  const ungradedLayer = useMemo(
    () => cinematicLayer(ungradedCinematic, plateUrl),
    [ungradedCinematic, plateUrl],
  );

  const hasDepth = Boolean(
    !forceUncropped &&
      cinematic.depthMap &&
      imageSrc &&
      !videoSrc &&
      !isGradient &&
      String(cinematic.mode ?? "pan") !== "dolly",
  );

  const hasRotation =
    Boolean(anim?.rotation?.length) ||
    typeof anim?.values?.rotation === "number" ||
    rawPose.rotation !== 0;

  const hasCameraMove =
    hasCustomTransform(frame) ||
    hasRotation ||
    rawPose.zoom !== 1 ||
    rawPose.x !== 0 ||
    rawPose.y !== 0;

  // Apply the camera transform ONCE:
  // - Non-depth shots: wrapper carries translate/scale/rotate; plate & missing card stay `transform: none`.
  // - Depth shots: `zoom`/`x`/`y` drive `FrameDepthParallaxLayer` shader (`uZoom`/`uShift`),
  //   wrapper carries `rotation` only, and both plate & `<canvas>` stay `transform: none`.
  let cameraWrapperTransform = "none";
  if (!forceUncropped) {
    if (hasDepth) {
      if (hasRotation) {
        const rotCover = minZoomForRotation(clampedPose.rotation);
        cameraWrapperTransform =
          rotCover > 1.0001
            ? `scale(${Number(rotCover.toFixed(6))}) rotate(${clampedPose.rotation}deg)`
            : `rotate(${clampedPose.rotation}deg)`;
      }
    } else if (hasCameraMove) {
      cameraWrapperTransform = hasRotation
        ? `translate(${clampedPose.x}%, ${clampedPose.y}%) scale(${clampedPose.zoom}) rotate(${clampedPose.rotation}deg)`
        : `translate(${clampedPose.x}%, ${clampedPose.y}%) scale(${clampedPose.zoom})`;
    }
  }

  const plateTransform = "none";

  const basePlateStyle = imagePosition
    ? { ...layer.style, backgroundPosition: imagePosition }
    : layer.style;
  const baseUngradedPlateStyle = imagePosition
    ? { ...ungradedLayer.style, backgroundPosition: imagePosition }
    : ungradedLayer.style;

  const plateStyle: CSSProperties = {
    ...basePlateStyle,
    transform: plateTransform,
    animation: "none",
    transition: "none",
  };
  const ungradedPlateStyle: CSSProperties = {
    ...baseUngradedPlateStyle,
    transform: plateTransform,
    animation: "none",
    transition: "none",
  };

  const clampedOpacity = clamp01(rawPose.opacity);
  const clampedBlur = Math.max(0, rawPose.blur);
  const clampedGradeStrength = clamp01(rawPose.gradeStrength);
  const hasGradeLayerSplit =
    (Boolean(anim?.gradeStrength?.length) || clampedGradeStrength < 1) &&
    Boolean(effectiveCinematic.colorGrade || effectiveCinematic.filmGrade);

  const filterParts: string[] = [];
  if (Boolean(anim?.blur?.length) || clampedBlur > 0) {
    filterParts.push(`blur(${Number(clampedBlur.toFixed(4))}px)`);
  }
  if (Boolean(anim?.exposure?.length) || rawPose.exposure !== 0) {
    const brightness = Number(Math.pow(2, rawPose.exposure).toFixed(6));
    filterParts.push(`brightness(${brightness})`);
  }
  const cameraFilter = filterParts.length > 0 ? filterParts.join(" ") : undefined;
  const cameraOpacity =
    Boolean(anim?.opacity?.length) || clampedOpacity !== 1 ? clampedOpacity : undefined;

  const currentDepthAmount = clamp01(rawPose.depthAmount);
  const authoredDepthAmount =
    typeof cinematic.depthAmount === "number" && Number.isFinite(cinematic.depthAmount)
      ? clamp01(cinematic.depthAmount)
      : 0.4;

  const resolvedCinematic = useMemo(
    () =>
      ({
        ...effectiveCinematic,
        depthAmount: currentDepthAmount,
        depthMap: resolveMedia(cinematic.depthMap),
        depthPlate: resolveMedia(cinematic.depthPlate),
        depthCutouts: Array.isArray(cinematic.depthCutouts)
          ? cinematic.depthCutouts.map((cutout: Record<string, any>) => ({
              ...cutout,
              image: resolveMedia(cutout.image) || cutout.image,
            }))
          : undefined,
      }) as unknown as CinematicSettings,
    [
      effectiveCinematic,
      currentDepthAmount,
      cinematic.depthMap,
      cinematic.depthPlate,
      cinematic.depthCutouts,
      resolveMedia,
    ],
  );

  const gradeClass =
    clampedGradeStrength > 0.001 &&
    effectiveCinematic.colorGrade &&
    effectiveCinematic.colorGrade !== "none"
      ? `cin-grade-${effectiveCinematic.colorGrade}`
      : "";

  const particleKind = (frame.beat.particles ?? frame.scene.particles ?? "none") as ParticleKind;
  const particleConfig = frame.beat.particleConfig ?? frame.scene.particleConfig;
  const shotName = pictureLabel(picture, false, "No picture on this keyframe");

  if (frame.beat.gap) {
    return (
      <div
        className="cin-preview-camera cin-preview-gap"
        style={{ background: "#000000", transition: "none", animation: "none" }}
      >
        <div
          className="cin-preview-plate cin-preview-gap-plate"
          style={{
            position: "absolute",
            inset: 0,
            background: "#000000",
            transition: "none",
            animation: "none",
          }}
          data-picture-ref=""
          data-gap="true"
          data-testid={plateTestId}
        />
      </div>
    );
  }

  return (
    <div
      className="cin-preview-camera"
      data-testid={plateTestId === "cinematic-plate" ? "cinematic-camera" : "cinematic-camera-outgoing"}
      style={{
        transform: cameraWrapperTransform,
        opacity: cameraOpacity,
        filter: cameraFilter,
        transition: "none",
        animation: "none",
      }}
    >
      {videoSrc ? (
        <video
          ref={videoRef}
          className="cin-preview-video"
          src={videoSrc}
          style={{
            transform: plateTransform,
            animation: "none",
            transition: "none",
          }}
          muted
          playsInline
          preload="auto"
        />
      ) : hasGradeLayerSplit ? (
        <>
          <div
            className={`cin-preview-plate ${ungradedLayer.className}`}
            style={ungradedPlateStyle}
            data-picture-ref={picture}
            data-testid={plateTestId}
          />
          <div
            className={`cin-preview-plate cin-graded-plate ${layer.className}`}
            style={{ ...plateStyle, opacity: clampedGradeStrength }}
            data-picture-ref={picture}
            data-testid={`${plateTestId}-graded`}
          />
        </>
      ) : (
        <div
          className={`cin-preview-plate ${layer.className}`}
          style={plateStyle}
          data-picture-ref={picture}
          data-testid={plateTestId}
        />
      )}
      {!videoSrc && !isGradient && !imageSrc && (
        <div
          className="cin-preview-missing"
          style={{
            transform: plateTransform,
            animation: "none",
            transition: "none",
          }}
        >
          <div className="cin-storyboard-card">
            <span className="missing-cross">+</span>
            <strong>{shotName}</strong>
            <span>PICTURE NOT LINKED</span>
            <small>{picture || "No picture on this keyframe"}</small>
          </div>
        </div>
      )}
      {hasDepth && (
        <FrameDepthParallaxLayer
          cinematic={resolvedCinematic}
          picture={plateUrl || imageSrc || ""}
          zoom={Math.max(1, rawPose.zoom)}
          x={rawPose.x}
          y={rawPose.y}
          depthAmount={currentDepthAmount}
          authoredDepthAmount={authoredDepthAmount}
          gradeClassName={gradeClass}
        />
      )}
      {cinematic.foregroundImage && (
        <img
          className="cin-preview-foreground"
          src={resolveMedia(cinematic.foregroundImage)}
          alt=""
          style={{
            left: `${Number(cinematic.foregroundX ?? 50)}%`,
            top: `${Number(cinematic.foregroundY ?? 50)}%`,
            opacity: Number(cinematic.foregroundOpacity ?? 1),
            mixBlendMode: cinematic.foregroundBlendMode || "normal",
            transform: `translate(-50%, -50%) scale(${Number(cinematic.foregroundScale ?? 1)}) rotate(${Number(cinematic.foregroundRotation ?? 0)}deg)`,
          }}
        />
      )}
      {Array.isArray(cinematic.foregroundExtras) &&
        cinematic.foregroundExtras.map((extra: Record<string, any>, index: number) => (
          <img
            key={`${extra.image}-${index}`}
            className="cin-preview-foreground"
            src={resolveMedia(extra.image)}
            alt=""
            style={{
              left: `${Number(extra.x ?? 50)}%`,
              top: `${Number(extra.y ?? 50)}%`,
              opacity: Number(extra.opacity ?? 1),
              mixBlendMode: extra.blendMode || "normal",
              transform: `translate(-50%, -50%) scale(${Number(extra.scale ?? 1)})`,
            }}
          />
        ))}
      {hasGradeLayerSplit || clampedGradeStrength < 1 ? (
        <div
          className="cin-grade-overlays-wrap"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: clampedGradeStrength,
          }}
        >
          <FrameCinematicOverlays cinematic={effectiveCinematic} timeSec={timeSec} />
        </div>
      ) : (
        <FrameCinematicOverlays cinematic={effectiveCinematic} timeSec={timeSec} />
      )}
      <FrameLightGlow cinematic={effectiveCinematic} timeSec={timeSec} />
      <FrameLensFlareLayer cinematic={effectiveCinematic} timeSec={timeSec} />
      <FrameParticles
        kind={particleKind}
        seed={particleSeed}
        timeSec={timeSec}
        soundOn={soundOn}
        cinematic={effectiveCinematic}
        ambientAudio={frame.scene.ambientAudio}
        config={particleConfig}
      />
    </div>
  );
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}


