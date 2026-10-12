#!/usr/bin/env python3
"""Patch noname.js at source level.

This patch deliberately avoids APK/runtime DOM rewriting. It:
- keeps the original panel/button nodes and their event listeners;
- adds a lightweight CSS-only mobile WebView layout once;
- replaces the original storage/XHR/JSONP hook method bodies in noname.js;
- gives every repeated create-order request an independent lifecycle.
"""

from __future__ import annotations

import argparse
import pathlib
import sys

NONAME_PATH = pathlib.Path("remote-script/src/noname.js")
UI_MARKER = "gg.source.ui-mobile.v5"
STORAGE_MARKER = '["initSt"+"orageH"+"ook"]()'
XHR_MARKER = '["initXh"+"rHook"](...vUYe8N)'
JSONP_MARKER = '["initJs"+"onpHoo"+"k"]()'


class PatchError(RuntimeError):
    pass


def looks_like_regex_start(text: str, index: int) -> bool:
    cursor = index - 1
    while cursor >= 0 and text[cursor].isspace():
        cursor -= 1
    if cursor < 0:
        return True
    if text[cursor] in "([{:;,=!?&|+-*%^~<>\n":
        return True
    end = cursor
    while cursor >= 0 and (text[cursor].isalnum() or text[cursor] in "_$"):
        cursor -= 1
    return text[cursor + 1 : end + 1] in {
        "return", "case", "throw", "else", "do", "typeof", "instanceof",
        "in", "of", "yield", "await",
    }


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
    index = open_index
    while index < len(text):
        char = text[index]
        nxt = text[index + 1] if index + 1 < len(text) else ""
        if line_comment:
            if char in "\r\n":
                line_comment = False
            index += 1
            continue
        if block_comment:
            if char == "*" and nxt == "/":
                block_comment = False
                index += 2
            else:
                index += 1
            continue
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            index += 1
            continue
        if regex:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == "[":
                regex_class = True
            elif char == "]" and regex_class:
                regex_class = False
            elif char == "/" and not regex_class:
                regex = False
            index += 1
            continue
        if char in "'\"`":
            quote = char
            index += 1
            continue
        if char == "/" and nxt == "/":
            line_comment = True
            index += 2
            continue
        if char == "/" and nxt == "*":
            block_comment = True
            index += 2
            continue
        if char == "/" and looks_like_regex_start(text, index):
            regex = True
            regex_class = False
            index += 1
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    raise PatchError(f"unclosed brace at {open_index}")


