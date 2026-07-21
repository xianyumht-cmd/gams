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
        return new RuntimePayload(noname, game);
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
