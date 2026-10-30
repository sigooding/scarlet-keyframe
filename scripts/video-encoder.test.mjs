import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { parseCliArgs } from "./export-mp4.mjs";
import {
  buildSegmentEncodeArgs,
  clampExportWorkers,
  MAX_EXPORT_WORKERS,
  makeSoftwareEncoderPlan,
  normalizeRequestedEncoder,
  parseAvailableEncoders,
  resolveFfmpegBinary,
  selectVideoEncoder,
} from "./video-encoder.mjs";

const SAMPLE_ENCODERS_OUT = `
Encoders:
 V..... = Video
 A..... = Audio
 ------
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)
 V..... h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)
 V..... h264_amf             AMD AMF H.264 Encoder (codec h264)
 V..... h264_qsv             H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (Intel Quick Sync Video acceleration) (codec h264)
 V..... h264_videotoolbox    VideoToolbox H.264 Encoder (codec h264)
 V..... h264_vaapi           H.264/AVC (VAAPI) (codec h264)
`;

function makeMockAsyncSpawner(maxAllowedConcurrent = Infinity) {
  let active = 0;
  return vi.fn(() => {
    const proc = new EventEmitter();
    proc.stdin = new EventEmitter();
    active += 1;
    const tooMany = active > maxAllowedConcurrent;
    proc.stdin.end = () => {
      setTimeout(() => {
        active = Math.max(0, active - 1);
        proc.emit("close", tooMany ? 1 : 0);
      }, 2);
    };
    proc.kill = () => {
      active = Math.max(0, active - 1);
      proc.emit("close", 137);
    };
    return proc;
  });
}

