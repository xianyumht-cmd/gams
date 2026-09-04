from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
MODULE = Path("v2/android/client")
JAVA = MODULE / "src/main/java/com/jinli/ggsecure"
ASSETS = MODULE / "src/main/assets"
XML = MODULE / "src/main/res/xml"
MAIN = JAVA / "MainActivity.java"
MANIFEST = MODULE / "src/main/AndroidManifest.xml"
BUILD = MODULE / "build.gradle.kts"
LICENSE = JAVA / "V2LicenseManager.java"
RULES = MODULE / "proguard-rules.pro"

JAVA.mkdir(parents=True, exist_ok=True)
ASSETS.mkdir(parents=True, exist_ok=True)
XML.mkdir(parents=True, exist_ok=True)

for name in ("DiagnosticLogger.java", "DiagnosticJavascriptBridge.java"):
    (JAVA / name).write_bytes((ROOT / "src/main/java/com/jinli/ggsecure" / name).read_bytes())
for name in ("diagnostic-prelude.js", "diagnostic-postlude.js"):
    (ASSETS / name).write_bytes((ROOT / "src/main/assets" / name).read_bytes())

text = MAIN.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Cannot patch {label}: expected 1 match, got {count}")
    text = text.replace(old, new, 1)


replace_once(
    "    private V2LicenseManager licenseManager;\n    private RuntimePayload runtimePayload;",
    "    private V2LicenseManager licenseManager;\n"
    "    private DiagnosticLogger diagnosticLogger;\n"
    "    private DiagnosticJavascriptBridge diagnosticBridge;\n"
    "    private RuntimePayload runtimePayload;",
    "diagnostic fields",
)

replace_once(
    "        WebView.setWebContentsDebuggingEnabled(false);\n        licenseManager = new V2LicenseManager(this);",
    "        WebView.setWebContentsDebuggingEnabled(false);\n"
    "        diagnosticLogger = new DiagnosticLogger(this);\n"
    "        diagnosticLogger.log(\"native\", \"activity_create\", \"savedState=\" + (savedInstanceState != null));\n"
    "        licenseManager = new V2LicenseManager(this);",
    "activity startup",
)

replace_once(
    "    private void initializeV2(@Nullable Bundle savedInstanceState) {\n        browserVisible = false;",
    "    private void initializeV2(@Nullable Bundle savedInstanceState) {\n"
    "        if (diagnosticLogger != null) diagnosticLogger.log(\"native\", \"runtime_initialize\", \"savedState=\" + (savedInstanceState != null));\n"
    "        browserVisible = false;",
    "runtime initialization",
)

replace_once(
    "    private void showBrowser(@Nullable Bundle savedInstanceState, RuntimePayload payload) {\n"
    "        releaseRuntime();\n"
    "        runtimePayload = payload;\n"
    "        wrappedControlScript = wrapControlScript(payload.nonameSource());",
    "    private void showBrowser(@Nullable Bundle savedInstanceState, RuntimePayload payload) {\n"
    "        releaseRuntime();\n"
    "        runtimePayload = payload;\n"
    "        diagnosticLogger.log(\"native\", \"browser_show\", \"savedState=\" + (savedInstanceState != null) + \",gameSize=\" + payload.gameSize());\n"
    "        wrappedControlScript = wrapControlScript(diagnosticLogger.instrumentSource(payload.nonameSource()));",
    "control script instrumentation",
)

replace_once(
    "        Button reset = toolbarButton(\"重置\");\n        Button service = toolbarButton(\"服务\");",
    "        Button reset = toolbarButton(\"重置\");\n"
    "        Button logs = toolbarButton(\"日志\");\n"
    "        Button service = toolbarButton(\"服务\");",
    "log button declaration",
)

replace_once(
    "        toolbar.addView(reset);\n        toolbar.addView(service);",
    "        toolbar.addView(reset);\n        toolbar.addView(logs);\n        toolbar.addView(service);",
    "log button layout",
)

replace_once(
    "        reset.setOnClickListener(v -> resetWebData());\n        service.setOnClickListener(v -> showServiceDialog());",
    "        reset.setOnClickListener(v -> resetWebData());\n"
    "        logs.setOnClickListener(v -> showDiagnosticsDialog());\n"
    "        service.setOnClickListener(v -> showServiceDialog());",
    "log button handler",
)

replace_once(
    "        installDocumentStartScript();\n\n        webView.setWebViewClient(new WebViewClient() {",
    "        diagnosticBridge = new DiagnosticJavascriptBridge(diagnosticLogger);\n"
    "        webView.addJavascriptInterface(diagnosticBridge, \"__GG_DIAG__\");\n"
    "        diagnosticLogger.log(\"native\", \"javascript_bridge_added\", \"name=__GG_DIAG__\");\n"
    "        installDocumentStartScript();\n\n"
    "        webView.setWebViewClient(new WebViewClient() {",
    "javascript bridge",
)

