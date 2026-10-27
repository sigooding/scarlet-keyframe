import { useMemo, type CSSProperties } from "react";
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
import type { Keyframe } from "../core/model";
import { pictureLabel, storyboardGradient } from "../core/helpers";
import { clipFrames, FPS } from "../core/timing";
import { evaluate, hasAnimationKeyframes, hasTransformKeyframes } from "../sequence/animate";
import type { ActiveTransition } from "../sequence/transitions";

export interface CinematicPreviewProps {
  frame: Keyframe;
  localFrame?: number;
  presetFrame?: number;
  shotKeyId?: string;
  clipDurationFrames?: number;
  captionStyle?: CaptionStyle;
  imageSrc?: string;
  imagePosition?: string;
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
  setFocalPoint?: (value: string) => void;
}

export function CinematicPreview({
  frame,
  localFrame = 0,
  presetFrame,
  shotKeyId,
  clipDurationFrames,
  captionStyle,
  imageSrc,
  imagePosition,
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
  playing: _playing,
  soundOn,
  showCaption,
  showMark,
  setFocalPoint,
}: CinematicPreviewProps) {
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

  return (
    <div
      className={`cin-preview ${frame.beat.gap ? "" : ownOverlay}`}
      data-testid="cinematic-preview"
      data-gap={frame.beat.gap ? "true" : undefined}
      data-transition-kind={transition?.kind || "none"}
      data-transition-progress={transition ? p.toFixed(4) : undefined}
      onClick={(event) => {
        if (!setFocalPoint) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
        setFocalPoint(`${Math.round(x)}% ${Math.round(y)}%`);
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
              />
            </div>
          ));
        })()}
      </div>

      {frame.scene.letterbox && (
        <>
          <div className="cin-letterbox cin-letterbox-top" />
          <div className="cin-letterbox cin-letterbox-bottom" />
        </>
      )}
      {showMark && (
        <div className="cin-mark">
          SC {frame.mark} <span>·</span> BEAT {frame.number}
          {transition && (
            <>
              {" "}
              <span>·</span> {transition.kind.toUpperCase()} {Math.round(p * 100)}%
            </>
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
}: {
  frame: Keyframe;
  localFrame: number;
  presetFrame: number;
  imageSrc?: string;
  imagePosition?: string;
  resolveMedia: (value: string | undefined) => string | undefined;
  soundOn: boolean;
  plateTestId: string;
}) {
  const cinematic = (frame.beat.cinematic || frame.scene.cinematic || {}) as Record<string, any>;
  const anim = frame.beat.animation;
  const hasKeyframes = hasAnimationKeyframes(frame);
  const hasTransformKeys = hasTransformKeyframes(frame);
  const pose = evaluate(frame, localFrame);
  const firstFrameDepthAmount = anim?.depthAmount?.length
    ? evaluate(frame, 0).depthAmount
    : undefined;
  const tSec = Math.max(0, hasTransformKeys ? localFrame : presetFrame) / FPS;

  const picture = frame.picture || "";
  const isGradient = picture.startsWith("gradient:");
  const videoValue = picture.startsWith("video:") ? picture.slice(6) : "";
  const videoSrc = videoValue ? resolveMedia(videoValue) : undefined;
  const plateUrl = isGradient ? picture : imageSrc || storyboardGradient(picture);

  const effectiveCinematic = useMemo(
    () => (hasTransformKeys ? { ...cinematic, mode: "static", shakeAmount: 0 } : cinematic),
    [cinematic, hasTransformKeys],
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

  const hasRotation = Boolean(anim?.rotation?.length) || pose.rotation !== 0;
  // Frame-deterministic plate transform: never flips mode across transitions and never relies on CSS @keyframes!
  const keyframeTransform = hasRotation
    ? `translate(${pose.x}%, ${pose.y}%) scale(${pose.zoom}) rotate(${pose.rotation}deg)`
    : `translate(${pose.x}%, ${pose.y}%) scale(${pose.zoom})`;
  const plateTransform = hasTransformKeys
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
  const cameraWrapperTransform = hasTransformKeys
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

