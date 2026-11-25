#!/usr/bin/env python3
"""Shows where a lip-sync clip's actor looks down and tips their head, a quarter-second at a time, to see whether a
timed cue in the prompt ("at about 5 seconds she glances down…") landed.

    <venv>/bin/python -I .claude/skills/whole-shot-lipsync/scripts/cue_check.py <face_landmarker.task> <clip.mp4>

eyes-down is MediaPipe's eyeLookDown blendshape (0 to 1; above about 0.5 is a clear look down). pitch is the head's tilt
in degrees; it rises as the head tips down. A look down also reads as a half blink. Same setup as mouth_check.py.
"""
import math, sys
import numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

model, clip = sys.argv[1], sys.argv[2]
marker = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model), running_mode=vision.RunningMode.VIDEO, num_faces=1,
    output_face_blendshapes=True, output_facial_transformation_matrixes=True))
cap = cv2.VideoCapture(clip)
fps = cap.get(cv2.CAP_PROP_FPS)
rows, i = [], 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    found = marker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)),
                                    int(i * 1000 / fps))
    if found.face_blendshapes:
        b = {c.category_name: c.score for c in found.face_blendshapes[0]}
        m = np.array(found.facial_transformation_matrixes[0])
        rows.append((i / fps, (b["eyeLookDownLeft"] + b["eyeLookDownRight"]) / 2, math.degrees(math.atan2(-m[1][2], m[2][2]))))
    i += 1
a = np.array(rows)
for t in np.arange(0, a[-1, 0], 0.25):
    w = a[(a[:, 0] >= t) & (a[:, 0] < t + 0.25)]
    if len(w):
        print(f"{t:5.2f}s  eyes-down {w[:, 1].mean():.2f}  pitch {w[:, 2].mean():6.1f}  " + "#" * int(w[:, 1].mean() * 40))
