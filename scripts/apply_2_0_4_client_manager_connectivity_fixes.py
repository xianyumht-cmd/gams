#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def patch_client() -> None:
    path = Path("v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java")
    text = path.read_text(encoding="utf-8")
    text = replace_once(text, "import android.os.Bundle;\n", "import android.os.Bundle;\nimport android.os.Message;\n", "Message import")
    text = replace_once(
        text,
        "        settings.setSupportMultipleWindows(false);",
        "        settings.setSupportMultipleWindows(true);",
        "multiple-window setting",
    )

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
                return handleNavigationInsideGg(view, request.getUrl());
            }
'''
    text = replace_once(text, old_navigation, new_navigation, "WebView navigation override")

    chrome_anchor = '''        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
'''
    chrome_replacement = '''        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(
                    WebView view,
                    boolean isDialog,
                    boolean isUserGesture,
                    Message resultMsg
            ) {
                WebView popup = new WebView(MainActivity.this);
                popup.getSettings().setJavaScriptEnabled(false);
                popup.setWebViewClient(new WebViewClient() {
                    private boolean routed;

                    private boolean route(Uri uri) {
                        if (routed) return true;
                        if (uri == null || "about:blank".equalsIgnoreCase(uri.toString())) return true;
                        routed = true;
                        String scheme = uri.getScheme();
                        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                            if (webView != null) webView.loadUrl(uri.toString());
                        } else if (webView != null) {
                            handleNavigationInsideGg(webView, uri);
                        }
                        try { popup.stopLoading(); } catch (Throwable ignored) { }
                        try { popup.destroy(); } catch (Throwable ignored) { }
                        return true;
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView ignored, WebResourceRequest request) {
                        return route(request.getUrl());
                    }

                    @Override
                    public void onPageStarted(WebView ignored, String url, Bitmap favicon) {
                        if (url != null) route(Uri.parse(url));
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
'''
    text = replace_once(text, chrome_anchor, chrome_replacement, "popup WebView interception")

    helper_anchor = '''    private void installDocumentStartScript() {
'''
    helper = '''    private boolean handleNavigationInsideGg(WebView view, Uri uri) {
        if (uri == null) return true;
        String scheme = uri.getScheme();
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

    private void installDocumentStartScript() {
'''
    text = replace_once(text, helper_anchor, helper, "navigation helper")
    text = replace_once(text, "source:'native-2.0.2'", "source:'native-2.0.4'", "native version marker")
    path.write_text(text, encoding="utf-8")

    gradle = Path("v2/android/client/build.gradle.kts")
    build = gradle.read_text(encoding="utf-8")
    build = replace_once(build, "versionCode = 12", "versionCode = 13", "client versionCode")
    build = replace_once(build, 'versionName = "2.0.3"', 'versionName = "2.0.4"', "client versionName")
    gradle.write_text(build, encoding="utf-8")

    license_manager = Path("v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java")
    manager_text = license_manager.read_text(encoding="utf-8")
    manager_text = replace_once(
        manager_text,
        "private static final int PROTOCOL_APP_VERSION = 12;",
        "private static final int PROTOCOL_APP_VERSION = 13;",
        "client protocol version",
    )
    license_manager.write_text(manager_text, encoding="utf-8")


def patch_manager() -> None:
    transport_path = Path("v2/android/manager/src/main/java/com/jinli/ggsecure/manager/ResilientApiTransport.java")
    text = transport_path.read_text(encoding="utf-8")
    anchor = '''    private ResilientApiTransport() {
    }

    static Response post(String path, String jsonBody, String userAgent,
'''
    methods = '''    private ResilientApiTransport() {
    }

    static Response get(String path, String userAgent,
                        String authorization, int maximumBytes) throws IOException {
        List<String> failures = new ArrayList<>();
        for (String host : NORMAL_HOSTS) {
            try {
                Response response = normalGet(host, path, userAgent, authorization, maximumBytes);
                if (isApiJson(response.body)) return response;
                failures.add(host + ": HTTP " + response.status + nonJsonReason(response));
            } catch (IOException error) {
                failures.add(host + ": " + shortMessage(error));
            }
        }
        Set<String> addresses = resolveWorkerAddresses(failures);
        for (String address : addresses) {
            try {
                Response response = directTlsGet(WORKER_HOST, address, path, userAgent,
                        authorization, maximumBytes);
                if (isApiJson(response.body)) return response;
                failures.add(address + ": HTTP " + response.status + nonJsonReason(response));
            } catch (IOException error) {
                failures.add(address + ": " + shortMessage(error));
            }
        }
        String detail = failures.isEmpty() ? "没有可用连接通道" : joinFailures(failures);
        throw new IOException("授权服务器连接失败：" + detail);
    }

    private static Response normalGet(String host, String path, String userAgent,
                                      String authorization, int maximumBytes) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL("https://" + host + path).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestMethod("GET");
        connection.setUseCaches(false);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", userAgent);
        if (authorization != null && !authorization.isEmpty()) {
            connection.setRequestProperty("Authorization", authorization);
        }
        try {
            int status = connection.getResponseCode();
            InputStream input = status >= 200 && status < 400
                    ? connection.getInputStream() : connection.getErrorStream();
            String body = input == null ? "" : new String(readLimited(input, maximumBytes), StandardCharsets.UTF_8);
            return new Response(status, body,
                    connection.getHeaderField("Content-Type"),
                    connection.getHeaderField("cf-mitigated"));
        } finally {
            connection.disconnect();
        }
    }

    private static Response directTlsGet(String host, String address, String path,
                                         String userAgent, String authorization,
                                         int maximumBytes) throws IOException {
        Socket plain = new Socket();
        plain.connect(new InetSocketAddress(address, 443), CONNECT_TIMEOUT_MS);
        plain.setSoTimeout(READ_TIMEOUT_MS);
        SSLSocket ssl = null;
        try {
            SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
            ssl = (SSLSocket) factory.createSocket(plain, host, 443, true);
            SSLParameters parameters = ssl.getSSLParameters();
            parameters.setEndpointIdentificationAlgorithm("HTTPS");
            ssl.setSSLParameters(parameters);
            ssl.setSoTimeout(READ_TIMEOUT_MS);
            ssl.startHandshake();
            SSLSocket verified = ssl;
            HostnameVerifier verifier = HttpsURLConnection.getDefaultHostnameVerifier();
            if (!verifier.verify(host, verified.getSession())) throw new IOException("TLS 域名校验失败");

            BufferedOutputStream output = new BufferedOutputStream(ssl.getOutputStream());
            StringBuilder headers = new StringBuilder();
            headers.append("GET ").append(path).append(" HTTP/1.1\\r\\n");
            headers.append("Host: ").append(host).append("\\r\\n");
            headers.append("User-Agent: ").append(userAgent).append("\\r\\n");
            headers.append("Accept: application/json\\r\\n");
            if (authorization != null && !authorization.isEmpty()) {
                headers.append("Authorization: ").append(authorization).append("\\r\\n");
            }
            headers.append("Connection: close\\r\\n\\r\\n");
            output.write(headers.toString().getBytes(StandardCharsets.ISO_8859_1));
            output.flush();
            return readHttpResponse(ssl.getInputStream(), maximumBytes);
        } finally {
            if (ssl != null) {
                try { ssl.close(); } catch (Exception ignored) { }
            } else {
                try { plain.close(); } catch (Exception ignored) { }
            }
        }
    }

    static Response post(String path, String jsonBody, String userAgent,
'''
    text = replace_once(text, anchor, methods, "manager resilient GET methods")
    transport_path.write_text(text, encoding="utf-8")

    api_path = Path("v2/android/manager/src/main/java/com/jinli/ggsecure/manager/AdminApiManager.java")
    api = api_path.read_text(encoding="utf-8")
    old_get = '''    void get(String path, Callback callback) {
        executor.execute(() -> {
            try {
                JSONObject response = getJson(path, authorization());
                deliver(callback, parse(response, 200));
            } catch (UnauthorizedException error) {
                logout();
                deliver(callback, Result.unauthorized("管理登录已失效，请重新登录"));
            } catch (Exception error) {
                deliver(callback, Result.error(message(error, "无法连接服务器")));
            }
        });
    }
'''
    new_get = '''    void get(String path, Callback callback) {
        executor.execute(() -> {
            try {
                ResilientApiTransport.Response response = ResilientApiTransport.get(
                        path, "GG-Admin/8 Android", authorization(), MAX_BYTES);
                JSONObject object = parseJson(response.body);
                if (response.status == 401) throw new UnauthorizedException();
                deliver(callback, parse(object, response.status));
            } catch (UnauthorizedException error) {
                logout();
                deliver(callback, Result.unauthorized("管理登录已失效，请重新登录"));
            } catch (Exception error) {
                deliver(callback, Result.error(message(error, "无法连接服务器")));
            }
        });
    }
'''
    api = replace_once(api, old_get, new_get, "manager GET caller")
    api = api.replace('"GG-Admin/7 Android"', '"GG-Admin/8 Android"')
    api_path.write_text(api, encoding="utf-8")

    gradle_path = Path("v2/android/manager/build.gradle.kts")
    gradle = gradle_path.read_text(encoding="utf-8")
    gradle = replace_once(gradle, "versionCode = 1", "versionCode = 2", "manager versionCode")
    gradle = replace_once(gradle, 'versionName = "2.0.0-test1"', 'versionName = "2.0.1"', "manager versionName")
    gradle = replace_once(
        gradle,
        '            signingConfig = signingConfigs.getByName("debug")\n',
        "",
        "manager debug signing removal",
    )
    gradle_path.write_text(gradle, encoding="utf-8")


if __name__ == "__main__":
    patch_client()
    patch_manager()
    print("GG client and manager connectivity fixes applied")
