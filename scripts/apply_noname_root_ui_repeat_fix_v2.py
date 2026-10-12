#!/usr/bin/env python3
"""Corrected entry point for the source-native noname patch."""

from __future__ import annotations

import argparse
import importlib.util
import pathlib
import sys

MODULE_PATH = pathlib.Path("scripts/apply_noname_root_ui_repeat_fix.py")
NONAME_PATH = pathlib.Path("remote-script/src/noname.js")


def load_base():
    spec = importlib.util.spec_from_file_location("noname_root_patch", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load base patch module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify(text: str) -> None:
    exact_once = (
        'Symbol.for("gg.runtime.storage-hook.v2")',
        'Symbol.for("gg.runtime.xhr-open.v2")',
        'Symbol.for("gg.runtime.jsonp-create-element.v2")',
        'Symbol.for("gg.source.ui-mobile.v5")',
        'gg.source.xhr.v5',
        'gg.source.jsonp.v5',
    )
    for token in exact_once:
        count = text.count(token)
        if count != 1:
            raise RuntimeError(f"marker count mismatch for {token}: {count}")

    # The style id is intentionally referenced twice: one lookup and one assignment.
    style_id_count = text.count('gg-source-ui-mobile-v5')
    if style_id_count != 2:
        raise RuntimeError(f"style id count mismatch: {style_id_count}")

    forbidden = (
        'gg.runtime.experience.v4',
        'gg-v4-sheet',
        'new MutationObserver(scheduleInterfaceSync)',
        'gg-v4-fab-core',
    )
    for token in forbidden:
        if token in text:
            raise RuntimeError(f"forbidden runtime UI token remains: {token}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    base = load_base()
    source = NONAME_PATH.read_text(encoding="utf-8")
    if args.verify_only:
        verify(source)
        print("noname.js root-source v5 verified")
        return 0

    updated = base.patch(source)
    verify(updated)
    if updated == source:
        raise RuntimeError("noname.js did not change")
    NONAME_PATH.write_text(updated, encoding="utf-8", newline="")
    print(f"patched {NONAME_PATH}: {len(source)} -> {len(updated)} bytes")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
