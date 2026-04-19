# OpenAI API wrapper with canary-leak pre-check and hash-only audit logging.
from __future__ import annotations

import hashlib
import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from data.canary import CANARY_REGEX


# Raised when a CANARY_<hex> sentinel is detected in outbound prompt/system text.
class CanaryLeakError(RuntimeError):
    pass


DEFAULT_AUDIT_LOG_PATH = Path("experiments/results/audit.jsonl")
DEFAULT_MODEL = "gpt-4o-mini"

# Sentinel key value that enables offline/mock mode for experiments that must not hit
# the OpenAI API. When the key equals this value, RemoteClient.complete() returns a
# fixed canned response and never instantiates an OpenAI SDK client.
MOCK_API_KEY = "sk-openai-mock"
MOCK_RESPONSE = "[MOCK RESPONSE: remote call skipped in offline mode]"


@dataclass(frozen=True)
class _AuditRecord:
    # Frozen metadata-only audit record; never holds raw prompt/response content.
    request_id: str
    timestamp: str
    model: str
    prompt_length: int
    prompt_hash: str
    system_length: int
    system_hash: str | None
    max_tokens: int
    response_length: int
    response_hash: str | None
    status: str
    error_type: str | None


# Compute sha256 hex digest of a utf-8-encoded string.
def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# Produce an ISO-8601 UTC timestamp with a trailing Z, resolution in seconds.
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class RemoteClient:
    # Thin wrapper around the OpenAI Chat Completions API enforcing canary + audit invariants.
    def __init__(
        self,
        model: str | None = None,
        api_key: str | None = None,
        max_retries: int = 3,
        audit_log_path: Path | str | None = None,
        _client: Any | None = None,
    ) -> None:
        load_dotenv()
        resolved_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not resolved_key or resolved_key == "sk-REPLACE_ME":
            raise ValueError(
                "OPENAI_API_KEY is missing or unset in the environment. "
                "Copy .env.example to .env and fill in a real key."
            )
        self._mock_mode = resolved_key == MOCK_API_KEY
        self.model = model or os.environ.get("OPENAI_MODEL") or DEFAULT_MODEL
        self.audit_log_path = Path(audit_log_path) if audit_log_path else DEFAULT_AUDIT_LOG_PATH
        if _client is not None:
            self._client = _client
        elif self._mock_mode:
            # Offline mode: no OpenAI SDK instance is created. complete() short-circuits.
            self._client = None
        else:
            from openai import OpenAI  # local import: keeps module import cheap

            self._client = OpenAI(api_key=resolved_key, max_retries=max_retries)

    @property
    # True when RemoteClient is running in offline/mock mode (no real API calls).
    def mock_mode(self) -> bool:
        return self._mock_mode

    # Call the OpenAI Chat Completions API after canary scanning and write a hashed audit line.
    def complete(self, prompt: str, system: str | None, max_tokens: int) -> str:
        request_id = uuid.uuid4().hex
        prompt_hash = _sha256(prompt)
        system_hash = _sha256(system) if system else None

        # Canary scan happens BEFORE any network I/O. Hard invariant.
        for field_name, text in (("prompt", prompt), ("system", system or "")):
            if CANARY_REGEX.search(text):
                self._write_audit(
                    _AuditRecord(
                        request_id=request_id,
                        timestamp=_now_iso(),
                        model=self.model,
                        prompt_length=len(prompt),
                        prompt_hash=prompt_hash,
                        system_length=len(system) if system else 0,
                        system_hash=system_hash,
                        max_tokens=max_tokens,
                        response_length=0,
                        response_hash=None,
                        status="canary_leak",
                        error_type=f"canary_in_{field_name}",
                    )
                )
                raise CanaryLeakError(
                    f"Canary token detected in {field_name}; refusing to send to remote API."
                )

        if self._mock_mode:
            response_text = MOCK_RESPONSE
            self._write_audit(
                _AuditRecord(
                    request_id=request_id,
                    timestamp=_now_iso(),
                    model=self.model,
                    prompt_length=len(prompt),
                    prompt_hash=prompt_hash,
                    system_length=len(system) if system else 0,
                    system_hash=system_hash,
                    max_tokens=max_tokens,
                    response_length=len(response_text),
                    response_hash=_sha256(response_text),
                    status="mock_ok",
                    error_type=None,
                )
            )
            return response_text

        messages: list[dict[str, str]] = []
        if system is not None:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": messages,
        }

        try:
            completion = self._client.chat.completions.create(**kwargs)
        except Exception as exc:
            self._write_audit(
                _AuditRecord(
                    request_id=request_id,
                    timestamp=_now_iso(),
                    model=self.model,
                    prompt_length=len(prompt),
                    prompt_hash=prompt_hash,
                    system_length=len(system) if system else 0,
                    system_hash=system_hash,
                    max_tokens=max_tokens,
                    response_length=0,
                    response_hash=None,
                    status="error",
                    error_type=type(exc).__name__,
                )
            )
            raise

        response_text = _extract_text(completion)
        self._write_audit(
            _AuditRecord(
                request_id=request_id,
                timestamp=_now_iso(),
                model=self.model,
                prompt_length=len(prompt),
                prompt_hash=prompt_hash,
                system_length=len(system) if system else 0,
                system_hash=system_hash,
                max_tokens=max_tokens,
                response_length=len(response_text),
                response_hash=_sha256(response_text),
                status="ok",
                error_type=None,
            )
        )
        return response_text

    # Append a single JSON-line audit record, creating the parent directory on first use.
    def _write_audit(self, record: _AuditRecord) -> None:
        self.audit_log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.audit_log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record.__dict__, separators=(",", ":")) + "\n")


# Pull the assistant text out of an OpenAI Chat Completions response.
def _extract_text(completion: Any) -> str:
    choices = getattr(completion, "choices", None)
    if not choices:
        raise RuntimeError("OpenAI response has no choices; expected at least one.")
    message = getattr(choices[0], "message", None)
    if message is None:
        raise RuntimeError("OpenAI response first choice has no message.")
    text = getattr(message, "content", None)
    if text is None:
        raise RuntimeError("OpenAI response message has no content.")
    return text
