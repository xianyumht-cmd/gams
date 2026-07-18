package com.jinli.keygen;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

final class AdminApiManager {
    private static final String API_BASE = "https://gams-license-api.2320006072.workers.dev";
    private static final String PREFS = "online_admin_state";
    private static final String PREF_TOKEN = "admin_token";
    private static final String PREF_TOKEN_EXPIRES = "admin_token_expires";
    private static final int MAX_RESPONSE_BYTES = 256 * 1024;

    private final SharedPreferences preferences;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    AdminApiManager(Context context) {
        preferences = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    boolean hasSession() {
        return !preferences.getString(PREF_TOKEN, "").isEmpty()
                && preferences.getLong(PREF_TOKEN_EXPIRES, 0L) > System.currentTimeMillis() / 1000L + 60L;
    }

    void login(String password, Callback callback) {
        executor.execute(() -> {
            try {
                JSONObject response = post("/v1/admin/login",
                        new JSONObject().put("password", password), false);
                if (!response.optBoolean("ok", false)) {
                    deliver(callback, Result.error(response.optString("message", "登录失败")));
                    return;
                }
                preferences.edit()
                        .putString(PREF_TOKEN, response.getString("token"))
                        .putLong(PREF_TOKEN_EXPIRES, response.optLong("expiresAt", 0L))
                        .apply();
                deliver(callback, Result.success("登录成功", new ArrayList<>()));
            } catch (Exception error) {
                deliver(callback, Result.error(message(error, "无法连接授权服务器")));
            }
        });
    }

    void createLicenses(int durationDays, int count, int maxDevices, String note, Callback callback) {
        executor.execute(() -> {
            try {
                JSONObject request = new JSONObject()
                        .put("durationDays", durationDays)
                        .put("count", count)
                        .put("maxDevices", maxDevices)
                        .put("note", note == null ? "" : note);
                JSONObject response = post("/v1/admin/licenses/create", request, true);
                if (!response.optBoolean("ok", false)) {
                    deliver(callback, Result.error(response.optString("message", "生成失败")));
                    return;
                }
                JSONArray array = response.getJSONArray("licenses");
                List<LicenseItem> items = new ArrayList<>();
                for (int i = 0; i < array.length(); i++) {
                    JSONObject item = array.getJSONObject(i);
                    items.add(new LicenseItem(
                            item.getString("key"),
                            item.isNull("expiresAt") ? 0L : item.optLong("expiresAt", 0L),
                            item.optInt("maxDevices", maxDevices)
                    ));
                }
                deliver(callback, Result.success("已生成 " + items.size() + " 个在线卡密", items));
            } catch (UnauthorizedException error) {
                logout();
                deliver(callback, Result.unauthorized("管理登录已失效，请重新登录"));
            } catch (Exception error) {
                deliver(callback, Result.error(message(error, "生成失败")));
            }
        });
    }

    void action(String licenseKey, String action, int days, Callback callback) {
        executor.execute(() -> {
            try {
                JSONObject request = new JSONObject()
                        .put("licenseKey", normalizeKey(licenseKey))
                        .put("action", action);
                if ("extend".equals(action)) request.put("days", days);
                JSONObject response = post("/v1/admin/licenses/action", request, true);
                if (!response.optBoolean("ok", false)) {
                    deliver(callback, Result.error(response.optString("message", "操作失败")));
                    return;
                }
                deliver(callback, Result.success("操作成功", new ArrayList<>()));
            } catch (UnauthorizedException error) {
                logout();
                deliver(callback, Result.unauthorized("管理登录已失效，请重新登录"));
            } catch (Exception error) {
                deliver(callback, Result.error(message(error, "操作失败")));
            }
        });
    }

    void logout() {
        preferences.edit().clear().apply();
    }

    void shutdown() {
        executor.shutdownNow();
    }

    private JSONObject post(String path, JSONObject body, boolean authorized) throws Exception {
        URL url = new URL(API_BASE + path);
        HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(10000);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setUseCaches(false);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "CardKeyAdmin/2 Android");
        if (authorized) {
            String token = preferences.getString(PREF_TOKEN, "");
            if (token.isEmpty()) throw new UnauthorizedException();
            connection.setRequestProperty("Authorization", "Bearer " + token);
        }
        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(payload.length);
        try {
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }
            int status = connection.getResponseCode();
            InputStream input = status >= 200 && status < 300
                    ? connection.getInputStream() : connection.getErrorStream();
            String text = input == null ? "{}" : new String(readLimited(input), StandardCharsets.UTF_8);
            if (status == 401) throw new UnauthorizedException();
            return new JSONObject(text);
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

    private void deliver(Callback callback, Result result) {
        if (callback != null) mainHandler.post(() -> callback.onResult(result));
    }

    static String normalizeKey(String input) {
        return input == null ? "" : input.replaceAll("[^0-9A-Fa-f]", "").toUpperCase(Locale.ROOT);
    }

    private static String message(Exception error, String fallback) {
        String text = error.getMessage();
        return text == null || text.trim().isEmpty() ? fallback : text;
    }

    interface Callback {
        void onResult(Result result);
    }

    static final class LicenseItem {
        final String key;
        final long expiresAt;
        final int maxDevices;

        LicenseItem(String key, long expiresAt, int maxDevices) {
            this.key = key;
            this.expiresAt = expiresAt;
            this.maxDevices = maxDevices;
        }
    }

    static final class Result {
        final boolean success;
        final boolean unauthorized;
        final String message;
        final List<LicenseItem> licenses;

        private Result(boolean success, boolean unauthorized, String message, List<LicenseItem> licenses) {
            this.success = success;
            this.unauthorized = unauthorized;
            this.message = message;
            this.licenses = licenses;
        }

        static Result success(String message, List<LicenseItem> licenses) {
            return new Result(true, false, message, licenses);
        }

        static Result error(String message) {
            return new Result(false, false, message, new ArrayList<>());
        }

        static Result unauthorized(String message) {
            return new Result(false, true, message, new ArrayList<>());
        }
    }

    private static final class UnauthorizedException extends Exception {
    }
}
