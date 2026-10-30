import fs from "node:fs";
import { chromium } from "playwright";

export const GPU_WEBGL_ARGS = [
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-gpu-rasterization",
  "--enable-zero-copy",
  "--enable-accelerated-2d-canvas",
  "--enable-webgl",
  "--force_high_performance_gpu",
  "--enable-unsafe-swiftshader",
  "--autoplay-policy=no-user-gesture-required",
  "--hide-scrollbars",
];

export const SWIFTSHADER_WEBGL_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--autoplay-policy=no-user-gesture-required",
  "--hide-scrollbars",
];

function errorSummary(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/).find((line) => line.trim())?.trim() || "Unknown error";
}

function isMissingExecutableError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /executable doesn't exist|not found|is not installed|cannot find|enoent|no such file/i.test(message);
}

export function isSoftwareWebglRenderer(renderer) {
  if (!renderer || typeof renderer !== "string") return true;
  return /swiftshader|llvmpipe|softpipe|lavapipe|basic render driver|software/i.test(renderer);
}

function attachLauncherMetadata(fn, { label, mode, options }) {
  fn.browserLabel = label;
  fn.mode = mode;
  fn.gpuAccelerated = mode === "gpu";
  fn.launchOptions = options;
  return fn;
}

/**
 * Probe once and reuse the selected launch options for all render workers.
 * When `gpu` is enabled (default), prefers hardware GPU WebGL, 2D canvas, and OOP
 * rasterization across full Chromium/Chrome/Edge installs, automatically falling back
 * to SwiftShader software rendering if hardware GPU initialization is unavailable.
 * The @sparticuz/chromium npm binary is Linux x64 only, never a Windows or macOS fallback.
 */
export async function prepareChromiumLauncher({
  browserType = chromium,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  exists = fs.existsSync,
  loadSparticuz = () => import("@sparticuz/chromium"),
  gpu = true,
} = {}) {
  const failures = [];
  const probe = async (label, options, mode = "software") => {
    try {
      const browser = await browserType.launch(options);
      await browser.close();
      return {
        launcher: attachLauncherMetadata(() => browserType.launch(options), { label, mode, options }),
        error: null,
      };
    } catch (error) {
      failures.push(`${label}: ${errorSummary(error)}`);
      return { launcher: null, error };
    }
  };

  const gpuOptions = (extra = {}) => ({
    headless: true,
    args: [...GPU_WEBGL_ARGS],
    env: { ...env },
    ...extra,
  });

  const softwareOptions = (extra = {}) => ({
    headless: true,
    args: [...SWIFTSHADER_WEBGL_ARGS],
    env: { ...env },
    ...extra,
  });

  const explicitPath = env.PLAYWRIGHT_CHROMIUM_PATH?.trim();
  if (explicitPath) {
    if (!exists(explicitPath)) {
      throw new Error(
        `PLAYWRIGHT_CHROMIUM_PATH does not exist: ${explicitPath}. Set it to a browser executable or clear it to use automatic detection, then restart the export server.`,
      );
    }
    if (gpu) {
      const gpuAttempt = await probe(
        "PLAYWRIGHT_CHROMIUM_PATH",
        gpuOptions({ executablePath: explicitPath }),
        "gpu",
      );
      if (gpuAttempt.launcher) return gpuAttempt.launcher;
      if (!isMissingExecutableError(gpuAttempt.error)) {
        const swAttempt = await probe(
          "PLAYWRIGHT_CHROMIUM_PATH (software fallback)",
          softwareOptions({ executablePath: explicitPath }),
          "software",
        );
        if (swAttempt.launcher) return swAttempt.launcher;
      }
    } else {
      const swAttempt = await probe(
        "PLAYWRIGHT_CHROMIUM_PATH",
        softwareOptions({ executablePath: explicitPath }),
        "software",
      );
      if (swAttempt.launcher) return swAttempt.launcher;
    }
    throw new Error(
      `Could not launch the browser specified by PLAYWRIGHT_CHROMIUM_PATH (${explicitPath}). ${failures[0]}. Check the executable or clear the variable and restart the export server.`,
    );
  }

  if (gpu) {
    // Full Chromium / Chrome / Edge binaries run Chromium's GPU-capable headless compositor,
    // followed by Playwright's headless shell if only the shell binary is installed.
    const candidates = [
      ["Playwright Chromium", { channel: "chromium" }],
      ["Google Chrome", { channel: "chrome" }],
      ["Microsoft Edge", { channel: "msedge" }],
      ["Playwright Chromium headless shell", {}],
    ];
    for (const [label, extra] of candidates) {
      const gpuAttempt = await probe(label, gpuOptions(extra), "gpu");
      if (gpuAttempt.launcher) return gpuAttempt.launcher;
      if (!isMissingExecutableError(gpuAttempt.error)) {
        const swAttempt = await probe(`${label} (software fallback)`, softwareOptions(extra), "software");
        if (swAttempt.launcher) return swAttempt.launcher;
      }
    }
  } else {
    const candidates = [
      ["Playwright Chromium headless shell", {}],
      ["Playwright Chromium", { channel: "chromium" }],
      ["Google Chrome", { channel: "chrome" }],
      ["Microsoft Edge", { channel: "msedge" }],
    ];
    for (const [label, extra] of candidates) {
      const swAttempt = await probe(label, softwareOptions(extra), "software");
      if (swAttempt.launcher) return swAttempt.launcher;
    }
  }

  if (platform === "linux" && arch === "x64") {
    try {
      // This makes Sparticuz prepare its Lambda-compatible fonts and shared libraries.
      env.AWS_LAMBDA_JS_RUNTIME ||= "nodejs22.x";
      const mod = await loadSparticuz();
      const sparticuz = mod.default ?? mod;
      const executablePath = await sparticuz.executablePath();
      const sparticuzOptions = {
        executablePath,
        headless: true,
        args: [...sparticuz.args, "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"],
        env: { ...env },
      };
      const attempt = await probe("Bundled Linux Chromium", sparticuzOptions, "software");
      if (attempt.launcher) return attempt.launcher;
    } catch (error) {
      failures.push(`Bundled Linux Chromium: ${errorSummary(error)}`);
    }
  }

  throw new Error([
    "No working Chromium browser was found for MP4 export.",
    "Install Microsoft Edge or Google Chrome, or run `npx playwright install chromium`.",
    "You can also set PLAYWRIGHT_CHROMIUM_PATH to a browser executable; restart the export server after changing it.",
    `Tried: ${failures.join("; ")}`,
  ].join(" "));
}
