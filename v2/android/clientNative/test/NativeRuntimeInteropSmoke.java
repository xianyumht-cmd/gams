package com.jinli.ggsecure;

import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
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
        assertEqual(license, NativeRuntimeBridge.normalizeLicenseKey(
                "01-23 45:67:89 ab cd ef 0123456789abcdef"));
        assertEqual("12AB", NativeRuntimeBridge.normalizeLicenseKey("ＧＧ12☃ab"));
        if (NativeRuntimeBridge.authorizationStart(license, "", false) != 1 ||
                NativeRuntimeBridge.authorizationStart(license, "savedtoken.value", false) != 2 ||
                NativeRuntimeBridge.authorizationStart(license, "savedtoken.value", true) != 1 ||
                NativeRuntimeBridge.authorizationStart("invalid", "savedtoken.value", true) != 0 ||
                NativeRuntimeBridge.shouldDownloadRuntime(true, 13, 12) ||
                !NativeRuntimeBridge.shouldDownloadRuntime(true, 12, 12)) {
            throw new AssertionError("JNI startup/update transitions mismatch");
        }
        for (int valid = 0; valid <= 1; valid++) {
            for (int payload = 0; payload <= 1; payload++) {
                for (int update = 0; update <= 1; update++) {
                    int expected = update == 1 ? 2 : valid == 1 && payload == 1 ? 1 : 0;
                    if (NativeRuntimeBridge.startupPresentation(
                            valid == 1, payload == 1, update == 1) != expected) {
                        throw new AssertionError("JNI startup result outcome mismatch");
                    }
                }
            }
        }
        int[][] progressCases = {{0, 0}, {-1, 100}, {1, 100}, {50, 100},
                {99, 100}, {100, 100}, {200, 100}, {2000000000, 2000000000}};
        for (int[] sample : progressCases) {
            if (NativeRuntimeBridge.initializationPercent(sample[0], sample[1]) !=
                    RuntimeZipReader.displayPercent(sample[0], sample[1])) {
                throw new AssertionError("JNI initialization progress differs from Java UI");
            }
        }
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
        final int[] finalProgress = {-1, -1};
        byte[] receivedZip = NativeCiphertextReader.read(new ByteArrayInputStream(zip),
                5_500_016, zip.length, (received, expected) -> {
                    finalProgress[0] = received;
                    finalProgress[1] = expected;
                });
        if (!Arrays.equals(zip, receivedZip) || finalProgress[0] != zip.length ||
                finalProgress[1] != zip.length) {
            throw new AssertionError("Native encrypted stream lost bytes or progress");
        }
        try {
            NativeCiphertextReader.read(new ByteArrayInputStream(
                    Arrays.copyOf(zip, zip.length - 1)), 5_500_016, zip.length, null);
            throw new AssertionError("Truncated encrypted stream accepted by native reader");
        } catch (IOException expected) { /* Exact length is mandatory. */ }
        try {
            NativeCiphertextReader.read(new ByteArrayInputStream(
                    Arrays.copyOf(zip, zip.length + 1)), 5_500_016, zip.length, null);
            throw new AssertionError("Oversized encrypted stream accepted by native reader");
        } catch (IOException expected) { /* No trailing ciphertext accepted. */ }
        long transfer = NativeRuntimeBridge.beginEncryptedTransfer(4, 4);
        try {
            try {
                NativeRuntimeBridge.appendEncryptedTransfer(transfer, new byte[4], 3, 2);
                throw new AssertionError("Native transfer read past Java input buffer");
            } catch (IOException expected) { /* Source bounds enforced by JNI. */ }
            try {
                NativeRuntimeBridge.finishEncryptedTransfer(transfer);
                throw new AssertionError("Native transfer completed without all bytes");
            } catch (IOException expected) { /* Incomplete transfer rejected. */ }
            NativeRuntimeBridge.appendEncryptedTransfer(transfer, new byte[4], 0, 4);
            if (NativeRuntimeBridge.finishEncryptedTransfer(transfer).length != 4) {
                throw new AssertionError("Native transfer complete length mismatch");
            }
            try {
                NativeRuntimeBridge.finishEncryptedTransfer(transfer);
                throw new AssertionError("Native transfer finalized twice");
            } catch (IOException expected) { /* Finish cannot repeat. */ }
        } finally {
            NativeRuntimeBridge.releaseEncryptedTransfer(transfer);
        }
        String nonameHash = hex(MessageDigest.getInstance("SHA-256").digest(control));
        String gameHash = hex(MessageDigest.getInstance("SHA-256").digest(engine));
        String bundleHash = hex(MessageDigest.getInstance("SHA-256").digest(zip));
        long handle = NativeRuntimeBridge.open(zip, bundleHash, control.length, nonameHash,
                engine.length, gameHash);
        try {
            assertEqual(new String(control, StandardCharsets.UTF_8),
                    NativeRuntimeBridge.nonameSource(handle));
            if (engine.length != NativeRuntimeBridge.gameSize(handle)) {
                throw new AssertionError("Native engine length differs from Java runtime");
            }
            NativeGameInputStream.Reader reader = (position, output, offset, count) ->
                    NativeRuntimeBridge.copyGameRange(handle, position, output, offset, count);
            try (NativeGameInputStream streamed = new NativeGameInputStream(engine.length, reader);
                 ByteArrayOutputStream collected = new ByteArrayOutputStream()) {
                if (streamed.available() != engine.length || streamed.read() != (engine[0] & 255)) {
                    throw new AssertionError("Native stream first byte/size mismatch");
                }
                collected.write(engine[0]);
                byte[] chunk = new byte[4099];
                int n;
                while ((n = streamed.read(chunk, 3, chunk.length - 3)) != -1) {
                    collected.write(chunk, 3, n);
                }
                if (!Arrays.equals(engine, collected.toByteArray()) || streamed.available() != 0 ||
                        streamed.read(new byte[0], 0, 0) != 0) {
                    throw new AssertionError("Chunked JNI stream changed engine bytes");
                }
                try (NativeGameInputStream second = new NativeGameInputStream(engine.length, reader)) {
                    if (second.skip(7) != 7 || second.read() != (engine[7] & 255)) {
                        throw new AssertionError("Independent native stream cursor mismatched");
                    }
                }
            }
            try (NativeGameInputStream closed = new NativeGameInputStream(engine.length, reader)) {
                closed.close();
                try {
                    closed.read();
                    throw new AssertionError("Closed engine stream was readable");
                } catch (IOException expected) { /* Closed streams fail safely. */ }
            }
            try {
                NativeRuntimeBridge.copyGameRange(handle, 0, new byte[3], 2, 2);
                throw new AssertionError("JNI wrote beyond the destination array");
            } catch (SecurityException expected) { /* No out-of-bounds JNI write. */ }
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
        System.out.println("Host Java→JNI→C++ proof, encrypted transfer, engine stream, HKDF and ZIP parity OK");
    }
}
