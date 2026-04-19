# Code Audit — One-Line Comment Invariant

## Audit Procedure

Every Python file in `src/` is checked by `scripts/check_comments.py`, which:
1. Parses the file with `ast.parse` to enumerate all `FunctionDef` and `AsyncFunctionDef` nodes.
2. Tokenizes the file to locate `COMMENT` tokens.
3. For each `def`, walks backward from its line number through any intervening decorator lines (`@`) and blank lines. A one-line comment must appear as a direct predecessor (only decorators and blank lines allowed between the comment and the `def`).

The invariant is from `CLAUDE.md` §5: "Every function has a one-line comment directly above its `def` line."

## Audit Results

### Phase 3 completion (2026-04-18)

```
python3 scripts/check_comments.py --path src/
OK — all defs have a one-line comment directly above. (src)
```

**Files checked (26):**
- `src/attacks/__init__.py`
- `src/attacks/inversion.py`
- `src/attacks/membership.py`
- `src/attacks/similarity.py`
- `src/attacks/utility.py`
- `src/attacks/verbatim.py`
- `src/data/__init__.py`
- `src/data/_fakers.py`
- `src/data/_vocab.py`
- `src/data/annotator.py`
- `src/data/canary.py`
- `src/data/schemas.py`
- `src/data/synthetic_monitoring.py`
- `src/data/synthetic_protocol.py`
- `src/data/synthetic_sae.py`
- `src/data/synthetic_writing.py`
- `src/ngsp/__init__.py`
- `src/ngsp/answer_applier.py`
- `src/ngsp/dp_mechanism.py`
- `src/ngsp/entity_extractor.py`
- `src/ngsp/local_model.py`
- `src/ngsp/pipeline.py`
- `src/ngsp/proxy_decoder.py`
- `src/ngsp/query_synthesizer.py`
- `src/ngsp/remote_client.py`
- `src/ngsp/router.py`
- `src/ngsp/safe_harbor.py`

**Violations:** 0

## Special Cases Handled

**Pydantic validators with decorator chains.** CLAUDE.md requires the comment directly above the `def`, which means it must appear between the last decorator and the `def` line (not above the decorator chain). For example:

```python
@field_validator("model_id")
@classmethod
# Reject empty model IDs early; from_pretrained would give a confusing error later.
def _nonempty_model_id(cls, v: str) -> str:
    ...
```

The checker correctly handles this case: it walks backward from the `def` line through decorator lines and blank lines, accepting a comment at any point in that span.

**`__init__` files.** Files with no function definitions (e.g., `src/ngsp/__init__.py`, `src/attacks/__init__.py`) pass trivially with zero defs and zero violations.

## Spot-Check: H₁' System Changes (2026-04-18)

Two files were modified as part of the quasi-identifier stripping fix. Manual spot-check confirms both satisfy the one-line comment invariant.

### `src/ngsp/safe_harbor.py` — new public function `apply_span_stripping`

```python
# Replace spans in `text` with typed placeholders, extending entity_map in place; returns updated text.
def apply_span_stripping(
    text: str,
    spans: "list[Any]",
    entity_map: "dict[str, str]",
    counters: "dict[str, int] | None" = None,
) -> str:
```

One-line comment present and correctly describes the function's contract. **PASS.**

### `src/ngsp/pipeline.py` — Phase B extension

The added call site in `Pipeline.run` is not a new `def`, so no comment requirement applies. The existing `run` method retains its comment:

```python
# Run the full pipeline for one user request; mutates `budget` to record ε spent.
def run(self, user_input: str, budget: SessionBudget) -> PipelineOutput:
```

**PASS.** No new violations introduced by the H₁' patch.

## Spot-Check: Improvement Changes (2026-04-19)

Two files were modified as part of the targeted improvements following the v1 attack results. Neither introduces a new public function in the sense of a callable `def`; both add module-level constants and a new private helper. Manual spot-check confirms the invariant is satisfied for all new `def` lines.

### `src/ngsp/safe_harbor.py` — new regex patterns

Four new module-level `re.Pattern` objects were added (`_PAT_SITE_ID`, `_PAT_COMPOUND_CODE`, `_PAT_DOSE`, `_PAT_AE_GRADE`) and appended to `_REGEX_RULES`. These are constants, not functions. The invariant does not apply to constants. No new `def` lines. **No violations.**

The extended `_PAT_DATE` pattern is a modification of an existing constant. **No violations.**

### `src/ngsp/router.py` — new private helper and constant

One new module-level constant (`_HIGH_SENSITIVITY_CATEGORIES: frozenset`) and two new items:

```python
# High-sensitivity clinical quasi-identifier categories that must not go through dp_tolerant.
# These are structured short tokens that the DP decoder cannot suppress (verbatim leak ~75-100%).
_HIGH_SENSITIVITY_CATEGORIES: frozenset[SensitiveCategory] = frozenset({...})

# Return True when the span profile contains clinical identifiers that the dp_tolerant path leaks.
def _has_high_sensitivity_spans(spans: list[SensitiveSpan]) -> bool:
    ...
```

The new `def _has_high_sensitivity_spans` has a one-line comment directly above it. **PASS.**

The `route()` function was extended with an override branch (an `if` statement, not a new `def`). The existing one-line comment on `route()` remains correct. **PASS.**

**Overall: zero violations introduced by the improvement changes.**

---

## CI Integration

To run the check in CI, add to your test runner:

```bash
python3 scripts/check_comments.py --path src/
```

This exits with code 0 on success, code 1 on any violation. It can be added as a pre-commit hook or a GitHub Actions step.
