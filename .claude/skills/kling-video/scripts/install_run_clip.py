#!/usr/bin/env python3
"""Lays ONE clip across a run of neighbouring Festival Cut shots that show the same picture, so the run plays as one
continuous take (the user's rule: merge same-picture shots before making video).

    python3 .claude/skills/kling-video/scripts/install_run_clip.py <clip.mp4 or URL> <slug> <beatId> <beatId> [...] [--start S] [--lipsync <track.mp3>]

shot-info.ts lists a shot's run (sameRun) and its length (runFrames, runGenerateSeconds): generate one clip that long
from the picture, then install it here with the run's beat ids in order. The clip is cut at the shots' exact frame
boundaries, at its real speed (no stretching). Each piece is 1920x1080 at 24 fps, carries 12 more frames past its shot
(the clip's own next frames where it has them, else a hold), keeps the clip's sound in step, and becomes its shot's video:
public/film/video/festival/<slug>-<n>.mp4 in videoShots.
--start S   skips the clip's first S seconds.
--lipsync   for a lip-sync clip made from one track over the whole run (the shots' tracks joined): the pieces are named
            lipsync-<slug>-<n>.mp4, carry no sound (the film plays its own voices), and their line timings are recorded
            for the sync guard (lipsync-timings.ts).
A shot already split into pieces is refused.
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
argv = sys.argv[1:]
opts = {k: argv[argv.index(k) + 1] for k in ("--start", "--lipsync") if k in argv}
args = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] not in ("--start", "--lipsync"))]
clip, slug, beats = args[0], args[1], args[2:]
if len(beats) < 2:
    sys.exit("give the run's beat ids, at least two (shot-info.ts sameRun)")
start = float(opts.get("--start", 0))
lipsync = "--lipsync" in opts

info = json.loads(subprocess.check_output(
    ["npx", "vite-node", ".claude/skills/kling-video/scripts/shot-info.ts", *beats], cwd=ROOT).decode())
for i in info:
    if "error" in i:
        sys.exit(f"{i['id']}: {i['error']}")
    if i["split"]:
        sys.exit(f"{i['id']} is split into pieces: not for a run clip")
run = info[0].get("sameRun", [])
if run != beats:
    sys.exit(f"{beats} isn't the whole same-picture run: shot-info gives {run}")
frames = [int(i["frames"]) for i in info]

if clip.startswith("http"):
    raw = os.path.join(tempfile.mkdtemp(), "clip.mp4")
    subprocess.run(["curl", "-sfL", "-o", raw, clip], check=True)
else:
    raw = clip
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw]))
sound = (not lipsync) and subprocess.check_output(
    ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", raw]).strip() != b""
total = sum(frames) / 24
print(f"clip {dur:.2f}s from {start:.2f}s for a {total:.2f}s run of {len(beats)} shots"
      + ("" if dur - start >= total else f"  (short by {total - (dur - start):.2f}s: the last shot holds its final frame)"))

F = f"{ROOT}/src/data/festival-cut.json"
data = json.load(open(F, encoding="utf-8"))
offset = start
for n, (beat, fr) in enumerate(zip(beats, frames), 1):
    name = f"lipsync-{slug}-{n}" if lipsync else f"{slug}-{n}"
    out = f"{ROOT}/public/film/video/festival/{name}.mp4"
    length = (fr + 12) / 24
    vf = (f"trim=start={offset:.4f},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,"
          f"crop=1920:1080,fps=24,tpad=stop_mode=clone:stop_duration={length + 0.2:.3f}")
    audio = (["-af", f"atrim=start={offset:.4f},asetpts=PTS-STARTPTS,apad,atrim=0:{length:.4f}", "-c:a", "aac", "-b:a", "160k"]
             if sound else ["-an"])
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-vf", vf, "-frames:v", str(fr + 12), "-c:v", "libx264",
                    "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", *audio, "-movflags", "+faststart", out], check=True)
    data.setdefault("videoShots", {})[beat] = f"/film/video/festival/{name}.mp4"
    print(f"{beat}: {fr} frames from {offset:.2f}s of the clip -> {name}.mp4" + ("; sound kept" if sound else ""))
    offset += fr / 24
with open(F, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
if lipsync:
    subprocess.run(["npx", "vite-node", ".claude/skills/whole-shot-lipsync/scripts/lipsync-timings.ts", "--write",
                    *[f"/film/video/festival/lipsync-{slug}-{n}.mp4" for n in range(1, len(beats) + 1)]], cwd=ROOT, check=True)
