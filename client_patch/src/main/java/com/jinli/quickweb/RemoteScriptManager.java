package com.jinli.quickweb;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

final class RemoteScriptManager {
    private static final String PREFS = "remote_script_state";
    private static final String PREF_LAST_CHECK = "last_check_ms";
    private static final long CHECK_INTERVAL_MS = 5L * 60L * 1000L;
    private static final int APP_VERSION_CODE = 2;
    private static final int MAX_MANIFEST_BYTES = 64 * 1024;
    private static final int MAX_SCRIPT_BYTES = 2 * 1024 * 1024;

    private static final String[] RELEASE_BASE_URLS = {
            "https://gams-script-edge.2320006072.workers.dev/release/",
            "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/remote-script/release/",
            "https://cdn.jsdelivr.net/gh/xianyumht-cmd/gams@main/remote-script/release/",
            "https://fastly.jsdelivr.net/gh/xianyumht-cmd/gams@main/remote-script/release/",
            "https://gcore.jsdelivr.net/gh/xianyumht-cmd/gams@main/remote-script/release/"
    };

    private static final String PUBLIC_KEY_DER_BASE64 =
            "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEn1P0wJwOtd+btZuTxPslVdjaOxSE" +
            "k8iRPNbzkPz3lHT7Cyoi6/e0K7UgQNDRTJKcD8TPcIR1PNrgLLIot34X3w==";

    private final SharedPreferences preferences;
    private final File cacheDirectory;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    RemoteScriptManager(Context context) {
        Context app = context.getApplicationContext();
        preferences = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        cacheDirectory = new File(app.getFilesDir(), "script-cache");
    }

    ScriptBundle loadLocalOrBundled(String bundledSource) {
        ScriptBundle current = readVerifiedBundle("current", "远程缓存");
        if (current != null) return current;
        ScriptBundle previous = readVerifiedBundle("previous", "上一版本");
        if (previous != null) return previous;
        return new ScriptBundle(bundledSource, 0, "内置版本", "内置兜底");
    }

    void refreshAsync(int loadedVersion, UpdateCallback callback) {
        long now = System.currentTimeMillis();
        long lastCheck = preferences.getLong(PREF_LAST_CHECK, 0L);
        if (now - lastCheck < CHECK_INTERVAL_MS) return;
        preferences.edit().putLong(PREF_LAST_CHECK, now).apply();
        executor.execute(() -> {
            UpdateResult result = updateFromMirrors(loadedVersion);
            if (callback != null) mainHandler.post(() -> callback.onCompleted(result));
        });
    }

    void shutdown() {
        executor.shutdownNow();
    }

    private UpdateResult updateFromMirrors(int loadedVersion) {
        String lastError = "没有可用的更新源";
        for (String baseUrl : RELEASE_BASE_URLS) {
            try {
                byte[] manifestBytes = download(
                        baseUrl + "manifest.json?app=" + APP_VERSION_CODE,
                        MAX_MANIFEST_BYTES
                );
                String manifestText = new String(manifestBytes, StandardCharsets.UTF_8);
                Manifest manifest = Manifest.parse(manifestText);
                verifyManifest(manifest);
                validateManifest(manifest);
                if (manifest.version <= loadedVersion) {
                    return UpdateResult.upToDate(manifest.versionName);
                }

                byte[] scriptBytes = download(
                        baseUrl + manifest.file + "?v=" + manifest.version,
                        MAX_SCRIPT_BYTES
                );
                verifyScript(manifest, scriptBytes);
                saveVerifiedBundle(manifestText, scriptBytes);
                return UpdateResult.updated(manifest.versionName, baseUrl);
            } catch (Exception error) {
                lastError = safeMessage(error);
            }
        }
        return UpdateResult.failed(lastError);
    }

