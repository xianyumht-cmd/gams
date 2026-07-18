package com.jinli.quickweb;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

final class OnlineLicenseManager {
    private static final String API_BASE = "https://gams-license-api.2320006072.workers.dev";
    private static final String PREFS = "license_state";
    private static final String PREF_KEY = "license_key";
    private static final String PREF_TOKEN = "online_session_token";
    private static final String PREF_LAST_SUCCESS = "online_last_success_ms";
    private static final String PREF_EXPIRES_AT = "online_license_expires_at";
    private static final String PREF_PERMANENT = "online_license_permanent";
    private static final String PREF_INSTALL_ID = "online_install_id";
    private static final long DEFAULT_OFFLINE_GRACE_MS = 24L * 60L * 60L * 1000L;
    private static final int APP_VERSION_CODE = 3;
    private static final int MAX_RESPONSE_BYTES = 64 * 1024;

    private final Context context;
    private final SharedPreferences preferences;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    OnlineLicenseManager(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    void validateSavedAsync(ResultCallback callback) {
        String key = preferences.getString(PREF_KEY, "");
        String token = preferences.getString(PREF_TOKEN, "");
        if (normalizeKey(key).length() != 32) {
            deliver(callback, Result.invalid("请输入卡密"));
            return;
        }
        if (token.isEmpty()) {
            activateAsync(key, callback);
            return;
        }
        executor.execute(() -> {
            try {
                JSONObject request = new JSONObject()
                        .put("token", token)
                        .put("deviceId", deviceId())
                        .put("appVersion", APP_VERSION_CODE);
                Result result = parseServerResult(post("/v1/check", request));
                if (result.valid) saveSuccess(key, result);
                else clearSessionOnly();
                deliver(callback, result);
            } catch (IOException networkError) {
                deliver(callback, offlineFallback(networkError));
            } catch (Exception error) {
                deliver(callback, Result.invalid(safeMessage(error, "授权验证失败")));
            }
        });
    }

    void activateAsync(String rawKey, ResultCallback callback) {
        String key = normalizeKey(rawKey);
        if (key.length() != 32) {
            deliver(callback, Result.invalid("卡密必须是 32 位"));
            return;
        }
        executor.execute(() -> {
            try {
                JSONObject request = new JSONObject()
                        .put("licenseKey", key)
                        .put("deviceId", deviceId())
                        .put("deviceLabel", deviceLabel())
                        .put("appVersion", APP_VERSION_CODE);
                Result result = parseServerResult(post("/v1/activate", request));
                if (result.valid) saveSuccess(key, result);
                deliver(callback, result);
            } catch (IOException error) {
                deliver(callback, Result.invalid("无法连接授权服务器，请检查网络后重试"));
            } catch (Exception error) {
                deliver(callback, Result.invalid(safeMessage(error, "卡密验证失败")));
            }
        });
    }

    String getSavedKey() {
        return normalizeKey(preferences.getString(PREF_KEY, ""));
    }

    String getStatusSummary() {
        boolean permanent = preferences.getBoolean(PREF_PERMANENT, false);
        long expiresAt = preferences.getLong(PREF_EXPIRES_AT, 0L);
        long lastSuccess = preferences.getLong(PREF_LAST_SUCCESS, 0L);
        String expiry = permanent ? "永久有效" : (expiresAt > 0 ? formatTimestamp(expiresAt) : "未知");
        String last = lastSuccess > 0 ? formatMillis(lastSuccess) : "尚未联网验证";
        return "授权状态：" + expiry + "\n最近验证：" + last;
    }

    void clear() {
        preferences.edit()
                .remove(PREF_KEY)
                .remove(PREF_TOKEN)
                .remove(PREF_LAST_SUCCESS)
                .remove(PREF_EXPIRES_AT)
                .remove(PREF_PERMANENT)
                .apply();
    }

    void shutdown() {
        executor.shutdownNow();
    }

    private Result offlineFallback(IOException error) {
        long lastSuccess = preferences.getLong(PREF_LAST_SUCCESS, 0L);
        long elapsed = System.currentTimeMillis() - lastSuccess;
        if (lastSuccess > 0 && elapsed >= 0 && elapsed <= DEFAULT_OFFLINE_GRACE_MS) {
            boolean permanent = preferences.getBoolean(PREF_PERMANENT, false);
            long expiresAt = preferences.getLong(PREF_EXPIRES_AT, 0L);
            long nowSeconds = System.currentTimeMillis() / 1000L;
            if (permanent || expiresAt == 0L || expiresAt > nowSeconds) {
                return Result.offline(permanent, expiresAt,
                        "当前网络不可用，已使用上次联网验证结果");
            }
        }
        return Result.invalid("无法连接授权服务器，请联网后重试");
    }

    private Result parseServerResult(HttpResult response) throws Exception {
        JSONObject object = new JSONObject(response.body);
        if (!response.success || !object.optBoolean("ok", false)) {
            return Result.invalid(object.optString("message", "授权验证失败"));
        }
        String token = object.optString("token", "");
        boolean permanent = object.optBoolean("permanent", false);
        long expiresAt = object.isNull("licenseExpiresAt") ? 0L : object.optLong("licenseExpiresAt", 0L);
        return Result.valid(token, permanent, expiresAt,
                permanent ? "永久卡密验证成功" : "卡密验证成功，到期时间：" + formatTimestamp(expiresAt));
    }

    private void saveSuccess(String key, Result result) {
        preferences.edit()
                .putString(PREF_KEY, normalizeKey(key))
                .putString(PREF_TOKEN, result.token)
                .putLong(PREF_LAST_SUCCESS, System.currentTimeMillis())
                .putLong(PREF_EXPIRES_AT, result.expiresAt)
                .putBoolean(PREF_PERMANENT, result.permanent)
                .apply();
    }

    private void clearSessionOnly() {
        preferences.edit().remove(PREF_TOKEN).apply();
    }

    private HttpResult post(String path, JSONObject body) throws IOException {
        URL url = new URL(API_BASE + path);
        HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(9000);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setUseCaches(false);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "QuickWeb/3 Android");
        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(payload.length);
        try {
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }
            int status = connection.getResponseCode();
            InputStream input = status >= 200 && status < 300
                    ? connection.getInputStream() : connection.getErrorStream();
            String response = input == null ? "{}" : new String(readLimited(input), StandardCharsets.UTF_8);
            return new HttpResult(status >= 200 && status < 300, response);
        } finally {
            connection.disconnect();
        }
    }

    private byte[] readLimited(InputStream input) throws IOException {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int total = 0;
            int read;
            while ((read = source.read(buffer)) != -1) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) throw new IOException("服务器响应过大");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private String deviceId() throws Exception {
        String installId = preferences.getString(PREF_INSTALL_ID, "");
        if (installId.isEmpty()) {
            installId = UUID.randomUUID().toString();
            preferences.edit().putString(PREF_INSTALL_ID, installId).commit();
        }
        String androidId = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
        String material = context.getPackageName() + "|" + String.valueOf(androidId) + "|" + installId;
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(material.getBytes(StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder(64);
        for (byte value : digest) out.append(String.format(Locale.ROOT, "%02x", value & 0xFF));
        return out.toString();
    }

    private String deviceLabel() {
        String label = (Build.MANUFACTURER + " " + Build.MODEL).trim();
        return label.length() > 100 ? label.substring(0, 100) : label;
    }

    static String normalizeKey(String input) {
        if (input == null) return "";
        return input.replaceAll("[^0-9A-Fa-f]", "").toUpperCase(Locale.ROOT);
    }

    private void deliver(ResultCallback callback, Result result) {
        if (callback != null) mainHandler.post(() -> callback.onResult(result));
    }

    private static String formatTimestamp(long seconds) {
        if (seconds <= 0) return "未知";
        return formatMillis(seconds * 1000L);
    }

    private static String formatMillis(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault());
        format.setTimeZone(TimeZone.getDefault());
        return format.format(new Date(millis));
    }

    private static String safeMessage(Exception error, String fallback) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? fallback : message;
    }

    interface ResultCallback {
        void onResult(Result result);
    }

    static final class Result {
        final boolean valid;
        final boolean offline;
        final boolean permanent;
        final long expiresAt;
        final String token;
        final String message;

        private Result(boolean valid, boolean offline, boolean permanent,
                       long expiresAt, String token, String message) {
            this.valid = valid;
            this.offline = offline;
            this.permanent = permanent;
            this.expiresAt = expiresAt;
            this.token = token == null ? "" : token;
            this.message = message == null ? "" : message;
        }

        static Result valid(String token, boolean permanent, long expiresAt, String message) {
            return new Result(true, false, permanent, expiresAt, token, message);
        }

        static Result offline(boolean permanent, long expiresAt, String message) {
            return new Result(true, true, permanent, expiresAt, "", message);
        }

        static Result invalid(String message) {
            return new Result(false, false, false, 0L, "", message);
        }
    }

    private static final class HttpResult {
        final boolean success;
        final String body;

        HttpResult(boolean success, String body) {
            this.success = success;
            this.body = body;
        }
    }
}
