export const LIPSYNC_SETUP_COMMAND: string;
export const LATENTSYNC_REPO: string;
export const LATENTSYNC_WEIGHTS: string;
export const LATENTSYNC_CONFIG: string;
export const LATENTSYNC_CHECKPOINTS: string[];
export const LIPSYNC_VIDEO_ROOT: string;
export const VOICE_EXT: RegExp;
export function latentSyncDir(env?: Record<string, string | undefined>): string;
export function lipSyncPython(repoRoot: string, platform?: string): string;
export function lipSyncStatus(
  repoRoot: string,
  options?: { env?: Record<string, string | undefined>; platform?: string; ffmpeg?: () => boolean },
): { ready: boolean; missing: string[]; dir: string; python: string; setupCommand: string };
export function isVoiceRef(ref: unknown): boolean;
export function lipSyncClipStem(pictureRef: string, voiceRef: string): string;