def replace_method_body(text: str, marker: str, new_body: str) -> str:
    candidates: list[tuple[int, int]] = []
    cursor = 0
    while True:
        start = text.find(marker, cursor)
        if start < 0:
            break
        open_index = start + len(marker)
        while open_index < len(text) and text[open_index].isspace():
            open_index += 1
        if open_index < len(text) and text[open_index] == "{":
            candidates.append((start, open_index))
        cursor = start + len(marker)
    if len(candidates) != 1:
        raise PatchError(f"method definition count for {marker}: {len(candidates)}")
    _, open_index = candidates[0]
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
      prototype=XMLHttpRequest.prototype;
      if(prototype[marker]) {
        return
      }
      const originalOpen=prototype.open,
      originalSend=prototype.send,
      stateKey=Symbol.for("gg.source.xhr-request.v5");
      prototype.open=function(...args) {
        let patchedUrl=args[1];
        try {
          patchedUrl=zjEv2f["patchG"+"ameFlo"+"wUrl"](String(args[1]))
        }
        catch(error) {
          patchedUrl=args[1]
        }
        args[1]=patchedUrl;
        this[stateKey]= {
          source:String(patchedUrl),
          local:String(patchedUrl).includes("/createBuyOrder")
        };
        return originalOpen.apply(this,args)
      };
      prototype.send=function(body) {
        const state=this[stateKey];
        if(!state||!state.local||!pw0zF4["enable"+"FreeMo"+"de"]) {
          return originalSend.call(this,body)
        }
        let responseText;
        try {
          responseText=zjEv2f["buildC"+"reateO"+"rderRe"+"sponse"](state.source)
        }
        catch(error) {
          return originalSend.call(this,body)
        }
        let readyState=1,
        aborted=false;
        try {
          Object.defineProperties(this, {
            readyState: {configurable:true,get:()=>readyState},
            status: {configurable:true,get:()=>200},
            statusText: {configurable:true,get:()=>"OK"},
            responseURL: {configurable:true,get:()=>state.source},
            responseText: {configurable:true,get:()=>responseText},
            response: {
              configurable:true,
              get:()=>this.responseType==="json"?JSON.parse(responseText):responseText
            }
          })
        }
        catch(error) {
          return originalSend.call(this,body)
        }
        this.abort=function() {
          if(aborted) {
            return
          }
          aborted=true;
          readyState=0;
          try { this.dispatchEvent(new Event("abort")) } catch(error) {}
          try { this.dispatchEvent(new Event("loadend")) } catch(error) {}
        };
        queueMicrotask(()=> {
          if(aborted) {
            return
          }
          try { this.dispatchEvent(new Event("loadstart")) } catch(error) {}
          readyState=2;
          try { this.dispatchEvent(new Event("readystatechange")) } catch(error) {}
          readyState=3;
          try { this.dispatchEvent(new Event("readystatechange")) } catch(error) {}
          readyState=4;
          try { this.dispatchEvent(new Event("readystatechange")) } catch(error) {}
          try { this.dispatchEvent(new Event("load")) } catch(error) {}
          try { this.dispatchEvent(new Event("loadend")) } catch(error) {}
        });
        return undefined
      };
      Object.defineProperty(prototype,marker, {
        value: {open:originalOpen,send:originalSend,source:"gg.source.xhr.v5"},
        enumerable:false,
        configurable:true,
        writable:false
      })'''


JSONP_BODY = r'''
      const marker=Symbol.for("gg.runtime.jsonp-create-element.v2");
      if(document[marker]) {
        return
      }
      const originalCreateElement=document.createElement,
      scriptMarker=Symbol.for("gg.source.jsonp-node.v5"),
      nativeSrcDescriptor=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,"src");
      let requestSequence=0;
      const resolveCallback=name=> {
        let value=window;
        for(const part of String(name||"").split(".")) {
          if(!part||value==null) {
            return null
          }
          value=value[part]
        }
        return typeof value==="function"?value:null
      };
      document.createElement=function(tagName,...args) {
        const node=originalCreateElement.call(this,tagName,...args);
        if(String(tagName).toLowerCase()!=="script"||node[scriptMarker]) {
          return node
        }
        Object.defineProperty(node,scriptMarker, {value:true,configurable:true});
        const nativeSetAttribute=node.setAttribute.bind(node),
        nativeGetAttribute=node.getAttribute.bind(node),
        setNativeSrc=value=> {
          if(nativeSrcDescriptor&&typeof nativeSrcDescriptor.set==="function") {
            return nativeSrcDescriptor.set.call(node,value)
          }
          return nativeSetAttribute("src",value)
        },
        getNativeSrc=()=> {
          if(nativeSrcDescriptor&&typeof nativeSrcDescriptor.get==="function") {
            return nativeSrcDescriptor.get.call(node)
          }
          return nativeGetAttribute("src")
        },
        routeSource=value=> {
          const source=String(value);
          if(!pw0zF4["enable"+"FreeMo"+"de"]||!source.includes("createBuyOrder")) {
            return setNativeSrc(source)
          }
          try {
            const params=new URL(source,document.baseURI).searchParams,
            callbackName=params.get("jsonCallback")||params.get("callback")||params.get("cb");
            if(!callbackName||!resolveCallback(callbackName)) {
              return setNativeSrc(source)
            }
            const payload=JSON.parse(zjEv2f["buildC"+"reateO"+"rderRe"+"sponse"](source)),
            callbackLiteral=JSON.stringify(callbackName),
            payloadLiteral=JSON.stringify(payload),
            code=";(function(){var v=window,p="+callbackLiteral+".split('.')"+
              ";for(var i=0;i<p.length;i++){v=v&&v[p[i]];}"+
              "if(typeof v==='function'){v("+payloadLiteral+");}})();",
            requestId=Date.now()+"-"+(++requestSequence)+"-"+Math.random().toString(36).slice(2,8),
            localSource="data:text/javascript;charset=utf-8,"+encodeURIComponent(code)+"#gg-"+requestId;
            node.dataset.ggSourceRequestId=requestId;
            return setNativeSrc(localSource)
          }
          catch(error) {
            return setNativeSrc(source)
          }
        };
        Object.defineProperty(node,"src", {
          set:routeSource,
          get:getNativeSrc,
          enumerable:true,
          configurable:true
        });
        node.setAttribute=function(name,value) {
          if(String(name).toLowerCase()==="src") {
            return routeSource(value)
          }
          return nativeSetAttribute(name,value)
        };
        return node
      };
      Object.defineProperty(document,marker, {
        value: {createElement:originalCreateElement,source:"gg.source.jsonp.v5"},
        enumerable:false,
        configurable:true,
        writable:false
      })'''


UI_PATCH = r'''

