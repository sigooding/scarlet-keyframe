/**
 * The contract of the depth API (`/__api/depth/*`, served by vite-plugins/depth-api.ts on `npm run dev` and
 * `npm run serve`) as the editor's "Make depth map" and "Make cutouts" buttons see it. Types and constants only, so the
 * server and the browser code share one definition.
 */

export const DEPTH_API = "/__api/depth";

export type DepthJobStatus = "running" | "done" | "error" | "cancelled";

/** What a job is making: a depth map, the cut-outs of a picture's people, or downloading models. */
export type DepthJobKind = "depth" | "cutouts" | "models";

/** "best" uses the largest models (Depth Anything Large is non-commercial); "fast" the small, permissively licensed ones. */
export type DepthQuality = "best" | "fast";

export type ModelRole = "depth" | "matte" | "people" | "inpaint";

/** One downloadable model, and whether it is on this computer. */
export interface ModelStatus {
  id: string;
  role: ModelRole;
  title: string;
  /** The file name in the models folder (put a model there yourself and it is used once its checksum has been checked). */
  file: string;
  bytes: number;
  license: string;
  /** Where the model comes from: a page to read about it. */
  source: string;
  /** The file itself, for downloading by hand (then put it in the models folder under its own name). */
  url: string;
  /** What it does, in a sentence. */
  note: string;
  nonCommercial: boolean;
  /** In the models folder with the right size, or replaced by a file of your own (`overridden`). */
  cached: boolean;
  /** You chose a file of your own for this role (an environment variable), so this model is not used. */
  overridden: boolean;
}

/** What this computer can do, from GET /__api/depth/ready. */
export interface DepthReady {
  ok: true;
  /** Which Python the depth command would use ("python3", ".depth-venv" ...); null when none was found. */
  python: string | null;
  /** The Python packages the worker needs are installed (npm run depth:setup does that). */
  packages: boolean;
  /** onnxruntime can really use the NVIDIA GPU (a session was made on it); the commands use it. */
  gpu: boolean;
  /** The GPU package is installed but cannot be used: why, in a line (a missing library, an old driver). */
  gpuNote?: string | null;
  /** Every downloadable model, with whether it is here. */
  models: ModelStatus[];
  /** The folder the models are kept in. */
  modelsDir: string;
  /** Which model ids each quality uses, one per role. */
  qualities: Record<DepthQuality, Record<ModelRole, string>>;
  defaultQuality: DepthQuality;
  /** The id of the job running right now, if any (one at a time). */
  busy: string | null;
}

/** One person's layer: the picture of them (transparent PNG at the picture's size) and the depth it moves at. */
export interface CutoutLayer {
  image: string;
  depth: number;
  /** The box [x, y, w, h] it was cut from, in the picture's pixels. */
  box: [number, number, number, number];
  /** "feet": at the ground under their feet; "body": at their own depth (feet out of shot). */
  how?: "feet" | "body";
}

/** The command's own final answer (`@@result {...}` with --json), plus `existing` when the map was already there. */
export interface DepthMakeResult {
  ok: boolean;
  map?: string;
  width?: number;
  height?: number;
  bytes?: number;
  provider?: "gpu" | "cpu";
  /** The GPU was asked for but not used: why. */
  gpuNote?: string | null;
  seconds?: number;
  model?: string;
  archived?: string | null;
  existing?: boolean;
  message?: string;
  // ---- cut-outs
  /** false when nothing was made (nobody in the picture, or nobody could be cut out cleanly): see `reason`. */
  written?: boolean;
  reason?: "no-people" | "nothing-cut";
  /** The new folder (`/film/depth/.../people-1`) holding depth.png, plate.jpg, cutout-N.png and review.jpg. */
  folder?: string;
  depthMap?: string;
  plate?: string;
  review?: string;
  cutouts?: CutoutLayer[];
  /** What a person should look at: a clipped or empty cut-out, someone still in the plate. */
  flags?: string[];
  /** People the finder saw, and how many were left in the plate (too small, or past four). */
  seen?: number;
  leftOut?: number;
  quality?: DepthQuality;
  source?: "model" | "given";
  // ---- models
  models?: { id: string; file: string; bytes: number }[];
}

/** One job (or a finished one), from POST /make, /cutouts, /models/download, GET /status and POST /cancel. */
export interface DepthJobView {
  /** null when nothing had to be made because the picture's map was already on disk. */
  id: string | null;
  kind?: DepthJobKind;
  status: DepthJobStatus;
  /** The picture, `/film/img/....jpg` ("" for a model download). */
  picture: string;
  /** Where its map is (or will be), `/film/depth/..../depth.png` ("" for cut-outs and downloads: see `result`). */
  map: string;
  /** Download progress 0-100 while a model is being fetched, otherwise null. */
  percent: number | null;
  /** "Step 2 of 5: ..." for a cut-out job: which stage it is in. */
  step?: { n: number; of: number; text: string } | null;
  /** What it is doing now, for a person to read ("Downloading BiRefNet general (full) (once)"). */
  current?: string | null;
  /** The last few lines the command printed. */
  log: string[];
  message: string | null;
  result: DepthMakeResult | null;
  existing?: boolean;
  elapsedMs: number;
}

/** GET /__api/depth/files: every picture file in the film's depth folder (what the Make buttons wrote, and the rest), as paths under public/. */
export interface DepthFiles {
  ok: true;
  paths: string[];
}

/** A refusal: the HTTP status says which kind, `message` is for a person. */
export interface DepthApiError {
  error: "forbidden" | "bad-request" | "bad-picture" | "setup-needed" | "models-missing" | "busy" | "not-found" | "failed";
  message: string;
  /** For "busy": the job that is running. */
  id?: string;
  /** For "models-missing": the model ids to download first. */
  missing?: string[];
}
