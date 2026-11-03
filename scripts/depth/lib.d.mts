export class UserError extends Error {}
export const PICTURE_ROOT: string;
export const DEPTH_ROOT: string;
export const RESULT_MARKER: string;

export interface PythonCandidate {
  cmd: string;
  args: string[];
  label: string;
  venv?: boolean;
}

export function depthMapRefFor(pictureRef: string): string;
export function fileForRef(publicDir: string, ref: string): string;
export function resolvePicture(arg: string, publicDir: string, cwd?: string): { ref: string; file: string };
export function pngSize(file: string): { width: number; height: number } | null;
export function pythonCandidates(options?: {
  platform?: string;
  repoRoot?: string;
  env?: Record<string, string | undefined>;
}): PythonCandidate[];
export function findPython(options?: {
  repoRoot?: string;
  platform?: string;
  env?: Record<string, string | undefined>;
}): PythonCandidate | null;
export function pythonHasPackages(python: PythonCandidate): boolean;
export function pythonHasGpu(python: PythonCandidate): boolean;
export function parseResultLine(output: string): ({ ok: boolean } & Record<string, unknown>) | null;
