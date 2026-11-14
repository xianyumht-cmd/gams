package com.jinli.ggsecure;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Environment;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Set;

/** Owns platform WebView configuration, callbacks, chooser and script lifetime. */
final class BrowserWebViewController {
    static final int FILE_CHOOSER_REQUEST = 2817;

    interface ResourceHost {
        boolean directEngine();
        boolean targetPage(String url);
        WebResourceResponse intercept(WebResourceRequest request);
        boolean suppressedReadyAlert(String message);
    }

    private final Activity activity;
    private final ResourceHost resources;
    private WebView webView;
    private ScriptHandler scriptHandler;
    private ValueCallback<Uri[]> fileChooserCallback;
    private boolean nativeDocumentStartEnabled;

    BrowserWebViewController(Activity activity, ResourceHost resources) {
        this.activity = activity;
        this.resources = resources;
    }

    @SuppressLint("SetJavaScriptEnabled")
    void configure(WebView view, TextView status, ProgressBar progress,
            String wrappedControlScript, Set<String> scriptOrigins) {
        destroy();
        webView = view;
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(!resources.directEngine());
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        view.clearCache(true);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(view, true);

        nativeDocumentStartEnabled =
                WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (nativeDocumentStartEnabled) {
            try {
                scriptHandler = WebViewCompat.addDocumentStartJavaScript(
                        view, wrappedControlScript, scriptOrigins);
            } catch (Throwable error) {
                nativeDocumentStartEnabled = false;
            }
        }

        view.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView current, String url, Bitmap favicon) {
                status.setText(UiText.get(UiText.LOADING));
                progress.setVisibility(View.VISIBLE);
                if (!nativeDocumentStartEnabled && resources.targetPage(url)) {
                    current.evaluateJavascript(wrappedControlScript, null);
                }
            }

            @Override
            public void onPageFinished(WebView current, String url) {
                status.setText(UiText.get(UiText.READY));
                CookieManager.getInstance().flush();
                if (!nativeDocumentStartEnabled && resources.targetPage(url)) {
                    current.evaluateJavascript(wrappedControlScript, null);
                }
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView current, WebResourceRequest request) {
                return resources.intercept(request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView current, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                boolean external = BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE
                        ? NativeRuntimeBridge.openExternalScheme(scheme)
                        : !("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme));
                if (!external) return false;
                try {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    Toast.makeText(activity, UiText.get(UiText.OPEN_LINK_FAILED), Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override
            public void onReceivedError(
                    WebView current, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) status.setText(UiText.get(UiText.PAGE_FAILED));
            }
        });

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView current, String url, String message, JsResult result) {
                if (resources.suppressedReadyAlert(message)) {
                    try {
                        current.evaluateJavascript(
                                "try{Object.defineProperty(window,'__gg_last_suppressed_alert__',{value:Object.freeze({message:'脚本加载完成~',at:Date.now(),source:" +
                                        org.json.JSONObject.quote(BuildConfig.VERSION_NAME) +
                                        "}),enumerable:false,configurable:true,writable:false});}catch(e){}",
                                null);
                    } catch (Throwable ignored) { }
                    result.confirm();
                    return true;
                }
                return super.onJsAlert(current, url, message, result);
            }

            @Override
            public void onProgressChanged(WebView current, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(WebView current,
                    ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try {
                    activity.startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    fileChooserCallback = null;
                    return false;
                }
            }
        });
        view.setDownloadListener(createDownloadListener());
    }

    void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            ValueCallback<Uri[]> callback = fileChooserCallback;
            fileChooserCallback = null;
            callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        }
    }

    void destroy() {
        if (fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = null;
        }
        if (scriptHandler != null) {
            try { scriptHandler.remove(); } catch (Throwable ignored) { }
            scriptHandler = null;
        }
        nativeDocumentStartEnabled = false;
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
                request.setDestinationInExternalFilesDir(activity,
                        Environment.DIRECTORY_DOWNLOADS, "download_" + System.currentTimeMillis());
                ((DownloadManager) activity.getSystemService(Activity.DOWNLOAD_SERVICE)).enqueue(request);
                Toast.makeText(activity, UiText.get(UiText.DOWNLOAD_STARTED), Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(activity, UiText.get(UiText.DOWNLOAD_FAILED), Toast.LENGTH_SHORT).show();
            }
        };
    }
}
