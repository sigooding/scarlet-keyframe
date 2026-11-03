/**
 * The models the editor's depth and cut-out buttons (and `npm run depth`, `npm run cutouts`) can use, as ONNX files.
 *
 * Each is downloaded once into a cache folder outside the repository (modelCacheDir), and its size and SHA-256 are
 * checked, so a broken or changed download is refused. The checksums are of the release files as downloaded on
 * 2 and 3 November 2026.
 *
 * LICENCES, which matter if the film is ever sold or shown commercially:
 *   - Depth Anything V2 SMALL is Apache-2.0. BASE and LARGE are CC-BY-NC-4.0: NON-COMMERCIAL use only (the model
 *     authors' own README; the ONNX exports by fabio-sim are MIT, but the weights inside keep the model's licence).
 *   - BiRefNet (matting) is MIT, YOLOX (finding people) Apache-2.0, LaMa (painting the plate) Apache-2.0.
 * "fast" quality uses only the permissive ones; "best" uses Depth Anything LARGE, so it is non-commercial.
 */
import os from "node:os";
import path from "node:path";

const RELEASE = "https://github.com/fabio-sim/Depth-Anything-ONNX/releases/download/v2.0.0";

export const MODELS = {
  small: {
    file: "depth_anything_v2_vits.onnx",
    url: `${RELEASE}/depth_anything_v2_vits.onnx`,
    bytes: 99373606,
    sha256: "d2b11a11c1d4a12b47608fa65a17ee9a4c605b55ee1730c8e3b526304f2562be",
    note: "fastest, softest; the model the film's own depth tool uses",
    license: "Apache-2.0",
  },
  base: {
    file: "depth_anything_v2_vitb.onnx",
    url: `${RELEASE}/depth_anything_v2_vitb.onnx`,
    bytes: 389230102,
    sha256: "189366194b51f0207c7198b17e108053e131d69ddb2c6b5c9efabae806606e17",
    note: "good all-round choice (default)",
    license: "CC-BY-NC-4.0 (non-commercial)",
  },
  large: {
    file: "depth_anything_v2_vitl.onnx",
    url: `${RELEASE}/depth_anything_v2_vitl.onnx`,
    bytes: 1337368922,
    sha256: "36ab02ffa2094c74e00ec3fd85ca6641811a91ac4f494a5812d193a3764a359b",
    note: "most detail; a 1.3 GB download, a few seconds a picture on a GPU",
    license: "CC-BY-NC-4.0 (non-commercial)",
  },
};

export const DEFAULT_MODEL = "base";

const DEPTH_SOURCE = "https://github.com/DepthAnything/Depth-Anything-V2";

/** Everything the buttons can download, by id. `role` says what it is for; `source` is its home page. */
export const ALL_MODELS = {
  "depth-small": { ...MODELS.small, role: "depth", title: "Depth Anything V2 Small", source: DEPTH_SOURCE },
  "depth-base": { ...MODELS.base, role: "depth", title: "Depth Anything V2 Base", source: DEPTH_SOURCE },
  "depth-large": { ...MODELS.large, role: "depth", title: "Depth Anything V2 Large", source: DEPTH_SOURCE },
  people: {
    role: "people",
    title: "YOLOX-X",
    file: "yolox_x.onnx",
    url: "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_x.onnx",
    bytes: 396142663,
    sha256: "c892d7aaf1c4746d8a4d675bec669a4db4f434b4ee1efb654bc9b353379c7c55",
    note: "finds the people in the picture (found 95% of the film's hand-drawn boxes; the film's old U2-Net found 86%)",
    license: "Apache-2.0",
    source: "https://github.com/Megvii-BaseDetection/YOLOX",
  },
  "matte-best": {
    role: "matte",
    title: "BiRefNet general (full)",
    file: "BiRefNet-general-epoch_244.onnx",
    url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-epoch_244.onnx",
    bytes: 972666916,
    sha256: "58f621f00f5d756097615970a88a791584600dcf7c45b18a0a6267535a1ebd3c",
    note: "cuts each person out with fine edges (hair, glass); about 50 s a person on a CPU, a second or two on a GPU",
    license: "MIT",
    source: "https://github.com/ZhengPeng7/BiRefNet",
  },
  "matte-lite": {
    role: "matte",
    title: "BiRefNet general (light)",
    file: "BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx",
    url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx",
    bytes: 224005088,
    sha256: "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333",
    note: "the same model with a smaller backbone (what the film's own tool uses); nearly as good, a quarter of the size",
    license: "MIT",
    source: "https://github.com/ZhengPeng7/BiRefNet",
  },
  inpaint: {
    role: "inpaint",
    title: "LaMa",
    file: "inpainting_lama_2025jan.onnx",
    url: "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/inpainting_lama/inpainting_lama_2025jan.onnx",
    bytes: 92591623,
    sha256: "7df918ac3921d3daf0aae1d219776cf0dc4e4935f035af81841b40adcf74fdf2",
    note: "paints in what was behind each person, for the plate that shows as they move",
    license: "Apache-2.0",
    source: "https://github.com/advimman/lama",
  },
};

/** "best" uses the largest models (a GPU makes them quick); "fast" the small, permissively licensed ones. */
export const QUALITIES = {
  best: { depth: "depth-large", matte: "matte-best", people: "people", inpaint: "inpaint" },
  fast: { depth: "depth-small", matte: "matte-lite", people: "people", inpaint: "inpaint" },
};
export const DEFAULT_QUALITY = "best";

/** The model ids a job needs at this quality: just the depth model for a depth map, all four for cut-outs. */
export function modelIdsFor(quality, job) {
  const set = QUALITIES[quality];
  if (!set) throw new Error(`Unknown quality "${quality}". Choose best or fast.`);
  return job === "depth" ? [set.depth] : [set.people, set.matte, set.inpaint, set.depth];
}

/** Where downloaded models are kept: not in the repository, one copy for every checkout. */
export function modelCacheDir({ env = process.env, platform = process.platform, homedir = os.homedir() } = {}) {
  const override = env.SCARLET_KEYFRAME_MODELS?.trim();
  if (override) return path.resolve(override);
  if (platform === "win32") {
    return path.join(env.LOCALAPPDATA?.trim() || path.join(homedir, "AppData", "Local"), "scarlet-keyframe", "models");
  }
  if (platform === "darwin") return path.join(homedir, "Library", "Caches", "scarlet-keyframe", "models");
  return path.join(env.XDG_CACHE_HOME?.trim() || path.join(homedir, ".cache"), "scarlet-keyframe", "models");
}
