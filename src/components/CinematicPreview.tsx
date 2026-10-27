import { useMemo, type CSSProperties } from "react";
import { CinematicOverlays, LightGlow, LensFlareLayer, cinematicLayer } from "../../vendor/scarlet-reel/cinematicRenderer";
import { DepthParallaxLayer } from "../../vendor/scarlet-reel/game/DepthParallax";
import { Particles, type ParticleKind } from "../../vendor/scarlet-reel/game/AmbientParticles";
import type { CinematicSettings } from "../../vendor/scarlet-reel/types";
import type { Keyframe } from "../core/model";
import { storyboardGradient } from "../core/helpers";
import { evaluate, hasAnimationKeyframes } from "../sequence/animate";
import type { ActiveTransition } from "../sequence/transitions";

export interface CinematicPreviewProps {
  frame: Keyframe;
  localFrame?: number;
  imageSrc?: string;
  imagePosition?: string;
  transition?: ActiveTransition;
  outgoingImageSrc?: string;
  outgoingImagePosition?: string;
  incomingImageSrc?: string;
  incomingImagePosition?: string;
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
  imageSrc,
  imagePosition,
  transition,
  outgoingImageSrc,
  outgoingImagePosition,
  incomingImageSrc,
  incomingImagePosition,
  resolveMedia,
  playing,
  soundOn,
  showCaption,
  showMark,
  setFocalPoint,
}: CinematicPreviewProps) {
  const cinematic = (frame.beat.cinematic || frame.scene.cinematic || {}) as Record<string, any>;
  const ownOverlay = [cinematic.vignette ? "fx-vignette" : "", cinematic.grain ? "fx-grain" : ""]
    .filter(Boolean)
    .join(" ");

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
      className={`cin-preview ${ownOverlay}`}
      data-testid="cinematic-preview"
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
      {transition ? (
        <>
          <div
            className="cin-transition-layer cin-transition-outgoing"
            data-testid="transition-outgoing"
            style={outgoingWrapperStyle}
          >
            <ShotLayer
              frame={transition.outgoingClip.keyframe}
              localFrame={transition.outLocalFrame}
              imageSrc={outgoingImageSrc}
              imagePosition={outgoingImagePosition}
              resolveMedia={resolveMedia}
              playing={playing}
              soundOn={soundOn}
              plateTestId="cinematic-plate-outgoing"
              inTransition
            />
          </div>
          <div
            className="cin-transition-layer cin-transition-incoming"
            data-testid="transition-incoming"
            style={incomingWrapperStyle}
          >
            <ShotLayer
              frame={transition.incomingClip.keyframe}
              localFrame={transition.inLocalFrame}
              imageSrc={incomingImageSrc}
              imagePosition={incomingImagePosition}
              resolveMedia={resolveMedia}
              playing={playing}
              soundOn={false}
              plateTestId="cinematic-plate"
              inTransition
            />
          </div>
        </>
      ) : (
        <ShotLayer
          frame={frame}
          localFrame={localFrame}
          imageSrc={imageSrc}
          imagePosition={imagePosition}
          resolveMedia={resolveMedia}
          playing={playing}
          soundOn={soundOn}
          plateTestId="cinematic-plate"
          inTransition={false}
        />
      )}

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
      {showCaption && frame.text && (
        <div className="cin-caption">
          <span>{frame.speaker}</span>
          <p>{frame.text}</p>
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
  imageSrc,
  imagePosition,
  resolveMedia,
  playing,
  soundOn,
  plateTestId,
  inTransition,
}: {
  frame: Keyframe;
  localFrame: number;
  imageSrc?: string;
  imagePosition?: string;
  resolveMedia: (value: string | undefined) => string | undefined;
  playing: boolean;
  soundOn: boolean;
  plateTestId: string;
  inTransition: boolean;
}) {
  const cinematic = (frame.beat.cinematic || frame.scene.cinematic || {}) as Record<string, any>;
  const hasKeyframes = hasAnimationKeyframes(frame);
  const pose = evaluate(frame, localFrame);
  const useDirectPose = hasKeyframes || inTransition;

  const picture = frame.picture || "";
  const isGradient = picture.startsWith("gradient:");
  const videoValue = picture.startsWith("video:") ? picture.slice(6) : "";
  const videoSrc = videoValue ? resolveMedia(videoValue) : undefined;
  const plateUrl = isGradient ? picture : imageSrc || storyboardGradient(picture);

  const effectiveCinematic = useMemo(
    () => (useDirectPose ? { ...cinematic, mode: "static", shakeAmount: 0 } : cinematic),
    [cinematic, useDirectPose],
  );
  const layer = useMemo(
    () => cinematicLayer(effectiveCinematic, plateUrl),
    [effectiveCinematic, plateUrl],
  );

  const directTransform = useDirectPose
    ? `translate(${pose.x}%, ${pose.y}%) scale(${pose.zoom})`
    : undefined;

  const basePlateStyle = imagePosition
    ? { ...layer.style, backgroundPosition: imagePosition }
    : layer.style;

  const plateStyle: CSSProperties = useDirectPose
    ? {
        ...basePlateStyle,
        transform: directTransform,
        animation: "none",
        transition: "none",
      }
    : basePlateStyle;

  const resolvedCinematic = useMemo(
    () =>
      ({
        ...effectiveCinematic,
        depthMap: resolveMedia(cinematic.depthMap),
        depthPlate: resolveMedia(cinematic.depthPlate),
        depthCutouts: Array.isArray(cinematic.depthCutouts)
          ? cinematic.depthCutouts.map((cutout: Record<string, any>) => ({
              ...cutout,
              image: resolveMedia(cutout.image) || cutout.image,
            }))
          : undefined,
      }) as unknown as CinematicSettings,
    [effectiveCinematic, cinematic.depthMap, cinematic.depthPlate, cinematic.depthCutouts, resolveMedia],
  );

  const particleKind = (frame.beat.particles ?? frame.scene.particles ?? "none") as ParticleKind;
  const particleConfig = frame.beat.particleConfig ?? frame.scene.particleConfig;
  const extensionZoomStart = Number(cinematic.startZoom ?? cinematic.zoom ?? 1);
  const extensionZoomEnd = Number(cinematic.endZoom ?? cinematic.zoom ?? 1);
  const startPoint = parsePosition(cinematic.startFocalPoint || cinematic.focalPoint);
  const endPoint = parsePosition(cinematic.endFocalPoint || cinematic.focalPoint);
  const extensionStyle = {
    "--edit-start-scale": String(Number.isFinite(extensionZoomStart) ? extensionZoomStart : 1),
    "--edit-end-scale": String(Number.isFinite(extensionZoomEnd) ? extensionZoomEnd : 1),
    "--edit-start-x": `${(50 - startPoint.x) * 0.14}%`,
    "--edit-start-y": `${(50 - startPoint.y) * 0.14}%`,
    "--edit-end-x": `${(50 - endPoint.x) * 0.14}%`,
    "--edit-end-y": `${(50 - endPoint.y) * 0.14}%`,
    "--edit-easing": String(cinematic.easing || "ease-in-out"),
    "--edit-duration": `${Math.max(0.1, Number(cinematic.zoomDuration) || 8)}s`,
  } as CSSProperties;

  const cameraMoveActive =
    !useDirectPose && playing && Boolean(cinematic.startZoom || cinematic.endZoom || cinematic.easing);

  const shotName = picture ? picture.split("/").pop() || picture : "No picture on this keyframe";

  return (
    <div
      className={`cin-preview-camera ${cameraMoveActive ? "cin-preview-camera-active" : ""}`}
      style={useDirectPose ? { transition: "none", animation: "none" } : extensionStyle}
    >
      {videoSrc ? (
        <video
          className="cin-preview-video"
          src={videoSrc}
          style={
            useDirectPose
              ? { transform: directTransform, animation: "none", transition: "none" }
              : undefined
          }
          autoPlay
          muted
          loop
          playsInline
        />
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
          style={
            useDirectPose
              ? { transform: directTransform, animation: "none", transition: "none" }
              : undefined
          }
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
        <DepthParallaxLayer cinematic={resolvedCinematic} picture={plateUrl || imageSrc} />
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
      <CinematicOverlays cinematic={effectiveCinematic} />
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
