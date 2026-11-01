import { useEffect, useMemo, useRef, useState } from "react";
import type { BrowserAsset } from "./AssetBrowser";
import { encodeDraggedAsset } from "./MediaBin";
import {
  groupSceneImages,
  sceneList,
  type SceneFrameLite,
  type SceneTile,
  type SceneTileKind,
} from "../core/sceneImages";

interface Section {
  id: string;
  label: string;
  tiles: SceneTile<BrowserAsset>[];
}

type Row =
  | { type: "header"; section: Section; top: number; h: number }
  | { type: "empty"; section: Section; top: number; h: number }
  | { type: "tiles"; tiles: SceneTile<BrowserAsset>[]; top: number; h: number };

const HEADER_H = 28;
const EMPTY_H = 24;
const PAD = 8;
const GAP = 6;
const LABEL_H = 34;
const BADGE: Record<SceneTileKind, string> = { inuse: "in use", earlier: "earlier", alt: "alt" };

export interface MediaBinStillsProps {
  assets: BrowserAsset[];
  frames: SceneFrameLite[];
  selectedSceneId?: string;
  query: string;
  onApply?: (ref: string) => void;
  onSelectFrame?: (frameId: string) => void;
  onHover: (item: BrowserAsset, x: number, y: number) => void;
  onHoverEnd: (item: BrowserAsset) => void;
}

export function MediaBinStills({
  assets,
  frames,
  selectedSceneId,
  query,
  onApply,
  onSelectFrame,
  onHover,
  onHoverEnd,
}: MediaBinStillsProps) {
  const [mode, setMode] = useState<"scene" | "all">("scene");
  const [viewSceneId, setViewSceneId] = useState<string | null>(null);
  const [cols, setCols] = useState(2);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [box, setBox] = useState({ w: 280, h: 420 });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scenes = useMemo(() => sceneList(frames), [frames]);
  // Following the selection: picking another keyframe drops any browsed-to scene.
  useEffect(() => {
    setViewSceneId(null);
  }, [selectedSceneId]);
  const sceneId = viewSceneId ?? selectedSceneId ?? scenes[0]?.id;
  const sceneIndex = scenes.findIndex((scene) => scene.id === sceneId);

  const q = query.trim().toLowerCase();
  const matches = (asset: BrowserAsset): boolean =>
    !q || `${asset.name} ${asset.folder} ${asset.ref}`.toLowerCase().includes(q);

  const sections = useMemo<Section[]>(() => {
    if (mode === "scene") {
      const g = groupSceneImages(sceneId, frames, assets);
      const keep = (tiles: SceneTile<BrowserAsset>[]) => tiles.filter((tile) => matches(tile.asset));
      return [
        { id: "inuse", label: "In this scene", tiles: keep(g.inUse) },
        { id: "earlier", label: "Earlier versions", tiles: keep(g.earlier) },
        { id: "alt", label: "Alternatives", tiles: keep(g.alternatives) },
      ];
    }
    const byFolder = new Map<string, SceneTile<BrowserAsset>[]>();
    for (const asset of assets) {
      if (asset.missing || !matches(asset)) continue;
      const key = asset.folder || "Project";
      const list = byFolder.get(key) ?? [];
      list.push({ asset, kind: "alt", frames: [] });
      byFolder.set(key, list);
    }
    return [...byFolder].map(([folder, tiles]) => ({ id: `folder:${folder}`, label: folder, tiles }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sceneId, frames, assets, q]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth || 280, h: el.clientHeight || 420 });
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
    setScrollTop(0);
  }, [mode, sceneId, q]);

  const tileW = Math.max(40, (box.w - PAD * 2 - GAP * (cols - 1)) / cols);
  const tileH = Math.round((tileW * 9) / 16) + LABEL_H;

  const { rows, total } = useMemo(() => {
    const out: Row[] = [];
    let top = PAD;
    for (const section of sections) {
      out.push({ type: "header", section, top, h: HEADER_H });
      top += HEADER_H + GAP;
      if (collapsed.has(section.id)) continue;
      if (!section.tiles.length) {
        out.push({ type: "empty", section, top, h: EMPTY_H });
        top += EMPTY_H + GAP;
        continue;
      }
      for (let i = 0; i < section.tiles.length; i += cols) {
        out.push({ type: "tiles", tiles: section.tiles.slice(i, i + cols), top, h: tileH });
        top += tileH + GAP;
      }
    }
    return { rows: out, total: top + PAD };
  }, [sections, collapsed, cols, tileH]);

  const visible = rows.filter((row) => row.top + row.h >= scrollTop - 200 && row.top <= scrollTop + box.h + 200);
  const tileCount = sections.reduce((sum, s) => sum + s.tiles.length, 0);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const step = (delta: number) => {
    const next = scenes[Math.max(0, Math.min(scenes.length - 1, sceneIndex + delta))];
    if (next) setViewSceneId(next.id);
  };

  return (
    <>
      <div className="media-bin-modebar" data-testid="media-bin-modebar">
        <button
          type="button"
          className={`media-bin-chip ${mode === "scene" ? "is-active" : ""}`}
          data-testid="media-bin-mode-scene"
          onClick={() => setMode("scene")}
        >
          Scene
        </button>
        <button
          type="button"
          className={`media-bin-chip ${mode === "all" ? "is-active" : ""}`}
          data-testid="media-bin-mode-all"
          onClick={() => setMode("all")}
        >
          Show everything
        </button>
        <label className="media-bin-size" title="Tiles per row">
          <input
            type="range"
            min={1}
            max={4}
            value={cols}
            data-testid="media-bin-size"
            onChange={(e) => setCols(Number(e.target.value))}
          />
        </label>
      </div>

      {mode === "scene" && (
        <div className="media-bin-scenebar" data-testid="media-bin-scenebar">
          <button type="button" className="small-icon-button" data-testid="media-bin-scene-prev" onClick={() => step(-1)} aria-label="Previous scene">
            ‹
          </button>
          <select
            className="text-control media-bin-scene-select"
            data-testid="media-bin-scene-select"
            value={sceneId ?? ""}
            onChange={(e) => setViewSceneId(e.target.value)}
          >
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.mark} · {scene.title || scene.id} ({scene.frameCount})
              </option>
            ))}
          </select>
          <button type="button" className="small-icon-button" data-testid="media-bin-scene-next" onClick={() => step(1)} aria-label="Next scene">
            ›
          </button>
          {viewSceneId && viewSceneId !== selectedSceneId && selectedSceneId && (
            <button
              type="button"
              className="media-bin-chip"
              data-testid="media-bin-scene-follow"
              onClick={() => setViewSceneId(null)}
              title="Go back to the selected keyframe's scene"
            >
              ↩ follow
            </button>
          )}
        </div>
      )}

      {mode === "scene" && (
        <div
          className="media-bin-summary"
          data-testid="media-bin-summary"
          data-inuse={sections[0]?.tiles.length}
          data-earlier={sections[1]?.tiles.length}
          data-alt={sections[2]?.tiles.length}
        >
          {sections[0]?.tiles.length} in use · {sections[1]?.tiles.length} earlier · {sections[2]?.tiles.length} alternatives
        </div>
      )}

      <div
        ref={scrollRef}
        className="media-bin-list media-bin-virtual"
        data-testid="media-bin-list"
        data-tile-count={tileCount}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ position: "relative", height: total }}>
          {visible.map((row) => {
            if (row.type === "header" || row.type === "empty") {
              const { section } = row;
              return row.type === "header" ? (
                <button
                  key={`h:${section.id}`}
                  type="button"
                  className="media-bin-section-head"
                  data-testid={`media-bin-section-${section.id}`}
                  data-count={section.tiles.length}
                  style={{ position: "absolute", top: row.top, left: PAD, right: PAD, height: row.h }}
                  onClick={() => toggle(section.id)}
                >
                  <span>{collapsed.has(section.id) ? "▸" : "▾"} {section.label}</span>
                  <small>{section.tiles.length}</small>
                </button>
              ) : (
                <div
                  key={`e:${section.id}`}
                  className="media-bin-section-empty"
                  style={{ position: "absolute", top: row.top, left: PAD, right: PAD, height: row.h }}
                >
                  none
                </div>
              );
            }
            return (
              <div
                key={`t:${row.top}`}
                className="media-bin-row"
                style={{
                  position: "absolute",
                  top: row.top,
                  left: PAD,
                  right: PAD,
                  height: row.h,
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  gap: GAP,
                }}
              >
                {row.tiles.map((tile) => (
                  <Tile
                    key={tile.asset.id}
                    tile={tile}
                    showBadge={mode === "scene"}
                    onApply={onApply}
                    onSelectFrame={onSelectFrame}
                    onHover={onHover}
                    onHoverEnd={onHoverEnd}
                  />
                ))}
              </div>
            );
          })}
        </div>
        {tileCount === 0 && <div className="media-bin-empty">No matching media items.</div>}
      </div>
    </>
  );
}

