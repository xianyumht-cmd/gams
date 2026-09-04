package com.jinli.ggsecure;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;

import androidx.core.content.FileProvider;

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
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class DiagnosticLogger {
    private static final long MAX_LOG_BYTES = 8L * 1024L * 1024L;
    private static final int MAX_DETAIL_CHARS = 7000;
    private static final Pattern URL_PATTERN = Pattern.compile("(?i)https?://[^\\s\\\"'<>]+");
    private static final Pattern HOST_PATTERN = Pattern.compile("(?i)(?<![A-Za-z0-9_-])(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}(?![A-Za-z0-9_-])");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}");
    private static final Pattern SECRET_PATTERN = Pattern.compile(
            "(?i)(?:bearer\\s+[A-Za-z0-9_\\-+/=]{16,}|eyJ[A-Za-z0-9_\\-]{20,}\\.[A-Za-z0-9_\\-]{8,}\\.[A-Za-z0-9_\\-]{8,}|(?<![A-Za-z0-9])[A-Za-z0-9]{32}(?![A-Za-z0-9]))");
    private static final Pattern CJK_PATTERN = Pattern.compile("[\\u3400-\\u9FFF]{2,}");

    private final Context context;
    private final File directory;
    private final File logFile;
    private final String sessionId;
    private long sequence;

    DiagnosticLogger(Context context) {
        this.context = context.getApplicationContext();
        File root = this.context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (root == null) root = new File(this.context.getFilesDir(), "documents");
        directory = new File(root, "diagnostics");
        if (!directory.exists()) directory.mkdirs();
        logFile = new File(directory, "runtime.jsonl");
        sessionId = shortHash(UUID.randomUUID().toString() + System.nanoTime());
        log("native", "session_start",
                "sdk=" + Build.VERSION.SDK_INT + ",modelHash=" + shortHash(Build.MODEL));
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
        } catch (Throwable ignored) { }
    }

    synchronized void logBridgePayload(String payload) {
        if (payload == null) return;
        String trimmed = payload.length() > 16000 ? payload.substring(0, 16000) : payload;
        try {
            JSONObject source = new JSONObject(trimmed);
            String event = source.optString("event", "bridge_event");
            Object detail = source.opt("detail");
            log("js", event, detail == null ? "" : detail.toString());
        } catch (Throwable error) {
            log("js", "bridge_payload_invalid",
                    "length=" + trimmed.length() + ",hash=" + shortHash(trimmed));
        }
    }

    void logUrl(String category, String event, String url, String detail) {
        log(category, event,
                "url=" + maskUrl(url) +
                        (detail == null || detail.isEmpty() ? "" : "," + detail));
    }

    void logError(String category, String event, Throwable error) {
        String type = error == null ? "unknown" : error.getClass().getSimpleName();
        String message = error == null ? "" : error.getMessage();
        String stack = "";
        if (error != null) {
            StringWriter writer = new StringWriter();
            error.printStackTrace(new PrintWriter(writer));
            stack = writer.toString();
        }
        log(category, event,
                "type=" + safeIdentifier(type) +
                        ",messageHash=" + shortHash(message) +
                        ",stackHash=" + shortHash(stack));
    }

    String instrumentSource(String source) {
        String actual = source == null ? "" : source;
        log("script", "control_source_received",
                "length=" + actual.length() + ",sha256=" + sha256(actual));
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
                    if (file.getName().startsWith("GG-diagnostic-") &&
                            file.getName().endsWith(".zip")) file.delete();
                }
            }
            sequence = 0;
            log("native", "log_cleared", "ok=true");
        } catch (Throwable ignored) { }
    }

    synchronized String summary() {
        return "会话：" + sessionId + "\n记录：" + sequence +
                " 条\n大小：" + logFile.length() +
                " 字节\n隐私：网址、业务文字、凭据和正文均已脱敏";
    }

    synchronized File exportZip() throws Exception {
        log("native", "export_requested", "entries=" + sequence);
        SimpleDateFormat stampFormat = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US);
        stampFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
        File output = new File(directory,
                "GG-diagnostic-" + stampFormat.format(new Date()) + ".zip");
        try (ZipOutputStream zip = new ZipOutputStream(
                new BufferedOutputStream(new FileOutputStream(output)))) {
            addFile(zip, logFile, "runtime.jsonl");
            File previous = new File(directory, "runtime.previous.jsonl");
            if (previous.isFile()) addFile(zip, previous, "runtime.previous.jsonl");
            addText(zip, "summary.txt", summary() + "\ncreatedUtc=" + utcNow() + "\n");
            addText(zip, "PRIVACY.txt",
                    "Structured diagnostic events only.\n" +
                    "Exact URLs, host names, page or business text, request/response bodies, cookies, activation keys and tokens are not recorded.\n" +
                    "URLs, selectors and free-form values are stored only as hashes or shapes.\n");
        }
        return output;
    }

    void share(Activity activity) {
        try {
            File archive = exportZip();
            Uri uri = FileProvider.getUriForFile(
                    activity, activity.getPackageName() + ".diagnostics", archive);
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

    String sessionId() { return sessionId; }

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

    static String maskUrl(String value) {
        if (value == null || value.trim().isEmpty()) return "none";
        try {
            Uri uri = Uri.parse(value);
            String scheme = safeIdentifier(uri.getScheme());
            return (scheme.isEmpty() ? "url" : scheme) + "://HOST#" +
                    shortHash(uri.getHost()) + "/PATH#" +
                    shortHash(uri.getEncodedPath()) +
                    (uri.getQuery() == null ? "" : "?present") +
                    (uri.getFragment() == null ? "" : "#present");
        } catch (Throwable ignored) {
            return "URL#" + shortHash(value);
        }
    }

    private static String sanitize(String input) {
        if (input == null) return "";
        String value = replaceHashed(URL_PATTERN, input, "URL");
        value = replaceHashed(EMAIL_PATTERN, value, "EMAIL");
        value = replaceHashed(HOST_PATTERN, value, "HOST");
        value = replaceHashed(SECRET_PATTERN, value, "SECRET");
        value = CJK_PATTERN.matcher(value).replaceAll("***");
        value = value.replaceAll(
                "(?i)(cookie|authorization|token|licenseKey|scriptBase64|requestBody|responseBody)\\s*[:=]\\s*[^,}\\s]+",
                "$1=***");
        if (value.length() > MAX_DETAIL_CHARS) {
            value = value.substring(0, MAX_DETAIL_CHARS) + "…#" + shortHash(value);
        }
        return value;
    }

    private static String replaceHashed(Pattern pattern, String input, String label) {
        Matcher matcher = pattern.matcher(input);
        StringBuffer output = new StringBuffer();
        while (matcher.find()) {
            matcher.appendReplacement(output,
                    Matcher.quoteReplacement("***" + label + "#" +
                            shortHash(matcher.group()) + "***"));
        }
        matcher.appendTail(output);
        return output.toString();
    }

    private static String safeIdentifier(String value) {
        if (value == null) return "";
        return value.replaceAll("[^A-Za-z0-9_.:/-]", "_")
                .replaceAll("_{2,}", "_");
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte item : digest) builder.append(String.format(Locale.US, "%02x", item));
            return builder.toString();
        } catch (Throwable ignored) {
            return shortHash(value);
        }
    }

    private static String shortHash(String value) {
        String actual = value == null ? "" : value;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(actual.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < 6; i++) {
                builder.append(String.format(Locale.US, "%02x", digest[i]));
            }
            return builder.toString();
        } catch (Throwable ignored) {
            return Integer.toHexString(actual.hashCode());
        }
    }

    private static String utcNow() {
        SimpleDateFormat format = new SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }
}
