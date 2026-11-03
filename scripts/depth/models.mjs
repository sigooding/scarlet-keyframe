/**
 * The Depth Anything V2 models `npm run depth` can use, as ONNX files.
 *
 * They are the MIT/Apache-licensed exports published by fabio-sim/Depth-Anything-ONNX (release v2.0.0), the same family
 * the film's own tools use (scarlett-witness `tools/make-depth-layers.py` takes the Small one). All three take a fixed
 * 518x518 picture. Each file is downloaded once into a cache folder, and its size and SHA-256 are checked, so a broken
 * or changed download is refused. The checksums are of the release files as downloaded on 2 November 2026.
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
  },
  base: {
    file: "depth_anything_v2_vitb.onnx",
    url: `${RELEASE}/depth_anything_v2_vitb.onnx`,
    bytes: 389230102,
    sha256: "189366194b51f0207c7198b17e108053e131d69ddb2c6b5c9efabae806606e17",
    note: "good all-round choice (default)",
  },
  large: {
    file: "depth_anything_v2_vitl.onnx",
    url: `${RELEASE}/depth_anything_v2_vitl.onnx`,
    bytes: 1337368922,
    sha256: "36ab02ffa2094c74e00ec3fd85ca6641811a91ac4f494a5812d193a3764a359b",
    note: "most detail; a 1.3 GB download, a few seconds a picture on a GPU",
  },
};

export const DEFAULT_MODEL = "base";

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
