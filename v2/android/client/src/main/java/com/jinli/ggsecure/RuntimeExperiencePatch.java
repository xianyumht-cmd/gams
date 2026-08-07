package com.jinli.ggsecure;

import java.nio.charset.StandardCharsets;

final class RuntimeExperiencePatch {
    private static final String PATCH_MARKER = "gg.runtime.experience.v3";

    private static final String NONAME_PATCH = """

// ===== GG runtime experience v3 =====
(() => {
  const marker = Symbol.for("gg.runtime.experience.v3");
  if (window[marker]) return;
  Object.defineProperty(window, marker, {
    value: true,
    configurable: true,
    enumerable: false,
    writable: false,
  });

  const styleId = "gg-runtime-theme-v3";
  const purchaseSelector = [
    "button",
    "[role='button']",
    "a[class*='btn']",
    "[class*='button']",
    "[class*='buy']",
    "[class*='order']",
    "[class*='goods']",
  ].join(",");
  const purchaseText = /购买|确认购买|立即购买|兑换/;
  const confirmText = /确认|确定/;
  const purchaseHint = /buy|purchase|order|goods|mall|pay|shop/i;
  let sequence = 0;

  function installTheme() {
    if (!document.head || document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      :root {
        --gg-v3-bg: rgba(10, 14, 24, .94);
        --gg-v3-card: rgba(21, 29, 45, .82);
        --gg-v3-card-strong: rgba(27, 38, 58, .96);
        --gg-v3-line: rgba(148, 163, 184, .22);
        --gg-v3-text: #f8fafc;
        --gg-v3-muted: #9fb0c7;
        --gg-v3-accent: #5eead4;
        --gg-v3-accent-2: #60a5fa;
        --gg-v3-shadow: 0 24px 70px rgba(2, 6, 23, .58);
      }
      .gg-runtime-panel-v3 {
        overflow: hidden !important;
        border: 1px solid var(--gg-v3-line) !important;
        border-radius: 24px !important;
        background:
          radial-gradient(circle at 12% 0%, rgba(94, 234, 212, .16), transparent 34%),
          radial-gradient(circle at 96% 12%, rgba(96, 165, 250, .18), transparent 36%),
          var(--gg-v3-bg) !important;
        box-shadow: var(--gg-v3-shadow) !important;
        color: var(--gg-v3-text) !important;
        backdrop-filter: blur(22px) saturate(135%) !important;
        -webkit-backdrop-filter: blur(22px) saturate(135%) !important;
      }
      .gg-runtime-panel-v3 .orange-panel-head {
        position: relative !important;
        gap: 12px !important;
        padding: 20px 20px 17px !important;
        border-bottom: 1px solid var(--gg-v3-line) !important;
        background: linear-gradient(145deg, rgba(30, 41, 59, .9), rgba(15, 23, 42, .72)) !important;
      }
      .gg-runtime-panel-v3 .orange-panel-head::after {
        content: "";
        position: absolute;
        left: 20px;
        right: 20px;
        bottom: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--gg-v3-accent), transparent);
        opacity: .58;
      }
      .gg-runtime-panel-v3 .orange-panel-badge {
        min-width: 42px !important;
        height: 42px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 1px solid rgba(94, 234, 212, .42) !important;
        border-radius: 14px !important;
        background: linear-gradient(145deg, rgba(94, 234, 212, .2), rgba(96, 165, 250, .18)) !important;
        color: var(--gg-v3-accent) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12) !important;
        font-weight: 800 !important;
        letter-spacing: .08em !important;
      }
      .gg-runtime-panel-v3 .orange-panel-title,
      .gg-runtime-panel-v3 .gg-readable-title {
        margin: 0 !important;
        color: var(--gg-v3-text) !important;
        font-size: 20px !important;
        font-weight: 800 !important;
        letter-spacing: -.02em !important;
      }
      .gg-runtime-panel-v3 .orange-panel-desc,
      .gg-runtime-panel-v3 .gg-readable-subtitle,
      .gg-runtime-panel-v3 #gg-readable-maintainer,
      .gg-runtime-panel-v3 .orange-switch-tip {
        color: var(--gg-v3-muted) !important;
      }
      .gg-runtime-panel-v3 .orange-panel-meta {
        color: var(--gg-v3-accent) !important;
        font-size: 12px !important;
        letter-spacing: .06em !important;
      }
      .gg-runtime-panel-v3 .orange-panel-dot {
        background: var(--gg-v3-accent) !important;
        box-shadow: 0 0 0 5px rgba(94, 234, 212, .1), 0 0 18px rgba(94, 234, 212, .7) !important;
      }
      .gg-runtime-panel-v3 #gg-readable-notice-list {
        margin: 14px 16px !important;
        padding: 14px 15px 14px 35px !important;
        border: 1px solid rgba(96, 165, 250, .24) !important;
        border-radius: 18px !important;
        background: linear-gradient(145deg, rgba(30, 41, 59, .72), rgba(15, 23, 42, .62)) !important;
        color: #dce8f7 !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .04) !important;
      }
      .gg-runtime-panel-v3 #gg-readable-notice-list li::marker {
        color: var(--gg-v3-accent) !important;
      }
      .gg-runtime-panel-v3 .orange-panel-list {
        display: grid !important;
        gap: 10px !important;
        padding: 8px 14px 15px !important;
      }
      .gg-runtime-panel-v3 [class*="orange-switch"] {
        border-color: var(--gg-v3-line) !important;
        background: linear-gradient(145deg, rgba(30, 41, 59, .78), rgba(17, 24, 39, .72)) !important;
        color: var(--gg-v3-text) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .035) !important;
      }
      .gg-runtime-panel-v3 [class*="orange-switch"]:hover {
        border-color: rgba(94, 234, 212, .34) !important;
        transform: translateY(-1px) !important;
      }
      .gg-runtime-panel-v3 .orange-switch-name,
      .gg-runtime-panel-v3 .gg-readable-item-title {
        color: var(--gg-v3-text) !important;
        font-weight: 700 !important;
      }
      .gg-runtime-panel-v3 button,
      .gg-runtime-panel-v3 [role="button"] {
        border: 1px solid rgba(94, 234, 212, .34) !important;
        border-radius: 12px !important;
        background: linear-gradient(135deg, rgba(20, 184, 166, .92), rgba(37, 99, 235, .9)) !important;
        color: #ffffff !important;
        box-shadow: 0 8px 22px rgba(37, 99, 235, .22), inset 0 1px 0 rgba(255, 255, 255, .2) !important;
        font-weight: 750 !important;
        transition: transform .16s ease, filter .16s ease, box-shadow .16s ease !important;
      }
      .gg-runtime-panel-v3 button:active,
      .gg-runtime-panel-v3 [role="button"]:active {
        transform: scale(.97) !important;
        filter: brightness(.94) !important;
      }
      .gg-runtime-panel-v3 .orange-panel-footer,
      .gg-runtime-panel-v3 .gg-readable-footer {
        margin: 0 !important;
        padding: 14px 18px 17px !important;
        border-top: 1px solid var(--gg-v3-line) !important;
        background: rgba(8, 12, 20, .52) !important;
        color: #8292aa !important;
      }
      .gg-runtime-fab-v3 {
        position: relative !important;
        width: 54px !important;
        height: 54px !important;
        border: 1px solid rgba(94, 234, 212, .48) !important;
        border-radius: 18px !important;
        background: linear-gradient(145deg, rgba(15, 23, 42, .96), rgba(30, 41, 59, .92)) !important;
        color: var(--gg-v3-accent) !important;
        box-shadow: 0 14px 34px rgba(2, 6, 23, .48), inset 0 1px 0 rgba(255, 255, 255, .12) !important;
        font-size: 17px !important;
        font-weight: 900 !important;
        letter-spacing: .04em !important;
      }
      .gg-runtime-fab-v3::after {
        content: "";
        position: absolute;
        inset: 6px;
        pointer-events: none;
        border: 1px solid rgba(96, 165, 250, .2);
        border-radius: 13px;
      }
      @media (max-width: 560px) {
        .gg-runtime-panel-v3 {
          border-radius: 20px !important;
        }
        .gg-runtime-panel-v3 .orange-panel-head {
          padding: 17px 16px 14px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function markThemeNodes(root = document) {
    installTheme();
    const scope = root && root.querySelectorAll ? root : document;
    if (root instanceof Element && root.matches(".orange-panel-head")) {
      root.parentElement?.classList.add("gg-runtime-panel-v3");
    }
    scope.querySelectorAll(".orange-panel-head").forEach((head) => {
      const panel = head.parentElement;
      if (panel) panel.classList.add("gg-runtime-panel-v3");
    });
    scope.querySelectorAll(".orange-panel-meta span:last-child").forEach((meta) => {
      meta.textContent = "深色玻璃主题";
    });
    scope.querySelectorAll("button").forEach((button) => {
      const title = String(button.title || "");
      const text = String(button.textContent || "").trim();
      if (title.includes("拖动") || title.includes("展开") || text === "G") {
        button.classList.add("gg-runtime-fab-v3");
      }
    });
  }

  function isPurchaseControl(element) {
    if (!(element instanceof Element)) return false;
    const control = element.closest(purchaseSelector);
    if (!control) return false;
    const text = String(control.textContent || control.getAttribute("aria-label") || "").trim();
    const context = control.closest(
      "[class*='mall'],[class*='shop'],[class*='goods'],[class*='order'],[class*='buy']," +
      "[id*='mall'],[id*='shop'],[id*='goods'],[id*='order'],[id*='buy']"
    );
    const hint = `${control.id || ""} ${control.className || ""} ${control.getAttribute("data-action") || ""} ${context?.id || ""} ${context?.className || ""}`;
    return purchaseText.test(text) || (confirmText.test(text) && purchaseHint.test(hint)) || purchaseHint.test(hint);
  }

  function recoverControl(control) {
    if (!(control instanceof HTMLElement)) return;
    control.removeAttribute("disabled");
    control.removeAttribute("aria-disabled");
    control.removeAttribute("data-disabled");
    control.disabled = false;
    control.style.pointerEvents = "";
    control.style.opacity = "";
    control.style.filter = "";
    for (const name of Array.from(control.classList)) {
      if (/disabled|loading|pending|locked/i.test(name)) control.classList.remove(name);
    }
  }

  function recoverPurchaseUi(root = document) {
    const scope = root && root.querySelectorAll ? root : document;
    if (root instanceof Element && isPurchaseControl(root)) recoverControl(root);
    scope.querySelectorAll(purchaseSelector).forEach((control) => {
      if (isPurchaseControl(control)) recoverControl(control);
    });
  }

  function scheduleRecovery(root = document) {
    [0, 60, 220, 650, 1400, 2800].forEach((delay) => {
      setTimeout(() => recoverPurchaseUi(root), delay);
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !isPurchaseControl(target)) return;
    scheduleRecovery(target.closest("body") || document);
  }, true);

  const nativeCreateElement = document.createElement.bind(document);
  document.createElement = function(tagName, ...args) {
    const node = nativeCreateElement(tagName, ...args);
    if (String(tagName).toLowerCase() !== "script") return node;

    const nodeMarker = Symbol.for("gg.runtime.experience.script.v3");
    if (node[nodeMarker]) return node;
    Object.defineProperty(node, nodeMarker, { value: true, configurable: true });

    const ownDescriptor = Object.getOwnPropertyDescriptor(node, "src");
    const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
    const setSource = (value) => {
      if (ownDescriptor && typeof ownDescriptor.set === "function") {
        return ownDescriptor.set.call(node, value);
      }
      if (nativeDescriptor && typeof nativeDescriptor.set === "function") {
        return nativeDescriptor.set.call(node, value);
      }
      return node.setAttribute("src", value);
    };
    const getSource = () => {
      if (ownDescriptor && typeof ownDescriptor.get === "function") {
        return ownDescriptor.get.call(node);
      }
      if (nativeDescriptor && typeof nativeDescriptor.get === "function") {
        return nativeDescriptor.get.call(node);
      }
      return node.getAttribute("src");
    };

    Object.defineProperty(node, "src", {
      configurable: true,
      enumerable: true,
      get: getSource,
      set(value) {
        const source = String(value);
        if (!source.includes("createBuyOrder")) return setSource(source);

        let params;
        try {
          params = new URL(source, document.baseURI).searchParams;
        } catch (_) {
          return setSource(source);
        }

        const callbackName = params.get("jsonCallback");
        const goodsId = params.get("goods_id");
        const buyNum = parseInt(params.get("buy_num") || "1", 10) || 1;
        if (!callbackName || !goodsId) return setSource(source);

        const payload = {
          status: 1,
          msg: "successful",
          data: {
            goods_id: goodsId,
            order_id: `${Date.now()}${++sequence}`,
            buy_num: buyNum,
          },
        };
        let delivered = false;
        const deliver = () => {
          if (delivered) return true;
          const callback = window[callbackName];
          if (typeof callback !== "function") return false;
          delivered = true;
          try {
            callback(payload);
          } finally {
            scheduleRecovery();
            queueMicrotask(() => {
              try { node.dispatchEvent(new Event("load")); } catch (_) {}
            });
          }
          return true;
        };

        [0, 16, 50, 120, 260, 520].forEach((delay) => setTimeout(deliver, delay));
        setTimeout(() => {
          if (!delivered) setSource(source);
        }, 700);
        return setSource("data:text/javascript,void 0");
      },
    });
    return node;
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        markThemeNodes(node);
        recoverPurchaseUi(node);
      }
    }
  });

  const start = () => {
    markThemeNodes();
    recoverPurchaseUi();
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
// ===== End GG runtime experience v3 =====
""";

    private RuntimeExperiencePatch() { }

    static byte[] patchNoname(byte[] originalBytes) {
        String text = new String(originalBytes, StandardCharsets.UTF_8);
        if (!text.contains(PATCH_MARKER)) {
            text = text + NONAME_PATCH;
        }
        verify(text);
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private static void verify(String text) {
        if (count(text, PATCH_MARKER) != 1) {
            throw new SecurityException("体验层补丁标记数量异常");
        }
        if (!text.contains("gg-runtime-theme-v3")) {
            throw new SecurityException("缺少新版视觉主题");
        }
        if (!text.contains("createBuyOrder") || !text.contains("scheduleRecovery")) {
            throw new SecurityException("缺少重复操作恢复逻辑");
        }
    }

    private static int count(String text, String token) {
        int total = 0;
        int cursor = 0;
        while ((cursor = text.indexOf(token, cursor)) >= 0) {
            total++;
            cursor += token.length();
        }
        return total;
    }
}
