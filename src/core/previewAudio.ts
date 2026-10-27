import { audio } from "../../vendor/scarlet-reel/audio";
import { parseAmbient, joinAmbient } from "../../vendor/scarlet-reel/studio/ambientParts";
import { fadeAudio, isFading, MUSIC_FADE_MS } from "../../vendor/scarlet-reel/game/audioFade";
import type { SceneLike, StoryLike } from "./model";
import { runningSceneIds } from "./model";

export type MediaResolver = (value: string | undefined) => string | undefined;

export class PreviewAudioController {
  private music: HTMLAudioElement | null = null;
  private musicUrl: string | null = null;
  private musicLevel = 1;
  private voice: HTMLAudioElement | null = null;
  private ambientSignature = "";

  constructor() {
    audio.onDuckChange = () => {
      if (this.music && !isFading(this.music)) this.music.volume = this.targetMusicLevel(this.musicLevel);
    };
  }

  get musicPosition(): number {
    return this.music?.currentTime || 0;
  }

  get musicDuration(): number {
    return this.music?.duration || 0;
  }

  async startFrom(story: StoryLike, sceneId: string, resolve: MediaResolver): Promise<void> {
    this.stopVoice();
    const order = runningSceneIds(story);
    const stopAt = Math.max(0, order.indexOf(sceneId));
    let inherited: { scene: SceneLike; url: string } | undefined;
    for (const id of order.slice(0, stopAt + 1)) {
      const scene = story.scenes.find((candidate) => candidate.id === id);
      if (!scene) continue;
      const mode = scene.musicMode || "inherit";
      const url = scene.musicUrl || scene.sceneAudioUrl;
      if (mode === "none") inherited = undefined;
      else if (url && (mode === "track" || !inherited || inherited.url !== url)) inherited = { scene, url };
    }
    this.setAmbient(story.scenes.find((scene) => scene.id === sceneId), resolve);
    if (inherited) await this.startTrack(inherited.url, inherited.scene, resolve);
    else this.fadeOutMusic(MUSIC_FADE_MS);
  }

  async enterScene(scene: SceneLike, resolve: MediaResolver): Promise<void> {
    const mode = scene.musicMode || "inherit";
    const url = scene.musicUrl || scene.sceneAudioUrl;
    const fadeMs = scene.musicFadeSeconds === undefined ? MUSIC_FADE_MS : Math.max(0, Number(scene.musicFadeSeconds) * 1000);
    const fadeOutMs = scene.musicFadeOutSeconds === undefined ? fadeMs : Math.max(0, Number(scene.musicFadeOutSeconds) * 1000);
    if (mode === "none") {
      this.musicLevel = 1;
      this.fadeOutMusic(fadeOutMs);
    } else if (url && (mode === "track" || this.musicUrl !== url)) {
      await this.startTrack(url, scene, resolve, fadeMs, fadeOutMs);
    } else if (url && scene.musicLevel !== undefined && scene.musicLevel !== this.musicLevel && this.music) {
      this.musicLevel = Number(scene.musicLevel);
      const duck = () => audio.duckFactor;
      fadeAudio(this.music, this.targetMusicLevel(this.musicLevel), fadeMs, undefined, duck);
    }
    this.setAmbient(scene, resolve);
  }

  playVoice(url: string | undefined, resolve: MediaResolver, offset = 0): number | undefined {
    if (!url) return undefined;
    this.stopVoice();
    const source = resolve(url) || url;
    const element = new Audio(source);
    element.preload = "auto";
    element.volume = Math.min(1, audio.volumes.master * audio.volumes.voice);
    if (offset > 0) element.addEventListener("loadedmetadata", () => {
      element.currentTime = Math.min(offset, Math.max(0, element.duration - 0.05));
    }, { once: true });
    this.voice = element;
    element.addEventListener("ended", () => {
      if (this.voice === element) {
        this.voice = null;
        audio.voiceEnded();
      }
    }, { once: true });
    element.addEventListener("error", () => {
      if (this.voice === element) {
        this.voice = null;
        audio.voiceEnded();
      }
    }, { once: true });
    audio.voiceStarted();
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
    fadeMs = from.musicFadeSeconds === undefined ? MUSIC_FADE_MS : Math.max(0, Number(from.musicFadeSeconds) * 1000),
    fadeOutMs = from.musicFadeOutSeconds === undefined ? fadeMs : Math.max(0, Number(from.musicFadeOutSeconds) * 1000),
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
    this.musicLevel = from.musicLevel !== undefined && Number(from.musicLevel) >= 0 ? Number(from.musicLevel) : 1;
    incoming.volume = 0;
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
    return Math.max(0, Math.min(1, audio.volumes.master * audio.volumes.music * level * audio.duckFactor));
  }

  private fadeOutMusic(ms: number): void {
    const current = this.music;
    this.music = null;
    if (current) this.fadeOutElement(current, ms);
    this.musicUrl = null;
  }

  private fadeOutElement(element: HTMLAudioElement, ms: number): void {
    const duck = () => audio.duckFactor;
    fadeAudio(element, 0, ms, () => {
      try {
        element.pause();
        element.removeAttribute("src");
      } catch {
        // The element may have already been detached.
      }
    }, duck);
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
