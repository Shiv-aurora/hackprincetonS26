#!/usr/bin/env python3
# Walk all .py files under src/ and verify each def has a one-line explanation comment.
"""Enforce the CLAUDE.md invariant: every function def must have a one-line comment above it.

Usage:
    python scripts/check_comments.py [--path src/]
    python scripts/check_comments.py --path src/ngsp/pipeline.py

Exit codes:
    0 — no violations found
    1 — one or more violations found (printed to stdout)
"""
from __future__ import annotations

import argparse
import ast
import sys
import tokenize
import io
from pathlib import Path


# Collect all (lineno, col_offset, name) tuples for def statements in the AST.
def _collect_defs(tree: ast.Module) -> list[tuple[int, int, str]]:
    defs: list[tuple[int, int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            defs.append((node.lineno, node.col_offset, node.name))
    return defs


# Return a dict mapping line number → token type and string for comment tokens.
def _comment_lines(source: str) -> dict[int, str]:
    comments: dict[int, str] = {}
    try:
        tokens = tokenize.generate_tokens(io.StringIO(source).readline)
        for tok_type, tok_str, (srow, _), _, _ in tokens:
            if tok_type == tokenize.COMMENT:
                comments[srow] = tok_str
    except tokenize.TokenError:
        pass
    return comments


# Return True if the comment on comment_lineno directly precedes def_lineno.
def _is_direct_predecessor(
    comment_lineno: int,
    def_lineno: int,
    source_lines: list[str],
) -> bool:
    # Walk backwards from def_lineno - 1 to comment_lineno, allowing only
    # decorator lines (starting with @) and blank lines between them.
    for lineno in range(def_lineno - 1, comment_lineno, -1):
        line = source_lines[lineno - 1].strip()
        if line and not line.startswith("@") and not line.startswith("#"):
            return False
    return True


# Check a single Python source file and return a list of violation descriptions.
def check_file(path: Path) -> list[str]:
    source = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        return [f"{path}: SyntaxError — {exc}"]

    defs = _collect_defs(tree)
    comments = _comment_lines(source)
    source_lines = source.splitlines()
    violations: list[str] = []

    for def_lineno, _col, name in defs:
        # Find the closest comment that is a direct predecessor of this def.
        found = False
        for lineno in range(def_lineno - 1, 0, -1):
            line = source_lines[lineno - 1].strip()
            if not line:
                continue
            if line.startswith("@"):
                continue
            if lineno in comments and _is_direct_predecessor(lineno, def_lineno, source_lines):
                found = True
            break

        if not found:
            violations.append(f"{path}:{def_lineno}: def {name!r} has no one-line comment above it")

    return violations


# Walk a path (file or directory) and collect violations from all .py files.
def check_path(root: Path) -> list[str]:
    violations: list[str] = []
    targets = [root] if root.is_file() else sorted(root.rglob("*.py"))
    for p in targets:
        violations.extend(check_file(p))
    return violations


# Parse CLI arguments: --path defaults to src/.
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Check one-line comment invariant for all defs")
    p.add_argument("--path", type=Path, default=Path("src"), help="File or directory to check")
    return p.parse_args()


# Run the checker on the given path and exit with code 0 (no violations) or 1.
def main() -> int:
    args = parse_args()
    violations = check_path(args.path)
    if violations:
        print(f"FAIL — {len(violations)} violation(s) found:\n")
        for v in violations:
            print(f"  {v}")
        return 1
    print(f"OK — all defs have a one-line comment directly above. ({args.path})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
