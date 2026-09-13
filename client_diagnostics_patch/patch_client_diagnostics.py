from pathlib import Path
import re

main_path = Path("client/src/main/java/com/jinli/quickweb/MainActivity.java")
manifest_path = Path("client/src/main/AndroidManifest.xml")
build_path = Path("client/build.gradle.kts")
rules_path = Path("client/proguard-rules.pro")
java_dir = Path("client/src/main/java/com/jinli/quickweb")
assets_dir = Path("client/src/main/assets")
xml_dir = Path("client/src/main/res/xml")
source_root = Path("client_diagnostics_patch")

java_dir.mkdir(parents=True, exist_ok=True)
assets_dir.mkdir(parents=True, exist_ok=True)
xml_dir.mkdir(parents=True, exist_ok=True)
for name in ("DiagnosticLogger.java", "DiagnosticJavascriptBridge.java"):
    (java_dir / name).write_bytes((source_root / "src/main/java/com/jinli/quickweb" / name).read_bytes())
for name in ("diagnostic-prelude.js", "diagnostic-postlude.js"):
    (assets_dir / name).write_bytes((source_root / "src/main/assets" / name).read_bytes())

text = main_path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Cannot patch {label}: expected 1 match, got {count}")
    text = text.replace(old, new, 1)

replace_once(
    "    private OnlineLicenseManager onlineLicenseManager;\n    private boolean nativeDocumentStartEnabled;",
    "    private OnlineLicenseManager onlineLicenseManager;\n    private DiagnosticLogger diagnosticLogger;\n    private DiagnosticJavascriptBridge diagnosticBridge;\n    private boolean nativeDocumentStartEnabled;",
    "diagnostic fields",
)

replace_once(
    "        WebView.setWebContentsDebuggingEnabled(false);\n        onlineLicenseManager = new OnlineLicenseManager(this);",
    "        WebView.setWebContentsDebuggingEnabled(false);\n        diagnosticLogger = new DiagnosticLogger(this);\n        diagnosticLogger.log(\"native\", \"activity_create\", \"savedState=\" + (savedInstanceState != null));\n        onlineLicenseManager = new OnlineLicenseManager(this);",
    "activity startup",
)

replace_once(
    "    private void showBrowser(@Nullable Bundle savedInstanceState, String source) {\n        wrappedUserScript = wrapUserScript(source);",
    "    private void showBrowser(@Nullable Bundle savedInstanceState, String source) {\n        diagnosticLogger.log(\"native\", \"browser_show\", \"savedState=\" + (savedInstanceState != null));\n        wrappedUserScript = wrapUserScript(diagnosticLogger.instrumentSource(source));",
    "script instrumentation",
)

replace_once(
    "        Button reset = toolbarButton(\"重置\");\n        Button license = toolbarButton(\"服务\");",
    "        Button reset = toolbarButton(\"重置\");\n        Button logs = toolbarButton(\"日志\");\n        Button license = toolbarButton(\"服务\");",
    "log button declaration",
)

replace_once(
    "        toolbar.addView(reset);\n        toolbar.addView(license);",
    "        toolbar.addView(reset);\n        toolbar.addView(logs);\n        toolbar.addView(license);",
    "log button layout",
)

replace_once(
    "        reset.setOnClickListener(v -> showResetDialog());\n        license.setOnClickListener(v -> showLicenseInfoDialog());",
    "        reset.setOnClickListener(v -> showResetDialog());\n        logs.setOnClickListener(v -> showDiagnosticsDialog());\n        license.setOnClickListener(v -> showLicenseInfoDialog());",
    "log button handler",
)

replace_once(
    "        installDocumentStartScript();\n\n        webView.setWebViewClient(new WebViewClient() {",
    "        diagnosticBridge = new DiagnosticJavascriptBridge(diagnosticLogger);\n        webView.addJavascriptInterface(diagnosticBridge, \"__GG_DIAG__\");\n        diagnosticLogger.log(\"native\", \"javascript_bridge_added\", \"name=__GG_DIAG__\");\n        installDocumentStartScript();\n\n        webView.setWebViewClient(new WebViewClient() {",
    "javascript bridge",
)

