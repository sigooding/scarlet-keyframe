import type { DepthModelSpec } from "./models.mjs";
export function sha256Of(file: string): Promise<string>;
export function modelIsCached(spec: DepthModelSpec, dir?: string): boolean;
export function downloadModel(
  spec: DepthModelSpec,
  file: string,
  options?: { log?: (text: string) => void; write?: (text: string) => void; isTTY?: boolean },
): Promise<void>;
export function ensureModelFile(
  spec: DepthModelSpec,
  options?: { dir?: string; log?: (text: string) => void; write?: (text: string) => void; isTTY?: boolean },
): Promise<string>;
