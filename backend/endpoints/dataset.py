# GET /api/dataset/schema + POST /api/dataset/query — synthetic clinical dataset browser.
from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from backend.schemas import (
    DatasetCell,
    DatasetColumn,
    DatasetEntityAnnotation,
    DatasetQueryRequest,
    DatasetQueryResponse,
    DatasetRow,
    DatasetSchemaResponse,
)

router = APIRouter()

# Path to the NGSP file-based audit log (append-only, source of truth).
_AUDIT_LOG_PATH = Path("experiments/results/audit.jsonl")

# Column definitions for the synthetic clinical trial dataset.
_COLUMNS: list[DatasetColumn] = [
    DatasetColumn(name="doc_id",    kind="string",   has_entities=False),
    DatasetColumn(name="site",      kind="category", has_entities=True),
    DatasetColumn(name="subject",   kind="string",   has_entities=True),
    DatasetColumn(name="ae",        kind="string",   has_entities=False),
    DatasetColumn(name="grade",     kind="int",      has_entities=False),
    DatasetColumn(name="onset_day", kind="int",      has_entities=False),
    DatasetColumn(name="dose_mg",   kind="float",    has_entities=False),
    DatasetColumn(name="outcome",   kind="category", has_entities=False),
]

# In-memory dataset (loaded once from synthetic_sae on first request).
_DATASET: list[dict[str, Any]] = []
_DATASET_LOADED = False


# Load and flatten the synthetic SAE corpus into table rows on first access.
def _ensure_dataset_loaded() -> None:
    global _DATASET_LOADED  # noqa: PLW0603
    if _DATASET_LOADED:
        return
    try:
        from data.synthetic_sae import generate_sae_narratives

        corpus = generate_sae_narratives(50)
        rows: list[dict[str, Any]] = []
        for i, doc in enumerate(corpus):
            text = doc.text if hasattr(doc, "text") else str(doc)
            metadata = getattr(doc, "metadata", {})
            # Extract fields from the SAENarrative dataclass if available.
            row: dict[str, Any] = {
                "doc_id": getattr(doc, "doc_id", f"SAE-{i + 1:04d}"),
                "site": _span_value(doc, "site_id", f"SITE-{(i % 5) + 1}"),
                "subject": _span_value(doc, "other_unique_id", f"SUBJ-{i + 1:04d}"),
                "ae": metadata.get("ae_category", "Thrombocytopenia"),
                "grade": _grade_int(metadata.get("grade", (i % 4) + 1)),
                "onset_day": (i % 28) + 1,
                "dose_mg": _dose_float(_span_value(doc, "dose", "50mg")),
                "outcome": _outcome(text),
            }
            rows.append(row)
        _DATASET.extend(rows)
    except Exception:  # noqa: BLE001 — fall back to static fixture
        for i in range(20):
            _DATASET.append({
                "doc_id": f"SAE-{i + 1:04d}",
                "site": f"SITE-{(i % 5) + 1}",
                "subject": f"SUBJ-{i + 1:04d}",
                "ae": ["Thrombocytopenia", "Neutropenia", "ALT elevation"][i % 3],
                "grade": (i % 4) + 1,
                "onset_day": (i % 28) + 1,
                "dose_mg": [25.0, 50.0, 75.0][i % 3],
                "outcome": ["Resolved", "Resolving", "Ongoing"][i % 3],
            })
    _DATASET_LOADED = True


# Extract a named attribute from a dataclass/object with a fallback default.
def _extract_field(obj: Any, name: str, default: Any) -> Any:
    return getattr(obj, name, default)


def _span_value(obj: Any, category: str, default: str) -> str:
    for span in getattr(obj, "spans", []):
        if getattr(getattr(span, "category", None), "value", None) == category:
            return str(getattr(span, "value", default))
    return default


def _grade_int(value: Any) -> int:
    match = re.search(r"[1-5]", str(value))
    return int(match.group(0)) if match else 1


def _dose_float(value: Any) -> float:
    match = re.search(r"\d+(?:\.\d+)?", str(value))
    return float(match.group(0)) if match else 50.0


def _outcome(text: str) -> str:
    match = re.search(r"outcome is reported as ([^.]+)", text, flags=re.IGNORECASE)
    return match.group(1).strip() if match else "Resolved"


# Write one hashed audit line for a dataset query (counts only, no raw cell values).
def _write_dataset_audit(
    query: DatasetQueryRequest,
    total_matched: int,
    rows_returned: int,
) -> None:
    _AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    query_hash = hashlib.sha256(
        json.dumps({"filters": query.filters, "sort": query.sort}).encode()
    ).hexdigest()
    record = {
        "request_id": uuid.uuid4().hex,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "kind": "dataset.query",
        "query_hash": query_hash,
        "total_matched": total_matched,
        "rows_returned": rows_returned,
    }
    with _AUDIT_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, separators=(",", ":")) + "\n")


# Annotate a cell value with a privacy placeholder if the column contains entities.
def _annotate_cell(col: DatasetColumn, value: Any) -> DatasetCell:
    if col.has_entities and isinstance(value, str):
        ph = f"<{col.name.upper()}_PLACEHOLDER>"
        return DatasetCell(
            value=value,
            entity=DatasetEntityAnnotation(placeholder=ph, category=col.name),
        )
    return DatasetCell(value=value, entity=None)


@router.get("/dataset/schema", response_model=DatasetSchemaResponse)
# Return the column schema and total row count for the synthetic clinical dataset.
async def dataset_schema() -> DatasetSchemaResponse:
    _ensure_dataset_loaded()
    return DatasetSchemaResponse(columns=_COLUMNS, total_rows=len(_DATASET))


@router.post("/dataset/query", response_model=DatasetQueryResponse)
# Filter, sort, and paginate the synthetic dataset; annotate entity-bearing cells.
async def dataset_query(req: DatasetQueryRequest) -> DatasetQueryResponse:
    _ensure_dataset_loaded()

    # Apply column-equality filters.
    rows = list(_DATASET)
    for col_name, value in req.filters.items():
        rows = [r for r in rows if str(r.get(col_name, "")).lower() == value.lower()]

    total_matched = len(rows)

    # Apply sorting.
    for col_name, direction in reversed(req.sort):
        reverse = direction == "desc"
        rows.sort(key=lambda r, c=col_name: (r.get(c) is None, r.get(c, "")), reverse=reverse)

    # Cursor-based pagination: cursor is the doc_id of the first row to return.
    if req.cursor:
        cursor_indices = [i for i, r in enumerate(rows) if r["doc_id"] == req.cursor]
        if cursor_indices:
            rows = rows[cursor_indices[0]:]

    page = rows[: req.page_size]
    next_cursor = rows[req.page_size]["doc_id"] if len(rows) > req.page_size else None

    col_map = {col.name: col for col in _COLUMNS}
    out_rows = [
        DatasetRow(
            row_id=r["doc_id"],
            cells={
                col_name: _annotate_cell(col_map[col_name], r.get(col_name))
                for col_name in r
                if col_name in col_map
            },
        )
        for r in page
    ]

    _write_dataset_audit(req, total_matched, len(out_rows))

    return DatasetQueryResponse(
        rows=out_rows,
        next_cursor=next_cursor,
        total_matched=total_matched,
    )
