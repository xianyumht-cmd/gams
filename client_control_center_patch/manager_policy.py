from pathlib import Path
import re

path = Path("client/src/main/java/com/jinli/quickweb/OnlineLicenseManager.java")
text = path.read_text(encoding="utf-8")

replacements = {
    "private static final int APP_VERSION_CODE = 6;": "private static final int APP_VERSION_CODE = 8;",
    "private static final long FOREGROUND_RECHECK_MS = 30L * 60L * 1000L;": "private static final long DEFAULT_FOREGROUND_RECHECK_MS = 30L * 60L * 1000L;",
    "long foregroundRecheckMs() { return FOREGROUND_RECHECK_MS; }": '''long foregroundRecheckMs() {
        long value = secureStore.loadState().optLong("foregroundRecheckSeconds", DEFAULT_FOREGROUND_RECHECK_MS / 1000L);
        value = Math.max(300L, Math.min(43200L, value));
        return value * 1000L;
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
    }''',
    'path, body.toString(), "GG/6 Android", "", maximumBytes);': 'path, body.toString(), "GG/8 Android", "", maximumBytes);',
    'long leaseSeconds = Math.max(0L, Math.min(6L * 60L * 60L, response.optLong("leaseSeconds", 0L)));': 'long leaseSeconds = Math.max(5L * 60L, Math.min(24L * 60L * 60L, response.optLong("leaseSeconds", 0L)));',
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit("Missing policy marker: " + old[:60])
    text = text.replace(old, new, 1)

old = '''        return new AuthResult(
                token,
                object.optLong("tokenExpiresAt", 0L),
                object.isNull("licenseExpiresAt") ? 0L : object.optLong("licenseExpiresAt", 0L),
                object.optBoolean("permanent", false),
                object.optBoolean("forceOnline", false),
                object.optLong("serverTime", 0L)
        );'''
new = '''        return new AuthResult(
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
        );'''
if old not in text:
    raise SystemExit("Missing auth parse marker")
text = text.replace(old, new, 1)

old_class = '''    private static final class AuthResult {
        final String token;
        final long tokenExpiresAt;
        final long licenseExpiresAt;
        final boolean permanent;
        final boolean forceOnline;
        final long serverTime;
        AuthResult(String token, long tokenExpiresAt, long licenseExpiresAt, boolean permanent, boolean forceOnline, long serverTime) {
            this.token = token;
            this.tokenExpiresAt = tokenExpiresAt;
            this.licenseExpiresAt = licenseExpiresAt;
            this.permanent = permanent;
            this.forceOnline = forceOnline;
            this.serverTime = serverTime;
        }
    }'''
new_class = '''    private static final class AuthResult {
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
    }'''
if old_class not in text:
    raise SystemExit("Missing AuthResult class")
text = text.replace(old_class, new_class, 1)

marker = '''    private static String formatSeconds(long seconds) {'''
helpers = '''    private static long bounded(long value, long minimum, long maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    private static String durationText(long seconds) {
        if (seconds <= 0) return "0分钟";
        if (seconds % 86400L == 0) return (seconds / 86400L) + "天";
        if (seconds % 3600L == 0) return (seconds / 3600L) + "小时";
        return Math.max(1L, seconds / 60L) + "分钟";
    }

'''
if marker not in text:
    raise SystemExit("Missing helper marker")
text = text.replace(marker, helpers + marker, 1)
path.write_text(text, encoding="utf-8")

build = Path("client/build.gradle.kts")
value = build.read_text(encoding="utf-8")
value = re.sub(r"versionCode\s*=\s*\d+", "versionCode = 8", value, count=1)
value = re.sub(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.4.0"', value, count=1)
build.write_text(value, encoding="utf-8")
print("Applied GG v1.4 dynamic policy fields")
