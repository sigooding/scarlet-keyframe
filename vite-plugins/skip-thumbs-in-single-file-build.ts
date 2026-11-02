import fs from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/** The derived folder `npm run thumbs` writes (see scripts/make-thumbs.mjs). */
const THUMBS_FOLDER = "thumbs";

/**
 * Keeps the derived thumbnails out of the single-file build.
 *
 * `npm run build` produces `dist/index.html`, a page designed to be opened from
 * disk; on a `file:` page `src/core/thumbs.ts` always answers with the original
 * picture, so the `public/thumbs/` copies (tens of megabytes) can never be used
 * there. Vite copies the whole `publicDir` before bundling and has no per-file
 * filter, so this removes that one folder again once the build is written.
 *
 * `npm run serve` (mode "serve") does not copy `public/` at all and is not
 * affected; `public/` itself is never modified.
 */
export function skipThumbsInSingleFileBuild(): Plugin {
  let outDir = "";
  return {
    name: "scarlet-skip-thumbs-in-single-file-build",
    apply: "build",
    configResolved(config: ResolvedConfig) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!outDir) return;
      const thumbsDir = path.join(outDir, THUMBS_FOLDER);
      // Only ever inside the build output, and only if it really is the folder
      // the thumbnail script writes (an index.json plus picture files).
      if (!fs.existsSync(path.join(thumbsDir, "index.json"))) return;
      fs.rmSync(thumbsDir, { recursive: true, force: true });
      this.info?.(
        `thumbs: skipped public/${THUMBS_FOLDER}/ in the single-file build (a file: page uses the originals)`,
      );
    },
  };
}
