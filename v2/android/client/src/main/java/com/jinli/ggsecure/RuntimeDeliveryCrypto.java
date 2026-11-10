package com.jinli.ggsecure;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Cross-platform EC P-256 ECDH / HKDF-SHA256 / AES-256-GCM runtime transport. */
final class RuntimeDeliveryCrypto {
    private RuntimeDeliveryCrypto() { }

    static byte[] decrypt(byte[] encrypted, PrivateKey clientPrivateKey,
                          byte[] serverPublicKeyDer, byte[] iv, String deviceId,
                          String token) throws Exception {
        if (iv.length != 12 || encrypted.length < 17 || serverPublicKeyDer.length > 200) {
            throw new SecurityException("运行包加密参数无效");
        }
        PublicKey serverKey = KeyFactory.getInstance("EC").generatePublic(
                new X509EncodedKeySpec(serverPublicKeyDer));
        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(clientPrivateKey);
        agreement.doPhase(serverKey, true);
        byte[] shared = agreement.generateSecret();
        byte[] digest = null;
        byte[] info = null;
        byte[] prk = null;
        byte[] key = null;
        try {
            if (BuildConfig.GG_NATIVE_CORE) {
                byte[][] derived = NativeRuntimeBridge.deliveryMaterial(shared, deviceId, token);
                if (derived == null || derived.length != 2 || derived[0] == null ||
                        derived[0].length != 32 || derived[1] == null) {
                    throw new SecurityException("运行密钥派生失败");
                }
                key = derived[0];
                info = derived[1];
            } else {
                byte[] salt = "gg-edgeone-v2".getBytes(StandardCharsets.UTF_8);
                digest = MessageDigest.getInstance("SHA-256").digest(
                        token.getBytes(StandardCharsets.UTF_8));
                info = ("gg-edgeone-runtime-v2|" + deviceId + "|" + toHex(digest))
                        .getBytes(StandardCharsets.UTF_8);
                Mac mac = Mac.getInstance("HmacSHA256");
                mac.init(new SecretKeySpec(salt, "HmacSHA256"));
                prk = mac.doFinal(shared);
                mac.init(new SecretKeySpec(prk, "HmacSHA256"));
                mac.update(info);
                mac.update((byte) 1);
                key = mac.doFinal(); // HKDF-SHA256 expand, first 32-byte block.
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(128, iv));
            cipher.updateAAD(info);
            return cipher.doFinal(encrypted);
        } finally {
            Arrays.fill(shared, (byte) 0);
            if (digest != null) Arrays.fill(digest, (byte) 0);
            if (info != null) Arrays.fill(info, (byte) 0);
            if (prk != null) Arrays.fill(prk, (byte) 0);
            if (key != null) Arrays.fill(key, (byte) 0);
        }
    }

    private static String toHex(byte[] data) {
        char[] hex = "0123456789abcdef".toCharArray();
        char[] result = new char[data.length * 2];
        for (int i = 0; i < data.length; i++) {
            result[i * 2] = hex[(data[i] >> 4) & 15];
            result[i * 2 + 1] = hex[data[i] & 15];
        }
        return new String(result);
    }
}
