import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { BeatAnimation } from "../core/model";
import { firstLine, sceneLabel } from "../core/model";
import { formatTimecode, MIN_CLIP_FRAMES } from "../core/timing";
import {
  clipAtFrame,
  moveKeyToFrame,
  visibleClipRange,
  type AnimProp,
  type TimelineClip,
} from "../sequence/animate";
import { storyboardGradient } from "../core/helpers";

export interface TimelineProps {
  clips: TimelineClip[];
  totalFrames: number;
  playheadFrame: number;
  selectedFrameId: string;
  selectedFrameIds: string[];
  canSplit: boolean;
  resolveMedia: (value: string | undefined) => string | undefined;
  onScrub: (frame: number) => void;
  onSelectClip: (frameId: string, extend: boolean, targetFrame?: number) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
  onTrimPreview: (frameId: string, durationFrames: number) => void;
  onAnimationPreview: (frameId: string, animation: BeatAnimation | undefined) => void;
  onSplit: () => void;
  onDelete: () => void;
  onDropFile: (file: File, frameId: string) => void;
}

const MIN_PX_PER_FRAME = 0.08;
const MAX_PX_PER_FRAME = 16;
const DEFAULT_PX_PER_FRAME = 1.6;
const TICK_INTERVALS = [1, 2, 4, 6, 12, 24, 48, 120, 240, 360, 720, 1440, 2880, 7200];

function chooseMajorTickFrames(pxPerFrame: number): number {
  for (const step of TICK_INTERVALS) {
    if (step * pxPerFrame >= 92) return step;
  }
  return 7200;
}

