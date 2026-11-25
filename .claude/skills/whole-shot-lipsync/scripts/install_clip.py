#!/usr/bin/env python3
"""Puts one whole-shot lip-sync clip into the Festival Cut.

    python3 .claude/skills/whole-shot-lipsync/scripts/install_clip.py <track.mp3> <clip.mp4 or https URL> <slug>

<track.mp3> is the voice track made by shot-voice-track.ts (its <track>.json sidecar names the shot and its length).
The script checks that the clip's voice lines up with the track (loudness envelopes cross-correlated; a clip with no
sound is taken as in step), shifts it if it is early or late, conforms it to 1920x1080 at 24 fps and to the shot's
length plus half a second held on its last frame (a clip shorter than its shot would loop), writes
public/film/video/festival/lipsync-<slug>.mp4, and makes it the shot's video in src/data/festival-cut.json (videoShots;
any cutaway inserts on that shot are dropped). Then run `npm run build:festival-cut` and the festival tests.
"""
import json, os, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
track, clip, slug = sys.argv[1:4]
meta = json.load(open(f"{track}.json"))
beat, frames = meta["beatId"], int(meta["frames"])

if clip.startswith("http"):
    raw = os.path.join(tempfile.mkdtemp(), "clip.mp4")
    subprocess.run(["curl", "-sfL", "-o", raw, clip], check=True)
else:
    raw = clip

def probe(*args):
    return subprocess.check_output(["ffprobe", "-v", "error", *args, raw]).decode().strip()

def envelope(path):  # 10 ms loudness steps, log scale, mean removed
    pcm = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"])
    x = np.frombuffer(pcm, np.int16).astype(np.float32)
    n = len(x) // 80
    e = np.log(np.sqrt((x[: n * 80].reshape(n, 80) ** 2).mean(1) + 1e-6))
    return e - e.mean()

dur = float(probe("-show_entries", "format=duration", "-of", "csv=p=0"))
lag = 0
if probe("-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0"):
    a, b = envelope(track), envelope(raw)
    def score(l):  # positive l: the clip's voice is l steps late
        t0, t1 = max(0, -l), min(len(a), len(b) - l)
        return float(np.dot(a[t0:t1], b[t0 + l : t1 + l]) / max(1, t1 - t0))
    lags = list(range(-30, 31))
    lag = lags[int(np.argmax([score(l) for l in lags]))] * 10  # ms

extra = 12  # held past the shot's end so the player never runs out of clip
T = frames / 24
shift = max(0.0, lag / 1000)
lead = max(0.0, -lag / 1000)
pad = max(0.0, T + extra / 24 - (dur - shift + lead)) + 0.1
name = f"lipsync-{slug}"
out = f"{ROOT}/public/film/video/festival/{name}.mp4"
vf = (f"trim=start={shift:.3f},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,"
      f"crop=1920:1080,fps=24,tpad=start_mode=clone:start_duration={lead:.3f}:stop_mode=clone:stop_duration={pad:.3f}")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-an", "-vf", vf, "-frames:v", str(frames + extra), "-c:v", "libx264",
                "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], check=True)

F = f"{ROOT}/src/data/festival-cut.json"
data = json.load(open(F, encoding="utf-8"))
data["inserts"] = [i for i in data.get("inserts", []) if i["beatId"] != beat]
data.setdefault("videoShots", {})[beat] = f"/film/video/festival/{name}.mp4"
with open(F, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
print(f"{beat}: clip {dur:.2f}s for a {T:.2f}s shot, voice offset {lag:+d} ms -> {name}.mp4 ({frames} + {extra} frames)")
