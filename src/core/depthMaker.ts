/**
 * The editor's "Make depth map" and "Make cutouts" buttons and its model downloads: talks to the depth API
 * (vite-plugins/depth-api.ts), keeps one job going, and says what the rows in the Clip tab should show.
 *
 * Three parts, none of which needs React:
 *   - the API client (`fetchDepthReady`, `startDepthJob`, ...),
 *   - `createDepthMaker`, a small controller that owns the job. It lives for the whole session, not in the Inspector, so
 *     choosing another shot while a map is being made does not lose it, and the finished layers go to the shot they were
 *     started for (if that shot still has that picture). The server runs one thing at a time: a depth map, the cut-outs of
 *     ONE picture, or a model download, never a batch,
 *   - `depthRowView`, `cutoutsRowView` and `modelsPanelView`: what each row shows, as plain data.
 */
import {
  DEPTH_API,
  type CutoutLayer,
  type DepthApiError,
  type DepthFiles,
  type DepthJobView,
  type DepthMakeResult,
  type DepthQuality,
  type DepthReady,
  type ModelRole,
  type ModelStatus,
} from "./depthApiTypes";

export type { DepthJobView, DepthMakeResult, DepthQuality, DepthReady, ModelStatus } from "./depthApiTypes";

const PICTURE_ROOT = "/film/img/";
const DEPTH_ROOT = "/film/depth/";
const PICTURE_EXT = /\.(?:jpe?g|png|webp)$/i;

/** The command to run once, in the project folder, before depth maps can be made. */
export const DEPTH_SETUP_COMMAND = "npm run depth:setup";

/** `/film/img/a/b.jpg?x#y` -> `/film/img/a/b.jpg` */
export function plainPictureRef(ref: string): string {
  return ref.split("?")[0].split("#")[0];
}

/** Depth maps and cut-outs can be made for the film's own pictures: `/film/img/....jpg|png|webp` (what the commands accept). */
export function pictureCanHaveDepthMap(ref: string | undefined | null): boolean {
  if (!ref) return false;
  const clean = plainPictureRef(ref);
  return (
    clean.startsWith(PICTURE_ROOT) &&
    PICTURE_EXT.test(clean) &&
    !clean.includes("\\") &&
    !clean.split("/").some((part) => part === ".." || part === ".")
  );
}

/** `/film/img/montage/m4-railway-rain.jpg` -> `/film/depth/montage/m4-railway-rain/depth.png` (the film's own layout). */
export function depthMapRefForPicture(ref: string): string {
  const clean = plainPictureRef(ref);
  return `${DEPTH_ROOT}${clean.slice(PICTURE_ROOT.length).replace(PICTURE_EXT, "")}/depth.png`;
}

