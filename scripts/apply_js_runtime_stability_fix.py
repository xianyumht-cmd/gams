#!/usr/bin/env python3
"""Apply narrowly scoped runtime-stability fixes to restored JS payloads.

The patch deliberately leaves feature/business branches intact. It only:
- removes Object.prototype state aliases and replaces them with window-local aliases;
- makes XHR/JSONP hooks idempotent and re-entry safe;
- removes anti-tamper branches that allocate huge arrays and recurse forever;
- makes the engine load guard recover from an interrupted/stale load.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys
from typing import Iterable


NONAME_PATH = pathlib.Path("remote-script/src/noname.js")
GAME_PATH = pathlib.Path("game-engine/release/game-1.0.5.js")


class PatchError(RuntimeError):
    pass


def _looks_like_regex_start(text: str, index: int) -> bool:
    """Best-effort JavaScript regex-literal detection for balanced scanning."""
    j = index - 1
    while j >= 0 and text[j].isspace():
        j -= 1
    if j < 0:
        return True
    if text[j] in "([{:;,=!?&|+-*%^~<>\n":
        return True
    k = j
    while k >= 0 and (text[k].isalnum() or text[k] in "_$"):
        k -= 1
    return text[k + 1 : j + 1] in {"return", "case", "throw", "else", "do", "typeof", "instanceof", "in", "of", "yield", "await"}


def find_matching_brace(text: str, open_index: int) -> int:
    if open_index >= len(text) or text[open_index] != "{":
        raise PatchError(f"expected opening brace at {open_index}")

    depth = 0
    quote: str | None = None
    escaped = False
    line_comment = False
    block_comment = False
    regex = False
    regex_class = False
    i = open_index

    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if line_comment:
            if ch in "\r\n":
                line_comment = False
            i += 1
            continue
        if block_comment:
            if ch == "*" and nxt == "/":
                block_comment = False
                i += 2
            else:
                i += 1
            continue
        if quote is not None:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if regex:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "[":
                regex_class = True
            elif ch == "]" and regex_class:
                regex_class = False
            elif ch == "/" and not regex_class:
                regex = False
            i += 1
            continue

        if ch in "'\"`":
            quote = ch
            i += 1
            continue
        if ch == "/" and nxt == "/":
            line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue
        if ch == "/" and _looks_like_regex_start(text, i):
            regex = True
            regex_class = False
            i += 1
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
            if depth < 0:
                raise PatchError(f"brace underflow near {i}")
        i += 1

    raise PatchError(f"unclosed brace at {open_index}")


def replace_method_body(text: str, marker: str, new_body: str) -> str:
    start = text.find(marker)
    if start < 0:
        raise PatchError(f"method marker not found: {marker}")
    if text.find(marker, start + len(marker)) >= 0:
        raise PatchError(f"method marker is not unique: {marker}")
    open_index = text.find("{", start + len(marker))
    if open_index < 0:
        raise PatchError(f"method opening brace not found: {marker}")
    close_index = find_matching_brace(text, open_index)
    body = "{\n" + new_body.strip("\n") + "\n    }"
    return text[:open_index] + body + text[close_index + 1 :]


STORAGE_BODY = r'''
      const marker=Symbol.for("gg.runtime.storage-hook.v2");
      if(window[marker]) {
        return
      }
      Object["entrie"+"s"](mIpEbB)["forEach"](([publicName,backingName])=> {
        const legacyDescriptor=Object.getOwnPropertyDescriptor(Object.prototype,publicName);
        if(legacyDescriptor&&legacyDescriptor.configurable) {
          delete Object.prototype[publicName]
        }
        const currentDescriptor=Object.getOwnPropertyDescriptor(window,publicName);
        if(currentDescriptor&&!currentDescriptor.configurable) {
          return
        }
        Object.defineProperty(window,publicName, {
          get:()=> {
            const value=window[backingName];
            return publicName==="mallViewData"?zjEv2f["patchMallViewData"](value):value
          },
          set(value) {
            window[backingName]=publicName==="showLocal"&&value===false?true:value
          },
          enumerable:false,
          configurable:true
        })
      });
      Object.defineProperty(window,marker, {
        value:true,
        enumerable:false,
        configurable:true,
        writable:false
      })'''


XHR_BODY = r'''
      const marker=Symbol.for("gg.runtime.xhr-open.v2"),
      requestUrlKey=Symbol.for("gg.runtime.xhr-url.v2"),
      prototype=XMLHttpRequest.prototype;
      if(prototype[marker]) {
        return
      }
      const originalOpen=prototype.open;
      Object.defineProperty(prototype,marker, {
        value:originalOpen,
        enumerable:false,
        configurable:true,
        writable:false
      });
      prototype.open=function(...args) {
        let patchedUrl=args[1];
        try {
          patchedUrl=zjEv2f["patchG"+"ameFlo"+"wUrl"](String(args[1]))
        }
        catch(error) {
          patchedUrl=args[1]
        }
        args[1]=patchedUrl;
        this[requestUrlKey]=String(patchedUrl);
        originalOpen.apply(this,args);
        const onReadyStateChange=()=> {
          if(this.readyState!==4) {
            return
          }
          this.removeEventListener("readystatechange",onReadyStateChange);
          if(this.status!==200) {
            return
          }
          const responseType=this.responseType||"";
          if(responseType!==""&&responseType!=="text") {
            return
          }
          if(!pw0zF4["enable"+"FreeMo"+"de"]) {
            return
          }
          if(!this[requestUrlKey].includes("/createBuyOrder")) {
            return
          }
          try {
            Object.defineProperty(this,"responseText", {
              value:zjEv2f["buildC"+"reateO"+"rderRe"+"sponse"](this[requestUrlKey]),
              writable:true,
              configurable:true
            })
          }
          catch(error) {
            console.error("请求拦截失败：",error)
          }
        };
        this.addEventListener("readystatechange",onReadyStateChange)
      }'''


JSONP_BODY = r'''
      const marker=Symbol.for("gg.runtime.jsonp-create-element.v2");
      if(document[marker]) {
        return
      }
      const originalCreateElement=document.createElement,
      scriptMarker=Symbol.for("gg.runtime.jsonp-script-src.v2"),
      nativeSrcDescriptor=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,"src");
      document.createElement=function(tagName,...args) {
        const node=originalCreateElement.call(this,tagName,...args);
        if(String(tagName).toLowerCase()!=="script"||node[scriptMarker]) {
          return node
        }
        Object.defineProperty(node,scriptMarker, {
          value:true,
          configurable:true
        });
        const setNativeSrc=value=> {
          if(nativeSrcDescriptor&&typeof nativeSrcDescriptor.set==="function") {
            return nativeSrcDescriptor.set.call(node,value)
          }
          return node.setAttribute("src",value)
        },
        getNativeSrc=()=> {
          if(nativeSrcDescriptor&&typeof nativeSrcDescriptor.get==="function") {
            return nativeSrcDescriptor.get.call(node)
          }
          return node.getAttribute("src")
        };
        Object.defineProperty(node,"src", {
          set(value) {
            const source=String(value);
            if(pw0zF4["enableFreeMode"]&&source.includes("createBuyOrder")) {
              try {
                const params=new URL(source,document.baseURI).searchParams,
                goodsId=params.get("goods_id"),
                buyNum=params.get("buy_num"),
                callbackName=params.get("jsonCallback");
                if(goodsId&&buyNum&&callbackName) {
                  const payload= {
                    status:1,
                    msg:"successful",
                    data: {
                      goods_id:goodsId,
                      order_id:zCSo6J["generateTimestamp"](),
                      buy_num:parseInt(buyNum,10)
                    }
                  },
                  currentCallback=window[callbackName];
                  if(currentCallback&&currentCallback.__ggRuntimeJsonpState) {
                    currentCallback.__ggRuntimeJsonpState.queue.push(payload)
                  }
                  else {
                    const state= {
                      original:currentCallback,
                      queue:[payload],
                      timer:0
                    },
                    dispatcher=function(...callbackArgs) {
                      const replacement=state.queue.shift();
                      try {
                        if(typeof state.original==="function") {
                          return replacement?state.original(replacement):state.original(...callbackArgs)
                        }
                      }
                      finally {
                        if(state.queue.length===0&&window[callbackName]===dispatcher) {
                          clearTimeout(state.timer);
                          if(typeof state.original==="function") {
                            window[callbackName]=state.original
                          }
                          else {
                            delete window[callbackName]
                          }
                        }
                      }
                    };
                    Object.defineProperty(dispatcher,"__ggRuntimeJsonpState", {
                      value:state,
                      configurable:true
                    });
                    state.timer=setTimeout(()=> {
                      if(window[callbackName]===dispatcher) {
                        if(typeof state.original==="function") {
                          window[callbackName]=state.original
                        }
                        else {
                          delete window[callbackName]
                        }
                      }
                    },30000);
                    window[callbackName]=dispatcher
                  }
                }
              }
              catch(error) {
                console.error("JSONP拦截初始化失败：",error)
              }
            }
            return setNativeSrc(source)
          },
          get() {
            return getNativeSrc()
          },
          enumerable:true,
          configurable:true
        });
        return node
      };
      Object.defineProperty(document,marker, {
        value:originalCreateElement,
        enumerable:false,
        configurable:true,
        writable:false
      })'''


def patch_noname(text: str) -> str:
    original = text
    text = replace_method_body(text, '["initSt"+"orageH"+"ook"]()', STORAGE_BODY)
    text = replace_method_body(text, '["initXh"+"rHook"](...vUYe8N)', XHR_BODY)
    text = replace_method_body(text, '["initJs"+"onpHoo"+"k"]()', JSONP_BODY)
    if text == original:
        raise PatchError("noname.js was not changed")
    return text


def _skip_space(text: str, index: int) -> int:
    while index < len(text) and text[index].isspace():
        index += 1
    return index


def strip_resource_exhaustion_guards(text: str) -> tuple[str, int]:
    marker = "void function(){var G=window,V='"
    cursor = 0
    pieces: list[str] = []
    removed = 0

    while True:
        start = text.find(marker, cursor)
        if start < 0:
            pieces.append(text[cursor:])
            break
        pieces.append(text[cursor:start])
        open_index = text.find("{", start)
        close_index = find_matching_brace(text, open_index)
        end = _skip_space(text, close_index + 1)
        if not text.startswith("()", end):
            pieces.append(text[start:close_index + 1])
            cursor = close_index + 1
            continue
        end += 2
        end = _skip_space(text, end)
        if end < len(text) and text[end] == ";":
            end += 1
        candidate = text[start:end]
        signatures = (
            "Function['prototype']['toString']['call']",
            "requestAnimationFrame",
            "new Array(",
            "['sort']()['reverse']()",
            "parseInt('0x",
        )
        if all(signature in candidate for signature in signatures):
            removed += 1
            cursor = end
        else:
            pieces.append(candidate)
            cursor = end

    return "".join(pieces), removed


def patch_engine_wrapper(text: str) -> str:
    prefix_re = re.compile(
        r"/\*1\.0\.5\*/\(function\(\)\{try\{var __ggGlobal=.*?window\.__gg_engine_load_state__=\"loading\";try\{",
        re.DOTALL,
    )
    replacement = (
        '/*1.0.5*/(function(){var __ggGlobal=typeof window!=="undefined"?window:globalThis;'
        'var __ggNow=Date.now(),__ggState=__ggGlobal.__gg_engine_load_state__,'
        '__ggStarted=Number(__ggGlobal.__gg_engine_load_started_at__||0);'
        'if(__ggState==="ready")return;'
        'if(__ggState==="loading"&&__ggStarted>0&&__ggNow-__ggStarted<15000)return;'
        '__ggGlobal.__gg_engine_load_state__="loading";'
        '__ggGlobal.__gg_engine_load_started_at__=__ggNow;try{'
    )
    text, prefix_count = prefix_re.subn(replacement, text, count=1)
    if prefix_count != 1:
        raise PatchError(f"engine wrapper prefix replacement count={prefix_count}")

    suffix_re = re.compile(
        r'try\{Object\.defineProperty\(window,"__gg_runtime_probe__",\{value:Object\.freeze\(\{engine:"1\.0\.4",ready:true,loadedAt:Date\.now\(\)\}\),enumerable:false,configurable:false,writable:false\}\);\}catch\(_\)\{\}window\.__gg_engine_load_state__="ready";\}catch\(e\)\{window\.__gg_engine_load_state__="";throw e;\}\}\)\(\);$'
    )
    suffix = (
        'try{Object.defineProperty(window,"__gg_runtime_probe__",'
        '{value:Object.freeze({engine:"1.0.5",ready:true,loadedAt:Date.now()}),'
        'enumerable:false,configurable:true,writable:false});}catch(_){}'
        '__ggGlobal.__gg_engine_load_state__="ready";'
        '__ggGlobal.__gg_engine_load_started_at__=0;'
        '}catch(e){__ggGlobal.__gg_engine_load_state__="";'
        '__ggGlobal.__gg_engine_load_started_at__=0;throw e;}})();'
    )
    text, suffix_count = suffix_re.subn(suffix, text, count=1)
    if suffix_count != 1:
        raise PatchError(f"engine wrapper suffix replacement count={suffix_count}")
    return text


def patch_game(text: str) -> tuple[str, int]:
    original = text
    text = patch_engine_wrapper(text)
    text, removed = strip_resource_exhaustion_guards(text)
    if removed < 1:
        raise PatchError("no resource-exhaustion protection guard was removed")
    if text == original:
        raise PatchError("game.js was not changed")
    return text, removed


def verify_noname(text: str) -> None:
    required = (
        'Symbol.for("gg.runtime.storage-hook.v2")',
        'Symbol.for("gg.runtime.xhr-open.v2")',
        'Symbol.for("gg.runtime.jsonp-create-element.v2")',
    )
    for marker in required:
        if text.count(marker) != 1:
            raise PatchError(f"noname marker count invalid: {marker}={text.count(marker)}")

    dangerous = (
        'Object["defineProperty"](Object["prototype"]',
        'Object.defineProperty(Object.prototype',
    )
    for token in dangerous:
        if token in text:
            raise PatchError(f"Object.prototype pollution remains: {token}")


def verify_game(text: str) -> None:
    if "__gg_engine_alert_filter_installed__" in text:
        raise PatchError("legacy non-configurable alert filter remains")
    if '__gg_engine_load_started_at__' not in text:
        raise PatchError("recoverable engine load timestamp missing")
    if 'configurable:true,writable:false' not in text:
        raise PatchError("configurable runtime probe missing")

    marker = "void function(){var G=window,V='"
    cursor = 0
    while True:
        start = text.find(marker, cursor)
        if start < 0:
            break
        open_index = text.find("{", start)
        close_index = find_matching_brace(text, open_index)
        candidate = text[start : close_index + 1]
        if "requestAnimationFrame" in candidate and "new Array(" in candidate:
            raise PatchError("resource-exhaustion anti-tamper guard remains")
        cursor = close_index + 1


def node_check(paths: Iterable[pathlib.Path]) -> None:
    for path in paths:
        result = subprocess.run(
            ["node", "--check", str(path)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        if result.returncode != 0:
            raise PatchError(f"node --check failed for {path}:\n{result.stdout}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--skip-node-check", action="store_true")
    args = parser.parse_args()

    for path in (NONAME_PATH, GAME_PATH):
        if not path.is_file():
            raise PatchError(f"missing source file: {path}")

    noname = NONAME_PATH.read_text(encoding="utf-8")
    game = GAME_PATH.read_text(encoding="utf-8")

    if args.verify_only:
        verify_noname(noname)
        verify_game(game)
        removed = 0
    else:
        noname = patch_noname(noname)
        game, removed = patch_game(game)
        verify_noname(noname)
        verify_game(game)
        NONAME_PATH.write_text(noname, encoding="utf-8", newline="")
        GAME_PATH.write_text(game, encoding="utf-8", newline="")

    if not args.skip_node_check:
        node_check((NONAME_PATH, GAME_PATH))

    print(
        "runtime_stability_fix_ok "
        f"verify_only={str(args.verify_only).lower()} "
        f"removed_resource_guards={removed} "
        f"noname_bytes={NONAME_PATH.stat().st_size} "
        f"game_bytes={GAME_PATH.stat().st_size}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PatchError as exc:
        print(f"runtime_stability_fix_failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
