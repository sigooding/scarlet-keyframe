#!/usr/bin/env python3
"""Lays one two-shot clip over two consecutive Festival Cut shots: the first half over the first, the second over the
second, so the action carries across the cut.

    python3 .claude/skills/kling-video/scripts/install_transition_clip.py <beatA> <beatB> <clip.mp4 or URL> <slug>

The clip is made from shot A's picture as the start frame and shot B's as the end frame, with a hard cut asked for at
the seam (see SKILL.md). This finds that cut (a scene change near where the seam should fall; if there is none, it
splits in proportion to the two shots' lengths), fits each half exactly to its shot's length (a small speed change,
reported), holds each half's last frame for 12 more frames (a clip shorter than its shot would loop), writes
public/film/video/festival/<slug>-a.mp4 and -b.mp4 and makes them the two shots' videos (videoShots).
The clip's own sound, if it has any, stays in each half, cut and sped up or slowed with the picture so it stays in sync.
The film plays its clips muted, so it is only kept to hand for when it beats the film's own effects (see "Sound" in SKILL.md).
"""
import json, os, re, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
beat_a, beat_b, clip, slug = sys.argv[1:5]

info = json.loads(subprocess.check_output(
    ["npx", "vite-node", ".claude/skills/kling-video/scripts/shot-info.ts", beat_a, beat_b], cwd=ROOT).decode())
for i in info:
    if "error" in i:
        sys.exit(f"{i['id']}: {i['error']}")
    if i["split"]:
        sys.exit(f"{i['id']} is split into pieces: not for a transition clip")
fa, fb = int(info[0]["frames"]), int(info[1]["frames"])

if clip.startswith("http"):
    raw = os.path.join(tempfile.mkdtemp(), "clip.mp4")
    subprocess.run(["curl", "-sfL", "-o", raw, clip], check=True)
else:
    raw = clip
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw]))
sound = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of",
                                 "csv=p=0", raw]).strip() != b""
expected = dur * fa / (fa + fb)
log = subprocess.run(["ffmpeg", "-hide_banner", "-i", raw, "-vf", "select='gt(scene,0.3)',showinfo", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
cuts = [float(t) for t in re.findall(r"pts_time:([0-9.]+)", log)]
near = [t for t in cuts if abs(t - expected) <= 1.0]
seam = min(near, key=lambda t: abs(t - expected)) if near else expected
print(f"clip {dur:.2f}s; cut {'found' if near else 'not found, splitting'} at {seam:.2f}s (the seam should be near {expected:.2f}s)")

data_file = f"{ROOT}/src/data/festival-cut.json"
data = json.load(open(data_file, encoding="utf-8"))
for beat, part, start, length, frames in ((beat_a, "a", 0.0, seam, fa), (beat_b, "b", seam, dur - seam, fb)):
    speed = length / (frames / 24)
    out = f"{ROOT}/public/film/video/festival/{slug}-{part}.mp4"
    vf = (f"trim=start={start:.3f}:duration={length:.3f},setpts=(PTS-STARTPTS)/{speed:.5f},"
          "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,fps=24,"
          "tpad=stop_mode=clone:stop_duration=1")
    audio = (["-af", f"atrim=start={start:.3f}:duration={length:.3f},asetpts=PTS-STARTPTS,atempo={speed:.5f},apad,"
                     f"atrim=0:{(frames + 12) / 24:.4f}", "-c:a", "aac", "-b:a", "160k"] if sound else ["-an"])
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-vf", vf, "-frames:v", str(frames + 12), "-c:v", "libx264",
                    "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", *audio, "-movflags", "+faststart", out], check=True)
    data.setdefault("videoShots", {})[beat] = f"/film/video/festival/{slug}-{part}.mp4"
    note = "" if 0.85 <= speed <= 1.15 else "  (more than 15% off real time: check it)"
    print(f"{beat}: {length:.2f}s of the clip played at {speed:.3f}x over {frames} frames -> {slug}-{part}.mp4{note}"
          + ("; its own sound kept, in sync" if sound else "; the clip has no sound"))
with open(data_file, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
