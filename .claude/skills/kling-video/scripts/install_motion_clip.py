#!/usr/bin/env python3
"""Puts one real-motion clip over a whole shot of the Festival Cut.

    python3 .claude/skills/kling-video/scripts/install_motion_clip.py <beatId> <clip.mp4 or https URL> <slug> [--start S]

Reads the shot's length from shot-info.ts, conforms the clip to 1920x1080 at 24 fps and to the shot's length plus half a
second held on its last frame (a clip shorter than its shot would loop), writes public/film/video/festival/<slug>.mp4 and
makes it the shot's video (videoShots in src/data/festival-cut.json).
The clip's own sound, if it has any, stays in the file, trimmed in step with the picture and padded with silence. The film
plays its clips muted, so this changes nothing you hear. It keeps the sound to hand for when it beats the film's own effects
(see "Sound" in SKILL.md).
--start skips the first S seconds of the clip (a model that only makes 5 s clips, used on a 3 s shot).
A shot already split into pieces is refused: lay a clip over one piece by hand, as an insert cut. So is a shot in a
same-picture run (shot-info's sameRun): the run gets one clip, through install_run_clip.py (--single overrides).
"""
import json, os, re, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
beat, clip, slug = args[:3]
start = float(sys.argv[sys.argv.index("--start") + 1]) if "--start" in sys.argv else 0.0

info = json.loads(subprocess.check_output(
    ["npx", "vite-node", ".claude/skills/kling-video/scripts/shot-info.ts", beat], cwd=ROOT).decode())[0]
if "error" in info:
    sys.exit(f"{beat}: {info['error']}")
if info["split"]:
    sys.exit(f"{beat} is split into pieces: lay the clip over one piece as an insert cut instead")
if len(info.get("sameRun", [])) > 1 and "--single" not in sys.argv:
    sys.exit(f"{beat} shares its picture with {', '.join(r for r in info['sameRun'] if r != beat)}: make ONE clip for the "
             f"whole run ({info['runGenerateSeconds']} s) and install it with install_run_clip.py <clip> <slug> "
             f"{' '.join(info['sameRun'])} (or pass --single to override)")
frames = int(info["frames"])

if clip.startswith("http"):
    raw = os.path.join(tempfile.mkdtemp(), "clip.mp4")
    subprocess.run(["curl", "-sfL", "-o", raw, clip], check=True)
else:
    raw = clip
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw]))
extra = 12
pad = max(0.0, frames / 24 + extra / 24 - (dur - start)) + 0.1
out = f"{ROOT}/public/film/video/festival/{slug}.mp4"
vf = (f"trim=start={start:.3f},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,"
      f"crop=1920:1080,fps=24,tpad=stop_mode=clone:stop_duration={pad:.3f}")
sound = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of",
                                 "csv=p=0", raw]).strip() != b""
total = (frames + extra) / 24
audio = (["-af", f"atrim=start={start:.3f},asetpts=PTS-STARTPTS,apad,atrim=0:{total:.4f}", "-c:a", "aac", "-b:a", "160k"]
         if sound else ["-an"])
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-vf", vf, "-frames:v", str(frames + extra), "-c:v", "libx264",
                "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", *audio, "-movflags", "+faststart", out], check=True)


def loudness(path):
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-vn", "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    found = re.findall(r"I:\s+(-?[0-9.]+|-inf) LUFS", log)
    return found[-1] if found else "?"

F = f"{ROOT}/src/data/festival-cut.json"
data = json.load(open(F, encoding="utf-8"))
data.setdefault("videoShots", {})[beat] = f"/film/video/festival/{slug}.mp4"
with open(F, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
held = max(0, frames - round((dur - start) * 24))
print(f"{beat}: {dur:.2f}s clip (from {start:.2f}s) for a {frames / 24:.2f}s shot -> {slug}.mp4, "
      f"{frames} + {extra} frames ({held} of them held on screen); "
      + (f"its own sound kept in the file ({loudness(out)} LUFS)" if sound else "the clip has no sound"))
