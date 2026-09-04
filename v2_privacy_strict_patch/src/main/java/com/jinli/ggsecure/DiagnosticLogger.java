package com.jinli.ggsecure;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.SystemClock;

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
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class DiagnosticLogger {
    private static final long MAX_LOG_BYTES = 8L * 1024L * 1024L;
    private static final int MAX_DETAIL_CHARS = 3000;
    private static final Pattern URL_PATTERN = Pattern.compile("(?i)https?://[^\\s\\\"'<>]+");
    private static final Pattern HOST_PATTERN = Pattern.compile("(?i)(?<![A-Za-z0-9_-])(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}(?![A-Za-z0-9_-])");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}");
    private static final Pattern SECRET_PATTERN = Pattern.compile("(?i)(?:bearer\\s+[A-Za-z0-9_\\-+/=]{12,}|eyJ[A-Za-z0-9_\\-]{12,}\\.[A-Za-z0-9_\\-]{8,}\\.[A-Za-z0-9_\\-]{8,}|(?<![A-Za-z0-9])[A-Za-z0-9_\\-+/=]{28,}(?![A-Za-z0-9]))");
    private static final Pattern LONG_HEX_PATTERN = Pattern.compile("(?i)(?<![A-F0-9])[A-F0-9]{16,}(?![A-F0-9])");
    private static final Pattern CJK_PATTERN = Pattern.compile("[\\u3400-\\u9FFF]");
    private static final Pattern WINDOWS_PATH_PATTERN = Pattern.compile("(?i)(?:[A-Z]:\\\\|file:/+)[^\\s\\\"'<>]+");
    private static final Pattern UNIX_PATH_PATTERN = Pattern.compile("(?<![A-Za-z0-9])/(?:[^/\\s,}]+/){2,}[^\\s,}]*");

    private final Context context;
    private final File directory;
    private final File logFile;
    private final String privateSessionNonce;
    private final long startedElapsedMs;
    private final Map<String, String> routeTokens = new LinkedHashMap<>();
    private final Map<String, String> opaqueTokens = new LinkedHashMap<>();
    private long sequence;

    DiagnosticLogger(Context context) {
        this.context = context.getApplicationContext();
        File root = this.context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (root == null) root = new File(this.context.getFilesDir(), "documents");
        directory = new File(root, "diagnostics");
        if (!directory.exists()) directory.mkdirs();
        logFile = new File(directory, "runtime.jsonl");
        privateSessionNonce = UUID.randomUUID().toString();
        startedElapsedMs = SystemClock.elapsedRealtime();
        log("native", "session_start", "sdkBand=" + sdkBand(Build.VERSION.SDK_INT));
    }

    synchronized void log(String category, String event, String detail) {
        write(category, event, sanitizeText(detail));
    }

    synchronized void logBridgePayload(String payload) {
        if (payload == null) return;
        String trimmed = payload.length() > 20000 ? payload.substring(0, 20000) : payload;
        try {
            JSONObject source = new JSONObject(trimmed);
            String event = safeIdentifier(source.optString("event", "bridge_event"));
            Object detail = strictJson(source.opt("detail"), "detail", 0);
            write("js", event, detail == null ? JSONObject.NULL : detail);
        } catch (Throwable error) {
            JSONObject detail = new JSONObject();
            try {
                detail.put("payloadPresent", true);
                detail.put("payloadSize", sizeBucket(trimmed.length()));
                detail.put("errorId", opaqueToken(error.getClass().getName() + ":" + error.getMessage()));
            } catch (Throwable ignored) { }
            write("js", "bridge_payload_invalid", detail);
        }
    }

    synchronized void logUrl(String category, String event, String url, String detail) {
        JSONObject object = new JSONObject();
        try {
            object.put("route", routeToken(url));
            object.put("extra", sanitizeText(detail));
        } catch (Throwable ignored) { }
        write(category, event, object);
    }

    synchronized void logError(String category, String event, Throwable error) {
        JSONObject detail = new JSONObject();
        try {
            String type = error == null ? "unknown" : error.getClass().getSimpleName();
            String message = error == null ? "" : String.valueOf(error.getMessage());
            String stack = "";
            if (error != null) {
                StringWriter writer = new StringWriter();
                error.printStackTrace(new PrintWriter(writer));
                stack = writer.toString();
            }
            detail.put("type", safeErrorType(type));
            detail.put("errorId", opaqueToken(type + "|" + message + "|" + stack));
            detail.put("messagePresent", !message.isEmpty());
            detail.put("stackPresent", !stack.isEmpty());
        } catch (Throwable ignored) { }
        write(category, event, detail);
    }

    String instrumentSource(String source) {
        String actual = source == null ? "" : source;
        JSONObject detail = new JSONObject();
        try {
            detail.put("present", !actual.isEmpty());
            detail.put("size", sizeBucket(actual.length()));
        } catch (Throwable ignored) { }
        write("script", "control_source_received", detail);
        try {
            return readAsset("diagnostic-prelude.js") + "\n;\n" + actual +
                    "\n;\n" + readAsset("diagnostic-postlude.js");
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
                    if (file.getName().startsWith("GG-private-diagnostic-") && file.getName().endsWith(".zip")) file.delete();
                }
            }
            routeTokens.clear();
            opaqueTokens.clear();
            sequence = 0;
            log("native", "log_cleared", "ok=true");
        } catch (Throwable ignored) { }
    }

    synchronized String summary() {
        return "记录：" + sequence + " 条\n大小：" + logFile.length() +
                " 字节\n隐私模式：严格匿名（无稳定哈希、无网址特征、无页面文字）";
    }

    synchronized File exportZip() throws Exception {
        log("native", "export_requested", "entries=" + countBucket(sequence));
        assertPrivacySafe(logFile);
        File previous = new File(directory, "runtime.previous.jsonl");
        if (previous.isFile()) assertPrivacySafe(previous);

        SimpleDateFormat stampFormat = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US);
        stampFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
        File output = new File(directory,
                "GG-private-diagnostic-" + stampFormat.format(new Date()) + ".zip");
        try (ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(output)))) {
            addFile(zip, logFile, "runtime.jsonl");
            if (previous.isFile()) addFile(zip, previous, "runtime.previous.jsonl");
            addText(zip, "summary.txt", summary() + "\nprivacyAudit=passed\n");
            addText(zip, "PRIVACY.txt",
                    "Strict non-identifying diagnostics.\n" +
                    "No exact or hashed domain, URL, route, selector, page text, object key, script digest, device model, request body, response body, cookie, activation value or token is exported.\n" +
                    "R/Q/C/E identifiers are random-session ordinals only and cannot be correlated across runs.\n" +
                    "Export is refused when the final privacy audit detects a possible identifier.\n");
        }
        return output;
    }

    void share(Activity activity) {
        try {
            File archive = exportZip();
            Uri uri = FileProvider.getUriForFile(activity,
                    activity.getPackageName() + ".diagnostics", archive);
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/zip");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(Intent.createChooser(intent, "发送匿名诊断日志"));
        } catch (Throwable error) {
            logError("native", "export_failure", error);
            throw new IllegalStateException("隐私审计未通过，日志没有导出", error);
        }
    }

    String sessionId() { return "private"; }

    private synchronized void write(String category, String event, Object detail) {
        try {
            rotateIfNeeded();
            JSONObject object = new JSONObject();
            object.put("t", Math.max(0L, SystemClock.elapsedRealtime() - startedElapsedMs));
            object.put("seq", ++sequence);
            object.put("category", safeIdentifier(category));
            object.put("event", safeIdentifier(event));
            object.put("detail", detail == null ? JSONObject.NULL : detail);
            appendLine(object.toString());
        } catch (Throwable ignored) { }
    }

    private Object strictJson(Object value, String key, int depth) {
        if (value == null || value == JSONObject.NULL) return JSONObject.NULL;
        if (depth > 5) return "depth-limit";
        if (value instanceof Boolean) return value;
        if (value instanceof Number) return strictNumber((Number) value, key);
        if (value instanceof String) return strictString((String) value, key);
        if (value instanceof JSONArray) {
            JSONArray input = (JSONArray) value;
            JSONArray output = new JSONArray();
            int count = Math.min(input.length(), 24);
            for (int i = 0; i < count; i++) output.put(strictJson(input.opt(i), key, depth + 1));
            if (input.length() > count) output.put("truncated");
            return output;
        }
        if (value instanceof JSONObject) {
            JSONObject input = (JSONObject) value;
            JSONObject output = new JSONObject();
            JSONArray names = input.names();
            if (names == null) return output;
            int count = Math.min(names.length(), 40);
            for (int i = 0; i < count; i++) {
                String name = safeSchemaKey(names.optString(i, "field"));
                try { output.put(name, strictJson(input.opt(names.optString(i)), name, depth + 1)); }
                catch (Throwable ignored) { }
            }
            return output;
        }
        return opaqueToken(String.valueOf(value));
    }

    private Object strictNumber(Number number, String key) {
        String lower = key == null ? "" : key.toLowerCase(Locale.US);
        double value = number.doubleValue();
        if (lower.contains("status") || lower.equals("code") || lower.contains("readystate") || lower.contains("nodetype")) {
            return number.longValue();
        }
        if (lower.contains("duration") || lower.contains("elapsed") || lower.equals("t") || lower.contains("age")) {
            return durationBucket(Math.max(0L, number.longValue()));
        }
        if (lower.contains("count") || lower.contains("length") || lower.contains("size") || lower.contains("forms") || lower.contains("buttons") || lower.contains("inputs") || lower.contains("scripts") || lower.contains("frames")) {
            return countBucket(Math.max(0L, number.longValue()));
        }
        if (Double.isNaN(value) || Double.isInfinite(value)) return "non-finite";
        if (value == 0d) return "zero";
        double absolute = Math.abs(value);
        if (absolute < 1d) return value > 0 ? "positive-fraction" : "negative-fraction";
        if (absolute < 10d) return value > 0 ? "positive-small" : "negative-small";
        if (absolute < 1000d) return value > 0 ? "positive-medium" : "negative-medium";
        return value > 0 ? "positive-large" : "negative-large";
    }

    private String strictString(String value, String key) {
        String actual = value == null ? "" : value;
        String lowerKey = key == null ? "" : key.toLowerCase(Locale.US);
        if (actual.isEmpty()) return "";
        if (isAllowedEnum(actual)) return actual;
        if (actual.matches("^[RQCSEAV][0-9]{1,5}$")) return actual;
        if (lowerKey.contains("route") || lowerKey.contains("url") || lowerKey.contains("href") || lowerKey.contains("source")) return routeToken(actual);
        if (lowerKey.contains("selector")) return tokenFor(opaqueTokens, "Q", "selector|" + actual);
        if (lowerKey.contains("callback")) return tokenFor(opaqueTokens, "C", "callback|" + actual);
        if (lowerKey.contains("error") || lowerKey.contains("message") || lowerKey.contains("stack")) return tokenFor(opaqueTokens, "E", "error|" + actual);
        if (lowerKey.contains("api") || lowerKey.contains("function") || lowerKey.contains("fingerprint") || lowerKey.contains("hash") || lowerKey.contains("id") || lowerKey.contains("class") || lowerKey.contains("name") || lowerKey.contains("key")) {
            return tokenFor(opaqueTokens, "V", lowerKey + "|" + actual);
        }
        String sanitized = sanitizeText(actual);
        if (sanitized.matches("^[A-Za-z0-9_.:/=-]{1,48}$") && isAllowedEnum(sanitized)) return sanitized;
        return tokenFor(opaqueTokens, "V", lowerKey + "|" + sanitized);
    }

    private String sanitizeText(String input) {
        if (input == null || input.isEmpty()) return "";
        String value = input;
        value = replaceRoutes(URL_PATTERN, value);
        value = WINDOWS_PATH_PATTERN.matcher(value).replaceAll("path-omitted");
        value = UNIX_PATH_PATTERN.matcher(value).replaceAll("path-omitted");
        value = EMAIL_PATTERN.matcher(value).replaceAll("email-omitted");
        value = HOST_PATTERN.matcher(value).replaceAll("origin-omitted");
        value = SECRET_PATTERN.matcher(value).replaceAll("secret-omitted");
        value = LONG_HEX_PATTERN.matcher(value).replaceAll("opaque-omitted");
        value = CJK_PATTERN.matcher(value).replaceAll("*");
        value = value.replaceAll("(?i)sha(?:-?256)?\\s*[:=]\\s*[^,}\\s]+", "digest=omitted");
        value = value.replaceAll("(?i)modelHash\\s*[:=]\\s*[^,}\\s]+", "deviceModel=omitted");
        value = value.replaceAll("(?i)gameSize\\s*[:=]\\s*\\d+", "gamePresent=true");
        value = value.replaceAll("(?i)(cookie|authorization|token|licenseKey|scriptBase64|requestBody|responseBody)\\s*[:=]\\s*[^,}\\s]+", "$1=omitted");
        if (value.length() > MAX_DETAIL_CHARS) value = value.substring(0, MAX_DETAIL_CHARS) + "...truncated";
        return value;
    }

    private String replaceRoutes(Pattern pattern, String input) {
        Matcher matcher = pattern.matcher(input);
        StringBuffer output = new StringBuffer();
        while (matcher.find()) matcher.appendReplacement(output, Matcher.quoteReplacement(routeToken(matcher.group())));
        matcher.appendTail(output);
        return output.toString();
    }

    private synchronized String routeToken(String value) {
        String actual = value == null ? "" : value.trim();
        if (actual.isEmpty() || "none".equalsIgnoreCase(actual)) return "R0";
        if (actual.matches("^R[0-9]{1,5}$")) return actual;
        return tokenFor(routeTokens, "R", privateSessionNonce + "|" + actual);
    }

    private synchronized String opaqueToken(String value) {
        return tokenFor(opaqueTokens, "E", privateSessionNonce + "|" + String.valueOf(value));
    }

    private static String tokenFor(Map<String, String> map, String prefix, String value) {
        String existing = map.get(value);
        if (existing != null) return existing;
        String created = prefix + (map.size() + 1);
        map.put(value, created);
        return created;
    }

    private static boolean isAllowedEnum(String value) {
        return value.matches("(?i)^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|true|false|ok|success|failure|unknown|none|text|json|html|script|image|font|media|binary|other|cors|basic|opaque|default|loading|interactive|complete|visible|hidden|prerender|object|array|string|number|boolean|function|error|node|undefined|null|plain|connected|disconnected|property|attribute|mutation|document|resource|main|sub|present|absent|yes|no|zero|one|few|many|large|small|medium|depth-limit|truncated|non-finite|positive-fraction|negative-fraction|positive-small|negative-small|positive-medium|negative-medium|positive-large|negative-large|[0-9]+ms|[0-9]+-[0-9]+ms|[0-9]+s\\+|0|1|2-5|6-20|21-100|101\\+|0B|1-99B|100B-1K|1K-10K|10K-100K|100K\\+)$");
    }

    private static String safeSchemaKey(String value) {
        String key = value == null ? "field" : value.replaceAll("[^A-Za-z0-9_]", "_");
        if (key.length() > 40) key = key.substring(0, 40);
        return key.isEmpty() ? "field" : key;
    }

    private static String safeIdentifier(String value) {
        if (value == null) return "unknown";
        String safe = value.replaceAll("[^A-Za-z0-9_.:/-]", "_").replaceAll("_{2,}", "_");
        return safe.length() > 64 ? safe.substring(0, 64) : safe;
    }

    private static String safeErrorType(String value) {
        if (value == null) return "unknown";
        if (value.matches("^(TypeError|RangeError|ReferenceError|SyntaxError|SecurityException|IOException|IllegalStateException|RuntimeException|Exception|Error)$")) return value;
        return "other";
    }

    private static String sdkBand(int sdk) {
        if (sdk < 26) return "legacy";
        if (sdk < 30) return "26-29";
        if (sdk < 34) return "30-33";
        return "34+";
    }

    private static String durationBucket(long ms) {
        if (ms < 25) return "0-24ms";
        if (ms < 100) return "25-99ms";
        if (ms < 250) return "100-249ms";
        if (ms < 500) return "250-499ms";
        if (ms < 1000) return "500-999ms";
        if (ms < 2000) return "1-2s";
        if (ms < 5000) return "2-5s";
        return "5s+";
    }

    private static String countBucket(long count) {
        if (count <= 0) return "0";
        if (count == 1) return "1";
        if (count <= 5) return "2-5";
        if (count <= 20) return "6-20";
        if (count <= 100) return "21-100";
        return "101+";
    }

    private static String sizeBucket(long size) {
        if (size <= 0) return "0B";
        if (size < 100) return "1-99B";
        if (size < 1024) return "100B-1K";
        if (size < 10 * 1024) return "1K-10K";
        if (size < 100 * 1024) return "10K-100K";
        return "100K+";
    }

    private void assertPrivacySafe(File file) throws Exception {
        if (!file.isFile()) return;
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(file));
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            String text = output.toString("UTF-8");
            if (URL_PATTERN.matcher(text).find() || HOST_PATTERN.matcher(text).find() ||
                    EMAIL_PATTERN.matcher(text).find() || SECRET_PATTERN.matcher(text).find() ||
                    LONG_HEX_PATTERN.matcher(text).find() || CJK_PATTERN.matcher(text).find() ||
                    WINDOWS_PATH_PATTERN.matcher(text).find()) {
                throw new SecurityException("privacy-audit-failed");
            }
        }
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
}