function Tile({
  tile,
  showBadge,
  onApply,
  onSelectFrame,
  onHover,
  onHoverEnd,
}: {
  tile: SceneTile<BrowserAsset>;
  showBadge: boolean;
  onApply?: (ref: string) => void;
  onSelectFrame?: (frameId: string) => void;
  onHover: (item: BrowserAsset, x: number, y: number) => void;
  onHoverEnd: (item: BrowserAsset) => void;
}) {
  const { asset } = tile;
  const owners = tile.frames;
  return (
    <div
      className={`media-bin-tile is-${tile.kind}`}
      data-testid={`media-bin-item-${asset.name}`}
      data-asset-ref={asset.ref}
      data-kind={tile.kind}
      draggable
      onDragStart={(e) => encodeDraggedAsset(e, { kind: "image", ref: asset.ref, name: asset.name })}
      onMouseEnter={(e) => onHover(asset, e.clientX, e.clientY)}
      onMouseMove={(e) => onHover(asset, e.clientX, e.clientY)}
      onMouseLeave={() => onHoverEnd(asset)}
      onDoubleClick={() => onApply?.(asset.ref)}
      title={`${asset.name} (${asset.folder || "Project"}) — drag onto the timeline, double-click to fill the selected keyframe`}
    >
      <span className="media-bin-tile-thumb">
        {asset.src ? <img src={asset.src} alt={asset.name} loading="lazy" decoding="async" /> : <i>STILL</i>}
        {showBadge && <b className={`media-bin-badge is-${tile.kind}`}>{BADGE[tile.kind]}{owners.length > 1 ? ` ×${owners.length}` : ""}</b>}
        <span className="media-bin-tile-actions">
          <button type="button" data-testid="media-bin-use" onClick={() => onApply?.(asset.ref)} title="Use for the selected keyframe">
            Use
          </button>
          {owners.length > 0 && (
            <button type="button" data-testid="media-bin-find" onClick={() => onSelectFrame?.(owners[0].id)} title="Select the keyframe that uses it">
              Find
            </button>
          )}
        </span>
      </span>
      <span className="media-bin-meta">
        <strong>{asset.name}</strong>
        <small>{owners.length ? `#${owners.map((o) => o.number).join(", #")}` : asset.folder || asset.source}</small>
      </span>
    </div>
  );
}
