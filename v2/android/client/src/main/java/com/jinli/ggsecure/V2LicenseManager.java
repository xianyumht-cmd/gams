package com.jinli.ggsecure;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class V2LicenseManager {
    private static final int PROTOCOL_APP_VERSION = 12;
    private static final int MAX_JSON_BYTES = 256 * 1024;
    private static final int MAX_BUNDLE_BYTES = 18 * 1024 * 1024;
    private static final String RELEASE_PUBLIC_KEY_DER_BASE64 =
            "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEfe3MtnU9YdnqKeTRhWUR8/krK8G52hi0hueAFVzCQLyTlC12pirRXlVSKskUsZWtN4IpHmsdNmc9BhfdGsZIww==";

    private final SecureStore secureStore;
    private final DeviceIdentity identity;
    private final RuntimeKeyManager runtimeKeyManager;
    private final EdgeOneCandidateClient edgeOneCandidateClient;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object authStateLock = new Object();
    private final StartupGate startupGate = new StartupGate();

    V2LicenseManager(Context context) {
        Context app = context.getApplicationContext();
        secureStore = new SecureStore(app);
        identity = new DeviceIdentity(app, secureStore);
        runtimeKeyManager = new RuntimeKeyManager();
        edgeOneCandidateClient = BuildConfig.EDGEONE_CANDIDATE
                ? new EdgeOneCandidateClient(identity) : null;
    }

    boolean hasSavedKey() {
        return normalizedClientKey(secureStore.loadState().optString("licenseKey", "")).length() == 32;
    }

    void initializeSavedAsync(RuntimeCallback callback) {
        initializeSavedAsync(callback, null);
    }

    void initializeSavedAsync(RuntimeCallback callback, TransferProgressCallback progress) {
        final long ticket = beginOperation();
        executor.execute(() -> {
            if (!startupGate.isCurrent(ticket)) return;
            try {
                JSONObject state = secureStore.loadState();
                String key = normalizedClientKey(state.optString("licenseKey", ""));
                String token = state.optString("token", "");
                int savedPlan = BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE
                        ? NativeRuntimeBridge.authorizationStart(key, token, false)
                        : key.length() != 32 ? 0 : token.isEmpty() ? 1 : 2;
                if (savedPlan == 0) {
                    deliver(callback, RuntimeResult.invalid("请输入激活码"), ticket);
                    return;
                }
                AuthResult auth;
                if (savedPlan == 1) {
                    auth = activate(key);
                } else {
                    try {
                        auth = check(token);
                    } catch (ApiException error) {
                        if ("bad_session".equals(error.code) || "device_unbound".equals(error.code)) {
                            auth = activate(key);
                        } else {
                            throw error;
                        }
                    } catch (EdgeOneCandidateClient.ApiError error) {
                        if (BuildConfig.EDGEONE_CANDIDATE &&
                                (BuildConfig.GG_NATIVE_CORE
                                        ? NativeRuntimeBridge.shouldReactivate(error.code)
                                        : "bad_session".equals(error.code) ||
                                                "device_unbound".equals(error.code))) {
                            auth = activate(key);
                        } else {
                            throw error;
                        }
                    }
                }
                deliver(callback, finishAuthorizedStartup(key, auth, progress, ticket), ticket);
            } catch (java.io.IOException error) {
                deliver(callback, RuntimeResult.invalid("需要联网启动，请检查网络后重试"), ticket);
            } catch (ApiException error) {
                deliver(callback, RuntimeResult.invalid(userMessage(error)), ticket);
            } catch (EdgeOneCandidateClient.ApiError error) {
                deliver(callback, RuntimeResult.invalid(error.getMessage()), ticket);
            } catch (Exception error) {
                if (BuildConfig.EDGEONE_CANDIDATE) {
                    android.util.Log.e("GG-EdgeOne", "Saved startup failed", error);
                }
                deliver(callback, RuntimeResult.invalid("启动失败，请重试"), ticket);
            }
        });
    }

    void activateAsync(String rawKey, RuntimeCallback callback) {
        activateAsync(rawKey, callback, null);
    }

    void activateAsync(String rawKey, RuntimeCallback callback, TransferProgressCallback progress) {
        final long ticket = beginOperation();
        String key = normalizedClientKey(rawKey);
        if ((BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE
                ? NativeRuntimeBridge.authorizationStart(key, "", true) == 0 : key.length() != 32)) {
            deliver(callback, RuntimeResult.invalid("激活码格式错误"), ticket);
            return;
        }
        executor.execute(() -> {
            if (!startupGate.isCurrent(ticket)) return;
            try {
                AuthResult auth = activate(key);
                deliver(callback, finishAuthorizedStartup(key, auth, progress, ticket), ticket);
            } catch (java.io.IOException error) {
                deliver(callback, RuntimeResult.invalid("服务连接失败，请检查网络后重试"), ticket);
            } catch (ApiException error) {
                deliver(callback, RuntimeResult.invalid(userMessage(error)), ticket);
            } catch (EdgeOneCandidateClient.ApiError error) {
                deliver(callback, RuntimeResult.invalid(error.getMessage()), ticket);
            } catch (Exception error) {
                if (BuildConfig.EDGEONE_CANDIDATE) {
                    android.util.Log.e("GG-EdgeOne", "Activation/startup failed", error);
                }
                deliver(callback, RuntimeResult.invalid("启动失败，请重试"), ticket);
            }
        });
    }

    void selfUnbindAsync(SimpleCallback callback) {
        final long ticket = beginOperation();
        executor.execute(() -> {
            if (!startupGate.isCurrent(ticket)) return;
            try {
                JSONObject state = secureStore.loadState();
                String token = state.optString("token", "");
                if (token.isEmpty()) throw new ApiException(401, "bad_session", "服务状态已失效");
                if (BuildConfig.EDGEONE_CANDIDATE) {
                    edgeOneCandidateClient.unbind(token);
                    clearAfterUnbind(ticket);
                    deliver(callback, SimpleResult.success("当前设备已解除绑定"), ticket);
                    return;
                }
                String deviceId = identity.deviceId();
                JSONObject body = signedLicenseBody(
                        "unbind", DeviceIdentity.sha256Hex(token + "|unbind"), deviceId);
                body.put("token", token);
                postLicense("/v1/device/unbind", body);
                clearAfterUnbind(ticket);
                deliver(callback, SimpleResult.success("当前设备已解除绑定"), ticket);
            } catch (Exception error) {
                if (error instanceof ApiException) {
                    deliver(callback, SimpleResult.failure(userMessage((ApiException) error)), ticket);
                } else if (error instanceof EdgeOneCandidateClient.ApiError) {
                    deliver(callback, SimpleResult.failure(error.getMessage()), ticket);
                } else {
                    deliver(callback, SimpleResult.failure("更换设备失败，请重试"), ticket);
                }
            }
        });
    }

    String getStatusSummary() {
        JSONObject state = secureStore.loadState();
        boolean permanent = state.optBoolean("permanent", false);
        long expiresAt = state.optLong("licenseExpiresAt", 0L);
        String validity = permanent ? "永久有效" : expiresAt > 0 ? formatSeconds(expiresAt) : "等待验证";
        return "有效期：" + validity + "\n版本：2.0.2";
    }

    void clear() {
        synchronized (authStateLock) {
            startupGate.invalidate();
            if (edgeOneCandidateClient != null) edgeOneCandidateClient.cancelRuntime();
            secureStore.clearAuthorization();
        }
    }

    void shutdown() {
        synchronized (authStateLock) {
            startupGate.close();
            if (edgeOneCandidateClient != null) edgeOneCandidateClient.cancelRuntime();
        }
        executor.shutdownNow();
    }

    private long beginOperation() {
        synchronized (authStateLock) {
            long ticket = startupGate.begin();
            if (edgeOneCandidateClient != null) edgeOneCandidateClient.cancelRuntime();
            return ticket;
        }
    }

    private void clearAfterUnbind(long ticket) {
        synchronized (authStateLock) {
            if (startupGate.isCurrent(ticket)) secureStore.clearAuthorization();
        }
    }

    private AuthResult activate(String key) throws Exception {
        if (BuildConfig.EDGEONE_CANDIDATE) return parseAuth(edgeOneCandidateClient.activate(key));
        String deviceId = identity.deviceId();
        String publicKey = identity.publicKeyBase64();
        String label = identity.deviceLabel();
        String payloadHash = DeviceIdentity.sha256Hex(key + "|" + publicKey + "|" + label);
        JSONObject body = signedLicenseBody("activate", payloadHash, deviceId);
        body.put("licenseKey", key);
        body.put("publicKey", publicKey);
        body.put("deviceLabel", label);
        return parseAuth(postLicense("/v1/activate", body));
    }

    private AuthResult check(String token) throws Exception {
        if (BuildConfig.EDGEONE_CANDIDATE) return parseAuth(edgeOneCandidateClient.check(token));
        String deviceId = identity.deviceId();
        JSONObject body = signedLicenseBody(
                "check", DeviceIdentity.sha256Hex(token), deviceId);
        body.put("token", token);
        return parseAuth(postLicense("/v1/check", body));
    }

    /** Keep state persistence and Android callbacks identical for both startup paths. */
    private RuntimeResult finishAuthorizedStartup(String key, AuthResult auth,
                                                   TransferProgressCallback progress,
                                                   long ticket) throws Exception {
        synchronized (authStateLock) {
            if (!startupGate.isCurrent(ticket)) return null;
            saveAuth(key, auth);
        }
        // C++ owns the candidate's post-authorization update gate. Do not fetch
        // or decrypt private scripts when the server requires an app upgrade.
        if (BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE &&
                !NativeRuntimeBridge.shouldDownloadRuntime(auth.forceUpdate,
                        auth.latestAppVersion, PROTOCOL_APP_VERSION)) {
            return RuntimeResult.valid(null, auth, "启动成功");
        }
        if (!startupGate.isCurrent(ticket)) return null;
        RuntimePayload payload = loadRuntime(auth.token, progress, ticket);
        if (!startupGate.isCurrent(ticket)) {
            if (payload != null) payload.wipe();
            return null;
        }
        return RuntimeResult.valid(payload, auth, "启动成功");
    }

    private RuntimePayload loadRuntime(String token, TransferProgressCallback progress,
                                       long ticket) throws Exception {
        if (BuildConfig.EDGEONE_CANDIDATE) {
            RuntimeZipReader.Listener listener = progress == null ? null : (received, expected) ->
                    mainHandler.post(() -> {
                        if (startupGate.isCurrent(ticket)) progress.onProgress(received, expected);
                    });
            return edgeOneCandidateClient.loadRuntime(token, listener, startupGate, ticket);
        }
        String deviceId = identity.deviceId();
        String runtimePublicKey = runtimeKeyManager.publicKeyBase64();
        String runtimeFingerprint = runtimeKeyManager.fingerprint();
        String payloadHash = DeviceIdentity.sha256Hex(token + "|" + runtimeFingerprint);

        JSONObject challengeRequest = new JSONObject()
                .put("deviceId", deviceId)
                .put("purpose", "runtime")
                .put("appVersion", PROTOCOL_APP_VERSION);
        JSONObject challenge = postRuntime("/v2/runtime/challenge", challengeRequest);
        String nonce = challenge.getString("nonce");
        long timestamp = challenge.getLong("serverTime");
        String keyFingerprint = identity.keyFingerprint();
        String certificate = identity.certificateDigest();
        DeviceIdentity.Risk risk = identity.risk();
        String canonical = "runtime\n" + nonce + "\n" + timestamp + "\n" + deviceId + "\n" +
                keyFingerprint + "\n" + PROTOCOL_APP_VERSION + "\n" + certificate + "\n" + payloadHash;

        JSONObject accessBody = new JSONObject()
                .put("purpose", "runtime")
                .put("nonce", nonce)
                .put("timestamp", timestamp)
                .put("deviceId", deviceId)
                .put("keyFingerprint", keyFingerprint)
                .put("certificateDigest", certificate)
                .put("payloadHash", payloadHash)
                .put("riskFlags", risk.flags)
                .put("appVersion", PROTOCOL_APP_VERSION)
                .put("signature", identity.signRawBase64(canonical))
                .put("token", token)
                .put("runtimePublicKey", runtimePublicKey)
                .put("runtimeKeyFingerprint", runtimeFingerprint);

        JSONObject access = postRuntime("/v2/runtime/access", accessBody);
        JSONObject manifest = access.getJSONObject("manifest");
        verifyReleaseManifest(manifest);

        byte[] wrappedKey = Base64.decode(access.getString("wrappedKey"), Base64.DEFAULT);
        byte[] contentKey = runtimeKeyManager.unwrapKey(wrappedKey);
        byte[] encryptedBundle = null;
        byte[] plainZip = null;
        try {
            String bundlePath = access.optString("bundlePath", "/v2/runtime/bundle");
            encryptedBundle = RuntimeTransport.getBytes(
                    bundlePath, "Bearer " + token, MAX_BUNDLE_BYTES);
            verifyBytes(
                    encryptedBundle,
                    manifest.getInt("size"),
                    manifest.getString("sha256"),
                    "加密运行包");
            plainZip = decryptBundle(
                    encryptedBundle,
                    contentKey,
                    Base64.decode(manifest.getString("iv"), Base64.DEFAULT),
                    manifest.getString("versionName"));
            return RuntimePayload.fromZip(plainZip, manifest);
        } finally {
            Arrays.fill(contentKey, (byte) 0);
            if (wrappedKey != null) Arrays.fill(wrappedKey, (byte) 0);
            if (encryptedBundle != null) Arrays.fill(encryptedBundle, (byte) 0);
            if (plainZip != null) Arrays.fill(plainZip, (byte) 0);
        }
    }

    private byte[] decryptBundle(byte[] encrypted, byte[] key, byte[] iv, String version)
            throws Exception {
        if (key.length != 32 || iv.length != 12) throw new SecurityException("运行密钥无效");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        cipher.updateAAD(("gg-v2-runtime|" + version).getBytes(StandardCharsets.UTF_8));
        return cipher.doFinal(encrypted);
    }

    private JSONObject signedLicenseBody(String purpose, String payloadHash, String deviceId)
            throws Exception {
        JSONObject challengeRequest = new JSONObject()
                .put("deviceId", deviceId)
                .put("purpose", purpose)
                .put("appVersion", PROTOCOL_APP_VERSION);
        JSONObject challenge = postLicense("/v1/challenge", challengeRequest);
        String nonce = challenge.getString("nonce");
        long timestamp = challenge.getLong("serverTime");
        String fingerprint = identity.keyFingerprint();
        String certificate = identity.certificateDigest();
        DeviceIdentity.Risk risk = identity.risk();
        String canonical = purpose + "\n" + nonce + "\n" + timestamp + "\n" + deviceId + "\n" +
                fingerprint + "\n" + PROTOCOL_APP_VERSION + "\n" + certificate + "\n" + payloadHash;
        return new JSONObject()
                .put("purpose", purpose)
                .put("nonce", nonce)
                .put("timestamp", timestamp)
                .put("deviceId", deviceId)
                .put("keyFingerprint", fingerprint)
                .put("certificateDigest", certificate)
                .put("payloadHash", payloadHash)
                .put("riskFlags", risk.flags)
                .put("appVersion", PROTOCOL_APP_VERSION)
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

    private JSONObject postRuntime(String path, JSONObject body) throws Exception {
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

    private AuthResult parseAuth(JSONObject object) throws ApiException {
        if (!object.optBoolean("ok", false)) throw apiError(object, 400);
        String token = object.optString("token", "");
        if (token.isEmpty()) throw new ApiException(500, "bad_response", "授权服务响应无效");
        long licenseExpiresAt = object.isNull("licenseExpiresAt")
                ? 0L : object.optLong("licenseExpiresAt", 0L);
        boolean permanent = object.optBoolean("permanent", false);
        int latestAppVersion = object.optInt("latestAppVersion", PROTOCOL_APP_VERSION);
        if (BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE) {
            NativeRuntimeBridge.validateAuthResponse(
                    token, licenseExpiresAt, permanent, latestAppVersion);
        }
        return new AuthResult(
                token,
                licenseExpiresAt,
                permanent,
                latestAppVersion,
                object.optBoolean("forceUpdate", false),
                object.optString("updateUrl", ""),
                object.optString("updateMessage", "")
        );
    }

    private void saveAuth(String key, AuthResult auth) throws Exception {
        JSONObject state = secureStore.loadState();
        state.put("licenseKey", normalizedClientKey(key));
        state.put("token", auth.token);
        state.put("licenseExpiresAt", auth.licenseExpiresAt);
        state.put("permanent", auth.permanent);
        state.put("latestAppVersion", auth.latestAppVersion);
        state.put("forceUpdate", auth.forceUpdate);
        state.put("updateUrl", auth.updateUrl);
        state.put("updateMessage", auth.updateMessage);
        state.put("lastSuccessAt", System.currentTimeMillis() / 1000L);
        secureStore.saveState(state);
    }

    private void verifyReleaseManifest(JSONObject manifest) throws Exception {
        if (manifest.optInt("schemaVersion", 0) != 2) throw new SecurityException("运行清单版本无效");
        if (!"SHA256withECDSA".equals(manifest.optString("signatureAlgorithm", ""))) {
            throw new SecurityException("运行清单签名算法无效");
        }
        String[] keys = {
                "schemaVersion", "versionName", "file", "size", "sha256", "iv",
                "nonameSize", "nonameSha256", "gameSize", "gameSha256",
                "keyIv", "keyCipher", "publishedAt"
        };
        StringBuilder canonical = new StringBuilder();
        for (String key : keys) canonical.append(key).append("=")
                .append(manifest.get(key)).append("\n");

        byte[] keyBytes = Base64.decode(RELEASE_PUBLIC_KEY_DER_BASE64, Base64.DEFAULT);
        PublicKey publicKey = KeyFactory.getInstance("EC")
                .generatePublic(new X509EncodedKeySpec(keyBytes));
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(publicKey);
        verifier.update(canonical.toString().getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(Base64.decode(
                manifest.getString("signature"), Base64.DEFAULT))) {
            throw new SecurityException("运行清单签名校验失败");
        }
        if (!manifest.getString("sha256").matches("[0-9a-f]{64}")) {
            throw new SecurityException("运行清单摘要无效");
        }
        if (manifest.getInt("size") <= 0 || manifest.getInt("size") > MAX_BUNDLE_BYTES) {
            throw new SecurityException("运行包大小无效");
        }
    }

    private void verifyBytes(byte[] bytes, int expectedSize, String expectedHash, String label)
            throws Exception {
        if (bytes.length != expectedSize) throw new SecurityException(label + "大小校验失败");
        String actual = DeviceIdentity.hex(MessageDigest.getInstance("SHA-256").digest(bytes));
        if (!MessageDigest.isEqual(
                actual.getBytes(StandardCharsets.US_ASCII),
                expectedHash.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.US_ASCII))) {
            throw new SecurityException(label + "完整性校验失败");
        }
    }

    private ApiException apiError(JSONObject object, int status) {
        return new ApiException(
                status,
                object.optString("code", "request_failed"),
                object.optString("message", "操作失败"));
    }

    private String userMessage(ApiException error) {
        if ("license_expired".equals(error.code)) return "服务已到期";
        if ("license_disabled".equals(error.code)) return "服务已暂停，请联系支持";
        if ("device_limit".equals(error.code)) return "激活码已绑定其他设备";
        if ("bad_session".equals(error.code)) return "授权会话已失效";
        if ("runtime_paused".equals(error.code)) return "服务维护中";
        if ("upgrade_required".equals(error.code)) return "客户端需要更新";
        if ("too_many_requests".equals(error.code)) return "操作过于频繁，请稍后再试";
        if ("server_error".equals(error.code)
                || "runtime_unavailable".equals(error.code)
                || "runtime_invalid".equals(error.code)
                || "bad_runtime_key".equals(error.code)
                || "runtime_key_mismatch".equals(error.code)) {
            return "服务暂时不可用，请稍后重试";
        }
        String message = error.getMessage();
        return message == null || message.trim().isEmpty()
                ? "操作失败，请重试" : message;
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) return error.getClass().getSimpleName();
        return message.length() > 120 ? message.substring(0, 120) : message;
    }

    private void deliver(RuntimeCallback callback, RuntimeResult result, long ticket) {
        // A canceled worker may still have completed native ZIP decryption.
        // Release that payload instead of posting it into the next login.
        if (result == null) return;
        if (callback == null || !startupGate.isCurrent(ticket)) {
            if (result.payload != null) result.payload.wipe();
            return;
        }
        mainHandler.post(() -> {
            if (startupGate.isCurrent(ticket)) callback.onResult(result);
            else if (result.payload != null) result.payload.wipe();
        });
    }

    private void deliver(SimpleCallback callback, SimpleResult result, long ticket) {
        if (callback != null && startupGate.isCurrent(ticket)) {
            mainHandler.post(() -> {
                if (startupGate.isCurrent(ticket)) callback.onResult(result);
            });
        }
    }

    private static String normalizedClientKey(String input) {
        return BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE
                ? NativeRuntimeBridge.normalizeLicenseKey(input) : normalizeKey(input);
    }

    static String normalizeKey(String input) {
        return input == null ? "" :
                input.replaceAll("[^0-9A-Fa-f]", "").toUpperCase(Locale.ROOT);
    }

    private static String formatSeconds(long seconds) {
        if (seconds <= 0) return "未知";
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault());
        format.setTimeZone(TimeZone.getDefault());
        return format.format(new Date(seconds * 1000L));
    }

    interface RuntimeCallback {
        void onResult(RuntimeResult result);
    }

    interface TransferProgressCallback {
        void onProgress(int received, int expected);
    }

    interface SimpleCallback {
        void onResult(SimpleResult result);
    }

    static final class RuntimeResult {
        final boolean valid;
        final RuntimePayload payload;
        final boolean permanent;
        final long expiresAt;
        final String message;
        final boolean updateRequired;
        final String updateUrl;
        final String updateMessage;

        private RuntimeResult(
                boolean valid,
                RuntimePayload payload,
                boolean permanent,
                long expiresAt,
                String message,
                boolean updateRequired,
                String updateUrl,
                String updateMessage
        ) {
            this.valid = valid;
            this.payload = payload;
            this.permanent = permanent;
            this.expiresAt = expiresAt;
            this.message = message;
            this.updateRequired = updateRequired;
            this.updateUrl = updateUrl;
            this.updateMessage = updateMessage;
        }

        static RuntimeResult valid(RuntimePayload payload, AuthResult auth, String message) {
            boolean required = auth.forceUpdate && auth.latestAppVersion > PROTOCOL_APP_VERSION;
            return new RuntimeResult(
                    !required,
                    required ? null : payload,
                    auth.permanent,
                    auth.licenseExpiresAt,
                    required ? "需要更新客户端" : message,
                    required,
                    auth.updateUrl,
                    auth.updateMessage);
        }

        static RuntimeResult invalid(String message) {
            return new RuntimeResult(false, null, false, 0L, message, false, "", "");
        }
    }

    static final class SimpleResult {
        final boolean success;
        final String message;

        private SimpleResult(boolean success, String message) {
            this.success = success;
            this.message = message;
        }

        static SimpleResult success(String message) {
            return new SimpleResult(true, message);
        }

        static SimpleResult failure(String message) {
            return new SimpleResult(false, message);
        }
    }

    private static final class AuthResult {
        final String token;
        final long licenseExpiresAt;
        final boolean permanent;
        final int latestAppVersion;
        final boolean forceUpdate;
        final String updateUrl;
        final String updateMessage;

        AuthResult(
                String token,
                long licenseExpiresAt,
                boolean permanent,
                int latestAppVersion,
                boolean forceUpdate,
                String updateUrl,
                String updateMessage
        ) {
            this.token = token;
            this.licenseExpiresAt = licenseExpiresAt;
            this.permanent = permanent;
            this.latestAppVersion = latestAppVersion;
            this.forceUpdate = forceUpdate;
            this.updateUrl = updateUrl == null ? "" : updateUrl;
            this.updateMessage = updateMessage == null ? "" : updateMessage;
        }
    }

    private static final class ApiException extends Exception {
        final int status;
        final String code;

        ApiException(int status, String code, String message) {
            super(message);
            this.status = status;
            this.code = code == null ? "request_failed" : code;
        }
    }
}
