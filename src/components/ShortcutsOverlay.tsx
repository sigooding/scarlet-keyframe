import { useEffect } from "react";

export interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  rows: Array<{ keys: string; label: string }>;
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Playback",
    rows: [
      { keys: "Space", label: "Play / stop" },
      { keys: "Shift + Space", label: "Loop In → Out playback" },
      { keys: "J  K  L", label: "Rewind · stop · play (L cycles speed)" },
      { keys: "F", label: "Fullscreen playback" },
      { keys: "Esc", label: "Exit fullscreen / clear selection" },
    ],
  },
  {
    title: "Navigate",
    rows: [
      { keys: "←  →", label: "Step 1 frame (Shift = 1 second)" },
      { keys: "↑  ↓", label: "Select previous / next clip" },
      { keys: "[  ]", label: "Jump to previous / next keyframe" },
      { keys: "Shift + I / Shift + O", label: "Jump to In / Out mark" },
      { keys: "\\", label: "Hold to Compare with a reference cut" },
    ],
  },
  {
    title: "Edit",
    rows: [
      { keys: "S", label: "Split selected caption or clip at playhead" },
      { keys: "Delete", label: "Lift picture to black gap" },
      { keys: "Shift + Delete", label: "Ripple delete shot & anchored sounds" },
      { keys: "Ctrl/⌘ + A", label: "Select all image frames" },
      { keys: "Ctrl/⌘ + C  ·  V", label: "Copy · paste at playhead" },
      { keys: "Ctrl/⌘ + Z  ·  Shift + Z", label: "Undo · redo" },
      { keys: "Ctrl/⌘ + Alt + C  ·  V", label: "Copy / paste effects" },
      { keys: "Ctrl/⌘ + S", label: "Save project" },
    ],
  },
  {
    title: "Timeline & Marks",
    rows: [
      { keys: "N", label: "Toggle magnetic snap" },
      { keys: "M", label: "Add named marker at playhead" },
      { keys: "I  ·  O", label: "Mark In / Out at playhead" },
      { keys: "Alt + X", label: "Clear In / Out marks" },
      { keys: "Alt + ←  →", label: "Nudge selected sound (Shift = 100 ms)" },
      { keys: "?", label: "Show / hide this shortcuts menu" },
    ],
  },
  {
    title: "Mouse",
    rows: [
      { keys: "Right-click clip", label: "Replace picture, split, duplicate, move" },
      { keys: "Right-click gap", label: "Add picture here…" },
      { keys: "Double-click music line", label: "Add a volume automation point" },
      { keys: "Drag volume point", label: "Reshape the music volume curve" },
      { keys: "Right-click volume point", label: "Remove the point" },
      { keys: "Shift + click", label: "Extend selection across lanes" },
    ],
  },
];

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      data-testid="shortcuts-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal-panel shortcuts-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <header className="modal-head">
          <div>
            <span className="eyebrow">FRAME/24</span>
            <h2>Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            data-testid="shortcuts-close"
            onClick={onClose}
            title="Close shortcuts (Esc)"
            aria-label="Close keyboard shortcuts"
          >
            ×
          </button>
        </header>
        <div className="modal-body shortcuts-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div className="shortcut-group" key={group.title} data-testid={`shortcut-group-${group.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
              <h3>{group.title}</h3>
              <ul>
                {group.rows.map((row) => (
                  <li key={row.keys}>
                    <kbd>{row.keys}</kbd>
                    <span>{row.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <footer className="modal-foot">
          <small>Shortcuts pause while typing in a text field.</small>
        </footer>
      </section>
    </div>
  );
}