    private ScriptBundle readVerifiedBundle(String slot, String origin) {
        File manifestFile = new File(cacheDirectory, slot + ".manifest.json");
        File scriptFile = new File(cacheDirectory, slot + ".js");
        if (!manifestFile.isFile() || !scriptFile.isFile()) return null;
        try {
            String manifestText = new String(
                    readFile(manifestFile, MAX_MANIFEST_BYTES),
                    StandardCharsets.UTF_8
            );
            Manifest manifest = Manifest.parse(manifestText);
            verifyManifest(manifest);
            validateManifest(manifest);
            byte[] scriptBytes = readFile(scriptFile, MAX_SCRIPT_BYTES);
            verifyScript(manifest, scriptBytes);
            return new ScriptBundle(
                    new String(scriptBytes, StandardCharsets.UTF_8),
                    manifest.version,
                    manifest.versionName,
                    origin
            );
        } catch (Exception ignored) {
            deleteQuietly(manifestFile);
            deleteQuietly(scriptFile);
            return null;
        }
    }

    private void saveVerifiedBundle(String manifestText, byte[] scriptBytes) throws IOException {
        if (!cacheDirectory.exists() && !cacheDirectory.mkdirs() && !cacheDirectory.isDirectory()) {
            throw new IOException("无法创建脚本缓存目录");
        }

        File currentManifest = new File(cacheDirectory, "current.manifest.json");
        File currentScript = new File(cacheDirectory, "current.js");
        File previousManifest = new File(cacheDirectory, "previous.manifest.json");
        File previousScript = new File(cacheDirectory, "previous.js");
        File temporaryManifest = new File(cacheDirectory, "current.manifest.json.tmp");
        File temporaryScript = new File(cacheDirectory, "current.js.tmp");

        writeFile(temporaryManifest, manifestText.getBytes(StandardCharsets.UTF_8));
        writeFile(temporaryScript, scriptBytes);

        if (currentManifest.isFile() && currentScript.isFile()) {
            copyFile(currentManifest, previousManifest);
            copyFile(currentScript, previousScript);
        }
        replaceFile(temporaryManifest, currentManifest);
        replaceFile(temporaryScript, currentScript);
    }

    private void verifyManifest(Manifest manifest) throws Exception {
        if (!"SHA256withECDSA".equals(manifest.signatureAlgorithm)) {
            throw new SecurityException("不支持的清单签名算法");
        }
        byte[] keyBytes = Base64.decode(PUBLIC_KEY_DER_BASE64, Base64.DEFAULT);
        PublicKey publicKey = KeyFactory.getInstance("EC")
                .generatePublic(new X509EncodedKeySpec(keyBytes));
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(publicKey);
        verifier.update(manifest.canonical().getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(Base64.decode(manifest.signature, Base64.DEFAULT))) {
            throw new SecurityException("远程脚本清单签名无效");
        }
    }

    private void validateManifest(Manifest manifest) {
        if (manifest.schemaVersion != 1) throw new SecurityException("清单版本不受支持");
        if (!"stable".equals(manifest.channel)) throw new SecurityException("脚本通道无效");
        if (manifest.version <= 0) throw new SecurityException("脚本版本无效");
        if (manifest.minAppVersion > APP_VERSION_CODE) {
            throw new SecurityException("脚本需要更新客户端");
        }
        if (manifest.size <= 0 || manifest.size > MAX_SCRIPT_BYTES) {
            throw new SecurityException("脚本大小无效");
        }
        if (!manifest.sha256.matches("[0-9a-fA-F]{64}")) {
            throw new SecurityException("脚本摘要格式无效");
        }
        if (!manifest.file.matches("[A-Za-z0-9._-]+\\.js")) {
            throw new SecurityException("脚本文件名无效");
        }
    }

    private void verifyScript(Manifest manifest, byte[] scriptBytes) throws Exception {
        if (scriptBytes.length != manifest.size) {
            throw new SecurityException("脚本大小校验失败");
        }
        byte[] actual = MessageDigest.getInstance("SHA-256").digest(scriptBytes);
        byte[] expected = hexToBytes(manifest.sha256);
        if (!MessageDigest.isEqual(actual, expected)) {
            throw new SecurityException("脚本完整性校验失败");
        }
    }

