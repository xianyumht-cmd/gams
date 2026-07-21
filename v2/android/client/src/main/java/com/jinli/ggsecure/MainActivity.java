package com.jinli.ggsecure;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayInputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class MainActivity extends Activity {
    private static final String START_URL = RuntimeNames.startUrl();
    private static final Set<String> SCRIPT_ORIGINS = new HashSet<>(Arrays.asList(
            RuntimeNames.originA(),
            RuntimeNames.originB()
    ));
    private static final int FILE_CHOOSER_REQUEST = 2817;
    private static final long BACKGROUND_RELOAD_MS = 5L * 60L * 1000L;

    private WebView webView;
    private ProgressBar progressBar;
    private TextView statusText;
    private ValueCallback<Uri[]> fileChooserCallback;
    private V2LicenseManager licenseManager;
    private RuntimePayload runtimePayload;
    private String wrappedControlScript;
    private ScriptHandler scriptHandler;
    private boolean nativeDocumentStartEnabled;
    private boolean browserVisible;
    private long backgroundAtMs;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        WebView.setWebContentsDebuggingEnabled(false);
        licenseManager = new V2LicenseManager(this);
        if (!licenseManager.hasSavedKey()) {
            showLicenseScreen("");
        } else {
            initializeV2(savedInstanceState);
        }
    }

    private void initializeV2(@Nullable Bundle savedInstanceState) {
        browserVisible = false;
        releaseRuntime();
        showLoading("正在建立V2安全运行环境…");
        licenseManager.initializeSavedAsync(result -> {
            if (isFinishing() || isDestroyed()) {
                if (result.payload != null) result.payload.wipe();
                return;
            }
            if (!result.valid || result.payload == null) {
                showLicenseScreen(result.message);
                if (result.updateRequired) {
                    showUpdateDialog(result.updateMessage, result.updateUrl, true);
                }
                return;
            }
            showBrowser(savedInstanceState, result.payload);
            Toast.makeText(this, result.message, Toast.LENGTH_SHORT).show();
        });
    }

    private void showLoading(String message) {
        destroyWebView();
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(48), dp(28), dp(48));
        root.setBackgroundColor(Color.rgb(7, 10, 35));

        ProgressBar loading = new ProgressBar(this);
        root.addView(loading, new LinearLayout.LayoutParams(dp(56), dp(56)));

        TextView title = new TextView(this);
        title.setText("GG V2");
        title.setTextSize(29);
        title.setTextColor(Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(20), 0, 0);
        root.addView(title, matchWrap(0));

        TextView text = new TextView(this);
        text.setText(message);
        text.setTextSize(15);
        text.setTextColor(Color.rgb(196, 181, 253));
        text.setGravity(Gravity.CENTER);
        text.setPadding(0, dp(12), 0, 0);
        root.addView(text, matchWrap(0));
        setContentView(root);
    }

    private void showLicenseScreen(String initialMessage) {
        browserVisible = false;
        releaseRuntime();
        destroyWebView();

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(245, 247, 251));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(44), dp(28), dp(34));
        scroll.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = new TextView(this);
        title.setText("GG V2 测试版");
        title.setTextSize(27);
        title.setTextColor(Color.rgb(17, 24, 39));
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title, matchWrap(dp(10)));

        TextView subtitle = new TextView(this);
        subtitle.setText("核心运行数据仅在内存中解密，不保存到APK、WebView缓存或本地脚本文件。\nV1可继续同时安装。");
        subtitle.setTextSize(14);
        subtitle.setTextColor(Color.rgb(75, 85, 99));
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setLineSpacing(0, 1.25f);
        root.addView(subtitle, matchWrap(dp(24)));

        EditText input = new EditText(this);
        input.setHint("请输入32位激活码");
        input.setSingleLine(true);
        input.setTextSize(17);
        input.setTypeface(Typeface.MONOSPACE);
        input.setPadding(dp(14), dp(14), dp(14), dp(14));
        root.addView(input, matchWrap(dp(14)));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);

        Button paste = actionButton("粘贴", false);
        Button activate = actionButton("启动V2", true);
        actions.addView(paste, new LinearLayout.LayoutParams(0, dp(52), 1));
        LinearLayout.LayoutParams activateParams = new LinearLayout.LayoutParams(0, dp(52), 2);
        activateParams.setMargins(dp(10), 0, 0, 0);
        actions.addView(activate, activateParams);
        root.addView(actions, matchWrap(dp(16)));

        TextView status = new TextView(this);
        status.setText(initialMessage == null ? "" : initialMessage);
        status.setTextSize(14);
        status.setTextColor(Color.rgb(185, 28, 28));
        status.setGravity(Gravity.CENTER);
        root.addView(status, matchWrap(0));

        paste.setOnClickListener(v -> {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (clipboard == null || !clipboard.hasPrimaryClip()) return;
            ClipData clip = clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return;
            CharSequence text = clip.getItemAt(0).coerceToText(this);
            input.setText(text == null ? "" : text.toString());
            input.setSelection(input.length());
        });

        activate.setOnClickListener(v -> {
            String key = V2LicenseManager.normalizeKey(input.getText().toString());
            if (key.length() != 32) {
                status.setText("激活码格式错误");
                return;
            }
            activate.setEnabled(false);
            paste.setEnabled(false);
            status.setTextColor(Color.rgb(55, 65, 81));
            status.setText("正在鉴权并解密运行包…");
            licenseManager.activateAsync(key, result -> {
                if (isFinishing() || isDestroyed()) {
                    if (result.payload != null) result.payload.wipe();
                    return;
                }
                activate.setEnabled(true);
                paste.setEnabled(true);
                if (!result.valid || result.payload == null) {
                    status.setTextColor(Color.rgb(185, 28, 28));
                    status.setText(result.message);
                    return;
                }
                showBrowser(null, result.payload);
            });
        });

        setContentView(scroll);
    }

    private void showBrowser(@Nullable Bundle savedInstanceState, RuntimePayload payload) {
        releaseRuntime();
        runtimePayload = payload;
        wrappedControlScript = wrapControlScript(payload.nonameSource());
        browserVisible = true;
        createBrowserUi();
        configureWebView();
        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(START_URL);
    }

    private void createBrowserUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(3), dp(3), dp(3), dp(3));
        toolbar.setBackgroundColor(Color.rgb(17, 24, 39));

        Button back = toolbarButton("返回");
        Button home = toolbarButton("首页");
        Button refresh = toolbarButton("刷新");
        Button reset = toolbarButton("重置");
        Button service = toolbarButton("服务");

        statusText = new TextView(this);
        statusText.setText("V2加载中…");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(11);
        statusText.setSingleLine(true);
        statusText.setGravity(Gravity.CENTER_VERTICAL);
        statusText.setPadding(dp(5), 0, dp(2), 0);

        toolbar.addView(back);
        toolbar.addView(home);
        toolbar.addView(refresh);
        toolbar.addView(reset);
        toolbar.addView(service);
        toolbar.addView(statusText, new LinearLayout.LayoutParams(0, dp(40), 1));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);

        root.addView(toolbar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
        root.addView(progressBar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));
        root.addView(webView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);

        back.setOnClickListener(v -> {
            if (webView != null && webView.canGoBack()) webView.goBack();
            else finish();
        });
        home.setOnClickListener(v -> webView.loadUrl(START_URL));
        refresh.setOnClickListener(v -> webView.reload());
        reset.setOnClickListener(v -> resetWebData());
        service.setOnClickListener(v -> showServiceDialog());
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.clearCache(true);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        installDocumentStartScript();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                statusText.setText("V2加载中…");
                progressBar.setVisibility(View.VISIBLE);
                if (!nativeDocumentStartEnabled && isTargetPage(url)) {
                    view.evaluateJavascript(wrappedControlScript, null);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                statusText.setText("V2已就绪");
                CookieManager.getInstance().flush();
                if (!nativeDocumentStartEnabled && isTargetPage(url)) {
                    view.evaluateJavascript(wrappedControlScript, null);
                }
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (isEngineRequest(url)) return memoryGameResponse();
                if (isForbiddenCoreRequest(url)) {
                    return new WebResourceResponse(
                            "text/plain", "UTF-8", 403, "Blocked",
                            java.util.Collections.singletonMap("Cache-Control", "no-store"),
                            new ByteArrayInputStream(new byte[0]));
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
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

            @Override
            public void onReceivedError(
                    WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) statusText.setText("页面加载失败");
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(
                    WebView currentWebView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = filePathCallback;
                try {
                    startActivityForResult(fileChooserParams.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    fileChooserCallback = null;
                    return false;
                }
            }
        });
        webView.setDownloadListener(createDownloadListener());
    }

    private void installDocumentStartScript() {
        nativeDocumentStartEnabled =
                WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (!nativeDocumentStartEnabled) return;
        try {
            scriptHandler = WebViewCompat.addDocumentStartJavaScript(
                    webView, wrappedControlScript, SCRIPT_ORIGINS);
        } catch (Throwable error) {
            nativeDocumentStartEnabled = false;
        }
    }

    private WebResourceResponse memoryGameResponse() {
        RuntimePayload payload = runtimePayload;
        if (payload == null) {
            return new WebResourceResponse(
                    "text/plain", "UTF-8", 503, "Runtime unavailable",
                    java.util.Collections.singletonMap("Cache-Control", "no-store"),
                    new ByteArrayInputStream(new byte[0]));
        }
        Map<String, String> headers = new java.util.HashMap<>();
        headers.put("Cache-Control", "no-store, no-cache, max-age=0");
        headers.put("Pragma", "no-cache");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Content-Length", String.valueOf(payload.gameSize()));
        return new WebResourceResponse(
                "application/javascript", "UTF-8", 200, "OK",
                headers, payload.openGameStream());
    }

    private boolean isEngineRequest(String url) {
        String lower = url == null ? "" : url.toLowerCase(Locale.ROOT);
        return lower.equals(RuntimeNames.virtualGameUrl().toLowerCase(Locale.ROOT))
                || lower.contains("gams-script-edge.2320006072.workers.dev/engine/stable.js")
                || lower.contains("space-z.ai/game.js");
    }

    private boolean isForbiddenCoreRequest(String url) {
        String lower = url == null ? "" : url.toLowerCase(Locale.ROOT);
        return lower.contains("raw.githubusercontent.com/xianyumht-cmd/gams")
                && (lower.contains("/remote-script/") || lower.contains("/game-engine/"));
    }

    private boolean isTargetPage(String url) {
        if (url == null) return false;
        try {
            String host = Uri.parse(url).getHost();
            return "m.66rpg.com".equalsIgnoreCase(host)
                    || "www.66rpg.com".equalsIgnoreCase(host);
        } catch (Exception error) {
            return false;
        }
    }

    private String wrapControlScript(String source) {
        return "(function(){" +
                "if(window.__GG_V2_CONTROL_LOADED__)return;" +
                "window.__GG_V2_CONTROL_LOADED__=true;" +
                "try{\n" + source + "\n}catch(e){" +
                "window.__GG_V2_CONTROL_LOADED__=false;" +
                "console.error('[GG V2]',e);}" +
                "})();";
    }

    private DownloadListener createDownloadListener() {
        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(
                        this,
                        Environment.DIRECTORY_DOWNLOADS,
                        "download_" + System.currentTimeMillis());
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
                Toast.makeText(this, "已开始下载", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(this, "下载失败", Toast.LENGTH_SHORT).show();
            }
        };
    }

    private void resetWebData() {
        new AlertDialog.Builder(this)
                .setTitle("重置网页数据")
                .setMessage("清除网页缓存、Cookie和本地网页设置，不影响V2激活状态。")
                .setNegativeButton("取消", null)
                .setPositiveButton("确认", (dialog, which) -> {
                    CookieManager.getInstance().removeAllCookies(value -> {
                        CookieManager.getInstance().flush();
                        if (webView == null) return;
                        webView.clearCache(true);
                        webView.clearHistory();
                        webView.clearFormData();
                        WebStorage.getInstance().deleteAllData();
                        webView.evaluateJavascript(
                                "try{localStorage.clear();sessionStorage.clear();}catch(e){}",
                                ignored -> webView.loadUrl(START_URL));
                    });
                })
                .show();
    }

    private void showServiceDialog() {
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("V2服务信息")
                .setMessage(licenseManager.getStatusSummary())
                .setNegativeButton("关闭", null)
                .setNeutralButton("更换设备", null)
                .setPositiveButton("退出账号", (d, which) -> {
                    licenseManager.clear();
                    showLicenseScreen("");
                })
                .create();
        dialog.setOnShowListener(ignored ->
                dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v ->
                        new AlertDialog.Builder(this)
                                .setTitle("确认更换设备")
                                .setMessage("当前V2设备会立即退出，是否继续？")
                                .setNegativeButton("取消", null)
                                .setPositiveButton("确认", (confirm, which) -> {
                                    dialog.dismiss();
                                    showLoading("正在解除V2设备绑定…");
                                    licenseManager.selfUnbindAsync(result -> {
                                        Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
                                        if (result.success) showLicenseScreen("");
                                        else initializeV2(null);
                                    });
                                })
                                .show()));
        dialog.show();
    }

    private void showUpdateDialog(String message, String url, boolean required) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle(required ? "需要更新V2" : "发现V2更新")
                .setMessage(message == null || message.trim().isEmpty()
                        ? "发现新的V2客户端" : message)
                .setNegativeButton(required ? "关闭" : "稍后", null);
        if (url != null && !url.trim().isEmpty()) {
            builder.setPositiveButton("下载更新", (dialog, which) -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception error) {
                    Toast.makeText(this, "无法打开更新地址", Toast.LENGTH_SHORT).show();
                }
            });
        }
        builder.show();
    }

    private Button actionButton(String text, boolean primary) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(15);
        button.setAllCaps(false);
        button.setTextColor(primary ? Color.WHITE : Color.rgb(31, 41, 55));
        button.setBackgroundColor(primary ? Color.rgb(79, 70, 229) : Color.rgb(229, 231, 235));
        return button;
    }

    private Button toolbarButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(11);
        button.setTextColor(Color.WHITE);
        button.setAllCaps(false);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(dp(8), 0, dp(8), 0);
        button.setBackgroundColor(Color.TRANSPARENT);
        return button;
    }

    private LinearLayout.LayoutParams matchWrap(int bottomMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, 0, bottomMargin);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onStop() {
        backgroundAtMs = System.currentTimeMillis();
        super.onStop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (browserVisible && backgroundAtMs > 0
                && System.currentTimeMillis() - backgroundAtMs >= BACKGROUND_RELOAD_MS) {
            backgroundAtMs = 0L;
            initializeV2(null);
        }
    }

    private void destroyWebView() {
        if (scriptHandler != null) {
            try {
                scriptHandler.remove();
            } catch (Throwable ignored) { }
            scriptHandler = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.clearCache(true);
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
    }

    private void releaseRuntime() {
        wrappedControlScript = null;
        if (runtimePayload != null) {
            runtimePayload.wipe();
            runtimePayload = null;
        }
    }

    @Override
    protected void onDestroy() {
        browserVisible = false;
        destroyWebView();
        releaseRuntime();
        if (licenseManager != null) {
            licenseManager.shutdown();
            licenseManager = null;
        }
        super.onDestroy();
    }
}
