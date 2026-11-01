import { audio } from "../../vendor/scarlet-reel/audio";
import { parseAmbient, joinAmbient } from "../../vendor/scarlet-reel/studio/ambientParts";
import { fadeAudio, isFading, MUSIC_FADE_MS } from "../../vendor/scarlet-reel/game/audioFade";
import { buildTimelineClips, type TimelineClip } from "../sequence/animate";
import { buildKeyframes, type SceneLike, type StoryLike } from "./model";
import { FPS } from "./timing";

import type { TrackFx } from "./audioFx";

export type MediaResolver = (value: string | undefined) => string | undefined;

export type TrackId = "video" | "voice" | "sfx" | "music" | "ambience";

export const TRACK_IDS: readonly TrackId[] = ["video", "voice", "sfx", "music", "ambience"];

export interface TrackMixState {
  mute: boolean;
  solo: boolean;
  level: number;
  /** Reverb and delay / echo on this track (see core/audioFx.ts). Absent = no effect. */
  fx?: TrackFx;
}

export type TrackMixMap = Record<TrackId, TrackMixState>;

export function createDefaultTrackMix(): TrackMixMap {
  return {
    video: { mute: false, solo: false, level: 1 },
    voice: { mute: false, solo: false, level: 1 },
    sfx: { mute: false, solo: false, level: 1 },
    music: { mute: false, solo: false, level: 1 },
    ambience: { mute: false, solo: false, level: 1 },
  };
}

export function trackFxOf(mix: TrackMixMap, track: TrackId): TrackFx | undefined {
  return mix[track]?.fx;
}

export function effectiveTrackLevel(mix: TrackMixMap, track: TrackId): number {
  const anySolo = TRACK_IDS.some((id) => mix[id]?.solo);
  const state = mix[track];
  if (!state || state.mute) return 0;
  if (anySolo && !state.solo) return 0;
  const lvl = Number(state.level);
  return Math.max(0, Math.min(1, Number.isFinite(lvl) ? lvl : 1));
}

export interface MusicSpan {
  id: string;
  sceneId: string;
  scene: SceneLike;
  url: string;
  label: string;
  loop: boolean;
  level: number;
  startFrame: number;
  endFrame: number;
  naturalEndFrame?: number;
}

function cleanTrackLabel(raw?: string): string {
  if (!raw) return "";
  if (raw.startsWith("asset:")) return `upload ${raw.slice(6, 12)}`;
  const cleaned = raw.replace(/^mp3:/i, "").replace(/^file:/i, "");
  return (cleaned.split("/").pop() || cleaned).replace(/\.(mp3|wav|ogg|m4a|aac|flac)$/i, "");
}

