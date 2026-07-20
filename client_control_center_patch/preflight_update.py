from pathlib import Path

path = Path("client/src/main/java/com/jinli/quickweb/OnlineLicenseManager.java")
text = path.read_text(encoding="utf-8")

saved_marker = '''            try {
                JSONObject state = secureStore.loadState();'''
saved_replacement = '''            try {
                PublicConfig publicConfig = fetchPublicConfig();
                savePublicConfig(publicConfig);
                if (publicConfig.updateRequired) {
                    deliver(callback, RuntimeResult.updateRequired(publicConfig.message, publicConfig.url));
                    return;
                }
                JSONObject state = secureStore.loadState();'''
if "PublicConfig publicConfig = fetchPublicConfig();" not in text:
    if saved_marker not in text:
        raise SystemExit("Missing saved initialization marker")
    text = text.replace(saved_marker, saved_replacement, 1)

activate_marker = '''            try {
                deliver(callback, activateAndLoad(key));'''
activate_replacement = '''            try {
                PublicConfig publicConfig = fetchPublicConfig();
                savePublicConfig(publicConfig);
                if (publicConfig.updateRequired) {
                    deliver(callback, RuntimeResult.updateRequired(publicConfig.message, publicConfig.url));
                    return;
                }
                deliver(callback, activateAndLoad(key));'''
if text.count("PublicConfig publicConfig = fetchPublicConfig();") < 2:
    if activate_marker not in text:
        raise SystemExit("Missing activation preflight marker")
    text = text.replace(activate_marker, activate_replacement, 1)

method_marker = '''    private RuntimeResult activateAndLoad(String key) throws Exception {'''
methods = '''    private PublicConfig fetchPublicConfig() throws Exception {
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

'''
if "private PublicConfig fetchPublicConfig()" not in text:
    if method_marker not in text:
        raise SystemExit("Missing public config method marker")
    text = text.replace(method_marker, methods + method_marker, 1)

class_marker = '''    private static final class AuthResult {'''
public_class = '''    private static final class PublicConfig {
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

'''
if "private static final class PublicConfig" not in text:
    if class_marker not in text:
        raise SystemExit("Missing public config class marker")
    text = text.replace(class_marker, public_class + class_marker, 1)

for marker in ("/v1/client/config", "savePublicConfig", "PublicConfig"):
    if marker not in text:
        raise SystemExit("Incomplete update preflight: " + marker)
path.write_text(text, encoding="utf-8")
print("Applied GG pre-authorization update check")
