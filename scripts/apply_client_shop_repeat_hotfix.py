#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_exact(text: str, old: str, new: str, expected: int, label: str) -> str:
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new)


main_path = Path("v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java")
text = main_path.read_text(encoding="utf-8")

old_finished = '''            @Override
            public void onPageFinished(WebView view, String url) {
                statusText.setText("已就绪");
                CookieManager.getInstance().flush();
                if (!nativeDocumentStartEnabled && isTargetPage(url)) {
                    view.evaluateJavascript(wrappedControlScript, null);
                }
            }
'''
new_finished = '''            @Override
            public void onPageFinished(WebView view, String url) {
                statusText.setText("已就绪");
                CookieManager.getInstance().flush();
                ensureControlScriptInjected(view, url);
            }
'''
text = replace_once(text, old_finished, new_finished, "page-finished injection")

old_navigation = '''            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    Toast.makeText(MainActivity.this, "无法打开此链接", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
'''
new_navigation = '''            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigationInsideGg(view, request == null ? null : request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigationInsideGg(view, url == null ? null : Uri.parse(url));
            }
'''
text = replace_once(text, old_navigation, new_navigation, "navigation override")

install_marker = '''    private void installDocumentStartScript() {
'''
helper = '''    private boolean handleNavigationInsideGg(WebView view, Uri uri) {
        if (uri == null) return true;
        String scheme = uri.getScheme();
        if (scheme == null || scheme.isEmpty()) return false;

        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            return false;
        }

        if ("tel".equalsIgnoreCase(scheme)
                || "mailto".equalsIgnoreCase(scheme)
                || "sms".equalsIgnoreCase(scheme)
                || "smsto".equalsIgnoreCase(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                Toast.makeText(this, "无法打开此系统功能", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        if ("intent".equalsIgnoreCase(scheme)) {
            Toast.makeText(this, "已阻止外部浏览器跳转", Toast.LENGTH_SHORT).show();
            return true;
        }

        if ("about".equalsIgnoreCase(scheme)
                || "javascript".equalsIgnoreCase(scheme)
                || "data".equalsIgnoreCase(scheme)
                || "blob".equalsIgnoreCase(scheme)) {
            return false;
        }

        Toast.makeText(this, "已阻止未知外部链接", Toast.LENGTH_SHORT).show();
        return true;
    }

    private void ensureControlScriptInjected(WebView view, String url) {
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
text = replace_once(text, install_marker, helper + install_marker, "navigation and injection helpers")

old_wrapper = '''    private String wrapControlScript(String source) {
        return "(function(){" +
                "if(window.__GG_V2_CONTROL_LOADED__)return;" +
                "window.__GG_V2_CONTROL_LOADED__=true;" +
                "try{\\n" + source + "\\n}catch(e){" +
                "window.__GG_V2_CONTROL_LOADED__=false;" +
                "console.error('[GG]',e);}" +
                "})();";
    }
'''
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
    }
'''
text = replace_once(text, old_wrapper, new_wrapper, "script loading guard")
text = replace_once(
    text,
    "source:'native-2.0.2'",
    "source:'native-2.0.7-stable'",
    "suppressed alert source marker",
)

for forbidden in (
    "boolean onCreateWindow",
    "new WebView(MainActivity.this)",
    "setSupportMultipleWindows(true)",
):
    if forbidden in text:
        raise SystemExit(f"forbidden multi-window regression returned: {forbidden}")
for required in (
    "setSupportMultipleWindows(false)",
    "handleNavigationInsideGg",
    "ensureControlScriptInjected",
    "__GG_V2_CONTROL_LOADING__",
    '"intent".equalsIgnoreCase(scheme)',
):
    if required not in text:
        raise SystemExit(f"missing client hotfix contract: {required}")
main_path.write_text(text, encoding="utf-8")

build_path = Path("v2/android/client/build.gradle.kts")
build = build_path.read_text(encoding="utf-8")
build = replace_once(build, 'versionCode = 16', 'versionCode = 17', "client versionCode")
build = replace_once(build, 'versionName = "2.0.3-stable"', 'versionName = "2.0.7-stable"', "client versionName")
build_path.write_text(build, encoding="utf-8")

workflow_path = Path(".github/workflows/v2-build-apks.yml")
workflow = workflow_path.read_text(encoding="utf-8")
workflow = replace_once(
    workflow,
    "grep -Fq 'versionCode = 16'",
    "grep -Fq 'versionCode = 17'",
    "formal versionCode assertion",
)
workflow = replace_once(
    workflow,
    "grep -Fq 'versionName = \"2.0.3-stable\"'",
    "grep -Fq 'versionName = \"2.0.7-stable\"'",
    "formal versionName assertion",
)
workflow = replace_once(
    workflow,
    '''          ! grep -Fq 'new WebView(MainActivity.this)' "$client"
''',
    '''          ! grep -Fq 'new WebView(MainActivity.this)' "$client"
          grep -Fq 'handleNavigationInsideGg' "$client"
          grep -Fq 'ensureControlScriptInjected' "$client"
          grep -Fq '__GG_V2_CONTROL_LOADING__' "$client"
          grep -Fq '@version      1.1.4' remote-script/src/noname.js
          grep -Fq '__ggOneShotCallback' remote-script/src/noname.js
          grep -Fq '__ggOriginalCallback' remote-script/src/noname.js
          jq -e '.versionName == "2.0.5"' v2/runtime/release/manifest.json >/dev/null
''',
    "formal hotfix assertions",
)
workflow = replace_exact(
    workflow,
    "GG-2.0.3-stable-code16.apk",
    "GG-2.0.7-stable-code17.apk",
    2,
    "formal client filename",
)
workflow = replace_once(
    workflow,
    "versionCode='16' versionName='2.0.3-stable'",
    "versionCode='17' versionName='2.0.7-stable'",
    "formal badging assertion",
)
workflow_path.write_text(workflow, encoding="utf-8")

print("client navigation and repeat-purchase hotfix applied")
