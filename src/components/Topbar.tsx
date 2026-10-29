import { useEffect, useRef, useState } from "react";
import {
  DIRECTORS_CUT_OPTIONS,
  normalizeCutOptions,
  type DirectorsCutId,
} from "../core/directorsCut";
import type { AspectFramingMode, CutOptions, ProjectState } from "../core/model";
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
  onShowShortcuts?: () => void;
  missingCount: number;
  onMissing: () => void;
  editLabel: string;
  totalDuration: number;
  onConvertAllToKeyframes?: () => void;
  onApplyDirectorsCut?: () => void;
  activeCutId?: DirectorsCutId;
  onSelectDirectorsCut?: (cutId: DirectorsCutId) => void;
  cutOptions?: CutOptions;
  onChangeCutOptions?: (patch: Partial<CutOptions>, label: string) => void;
  onResetActiveCut?: () => void;
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
  onShowShortcuts,
  missingCount,
  onMissing,
  editLabel,
  totalDuration,
  onConvertAllToKeyframes,
  onApplyDirectorsCut,
  activeCutId = "neo-noir",
  onSelectDirectorsCut,
  cutOptions,
  onChangeCutOptions,
  onResetActiveCut,
}: TopbarProps) {
  const [cutMenuOpen, setCutMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const activeOption =
    DIRECTORS_CUT_OPTIONS.find((opt) => opt.id === activeCutId) ??
    DIRECTORS_CUT_OPTIONS[0];

  const resolvedCutOpts = normalizeCutOptions(cutOptions ?? project.cutOptions ?? project.story.cutOptions);

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

  const aspectChoices: Array<{ id: AspectFramingMode; label: string; testId: string }> = [
    { id: "2.35:1", label: "2.35:1 Scope", testId: "cut-opt-aspect-235" },
    { id: "1.37:1", label: "1.37:1 Academy", testId: "cut-opt-aspect-137" },
    { id: "16:9", label: "16:9 Open", testId: "cut-opt-aspect-169" },
  ];

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
              title="Select editorial cut version and screening options"
            >
              <span
                className={`topbar-cut-trigger-dot ${
                  activeOption.id === "creative"
                    ? "is-creative"
                    : activeOption.id === "noir-1940s"
                      ? "is-noir-1940s"
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
                                  : opt.id === "noir-1940s"
                                    ? "is-noir-1940s"
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

                {onChangeCutOptions && (
                  <>
                    <div className="topbar-cut-menu-divider" />
                    <div className="topbar-cut-menu-header">Cut &amp; Screening Options</div>
                    <div className="topbar-cut-opts-section">
                      <div className="topbar-cut-aspect-row">
                        <span className="topbar-cut-aspect-label">Aspect Gate</span>
                        <div className="topbar-cut-segmented" role="group" aria-label="Aspect framing">
                          {aspectChoices.map((ch) => (
                            <button
                              key={ch.id}
                              type="button"
                              className={`topbar-cut-seg-btn ${
                                resolvedCutOpts.aspectFraming === ch.id ? "is-active" : ""
                              }`}
                              data-testid={ch.testId}
                              onClick={() =>
                                onChangeCutOptions(
                                  { aspectFraming: ch.id },
                                  `Aspect gate set to ${ch.label}`,
                                )
                              }
                            >
                              {ch.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="topbar-cut-check-row">
                        <input
                          type="checkbox"
                          data-testid="cut-opt-new-depth"
                          checked={resolvedCutOpts.newPlateDepthMaps}
                          onChange={(e) =>
                            onChangeCutOptions(
                              { newPlateDepthMaps: e.target.checked },
                              e.target.checked
                                ? "Enabled 2.5D depth parallax on new plates"
                                : "Disabled 2.5D depth parallax on new plates",
                            )
                          }
                        />
                        <span>2.5D depth maps on 9 new shots (s12 / 77A / s78)</span>
                      </label>

                      <label className="topbar-cut-check-row">
                        <input
                          type="checkbox"
                          data-testid="cut-opt-1950s-leader"
                          checked={resolvedCutOpts.classic1950sLeader}
                          onChange={(e) =>
                            onChangeCutOptions(
                              { classic1950sLeader: e.target.checked },
                              e.target.checked
                                ? "Enabled silver-monochrome studio crest leader"
                                : "Restored standard studio logo video leader",
                            )
                          }
                        />
                        <span>Bespoke silver-monochrome studio crest leader (1940s / 1950s)</span>
                      </label>

                      <label className="topbar-cut-check-row">
                        <input
                          type="checkbox"
                          data-testid="cut-opt-optical-eq"
                          checked={resolvedCutOpts.opticalPrintEq}
                          onChange={(e) =>
                            onChangeCutOptions(
                              { opticalPrintEq: e.target.checked },
                              e.target.checked
                                ? "Enabled warm 1950s optical-print EQ"
                                : "Disabled 1950s optical-print EQ",
                            )
                          }
                        />
                        <span>Warm 1950s optical-print EQ (85 Hz – 7.8 kHz)</span>
                      </label>

                      <label className="topbar-cut-check-row">
                        <input
                          type="checkbox"
                          data-testid="cut-opt-preserve-edits"
                          checked={resolvedCutOpts.preservePerCutEdits}
                          onChange={(e) =>
                            onChangeCutOptions(
                              { preservePerCutEdits: e.target.checked },
                              e.target.checked
                                ? "Enabled per-cut saved working state"
                                : "Disabled per-cut saved working state",
                            )
                          }
                        />
                        <span>Remember custom edits per cut when switching</span>
                      </label>

                      {onResetActiveCut && (
                        <button
                          type="button"
                          className="topbar-cut-reset-btn"
                          data-testid="cut-opt-reset-active"
                          onClick={() => {
                            setCutMenuOpen(false);
                            onResetActiveCut();
                          }}
                        >
                          Reset {activeOption.shortLabel} to factory
                        </button>
                      )}
                    </div>
                  </>
                )}
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
        <button
          type="button"
          className="button button-quiet"
          data-testid="shortcuts-btn"
          onClick={onShowShortcuts}
          title="Keyboard shortcuts & mouse gestures (?)"
        >
          ⌨ Shortcuts
        </button>
        <button className="button button-primary" onClick={onExport}>
          Export
        </button>
      </div>
    </header>
  );
}
