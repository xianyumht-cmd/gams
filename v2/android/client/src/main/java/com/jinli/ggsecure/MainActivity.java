package com.jinli.ggsecure;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public final class MainActivity extends Activity {
    private static final Set<String> SCRIPT_ORIGINS = new HashSet<>(Arrays.asList(
            RuntimeNames.originA(),
            RuntimeNames.originB()
    ));
    private static final long BACKGROUND_RELOAD_MS = 5L * 60L * 1000L;

    private WebView webView;
    private ProgressBar progressBar;
    private ProgressBar startupProgressBar;
    private TextView statusText;
    private V2LicenseManager licenseManager;
    private ClientScreens screens;
    private ClientDialogs dialogs;
    private BrowserWebViewController browserController;
    private BrowserResourceRouter resourceRouter;
    private volatile RuntimePayload runtimePayload;
    private String wrappedControlScript;
    private volatile String edgeOneUserAgent;
    private boolean browserVisible;
    private long backgroundAtMs;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        WebView.setWebContentsDebuggingEnabled(false);
        screens = new ClientScreens(this);
        dialogs = new ClientDialogs(this);
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
        final ProgressBar initialization = BuildConfig.EDGEONE_CANDIDATE
                ? showInitialization() : null;
        if (initialization == null) showLoading(UiText.get(UiText.STARTING));
        licenseManager.initializeSavedAsync(result -> {
            if (isFinishing() || isDestroyed()) {
                if (result.payload != null) result.payload.wipe();
                return;
            }
            int presentation = startupPresentation(result);
            if (presentation != 1) {
                if (result.payload != null) result.payload.wipe();
                showLicenseScreen(result.message);
                if (presentation == 2) {
                    showUpdateDialog(result.updateMessage, result.updateUrl, true);
                }
                return;
            }
            showBrowser(savedInstanceState, result.payload);
            Toast.makeText(this, result.message, Toast.LENGTH_SHORT).show();
        }, (received, expected) -> updateInitializationProgress(initialization, received, expected));
    }

    private void showLoading(String message) {
        showLoading(message, false);
    }

    private ProgressBar showInitialization() {
        showLoading(UiText.get(UiText.INITIALIZING), true);
        return startupProgressBar;
    }

    private void showLoading(String message, boolean initializing) {
        destroyWebView();
        ClientScreens.Loading loading = screens.loading(message, initializing);
        startupProgressBar = loading.downloadProgress;
        setContentView(loading.root);
    }

    private void updateInitializationProgress(ProgressBar current, int received, int expected) {
        if (current == null || current != startupProgressBar || isFinishing() || isDestroyed()) return;
        if (received <= 0 || expected <= 0) return;
        current.setIndeterminate(false);
        current.setProgress(BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE
                ? NativeRuntimeBridge.initializationPercent(received, expected)
                : RuntimeZipReader.displayPercent(received, expected));
    }

    private int startupPresentation(V2LicenseManager.RuntimeResult result) {
        if (BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE) {
            return NativeRuntimeBridge.startupPresentation(
                    result.valid, result.payload != null, result.updateRequired);
        }
        if (result.updateRequired) return 2;
        return result.valid && result.payload != null ? 1 : 0;
    }

    private void showLicenseScreen(String initialMessage) {
        showLicenseScreen(initialMessage, "");
    }

    private void showLicenseScreen(String initialMessage, String rememberedKey) {
        browserVisible = false;
        startupProgressBar = null;
        releaseRuntime();
        destroyWebView();

        ClientScreens.License screen = screens.license(initialMessage, rememberedKey);
        EditText input = screen.input;
        TextView status = screen.status;
        Button paste = screen.paste;
        Button activate = screen.activate;

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
                status.setText(UiText.get(UiText.BAD_KEY));
                return;
            }
            activate.setEnabled(false);
            paste.setEnabled(false);
            final ProgressBar initialization = BuildConfig.EDGEONE_CANDIDATE
                    ? showInitialization() : null;
            if (initialization == null) {
                status.setTextColor(Color.rgb(55, 65, 81));
                status.setText(UiText.get(UiText.VERIFYING));
            }
            licenseManager.activateAsync(key, result -> {
                if (isFinishing() || isDestroyed()) {
                    if (result.payload != null) result.payload.wipe();
                    return;
                }
                activate.setEnabled(true);
                paste.setEnabled(true);
                int presentation = startupPresentation(result);
                if (presentation != 1) {
                    if (result.payload != null) result.payload.wipe();
                    if (initialization != null) {
                        showLicenseScreen(result.message, key);
                    } else {
                        status.setTextColor(Color.rgb(185, 28, 28));
                        status.setText(result.message);
                    }
                    if (presentation == 2) {
                        showUpdateDialog(result.updateMessage, result.updateUrl, true);
                    }
                    return;
                }
                showBrowser(null, result.payload);
            }, (received, expected) -> updateInitializationProgress(initialization, received, expected));
        });

        setContentView(screen.root);
    }

    private void showBrowser(@Nullable Bundle savedInstanceState, RuntimePayload payload) {
        startupProgressBar = null;
        releaseRuntime();
        runtimePayload = payload;
        wrappedControlScript = BuildConfig.GG_NATIVE_CORE
                ? payload.nativeWrappedControlScript()
                : BrowserResourceRouter.wrapControlScript(payload.nonameSource());
        browserVisible = true;
        createBrowserUi();
        configureWebView();
        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(startUrl());
    }

    private void createBrowserUi() {
        ClientScreens.Browser browser = screens.browser();
        webView = browser.webView;
        progressBar = browser.progress;
        statusText = browser.status;
        setContentView(browser.root);

        browser.back.setOnClickListener(v -> {
            if (webView != null && webView.canGoBack()) webView.goBack();
            else finish();
        });
        browser.home.setOnClickListener(v -> webView.loadUrl(startUrl()));
        browser.refresh.setOnClickListener(v -> webView.reload());
        browser.reset.setOnClickListener(v -> resetWebData());
        browser.service.setOnClickListener(v -> showServiceDialog());
    }

    private void configureWebView() {
        resourceRouter = new BrowserResourceRouter(() -> runtimePayload, () -> edgeOneUserAgent);
        browserController = new BrowserWebViewController(this, resourceRouter);
        browserController.configure(webView, statusText, progressBar,
                wrappedControlScript, SCRIPT_ORIGINS);
        edgeOneUserAgent = webView.getSettings().getUserAgentString();
    }

    private String startUrl() {
        return resourceRouter.startUrl();
    }

    private void resetWebData() {
        dialogs.confirmReset(() -> {
            final WebView current = webView;
            final BrowserResourceRouter router = resourceRouter;
            CookieManager.getInstance().removeAllCookies(value -> {
                CookieManager.getInstance().flush();
                if (current == null || router == null || webView != current) return;
                current.clearCache(true);
                current.clearHistory();
                current.clearFormData();
                WebStorage.getInstance().deleteAllData();
                current.evaluateJavascript(
                        "try{localStorage.clear();sessionStorage.clear();}catch(e){}",
                        ignored -> {
                            if (webView == current && resourceRouter == router) {
                                current.loadUrl(router.startUrl());
                            }
                        });
            });
        });
    }

    private void showServiceDialog() {
        dialogs.serviceInfo(licenseManager.getStatusSummary(),
                () -> {
                    licenseManager.clear();
                    showLicenseScreen("");
                },
                () -> {
                    showLoading(UiText.get(UiText.UNBINDING));
                    licenseManager.selfUnbindAsync(result -> {
                        Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
                        if (result.success) showLicenseScreen("");
                        else initializeV2(null);
                    });
                });
    }

    private void showUpdateDialog(String message, String url, boolean required) {
        dialogs.update(message, url, required);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (browserController != null) {
            browserController.onActivityResult(requestCode, resultCode, data);
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
        if (browserVisible && backgroundAtMs > 0) {
            long nowMs = System.currentTimeMillis();
            boolean reload = BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE
                    ? NativeRuntimeBridge.shouldReloadBrowser(true, backgroundAtMs,
                            nowMs, BACKGROUND_RELOAD_MS)
                    : nowMs - backgroundAtMs >= BACKGROUND_RELOAD_MS;
            if (reload) {
                backgroundAtMs = 0L;
                initializeV2(null);
            }
        }
    }

    private void destroyWebView() {
        if (browserController != null) {
            browserController.destroy();
            browserController = null;
        }
        resourceRouter = null;
        webView = null;
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
        startupProgressBar = null;
        destroyWebView();
        releaseRuntime();
        if (licenseManager != null) {
            licenseManager.shutdown();
            licenseManager = null;
        }
        super.onDestroy();
    }
}
