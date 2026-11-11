package com.jinli.ggsecure;

import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.io.InterruptedIOException;

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
        long gate = NativeRuntimeBridge.createStartupGate();
        long independentGate = NativeRuntimeBridge.createStartupGate();
        try {
            long oldTicket = NativeRuntimeBridge.beginStartupOperation(gate);
            if (!NativeRuntimeBridge.isCurrentStartupOperation(gate, oldTicket)) {
                throw new AssertionError("Native startup ticket not current");
            }
            long newerTicket = NativeRuntimeBridge.beginStartupOperation(gate);
            if (NativeRuntimeBridge.isCurrentStartupOperation(gate, oldTicket) ||
                    !NativeRuntimeBridge.isCurrentStartupOperation(gate, newerTicket)) {
                throw new AssertionError("Old startup operation accepted after replacement");
            }
            NativeRuntimeBridge.invalidateStartupGate(gate);
            if (NativeRuntimeBridge.isCurrentStartupOperation(gate, newerTicket) ||
                    NativeRuntimeBridge.isCurrentStartupOperation(gate, 0L)) {
                throw new AssertionError("Canceled request retained authorization");
            }
            long otherTicket = NativeRuntimeBridge.beginStartupOperation(independentGate);
            NativeRuntimeBridge.closeStartupGate(gate);
            if (NativeRuntimeBridge.isCurrentStartupOperation(gate, newerTicket) ||
                    !NativeRuntimeBridge.isCurrentStartupOperation(independentGate, otherTicket)) {
                throw new AssertionError("Closed startup gate disturbed another Activity");
            }
            try {
                NativeRuntimeBridge.beginStartupOperation(gate);
                throw new AssertionError("Native startup gate was reopened after close");
            } catch (SecurityException expected) { /* Closed gates cannot start new work. */ }
        } finally {
            NativeRuntimeBridge.closeStartupGate(gate);
            NativeRuntimeBridge.closeStartupGate(independentGate);
        }
        StartupGate managedGate = new StartupGate();
        long firstManaged = managedGate.begin();
        long secondManaged = managedGate.begin();
        if (managedGate.isCurrent(firstManaged) || !managedGate.isCurrent(secondManaged)) {
            throw new AssertionError("Android startup gate JNI wrapper lost cancellation");
        }
        managedGate.invalidate();
        if (managedGate.isCurrent(secondManaged)) {
            throw new AssertionError("Android logout left an old startup active");
        }
        managedGate.close();
        managedGate.close();
        if (managedGate.isCurrent(secondManaged)) {
            throw new AssertionError("Android destroyed Activity retained a startup");
        }
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
        AtomicBoolean activeDownload = new AtomicBoolean(true);
        AtomicBoolean inputClosed = new AtomicBoolean(false);
        ByteArrayInputStream canceledInput = new ByteArrayInputStream(zip) {
            @Override public void close() throws IOException {
                inputClosed.set(true);
                super.close();
            }
        };
        try {
            NativeCiphertextReader.read(canceledInput, 5_500_016, zip.length,
                    (received, expected) -> activeDownload.set(false), activeDownload::get);
            throw new AssertionError("Obsolete transfer returned native ciphertext");
        } catch (InterruptedIOException expected) { /* Canceled before decryption. */ }
        if (!inputClosed.get()) {
            throw new AssertionError("Canceled transfer leaked the HTTP input stream");
        }
        AtomicBoolean baselineActive = new AtomicBoolean(true);
        try {
            RuntimeZipReader.read(new ByteArrayInputStream(zip),
                    5_500_016, zip.length,
                    (received, expected) -> baselineActive.set(false), baselineActive::get);
            throw new AssertionError("Java baseline ignored an obsolete download");
        } catch (InterruptedIOException expected) { /* Both readers cancel. */ }
        try {
            NativeCiphertextReader.read(new ByteArrayInputStream(zip),
                    5_500_016, zip.length, null, () -> false);
            throw new AssertionError("Canceled transfer began reading ciphertext");
        } catch (InterruptedIOException expected) { /* Preflight cancellation. */ }
        long boundGate = NativeRuntimeBridge.createStartupGate();
        long boundTicket = NativeRuntimeBridge.beginStartupOperation(boundGate);
        long boundTransfer = NativeRuntimeBridge.beginAuthorizedEncryptedTransfer(
                4, 4, boundGate, boundTicket);
        try {
            NativeRuntimeBridge.appendEncryptedTransfer(boundTransfer, new byte[2], 0, 2);
            NativeRuntimeBridge.invalidateStartupGate(boundGate);
            try {
                NativeRuntimeBridge.appendEncryptedTransfer(boundTransfer, new byte[2], 0, 2);
                throw new AssertionError("C++ collector accepted stale ciphertext");
            } catch (IOException expected) { /* Native ownership gate enforced. */ }
            try {
                NativeRuntimeBridge.finishEncryptedTransfer(boundTransfer);
                throw new AssertionError("C++ collector returned stale ciphertext");
            } catch (IOException expected) { /* Stale finish also rejected. */ }
        } finally {
            NativeRuntimeBridge.releaseEncryptedTransfer(boundTransfer);
            NativeRuntimeBridge.closeStartupGate(boundGate);
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
            String controlText = new String(control, StandardCharsets.UTF_8);
            String baselineWrapper = "(function(){"
                    + "if(window.__GG_V2_CONTROL_LOADED__)return;"
                    + "window.__GG_V2_CONTROL_LOADED__=true;"
                    + "try{\n" + controlText + "\n}catch(e){"
                    + "window.__GG_V2_CONTROL_LOADED__=false;"
                    + "console.error('[GG]',e);}"
                    + "})();";
            if (!Arrays.equals(baselineWrapper.getBytes(StandardCharsets.UTF_8),
                    NativeRuntimeBridge.wrappedControlBytes(handle))) {
                throw new AssertionError("JNI WebView control wrapper differs from Java baseline");
            }
            if (!NativeRuntimeBridge.directEngine(true, "1.4.1-1.0.41") ||
                    NativeRuntimeBridge.directEngine(false, "1.4.1-1.0.41") ||
                    NativeRuntimeBridge.directEngine(true, "1.1.4-1.0.5")) {
                throw new AssertionError("JNI direct-engine version decision drift");
            }
            assertEqual(1, NativeRuntimeBridge.resourceRoute(true,
                    "https://c2.cgyouxi.com/website/hfplayer/bin/official/game.js", "https://v/engine.js",
                    false, "GET", "https", "c2.cgyouxi.com", null));
            assertEqual(2, NativeRuntimeBridge.resourceRoute(false,
                    "https://c2.cgyouxi.com/website/hfplayer/bin/official/game.js", "https://v/engine.js",
                    false, "GET", "https", "c2.cgyouxi.com", null));
            assertEqual(3, NativeRuntimeBridge.resourceRoute(false,
                    "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/remote-script/a.js",
                    "https://v/engine.js", false, "GET", "https", "raw.githubusercontent.com", null));
            assertEqual(4, NativeRuntimeBridge.resourceRoute(true, "https://m.66rpg.com/",
                    "https://v/engine.js", true, "GET", "https", "m.66rpg.com", "text/html"));
            assertEqual(0, NativeRuntimeBridge.resourceRoute(true, "https://m.66rpg.com/",
                    "https://v/engine.js", true, "POST", "https", "m.66rpg.com", "text/html"));
            long[][] resumeCases = {{1000, 300999}, {1000, 301000},
                    {2000, 1000}, {0, 301000}, {Long.MAX_VALUE, Long.MIN_VALUE}};
            for (long[] pair : resumeCases) {
                boolean reference = pair[0] > 0 && pair[1] - pair[0] >= 300000;
                assertEqual(reference, NativeRuntimeBridge.shouldReloadBrowser(
                        true, pair[0], pair[1], 300000));
                assertEqual(false, NativeRuntimeBridge.shouldReloadBrowser(
                        false, pair[0], pair[1], 300000));
            }
            for (String scheme : new String[]{null, "HTTP", "https", "intent", "file", ""}) {
                boolean reference = !("http".equalsIgnoreCase(scheme) ||
                        "https".equalsIgnoreCase(scheme));
                assertEqual(reference, NativeRuntimeBridge.openExternalScheme(scheme));
            }
            for (String host : new String[]{null, "m.66rpg.com", "WWW.66RPG.COM",
                    "fake.66rpg.com", ""}) {
                boolean reference = "m.66rpg.com".equalsIgnoreCase(host) ||
                        "www.66rpg.com".equalsIgnoreCase(host);
                assertEqual(reference, NativeRuntimeBridge.targetSiteHost(host));
            }
            for (String alert : new String[]{null, "脚本加载完成~", "  脚本加载完成～\n",
                    "\u3000脚本加载完成~", "脚本加载完成～～", "其它消息"}) {
                boolean reference = alert != null &&
                        "脚本加载完成~".equals(alert.trim().replace('～', '~'));
                assertEqual(reference, NativeRuntimeBridge.suppressedReadyAlert(alert));
            }
            String html = "<html><HEAD class='game'><script integrity='sha384-abc=='>"
                    + "window.location.replace('about:blank');"
                    + "location.href=\"about:blank\";</script></HEAD><body>测试</body></html>";
            byte[] nativeHtml = NativeRuntimeBridge.rewriteHtml(handle,
                    html.getBytes(StandardCharsets.UTF_8));
            byte[] javaHtml = EdgeOneHtmlCompatibility.rewrite(html,
                    new String(control, StandardCharsets.UTF_8)).getBytes(StandardCharsets.UTF_8);
            if (!Arrays.equals(javaHtml, nativeHtml)) {
                throw new AssertionError("JNI 1.4.1 HTML rewrite differs from Java baseline");
            }
            try {
                NativeRuntimeBridge.rewriteHtml(handle,
                        "<body>no head</body>".getBytes(StandardCharsets.UTF_8));
                throw new AssertionError("JNI accepted an HTML document without a head");
            } catch (IllegalArgumentException expected) { /* Same Java failure category. */ }
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
        // A closed native handle is a permanent ID tombstone. Duplicate close
        // and late WebView range requests must not dereference freed memory.
        NativeRuntimeBridge.close(handle);
        NativeRuntimeBridge.close(0L);
        try {
            NativeRuntimeBridge.gameSize(handle);
            throw new AssertionError("Closed bundle retained a readable engine");
        } catch (SecurityException expected) { /* Closed IDs cannot be resolved. */ }
        try {
            NativeRuntimeBridge.nonameSource(handle);
            throw new AssertionError("Closed bundle retained its control script");
        } catch (SecurityException expected) { /* No stale control source. */ }
        try {
            NativeRuntimeBridge.copyGameRange(handle, 0, new byte[8], 0, 8);
            throw new AssertionError("Closed bundle allowed stale range read");
        } catch (SecurityException expected) { /* No use-after-free. */ }
        long reopened = NativeRuntimeBridge.open(zip, bundleHash, control.length, nonameHash,
                engine.length, gameHash);
        if (reopened == handle) throw new AssertionError("Native ZIP handle ID was reused");
        NativeRuntimeBridge.close(reopened);

        // An authorization-bound runtime must never outlive the startup ticket
        // that verified and delivered it. This covers late WebView reads even
        // when the Java owner has not yet called wipe()/close().
        long runtimeGate = NativeRuntimeBridge.createStartupGate();
        long runtimeTicket = NativeRuntimeBridge.beginStartupOperation(runtimeGate);
        long authorized = 0;
        long renewed = 0;
        try {
            authorized = NativeRuntimeBridge.openAuthorized(zip, bundleHash,
                    control.length, nonameHash, engine.length, gameHash,
                    runtimeGate, runtimeTicket);
            assertEqual(new String(control, StandardCharsets.UTF_8),
                    NativeRuntimeBridge.nonameSource(authorized));
            if (NativeRuntimeBridge.gameSize(authorized) != engine.length ||
                    NativeRuntimeBridge.copyGameRange(authorized, 0, new byte[8], 0, 8) != 8) {
                throw new AssertionError("Authorized runtime cannot stream its engine");
            }
            NativeRuntimeBridge.wrappedControlBytes(authorized);
            NativeRuntimeBridge.rewriteHtml(authorized,
                    "<html><head></head><body></body></html>".getBytes(StandardCharsets.UTF_8));

            NativeRuntimeBridge.invalidateStartupGate(runtimeGate);
            final long obsoleteHandle = authorized;
            expectStaleRuntime(() -> NativeRuntimeBridge.gameSize(obsoleteHandle));
            expectStaleRuntime(() -> NativeRuntimeBridge.nonameSource(obsoleteHandle));
            expectStaleRuntime(() -> NativeRuntimeBridge.wrappedControlBytes(obsoleteHandle));
            expectStaleRuntime(() -> NativeRuntimeBridge.copyGameRange(
                    obsoleteHandle, 0, new byte[8], 0, 8));
            try {
                NativeRuntimeBridge.rewriteHtml(obsoleteHandle,
                        "<html><head></head></html>".getBytes(StandardCharsets.UTF_8));
                throw new AssertionError("Obsolete runtime rewrote HTML after logout");
            } catch (IllegalArgumentException expected) {
                // HTML rewriting deliberately uses the Java compatibility error type.
            }
            expectStaleRuntime(() -> NativeRuntimeBridge.openAuthorized(zip, bundleHash,
                    control.length, nonameHash, engine.length, gameHash,
                    runtimeGate, runtimeTicket));

            long nextTicket = NativeRuntimeBridge.beginStartupOperation(runtimeGate);
            expectStaleRuntime(() -> NativeRuntimeBridge.gameSize(obsoleteHandle));
            renewed = NativeRuntimeBridge.openAuthorized(zip, bundleHash,
                    control.length, nonameHash, engine.length, gameHash,
                    runtimeGate, nextTicket);
            if (renewed == authorized || NativeRuntimeBridge.gameSize(renewed) != engine.length) {
                throw new AssertionError("Renewed authorization reused an obsolete ZIP handle");
            }
            NativeRuntimeBridge.closeStartupGate(runtimeGate);
            final long closedGateHandle = renewed;
            expectStaleRuntime(() -> NativeRuntimeBridge.gameSize(closedGateHandle));
        } finally {
            NativeRuntimeBridge.close(authorized);
            NativeRuntimeBridge.close(renewed);
            NativeRuntimeBridge.closeStartupGate(runtimeGate);
        }

        long racing = NativeRuntimeBridge.open(zip, bundleHash, control.length, nonameHash,
                engine.length, gameHash);
        AtomicBoolean readerStarted = new AtomicBoolean(false);
        AtomicReference<Throwable> readerFailure = new AtomicReference<>();
        Thread readerThread = new Thread(() -> {
            byte[] target = new byte[4096];
            readerStarted.set(true);
            try {
                for (int i = 0; i < 2000; ++i) {
                    int count = NativeRuntimeBridge.copyGameRange(racing,
                            (i * 4096) % engine.length, target, 0, target.length);
                    if (count < 0 || count > target.length) {
                        throw new AssertionError("Native range returned an invalid count");
                    }
                }
            } catch (SecurityException expected) {
                // Teardown may win the race: safe rejection is the contract.
            } catch (Throwable error) {
                readerFailure.set(error);
            }
        }, "gg-jni-teardown-race");
        readerThread.start();
        while (!readerStarted.get()) Thread.yield();
        NativeRuntimeBridge.close(racing);
        readerThread.join(10_000L);
        if (readerThread.isAlive() || readerFailure.get() != null) {
            throw new AssertionError("Native bundle teardown raced with range reader",
                    readerFailure.get());
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
        System.out.println("Host Java→JNI→C++ WebView lifecycle, navigation, HTML rewrite, encrypted transfer, engine stream, HKDF and ZIP parity OK");
    }

    private static void expectStaleRuntime(Runnable operation) {
        try {
            operation.run();
            throw new AssertionError("Obsolete authorization allowed a C++ runtime operation");
        } catch (SecurityException expected) {
            // A revoked ticket rejects even if its numeric ZIP handle remains registered.
        }
    }
}
