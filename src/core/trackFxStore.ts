// Remembers each track's reverb / echo settings in this browser (the faders themselves are not remembered).
import { normalizeTrackFx, type TrackFx } from "./audioFx";
import { TRACK_IDS, type TrackId, type TrackMixMap } from "./previewAudio";

export const TRACK_FX_STORAGE_KEY = "frame24-track-fx-v1";

export function readStoredTrackFx(): Partial<Record<TrackId, TrackFx>> {
  try {
    const raw = localStorage.getItem(TRACK_FX_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<TrackId, TrackFx>> = {};
    for (const id of TRACK_IDS) {
      if (id !== "video" && parsed && typeof parsed[id] === "object" && parsed[id]) {
        out[id] = normalizeTrackFx(parsed[id] as Partial<TrackFx>);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function applyStoredTrackFx(mix: TrackMixMap): TrackMixMap {
  const stored = readStoredTrackFx();
  const next = { ...mix };
  for (const id of TRACK_IDS) {
    const fx = stored[id];
    if (fx) next[id] = { ...next[id], fx };
  }
  return next;
}

export function storeTrackFx(mix: TrackMixMap): void {
  try {
    const out: Record<string, TrackFx> = {};
    for (const id of TRACK_IDS) {
      const fx = mix[id]?.fx;
      if (id !== "video" && fx) out[id] = fx;
    }
    if (Object.keys(out).length) localStorage.setItem(TRACK_FX_STORAGE_KEY, JSON.stringify(out));
    else localStorage.removeItem(TRACK_FX_STORAGE_KEY);
  } catch {
    // storage unavailable: the settings simply are not remembered
  }
}
