#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# 1. Core script: make the per-request JSONP callback one-shot and restore it.
script_path = Path("remote-script/src/noname.js")
script = script_path.read_text(encoding="utf-8")
script = replace_once(
    script,
    "// @version      1.1.3",
    "// @version      1.1.4",
    "script version",
)
old_callback = '''                const XBbHBMQ=window[Epe456s];
                window[Epe456s]=function() {
                  if(typeof XBbHBMQ==="functi"+"on") {
                    XBbHBMQ( {
                      ["status"]:1,
                      ["msg"]:"succes"+"sful",
                      ["data"]: {
                        ["goods_"+"id"]:vUYe8N,
                        ["order_"+"id"]:zCSo6J["generateTimestamp"](),
                        ["buy_nu"+"m"]:parseInt(yWpiJH,
                        10)
                      }
                    })
                  }
                }'''
new_callback = '''                const XBbHBMQ=window[Epe456s]&&window[Epe456s].__ggOriginalCallback||window[Epe456s];
                let __ggCallbackDone=false;
                const __ggOneShotCallback=function() {
                  if(__ggCallbackDone) {
                    return
                  }
                  __ggCallbackDone=true;
                  try {
                    if(typeof XBbHBMQ==="functi"+"on") {
                      XBbHBMQ( {
                        ["status"]:1,
                        ["msg"]:"succes"+"sful",
                        ["data"]: {
                          ["goods_"+"id"]:vUYe8N,
                          ["order_"+"id"]:zCSo6J["generateTimestamp"](),
                          ["buy_nu"+"m"]:parseInt(yWpiJH,
                          10)
                        }
                      })
                    }
                  }
                  finally {
                    if(window[Epe456s]===__ggOneShotCallback) {
                      if(typeof XBbHBMQ==="functi"+"on") {
                        window[Epe456s]=XBbHBMQ
                      }
                      else {
                        delete window[Epe456s]
                      }
                    }
                  }
                };
                Object.defineProperty(__ggOneShotCallback,"__ggOriginalCallback", {
                  ["value"]:XBbHBMQ,
                  ["config"+"urable"]:true
                });
                window[Epe456s]=__ggOneShotCallback'''
script = replace_once(script, old_callback, new_callback, "one-shot callback")
script_path.write_text(script, encoding="utf-8")


# 2. Android client: allow about:blank bootstrap windows to execute JavaScript,
# then route the real target back into the main WebView.
main_path = Path("v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java")
main = main_path.read_text(encoding="utf-8")
main = replace_once(
    main,
    '                popup.getSettings().setJavaScriptEnabled(false);',
    '                popup.getSettings().setJavaScriptEnabled(true);\n'
    '                popup.getSettings().setDomStorageEnabled(true);',
    "popup JavaScript bootstrap",
)
main = replace_once(
    main,
    '''                        if (routed) return true;
                        if (uri == null || "about:blank".equalsIgnoreCase(uri.toString())) return true;
                        routed = true;''',
    '''                        if (routed) return true;
                        if (uri == null) return true;
                        if ("about:blank".equalsIgnoreCase(uri.toString())) return false;
                        routed = true;''',
    "about blank routing",
)
main = replace_once(
    main,
    '''                if (!nativeDocumentStartEnabled && isTargetPage(url)) {
                    view.evaluateJavascript(wrappedControlScript, null);
                }
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(''',
    '''                ensureControlScriptInjected(view, url);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(''',
    "page-finished injection fallback",
)
install_marker = '''    private WebResourceResponse memoryGameResponse() {'''
helper = '''    private void ensureControlScriptInjected(WebView view, String url) {
        if (view == null || wrappedControlScript == null || !isTargetPage(url)) return;
        view.evaluateJavascript(wrappedControlScript, null);
        long[] delays = {250L, 1200L, 3000L};
        for (long delay : delays) {
            view.postDelayed(() -> {
                if (webView != view || !isTargetPage(view.getUrl())) return;
                view.evaluateJavascript(wrappedControlScript, null);
            }, delay);
        }
    }

'''
main = replace_once(main, install_marker, helper + install_marker, "injection watchdog helper")
old_wrapper = '''    private String wrapControlScript(String source) {
        return "(function(){" +
                "if(window.__GG_V2_CONTROL_LOADED__)return;" +
                "window.__GG_V2_CONTROL_LOADED__=true;" +
                "try{\\n" + source + "\\n}catch(e){" +
                "window.__GG_V2_CONTROL_LOADED__=false;" +
                "console.error('[GG]',e);}" +
                "})();";
    }'''
new_wrapper = '''    private String wrapControlScript(String source) {
        return "(function(){" +
                "if(window.__GG_V2_CONTROL_LOADED__||window.__GG_V2_CONTROL_LOADING__)return;" +
                "window.__GG_V2_CONTROL_LOADING__=true;" +
                "try{\\n" + source + "\\n" +
                "window.__GG_V2_CONTROL_LOADED__=true;" +
                "}catch(e){" +
                "window.__GG_V2_CONTROL_LOADED__=false;" +
                "console.error('[GG]',e);" +
                "}finally{window.__GG_V2_CONTROL_LOADING__=false;}" +
                "})();";
    }'''
main = replace_once(main, old_wrapper, new_wrapper, "control script state wrapper")
main = main.replace("native-2.0.4", "native-2.0.5")
main_path.write_text(main, encoding="utf-8")


# 3. Version contracts.
gradle_path = Path("v2/android/client/build.gradle.kts")
gradle = gradle_path.read_text(encoding="utf-8")
gradle = replace_once(gradle, "versionCode = 13", "versionCode = 14", "client version code")
gradle = replace_once(gradle, 'versionName = "2.0.4"', 'versionName = "2.0.5"', "client version name")
gradle_path.write_text(gradle, encoding="utf-8")

license_path = Path("v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java")
license = license_path.read_text(encoding="utf-8")
license = replace_once(
    license,
    "private static final int PROTOCOL_APP_VERSION = 13;",
    "private static final int PROTOCOL_APP_VERSION = 14;",
    "protocol app version",
)
license_path.write_text(license, encoding="utf-8")

print("Applied white-screen and repeat-action fixes")
