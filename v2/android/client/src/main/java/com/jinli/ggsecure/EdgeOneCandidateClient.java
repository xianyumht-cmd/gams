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
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;

/** Dedicated internal-build API. Normal GG releases retain their Cloudflare protocol unchanged. */
final class EdgeOneCandidateClient {
    private static final int MAX_JSON = 64 * 1024;
    private static final int MAX_ZIP = 5_500_000;
    private final DeviceIdentity device;

    EdgeOneCandidateClient(DeviceIdentity device) { this.device = device; }

    JSONObject activate(String key) throws Exception {
        return requestJson("activate", BuildConfig.GG_NATIVE_CORE
                ? nativeRequestBody("activate", key, "")
                : proofBody("activate", key).put("licenseKey", key));
    }

    JSONObject check(String token) throws Exception {
        return requestJson("check", BuildConfig.GG_NATIVE_CORE
                ? nativeRequestBody("check", token, "")
                : proofBody("check", token).put("token", token));
    }

    void unbind(String token) throws Exception {
        requestJson("unbind", BuildConfig.GG_NATIVE_CORE
                ? nativeRequestBody("unbind", token, "")
                : proofBody("unbind", token).put("token", token));
    }

    RuntimePayload loadRuntime(String token, RuntimeZipReader.Listener listener) throws Exception {
        // This ephemeral key exists only for one download and is never stored in the APK or state.
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair deliveryKey = generator.generateKeyPair();
        String deliveryPublicKey = Base64.encodeToString(
                deliveryKey.getPublic().getEncoded(), Base64.NO_WRAP);
        HttpURLConnection connection = connect("runtime", BuildConfig.GG_NATIVE_CORE
                ? nativeRequestBody("runtime-v2", token, deliveryPublicKey)
                : proofBody("runtime-v2", token + "|" + deliveryPublicKey)
                        .put("token", token).put("deliveryPublicKey", deliveryPublicKey));
        byte[] zip = null;
        byte[] encrypted = null;
        try {
            int status = connection.getResponseCode();
            if (status != 200) throwApiError(connection, status);
            if (!"2".equals(connection.getHeaderField("X-GG-Delivery-Version"))) {
                throw new SecurityException("运行包未使用设备专属加密");
            }
            String serverPublicKey = connection.getHeaderField("X-GG-Delivery-Server-Key");
            String deliveryIv = connection.getHeaderField("X-GG-Delivery-Iv");
            if (serverPublicKey == null || serverPublicKey.length() > 300 ||
                    deliveryIv == null || deliveryIv.length() > 64) {
                throw new SecurityException("运行包加密参数缺失");
            }
            String rawManifest = connection.getHeaderField("X-GG-Manifest");
            String expectedHash = connection.getHeaderField("X-GG-Bundle-Sha256");
            if (rawManifest == null || rawManifest.length() > 4096 || expectedHash == null ||
                    !expectedHash.matches("[0-9a-f]{64}")) {
                throw new SecurityException("运行包清单缺失");
            }
            JSONObject manifest = new JSONObject(new String(
                    Base64.decode(rawManifest, Base64.DEFAULT), StandardCharsets.UTF_8));
            int expectedSize = manifest.getInt("size");
            if (expectedSize < 1 || expectedSize > MAX_ZIP) {
                throw new SecurityException("运行包长度无效");
            }
            encrypted = RuntimeZipReader.read(
                    connection.getInputStream(), MAX_ZIP + 16, expectedSize + 16, listener);
            zip = RuntimeDeliveryCrypto.decrypt(encrypted, deliveryKey.getPrivate(),
                    Base64.decode(serverPublicKey, Base64.DEFAULT),
                    Base64.decode(deliveryIv, Base64.DEFAULT), device.deviceId(), token);
            if (zip.length != expectedSize) throw new SecurityException("运行包大小校验失败");
            if (!expectedHash.equals(manifest.getString("sha256")) ||
                    (!BuildConfig.GG_NATIVE_CORE &&
                    !expectedHash.equals(DeviceIdentity.hex(MessageDigest.getInstance("SHA-256").digest(zip))))) {
                throw new SecurityException("运行包完整性校验失败");
            }
            return RuntimePayload.fromZip(zip, manifest);
        } finally {
            if (zip != null) Arrays.fill(zip, (byte) 0);
            if (encrypted != null) Arrays.fill(encrypted, (byte) 0);
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

    /** Native GG: C++ owns the entire EdgeOne request wire shape and policy. */
    private JSONObject nativeRequestBody(String action, String credential,
                                         String deliveryPublicKey) throws Exception {
        long now = System.currentTimeMillis() / 1000L;
        String deviceId = device.deviceId();
        String material = "runtime-v2".equals(action)
                ? credential + "|" + deliveryPublicKey : credential;
        String canonical = NativeRuntimeBridge.proofCanonical(action, now, deviceId, material);
        String signature = device.signRawBase64(canonical);
        return new JSONObject(NativeRuntimeBridge.signedRequestJson(
                action, deviceId, device.publicKeyBase64(), now, signature,
                credential, deliveryPublicKey));
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
        connection.setRequestProperty("Accept", action.equals("runtime")
                ? "application/octet-stream" : "application/json");
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
