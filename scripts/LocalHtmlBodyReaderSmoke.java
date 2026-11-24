package com.jinli.ggsecure;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.zip.GZIPOutputStream;

public final class LocalHtmlBodyReaderSmoke {
    public static void main(String[] args) throws Exception {
        // Regression for the emulator log: server returned gzip despite identity.
        String homepage = "<!doctype html><html><head><title>首页</title></head><body>GG</body></html>";
        byte[] plain = homepage.getBytes(StandardCharsets.UTF_8);
        byte[] compressed = gzip(plain);
        LocalHtmlBodyReader.Result decoded = LocalHtmlBodyReader.read(
                new ByteArrayInputStream(compressed), 2 * 1024 * 1024);
        if (!decoded.gzipDecoded || !Arrays.equals(decoded.bytes, plain)) {
            throw new AssertionError("GZIP response was not decoded into original HTML");
        }
        LocalHtmlRewriter.RewriteResult rewrite = LocalHtmlRewriter.rewriteGuardFreeWithStats(
                new String(decoded.bytes, StandardCharsets.UTF_8), "window.GG_TEST=true;");
        if (rewrite.html == null || rewrite.headTags != 1 ||
                !rewrite.html.contains("<head><script>window.GG_TEST=true;</script>")) {
            throw new AssertionError("Decompressed homepage still fails HTML rewriting");
        }

        LocalHtmlBodyReader.Result uncompressed = LocalHtmlBodyReader.read(
                new ByteArrayInputStream(plain), 2 * 1024 * 1024);
        if (uncompressed.gzipDecoded || !Arrays.equals(uncompressed.bytes, plain)) {
            throw new AssertionError("Ordinary HTML must remain unchanged");
        }
        expectFailure(compressed, plain.length - 1);
        expectFailure(Arrays.copyOf(compressed, compressed.length - 4), 2 * 1024 * 1024);
        System.out.println("HTML gzip/identity decoding, rewriting and bounds tests passed");
    }

    private static byte[] gzip(byte[] source) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(buffer)) {
            gzip.write(source);
        }
        return buffer.toByteArray();
    }

    private static void expectFailure(byte[] input, int limit) throws IOException {
        try {
            LocalHtmlBodyReader.read(new ByteArrayInputStream(input), limit);
            throw new AssertionError("Invalid/oversized HTML must not be accepted");
        } catch (IOException expected) {
            // The corrupted gzip trailer or decompressed-size limit must be detected.
        }
    }
}
