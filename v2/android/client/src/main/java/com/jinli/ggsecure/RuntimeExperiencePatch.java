package com.jinli.ggsecure;

import java.nio.charset.StandardCharsets;

final class RuntimeExperiencePatch {
    private static final String PATCH_MARKER = "gg.runtime.experience.v4";

    private static final String NONAME_PATCH = """

// ===== GG runtime experience v4 =====
(() => {
  const marker = Symbol.for("gg.runtime.experience.v4");
  if (window[marker]) return;
  Object.defineProperty(window, marker, {
    value: true,
    configurable: true,
    enumerable: false,
    writable: false,
  });

  const styleId = "gg-runtime-mobile-sheet-v4";
  const panelSelector = ".orange-panel-head";
  const fabSelector = "button";
  let requestSequence = 0;
  let syncScheduled = false;

  function installStyles() {
    if (!document.head || document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      :root {
        --gg4-bg: #0b1020;
        --gg4-surface: #121a2d;
        --gg4-surface-2: #18243b;
        --gg4-line: rgba(148, 163, 184, .18);
        --gg4-text: #f7f9fc;
        --gg4-muted: #9caec6;
        --gg4-primary: #7c5cff;
        --gg4-primary-2: #2dd4bf;
        --gg4-danger: #fb7185;
        --gg4-safe-top: env(safe-area-inset-top, 0px);
        --gg4-safe-right: env(safe-area-inset-right, 0px);
        --gg4-safe-bottom: env(safe-area-inset-bottom, 0px);
        --gg4-safe-left: env(safe-area-inset-left, 0px);
      }

      .gg-v4-panel {
        box-sizing: border-box !important;
        overflow: hidden !important;
        width: min(92vw, 440px) !important;
        max-width: min(92vw, 440px) !important;
        max-height: min(82vh, 720px) !important;
        max-height: min(82dvh, 720px) !important;
        border: 1px solid var(--gg4-line) !important;
        border-radius: 28px !important;
        background: var(--gg4-bg) !important;
        color: var(--gg4-text) !important;
        box-shadow: 0 28px 90px rgba(0, 0, 0, .58) !important;
        overscroll-behavior: contain !important;
        -webkit-font-smoothing: antialiased !important;
        text-rendering: optimizeLegibility !important;
      }

      .gg-v4-sheet {
        display: flex !important;
        flex-direction: column !important;
        width: 100% !important;
        max-height: inherit !important;
        overflow: hidden !important;
        background:
          radial-gradient(circle at 12% -4%, rgba(124, 92, 255, .22), transparent 35%),
          radial-gradient(circle at 98% 5%, rgba(45, 212, 191, .15), transparent 31%),
          linear-gradient(180deg, #11182a 0%, #0b1020 100%) !important;
      }

      .gg-v4-grabber {
        flex: 0 0 auto !important;
        width: 42px !important;
        height: 5px !important;
        margin: 9px auto 1px !important;
        border-radius: 99px !important;
        background: rgba(226, 232, 240, .28) !important;
      }

      .gg-v4-hero,
      .gg-v4-panel .orange-panel-head {
        box-sizing: border-box !important;
        flex: 0 0 auto !important;
        position: relative !important;
        margin: 0 !important;
        padding: 16px 18px 15px !important;
        border: 0 !important;
        border-bottom: 1px solid var(--gg4-line) !important;
        background: transparent !important;
        color: var(--gg4-text) !important;
        touch-action: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-touch-callout: none !important;
      }

      .gg-v4-hero::before {
        content: "CONTROL CENTER";
        display: block !important;
        margin: 0 0 7px !important;
        color: var(--gg4-primary-2) !important;
        font-size: 10px !important;
        font-weight: 800 !important;
        line-height: 1.2 !important;
        letter-spacing: .16em !important;
      }

      .gg-v4-panel .orange-panel-badge {
        min-width: 46px !important;
        height: 46px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 1px solid rgba(124, 92, 255, .42) !important;
        border-radius: 15px !important;
        background: linear-gradient(145deg, rgba(124, 92, 255, .28), rgba(45, 212, 191, .15)) !important;
        color: #ddd6fe !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1) !important;
        font-size: 13px !important;
        font-weight: 850 !important;
      }

      .gg-v4-panel .orange-panel-title,
      .gg-v4-panel .gg-readable-title {
        margin: 0 !important;
        color: var(--gg4-text) !important;
        font-size: clamp(19px, 5vw, 22px) !important;
        font-weight: 850 !important;
        line-height: 1.22 !important;
        letter-spacing: -.025em !important;
      }

      .gg-v4-panel .orange-panel-desc,
      .gg-v4-panel .gg-readable-subtitle,
      .gg-v4-panel #gg-readable-maintainer,
      .gg-v4-panel .orange-switch-tip {
        color: var(--gg4-muted) !important;
        line-height: 1.55 !important;
      }

      .gg-v4-panel .orange-panel-meta {
        color: #c4b5fd !important;
        font-size: 11px !important;
        font-weight: 750 !important;
      }

      .gg-v4-body {
        box-sizing: border-box !important;
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        padding: 14px !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;
        scrollbar-width: none !important;
      }
      .gg-v4-body::-webkit-scrollbar { display: none !important; }

      .gg-v4-section {
        box-sizing: border-box !important;
        margin: 0 0 12px !important;
        padding: 13px !important;
        border: 1px solid var(--gg4-line) !important;
        border-radius: 19px !important;
        background: linear-gradient(145deg, rgba(24, 36, 59, .88), rgba(16, 24, 42, .92)) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .035) !important;
      }

      .gg-v4-section-label {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        margin: 0 0 10px !important;
        color: #dbe5f2 !important;
        font-size: 12px !important;
        font-weight: 800 !important;
        letter-spacing: .08em !important;
      }
      .gg-v4-section-label::before {
        content: "";
        width: 7px !important;
        height: 7px !important;
        border-radius: 50% !important;
        background: var(--gg4-primary-2) !important;
        box-shadow: 0 0 0 5px rgba(45, 212, 191, .09) !important;
      }

      .gg-v4-panel #gg-readable-notice-list {
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 2px 0 0 22px !important;
        border: 0 !important;
        background: transparent !important;
        color: #d6e0ed !important;
        font-size: 13px !important;
        line-height: 1.68 !important;
      }
      .gg-v4-panel #gg-readable-notice-list li { margin: 5px 0 !important; }
      .gg-v4-panel #gg-readable-notice-list li::marker { color: var(--gg4-primary-2) !important; }

      .gg-v4-actions,
      .gg-v4-panel .orange-panel-list {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 10px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: transparent !important;
      }

      .gg-v4-panel [class*="orange-switch"] {
        box-sizing: border-box !important;
        min-height: 68px !important;
        margin: 0 !important;
        padding: 12px !important;
        border: 1px solid rgba(148, 163, 184, .15) !important;
        border-radius: 16px !important;
        background: rgba(11, 16, 32, .58) !important;
        color: var(--gg4-text) !important;
        box-shadow: none !important;
      }

      .gg-v4-panel .orange-switch-name,
      .gg-v4-panel .gg-readable-item-title {
        color: var(--gg4-text) !important;
        font-weight: 780 !important;
      }

      .gg-v4-panel button:not(.gg-v4-fab),
      .gg-v4-panel [role="button"] {
        min-height: 42px !important;
        border: 1px solid rgba(124, 92, 255, .38) !important;
        border-radius: 13px !important;
        background: linear-gradient(135deg, #7258ef, #5541d2) !important;
        color: #fff !important;
        box-shadow: 0 8px 22px rgba(85, 65, 210, .24), inset 0 1px 0 rgba(255, 255, 255, .15) !important;
        font-weight: 780 !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      .gg-v4-panel button:not(.gg-v4-fab):active,
      .gg-v4-panel [role="button"]:active {
        transform: scale(.975) !important;
        filter: brightness(.94) !important;
      }

      .gg-v4-footer,
      .gg-v4-panel .orange-panel-footer,
      .gg-v4-panel .gg-readable-footer {
        box-sizing: border-box !important;
        flex: 0 0 auto !important;
        margin: 0 !important;
        padding: 12px 17px calc(13px + var(--gg4-safe-bottom)) !important;
        border: 0 !important;
        border-top: 1px solid var(--gg4-line) !important;
        background: rgba(8, 12, 24, .86) !important;
        color: #8292aa !important;
        font-size: 11px !important;
        line-height: 1.5 !important;
      }

      .gg-v4-fab {
        box-sizing: border-box !important;
        width: 64px !important;
        height: 64px !important;
        min-width: 64px !important;
        min-height: 64px !important;
        display: grid !important;
        place-items: center !important;
        position: relative !important;
        overflow: visible !important;
        padding: 0 !important;
        border: 1px solid rgba(196, 181, 253, .45) !important;
        border-radius: 22px !important;
        background:
          radial-gradient(circle at 30% 22%, rgba(255, 255, 255, .18), transparent 31%),
          linear-gradient(145deg, #775cf5 0%, #5140c7 55%, #27324c 100%) !important;
        color: #fff !important;
        box-shadow: 0 18px 42px rgba(35, 26, 87, .5), inset 0 1px 0 rgba(255, 255, 255, .2) !important;
        touch-action: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-touch-callout: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      .gg-v4-fab::before {
        content: "";
        position: absolute !important;
        inset: -7px !important;
        z-index: -1 !important;
        border-radius: 27px !important;
        background: rgba(124, 92, 255, .16) !important;
        animation: gg-v4-pulse 2.6s ease-in-out infinite !important;
      }
      .gg-v4-fab-core {
        width: 27px !important;
        height: 27px !important;
        display: grid !important;
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 4px !important;
        pointer-events: none !important;
      }
      .gg-v4-fab-core i {
        display: block !important;
        border-radius: 4px !important;
        background: rgba(255, 255, 255, .94) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, .18) !important;
      }
      .gg-v4-fab-label {
        position: absolute !important;
        left: 50% !important;
        bottom: 5px !important;
        transform: translateX(-50%) !important;
        color: rgba(255, 255, 255, .82) !important;
        font-size: 8px !important;
        font-weight: 800 !important;
        letter-spacing: .08em !important;
        pointer-events: none !important;
      }
      .gg-v4-fab-legacy {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        overflow: hidden !important;
        clip: rect(0,0,0,0) !important;
        white-space: nowrap !important;
      }
      .gg-v4-fab:active { transform: scale(.94) !important; }

      @keyframes gg-v4-pulse {
        0%, 100% { transform: scale(.92); opacity: .35; }
        50% { transform: scale(1.06); opacity: .12; }
      }

      @media (max-width: 600px) {
        .gg-v4-panel {
          position: fixed !important;
          left: var(--gg4-safe-left) !important;
          right: var(--gg4-safe-right) !important;
          bottom: 0 !important;
          top: auto !important;
          width: auto !important;
          max-width: none !important;
          max-height: calc(88vh - var(--gg4-safe-top)) !important;
          max-height: calc(88dvh - var(--gg4-safe-top)) !important;
          border-left: 0 !important;
          border-right: 0 !important;
          border-bottom: 0 !important;
          border-radius: 27px 27px 0 0 !important;
          transform: none !important;
        }
        .gg-v4-body { padding: 12px !important; }
        .gg-v4-section { border-radius: 17px !important; }
      }

      @media (max-height: 520px) and (orientation: landscape) {
        .gg-v4-panel {
          max-height: calc(96dvh - var(--gg4-safe-top) - var(--gg4-safe-bottom)) !important;
        }
        .gg-v4-hero,
        .gg-v4-panel .orange-panel-head { padding-top: 10px !important; padding-bottom: 10px !important; }
        .gg-v4-body { padding-top: 9px !important; padding-bottom: 9px !important; }
      }

      @media (prefers-reduced-motion: reduce) {
        .gg-v4-fab::before { animation: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function createSection(label, className) {
    const section = document.createElement("section");
    section.className = `gg-v4-section ${className}`;
    const heading = document.createElement("div");
    heading.className = "gg-v4-section-label";
    heading.textContent = label;
    const content = document.createElement("div");
    content.className = `${className}-content`;
    section.append(heading, content);
    return { section, content };
  }

  function ensurePanelStructure(panel) {
    if (!(panel instanceof HTMLElement)) return;
    installStyles();
    panel.classList.remove("gg-runtime-panel-v3");
    panel.classList.add("gg-v4-panel");

    let sheet = panel.querySelector(":scope > .gg-v4-sheet");
    if (!sheet) {
      const existingChildren = Array.from(panel.children);
      sheet = document.createElement("div");
      sheet.className = "gg-v4-sheet";
      const grabber = document.createElement("div");
      grabber.className = "gg-v4-grabber";
      const hero = document.createElement("div");
      hero.className = "gg-v4-hero";
      const body = document.createElement("div");
      body.className = "gg-v4-body";
      const notice = createSection("使用提示", "gg-v4-notice");
      const actions = createSection("快捷功能", "gg-v4-actions");
      const extras = createSection("当前状态", "gg-v4-status");
      const footer = document.createElement("div");
      footer.className = "gg-v4-footer";
      body.append(notice.section, actions.section, extras.section);
      sheet.append(grabber, hero, body, footer);
      panel.appendChild(sheet);

      for (const child of existingChildren) {
        if (child === sheet) continue;
        if (child.matches(".orange-panel-head")) hero.appendChild(child);
        else if (child.matches(".orange-panel-list")) actions.content.appendChild(child);
        else if (child.matches(".orange-panel-footer,.gg-readable-footer")) footer.appendChild(child);
        else extras.content.appendChild(child);
      }
    }

    const hero = sheet.querySelector(".gg-v4-hero");
    const noticeContent = sheet.querySelector(".gg-v4-notice-content");
    const actionsContent = sheet.querySelector(".gg-v4-actions-content");
    const statusContent = sheet.querySelector(".gg-v4-status-content");
    const footer = sheet.querySelector(".gg-v4-footer");

    panel.querySelectorAll(".orange-panel-head").forEach((node) => {
      if (hero && node.parentElement !== hero) hero.appendChild(node);
    });
    panel.querySelectorAll("#gg-readable-notice-list").forEach((node) => {
      if (noticeContent && node.parentElement !== noticeContent) noticeContent.appendChild(node);
    });
    panel.querySelectorAll(".orange-panel-list").forEach((node) => {
      if (actionsContent && node.parentElement !== actionsContent) actionsContent.appendChild(node);
    });
    panel.querySelectorAll("#gg-readable-maintainer,.gg-readable-subtitle,.orange-panel-desc").forEach((node) => {
      if (!node.closest(".orange-panel-head") && statusContent && node.parentElement !== statusContent) {
        statusContent.appendChild(node);
      }
    });
    panel.querySelectorAll(".orange-panel-footer,.gg-readable-footer").forEach((node) => {
      if (footer && node.parentElement !== footer) footer.appendChild(node);
    });
    panel.querySelectorAll(".orange-panel-meta span:last-child").forEach((node) => {
      node.textContent = "移动端控制中心";
    });

    const noticeSection = sheet.querySelector(".gg-v4-notice");
    const actionsSection = sheet.querySelector(".gg-v4-actions");
    const statusSection = sheet.querySelector(".gg-v4-status");
    if (noticeSection) noticeSection.hidden = !noticeContent?.children.length;
    if (actionsSection) actionsSection.hidden = !actionsContent?.children.length;
    if (statusSection) statusSection.hidden = !statusContent?.children.length;
  }

  function isFab(button) {
    if (!(button instanceof HTMLButtonElement)) return false;
    if (button.classList.contains("gg-v4-fab")) return true;
    const title = String(button.title || "");
    const text = String(button.textContent || "").trim();
    return title.includes("拖动") || title.includes("展开") || text === "G";
  }

  function upgradeFab(button) {
    if (!isFab(button) || button.dataset.ggFabV4 === "1") return;
    button.dataset.ggFabV4 = "1";
    button.classList.remove("gg-runtime-fab-v3");
    button.classList.add("gg-v4-fab");
    button.setAttribute("aria-label", "打开控制中心");
    button.innerHTML = `
      <span class="gg-v4-fab-core" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="gg-v4-fab-label" aria-hidden="true">菜单</span>
      <span class="gg-v4-fab-legacy">G</span>
    `;
  }

  function syncInterface() {
    syncScheduled = false;
    installStyles();
    document.querySelectorAll(panelSelector).forEach((head) => {
      const panel = head.parentElement;
      if (panel) ensurePanelStructure(panel);
    });
    document.querySelectorAll(fabSelector).forEach(upgradeFab);
  }

  function scheduleInterfaceSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(syncInterface);
  }

  function buildPayload(source) {
    const url = new URL(source, document.baseURI);
    const params = url.searchParams;
    const goodsId = params.get("goods_id") || params.get("goodsId");
    const buyNum = parseInt(params.get("buy_num") || params.get("buyNum") || "1", 10) || 1;
    const callbackName = params.get("jsonCallback") || params.get("callback") || params.get("cb");
    const requestId = `${Date.now()}-${++requestSequence}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      callbackName,
      requestId,
      response: {
        status: 1,
        msg: "successful",
        data: {
          goods_id: goodsId,
          order_id: `${Date.now()}${requestSequence}${Math.floor(Math.random() * 10000)}`,
          buy_num: buyNum,
        },
      },
    };
  }

  function callbackIsReady(name) {
    if (!name) return false;
    let value = window;
    for (const part of String(name).split(".")) {
      if (!part || value == null) return false;
      value = value[part];
    }
    return typeof value === "function";
  }

  function buildSynchronousJsonpSource(callbackName, payload, requestId) {
    const callbackLiteral = JSON.stringify(String(callbackName));
    const payloadLiteral = JSON.stringify(payload);
    const code = `;(function(){var value=window;var parts=${callbackLiteral}.split('.');for(var i=0;i<parts.length;i++){value=value&&value[parts[i]];}if(typeof value==='function'){value(${payloadLiteral});}})();`;
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}#gg-${encodeURIComponent(requestId)}`;
  }

  function installJsonpTransportV4() {
    const createMarker = Symbol.for("gg.runtime.jsonp-transport.v4");
    if (document[createMarker]) return;
    const previousCreateElement = document.createElement;

    document.createElement = function(tagName, ...args) {
      const node = previousCreateElement.call(this, tagName, ...args);
      if (String(tagName).toLowerCase() !== "script") return node;

      const nodeMarker = Symbol.for("gg.runtime.jsonp-node.v4");
      if (node[nodeMarker]) return node;
      Object.defineProperty(node, nodeMarker, { value: true, configurable: true });

      const ownDescriptor = Object.getOwnPropertyDescriptor(node, "src");
      const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
      const nativeSetAttribute = node.setAttribute.bind(node);
      const nativeGetAttribute = node.getAttribute.bind(node);
      let fallbackTimer = 0;
      let waitTimer = 0;
      let settled = false;

      const setUnderlyingSource = (value) => {
        if (ownDescriptor && typeof ownDescriptor.set === "function") {
          return ownDescriptor.set.call(node, value);
        }
        if (nativeDescriptor && typeof nativeDescriptor.set === "function") {
          return nativeDescriptor.set.call(node, value);
        }
        return nativeSetAttribute("src", value);
      };
      const getUnderlyingSource = () => {
        if (ownDescriptor && typeof ownDescriptor.get === "function") {
          return ownDescriptor.get.call(node);
        }
        if (nativeDescriptor && typeof nativeDescriptor.get === "function") {
          return nativeDescriptor.get.call(node);
        }
        return nativeGetAttribute("src");
      };

      const routeSource = (value) => {
        const source = String(value);
        if (!source.includes("createBuyOrder")) return setUnderlyingSource(source);

        let built;
        try {
          built = buildPayload(source);
        } catch (_) {
          return setUnderlyingSource(source);
        }
        if (!built.callbackName || !built.response.data.goods_id) {
          return setUnderlyingSource(source);
        }

        clearInterval(waitTimer);
        clearTimeout(fallbackTimer);
        settled = false;
        node.dataset.ggRequestId = built.requestId;

        const commitLocalResponse = () => {
          if (settled || !callbackIsReady(built.callbackName)) return false;
          settled = true;
          clearInterval(waitTimer);
          clearTimeout(fallbackTimer);
          const localSource = buildSynchronousJsonpSource(
            built.callbackName,
            built.response,
            built.requestId,
          );
          setUnderlyingSource(localSource);
          return true;
        };

        if (!commitLocalResponse()) {
          waitTimer = window.setInterval(commitLocalResponse, 12);
          fallbackTimer = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            clearInterval(waitTimer);
            setUnderlyingSource(source);
          }, 1600);
        }
        return source;
      };

      Object.defineProperty(node, "src", {
        configurable: true,
        enumerable: true,
        get: getUnderlyingSource,
        set: routeSource,
      });
      node.setAttribute = function(name, value) {
        if (String(name).toLowerCase() === "src") return routeSource(value);
        return nativeSetAttribute(name, value);
      };
      return node;
    };

    Object.defineProperty(document, createMarker, {
      value: previousCreateElement,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }

  function installXhrTransportV4() {
    if (typeof XMLHttpRequest === "undefined") return;
    const prototype = XMLHttpRequest.prototype;
    const marker = Symbol.for("gg.runtime.xhr-transport.v4");
    if (prototype[marker]) return;

    const previousOpen = prototype.open;
    const previousSend = prototype.send;
    const stateKey = Symbol.for("gg.runtime.xhr-state.v4");

    prototype.open = function(method, url, ...rest) {
      const source = String(url);
      this[stateKey] = source.includes("createBuyOrder") ? { source, method: String(method) } : null;
      return previousOpen.call(this, method, url, ...rest);
    };

    prototype.send = function(body) {
      const state = this[stateKey];
      if (!state) return previousSend.call(this, body);

      let built;
      try {
        built = buildPayload(state.source);
      } catch (_) {
        return previousSend.call(this, body);
      }
      const responseText = JSON.stringify(built.response);
      let readyState = 1;
      let aborted = false;

      try {
        Object.defineProperties(this, {
          readyState: { configurable: true, get: () => readyState },
          status: { configurable: true, get: () => 200 },
          statusText: { configurable: true, get: () => "OK" },
          responseURL: { configurable: true, get: () => state.source },
          responseText: { configurable: true, get: () => responseText },
          response: {
            configurable: true,
            get: () => this.responseType === "json" ? built.response : responseText,
          },
        });
      } catch (_) {
        return previousSend.call(this, body);
      }

      const previousAbort = this.abort;
      this.abort = function() {
        aborted = true;
        readyState = 0;
        try { this.dispatchEvent(new Event("abort")); } catch (_) {}
        try { this.dispatchEvent(new Event("loadend")); } catch (_) {}
        if (typeof previousAbort === "function") {
          try { previousAbort.call(this); } catch (_) {}
        }
      };

      queueMicrotask(() => {
        if (aborted) return;
        readyState = 4;
        try { this.dispatchEvent(new Event("readystatechange")); } catch (_) {}
        try { this.dispatchEvent(new Event("load")); } catch (_) {}
        try { this.dispatchEvent(new Event("loadend")); } catch (_) {}
      });
      return undefined;
    };

    Object.defineProperty(prototype, marker, {
      value: { open: previousOpen, send: previousSend },
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }

  const observer = new MutationObserver(scheduleInterfaceSync);
  const start = () => {
    installStyles();
    installJsonpTransportV4();
    installXhrTransportV4();
    syncInterface();
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    window.addEventListener("resize", scheduleInterfaceSync, { passive: true });
    window.addEventListener("orientationchange", scheduleInterfaceSync, { passive: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
// ===== End GG runtime experience v4 =====
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
        String[] required = {
                "gg-runtime-mobile-sheet-v4",
                "gg-v4-sheet",
                "gg-v4-fab-core",
                "gg.runtime.jsonp-transport.v4",
                "buildSynchronousJsonpSource",
                "data:text/javascript;charset=utf-8",
                "gg.runtime.xhr-transport.v4"
        };
        for (String marker : required) {
            if (!text.contains(marker)) {
                throw new SecurityException("体验层缺少必要结构: " + marker);
            }
        }
        if (text.contains("dispatchEvent(new Event(\"load\"))")) {
            throw new SecurityException("仍存在手动抢跑脚本完成事件");
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
