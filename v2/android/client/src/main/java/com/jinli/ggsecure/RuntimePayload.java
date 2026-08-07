package com.jinli.ggsecure;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class RuntimePayload {
    private byte[] noname;
    private byte[] game;

    private RuntimePayload(byte[] noname, byte[] game) {
        this.noname = noname;
        this.game = game;
    }

    static RuntimePayload fromZip(byte[] zipBytes, JSONObject manifest) throws Exception {
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
        verifyRootSource(noname);

        // noname.js is now fixed in its source/release pipeline. The APK must not append
        // UI code, rebuild DOM nodes, install observers, or rewrite request hooks at runtime.
        byte[] sourceNoname = noname.clone();
        byte[] stableGame = RuntimeStabilityPatch.patchGame(game);
        Arrays.fill(noname, (byte) 0);
        Arrays.fill(game, (byte) 0);
        return new RuntimePayload(sourceNoname, stableGame);
    }

    synchronized String nonameSource() {
        ensureAlive();
        return new String(noname, java.nio.charset.StandardCharsets.UTF_8);
    }

    synchronized InputStream openGameStream() {
        ensureAlive();
        return new ByteArrayInputStream(game);
    }

    synchronized int gameSize() {
        ensureAlive();
        return game.length;
    }

    synchronized void wipe() {
        if (noname != null) Arrays.fill(noname, (byte) 0);
        if (game != null) Arrays.fill(game, (byte) 0);
        noname = null;
        game = null;
    }

    private void ensureAlive() {
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

    private static void verifyRootSource(byte[] bytes) {
        String source = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        String[] required = {
                "gg.source.ui-mobile.v5",
                "gg.source.xhr.v5",
                "gg.source.jsonp.v5",
                "gg.runtime.storage-hook.v2"
        };
        for (String marker : required) {
            if (!source.contains(marker)) {
                throw new SecurityException("控制层源文件版本过旧: " + marker);
            }
        }
        String[] forbidden = {
                "gg.runtime.experience.v4",
                "gg-v4-sheet",
                "new MutationObserver(scheduleInterfaceSync)"
        };
        for (String marker : forbidden) {
            if (source.contains(marker)) {
                throw new SecurityException("控制层仍包含运行时重构代码: " + marker);
            }
        }
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
