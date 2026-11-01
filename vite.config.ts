import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { mediaLibraryPlugin } from "./vite-plugins/media-library";
import { mp4ExportApiPlugin } from "./vite-plugins/mp4-export-api";
import { publicPreviewAssetsPlugin } from "./vite-plugins/public-preview-assets";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * `npm run serve` builds with `--mode serve` and then runs `vite preview`:
 * a normal multi-file production build in `dist-local/`, with `public/` served
 * from the repository instead of copied, and the MP4 export API enabled.
 * The ordinary `npm run build` (no mode) keeps producing the single file.
 */
const LOCAL_SERVE_MODE = "serve";

const DEV_PORT = 5173;
const PREVIEW_PORT = 4173;

/**
 * The app runs on the user's own machine, so it binds 127.0.0.1 and never
 * wanders to another port: a different port is a different browser origin, and
 * IndexedDB saves are per origin. Override only when a sandbox or CI needs it.
 */
const HOST = process.env.SCARLET_KEYFRAME_HOST?.trim() || "127.0.0.1";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isLocalServe = mode === LOCAL_SERVE_MODE;

  return {
    plugins: [
      mp4ExportApiPlugin({ repoRoot: __dirname }),
      // Serves public/ from the repository on `npm run serve` (no copy).
      ...(isLocalServe ? [publicPreviewAssetsPlugin({ publicDir: path.join(__dirname, "public") })] : []),
      // Fallback for media outside public/ (Nobody's Witness), dev and preview.
      mediaLibraryPlugin({ repoRoot: __dirname }),
      react(),
      tailwindcss(),
      // The single-file page stays the default build; `npm run serve` opts out.
      ...(isLocalServe ? [] : [viteSingleFile()]),
    ],
    server: {
      host: HOST,
      port: DEV_PORT,
      strictPort: true,
      allowedHosts: true,
    },
    preview: {
      host: HOST,
      port: PREVIEW_PORT,
      strictPort: true,
      allowedHosts: true,
    },
    build: isLocalServe
      ? {
          outDir: "dist-local",
          // 1.7 GB of film media stays in public/ and is served from there.
          copyPublicDir: false,
          // Imported pictures stay real files instead of base64 data URLs.
          assetsInlineLimit: 4096,
        }
      : {},
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
