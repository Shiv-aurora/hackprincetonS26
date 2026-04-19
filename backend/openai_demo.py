# OpenAI-backed helpers for demo endpoints.
from __future__ import annotations

import json
import os
from typing import Any

from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL = "gpt-4o-mini"
MOCK_KEYS = {"", "sk-REPLACE_ME", "sk-openai-mock"}


def openai_configured() -> bool:
    key = os.getenv("OPENAI_API_KEY", "")
    return key not in MOCK_KEYS


def model_for(task: str, requested: str | None = None) -> str:
    if task == "chat" and requested == "gpt-5":
        return os.getenv("OPENAI_GPT5_MODEL") or os.getenv("OPENAI_CHAT_MODEL") or "gpt-5"
    env_key = {
        "chat": "OPENAI_CHAT_MODEL",
        "dashboard": "OPENAI_DASHBOARD_MODEL",
        "timeline": "OPENAI_TIMELINE_MODEL",
        "signal": "OPENAI_SIGNAL_MODEL",
    }.get(task, "OPENAI_MODEL")
    return os.getenv(env_key) or os.getenv("OPENAI_MODEL") or DEFAULT_MODEL


def call_openai(
    prompt: str,
    system: str,
    *,
    task: str,
    requested_model: str | None = None,
    max_tokens: int = 1200,
    json_mode: bool = False,
) -> str:
    if not openai_configured():
        raise RuntimeError("OPENAI_API_KEY is not configured for live demo generation.")

    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    kwargs: dict[str, Any] = {
        "model": model_for(task, requested_model),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    try:
        completion = client.chat.completions.create(max_completion_tokens=max_tokens, **kwargs)
    except TypeError:
        completion = client.chat.completions.create(max_tokens=max_tokens, **kwargs)
    except Exception as exc:
        if "max_completion_tokens" not in str(exc):
            raise
        completion = client.chat.completions.create(max_tokens=max_tokens, **kwargs)

    choices = getattr(completion, "choices", None)
    if not choices:
        raise RuntimeError("OpenAI response contained no choices.")
    content = getattr(choices[0].message, "content", None)
    if not content:
        raise RuntimeError("OpenAI response contained no message content.")
    return content


def extract_json_object(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}") + 1
    if start < 0 or end <= start:
        raise ValueError("No JSON object found in model output.")
    return json.loads(text[start:end])
