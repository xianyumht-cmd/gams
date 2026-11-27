package com.jinli.ggsecure;

import java.io.IOException;
import java.io.InputStream;
import java.util.Objects;

/**
 * A bounded Java InputStream adapter over an immutable C++ game payload.
 *
 * The reader synchronizes with RuntimePayload.wipe() on the payload object,
 * so JNI cannot dereference a released native handle. A navigation abandoned
 * after logout can fail its read with IOException, never a stale native read.
 */
final class NativeGameInputStream extends InputStream {
    interface Reader {
        int copy(int position, byte[] output, int offset, int count) throws IOException;
    }

    private static final int MAX_CHUNK = 16 * 1024;
    private final int total;
    private final byte[] single = new byte[1];
    private Reader reader;
    private int position;

    NativeGameInputStream(int total, Reader reader) {
        if (total <= 0) throw new IllegalArgumentException("Empty native engine");
        this.total = total;
        this.reader = Objects.requireNonNull(reader, "reader");
    }

    @Override
    public synchronized int read() throws IOException {
        return read(single, 0, 1) < 0 ? -1 : single[0] & 0xff;
    }

    @Override
    public synchronized int read(byte[] output, int offset, int count) throws IOException {
        Objects.requireNonNull(output, "output");
        if (offset < 0 || count < 0 || count > output.length - offset) {
            throw new IndexOutOfBoundsException();
        }
        if (reader == null) throw new IOException("运行包流已关闭");
        if (count == 0) return 0;
        if (position == total) return -1;
        int wanted = Math.min(Math.min(count, MAX_CHUNK), total - position);
        int received = reader.copy(position, output, offset, wanted);
        if (received < 1 || received > wanted) {
            throw new IOException("运行数据流提前结束");
        }
        position += received;
        return received;
    }

    @Override
    public synchronized long skip(long amount) throws IOException {
        if (reader == null) throw new IOException("运行包流已关闭");
        if (amount <= 0) return 0;
        long skipped = Math.min(amount, total - position);
        position += (int) skipped;
        return skipped;
    }

    @Override
    public synchronized int available() throws IOException {
        if (reader == null) throw new IOException("运行包流已关闭");
        return total - position;
    }

    @Override
    public synchronized void close() {
        reader = null;
    }
}
