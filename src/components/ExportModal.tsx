import { useEffect, useMemo } from "react";
import type { Mp4ExportJobState } from "../App";
import type { Keyframe, LoudnessTargetMode, ProjectState } from "../core/model";
import { sceneLabel } from "../core/model";
import { makeStudioPatchReport, writeStudioPatch, type StudioPatchResult } from "../core/patch";
import { clipFrames, FPS, formatTimecode } from "../core/timing";
import { downloadText, slug } from "../core/helpers";
import type { TimelineClip } from "../sequence/animate";

export type ExportTab = "bundle" | "patch" | "mp4";
export type Mp4ExportQuality = "master" | "draft";

export interface ExportModalProps {
  project: ProjectState;
  frames: Keyframe[];
  clips?: TimelineClip[];
  totalFrames?: number;
  playheadFrame?: number;
  selectedClip?: TimelineClip;
  inPointFrame?: number | null;
  outPointFrame?: number | null;
  tab: ExportTab;
  setTab: (tab: ExportTab) => void;
  progress: number;
  message: string;
  patchReport: StudioPatchResult | null;
  mp4Message: string;
  rangeStart: number;
  rangeEnd: number | null;
  setRangeStart: (index: number) => void;
  setRangeEnd: (index: number | null) => void;
  wholeFilm?: boolean;
  setWholeFilm?: (whole: boolean) => void;
  fromFrame?: number;
  toFrame?: number;
  setFromFrame?: (frame: number) => void;
  setToFrame?: (frame: number) => void;
  captions: boolean;
  srt?: boolean;
  marks: boolean;
  quality?: Mp4ExportQuality;
  workers?: number;
  normalizeAudio?: boolean;
  loudnessTarget?: LoudnessTargetMode;
  opticalPrintEq?: boolean;
  embedChapters?: boolean;
  setCaptions: (value: boolean) => void;
  setSrt?: (value: boolean) => void;
  setMarks: (value: boolean) => void;
  setQuality?: (quality: Mp4ExportQuality) => void;
  setWorkers?: (workers: number) => void;
  setNormalizeAudio?: (value: boolean) => void;
  setLoudnessTarget?: (value: LoudnessTargetMode) => void;
  setOpticalPrintEq?: (value: boolean) => void;
  setEmbedChapters?: (value: boolean) => void;
  mp4Job?: Mp4ExportJobState | null;
  onBundle: () => void;
  onPatch: () => void;
  onSrt: () => void;
  onVtt?: () => void;
  onMp4: () => void;
  onCancelMp4?: () => void;
  onClose: () => void;
  onRestoreSnapshot: (snapshotId: string) => void;
}

