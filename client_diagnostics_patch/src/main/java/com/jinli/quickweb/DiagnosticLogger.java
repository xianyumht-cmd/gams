package com.jinli.quickweb;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class DiagnosticLogger {
    private static final long MAX_LOG_BYTES = 6L * 1024L * 1024L;
    private static final int MAX_DETAIL_CHARS = 6000;
    private static final int MAX_ALIASES = 4096;
    private static final Pattern URL_PATTERN = Pattern.compile("(?i)https?://[^\\s\\\"'<>]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern HOST_PATTERN = Pattern.compile("(?i)(?<![A-Za-z0-9_-])(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}(?![A-Za-z0-9_-])");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}");
    private static final Pattern SECRET_PATTERN = Pattern.compile(
            "(?i)(?:bearer\\s+[A-Za-z0-9_\\-+/=]{12,}|eyJ[A-Za-z0-9_\\-]{12,}\\.[A-Za-z0-9_\\-]{8,}\\.[A-Za-z0-9_\\-]{8,}|(?<![A-Za-z0-9])[A-Za-z0-9+/=_-]{24,}(?![A-Za-z0-9]))");
    private static final Pattern CJK_PATTERN = Pattern.compile("[\\u3400-\\u9FFF]{2,}");
    private static final Pattern TOKEN_PATTERN = Pattern.compile("^(?:origin|route|url|str|fn|ctor|key|api|selector|error|stack|id|object|method|state|scheme|response-type|error-type)-\\d+$");
    private static final Pattern STATUS_CLASS_PATTERN = Pattern.compile("^[0-9]xx$");

    private static final Set<String> BRIDGE_EVENTS = new HashSet<>(Arrays.asList(
            "diagnostics_installed", "console_event", "window_error", "unhandled_rejection",
            "fetch_start", "fetch_end", "fetch_error", "xhr_start", "xhr_end", "xhr_error", "xhr_timeout",
            "dom_query", "history_change", "lifecycle_event", "payload_executed",
            "api_call_start", "api_call_resolve", "api_call_reject", "api_call_return", "api_call_throw",
            "api_wrapped", "api_object_inventory", "api_inventory", "api_scan_complete", "dom_snapshot"
    ));

    private static final Set<String> BRIDGE_KEYS = new HashSet<>(Arrays.asList(
            "build", "readyState", "href", "hasBridge", "environment", "android", "webView",
            "level", "count", "args", "error", "messageLength", "source", "line", "column", "reason",
            "method", "url", "bodyPresent", "status", "statusClass", "ok", "redirected", "responseType",
            "contentClass", "durationMs", "headerCount", "responseLengthBucket", "operation", "selector",
            "found", "state", "name", "elapsedMs", "persisted", "counterKinds", "api", "sourceKind",
            "argCount", "result", "arity", "owner", "keyCount", "wrappedCount", "candidateCount", "scan",
            "scans", "newGlobalCount", "scripts", "frames", "forms", "buttons", "inputs", "shadowRoots",
            "type", "id", "length", "valueClass", "integer", "value", "sample", "nameClass", "stackPresent",
            "nodeType", "tag", "connected", "ctor", "keys", "scheme", "scope", "origin", "route",
            "pathDepth", "pathClass", "queryCount", "fragment", "responseLength", "headerNames"
    ));

    private static final Set<String> SAFE_STRINGS = new HashSet<>(Arrays.asList(
            "anon-v2", "loading", "interactive", "complete", "visible", "hidden", "prerender", "unloaded",
            "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
            "http", "https", "file", "data", "blob", "about", "unknown",
            "same-origin", "external", "opaque", "route", "script", "style", "image", "font", "audio",
            "video", "data", "document", "other-file", "unknown", "json", "html", "text", "binary",
            "basic", "cors", "default", "error", "opaqueredirect", "arraybuffer", "document",
            "log", "info", "warn", "debug",
            "pushState", "replaceState", "querySelector", "querySelectorAll", "getElementById", "getElementsByClassName",
            "dom-content-loaded", "load", "pageshow", "pagehide", "hashchange", "popstate", "online", "offline", "visibility",
            "new-global-function", "object-method",
            "string", "number", "boolean", "function", "array", "object", "node", "null", "undefined",
            "zero", "one", "minus-one", "small", "medium", "large", "negative-small", "negative-medium", "negative-large", "non-finite",
            "Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "NetworkError", "AbortError", "OtherError",
            "HTML", "HEAD", "BODY", "DIV", "SPAN", "A", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "OPTION", "FORM",
            "IMG", "VIDEO", "AUDIO", "CANVAS", "IFRAME", "SCRIPT", "STYLE", "LINK", "META", "UL", "OL", "LI",
            "TABLE", "TR", "TD", "TH", "P", "H1", "H2", "H3", "NAV", "MAIN", "SECTION", "ARTICLE", "OTHER",
            "0", "1-4", "5-16", "17-64", "65-256", "257-1024", "1025+"
    ));

    private static final Set<String> BOOLEAN_KEYS = new HashSet<>(Arrays.asList(
            "hasBridge", "android", "webView", "bodyPresent", "ok", "redirected", "found", "persisted",
            "integer", "value", "stackPresent", "connected", "fragment"
    ));

    private static final Set<String> NUMBER_KEYS = new HashSet<>(Arrays.asList(
            "count", "line", "column", "status", "readyState", "durationMs", "headerCount", "elapsedMs", "counterKinds",
            "argCount", "arity", "keyCount", "wrappedCount", "candidateCount", "scan", "scans", "newGlobalCount",
            "scripts", "frames", "forms", "buttons", "inputs", "shadowRoots", "nodeType", "pathDepth", "queryCount"
    ));

    private final Context context;
    private final File directory;
    private final File logFile;
    private final String sessionId;
    private final Map<String, String> aliases = new LinkedHashMap<>();
    private long sequence;
    private int aliasSequence;

    DiagnosticLogger(Context context) {
        this.context = context.getApplicationContext();
        File root = this.context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (root == null) root = new File(this.context.getFilesDir(), "documents");
        directory = new File(root, "diagnostics");
        if (!directory.exists()) directory.mkdirs();
        logFile = new File(directory, "runtime.jsonl");
        sessionId = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        log("native", "session_start", "sdk=" + Build.VERSION.SDK_INT + ",deviceClass=android");
    }

    synchronized void log(String category, String event, String detail) {
        try {
            rotateIfNeeded();
            JSONObject object = new JSONObject();
            object.put("ts", utcNow());
            object.put("seq", ++sequence);
            object.put("session", sessionId);
            object.put("category", safeIdentifier(category));
            object.put("event", safeIdentifier(event));
            object.put("detail", sanitize(detail));
            appendLine(object.toString());
        } catch (Throwable ignored) {
        }
    }

    synchronized void logBridgePayload(String payload) {
        if (payload == null) return;
        String trimmed = payload.length() > 16000 ? payload.substring(0, 16000) : payload;
        try {
            JSONObject source = new JSONObject(trimmed);
            String event = source.optString("event", "");
            if (!BRIDGE_EVENTS.contains(event)) {
                log("js", "bridge_event_rejected", "length=" + lengthBucket(trimmed.length()));
                return;
            }
            JSONObject detail = source.optJSONObject("detail");
            JSONObject filtered = detail == null ? new JSONObject() : sanitizeBridgeObject(detail, 0);
            log("js", event, filtered.toString());
        } catch (Throwable error) {
            log("js", "bridge_payload_invalid", "length=" + lengthBucket(trimmed.length()));
        }
    }

    void logUrl(String category, String event, String url, String detail) {
        log(category, event, maskUrl(url) + (detail == null || detail.isEmpty() ? "" : "," + detail));
    }

    void logError(String category, String event, Throwable error) {
        String type = safeExceptionType(error);
        String message = error == null ? "" : String.valueOf(error.getMessage());
        String stack = "";
        if (error != null) {
            StringWriter writer = new StringWriter();
            error.printStackTrace(new PrintWriter(writer));
            stack = writer.toString();
        }
        log(category, event,
                "type=" + type +
                ",error=" + alias("error", type + "|" + message + "|" + stack) +
                ",messageLength=" + lengthBucket(message.length()) +
                ",stackFrames=" + countStackFrames(stack));
    }

    String instrumentSource(String source) {
        String actual = source == null ? "" : source;
        log("script", "source_received", "length=" + lengthBucket(actual.length()) + ",instrumentation=enabled");
        try {
            String prelude = readAsset("diagnostic-prelude.js");
            String postlude = readAsset("diagnostic-postlude.js");
            return prelude + "\n;\n" + actual + "\n;\n" + postlude;
        } catch (Throwable error) {
            logError("script", "instrumentation_asset_failure", error);
            return actual;
        }
    }

    synchronized void clear() {
        try {
            if (logFile.exists()) new FileOutputStream(logFile, false).close();
            File previous = new File(directory, "runtime.previous.jsonl");
            if (previous.exists()) previous.delete();
            File[] files = directory.listFiles();
            if (files != null) {
                for (File file : files) {
                    if (file.getName().startsWith("GG-diagnostic-") && file.getName().endsWith(".zip")) file.delete();
                }
            }
            aliases.clear();
            aliasSequence = 0;
            sequence = 0;
            log("native", "log_cleared", "ok=true");
        } catch (Throwable ignored) {
        }
    }

    synchronized String summary() {
        return "session=" + sessionId + "\nentries=" + sequence + "\nsize=" + logFile.length() +
                " bytes\nprivacy=anonymous aliases; no domains, paths, text, names or deterministic fingerprints";
    }

    synchronized File exportZip() throws Exception {
        log("native", "export_requested", "entries=" + sequence);
        SimpleDateFormat stampFormat = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US);
        stampFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
        String stamp = stampFormat.format(new Date());
        File output = new File(directory, "GG-diagnostic-" + stamp + ".zip");
        try (ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(output)))) {
            addFile(zip, logFile, "runtime.jsonl");
            File previous = new File(directory, "runtime.previous.jsonl");
            if (previous.isFile()) addFile(zip, previous, "runtime.previous.jsonl");
            addText(zip, "summary.txt", summary() + "\ncreatedUtc=" + utcNow() + "\n");
            addText(zip, "PRIVACY.txt",
                    "This package contains anonymous structural diagnostic events only.\n" +
                    "Exact URLs, host names, page text, domains, paths, selectors, API names, object keys, request/response bodies, cookies, activation keys and tokens are not recorded.\n" +
                    "Origins, routes, selectors, strings and APIs use session-local sequential aliases such as origin-1 and api-3.\n" +
                    "Aliases are reset when logs are cleared and are not deterministic hashes, so they cannot be compared with candidate websites.\n");
        }
        return output;
    }

    void share(Activity activity) {
        try {
            File archive = exportZip();
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".diagnostics", archive);
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/zip");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(Intent.createChooser(intent, "发送诊断日志"));
        } catch (Throwable error) {
            logError("native", "export_failure", error);
            throw new IllegalStateException("无法导出诊断日志", error);
        }
    }

    String sessionId() {
        return sessionId;
    }

    private JSONObject sanitizeBridgeObject(JSONObject input, int depth) throws Exception {
        JSONObject output = new JSONObject();
        if (depth > 4) return output;
        JSONArray names = input.names();
        if (names == null) return output;
        int omitted = 0;
        for (int i = 0; i < names.length() && i < 80; i++) {
            String key = names.optString(i, "");
            if (!BRIDGE_KEYS.contains(key)) {
                omitted++;
                continue;
            }
            Object value = input.opt(key);
            output.put(key, sanitizeBridgeValue(key, value, depth + 1));
        }
        if (omitted > 0) output.put("omittedFieldCount", omitted);
        return output;
    }

    private Object sanitizeBridgeValue(String key, Object value, int depth) throws Exception {
        if (value == null || value == JSONObject.NULL) return JSONObject.NULL;
        if (value instanceof JSONObject) return sanitizeBridgeObject((JSONObject) value, depth);
        if (value instanceof JSONArray) {
            JSONArray source = (JSONArray) value;
            JSONArray output = new JSONArray();
            for (int i = 0; i < source.length() && i < 16; i++) {
                output.put(sanitizeBridgeValue(key, source.opt(i), depth + 1));
            }
            return output;
        }
        if (value instanceof Boolean) return BOOLEAN_KEYS.contains(key) ? value : false;
        if (value instanceof Number) {
            if (!NUMBER_KEYS.contains(key)) return 0;
            long number = ((Number) value).longValue();
            if ("status".equals(key)) return Math.max(0, Math.min(599, number));
            if ("durationMs".equals(key) || "elapsedMs".equals(key)) return Math.max(0, Math.min(3600000, number));
            return Math.max(-1000000, Math.min(1000000, number));
        }
        String text = String.valueOf(value);
        if (SAFE_STRINGS.contains(text) || TOKEN_PATTERN.matcher(text).matches() || STATUS_CLASS_PATTERN.matcher(text).matches()) {
            return text;
        }
        return alias("text", text) + ":len=" + lengthBucket(text.length());
    }

    private synchronized String maskUrl(String value) {
        if (value == null || value.trim().isEmpty()) return "scheme=none,origin=origin-0,route=route-0";
        try {
            Uri uri = Uri.parse(value);
            String scheme = safeScheme(uri.getScheme());
            String authority = String.valueOf(uri.getAuthority());
            String path = String.valueOf(uri.getEncodedPath());
            String origin = alias("origin", scheme + "://" + authority);
            String route = alias("route", scheme + "://" + authority + path);
            return "scheme=" + scheme +
                    ",origin=" + origin +
                    ",route=" + route +
                    ",pathDepth=" + pathDepth(path) +
                    ",pathClass=" + pathClass(path) +
                    ",queryCount=" + queryCount(uri.getEncodedQuery()) +
                    ",fragment=" + (uri.getFragment() != null);
        } catch (Throwable ignored) {
            return "scheme=unknown,origin=" + alias("origin", value) + ",route=" + alias("route", value);
        }
    }

    private synchronized String alias(String kind, String value) {
        String actual = value == null ? "" : value;
        String mapKey = kind + "\u0000" + actual;
        String existing = aliases.get(mapKey);
        if (existing != null) return existing;
        if (aliases.size() >= MAX_ALIASES) return kind + "-overflow";
        String created = kind + "-" + (++aliasSequence);
        aliases.put(mapKey, created);
        return created;
    }

    private void rotateIfNeeded() {
        if (!logFile.isFile() || logFile.length() < MAX_LOG_BYTES) return;
        File previous = new File(directory, "runtime.previous.jsonl");
        if (previous.exists()) previous.delete();
        logFile.renameTo(previous);
    }

    private void appendLine(String line) throws Exception {
        if (!directory.exists()) directory.mkdirs();
        try (FileOutputStream output = new FileOutputStream(logFile, true)) {
            output.write(line.getBytes(StandardCharsets.UTF_8));
            output.write('\n');
            output.flush();
        }
    }

    private String readAsset(String name) throws Exception {
        try (InputStream input = context.getAssets().open(name);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toString("UTF-8");
        }
    }

    private static void addFile(ZipOutputStream zip, File file, String name) throws Exception {
        if (!file.isFile()) return;
        zip.putNextEntry(new ZipEntry(name));
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) zip.write(buffer, 0, count);
        }
        zip.closeEntry();
    }

    private static void addText(ZipOutputStream zip, String name, String text) throws Exception {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(text.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static String sanitize(String input) {
        if (input == null) return "";
        String value = input;
        value = replacePlain(URL_PATTERN, value, "***URL***");
        value = replacePlain(EMAIL_PATTERN, value, "***EMAIL***");
        value = replacePlain(HOST_PATTERN, value, "***HOST***");
        value = replacePlain(SECRET_PATTERN, value, "***SECRET***");
        value = CJK_PATTERN.matcher(value).replaceAll("***TEXT***");
        value = value.replaceAll("(?i)(cookie|authorization|token|licenseKey|scriptBase64)\\s*[:=]\\s*[^,}\\s]+", "$1=***SECRET***");
        value = value.replaceAll("(?i)([A-Za-z0-9_]*Hash)\\s*[:=]\\s*[A-Za-z0-9_-]+", "$1=***REMOVED***");
        value = value.replaceAll("(?i)(mime|contentType)\\s*[:=]\\s*[^,}\\s]+", "$1=present");
        if (value.length() > MAX_DETAIL_CHARS) value = value.substring(0, MAX_DETAIL_CHARS) + "…[truncated]";
        return value;
    }

    private static String replacePlain(Pattern pattern, String input, String replacement) {
        Matcher matcher = pattern.matcher(input);
        return matcher.replaceAll(Matcher.quoteReplacement(replacement));
    }

    private static String safeIdentifier(String value) {
        if (value == null) return "";
        return value.replaceAll("[^A-Za-z0-9_.:/-]", "_").replaceAll("_{2,}", "_");
    }

    private static String safeScheme(String value) {
        if (value == null) return "unknown";
        String scheme = value.toLowerCase(Locale.US);
        if (Arrays.asList("http", "https", "file", "data", "blob", "about").contains(scheme)) return scheme;
        return "other";
    }

    private static String safeExceptionType(Throwable error) {
        if (error == null) return "OtherError";
        String name = error.getClass().getSimpleName();
        if (Arrays.asList("Exception", "IllegalStateException", "IllegalArgumentException", "NullPointerException",
                "IOException", "SecurityException", "RuntimeException", "TimeoutException").contains(name)) return name;
        return "OtherError";
    }

    private static int pathDepth(String path) {
        if (path == null || path.isEmpty()) return 0;
        int count = 0;
        for (String part : path.split("/")) if (!part.isEmpty()) count++;
        return Math.min(12, count);
    }

    private static String pathClass(String path) {
        String lower = path == null ? "" : path.toLowerCase(Locale.US);
        if (lower.matches(".*\\.(js|mjs)$")) return "script";
        if (lower.endsWith(".css")) return "style";
        if (lower.matches(".*\\.(png|jpg|jpeg|gif|webp|svg|ico)$")) return "image";
        if (lower.matches(".*\\.(woff|woff2|ttf|otf)$")) return "font";
        if (lower.matches(".*\\.(mp3|ogg|wav|m4a)$")) return "audio";
        if (lower.matches(".*\\.(mp4|webm|m3u8)$")) return "video";
        if (lower.matches(".*\\.(json|xml)$")) return "data";
        if (lower.matches(".*\\.(html|htm|php|asp|aspx)$")) return "document";
        return lower.substring(lower.lastIndexOf('/') + 1).contains(".") ? "other-file" : "route";
    }

    private static int queryCount(String query) {
        if (query == null || query.isEmpty()) return 0;
        return Math.min(20, query.split("&").length);
    }

    private static int countStackFrames(String stack) {
        if (stack == null || stack.isEmpty()) return 0;
        int count = 0;
        for (String line : stack.split("\\r?\\n")) if (line.trim().startsWith("at ")) count++;
        return Math.min(100, count);
    }

    private static String lengthBucket(int length) {
        if (length <= 0) return "0";
        if (length <= 4) return "1-4";
        if (length <= 16) return "5-16";
        if (length <= 64) return "17-64";
        if (length <= 256) return "65-256";
        if (length <= 1024) return "257-1024";
        return "1025+";
    }

    private static String utcNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }
}
