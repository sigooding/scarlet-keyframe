export interface DepthModelSpec {
  file: string;
  url: string;
  bytes: number;
  sha256: string;
  note: string;
  license?: string;
}
export interface ModelSpec extends DepthModelSpec {
  role: "depth" | "matte" | "people" | "inpaint";
  title: string;
  license: string;
  source: string;
}
export const MODELS: Record<string, DepthModelSpec>;
export const DEFAULT_MODEL: string;
export const ALL_MODELS: Record<string, ModelSpec>;
export const QUALITIES: Record<"best" | "fast", { depth: string; matte: string; people: string; inpaint: string }>;
export const DEFAULT_QUALITY: "best" | "fast";
export function modelIdsFor(quality: string, job: "depth" | "cutouts"): string[];
export function modelCacheDir(options?: {
  env?: Record<string, string | undefined>;
  platform?: string;
  homedir?: string;
}): string;
