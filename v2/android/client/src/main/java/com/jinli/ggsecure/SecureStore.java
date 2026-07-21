package com.jinli.ggsecure;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureStore {
    private static final String PREFS = "gg_v2_state";
    private static final String PREF_BLOB = "payload";
    private static final String STATE_ALIAS = "gg_v2_state_aes_1";
    private static final byte FORMAT_VERSION = 1;

    private final Context context;
    private final SharedPreferences preferences;

    SecureStore(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    synchronized JSONObject loadState() {
        String encoded = preferences.getString(PREF_BLOB, "");
        if (encoded == null || encoded.isEmpty()) return new JSONObject();
        try {
            byte[] plain = decrypt(Base64.decode(encoded, Base64.NO_WRAP));
            return new JSONObject(new String(plain, StandardCharsets.UTF_8));
        } catch (Exception error) {
            preferences.edit().remove(PREF_BLOB).commit();
            return new JSONObject();
        }
    }

    synchronized void saveState(JSONObject state) throws Exception {
        byte[] plain = state.toString().getBytes(StandardCharsets.UTF_8);
        byte[] encrypted = encrypt(plain);
        java.util.Arrays.fill(plain, (byte) 0);
        boolean ok = preferences.edit()
                .putString(PREF_BLOB, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .commit();
        if (!ok) throw new IllegalStateException("无法保存服务状态");
    }

    synchronized void clearAuthorization() {
        JSONObject old = loadState();
        JSONObject fresh = new JSONObject();
        try {
            String installId = old.optString("installId", "");
            if (!installId.isEmpty()) fresh.put("installId", installId);
            saveState(fresh);
        } catch (Exception ignored) {
            preferences.edit().clear().commit();
        }
    }

    private byte[] encrypt(byte[] plain) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, stateKey());
        cipher.updateAAD(aad());
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(plain);
        ByteArrayOutputStream output = new ByteArrayOutputStream(2 + iv.length + ciphertext.length);
        output.write(FORMAT_VERSION);
        output.write(iv.length);
        output.write(iv);
        output.write(ciphertext);
        return output.toByteArray();
    }

    private byte[] decrypt(byte[] encrypted) throws Exception {
        if (encrypted.length < 2 || encrypted[0] != FORMAT_VERSION) {
            throw new IllegalStateException("状态格式无效");
        }
        int ivLength = encrypted[1] & 0xff;
        if (ivLength < 12 || encrypted.length <= 2 + ivLength) {
            throw new IllegalStateException("状态格式无效");
        }
        byte[] iv = java.util.Arrays.copyOfRange(encrypted, 2, 2 + ivLength);
        byte[] ciphertext = java.util.Arrays.copyOfRange(encrypted, 2 + ivLength, encrypted.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, stateKey(), new GCMParameterSpec(128, iv));
        cipher.updateAAD(aad());
        return cipher.doFinal(ciphertext);
    }

    private SecretKey stateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        KeyStore.Entry existing = keyStore.getEntry(STATE_ALIAS, null);
        if (existing instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                STATE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private byte[] aad() {
        return (context.getPackageName() + "|state|2").getBytes(StandardCharsets.UTF_8);
    }
}
