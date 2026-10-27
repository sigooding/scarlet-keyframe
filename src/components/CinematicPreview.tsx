import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CinematicOverlays, LightGlow, LensFlareLayer, cinematicLayer } from "../../vendor/scarlet-reel/cinematicRenderer";
import { Particles, type ParticleKind } from "../../vendor/scarlet-reel/game/AmbientParticles";
import type { CinematicSettings } from "../../vendor/scarlet-reel/types";
import { FrameDepthParallaxLayer } from "./FrameDepthParallax";
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
import { clipFrames, FPS, formatTimecode } from "../core/timing";
import {
  applyKenBurnsBoxes,
  applyPoseAtPlayhead,
  clampKenBurnsBox,
  clampPoseToPictureEdges,
  clampPropValue,
  evaluate,
  hasAnimationKeyframes,
  hasCustomTransform,
  kenBurnsBoxFromDrag,
  minZoomForRotation,
  poseToKenBurnsBox,
  zoomPoseAroundPointer,
} from "../sequence/animate";
import type { ActiveTransition } from "../sequence/transitions";

export interface CinematicPreviewProps {
  frame: Keyframe;
  localFrame?: number;
  presetFrame?: number;
  shotKeyId?: string;
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
    : ((frame.beat.cinematic || frame.scene.cinematic || {}) as Record<string, any>);
  const ownOverlay = [cinematic.vignette ? "fx-vignette" : "", cinematic.grain ? "fx-grain" : ""]
    .filter(Boolean)
    .join(" ");

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

  const currentEvaluatedPose = useMemo(() => evaluate(frame, localFrame), [frame, localFrame]);
  const currentClampedPose = useMemo(
    () => clampPoseToPictureEdges(currentEvaluatedPose),
    [currentEvaluatedPose],
  );
  const poseHitsEdge =
    hasEditablePicture &&
    hasCustomTransform(frame) &&
    currentClampedPose.clamped;

