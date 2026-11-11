package com.jinli.ggsecure;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class RuntimePayload {
    private byte[] noname;
    private byte[] game;
    private long nativeHandle;
    private final String versionName;

    private RuntimePayload(byte[] noname, byte[] game, String versionName) {
        this.noname = noname;
        this.game = game;
        this.versionName = versionName;
    }

    private RuntimePayload(long nativeHandle, String versionName) {
        this.nativeHandle = nativeHandle;
        this.versionName = versionName;
    }

    static RuntimePayload fromZip(byte[] zipBytes, JSONObject manifest) throws Exception {
        return fromZip(zipBytes, manifest, null, 0L);
    }

    static RuntimePayload fromZip(byte[] zipBytes, JSONObject manifest,
                                  StartupGate startupGate, long ticket) throws Exception {
        if (BuildConfig.GG_NATIVE_CORE) {
            String bundleSha = manifest.getString("sha256");
            int nonameSize = manifest.getInt("nonameSize");
            String nonameSha = manifest.getString("nonameSha256");
            int gameSize = manifest.getInt("gameSize");
            String gameSha = manifest.getString("gameSha256");
            long handle = startupGate != null && BuildConfig.EDGEONE_CANDIDATE
                    ? startupGate.openRuntime(zipBytes, bundleSha,
                            nonameSize, nonameSha, gameSize, gameSha, ticket)
                    : NativeRuntimeBridge.open(zipBytes, bundleSha,
                            nonameSize, nonameSha, gameSize, gameSha);
            if (handle == 0) throw new SecurityException("运行数据验证失败");
            return new RuntimePayload(handle, manifest.optString("versionName", ""));
        }
        byte[] noname = null;
        byte[] game = null;
        try (ZipInputStream input = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = input.getNextEntry()) != null) {
                String name = entry.getName();
                if ("noname.js".equals(name)) noname = readEntry(input, 2 * 1024 * 1024);
                else if ("game.js".equals(name)) game = readEntry(input, 16 * 1024 * 1024);
                input.closeEntry();
            }
        }
        if (noname == null || game == null) throw new SecurityException("运行包内容不完整");
        verify(noname, manifest.getInt("nonameSize"), manifest.getString("nonameSha256"), "控制层");
        verify(game, manifest.getInt("gameSize"), manifest.getString("gameSha256"), "引擎层");
        return new RuntimePayload(noname, game, manifest.optString("versionName", ""));
    }

    String versionName() { return versionName; }

    synchronized String nonameSource() {
        ensureAlive();
        if (BuildConfig.GG_NATIVE_CORE) return NativeRuntimeBridge.nonameSource(nativeHandle);
        return new String(noname, java.nio.charset.StandardCharsets.UTF_8);
    }

    synchronized byte[] rewriteHtml(String html) {
        ensureAlive();
        if (BuildConfig.GG_NATIVE_CORE) {
            return NativeRuntimeBridge.rewriteHtml(nativeHandle,
                    html.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        return EdgeOneHtmlCompatibility.rewrite(html, nonameSource())
                .getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    synchronized String nativeWrappedControlScript() {
        ensureAlive();
        if (!BuildConfig.GG_NATIVE_CORE) throw new IllegalStateException("Native core disabled");
        byte[] wrapped = NativeRuntimeBridge.wrappedControlBytes(nativeHandle);
        try {
            return new String(wrapped, java.nio.charset.StandardCharsets.UTF_8);
        } finally {
            java.util.Arrays.fill(wrapped, (byte) 0);
        }
    }

    synchronized InputStream openGameStream() {
        ensureAlive();
        if (BuildConfig.GG_NATIVE_CORE) {
            return new NativeGameInputStream(NativeRuntimeBridge.gameSize(nativeHandle),
                    (position, output, offset, count) -> {
                        synchronized (RuntimePayload.this) {
                            if (nativeHandle == 0) throw new IOException("运行时已经退出");
                            return NativeRuntimeBridge.copyGameRange(nativeHandle,
                                    position, output, offset, count);
                        }
                    });
        }
        return new ByteArrayInputStream(game);
    }

    synchronized int gameSize() {
        ensureAlive();
        if (BuildConfig.GG_NATIVE_CORE) return NativeRuntimeBridge.gameSize(nativeHandle);
        return game.length;
    }

    synchronized void wipe() {
        if (nativeHandle != 0) {
            NativeRuntimeBridge.close(nativeHandle);
            nativeHandle = 0;
        }
        if (noname != null) Arrays.fill(noname, (byte) 0);
        if (game != null) Arrays.fill(game, (byte) 0);
        noname = null;
        game = null;
    }

    private void ensureAlive() {
        if (BuildConfig.GG_NATIVE_CORE) {
            if (nativeHandle == 0) throw new IllegalStateException("运行数据已清除");
            return;
        }
        if (noname == null || game == null) throw new IllegalStateException("运行数据已清除");
    }

    private static byte[] readEntry(InputStream input, int maximumBytes) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > maximumBytes) throw new SecurityException("运行包条目过大");
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private static void verify(byte[] bytes, int expectedSize, String expectedHash, String label)
            throws Exception {
        if (bytes.length != expectedSize) throw new SecurityException(label + "大小校验失败");
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        String actual = DeviceIdentity.hex(digest);
        if (!MessageDigest.isEqual(
                actual.getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                expectedHash.toLowerCase(java.util.Locale.ROOT)
                        .getBytes(java.nio.charset.StandardCharsets.US_ASCII))) {
            throw new SecurityException(label + "完整性校验失败");
        }
    }
}
