#!/usr/bin/env python3
"""Checks a lip-sync clip against its voice: do the lips rest in the silences, and do they move on time?

    <venv>/bin/python -I .claude/skills/whole-shot-lipsync/scripts/mouth_check.py <face_landmarker.task> <clip.mp4> [--track track.mp3]

It tracks the lips with MediaPipe's face landmarker. It measures how much the lips move from frame to frame
("articulation") while the voice speaks and while it is silent. The voice is the clip's own sound, or --track when the
clip has none. It prints one JSON line:
  ratio   how many times more the lips move in speech than in silence. 5 or more means the mouth rests in the silences.
  lag_ms  where the lip movement best lines up with the speech. Negative means the lips lead, which is natural
          (they shape a word just before it sounds). Within about +/-120 ms is in step.

One-time setup, in the scratchpad (not the repo):
  apt-get install -y libegl1 libgles2
  python3 -m venv <scratch>/venv && <scratch>/venv/bin/pip install mediapipe
  curl -sfL -o <scratch>/face_landmarker.task \\
    https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
"""
import json, subprocess, sys
import numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

args = [a for a in sys.argv[1:] if not a.startswith("--")]
model, clip = args[0], args[1]
track = sys.argv[sys.argv.index("--track") + 1] if "--track" in sys.argv else clip

cap = cv2.VideoCapture(clip)
fps = cap.get(cv2.CAP_PROP_FPS)
marker = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model), running_mode=vision.RunningMode.VIDEO, num_faces=1))
gap = []
while True:
    ok, frame = cap.read()
    if not ok:
        break
    found = marker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)),
                                    int(len(gap) * 1000 / fps))
    if found.face_landmarks:
        p = np.array([[q.x, q.y] for q in found.face_landmarks[0]])
        gap.append(np.linalg.norm(p[13] - p[14]) / np.linalg.norm(p[10] - p[152]))  # inner lips apart / face height
    else:
        gap.append(np.nan)
gap = np.array(gap)
n = len(gap)

pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", track, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                     capture_output=True).stdout
audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
if not audio.size or np.abs(audio).max() < 1e-4:
    sys.exit(json.dumps({"clip": clip, "error": "no voice to compare with: pass --track"}))
hop = 16000 / fps
db = np.array([20 * np.log10(np.sqrt(np.mean(audio[int(i * hop):int((i + 1) * hop)] ** 2) + 1e-12)) for i in range(n)])
speech = db > db.max() - 30

art = np.abs(np.diff(gap, prepend=gap[0]))
seen = ~np.isnan(art)
near_change = np.convolve(np.abs(np.diff(speech.astype(int), prepend=int(speech[0]))), np.ones(9), "same") > 0
talk, rest = art[speech & ~near_change & seen], art[~speech & ~near_change & seen]
env = np.convolve(np.nan_to_num(art), np.ones(3) / 3, "same")
env, sp = env - env.mean(), speech - speech.mean()
lags = range(-10, 11)
score = [np.sum(sp[max(0, -k):n - max(0, k)] * env[max(0, k):n - max(0, -k)]) for k in lags]
print(json.dumps({
    "clip": clip.split("/")[-1], "secs": round(n / fps, 1), "face_found": f"{seen.mean():.0%}",
    "speech_s": round(speech.sum() / fps, 1), "silence_s": round((~speech).sum() / fps, 1),
    "ratio": round(float(talk.mean() / max(rest.mean(), 1e-5)), 1) if talk.size and rest.size else None,
    "lag_ms": round(list(lags)[int(np.argmax(score))] * 1000 / fps),
}))
