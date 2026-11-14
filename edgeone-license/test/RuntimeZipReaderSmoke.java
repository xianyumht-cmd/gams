package com.jinli.ggsecure;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Standalone JDK smoke tests, also runnable in GitHub Actions without Android SDK. */
public final class RuntimeZipReaderSmoke {
    public static void main(String[] args) throws Exception {
        byte[] payload = new byte[102_401];
        Arrays.fill(payload, (byte) 0x5a);
        List<Integer> reported = new ArrayList<>();
        byte[] received = RuntimeZipReader.read(new ByteArrayInputStream(payload),
                150_000, payload.length, (count, total) -> {
                    if (total != payload.length) throw new AssertionError("wrong total");
                    reported.add(count);
                });
        if (!Arrays.equals(payload, received)) throw new AssertionError("download corrupted");
        if (reported.isEmpty() || reported.get(reported.size() - 1) != payload.length) {
            throw new AssertionError("final download progress missing");
        }
        for (int i = 1; i < reported.size(); i++) {
            if (reported.get(i) <= reported.get(i - 1)) throw new AssertionError("non-monotonic progress");
        }
        if (RuntimeZipReader.displayPercent(0, 100) != 0 ||
                RuntimeZipReader.displayPercent(50, 100) != 45 ||
                RuntimeZipReader.displayPercent(100, 100) != 90 ||
                RuntimeZipReader.displayPercent(120, 100) != 90 ||
                RuntimeZipReader.displayPercent(50, 0) != 0) {
            throw new AssertionError("incorrect displayed progress");
        }
        expectIOException(() -> RuntimeZipReader.read(
                new ByteArrayInputStream(payload), payload.length - 1, payload.length, null));
        expectIOException(() -> RuntimeZipReader.read(
                new ByteArrayInputStream(Arrays.copyOf(payload, 8)), 150_000, payload.length, null));
        expectIOException(() -> RuntimeZipReader.read(
                new ByteArrayInputStream(payload), 150_000, 0, null));
        System.out.println("Runtime ZIP progress smoke passed");
    }

    private static void expectIOException(ThrowingAction action) throws Exception {
        try { action.run(); }
        catch (IOException expected) { return; }
        throw new AssertionError("expected download rejection");
    }

    private interface ThrowingAction {
        void run() throws Exception;
    }
}