/** A depth map that can be kept as the source for cut-outs: one of the film's, under /film/depth/. */
export function keepableDepthMap(ref: unknown): string | undefined {
  if (typeof ref !== "string") return undefined;
  const clean = plainPictureRef(ref);
  return clean.startsWith(DEPTH_ROOT) && /\.(?:png|jpe?g|webp)$/i.test(clean) && !clean.includes("\\") && !clean.split("/").some((part) => part === ".." || part === ".")
    ? clean
    : undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// The API client
// ---------------------------------------------------------------------------------------------------------------------

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The server said no, or could not be reached. `kind` is the API's error, or "network". */
export class DepthApiFailure extends Error {
  constructor(
    readonly kind: DepthApiError["error"] | "network",
    message: string,
    readonly id?: string,
    readonly missing?: string[],
  ) {
    super(message);
    this.name = "DepthApiFailure";
  }
}

async function callApi<T>(fetchImpl: FetchLike, method: "GET" | "POST", route: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${DEPTH_API}/${route}`, {
      method,
      cache: "no-store",
      ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new DepthApiFailure("network", "Could not reach the editor's server. Is it still running?");
  }
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) {
    const error = (json ?? {}) as Partial<DepthApiError>;
    throw new DepthApiFailure(error.error ?? "failed", error.message ?? `The server answered ${response.status}.`, error.id, error.missing);
  }
  return json as T;
}

/** What this computer can do, or null when there is no depth API to ask (a page opened from disk, a plain static host). */
export async function fetchDepthReady(fetchImpl: FetchLike = fetch, fresh = false): Promise<DepthReady | null> {
  try {
    const json = await callApi<DepthReady>(fetchImpl, "GET", `ready${fresh ? "?fresh=1" : ""}`);
    return json && json.ok === true && Array.isArray(json.models) ? json : null;
  } catch {
    return null;
  }
}

/** The picture files in the film's depth folder (paths under public/), or null when there is no server to ask. */
export async function fetchDepthFiles(fetchImpl: FetchLike = fetch): Promise<string[] | null> {
  try {
    const json = await callApi<DepthFiles>(fetchImpl, "GET", "files");
    return json && json.ok === true && Array.isArray(json.paths) ? json.paths.filter((path) => typeof path === "string") : null;
  } catch {
    return null;
  }
}

export const startDepthJob = (picture: string, quality: DepthQuality, fetchImpl: FetchLike = fetch) =>
  callApi<DepthJobView>(fetchImpl, "POST", "make", { picture, quality });
export const startCutoutsJob = (picture: string, quality: DepthQuality, sourceMap: string | undefined, fetchImpl: FetchLike = fetch) =>
  callApi<DepthJobView>(fetchImpl, "POST", "cutouts", { picture, quality, ...(sourceMap ? { sourceMap } : {}) });
export const startModelDownload = (ids: string[], fetchImpl: FetchLike = fetch) => callApi<DepthJobView>(fetchImpl, "POST", "models/download", { ids });
export const fetchDepthJob = (id: string, fetchImpl: FetchLike = fetch) =>
  callApi<DepthJobView>(fetchImpl, "GET", `status?id=${encodeURIComponent(id)}`);
export const cancelDepthJob = (id: string, fetchImpl: FetchLike = fetch) => callApi<DepthJobView>(fetchImpl, "POST", "cancel", { id });

// ---------------------------------------------------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------------------------------------------------

type JobStatus = "starting" | "running" | "done" | "error" | "cancelled";

/** A depth map or the cut-outs of one picture, for one shot. */
export interface DepthMakerJob {
  kind: "depth" | "cutouts";
  /** The shot the layers are for, and the picture they were started for. */
  frameId: string;
  picture: string;
  /** "starting" is the moment between the click and the server's first answer. */
  status: JobStatus;
  /** The server's id for it; null before the server answered, and when the map was already there. */
  id: string | null;
  percent: number | null;
  step: { n: number; of: number; text: string } | null;
  current: string | null;
  log: string[];
  message: string | null;
  result: DepthMakeResult | null;
  /** The map was already on disk, so nothing was made. */
  existing: boolean;
  startedAt: number;
  /** A finished result is put on the shot; `applied` says it was, `note` why not when it was not. */
  applied: boolean;
  note: string | null;
  /** Something to watch for after it was applied (the camera is a dolly: depth is not used there). */
  caution: string | null;
}

/** Models being downloaded (not tied to a shot). */
export interface ModelDownload {
  status: JobStatus;
  id: string | null;
  ids: string[];
  percent: number | null;
  current: string | null;
  message: string | null;
  startedAt: number;
}

export interface DepthMakerState {
  /** null before the first answer; "unavailable" when there is no server to ask. */
  ready: DepthReady | "unavailable" | null;
  /** Which models to use: "best" (Depth Anything Large, non-commercial) or "fast" (small, permissive). */
  quality: DepthQuality;
  job: DepthMakerJob | null;
  download: ModelDownload | null;
}

/** Puts the made map on the shot. Says whether it did, and why not otherwise. */
export type ApplyDepthMap = (frameId: string, picture: string, mapRef: string) => { applied: true } | { applied: false; reason: string };

/** The layers of a finished cut-out run, to put on the shot in one go. */
export interface MadeCutouts {
  depthMap: string;
  plate: string;
  cutouts: Pick<CutoutLayer, "image" | "depth">[];
}
export type ApplyCutouts = (frameId: string, picture: string, made: MadeCutouts) => { applied: true; caution?: string } | { applied: false; reason: string };

export interface DepthMakerDeps {
  apply: ApplyDepthMap;
  applyCutouts: ApplyCutouts;
  quality?: DepthQuality;
  onQualityChange?: (quality: DepthQuality) => void;
  fetch?: FetchLike;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  now?: () => number;
  /** How often to ask how the job is going. */
  pollMs?: number;
}

export interface DepthMakerController {
  getState(): DepthMakerState;
  subscribe(listener: () => void): () => void;
  /** Ask what this computer can do. Does nothing when that is already known, unless `fresh`. */
  checkReady(fresh?: boolean): Promise<void>;
  setQuality(quality: DepthQuality): void;
  /** Make the depth map of this shot's picture. */
  start(frameId: string, picture: string): Promise<void>;
  /** Cut the people out of this shot's picture (and make the plate and the depth map that go with them). */
  startCutouts(frameId: string, picture: string, sourceMap?: string): Promise<void>;
  /** Download these models (ids from the models list), one at a time. */
  downloadModels(ids: string[]): Promise<void>;
  /** Stops whatever is running: the job, or the download. */
  cancel(): Promise<void>;
  /** Forget a finished job, or a finished download. */
  dismiss(): void;
}

const MAX_POLL_FAILURES = 5;
// Annotated `: boolean` on purpose: without it TypeScript infers a type predicate and, after an early return on running(...),
// believes the status can never be "running" again while the awaited request is in flight.
const running = (status: JobStatus | undefined): boolean => status === "starting" || status === "running";

export function createDepthMaker(deps: DepthMakerDeps): DepthMakerController {
  const fetchImpl: FetchLike = deps.fetch ?? ((input, init) => fetch(input, init));
  const schedule = deps.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const unschedule = deps.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const now = deps.now ?? Date.now;
  const pollMs = deps.pollMs ?? 700;

  let state: DepthMakerState = { ready: null, quality: deps.quality ?? "best", job: null, download: null };
  let timer: unknown = null;
  let readyRequest: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const set = (next: Partial<DepthMakerState>) => {
    state = { ...state, ...next };
    for (const listener of [...listeners]) listener();
  };
  const patchJob = (patch: Partial<DepthMakerJob>) => {
    if (state.job) set({ job: { ...state.job, ...patch } });
  };
  const patchDownload = (patch: Partial<ModelDownload>) => {
    if (state.download) set({ download: { ...state.download, ...patch } });
  };
  const stopPolling = () => {
    if (timer !== null) unschedule(timer);
    timer = null;
  };

  /** The server's view of the job, folded into ours; when it has ended, the layers go onto the shot. */
  const absorbJob = (view: DepthJobView) => {
    const job = state.job;
    if (!job) return;
    const base: Partial<DepthMakerJob> = {
      id: view.id,
      percent: view.percent,
      step: view.step ?? null,
      current: view.current ?? null,
      log: view.log,
      message: view.message,
      result: view.result,
      existing: Boolean(view.existing),
    };
    if (view.status === "running") {
      patchJob({ ...base, status: "running" });
      return;
    }
    stopPolling();
    const result = view.result;
    if (view.status === "done" && result?.ok) {
      if (job.kind === "cutouts") {
        if (result.written === false) {
          const why =
            result.reason === "nothing-cut"
              ? "People were found, but none could be cut out cleanly, so nothing was made."
              : "No people were found in this picture, so nothing was made. A depth map alone is fine here.";
          patchJob({ ...base, status: "done", applied: false, note: why });
          return;
        }
        const outcome = deps.applyCutouts(job.frameId, job.picture, {
          depthMap: result.depthMap ?? "",
          plate: result.plate ?? "",
          cutouts: (result.cutouts ?? []).map(({ image, depth }) => ({ image, depth })),
        });
        patchJob({
          ...base,
          status: "done",
          applied: outcome.applied,
          note: outcome.applied ? null : `${outcome.reason} The layers are saved in ${result.folder ?? "the depth folder"}.`,
          caution: outcome.applied ? outcome.caution ?? null : null,
        });
        return;
      }
      const outcome = deps.apply(job.frameId, job.picture, result.map ?? view.map);
      patchJob({
        ...base,
        status: "done",
        applied: outcome.applied,
        note: outcome.applied ? null : `${outcome.reason} The map is saved at ${result.map ?? view.map}.`,
      });
      return;
    }
    patchJob({ ...base, status: view.status === "cancelled" ? "cancelled" : "error", message: view.message ?? "That could not be made." });
  };

  const absorbDownload = (view: DepthJobView) => {
    if (!state.download) return;
    const base: Partial<ModelDownload> = { id: view.id, percent: view.percent, current: view.current ?? null, message: view.message };
    if (view.status === "running") {
      patchDownload({ ...base, status: "running" });
      return;
    }
    stopPolling();
    patchDownload({ ...base, status: view.status === "done" ? "done" : view.status === "cancelled" ? "cancelled" : "error", message: view.message ?? (view.status === "done" ? null : "The download could not be finished.") });
    void controller.checkReady(true); // what is on this computer has changed
  };

  const poll = (id: string, scope: "job" | "download", failures = 0) => {
    stopPolling();
    timer = schedule(async () => {
      timer = null;
      const current = scope === "job" ? state.job : state.download;
      if (!current || current.id !== id || current.status !== "running") return;
      try {
        const view = await fetchDepthJob(id, fetchImpl);
        if (scope === "job") absorbJob(view);
        else absorbDownload(view);
        const after = scope === "job" ? state.job : state.download;
        if (after?.status === "running") poll(id, scope);
      } catch (error) {
        const unknown = error instanceof DepthApiFailure && error.kind === "not-found";
        if (unknown || failures + 1 >= MAX_POLL_FAILURES) {
          const message = unknown ? "The editor's server no longer knows this job (it was restarted). Try again." : error instanceof Error ? error.message : "Lost contact with the editor's server.";
          if (scope === "job") patchJob({ status: "error", message });
          else patchDownload({ status: "error", message });
        } else {
          poll(id, scope, failures + 1);
        }
      }
    }, pollMs);
  };

  const newJob = (kind: DepthMakerJob["kind"], frameId: string, picture: string): DepthMakerJob => ({
    kind,
    frameId,
    picture: plainPictureRef(picture),
    status: "starting",
    id: null,
    percent: null,
    step: null,
    current: null,
    log: [],
    message: null,
    result: null,
    existing: false,
    startedAt: now(),
    applied: false,
    note: null,
    caution: null,
  });

  const begin = async (job: DepthMakerJob, post: () => Promise<DepthJobView>) => {
    if (running(state.job?.status) || running(state.download?.status)) return;
    set({ job });
    try {
      const view = await post();
      absorbJob(view);
      if (view.id && state.job?.status === "running") poll(view.id, "job");
    } catch (error) {
      patchJob({ status: "error", message: error instanceof Error ? error.message : "That could not be started." });
      // a refusal that says what changed on this computer changes what the rows should offer
      if (error instanceof DepthApiFailure && (error.kind === "setup-needed" || error.kind === "busy" || error.kind === "models-missing")) {
        void controller.checkReady(true);
      }
    }
  };

  const controller: DepthMakerController = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    checkReady(fresh = false) {
      if (!fresh && state.ready !== null) return Promise.resolve();
      if (readyRequest) return readyRequest;
      readyRequest = fetchDepthReady(fetchImpl, fresh)
        .then((ready) => set({ ready: ready ?? "unavailable" }))
        .finally(() => {
          readyRequest = null;
        });
      return readyRequest;
    },

    setQuality(quality) {
      if (quality === state.quality) return;
      set({ quality });
      deps.onQualityChange?.(quality);
    },

    start(frameId, picture) {
      const job = newJob("depth", frameId, picture);
      return begin(job, () => startDepthJob(job.picture, state.quality, fetchImpl));
    },

    startCutouts(frameId, picture, sourceMap) {
      const job = newJob("cutouts", frameId, picture);
      return begin(job, () => startCutoutsJob(job.picture, state.quality, sourceMap, fetchImpl));
    },

    async downloadModels(ids) {
      if (running(state.job?.status) || running(state.download?.status) || ids.length === 0) return;
      set({ download: { status: "starting", id: null, ids, percent: null, current: null, message: null, startedAt: now() } });
      try {
        const view = await startModelDownload(ids, fetchImpl);
        absorbDownload(view);
        if (view.id && state.download?.status === "running") poll(view.id, "download");
      } catch (error) {
        patchDownload({ status: "error", message: error instanceof Error ? error.message : "The download could not be started." });
      }
    },

    async cancel() {
      const target = state.download?.status === "running" ? state.download : state.job?.status === "running" ? state.job : null;
      if (!target || !target.id) return;
      try {
        const view = await cancelDepthJob(target.id, fetchImpl);
        if (target === state.download) absorbDownload(view);
        else absorbJob(view);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not cancel.";
        if (target === state.download) patchDownload({ message });
        else patchJob({ message });
      }
    },

    dismiss() {
      if (state.job && !running(state.job.status)) set({ job: null });
      else if (state.download && !running(state.download.status) && !state.job) set({ download: null });
    },
  };
  return controller;
}

// ---------------------------------------------------------------------------------------------------------------------
// What the rows show
// ---------------------------------------------------------------------------------------------------------------------

const megabytes = (bytes: number) => Math.round(bytes / 1e6);
const sizeText = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${megabytes(bytes)} MB`);

/** The model a role uses at the current quality, from the server's list. */
function modelFor(ready: DepthReady, quality: DepthQuality, role: keyof DepthReady["qualities"]["best"]): ModelStatus | undefined {
  const id = ready.qualities?.[quality]?.[role];
  return ready.models.find((model) => model.id === id);
}

/** Why a button waits: one thing runs at a time, so say what is running, and whether it is for this very shot. */
function busyNote(state: DepthMakerState, frameId: string): string {
  if (running(state.download?.status)) return "Models are being downloaded. One thing at a time.";
  const job = state.job;
  if (job && running(job.status)) {
    if (job.frameId !== frameId) return "Something is being made for another shot. One thing at a time.";
    return job.kind === "cutouts"
      ? "The cut-outs of this shot are being made, depth map included. One thing at a time."
      : "The depth map of this shot is being made. One thing at a time.";
  }
  return "Something is already being made (started from another page). One thing at a time.";
}

export type DepthRowView =
  /** Nothing to offer: no suitable picture, or the shot already has a depth map. */
  | { kind: "hidden" }
  /** Asking the server what this computer can do. */
  | { kind: "checking" }
  /** No server to ask (the page was opened from disk): depth maps are made by `npm run depth`, or the app must be served. */
  | { kind: "unavailable" }
  /** Python or its packages are missing: one command to run once. */
  | { kind: "setup-needed"; command: string }
  /** The button can be pressed. `note` says what will happen. */
  | { kind: "ready"; note: string }
  /** Something else is running (for another shot, a download, or another page): one at a time. */
  | { kind: "busy"; note: string }
  | { kind: "running"; percent: number | null; phase: string; cancellable: boolean }
  /** `cancelled`: you stopped it yourself, which is not an error. */
  | { kind: "failed"; message: string; cancelled: boolean }
  | { kind: "done"; text: string; caution: string | null; note: string | null };

/** What the Make depth map row shows for this shot. Pure: `now` is passed in so the elapsed time can be tested. */
export function depthRowView(input: {
  frameId: string;
  picture: string | undefined;
  hasDepthMap: boolean;
  state: DepthMakerState;
  now?: number;
}): DepthRowView {
  const { frameId, picture, hasDepthMap, state } = input;
  const job = state.job && state.job.kind === "depth" ? state.job : null;

  if (job && job.frameId === frameId) {
    if (job.status === "starting" || job.status === "running") {
      const seconds = Math.max(0, Math.round(((input.now ?? Date.now()) - job.startedAt) / 1000));
      const downloading = job.percent !== null && job.percent < 100 && /download/i.test(job.current ?? "");
      const checking = /^Checking /.test(job.current ?? "");
      const phase =
        job.status === "starting"
          ? "Starting…"
          : downloading
            ? `${job.current}… ${job.percent}%`
            : checking
              ? `${job.current}… ${seconds} s`
              : `Making the depth map… ${seconds} s`;
      return { kind: "running", percent: downloading ? job.percent : null, phase, cancellable: job.status === "running" && Boolean(job.id) };
    }
    if (job.status === "error" || job.status === "cancelled") {
      // The server refused because Python is not set up: say what to run, with the buttons for it, not just the error.
      if (job.status === "error" && typeof state.ready === "object" && state.ready !== null && (!state.ready.python || !state.ready.packages)) {
        return { kind: "setup-needed", command: DEPTH_SETUP_COMMAND };
      }
      return { kind: "failed", cancelled: job.status === "cancelled", message: job.message ?? (job.status === "cancelled" ? "Cancelled." : "The depth map could not be made.") };
    }
    // done
    const result = job.result;
    const size = result?.width && result?.height ? `${result.width}×${result.height}` : null;
    const how = result?.provider ? ` on the ${result.provider === "gpu" ? "GPU" : "CPU"}` : "";
    const took = typeof result?.seconds === "number" ? `, ${result.seconds} s${how}` : "";
    const made = `Depth map made${size ? ` (${size}${took})` : ""}.`;
    return {
      kind: "done",
      text: job.existing
        ? job.applied
          ? "This picture already had a depth map. It is now this shot's."
          : "This picture already has a depth map."
        : job.applied
          ? `${made} Turn on MAP in the Depth Maps lane to see it.`
          : made,
      caution: job.applied ? "If people are in this picture they will stretch when the camera moves. Use Make cutouts (below) to cut each one out." : null,
      note: job.note,
    };
  }

  if (!pictureCanHaveDepthMap(picture) || hasDepthMap) return { kind: "hidden" };

  if (running(state.job?.status) || running(state.download?.status)) return { kind: "busy", note: busyNote(state, frameId) };
  const ready = state.ready;
  if (ready === null) return { kind: "checking" };
  if (ready === "unavailable") return { kind: "unavailable" };
  if (!ready.python || !ready.packages) return { kind: "setup-needed", command: DEPTH_SETUP_COMMAND };
  if (ready.busy) return { kind: "busy", note: "Something is already being made (started from another page). One thing at a time." };

  const model = modelFor(ready, state.quality, "depth");
  const licence = model?.nonCommercial ? " Its licence is non-commercial." : "";
  const note = !model
    ? "Made on this computer from this picture."
    : model.overridden
      ? model.cached
        ? "Made on this computer from this picture, with your model file."
        : "The model file you chose (SCARLET_KEYFRAME_DEPTH_MODEL_FILE) was not found, so this will fail."
      : model.cached
        ? `Made on this computer from this picture (${model.title}).${licence}`
        : `Made on this computer from this picture. The first one downloads ${model.title} (${sizeText(model.bytes)}), once.${licence}`;
  return { kind: "ready", note: `${note}${ready.gpu ? " Uses your graphics card." : ""}` };
}

export type CutoutsRowView =
  | { kind: "hidden" }
  | { kind: "checking" }
  | { kind: "unavailable" }
  | { kind: "setup-needed"; command: string }
  /** The models are not all on this computer: download them (one at a time or all) before cutting out. */
  | { kind: "models-missing"; missing: ModelStatus[]; bytes: number; nonCommercial: boolean }
  | { kind: "downloading"; phase: string; percent: number | null; cancellable: boolean }
  | { kind: "ready"; note: string; keepsMap: boolean }
  | { kind: "busy"; note: string }
  | { kind: "running"; phase: string; progress: number | null; cancellable: boolean }
  | { kind: "failed"; message: string; cancelled: boolean }
  /** `made`: false when nobody was found or nobody could be cut out, so nothing was made (not an error either). */
  | { kind: "done"; made: boolean; text: string; flags: string[]; caution: string | null; note: string | null; review: string | null };

/** The models a cut-out run needs at this quality (no depth model when a depth map is kept), as the server lists them. */
export function modelsNeededForCutouts(ready: DepthReady, quality: DepthQuality, keepsMap: boolean): ModelStatus[] {
  const set = ready.qualities?.[quality];
  if (!set) return [];
  const roles: ModelRole[] = keepsMap ? ["people", "matte", "inpaint"] : ["people", "matte", "inpaint", "depth"];
  return roles.map((role) => ready.models.find((model) => model.id === set[role])).filter((model): model is ModelStatus => Boolean(model));
}

/** What the Make cutouts row shows for this shot (the selected shot only: it is never a batch). */
export function cutoutsRowView(input: {
  frameId: string;
  picture: string | undefined;
  hasCutouts: boolean;
  /** The shot's depth map when it has one the cut-outs can keep (under /film/depth/). */
  keptMap?: string;
  state: DepthMakerState;
  now?: number;
}): CutoutsRowView {
  const { frameId, picture, hasCutouts, state } = input;
  const job = state.job && state.job.kind === "cutouts" ? state.job : null;

  if (job && job.frameId === frameId) {
    if (job.status === "starting" || job.status === "running") {
      const seconds = Math.max(0, Math.round(((input.now ?? Date.now()) - job.startedAt) / 1000));
      const step = job.step;
      const phase =
        job.status === "starting"
          ? "Starting…"
          : step
            ? `Step ${step.n} of ${step.of}: ${step.text} · ${seconds} s`
            : job.current
              ? `${job.current}… ${seconds} s`
              : `Working… ${seconds} s`;
      return { kind: "running", phase, progress: step ? Math.round(((step.n - 1) / step.of) * 100) : null, cancellable: job.status === "running" && Boolean(job.id) };
    }
    if (job.status === "error" || job.status === "cancelled") {
      return { kind: "failed", cancelled: job.status === "cancelled", message: job.message ?? (job.status === "cancelled" ? "Cancelled." : "The cut-outs could not be made.") };
    }
    const result = job.result;
    const count = result?.cutouts?.length ?? 0;
    const how = result?.provider ? ` on the ${result.provider === "gpu" ? "GPU" : "CPU"}` : "";
    const took = typeof result?.seconds === "number" ? ` in ${result.seconds} s${how}` : "";
    if (!job.applied && result?.written === false) return { kind: "done", made: false, text: job.note ?? "Nothing was made.", flags: result.flags ?? [], caution: null, note: null, review: null };
    return {
      kind: "done",
      made: true,
      text: job.applied
        ? `${count} cut-out${count === 1 ? "" : "s"}, a plate and a depth map made${took}. This shot now uses them (one undo step).`
        : `${count} cut-out${count === 1 ? "" : "s"} made${took}.`,
      flags: result?.flags ?? [],
      caution: job.caution,
      note: job.note,
      review: result?.review ?? null,
    };
  }

  if (!pictureCanHaveDepthMap(picture) || hasCutouts) return { kind: "hidden" };

  if (running(state.download?.status)) {
    const download = state.download as ModelDownload;
    const percent = download.percent !== null && download.percent < 100 ? download.percent : null;
    return { kind: "downloading", phase: `${download.current ?? "Downloading models"}${percent !== null ? `… ${percent}%` : "…"}`, percent, cancellable: download.status === "running" && Boolean(download.id) };
  }
  if (running(state.job?.status)) return { kind: "busy", note: busyNote(state, frameId) };
  const ready = state.ready;
  if (ready === null) return { kind: "checking" };
  if (ready === "unavailable") return { kind: "unavailable" };
  if (!ready.python || !ready.packages) return { kind: "setup-needed", command: DEPTH_SETUP_COMMAND };
  if (ready.busy) return { kind: "busy", note: busyNote(state, frameId) };

  const keepsMap = Boolean(input.keptMap);
  const missing = modelsNeededForCutouts(ready, state.quality, keepsMap).filter((model) => !model.cached);
  if (missing.length) {
    return { kind: "models-missing", missing, bytes: missing.reduce((sum, model) => sum + model.bytes, 0), nonCommercial: missing.some((model) => model.nonCommercial) };
  }
  const where = ready.gpu ? "A few seconds on your graphics card." : "A few minutes on the CPU.";
  return {
    kind: "ready",
    keepsMap,
    note: `Finds the people in this picture, cuts each one out, paints in what was behind them, and ${keepsMap ? "paints them out of the depth map you have (kept as it is)" : "makes the depth map"}, so they do not stretch when the camera moves. ${where}`,
  };
}

export interface ModelsPanelRow {
  model: ModelStatus;
  /** Used by the current quality (and, for the depth model, by the depth map button too). */
  usedFor: string;
}

export interface ModelsPanelView {
  quality: DepthQuality;
  rows: ModelsPanelRow[];
  totalBytes: number;
  missingBytes: number;
  missingIds: string[];
  allHere: boolean;
  /** Some model at this quality has a non-commercial licence. */
  nonCommercial: boolean;
  /** A download is running (or something else is), so Download buttons wait. */
  busy: boolean;
  modelsDir: string;
}

const ROLE_LABEL: Record<string, string> = { people: "finds the people", matte: "cuts them out", inpaint: "paints the plate", depth: "makes the depth map" };

/** The models at the chosen quality, for the models list. Null when the server has not answered (or there is none). */
export function modelsPanelView(state: DepthMakerState): ModelsPanelView | null {
  const ready = state.ready;
  if (ready === null || ready === "unavailable") return null;
  const set = ready.qualities?.[state.quality];
  if (!set) return null;
  const rows = (["people", "matte", "inpaint", "depth"] as const)
    .map((role) => ready.models.find((model) => model.id === set[role]))
    .filter((model): model is ModelStatus => Boolean(model))
    .map((model) => ({ model, usedFor: ROLE_LABEL[model.role] ?? model.role }));
  const missing = rows.filter((row) => !row.model.cached).map((row) => row.model);
  return {
    quality: state.quality,
    rows,
    totalBytes: rows.reduce((sum, row) => sum + row.model.bytes, 0),
    missingBytes: missing.reduce((sum, model) => sum + model.bytes, 0),
    missingIds: missing.map((model) => model.id),
    allHere: missing.length === 0,
    nonCommercial: rows.some((row) => row.model.nonCommercial),
    busy: running(state.download?.status) || running(state.job?.status) || Boolean(ready.busy),
    modelsDir: ready.modelsDir,
  };
}

export { sizeText as formatModelSize };
