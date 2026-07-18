from pathlib import Path
import re

main_path = Path("client/src/main/java/com/jinli/quickweb/MainActivity.java")
build_path = Path("client/build.gradle.kts")
main = main_path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global main
    count = main.count(old)
    if count != 1:
        raise SystemExit(f"Cannot patch {label}: expected 1 match, got {count}")
    main = main.replace(old, new, 1)


replace_once(
    "    private String wrappedUserScript;\n"
    "    private boolean nativeDocumentStartEnabled;",
    "    private String wrappedUserScript;\n"
    "    private int loadedScriptVersion;\n"
    "    private String loadedScriptVersionName = \"内置版本\";\n"
    "    private String loadedScriptOrigin = \"内置兜底\";\n"
    "    private RemoteScriptManager scriptManager;\n"
    "    private boolean nativeDocumentStartEnabled;",
    "remote script fields",
)

replace_once(
    "    private void showBrowser(@Nullable Bundle savedInstanceState) {\n"
    "        wrappedUserScript = wrapUserScript(readAssetText(\"noname.js\"));\n"
    "        createBrowserUi();\n"
    "        configureWebView();\n"
    "        if (savedInstanceState != null) {\n"
    "            webView.restoreState(savedInstanceState);\n"
    "        } else {\n"
    "            webView.loadUrl(START_URL);\n"
    "        }\n"
    "    }",
    "    private void showBrowser(@Nullable Bundle savedInstanceState) {\n"
    "        if (scriptManager == null) scriptManager = new RemoteScriptManager(this);\n"
    "        RemoteScriptManager.ScriptBundle scriptBundle =\n"
    "                scriptManager.loadLocalOrBundled(readAssetText(\"noname.js\"));\n"
    "        loadedScriptVersion = scriptBundle.version;\n"
    "        loadedScriptVersionName = scriptBundle.versionName;\n"
    "        loadedScriptOrigin = scriptBundle.origin;\n"
    "        wrappedUserScript = wrapUserScript(scriptBundle.source);\n\n"
    "        createBrowserUi();\n"
    "        configureWebView();\n"
    "        if (savedInstanceState != null) {\n"
    "            webView.restoreState(savedInstanceState);\n"
    "        } else {\n"
    "            webView.loadUrl(START_URL);\n"
    "        }\n\n"
    "        scriptManager.refreshAsync(loadedScriptVersion, result -> {\n"
    "            if (isFinishing() || isDestroyed()) return;\n"
    "            if (result.updated) {\n"
    "                Toast.makeText(MainActivity.this,\n"
    "                        \"脚本已更新到 \" + result.versionName + \"，下次打开自动生效。\",\n"
    "                        Toast.LENGTH_LONG).show();\n"
    "            }\n"
    "        });\n"
    "    }",
    "browser startup",
)

replace_once(
    "        String summary = result.valid\n"
    "                ? (result.permanent ? \"当前卡密：永久有效\" : \"当前卡密到期日：\" + result.expiryText)\n"
    "                : \"当前卡密状态异常\";",
    "        String summary = result.valid\n"
    "                ? (result.permanent ? \"当前卡密：永久有效\" : \"当前卡密到期日：\" + result.expiryText)\n"
    "                : \"当前卡密状态异常\";\n"
    "        summary += \"\\n脚本版本：\" + loadedScriptVersionName + \"（\" + loadedScriptOrigin + \"）\";",
    "license information",
)

replace_once(
    "    @Override\n"
    "    protected void onDestroy() {\n"
    "        destroyWebView();\n"
    "        super.onDestroy();\n"
    "    }",
    "    @Override\n"
    "    protected void onDestroy() {\n"
    "        if (scriptManager != null) {\n"
    "            scriptManager.shutdown();\n"
    "            scriptManager = null;\n"
    "        }\n"
    "        destroyWebView();\n"
    "        super.onDestroy();\n"
    "    }",
    "manager shutdown",
)

main_path.write_text(main, encoding="utf-8")

build = build_path.read_text(encoding="utf-8")
build, code_count = re.subn(r"versionCode\s*=\s*\d+", "versionCode = 2", build, count=1)
build, name_count = re.subn(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.1.0"', build, count=1)
if code_count != 1 or name_count != 1:
    raise SystemExit("Cannot update client version")
build_path.write_text(build, encoding="utf-8")

print("Patched client for signed remote script updates")
