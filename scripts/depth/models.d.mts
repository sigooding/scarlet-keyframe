export interface DepthModelSpec {
  file: string;
  url: string;
  bytes: number;
  sha256: string;
  note: string;
}
export const MODELS: Record<string, DepthModelSpec>;
export const DEFAULT_MODEL: string;
export function modelCacheDir(options?: {
  env?: Record<string, string | undefined>;
  platform?: string;
  homedir?: string;
}): string;
