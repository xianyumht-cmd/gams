package com.jinli.ggsecure;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.MGF1ParameterSpec;

import javax.crypto.Cipher;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;

final class RuntimeKeyManager {
    private static final String ALIAS = "gg_v2_runtime_rsa_oaep_sha1_2";

    String publicKeyBase64() throws Exception {
        return Base64.encodeToString(publicKey().getEncoded(), Base64.NO_WRAP);
    }

    String fingerprint() throws Exception {
        return DeviceIdentity.hex(MessageDigest.getInstance("SHA-256").digest(publicKey().getEncoded()));
    }

    byte[] unwrapKey(byte[] wrapped) throws Exception {
        KeyStore keyStore = keyStore();
        PrivateKey privateKey = (PrivateKey) keyStore.getKey(ALIAS, null);
        if (privateKey == null) {
            ensureKeyPair();
            privateKey = (PrivateKey) keyStore().getKey(ALIAS, null);
        }
        Cipher cipher = Cipher.getInstance("RSA/ECB/OAEPWithSHA-1AndMGF1Padding");
        OAEPParameterSpec spec = new OAEPParameterSpec(
                "SHA-1", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT);
        cipher.init(Cipher.DECRYPT_MODE, privateKey, spec);
        return cipher.doFinal(wrapped);
    }

    private PublicKey publicKey() throws Exception {
        KeyStore store = keyStore();
        java.security.cert.Certificate certificate = store.getCertificate(ALIAS);
        if (certificate == null) {
            ensureKeyPair();
            certificate = keyStore().getCertificate(ALIAS);
        }
        if (certificate == null) throw new IllegalStateException("无法创建运行密钥");
        return certificate.getPublicKey();
    }

    private void ensureKeyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_RSA, "AndroidKeyStore");
        generator.initialize(new KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(2048)
                .setDigests(KeyProperties.DIGEST_SHA1)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
                .setUserAuthenticationRequired(false)
                .build());
        generator.generateKeyPair();
    }

    private KeyStore keyStore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        return keyStore;
    }
}