  // Keep refs fresh for wheel listener without re-binding passive:false handler on every frame
  const latestRef = useRef({
    frame,
    localFrame,
    canDirectFrame,
    onDragStart,
    onDragEnd,
    onPreviewAnimation,
    triggerEdgeWarning,
  });
  latestRef.current = {
    frame,
    localFrame,
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

      const curRaw = evaluate(state.frame, state.localFrame);
      const curPose = clampPoseToPictureEdges(curRaw);
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
        const clamped = clampPoseToPictureEdges({
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
                localFrame={item.shotLocalFrame}
                presetFrame={item.shotPresetFrame}
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
  localFrame,
  presetFrame,
  imageSrc,
  imagePosition,
  resolveMedia,
  soundOn,
  plateTestId,
  forceUncropped = false,
}: {
  frame: Keyframe;
  localFrame: number;
  presetFrame: number;
  imageSrc?: string;
  imagePosition?: string;
  resolveMedia: (value: string | undefined) => string | undefined;
  soundOn: boolean;
  plateTestId: string;
  forceUncropped?: boolean;
}) {
  const cinematic = (frame.beat.cinematic || frame.scene.cinematic || {}) as Record<string, any>;
  const anim = frame.beat.animation;
  const hasKeyframes = hasAnimationKeyframes(frame);
  const hasCustomCamera = hasCustomTransform(frame);
  const rawPose = evaluate(frame, localFrame);
  const clampedPose = clampPoseToPictureEdges(rawPose);
  const pose = {
    ...rawPose,
    zoom: clampedPose.zoom,
    x: clampedPose.x,
    y: clampedPose.y,
    rotation: clampedPose.rotation,
  };
  const firstFrameDepthAmount =
    anim?.depthAmount?.length || typeof anim?.values?.depthAmount === "number"
      ? evaluate(frame, 0).depthAmount
      : undefined;
  const tSec = Math.max(0, hasCustomCamera ? localFrame : presetFrame) / FPS;

  const picture = frame.picture || "";
  const isGradient = picture.startsWith("gradient:");
  const videoValue = picture.startsWith("video:") ? picture.slice(6) : "";
  const videoSrc = videoValue ? resolveMedia(videoValue) : undefined;
  const plateUrl = isGradient ? picture : imageSrc || storyboardGradient(picture);

  const effectiveCinematic = useMemo(
    () =>
      hasCustomCamera || forceUncropped
        ? { ...cinematic, mode: "static", shakeAmount: 0 }
        : cinematic,
    [cinematic, hasCustomCamera, forceUncropped],
  );
  const ungradedCinematic = useMemo(
    () => ({ ...effectiveCinematic, colorGrade: undefined, filmGrade: false }),
    [effectiveCinematic],
  );
  const layer = useMemo(
    () => cinematicLayer(effectiveCinematic, plateUrl),
    [effectiveCinematic, plateUrl],
  );
  const ungradedLayer = useMemo(
    () => cinematicLayer(ungradedCinematic, plateUrl),
    [ungradedCinematic, plateUrl],
  );

  const hasDepth = Boolean(
    cinematic.depthMap && imageSrc && !videoSrc && String(cinematic.mode ?? "pan") !== "dolly",
  );

  const hasRotation =
    Boolean(anim?.rotation?.length) ||
    typeof anim?.values?.rotation === "number" ||
    pose.rotation !== 0;
  // Frame-deterministic plate transform: never flips mode across transitions and never relies on CSS @keyframes!
  const keyframeTransform = hasRotation
    ? `translate(${pose.x}%, ${pose.y}%) scale(${pose.zoom}) rotate(${pose.rotation}deg)`
    : `translate(${pose.x}%, ${pose.y}%) scale(${pose.zoom})`;
  const plateTransform = forceUncropped
    ? "scale(1)"
    : hasCustomCamera
      ? keyframeTransform
      : hasDepth
        ? "scale(1)"
        : evaluatePresetPlateTransform(cinematic, tSec);

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

  const clampedOpacity = clamp01(pose.opacity);
  const clampedBlur = Math.max(0, pose.blur);
  const clampedGradeStrength = clamp01(pose.gradeStrength);
  const hasGradeLayerSplit =
    (Boolean(anim?.gradeStrength?.length) || clampedGradeStrength < 1) &&
    Boolean(effectiveCinematic.colorGrade || effectiveCinematic.filmGrade);

  const filterParts: string[] = [];
  if (Boolean(anim?.blur?.length) || clampedBlur > 0) {
    filterParts.push(`blur(${Number(clampedBlur.toFixed(4))}px)`);
  }
  if (Boolean(anim?.exposure?.length) || pose.exposure !== 0) {
    const brightness = Number(Math.pow(2, pose.exposure).toFixed(6));
    filterParts.push(`brightness(${brightness})`);
  }
  const cameraFilter = filterParts.length > 0 ? filterParts.join(" ") : undefined;
  const cameraOpacity =
    Boolean(anim?.opacity?.length) || clampedOpacity !== 1 ? clampedOpacity : undefined;

  const effectiveDepthAmount =
    firstFrameDepthAmount !== undefined ? clamp01(firstFrameDepthAmount) : cinematic.depthAmount;

  const resolvedCinematic = useMemo(
    () =>
      ({
        ...effectiveCinematic,
        depthAmount: effectiveDepthAmount,
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
      effectiveDepthAmount,
      cinematic.depthMap,
      cinematic.depthPlate,
      cinematic.depthCutouts,
      resolveMedia,
    ],
  );

  const particleKind = (frame.beat.particles ?? frame.scene.particles ?? "none") as ParticleKind;
  const particleConfig = frame.beat.particleConfig ?? frame.scene.particleConfig;
  const cameraWrapperTransform = forceUncropped
    ? undefined
    : hasCustomCamera
      ? hasDepth
        ? keyframeTransform
        : undefined
      : evaluateCameraWrapperTransform(cinematic, tSec);
  void hasKeyframes;

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
          className="cin-preview-video"
          src={videoSrc}
          style={{
            transform: plateTransform,
            animation: "none",
            transition: "none",
          }}
          autoPlay
          muted
          loop
          playsInline
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
      {cinematic.depthMap && imageSrc && !videoSrc && (
        <FrameDepthParallaxLayer
          cinematic={resolvedCinematic}
          picture={plateUrl || imageSrc}
          tSec={tSec}
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
          <CinematicOverlays cinematic={effectiveCinematic} />
        </div>
      ) : (
        <CinematicOverlays cinematic={effectiveCinematic} />
      )}
      <LightGlow cinematic={effectiveCinematic} />
      <LensFlareLayer cinematic={effectiveCinematic} />
      <Particles
        kind={particleKind}
        soundOn={soundOn}
        cinematic={effectiveCinematic}
        ambientAudio={frame.scene.ambientAudio}
        config={particleConfig}
      />
    </div>
  );
}

function parsePosition(value: unknown): { x: number; y: number } {
  const [x, y] = String(value || "50% 50%")
    .split(/\s+/)
    .map((part) => Number.parseFloat(part));
  return {
    x: Number.isFinite(x) ? x : 50,
    y: Number.isFinite(y) ? y : 50,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeInOutQuad(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

function easeOutCubic(t: number): number {
  const u = clamp01(t);
  return 1 - Math.pow(1 - u, 3);
}

function pingPong01(cycles: number): number {
  const mod = ((cycles % 2) + 2) % 2;
  return mod <= 1 ? mod : 2 - mod;
}

const SHAKE_STOPS: ReadonlyArray<{ p: number; x: number; y: number; r: number }> = [
  { p: 0.0, x: 0, y: 0, r: 0 },
  { p: 0.1, x: 1, y: -0.6, r: 1 },
  { p: 0.24, x: -0.9, y: 0.4, r: -0.7 },
  { p: 0.38, x: 0.5, y: 1, r: 0.5 },
  { p: 0.52, x: -0.6, y: -0.8, r: -0.4 },
  { p: 0.66, x: 0.7, y: 0.3, r: 0.8 },
  { p: 0.8, x: -0.4, y: 0.5, r: -0.6 },
  { p: 0.92, x: 0.2, y: -0.3, r: 1 },
  { p: 1.0, x: 0, y: 0, r: 0 },
];

/**
 * Deterministic 24 fps frame evaluation of Scarlet Reel preset camera modes (`pan`, `zoom-hold`,
 * `dolly`, `dolly-zoom`, `shake`, `static`) so transitions never reset or snap CSS `@keyframes`.
 */
function evaluatePresetPlateTransform(cinematic: Record<string, any>, tSec: number): string {
  const mode = String(cinematic.mode ?? "pan");
  const zoomDur = Math.max(0.1, Number(cinematic.zoomDuration) || 8);

  if (mode === "static") {
    return "scale(1)";
  }

  if (mode === "zoom-hold") {
    const focal = parsePosition(cinematic.focalPoint);
    const endX = (50 - focal.x) * 0.14;
    const endY = (50 - focal.y) * 0.14;
    const u = easeOutCubic(tSec / (0.8 * zoomDur));
    const scale = 1 + 0.22 * u;
    const tx = endX * u;
    const ty = endY * u;
    return `scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%)`;
  }

  if (mode === "dolly") {
    const dollyDur = Math.max(1, Number(cinematic.dollyDuration) || 10);
    const dist = Math.max(0, Number(cinematic.dollyDistance ?? 8));
    const dir = cinematic.dollyDirection === "left" ? -1 : 1;
    const vert = Math.max(0, Math.min(8, Number(cinematic.dollyVertical ?? 0)));
    const u = easeInOutQuad(pingPong01(tSec / dollyDur));
    const tx = (-dist * dir) + 2 * dist * dir * u;
    const ty = -vert + 2 * vert * u;
    return `translateX(${tx.toFixed(3)}%) translateY(${ty.toFixed(3)}%)`;
  }

  if (mode === "dolly-zoom") {
    const dzDur = Math.max(1, Number(cinematic.dollyZoomDuration) || 8);
    const amount = Math.max(1, Number(cinematic.dollyZoomAmount) || 1.35);
    const dir = String(cinematic.dollyZoomDirection ?? "both");
    const fromScale = dir === "pull" ? amount : 1;
    const toScale = dir === "pull" ? 1 : amount;
    const u =
      dir === "push" || dir === "pull"
        ? easeInOutQuad(tSec / dzDur)
        : easeInOutQuad(pingPong01(tSec / dzDur));
    const scale = fromScale + (toScale - fromScale) * u;
    return `scale(${scale.toFixed(4)})`;
  }

  if (mode === "shake") {
    const shake = Math.max(0, Math.min(1, Number(cinematic.shakeAmount ?? 0.5)));
    const shakeAmtPx = shake * 6;
    const shakeRotDeg = Number(cinematic.shakeRotation ?? shake * 0.7);
    const shakeDur = Math.max(0.1, Number(cinematic.shakeDuration) || 0.5);
    const phase = ((tSec / shakeDur) % 1 + 1) % 1;
    let sx = 0;
    let sy = 0;
    let sr = 0;
    for (let i = 0; i < SHAKE_STOPS.length - 1; i += 1) {
      const a = SHAKE_STOPS[i];
      const b = SHAKE_STOPS[i + 1];
      if (phase >= a.p && phase <= b.p) {
        const w = b.p > a.p ? (phase - a.p) / (b.p - a.p) : 0;
        sx = (a.x + (b.x - a.x) * w) * shakeAmtPx;
        sy = (a.y + (b.y - a.y) * w) * shakeAmtPx;
        sr = (a.r + (b.r - a.r) * w) * shakeRotDeg;
        break;
      }
    }
    return `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px) scale(1.06) rotate(${sr.toFixed(3)}deg)`;
  }

  // Default mode === "pan": 0% scale(1.12) translate(-0.5*panX, 0) -> 100% scale(1.16) translate(panX, 0)
  const panDur = Math.max(0.1, Number(cinematic.zoomDuration) || 14);
  const panDist = Math.max(0, Number(cinematic.panDistance ?? 0));
  const panX = cinematic.panDirection === "left" ? -panDist : panDist;
  const u = easeInOutQuad(tSec / panDur);
  const scale = 1.12 + 0.04 * u;
  const tx = -0.5 * panX + 1.5 * panX * u;
  return `scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}%, 0%)`;
}

function evaluateCameraWrapperTransform(
  cinematic: Record<string, any>,
  tSec: number,
): string | undefined {
  const hasEditMove = Boolean(
    cinematic.startZoom !== undefined ||
      cinematic.endZoom !== undefined ||
      cinematic.zoom !== undefined ||
      cinematic.startFocalPoint ||
      cinematic.endFocalPoint,
  );
  if (!hasEditMove) return undefined;

  const startScaleRaw = Number(cinematic.startZoom ?? cinematic.zoom ?? 1);
  const endScaleRaw = Number(cinematic.endZoom ?? cinematic.zoom ?? 1);
  const startScale = Number.isFinite(startScaleRaw) && startScaleRaw > 0 ? startScaleRaw : 1;
  const endScale = Number.isFinite(endScaleRaw) && endScaleRaw > 0 ? endScaleRaw : 1;
  const startPoint = parsePosition(cinematic.startFocalPoint || cinematic.focalPoint);
  const endPoint = parsePosition(cinematic.endFocalPoint || cinematic.focalPoint);
  const startX = (50 - startPoint.x) * 0.14;
  const startY = (50 - startPoint.y) * 0.14;
  const endX = (50 - endPoint.x) * 0.14;
  const endY = (50 - endPoint.y) * 0.14;

  const dur = Math.max(0.1, Number(cinematic.zoomDuration) || 8);
  const easingName = String(cinematic.easing || "ease-in-out");
  const rawT = clamp01(tSec / dur);
  const u =
    easingName === "linear"
      ? rawT
      : easingName === "ease-out"
        ? easeOutCubic(rawT)
        : easeInOutQuad(rawT);

  const scale = startScale + (endScale - startScale) * u;
  const tx = startX + (endX - startX) * u;
  const ty = startY + (endY - startY) * u;
  if (Math.abs(scale - 1) < 1e-4 && Math.abs(tx) < 1e-4 && Math.abs(ty) < 1e-4) {
    return undefined;
  }
  return `scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%)`;
}

