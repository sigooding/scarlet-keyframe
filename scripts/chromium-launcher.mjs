import fs from "node:fs";
import { chromium } from "playwright";

const WEBGL_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--autoplay-policy=no-user-gesture-required",
  "--hide-scrollbars",
];

function errorSummary(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/).find(line => line.trim())?.trim() || "Unknown error";
}

/**
 * Probe once and reuse the selected launch options for all render workers.
 * The @sparticuz/chromium npm binary is Linux x64 only, never a Windows or macOS fallback.
 */
export async function prepareChromiumLauncher({
  browserType = chromium,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  exists = fs.existsSync,
  loadSparticuz = () => import("@sparticuz/chromium"),
} = {}) {
  const failures = [];
  const probe = async (label, options) => {
    try {
      const browser = await browserType.launch(options);
      await browser.close();
      return () => browserType.launch(options);
    } catch (error) {
      failures.push(`${label}: ${errorSummary(error)}`);
      return null;
    }
  };
  const commonOptions = () => ({ headless: true, args: [...WEBGL_ARGS], env: { ...env } });

  const explicitPath = env.PLAYWRIGHT_CHROMIUM_PATH?.trim();
  if (explicitPath) {
    if (!exists(explicitPath)) {
      throw new Error(
        `PLAYWRIGHT_CHROMIUM_PATH does not exist: ${explicitPath}. Set it to a browser executable or clear it to use automatic detection, then restart the export server.`,
      );
    }
    const launcher = await probe("PLAYWRIGHT_CHROMIUM_PATH", { ...commonOptions(), executablePath: explicitPath });
    if (launcher) return launcher;
    throw new Error(
      `Could not launch the browser specified by PLAYWRIGHT_CHROMIUM_PATH (${explicitPath}). ${failures[0]}. Check the executable or clear the variable and restart the export server.`,
    );
  }

  const bundled = await probe("Playwright Chromium headless shell", commonOptions());
  if (bundled) return bundled;
  // A full Playwright Chromium may be installed without the separate headless shell.
  const fullChromium = await probe("Playwright Chromium", { ...commonOptions(), channel: "chromium" });
  if (fullChromium) return fullChromium;

  // Playwright knows the standard Chrome and Edge locations, including per-user
  // installations on Windows. These channels also work on macOS and Linux.
  for (const [channel, label] of [["chrome", "Google Chrome"], ["msedge", "Microsoft Edge"]]) {
    const launcher = await probe(label, { ...commonOptions(), channel });
    if (launcher) return launcher;
  }

  if (platform === "linux" && arch === "x64") {
    try {
      // This makes Sparticuz prepare its Lambda-compatible fonts and shared libraries.
      env.AWS_LAMBDA_JS_RUNTIME ||= "nodejs22.x";
      const mod = await loadSparticuz();
      const sparticuz = mod.default ?? mod;
      const executablePath = await sparticuz.executablePath();
      const launcher = await probe("Bundled Linux Chromium", {
        executablePath,
        headless: true,
        args: [...sparticuz.args, "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"],
        env: { ...env },
      });
      if (launcher) return launcher;
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