// ===== GG source-native mobile UI v5 =====
(() => {
  const marker = Symbol.for("gg.source.ui-mobile.v5");
  if (window[marker]) return;
  Object.defineProperty(window, marker, {
    value: true,
    configurable: true,
    enumerable: false,
    writable: false,
  });

  const install = () => {
    if (document.getElementById("gg-source-ui-mobile-v5")) return;
    const style = document.createElement("style");
    style.id = "gg-source-ui-mobile-v5";
    style.textContent = `
      :root {
        --gg5-bg: #101522;
        --gg5-card: #181f2f;
        --gg5-card-2: #20293b;
        --gg5-line: rgba(255,255,255,.10);
        --gg5-text: #f6f7fb;
        --gg5-muted: #aeb8c8;
        --gg5-accent: #7c6cff;
        --gg5-safe-right: env(safe-area-inset-right, 0px);
        --gg5-safe-bottom: env(safe-area-inset-bottom, 0px);
        --gg5-safe-left: env(safe-area-inset-left, 0px);
      }

      #orange-script-panel {
        box-sizing: border-box !important;
        width: min(92vw, 430px) !important;
        max-width: min(92vw, 430px) !important;
        max-height: min(82vh, 720px) !important;
        max-height: min(82dvh, 720px) !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        border: 1px solid var(--gg5-line) !important;
        border-radius: 22px !important;
        background: var(--gg5-bg) !important;
        color: var(--gg5-text) !important;
        box-shadow: 0 20px 58px rgba(0,0,0,.48) !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;
        -webkit-font-smoothing: antialiased !important;
      }

      #orange-script-panel .orange-panel-head {
        box-sizing: border-box !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 2 !important;
        margin: 0 !important;
        padding: 16px !important;
        border-bottom: 1px solid var(--gg5-line) !important;
        background: #141b29 !important;
        color: var(--gg5-text) !important;
      }

      #orange-script-panel .orange-panel-title,
      #orange-script-panel .gg-readable-title,
      #orange-script-panel .orange-switch-name,
      #orange-script-panel .gg-readable-item-title {
        color: var(--gg5-text) !important;
      }

      #orange-script-panel .orange-panel-desc,
      #orange-script-panel .gg-readable-subtitle,
      #orange-script-panel #gg-readable-maintainer,
      #orange-script-panel .orange-switch-tip {
        color: var(--gg5-muted) !important;
      }

      #orange-script-panel #gg-readable-notice-list {
        box-sizing: border-box !important;
        margin: 12px !important;
        padding: 12px 12px 12px 34px !important;
        border: 1px solid var(--gg5-line) !important;
        border-radius: 15px !important;
        background: var(--gg5-card) !important;
        color: #dce3ed !important;
      }

      #orange-script-panel .orange-panel-list {
        box-sizing: border-box !important;
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 10px !important;
        margin: 0 !important;
        padding: 0 12px 12px !important;
      }

      #orange-script-panel [class*="orange-switch"] {
        box-sizing: border-box !important;
        border-color: var(--gg5-line) !important;
        background: var(--gg5-card) !important;
        color: var(--gg5-text) !important;
      }

      #orange-script-panel button,
      #orange-script-panel [role="button"] {
        min-height: 40px !important;
        border: 1px solid rgba(124,108,255,.42) !important;
        border-radius: 12px !important;
        background: var(--gg5-accent) !important;
        color: #fff !important;
        box-shadow: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }

      #orange-script-panel .orange-panel-footer,
      #orange-script-panel .gg-readable-footer {
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 12px 15px calc(12px + var(--gg5-safe-bottom)) !important;
        border-top: 1px solid var(--gg5-line) !important;
        background: #0d121d !important;
        color: #8d99ac !important;
      }

      #orange-script-panel-button {
        box-sizing: border-box !important;
        right: calc(16px + var(--gg5-safe-right)) !important;
        bottom: calc(16px + var(--gg5-safe-bottom)) !important;
        width: 54px !important;
        height: 54px !important;
        min-width: 54px !important;
        min-height: 54px !important;
        padding: 0 !important;
        border: 1px solid rgba(255,255,255,.20) !important;
        border-radius: 18px !important;
        background: #6d5ee8 !important;
        color: #fff !important;
        box-shadow: 0 10px 28px rgba(0,0,0,.34) !important;
        font-size: 16px !important;
        font-weight: 800 !important;
        line-height: 54px !important;
        animation: none !important;
        transition: transform .12s ease !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      #orange-script-panel-button:active { transform: scale(.95) !important; }

      @media (max-width: 600px) {
        #orange-script-panel {
          position: fixed !important;
          left: var(--gg5-safe-left) !important;
          right: var(--gg5-safe-right) !important;
          bottom: 0 !important;
          top: auto !important;
          width: auto !important;
          max-width: none !important;
          max-height: 86vh !important;
          max-height: 86dvh !important;
          margin: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
          border-bottom: 0 !important;
          border-radius: 22px 22px 0 0 !important;
          transform: none !important;
        }
      }

      @media (max-height: 520px) and (orientation: landscape) {
        #orange-script-panel {
          max-height: calc(96vh - var(--gg5-safe-bottom)) !important;
          max-height: calc(96dvh - var(--gg5-safe-bottom)) !important;
        }
        #orange-script-panel .orange-panel-head { position: static !important; }
      }

      @media (prefers-reduced-motion: reduce) {
        #orange-script-panel-button { transition: none !important; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  if (document.documentElement) install();
  else document.addEventListener("DOMContentLoaded", install, { once: true });
})();
// ===== End GG source-native mobile UI v5 =====
'''


def patch(text: str) -> str:
    text = replace_method_body(text, STORAGE_MARKER, STORAGE_BODY)
    text = replace_method_body(text, XHR_MARKER, XHR_BODY)
    text = replace_method_body(text, JSONP_MARKER, JSONP_BODY)
    if UI_MARKER not in text:
        text += UI_PATCH
    return text


def verify(text: str) -> None:
    required_once = (
        'Symbol.for("gg.runtime.storage-hook.v2")',
        'Symbol.for("gg.runtime.xhr-open.v2")',
        'Symbol.for("gg.runtime.jsonp-create-element.v2")',
        'Symbol.for("gg.source.ui-mobile.v5")',
        'gg-source-ui-mobile-v5',
        'gg.source.xhr.v5',
        'gg.source.jsonp.v5',
    )
    for token in required_once:
        count = text.count(token)
        if count != 1:
            raise PatchError(f"marker count mismatch for {token}: {count}")
    forbidden = (
        'gg.runtime.experience.v4',
        'gg-v4-sheet',
        'new MutationObserver(scheduleInterfaceSync)',
        'innerHTML = `\\n      <span class="gg-v4-fab-core"',
    )
    for token in forbidden:
        if token in text:
            raise PatchError(f"forbidden runtime UI token remains: {token}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    if not NONAME_PATH.is_file():
        raise PatchError(f"missing {NONAME_PATH}")
    original = NONAME_PATH.read_text(encoding="utf-8")
    if args.verify_only:
        verify(original)
        print("noname.js root-source fix verified")
        return 0
    updated = patch(original)
    verify(updated)
    if updated == original:
        raise PatchError("noname.js did not change")
    NONAME_PATH.write_text(updated, encoding="utf-8", newline="")
    print(f"patched {NONAME_PATH}: {len(original)} -> {len(updated)} bytes")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PatchError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