replace_once(
    "            public void onPageStarted(WebView view, String url, Bitmap favicon) {\n"
    "                statusText.setText(\"加载中…\");",
    "            public void onPageStarted(WebView view, String url, Bitmap favicon) {\n"
    "                diagnosticLogger.logUrl(\"webview\", \"page_started\", url, \"documentStart=\" + nativeDocumentStartEnabled);\n"
    "                statusText.setText(\"加载中…\");",
    "page start logging",
)

replace_once(
    "            public void onPageFinished(WebView view, String url) {\n"
    "                statusText.setText(\"已就绪\");",
    "            public void onPageFinished(WebView view, String url) {\n"
    "                diagnosticLogger.logUrl(\"webview\", \"page_finished\", url, \"documentStart=\" + nativeDocumentStartEnabled);\n"
    "                statusText.setText(\"已就绪\");",
    "page finish logging",
)

replace_once(
    "                String url = request.getUrl().toString();\n"
    "                if (isOfficialEngineRequest(url)) return emptyOfficialEngineResponse();\n"
    "                if (isEngineRequest(url)) return memoryGameResponse();\n"
    "                if (isForbiddenCoreRequest(url)) {",
    "                String url = request.getUrl().toString();\n"
    "                if (isOfficialEngineRequest(url)) {\n"
    "                    diagnosticLogger.logUrl(\"webview\", \"intercept_official_engine\", url, \"action=empty\");\n"
    "                    return emptyOfficialEngineResponse();\n"
    "                }\n"
    "                if (isEngineRequest(url)) {\n"
    "                    diagnosticLogger.logUrl(\"webview\", \"intercept_memory_engine\", url, \"gameSize=\" + (runtimePayload == null ? -1 : runtimePayload.gameSize()));\n"
    "                    return memoryGameResponse();\n"
    "                }\n"
    "                if (isForbiddenCoreRequest(url)) {\n"
    "                    diagnosticLogger.logUrl(\"webview\", \"intercept_forbidden_core\", url, \"status=403\");",
    "request interception logging",
)

replace_once(
    "                Uri uri = request.getUrl();\n                String scheme = uri.getScheme();",
    "                Uri uri = request.getUrl();\n"
    "                diagnosticLogger.logUrl(\"webview\", \"navigation_request\", uri == null ? null : uri.toString(), \"mainFrame=\" + request.isForMainFrame());\n"
    "                String scheme = uri.getScheme();",
    "navigation logging",
)

replace_once(
    "                if (request.isForMainFrame()) statusText.setText(\"页面加载失败\");",
    "                diagnosticLogger.logUrl(\"webview\", \"resource_error\",\n"
    "                        request.getUrl() == null ? null : request.getUrl().toString(),\n"
    "                        \"mainFrame=\" + request.isForMainFrame() + \",code=\" + error.getErrorCode() + \",descriptionHash=\" + Integer.toHexString(String.valueOf(error.getDescription()).hashCode()));\n"
    "                if (request.isForMainFrame()) statusText.setText(\"页面加载失败\");",
    "resource error logging",
)

replace_once(
    "            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {\n"
    "                if (isSuppressedEngineReadyAlert(message)) {",
    "            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {\n"
    "                diagnosticLogger.logUrl(\"webview\", \"js_alert\", url, \"messageLength=\" + (message == null ? 0 : message.length()) + \",messageHash=\" + Integer.toHexString(String.valueOf(message).hashCode()));\n"
    "                if (isSuppressedEngineReadyAlert(message)) {",
    "alert logging",
)

replace_once(
    "            public void onProgressChanged(WebView view, int newProgress) {\n"
    "                progressBar.setProgress(newProgress);",
    "            public void onProgressChanged(WebView view, int newProgress) {\n"
    "                if (newProgress == 10 || newProgress == 50 || newProgress == 90 || newProgress == 100)\n"
    "                    diagnosticLogger.log(\"webview\", \"progress\", \"value=\" + newProgress);\n"
    "                progressBar.setProgress(newProgress);",
    "progress logging",
)

replace_once(
    "        nativeDocumentStartEnabled =\n"
    "                WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);\n"
    "        if (!nativeDocumentStartEnabled) return;",
    "        nativeDocumentStartEnabled =\n"
    "                WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);\n"
    "        diagnosticLogger.log(\"script\", \"document_start_support\", \"supported=\" + nativeDocumentStartEnabled);\n"
    "        if (!nativeDocumentStartEnabled) return;",
    "document-start support logging",
)

replace_once(
    "        } catch (Throwable error) {\n            nativeDocumentStartEnabled = false;\n        }\n    }\n\n    private WebResourceResponse memoryGameResponse()",
    "        } catch (Throwable error) {\n"
    "            nativeDocumentStartEnabled = false;\n"
    "            diagnosticLogger.logError(\"script\", \"document_start_install_failure\", error);\n"
    "        }\n"
    "    }\n\n"
    "    private WebResourceResponse memoryGameResponse()",
    "document-start failure logging",
)

