package com.jinli.ggsecure;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;

/** Host JVM exercises the real JNI exported functions before Android packaging. */
public final class NativeRuntimeInteropSmoke {
    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return result.toString();
    }

    private static void assertEqual(Object expected, Object actual) {
        if (!expected.equals(actual)) throw new AssertionError("JNI mismatch");
    }

    public static void main(String[] paths) throws Exception {
        if (paths.length != 3) throw new IllegalArgumentException("ZIP/noname/game fixture paths required");
        String deviceId = "ab".repeat(32);
        assertEqual("activate\n1794344400\n" + deviceId +
                "\n1c1181e7f8dece465e066361d49886efa49b372e3e029fcdf21b9621e4021366",
                NativeRuntimeBridge.proofCanonical("activate", 1794344400L, deviceId,
                        "ABCDEF0123456789"));
        byte[] shared = new byte[32];
        for (int i = 0; i < shared.length; ++i) shared[i] = (byte) i;
        byte[][] derived = NativeRuntimeBridge.deliveryMaterial(shared, deviceId,
                "token-for-native-interop-123");
        assertEqual("4ecd5776b602d92360fbdbee89380954b4c61cbb2997ff459486c3f5eec32bf8",
                hex(derived[0]));
        assertEqual("gg-edgeone-runtime-v2|" + deviceId +
                "|12c8cf37bdd8499a636f604bd0e0c792419ebc37cf726cd91701ef879f5b7823",
                new String(derived[1], StandardCharsets.UTF_8));

        byte[] zip = Files.readAllBytes(Path.of(paths[0]));
        byte[] control = Files.readAllBytes(Path.of(paths[1]));
        byte[] engine = Files.readAllBytes(Path.of(paths[2]));
        String nonameHash = hex(MessageDigest.getInstance("SHA-256").digest(control));
        String gameHash = hex(MessageDigest.getInstance("SHA-256").digest(engine));
        long handle = NativeRuntimeBridge.open(zip, control.length, nonameHash,
                engine.length, gameHash);
        try {
            assertEqual(new String(control, StandardCharsets.UTF_8),
                    NativeRuntimeBridge.nonameSource(handle));
            if (!Arrays.equals(engine, NativeRuntimeBridge.gameBytes(handle)) ||
                    engine.length != NativeRuntimeBridge.gameSize(handle)) {
                throw new AssertionError("Native script bytes differ from Java runtime");
            }
        } finally {
            NativeRuntimeBridge.close(handle);
        }
        try {
            NativeRuntimeBridge.open(zip, control.length, "0".repeat(64),
                    engine.length, gameHash);
            throw new AssertionError("Invalid JS SHA-256 accepted by JNI");
        } catch (SecurityException expected) { /* Fail closed. */ }
        Arrays.fill(shared, (byte) 0);
        Arrays.fill(derived[0], (byte) 0);
        Arrays.fill(derived[1], (byte) 0);
        System.out.println("Host Java→JNI→C++ proof, HKDF and runtime ZIP parity OK");
    }
}
