"""Checks of the depth worker's safety nets, with a fake onnxruntime (no model needed):
   python scripts/depth/test_worker.py"""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
from contextlib import redirect_stderr, redirect_stdout

sys.path.insert(0, os.path.dirname(__file__))
import make_depth as md  # noqa: E402

REAL_MAKE_SESSION, REAL_DEPTH_OF = md.make_session, md.depth_of  # some tests below replace them


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


# ---- the GPU check: onnxruntime lists CUDA when it was BUILT with it, whether it can be LOADED is another matter

class FakeSession:
    def __init__(self, providers):
        self._providers = providers

    def get_providers(self):
        return self._providers


class FakeOrt:
    """A stand-in for onnxruntime: what it offers, what a session on CUDA does, and what its preload says."""

    def __init__(self, offers_cuda=True, cuda="works", preload_text=""):
        self.offers_cuda, self.cuda, self.preload_text = offers_cuda, cuda, preload_text
        self.preloaded = 0

    def get_available_providers(self):
        return (["CUDAExecutionProvider"] if self.offers_cuda else []) + ["CPUExecutionProvider"]

    class SessionOptions:
        log_severity_level = 3
        enable_cpu_mem_arena = True

    def preload_dlls(self):
        self.preloaded += 1
        if self.preload_text:
            print(self.preload_text)

    def InferenceSession(self, model, options=None, providers=None):
        wants_cuda = "CUDAExecutionProvider" in (providers or [])
        if wants_cuda and self.cuda == "raises":
            raise RuntimeError("Failed to create CUDAExecutionProvider. Require cuDNN 9.* and CUDA 12.*\nsecond line")
        if wants_cuda and self.cuda == "works":
            return FakeSession(["CUDAExecutionProvider", "CPUExecutionProvider"])
        return FakeSession(["CPUExecutionProvider"])


def fresh():
    md.make_session, md.depth_of = REAL_MAKE_SESSION, REAL_DEPTH_OF
    md._prepared = None
    md.GPU_NOTE = None


def test_nvidia_dll_dirs_finds_the_pip_packages_folders_on_windows_only():
    with tempfile.TemporaryDirectory() as root:
        for name in ("cudnn", "cublas", "cuda_runtime"):
            os.makedirs(os.path.join(root, "nvidia", name, "bin"))
        os.makedirs(os.path.join(root, "nvidia", "other", "lib"))  # no bin folder: not a DLL folder
        found = md.nvidia_dll_dirs([root, os.path.join(root, "missing")], platform="win32")
        assert [os.path.basename(os.path.dirname(f)) for f in found] == ["cublas", "cuda_runtime", "cudnn"]
        assert md.nvidia_dll_dirs([root], platform="linux") == []


def test_gpu_diagnosis_says_the_package_is_the_cpu_one():
    fresh()
    reason = md.gpu_diagnosis(FakeOrt(offers_cuda=False))
    assert "CPU package" in reason and "depth:setup -- --gpu" in reason


def test_gpu_diagnosis_gives_onnxruntimes_own_reason_and_what_the_preload_printed():
    fresh()
    ort = FakeOrt(cuda="raises", preload_text="Failed to load cudnn64_9.dll")
    reason = md.gpu_diagnosis(ort)
    assert reason.startswith("Failed to create CUDAExecutionProvider. Require cuDNN 9.* and CUDA 12.*")
    assert "second line" not in reason and "cudnn64_9.dll" in reason
    assert ort.preloaded == 1


def test_gpu_diagnosis_notices_a_silent_fall_back_to_the_cpu():
    fresh()
    assert "could not be loaded" in md.gpu_diagnosis(FakeOrt(cuda="falls-back"))


def test_gpu_diagnosis_is_none_when_cuda_really_works():
    fresh()
    assert md.gpu_diagnosis(FakeOrt(cuda="works")) is None


def test_make_session_remembers_why_the_gpu_was_not_used_and_says_so_once():
    fresh()
    err = io.StringIO()
    with redirect_stderr(err):
        session, provider = md.make_session(FakeOrt(cuda="falls-back", preload_text="Failed to load cudnn64_9.dll"), md.GPU_CHECK_MODEL, True)
    assert provider == "CPUExecutionProvider"
    assert md.GPU_NOTE and "cudnn64_9.dll" in md.GPU_NOTE
    assert err.getvalue().count("the GPU was not used") == 1 and "only slower" in err.getvalue()


def test_make_session_on_a_working_gpu_says_nothing():
    fresh()
    err = io.StringIO()
    with redirect_stderr(err):
        session, provider = md.make_session(FakeOrt(cuda="works"), md.GPU_CHECK_MODEL, True)
    assert provider == "CUDAExecutionProvider" and md.GPU_NOTE is None and err.getvalue() == ""


def test_the_real_check_runs_without_a_gpu_and_prints_one_json_line():
    import subprocess

    run = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "make_depth.py"), "--gpu-check"], capture_output=True, text=True)
    answer = json.loads(run.stdout.strip().splitlines()[-1])
    assert run.returncode == 0 and answer["ok"] is True and isinstance(answer["gpu"], bool)
    assert "CPUExecutionProvider" in answer["providers"]
    if not answer["installed"]:
        assert answer["gpu"] is False and "CPU package" in answer["reason"]


if __name__ == "__main__":
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        test()
        print("ok", test.__name__)
    print("all passed")
