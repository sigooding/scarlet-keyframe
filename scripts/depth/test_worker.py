"""Checks of the depth worker's safety nets, with a fake onnxruntime (no model needed):
   python scripts/depth/test_worker.py"""
from __future__ import annotations

import io
import json
import os
import sys
from contextlib import redirect_stderr, redirect_stdout

sys.path.insert(0, os.path.dirname(__file__))
import make_depth as md  # noqa: E402


class Fake:
    """Stands in for make_session / depth_of: the GPU session fails when it runs, the CPU one works."""

    def __init__(self, gpu_fails=True, cpu_fails=False):
        self.gpu_fails, self.cpu_fails, self.sessions = gpu_fails, cpu_fails, []

    def make_session(self, ort, model, want_gpu):
        provider = "CUDAExecutionProvider" if want_gpu else "CPUExecutionProvider"
        self.sessions.append(provider)
        return provider, provider

    def depth_of(self, cv2, np, session, rgb):
        if session == "CUDAExecutionProvider" and self.gpu_fails:
            raise RuntimeError("CUDA failure 2: out of memory\nsecond line")
        if session == "CPUExecutionProvider" and self.cpu_fails:
            raise RuntimeError("the CPU failed too")
        return "the depth"


def run(fake, want_gpu):
    md.make_session, md.depth_of = fake.make_session, fake.depth_of
    err = io.StringIO()
    with redirect_stderr(err):
        result = md.depth_with_cpu_fallback(None, None, None, "m.onnx", want_gpu, None)
    return result, err.getvalue()


def test_gpu_stops_then_cpu_does_it():
    fake = Fake()
    (depth, provider), err = run(fake, True)
    assert (depth, provider) == ("the depth", "CPUExecutionProvider")
    assert fake.sessions == ["CUDAExecutionProvider", "CPUExecutionProvider"]
    assert "the GPU stopped (CUDA failure 2: out of memory)" in err and "again on the CPU" in err


def test_a_working_gpu_is_left_alone():
    fake = Fake(gpu_fails=False)
    (depth, provider), err = run(fake, True)
    assert provider == "CUDAExecutionProvider" and fake.sessions == ["CUDAExecutionProvider"] and err == ""


def test_the_cpu_failing_is_not_hidden():
    try:
        run(Fake(cpu_fails=True), False)
    except RuntimeError as error:
        assert "the CPU failed too" in str(error)
    else:
        raise AssertionError("expected the CPU failure to be raised")


def test_a_crash_is_answered_as_json_with_exit_code_1():
    out, err = io.StringIO(), io.StringIO()

    def boom():
        raise ValueError("bad shape\nmore")

    try:
        with redirect_stdout(out), redirect_stderr(err):
            md.run_guarded(boom)
    except SystemExit as stop:
        assert stop.code == 1
    answer = json.loads(out.getvalue().strip().splitlines()[-1])
    assert answer == {"ok": False, "error": "crashed", "message": "The worker crashed: ValueError: bad shape"}
    assert "Traceback" in err.getvalue()


def test_normal_exits_pass_through():
    for code in (0, 2):
        try:
            md.run_guarded(lambda code=code: code)
        except SystemExit as stop:
            assert stop.code == code


if __name__ == "__main__":
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        test()
        print("ok", test.__name__)
    print("all passed")
