package com.jinli.ggsecure.manager;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

final class AdminApiManager {
    private static final String PREFS = "gg_admin_state_v3";
    private static final String PREF_TOKEN = "token";
    private static final String PREF_EXPIRES = "expires";
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int READ_TIMEOUT_MS = 12000;

    private final SharedPreferences preferences;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    AdminApiManager(Context context) {
        preferences = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    boolean hasSession() {
        return !preferences.getString(PREF_TOKEN, "").isEmpty()
                && preferences.getLong(PREF_EXPIRES, 0L) > System.currentTimeMillis() / 1000L + 60L;
    }

    void login(String password, Callback callback) {
        callPost("/v1/admin/login", new J().put("password", password), false, result -> {
            if (result.success) {
                preferences.edit()
                        .putString(PREF_TOKEN, result.data.optString("token", ""))
                        .putLong(PREF_EXPIRES, result.data.optLong("expiresAt", 0L))
                        .apply();
            }
            callback.onResult(result);
        });
    }

    void get(String path, Callback callback) {
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

    void post(String path, JSONObject body, Callback callback) {
        callPost(path, body == null ? new J() : body, true, callback);
    }

    void logout() {
        preferences.edit().clear().apply();
    }

    void shutdown() {
        executor.shutdownNow();
    }

    private void callPost(String path, JSONObject body, boolean authorized, Callback callback) {
        executor.execute(() -> {
            try {
                String authorization = authorized ? authorization() : "";
                ResilientApiTransport.Response response = ResilientApiTransport.post(
                        path, body.toString(), "GG-Admin/7 Android", authorization, MAX_BYTES);
                JSONObject object = parseJson(response.body);
                if (response.status == 401) throw new UnauthorizedException();
                deliver(callback, parse(object, response.status));
            } catch (UnauthorizedException error) {
                logout();
                deliver(callback, Result.unauthorized("管理登录已失效，请重新登录"));
            } catch (Exception error) {
                deliver(callback, Result.error(message(error, "操作失败")));
            }
        });
    }

    private JSONObject getJson(String path, String authorization) throws Exception {
        List<String> errors = new ArrayList<>();
        for (String host : new String[]{RuntimeNames.customHost(), RuntimeNames.workerHost()}) {
            HttpsURLConnection connection = null;
            try {
                connection = (HttpsURLConnection) new URL("https://" + host + path).openConnection();
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setRequestMethod("GET");
                connection.setUseCaches(false);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("User-Agent", "GG-Admin/7 Android");
                connection.setRequestProperty("Authorization", authorization);
                int status = connection.getResponseCode();
                if (status == 401) throw new UnauthorizedException();
                InputStream stream = status >= 200 && status < 400
                        ? connection.getInputStream() : connection.getErrorStream();
                String body = stream == null ? "{}" : new String(readLimited(stream), StandardCharsets.UTF_8);
                JSONObject object = parseJson(body);
                if (status >= 200 && status < 300) return object;
                String code = object.optString("code", "HTTP " + status);
                errors.add(host + ": " + code);
            } catch (UnauthorizedException error) {
                throw error;
            } catch (Exception error) {
                errors.add(host + ": " + message(error, "连接失败"));
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
        throw new IOException(errors.isEmpty() ? "没有可用连接通道" : join(errors));
    }
    private String authorization() throws UnauthorizedException {
        String token = preferences.getString(PREF_TOKEN, "");
        long expires = preferences.getLong(PREF_EXPIRES, 0L);
        if (token.isEmpty() || expires <= System.currentTimeMillis() / 1000L + 30L) {
            throw new UnauthorizedException();
        }
        return "Bearer " + token;
    }

    private Result parse(JSONObject object, int status) {
        boolean ok = object.optBoolean("ok", status >= 200 && status < 300);
        if (!ok || status < 200 || status >= 300) {
            return Result.error(object.optString("message", "操作失败"));
        }
        return Result.success(object);
    }

    private static JSONObject parseJson(String text) throws Exception {
        return new JSONObject(text == null || text.trim().isEmpty() ? "{}" : text);
    }

    private byte[] readLimited(InputStream input) throws IOException {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = source.read(buffer)) != -1) {
                total += read;
                if (total > MAX_BYTES) throw new IOException("服务器响应过大");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private void deliver(Callback callback, Result result) {
        if (callback != null) mainHandler.post(() -> callback.onResult(result));
    }

    private static String message(Exception error, String fallback) {
        String value = error.getMessage();
        return value == null || value.trim().isEmpty() ? fallback : value;
    }

    private static String join(List<String> values) {
        StringBuilder output = new StringBuilder();
        for (String value : values) {
            if (output.length() > 0) output.append("；");
            output.append(value);
        }
        return output.toString();
    }

    interface Callback {
        void onResult(Result result);
    }

    static final class Result {
        final boolean success;
        final boolean unauthorized;
        final String message;
        final JSONObject data;

        private Result(boolean success, boolean unauthorized, String message, JSONObject data) {
            this.success = success;
            this.unauthorized = unauthorized;
            this.message = message == null ? "" : message;
            this.data = data == null ? new J() : data;
        }

        static Result success(JSONObject data) {
            return new Result(true, false, "操作成功", data);
        }

        static Result error(String message) {
            return new Result(false, false, message, new J());
        }

        static Result unauthorized(String message) {
            return new Result(false, true, message, new J());
        }
    }

    private static final class UnauthorizedException extends Exception {
    }
}