function normalizeAudioRef(raw: string): string {
  return raw
    .trim()
    .replace(/^(?:mp3:|file:)/i, "")
    .replace(/[?#].*$/, "")
    .replace(/^\/+/, "");
}

export function extractKnownMusicDurations(sourceEdits: unknown): Map<string, number> {
  const map = new Map<string, number>();
  if (!sourceEdits || typeof sourceEdits !== "object") return map;
  const record = sourceEdits as Record<string, unknown>;
  for (const key of ["soundtracks", "cutscenes"]) {
    const list = record[key];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const rawTrack = typeof item.track === "string" ? item.track : typeof item.musicUrl === "string" ? item.musicUrl : "";
      const seconds = Number(item.seconds);
      if (!rawTrack || !Number.isFinite(seconds) || seconds <= 0) continue;
      const norm = normalizeAudioRef(rawTrack);
      map.set(rawTrack, seconds);
      map.set(norm, seconds);
      map.set(`/${norm}`, seconds);
      if (norm.startsWith("audio/")) {
        map.set(`film/${norm}`, seconds);
        map.set(`/film/${norm}`, seconds);
      }
    }
  }
  return map;
}

export function lookupMusicDuration(
  url: string | undefined,
  musicDurations?: ReadonlyMap<string, number>,
): number | undefined {
  if (!url || !musicDurations || musicDurations.size === 0) return undefined;
  const direct = musicDurations.get(url);
  if (direct !== undefined && Number.isFinite(direct) && direct > 0) return direct;
  const norm = normalizeAudioRef(url);
  for (const candidate of [
    norm,
    `/${norm}`,
    norm.startsWith("film/audio/") ? norm.slice(5) : `film/${norm}`,
    norm.startsWith("film/audio/") ? `/${norm.slice(5)}` : `/film/${norm}`,
  ]) {
    const val = musicDurations.get(candidate);
    if (val !== undefined && Number.isFinite(val) && val > 0) return val;
  }
  return undefined;
}

/**
 * Shared music resolution function used by BOTH the timeline Music lane (`Tracks.tsx`)
 * and audio playback (`PreviewAudioController.startFrom` / `enterScene` / `syncAtFrame`).
 *
 * Every music span ends at the earliest of:
 * 1. the next scene that starts a different track;
 * 2. the next scene with `musicMode === "none"` (e.g. scene 78);
 * 3. for a song with `musicLoop === false`, its own end (`startFrame + fileLength`).
 */
export function resolveMusicSpans(
  clips: TimelineClip[],
  totalFrames: number,
  musicDurations?: ReadonlyMap<string, number>,
): MusicSpan[] {
  const spans: MusicSpan[] = [];
  if (!clips.length || totalFrames <= 0) return spans;

  const seenScenes = new Set<string>();
  let active: MusicSpan | null = null;

  for (const clip of clips) {
    const scene = clip.keyframe.scene;
    if (seenScenes.has(scene.id)) continue;
    seenScenes.add(scene.id);

    const sceneStart = clip.startFrame;

    // Rule 3 check prior to evaluating this scene: if an active non-looping song
    // already finished by itself at or before `sceneStart`, close it at its natural end.
    if (
      active &&
      !active.loop &&
      active.naturalEndFrame !== undefined &&
      active.naturalEndFrame <= sceneStart
    ) {
      active.endFrame = Math.max(active.startFrame, active.naturalEndFrame);
      if (active.endFrame > active.startFrame) spans.push(active);
      active = null;
    }

    const mode = scene.musicMode || "inherit";
    const url = scene.musicUrl || scene.sceneAudioUrl;

    // Rule 2: `musicMode: "none"` ends any active music at this scene boundary.
    if (mode === "none") {
      if (active) {
        active.endFrame =
          active.naturalEndFrame !== undefined
            ? Math.min(sceneStart, active.naturalEndFrame)
            : sceneStart;
        if (active.endFrame > active.startFrame) spans.push(active);
        active = null;
      }
      continue;
    }

    if (!url) continue;

    // Rule 1: a scene starting a track when nothing is playing, or starting a DIFFERENT track.
    if (!active || active.url !== url) {
      if (active) {
        active.endFrame =
          active.naturalEndFrame !== undefined
            ? Math.min(sceneStart, active.naturalEndFrame)
            : sceneStart;
        if (active.endFrame > active.startFrame) spans.push(active);
      }
      const loop = scene.musicLoop !== false;
      const fileSeconds = lookupMusicDuration(url, musicDurations);
      const naturalEndFrame =
        !loop && fileSeconds !== undefined && fileSeconds > 0
          ? sceneStart + Math.round(fileSeconds * FPS)
          : undefined;
      active = {
        id: clip.keyframe.id,
        sceneId: scene.id,
        scene,
        url,
        label: cleanTrackLabel(url),
        loop,
        level: Number(scene.musicLevel ?? 0.55),
        startFrame: sceneStart,
        endFrame: totalFrames,
        naturalEndFrame,
      };
    }
  }

  if (active) {
    active.endFrame =
      active.naturalEndFrame !== undefined
        ? Math.min(totalFrames, active.naturalEndFrame)
        : totalFrames;
    if (active.endFrame > active.startFrame) spans.push(active);
  }

  return spans;
}

export function activeMusicSpanAtFrame(spans: MusicSpan[], frame: number): MusicSpan | undefined {
  for (const span of spans) {
    if (frame < span.startFrame) break;
    if (frame >= span.startFrame && frame < span.endFrame) return span;
  }
  return undefined;
}

const BASE_VOLUMES = {
  music: 0.8,
  ambient: 0.45,
  voice: 0.9,
  sfx: 0.75,
} as const;

export class PreviewAudioController {
  private music: HTMLAudioElement | null = null;
  private musicUrl: string | null = null;
  private musicLevel = 1;
  private voice: HTMLAudioElement | null = null;
  private ambientSignature = "";
  private trackMix: TrackMixMap = createDefaultTrackMix();

  private timelineClips: TimelineClip[] = [];
  private musicDurations: ReadonlyMap<string, number> = new Map();
  private cachedSpans: MusicSpan[] = [];

  constructor() {
    audio.onDuckChange = () => {
      if (this.music && !isFading(this.music)) {
        this.music.volume = this.targetMusicLevel(this.musicLevel);
      }
    };
  }

  get musicPosition(): number {
    return this.music?.currentTime || 0;
  }

  get musicDuration(): number {
    return this.music?.duration || 0;
  }

  get currentMusicUrl(): string | null {
    return this.musicUrl;
  }

  get currentMusicVolume(): number {
    return this.music?.volume ?? 0;
  }

  get currentVoiceVolume(): number {
    return this.voice?.volume ?? 0;
  }

  get mixState(): TrackMixMap {
    return this.trackMix;
  }

  setTimeline(
    clips: TimelineClip[],
    totalFrames: number,
    musicDurations?: ReadonlyMap<string, number>,
  ): void {
    this.timelineClips = clips;
    this.musicDurations = musicDurations ?? new Map();
    this.cachedSpans = resolveMusicSpans(clips, totalFrames, this.musicDurations);
  }

  setTrackMix(mix: TrackMixMap): void {
    this.trackMix = mix;
    const musicGain = effectiveTrackLevel(mix, "music");
    const voiceGain = effectiveTrackLevel(mix, "voice");
    const sfxGain = effectiveTrackLevel(mix, "sfx");
    const ambienceGain = effectiveTrackLevel(mix, "ambience");

    audio.setVolume("music", BASE_VOLUMES.music * musicGain);
    audio.setVolume("voice", BASE_VOLUMES.voice * voiceGain);
    audio.setVolume("sfx", BASE_VOLUMES.sfx * sfxGain);
    audio.setVolume("ambient", BASE_VOLUMES.ambient * ambienceGain);

    if (this.music) {
      if (musicGain === 0 || !isFading(this.music)) {
        this.music.volume = this.targetMusicLevel(this.musicLevel);
      }
    }
    if (this.voice) {
      this.voice.volume = Math.min(1, audio.volumes.master * audio.volumes.voice);
      if (voiceGain > 0) audio.voiceStarted();
      else audio.voiceEnded();
    }
  }

  private resolveSpanFor(
    story: StoryLike | undefined,
    sceneId: string | undefined,
    atFrame?: number,
  ): { span: MusicSpan | undefined; frame: number } {
    let clips = this.timelineClips;
    let spans = this.cachedSpans;
    if (!clips.length && story) {
      const built = buildTimelineClips(buildKeyframes(story));
      clips = built.clips;
      spans = resolveMusicSpans(built.clips, built.totalFrames, this.musicDurations);
    }
    const targetFrame =
      atFrame !== undefined
        ? atFrame
        : sceneId
          ? clips.find((c) => c.keyframe.sceneId === sceneId)?.startFrame ?? 0
          : 0;
    return {
      span: activeMusicSpanAtFrame(spans, targetFrame),
      frame: targetFrame,
    };
  }

  async startFrom(
    story: StoryLike,
    sceneId: string,
    resolve: MediaResolver,
    atFrame?: number,
  ): Promise<void> {
    this.stopVoice();
    const { span, frame } = this.resolveSpanFor(story, sceneId, atFrame);
    this.setAmbient(story.scenes.find((scene) => scene.id === sceneId), resolve);
    if (span) {
      const offsetSeconds = Math.max(0, (frame - span.startFrame) / FPS);
      await this.startTrack(span.url, span.scene, resolve, undefined, undefined, offsetSeconds);
    } else {
      this.fadeOutMusic(MUSIC_FADE_MS);
    }
  }

  async enterScene(
    scene: SceneLike,
    resolve: MediaResolver,
    atFrame?: number,
    story?: StoryLike,
  ): Promise<void> {
    const fadeMs =
      scene.musicFadeSeconds === undefined
        ? MUSIC_FADE_MS
        : Math.max(0, Number(scene.musicFadeSeconds) * 1000);
    const fadeOutMs =
      scene.musicFadeOutSeconds === undefined
        ? fadeMs
        : Math.max(0, Number(scene.musicFadeOutSeconds) * 1000);

    let span: MusicSpan | undefined;
    let frame = atFrame ?? 0;

    if (this.timelineClips.length > 0 || story) {
      const resolved = this.resolveSpanFor(story, scene.id, atFrame);
      span = resolved.span;
      frame = resolved.frame;
    } else {
      // Fallback when enterScene is called standalone without timeline clips or story
      const mode = scene.musicMode || "inherit";
      const url = scene.musicUrl || scene.sceneAudioUrl;
      if (mode === "none") {
        span = undefined;
      } else if (url) {
        span = {
          id: scene.id,
          sceneId: scene.id,
          scene,
          url,
          label: cleanTrackLabel(url),
          loop: scene.musicLoop !== false,
          level: Number(scene.musicLevel ?? 1),
          startFrame: 0,
          endFrame: 1,
        };
      } else if (this.musicUrl && this.music && !this.music.paused) {
        span = {
          id: scene.id,
          sceneId: scene.id,
          scene,
          url: this.musicUrl,
          label: cleanTrackLabel(this.musicUrl),
          loop: this.music.loop,
          level: this.musicLevel,
          startFrame: 0,
          endFrame: 1,
        };
      }
    }

    if (!span) {
      this.musicLevel = 1;
      this.fadeOutMusic(fadeOutMs);
    } else if (this.musicUrl !== span.url || !this.music || this.music.paused) {
      const offsetSeconds = Math.max(0, (frame - span.startFrame) / FPS);
      await this.startTrack(span.url, span.scene, resolve, fadeMs, fadeOutMs, offsetSeconds);
    } else if (scene.musicLevel !== undefined && Number(scene.musicLevel) !== this.musicLevel) {
      this.musicLevel = Number(scene.musicLevel);
      const duck = () => audio.duckFactor;
      fadeAudio(this.music, this.targetMusicLevel(this.musicLevel), fadeMs, undefined, duck);
    }
    this.setAmbient(scene, resolve);
  }

  syncAtFrame(frame: number): void {
    if (!this.musicUrl || !this.cachedSpans.length) return;
    const span = activeMusicSpanAtFrame(this.cachedSpans, frame);
    if (!span) {
      this.fadeOutMusic(240);
    }
  }

  playVoice(url: string | undefined, resolve: MediaResolver, offset = 0): number | undefined {
    if (!url) return undefined;
    this.stopVoice();
    const voiceGain = effectiveTrackLevel(this.trackMix, "voice");
    const source = resolve(url) || url;
    const element = new Audio(source);
    element.preload = "auto";
    element.volume = Math.min(1, audio.volumes.master * audio.volumes.voice);
    if (offset > 0) {
      element.addEventListener(
        "loadedmetadata",
        () => {
          element.currentTime = Math.min(offset, Math.max(0, element.duration - 0.05));
        },
        { once: true },
      );
    }
    this.voice = element;
    element.addEventListener(
      "ended",
      () => {
        if (this.voice === element) {
          this.voice = null;
          audio.voiceEnded();
        }
      },
      { once: true },
    );
    element.addEventListener(
      "error",
      () => {
        if (this.voice === element) {
          this.voice = null;
          audio.voiceEnded();
        }
      },
      { once: true },
    );
    if (voiceGain > 0) audio.voiceStarted();
    void element.play().catch(() => {
      if (this.voice === element) {
        this.voice = null;
        audio.voiceEnded();
      }
    });
    return Number.isFinite(element.duration) ? element.duration : undefined;
  }

  playSfx(url: string | undefined, volume: number | undefined, resolve: MediaResolver): void {
    if (!url) return;
    if (effectiveTrackLevel(this.trackMix, "sfx") <= 0) return;
    audio.playSfx(resolve(url) || url, Number(volume ?? 1));
  }

  stopVoice(): void {
    if (!this.voice) return;
    const current = this.voice;
    this.voice = null;
    current.pause();
    current.removeAttribute("src");
    audio.voiceEnded();
  }

  stopAll(): void {
    this.stopVoice();
    this.fadeOutMusic(240);
    this.setAmbient(undefined, () => undefined);
    audio.stopSfx();
  }

  unlock(): void {
    audio.unlock();
  }

  private async startTrack(
    url: string,
    from: SceneLike,
    resolve: MediaResolver,
    fadeMs = from.musicFadeSeconds === undefined
      ? MUSIC_FADE_MS
      : Math.max(0, Number(from.musicFadeSeconds) * 1000),
    fadeOutMs = from.musicFadeOutSeconds === undefined
      ? fadeMs
      : Math.max(0, Number(from.musicFadeOutSeconds) * 1000),
    offsetSeconds = 0,
  ): Promise<void> {
    const outgoing = this.music;
    if (outgoing) {
      this.music = null;
      this.fadeOutElement(outgoing, fadeOutMs);
    }
    const source = resolve(url) || url;
    const incoming = new Audio(source);
    incoming.preload = "auto";
    incoming.loop = from.musicLoop !== false;
    incoming.muted = false;
    this.musicLevel =
      from.musicLevel !== undefined && Number(from.musicLevel) >= 0 ? Number(from.musicLevel) : 1;
    incoming.volume = 0;

    if (offsetSeconds > 0) {
      const applyOffset = () => {
        if (!Number.isFinite(incoming.duration) || incoming.duration <= 0) return;
        if (incoming.loop) {
          incoming.currentTime = offsetSeconds % incoming.duration;
        } else if (offsetSeconds < incoming.duration) {
          incoming.currentTime = offsetSeconds;
        }
      };
      if (Number.isFinite(incoming.duration) && incoming.duration > 0) applyOffset();
      else incoming.addEventListener("loadedmetadata", applyOffset, { once: true });
    }

    incoming.addEventListener(
      "ended",
      () => {
        if (this.music === incoming) {
          this.music = null;
          this.musicUrl = null;
        }
      },
      { once: true },
    );

    this.music = incoming;
    this.musicUrl = url;
    const duck = () => audio.duckFactor;
    try {
      const promise = incoming.play();
      fadeAudio(incoming, this.targetMusicLevel(this.musicLevel), fadeMs, undefined, duck);
      await promise;
    } catch {
      // Browser autoplay or a missing track can fail without stopping picture playback.
    }
  }

  private targetMusicLevel(level: number): number {
    return Math.max(
      0,
      Math.min(1, audio.volumes.master * audio.volumes.music * level * audio.duckFactor),
    );
  }

  private fadeOutMusic(ms: number): void {
    const current = this.music;
    this.music = null;
    if (current) this.fadeOutElement(current, ms);
    this.musicUrl = null;
  }

  private fadeOutElement(element: HTMLAudioElement, ms: number): void {
    const duck = () => audio.duckFactor;
    fadeAudio(
      element,
      0,
      ms,
      () => {
        try {
          element.pause();
          element.removeAttribute("src");
        } catch {
          // The element may have already been detached.
        }
      },
      duck,
    );
  }

  private setAmbient(scene: SceneLike | undefined, resolve: MediaResolver): void {
    const ambient = String(scene?.ambientAudio || "");
    const parsed = parseAmbient(ambient);
    const loops = parsed.loops.map((url) => resolve(url) || url);
    const value = joinAmbient(parsed.preset, loops, parsed.other);
    if (value === this.ambientSignature) return;
    this.ambientSignature = value;
    audio.setAmbient(value === "none" ? null : value);
  }
}

export function activeFade(element: HTMLAudioElement): boolean {
  return isFading(element);
}
