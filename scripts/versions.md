# Dependency versions checked for Phase 1b (integration)

Checked via context7 MCP on 2026-04-18. Re-run context7 queries if any of these APIs
appear to have changed behavior during implementation.

## Gemma 4

- Default model id for this project: `google/gemma-4-E2B-it` (smallest instruct variant,
  runs on laptops and Apple Silicon at bfloat16/float16 without quantization).
- Larger variants available: `google/gemma-4-E4B-it`, `google/gemma-4-27b-it`.
- Loader: `AutoTokenizer.from_pretrained(...)` + `AutoModelForCausalLM.from_pretrained(...)`.
  (Gemma 4 also supports `AutoProcessor` + `Gemma3ForConditionalGeneration` for multimodal;
  NGSP uses text-only path.)
- Recommended loading kwargs: `torch_dtype=<dtype>, device_map="auto",
  attn_implementation="sdpa"`.
- Notes: gated model — requires HF_TOKEN and license acceptance at
  https://huggingface.co/google/gemma-4-E2B-it.

## transformers

- Pinned: `transformers>=4.44` (tested path), also compatible with 4.5x + 5.x.
- Relevant APIs used:
  - `AutoModelForCausalLM.from_pretrained(model_id, token=, torch_dtype=, device_map=, quantization_config=, attn_implementation="sdpa")`
  - `AutoTokenizer.from_pretrained(model_id, token=)`
  - `tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)`
  - `model.generate(**inputs, max_new_tokens=..., output_hidden_states=True, return_dict_in_generate=True)`
  - `model(**inputs, output_hidden_states=True)` for single-pass embedding extraction.
  - `BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_quant_type="nf4")` — v5 migration note: pass via `quantization_config=`, not the deprecated `load_in_4bit=` / `load_in_8bit=` top-level kwargs.
- Hidden-state return shape: `GenerateDecoderOnlyOutput.hidden_states` is a
  `tuple[tuple[Tensor, ...], ...]` with outer length `num_generated_tokens` and inner
  length `num_layers + 1` (embedding layer + each transformer block). Each tensor is
  `(batch, seq_len_at_step, hidden_dim)`. At step 0, `seq_len_at_step == prompt_len`;
  at later steps, `seq_len_at_step == 1`.

## anthropic (Python SDK)

- Pinned: `anthropic>=0.40`.
- Relevant APIs used:
  - `Anthropic(api_key=..., max_retries=3)` — SDK handles exponential backoff on 429/5xx
    natively; no retry on 401/400.
  - `client.messages.create(model=..., max_tokens=..., system=..., messages=[{"role": "user", "content": prompt}])`.
    If `system is None`, omit the key entirely (SDK rejects `system=None`).
  - Response shape: `msg.content[0].text` for text-only responses.
  - Exception classes: `anthropic.AuthenticationError`, `anthropic.RateLimitError`,
    `anthropic.APIError`.
- Default model for this project: `claude-opus-4-7` (per CLAUDE.md §3 "latest Claude
  model available"). Override via `ANTHROPIC_MODEL` env var for cheaper dev (e.g.
  `claude-sonnet-4-6`).

## huggingface_hub

- Pinned: `huggingface_hub>=0.24`.
- Relevant APIs used:
  - `snapshot_download(repo_id=..., token=...)` — resume is default behavior in modern
    versions. The `resume_download` kwarg was removed in v1.0; do NOT pass it.
  - `HfHubHTTPError` — catch 401 / 403 to distinguish bad token vs unaccepted license.
- Authentication policy: pass `token=` per-call. Do NOT call `login()` — it persists a
  token to `~/.cache/huggingface/token` globally, which is an anti-pattern on shared
  machines.
