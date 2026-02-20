#!/usr/bin/env python3
"""
Build a single JSON bundle from poem YAML sources.

Reads poems/index.json for ordering, parses each YAML poem file,
and writes poems/poems-bundle.json for the browser to fetch in one request.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parent.parent
POEMS_DIR = REPO_ROOT / "poems"
MANIFEST_PATH = POEMS_DIR / "index.json"
BUNDLE_PATH = POEMS_DIR / "poems-bundle.json"


def main() -> None:
    with MANIFEST_PATH.open("r", encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)

    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("Invalid manifest: expected non-empty 'files' array")

    bundled_poems = []
    for filename in files:
        if not isinstance(filename, str) or not filename.endswith(".yaml"):
            raise ValueError(f"Invalid manifest entry: {filename!r}")

        poem_path = POEMS_DIR / filename
        with poem_path.open("r", encoding="utf-8") as poem_file:
            poem_data = yaml.safe_load(poem_file)

        if not isinstance(poem_data, dict):
            raise ValueError(f"Invalid poem structure in {filename}: expected object")

        bundled_poems.append(poem_data)

    payload = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "files": files,
        "poems": bundled_poems,
    }

    with BUNDLE_PATH.open("w", encoding="utf-8") as output_file:
        json.dump(payload, output_file, ensure_ascii=False, indent=2)
        output_file.write("\n")

    print(f"Wrote {BUNDLE_PATH.relative_to(REPO_ROOT)} with {len(bundled_poems)} poems.")


if __name__ == "__main__":
    main()
