# Attack 3: DistilBERT token-classification span predictor trained on proxy→sensitive-span pairs.
# This is the primary attack for the research hypothesis: can an attacker recover sensitive
# spans from proxy text alone?  Reports span-level F1 plus two baselines.
from __future__ import annotations

import random
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch

from data.schemas import SensitiveSpan

DISTILBERT_MODEL = "distilbert-base-uncased"
CHECKPOINT_DIR = Path("experiments/results/inversion_checkpoint")


@dataclass
class InversionResult:
    # Token-classification inversion attack results: per-category F1 and baselines.
    overall_f1: float
    baseline_random_f1: float
    control_shuffle_f1: float
    per_category_f1: dict[str, float] = field(default_factory=dict)
    n_train: int = 0
    n_eval: int = 0
    seed: int = 42
    model_name: str = DISTILBERT_MODEL


# Build binary token-level labels: 1 if the token span overlaps any sensitive span.
def _label_tokens(
    token_offsets: list[tuple[int, int]],
    sensitive_spans: list[SensitiveSpan],
) -> list[int]:
    labels: list[int] = []
    for tok_start, tok_end in token_offsets:
        hit = any(
            tok_start < sp.end and tok_end > sp.start
            for sp in sensitive_spans
        )
        labels.append(int(hit))
    return labels


# Compute token-level F1 from flat predicted and true label lists.
def _token_f1(preds: list[int], labels: list[int]) -> float:
    tp = sum(int(p == 1 and l == 1) for p, l in zip(preds, labels))
    fp = sum(int(p == 1 and l == 0) for p, l in zip(preds, labels))
    fn = sum(int(p == 0 and l == 1) for p, l in zip(preds, labels))
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


# Compute the corpus-level positive token rate (fraction of tokens that are sensitive).
def _positive_rate(all_labels: list[list[int]]) -> float:
    flat = [l for row in all_labels for l in row]
    return sum(flat) / max(len(flat), 1)


# Tokenize a proxy text with DistilBERT and return (input_ids, offset_mapping).
def _tokenize(tokenizer: "DistilBertTokenizerFast", text: str) -> dict:
    return tokenizer(
        text,
        return_tensors="pt",
        return_offsets_mapping=True,
        truncation=True,
        max_length=512,
        padding=False,
    )


# Fine-tune DistilBertForTokenClassification on the given (proxy, labels) training set.
def _train_model(
    train_data: list[tuple[str, list[int]]],
    seed: int,
    n_epochs: int = 3,
    lr: float = 2e-5,
) -> tuple["DistilBertForTokenClassification", "DistilBertTokenizerFast"]:
    from transformers import DistilBertForTokenClassification, DistilBertTokenizerFast

    torch.manual_seed(seed)
    random.seed(seed)
    np.random.seed(seed)

    tokenizer = DistilBertTokenizerFast.from_pretrained(DISTILBERT_MODEL)
    model = DistilBertForTokenClassification.from_pretrained(DISTILBERT_MODEL, num_labels=2)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model.to(device)
    model.train()

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)

    for epoch in range(n_epochs):
        total_loss = 0.0
        random.shuffle(train_data)
        for proxy_text, token_labels in train_data:
            enc = tokenizer(
                proxy_text,
                return_tensors="pt",
                truncation=True,
                max_length=512,
                padding=False,
            )
            input_ids = enc["input_ids"].to(device)
            # Pad or truncate labels to match the number of tokens (including [CLS]/[SEP]).
            n_tokens = input_ids.shape[1]
            padded_labels = (token_labels + [0] * n_tokens)[:n_tokens]
            labels_tensor = torch.tensor([padded_labels], dtype=torch.long, device=device)
            outputs = model(input_ids=input_ids, labels=labels_tensor)
            loss = outputs.loss
            loss.backward()
            optimizer.step()
            optimizer.zero_grad()
            total_loss += loss.item()

    model.eval()
    return model, tokenizer


