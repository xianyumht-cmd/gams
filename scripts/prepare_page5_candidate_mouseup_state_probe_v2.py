#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker mismatch: {count}")
    return text.replace(old, new, 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="scripts/run_page5_candidate_mouseup_state_probe.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    text = Path(args.source).read_text(encoding="utf-8")
    text = replace_once(
        text,
        'const outputDir = process.env.OUTPUT_DIR || "page5-candidate-mouseup-state-probe";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-candidate-mouseup-state-probe-v2";',
        "output",
    )
    text = replace_once(
        text,
        'mode: "page5-candidate-mouseup-state-read-only-probe"',
        'mode: "page5-candidate-mouseup-state-read-only-probe-v2"',
        "mode",
    )

    marker = '  await context.addInitScript({ content: wrapFirstFile(transformFirstFile(firstRaw)) });\n'
    guard = '''  await context.addInitScript({ content: `
    (()=>{const state=globalThis.__gamsNavigationGuard=globalThis.__gamsNavigationGuard||{supported:false,blocked:[],allowed:[]};
      try{if(globalThis.navigation&&typeof globalThis.navigation.addEventListener==='function'){state.supported=true;globalThis.navigation.addEventListener('navigate',(event)=>{try{const url=new URL(event.destination.url,location.href);if(url.protocol!=='http:'&&url.protocol!=='https:'){state.blocked.push({url:url.protocol+'//'+url.host+url.pathname,at:Date.now()});if(event.cancelable)event.preventDefault();return;}state.allowed.push({url:url.protocol+'//'+url.host+url.pathname,at:Date.now()});}catch(error){state.blocked.push({url:String(event.destination?.url||'').slice(0,300),at:Date.now()});if(event.cancelable)event.preventDefault();}});}}catch(error){state.error=String(error).slice(0,300);}})();
  ` });
  await context.addInitScript({ content: wrapFirstFile(transformFirstFile(firstRaw)) });
'''
    text = replace_once(text, marker, guard, "navigation guard")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
