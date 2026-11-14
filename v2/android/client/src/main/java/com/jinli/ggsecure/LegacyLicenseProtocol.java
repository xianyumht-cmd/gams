package com.jinli.ggsecure;

import org.json.JSONObject;

/**
 * The original license-server protocol, retained for non-EdgeOne builds.
 *
 * Keep its canonical signed fields, paths, and appVersion stable while the
 * EdgeOne candidate uses its separate client and native authorization flow.
 */
final class LegacyLicenseProtocol {
    static final int APP_VERSION = 12;
    private static final int MAX_JSON_BYTES = 256 * 1024;

    private final DeviceIdentity identity;

    LegacyLicenseProtocol(DeviceIdentity identity) {
        this.identity = identity;
    }

    JSONObject activate(String key) throws Exception {
        String deviceId = identity.deviceId();
        String publicKey = identity.publicKeyBase64();
        String label = identity.deviceLabel();
        String payloadHash = DeviceIdentity.sha256Hex(key + "|" + publicKey + "|" + label);
        JSONObject body = signedLicenseBody("activate", payloadHash, deviceId);
        body.put("licenseKey", key);
        body.put("publicKey", publicKey);
        body.put("deviceLabel", label);
        return postLicense("/v1/activate", body);
    }

    JSONObject check(String token) throws Exception {
        String deviceId = identity.deviceId();
        JSONObject body = signedLicenseBody("check", DeviceIdentity.sha256Hex(token), deviceId);
        body.put("token", token);
        return postLicense("/v1/check", body);
    }

    void unbind(String token) throws Exception {
        String deviceId = identity.deviceId();
        JSONObject body = signedLicenseBody(
                "unbind", DeviceIdentity.sha256Hex(token + "|unbind"), deviceId);
        body.put("token", token);
        postLicense("/v1/device/unbind", body);
    }

    JSONObject signedRuntimeAccessBody(String deviceId, String token, String nonce,
                                       long timestamp, String payloadHash,
                                       String runtimePublicKey, String runtimeFingerprint)
            throws Exception {
        String keyFingerprint = identity.keyFingerprint();
        String certificate = identity.certificateDigest();
        DeviceIdentity.Risk risk = identity.risk();
        String canonical = "runtime\n" + nonce + "\n" + timestamp + "\n" + deviceId + "\n" +
                keyFingerprint + "\n" + APP_VERSION + "\n" + certificate + "\n" + payloadHash;
        return new JSONObject()
                .put("purpose", "runtime")
                .put("nonce", nonce)
                .put("timestamp", timestamp)
                .put("deviceId", deviceId)
                .put("keyFingerprint", keyFingerprint)
                .put("certificateDigest", certificate)
                .put("payloadHash", payloadHash)
                .put("riskFlags", risk.flags)
                .put("appVersion", APP_VERSION)
                .put("signature", identity.signRawBase64(canonical))
                .put("token", token)
                .put("runtimePublicKey", runtimePublicKey)
                .put("runtimeKeyFingerprint", runtimeFingerprint);
    }

    JSONObject postRuntime(String path, JSONObject body) throws Exception {
        RuntimeTransport.Response response = RuntimeTransport.postJson(
                path, body.toString(), MAX_JSON_BYTES);
        JSONObject object;
        try {
            object = new JSONObject(response.bodyText());
        } catch (Exception error) {
            throw new java.io.IOException("运行服务响应无效", error);
        }
        if (response.status < 200 || response.status >= 300 || !object.optBoolean("ok", false)) {
            throw apiError(object, response.status);
        }
        return object;
    }

    private JSONObject signedLicenseBody(String purpose, String payloadHash, String deviceId)
            throws Exception {
        JSONObject challengeRequest = new JSONObject()
                .put("deviceId", deviceId)
                .put("purpose", purpose)
                .put("appVersion", APP_VERSION);
        JSONObject challenge = postLicense("/v1/challenge", challengeRequest);
        String nonce = challenge.getString("nonce");
        long timestamp = challenge.getLong("serverTime");
        String fingerprint = identity.keyFingerprint();
        String certificate = identity.certificateDigest();
        DeviceIdentity.Risk risk = identity.risk();
        String canonical = purpose + "\n" + nonce + "\n" + timestamp + "\n" + deviceId + "\n" +
                fingerprint + "\n" + APP_VERSION + "\n" + certificate + "\n" + payloadHash;
        return new JSONObject()
                .put("purpose", purpose)
                .put("nonce", nonce)
                .put("timestamp", timestamp)
                .put("deviceId", deviceId)
                .put("keyFingerprint", fingerprint)
                .put("certificateDigest", certificate)
                .put("payloadHash", payloadHash)
                .put("riskFlags", risk.flags)
                .put("appVersion", APP_VERSION)
                .put("signature", identity.signRawBase64(canonical));
    }

    private JSONObject postLicense(String path, JSONObject body) throws Exception {
        ResilientApiTransport.Response response = ResilientApiTransport.post(
                path, body.toString(), "GG-V2/1 Android", "", MAX_JSON_BYTES);
        JSONObject object;
        try {
            object = new JSONObject(response.body);
        } catch (Exception error) {
            throw new java.io.IOException("授权服务响应无效", error);
        }
        if (response.status < 200 || response.status >= 300 || !object.optBoolean("ok", false)) {
            throw apiError(object, response.status);
        }
        return object;
    }

    private static ApiException apiError(JSONObject object, int status) {
        return new ApiException(status, object.optString("code", "request_failed"),
                object.optString("message", "操作失败"));
    }

    static final class ApiException extends Exception {
        final int status;
        final String code;

        ApiException(int status, String code, String message) {
            super(message);
            this.status = status;
            this.code = code == null ? "request_failed" : code;
        }
    }
}