# Run inference and return a flat list of predicted binary labels for a proxy text.
def _predict(
    model: "DistilBertForTokenClassification",
    tokenizer: "DistilBertTokenizerFast",
    proxy_text: str,
) -> list[int]:
    device = next(model.parameters()).device
    enc = tokenizer(proxy_text, return_tensors="pt", truncation=True, max_length=512)
    with torch.inference_mode():
        logits = model(input_ids=enc["input_ids"].to(device)).logits
    preds = logits.argmax(dim=-1).squeeze().tolist()
    if isinstance(preds, int):
        preds = [preds]
    return preds


# Run the full inversion attack: train on 80% of pairs, evaluate on held-out 20%.
def run_inversion(
    pairs: list[tuple[str, list[SensitiveSpan]]],
    seed: int = 42,
    n_epochs: int = 3,
) -> InversionResult:
    from transformers import DistilBertTokenizerFast

    if len(pairs) < 5:
        return InversionResult(
            overall_f1=0.0, baseline_random_f1=0.0, control_shuffle_f1=0.0, seed=seed
        )

    tokenizer = DistilBertTokenizerFast.from_pretrained(DISTILBERT_MODEL)

    # Build (proxy_text, token_label_list) tuples for all pairs.
    labeled: list[tuple[str, list[int]]] = []
    for proxy_text, spans in pairs:
        enc = tokenizer(proxy_text, return_offsets_mapping=True, truncation=True, max_length=512)
        offsets = enc["offset_mapping"]
        labels = _label_tokens(offsets, spans)
        labeled.append((proxy_text, labels))

    # 80/20 split — deterministic.
    rng = random.Random(seed)
    shuffled = list(labeled)
    rng.shuffle(shuffled)
    split = max(1, int(0.8 * len(shuffled)))
    train_set = shuffled[:split]
    eval_set = shuffled[split:]

    # ── Main model ───────────────────────────────────────────────────────────
    model, tokenizer = _train_model(train_set, seed=seed, n_epochs=n_epochs)

    all_preds: list[int] = []
    all_labels: list[int] = []
    for proxy_text, token_labels in eval_set:
        preds = _predict(model, tokenizer, proxy_text)
        n = min(len(preds), len(token_labels))
        all_preds.extend(preds[:n])
        all_labels.extend(token_labels[:n])
    main_f1 = _token_f1(all_preds, all_labels)

    # ── Random baseline ───────────────────────────────────────────────────────
    pos_rate = _positive_rate([lbl for _, lbl in eval_set])
    rng2 = random.Random(seed + 1)
    random_preds = [int(rng2.random() < pos_rate) for _ in all_labels]
    baseline_f1 = _token_f1(random_preds, all_labels)

    # ── Shuffle-pair control: train on same proxies with shuffled labels ──────
    shuffled_labels = [lbl for _, lbl in train_set]
    rng3 = random.Random(seed + 2)
    rng3.shuffle(shuffled_labels)
    control_train = [(proxy, lbl) for (proxy, _), lbl in zip(train_set, shuffled_labels)]
    ctrl_model, _ = _train_model(control_train, seed=seed + 3, n_epochs=n_epochs)

    ctrl_preds: list[int] = []
    ctrl_labels: list[int] = []
    for proxy_text, token_labels in eval_set:
        preds = _predict(ctrl_model, tokenizer, proxy_text)
        n = min(len(preds), len(token_labels))
        ctrl_preds.extend(preds[:n])
        ctrl_labels.extend(token_labels[:n])
    control_f1 = _token_f1(ctrl_preds, ctrl_labels)

    # ── Save checkpoint ───────────────────────────────────────────────────────
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(CHECKPOINT_DIR))
    tokenizer.save_pretrained(str(CHECKPOINT_DIR))

    return InversionResult(
        overall_f1=main_f1,
        baseline_random_f1=baseline_f1,
        control_shuffle_f1=control_f1,
        n_train=len(train_set),
        n_eval=len(eval_set),
        seed=seed,
        model_name=DISTILBERT_MODEL,
    )