describe("MP4 export GPU video encoder selection & up to 6 workers", () => {
  it("supports up to 6 workers and clamps out-of-range worker counts", () => {
    expect(MAX_EXPORT_WORKERS).toBe(6);
    expect(clampExportWorkers(1)).toBe(1);
    expect(clampExportWorkers(4)).toBe(4);
    expect(clampExportWorkers(5)).toBe(5);
    expect(clampExportWorkers(6)).toBe(6);
    expect(clampExportWorkers(8)).toBe(6);
    expect(clampExportWorkers(0)).toBe(1);
    expect(clampExportWorkers(NaN)).toBe(1);
  });

  it("parses CLI --workers (1..6), --gpu / --no-gpu, and --encoder flags", () => {
    const defaults = parseCliArgs([]);
    expect(defaults.workers).toBe(1);
    expect(defaults.gpu).toBe(true);
    expect(defaults.encoder).toBe("auto");

    const sixGpu = parseCliArgs(["--workers", "6", "--gpu", "--encoder", "nvenc"]);
    expect(sixGpu.workers).toBe(6);
    expect(sixGpu.gpu).toBe(true);
    expect(sixGpu.encoder).toBe("h264_nvenc");

    const clamped = parseCliArgs(["--workers=10", "--no-gpu", "--encoder=libx264"]);
    expect(clamped.workers).toBe(6);
    expect(clamped.gpu).toBe(false);
    expect(clamped.encoder).toBe("libx264");

    expect(() => parseCliArgs(["--workers", "0"])).toThrow(/Invalid --workers count/);
    expect(() => parseCliArgs(["--encoder", "bogus"])).toThrow(/Invalid --encoder/);
  });

  it("normalizes requested encoder aliases cleanly", () => {
    expect(normalizeRequestedEncoder("auto")).toBe("auto");
    expect(normalizeRequestedEncoder("nvenc")).toBe("h264_nvenc");
    expect(normalizeRequestedEncoder("videotoolbox")).toBe("h264_videotoolbox");
    expect(normalizeRequestedEncoder("amf")).toBe("h264_amf");
    expect(normalizeRequestedEncoder("qsv")).toBe("h264_qsv");
    expect(normalizeRequestedEncoder("vaapi")).toBe("h264_vaapi");
    expect(normalizeRequestedEncoder("cpu")).toBe("libx264");
  });

  it("parses compiled FFmpeg video encoders accurately", () => {
    const set = parseAvailableEncoders(SAMPLE_ENCODERS_OUT);
    expect([...set]).toEqual([
      "libx264",
      "h264_nvenc",
      "h264_amf",
      "h264_qsv",
      "h264_videotoolbox",
      "h264_vaapi",
    ]);
  });

  it("discovers WinGet / Homebrew ffmpeg before @ffmpeg-installer when PATH lacks ffmpeg", async () => {
    const wingetPath = "C:\\Users\\Scott\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe";
    const spawnSyncFn = vi.fn((bin) => ({ status: bin === wingetPath ? 0 : 1 }));
    const resolved = await resolveFfmpegBinary({
      platform: "win32",
      env: { LOCALAPPDATA: "C:\\Users\\Scott\\AppData\\Local" },
      exists: (p) => p === wingetPath,
      spawnSyncFn,
      loadInstaller: vi.fn(),
    });
    expect(resolved).toBe(wingetPath);
  });

  it("selects NVIDIA NVENC on Windows when available and supports 6 concurrent workers", async () => {
    const spawnSyncFn = vi.fn((_bin, args) => {
      if (args.includes("-encoders")) {
        return { status: 0, stdout: Buffer.from(SAMPLE_ENCODERS_OUT) };
      }
      return { status: args.includes("h264_nvenc") ? 0 : 1, stderr: Buffer.from("") };
    });
    const plan = await selectVideoEncoder({
      ffmpegBin: "ffmpeg",
      gpu: true,
      workers: 6,
      platform: "win32",
      spawnSyncFn,
      spawnFn: makeMockAsyncSpawner(8),
    });
    expect(plan.id).toBe("h264_nvenc");
    expect(plan.hardware).toBe(true);
    expect(plan.maxConcurrentSessions).toBe(6);
    expect(plan.outputArgs).toEqual(expect.arrayContaining(["-c:v", "h264_nvenc", "-preset", "p4"]));
  });

  it("falls back to legacy NVENC -preset fast when an older FFmpeg rejects p4", async () => {
    const spawnSyncFn = vi.fn((_bin, args) => {
      if (args.includes("-encoders")) {
        return { status: 0, stdout: Buffer.from(SAMPLE_ENCODERS_OUT) };
      }
      if (args.includes("h264_nvenc") && args.includes("p4")) {
        return { status: 1, stderr: Buffer.from("Undefined constant or missing '(' in 'p4'") };
      }
      return { status: args.includes("h264_nvenc") ? 0 : 1, stderr: Buffer.from("") };
    });
    const plan = await selectVideoEncoder({
      ffmpegBin: "ffmpeg",
      gpu: true,
      workers: 4,
      platform: "win32",
      spawnSyncFn,
      spawnFn: makeMockAsyncSpawner(6),
    });
    expect(plan.id).toBe("h264_nvenc");
    expect(plan.outputArgs).toEqual(expect.arrayContaining(["-c:v", "h264_nvenc", "-preset", "fast"]));
  });

  it("falls back from NVENC to AMD AMF on Windows when NVENC hardware is absent", async () => {
    const spawnSyncFn = vi.fn((_bin, args) => {
      if (args.includes("-encoders")) {
        return { status: 0, stdout: Buffer.from(SAMPLE_ENCODERS_OUT) };
      }
      if (args.includes("h264_nvenc")) {
        return { status: 1, stderr: Buffer.from("Cannot load nvcuda.dll") };
      }
      if (args.includes("h264_amf")) {
        return { status: 0, stderr: Buffer.from("") };
      }
      return { status: 1, stderr: Buffer.from("unavailable") };
    });
    const plan = await selectVideoEncoder({
      ffmpegBin: "ffmpeg",
      gpu: true,
      workers: 6,
      platform: "win32",
      spawnSyncFn,
      spawnFn: makeMockAsyncSpawner(6),
    });
    expect(plan.id).toBe("h264_amf");
    expect(plan.hardware).toBe(true);
    expect(plan.maxConcurrentSessions).toBe(6);
  });

  it("caps maxConcurrentSessions cleanly when a GPU driver limits concurrent sessions below 6", async () => {
    const spawnSyncFn = vi.fn((_bin, args) => {
      if (args.includes("-encoders")) {
        return { status: 0, stdout: Buffer.from(SAMPLE_ENCODERS_OUT) };
      }
      return { status: args.includes("h264_nvenc") ? 0 : 1, stderr: Buffer.from("") };
    });
    const plan = await selectVideoEncoder({
      ffmpegBin: "ffmpeg",
      gpu: true,
      workers: 6,
      platform: "win32",
      spawnSyncFn,
      spawnFn: makeMockAsyncSpawner(3),
    });
    expect(plan.id).toBe("h264_nvenc");
    expect(plan.hardware).toBe(true);
    expect(plan.maxConcurrentSessions).toBe(3);
  });

  it("selects Apple VideoToolbox on macOS and VAAPI on Linux when device is present", async () => {
    const macSpawn = vi.fn((_bin, args) => {
      if (args.includes("-encoders")) {
        return { status: 0, stdout: Buffer.from(SAMPLE_ENCODERS_OUT) };
      }
      return { status: args.includes("h264_videotoolbox") ? 0 : 1, stderr: Buffer.from("") };
    });
    const macPlan = await selectVideoEncoder({
      ffmpegBin: "ffmpeg",
      gpu: true,
      workers: 6,
      platform: "darwin",
      spawnSyncFn: macSpawn,
      spawnFn: makeMockAsyncSpawner(6),
    });
    expect(macPlan.id).toBe("h264_videotoolbox");
    expect(macPlan.hardware).toBe(true);

    const linuxSpawn = vi.fn((_bin, args) => {
      if (args.includes("-encoders")) {
        return { status: 0, stdout: Buffer.from(SAMPLE_ENCODERS_OUT) };
      }
      return { status: args.includes("h264_vaapi") ? 0 : 1, stderr: Buffer.from("") };
    });
    const linuxPlan = await selectVideoEncoder({
      ffmpegBin: "ffmpeg",
      gpu: true,
      workers: 4,
      platform: "linux",
      exists: (p) => p === "/dev/dri/renderD128",
      spawnSyncFn: linuxSpawn,
      spawnFn: makeMockAsyncSpawner(4),
    });
    expect(linuxPlan.id).toBe("h264_vaapi");
    expect(linuxPlan.preInputArgs).toEqual(["-vaapi_device", "/dev/dri/renderD128"]);
  });

  it("falls back to libx264 when gpu is false or when no hardware encoder initializes", async () => {
    const noGpuPlan = await selectVideoEncoder({
      ffmpegBin: "ffmpeg",
      gpu: false,
      workers: 6,
    });
    expect(noGpuPlan.id).toBe("libx264");
    expect(noGpuPlan.hardware).toBe(false);
    expect(noGpuPlan.maxConcurrentSessions).toBe(6);

    const headlessVmSpawn = vi.fn((_bin, args) => {
      if (args.includes("-encoders")) {
        return { status: 0, stdout: Buffer.from(SAMPLE_ENCODERS_OUT) };
      }
      return { status: 1, stderr: Buffer.from("no hardware device") };
    });
    const fallbackPlan = await selectVideoEncoder({
      ffmpegBin: "ffmpeg",
      gpu: true,
      workers: 6,
      platform: "linux",
      exists: () => false,
      spawnSyncFn: headlessVmSpawn,
    });
    expect(fallbackPlan.id).toBe("libx264");
    expect(fallbackPlan.hardware).toBe(false);
  });

  it("builds consistent segment FFmpeg arguments for streaming and staged sequence encodes", () => {
    const plan = makeSoftwareEncoderPlan("draft", 6);
    const pipeArgs = buildSegmentEncodeArgs({
      plan,
      quality: "draft",
      fps: 24,
      frameCount: 12,
      outPath: "/tmp/seg-000.mp4",
    });
    expect(pipeArgs).toEqual(
      expect.arrayContaining([
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-frames:v",
        "12",
        "-c:v",
        "libx264",
        "-video_track_timescale",
        "24",
        "/tmp/seg-000.mp4",
      ]),
    );

    const seqArgs = buildSegmentEncodeArgs({
      plan,
      quality: "master",
      fps: 24,
      frameCount: 12,
      outPath: "/tmp/seg-001.mp4",
      sequencePattern: "/tmp/frames/frame-%06d.png",
    });
    expect(seqArgs).toEqual(
      expect.arrayContaining([
        "-framerate",
        "24",
        "-i",
        "/tmp/frames/frame-%06d.png",
        "-frames:v",
        "12",
        "-video_track_timescale",
        "24",
        "/tmp/seg-001.mp4",
      ]),
    );
  });
});
