from pathlib import Path

path = Path("remote-script/src/noname.js")
text = path.read_text(encoding="utf-8")

old_version = "// @version      1.0.5"
new_version = "// @version      1.0.6"
if new_version not in text:
    if old_version not in text:
        raise SystemExit("Expected current script version 1.0.5")
    text = text.replace(old_version, new_version, 1)

marker = "// ===== 小屏菜单滚动适配 ====="
if marker not in text:
    text += r'''

// ===== 小屏菜单滚动适配 =====
(() => {
  const config = USER_PANEL_CONFIG;
  const styleId = "gg-panel-viewport-style-v1";
  const panelClass = "gg-viewport-scroll-panel";
  let applying = false;
  let scheduled = false;

  function injectViewportStyle() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .${panelClass} {
        box-sizing: border-box !important;
        min-height: 0 !important;
        max-width: calc(100vw - 16px) !important;
        max-height: calc(100vh - 24px) !important;
        max-height: calc(100dvh - 24px) !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
        scrollbar-width: thin;
      }

      @supports (padding: max(0px)) {
        .${panelClass} {
          max-height: calc(100dvh - max(12px, env(safe-area-inset-top)) - max(12px, env(safe-area-inset-bottom))) !important;
        }
      }

      @media (max-height: 650px) {
        .${panelClass} {
          max-height: calc(100vh - 12px) !important;
          max-height: calc(100dvh - 12px) !important;
        }
        #gg-readable-notice-list {
          margin: 6px 0 8px !important;
          padding: 8px 10px 8px 30px !important;
          line-height: 1.55 !important;
        }
        #gg-readable-notice-list li {
          margin: 3px 0 !important;
        }
        #gg-readable-maintainer {
          margin-top: 3px !important;
        }
      }

      @media (max-height: 520px) {
        .${panelClass} {
          max-height: calc(100vh - 8px) !important;
          max-height: calc(100dvh - 8px) !important;
        }
        #gg-readable-notice-list {
          margin: 4px 0 6px !important;
          padding-top: 6px !important;
          padding-bottom: 6px !important;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function leafWithExactText(value) {
    if (!value || !document.body) return null;
    const nodes = document.body.querySelectorAll("*");
    for (const node of nodes) {
      if (node.childElementCount !== 0) continue;
      if ((node.textContent || "").trim() === value) return node;
    }
    return null;
  }

  function findMenuPanel(title) {
    const relatedTexts = [config.subtitle, config.fullscreenName, config.customName, config.footerText].filter(Boolean);
    let node = title;
    while (node && node !== document.body && node !== document.documentElement) {
      const text = node.textContent || "";
      const matches = relatedTexts.reduce((count, value) => count + (text.includes(value) ? 1 : 0), 0);
      const rect = node.getBoundingClientRect();
      if (matches >= 2 && rect.width >= 180 && rect.height >= 120) return node;
      node = node.parentElement;
    }
    return null;
  }

  function applyViewportLimit() {
    if (applying || !document.documentElement) return;
    applying = true;
    try {
      injectViewportStyle();
      const title = leafWithExactText(config.title);
      if (!title) return;
      const panel = findMenuPanel(title);
      if (panel) panel.classList.add(panelClass);
    } finally {
      applying = false;
    }
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyViewportLimit();
    });
  }

  function start() {
    applyViewportLimit();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleApply, { passive: true });
    window.addEventListener("orientationchange", scheduleApply, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
'''

path.write_text(text, encoding="utf-8")
