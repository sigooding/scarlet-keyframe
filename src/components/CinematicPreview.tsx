import { useMemo, type CSSProperties } from "react";
import { CinematicOverlays, LightGlow, LensFlareLayer, cinematicLayer } from "../../vendor/scarlet-reel/cinematicRenderer";
import { DepthParallaxLayer } from "../../vendor/scarlet-reel/game/DepthParallax";
import { Particles, type ParticleKind } from "../../vendor/scarlet-reel/game/AmbientParticles";
import type { CinematicSettings } from "../../vendor/scarlet-reel/types";
import type { Keyframe } from "../core/model";
import { storyboardGradient } from "../core/helpers";
import { evaluate, hasAnimationKeyframes } from "../sequence/animate";

interface CinematicPreviewProps {
  frame: Keyframe;
  localFrame?: number;
  imageSrc?: string;
  imagePosition?: string;
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
  resolveMedia,
  playing,
  soundOn,
  showCaption,
  showMark,
  setFocalPoint,
}: CinematicPreviewProps) {
  const cinematic = (frame.beat.cinematic || frame.scene.cinematic || {}) as Record<string, any>;
  const hasKeyframes = hasAnimationKeyframes(frame);
  const pose = evaluate(frame, localFrame);

  const picture = frame.picture || "";
  const isGradient = picture.startsWith("gradient:");
  const videoValue = picture.startsWith("video:") ? picture.slice(6) : "";
  const videoSrc = videoValue ? resolveMedia(videoValue) : undefined;
  const plateUrl = isGradient ? picture : imageSrc || storyboardGradient(picture);

  const effectiveCinematic = useMemo(
    () => (hasKeyframes ? { ...cinematic, mode: "static", shakeAmount: 0 } : cinematic),
    [cinematic, hasKeyframes],
  );
  const layer = useMemo(
    () => cinematicLayer(effectiveCinematic, plateUrl),
    [effectiveCinematic, plateUrl],
  );

  const directTransform = hasKeyframes
    ? `translate(${pose.x}%, ${pose.y}%) scale(${pose.zoom})`
    : undefined;

  const basePlateStyle = imagePosition
    ? { ...layer.style, backgroundPosition: imagePosition }
    : layer.style;

  const plateStyle: CSSProperties = hasKeyframes
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
  const ownOverlay = [cinematic.vignette ? "fx-vignette" : "", cinematic.grain ? "fx-grain" : ""]
    .filter(Boolean)
    .join(" ");

  const cameraMoveActive =
    !hasKeyframes && playing && Boolean(cinematic.startZoom || cinematic.endZoom || cinematic.easing);

  const shotName = picture ? picture.split("/").pop() || picture : "No picture on this keyframe";

  return (
    <div
      className={`cin-preview ${ownOverlay}`}
      data-testid="cinematic-preview"
      onClick={(event) => {
        if (!setFocalPoint) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
        setFocalPoint(`${Math.round(x)}% ${Math.round(y)}%`);
      }}
    >
      <div
        className={`cin-preview-camera ${cameraMoveActive ? "cin-preview-camera-active" : ""}`}
        style={hasKeyframes ? undefined : extensionStyle}
      >
        {videoSrc ? (
          <video
            className="cin-preview-video"
            src={videoSrc}
            style={
              hasKeyframes
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
            data-testid="cinematic-plate"
          />
        )}
        {!videoSrc && !isGradient && !imageSrc && (
          <div
            className="cin-preview-missing"
            style={
              hasKeyframes
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
      {frame.scene.letterbox && (
        <>
          <div className="cin-letterbox cin-letterbox-top" />
          <div className="cin-letterbox cin-letterbox-bottom" />
        </>
      )}
      {showMark && (
        <div className="cin-mark">
          SC {frame.mark} <span>·</span> BEAT {frame.number}
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

function parsePosition(value: unknown): { x: number; y: number } {
  const [x, y] = String(value || "50% 50%")
    .split(/\s+/)
    .map((part) => Number.parseFloat(part));
  return {
    x: Number.isFinite(x) ? x : 50,
    y: Number.isFinite(y) ? y : 50,
  };
}
