package com.jinli.ggsecure;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Persistence boundary for authorization state; network and operation tickets stay outside. */
final class LicenseSessionStore {
    private final SecureStore store;

    LicenseSessionStore(SecureStore store) {
        this.store = store;
    }

    JSONObject load() {
        return store.loadState();
    }

    void save(String key, String token, long licenseExpiresAt, boolean permanent,
            int latestAppVersion, boolean forceUpdate, String updateUrl,
            String updateMessage) throws Exception {
        JSONObject state = store.loadState();
        state.put("licenseKey", key);
        state.put("token", token);
        state.put("licenseExpiresAt", licenseExpiresAt);
        state.put("permanent", permanent);
        state.put("latestAppVersion", latestAppVersion);
        state.put("forceUpdate", forceUpdate);
        state.put("updateUrl", updateUrl);
        state.put("updateMessage", updateMessage);
        state.put("lastSuccessAt", System.currentTimeMillis() / 1000L);
        store.saveState(state);
    }

    void clear() {
        store.clearAuthorization();
    }

    String summary(String appVersion) {
        JSONObject state = store.loadState();
        boolean permanent = state.optBoolean("permanent", false);
        long expiresAt = state.optLong("licenseExpiresAt", 0L);
        String validity = permanent ? "永久有效" :
                expiresAt > 0 ? formatSeconds(expiresAt) : "等待验证";
        return "有效期：" + validity + "\n版本：" + appVersion;
    }

    private static String formatSeconds(long seconds) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault());
        format.setTimeZone(TimeZone.getDefault());
        return format.format(new Date(seconds * 1000L));
    }
}
