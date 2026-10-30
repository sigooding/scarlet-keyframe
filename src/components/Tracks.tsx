import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AUDIO_LANES,
  audioLabelFromSrc,
  formatMsTimecode,
  frameToMs,
  MAX_VOLUME_KEY_SCALE,
  msToFrameFloat,
  resolveAmbienceSpans,
  roundMicros,
  snapAudioMs,
  sortedVolumeKeys,
  trimAudioClipLeft,
  trimAudioClipRight,
  volumeScaleAtMs,
  type AmbienceSpan,
  type AudioClip,
  type AudioLaneId,
  type AudioVolumeKey,
  type ResolvedAudioClip,
} from "../core/audioClips";
import type { NoteMarker } from "../core/model";
import { effectiveTrackLevel, type TrackMixMap } from "../core/previewAudio";
import { FPS } from "../core/timing";
import {
  getCachedWaveformEnvelope,
  onWaveformReady,
  requestWaveformEnvelope,
  sampleEnvelopeRange,
} from "../core/waveformPeaks";
import { extractPlayableUrlsFromSrc, webAudioEngine } from "../core/webAudioEngine";
import type { TimelineClip } from "../sequence/animate";
import type { InspectorTab } from "./Inspector";
import { decodeDraggedAsset } from "./MediaBin";

export type AudioInspectorTab = Exclude<InspectorTab, "clip">;
export { resolveAmbienceSpans, type AmbienceSpan };

const LANE_COLORS: Record<AudioLaneId, { stroke: string; fill: string }> = {
  voice: { stroke: "rgba(96, 195, 255, 0.92)", fill: "rgba(56, 155, 235, 0.34)" },
  sfx: { stroke: "rgba(255, 182, 72, 0.95)", fill: "rgba(245, 148, 42, 0.34)" },
  music: { stroke: "rgba(186, 128, 255, 0.92)", fill: "rgba(148, 92, 232, 0.34)" },
  ambience: { stroke: "rgba(92, 224, 168, 0.9)", fill: "rgba(52, 184, 132, 0.32)" },
};

const MAX_GAIN = 2;

export interface SyncedAudioLanesProps {
  clips: TimelineClip[];
  resolvedAudioClips: ResolvedAudioClip[];
  selectedAudioClipIds: string[];
  totalFrames: number;
  playheadFrame: number;
  pxPerFrame: number;
  scrollLeft: number;
  viewportWidth: number;
  minVisibleFrame: number;
  maxVisibleFrame: number;
  snapEnabled: boolean;
  noteMarkers: NoteMarker[];
  audioDurations?: ReadonlyMap<string, number>;
  trackMix?: TrackMixMap;
  resolveMedia: (value: string | undefined) => string | undefined;
  laneRefs?: Partial<Record<AudioLaneId, (el: HTMLDivElement | null) => void>>;
  onSetSnapGuide: (frame: number | null) => void;
  onSelectAudioClip: (
    clip: ResolvedAudioClip,
    additive: boolean,
    targetFrame?: number,
  ) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
  onPreviewUpdateAudioClip: (clipId: string, updated: AudioClip) => void;
  onShiftAudioDragPreview: (deltaMs: number, primaryClipId: string) => void;
  onCommitAudioDrag: (deltaMs: number, copy: boolean, primaryClipId: string) => void;
  onDropAudioAsset?: (lane: AudioLaneId, ref: string, dropStartMs: number) => void;
  laneHeights?: Partial<Record<AudioLaneId, number>>;
  hiddenLanes?: ReadonlySet<string>;
}

