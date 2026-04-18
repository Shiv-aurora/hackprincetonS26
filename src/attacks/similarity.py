# Attack 2: cross-encoder cosine similarity between original and proxy texts.
# Uses the all-MiniLM-L6-v2 bi-encoder (sentence-transformers) for efficiency.
# Model choice documented here: all-MiniLM-L6-v2 is lightweight (~80 MB), fast on CPU/MPS,
# and semantically strong enough to detect near-paraphrase proxies.
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class SimilarityResult:
    # Cross-encoder similarity attack outcome: distribution statistics over the corpus.
    mean_sim: float
    median_sim: float
    p95_sim: float
    fraction_above_threshold: float
    per_pair_scores: list[float] = field(default_factory=list)
    model_name: str = ""
    threshold: float = 0.85


# Load a sentence-transformers bi-encoder and return it; caller caches the instance.
def load_embed_model(model_name: str = "all-MiniLM-L6-v2") -> "SentenceTransformer":
    from sentence_transformers import SentenceTransformer  # type: ignore[import]

    return SentenceTransformer(model_name)


# Encode a list of texts into a 2-D numpy array of L2-normalised embeddings.
def _encode(model: "SentenceTransformer", texts: list[str]) -> np.ndarray:
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return np.asarray(embeddings, dtype=np.float32)


# Run the similarity attack over (original_text, proxy_text) pairs.
def run_similarity(
    pairs: list[tuple[str, str]],
    model_name: str = "all-MiniLM-L6-v2",
    threshold: float = 0.85,
) -> SimilarityResult:
    if not pairs:
        return SimilarityResult(
            mean_sim=0.0, median_sim=0.0, p95_sim=0.0,
            fraction_above_threshold=0.0, model_name=model_name, threshold=threshold,
        )
    model = load_embed_model(model_name)
    originals = [p[0] for p in pairs]
    proxies = [p[1] for p in pairs]
    orig_emb = _encode(model, originals)
    proxy_emb = _encode(model, proxies)
    # Row-wise dot product on L2-normalised vectors equals cosine similarity.
    scores = (orig_emb * proxy_emb).sum(axis=1).tolist()
    arr = np.array(scores, dtype=np.float32)
    return SimilarityResult(
        mean_sim=float(arr.mean()),
        median_sim=float(np.median(arr)),
        p95_sim=float(np.percentile(arr, 95)),
        fraction_above_threshold=float((arr >= threshold).mean()),
        per_pair_scores=scores,
        model_name=model_name,
        threshold=threshold,
    )
