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

    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_five_page_missing_constructor_matrix.py",
            "--output",
            args.output,
        ],
        check=True,
    )

    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    routes = '''const routes = [
  { page: "page5", targetId: "1691512", url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32", steps: [], marker: "target-read" },
];'''
    text, count = re.subn(r"const routes = \[.*?\n\];", routes, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"route block mismatch: {count}")

    text = replace_once(
        text,
        'const pairs = [{ name: "current", secondSource: currentSecond }, { name: "candidate", secondSource: candidatePatch.candidate }];',
        'const pairs = [{ name: "candidate", secondSource: candidatePatch.candidate }];',
        "candidate-only pair",
    )

    anchor = '''      await stage("after-dynamic-target-entry");
      result.targetScreenChanged = beforeHash !== result.screenshots["after-dynamic-target-entry"];
      result.targetWindow = requestWindow(requests, result.targetWindowStartIndex);'''
    inventory = '''      await stage("after-dynamic-target-entry");
      result.targetScreenChanged = beforeHash !== result.screenshots["after-dynamic-target-entry"];
      result.targetWindow = requestWindow(requests, result.targetWindowStartIndex);
      result.listSceneInventory = await page.evaluate(() => {
        const engine = globalThis.__gamsFivePageCanvasEngine;
        const list = Array.isArray(engine?._elementList) ? engine._elementList : [];
        const describeValue = (value) => {
          if (value === null) return null;
          if (["string", "number", "boolean"].includes(typeof value)) {
            return typeof value === "string" ? value.slice(0, 300) : value;
          }
          return undefined;
        };
        const nodes = list.map((node, index) => {
          if (!node) return { index, available: false };
          const primitiveProps = {};
          let keys = [];
          try { keys = Object.getOwnPropertyNames(node); } catch {}
          for (const key of keys) {
            if (!/(text|name|path|id|label|type|tag|title|caption|value)/i.test(key)) continue;
            let value;
            try { value = describeValue(node[key]); } catch { continue; }
            if (value !== undefined) primitiveProps[key] = value;
          }
          const eventMap = node.eventListenerMap || {};
          const eventNames = (() => { try { return Object.getOwnPropertyNames(eventMap); } catch { return []; } })();
          return {
            index,
            available: true,
            constructorName: (() => { try { return node.constructor?.name || ""; } catch { return ""; } })(),
            geometry: {
              x: node.x, y: node.y, width: node.width, height: node.height,
              zIndex: node.zIndex, visible: node._visible, touchable: node._touchable,
            },
            eventNames,
            clickable: Array.isArray(eventMap["mouse click"]) && eventMap["mouse click"].length > 0,
            texture: {
              commonPath: typeof node._commonPath === "string" ? node._commonPath.slice(-300) : null,
              activePath: typeof node._activePath === "string" ? node._activePath.slice(-300) : null,
            },
            primitiveProps,
          };
        });
        return {
          listLength: list.length,
          clickableCount: nodes.filter((node) => node.clickable).length,
          nodes,
        };
      });'''
    text = replace_once(text, anchor, inventory, "list scene inventory")

    tail_pattern = re.compile(r"function markerPassed\(item\).*\Z", re.S)
    tail = '''const candidateCase = cases.find((item) => item.pair === "candidate" && item.page === "page5");
const clickableNodes = candidateCase?.listSceneInventory?.nodes?.filter((node) => node?.clickable) || [];
const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  runtimeEntryCompleteCases: cases.filter((item) => item.states?.["runtime-open"]?.runtimePanelVisible && !item.states?.["runtime-close"]?.runtimePanelVisible && item.states?.["runtime-reopen"]?.runtimePanelVisible).length,
  noLoginEnabledCases: cases.filter((item) => item.states?.["runtime-open"]?.noLoginEnabledTextPresent).length,
  secondFileLoadCases: cases.filter((item) => item.runtimeLoads?.second > 0).length,
  candidatePageErrorCount: candidateCase?.pageErrors?.length || 0,
  candidateTargetReadCount: candidateCase?.targetWindow?.targetReadCount || 0,
  candidateTargetListCount: candidateCase?.targetWindow?.targetListCount || 0,
  engineLength: candidateCase?.engineCapture?.length || 0,
  inventoryLength: candidateCase?.listSceneInventory?.listLength || 0,
  clickableNodeCount: clickableNodes.length,
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  replacementCount: candidatePatch.count,
  guardReplacementCount: candidatePatch.guardCount,
  callbackReplacementCount: candidatePatch.callbackCount,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-list-scene-node-inventory",
  candidatePatch: {
    replacementCount: candidatePatch.count,
    guardReplacementCount: candidatePatch.guardCount,
    callbackReplacementCount: candidatePatch.callbackCount,
    oldTextSha256: candidatePatch.oldTextSha256,
    newTextSha256: candidatePatch.newTextSha256,
    currentSecondSize: Buffer.byteLength(currentSecond),
    currentSecondSha256: sha256(Buffer.from(currentSecond)),
    candidateSecondSize: Buffer.byteLength(candidatePatch.candidate),
    candidateSecondSha256: sha256(Buffer.from(candidatePatch.candidate)),
  },
  cases,
  summary,
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
};

report.pass = summary.totalCases === 1
  && summary.fatalCases === 0
  && summary.runtimeEntryCompleteCases === 1
  && summary.noLoginEnabledCases === 1
  && summary.secondFileLoadCases === 1
  && summary.candidatePageErrorCount === 0
  && summary.candidateTargetReadCount > 0
  && summary.candidateTargetListCount > 0
  && summary.engineLength >= 10
  && summary.inventoryLength > 0
  && summary.clickableNodeCount > 0
  && summary.blockedOrderCases === 0
  && summary.replacementCount === 2;

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\\n");
console.log(JSON.stringify({ pass: report.pass, ...summary }, null, 2));
if (!report.pass) process.exitCode = 1;
'''
    text, count = tail_pattern.subn(lambda _m: tail, text, count=1)
    if count != 1:
        raise SystemExit(f"tail block mismatch: {count}")

    text = text.replace(
        'const outputDir = process.env.OUTPUT_DIR || "five-page-missing-constructor-matrix";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-list-scene-inventory";',
        1,
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
