# Attack 4: entity membership inference via logistic regression on proxy embeddings.
# Determines whether an attacker can tell which compound codes appear in a source doc
# by inspecting the proxy text alone.  AUC close to 0.5 indicates good privacy.
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from data.schemas import SensitiveCategory, SensitiveSpan


@dataclass
class MembershipResult:
    # Membership inference outcome: per-entity AUC and mean AUC across target entities.
    per_entity_auc: dict[str, float] = field(default_factory=dict)
    mean_auc: float = 0.5
    n_entities_evaluated: int = 0
    embed_model_name: str = ""
    seed: int = 42


# Extract the top-k most frequent compound-code values from the span lists in pairs.
def _top_entities(
    pairs: list[tuple[str, list[SensitiveSpan]]], k: int = 3
) -> list[str]:
    counts: dict[str, int] = {}
    for _, spans in pairs:
        for sp in spans:
            if sp.category == SensitiveCategory.COMPOUND_CODE:
                counts[sp.value] = counts.get(sp.value, 0) + 1
    return [e for e, _ in sorted(counts.items(), key=lambda x: -x[1])][:k]


# Train and evaluate a logistic classifier for one target entity; return AUC.
def _attack_one_entity(
    entity: str,
    pairs: list[tuple[str, list[SensitiveSpan]]],
    embeddings: np.ndarray,
    seed: int,
) -> float:
    labels = np.array(
        [int(any(sp.value == entity for sp in spans)) for _, spans in pairs],
        dtype=np.int32,
    )
    n_pos = int(labels.sum())
    n_neg = int((1 - labels).sum())
    # Skip evaluation if either class is absent — AUC is undefined.
    if n_pos < 2 or n_neg < 2:
        return 0.5
    from sklearn.model_selection import train_test_split

    X_train, X_test, y_train, y_test = train_test_split(
        embeddings, labels, test_size=0.25, random_state=seed, stratify=labels
    )
    clf = LogisticRegression(max_iter=1000, random_state=seed)
    clf.fit(X_train, y_train)
    probs = clf.predict_proba(X_test)[:, 1]
    try:
        return float(roc_auc_score(y_test, probs))
    except ValueError:
        return 0.5


# Run the membership-inference attack over (proxy_text, spans) pairs.
def run_membership(
    pairs: list[tuple[str, list[SensitiveSpan]]],
    embed_model_name: str = "all-MiniLM-L6-v2",
    k_entities: int = 3,
    seed: int = 42,
) -> MembershipResult:
    if not pairs:
        return MembershipResult(embed_model_name=embed_model_name, seed=seed)
    from attacks.similarity import load_embed_model, _encode

    model = load_embed_model(embed_model_name)
    proxy_texts = [p[0] for p in pairs]
    embeddings = _encode(model, proxy_texts)

    targets = _top_entities(pairs, k=k_entities)
    per_entity: dict[str, float] = {}
    for entity in targets:
        per_entity[entity] = _attack_one_entity(entity, pairs, embeddings, seed)

    mean_auc = float(np.mean(list(per_entity.values()))) if per_entity else 0.5
    return MembershipResult(
        per_entity_auc=per_entity,
        mean_auc=mean_auc,
        n_entities_evaluated=len(per_entity),
        embed_model_name=embed_model_name,
        seed=seed,
    )
