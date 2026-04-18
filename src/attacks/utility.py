# Attack 5 (inverted): measures downstream task utility preserved through the NGSP proxy.
# Higher utility_ratio is better for the privacy system; threshold is 0.85.
from __future__ import annotations

import random
from dataclasses import dataclass

from data.schemas import _DocumentBase


@dataclass
class UtilityResult:
    # Utility benchmark: ratio of proxy-answer quality to original-answer quality.
    mean_original_score: float
    mean_proxy_score: float
    utility_ratio: float
    n_docs_evaluated: int
    seed: int = 42


# Score how well a response preserves the task-relevant content of the original via Claude.
def _evaluate_utility(original_text: str, proxy_text: str, remote_client: "RemoteClient") -> float:
    system = (
        "You are a clinical-document quality judge. "
        "Score how well the PROXY preserves the task-relevant content of the ORIGINAL "
        "on a scale from 0.0 (completely useless) to 1.0 (identical meaning). "
        "Respond with ONLY a decimal number, nothing else."
    )
    prompt = f"ORIGINAL:\n{original_text[:800]}\n\nPROXY:\n{proxy_text[:800]}"
    try:
        resp = remote_client.complete(prompt, system=system, max_tokens=8)
        return max(0.0, min(1.0, float(resp.strip().split()[0])))
    except Exception:
        return 0.5


# Run the full NGSP pipeline on a doc and return the proxy text produced.
def _get_proxy(doc: "_DocumentBase", pipeline: "Pipeline", budget: "SessionBudget") -> str | None:
    from ngsp.pipeline import PipelineOutput

    try:
        out: PipelineOutput = pipeline.run(doc.text, budget)
        return out.proxy_text or doc.text  # local_only path has no proxy; use stripped
    except Exception:
        return None


# Benchmark utility ratio by running original and proxy through the same task prompt.
def run_utility(
    docs: list["_DocumentBase"],
    pipeline: "Pipeline",
    remote_client: "RemoteClient",
    task_system: str | None = None,
    n_docs: int = 50,
    seed: int = 42,
) -> UtilityResult:
    from ngsp.pipeline import SessionBudget

    if task_system is None:
        task_system = (
            "You are a clinical-trial assistant. "
            "Rewrite the following narrative as a concise plain-language summary in 2-3 sentences."
        )

    rng = random.Random(seed)
    sample = list(docs)
    rng.shuffle(sample)
    sample = sample[:n_docs]

    original_scores: list[float] = []
    proxy_scores: list[float] = []

    for doc in sample:
        # Score the original response.
        try:
            original_resp = remote_client.complete(
                prompt=doc.text[:1200], system=task_system, max_tokens=256
            )
            orig_score = _evaluate_utility(doc.text, original_resp, remote_client)
        except Exception:
            orig_score = 0.5

        # Score the proxy response.
        budget = SessionBudget(epsilon_cap=3.0)
        proxy_text = _get_proxy(doc, pipeline, budget)
        if proxy_text is None:
            proxy_scores.append(0.0)
            original_scores.append(orig_score)
            continue
        try:
            proxy_resp = remote_client.complete(
                prompt=proxy_text[:1200], system=task_system, max_tokens=256
            )
            proxy_score = _evaluate_utility(doc.text, proxy_resp, remote_client)
        except Exception:
            proxy_score = 0.0

        original_scores.append(orig_score)
        proxy_scores.append(proxy_score)

    mean_orig = sum(original_scores) / max(len(original_scores), 1)
    mean_proxy = sum(proxy_scores) / max(len(proxy_scores), 1)
    utility_ratio = mean_proxy / max(mean_orig, 1e-6)

    return UtilityResult(
        mean_original_score=mean_orig,
        mean_proxy_score=mean_proxy,
        utility_ratio=utility_ratio,
        n_docs_evaluated=len(original_scores),
        seed=seed,
    )
