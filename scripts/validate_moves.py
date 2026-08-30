#!/usr/bin/env python3
"""Validates moves.json before it goes live. Run locally with:
    python3 scripts/validate_moves.py
Also runs automatically on every push/PR via the GitHub Action.
"""
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOVES_JSON = os.path.join(REPO_ROOT, "moves.json")

REQUIRED_FIELDS = [
    "id", "name", "category", "author", "wrestler",
    "wrestlerImage", "preview", "download", "counterId",
]

errors = []
warnings = []


def check_local_asset(path, context):
    """Only checks files that live in this repo — skips http(s) URLs."""
    if not path or path.startswith("http"):
        return
    full_path = os.path.join(REPO_ROOT, path)
    if not os.path.isfile(full_path):
        errors.append(f"{context}: referenced file does not exist: {path}")


def main():
    if not os.path.isfile(MOVES_JSON):
        print("::error::moves.json not found at repo root")
        sys.exit(1)

    with open(MOVES_JSON, encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"::error::moves.json is not valid JSON: {e}")
            sys.exit(1)

    categories = data.get("categories", [])
    if not isinstance(categories, list) or not categories:
        errors.append("top-level 'categories' array is missing or empty")

    moves = data.get("moves", [])
    if not isinstance(moves, list):
        errors.append("top-level 'moves' must be an array")
        moves = []

    seen_ids = set()
    seen_counter_ids = set()

    for i, move in enumerate(moves):
        label = f"moves[{i}]"
        if not isinstance(move, dict):
            errors.append(f"{label}: entry is not an object")
            continue

        name = move.get("name", "(no name)")
        label = f"moves[{i}] \"{name}\""

        for field in REQUIRED_FIELDS:
            if not move.get(field):
                errors.append(f"{label}: missing or empty required field '{field}'")

        move_id = move.get("id")
        if move_id:
            if move_id in seen_ids:
                errors.append(f"{label}: duplicate id '{move_id}'")
            seen_ids.add(move_id)

        counter_id = move.get("counterId")
        if counter_id:
            if counter_id in seen_counter_ids:
                errors.append(f"{label}: duplicate counterId '{counter_id}' — downloads will double-count with another move")
            seen_counter_ids.add(counter_id)

        category = move.get("category")
        if category and categories and category not in categories:
            errors.append(f"{label}: category '{category}' is not in the top-level categories list")

        for field in ("wrestlerImage", "preview", "previewWebm"):
            check_local_asset(move.get(field), label)

        # A missing download file is common for WIP moves — don't hard-fail
        # the build over it, just flag it so it doesn't go unnoticed forever.
        download_path = move.get("download")
        if download_path and not download_path.startswith("http"):
            full_path = os.path.join(REPO_ROOT, download_path)
            if not os.path.isfile(full_path):
                warnings.append(f"{label}: download file not found yet: {download_path} (fine if this move is still WIP)")

        if not move.get("previewWebm"):
            warnings.append(f"{label}: no previewWebm fallback set — some browsers/environments can fail to play mp4-only clips")

    if warnings:
        print("Warnings:")
        for w in warnings:
            print(f"::warning::{w}")

    if errors:
        print("\nErrors:")
        for e in errors:
            print(f"::error::{e}")
        print(f"\n{len(errors)} error(s) found — see above.")
        sys.exit(1)

    print(f"moves.json OK — {len(moves)} move(s), {len(categories)} categories, no errors.")


if __name__ == "__main__":
    main()