export function ExportModal({
  project,
  frames,
  clips = [],
  totalFrames: totalFramesProp,
  playheadFrame = 0,
  selectedClip,
  inPointFrame = null,
  outPointFrame = null,
  tab,
  setTab,
  progress,
  message,
  patchReport,
  mp4Message,
  rangeStart,
  rangeEnd,
  setRangeStart,
  setRangeEnd,
  wholeFilm = true,
  setWholeFilm,
  fromFrame,
  toFrame,
  setFromFrame,
  setToFrame,
  captions,
  srt = true,
  marks,
  quality = "master",
  workers = 1,
  normalizeAudio = false,
  loudnessTarget,
  opticalPrintEq = false,
  embedChapters = true,
  setCaptions,
  setSrt,
  setMarks,
  setQuality,
  setWorkers,
  setNormalizeAudio,
  setLoudnessTarget,
  setOpticalPrintEq,
  setEmbedChapters,
  mp4Job = null,
  onBundle,
  onPatch,
  onSrt,
  onVtt,
  onMp4,
  onCancelMp4,
  onClose,
  onRestoreSnapshot,
}: ExportModalProps) {
  const isRunningMp4 = mp4Job?.status === "running";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isRunningMp4) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isRunningMp4]);

  const fallbackTotalFrames = useMemo(
    () => frames.reduce((sum, frame) => sum + clipFrames(frame), 0),
    [frames],
  );
  const resolvedTotalFrames = Math.max(1, totalFramesProp ?? fallbackTotalFrames);
  const maxFrameIdx = Math.max(0, resolvedTotalFrames - 1);

  const maxIndex = Math.max(0, frames.length - 1);
  const clampedStart = Math.max(0, Math.min(maxIndex, rangeStart));
  const clampedEnd = rangeEnd === null ? maxIndex : Math.max(0, Math.min(maxIndex, rangeEnd));

  const effectiveFromFrame = wholeFilm
    ? 0
    : Math.max(0, Math.min(maxFrameIdx, Math.round(fromFrame ?? 0)));
  const effectiveToFrame = wholeFilm
    ? maxFrameIdx
    : Math.max(
        effectiveFromFrame,
        Math.min(maxFrameIdx, Math.round(toFrame ?? maxFrameIdx)),
      );
  const exactFrameCount = effectiveToFrame - effectiveFromFrame + 1;

  const sceneFrameBounds = useMemo(() => {
    if (clips.length > 0) {
      const map = new Map<
        string,
        { sceneId: string; label: string; startFrame: number; endFrameInclusive: number; firstIndex: number; lastIndex: number }
      >();
      clips.forEach((clip, index) => {
        const existing = map.get(clip.keyframe.sceneId);
        if (existing) {
          existing.endFrameInclusive = Math.max(existing.startFrame, clip.endFrame - 1);
          existing.lastIndex = index;
        } else {
          map.set(clip.keyframe.sceneId, {
            sceneId: clip.keyframe.sceneId,
            label: sceneLabel(clip.keyframe.scene),
            startFrame: clip.startFrame,
            endFrameInclusive: Math.max(clip.startFrame, clip.endFrame - 1),
            firstIndex: index,
            lastIndex: index,
          });
        }
      });
      return [...map.values()];
    }
    let cursor = 0;
    const map = new Map<
      string,
      { sceneId: string; label: string; startFrame: number; endFrameInclusive: number; firstIndex: number; lastIndex: number }
    >();
    frames.forEach((frame, index) => {
      const dur = clipFrames(frame);
      const existing = map.get(frame.sceneId);
      if (existing) {
        existing.endFrameInclusive = Math.max(existing.startFrame, cursor + dur - 1);
        existing.lastIndex = index;
      } else {
        map.set(frame.sceneId, {
          sceneId: frame.sceneId,
          label: sceneLabel(frame.scene),
          startFrame: cursor,
          endFrameInclusive: Math.max(cursor, cursor + dur - 1),
          firstIndex: index,
          lastIndex: index,
        });
      }
      cursor += dur;
    });
    return [...map.values()];
  }, [clips, frames]);

  const previewPatch = useMemo(
    () => patchReport ?? (tab === "patch" ? writeStudioPatch(project) : null),
    [patchReport, project, tab],
  );

  const effectiveLoudness: LoudnessTargetMode =
    loudnessTarget ?? (normalizeAudio ? "-14" : "off");

  const cliCommand = useMemo(() => {
    const args = [
      "npm run export --",
      `--from ${effectiveFromFrame}`,
      `--to ${effectiveToFrame}`,
      "--media /path/to/scarlett-witness/public",
      "--out exports/",
    ];
    if (quality === "draft") args.push("--draft");
    if (workers > 1) args.push(`--workers ${workers}`);
    if (effectiveLoudness === "-16") args.push("--loudnorm -16");
    else if (effectiveLoudness === "-14") args.push("--loudnorm -14");
    if (opticalPrintEq) args.push("--optical-eq");
    if (embedChapters) args.push("--chapters");
    else args.push("--no-chapters");
    if (!captions) args.push("--no-captions");
    if (!srt) args.push("--no-srt");
    if (marks) args.push("--marks");
    return args.join(" ");
  }, [
    effectiveFromFrame,
    effectiveToFrame,
    quality,
    workers,
    effectiveLoudness,
    opticalPrintEq,
    embedChapters,
    captions,
    srt,
    marks,
  ]);

  const activeSceneBound = useMemo(() => {
    if (!selectedClip) return sceneFrameBounds[0];
    return (
      sceneFrameBounds.find((b) => b.sceneId === selectedClip.keyframe.sceneId) ??
      sceneFrameBounds[0]
    );
  }, [sceneFrameBounds, selectedClip]);

  const fromSceneValue = useMemo(() => {
    const hit = sceneFrameBounds.find(
      (b) => effectiveFromFrame >= b.startFrame && effectiveFromFrame <= b.endFrameInclusive,
    );
    return hit?.sceneId ?? sceneFrameBounds[0]?.sceneId ?? "";
  }, [sceneFrameBounds, effectiveFromFrame]);

  const toSceneValue = useMemo(() => {
    const hit = sceneFrameBounds.find(
      (b) => effectiveToFrame >= b.startFrame && effectiveToFrame <= b.endFrameInclusive,
    );
    return hit?.sceneId ?? sceneFrameBounds[sceneFrameBounds.length - 1]?.sceneId ?? "";
  }, [sceneFrameBounds, effectiveToFrame]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => !isRunningMp4 && event.target === event.currentTarget && onClose()}
    >
      <section className="modal-panel modal-panel-wide" role="dialog" aria-modal="true" aria-label="Export project">
        <header className="modal-head">
          <div>
            <span className="eyebrow">DELIVERABLES & INTERCHANGE</span>
            <h2>Export {project.title}</h2>
          </div>
          <button
            className="icon-button close-button"
            onClick={onClose}
            disabled={isRunningMp4}
            aria-label="Close export window"
          >
            ×
          </button>
        </header>

        <div className="modal-tabs" role="tablist" aria-label="Export format">
          <button
            role="tab"
            aria-selected={tab === "bundle"}
            className={`modal-tab ${tab === "bundle" ? "is-active" : ""}`}
            onClick={() => setTab("bundle")}
          >
            Portable Bundle (.reel.json)
          </button>
          <button
            role="tab"
            aria-selected={tab === "patch"}
            className={`modal-tab ${tab === "patch" ? "is-active" : ""}`}
            onClick={() => setTab("patch")}
          >
            Studio Patch (studio-edits.json)
          </button>
          <button
            role="tab"
            aria-selected={tab === "mp4"}
            data-testid="export-tab-mp4"
            className={`modal-tab ${tab === "mp4" ? "is-active" : ""}`}
            onClick={() => setTab("mp4")}
          >
            Animatic MP4 & SRT
          </button>
        </div>

        <div className="modal-body">
          {tab === "bundle" && (
            <div className="export-pane">
              <div className="export-stats">
                <div>
                  <span>KEYFRAMES</span>
                  <strong>{frames.length.toLocaleString()}</strong>
                </div>
                <div>
                  <span>PROJECT ASSETS</span>
                  <strong>{project.assets.length.toLocaleString()}</strong>
                </div>
                <div>
                  <span>UNLINKED PATHS</span>
                  <strong>{project.missing.length.toLocaleString()}</strong>
                </div>
              </div>
              <p className="export-copy">
                Packages the edited Story graph, uploaded files, and any media resolved through a linked{" "}
                <code>public</code> folder into a single <code>{slug(project.title)}.reel.json</code> bundle that can be
                re-imported on any machine. Unlinked paths remain intact and are listed in <code>missing[]</code>.
              </p>

              {progress > 0 && (
                <div className="export-progress">
                  <div className="export-progress-track">
                    <span style={{ width: `${Math.min(100, progress)}%` }} />
                  </div>
                  <small>{Math.round(progress)}%</small>
                </div>
              )}

              <div className="export-actions-row">
                <button className="button button-primary" onClick={onBundle}>
                  Download .reel.json bundle
                </button>
                <button
                  className="button button-quiet"
                  data-testid="export-srt-btn"
                  onClick={onSrt}
                >
                  Download .srt captions
                </button>
                {onVtt && (
                  <button
                    className="button button-quiet"
                    data-testid="export-vtt-btn"
                    onClick={onVtt}
                  >
                    Download .vtt captions
                  </button>
                )}
              </div>

              {project.snapshots.length > 0 && (
                <div className="export-subpanel">
                  <span className="eyebrow">SAVED SNAPSHOTS</span>
                  <div className="snapshot-inline-list">
                    {[...project.snapshots].reverse().map((snap) => (
                      <div className="snapshot-inline-row" key={snap.id}>
                        <div>
                          <strong>{snap.name}</strong>
                          <small>{new Date(snap.createdAt).toLocaleString()}</small>
                        </div>
                        <button className="button button-quiet" onClick={() => onRestoreSnapshot(snap.id)}>
                          Restore cut
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "patch" && (
            <div className="export-pane">
              <p className="export-copy">
                Diffs your current edits against <code>{project.sourceName}</code> and writes a{" "}
                <code>studio-edits.json</code> patch compatible with Scarlet Reel’s film build pipeline.
              </p>

              {previewPatch && (
                <>
                  <div className="export-stats">
                    <div>
                      <span>SCENES</span>
                      <strong>{Object.keys(previewPatch.patch.scenes).length}</strong>
                    </div>
                    <div>
                      <span>PICTURES</span>
                      <strong>{previewPatch.patch.pictures.length}</strong>
                    </div>
                    <div>
                      <span>LOOKS</span>
                      <strong>{Object.keys(previewPatch.patch.pictureLook).length}</strong>
                    </div>
                    <div>
                      <span>SFX</span>
                      <strong>{previewPatch.patch.sfx.length}</strong>
                    </div>
                  </div>

                  {previewPatch.unmatched.length > 0 && (
                    <div className="export-subpanel">
                      <span className="eyebrow">
                        NOT REPRESENTED IN STUDIO-EDITS ({previewPatch.unmatched.length})
                      </span>
                      <ul className="patch-unmatched-list">
                        {previewPatch.unmatched.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              <div className="export-actions-row">
                <button className="button button-primary" onClick={onPatch}>
                  Download studio-edits.json
                </button>
                {previewPatch && (
                  <button
                    className="button button-quiet"
                    onClick={() =>
                      downloadText(
                        makeStudioPatchReport(previewPatch),
                        `${slug(project.title)}-patch-report.txt`,
                        "text/plain",
                      )
                    }
                  >
                    Download patch report
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "mp4" && (
            <div className="export-pane">
              <p className="export-copy">
                Renders 1920×1080 24 fps H.264 video using the exact viewer drawing (<code>/?render=1</code> via
                headless Chromium) and mixes voices, SFX, music with fades &amp; ducking, and ambience into AAC.
              </p>

              <div className="export-mode-bar" role="group" aria-label="Export range mode">
                <div className="cc-seg-group">
                  <button
                    type="button"
                    data-testid="export-mode-whole"
                    className={`cc-seg-btn ${wholeFilm ? "is-active" : ""}`}
                    disabled={isRunningMp4}
                    onClick={() => {
                      setWholeFilm?.(true);
                      setRangeStart(0);
                      setRangeEnd(null);
                    }}
                  >
                    Whole film (0..{maxFrameIdx})
                  </button>
                  <button
                    type="button"
                    data-testid="export-mode-range"
                    className={`cc-seg-btn ${!wholeFilm ? "is-active" : ""}`}
                    disabled={isRunningMp4}
                    onClick={() => {
                      setWholeFilm?.(false);
                      if (setFromFrame && setToFrame && (fromFrame ?? 0) === 0 && (toFrame ?? maxFrameIdx) === maxFrameIdx && selectedClip) {
                        setFromFrame(selectedClip.startFrame);
                        setToFrame(Math.max(selectedClip.startFrame, selectedClip.endFrame - 1));
                      }
                    }}
                  >
                    In / Out range
                  </button>
                </div>

                {!wholeFilm && (
                  <div className="export-quick-range-btns">
                    {(inPointFrame !== null || outPointFrame !== null) && (
                      <button
                        type="button"
                        className="field-reset"
                        disabled={isRunningMp4}
                        data-testid="export-quick-io"
                        onClick={() => {
                          const effIn =
                            inPointFrame !== null ? Math.max(0, Math.min(maxFrameIdx, inPointFrame)) : 0;
                          const effOut =
                            outPointFrame !== null
                              ? Math.max(effIn, Math.min(maxFrameIdx, outPointFrame))
                              : maxFrameIdx;
                          setFromFrame?.(effIn);
                          setToFrame?.(effOut);
                        }}
                      >
                        Timeline I/O ({inPointFrame ?? 0}..{outPointFrame ?? maxFrameIdx})
                      </button>
                    )}
                    {selectedClip && (
                      <button
                        type="button"
                        className="field-reset"
                        disabled={isRunningMp4}
                        data-testid="export-quick-selected-clip"
                        onClick={() => {
                          setFromFrame?.(selectedClip.startFrame);
                          setToFrame?.(Math.max(selectedClip.startFrame, selectedClip.endFrame - 1));
                        }}
                      >
                        Selected shot ({selectedClip.startFrame}..{Math.max(selectedClip.startFrame, selectedClip.endFrame - 1)})
                      </button>
                    )}
                    {activeSceneBound && (
                      <button
                        type="button"
                        className="field-reset"
                        disabled={isRunningMp4}
                        data-testid="export-quick-current-scene"
                        onClick={() => {
                          setFromFrame?.(activeSceneBound.startFrame);
                          setToFrame?.(activeSceneBound.endFrameInclusive);
                        }}
                      >
                        Scene {activeSceneBound.label}
                      </button>
                    )}
                    <button
                      type="button"
                      className="field-reset"
                      disabled={isRunningMp4}
                      onClick={() => {
                        const nextIn = Math.max(0, Math.min(maxFrameIdx, playheadFrame));
                        setFromFrame?.(nextIn);
                        if (effectiveToFrame < nextIn) setToFrame?.(nextIn);
                      }}
                    >
                      In = Playhead ({playheadFrame})
                    </button>
                    <button
                      type="button"
                      className="field-reset"
                      disabled={isRunningMp4}
                      onClick={() => {
                        const nextOut = Math.max(0, Math.min(maxFrameIdx, playheadFrame));
                        setToFrame?.(nextOut);
                        if (effectiveFromFrame > nextOut) setFromFrame?.(nextOut);
                      }}
                    >
                      Out = Playhead ({playheadFrame})
                    </button>
                  </div>
                )}
              </div>

              {!wholeFilm && (
                <div className="export-range-grid">
                  <label className="export-field">
                    <span className="control-label">From frame (inclusive)</span>
                    <input
                      className="text-control"
                      data-testid="export-from-frame-input"
                      type="number"
                      min={0}
                      max={maxFrameIdx}
                      disabled={isRunningMp4}
                      value={effectiveFromFrame}
                      onChange={(event) => {
                        const next = Math.max(0, Math.min(maxFrameIdx, Math.round(Number(event.target.value) || 0)));
                        setFromFrame?.(next);
                        if (effectiveToFrame < next) setToFrame?.(next);
                      }}
                    />
                  </label>

                  <label className="export-field">
                    <span className="control-label">To frame (inclusive)</span>
                    <input
                      className="text-control"
                      data-testid="export-to-frame-input"
                      type="number"
                      min={effectiveFromFrame}
                      max={maxFrameIdx}
                      disabled={isRunningMp4}
                      value={effectiveToFrame}
                      onChange={(event) => {
                        const raw = Number(event.target.value);
                        const next = Number.isFinite(raw)
                          ? Math.max(effectiveFromFrame, Math.min(maxFrameIdx, Math.round(raw)))
                          : effectiveFromFrame;
                        setToFrame?.(next);
                      }}
                    />
                  </label>

                  <label className="export-field">
                    <span className="control-label">From scene</span>
                    <select
                      disabled={isRunningMp4}
                      value={fromSceneValue || frames[clampedStart]?.sceneId || ""}
                      onChange={(event) => {
                        const entry = sceneFrameBounds.find((item) => item.sceneId === event.target.value);
                        if (entry) {
                          setRangeStart(entry.firstIndex);
                          setFromFrame?.(entry.startFrame);
                          if (effectiveToFrame < entry.startFrame) {
                            setToFrame?.(entry.endFrameInclusive);
                          }
                        }
                      }}
                    >
                      {sceneFrameBounds.map((item) => (
                        <option key={`from-${item.sceneId}`} value={item.sceneId}>
                          SC {item.label} (f{item.startFrame})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="export-field">
                    <span className="control-label">To scene</span>
                    <select
                      disabled={isRunningMp4}
                      value={toSceneValue || frames[clampedEnd]?.sceneId || ""}
                      onChange={(event) => {
                        const entry = sceneFrameBounds.find((item) => item.sceneId === event.target.value);
                        if (entry) {
                          setRangeEnd(entry.lastIndex);
                          setToFrame?.(entry.endFrameInclusive);
                          if (effectiveFromFrame > entry.endFrameInclusive) {
                            setFromFrame?.(entry.startFrame);
                          }
                        }
                      }}
                    >
                      {sceneFrameBounds.map((item) => (
                        <option key={`to-${item.sceneId}`} value={item.sceneId}>
                          SC {item.label} (f{item.endFrameInclusive})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {setQuality && (
                <div className="export-perf-row">
                  <div className="cc-segmented" role="group" aria-label="Render quality">
                    <button
                      type="button"
                      data-testid="export-quality-master"
                      className={`cc-seg-btn ${quality === "master" ? "is-active" : ""}`}
                      disabled={isRunningMp4}
                      onClick={() => setQuality("master")}
                      title="Lossless 1920×1080 PNG capture + CRF 18 H.264"
                    >
                      Master 1080p (PNG)
                    </button>
                    <button
                      type="button"
                      data-testid="export-quality-draft"
                      className={`cc-seg-btn ${quality === "draft" ? "is-active" : ""}`}
                      disabled={isRunningMp4}
                      onClick={() => setQuality("draft")}
                      title="Fast 1280×720 JPEG (q=92) capture + veryfast CRF 21 H.264 (~5–8× faster)"
                    >
                      Draft 720p Fast
                    </button>
                  </div>

                  {setWorkers && (
                    <label className="export-inline-select">
                      <span>Workers</span>
                      <select
                        data-testid="export-workers-select"
                        disabled={isRunningMp4}
                        value={workers}
                        onChange={(event) => setWorkers(Math.max(1, Math.min(8, Number(event.target.value) || 1)))}
                        title="Split frame range across parallel headless Chromium + ffmpeg segment workers"
                      >
                        <option value={1}>1 worker</option>
                        <option value={2}>2 workers</option>
                        <option value={3}>3 workers</option>
                        <option value={4}>4 workers</option>
                      </select>
                    </label>
                  )}

                  {(setLoudnessTarget || setNormalizeAudio) && (
                    <label
                      className="export-inline-select"
                      title="ITU-R BS.1770 K-weighted loudness mastering (−16 LUFS theatrical / −14 LUFS streaming)"
                    >
                      <span>Loudness</span>
                      <select
                        data-testid="export-loudness-select"
                        disabled={isRunningMp4}
                        value={effectiveLoudness}
                        onChange={(event) => {
                          const v = event.target.value as LoudnessTargetMode;
                          setLoudnessTarget?.(v);
                          setNormalizeAudio?.(v !== "off");
                        }}
                      >
                        <option value="off">Off (Original Mix)</option>
                        <option value="-16">−16 LUFS (Theatrical)</option>
                        <option value="-14">−14 LUFS (Streaming)</option>
                      </select>
                    </label>
                  )}

                  {setOpticalPrintEq && (
                    <label
                      className="checkbox-label"
                      title="Apply warm 1950s optical-print EQ (85 Hz HPF, +1.8 dB @ 1.8 kHz, 7.8 kHz LPF)"
                    >
                      <input
                        type="checkbox"
                        data-testid="export-opt-optical-eq"
                        disabled={isRunningMp4}
                        checked={opticalPrintEq}
                        onChange={(event) => setOpticalPrintEq(event.target.checked)}
                      />
                      <span>1950s Optical-Print EQ</span>
                    </label>
                  )}
                </div>
              )}

              <div className="export-toggle-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    data-testid="export-opt-captions"
                    disabled={isRunningMp4}
                    checked={captions}
                    onChange={(event) => setCaptions(event.target.checked)}
                  />
                  <span>Captions burnt in</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    data-testid="export-opt-srt"
                    disabled={isRunningMp4}
                    checked={srt}
                    onChange={(event) => setSrt?.(event.target.checked)}
                  />
                  <span>Write .srt file</span>
                </label>
                {setEmbedChapters && (
                  <label
                    className="checkbox-label"
                    title="Embed timeline chapter / scene markers directly inside the MP4 container"
                  >
                    <input
                      type="checkbox"
                      data-testid="export-opt-chapters"
                      disabled={isRunningMp4}
                      checked={embedChapters}
                      onChange={(event) => setEmbedChapters(event.target.checked)}
                    />
                    <span>Embed MP4 chapters</span>
                  </label>
                )}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    data-testid="export-opt-marks"
                    disabled={isRunningMp4}
                    checked={marks}
                    onChange={(event) => setMarks(event.target.checked)}
                  />
                  <span>Timecode &amp; scene mark in corner</span>
                </label>
                <span className="asset-count" data-testid="export-exact-frame-count">
                  {exactFrameCount.toLocaleString()} exact frame{exactFrameCount === 1 ? "" : "s"} ({effectiveFromFrame}..{effectiveToFrame}) · {formatTimecode(exactFrameCount)} ({(exactFrameCount / FPS).toFixed(2)}s)
                </span>
              </div>

              <div className="export-cli-box">
                <span className="eyebrow">CLI EXPORT COMMAND</span>
                <code data-testid="export-cli-command">{cliCommand}</code>
              </div>

              {mp4Job && (
                <div className="export-mp4-progress-box" data-testid="export-mp4-progress" data-status={mp4Job.status}>
                  <div className="export-mp4-progress-head">
                    <strong>{mp4Job.phase}</strong>
                    <span>
                      {mp4Job.completedFrames.toLocaleString()} / {mp4Job.totalFrames.toLocaleString()} frames ({Math.round(mp4Job.percent)}%)
                    </span>
                  </div>
                  <div className="export-progress-track">
                    <span style={{ width: `${Math.max(0, Math.min(100, mp4Job.percent))}%` }} />
                  </div>
                  {mp4Job.status === "done" && (mp4Job.mp4Url || mp4Job.srtUrl) && (
                    <div className="export-download-links">
                      {mp4Job.mp4Url && (
                        <a
                          className="button button-quiet"
                          data-testid="export-mp4-download-link"
                          href={mp4Job.mp4Url}
                          download={mp4Job.fileName || "animatic.mp4"}
                        >
                          Download {mp4Job.fileName || "MP4"}
                        </a>
                      )}
                      {mp4Job.srtUrl && (
                        <a
                          className="button button-quiet"
                          data-testid="export-srt-download-link"
                          href={mp4Job.srtUrl}
                          download={mp4Job.srtFileName || "animatic.srt"}
                        >
                          Download {mp4Job.srtFileName || ".srt"}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="export-actions-row">
                <button
                  className="button button-primary"
                  data-testid="export-mp4-render-btn"
                  disabled={isRunningMp4}
                  onClick={onMp4}
                >
                  {isRunningMp4 ? "Rendering MP4…" : "Render MP4 animatic"}
                </button>
                {isRunningMp4 && onCancelMp4 && (
                  <button
                    type="button"
                    className="button button-quiet danger-quiet"
                    data-testid="export-mp4-cancel-btn"
                    onClick={onCancelMp4}
                  >
                    Cancel render
                  </button>
                )}
                <button
                  className="button button-quiet"
                  data-testid="export-range-srt-btn"
                  disabled={isRunningMp4}
                  onClick={onSrt}
                >
                  Export range .srt
                </button>
                {onVtt && (
                  <button
                    className="button button-quiet"
                    data-testid="export-range-vtt-btn"
                    disabled={isRunningMp4}
                    onClick={onVtt}
                  >
                    Export range .vtt
                  </button>
                )}
              </div>

              {mp4Message && (
                <div className="modal-callout" data-testid="export-mp4-callout">
                  {mp4Message}
                </div>
              )}
            </div>
          )}

          {message && <div className="export-status-banner" role="status">{message}</div>}
        </div>

        <footer className="modal-foot">
          <span>Source pictures and audio takes are never re-encoded.</span>
          <button className="button button-quiet" disabled={isRunningMp4} onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
