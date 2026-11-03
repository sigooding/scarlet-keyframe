/**
 * The contract of the depth-map API (`/__api/depth/*`, served by vite-plugins/depth-api.ts on `npm run dev` and
 * `npm run serve`) as the editor's "Make depth map" button sees it. Types and constants only, so the server and the
 * browser code share one definition.
 */

export const DEPTH_API = "/__api/depth";

export type DepthJobStatus = "running" | "done" | "error" | "cancelled";

/** What this computer can do, from GET /__api/depth/ready. */
export interface DepthReady {
  ok: true;
  /** Which Python the depth command would use ("python3", ".depth-venv" ...); null when none was found. */
  python: string | null;
  /** The Python packages the worker needs are installed (npm run depth:setup does that). */
  packages: boolean;
  /** onnxruntime offers the NVIDIA GPU; the command uses it. */
  gpu: boolean;
  model: {
    name: string;
    /** Download size in megabytes (0 for a model file of your own). */
    mb: number;
    /** Already on this computer, so the first map does not download it. */
    cached: boolean;
    /** A model file chosen with SCARLET_KEYFRAME_DEPTH_MODEL_FILE. */
    custom: boolean;
  };
  /** The id of the map being made right now, if any (one at a time). */
  busy: string | null;
}

/** The command's own final answer (`@@result {...}` with --json), plus `existing` when the map was already there. */
export interface DepthMakeResult {
  ok: boolean;
  map?: string;
  width?: number;
  height?: number;
  bytes?: number;
  provider?: "gpu" | "cpu";
  seconds?: number;
  model?: string;
  archived?: string | null;
  existing?: boolean;
  message?: string;
}

/** One map being made (or finished), from POST /make, GET /status and POST /cancel. */
export interface DepthJobView {
  /** null when nothing had to be made because the picture's map was already on disk. */
  id: string | null;
  status: DepthJobStatus;
  /** The picture, `/film/img/....jpg`. */
  picture: string;
  /** Where its map is (or will be), `/film/depth/..../depth.png`. */
  map: string;
  /** Download progress 0-100 while the model is being fetched, otherwise null. */
  percent: number | null;
  /** The last few lines the command printed. */
  log: string[];
  message: string | null;
  result: DepthMakeResult | null;
  existing?: boolean;
  elapsedMs: number;
}

/** A refusal: the HTTP status says which kind, `message` is for a person. */
export interface DepthApiError {
  error: "forbidden" | "bad-request" | "bad-picture" | "setup-needed" | "busy" | "not-found" | "failed";
  message: string;
  /** For "busy": the map that is being made. */
  id?: string;
}
