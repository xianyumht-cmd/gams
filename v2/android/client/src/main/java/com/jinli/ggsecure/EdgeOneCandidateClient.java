package com.jinli.ggsecure;

import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;

/** Dedicated internal-build API. Normal GG releases retain their Cloudflare protocol unchanged. */
final class EdgeOneCandidateClient {
    private static final int MAX_JSON = 64 * 1024;
    private static final int MAX_ZIP = 5_500_000;
    private final DeviceIdentity device;

    EdgeOneCandidateClient(DeviceIdentity device) { this.device = device; }

    JSONObject activate(String key) throws Exception {
        return requestJson("activate", proofBody("activate", key).put("licenseKey", key));
    }

    JSONObject check(String token) throws Exception {
        return requestJson("check", proofBody("check", token).put("token", token));
    }

    void unbind(String token) throws Exception {
        requestJson("unbind", proofBody("unbind", token).put("token", token));
    }

    RuntimePayload loadRuntime(String token) throws Exception {
        HttpURLConnection connection = connect("runtime", proofBody("runtime", token).put("token", token));
        byte[] zip = null;
        try {
            int status = connection.getResponseCode();
            if (status != 200) throwApiError(connection, status);
            String rawManifest = connection.getHeaderField("X-GG-Manifest");
            String expectedHash = connection.getHeaderField("X-GG-Bundle-Sha256");
            if (rawManifest == null || rawManifest.length() > 4096 || expectedHash == null ||
                    !expectedHash.matches("[0-9a-f]{64}")) {
                throw new SecurityException("运行包清单缺失");
            }
            JSONObject manifest = new JSONObject(new String(
                    Base64.decode(rawManifest, Base64.DEFAULT), StandardCharsets.UTF_8));
            zip = readLimited(connection.getInputStream(), MAX_ZIP);
            if (zip.length != manifest.getInt("size") ||
                    !expectedHash.equals(manifest.getString("sha256")) ||
                    !expectedHash.equals(DeviceIdentity.hex(MessageDigest.getInstance("SHA-256").digest(zip)))) {
                throw new SecurityException("运行包完整性校验失败");
            }
            return RuntimePayload.fromZip(zip, manifest);
        } finally {
            if (zip != null) Arrays.fill(zip, (byte) 0);
            connection.disconnect();
        }
    }

    private JSONObject proofBody(String action, String material) throws Exception {
        long now = System.currentTimeMillis() / 1000L;
        String deviceId = device.deviceId();
        String canonical = action + "\n" + now + "\n" + deviceId + "\n" +
                DeviceIdentity.sha256Hex(material);
        return new JSONObject()
                .put("deviceId", deviceId)
                .put("devicePublicKey", device.publicKeyBase64())
                .put("requestTime", now)
                .put("proof", device.signRawBase64(canonical));
    }

    private JSONObject requestJson(String action, JSONObject body) throws Exception {
        HttpURLConnection connection = connect(action, body);
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throwApiError(connection, status);
            return new JSONObject(new String(readLimited(connection.getInputStream(), MAX_JSON), StandardCharsets.UTF_8));
        } finally {
            connection.disconnect();
        }
    }

    private HttpURLConnection connect(String action, JSONObject body) throws Exception {
        String base = BuildConfig.EDGEONE_BASE_URL;
        if (base == null || !base.startsWith("https://") || base.length() < 12) {
            throw new ApiError("内部测试包尚未配置 EdgeOne 地址");
        }
        URL url = new URL(base + "/api/" + action);
        if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null) {
            throw new SecurityException("授权服务地址无效");
        }
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(7000);
        // The private runtime ZIP is ~5 MB and Makers Functions can take up to 120 s.
        // Keep interactive license requests responsive; only the runtime download waits longer.
        connection.setReadTimeout("runtime".equals(action) ? 135000 : 25000);
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Accept", action.equals("runtime") ? "application/zip" : "application/json");
        connection.setRequestProperty("Cache-Control", "no-store");
        byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
        if (data.length > 8192) throw new IOException("授权请求过大");
        connection.setFixedLengthStreamingMode(data.length);
        try (OutputStream output = connection.getOutputStream()) { output.write(data); }
        return connection;
    }

    private void throwApiError(HttpURLConnection connection, int status) throws Exception {
        InputStream error = connection.getErrorStream();
        if (error != null) {
            try {
                JSONObject response = new JSONObject(new String(readLimited(error, MAX_JSON), StandardCharsets.UTF_8));
                String message = response.optString("message", "授权失败");
                throw new ApiError(response.optString("code", "request_failed"),
                        message.length() > 100 ? message.substring(0, 100) : message);
            } catch (org.json.JSONException ignored) { }
        }
        throw new ApiError("http_error", "授权服务 HTTP " + status);
    }

    private static byte[] readLimited(InputStream input, int limit) throws IOException {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = source.read(buffer)) >= 0) {
                if (n == 0) continue;
                if (output.size() > limit - n) throw new IOException("云端响应超过大小限制");
                output.write(buffer, 0, n);
            }
            return output.toByteArray();
        }
    }

    static final class ApiError extends Exception {
        final String code;
        ApiError(String message) { this("not_configured", message); }
        ApiError(String code, String message) { super(message); this.code = code; }
    }
}