export function Timeline({
  clips,
  totalFrames,
  playheadFrame,
  selectedFrameId,
  selectedFrameIds,
  canSplit,
  resolveMedia,
  onScrub,
  onSelectClip,
  onDragStart,
  onDragEnd,
  onTrimPreview,
  onAnimationPreview,
  onSplit,
  onDelete,
  onDropFile,
}: TimelineProps) {
  const [pxPerFrame, setPxPerFrame] = useState(DEFAULT_PX_PER_FRAME);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1100);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);
  const initialCenteredRef = useRef(false);
  const pxPerFrameRef = useRef(pxPerFrame);
  pxPerFrameRef.current = pxPerFrame;
  const playheadRef = useRef(playheadFrame);
  playheadRef.current = playheadFrame;

  const activeClip = useMemo(() => clipAtFrame(clips, playheadFrame), [clips, playheadFrame]);

  // Measure viewport width on mount and resize
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportWidth(Math.max(320, el.clientWidth));
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const centerFrameInView = useCallback((frame: number, scale = pxPerFrameRef.current) => {
    const el = scrollRef.current;
    if (!el) return;
    const targetLeft = Math.max(0, frame * scale - el.clientWidth * 0.28);
    el.scrollLeft = targetLeft;
    setScrollLeft(targetLeft);
  }, []);

  // Center initial playhead (e.g. Scene 77) once clips load, and keep playhead visible during playback/step
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !clips.length) return;
    if (!initialCenteredRef.current) {
      initialCenteredRef.current = true;
      centerFrameInView(playheadFrame, pxPerFrame);
      return;
    }
    if (scrubbingRef.current) return;
    const x = playheadFrame * pxPerFrame;
    const left = el.scrollLeft;
    const width = el.clientWidth;
    if (x < left + 24 || x > left + width - 48) {
      const next = Math.max(0, x - width * 0.25);
      el.scrollLeft = next;
      setScrollLeft(next);
    }
  }, [clips.length, playheadFrame, pxPerFrame, centerFrameInView]);

  const zoomTimeline = useCallback((factor: number, anchorX?: number) => {
    const el = scrollRef.current;
    const prevScale = pxPerFrameRef.current;
    const nextScale = Math.max(MIN_PX_PER_FRAME, Math.min(MAX_PX_PER_FRAME, prevScale * factor));
    if (Math.abs(nextScale - prevScale) < 1e-6) return;
    const viewOffset = anchorX ?? (el ? Math.min(el.clientWidth * 0.5, Math.max(40, playheadRef.current * prevScale - el.scrollLeft)) : 240);
    const anchorFrame = el ? (el.scrollLeft + viewOffset) / prevScale : playheadRef.current;
    setPxPerFrame(nextScale);
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const nextLeft = Math.max(0, anchorFrame * nextScale - viewOffset);
      scrollRef.current.scrollLeft = nextLeft;
      setScrollLeft(nextLeft);
    });
  }, []);

  // Ctrl/Cmd + wheel zoom on timeline viewport
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      zoomTimeline(factor, offsetX);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTimeline]);

  const scenes = useMemo(() => {
    const seen = new Map<string, TimelineClip>();
    for (const clip of clips) {
      if (!seen.has(clip.keyframe.sceneId)) seen.set(clip.keyframe.sceneId, clip);
    }
    return [...seen.values()];
  }, [clips]);

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const results: TimelineClip[] = [];
    for (const clip of clips) {
      const kf = clip.keyframe;
      if (`${kf.mark} ${kf.speaker} ${kf.text} ${kf.picture || ""}`.toLowerCase().includes(q)) {
        results.push(clip);
        if (results.length >= 40) break;
      }
    }
    return results;
  }, [clips, search]);

  const jumpToClip = (clip: TimelineClip) => {
    onSelectClip(clip.keyframe.id, false, clip.startFrame);
    centerFrameInView(clip.startFrame);
    setSearchOpen(false);
  };

  // Virtualized visible window
  const overscanPx = 320;
  const minVisibleFrame = Math.max(0, Math.floor((scrollLeft - overscanPx) / pxPerFrame));
  const maxVisibleFrame = Math.min(
    Math.max(1, totalFrames),
    Math.ceil((scrollLeft + viewportWidth + overscanPx) / pxPerFrame),
  );
  const [visStart, visEnd] = useMemo(
    () => visibleClipRange(clips, minVisibleFrame, maxVisibleFrame),
    [clips, minVisibleFrame, maxVisibleFrame],
  );
  const visibleClips = useMemo(
    () => (visEnd >= visStart ? clips.slice(visStart, visEnd + 1) : []),
    [clips, visStart, visEnd],
  );

  const majorStep = chooseMajorTickFrames(pxPerFrame);
  const minorStep = majorStep >= 24 ? majorStep / 4 : majorStep >= 4 ? majorStep / 2 : 1;
  const ticks = useMemo(() => {
    const list: Array<{ frame: number; major: boolean }> = [];
    const firstTick = Math.max(0, Math.floor(minVisibleFrame / minorStep) * minorStep);
    const lastTick = Math.min(totalFrames, maxVisibleFrame);
    for (let f = firstTick; f <= lastTick; f += minorStep) {
      const rounded = Math.round(f);
      const isMajor = rounded % majorStep === 0;
      if (isMajor || minorStep * pxPerFrame >= 10) {
        list.push({ frame: rounded, major: isMajor });
      }
    }
    return list;
  }, [minVisibleFrame, maxVisibleFrame, totalFrames, majorStep, minorStep, pxPerFrame]);

  const frameFromClientX = (clientX: number): number => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(x / pxPerFrame)));
  };

  const beginScrub = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onScrub(frameFromClientX(event.clientX));
  };

  const moveScrub = (event: ReactPointerEvent<HTMLElement>) => {
    if (!scrubbingRef.current) return;
    onScrub(frameFromClientX(event.clientX));
  };

  const endScrub = () => {
    scrubbingRef.current = false;
  };

  const trackWidth = Math.max(viewportWidth, Math.ceil(totalFrames * pxPerFrame) + 120);

  return (
    <section className="timeline-editor" aria-label="Picture timeline" data-testid="picture-timeline">
      <header className="timeline-toolbar">
        <div className="timeline-goto-group">
          <span className="eyebrow">GO TO</span>
          <select
            className="timeline-scene-select"
            aria-label="Go to scene"
            value={activeClip?.keyframe.sceneId || ""}
            onChange={(event) => {
              const target = scenes.find((c) => c.keyframe.sceneId === event.target.value);
              if (target) jumpToClip(target);
            }}
          >
            {scenes.map((clip) => (
              <option key={clip.keyframe.sceneId} value={clip.keyframe.sceneId}>
                SC {sceneLabel(clip.keyframe.scene)} · {formatTimecode(clip.startFrame)}
              </option>
            ))}
          </select>

          <div className="timeline-goto-search">
            <label className="timeline-search">
              <span>⌕</span>
              <input
                value={search}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 160)}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && searchMatches[0]) {
                    event.preventDefault();
                    jumpToClip(searchMatches[0]);
                  } else if (event.key === "Escape") {
                    setSearchOpen(false);
                  }
                }}
                placeholder="Go to line or speaker…"
              />
            </label>
            {searchOpen && search.trim() && (
              <div className="timeline-search-popover" role="listbox" aria-label="Matching shots">
                {searchMatches.length > 0 ? (
                  searchMatches.map((clip) => (
                    <button
                      type="button"
                      key={clip.keyframe.id}
                      className="timeline-search-hit"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        jumpToClip(clip);
                      }}
                    >
                      <span className="hit-mark">SC {clip.keyframe.mark}</span>
                      <span className="hit-tc">{formatTimecode(clip.startFrame)}</span>
                      <span className="hit-copy">
                        <strong>{clip.keyframe.speaker}:</strong> {firstLine(clip.keyframe.text, 54) || "No caption"}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="timeline-search-empty">No matching beats</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="timeline-edit-tools">
          <button
            type="button"
            className="button button-quiet"
            onClick={onSplit}
            disabled={!canSplit}
            title="Split selected clip at playhead (S)"
          >
            ✂ Split (S)
          </button>
          <button
            type="button"
            className="button button-quiet danger-quiet"
            onClick={onDelete}
            title="Delete selected clip (Delete)"
          >
            Delete
          </button>
          <span className="timeline-tc-badge" data-testid="timeline-timecode">
            <strong>{formatTimecode(playheadFrame)}</strong>
            <i>/</i>
            <span>{formatTimecode(totalFrames)}</span>
          </span>
        </div>

        <div className="timeline-zoom-group" role="group" aria-label="Timeline zoom">
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom out timeline"
            data-testid="timeline-zoom-out"
            onClick={() => zoomTimeline(1 / 1.35)}
            title="Zoom out timeline (− or Ctrl+scroll)"
          >
            −
          </button>
          <span className="timeline-zoom-readout">{Math.round(pxPerFrame * 24)}px/s</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom in timeline"
            data-testid="timeline-zoom-in"
            onClick={() => zoomTimeline(1.35)}
            title="Zoom in timeline (+ or Ctrl+scroll)"
          >
            +
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="timeline-scroll-area"
        data-testid="timeline-scroll"
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
      >
        <div className="timeline-canvas" style={{ width: trackWidth }}>
          <div
            className="timeline-ruler"
            data-testid="timeline-ruler"
            onPointerDown={beginScrub}
            onPointerMove={moveScrub}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
          >
            {ticks.map((tick) => (
              <span
                key={tick.frame}
                className={`ruler-tick ${tick.major ? "is-major" : "is-minor"}`}
                style={{ left: tick.frame * pxPerFrame }}
              >
                {tick.major && <b>{formatTimecode(tick.frame)}</b>}
              </span>
            ))}
          </div>

          <div className="timeline-picture-track" data-testid="picture-track">
            {visibleClips.map((clip) => {
              const rawSrc = resolveMedia(clip.keyframe.picture);
              const imageThumb =
                rawSrc && !rawSrc.startsWith("gradient:") && !rawSrc.startsWith("emoji:") ? rawSrc : undefined;
              return (
                <ClipItem
                  key={`${clip.keyframe.sceneId}:${clip.keyframe.id}:${clip.index}`}
                  clip={clip}
                  pxPerFrame={pxPerFrame}
                  isSelected={selectedFrameId === clip.keyframe.id}
                  isMulti={selectedFrameIds.includes(clip.keyframe.id)}
                  thumbSrc={imageThumb}
                  onSelect={(extend, clientX) => {
                    const clickedFrame = Math.max(
                      clip.startFrame,
                      Math.min(clip.endFrame - 1, frameFromClientX(clientX)),
                    );
                    onSelectClip(clip.keyframe.id, extend, extend ? undefined : clickedFrame);
                  }}
                  onScrub={onScrub}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onTrimPreview={onTrimPreview}
                  onAnimationPreview={onAnimationPreview}
                  onDropFile={onDropFile}
                />
              );
            })}
          </div>

          <div
            className="timeline-playhead"
            data-testid="timeline-playhead"
            style={{ left: playheadFrame * pxPerFrame }}
          >
            <div
              className="timeline-playhead-head"
              role="slider"
              aria-label="Playhead"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, totalFrames - 1)}
              aria-valuenow={playheadFrame}
              tabIndex={0}
              onPointerDown={beginScrub}
              onPointerMove={moveScrub}
              onPointerUp={endScrub}
              onPointerCancel={endScrub}
            />
            <div className="timeline-playhead-line" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ClipItem({
  clip,
  pxPerFrame,
  isSelected,
  isMulti,
  thumbSrc,
  onSelect,
  onScrub,
  onDragStart,
  onDragEnd,
  onTrimPreview,
  onAnimationPreview,
  onDropFile,
}: {
  clip: TimelineClip;
  pxPerFrame: number;
  isSelected: boolean;
  isMulti: boolean;
  thumbSrc?: string;
  onSelect: (extend: boolean, clientX: number) => void;
  onScrub: (frame: number) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
  onTrimPreview: (frameId: string, durationFrames: number) => void;
  onAnimationPreview: (frameId: string, animation: BeatAnimation | undefined) => void;
  onDropFile: (file: File, frameId: string) => void;
}) {
  const kf = clip.keyframe;
  const width = Math.max(3, clip.durationFrames * pxPerFrame);
  const left = clip.startFrame * pxPerFrame;
  const isVoiceCut = clip.voiceFrames > 0 && clip.durationFrames < clip.voiceFrames;
  const picture = kf.picture || "";
  const bgFallback = picture.startsWith("gradient:")
    ? picture.slice(9)
    : storyboardGradient(picture).slice(9);

  const trimSession = useRef<{ startX: number; initialDuration: number } | null>(null);
  const keySession = useRef<{
    prop: AnimProp;
    startX: number;
    initialFrame: number;
    initialAnim: BeatAnimation | undefined;
    moved: boolean;
  } | null>(null);

  const anim = kf.beat.animation;

  return (
    <div
      className={[
        "timeline-clip",
        isSelected ? "is-selected" : "",
        isMulti ? "is-multi" : "",
        isVoiceCut ? "is-voice-cut" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        left,
        width,
        background: thumbSrc ? undefined : bgFallback,
      }}
      data-frame-id={kf.id}
      data-scene-mark={kf.mark}
      data-start-frame={clip.startFrame}
      data-duration-frames={clip.durationFrames}
      onClick={(event) => onSelect(event.shiftKey, event.clientX)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = [...event.dataTransfer.files].find((f) => f.type.startsWith("image/"));
        if (file) onDropFile(file, kf.id);
      }}
      title={
        isVoiceCut
          ? `SC ${kf.mark} / ${kf.number} — Picture (${clip.durationFrames}f) ends before voice (${clip.voiceFrames}f)`
          : `SC ${kf.mark} / ${kf.number} · ${formatTimecode(clip.startFrame)} (${clip.durationFrames}f)`
      }
    >
      {thumbSrc && <img className="timeline-clip-thumb" src={thumbSrc} alt="" loading="lazy" decoding="async" />}

      {width >= 18 && (
        <div className="timeline-clip-overlay">
          <span className="timeline-clip-mark">{kf.mark}</span>
          {width >= 72 && (
            <span className="timeline-clip-label">
              {picture.split("/").pop()?.replace(/\.[^.]+$/, "") || kf.speaker}
            </span>
          )}
        </div>
      )}

      {clip.voiceFrames > 0 && (
        <div
          className={`timeline-clip-voice ${isVoiceCut ? "is-cut" : ""}`}
          data-testid={`voice-bar-${kf.id}`}
          style={{
            width: `${Math.min(100, (clip.voiceFrames / Math.max(1, clip.durationFrames)) * 100)}%`,
          }}
        />
      )}

      {isSelected && anim && (
        <div className="timeline-clip-keyframes">
          {(["zoom", "x", "y"] as const).map((prop) =>
            (anim[prop] ?? []).map((key) => {
              const clampedFrame = Math.max(0, Math.min(clip.durationFrames - 1, key.frame));
              const keyLeftPx = Math.max(
                5,
                Math.min(Math.max(5, width - 7), (clampedFrame + 0.5) * pxPerFrame),
              );
              return (
                <button
                  type="button"
                  key={`${prop}-${key.frame}`}
                  className={`clip-key-diamond prop-${prop}`}
                  data-testid={`clip-diamond-${prop}-${key.frame}`}
                  style={{ left: keyLeftPx }}
                  title={`${prop}: ${key.value} @ +${key.frame}f (${key.easing})`}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    keySession.current = {
                      prop,
                      startX: event.clientX,
                      initialFrame: key.frame,
                      initialAnim: JSON.parse(JSON.stringify(anim)) as BeatAnimation,
                      moved: false,
                    };
                    onDragStart();
                  }}
                  onPointerMove={(event) => {
                    const session = keySession.current;
                    if (!session) return;
                    const dx = event.clientX - session.startX;
                    if (Math.abs(dx) > 2) session.moved = true;
                    const nextFrame = Math.max(
                      0,
                      Math.min(
                        Math.max(0, clip.durationFrames - 1),
                        Math.round(session.initialFrame + dx / pxPerFrame),
                      ),
                    );
                    const updated = moveKeyToFrame(
                      session.initialAnim,
                      session.prop,
                      session.initialFrame,
                      nextFrame,
                      Math.max(0, clip.durationFrames - 1),
                    );
                    onAnimationPreview(kf.id, updated);
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    const session = keySession.current;
                    keySession.current = null;
                    if (!session) return;
                    if (session.moved) {
                      onDragEnd(`${session.prop} keyframe moved`);
                    } else {
                      onDragEnd("");
                      onScrub(clip.startFrame + Math.min(Math.max(0, clip.durationFrames - 1), session.initialFrame));
                    }
                  }}
                  onPointerCancel={() => {
                    keySession.current = null;
                    onDragEnd("");
                  }}
                >
                  ◆
                </button>
              );
            }),
          )}
        </div>
      )}

      <div
        className="timeline-clip-trim"
        data-testid={`trim-handle-${kf.id}`}
        role="separator"
        aria-label={`Trim clip ${kf.mark}/${kf.number}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          trimSession.current = {
            startX: event.clientX,
            initialDuration: clip.durationFrames,
          };
          onDragStart();
        }}
        onPointerMove={(event) => {
          const session = trimSession.current;
          if (!session) return;
          const deltaFrames = Math.round((event.clientX - session.startX) / pxPerFrame);
          const nextDuration = Math.max(MIN_CLIP_FRAMES, session.initialDuration + deltaFrames);
          onTrimPreview(kf.id, nextDuration);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          if (!trimSession.current) return;
          trimSession.current = null;
          onDragEnd("Clip trimmed");
        }}
        onPointerCancel={() => {
          trimSession.current = null;
          onDragEnd("");
        }}
      />
    </div>
  );
}
