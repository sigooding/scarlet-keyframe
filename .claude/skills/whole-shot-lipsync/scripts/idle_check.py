#!/usr/bin/env python3
"""Is the actor alive while listening? Head movement, eye movement, blinks and lips in a lip-sync clip's silences, against
the same while speaking.

    <venv>/bin/python -I .claude/skills/whole-shot-lipsync/scripts/idle_check.py <face_landmarker.task> <clip.mp4> <voice track>

The voice track tells speech from silence: the clip itself, if it came back with its sound, or the speaker-only track
(build it with --silent, since room tone would read as speech). Prints one JSON line. A frozen face shows head movement
near 0 deg/s and no eye movement. A listener mouthing words shows lip movement near the speaking figure. Same setup as
mouth_check.py.
"""
import json, math, subprocess, sys
import numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision
model = sys.argv[1]
def run(clip, track):
    lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=model),
         running_mode=vision.RunningMode.VIDEO, num_faces=1, output_face_blendshapes=True, output_facial_transformation_matrixes=True))
    cap = cv2.VideoCapture(clip); fps = cap.get(cv2.CAP_PROP_FPS); R = []; i = 0
    while True:
        ok, f = cap.read()
        if not ok: break
        r = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(f, cv2.COLOR_BGR2RGB)), int(i * 1000 / fps)); i += 1
        if not r.face_blendshapes: R.append([np.nan] * 7); continue
        b = {c.category_name: c.score for c in r.face_blendshapes[0]}; m = np.array(r.facial_transformation_matrixes[0])
        P = np.array([[q.x, q.y] for q in r.face_landmarks[0]])
        R.append([math.degrees(math.atan2(-m[1][2], m[2][2])), math.degrees(math.asin(max(-1, min(1, m[0][2])))), math.degrees(math.atan2(m[0][1], m[0][0])),
                  (b["eyeBlinkLeft"] + b["eyeBlinkRight"]) / 2, b["eyeLookOutLeft"] - b["eyeLookInLeft"] + b["eyeLookUpLeft"] - b["eyeLookDownLeft"],
                  np.linalg.norm(P[13] - P[14]) / np.linalg.norm(P[10] - P[152]), 0])
    R = np.array(R); n = len(R)
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", track, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True).stdout
    a = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768; hop = 16000 / fps
    db = np.array([20 * np.log10(np.sqrt(np.mean(w ** 2) + 1e-12)) if (w := a[int(k * hop):int((k + 1) * hop)]).size else -120 for k in range(n)])
    sp = db > db.max() - 30
    edge = np.convolve(np.abs(np.diff(sp.astype(int), prepend=int(sp[0]))), np.ones(9), "same") > 0
    out = {"clip": clip.split("scratchpad/")[-1]}
    for name, mask in (("listening", ~sp & ~edge), ("speaking", sp & ~edge)):
        idx = np.where(mask & ~np.isnan(R[:, 0]))[0]
        if len(idx) < 12: out[name] = None; continue
        secs = len(idx) / fps
        d = np.abs(np.diff(R[:, :3], axis=0))[np.clip(idx - 1, 0, n - 2)]
        blink = R[idx, 3] > 0.45; blinks = int(np.sum(blink[1:] & ~blink[:-1]))
        out[name] = {"secs": round(secs, 1), "head_deg_per_s": round(float(np.nanmean(d.sum(1)) * fps), 1),
                     "head_range_deg": round(float(np.nanmax(np.ptp(R[idx, :3], axis=0))), 1),
                     "blinks": blinks, "eye_moves_per_s": round(float(np.nanmean(np.abs(np.diff(R[idx, 4]))) * fps), 2),
                     "lips_moving": round(float(np.nanmean(np.abs(np.diff(R[idx, 5])))) * 1000, 2)}
    return out
pairs = sys.argv[2:]
for k in range(0, len(pairs), 2):
    print(json.dumps(run(pairs[k], pairs[k + 1])), flush=True)
