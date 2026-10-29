import { useEffect, useMemo, useState, type DragEvent } from "react";
import type { BrowserAsset } from "./AssetBrowser";

export const ASSET_DRAG_MIME = "application/x-frame24-asset";

export interface DraggedMediaAsset {
  kind: "image" | "audio";
  ref: string;
  name: string;
}

export function encodeDraggedAsset(
  event: DragEvent<HTMLElement>,
  payload: DraggedMediaAsset,
): void {
  const json = JSON.stringify(payload);
  event.dataTransfer.setData(ASSET_DRAG_MIME, json);
  event.dataTransfer.setData("text/plain", payload.ref);
  event.dataTransfer.effectAllowed = "copy";
}

export function decodeDraggedAsset(
  event: DragEvent<HTMLElement>,
): DraggedMediaAsset | null {
  try {
    const raw = event.dataTransfer.getData(ASSET_DRAG_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraggedMediaAsset>;
    if (
      (parsed.kind === "image" || parsed.kind === "audio") &&
      typeof parsed.ref === "string" &&
      parsed.ref
    ) {
      return {
        kind: parsed.kind,
        ref: parsed.ref,
        name: String(parsed.name || parsed.ref),
      };
    }
  } catch {
    // Ignore malformed drag data
  }
  return null;
}

export interface MediaBinProps {
  open: boolean;
  onClose: () => void;
  imageAssets: BrowserAsset[];
  audioAssets: BrowserAsset[];
  onApplyImageToSelection?: (ref: string) => void;
  onInsertAudioAtPlayhead?: (ref: string) => void;
}

export function MediaBin({
  open,
  onClose,
  imageAssets,
  audioAssets,
  onApplyImageToSelection,
  onInsertAudioAtPlayhead,
}: MediaBinProps) {
  const [tab, setTab] = useState<"image" | "audio">("image");
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<{ item: BrowserAsset; x: number; y: number } | null>(null);

  useEffect(() => {
    setHover(null);
  }, [tab, query]);

  const filtered = useMemo(() => {
    const source = tab === "image" ? imageAssets : audioAssets;
    const q = query.trim().toLowerCase();
    const list = q
      ? source.filter(
          (item) =>
            !item.missing &&
            `${item.name} ${item.folder} ${item.ref}`.toLowerCase().includes(q),
        )
      : source.filter((item) => !item.missing);
    return list.slice(0, 120);
  }, [tab, imageAssets, audioAssets, query]);

  if (!open) return null;

  return (
    <aside className="media-bin-panel" data-testid="media-bin" aria-label="Media bin">
      <div className="media-bin-head">
        <div>
          <span className="eyebrow">PROJECT BIN</span>
          <h3>Media Bin</h3>
        </div>
        <button
          type="button"
          className="small-icon-button"
          onClick={onClose}
          title="Close media bin"
          aria-label="Close media bin"
        >
          ×
        </button>
      </div>

      <div className="media-bin-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "image"}
          className={`media-bin-tab ${tab === "image" ? "is-active" : ""}`}
          data-testid="media-bin-tab-image"
          onClick={() => setTab("image")}
        >
          ▣ Stills ({imageAssets.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "audio"}
          className={`media-bin-tab ${tab === "audio" ? "is-active" : ""}`}
          data-testid="media-bin-tab-audio"
          onClick={() => setTab("audio")}
        >
          ♫ Sounds ({audioAssets.length})
        </button>
      </div>

      <div className="media-bin-search-wrap">
        <input
          type="search"
          className="text-control media-bin-search"
          data-testid="media-bin-search"
          placeholder={tab === "image" ? "Filter stills…" : "Filter sounds…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <p className="media-bin-hint">
        {tab === "image"
          ? "Drag a picture onto a shot or gap on the Video lane, or double-click to fill selected."
          : "Drag a sound onto Voice, SFX, Music, or Ambience lane."}
      </p>

      <div className="media-bin-list" data-testid="media-bin-list">
        {filtered.map((item) => (
          <div
            key={item.id}
            className={`media-bin-item is-${tab}`}
            data-testid={`media-bin-item-${item.name}`}
            data-asset-ref={item.ref}
            draggable
            onDragStart={(e) =>
              encodeDraggedAsset(e, {
                kind: tab,
                ref: item.ref,
                name: item.name,
              })
            }
            onMouseEnter={(e) => setHover({ item, x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => setHover({ item, x: e.clientX, y: e.clientY })}
            onMouseLeave={() =>
              setHover((prev) => (prev?.item.id === item.id ? null : prev))
            }
            onDoubleClick={() => {
              if (tab === "image") onApplyImageToSelection?.(item.ref);
              else onInsertAudioAtPlayhead?.(item.ref);
            }}
            title={`${item.name} (${item.folder || "Project"}) — drag onto timeline`}
          >
            {tab === "image" ? (
              <span className="media-bin-thumb">
                {item.src ? (
                  <img src={item.src} alt={item.name} loading="lazy" decoding="async" />
                ) : (
                  <i>STILL</i>
                )}
              </span>
            ) : (
              <span className="media-bin-audio-badge">♫</span>
            )}
            <span className="media-bin-meta">
              <strong>{item.name}</strong>
              <small>{item.folder || item.source}</small>
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="media-bin-empty">No matching media items.</div>
        )}
      </div>

      {/* Hover preview: large roll-over preview for stills (follows the cursor, never blocks it) */}
      {hover && tab === "image" && hover.item.src && (
        <div
          className="media-bin-hover-preview"
          data-testid="media-bin-hover-preview"
          aria-hidden="true"
          style={{
            left: Math.max(
              8,
              Math.min(
                hover.x + 18,
                (typeof window !== "undefined" ? window.innerWidth : 1600) - 272,
              ),
            ),
            top: Math.max(
              8,
              Math.min(
                hover.y + 18,
                (typeof window !== "undefined" ? window.innerHeight : 900) - 216,
              ),
            ),
          }}
        >
          <img src={hover.item.src} alt={hover.item.name} />
          <span className="media-bin-hover-preview-name">{hover.item.name}</span>
        </div>
      )}
    </aside>
  );
}
