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
        String license = "0123456789ABCDEF0123456789ABCDEF";
        if (NativeRuntimeBridge.savedAuthPlan(license, "") != 1 ||
                NativeRuntimeBridge.savedAuthPlan(license, "savedtoken.value") != 2 ||
                NativeRuntimeBridge.savedAuthPlan(license, "bad") != 1 ||
                NativeRuntimeBridge.savedAuthPlan("invalid", "") != 0 ||
                !NativeRuntimeBridge.shouldReactivate("device_unbound") ||
                !NativeRuntimeBridge.shouldReactivate("bad_session") ||
                NativeRuntimeBridge.shouldReactivate("device_limit")) {
            throw new AssertionError("JNI licensing state policy mismatch");
        }
        String publicKey = "A".repeat(124);
        String proof = "B".repeat(88);
        String expectedRequest = "{\"deviceId\":\"" + deviceId +
                "\",\"devicePublicKey\":\"" + publicKey +
                "\",\"requestTime\":1794344400,\"proof\":\"" + proof +
                "\",\"licenseKey\":\"" + license + "\"}";
        assertEqual(expectedRequest, NativeRuntimeBridge.signedRequestJson("activate",
                deviceId, publicKey, 1794344400L, proof, license, ""));
        try {
            NativeRuntimeBridge.signedRequestJson("check", deviceId, publicKey,
                    1794344400L, proof, "bad\"token", "");
            throw new AssertionError("Untrusted JSON credential accepted");
        } catch (SecurityException expected) { /* JNI rejects unsafe tokens. */ }
        if (NativeRuntimeBridge.classifyApiResponse("activate", 200, true) != 0 ||
                NativeRuntimeBridge.classifyApiResponse("check", 200, false) != 2 ||
                NativeRuntimeBridge.classifyApiResponse("unbind", 403, true) != 1) {
            throw new AssertionError("JNI inbound JSON policy mismatch");
        }
        String session = "A".repeat(160) + "." + "a".repeat(64);
        NativeRuntimeBridge.validateAuthResponse(session, 0L, true, 12);
        try {
            NativeRuntimeBridge.validateAuthResponse("bad_session", 0L, true, 12);
            throw new AssertionError("JNI accepted a malformed server token");
        } catch (SecurityException expected) { /* Invalid server response. */ }
        String hash = "a".repeat(64);
        NativeRuntimeBridge.validateDeliveryHeaders(
                "2", "A".repeat(124), "A".repeat(16), "A".repeat(32), hash);
        NativeRuntimeBridge.validateDeliveryManifest(5120, hash, 500, hash, 4000, hash, hash);
        try {
            NativeRuntimeBridge.validateDeliveryHeaders(
                    "2", "A".repeat(124), "A".repeat(20), "A".repeat(32), hash);
            throw new AssertionError("JNI accepted an invalid GCM nonce size");
        } catch (SecurityException expected) { /* Invalid encrypted envelope. */ }
        try {
            NativeRuntimeBridge.validateDeliveryManifest(
                    5120, hash, 500, hash, 4000, hash, "b".repeat(64));
            throw new AssertionError("JNI accepted a mismatched manifest digest");
        } catch (SecurityException expected) { /* Invalid manifest. */ }
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
        String bundleHash = hex(MessageDigest.getInstance("SHA-256").digest(zip));
        long handle = NativeRuntimeBridge.open(zip, bundleHash, control.length, nonameHash,
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
            NativeRuntimeBridge.open(zip, bundleHash, control.length, "0".repeat(64),
                    engine.length, gameHash);
            throw new AssertionError("Invalid JS SHA-256 accepted by JNI");
        } catch (SecurityException expected) { /* Fail closed. */ }
        try {
            NativeRuntimeBridge.open(zip, "0".repeat(64), control.length, nonameHash,
                    engine.length, gameHash);
            throw new AssertionError("Invalid whole ZIP SHA-256 accepted by JNI");
        } catch (SecurityException expected) { /* Fail closed. */ }
        Arrays.fill(shared, (byte) 0);
        Arrays.fill(derived[0], (byte) 0);
        Arrays.fill(derived[1], (byte) 0);
        System.out.println("Host Java→JNI→C++ proof, inbound envelope, HKDF and ZIP parity OK");
    }
}
