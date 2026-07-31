package com.jinli.ggsecure;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
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
                if (entry.isDirectory()) {
                    input.closeEntry();
                    continue;
                }
                if ("noname.js".equals(name)) {
                    if (noname != null) throw new SecurityException("运行包包含重复控制层");
                    noname = readEntry(input, 2 * 1024 * 1024);
                } else if ("game.js".equals(name)) {
                    if (game != null) throw new SecurityException("运行包包含重复引擎层");
                    game = readEntry(input, 16 * 1024 * 1024);
                }
                input.closeEntry();
            }
        }
        if (noname == null || game == null) {
            wipeArray(noname);
            wipeArray(game);
            throw new SecurityException("运行包内容不完整");
        }
        try {
            verify(noname, manifest.getInt("nonameSize"),
                    manifest.getString("nonameSha256"), "控制层");
            verify(game, manifest.getInt("gameSize"),
                    manifest.getString("gameSha256"), "引擎层");
            return new RuntimePayload(noname, game);
        } catch (Exception error) {
            wipeArray(noname);
            wipeArray(game);
            throw error;
        }
    }

    /**
     * WebView injection ultimately requires an immutable String. This method minimizes its
     * lifetime by consuming and immediately wiping the original byte array; callers should keep
     * only the final wrapped script and clear that reference as soon as WebView owns the script.
     */
    synchronized String takeNonameSource() {
        if (noname == null) throw new IllegalStateException("控制层已读取或清除");
        String source = new String(noname, java.nio.charset.StandardCharsets.UTF_8);
        wipeArray(noname);
        noname = null;
        return source;
    }

    /**
     * Returns an isolated copy so wiping the payload cannot corrupt a WebView response in flight.
     * The copy is wiped when WebView closes the stream.
     */
    synchronized InputStream openGameStream() {
        ensureGameAlive();
        return new WipingByteArrayInputStream(Arrays.copyOf(game, game.length));
    }

    synchronized int gameSize() {
        ensureGameAlive();
        return game.length;
    }

    synchronized void wipe() {
        wipeArray(noname);
        wipeArray(game);
        noname = null;
        game = null;
    }

    private void ensureGameAlive() {
        if (game == null) throw new IllegalStateException("运行数据已清除");
    }

    private static byte[] readEntry(InputStream input, int maximumBytes) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > maximumBytes) {
                Arrays.fill(buffer, (byte) 0);
                throw new SecurityException("运行包条目过大");
            }
            output.write(buffer, 0, read);
        }
        Arrays.fill(buffer, (byte) 0);
        return output.toByteArray();
    }

    private static void verify(byte[] bytes, int expectedSize, String expectedHash, String label)
            throws Exception {
        if (expectedSize <= 0 || bytes.length != expectedSize) {
            throw new SecurityException(label + "大小校验失败");
        }
        String normalizedHash = expectedHash == null
                ? "" : expectedHash.toLowerCase(Locale.ROOT);
        if (!normalizedHash.matches("[0-9a-f]{64}")) {
            throw new SecurityException(label + "摘要格式无效");
        }
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        String actual = DeviceIdentity.hex(digest);
        Arrays.fill(digest, (byte) 0);
        if (!MessageDigest.isEqual(
                actual.getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                normalizedHash.getBytes(java.nio.charset.StandardCharsets.US_ASCII))) {
            throw new SecurityException(label + "完整性校验失败");
        }
    }

    private static void wipeArray(byte[] bytes) {
        if (bytes != null) Arrays.fill(bytes, (byte) 0);
    }

    private static final class WipingByteArrayInputStream extends ByteArrayInputStream {
        private boolean closed;

        WipingByteArrayInputStream(byte[] bytes) {
            super(bytes);
        }

        @Override
        public void close() throws IOException {
            if (!closed) {
                Arrays.fill(buf, (byte) 0);
                closed = true;
            }
            super.close();
        }
    }
}
