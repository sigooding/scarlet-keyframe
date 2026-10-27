import { useEffect, useMemo } from "react";
import type { Keyframe, ProjectState } from "../core/model";
import { sceneLabel } from "../core/model";
import { makeStudioPatchReport, writeStudioPatch, type StudioPatchResult } from "../core/patch";
import { clipFrames, FPS, formatTimecode } from "../core/timing";
import { downloadText, slug } from "../core/helpers";

export type ExportTab = "bundle" | "patch" | "mp4";

export interface ExportModalProps {
  project: ProjectState;
  frames: Keyframe[];
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
  captions: boolean;
  marks: boolean;
  setCaptions: (value: boolean) => void;
  setMarks: (value: boolean) => void;
  onBundle: () => void;
  onPatch: () => void;
  onSrt: () => void;
  onMp4: () => void;
  onClose: () => void;
  onRestoreSnapshot: (snapshotId: string) => void;
}

export function ExportModal({
  project,
  frames,
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
  captions,
  marks,
  setCaptions,
  setMarks,
  onBundle,
  onPatch,
  onSrt,
  onMp4,
  onClose,
  onRestoreSnapshot,
}: ExportModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const maxIndex = Math.max(0, frames.length - 1);
  const clampedStart = Math.max(0, Math.min(maxIndex, rangeStart));
  const clampedEnd = rangeEnd === null ? maxIndex : Math.max(0, Math.min(maxIndex, rangeEnd));
  const sliceFrom = Math.min(clampedStart, clampedEnd);
  const sliceTo = Math.max(clampedStart, clampedEnd);

  const sceneBounds = useMemo(() => {
    const map = new Map<string, { sceneId: string; label: string; firstIndex: number; lastIndex: number }>();
    frames.forEach((frame, index) => {
      const existing = map.get(frame.sceneId);
      if (existing) existing.lastIndex = index;
      else map.set(frame.sceneId, { sceneId: frame.sceneId, label: sceneLabel(frame.scene), firstIndex: index, lastIndex: index });
    });
    return [...map.values()];
  }, [frames]);

  const rangeFrames = useMemo(
    () => (frames.length ? frames.slice(sliceFrom, sliceTo + 1) : []),
    [frames, sliceFrom, sliceTo],
  );
  const rangeTotalFrames = useMemo(
    () => rangeFrames.reduce((sum, frame) => sum + clipFrames(frame), 0),
    [rangeFrames],
  );

  const previewPatch = useMemo(
    () => patchReport ?? (tab === "patch" ? writeStudioPatch(project) : null),
    [patchReport, project, tab],
  );

  const cliCommand = useMemo(() => {
    const startScene = frames[sliceFrom]?.sceneId;
    const endScene = frames[sliceTo]?.sceneId;
    const args = ["node vendor/scarlet-reel/tools/export-animatic.mjs"];
    if (startScene && sliceFrom > 0) args.push(`--from ${startScene}`);
    if (endScene && rangeEnd !== null && sliceTo < maxIndex) args.push(`--to ${endScene}`);
    if (!captions) args.push("--no-subs");
    if (!marks) args.push("--no-marks");
    return args.join(" ");
  }, [frames, sliceFrom, sliceTo, rangeEnd, maxIndex, captions, marks]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal-panel modal-panel-wide" role="dialog" aria-modal="true" aria-label="Export project">
        <header className="modal-head">
          <div>
            <span className="eyebrow">DELIVERABLES & INTERCHANGE</span>
            <h2>Export {project.title}</h2>
          </div>
          <button className="icon-button close-button" onClick={onClose} aria-label="Close export window">
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
                <button className="button button-quiet" onClick={onSrt}>
                  Download .srt captions
                </button>
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
                Select a scene or keyframe span for caption export (<code>.srt</code>) or frame-accurate animatic video
                rendering via Scarlet Reel’s Playwright + <code>ffmpeg</code> exporter.
              </p>

              <div className="export-range-grid">
                <label className="export-field">
                  <span className="control-label">From scene</span>
                  <select
                    value={frames[clampedStart]?.sceneId || ""}
                    onChange={(event) => {
                      const entry = sceneBounds.find((item) => item.sceneId === event.target.value);
                      if (entry) setRangeStart(entry.firstIndex);
                    }}
                  >
                    {sceneBounds.map((item) => (
                      <option key={`from-${item.sceneId}`} value={item.sceneId}>
                        SC {item.label} (#{item.firstIndex + 1})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="export-field">
                  <span className="control-label">To scene</span>
                  <select
                    value={rangeEnd === null ? "__end__" : frames[clampedEnd]?.sceneId || "__end__"}
                    onChange={(event) => {
                      if (event.target.value === "__end__") {
                        setRangeEnd(null);
                        return;
                      }
                      const entry = sceneBounds.find((item) => item.sceneId === event.target.value);
                      if (entry) setRangeEnd(entry.lastIndex);
                    }}
                  >
                    <option value="__end__">End of film (#{frames.length})</option>
                    {sceneBounds.map((item) => (
                      <option key={`to-${item.sceneId}`} value={item.sceneId}>
                        SC {item.label} (#{item.lastIndex + 1})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="export-field">
                  <span className="control-label">Start keyframe #</span>
                  <input
                    className="text-control"
                    type="number"
                    min={1}
                    max={Math.max(1, frames.length)}
                    value={clampedStart + 1}
                    onChange={(event) => {
                      const next = Math.max(1, Math.min(frames.length, Number(event.target.value) || 1));
                      setRangeStart(next - 1);
                    }}
                  />
                </label>

                <label className="export-field">
                  <span className="control-label">End keyframe #</span>
                  <input
                    className="text-control"
                    type="number"
                    min={1}
                    max={Math.max(1, frames.length)}
                    value={clampedEnd + 1}
                    onChange={(event) => {
                      const next = Math.max(1, Math.min(frames.length, Number(event.target.value) || frames.length));
                      setRangeEnd(next >= frames.length ? null : next - 1);
                    }}
                  />
                </label>
              </div>

              <div className="export-toggle-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={captions}
                    onChange={(event) => setCaptions(event.target.checked)}
                  />
                  <span>Burn in subtitles & descriptions</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={marks}
                    onChange={(event) => setMarks(event.target.checked)}
                  />
                  <span>Burn in scene & beat marks</span>
                </label>
                <span className="asset-count">
                  {rangeFrames.length.toLocaleString()} keyframes · {formatTimecode(rangeTotalFrames)} ({Math.round(rangeTotalFrames / FPS)}s)
                </span>
              </div>

              <div className="export-cli-box">
                <span className="eyebrow">LOCAL RENDER COMMAND</span>
                <code>{cliCommand}</code>
              </div>

              <div className="export-actions-row">
                <button className="button button-primary" onClick={onMp4}>
                  Render MP4 animatic
                </button>
                <button className="button button-quiet" onClick={onSrt}>
                  Export range .srt
                </button>
              </div>

              {mp4Message && <div className="modal-callout">{mp4Message}</div>}
            </div>
          )}

          {message && <div className="export-status-banner" role="status">{message}</div>}
        </div>

        <footer className="modal-foot">
          <span>Source pictures and audio takes are never re-encoded.</span>
          <button className="button button-quiet" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