replace_once(
    "        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {\n            try {",
    "        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {\n"
    "            diagnosticLogger.logUrl(\"webview\", \"download_request\", url, \"mimeHash=\" + Integer.toHexString(String.valueOf(mimeType).hashCode()) + \",length=\" + contentLength);\n"
    "            try {",
    "download logging",
)

marker = "    private void resetWebData() {"
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
    "    protected void onStop() {\n"
    "        if (diagnosticLogger != null) diagnosticLogger.log(\"native\", \"activity_stop\", \"browserVisible=\" + browserVisible);\n"
    "        backgroundAtMs = System.currentTimeMillis();",
    "onStop logging",
)

replace_once(
    "    protected void onResume() {\n        super.onResume();",
    "    protected void onResume() {\n"
    "        super.onResume();\n"
    "        if (diagnosticLogger != null) diagnosticLogger.log(\"native\", \"activity_resume\", \"browserVisible=\" + browserVisible);",
    "onResume logging",
)

replace_once(
    "        if (webView != null) {\n            webView.stopLoading();",
    "        if (webView != null) {\n"
    "            if (diagnosticLogger != null) diagnosticLogger.log(\"webview\", \"destroy\", \"active=true\");\n"
    "            webView.removeJavascriptInterface(\"__GG_DIAG__\");\n"
    "            diagnosticBridge = null;\n"
    "            webView.stopLoading();",
    "bridge removal",
)

replace_once(
    "    protected void onDestroy() {\n        browserVisible = false;",
    "    protected void onDestroy() {\n"
    "        if (diagnosticLogger != null) diagnosticLogger.log(\"native\", \"activity_destroy\", \"browserVisible=\" + browserVisible);\n"
    "        browserVisible = false;",
    "onDestroy logging",
)

MAIN.write_text(text, encoding="utf-8")

manifest = MANIFEST.read_text(encoding="utf-8")
if 'android:label="GG"' not in manifest:
    raise SystemExit("Manifest label baseline mismatch")
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
    manifest = manifest.replace("    </application>", provider + "    </application>", 1)
MANIFEST.write_text(manifest, encoding="utf-8")

(XML / "diagnostic_file_paths.xml").write_text('''<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path name="diagnostics" path="Documents/diagnostics/" />
    <files-path name="diagnostics_internal" path="documents/diagnostics/" />
</paths>
''', encoding="utf-8")

build = BUILD.read_text(encoding="utf-8")
build, c1 = re.subn(r"versionCode\s*=\s*\d+", "versionCode = 26", build, count=1)
build, c2 = re.subn(r'versionName\s*=\s*"[^"]+"', 'versionName = "2.0.15-page5-bridge-diag"', build, count=1)
if c1 != 1 or c2 != 1:
    raise SystemExit(f"Cannot set V2 diagnostic version: code={c1}, name={c2}")
if 'androidx.core:core:' not in build:
    build = build.replace(
        'dependencies { implementation("androidx.webkit:webkit:1.16.0") }',
        'dependencies {\n    implementation("androidx.webkit:webkit:1.16.0")\n    implementation("androidx.core:core:1.15.0")\n}',
        1,
    )
BUILD.write_text(build, encoding="utf-8")

license_text = LICENSE.read_text(encoding="utf-8")
license_text, protocol_count = re.subn(
    r"PROTOCOL_APP_VERSION\s*=\s*\d+",
    "PROTOCOL_APP_VERSION = 25",
    license_text,
    count=1,
)
if protocol_count != 1:
    raise SystemExit("Cannot set page5 c2 protocol version")
LICENSE.write_text(license_text, encoding="utf-8")

rules = RULES.read_text(encoding="utf-8") if RULES.exists() else ""
extra = r'''

# V2 privacy-safe JS runtime diagnostics
-keep class com.jinli.ggsecure.DiagnosticJavascriptBridge { *; }
-keepclassmembers class com.jinli.ggsecure.DiagnosticJavascriptBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.jinli.ggsecure.DiagnosticLogger { *; }
'''
if "# V2 privacy-safe JS runtime diagnostics" not in rules:
    rules += extra
RULES.write_text(rules, encoding="utf-8")

required = [
    "diagnosticLogger.instrumentSource(payload.nonameSource())",
    "addJavascriptInterface(diagnosticBridge, \"__GG_DIAG__\")",
    "showDiagnosticsDialog()",
    "removeJavascriptInterface(\"__GG_DIAG__\")",
]
final_text = MAIN.read_text(encoding="utf-8")
for item in required:
    if item not in final_text:
        raise SystemExit("Incomplete V2 diagnostics patch: " + item)

print("Applied V2 page5 c2 privacy-safe runtime diagnostics, versionCode=26")
