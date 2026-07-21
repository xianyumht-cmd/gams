package com.jinli.quickweb;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class OnlineLicenseManager {
    private static final int APP_VERSION_CODE = 8;
    private static final int MAX_JSON_BYTES = 128 * 1024;
    private static final int MAX_SCRIPT_RESPONSE_BYTES = 3 * 1024 * 1024;
    private static final long DEFAULT_FOREGROUND_RECHECK_MS = 30L * 60L * 1000L;
    private static final long CLOCK_ROLLBACK_TOLERANCE_MS = 5L * 60L * 1000L;
    private static final String PUBLIC_KEY_DER_BASE64 =
            "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEn1P0wJwOtd+btZuTxPslVdjaOxSE" +
            "k8iRPNbzkPz3lHT7Cyoi6/e0K7UgQNDRTJKcD8TPcIR1PNrgLLIot34X3w==";

    private final Context context;
    private final SecureStore secureStore;
    private final DeviceIdentity identity;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    OnlineLicenseManager(Context context) {
        this.context = context.getApplicationContext();
        this.secureStore = new SecureStore(this.context);
        this.identity = new DeviceIdentity(this.context, secureStore);
    }

    boolean hasSavedKey() {
        return normalizeKey(secureStore.loadState().optString("licenseKey", "")).length() == 32;
    }

    long foregroundRecheckMs() {
        long seconds = secureStore.loadState().optLong("foregroundRecheckSeconds", DEFAULT_FOREGROUND_RECHECK_MS / 1000L);
        return bounded(seconds, 300L, 43200L) * 1000L;
    }

    boolean isSelfUnbindEnabled() {
        return secureStore.loadState().optBoolean("selfUnbindEnabled", true);
    }

    String getUpdateUrl() { return secureStore.loadState().optString("updateUrl", ""); }
    String getUpdateMessage() { return secureStore.loadState().optString("updateMessage", ""); }

    String getSelfUnbindSummary() {
        JSONObject state = secureStore.loadState();
        if (!state.optBoolean("selfUnbindEnabled", true)) return "当前已关闭自助更换设备。";
        return "自助更换设备将扣除" + durationText(state.optLong("unbindPenaltySeconds", 21600L)) + "有效期。";
    }

    void initializeSavedAsync(RuntimeCallback callback) {
        executor.execute(() -> {
            try {
                PublicConfig publicConfig = fetchPublicConfig();
                savePublicConfig(publicConfig);
                if (publicConfig.updateRequired) {
                    deliver(callback, RuntimeResult.updateRequired(publicConfig.message, publicConfig.url));
                    return;
                }
                JSONObject state = secureStore.loadState();
                String key = normalizeKey(state.optString("licenseKey", ""));
                if (key.length() != 32) {
                    deliver(callback, RuntimeResult.invalid("请输入激活码"));
                    return;
                }
                RuntimeResult result;
                String token = state.optString("token", "");
                if (token.isEmpty()) {
                    result = activateAndLoad(key);
                } else {
                    try {
                        AuthResult auth = checkOnline(token);
                        result = loadScriptAfterAuth(key, auth);
                    } catch (ApiException error) {
                        if ("bad_session".equals(error.code) || "device_unbound".equals(error.code)) {
                            result = activateAndLoad(key);
                        } else {
                            throw error;
                        }
                    }
                }
                deliver(callback, result);
            } catch (java.io.IOException networkError) {
                deliver(callback, offlineFallback());
            } catch (ApiException error) {
                deliver(callback, RuntimeResult.invalid(userMessage(error)));
            } catch (Exception error) {
                deliver(callback, RuntimeResult.invalid("服务初始化失败，请重试"));
            }
        });
    }

    void activateAsync(String rawKey, RuntimeCallback callback) {
        final String key = normalizeKey(rawKey);
        if (key.length() != 32) {
            deliver(callback, RuntimeResult.invalid("激活码格式错误"));
            return;
        }
        executor.execute(() -> {
            try {
                PublicConfig publicConfig = fetchPublicConfig();
                savePublicConfig(publicConfig);
                if (publicConfig.updateRequired) {
                    deliver(callback, RuntimeResult.updateRequired(publicConfig.message, publicConfig.url));
                    return;
                }
                deliver(callback, activateAndLoad(key));
            } catch (java.io.IOException error) {
                deliver(callback, RuntimeResult.invalid("服务连接失败，请检查网络后重试"));
            } catch (ApiException error) {
                deliver(callback, RuntimeResult.invalid(userMessage(error)));
            } catch (Exception error) {
                deliver(callback, RuntimeResult.invalid("启动失败，请重试"));
            }
        });
    }

    void selfUnbindAsync(SimpleCallback callback) {
        executor.execute(() -> {
            try {
                JSONObject state = secureStore.loadState();
                String token = state.optString("token", "");
                if (token.isEmpty()) throw new ApiException(401, "bad_session", "服务状态已失效");
                String deviceId = identity.deviceId();
                JSONObject body = signedBody("unbind", DeviceIdentity.sha256Hex(token + "|unbind"), deviceId);
                body.put("token", token);
                JSONObject response = postJson("/v1/device/unbind", body, MAX_JSON_BYTES);
                if (!response.optBoolean("ok", false)) throw apiError(response, 400);
                long expiresAt = response.isNull("licenseExpiresAt") ? 0L : response.optLong("licenseExpiresAt", 0L);
                long rebindAt = response.isNull("rebindAvailableAt") ? 0L : response.optLong("rebindAvailableAt", 0L);
                long penalty = response.optLong("penaltySeconds", state.optLong("unbindPenaltySeconds", 21600L));
                secureStore.clearAuthorization();
                String duration = durationText(penalty);
                String message = rebindAt > 0
                        ? "更换设备成功，" + duration + "后可在新设备重新激活"
                        : "更换设备成功，已扣除" + duration + "，有效期至 " + formatSeconds(expiresAt);
                deliver(callback, SimpleResult.success(message));
            } catch (java.io.IOException error) {
                deliver(callback, SimpleResult.failure("服务连接失败，请检查网络后重试"));
            } catch (ApiException error) {
                deliver(callback, SimpleResult.failure(userMessage(error)));
            } catch (Exception error) {
                deliver(callback, SimpleResult.failure("更换设备失败，请重试"));
            }
        });
    }

    String getStatusSummary() {
        JSONObject state = secureStore.loadState();
        boolean permanent = state.optBoolean("permanent", false);
        long expiresAt = state.optLong("licenseExpiresAt", 0L);
        long lastSuccess = state.optLong("lastServerTime", 0L);
        String validity = permanent ? "永久有效" : expiresAt > 0 ? formatSeconds(expiresAt) : "等待验证";
        String last = lastSuccess > 0 ? formatSeconds(lastSuccess) : "尚未完成";
        long configVersion = state.optLong("configVersion", 0L);
        int latest = state.optInt("latestAppVersion", APP_VERSION_CODE);
        return "有效期：" + validity + "\n最近初始化：" + last +
                "\n客户端版本：1.4.0" + (configVersion > 0 ? "\n策略版本：" + configVersion : "") +
                (latest > APP_VERSION_CODE ? "\n发现新版本：" + latest : "");
    }

    void clear() { secureStore.clearAuthorization(); }
    void shutdown() { executor.shutdownNow(); }

    private PublicConfig fetchPublicConfig() throws Exception {
        JSONObject request = new JSONObject().put("appVersion", APP_VERSION_CODE);
        JSONObject response = postJson("/v1/client/config", request, MAX_JSON_BYTES);
        int latest = response.optInt("latestAppVersion", APP_VERSION_CODE);
        boolean required = response.optBoolean("updateRequired", false);
        String message = response.optString("updateMessage", "");
        if (message.trim().isEmpty()) message = required ? "发现必须安装的新版本" : "";
        return new PublicConfig(
                response.optLong("configVersion", 0L), latest, required,
                response.optString("updateUrl", ""), message);
    }

    private void savePublicConfig(PublicConfig config) throws Exception {
        JSONObject state = secureStore.loadState();
        state.put("configVersion", Math.max(state.optLong("configVersion", 0L), config.configVersion));
        state.put("latestAppVersion", config.latestAppVersion);
        state.put("forceUpdate", config.updateRequired);
        state.put("updateUrl", config.url);
        state.put("updateMessage", config.message);
        secureStore.saveState(state);
    }

    private RuntimeResult activateAndLoad(String key) throws Exception {
        String deviceId = identity.deviceId();
        String publicKey = identity.publicKeyBase64();
        String label = identity.deviceLabel();
        String payloadHash = DeviceIdentity.sha256Hex(key + "|" + publicKey + "|" + label);
        JSONObject body = signedBody("activate", payloadHash, deviceId);
        body.put("licenseKey", key);
        body.put("publicKey", publicKey);
        body.put("deviceLabel", label);
        JSONObject response = postJson("/v1/activate", body, MAX_JSON_BYTES);
        AuthResult auth = parseAuth(response);
        return loadScriptAfterAuth(key, auth);
    }
    private AuthResult checkOnline(String token) throws Exception {
        String deviceId = identity.deviceId();
        JSONObject body = signedBody("check", DeviceIdentity.sha256Hex(token), deviceId);
        body.put("token", token);
        return parseAuth(postJson("/v1/check", body, MAX_JSON_BYTES));
    }

    private RuntimeResult loadScriptAfterAuth(String key, AuthResult auth) throws Exception {
        savePolicyState(key, auth);
        if (auth.forceUpdate && auth.latestAppVersion > APP_VERSION_CODE) {
            String message = auth.updateMessage.isEmpty() ? "发现必须安装的新版本" : auth.updateMessage;
            return RuntimeResult.updateRequired(message, auth.updateUrl);
        }
        try {
            ScriptResult script = fetchScript(auth.token);
            saveSuccess(key, auth, script);
            String message = auth.permanent ? "启动成功" : "启动成功，有效期至 " + formatSeconds(auth.licenseExpiresAt);
            boolean updateAvailable = auth.latestAppVersion > APP_VERSION_CODE;
            if (updateAvailable && !auth.updateMessage.isEmpty()) message += "\n" + auth.updateMessage;
            return RuntimeResult.valid(script.source, false, auth.permanent, auth.licenseExpiresAt,
                    message, updateAvailable, auth.updateUrl, auth.updateMessage);
        } catch (java.io.IOException error) {
            RuntimeResult fallback = offlineFallbackWithAuth(auth);
            if (fallback.valid) return fallback;
            throw error;
        } catch (ApiException error) {
            if ("script_unavailable".equals(error.code) || "server_error".equals(error.code)
                    || "runtime_paused".equals(error.code)) {
                RuntimeResult fallback = offlineFallbackWithAuth(auth);
                if (fallback.valid) return fallback;
            }
            throw error;
        }
    }

    private ScriptResult fetchScript(String token) throws Exception {
        String deviceId = identity.deviceId();
        JSONObject body = signedBody("script", DeviceIdentity.sha256Hex(token + "|script"), deviceId);
        body.put("token", token);
        JSONObject response = postJson("/v1/script", body, MAX_SCRIPT_RESPONSE_BYTES);
        if (!response.optBoolean("ok", false)) throw apiError(response, 400);
        JSONObject manifestObject = response.getJSONObject("manifest");
        Manifest manifest = Manifest.parse(manifestObject);
        verifyManifest(manifest);
        byte[] scriptBytes = Base64.decode(response.getString("scriptBase64"), Base64.DEFAULT);
        verifyScript(manifest, scriptBytes);
        long serverTime = response.optLong("serverTime", 0L);
        long leaseSeconds = bounded(response.optLong("leaseSeconds", 0L), 5L * 60L, 24L * 60L * 60L);
        if (serverTime <= 0 || leaseSeconds <= 0) throw new SecurityException("运行租期无效");
        return new ScriptResult(new String(scriptBytes, StandardCharsets.UTF_8), manifest,
                serverTime, serverTime + leaseSeconds);
    }

    private JSONObject signedBody(String purpose, String payloadHash, String deviceId) throws Exception {
        JSONObject challengeRequest = new JSONObject()
                .put("deviceId", deviceId)
                .put("purpose", purpose)
                .put("appVersion", APP_VERSION_CODE);
        JSONObject challenge = postJson("/v1/challenge", challengeRequest, MAX_JSON_BYTES);
        if (!challenge.optBoolean("ok", false)) throw apiError(challenge, 400);
        String nonce = challenge.getString("nonce");
        long timestamp = challenge.getLong("serverTime");
        String fingerprint = identity.keyFingerprint();
        String certificate = identity.certificateDigest();
        DeviceIdentity.Risk risk = identity.risk();
        String canonical = purpose + "\n" + nonce + "\n" + timestamp + "\n" + deviceId + "\n" +
                fingerprint + "\n" + APP_VERSION_CODE + "\n" + certificate + "\n" + payloadHash;
        return new JSONObject()
                .put("purpose", purpose)
                .put("nonce", nonce)
                .put("timestamp", timestamp)
                .put("deviceId", deviceId)
                .put("keyFingerprint", fingerprint)
                .put("certificateDigest", certificate)
                .put("payloadHash", payloadHash)
                .put("riskFlags", risk.flags)
                .put("appVersion", APP_VERSION_CODE)
                .put("signature", identity.signRawBase64(canonical));
    }

    private JSONObject postJson(String path, JSONObject body, int maximumBytes) throws Exception {
        ResilientApiTransport.Response response = ResilientApiTransport.post(
                path, body.toString(), "GG/8 Android", "", maximumBytes);
        JSONObject object;
        try { object = new JSONObject(response.body); }
        catch (Exception error) { throw new java.io.IOException("服务器响应无效", error); }
        if (response.status < 200 || response.status >= 300 || !object.optBoolean("ok", false)) {
            throw apiError(object, response.status);
        }
        return object;
    }

    private AuthResult parseAuth(JSONObject object) throws ApiException {
        if (!object.optBoolean("ok", false)) throw apiError(object, 400);
        String token = object.optString("token", "");
        if (token.isEmpty()) throw new ApiException(500, "bad_response", "服务响应无效");
        return new AuthResult(
                token,
                object.optLong("tokenExpiresAt", 0L),
                object.isNull("licenseExpiresAt") ? 0L : object.optLong("licenseExpiresAt", 0L),
                object.optBoolean("permanent", false),
                object.optBoolean("forceOnline", false),
                object.optLong("serverTime", 0L),
                object.optLong("configVersion", 0L),
                bounded(object.optLong("foregroundRecheckSeconds", 1800L), 300L, 43200L),
                bounded(object.optLong("scriptLeaseSeconds", 21600L), 300L, 86400L),
                object.optInt("latestAppVersion", APP_VERSION_CODE),
                object.optBoolean("forceUpdate", false),
                object.optString("updateUrl", ""),
                object.optString("updateMessage", ""),
                object.optBoolean("selfUnbindEnabled", true),
                bounded(object.optLong("unbindPenaltySeconds", 21600L), 0L, 259200L)
        );
    }

    private void savePolicyState(String key, AuthResult auth) throws Exception {
        JSONObject state = secureStore.loadState();
        state.put("licenseKey", normalizeKey(key));
        state.put("token", auth.token);
        state.put("tokenExpiresAt", auth.tokenExpiresAt);
        state.put("licenseExpiresAt", auth.licenseExpiresAt);
        state.put("permanent", auth.permanent);
        state.put("forceOnline", auth.forceOnline);
        state.put("lastServerTime", auth.serverTime);
        state.put("configVersion", auth.configVersion);
        state.put("foregroundRecheckSeconds", auth.foregroundRecheckSeconds);
        state.put("scriptLeaseSeconds", auth.scriptLeaseSeconds);
        state.put("latestAppVersion", auth.latestAppVersion);
        state.put("forceUpdate", auth.forceUpdate);
        state.put("updateUrl", auth.updateUrl);
        state.put("updateMessage", auth.updateMessage);
        state.put("selfUnbindEnabled", auth.selfUnbindEnabled);
        state.put("unbindPenaltySeconds", auth.unbindPenaltySeconds);
        state.put("savedWallMs", System.currentTimeMillis());
        state.put("savedElapsedMs", SystemClock.elapsedRealtime());
        state.put("bootCount", bootCount());
        secureStore.saveState(state);
    }

    private void saveSuccess(String key, AuthResult auth, ScriptResult script) throws Exception {
        savePolicyState(key, auth);
        JSONObject cache = new JSONObject()
                .put("source", script.source)
                .put("manifest", script.manifest.toJson())
                .put("serverTime", script.serverTime)
                .put("leaseExpiresAt", script.leaseExpiresAt)
                .put("savedWallMs", System.currentTimeMillis())
                .put("savedElapsedMs", SystemClock.elapsedRealtime())
                .put("bootCount", bootCount());
        secureStore.writeCache(cache);
    }

    private RuntimeResult offlineFallbackWithAuth(AuthResult auth) {
        if (auth.forceUpdate && auth.latestAppVersion > APP_VERSION_CODE)
            return RuntimeResult.updateRequired(auth.updateMessage, auth.updateUrl);
        if (auth.forceOnline) return RuntimeResult.invalid("当前环境需要联网初始化");
        return offlineFallback();
    }

    private RuntimeResult offlineFallback() {
        JSONObject state = secureStore.loadState();
        if (state.optBoolean("forceUpdate", false) && state.optInt("latestAppVersion", APP_VERSION_CODE) > APP_VERSION_CODE)
            return RuntimeResult.updateRequired(state.optString("updateMessage", "发现必须安装的新版本"), state.optString("updateUrl", ""));
        if (state.optBoolean("forceOnline", false)) return RuntimeResult.invalid("当前环境需要联网初始化");
        JSONObject cache = secureStore.readCache();
        if (cache == null) return RuntimeResult.invalid("服务连接失败，请检查网络后重试");
        try {
            long estimatedServerTime = estimateServerTime(cache);
            long leaseExpiresAt = cache.optLong("leaseExpiresAt", 0L);
            boolean permanent = state.optBoolean("permanent", false);
            long licenseExpiresAt = state.optLong("licenseExpiresAt", 0L);
            if (estimatedServerTime <= 0 || estimatedServerTime > leaseExpiresAt) {
                secureStore.deleteCache();
                return RuntimeResult.invalid("需要联网完成初始化");
            }
            if (!permanent && licenseExpiresAt > 0 && estimatedServerTime >= licenseExpiresAt) {
                secureStore.deleteCache();
                return RuntimeResult.invalid("服务已到期");
            }
            Manifest manifest = Manifest.parse(cache.getJSONObject("manifest"));
            verifyManifest(manifest);
            byte[] scriptBytes = cache.getString("source").getBytes(StandardCharsets.UTF_8);
            verifyScript(manifest, scriptBytes);
            boolean updateAvailable = state.optInt("latestAppVersion", APP_VERSION_CODE) > APP_VERSION_CODE;
            return RuntimeResult.valid(new String(scriptBytes, StandardCharsets.UTF_8), true,
                    permanent, licenseExpiresAt, "网络暂时不可用，已使用安全缓存",
                    updateAvailable, state.optString("updateUrl", ""), state.optString("updateMessage", ""));
        } catch (Exception error) {
            secureStore.deleteCache();
            return RuntimeResult.invalid("服务连接失败，请检查网络后重试");
        }
    }

    private long estimateServerTime(JSONObject cache) {
        long serverTime = cache.optLong("serverTime", 0L);
        long savedWall = cache.optLong("savedWallMs", 0L);
        long savedElapsed = cache.optLong("savedElapsedMs", 0L);
        int savedBoot = cache.optInt("bootCount", -1);
        long nowWall = System.currentTimeMillis();
        if (serverTime <= 0 || savedWall <= 0 || nowWall + CLOCK_ROLLBACK_TOLERANCE_MS < savedWall) return 0L;
        if (savedBoot >= 0 && savedBoot == bootCount() && SystemClock.elapsedRealtime() >= savedElapsed) {
            return serverTime + (SystemClock.elapsedRealtime() - savedElapsed) / 1000L;
        }
        return serverTime + Math.max(0L, nowWall - savedWall) / 1000L;
    }

    private int bootCount() {
        try { return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT); }
        catch (Exception ignored) { return -1; }
    }

    private void verifyManifest(Manifest manifest) throws Exception {
        if (!"SHA256withECDSA".equals(manifest.signatureAlgorithm)) throw new SecurityException("运行清单无效");
        byte[] keyBytes = Base64.decode(PUBLIC_KEY_DER_BASE64, Base64.DEFAULT);
        PublicKey publicKey = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(keyBytes));
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(publicKey);
        verifier.update(manifest.canonical().getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(Base64.decode(manifest.signature, Base64.DEFAULT))) throw new SecurityException("运行清单校验失败");
        if (manifest.schemaVersion != 1 || !"stable".equals(manifest.channel) || manifest.version <= 0) throw new SecurityException("运行清单无效");
        if (manifest.minAppVersion > APP_VERSION_CODE) throw new SecurityException("请更新客户端");
        if (manifest.size <= 0 || manifest.size > 2 * 1024 * 1024) throw new SecurityException("运行数据大小无效");
        if (!manifest.sha256.matches("[0-9a-fA-F]{64}")) throw new SecurityException("运行摘要无效");
    }

    private void verifyScript(Manifest manifest, byte[] bytes) throws Exception {
        if (bytes.length != manifest.size) throw new SecurityException("运行数据大小校验失败");
        byte[] actual = MessageDigest.getInstance("SHA-256").digest(bytes);
        if (!MessageDigest.isEqual(actual, hexBytes(manifest.sha256))) throw new SecurityException("运行数据完整性校验失败");
    }

    private static byte[] hexBytes(String text) {
        byte[] output = new byte[text.length() / 2];
        for (int i = 0; i < output.length; i++) {
            int high = Character.digit(text.charAt(i * 2), 16);
            int low = Character.digit(text.charAt(i * 2 + 1), 16);
            if (high < 0 || low < 0) throw new IllegalArgumentException("摘要无效");
            output[i] = (byte) ((high << 4) | low);
        }
        return output;
    }

    private ApiException apiError(JSONObject object, int status) {
        return new ApiException(status, object.optString("code", "request_failed"), object.optString("message", "操作失败"));
    }

    private String userMessage(ApiException error) {
        if ("upgrade_required".equals(error.code)) return error.message == null || error.message.trim().isEmpty()
                ? "客户端版本过低，请更新后继续使用" : error.message;
        if ("license_expired".equals(error.code)) return "服务已到期";
        if ("license_disabled".equals(error.code)) return "服务已暂停，请联系支持";
        if ("device_limit".equals(error.code)) return "激活码已绑定其他设备";
        if ("device_key_changed".equals(error.code) || "certificate_changed".equals(error.code)) return "设备安全信息发生变化，请先更换设备";
        if ("rebind_wait".equals(error.code)) return error.message;
        if ("self_unbind_disabled".equals(error.code)) return "当前已关闭自助更换设备";
        if ("unbind_cooldown".equals(error.code)) return error.message;
        if ("unbind_limit".equals(error.code)) return "近期更换设备次数已达上限";
        if ("insufficient_time".equals(error.code)) return error.message;
        if ("runtime_paused".equals(error.code)) return "服务维护中，请稍后再试";
        if ("too_many_requests".equals(error.code)) return "操作过于频繁，请稍后再试";
        return error.message == null || error.message.trim().isEmpty() ? "操作失败，请重试" : error.message;
    }

    private void deliver(RuntimeCallback callback, RuntimeResult result) {
        if (callback != null) mainHandler.post(() -> callback.onResult(result));
    }

    private void deliver(SimpleCallback callback, SimpleResult result) {
        if (callback != null) mainHandler.post(() -> callback.onResult(result));
    }

    static String normalizeKey(String input) {
        return input == null ? "" : input.replaceAll("[^0-9A-Fa-f]", "").toUpperCase(Locale.ROOT);
    }

    private static long bounded(long value, long minimum, long maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    private static String durationText(long seconds) {
        if (seconds <= 0) return "0分钟";
        if (seconds % 86400L == 0) return (seconds / 86400L) + "天";
        if (seconds % 3600L == 0) return (seconds / 3600L) + "小时";
        return Math.max(1L, seconds / 60L) + "分钟";
    }

    private static String formatSeconds(long seconds) {
        if (seconds <= 0) return "未知";
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault());
        format.setTimeZone(TimeZone.getDefault());
        return format.format(new Date(seconds * 1000L));
    }

    interface RuntimeCallback { void onResult(RuntimeResult result); }
    interface SimpleCallback { void onResult(SimpleResult result); }

    static final class RuntimeResult {
        final boolean valid;
        final boolean offline;
        final boolean permanent;
        final long expiresAt;
        final String source;
        final String message;
        final boolean updateAvailable;
        final boolean updateRequired;
        final String updateUrl;
        final String updateMessage;
        private RuntimeResult(boolean valid, boolean offline, boolean permanent, long expiresAt, String source,
                              String message, boolean updateAvailable, boolean updateRequired,
                              String updateUrl, String updateMessage) {
            this.valid = valid;
            this.offline = offline;
            this.permanent = permanent;
            this.expiresAt = expiresAt;
            this.source = source == null ? "" : source;
            this.message = message == null ? "" : message;
            this.updateAvailable = updateAvailable;
            this.updateRequired = updateRequired;
            this.updateUrl = updateUrl == null ? "" : updateUrl;
            this.updateMessage = updateMessage == null ? "" : updateMessage;
        }
        static RuntimeResult valid(String source, boolean offline, boolean permanent, long expiresAt, String message) {
            return valid(source, offline, permanent, expiresAt, message, false, "", "");
        }
        static RuntimeResult valid(String source, boolean offline, boolean permanent, long expiresAt, String message,
                                   boolean updateAvailable, String updateUrl, String updateMessage) {
            return new RuntimeResult(true, offline, permanent, expiresAt, source, message,
                    updateAvailable, false, updateUrl, updateMessage);
        }
        static RuntimeResult updateRequired(String message, String updateUrl) {
            return new RuntimeResult(false, false, false, 0L, "", message,
                    true, true, updateUrl, message);
        }
        static RuntimeResult invalid(String message) {
            return new RuntimeResult(false, false, false, 0L, "", message,
                    false, false, "", "");
        }
    }

    static final class SimpleResult {
        final boolean success;
        final String message;
        private SimpleResult(boolean success, String message) { this.success = success; this.message = message; }
        static SimpleResult success(String message) { return new SimpleResult(true, message); }
        static SimpleResult failure(String message) { return new SimpleResult(false, message); }
    }

    private static final class PublicConfig {
        final long configVersion;
        final int latestAppVersion;
        final boolean updateRequired;
        final String url;
        final String message;
        PublicConfig(long configVersion, int latestAppVersion, boolean updateRequired, String url, String message) {
            this.configVersion = configVersion;
            this.latestAppVersion = latestAppVersion;
            this.updateRequired = updateRequired;
            this.url = url == null ? "" : url;
            this.message = message == null ? "" : message;
        }
    }

    private static final class AuthResult {
        final String token;
        final long tokenExpiresAt;
        final long licenseExpiresAt;
        final boolean permanent;
        final boolean forceOnline;
        final long serverTime;
        final long configVersion;
        final long foregroundRecheckSeconds;
        final long scriptLeaseSeconds;
        final int latestAppVersion;
        final boolean forceUpdate;
        final String updateUrl;
        final String updateMessage;
        final boolean selfUnbindEnabled;
        final long unbindPenaltySeconds;
        AuthResult(String token, long tokenExpiresAt, long licenseExpiresAt, boolean permanent, boolean forceOnline,
                   long serverTime, long configVersion, long foregroundRecheckSeconds, long scriptLeaseSeconds,
                   int latestAppVersion, boolean forceUpdate, String updateUrl, String updateMessage,
                   boolean selfUnbindEnabled, long unbindPenaltySeconds) {
            this.token = token;
            this.tokenExpiresAt = tokenExpiresAt;
            this.licenseExpiresAt = licenseExpiresAt;
            this.permanent = permanent;
            this.forceOnline = forceOnline;
            this.serverTime = serverTime;
            this.configVersion = configVersion;
            this.foregroundRecheckSeconds = foregroundRecheckSeconds;
            this.scriptLeaseSeconds = scriptLeaseSeconds;
            this.latestAppVersion = latestAppVersion;
            this.forceUpdate = forceUpdate;
            this.updateUrl = updateUrl == null ? "" : updateUrl;
            this.updateMessage = updateMessage == null ? "" : updateMessage;
            this.selfUnbindEnabled = selfUnbindEnabled;
            this.unbindPenaltySeconds = unbindPenaltySeconds;
        }
    }

    private static final class ScriptResult {
        final String source;
        final Manifest manifest;
        final long serverTime;
        final long leaseExpiresAt;
        ScriptResult(String source, Manifest manifest, long serverTime, long leaseExpiresAt) {
            this.source = source;
            this.manifest = manifest;
            this.serverTime = serverTime;
            this.leaseExpiresAt = leaseExpiresAt;
        }
    }

    private static final class ApiException extends Exception {
        final int status;
        final String code;
        final String message;
        ApiException(int status, String code, String message) {
            super(message);
            this.status = status;
            this.code = code;
            this.message = message;
        }
    }

    private static final class Manifest {
        final int schemaVersion;
        final String channel;
        final int version;
        final String versionName;
        final String file;
        final String sha256;
        final int size;
        final int minAppVersion;
        final String publishedAt;
        final String signatureAlgorithm;
        final String signature;

        Manifest(JSONObject object) {
            schemaVersion = object.optInt("schemaVersion", 0);
            channel = object.optString("channel", "");
            version = object.optInt("version", 0);
            versionName = object.optString("versionName", "");
            file = object.optString("file", "");
            sha256 = object.optString("sha256", "");
            size = object.optInt("size", 0);
            minAppVersion = object.optInt("minAppVersion", 0);
            publishedAt = object.optString("publishedAt", "");
            signatureAlgorithm = object.optString("signatureAlgorithm", "");
            signature = object.optString("signature", "");
        }

        static Manifest parse(JSONObject object) { return new Manifest(object); }

        String canonical() {
            return "schemaVersion=" + schemaVersion + "\n" +
                    "channel=" + channel + "\n" +
                    "version=" + version + "\n" +
                    "versionName=" + versionName + "\n" +
                    "file=" + file + "\n" +
                    "sha256=" + sha256 + "\n" +
                    "size=" + size + "\n" +
                    "minAppVersion=" + minAppVersion + "\n" +
                    "publishedAt=" + publishedAt + "\n";
        }

        JSONObject toJson() throws Exception {
            return new JSONObject()
                    .put("schemaVersion", schemaVersion)
                    .put("channel", channel)
                    .put("version", version)
                    .put("versionName", versionName)
                    .put("file", file)
                    .put("sha256", sha256)
                    .put("size", size)
                    .put("minAppVersion", minAppVersion)
                    .put("publishedAt", publishedAt)
                    .put("signatureAlgorithm", signatureAlgorithm)
                    .put("signature", signature);
        }
    }
}
