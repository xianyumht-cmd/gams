package com.jinli.ggsecure;

import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Locale;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Legacy runtime transport and manifest verification for the Java reference path. */
final class LegacyRuntimeLoader {
    private static final int MAX_BUNDLE_BYTES = 18 * 1024 * 1024;
    private static final String RELEASE_PUBLIC_KEY_DER_BASE64 =
            "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEfe3MtnU9YdnqKeTRhWUR8/krK8G52hi0hueAFVzCQLyTlC12pirRXlVSKskUsZWtN4IpHmsdNmc9BhfdGsZIww==";

    private final DeviceIdentity identity;
    private final RuntimeKeyManager runtimeKeyManager;
    private final LegacyLicenseProtocol protocol;

    LegacyRuntimeLoader(DeviceIdentity identity, RuntimeKeyManager runtimeKeyManager,
                        LegacyLicenseProtocol protocol) {
        this.identity = identity;
        this.runtimeKeyManager = runtimeKeyManager;
        this.protocol = protocol;
    }

    RuntimePayload load(String token) throws Exception {
        String deviceId = identity.deviceId();
        String runtimePublicKey = runtimeKeyManager.publicKeyBase64();
        String runtimeFingerprint = runtimeKeyManager.fingerprint();
        String payloadHash = DeviceIdentity.sha256Hex(token + "|" + runtimeFingerprint);

        JSONObject challengeRequest = new JSONObject()
                .put("deviceId", deviceId)
                .put("purpose", "runtime")
                .put("appVersion", LegacyLicenseProtocol.APP_VERSION);
        JSONObject challenge = protocol.postRuntime("/v2/runtime/challenge", challengeRequest);
        String nonce = challenge.getString("nonce");
        long timestamp = challenge.getLong("serverTime");
        JSONObject accessBody = protocol.signedRuntimeAccessBody(
                deviceId, token, nonce, timestamp, payloadHash,
                runtimePublicKey, runtimeFingerprint);

        JSONObject access = protocol.postRuntime("/v2/runtime/access", accessBody);
        JSONObject manifest = access.getJSONObject("manifest");
        verifyReleaseManifest(manifest);

        byte[] wrappedKey = Base64.decode(access.getString("wrappedKey"), Base64.DEFAULT);
        byte[] contentKey = runtimeKeyManager.unwrapKey(wrappedKey);
        byte[] encryptedBundle = null;
        byte[] plainZip = null;
        try {
            String bundlePath = access.optString("bundlePath", "/v2/runtime/bundle");
            encryptedBundle = RuntimeTransport.getBytes(
                    bundlePath, "Bearer " + token, MAX_BUNDLE_BYTES);
            verifyBytes(encryptedBundle, manifest.getInt("size"),
                    manifest.getString("sha256"), "加密运行包");
            plainZip = decryptBundle(encryptedBundle, contentKey,
                    Base64.decode(manifest.getString("iv"), Base64.DEFAULT),
                    manifest.getString("versionName"));
            return RuntimePayload.fromZip(plainZip, manifest);
        } finally {
            Arrays.fill(contentKey, (byte) 0);
            if (wrappedKey != null) Arrays.fill(wrappedKey, (byte) 0);
            if (encryptedBundle != null) Arrays.fill(encryptedBundle, (byte) 0);
            if (plainZip != null) Arrays.fill(plainZip, (byte) 0);
        }
    }

    private static byte[] decryptBundle(byte[] encrypted, byte[] key, byte[] iv, String version)
            throws Exception {
        if (key.length != 32 || iv.length != 12) throw new SecurityException("运行密钥无效");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
                new GCMParameterSpec(128, iv));
        cipher.updateAAD(("gg-v2-runtime|" + version).getBytes(StandardCharsets.UTF_8));
        return cipher.doFinal(encrypted);
    }

    private static void verifyReleaseManifest(JSONObject manifest) throws Exception {
        if (manifest.optInt("schemaVersion", 0) != 2) throw new SecurityException("运行清单版本无效");
        if (!"SHA256withECDSA".equals(manifest.optString("signatureAlgorithm", ""))) {
            throw new SecurityException("运行清单签名算法无效");
        }
        String[] keys = {
                "schemaVersion", "versionName", "file", "size", "sha256", "iv",
                "nonameSize", "nonameSha256", "gameSize", "gameSha256",
                "keyIv", "keyCipher", "publishedAt"
        };
        StringBuilder canonical = new StringBuilder();
        for (String key : keys) canonical.append(key).append("=")
                .append(manifest.get(key)).append("\n");

        byte[] keyBytes = Base64.decode(RELEASE_PUBLIC_KEY_DER_BASE64, Base64.DEFAULT);
        PublicKey publicKey = KeyFactory.getInstance("EC")
                .generatePublic(new X509EncodedKeySpec(keyBytes));
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(publicKey);
        verifier.update(canonical.toString().getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(Base64.decode(
                manifest.getString("signature"), Base64.DEFAULT))) {
            throw new SecurityException("运行清单签名校验失败");
        }
        if (!manifest.getString("sha256").matches("[0-9a-f]{64}")) {
            throw new SecurityException("运行清单摘要无效");
        }
        if (manifest.getInt("size") <= 0 || manifest.getInt("size") > MAX_BUNDLE_BYTES) {
            throw new SecurityException("运行包大小无效");
        }
    }

    private static void verifyBytes(byte[] bytes, int expectedSize, String expectedHash,
                                    String label) throws Exception {
        if (bytes.length != expectedSize) throw new SecurityException(label + "大小校验失败");
        String actual = DeviceIdentity.hex(MessageDigest.getInstance("SHA-256").digest(bytes));
        if (!MessageDigest.isEqual(
                actual.getBytes(StandardCharsets.US_ASCII),
                expectedHash.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.US_ASCII))) {
            throw new SecurityException(label + "完整性校验失败");
        }
    }
}
