package com.jinli.ggsecure;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/** Bounded in-memory download with progress based on actual received ZIP bytes. */
final class RuntimeZipReader {
    interface Listener {
        void onBytesReceived(int received, int expected);
    }

    private RuntimeZipReader() { }

    static byte[] read(InputStream input, int maxBytes, int expectedBytes, Listener listener)
            throws IOException {
        if (expectedBytes < 1 || expectedBytes > maxBytes) {
            throw new IOException("运行包大小无效");
        }
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int received = 0;
            int lastPercent = -1;
            int size;
            while ((size = source.read(buffer)) != -1) {
                if (size == 0) continue;
                if (received > maxBytes - size) throw new IOException("云端响应超过大小限制");
                output.write(buffer, 0, size);
                received += size;
                // Only post to the UI when the actual download crosses another percent.
                int percent = (int) Math.min(100L, 100L * received / expectedBytes);
                if (listener != null && percent > lastPercent) {
                    lastPercent = percent;
                    listener.onBytesReceived(received, expectedBytes);
                }
            }
            if (received != expectedBytes) throw new IOException("运行包下载不完整");
            return output.toByteArray();
        }
    }

    /** Reserve the end of the bar for archive validation and WebView startup. */
    static int displayPercent(long received, long expected) {
        if (expected <= 0 || received < 0) return 0;
        return (int) Math.min(90L, 90L * Math.min(received, expected) / expected);
    }
}
