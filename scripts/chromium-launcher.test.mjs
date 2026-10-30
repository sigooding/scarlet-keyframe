import { describe, expect, it, vi } from "vitest";
import {
  GPU_WEBGL_ARGS,
  isSoftwareWebglRenderer,
  prepareChromiumLauncher,
  SWIFTSHADER_WEBGL_ARGS,
} from "./chromium-launcher.mjs";

function fakeBrowser(available) {
  const close = vi.fn().mockResolvedValue(undefined);
  const launch = vi.fn(async (options) => {
    const key = options.executablePath || options.channel || "playwright";
    if (!available.includes(key)) {
      throw new Error(`Executable doesn't exist for ${key}\nextra diagnostics`);
    }
    return { close };
  });
  return { browserType: { launch }, launch, close };
}

const noSparticuz = () =>
  vi.fn(async () => {
    throw new Error("Sparticuz should not have been loaded");
  });

describe("MP4 export Chromium selection & GPU acceleration", () => {
  it("enables hardware GPU flags by default and prefers full Playwright Chromium", async () => {
    const fake = fakeBrowser(["chromium", "playwright"]);
    const loadSparticuz = noSparticuz();
    const launchBrowser = await prepareChromiumLauncher({
      ...fake,
      env: {},
      platform: "win32",
      arch: "x64",
      loadSparticuz,
    });
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(launchBrowser.gpuAccelerated).toBe(true);
    expect(launchBrowser.mode).toBe("gpu");
    await launchBrowser();
    await launchBrowser();
    expect(fake.launch).toHaveBeenCalledTimes(3);
    expect(fake.launch.mock.calls.every(([o]) => o.channel === "chromium")).toBe(true);
    expect(fake.launch.mock.lastCall[0].args).toEqual(expect.arrayContaining(GPU_WEBGL_ARGS));
    expect(fake.launch.mock.lastCall[0].args).not.toContain("--use-angle=swiftshader");
    expect(loadSparticuz).not.toHaveBeenCalled();
  });

  it("uses Playwright headless shell when only the headless shell binary is installed", async () => {
    const fake = fakeBrowser(["playwright"]);
    const loadSparticuz = noSparticuz();
    const launchBrowser = await prepareChromiumLauncher({
      ...fake,
      env: {},
      platform: "win32",
      arch: "x64",
      loadSparticuz,
    });
    await launchBrowser();
    expect(fake.launch.mock.calls.map(([o]) => o.channel || "playwright")).toEqual([
      "chromium",
      "chrome",
      "msedge",
      "playwright",
      "playwright",
    ]);
    expect(launchBrowser.gpuAccelerated).toBe(true);
    expect(loadSparticuz).not.toHaveBeenCalled();
  });

  it("falls back to installed Edge on Windows with hardware GPU flags and without loading Linux Chromium", async () => {
    const fake = fakeBrowser(["msedge"]);
    const loadSparticuz = noSparticuz();
    const env = { LOCALAPPDATA: "C:\\Users\\Scott\\AppData\\Local" };
    const launchBrowser = await prepareChromiumLauncher({
      ...fake,
      env,
      platform: "win32",
      arch: "x64",
      loadSparticuz,
    });
    expect(fake.launch.mock.calls.map(([o]) => o.channel || "playwright")).toEqual([
      "chromium",
      "chrome",
      "msedge",
    ]);
    expect(fake.close).toHaveBeenCalledTimes(1);
    await launchBrowser();
    expect(fake.launch.mock.lastCall[0]).toMatchObject({ channel: "msedge", headless: true, env });
    expect(fake.launch.mock.lastCall[0].args).toContain("--enable-gpu-rasterization");
    expect(fake.launch.mock.lastCall[0].args).not.toContain("--use-angle=swiftshader");
    expect(launchBrowser.gpuAccelerated).toBe(true);
    expect(loadSparticuz).not.toHaveBeenCalled();
    expect(env).not.toHaveProperty("AWS_LAMBDA_JS_RUNTIME");
  });

  it("can use installed Chrome before Edge", async () => {
    const fake = fakeBrowser(["chrome"]);
    const loadSparticuz = noSparticuz();
    const launchBrowser = await prepareChromiumLauncher({
      ...fake,
      env: {},
      platform: "win32",
      arch: "x64",
      loadSparticuz,
    });
    await launchBrowser();
    expect(fake.launch.mock.calls.map(([o]) => o.channel || "playwright")).toEqual([
      "chromium",
      "chrome",
      "chrome",
    ]);
    expect(loadSparticuz).not.toHaveBeenCalled();
  });

  it("falls back to SwiftShader on an installed browser when GPU initialization fails at launch", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const launch = vi.fn(async (options) => {
      if (options.channel !== "msedge") {
        throw new Error(`Executable doesn't exist for ${options.channel || "playwright"}`);
      }
      if (!options.args.includes("--use-angle=swiftshader")) {
        throw new Error("GPU process exited unexpectedly: driver rejected D3D11");
      }
      return { close };
    });
    const launchBrowser = await prepareChromiumLauncher({
      browserType: { launch },
      env: {},
      platform: "win32",
      arch: "x64",
      loadSparticuz: noSparticuz(),
    });
    expect(launchBrowser.gpuAccelerated).toBe(false);
    expect(launchBrowser.mode).toBe("software");
    await launchBrowser();
    expect(launch.mock.lastCall[0].channel).toBe("msedge");
    expect(launch.mock.lastCall[0].args).toEqual(expect.arrayContaining(SWIFTSHADER_WEBGL_ARGS));
  });

  it("uses SwiftShader flags directly when gpu: false (--no-gpu)", async () => {
    const fake = fakeBrowser(["playwright"]);
    const loadSparticuz = noSparticuz();
    const launchBrowser = await prepareChromiumLauncher({
      ...fake,
      env: {},
      platform: "win32",
      arch: "x64",
      loadSparticuz,
      gpu: false,
    });
    expect(launchBrowser.gpuAccelerated).toBe(false);
    expect(launchBrowser.mode).toBe("software");
    await launchBrowser();
    expect(fake.launch.mock.lastCall[0].args).toContain("--use-angle=swiftshader");
  });

  it("honours a working explicit browser path, including Windows paths with spaces", async () => {
    const customPath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    const fake = fakeBrowser([customPath]);
    const exists = vi.fn().mockReturnValue(true);
    const loadSparticuz = noSparticuz();
    const launchBrowser = await prepareChromiumLauncher({
      ...fake,
      platform: "win32",
      arch: "x64",
      env: { PLAYWRIGHT_CHROMIUM_PATH: customPath },
      exists,
      loadSparticuz,
    });
    await launchBrowser();
    expect(exists).toHaveBeenCalledWith(customPath);
    expect(fake.launch.mock.calls.every(([o]) => o.executablePath === customPath)).toBe(true);
    expect(launchBrowser.gpuAccelerated).toBe(true);
    expect(loadSparticuz).not.toHaveBeenCalled();
  });

  it("reports a missing explicit path rather than silently ignoring it", async () => {
    const fake = fakeBrowser([]);
    await expect(
      prepareChromiumLauncher({
        ...fake,
        platform: "win32",
        arch: "x64",
        env: { PLAYWRIGHT_CHROMIUM_PATH: "C:\\missing\\chrome.exe" },
        exists: () => false,
      }),
    ).rejects.toThrow(/PLAYWRIGHT_CHROMIUM_PATH does not exist.*clear it/);
    expect(fake.launch).not.toHaveBeenCalled();
  });

  it("reports why an explicit browser could not launch without silently changing browsers", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const launch = vi.fn(async () => {
      throw new Error("C:\\broken.exe crashed immediately");
    });
    await expect(
      prepareChromiumLauncher({
        browserType: { launch },
        platform: "win32",
        arch: "x64",
        env: { PLAYWRIGHT_CHROMIUM_PATH: "C:\\broken.exe" },
        exists: () => true,
      }),
    ).rejects.toThrow(/Could not launch.*PLAYWRIGHT_CHROMIUM_PATH.*broken\.exe crashed immediately/);
    expect(close).not.toHaveBeenCalled();
  });

  it("extracts and probes the Linux x64 fallback once for all workers", async () => {
    const fake = fakeBrowser(["/tmp/chromium"]);
    const executablePath = vi.fn().mockResolvedValue("/tmp/chromium");
    const loadSparticuz = vi
      .fn()
      .mockResolvedValue({ default: { executablePath, args: ["--single-process"] } });
    const env = {};
    const launchBrowser = await prepareChromiumLauncher({
      ...fake,
      env,
      platform: "linux",
      arch: "x64",
      loadSparticuz,
    });
    expect(launchBrowser.gpuAccelerated).toBe(false);
    await launchBrowser();
    await launchBrowser();
    expect(loadSparticuz).toHaveBeenCalledTimes(1);
    expect(executablePath).toHaveBeenCalledTimes(1);
    expect(fake.launch.mock.calls.slice(-3).every(([o]) => o.executablePath === "/tmp/chromium")).toBe(true);
    expect(fake.launch.mock.lastCall[0].args).toContain("--single-process");
    expect(fake.launch.mock.lastCall[0].env.AWS_LAMBDA_JS_RUNTIME).toBe("nodejs22.x");
  });

  it.each([
    ["win32", "x64"],
    ["darwin", "arm64"],
    ["linux", "arm64"],
  ])(
    "does not use the Linux x64 binary on %s/%s, and gives installation guidance",
    async (platform, arch) => {
      const fake = fakeBrowser([]);
      const loadSparticuz = noSparticuz();
      await expect(
        prepareChromiumLauncher({ ...fake, env: {}, platform, arch, loadSparticuz }),
      ).rejects.toThrow(
        /No working Chromium browser.*npx playwright install chromium.*PLAYWRIGHT_CHROMIUM_PATH/,
      );
      expect(fake.launch).toHaveBeenCalledTimes(4);
      expect(loadSparticuz).not.toHaveBeenCalled();
    },
  );

  it("gives useful diagnostics if the Linux fallback cannot be launched", async () => {
    const fake = fakeBrowser([]);
    const loadSparticuz = vi.fn().mockRejectedValue(new Error("library extraction failed"));
    await expect(
      prepareChromiumLauncher({ ...fake, env: {}, platform: "linux", arch: "x64", loadSparticuz }),
    ).rejects.toThrow(/npx playwright install chromium.*Bundled Linux Chromium: library extraction failed/);
  });

  it("classifies hardware vs software WebGL renderer strings accurately", () => {
    expect(
      isSoftwareWebglRenderer(
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
      ),
    ).toBe(false);
    expect(
      isSoftwareWebglRenderer("ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Version 15.1)"),
    ).toBe(false);
    expect(isSoftwareWebglRenderer("AMD Radeon RX 7800 XT")).toBe(false);
    expect(
      isSoftwareWebglRenderer(
        "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
      ),
    ).toBe(true);
    expect(isSoftwareWebglRenderer("Mesa llvmpipe (LLVM 17.0.6, 256 bits)")).toBe(true);
    expect(isSoftwareWebglRenderer("ANGLE (Microsoft, Microsoft Basic Render Driver, D3D11)")).toBe(
      true,
    );
    expect(isSoftwareWebglRenderer("")).toBe(true);
  });
});
