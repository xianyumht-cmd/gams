#!/usr/bin/env python3
"""Append a CSS-only compact panel layout to the real noname.js source.

No DOM reconstruction, observers, click handlers, XHR hooks, JSONP hooks, or game logic
are changed here. The unresolved repeated-purchase issue is intentionally out of scope.
"""

from __future__ import annotations

import argparse
from pathlib import Path

TARGET = Path("remote-script/src/noname.js")
MARKER = "gg.source.compact-panel.v6"
STYLE_ID = "gg-source-compact-panel-v6"

PATCH = r'''

// ===== GG source compact scrollable panel v6 =====
(() => {
  const marker = Symbol.for("gg.source.compact-panel.v6");
  if (window[marker]) return;
  Object.defineProperty(window, marker, {
    value: true,
    configurable: true,
    enumerable: false,
    writable: false,
  });

  const install = () => {
    if (document.getElementById("gg-source-compact-panel-v6")) return;
    const style = document.createElement("style");
    style.id = "gg-source-compact-panel-v6";
    style.textContent = `
      #orange-script-panel {
        box-sizing: border-box !important;
        height: auto !important;
        max-height: calc(100vh - 24px) !important;
        max-height: calc(100dvh - 24px) !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        overscroll-behavior-x: none !important;
        overscroll-behavior-y: contain !important;
        touch-action: pan-y !important;
        -webkit-overflow-scrolling: touch !important;
        scrollbar-width: thin !important;
      }

      #orange-script-panel * {
        box-sizing: border-box !important;
      }

      #orange-script-panel .orange-panel-head {
        position: relative !important;
        top: auto !important;
        padding: 10px 12px !important;
      }

      #orange-script-panel .orange-panel-title,
      #orange-script-panel .gg-readable-title {
        margin: 0 !important;
        font-size: 15px !important;
        line-height: 1.25 !important;
      }

      #orange-script-panel .orange-panel-desc,
      #orange-script-panel .gg-readable-subtitle,
      #orange-script-panel #gg-readable-maintainer {
        margin-top: 3px !important;
        font-size: 11px !important;
        line-height: 1.35 !important;
      }

      #orange-script-panel #gg-readable-notice-list {
        margin: 7px 8px !important;
        padding: 7px 8px 7px 26px !important;
        border-radius: 10px !important;
        font-size: 11px !important;
        line-height: 1.38 !important;
      }

      #orange-script-panel #gg-readable-notice-list li {
        margin: 0 0 2px !important;
        padding: 0 !important;
      }

      #orange-script-panel .orange-panel-list {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        align-items: stretch !important;
        gap: 6px !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 8px 8px !important;
        overflow: visible !important;
      }

      #orange-script-panel .orange-switch-item {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 5px !important;
        min-width: 0 !important;
        min-height: 48px !important;
        margin: 0 !important;
        padding: 6px 7px !important;
        border-radius: 10px !important;
      }

      #orange-script-panel .orange-switch-label,
      #orange-script-panel .orange-switch-row {
        display: flex !important;
        align-items: center !important;
        gap: 5px !important;
        min-width: 0 !important;
        margin: 0 !important;
      }

      #orange-script-panel .orange-switch-icon {
        display: inline-flex !important;
        flex: 0 0 22px !important;
        align-items: center !important;
        justify-content: center !important;
        width: 22px !important;
        height: 22px !important;
        min-width: 22px !important;
        min-height: 22px !important;
        border-radius: 7px !important;
        font-size: 11px !important;
        line-height: 1 !important;
      }

      #orange-script-panel .orange-switch-name,
      #orange-script-panel .gg-readable-item-title {
        overflow: hidden !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        line-height: 1.2 !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      #orange-script-panel .orange-switch-tip {
        display: -webkit-box !important;
        overflow: hidden !important;
        margin-top: 2px !important;
        font-size: 9px !important;
        line-height: 1.2 !important;
        -webkit-box-orient: vertical !important;
        -webkit-line-clamp: 2 !important;
      }

      #orange-script-panel .orange-switch-side {
        display: flex !important;
        flex: 0 0 auto !important;
        align-items: center !important;
        justify-content: flex-end !important;
        min-width: 0 !important;
      }

      #orange-script-panel button,
      #orange-script-panel [role="button"] {
        width: auto !important;
        min-width: 42px !important;
        min-height: 28px !important;
        height: 28px !important;
        margin: 0 !important;
        padding: 3px 8px !important;
        border-radius: 8px !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        line-height: 20px !important;
        white-space: nowrap !important;
      }

      #orange-script-panel input[type="checkbox"] + span,
      #orange-script-panel input[type="checkbox"] ~ span {
        transform: scale(.82) !important;
        transform-origin: center !important;
      }

      #orange-script-panel .orange-panel-footer,
      #orange-script-panel .gg-readable-footer {
        margin: 0 !important;
        padding: 7px 10px calc(7px + env(safe-area-inset-bottom, 0px)) !important;
        font-size: 9px !important;
        line-height: 1.3 !important;
      }

      #orange-script-panel-button {
        width: 48px !important;
        height: 48px !important;
        min-width: 48px !important;
        min-height: 48px !important;
        border-radius: 15px !important;
        font-size: 14px !important;
        line-height: 48px !important;
      }

      @media (max-width: 360px) {
        #orange-script-panel .orange-panel-list {
          gap: 4px !important;
          padding-left: 6px !important;
          padding-right: 6px !important;
        }
        #orange-script-panel .orange-switch-item {
          min-height: 44px !important;
          padding: 5px !important;
        }
        #orange-script-panel .orange-switch-tip {
          display: none !important;
        }
        #orange-script-panel button,
        #orange-script-panel [role="button"] {
          min-width: 36px !important;
          padding-left: 6px !important;
          padding-right: 6px !important;
          font-size: 9px !important;
        }
      }

      @media (max-height: 560px) and (orientation: landscape) {
        #orange-script-panel {
          max-height: calc(100dvh - 8px) !important;
        }
        #orange-script-panel #gg-readable-notice-list {
          font-size: 10px !important;
          line-height: 1.25 !important;
        }
        #orange-script-panel .orange-switch-item {
          min-height: 42px !important;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  if (document.documentElement) install();
  else document.addEventListener("DOMContentLoaded", install, { once: true });
})();
// ===== End GG source compact scrollable panel v6 =====
'''


def verify(source: str) -> None:
    required = (
        'Symbol.for("gg.source.ui-mobile.v5")',
        'gg.source.xhr.v5',
        'gg.source.jsonp.v5',
        'Symbol.for("gg.source.compact-panel.v6")',
        'touch-action: pan-y !important',
        'grid-template-columns: repeat(2, minmax(0, 1fr)) !important',
        'min-height: 28px !important',
    )
    for token in required:
        if token not in source:
            raise SystemExit(f"missing required compact-panel token: {token}")
    if source.count('Symbol.for("gg.source.compact-panel.v6")') != 1:
        raise SystemExit("compact-panel marker count mismatch")
    forbidden = (
        'gg.runtime.experience.v4',
        'new MutationObserver(scheduleInterfaceSync)',
        'gg-v4-sheet',
    )
    for token in forbidden:
        if token in source:
            raise SystemExit(f"forbidden runtime patch token remains: {token}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    source = TARGET.read_text(encoding="utf-8")
    if args.verify_only:
        verify(source)
        print("compact panel v6 verified")
        return 0

    if MARKER not in source:
        source += PATCH
        TARGET.write_text(source, encoding="utf-8", newline="")
    verify(source)
    print("compact panel v6 applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
