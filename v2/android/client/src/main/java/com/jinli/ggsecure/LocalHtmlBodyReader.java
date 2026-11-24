package com.jinli.ggsecure;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.zip.GZIPInputStream;

/** Decodes bounded HTML response bodies before any text-based compatibility rewrite. */
final class LocalHtmlBodyReader {
    private LocalHtmlBodyReader() { }

    static final class Result {
        final byte[] bytes;
        final boolean gzipDecoded;

        Result(byte[] bytes, boolean gzipDecoded) {
            this.bytes = bytes;
            this.gzipDecoded = gzipDecoded;
        }
    }

    /**
     * Inspect the response bytes, not only Content-Encoding: some CDNs return
     * gzip even after the client requests identity, or omit the gzip header.
     * The limit applies to the decompressed HTML to avoid unbounded expansion.
     */
    static Result read(InputStream rawInput, int maxDecodedBytes) throws IOException {
        if (rawInput == null || maxDecodedBytes <= 0) {
            throw new IllegalArgumentException("HTML input or size limit is invalid");
        }
        BufferedInputStream buffered = new BufferedInputStream(rawInput);
        buffered.mark(2);
        int first = buffered.read();
        int second = buffered.read();
        buffered.reset();
        boolean gzip = first == 0x1f && second == 0x8b;

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (InputStream decoded = gzip ? new GZIPInputStream(buffered) : buffered) {
            byte[] chunk = new byte[8192];
            int count;
            while ((count = decoded.read(chunk)) != -1) {
                if (count > maxDecodedBytes - output.size()) {
                    throw new IOException("游戏页解压后的 HTML 超过大小限制");
                }
                output.write(chunk, 0, count);
            }
        }
        return new Result(output.toByteArray(), gzip);
    }
}