export function Tracks({
  clips,
  resolvedAudioClips,
  selectedAudioClipIds,
  playheadFrame,
  pxPerFrame,
  scrollLeft,
  viewportWidth,
  minVisibleFrame,
  maxVisibleFrame,
  snapEnabled,
  noteMarkers,
  audioDurations,
  trackMix,
  resolveMedia,
  laneRefs,
  onSetSnapGuide,
  onSelectAudioClip,
  onDragStart,
  onDragEnd,
  onPreviewUpdateAudioClip,
  onShiftAudioDragPreview,
  onCommitAudioDrag,
  onDropAudioAsset,
  laneHeights,
  hiddenLanes,
}: SyncedAudioLanesProps) {
  const [decodeTick, setDecodeTick] = useState(0);
  useEffect(() => {
    const offBuf = webAudioEngine.onBufferDecoded(() => {
      setDecodeTick((n) => n + 1);
    });
    const offWave = onWaveformReady(() => {
      setDecodeTick((n) => n + 1);
    });
    return () => {
      offBuf();
      offWave();
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selectedAudioClipIds), [selectedAudioClipIds]);
  const minVisibleMs = frameToMs(minVisibleFrame);
  const maxVisibleMs = frameToMs(maxVisibleFrame);
  const pxPerMs = (pxPerFrame * FPS) / 1000;
  const playheadMs = frameToMs(playheadFrame);

  const visibleByLane = useMemo(() => {
    const map: Record<AudioLaneId, ResolvedAudioClip[]> = {
      voice: [],
      sfx: [],
      music: [],
      ambience: [],
    };
    for (const rc of resolvedAudioClips) {
      if (rc.endMs < minVisibleMs || rc.startMs > maxVisibleMs) continue;
      map[rc.lane].push(rc);
    }
    return map;
  }, [resolvedAudioClips, minVisibleMs, maxVisibleMs]);

  const handleLaneDrop = (lane: AudioLaneId, event: ReactDragEvent<HTMLDivElement>) => {
    const asset = decodeDraggedAsset(event);
    if (!asset || asset.kind !== "audio" || !onDropAudioAsset) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, event.clientX - rect.left);
    const dropMs = Math.max(0, roundMicros(x / Math.max(0.00001, pxPerMs)));
    onDropAudioAsset(lane, asset.ref, dropMs);
  };

  return (
    <div className="synced-audio-lanes" data-testid="synced-audio-lanes">
      {AUDIO_LANES.map((lane) => {
        if (hiddenLanes?.has(lane)) return null;
        const silenced = trackMix ? effectiveTrackLevel(trackMix, lane) === 0 : false;
        const laneClips = visibleByLane[lane];
        const rowHeight = laneHeights?.[lane] ?? 36;
        return (
          <div
            key={lane}
            ref={(el) => laneRefs?.[lane]?.(el)}
            className={`synced-audio-lane ${lane}-lane ${silenced ? "is-silenced" : ""}`}
            data-testid={`lane-${lane}`}
            data-lane-id={lane}
            style={{ height: rowHeight, minHeight: rowHeight, maxHeight: rowHeight }}
            onDragOver={(e) => {
              if ([...e.dataTransfer.types].length > 0) e.preventDefault();
            }}
            onDrop={(e) => handleLaneDrop(lane, e)}
          >
            {laneClips.map((rc) => (
              <AudioClipItem
                key={rc.id}
                clip={rc}
                allAudioClips={resolvedAudioClips}
                timelineClips={clips}
                isSelected={selectedSet.has(rc.id)}
                selectedIds={selectedSet}
                pxPerFrame={pxPerFrame}
                pxPerMs={pxPerMs}
                scrollLeft={scrollLeft}
                viewportWidth={viewportWidth}
                playheadMs={playheadMs}
                snapEnabled={snapEnabled}
                noteMarkers={noteMarkers}
                audioDurations={audioDurations}
                resolveMedia={resolveMedia}
                decodeTick={decodeTick}
                laneRowHeight={rowHeight}
                onSetSnapGuide={onSetSnapGuide}
                onSelect={onSelectAudioClip}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onPreviewUpdate={onPreviewUpdateAudioClip}
                onShiftDragPreview={onShiftAudioDragPreview}
                onCommitDrag={onCommitAudioDrag}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface AudioClipItemProps {
  clip: ResolvedAudioClip;
  allAudioClips: ResolvedAudioClip[];
  timelineClips: TimelineClip[];
  isSelected: boolean;
  selectedIds: ReadonlySet<string>;
  pxPerFrame: number;
  pxPerMs: number;
  scrollLeft: number;
  viewportWidth: number;
  playheadMs: number;
  snapEnabled: boolean;
  noteMarkers: NoteMarker[];
  audioDurations?: ReadonlyMap<string, number>;
  resolveMedia: (value: string | undefined) => string | undefined;
  decodeTick: number;
  laneRowHeight?: number;
  onSetSnapGuide: (frame: number | null) => void;
  onSelect: (clip: ResolvedAudioClip, additive: boolean, targetFrame?: number) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
  onPreviewUpdate: (clipId: string, updated: AudioClip) => void;
  onShiftDragPreview: (deltaMs: number, primaryClipId: string) => void;
  onCommitDrag: (deltaMs: number, copy: boolean, primaryClipId: string) => void;
}

function AudioClipItem({
  clip,
  allAudioClips,
  timelineClips,
  isSelected,
  selectedIds,
  pxPerFrame,
  pxPerMs,
  scrollLeft,
  viewportWidth,
  playheadMs,
  snapEnabled,
  noteMarkers,
  audioDurations,
  resolveMedia,
  decodeTick,
  laneRowHeight = 36,
  onSetSnapGuide,
  onSelect,
  onDragStart,
  onDragEnd,
  onPreviewUpdate,
  onShiftDragPreview,
  onCommitDrag,
}: AudioClipItemProps) {
  const [liveBadge, setLiveBadge] = useState<string | null>(null);
  const [dragTranslatePx, setDragTranslatePx] = useState<number>(0);

  const leftPx = clip.startMs * pxPerMs;
  const widthPx = Math.max(8, clip.durationMs * pxPerMs);
  const label = audioLabelFromSrc(clip.src);

  const { urls, synthTokens } = useMemo(
    () => extractPlayableUrlsFromSrc(clip.src, resolveMedia),
    [clip.src, resolveMedia],
  );
  const primaryUrl = urls[0];

  // Request IndexedDB-backed, concurrency-bounded [min, max] waveform envelope
  useEffect(() => {
    if (primaryUrl) {
      requestWaveformEnvelope(primaryUrl, clip.src);
    }
  }, [primaryUrl, clip.src]);

  const cachedEnvelope = getCachedWaveformEnvelope(primaryUrl);

  const fileDurationMs = useMemo(() => {
    if (cachedEnvelope && cachedEnvelope.durationMs > 0) return cachedEnvelope.durationMs;
    const decoded = webAudioEngine.getKnownDurationMs(clip.src);
    if (decoded && decoded > 0) return decoded;
    const buf = webAudioEngine.getCachedBuffer(primaryUrl);
    if (buf) return buf.duration * 1000;
    const cleanRef = clip.src.startsWith("file:") ? clip.src.slice(5) : clip.src;
    const sec = audioDurations?.get(cleanRef) ?? audioDurations?.get(clip.src);
    return sec && sec > 0 ? sec * 1000 : undefined;
  }, [cachedEnvelope, clip.src, primaryUrl, audioDurations, decodeTick]);

  // Viewport-clipped canvas geometry so waveforms stay razor-sharp even at 160 px/frame!
  const overscan = 240;
  const visMinX = Math.max(0, scrollLeft - overscan - leftPx);
  const visMaxX = Math.min(widthPx, scrollLeft + viewportWidth + overscan - leftPx);
  const canvasCssLeft = Math.floor(visMinX);
  const canvasCssWidth = Math.max(0, Math.min(2400, Math.ceil(visMaxX - canvasCssLeft)));
  const laneHeight = Math.max(18, laneRowHeight - 4);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasCssWidth <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixelW = Math.max(1, Math.round(canvasCssWidth * dpr));
    const pixelH = Math.max(1, Math.round(laneHeight * dpr));
    if (canvas.width !== pixelW) canvas.width = pixelW;
    if (canvas.height !== pixelH) canvas.height = pixelH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, pixelW, pixelH);

    const colors = LANE_COLORS[clip.lane];
    const env = getCachedWaveformEnvelope(primaryUrl);
    const midY = pixelH / 2;
    const gainScale = Math.max(0.02, Math.min(2.0, clip.gain));
    const maxRadius = Math.max(2, midY - 2);

    // Subtle 0-axis baseline
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(0, Math.round(midY), pixelW, 1);

    if (env && env.bucketCount > 0) {
      for (let px = 0; px < pixelW; px += 1) {
        const localCssX0 = canvasCssLeft + px / dpr;
        const localCssX1 = canvasCssLeft + (px + 1) / dpr;
        const t0Ms = clip.inMs + localCssX0 / Math.max(1e-6, pxPerMs);
        const t1Ms = clip.inMs + localCssX1 / Math.max(1e-6, pxPerMs);

        const { min, max, peak } = sampleEnvelopeRange(env, t0Ms, t1Ms, Boolean(clip.loop));

        const offsetInClipMs = localCssX0 / Math.max(1e-6, pxPerMs);
        let fadeMul = 1;
        if (clip.fadeInMs > 0 && offsetInClipMs < clip.fadeInMs) {
          fadeMul *= Math.max(0, offsetInClipMs / clip.fadeInMs);
        }
        if (clip.fadeOutMs > 0 && offsetInClipMs > clip.durationMs - clip.fadeOutMs) {
          fadeMul *= Math.max(0, (clip.durationMs - offsetInClipMs) / clip.fadeOutMs);
        }

        const effGain = gainScale * fadeMul;
        const isClipping = peak * effGain >= 0.99;
        const yTop = Math.max(1, midY - max * effGain * maxRadius);
        const yBot = Math.min(pixelH - 1, midY - min * effGain * maxRadius);
        const barH = yBot - yTop;
        if (barH > 0.5) {
          ctx.fillStyle = isClipping ? "rgba(255, 88, 76, 0.55)" : colors.fill;
          ctx.fillRect(px, yTop, 1, Math.max(1, barH));
          ctx.fillStyle = isClipping ? "rgba(255, 112, 96, 0.98)" : colors.stroke;
          ctx.fillRect(px, yTop, 1, Math.min(1.5 * dpr, Math.max(1, barH)));
          if (barH > 3 * dpr) {
            ctx.fillRect(px, yBot - 1, 1, 1);
          }
        }
      }
    } else {
      // Crisp procedural/placeholder waveform while decoding or for synth ambience beds
      ctx.fillStyle = colors.fill;
      let seed = 0;
      for (let i = 0; i < clip.src.length; i += 1) {
        seed = (seed * 31 + clip.src.charCodeAt(i)) | 0;
      }
      const isSynth = synthTokens.length > 0 && !primaryUrl;
      const barStep = Math.max(2, Math.round(3 * dpr));
      for (let px = 0; px < pixelW; px += barStep) {
        const localCssX = canvasCssLeft + px / dpr;
        const tMs = clip.inMs + localCssX / Math.max(1e-6, pxPerMs);
        const wave = isSynth
          ? 0.28 + 0.16 * Math.sin(tMs * 0.008 + seed) + 0.1 * Math.cos(tMs * 0.021)
          : 0.22 + 0.25 * Math.abs(Math.sin(tMs * 0.017 + seed) * Math.cos(tMs * 0.007));
        const offsetInClipMs = localCssX / Math.max(1e-6, pxPerMs);
        let fadeMul = 1;
        if (clip.fadeInMs > 0 && offsetInClipMs < clip.fadeInMs) {
          fadeMul *= Math.max(0, offsetInClipMs / clip.fadeInMs);
        }
        if (clip.fadeOutMs > 0 && offsetInClipMs > clip.durationMs - clip.fadeOutMs) {
          fadeMul *= Math.max(0, (clip.durationMs - offsetInClipMs) / clip.fadeOutMs);
        }
        const amp = Math.min(midY - 3, wave * gainScale * fadeMul * (midY - 3));
        ctx.fillRect(px, midY - amp, Math.max(1, barStep - 1), amp * 2);
      }
    }
  }, [
    canvasCssLeft,
    canvasCssWidth,
    clip.durationMs,
    clip.fadeInMs,
    clip.fadeOutMs,
    clip.gain,
    clip.inMs,
    clip.lane,
    clip.loop,
    clip.src,
    decodeTick,
    primaryUrl,
    pxPerMs,
    synthTokens.length,
  ]);

  // Drag sessions: body move, left trim, right trim, fade-in, fade-out, gain line
  const dragSession = useRef<
    | {
        mode: "move";
        startX: number;
        initialStartMs: number;
        moved: boolean;
        additive: boolean;
        lastDeltaMs: number;
        excludeIds: Set<string>;
      }
    | {
        mode: "trim-left" | "trim-right";
        startX: number;
        initialClip: ResolvedAudioClip;
        excludeIds: Set<string>;
      }
    | {
        mode: "fade-in" | "fade-out";
        startX: number;
        initialFadeMs: number;
        initialClip: ResolvedAudioClip;
      }
    | {
        mode: "gain";
        startX: number;
        startY: number;
        decided: "pending" | "gain" | "move";
        additive: boolean;
        initialGain: number;
        initialStartMs: number;
        lastDeltaMs: number;
        excludeIds: Set<string>;
        initialClip: ResolvedAudioClip;
      }
    | {
        mode: "volume-key";
        keyIndex: number;
        startX: number;
        startY: number;
        boxHeightPx: number;
        started: boolean;
        initialKeys: AudioVolumeKey[];
        initialClip: ResolvedAudioClip;
      }
    | null
  >(null);

  const plainAudio = (rc: ResolvedAudioClip): AudioClip => {
    const { anchorStartMs: _a, startMs: _s, endMs: _e, ...rest } = rc;
    return rest;
  };

  const edgeHandlePx = Math.max(2, Math.min(6, Math.floor(widthPx * 0.22)));
  const fadeInPx = Math.max(0, Math.min(widthPx, clip.fadeInMs * pxPerMs));
  const fadeOutPx = Math.max(0, Math.min(widthPx, clip.fadeOutMs * pxPerMs));
  // Gain line y: gain 0 => 92% from top, gain 1.0 => 46%, gain 2.0 => 6%
  const gainNorm = Math.max(0, Math.min(MAX_GAIN, clip.gain)) / MAX_GAIN;
  const gainTopPct = Math.round((0.92 - gainNorm * 0.86) * 1000) / 10;
  const valueToTopPct = (value: number) => {
    const norm = Math.max(0, Math.min(MAX_GAIN, value)) / MAX_GAIN;
    return Math.round((0.92 - norm * 0.86) * 1000) / 10;
  };

  // Music-lane volume automation: while this clip's key is being dragged, render the
  // session's key order (stable indices for pointer capture); otherwise sorted by position.
  const isMusicLane = clip.lane === "music";
  const liveKeySession =
    dragSession.current?.mode === "volume-key" &&
    dragSession.current.initialClip.id === clip.id
      ? dragSession.current
      : null;
  const volumeKeys: AudioVolumeKey[] = liveKeySession
    ? (clip.volumeKeys ?? liveKeySession.initialKeys)
    : sortedVolumeKeys(clip);
  const curvePolyline =
    isMusicLane && volumeKeys.length > 0
      ? [
          0,
          ...volumeKeys.map((key) => Math.max(0, Math.min(clip.durationMs, key.atMs))),
          clip.durationMs,
        ]
          .map((t) => {
            const x = Math.max(0, Math.min(widthPx, t * pxPerMs));
            const y = valueToTopPct(clip.gain * volumeScaleAtMs(clip, t));
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : null;

  return (
    <div
      className={[
        "audio-clip-box",
        `lane-${clip.lane}`,
        isSelected ? "is-selected" : "",
        clip.loop ? "is-loop" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={`audio-clip-${clip.id}`}
      data-clip-id={clip.id}
      data-lane={clip.lane}
      data-anchor-id={clip.anchorId}
      data-start-ms={clip.startMs.toFixed(3)}
      data-duration-ms={clip.durationMs.toFixed(3)}
      data-in-ms={clip.inMs.toFixed(3)}
      data-fade-in-ms={clip.fadeInMs.toFixed(1)}
      data-fade-out-ms={clip.fadeOutMs.toFixed(1)}
      data-gain={clip.gain.toFixed(3)}
      style={{
        left: leftPx + dragTranslatePx,
        width: widthPx,
      }}
      title={`${label} · Start ${formatMsTimecode(clip.startMs)} (${Math.round(clip.startMs)} ms) · Len ${Math.round(clip.durationMs)} ms · Gain ${Math.round(clip.gain * 100)}%`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest(".audio-edge-handle, .audio-fade-handle, .audio-gain-line")) {
          return;
        }
        e.stopPropagation();
        const additive = e.shiftKey;
        if (!isSelected && !additive) {
          onSelect(clip, false);
        }
        const exclude = new Set<string>(isSelected ? [...selectedIds] : [clip.id]);
        e.currentTarget.setPointerCapture(e.pointerId);
        dragSession.current = {
          mode: "move",
          startX: e.clientX,
          initialStartMs: clip.startMs,
          moved: false,
          additive,
          lastDeltaMs: 0,
          excludeIds: exclude,
        };
      }}
      onPointerMove={(e) => {
        const s = dragSession.current;
        if (!s || s.mode !== "move") return;
        const dx = e.clientX - s.startX;
        if (!s.moved && Math.abs(dx) < 3) return;
        if (!s.moved) {
          s.moved = true;
          onDragStart();
        }
        const rawDeltaMs = dx / Math.max(1e-6, pxPerMs);
        const rawTargetMs = Math.max(0, s.initialStartMs + rawDeltaMs);
        const ignoreSnap = e.ctrlKey || e.metaKey;
        const snapped = snapAudioMs(rawTargetMs, {
          pxPerFrame,
          snapEnabled,
          ignoreSnap,
          playheadMs,
          timelineClips,
          noteMarkers,
          otherAudioClips: allAudioClips,
          excludeAudioIds: e.altKey ? undefined : s.excludeIds,
        });
        onSetSnapGuide(snapped.snapped ? snapped.snapFrameApprox : null);
        const effectiveDeltaMs = roundMicros(snapped.ms - s.initialStartMs);
        s.lastDeltaMs = effectiveDeltaMs;

        if (e.altKey) {
          setDragTranslatePx(effectiveDeltaMs * pxPerMs);
        } else {
          setDragTranslatePx(0);
          onShiftDragPreview(effectiveDeltaMs, clip.id);
        }
        setLiveBadge(
          `${e.altKey ? "+COPY " : ""}${formatMsTimecode(snapped.ms)} (${snapped.ms.toFixed(0)} ms)`,
        );
      }}
      onPointerUp={(e) => {
        const s = dragSession.current;
        if (!s || s.mode !== "move") return;
        dragSession.current = null;
        setDragTranslatePx(0);
        setLiveBadge(null);
        onSetSnapGuide(null);

        if (s.moved) {
          onCommitDrag(s.lastDeltaMs, e.altKey, clip.id);
        } else {
          onSelect(clip, s.additive, Math.round(msToFrameFloat(clip.startMs)));
        }
      }}
      onPointerCancel={() => {
        const s = dragSession.current;
        dragSession.current = null;
        setDragTranslatePx(0);
        setLiveBadge(null);
        onSetSnapGuide(null);
        if (s && s.mode === "move" && s.moved) onDragEnd("");
      }}
    >
      {canvasCssWidth > 0 && (
        <canvas
          ref={canvasRef}
          className="audio-clip-waveform"
          data-waveform-decoded={cachedEnvelope ? "true" : "false"}
          style={{ left: canvasCssLeft, width: canvasCssWidth, height: laneHeight }}
        />
      )}

      {/* Fade-in / Fade-out curve SVG overlay */}
      {(fadeInPx > 0.5 || fadeOutPx > 0.5) && (
        <svg
          className="audio-fade-svg"
          viewBox={`0 0 ${Math.max(1, widthPx)} 36`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {fadeInPx > 0.5 && (
            <>
              <path
                className="audio-fade-shade"
                d={`M 0 0 L ${fadeInPx} 0 Q ${fadeInPx * 0.35} 6, 0 36 Z`}
              />
              <path
                className="audio-fade-curve"
                d={`M 0 36 Q ${fadeInPx * 0.35} 6, ${fadeInPx} 2`}
              />
            </>
          )}
          {fadeOutPx > 0.5 && (
            <>
              <path
                className="audio-fade-shade"
                d={`M ${widthPx - fadeOutPx} 0 L ${widthPx} 0 L ${widthPx} 36 Q ${widthPx - fadeOutPx * 0.35} 6, ${widthPx - fadeOutPx} 0 Z`}
              />
              <path
                className="audio-fade-curve"
                d={`M ${widthPx - fadeOutPx} 2 Q ${widthPx - fadeOutPx * 0.35} 6, ${widthPx} 36`}
              />
            </>
          )}
        </svg>
      )}

      {/* Clip title & millisecond pill */}
      {widthPx >= 26 && (
        <div className="audio-clip-header">
          <span className="audio-clip-title">
            {clip.loop ? "↻ " : ""}
            {label}
          </span>
          {widthPx >= 110 && (
            <span className="audio-clip-ms">{formatMsTimecode(clip.startMs)}</span>
          )}
        </div>
      )}

      {/* Horizontal Gain Line */}
      <div
        className="audio-gain-line"
        data-testid={`audio-gain-line-${clip.id}`}
        style={{ top: `${gainTopPct}%` }}
        title={
          isMusicLane
            ? `Clip gain: ${Math.round(clip.gain * 100)}% — drag vertically to adjust (scales the whole volume curve)${volumeKeys.length ? "" : " · double-click to add a volume point"}`
            : `Clip gain: ${Math.round(clip.gain * 100)}% — drag vertically to adjust`
        }
        onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          const additive = e.shiftKey;
          if (!isSelected && !additive) {
            onSelect(clip, false);
          }
          const exclude = new Set<string>(isSelected ? [...selectedIds] : [clip.id]);
          e.currentTarget.setPointerCapture(e.pointerId);
          dragSession.current = {
            mode: "gain",
            startX: e.clientX,
            startY: e.clientY,
            decided: "pending",
            additive,
            initialGain: clip.gain,
            initialStartMs: clip.startMs,
            lastDeltaMs: 0,
            excludeIds: exclude,
            initialClip: clip,
          };
        }}
        onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
          const s = dragSession.current;
          if (!s || s.mode !== "gain") return;
          const dx = e.clientX - s.startX;
          const dy = s.startY - e.clientY;
          if (s.decided === "pending") {
            if (Math.hypot(dx, dy) < 3) return;
            s.decided = Math.abs(dy) > Math.abs(dx) ? "gain" : "move";
            onDragStart();
          }
          if (s.decided === "gain") {
            const nextGain = Math.max(
              0,
              Math.min(MAX_GAIN, Math.round((s.initialGain + dy / 28) * 100) / 100),
            );
            onPreviewUpdate(clip.id, { ...plainAudio(s.initialClip), gain: nextGain });
            setLiveBadge(`Gain ${Math.round(nextGain * 100)}%`);
          } else {
            const rawDeltaMs = dx / Math.max(1e-6, pxPerMs);
            const rawTargetMs = Math.max(0, s.initialStartMs + rawDeltaMs);
            const snapped = snapAudioMs(rawTargetMs, {
              pxPerFrame,
              snapEnabled,
              ignoreSnap: e.ctrlKey || e.metaKey,
              playheadMs,
              timelineClips,
              noteMarkers,
              otherAudioClips: allAudioClips,
              excludeAudioIds: e.altKey ? undefined : s.excludeIds,
            });
            onSetSnapGuide(snapped.snapped ? snapped.snapFrameApprox : null);
            const effectiveDeltaMs = roundMicros(snapped.ms - s.initialStartMs);
            s.lastDeltaMs = effectiveDeltaMs;
            if (e.altKey) {
              setDragTranslatePx(effectiveDeltaMs * pxPerMs);
            } else {
              setDragTranslatePx(0);
              onShiftDragPreview(effectiveDeltaMs, clip.id);
            }
            setLiveBadge(
              `${e.altKey ? "+COPY " : ""}${formatMsTimecode(snapped.ms)} (${snapped.ms.toFixed(0)} ms)`,
            );
          }
        }}
        onPointerUp={(e: ReactPointerEvent<HTMLDivElement>) => {
          e.stopPropagation();
          const s = dragSession.current;
          if (!s || s.mode !== "gain") return;
          dragSession.current = null;
          setDragTranslatePx(0);
          setLiveBadge(null);
          onSetSnapGuide(null);
          if (s.decided === "gain") {
            onDragEnd("Sound gain adjusted");
          } else if (s.decided === "move") {
            onCommitDrag(s.lastDeltaMs, e.altKey, clip.id);
          } else {
            onSelect(clip, s.additive, Math.round(msToFrameFloat(clip.startMs)));
          }
        }}
        onPointerCancel={() => {
          const s = dragSession.current;
          dragSession.current = null;
          setDragTranslatePx(0);
          setLiveBadge(null);
          onSetSnapGuide(null);
          if (s && s.mode === "gain" && s.decided !== "pending") onDragEnd("");
        }}
        onDoubleClick={(e) => {
          // Music lane: double-click the gain line to insert a volume automation point
          if (!isMusicLane) return;
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const atMs = Math.max(
            0,
            Math.min(
              clip.durationMs,
              Math.round((e.clientX - rect.left) / Math.max(1e-6, pxPerMs)),
            ),
          );
          const nextKeys = [
            ...sortedVolumeKeys(clip),
            { atMs, gain: Math.round(volumeScaleAtMs(clip, atMs) * 100) / 100 },
          ].sort((a, b) => a.atMs - b.atMs);
          onDragStart();
          onPreviewUpdate(clip.id, { ...plainAudio(clip), volumeKeys: nextKeys });
          onDragEnd("Volume point added");
        }}
      />

      {/* Music-lane volume automation curve (flat master-gain line stays draggable above) */}
      {curvePolyline && (
        <svg
          className="audio-volume-curve"
          data-testid={`volume-curve-${clip.id}`}
          width={widthPx}
          height="100%"
          viewBox={`0 0 ${Math.max(1, widthPx)} 100`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points={curvePolyline}
            fill="none"
            stroke="var(--accent-violet, #a57bff)"
            strokeWidth="2"
            strokeOpacity="0.9"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {isMusicLane &&
        volumeKeys.map((key, keyIndex) => {
          const keyTopPct = valueToTopPct(clip.gain * key.gain);
          return (
            <button
              key={keyIndex}
              type="button"
              className="audio-volume-key"
              data-testid={`volume-key-${clip.id}-${keyIndex}`}
              style={{
                left: `${Math.max(0, Math.min(widthPx, key.atMs * pxPerMs))}px`,
                top: `${keyTopPct}%`,
              }}
              title={`Volume ${Math.round(key.gain * 100)}% at +${(key.atMs / 1000).toFixed(2)}s — drag to adjust, right-click to remove`}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                const boxRect = e.currentTarget
                  .closest(".audio-clip-box")
                  ?.getBoundingClientRect();
                e.currentTarget.setPointerCapture(e.pointerId);
                dragSession.current = {
                  mode: "volume-key",
                  keyIndex,
                  startX: e.clientX,
                  startY: e.clientY,
                  boxHeightPx: Math.max(1, boxRect?.height ?? 48),
                  started: false,
                  initialKeys: volumeKeys.map((k) => ({ ...k })),
                  initialClip: clip,
                };
              }}
              onPointerMove={(e) => {
                const s = dragSession.current;
                if (!s || s.mode !== "volume-key" || s.keyIndex !== keyIndex) return;
                const dx = e.clientX - s.startX;
                const dy = e.clientY - s.startY;
                if (!s.started && Math.hypot(dx, dy) < 3) return;
                if (!s.started) {
                  s.started = true;
                  onDragStart();
                }
                const initial = s.initialKeys[s.keyIndex];
                if (!initial) return;
                const nextAtMs = Math.max(
                  0,
                  Math.min(clip.durationMs, Math.round(initial.atMs + dx / Math.max(1e-6, pxPerMs))),
                );
                const startTopPct = valueToTopPct(s.initialClip.gain * initial.gain);
                const nextTopPct = Math.max(
                  6,
                  Math.min(92, startTopPct + (dy / s.boxHeightPx) * 100),
                );
                const nextValue = ((0.92 - nextTopPct / 100) / 0.86) * MAX_GAIN;
                const nextScale = Math.max(
                  0,
                  Math.min(
                    MAX_VOLUME_KEY_SCALE,
                    Math.round((nextValue / Math.max(0.02, s.initialClip.gain)) * 100) / 100,
                  ),
                );
                const nextKeys = s.initialKeys.map((k, i) =>
                  i === s.keyIndex ? { ...k, atMs: nextAtMs, gain: nextScale } : k,
                );
                onPreviewUpdate(clip.id, { ...plainAudio(clip), volumeKeys: nextKeys });
                setLiveBadge(`Volume ${Math.round(nextScale * 100)}% · +${(nextAtMs / 1000).toFixed(2)}s`);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                const s = dragSession.current;
                if (!s || s.mode !== "volume-key") return;
                dragSession.current = null;
                setLiveBadge(null);
                if (s.started) onDragEnd("Volume point adjusted");
              }}
              onPointerCancel={() => {
                const s = dragSession.current;
                if (s?.mode === "volume-key" && s.started) onDragEnd("");
                dragSession.current = null;
                setLiveBadge(null);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const nextKeys = volumeKeys.filter((_, i) => i !== keyIndex);
                onDragStart();
                onPreviewUpdate(clip.id, {
                  ...plainAudio(clip),
                  volumeKeys: nextKeys.length > 0 ? nextKeys : undefined,
                });
                onDragEnd("Volume point removed");
              }}
            >
              <i className="volume-key-shape" aria-hidden="true" />
            </button>
          );
        })}

      {/* Left edge trim (`inMs`) */}
      <span
        className="audio-edge-handle edge-left"
        data-testid={`audio-trim-left-${clip.id}`}
        style={{ width: edgeHandlePx }}
        title="Drag left edge to trim file in-point (inMs)"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragSession.current = {
            mode: "trim-left",
            startX: e.clientX,
            initialClip: clip,
            excludeIds: new Set([clip.id]),
          };
          onDragStart();
        }}
        onPointerMove={(e) => {
          const s = dragSession.current;
          if (!s || s.mode !== "trim-left") return;
          const rawStart = s.initialClip.startMs + (e.clientX - s.startX) / Math.max(1e-6, pxPerMs);
          const snapped = snapAudioMs(rawStart, {
            pxPerFrame,
            snapEnabled,
            ignoreSnap: e.ctrlKey || e.metaKey,
            playheadMs,
            timelineClips,
            noteMarkers,
            otherAudioClips: allAudioClips,
            excludeAudioIds: s.excludeIds,
          });
          onSetSnapGuide(snapped.snapped ? snapped.snapFrameApprox : null);
          const trimmed = trimAudioClipLeft(s.initialClip, snapped.ms, timelineClips, fileDurationMs);
          onPreviewUpdate(clip.id, trimmed);
          setLiveBadge(`In ${Math.round(trimmed.inMs)} ms`);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (!dragSession.current || dragSession.current.mode !== "trim-left") return;
          dragSession.current = null;
          setLiveBadge(null);
          onSetSnapGuide(null);
          onDragEnd("Sound in-point trimmed");
        }}
        onPointerCancel={() => {
          dragSession.current = null;
          setLiveBadge(null);
          onSetSnapGuide(null);
          onDragEnd("");
        }}
      />

      {/* Right edge trim (`durationMs`) */}
      <span
        className="audio-edge-handle edge-right"
        data-testid={`audio-trim-right-${clip.id}`}
        style={{ width: edgeHandlePx }}
        title="Drag right edge to trim duration (durationMs)"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragSession.current = {
            mode: "trim-right",
            startX: e.clientX,
            initialClip: clip,
            excludeIds: new Set([clip.id]),
          };
          onDragStart();
        }}
        onPointerMove={(e) => {
          const s = dragSession.current;
          if (!s || s.mode !== "trim-right") return;
          const rawEnd = s.initialClip.endMs + (e.clientX - s.startX) / Math.max(1e-6, pxPerMs);
          const snapped = snapAudioMs(rawEnd, {
            pxPerFrame,
            snapEnabled,
            ignoreSnap: e.ctrlKey || e.metaKey,
            playheadMs,
            timelineClips,
            noteMarkers,
            otherAudioClips: allAudioClips,
            excludeAudioIds: s.excludeIds,
          });
          onSetSnapGuide(snapped.snapped ? snapped.snapFrameApprox : null);
          const trimmed = trimAudioClipRight(s.initialClip, snapped.ms, fileDurationMs);
          onPreviewUpdate(clip.id, trimmed);
          setLiveBadge(`Len ${Math.round(trimmed.durationMs)} ms`);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (!dragSession.current || dragSession.current.mode !== "trim-right") return;
          dragSession.current = null;
          setLiveBadge(null);
          onSetSnapGuide(null);
          onDragEnd("Sound duration trimmed");
        }}
        onPointerCancel={() => {
          dragSession.current = null;
          setLiveBadge(null);
          onSetSnapGuide(null);
          onDragEnd("");
        }}
      />

      {/* Top-left Fade-In handle */}
      <span
        className="audio-fade-handle fade-in"
        data-testid={`audio-fade-in-${clip.id}`}
        style={{ left: Math.max(0, Math.min(widthPx - 8, fadeInPx)) }}
        title={`Fade in: ${Math.round(clip.fadeInMs)} ms — drag horizontally`}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragSession.current = {
            mode: "fade-in",
            startX: e.clientX,
            initialFadeMs: clip.fadeInMs,
            initialClip: clip,
          };
          onDragStart();
        }}
        onPointerMove={(e) => {
          const s = dragSession.current;
          if (!s || s.mode !== "fade-in") return;
          const deltaMs = (e.clientX - s.startX) / Math.max(1e-6, pxPerMs);
          const maxFade = Math.max(0, s.initialClip.durationMs - s.initialClip.fadeOutMs);
          const nextFade = Math.max(0, Math.min(maxFade, Math.round(s.initialFadeMs + deltaMs)));
          onPreviewUpdate(clip.id, { ...plainAudio(s.initialClip), fadeInMs: nextFade });
          setLiveBadge(`Fade in ${(nextFade / 1000).toFixed(2)}s (${nextFade} ms)`);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (!dragSession.current || dragSession.current.mode !== "fade-in") return;
          dragSession.current = null;
          setLiveBadge(null);
          onDragEnd("Fade-in updated");
        }}
        onPointerCancel={() => {
          dragSession.current = null;
          setLiveBadge(null);
          onDragEnd("");
        }}
      />

      {/* Top-right Fade-Out handle */}
      <span
        className="audio-fade-handle fade-out"
        data-testid={`audio-fade-out-${clip.id}`}
        style={{ right: Math.max(0, Math.min(widthPx - 8, fadeOutPx)) }}
        title={`Fade out: ${Math.round(clip.fadeOutMs)} ms — drag horizontally`}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragSession.current = {
            mode: "fade-out",
            startX: e.clientX,
            initialFadeMs: clip.fadeOutMs,
            initialClip: clip,
          };
          onDragStart();
        }}
        onPointerMove={(e) => {
          const s = dragSession.current;
          if (!s || s.mode !== "fade-out") return;
          const deltaMs = (s.startX - e.clientX) / Math.max(1e-6, pxPerMs);
          const maxFade = Math.max(0, s.initialClip.durationMs - s.initialClip.fadeInMs);
          const nextFade = Math.max(0, Math.min(maxFade, Math.round(s.initialFadeMs + deltaMs)));
          onPreviewUpdate(clip.id, { ...plainAudio(s.initialClip), fadeOutMs: nextFade });
          setLiveBadge(`Fade out ${(nextFade / 1000).toFixed(2)}s (${nextFade} ms)`);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (!dragSession.current || dragSession.current.mode !== "fade-out") return;
          dragSession.current = null;
          setLiveBadge(null);
          onDragEnd("Fade-out updated");
        }}
        onPointerCancel={() => {
          dragSession.current = null;
          setLiveBadge(null);
          onDragEnd("");
        }}
      />

      {liveBadge && (
        <div className="audio-clip-live-badge" data-testid={`audio-live-badge-${clip.id}`}>
          {liveBadge}
        </div>
      )}
    </div>
  );
}