replace_once(
    "            public void onPageStarted(WebView view, String url, Bitmap favicon) {\n                statusText.setText(\"正在加载…\");",
    "            public void onPageStarted(WebView view, String url, Bitmap favicon) {\n                diagnosticLogger.logUrl(\"webview\", \"page_started\", url, \"nativeDocumentStart=\" + nativeDocumentStartEnabled);\n                statusText.setText(\"正在加载…\");",
    "page started log",
)

replace_once(
    "            public void onPageFinished(WebView view, String url) {\n                statusText.setText(\"已就绪\");",
    "            public void onPageFinished(WebView view, String url) {\n                diagnosticLogger.logUrl(\"webview\", \"page_finished\", url, \"nativeDocumentStart=\" + nativeDocumentStartEnabled);\n                statusText.setText(\"已就绪\");",
    "page finished log",
)

replace_once(
    "                Uri uri = request.getUrl();\n                String scheme = uri.getScheme();",
    "                Uri uri = request.getUrl();\n                diagnosticLogger.logUrl(\"webview\", \"navigation_request\", uri == null ? null : uri.toString(), \"mainFrame=\" + request.isForMainFrame());\n                String scheme = uri.getScheme();",
    "navigation log",
)

replace_once(
    "                if (request.isForMainFrame()) {\n                    statusText.setText(\"加载失败\");",
    "                diagnosticLogger.logUrl(\"webview\", \"resource_error\", request.getUrl() == null ? null : request.getUrl().toString(),\n                        \"mainFrame=\" + request.isForMainFrame() + \",code=\" + error.getErrorCode() + \",descriptionHash=\" + Integer.toHexString(String.valueOf(error.getDescription()).hashCode()));\n                if (request.isForMainFrame()) {\n                    statusText.setText(\"加载失败\");",
    "web error log",
)

replace_once(
    "            public void onProgressChanged(WebView view, int newProgress) {\n                progressBar.setProgress(newProgress);",
    "            public void onProgressChanged(WebView view, int newProgress) {\n                if (newProgress == 10 || newProgress == 50 || newProgress == 90 || newProgress == 100)\n                    diagnosticLogger.log(\"webview\", \"progress\", \"value=\" + newProgress);\n                progressBar.setProgress(newProgress);",
    "progress log",
)

replace_once(
    "        nativeDocumentStartEnabled = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);\n        if (!nativeDocumentStartEnabled) return;",
    "        nativeDocumentStartEnabled = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);\n        diagnosticLogger.log(\"script\", \"document_start_support\", \"supported=\" + nativeDocumentStartEnabled);\n        if (!nativeDocumentStartEnabled) return;",
    "document start support",
)

replace_once(
    "        } catch (Throwable ignored) {\n            nativeDocumentStartEnabled = false;\n        }\n    }\n\n    private DownloadListener createDownloadListener()",
    "        } catch (Throwable error) {\n            nativeDocumentStartEnabled = false;\n            diagnosticLogger.logError(\"script\", \"document_start_install_failure\", error);\n        }\n    }\n\n    private DownloadListener createDownloadListener()",
    "document start failure",
)

replace_once(
    "        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {\n            try {",
    "        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {\n            diagnosticLogger.logUrl(\"webview\", \"download_request\", url, \"mime=\" + mimeType + \",length=\" + contentLength);\n            try {",
    "download log",
)

marker = "    private void showResetDialog() {"
if marker not in text:
    raise SystemExit("Cannot insert diagnostics dialog")
