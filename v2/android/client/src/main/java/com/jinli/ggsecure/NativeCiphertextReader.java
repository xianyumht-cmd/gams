package com.jinli.ggsecure;

import java.io.IOException;
import java.io.InputStream;
import java.util.Objects;

/** Android HTTPS InputStream adapter; ciphertext size/lifetime belong to C++. */
final class NativeCiphertextReader {
    private NativeCiphertextReader() { }

    static byte[] read(InputStream input, int maximumBytes, int expectedBytes,
                       RuntimeZipReader.Listener listener) throws IOException {
        Objects.requireNonNull(input, "input");
        // Even an invalid transfer closes the HTTP stream, matching the
        // existing successful and failed RuntimeZipReader.read() paths.
        try (InputStream source = input) {
            long handle = NativeRuntimeBridge.beginEncryptedTransfer(expectedBytes, maximumBytes);
            try {
                byte[] chunk = new byte[8192];
                int lastPercent = -1;
                int count;
                while ((count = source.read(chunk)) != -1) {
                    if (count == 0) continue;
                    int received = NativeRuntimeBridge.appendEncryptedTransfer(
                            handle, chunk, 0, count);
                    int percent = (int) Math.min(100L, 100L * received / expectedBytes);
                    if (listener != null && percent > lastPercent) {
                        lastPercent = percent;
                        listener.onBytesReceived(received, expectedBytes);
                    }
                }
                return NativeRuntimeBridge.finishEncryptedTransfer(handle);
            } finally {
                // Wipes native ciphertext even when the HTTP stream, listener,
                // length validation, or Java byte-array allocation fails.
                NativeRuntimeBridge.releaseEncryptedTransfer(handle);
            }
        }
    }
}
