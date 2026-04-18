#!/usr/bin/env python3
# One-shot downloader for the local Gemma 4 checkpoint used by src/ngsp/local_model.py.
"""Resumable Gemma download via huggingface_hub.snapshot_download.

Usage:
    python scripts/download_gemma.py

Environment:
    HF_TOKEN         — required. Create at https://huggingface.co/settings/tokens.
    GEMMA_MODEL_ID   — optional. Defaults to google/gemma-4-E2B-it.

Notes:
    - Gemma is a gated model; you must accept the license on the model page while
      signed in to Hugging Face before the first download will succeed.
    - snapshot_download resumes partial downloads by default (huggingface_hub >= 0.24).
    - We pass the token per-call. We deliberately do NOT call huggingface_hub.login(),
      which would write a global token to ~/.cache/huggingface/token.
    - Apple Silicon note: bitsandbytes quantization is CUDA-only. On MPS / CPU boxes the
      E2B-it variant fits comfortably at bfloat16 / float16; stick to the default.
"""
from __future__ import annotations

import os
import sys

from dotenv import load_dotenv
from huggingface_hub import snapshot_download
from huggingface_hub.errors import HfHubHTTPError

DEFAULT_MODEL_ID = "google/gemma-4-E2B-it"


# Download the Gemma checkpoint to the local HF cache, surfacing gating errors helpfully.
def main() -> int:
    load_dotenv()

    token = os.environ.get("HF_TOKEN")
    if not token or token == "hf_REPLACE_ME":
        print(
            "[download_gemma] HF_TOKEN missing or unset. Create a token at\n"
            "    https://huggingface.co/settings/tokens\n"
            "and set it in .env before retrying.",
            file=sys.stderr,
        )
        return 1

    model_id = os.environ.get("GEMMA_MODEL_ID", DEFAULT_MODEL_ID)
    print(f"[download_gemma] downloading {model_id} (resume is automatic)")

    try:
        local_path = snapshot_download(repo_id=model_id, token=token)
    except HfHubHTTPError as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (401, 403):
            print(
                f"[download_gemma] {status} from Hugging Face for {model_id}.\n"
                f"  - If 401: check that HF_TOKEN is valid.\n"
                f"  - If 403: the model is gated. Visit\n"
                f"        https://huggingface.co/{model_id}\n"
                f"    while signed in and click 'Agree and access repository', "
                f"then retry.",
                file=sys.stderr,
            )
            return 2
        raise

    print(f"[download_gemma] done. local path: {local_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