    private byte[] download(String address, int maximumBytes) throws IOException {
        URL url = new URL(address);
        if (!"https".equalsIgnoreCase(url.getProtocol())) {
            throw new IOException("拒绝非 HTTPS 更新源");
        }

        HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
        connection.setConnectTimeout(4000);
        connection.setReadTimeout(7000);
        connection.setUseCaches(false);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept", "application/json, text/javascript, */*");
        connection.setRequestProperty("Cache-Control", "no-cache");
        connection.setRequestProperty("User-Agent", "QuickWeb/2 Android");
        try {
            int status = connection.getResponseCode();
            if (status != HttpsURLConnection.HTTP_OK) {
                throw new IOException("更新源返回 HTTP " + status);
            }
            try (InputStream input = connection.getInputStream()) {
                return readLimited(input, maximumBytes);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static byte[] readLimited(InputStream input, int maximumBytes) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > maximumBytes) throw new IOException("下载内容超过允许大小");
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private static byte[] readFile(File file, int maximumBytes) throws IOException {
        try (InputStream input = new FileInputStream(file)) {
            return readLimited(input, maximumBytes);
        }
    }

    private static void writeFile(File file, byte[] bytes) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
            output.flush();
            output.getFD().sync();
        }
    }

    private static void copyFile(File source, File destination) throws IOException {
        try (FileInputStream input = new FileInputStream(source);
             FileOutputStream output = new FileOutputStream(destination)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            output.flush();
            output.getFD().sync();
        }
    }

    private static void replaceFile(File source, File destination) throws IOException {
        if (destination.exists() && !destination.delete()) {
            throw new IOException("无法替换旧缓存文件");
        }
        if (!source.renameTo(destination)) {
            copyFile(source, destination);
            deleteQuietly(source);
        }
    }

    private static void deleteQuietly(File file) {
        try {
            if (file != null && file.exists()) file.delete();
        } catch (Exception ignored) {
        }
    }

    private static byte[] hexToBytes(String text) {
        String value = text.toLowerCase(Locale.ROOT);
        byte[] result = new byte[value.length() / 2];
        for (int i = 0; i < result.length; i++) {
            int high = Character.digit(value.charAt(i * 2), 16);
            int low = Character.digit(value.charAt(i * 2 + 1), 16);
            if (high < 0 || low < 0) throw new IllegalArgumentException("摘要格式无效");
            result[i] = (byte) ((high << 4) | low);
        }
        return result;
    }

    private static String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty()
                ? error.getClass().getSimpleName()
                : message;
    }

    interface UpdateCallback {
        void onCompleted(UpdateResult result);
    }

    static final class ScriptBundle {
        final String source;
        final int version;
        final String versionName;
        final String origin;

        ScriptBundle(String source, int version, String versionName, String origin) {
            this.source = source;
            this.version = version;
            this.versionName = versionName;
            this.origin = origin;
        }
    }

    static final class UpdateResult {
        final boolean updated;
        final boolean success;
        final String versionName;
        final String message;

        private UpdateResult(boolean updated, boolean success, String versionName, String message) {
            this.updated = updated;
            this.success = success;
            this.versionName = versionName;
            this.message = message;
        }

        static UpdateResult updated(String versionName, String source) {
            return new UpdateResult(true, true, versionName, "更新来源：" + source);
        }

        static UpdateResult upToDate(String versionName) {
            return new UpdateResult(false, true, versionName, "已是最新版本");
        }

        static UpdateResult failed(String message) {
            return new UpdateResult(false, false, "", message);
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

        Manifest(int schemaVersion, String channel, int version, String versionName,
                 String file, String sha256, int size, int minAppVersion,
                 String publishedAt, String signatureAlgorithm, String signature) {
            this.schemaVersion = schemaVersion;
            this.channel = channel;
            this.version = version;
            this.versionName = versionName;
            this.file = file;
            this.sha256 = sha256;
            this.size = size;
            this.minAppVersion = minAppVersion;
            this.publishedAt = publishedAt;
            this.signatureAlgorithm = signatureAlgorithm;
            this.signature = signature;
        }

        static Manifest parse(String jsonText) throws Exception {
            JSONObject object = new JSONObject(jsonText);
            return new Manifest(
                    object.getInt("schemaVersion"),
                    object.getString("channel"),
                    object.getInt("version"),
                    object.getString("versionName"),
                    object.getString("file"),
                    object.getString("sha256"),
                    object.getInt("size"),
                    object.getInt("minAppVersion"),
                    object.getString("publishedAt"),
                    object.getString("signatureAlgorithm"),
                    object.getString("signature")
            );
        }

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
    }
}
