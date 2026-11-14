package com.jinli.ggsecure;

import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.util.Arrays;
import java.util.Objects;
import java.util.function.BooleanSupplier;

/** Android HTTPS InputStream adapter; ciphertext size/lifetime belong to C++. */
final class NativeCiphertextReader {
    private NativeCiphertextReader() { }

    static byte[] read(InputStream input, int maximumBytes, int expectedBytes,
                       RuntimeZipReader.Listener listener) throws IOException {
        return read(input, maximumBytes, expectedBytes, listener, () -> true);
    }

    static byte[] read(InputStream input, int maximumBytes, int expectedBytes,
                       RuntimeZipReader.Listener listener, BooleanSupplier current)
            throws IOException {
        return read(input, maximumBytes, expectedBytes, listener, current, null, 0);
    }

    static byte[] read(InputStream input, int maximumBytes, int expectedBytes,
                       RuntimeZipReader.Listener listener, BooleanSupplier current,
                       StartupGate gate, long ticket) throws IOException {
        Objects.requireNonNull(input, "input");
        Objects.requireNonNull(current, "current");
        // Even an invalid transfer closes the HTTP stream, matching the
        // existing successful and failed RuntimeZipReader.read() paths.
        try (InputStream source = input) {
            long handle = gate != null
                    ? gate.beginEncryptedTransfer(expectedBytes, maximumBytes, ticket)
                    : NativeRuntimeBridge.beginEncryptedTransfer(expectedBytes, maximumBytes);
            try {
                byte[] chunk = new byte[8192];
                try {
                    int lastPercent = -1;
                    while (true) {
                        if (!current.getAsBoolean()) throw canceled();
                        int count = source.read(chunk);
                        if (!current.getAsBoolean()) throw canceled();
                        if (count == -1) break;
                        if (count == 0) continue;
                        int received = NativeRuntimeBridge.appendEncryptedTransfer(
                                handle, chunk, 0, count);
                        int percent = (int) Math.min(100L, 100L * received / expectedBytes);
                        if (listener != null && percent > lastPercent) {
                            lastPercent = percent;
                            listener.onBytesReceived(received, expectedBytes);
                        }
                    }
                    if (!current.getAsBoolean()) throw canceled();
                    byte[] completed = NativeRuntimeBridge.finishEncryptedTransfer(handle);
                    if (!current.getAsBoolean()) {
                        Arrays.fill(completed, (byte) 0);
                        throw canceled();
                    }
                    return completed;
                } finally {
                    // Short-lived Java bridge buffer may contain ciphertext;
                    // release it on canceled as well as completed requests.
                    Arrays.fill(chunk, (byte) 0);
                }
            } finally {
                // Wipes native ciphertext even when the HTTP stream, listener,
                // length validation, or Java byte-array allocation fails.
                NativeRuntimeBridge.releaseEncryptedTransfer(handle);
            }
        }
    }

    private static InterruptedIOException canceled() {
        return new InterruptedIOException("运行包下载已取消");
    }
}
