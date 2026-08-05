#!/usr/bin/env python3
from __future__ import annotations

import argparse
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
            "scripts/prepare_page5_direct_node_bridge_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )
    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    old_inventory = '''    result.directNodeInventory = await page.evaluate(() => {
      const engine = globalThis.__gamsDirectCanvasEngine;
      const node = engine?._elementList?.[9];
      const entries = node?.eventListenerMap?.["mouse click"];
      const entry = Array.isArray(entries) ? entries[0] : null;
      return {
        engineAvailable: Boolean(engine),
        listLength: Array.isArray(engine?._elementList) ? engine._elementList.length : null,
        nodeAvailable: Boolean(node),
        geometry: node ? { x: node.x, y: node.y, width: node.width, height: node.height, visible: node._visible, touchable: node._touchable } : null,
        eventNames: node?.eventListenerMap ? Object.getOwnPropertyNames(node.eventListenerMap) : [],
        clickEntryAvailable: Boolean(entry),
        clickEntryKeys: entry ? Object.getOwnPropertyNames(entry) : [],
        listenerType: typeof entry?.listener,
        listenerArity: typeof entry?.listener === "function" ? entry.listener.length : null,
      };
    });'''
    new_inventory = '''    result.directNodeInventory = await page.evaluate(() => {
      const engine = globalThis.__gamsDirectCanvasEngine;
      const node = engine?._elementList?.[9];
      const describeValue = (value) => {
        const type = value === null ? "null" : typeof value;
        const result = { type };
        if (type === "object" || type === "function") {
          try { result.constructorName = value?.constructor?.name || ""; } catch { result.constructorName = ""; }
          try { result.ownKeys = Object.getOwnPropertyNames(value).slice(0, 80); } catch { result.ownKeys = []; }
        } else if (type === "string") {
          result.stringLength = value.length;
        } else if (type === "number" || type === "boolean" || type === "undefined") {
          result.value = value;
        }
        return result;
      };
      const describeEntry = (eventName) => {
        const entries = node?.eventListenerMap?.[eventName];
        const entry = Array.isArray(entries) ? entries[0] : null;
        let source = null;
        if (typeof entry?.listener === "function") {
          try { source = Function.prototype.toString.call(entry.listener).slice(0, 5000); } catch {}
        }
        return {
          eventName,
          entryAvailable: Boolean(entry),
          entryKeys: entry ? Object.getOwnPropertyNames(entry) : [],
          listenerType: typeof entry?.listener,
          listenerName: typeof entry?.listener === "function" ? (entry.listener.name || "") : null,
          listenerArity: typeof entry?.listener === "function" ? entry.listener.length : null,
          listenerSource: source,
          caller: describeValue(entry?.caller),
          param: describeValue(entry?.param),
          hasOwnCaller: Boolean(entry && Object.prototype.hasOwnProperty.call(entry, "caller")),
          hasOwnParam: Boolean(entry && Object.prototype.hasOwnProperty.call(entry, "param")),
        };
      };
      return {
        engineAvailable: Boolean(engine),
        listLength: Array.isArray(engine?._elementList) ? engine._elementList.length : null,
        nodeAvailable: Boolean(node),
        geometry: node ? { x: node.x, y: node.y, width: node.width, height: node.height, visible: node._visible, touchable: node._touchable } : null,
        eventNames: node?.eventListenerMap ? Object.getOwnPropertyNames(node.eventListenerMap) : [],
        eventContracts: ["mouse down", "mouse up", "mouse click"].map(describeEntry),
      };
    });'''
    text = replace_once(text, old_inventory, new_inventory, "direct inventory")

    old_trigger = '''    result.directNodeTrigger = await page.evaluate(() => {
      const engine = globalThis.__gamsDirectCanvasEngine;
      const node = engine?._elementList?.[9];
      const entry = node?.eventListenerMap?.["mouse click"]?.[0];
      if (!entry || typeof entry.listener !== "function") return { ok: false, reason: "target click entry unavailable" };
      try {
        const value = Reflect.apply(entry.listener, entry.caller || node, [entry.param]);
        return { ok: true, returnType: value === null ? "null" : typeof value };
      } catch (error) {
        return { ok: false, reason: String(error?.stack || error).slice(0, 1000) };
      }
    });
    events.push({ at: Date.now(), type: "direct-node-click", nodeIndex: 9, result: result.directNodeTrigger });'''
    new_trigger = '''    result.directNodeTrigger = await page.evaluate(() => {
      const engine = globalThis.__gamsDirectCanvasEngine;
      const node = engine?._elementList?.[9];
      const invoke = (eventName) => {
        const entry = node?.eventListenerMap?.[eventName]?.[0];
        if (!entry || typeof entry.listener !== "function") {
          return { eventName, ok: false, reason: "entry unavailable" };
        }
        try {
          const args = Object.prototype.hasOwnProperty.call(entry, "param") ? [entry.param] : [];
          const value = Reflect.apply(entry.listener, entry.caller, args);
          return {
            eventName,
            ok: true,
            argumentCount: args.length,
            callerType: entry.caller === null ? "null" : typeof entry.caller,
            returnType: value === null ? "null" : typeof value,
          };
        } catch (error) {
          return { eventName, ok: false, reason: String(error?.stack || error).slice(0, 1600) };
        }
      };
      const steps = [invoke("mouse down"), invoke("mouse up"), invoke("mouse click")];
      return { ok: steps.every((item) => item.ok), sequence: "mouse down -> mouse up -> mouse click", steps };
    });
    events.push({ at: Date.now(), type: "direct-node-sequence", nodeIndex: 9, result: result.directNodeTrigger });'''
    text = replace_once(text, old_trigger, new_trigger, "direct trigger")

    text = text.replace(
        'mode: "page5-direct-node-empty-callback-bridge-probe"',
        'mode: "page5-direct-node-sequence-empty-callback-bridge-probe"',
        1,
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
