import { useMemo, useRef, useState } from "react";
import { encodeDraggedAsset } from "./MediaBin";

export interface BrowserAsset {
  id: string;
  ref: string;
  name: string;
  folder: string;
  src?: string;
  size?: number;
  missing?: boolean;
  source?: string;
}

interface AssetBrowserProps {
  title: string;
  kind: "image" | "audio";
  items: BrowserAsset[];
  onSelect: (asset: BrowserAsset) => void;
  onClose: () => void;
}

const ITEM_HEIGHT = 70;

export function AssetBrowser({ title, kind, items, onSelect, onClose }: AssetBrowserProps) {
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("All folders");
  const [hovered, setHovered] = useState<BrowserAsset | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const folders = useMemo(() => ["All folders", ...new Set(items.map((item) => item.folder || "Unsorted").sort())], [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const query = search.trim().toLowerCase();
    return (folder === "All folders" || item.folder === folder)
      && (!query || `${item.name} ${item.folder} ${item.ref}`.toLowerCase().includes(query));
  }), [items, folder, search]);
  const groups = useMemo(() => {
    const output: Array<{ label: string; item?: BrowserAsset }> = [];
    let active = "";
    filtered.forEach((item) => {
      const group = folder === "All folders" ? item.folder || "Unsorted" : "";
      if (group && active !== group) {
        output.push({ label: group });
        active = group;
      }
      output.push({ label: "", item });
    });
    return output;
  }, [filtered, folder]);
  const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 3);
  const end = Math.min(groups.length, Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + 4);
  const visible = groups.slice(start, end);

  function previewAudio(asset: BrowserAsset): void {
    if (kind !== "audio" || !asset.src || asset.missing) return;
    audioRef.current?.pause();
    const player = new Audio(asset.src);
    player.volume = 0.35;
    audioRef.current = player;
    void player.play().catch(() => undefined);
  }

  function stopAudio(): void {
    audioRef.current?.pause();
    audioRef.current = null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="asset-browser" role="dialog" aria-modal="true" aria-label={title}>
        <header className="asset-browser-head">
          <div>
            <span className="eyebrow">PROJECT MEDIA / {kind === "image" ? "STILLS" : "SOUND"}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button close-button" onClick={onClose} aria-label="Close browser">×</button>
        </header>
        <div className="asset-browser-tools">
          <label className="search-control">
            <span>⌕</span>
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${kind === "image" ? "pictures" : "sounds"}`} />
            <kbd>ESC</kbd>
          </label>
          <select value={folder} onChange={(event) => { setFolder(event.target.value); setScrollTop(0); }} aria-label="Filter folder">
            {folders.map((name) => <option key={name}>{name}</option>)}
          </select>
          <span className="asset-count">{filtered.length.toLocaleString()} {kind === "image" ? "stills" : "sounds"}</span>
        </div>
        <div className="asset-browser-body">
          <div
            className="asset-browser-list"
            onScroll={(event) => {
              setScrollTop(event.currentTarget.scrollTop);
              setViewportHeight(event.currentTarget.clientHeight);
            }}
          >
            <div className="asset-browser-spacer" style={{ height: groups.length * ITEM_HEIGHT }}>
              <div className="asset-browser-window" style={{ transform: `translateY(${start * ITEM_HEIGHT}px)` }}>
                {visible.map((row, offset) => {
                  const index = start + offset;
                  if (!row.item) return <div className="asset-folder-heading" key={`folder-${row.label}-${index}`} style={{ height: ITEM_HEIGHT }}>{row.label}</div>;
                  const asset = row.item;
                  return (
                    <button
                      className={`asset-browser-row ${hovered?.id === asset.id ? "is-hovered" : ""} ${asset.missing ? "is-missing" : ""}`}
                      key={asset.id}
                      style={{ height: ITEM_HEIGHT }}
                      draggable={!asset.missing}
                      onDragStart={(e) => {
                        if (!asset.missing) {
                          encodeDraggedAsset(e, {
                            kind,
                            ref: asset.ref,
                            name: asset.name,
                          });
                        }
                      }}
                      onMouseEnter={() => { setHovered(asset); previewAudio(asset); }}
                      onMouseLeave={stopAudio}
                      onClick={() => !asset.missing && onSelect(asset)}
                      disabled={asset.missing}
                    >
                      {kind === "image" ? (
                        <span className="asset-thumb">
                          {asset.src && !asset.missing ? <img src={asset.src} alt="" loading="lazy" decoding="async" /> : <i>STILL</i>}
                        </span>
                      ) : <span className="asset-audio-icon">♫</span>}
                      <span className="asset-row-copy"><strong>{asset.name}</strong><small>{asset.folder || "Project media"}{asset.missing ? " · NOT LINKED" : ""}</small></span>
                      <span className="asset-row-action">{asset.missing ? "!" : kind === "image" ? "USE" : "▶"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <aside className="asset-hover-preview">
            <div className="asset-hover-image">
              {hovered?.src && !hovered.missing && kind === "image" ? <img src={hovered.src} alt={hovered.name} /> : (
                <div className="asset-preview-empty"><span>{hovered?.missing ? "MEDIA NOT LINKED" : "HOVER A FILE"}</span></div>
              )}
              {hovered && kind === "image" && <b>{hovered.folder}</b>}
            </div>
            <p>{hovered?.name || "A larger still preview appears here."}</p>
            <small>{hovered?.size ? `${(hovered.size / 1024 / 1024).toFixed(2)} MB` : "Original file; no re-encoding"}</small>
            {hovered?.missing && <p className="warning-copy">Link the repository public folder to preview this source image.</p>}
          </aside>
        </div>
        <footer className="asset-browser-foot">
          <span>Original media is never recompressed or overwritten.</span>
          <button className="button button-quiet" onClick={onClose}>Cancel</button>
        </footer>
      </section>
    </div>
  );
}