insert = '''    private void showDiagnosticsDialog() {
        String message = diagnosticLogger == null ? "日志尚未初始化" : diagnosticLogger.summary();
        new AlertDialog.Builder(this)
                .setTitle("运行诊断日志")
                .setMessage(message + "\\n\\n导出文件已自动脱敏，可直接发送用于排错。")
                .setNegativeButton("关闭", null)
                .setNeutralButton("清空", (dialog, which) -> {
                    if (diagnosticLogger != null) diagnosticLogger.clear();
                    Toast.makeText(this, "诊断日志已清空", Toast.LENGTH_SHORT).show();
                })
                .setPositiveButton("导出并发送", (dialog, which) -> {
                    try {
                        diagnosticLogger.log("native", "user_export", "source=toolbar");
                        diagnosticLogger.share(this);
                    } catch (Throwable error) {
                        Toast.makeText(this, "日志导出失败", Toast.LENGTH_LONG).show();
                    }
                })
                .show();
    }

'''
text = text.replace(marker, insert + marker, 1)

replace_once(
    "    protected void onStop() {\n        backgroundAtMs = System.currentTimeMillis();",
    "    protected void onStop() {\n        if (diagnosticLogger != null) diagnosticLogger.log(\"native\", \"activity_stop\", \"browserVisible=\" + browserVisible);\n        backgroundAtMs = System.currentTimeMillis();",
    "onStop log",
)

replace_once(
    "    protected void onResume() {\n        super.onResume();",
    "    protected void onResume() {\n        super.onResume();\n        if (diagnosticLogger != null) diagnosticLogger.log(\"native\", \"activity_resume\", \"browserVisible=\" + browserVisible);",
    "onResume log",
)

replace_once(
    "        if (webView != null) {\n            webView.stopLoading();",
    "        if (webView != null) {\n            if (diagnosticLogger != null) diagnosticLogger.log(\"webview\", \"destroy\", \"active=true\");\n            webView.removeJavascriptInterface(\"__GG_DIAG__\");\n            diagnosticBridge = null;\n            webView.stopLoading();",
    "destroy bridge",
)

replace_once(
    "    protected void onDestroy() {\n        browserVisible = false;",
    "    protected void onDestroy() {\n        if (diagnosticLogger != null) diagnosticLogger.log(\"native\", \"activity_destroy\", \"browserVisible=\" + browserVisible);\n        browserVisible = false;",
    "destroy log",
)

main_path.write_text(text, encoding="utf-8")

manifest = manifest_path.read_text(encoding="utf-8")
manifest = manifest.replace('android:label="GG"', 'android:label="GG 诊断版"', 1)
provider = '''
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.diagnostics"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/diagnostic_file_paths" />
        </provider>
'''
if "${applicationId}.diagnostics" not in manifest:
    manifest = manifest.replace("</application>", provider + "    </application>", 1)
manifest_path.write_text(manifest, encoding="utf-8")

(xml_dir / "diagnostic_file_paths.xml").write_text('''<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path name="diagnostics" path="Documents/diagnostics/" />
    <files-path name="diagnostics_internal" path="documents/diagnostics/" />
</paths>
''', encoding="utf-8")

build = build_path.read_text(encoding="utf-8")
build, count = re.subn(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.4.0-diag.20260806"', build, count=1)
if count != 1:
    raise SystemExit("Cannot set diagnostic version name")
build_path.write_text(build, encoding="utf-8")

rules = rules_path.read_text(encoding="utf-8") if rules_path.exists() else ""
extra = r'''

# JS runtime diagnostic bridge
-keep class com.jinli.quickweb.DiagnosticJavascriptBridge { *; }
-keepclassmembers class com.jinli.quickweb.DiagnosticJavascriptBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.jinli.quickweb.DiagnosticLogger { *; }
'''
if "# JS runtime diagnostic bridge" not in rules:
    rules += extra
rules_path.write_text(rules, encoding="utf-8")

required = [
    "diagnosticLogger.instrumentSource(source)",
    "addJavascriptInterface(diagnosticBridge, \"__GG_DIAG__\")",
    "showDiagnosticsDialog()",
    "removeJavascriptInterface(\"__GG_DIAG__\")",
]
final_text = main_path.read_text(encoding="utf-8")
for item in required:
    if item not in final_text:
        raise SystemExit("Incomplete diagnostic patch: " + item)

print("Applied privacy-preserving JS runtime diagnostics patch")
