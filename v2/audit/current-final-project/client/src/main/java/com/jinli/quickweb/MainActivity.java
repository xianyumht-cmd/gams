package com.jinli.quickweb;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
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

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;


public final class MainActivity extends Activity {
    private static final String START_URL = RuntimeNames.startUrl();
    private static final Set<String> SCRIPT_ORIGINS = new HashSet<>(Arrays.asList(
            RuntimeNames.originA(),
            RuntimeNames.originB()
    ));
    private static final int FILE_CHOOSER_REQUEST = 2417;
    private WebView webView;
    private ProgressBar progressBar;
    private TextView statusText;
    private ValueCallback<Uri[]> fileChooserCallback;
    private String wrappedUserScript;
    private OnlineLicenseManager onlineLicenseManager;
    private boolean nativeDocumentStartEnabled;
    private long backgroundAtMs;
    private boolean browserVisible;
    private ScriptHandler scriptHandler;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(false);
        onlineLicenseManager = new OnlineLicenseManager(this);
        if (!onlineLicenseManager.hasSavedKey()) {
            showLicenseScreen("");
            return;
        }
        initializeService(savedInstanceState);
    }

    private void initializeService(@Nullable Bundle savedInstanceState) {
        browserVisible = false;
        showLicenseLoading("正在初始化…");
        onlineLicenseManager.initializeSavedAsync(result -> {
            if (isFinishing() || isDestroyed()) return;
            if (!result.valid) {
                showLicenseScreen(result.message);
                if (result.updateRequired) showUpdateDialog(result.updateMessage, result.updateUrl, true);
                return;
            }
            if (result.offline) Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
            showBrowser(savedInstanceState, result.source);
            if (result.updateAvailable) showUpdateDialog(result.updateMessage, result.updateUrl, false);
        });
    }

    private void showLicenseLoading(String message) {
        destroyWebView();
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(48), dp(28), dp(48));
        root.setBackgroundColor(Color.rgb(7, 10, 35));
        ProgressBar loading = new ProgressBar(this);
        root.addView(loading, new LinearLayout.LayoutParams(dp(54), dp(54)));
        TextView title = new TextView(this);
        title.setText("GG");
        title.setTextSize(28);
        title.setTextColor(Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(22), 0, 0);
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
        destroyWebView();

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(Color.rgb(245, 247, 251));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(48), dp(28), dp(36));
        scrollView.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = new TextView(this);
        title.setText("GG");
        title.setTextSize(28);
        title.setTextColor(Color.rgb(17, 24, 39));
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title, matchWrap(dp(10)));

        TextView subtitle = new TextView(this);
        subtitle.setText("输入激活码后即可启动服务。\n首次成功后会自动保存，无需重复输入。");
        subtitle.setTextSize(15);
        subtitle.setTextColor(Color.rgb(75, 85, 99));
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setLineSpacing(0, 1.25f);
        root.addView(subtitle, matchWrap(dp(28)));

        EditText input = new EditText(this);
        input.setHint("请输入 32 位激活码");
        input.setSingleLine(true);
        input.setTextSize(17);
        input.setTypeface(Typeface.MONOSPACE);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(48)});
        input.setPadding(dp(14), dp(14), dp(14), dp(14));
        root.addView(input, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        actions.setPadding(0, dp(18), 0, 0);

        Button paste = actionButton("粘贴", false);
        Button activate = actionButton("启动服务", true);
        actions.addView(paste, new LinearLayout.LayoutParams(0, dp(52), 1));
        LinearLayout.LayoutParams activateParams = new LinearLayout.LayoutParams(0, dp(52), 2);
        activateParams.setMargins(dp(10), 0, 0, 0);
        actions.addView(activate, activateParams);
        root.addView(actions, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView status = new TextView(this);
        status.setText(initialMessage == null ? "" : initialMessage);
        status.setTextSize(14);
        status.setTextColor(Color.rgb(185, 28, 28));
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, dp(18), 0, 0);
        root.addView(status, matchWrap(0));

        String savedUpdateUrl = onlineLicenseManager.getUpdateUrl();
        if (savedUpdateUrl != null && !savedUpdateUrl.trim().isEmpty()) {
            Button update = actionButton("下载新版本", true);
            update.setOnClickListener(v -> openUpdateUrl(savedUpdateUrl));
            root.addView(update, matchWrap(dp(18)));
        }

        TextView tip = new TextView(this);
        tip.setText("请妥善保存激活码。卸载重装后需要重新输入。更换设备请在服务信息中操作。");
        tip.setTextSize(13);
        tip.setTextColor(Color.rgb(107, 114, 128));
        tip.setGravity(Gravity.CENTER);
        tip.setPadding(0, dp(34), 0, 0);
        root.addView(tip, matchWrap(0));

        paste.setOnClickListener(v -> {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (clipboard != null && clipboard.hasPrimaryClip()) {
                ClipData clip = clipboard.getPrimaryClip();
                if (clip != null && clip.getItemCount() > 0) {
                    CharSequence text = clip.getItemAt(0).coerceToText(this);
                    input.setText(text == null ? "" : text.toString());
                    input.setSelection(input.length());
                }
            }
        });

        activate.setOnClickListener(v -> {
            String normalized = OnlineLicenseManager.normalizeKey(input.getText().toString());
            if (normalized.length() != 32) {
                status.setText("激活码格式错误");
                return;
            }
            activate.setEnabled(false);
            paste.setEnabled(false);
            status.setTextColor(Color.rgb(55, 65, 81));
            status.setText("正在启动服务…");
            onlineLicenseManager.activateAsync(normalized, result -> {
                if (isFinishing() || isDestroyed()) return;
                activate.setEnabled(true);
                paste.setEnabled(true);                if (!result.valid) {
                    status.setTextColor(Color.rgb(185, 28, 28));
                    status.setText(result.message);
                    if (result.updateRequired) showUpdateDialog(result.updateMessage, result.updateUrl, true);
                    return;
                }
                Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
                showBrowser(null, result.source);
                if (result.updateAvailable) showUpdateDialog(result.updateMessage, result.updateUrl, false);
            });
        });

        setContentView(scrollView);
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

    private LinearLayout.LayoutParams matchWrap(int bottomMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, 0, bottomMargin);
        return params;
    }

    private void showBrowser(@Nullable Bundle savedInstanceState, String source) {
        wrappedUserScript = wrapUserScript(source);
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
        toolbar.setPadding(dp(4), dp(4), dp(4), dp(4));
        toolbar.setBackgroundColor(Color.rgb(17, 24, 39));

        Button back = toolbarButton("返回");
        Button home = toolbarButton("首页");
        Button refresh = toolbarButton("刷新");
        Button reset = toolbarButton("重置");
        Button license = toolbarButton("服务");

        statusText = new TextView(this);
        statusText.setText("正在加载…");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(12);
        statusText.setSingleLine(true);
        statusText.setGravity(Gravity.CENTER_VERTICAL);
        statusText.setPadding(dp(6), 0, dp(2), 0);

        toolbar.addView(back);
        toolbar.addView(home);
        toolbar.addView(refresh);
        toolbar.addView(reset);
        toolbar.addView(license);
        toolbar.addView(statusText, new LinearLayout.LayoutParams(0, dp(40), 1));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgress(0);
        progressBar.setVisibility(View.VISIBLE);

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
            if (webView.canGoBack()) webView.goBack();
            else finish();
        });
        home.setOnClickListener(v -> webView.loadUrl(START_URL));
        refresh.setOnClickListener(v -> webView.reload());
        reset.setOnClickListener(v -> showResetDialog());
        license.setOnClickListener(v -> showLicenseInfoDialog());
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
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        installDocumentStartScript();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                statusText.setText("正在加载…");
                progressBar.setVisibility(View.VISIBLE);
                if (!nativeDocumentStartEnabled && isScriptTarget(url)) {
                    view.evaluateJavascript(wrappedUserScript, null);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                statusText.setText("已就绪");
                CookieManager.getInstance().flush();
                if (!nativeDocumentStartEnabled && isScriptTarget(url)) {
                    view.evaluateJavascript(wrappedUserScript, null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    Toast.makeText(MainActivity.this, "无法打开此链接", Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    statusText.setText("加载失败");
                    showNetworkError(view);
                }
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
                } catch (Exception e) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        webView.setDownloadListener(createDownloadListener());
    }

    private void installDocumentStartScript() {
        nativeDocumentStartEnabled = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (!nativeDocumentStartEnabled) return;
        try {
            scriptHandler = WebViewCompat.addDocumentStartJavaScript(
                    webView,
                    wrappedUserScript,
                    SCRIPT_ORIGINS
            );
        } catch (Throwable ignored) {
            nativeDocumentStartEnabled = false;
        }
    }

    private DownloadListener createDownloadListener() {
        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(
                        MainActivity.this,
                        Environment.DIRECTORY_DOWNLOADS,
                        "download_" + System.currentTimeMillis());
                DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                manager.enqueue(request);
                Toast.makeText(MainActivity.this, "已开始下载", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(MainActivity.this, "下载失败", Toast.LENGTH_SHORT).show();
            }
        };
    }

    private void showResetDialog() {
        new AlertDialog.Builder(this)
                .setTitle("重置网页数据")
                .setMessage("将清除网页登录状态、缓存和本地设置，但不会清除激活状态。")
                .setNegativeButton("取消", null)
                .setPositiveButton("确认重置", (dialog, which) -> {
                    CookieManager.getInstance().removeAllCookies(value -> {
                        CookieManager.getInstance().flush();
                        webView.clearCache(true);
                        webView.clearHistory();
                        webView.clearFormData();
                        WebStorage.getInstance().deleteAllData();
                        WebView.clearClientCertPreferences(null);
                        webView.evaluateJavascript(
                                "try{localStorage.clear();sessionStorage.clear();}catch(e){}",
                                result -> webView.loadUrl(START_URL));
                    });
                })
                .show();
    }

    private void showLicenseInfoDialog() {
        String summary = onlineLicenseManager.getStatusSummary();
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("服务信息")
                .setMessage(summary + "\n\n" + onlineLicenseManager.getSelfUnbindSummary())
                .setNegativeButton("关闭", null)
                .setNeutralButton("更换设备", null)
                .setPositiveButton("退出账号", (d, which) -> {
                    onlineLicenseManager.clear();
                    showLicenseScreen("");
                })
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v ->
                new AlertDialog.Builder(this)
                        .setTitle("确认更换设备")
                        .setMessage("当前设备将立即退出。" + onlineLicenseManager.getSelfUnbindSummary() + " 是否继续？")
                        .setNegativeButton("取消", null)
                        .setPositiveButton("确认更换", (confirm, which) -> {
                            dialog.dismiss();
                            showLicenseLoading("正在处理…");
                            onlineLicenseManager.selfUnbindAsync(result -> {
                                if (isFinishing() || isDestroyed()) return;
                                Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
                                if (result.success) showLicenseScreen("");
                                else initializeService(null);
                            });
                        })
                        .show()));
        dialog.show();
    }


    private void showUpdateDialog(String message, String url, boolean required) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle(required ? "需要更新" : "发现新版本")
                .setMessage(message == null || message.trim().isEmpty() ? "发现新版本" : message)
                .setNegativeButton(required ? "关闭" : "稍后", null);
        if (url != null && !url.trim().isEmpty()) {
            builder.setPositiveButton("下载更新", (dialog, which) -> openUpdateUrl(url));
        }
        builder.show();
    }

    private void openUpdateUrl(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception error) {
            Toast.makeText(this, "无法打开更新地址", Toast.LENGTH_SHORT).show();
        }
    }

    private void showNetworkError(WebView view) {
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>" +
                "<style>body{font-family:sans-serif;background:#f8fafc;color:#111827;display:flex;min-height:90vh;" +
                "align-items:center;justify-content:center;margin:0}.box{max-width:360px;padding:28px;text-align:center}" +
                "button{border:0;border-radius:12px;background:#4f46e5;color:white;padding:12px 22px;font-size:16px}</style>" +
                "</head><body><div class='box'><h2>页面暂时无法打开</h2><p>请检查网络后点击重新加载。</p>" +
                "<button onclick=\"location.reload()\">重新加载</button></div></body></html>";
        view.loadDataWithBaseURL(START_URL, html, "text/html", "UTF-8", null);
    }

    private boolean isScriptTarget(String url) {
        if (url == null) return false;
        try {
            String host = Uri.parse(url).getHost();
            return "m.66rpg.com".equalsIgnoreCase(host)
                    || "www.66rpg.com".equalsIgnoreCase(host);
        } catch (Exception ignored) {
            return false;
        }
    }

    private String wrapUserScript(String source) {
        return "(function(){" +
                "if(window.__QUICK_WEB_APP_SCRIPT_LOADED__)return;" +
                "window.__QUICK_WEB_APP_SCRIPT_LOADED__=true;" +
                "try{\n" + source + "\n}" +
                "catch(e){window.__QUICK_WEB_APP_SCRIPT_LOADED__=false;console.error('[App Script]',e);}" +
                "})();";
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
                && System.currentTimeMillis() - backgroundAtMs >= onlineLicenseManager.foregroundRecheckMs()) {
            backgroundAtMs = 0L;
            initializeService(null);
        }
    }

    private void destroyWebView() {
        if (scriptHandler != null) {
            try { scriptHandler.remove(); } catch (Throwable ignored) { }
            scriptHandler = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
    }

    @Override
    protected void onDestroy() {
        browserVisible = false;
        wrappedUserScript = null;
        if (onlineLicenseManager != null) {
            onlineLicenseManager.shutdown();
            onlineLicenseManager = null;
        }
        destroyWebView();
        super.onDestroy();
    }

}
