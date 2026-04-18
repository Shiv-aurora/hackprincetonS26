# Smoke tests for ngsp.local_model — cover config parsing and device autodetect offline.
from __future__ import annotations

import os
from types import SimpleNamespace

import pytest

from ngsp.local_model import (
    DEFAULT_MODEL_ID,
    LocalModelConfig,
    _default_dtype_for_device,
    _resolve_device,
)


# Clearing relevant env vars must yield the documented defaults.
def test_config_from_env_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in ("GEMMA_MODEL_ID", "NGSP_DEVICE", "NGSP_QUANTIZATION"):
        monkeypatch.delenv(var, raising=False)
    cfg = LocalModelConfig.from_env()
    assert cfg.model_id == DEFAULT_MODEL_ID
    assert cfg.device == "auto"
    assert cfg.quantization == "none"


# Explicit env overrides must flow through to the config object.
def test_config_from_env_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMMA_MODEL_ID", "google/gemma-4-E4B-it")
    monkeypatch.setenv("NGSP_DEVICE", "cuda")
    monkeypatch.setenv("NGSP_QUANTIZATION", "4bit")
    cfg = LocalModelConfig.from_env()
    assert cfg.model_id == "google/gemma-4-E4B-it"
    assert cfg.device == "cuda"
    assert cfg.quantization == "4bit"


# Non-cuda + non-none quantization must fail at config validation time.
def test_quantization_on_cpu_raises() -> None:
    with pytest.raises(ValueError, match="requires device"):
        LocalModelConfig(quantization="8bit", device="cpu")
    with pytest.raises(ValueError, match="requires device"):
        LocalModelConfig(quantization="4bit", device="mps")


# quantization='auto' plus 'auto' device must pass config validation (device resolved later).
def test_quantization_with_auto_device_config_allowed() -> None:
    cfg = LocalModelConfig(quantization="8bit", device="auto")
    assert cfg.quantization == "8bit"


# Explicit device string must bypass autodetection entirely.
def test_resolve_device_explicit_passthrough() -> None:
    assert _resolve_device("cpu") == "cpu"
    assert _resolve_device("cuda") == "cuda"
    assert _resolve_device("mps") == "mps"


# Autodetection must prefer cuda when both are available.
def test_resolve_device_prefers_cuda(monkeypatch: pytest.MonkeyPatch) -> None:
    import torch

    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    if getattr(torch.backends, "mps", None) is not None:
        monkeypatch.setattr(torch.backends.mps, "is_available", lambda: True)
    assert _resolve_device("auto") == "cuda"


# Autodetection must fall back to mps when cuda is unavailable but mps is present.
def test_resolve_device_mps_when_no_cuda(monkeypatch: pytest.MonkeyPatch) -> None:
    import torch

    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    backends = getattr(torch, "backends", None)
    if getattr(backends, "mps", None) is None:
        monkeypatch.setattr(torch, "backends", SimpleNamespace(mps=SimpleNamespace(is_available=lambda: True)))
    else:
        monkeypatch.setattr(torch.backends.mps, "is_available", lambda: True)
    assert _resolve_device("auto") == "mps"


# With neither cuda nor mps, resolution must fall through to cpu.
def test_resolve_device_cpu_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    import torch

    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    backends = getattr(torch, "backends", None)
    if getattr(backends, "mps", None) is not None:
        monkeypatch.setattr(torch.backends.mps, "is_available", lambda: False)
    else:
        monkeypatch.setattr(torch, "backends", SimpleNamespace(mps=SimpleNamespace(is_available=lambda: False)))
    assert _resolve_device("auto") == "cpu"


# Dtype defaulting must produce the documented mapping per device.
def test_default_dtype_for_device() -> None:
    assert _default_dtype_for_device("cuda") == "bfloat16"
    assert _default_dtype_for_device("mps") == "float16"
    assert _default_dtype_for_device("cpu") == "float32"


# Smoke test for end-to-end model load + short generation (opt-in, heavy).
@pytest.mark.slow
@pytest.mark.skipif(os.getenv("NGSP_RUN_HEAVY") != "1", reason="requires NGSP_RUN_HEAVY=1")
def test_generate_smoke() -> None:
    from ngsp.local_model import LocalModel

    lm = LocalModel()
    out = lm.generate("Say hello in five words.", max_tokens=16)
    assert isinstance(out, str) and len(out) > 0


# Smoke test for the embedding path (opt-in, heavy).
@pytest.mark.slow
@pytest.mark.skipif(os.getenv("NGSP_RUN_HEAVY") != "1", reason="requires NGSP_RUN_HEAVY=1")
def test_embed_shape() -> None:
    from ngsp.local_model import LocalModel

    lm = LocalModel()
    vec = lm.embed("some text")
    assert vec.ndim == 1 and vec.shape[0] == lm.model.config.hidden_size
