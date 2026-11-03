#!/usr/bin/env python3
"""The decisions inside make_cutouts.py, on synthetic data (no models): which figures get a cut-out, at what depth a person
moves, what is flagged. Run: python scripts/cutouts/test_pipeline.py   (exits non-zero on a failure)."""
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_cutouts as mc  # noqa: E402

W, H = 1920, 1080


def test_choose_people():
    found = [([100, 100, 400, 800], 0.9), ([800, 200, 60, 120], 0.8), ([1000, 100, 380, 790], 0.95), ([1500, 300, 30, 40], 0.5)]
    boxes, left_out = mc.choose_people(found, W, H)
    # the two big figures; the two small ones (under 15% of the largest) stay in the plate; left to right
    assert len(boxes) == 2 and left_out == 2, (boxes, left_out)
    assert boxes[0][0] < boxes[1][0]
    # each is widened by 6% of its size on every side (clamped to the picture)
    assert boxes[0] == [100 - 24, 100 - 48, 400 + 48, 800 + 96], boxes[0]
    # a figure at the picture's edge is clamped to it, never past
    edge, _ = mc.choose_people([([0, 0, 300, 600], 0.9), ([W - 300, H - 600, 300, 600], 0.9)], W, H)
    assert edge[0][:2] == [0, 0] and edge[1][0] + edge[1][2] == W and edge[1][1] + edge[1][3] == H, edge
    # nobody: nothing
    assert mc.choose_people([], W, H) == ([], 0)


def test_choose_people_cap_and_floor():
    big = [([i * 300, 100, 200, 700], 0.9) for i in range(6)]  # six equal figures
    boxes, left_out = mc.choose_people(big, W, H)
    assert len(boxes) == 4 and left_out == 2, (len(boxes), left_out)  # the depth camera draws up to four
    boxes, left_out = mc.choose_people(big, W, H, limit=2)
    assert len(boxes) == 2 and left_out == 4
    # the largest of all are kept when there are more than four
    mixed = [([i * 250, 100, 100 + 10 * i, 600 + 10 * i], 0.9) for i in range(6)]
    kept, _ = mc.choose_people(mixed, W, H)
    assert {b[0] for b in kept} == {250 * i - round((100 + 10 * i) * mc.PAD) if 250 * i - round((100 + 10 * i) * mc.PAD) > 0 else 0 for i in (2, 3, 4, 5)}, kept


def test_person_depth():
    bg = np.full((H, W), 0.3, np.float32)
    depth = bg.copy()
    # feet in shot, the ground under them agrees with the body: the person moves at the ground's depth
    matte = np.zeros((H, W), np.float32)
    matte[300:900, 800:1000] = 1
    depth[300:900, 800:1000] = 0.35
    value, how = mc.person_depth(cv2, np, matte, bg, depth, H)
    assert how == "feet" and abs(value - 0.3) < 0.02, (value, how)
    # feet out of shot (a close-up): at the body's depth
    matte2 = np.zeros((H, W), np.float32)
    matte2[300:1080, 800:1000] = 1
    depth2 = bg.copy()
    depth2[300:1080, 800:1000] = 0.8
    value, how = mc.person_depth(cv2, np, matte2, bg, depth2, H)
    assert how == "body" and abs(value - 0.8) < 0.02, (value, how)
    # feet in shot but the ground under them is far from the body (the film's "Jack in 511 came out at 0.004"): the body
    far = np.full((H, W), 0.01, np.float32)
    depth3 = far.copy()
    depth3[300:900, 800:1000] = 0.9
    value, how = mc.person_depth(cv2, np, matte, far, depth3, H)
    assert how == "body" and abs(value - 0.9) < 0.02, (value, how)


def test_own():
    a = np.zeros((H, W), np.float32)
    b = np.zeros((H, W), np.float32)
    a[100:600, 100:500] = 1
    b[100:600, 300:700] = 1
    depth = np.zeros((H, W), np.float32)
    depth[:, :400] = 0.2  # a is far...
    depth[:, 400:] = 0.9  # ...b is near
    depth[100:600, 300:500] = 0.9
    one, two = mc.own(np, [a, b], depth)
    assert one[300, 200] == 1 and two[300, 200] == 0  # only a here
    assert one[300, 600] == 0 and two[300, 600] == 1  # only b here
    assert one[300, 400] + two[300, 400] == 1  # contested: one owner, not two
    assert (one * two).max() == 0


def test_flags():
    def alpha(box_pixels):
        a = np.zeros((H, W), np.uint8)
        for y0, y1, x0, x1 in box_pixels:
            a[y0:y1, x0:x1] = 255
        return a

    # a healthy cut-out: fills the middle of its box, not its edges
    ok = alpha([(250, 750, 450, 650)])
    assert mc.check_cutouts(np, [ok], [[400, 200, 300, 600]], W, H) == []
    # nearly empty
    empty = alpha([(300, 310, 500, 510)])
    assert any("nearly empty" in f for f in mc.check_cutouts(np, [empty], [[400, 200, 300, 600]], W, H))
    # running into a box edge that is not the picture's own edge: it may be clipped
    clipped = alpha([(200, 800, 400, 700)])
    flags = mc.check_cutouts(np, [clipped], [[400, 200, 300, 600]], W, H)
    assert any("clipped" in f for f in flags), flags
    # a person against the picture's own top and left edges is not "clipped" by their box: the picture ends there
    at_edge = alpha([(0, 450, 0, 200)])
    assert not any("clipped" in f for f in mc.check_cutouts(np, [at_edge], [[0, 0, 300, 600]], W, H))
    # but running into the box's far edges still is
    assert any("clipped" in f for f in mc.check_cutouts(np, [alpha([(0, 600, 0, 300)])], [[0, 0, 300, 600]], W, H))


def test_yolox_decode_finds_a_person_and_ignores_the_rest():
    # the stand-in finder (fixtures/tiny-people.onnx) answers in YOLOX's raw format: the decode must give back its box
    import onnxruntime as ort

    fixture = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "tiny-people.onnx")
    picture = np.full((720, 1280, 3), 32, np.uint8)
    picture[200:650, 400:700] = 255
    ort.set_default_logger_severity(3)

    class Stand:
        def __init__(self):
            self.session = ort.InferenceSession(fixture, providers=["CPUExecutionProvider"])

        def first_input(self):
            return self.session.get_inputs()[0].name

        def run(self, feed):
            return self.session.run(None, feed)

    found = mc.person_boxes(cv2, np, Stand(), picture)
    assert len(found) == 1, found
    (x, y, w, h), score = found[0]
    assert abs(x - 400) <= 8 and abs(y - 200) <= 8 and abs(w - 300) <= 12 and abs(h - 450) <= 12, found
    assert score > 0.9
    assert mc.person_boxes(cv2, np, Stand(), np.full((720, 1280, 3), 32, np.uint8)) == []


if __name__ == "__main__":
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        test()
        print("ok", test.__name__)
