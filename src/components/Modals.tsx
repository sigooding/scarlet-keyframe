import { useState } from "react";
import type { Keyframe, ProjectState } from "../core/model";
import { makeStudioPatchReport, type StudioPatchResult } from "../core/patch";

type ExportTab = "bundle" | "patch" | "mp4";

interface ExportModalProps {
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
  setRangeStart: (value: number) => void;
  setRangeEnd: (value: number | null) => void;
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

export function ExportModal(props: ExportModalProps) {
  const { project, frames } = props;
  return (
    <Modal title="Export" onClose={props.onClose}>
      <div className="export-tabs">
        <button className={props.tab === "bundle" ? "is-active" : ""} onClick={() => props.setTab("bundle")}>Portable bundle</button>
        <button className={props.tab === "patch" ? "is-active" : ""} onClick={() => props.setTab("patch")}>Studio patch</button>
        <button className={props.tab === "mp4" ? "is-active" : ""} onClick={() => props.setTab("mp4")}>MP4</button>
      </div>

      {props.tab === "bundle" && (
        <section className="export-section">
          <p className="modal-copy">Writes every referenced picture, voice take and cue into one <code>.reel.json</code> file, with the timeline edits (trim, splits and zoom/position keyframes) inside the beats.</p>
          <div className="button-row">
            <button className="button button-primary" onClick={props.onBundle}>Download bundle</button>
            <button className="button button-quiet" onClick={props.onSrt}>Download SRT</button>
          </div>
          <div className="export-range">
            <span className="control-label">SRT range</span>
            <label>From <input type="number" min={1} max={frames.length} value={props.rangeStart + 1} onChange={(event) => props.setRangeStart(Math.max(0, Number(event.target.value) - 1))} /></label>
            <label>To <input type="number" min={1} max={frames.length} value={(props.rangeEnd ?? frames.length - 1) + 1} onChange={(event) => props.setRangeEnd(Math.max(0, Number(event.target.value) - 1))} /></label>
            <button className="button button-text" onClick={() => props.setRangeEnd(null)}>Whole film</button>
          </div>
          <p className="modal-note">{frames.length.toLocaleString()} clips · {project.assets.length.toLocaleString()} project assets · {project.missing.length.toLocaleString()} unresolved paths</p>
        </section>
      )}

      {props.tab === "patch" && (
        <section className="export-section">
          <p className="modal-copy">Writes the studio-edits patch for pictures, looks and sound cues. Timing and animation edits are editor-side and are not represented in that patch.</p>
          <button className="button button-primary" onClick={props.onPatch}>Download studio-edits.json</button>
          {props.patchReport && <pre className="patch-report">{makeStudioPatchReport(props.patchReport)}</pre>}
        </section>
      )}

      {props.tab === "mp4" && (
        <section className="export-section">
          <p className="modal-copy">Exact MP4 rendering is a separate tool run outside the browser.</p>
          <button className="button button-quiet" onClick={props.onMp4}>Check MP4 route</button>
          {props.mp4Message && <p className="modal-note">{props.mp4Message}</p>}
        </section>
      )}

      <div className="export-flags">
        <label className="checkbox-label"><input type="checkbox" checked={props.captions} onChange={(event) => props.setCaptions(event.target.checked)} /><span>Include captions in the bundle</span></label>
        <label className="checkbox-label"><input type="checkbox" checked={props.marks} onChange={(event) => props.setMarks(event.target.checked)} /><span>Include scene marks</span></label>
      </div>

      {props.progress > 0 && <div className="export-progress"><span style={{ width: `${props.progress}%` }} /></div>}
      {props.message && <p className="modal-note" data-testid="export-message">{props.message}</p>}

      <SnapshotList project={project} onRestore={props.onRestoreSnapshot} />
    </Modal>
  );
}

interface MissingMediaModalProps {
  items: string[];
  folderLabel: string;
  onClose: () => void;
  onLink: () => void;
}

export function MissingMediaModal({ items, folderLabel, onClose, onLink }: MissingMediaModalProps) {
  return (
    <Modal title={`Missing media · ${items.length}`} onClose={onClose}>
      <p className="modal-copy">These pictures or sounds are referenced by the film but are not linked in this browser. Link the media folder to resolve them; the edits keep the paths.</p>
      <div className="missing-list">
        {items.slice(0, 200).map((item) => <code key={item}>{item}</code>)}
        {items.length > 200 && <p className="modal-note">…and {items.length - 200} more.</p>}
        {!items.length && <p className="modal-note">Nothing is missing.</p>}
      </div>
      <div className="button-row">
        <button className="button button-primary" onClick={onLink}>Link media folder…</button>
        <button className="button button-quiet" onClick={onClose}>Close</button>
      </div>
      {folderLabel && <p className="modal-note">Linked: {folderLabel}</p>}
    </Modal>
  );
}

interface SnapshotModalProps {
  project: ProjectState;
  name: string;
  setName: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  onRestore: (snapshotId: string) => void;
}

export function SnapshotModal({ project, name, setName, onSave, onClose, onRestore }: SnapshotModalProps) {
  return (
    <Modal title="Snapshots" onClose={onClose}>
      <p className="modal-copy">A snapshot keeps the whole film, including clip lengths and animation keyframes, as it is now.</p>
      <div className="modal-field">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={`Cut ${new Date().toLocaleDateString()}`} aria-label="Snapshot name" />
        <button className="button button-primary" onClick={onSave}>Save snapshot</button>
      </div>
      <SnapshotList project={project} onRestore={onRestore} />
    </Modal>
  );
}

interface CropModalProps {
  crop: { assetId: string; frameId: string; x: number; y: number };
  imageSrc?: string;
  onChange: (x: number, y: number) => void;
  onSave: () => void;
  onSkip: () => void;
}

export function CropModal({ crop, imageSrc, onChange, onSave, onSkip }: CropModalProps) {
  return (
    <Modal title="Crop to 16:9" onClose={onSkip}>
      <p className="modal-copy">The uploaded still is not 16:9. Pick the centre of the crop; the picture is framed, not cropped, on disk.</p>
      <div className="crop-stage">
        {imageSrc ? <img src={imageSrc} alt="Uploaded still" /> : <div className="crop-placeholder">Preview unavailable</div>}
        <span className="crop-frame" style={{ backgroundPosition: `${crop.x}% ${crop.y}%` }} />
        <i className="crop-cross" style={{ left: `${crop.x}%`, top: `${crop.y}%` }} />
      </div>
      <div className="crop-controls">
        <label>Horizontal <input type="range" min={0} max={100} value={crop.x} onChange={(event) => onChange(Number(event.target.value), crop.y)} /></label>
        <label>Vertical <input type="range" min={0} max={100} value={crop.y} onChange={(event) => onChange(crop.x, Number(event.target.value))} /></label>
      </div>
      <div className="button-row">
        <button className="button button-primary" onClick={onSave}>Use this framing</button>
        <button className="button button-quiet" onClick={onSkip}>Keep as it is</button>
      </div>
    </Modal>
  );
}

function SnapshotList({ project, onRestore }: { project: ProjectState; onRestore: (snapshotId: string) => void }) {
  const [open, setOpen] = useState(true);
  if (!project.snapshots.length) return null;
  return (
    <div className="snapshot-list">
      <button className="snapshot-head" onClick={() => setOpen((value) => !value)}>
        <span>Snapshots</span><small>{project.snapshots.length} · {open ? "hide" : "show"}</small>
      </button>
      {open && project.snapshots.map((snapshot) => (
        <div className="snapshot-row" key={snapshot.id}>
          <div><strong>{snapshot.name}</strong><small>{new Date(snapshot.createdAt).toLocaleString()}</small></div>
          <button className="button button-text" onClick={() => onRestore(snapshot.id)}>Restore</button>
        </div>
      ))}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-window">
        <header className="modal-head"><h2>{title}</h2><button className="close-button" onClick={onClose} aria-label="Close">×</button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
