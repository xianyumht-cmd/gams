#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker mismatch: {count}")
    return text.replace(old, new, 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    output = Path(args.output)
    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_page5_post_title_mouseup_scope_probe.py",
            "--output",
            str(output),
        ],
        check=True,
    )
    text = output.read_text(encoding="utf-8")
    text = replace_once(
        text,
        'const outputDir = process.env.OUTPUT_DIR || "page5-post-title-mouseup-scope-probe";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-post-title-mouseup-bindings-probe";',
        "output",
    )
    text = replace_once(
        text,
        'mode: "page5-post-title-mouseup-scope-read-only-probe"',
        'mode: "page5-post-title-mouseup-bindings-read-only-probe"',
        "mode",
    )

    replacement = r'''      const own = await cdp.send("Runtime.getProperties", {
        objectId: evaluated.result.objectId,
        ownProperties: true,
        accessorPropertiesOnly: false,
        generatePreview: false,
      });
      const scopesInternal = (own.internalProperties || []).find((item) => item.name === "[[Scopes]]");
      if (!scopesInternal?.value?.objectId) throw new Error("callback scopes unavailable");
      const scopeList = await cdp.send("Runtime.getProperties", {
        objectId: scopesInternal.value.objectId,
        ownProperties: true,
        accessorPropertiesOnly: false,
        generatePreview: false,
      });
      const closureEntry = (scopeList.result || []).find((item) => item.name === "0" && item.value?.objectId)
        || (scopeList.result || []).find((item) => item.value?.objectId && String(item.value?.description || "").startsWith("Closure"));
      if (!closureEntry?.value?.objectId) throw new Error("callback closure unavailable");
      const closure = await cdp.send("Runtime.getProperties", {
        objectId: closureEntry.value.objectId,
        ownProperties: true,
        accessorPropertiesOnly: false,
        generatePreview: false,
      });
      const bindingNames = [
        "_0x4809da", "_0x8c6ff6", "_0x174c2a", "_0xfc6c96", "_0x344e98",
        "_0x424746", "_0x206ca1", "_0x41fc51", "_0x1bbdf5", "_0x2b2792",
        "_0x5be36d", "_0x4c1177", "_0x4d6b53", "_0x39cb87"
      ];
      const descriptors = new Map((closure.result || []).map((item) => [item.name, item]));
      const bindings = {};
      for (const name of bindingNames) {
        const descriptor = descriptors.get(name);
        if (!descriptor?.value) {
          bindings[name] = { available: false };
          continue;
        }
        const entry = { available: true, remote: summarizeRemote(descriptor.value) };
        if (descriptor.value.objectId) {
          const details = await cdp.send("Runtime.getProperties", {
            objectId: descriptor.value.objectId,
            ownProperties: true,
            accessorPropertiesOnly: false,
            generatePreview: false,
          }).catch(() => null);
          entry.propertyCount = details?.result?.length ?? null;
          entry.internalPropertyNames = (details?.internalProperties || []).map((item) => item.name);
          if (descriptor.value.type === "function") {
            const functionText = await cdp.send("Runtime.callFunctionOn", {
              objectId: descriptor.value.objectId,
              functionDeclaration: "function(){return Function.prototype.toString.call(this);}",
              returnByValue: true,
              silent: true,
            });
            const source = String(functionText.result?.value || "");
            entry.sourceLength = source.length;
            entry.sourceSha256 = sha256(Buffer.from(source));
            entry.source = source.slice(0, 24000);
          }
        }
        bindings[name] = entry;
      }
      report.pauseCaptured = true;
      report.pause = {
        reason: event.reason,
        hitBreakpoints: event.hitBreakpoints || [],
        topFrame: {
          functionName: frame.functionName || "",
          script: scriptMap.get(frame.location.scriptId) || null,
          location: frame.location,
        },
      };
      report.callback = {
        expressionLabel: "post-title fullscreen mouse-up listener",
        remote: summarizeRemote(evaluated.result),
        sourceLength: String(sourceResult.result?.value || "").length,
        sourceSha256: sha256(Buffer.from(String(sourceResult.result?.value || ""))),
        source: String(sourceResult.result?.value || "").slice(0, 12000),
        scopeCount: (scopeList.result || []).filter((item) => item.value?.objectId).length,
        closurePropertyCount: (closure.result || []).length,
        bindings,
      };'''

    pattern = re.compile(
        r'''      const described = await describeRemote\(cdp, evaluated\.result, 4, new Set\(\), true\);\n      report\.pauseCaptured = true;\n      report\.pause = \{.*?\n      report\.callback = \{.*?\n        structure: described,\n      \};''',
        re.S,
    )
    text, count = pattern.subn(lambda _: replacement, text, count=1)
    if count != 1:
        raise SystemExit(f"callback capture block mismatch: {count}")

    text = replace_once(
        text,
        "    && Boolean(report.callback?.structure)\n",
        "    && Boolean(report.callback?.bindings?._0x344e98?.sourceLength)\n",
        "pass binding gate",
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
