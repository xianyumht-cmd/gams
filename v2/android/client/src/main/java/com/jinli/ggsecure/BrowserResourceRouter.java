package com.jinli.ggsecure;

import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.Supplier;

/** WebView resource decisions and response construction, independent of Activity UI. */
final class BrowserResourceRouter implements BrowserWebViewController.ResourceHost {
    private static final String START_URL = RuntimeNames.startUrl();
    private final Supplier<RuntimePayload> payload;
    private final Supplier<String> userAgent;

    BrowserResourceRouter(Supplier<RuntimePayload> payload, Supplier<String> userAgent) {
        this.payload = payload;
        this.userAgent = userAgent;
    }

    @Override
    public boolean directEngine() {
        RuntimePayload current = payload.get();
        if (BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE) {
            return NativeRuntimeBridge.directEngine(true,
                    current == null ? "" : current.versionName());
        }
        return BuildConfig.EDGEONE_CANDIDATE && current != null &&
                current.versionName().startsWith("1.4.1");
    }

    String startUrl() {
        return directEngine() ? "https://m.66rpg.com/" : START_URL;
    }

    @Override
    public WebResourceResponse intercept(WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE) {
            boolean direct = directEngine();
            String accept = direct && request.isForMainFrame()
                    ? headerIgnoreCase(request, "Accept") : null;
            int route = NativeRuntimeBridge.resourceRoute(direct,
                    url, RuntimeNames.virtualGameUrl(), request.isForMainFrame(),
                    request.getMethod(), request.getUrl().getScheme(),
                    request.getUrl().getHost(), accept);
            switch (route) {
                case 1: return memoryGameResponse();
                case 2: return emptyOfficialEngineResponse();
                case 3: return forbiddenCoreResponse();
                case 4: return rewriteEdgeOnePage(request);
                default: return null;
            }
        }
        if (directEngine()) {
            if (isOfficialEngineRequest(url)) return memoryGameResponse();
            if (shouldRewriteEdgeOnePage(request)) return rewriteEdgeOnePage(request);
            return null;
        }
        if (isOfficialEngineRequest(url)) return emptyOfficialEngineResponse();
        if (isEngineRequest(url)) return memoryGameResponse();
        if (isForbiddenCoreRequest(url)) return forbiddenCoreResponse();
        return null;
    }

    private WebResourceResponse memoryGameResponse() {
        RuntimePayload current = payload.get();
        if (current == null) return unavailableGameResponse();
        final int size;
        final InputStream stream;
        try {
            // WebView may intercept off the main thread; couple length and open.
            synchronized (current) {
                size = current.gameSize();
                stream = current.openGameStream();
            }
        } catch (IllegalStateException error) {
            return unavailableGameResponse();
        }
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store, no-cache, max-age=0");
        headers.put("Pragma", "no-cache");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Content-Length", String.valueOf(size));
        return new WebResourceResponse("application/javascript", "UTF-8", 200,
                "OK", headers, stream);
    }

    private static WebResourceResponse unavailableGameResponse() {
        return new WebResourceResponse("text/plain", "UTF-8", 503,
                "Runtime unavailable",
                java.util.Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(new byte[0]));
    }

    private static WebResourceResponse forbiddenCoreResponse() {
        return new WebResourceResponse("text/plain", "UTF-8", 403,
                "Blocked", java.util.Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(new byte[0]));
    }

    private static WebResourceResponse emptyOfficialEngineResponse() {
        byte[] body = "window.__gg_official_engine_blocked__=true;".getBytes(
                StandardCharsets.UTF_8);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store, no-cache, max-age=0");
        headers.put("Pragma", "no-cache");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Content-Length", String.valueOf(body.length));
        return new WebResourceResponse("application/javascript", "UTF-8", 200,
                "OK", headers, new ByteArrayInputStream(body));
    }

    private boolean shouldRewriteEdgeOnePage(WebResourceRequest request) {
        if (!request.isForMainFrame() || !"GET".equalsIgnoreCase(request.getMethod())) return false;
        if (!"https".equalsIgnoreCase(request.getUrl().getScheme()) ||
                !targetPage(request.getUrl().toString())) return false;
        String accept = headerIgnoreCase(request, "Accept");
        return accept != null && accept.toLowerCase(Locale.ROOT).contains("text/html");
    }

    private static String headerIgnoreCase(WebResourceRequest request, String key) {
        Map<String, String> headers = request.getRequestHeaders();
        if (headers == null) return null;
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            if (key.equalsIgnoreCase(entry.getKey())) return entry.getValue();
        }
        return null;
    }

    private WebResourceResponse rewriteEdgeOnePage(WebResourceRequest request) {
        String address = request.getUrl().toString();
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(15000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept-Encoding", "identity");
            String currentUserAgent = userAgent.get();
            if (currentUserAgent != null) {
                connection.setRequestProperty("User-Agent", currentUserAgent);
            }
            for (String name : new String[]{"Accept", "Accept-Language", "Referer"}) {
                String value = headerIgnoreCase(request, name);
                if (value != null && !value.isEmpty()) connection.setRequestProperty(name, value);
            }
            String cookies = CookieManager.getInstance().getCookie(address);
            if (cookies != null && !cookies.isEmpty()) connection.setRequestProperty("Cookie", cookies);
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) return null;
            String contentType = connection.getContentType();
            if (status != 200 || contentType == null ||
                    !contentType.toLowerCase(Locale.ROOT).startsWith("text/html") ||
                    (contentType.toLowerCase(Locale.ROOT).contains("charset=") &&
                            !contentType.toLowerCase(Locale.ROOT).contains("utf-8"))) {
                throw new IOException("页面不是可处理的 UTF-8 HTML");
            }
            String html;
            try (InputStream source = connection.getInputStream()) {
                html = new String(EdgeOneHtmlCompatibility.readHtml(source, 2 * 1024 * 1024),
                        StandardCharsets.UTF_8);
            }
            RuntimePayload current = payload.get();
            if (current == null) throw new IOException("运行时已经退出");
            byte[] rewritten = current.rewriteHtml(html);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            String csp = connection.getHeaderField("Content-Security-Policy");
            if (csp != null) headers.put("Content-Security-Policy", csp);
            return new WebResourceResponse("text/html", "UTF-8", 200, "OK",
                    headers, new ByteArrayInputStream(rewritten));
        } catch (Exception error) {
            byte[] html = ("<!doctype html><meta charset='utf-8'><p>" +
                    UiText.get(UiText.HTML_FAILED) + "</p>")
                    .getBytes(StandardCharsets.UTF_8);
            return new WebResourceResponse("text/html", "UTF-8", 503,
                    "Unavailable", java.util.Collections.singletonMap("Cache-Control", "no-store"),
                    new ByteArrayInputStream(html));
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static boolean isOfficialEngineRequest(String url) {
        String lower = url == null ? "" : url.toLowerCase(Locale.ROOT);
        return lower.contains("c2.cgyouxi.com/website/hfplayer/") &&
                lower.contains("/bin/official/game.js");
    }

    private static boolean isEngineRequest(String url) {
        String lower = url == null ? "" : url.toLowerCase(Locale.ROOT);
        return lower.equals(RuntimeNames.virtualGameUrl().toLowerCase(Locale.ROOT)) ||
                lower.contains("gams-script-edge.2320006072.workers.dev/engine/stable.js") ||
                lower.contains("space-z.ai/game.js");
    }

    private static boolean isForbiddenCoreRequest(String url) {
        String lower = url == null ? "" : url.toLowerCase(Locale.ROOT);
        return lower.contains("raw.githubusercontent.com/xianyumht-cmd/gams") &&
                (lower.contains("/remote-script/") || lower.contains("/game-engine/"));
    }

    @Override
    public boolean targetPage(String url) {
        if (url == null) return false;
        try {
            String host = Uri.parse(url).getHost();
            if (BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE) {
                return NativeRuntimeBridge.targetSiteHost(host);
            }
            return "m.66rpg.com".equalsIgnoreCase(host) ||
                    "www.66rpg.com".equalsIgnoreCase(host);
        } catch (Exception error) {
            return false;
        }
    }

    static String wrapControlScript(String source) {
        return "(function(){" +
                "if(window.__GG_V2_CONTROL_LOADED__)return;" +
                "window.__GG_V2_CONTROL_LOADED__=true;" +
                "try{\n" + source + "\n}catch(e){" +
                "window.__GG_V2_CONTROL_LOADED__=false;" +
                "console.error('[GG]',e);}" +
                "})();";
    }

    @Override
    public boolean suppressedReadyAlert(String message) {
        if (message == null) return false;
        if (BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE) {
            return NativeRuntimeBridge.suppressedReadyAlert(message);
        }
        String normalized = message.trim().replace('～', '~');
        return "脚本加载完成~".equals(normalized);
    }
}
