package com.jinli.ggsecure;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;

import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class V2LicenseManager {
    private static final int PROTOCOL_APP_VERSION = LegacyLicenseProtocol.APP_VERSION;

    private final LicenseSessionStore sessionStore;
    private final EdgeOneCandidateClient edgeOneCandidateClient;
    private final LegacyLicenseProtocol legacyLicenseProtocol;
    private final LegacyRuntimeLoader legacyRuntimeLoader;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object authStateLock = new Object();
    private final StartupGate startupGate = new StartupGate();

    V2LicenseManager(Context context) {
        Context app = context.getApplicationContext();
        SecureStore secureStore = new SecureStore(app);
        sessionStore = new LicenseSessionStore(secureStore);
        DeviceIdentity identity = new DeviceIdentity(app, secureStore);
        RuntimeKeyManager runtimeKeyManager = new RuntimeKeyManager();
        legacyLicenseProtocol = new LegacyLicenseProtocol(identity);
        legacyRuntimeLoader = new LegacyRuntimeLoader(
                identity, runtimeKeyManager, legacyLicenseProtocol);
        edgeOneCandidateClient = BuildConfig.EDGEONE_CANDIDATE
                ? new EdgeOneCandidateClient(identity) : null;
    }

    boolean hasSavedKey() {
        return normalizedClientKey(sessionStore.load().optString("licenseKey", "")).length() == 32;
    }

    void initializeSavedAsync(RuntimeCallback callback) {
        initializeSavedAsync(callback, null);
    }

    void initializeSavedAsync(RuntimeCallback callback, TransferProgressCallback progress) {
        final long ticket = beginOperation();
        executor.execute(() -> {
            if (!startupGate.isCurrent(ticket)) return;
            try {
                JSONObject state = sessionStore.load();
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
                    } catch (LegacyLicenseProtocol.ApiException error) {
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
            } catch (LegacyLicenseProtocol.ApiException error) {
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
            } catch (LegacyLicenseProtocol.ApiException error) {
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
                JSONObject state = sessionStore.load();
                String token = state.optString("token", "");
                if (token.isEmpty()) throw new LegacyLicenseProtocol.ApiException(
                        401, "bad_session", "服务状态已失效");
                if (BuildConfig.EDGEONE_CANDIDATE) {
                    edgeOneCandidateClient.unbind(token);
                    clearAfterUnbind(ticket);
                    deliver(callback, SimpleResult.success("当前设备已解除绑定"), ticket);
                    return;
                }
                legacyLicenseProtocol.unbind(token);
                clearAfterUnbind(ticket);
                deliver(callback, SimpleResult.success("当前设备已解除绑定"), ticket);
            } catch (Exception error) {
                if (error instanceof LegacyLicenseProtocol.ApiException) {
                    deliver(callback, SimpleResult.failure(userMessage(
                            (LegacyLicenseProtocol.ApiException) error)), ticket);
                } else if (error instanceof EdgeOneCandidateClient.ApiError) {
                    deliver(callback, SimpleResult.failure(error.getMessage()), ticket);
                } else {
                    deliver(callback, SimpleResult.failure("更换设备失败，请重试"), ticket);
                }
            }
        });
    }

    String getStatusSummary() {
        return sessionStore.summary(BuildConfig.VERSION_NAME);
    }

    void clear() {
        synchronized (authStateLock) {
            startupGate.invalidate();
            if (edgeOneCandidateClient != null) edgeOneCandidateClient.cancelRuntime();
            sessionStore.clear();
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
            if (startupGate.isCurrent(ticket)) sessionStore.clear();
        }
    }

    private AuthResult activate(String key) throws Exception {
        if (BuildConfig.EDGEONE_CANDIDATE) return parseAuth(edgeOneCandidateClient.activate(key));
        return parseAuth(legacyLicenseProtocol.activate(key));
    }

    private AuthResult check(String token) throws Exception {
        if (BuildConfig.EDGEONE_CANDIDATE) return parseAuth(edgeOneCandidateClient.check(token));
        return parseAuth(legacyLicenseProtocol.check(token));
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
        return legacyRuntimeLoader.load(token);
    }

    private AuthResult parseAuth(JSONObject object) throws LegacyLicenseProtocol.ApiException {
        if (!object.optBoolean("ok", false)) throw new LegacyLicenseProtocol.ApiException(
                400, object.optString("code", "request_failed"),
                object.optString("message", "操作失败"));
        String token = object.optString("token", "");
        if (token.isEmpty()) throw new LegacyLicenseProtocol.ApiException(
                500, "bad_response", "授权服务响应无效");
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
        sessionStore.save(normalizedClientKey(key), auth.token, auth.licenseExpiresAt,
                auth.permanent, auth.latestAppVersion, auth.forceUpdate,
                auth.updateUrl, auth.updateMessage);
    }

    private String userMessage(LegacyLicenseProtocol.ApiException error) {
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

}
