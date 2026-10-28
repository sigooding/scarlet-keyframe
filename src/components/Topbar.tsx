import { useEffect, useRef, useState } from "react";
import {
  DIRECTORS_CUT_OPTIONS,
  type DirectorsCutId,
} from "../core/directorsCut";
import type { ProjectState } from "../core/model";
import { FPS, formatTimecode } from "../core/timing";

export interface TopbarProps {
  project: ProjectState;
  saveStatus: string;
  historyVersion: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onImport: () => void;
  onLinkFolder: () => void;
  folderLabel: string;
  onSnapshot: () => void;
  onExport: () => void;
  onSave: () => void;
  missingCount: number;
  onMissing: () => void;
  editLabel: string;
  totalDuration: number;
  onConvertAllToKeyframes?: () => void;
  onApplyDirectorsCut?: () => void;
  activeCutId?: DirectorsCutId;
  onSelectDirectorsCut?: (cutId: DirectorsCutId) => void;
}

function formatTotalRuntime(seconds: number): string {
  const frames = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * FPS));
  return formatTimecode(frames);
}

export function Topbar({
  project,
  saveStatus,
  historyVersion,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImport,
  onLinkFolder,
  folderLabel,
  onSnapshot,
  onExport,
  onSave,
  missingCount,
  onMissing,
  editLabel,
  totalDuration,
  onConvertAllToKeyframes,
  onApplyDirectorsCut,
  activeCutId = "neo-noir",
  onSelectDirectorsCut,
}: TopbarProps) {
  const [cutMenuOpen, setCutMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const activeOption =
    DIRECTORS_CUT_OPTIONS.find((opt) => opt.id === activeCutId) ??
    DIRECTORS_CUT_OPTIONS[0];

  useEffect(() => {
    if (!cutMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        event.target instanceof Node &&
        !dropdownRef.current.contains(event.target)
      ) {
        setCutMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCutMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [cutMenuOpen]);

  const statusTone = saveStatus.includes("FAILED")
    ? "is-danger"
    : saveStatus.includes("UNSAVED") || saveStatus.includes("SAVING")
      ? "is-pending"
      : "is-saved";

  return (
    <header className="topbar" data-history-version={historyVersion}>
      <div className="topbar-left">
        <div className="topbar-wordmark">
          FRAME<span>/24</span>
        </div>
        <div className="topbar-divider" aria-hidden />
        <div className="topbar-project">
          <strong className="topbar-title">{project.title}</strong>
          <span className="topbar-subtitle">
            <span>{formatTotalRuntime(totalDuration)} EST</span>
            <i>·</i>
            <span>{editLabel}</span>
          </span>
        </div>
      </div>

      <div className="topbar-center">
        <div className="topbar-history" role="group" aria-label="Edit history">
          <button
            className="icon-button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl/Cmd+Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            className="icon-button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl/Cmd+Shift+Z)"
            aria-label="Redo"
          >
            ↷
          </button>
        </div>

        <span className={`topbar-save-status ${statusTone}`}>{saveStatus}</span>

        <button
          className={`topbar-missing-pill ${missingCount > 0 ? "has-missing" : "all-linked"}`}
          onClick={onMissing}
          title={missingCount > 0 ? "Inspect unlinked media paths" : "All referenced media is available"}
        >
          <i />
          <span>
            {missingCount > 0
              ? `${missingCount.toLocaleString()} unlinked`
              : "Media linked"}
          </span>
        </button>
      </div>

      <div className="topbar-actions">
        {(onSelectDirectorsCut || onApplyDirectorsCut) && (
          <div className="topbar-cut-dropdown" ref={dropdownRef}>
            <button
              type="button"
              className="button button-quiet topbar-cut-trigger"
              data-testid="topbar-directors-cut-btn"
              onClick={() => {
                if (onSelectDirectorsCut) {
                  setCutMenuOpen((open) => !open);
                } else if (onApplyDirectorsCut) {
                  onApplyDirectorsCut();
                }
              }}
              aria-haspopup="listbox"
              aria-expanded={cutMenuOpen}
              title="Select editorial cut version (undoable; Original Uncut Import preserved)"
            >
              <span
                className={`topbar-cut-trigger-dot ${
                  activeOption.id === "creative"
                    ? "is-creative"
                    : activeOption.id === "noir-1950s"
                      ? "is-noir-1950s"
                      : activeOption.id === "uncut"
                        ? "is-uncut"
                        : ""
                }`}
              />
              <span>{activeOption.label}</span>
              <span className="topbar-cut-chevron" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 4.5L6 8L9.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>

            {cutMenuOpen && (
              <div
                className="topbar-cut-menu"
                role="listbox"
                aria-label="Available film cuts"
                data-testid="topbar-directors-cut-menu"
              >
                <div className="topbar-cut-menu-header">Select Film Cut</div>
                {DIRECTORS_CUT_OPTIONS.map((opt) => {
                  const isSelected = opt.id === activeOption.id;
                  return (
                    <div key={opt.id}>
                      {opt.id === "uncut" && <div className="topbar-cut-menu-divider" />}
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`topbar-cut-option ${isSelected ? "is-active" : ""}`}
                        onClick={() => {
                          setCutMenuOpen(false);
                          onSelectDirectorsCut?.(opt.id);
                        }}
                        data-testid={`topbar-cut-option-${opt.id}`}
                      >
                        <div className="topbar-cut-option-body">
                          <div className="topbar-cut-option-title">
                            <span
                              className={`topbar-cut-trigger-dot ${
                                opt.id === "creative"
                                  ? "is-creative"
                                  : opt.id === "noir-1950s"
                                    ? "is-noir-1950s"
                                    : opt.id === "uncut"
                                      ? "is-uncut"
                                      : ""
                              }`}
                            />
                            <span>{opt.label}</span>
                          </div>
                          <div className="topbar-cut-option-desc">{opt.description}</div>
                        </div>
                        {isSelected && (
                          <span className="topbar-cut-option-check" aria-hidden="true">
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                              <path
                                d="M2.5 7.5L5.5 10.5L11.5 3.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {onConvertAllToKeyframes && (
          <button
            className="button button-quiet"
            data-testid="topbar-convert-all-keyframes-btn"
            onClick={onConvertAllToKeyframes}
            title="Convert all preset and depth moves in this project into editable keyframes (one undo step)"
          >
            Convert all to keyframes
          </button>
        )}
        <button className="button button-quiet" onClick={onImport}>
          Import
        </button>
        <button
          className={`button button-quiet ${folderLabel ? "is-linked" : ""}`}
          onClick={onLinkFolder}
          title="Select Scarlet Reel's public folder to resolve pictures and audio"
        >
          {folderLabel ? `Linked: ${folderLabel}` : "Link folder"}
        </button>
        <button className="button button-quiet" onClick={onSnapshot}>
          Snapshots{project.snapshots.length > 0 ? ` (${project.snapshots.length})` : ""}
        </button>
        <button className="button button-quiet" onClick={onSave} title="Save to browser storage (Ctrl/Cmd+S)">
          Save
        </button>
        <button className="button button-primary" onClick={onExport}>
          Export
        </button>
      </div>
    </header>
  );
}
