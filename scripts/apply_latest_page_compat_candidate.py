#!/usr/bin/env python3
from pathlib import Path


path = Path("remote-script/src/noname.js")
text = path.read_text(encoding="utf-8")

old_version = "// @version      1.1.4"
new_version = "// @version      1.1.5"
marker = "// ===== latest-page repeat compatibility v1 ====="

if marker in text:
    if new_version not in text:
        raise SystemExit("compatibility marker exists without version 1.1.5")
    print("latest-page compatibility already applied")
    raise SystemExit(0)

if text.count(old_version) != 1:
    raise SystemExit(f"expected exactly one 1.1.4 version marker, found {text.count(old_version)}")

compatibility = r'''

// ===== latest-page repeat compatibility v1 =====
(() => {
  const STATE_SYMBOL = Symbol.for("gg.latest-page-repeat-compat.v1");
  const existingState = window[STATE_SYMBOL];
  if (existingState && typeof existingState.refresh === "function") {
    existingState.refresh();
    return;
  }

  const state = {
    installedAt: Date.now(),
    sequence: 0,
    jsonpResponses: 0,
    fetchResponses: 0,
    xhrResponses: 0,
    refreshCount: 0,
    originalSetAttribute: Element.prototype.setAttribute,
    originalFetch: typeof window.fetch === "function" ? window.fetch : null,
    originalXhrOpen: XMLHttpRequest.prototype.open,
    originalXhrSend: XMLHttpRequest.prototype.send,
  };

  const endpointPattern = /createbuyorder/i;
  const markerName = "__ggLatestPageRepeatCompatV1";

  function featureEnabled() {
    try {
      const runtimeHook = String(window.$HHHH || "").replace(/\s+/g, "");
      return runtimeHook !== "returnfT;";
    } catch (_) {
      return true;
    }
  }

  function parseRequest(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      if (!endpointPattern.test(url.href)) return null;
      const callbackName =
        url.searchParams.get("jsonCallback") ||
        url.searchParams.get("jsoncallback") ||
        url.searchParams.get("callback") ||
        "";
      const goodsId =
        url.searchParams.get("goods_id") ||
        url.searchParams.get("goodsId") ||
        "0";
      const rawBuyNum =
        url.searchParams.get("buy_num") ||
        url.searchParams.get("buyNum") ||
        "1";
      const parsedBuyNum = Number.parseInt(rawBuyNum, 10);
      return {
        url,
        callbackName,
        payload: {
          status: 1,
          msg: "successful",
          data: {
            goods_id: goodsId,
            order_id: Date.now(),
            buy_num: Number.isFinite(parsedBuyNum) ? parsedBuyNum : 1,
          },
        },
      };
    } catch (_) {
      return null;
    }
  }

  function invokeCallbackWhenReady(request, attempt = 0) {
    if (!request || !request.callbackName) return;
    const callback = window[request.callbackName];
    if (typeof callback === "function") {
      try {
        callback(request.payload);
        state.jsonpResponses += 1;
      } catch (error) {
        console.error("[GG repeat compatibility] callback failed", error);
      }
      return;
    }
    if (attempt < 40) {
      setTimeout(() => invokeCallbackWhenReady(request, attempt + 1), 50);
    }
  }

  function harmlessScriptUrl(sequence) {
    return `data:application/javascript,/*gg-repeat-${sequence}*/void%200`;
  }

  function installSetAttributeHook() {
    const current = Element.prototype.setAttribute;
    if (current && current[markerName]) return;
    const downstream = current || state.originalSetAttribute;
    function patchedSetAttribute(name, value) {
      if (
        featureEnabled() &&
        this instanceof HTMLScriptElement &&
        String(name || "").toLowerCase() === "src"
      ) {
        const request = parseRequest(value);
        if (request) {
          const sequence = ++state.sequence;
          queueMicrotask(() => invokeCallbackWhenReady(request));
          return downstream.call(this, name, harmlessScriptUrl(sequence));
        }
      }
      return downstream.apply(this, arguments);
    }
    Object.defineProperty(patchedSetAttribute, markerName, { value: true });
    Object.defineProperty(patchedSetAttribute, "__ggDownstream", { value: downstream });
    Element.prototype.setAttribute = patchedSetAttribute;
  }

  function installFetchHook() {
    if (typeof window.fetch !== "function") return;
    const current = window.fetch;
    if (current && current[markerName]) return;
    const downstream = current || state.originalFetch;
    async function patchedFetch(input, init) {
      const request = parseRequest(
        typeof input === "string" || input instanceof URL ? input : input && input.url
      );
      if (featureEnabled() && request) {
        state.fetchResponses += 1;
        return new Response(JSON.stringify(request.payload), {
          status: 200,
          statusText: "OK",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }
      return downstream.call(this, input, init);
    }
    Object.defineProperty(patchedFetch, markerName, { value: true });
    Object.defineProperty(patchedFetch, "__ggDownstream", { value: downstream });
    window.fetch = patchedFetch;
  }

  function defineSyntheticXhrValue(xhr, name, value) {
    try {
      Object.defineProperty(xhr, name, {
        configurable: true,
        enumerable: true,
        get: () => value,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function finishSyntheticXhr(xhr, request) {
    const responseText = JSON.stringify(request.payload);
    const response = xhr.responseType === "json" ? request.payload : responseText;
    const values = {
      readyState: 4,
      status: 200,
      statusText: "OK",
      responseURL: request.url.href,
      responseText,
      response,
    };
    for (const [name, value] of Object.entries(values)) {
      defineSyntheticXhrValue(xhr, name, value);
    }
    state.xhrResponses += 1;
    queueMicrotask(() => {
      try { xhr.dispatchEvent(new Event("readystatechange")); } catch (_) {}
      try { xhr.dispatchEvent(new ProgressEvent("load")); } catch (_) {}
      try { xhr.dispatchEvent(new ProgressEvent("loadend")); } catch (_) {}
    });
  }

  function installXhrHook() {
    const currentOpen = XMLHttpRequest.prototype.open;
    if (!currentOpen || !currentOpen[markerName]) {
      const downstreamOpen = currentOpen || state.originalXhrOpen;
      function patchedOpen(method, url) {
        this.__ggLatestPageRequest = parseRequest(url);
        return downstreamOpen.apply(this, arguments);
      }
      Object.defineProperty(patchedOpen, markerName, { value: true });
      Object.defineProperty(patchedOpen, "__ggDownstream", { value: downstreamOpen });
      XMLHttpRequest.prototype.open = patchedOpen;
    }

    const currentSend = XMLHttpRequest.prototype.send;
    if (!currentSend || !currentSend[markerName]) {
      const downstreamSend = currentSend || state.originalXhrSend;
      function patchedSend() {
        const request = this.__ggLatestPageRequest || parseRequest(this._url || "");
        if (featureEnabled() && request) {
          finishSyntheticXhr(this, request);
          return undefined;
        }
        return downstreamSend.apply(this, arguments);
      }
      Object.defineProperty(patchedSend, markerName, { value: true });
      Object.defineProperty(patchedSend, "__ggDownstream", { value: downstreamSend });
      XMLHttpRequest.prototype.send = patchedSend;
    }
  }

  function refresh() {
    state.refreshCount += 1;
    installSetAttributeHook();
    installFetchHook();
    installXhrHook();
  }

  state.refresh = refresh;
  window[STATE_SYMBOL] = state;
  Object.defineProperty(window, "__GG_LATEST_PAGE_COMPAT__", {
    configurable: true,
    enumerable: false,
    get: () => ({
      installedAt: state.installedAt,
      sequence: state.sequence,
      jsonpResponses: state.jsonpResponses,
      fetchResponses: state.fetchResponses,
      xhrResponses: state.xhrResponses,
      refreshCount: state.refreshCount,
    }),
  });

  refresh();
  window.addEventListener("pageshow", () => setTimeout(refresh, 0), true);
  window.addEventListener("focus", () => setTimeout(refresh, 0), true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) setTimeout(refresh, 0);
  }, true);
  setInterval(refresh, 1500);
})();
'''

text = text.replace(old_version, new_version, 1).rstrip() + compatibility + "\n"
path.write_text(text, encoding="utf-8")
print("latest-page repeat compatibility applied")
