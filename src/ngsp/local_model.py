# Gemma 4 inference wrapper exposing generate, hidden-state pooling, embedding, and tokenization.
from __future__ import annotations

import os
from typing import Any, Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator, model_validator

Quantization = Literal["none", "8bit", "4bit"]
Device = Literal["auto", "cpu", "cuda", "mps"]
Dtype = Literal["bfloat16", "float16", "float32"]

DEFAULT_MODEL_ID = "google/gemma-4-E2B-it"


class LocalModelConfig(BaseModel):
    # Load-time configuration for the local Gemma wrapper; read-only after construction.
    model_id: str = DEFAULT_MODEL_ID
    device: Device = "auto"
    quantization: Quantization = "none"
    dtype: Dtype | None = None  # when None, derived from resolved device at load time

    @field_validator("model_id")
    @classmethod
    # Reject empty model IDs early; from_pretrained would give a confusing error later.
    def _nonempty_model_id(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("model_id must be a non-empty string")
        return v

    @model_validator(mode="after")
    # Validate that bitsandbytes quantization is only requested on CUDA-capable devices.
    def _quant_requires_cuda(self) -> "LocalModelConfig":
        if self.quantization != "none" and self.device not in ("auto", "cuda"):
            raise ValueError(
                f"quantization={self.quantization!r} requires device='cuda' or 'auto'; "
                f"got device={self.device!r}"
            )
        return self

    @classmethod
    # Build a config by reading GEMMA_MODEL_ID, NGSP_DEVICE, NGSP_QUANTIZATION from the env.
    def from_env(cls) -> "LocalModelConfig":
        load_dotenv()
        return cls(
            model_id=os.environ.get("GEMMA_MODEL_ID", DEFAULT_MODEL_ID),
            device=os.environ.get("NGSP_DEVICE", "auto"),  # type: ignore[arg-type]
            quantization=os.environ.get("NGSP_QUANTIZATION", "none"),  # type: ignore[arg-type]
        )


# Resolve 'auto' to a concrete torch device string, preferring cuda > mps > cpu.
def _resolve_device(requested: Device) -> str:
    if requested != "auto":
        return requested
    import torch  # local import: avoid paying torch import cost at module load

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


# Pick a sensible torch dtype for the resolved device when the user has not overridden it.
def _default_dtype_for_device(device: str) -> Dtype:
    if device == "cuda":
        return "bfloat16"
    if device == "mps":
        return "float16"
    return "float32"


_INSTANCE: "LocalModel | None" = None


# Return a process-wide cached LocalModel, constructing it on first call.
def get_local_model(config: LocalModelConfig | None = None) -> "LocalModel":
    global _INSTANCE
    config = config or LocalModelConfig.from_env()
    if _INSTANCE is None:
        _INSTANCE = LocalModel(config)
    elif _INSTANCE.config != config:
        raise RuntimeError(
            "LocalModel is already initialized with a different config; create a new "
            "process if you need a different model."
        )
    return _INSTANCE


# Reset the cached singleton; intended for tests only.
def _reset_local_model() -> None:
    global _INSTANCE
    _INSTANCE = None


class LocalModel:
    # Single-process single-threaded wrapper around a transformers causal LM.
    # Thread-safety is the caller's responsibility.
    def __init__(self, config: LocalModelConfig | None = None) -> None:
        self.config = config or LocalModelConfig.from_env()
        self.device = _resolve_device(self.config.device)
        self.dtype_name: Dtype = self.config.dtype or _default_dtype_for_device(self.device)
        # Re-validate quantization against the resolved device (handles device='auto' + non-cuda host).
        if self.config.quantization != "none" and self.device != "cuda":
            raise ValueError(
                f"quantization={self.config.quantization!r} requested but resolved "
                f"device is {self.device!r}; bitsandbytes requires CUDA."
            )
        self.model, self.tokenizer = self._load()

    # Load the tokenizer + model per the resolved config; called once per LocalModel instance.
    def _load(self) -> tuple[Any, Any]:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        load_dotenv()
        token = os.environ.get("HF_TOKEN")
        if token == "hf_REPLACE_ME":
            token = None

        tokenizer = AutoTokenizer.from_pretrained(self.config.model_id, token=token)

        dtype_map = {"bfloat16": torch.bfloat16, "float16": torch.float16, "float32": torch.float32}
        torch_dtype = dtype_map[self.dtype_name]

        # device_map="auto" works correctly only for CUDA (accelerate / bitsandbytes).
        # For MPS and CPU, load to CPU first, then move to target device — avoids the
        # accelerate memory-pre-allocation bug that fires on Apple Silicon with device_map.
        use_device_map = self.device == "cuda" or self.config.quantization != "none"

        kwargs: dict[str, Any] = {
            "token": token,
            "torch_dtype": torch_dtype,
            "attn_implementation": "sdpa",
        }
        if use_device_map:
            kwargs["device_map"] = "auto"

        if self.config.quantization != "none":
            from transformers import BitsAndBytesConfig

            if self.config.quantization == "8bit":
                kwargs["quantization_config"] = BitsAndBytesConfig(load_in_8bit=True)
            else:  # "4bit"
                kwargs["quantization_config"] = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.bfloat16,
                    bnb_4bit_quant_type="nf4",
                )

        model = AutoModelForCausalLM.from_pretrained(self.config.model_id, **kwargs)
        if not use_device_map and self.device not in ("cpu",):
            model = model.to(self.device)
        model.eval()
        return model, tokenizer

    # Build the model input tensors for a user prompt, using the chat template if available.
    def _prepare_inputs(self, prompt: str) -> Any:
        if getattr(self.tokenizer, "chat_template", None):
            text = self.tokenizer.apply_chat_template(
                [{"role": "user", "content": prompt}],
                tokenize=False,
                add_generation_prompt=True,
            )
        else:
            text = prompt
        inputs = self.tokenizer(text, return_tensors="pt")
        target_device = next(self.model.parameters()).device
        return inputs.to(target_device)

    # Generate a completion for the given prompt and return only the newly produced text.
    def generate(self, prompt: str, max_tokens: int, **kwargs: Any) -> str:
        import torch

        inputs = self._prepare_inputs(prompt)
        with torch.inference_mode():
            out = self.model.generate(**inputs, max_new_tokens=max_tokens, **kwargs)
        new_tokens = out[0, inputs["input_ids"].shape[1]:]
        return self.tokenizer.decode(new_tokens, skip_special_tokens=True)

    # Generate and return (decoded_text, pooled_hidden_state) for the DP bottleneck path.
    # Pooling contract: mean over the new-token activations at `layer`, shape (hidden_dim,).
    # At step 0 we use the last prompt-token activation; at later steps, the fresh token's
    # activation. Phase 2 (ngsp-core) depends on this fixed-size output for L2 clipping.
    def generate_with_hidden_states(
        self, prompt: str, layer: int, max_tokens: int, **kwargs: Any
    ) -> tuple[str, Any]:
        import torch

        inputs = self._prepare_inputs(prompt)
        with torch.inference_mode():
            out = self.model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                output_hidden_states=True,
                return_dict_in_generate=True,
                **kwargs,
            )

        sequences = out.sequences
        hidden_states_per_step: tuple[tuple[Any, ...], ...] = out.hidden_states
        num_layers = len(hidden_states_per_step[0])  # includes embedding output
        if not (-num_layers <= layer < num_layers):
            raise IndexError(
                f"layer={layer} out of bounds for model with {num_layers} hidden-state slots"
            )

        pooled_rows = []
        for step_idx, layer_outputs in enumerate(hidden_states_per_step):
            tensor = layer_outputs[layer]  # (batch, seq_at_step, hidden_dim)
            if step_idx == 0:
                # seq_at_step == prompt_len; take the last prompt-token activation.
                pooled_rows.append(tensor[:, -1, :])
            else:
                # seq_at_step == 1; take the newly-generated-token activation.
                pooled_rows.append(tensor[:, 0, :])
        stacked = torch.stack(pooled_rows, dim=1)  # (batch, num_steps, hidden_dim)
        pooled = stacked.mean(dim=1).squeeze(0).detach().to("cpu")

        new_tokens = sequences[0, inputs["input_ids"].shape[1]:]
        text = self.tokenizer.decode(new_tokens, skip_special_tokens=True)
        return text, pooled

    # Compute a mean-pooled hidden-state embedding for `text` at the given layer.
    def embed(self, text: str, layer: int = -1) -> Any:
        import torch

        inputs = self.tokenizer(text, return_tensors="pt", truncation=True)
        target_device = next(self.model.parameters()).device
        inputs = inputs.to(target_device)
        with torch.inference_mode():
            out = self.model(**inputs, output_hidden_states=True)
        hidden = out.hidden_states[layer]  # (1, seq_len, hidden_dim)
        mask = inputs["attention_mask"].unsqueeze(-1).to(hidden.dtype)
        summed = (hidden * mask).sum(dim=1)
        denom = mask.sum(dim=1).clamp(min=1)
        pooled = (summed / denom).squeeze(0).detach().to("cpu")
        return pooled

    # Encode `text` to a list of input ids; special tokens omitted (chat template handles them).
    def tokenize(self, text: str) -> list[int]:
        return self.tokenizer.encode(text, add_special_tokens=False)

    # Decode a sequence of input ids back to a string, skipping special tokens.
    def detokenize(self, ids: list[int]) -> str:
        return self.tokenizer.decode(ids, skip_special_tokens=True)
