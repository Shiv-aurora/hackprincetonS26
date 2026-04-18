# Decodes a noisy bottleneck embedding back to a proxy text for the DP-tolerant path.
#
# v1 design (paraphrase conditioned on noisy-embedding hint):
# We extract the top-K token IDs nearest to the noisy embedding in the model's embedding
# matrix, construct a hint phrase from them, then prompt Gemma to paraphrase the stripped
# input while guided by those hint tokens.  The noisy-nearest-neighbor lookup degrades
# entity-level specificity while preserving topic-level intent.
# This approach is documented in paper/methodology.md.
from __future__ import annotations

from typing import Any

from data.schemas import SensitiveSpan


# Find the K vocabulary tokens whose embeddings are closest to the given (noisy) vector.
def _nearest_vocab_tokens(noisy_vec: Any, local_model: Any, k: int = 20) -> list[str]:
    import torch

    model = local_model.model
    tokenizer = local_model.tokenizer

    # Retrieve the embedding weight matrix (vocab_size, hidden_dim).
    embedding_layer = model.get_input_embeddings()
    weight = embedding_layer.weight.detach().to(noisy_vec.device)  # (V, H)

    # Cosine similarity between noisy_vec and every vocabulary embedding.
    vec_norm = noisy_vec / (noisy_vec.norm(p=2) + 1e-9)
    weight_norm = weight / (weight.norm(p=2, dim=1, keepdim=True) + 1e-9)  # (V, H)
    sims = (weight_norm @ vec_norm).squeeze()  # (V,)

    top_ids = torch.topk(sims, k=min(k, sims.shape[0])).indices.tolist()
    tokens = [tokenizer.decode([tid], skip_special_tokens=True).strip() for tid in top_ids]
    # Drop empty or whitespace-only tokens that add no semantic content.
    return [t for t in tokens if t][:k]


_DECODE_PROMPT_TEMPLATE = """\
You are a clinical-trial document paraphraser. Rewrite the TEXT below in different wording \
while preserving its general meaning. Incorporate some of the HINT WORDS naturally if they \
fit the context, but do not force them in. The rewrite must not introduce new factual claims.

HINT WORDS (from noisy model internals, may be approximate): {hint_words}

TEXT: {stripped_input}

Return ONLY the rewritten text. No preamble.
"""


# Decode a noisy bottleneck embedding to a proxy text via nearest-neighbor hint + Gemma.
# `noisy_vec` must be a cpu float tensor of shape (hidden_dim,) — output of the DP step.
# Returns a proxy string suitable for sending to the Anthropic API.
def decode_proxy(
    stripped_input: str,
    noisy_vec: Any,
    spans: list[SensitiveSpan],
    local_model: Any,
    k_hints: int = 20,
) -> str:
    hint_tokens = _nearest_vocab_tokens(noisy_vec, local_model, k=k_hints)
    hint_str = ", ".join(hint_tokens) if hint_tokens else "(none)"
    prompt = _DECODE_PROMPT_TEMPLATE.format(
        hint_words=hint_str,
        stripped_input=stripped_input,
    )
    try:
        proxy = local_model.generate(prompt, max_tokens=512, temperature=0.5)
    except Exception:
        proxy = stripped_input  # degrade gracefully
    return proxy.strip()
