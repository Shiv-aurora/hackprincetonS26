# Offline smoke tests for ngsp.remote_client — cover canary enforcement, audit hygiene, auth.
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from data.canary import mint_canary
from ngsp.remote_client import CanaryLeakError, RemoteClient


# Build a mock OpenAI client whose chat.completions.create returns a fake chat completion.
def _fake_client(response_text: str = "hello world") -> MagicMock:
    fake_message = MagicMock()
    fake_message.content = response_text
    fake_choice = MagicMock()
    fake_choice.message = fake_message
    fake_completion = MagicMock()
    fake_completion.choices = [fake_choice]
    client = MagicMock()
    client.chat.completions.create.return_value = fake_completion
    return client


# Construct a RemoteClient wired to a mock client, sidestepping real auth + I/O.
def _make_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, response_text: str = "hello world"
) -> tuple[RemoteClient, MagicMock, Path]:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake-key")
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    audit_path = tmp_path / "audit.jsonl"
    fake = _fake_client(response_text)
    rc = RemoteClient(audit_log_path=audit_path, _client=fake)
    return rc, fake, audit_path


# Missing or placeholder OPENAI_API_KEY must raise ValueError at construction.
def test_missing_api_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    # Neutralize load_dotenv so it does not re-inject the real .env key via parent walk.
    monkeypatch.setattr("ngsp.remote_client.load_dotenv", lambda *_, **__: None)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(ValueError):
        RemoteClient()


# Placeholder key value (the .env.example sentinel) must also be rejected.
def test_placeholder_api_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("ngsp.remote_client.load_dotenv", lambda *_, **__: None)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-REPLACE_ME")
    with pytest.raises(ValueError):
        RemoteClient()


# Canary in prompt aborts before any network call and raises CanaryLeakError.
def test_canary_leak_in_prompt_raises(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    rc, fake, audit_path = _make_client(tmp_path, monkeypatch)
    canary = mint_canary()
    with pytest.raises(CanaryLeakError):
        rc.complete(f"Summarize this: {canary}", None, 32)
    fake.chat.completions.create.assert_not_called()
    line = json.loads(audit_path.read_text().strip())
    assert line["status"] == "canary_leak"
    assert line["error_type"] == "canary_in_prompt"
    # Canary value itself must never appear in the audit file.
    assert canary not in audit_path.read_text()


# Canary in system also aborts before any network call.
def test_canary_leak_in_system_raises(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    rc, fake, audit_path = _make_client(tmp_path, monkeypatch)
    canary = mint_canary()
    with pytest.raises(CanaryLeakError):
        rc.complete("hello", f"You are a helpful assistant. {canary}", 32)
    fake.chat.completions.create.assert_not_called()
    line = json.loads(audit_path.read_text().strip())
    assert line["status"] == "canary_leak"
    assert line["error_type"] == "canary_in_system"
    assert canary not in audit_path.read_text()


# A successful call writes one audit line with only hashes/metadata, never raw content.
def test_audit_log_contains_only_hashes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    response_text = "hello world secret response"
    rc, fake, audit_path = _make_client(tmp_path, monkeypatch, response_text=response_text)
    prompt = "my prompt secret"
    system = "my system secret"
    result = rc.complete(prompt, system, 64)

    assert result == response_text
    fake.chat.completions.create.assert_called_once()

    raw = audit_path.read_text()
    assert "secret" not in raw, "raw substring leaked into audit log"
    assert response_text not in raw
    assert prompt not in raw
    assert system not in raw

    line = json.loads(raw.strip())
    expected_keys = {
        "request_id", "timestamp", "model",
        "prompt_length", "prompt_hash", "system_length", "system_hash",
        "max_tokens", "response_length", "response_hash", "status", "error_type",
    }
    assert set(line.keys()) == expected_keys
    assert line["status"] == "ok"
    assert line["error_type"] is None
    assert line["prompt_hash"] == hashlib.sha256(prompt.encode()).hexdigest()
    assert line["system_hash"] == hashlib.sha256(system.encode()).hexdigest()
    assert line["response_hash"] == hashlib.sha256(response_text.encode()).hexdigest()
    assert line["prompt_length"] == len(prompt)
    assert line["max_tokens"] == 64


# When system is None, the messages list must not contain a system-role entry.
def test_complete_omits_system_when_none(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    rc, fake, _ = _make_client(tmp_path, monkeypatch)
    rc.complete("hi", None, 16)
    kwargs = fake.chat.completions.create.call_args.kwargs
    roles = [m["role"] for m in kwargs["messages"]]
    assert "system" not in roles


# An API exception is audited as status=error before being re-raised.
def test_api_error_is_audited_and_reraised(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake-key")
    audit_path = tmp_path / "audit.jsonl"
    fake = MagicMock()
    fake.chat.completions.create.side_effect = RuntimeError("boom")
    rc = RemoteClient(audit_log_path=audit_path, _client=fake)
    with pytest.raises(RuntimeError, match="boom"):
        rc.complete("hi", None, 16)
    line = json.loads(audit_path.read_text().strip())
    assert line["status"] == "error"
    assert line["error_type"] == "RuntimeError"


# Live roundtrip (opt-in) — verifies the full stack against the real OpenAI API.
@pytest.mark.slow
@pytest.mark.skipif(
    os.getenv("NGSP_RUN_HEAVY") != "1" or not os.getenv("OPENAI_API_KEY")
    or os.getenv("OPENAI_API_KEY") == "sk-REPLACE_ME",
    reason="requires NGSP_RUN_HEAVY=1 and a real OPENAI_API_KEY",
)
def test_live_roundtrip(tmp_path: Path) -> None:
    rc = RemoteClient(audit_log_path=tmp_path / "audit.jsonl")
    out = rc.complete("Reply with exactly the word OK.", None, 16)
    assert isinstance(out, str) and len(out) > 0
