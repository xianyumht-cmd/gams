package com.jinli.ggsecure;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureStore {
    private static final String PREFS = "gg_v2_state";
    private static final String PREF_BLOB = "payload";
    private static final String STATE_ALIAS = "gg_v2_state_aes_1";
    private static final String LEGACY_PREFS = "gg_state_v1";
    private static final String LEGACY_STATE_ALIAS = "gg_state_aes_v1";
    private static final byte FORMAT_VERSION = 1;

    private final Context context;
    private final SharedPreferences preferences;

    SecureStore(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        migrateFromV1();
        deleteLegacyRuntimeCache();
    }

    private void migrateFromV1() {
        if (!preferences.getString(PREF_BLOB, "").isEmpty()) return;
        SharedPreferences legacy = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE);
        String encoded = legacy.getString(PREF_BLOB, "");
        if (encoded == null || encoded.isEmpty()) return;
        byte[] plain = null;
        try {
            SecretKey key = existingLegacyStateKey();
            if (key == null) return;
            plain = decryptWith(encoded, key, legacyAad());
            JSONObject old = new JSONObject(new String(plain, StandardCharsets.UTF_8));
            JSONObject fresh = new JSONObject();
            String installId = old.optString("installId", "");
            String licenseKey = old.optString("licenseKey", "");
            if (!installId.isEmpty()) fresh.put("installId", installId);
            if (!licenseKey.isEmpty()) fresh.put("licenseKey", licenseKey);
            if (fresh.length() > 0) {
                saveState(fresh);
                legacy.edit().clear().commit();
            }
        } catch (Exception ignored) {
            // A failed migration simply falls back to the normal activation screen.
        } finally {
            if (plain != null) Arrays.fill(plain, (byte) 0);
        }
    }

    synchronized JSONObject loadState() {
        String encoded = preferences.getString(PREF_BLOB, "");
        if (encoded == null || encoded.isEmpty()) return new JSONObject();
        try {
            byte[] plain = decrypt(Base64.decode(encoded, Base64.NO_WRAP));
            try {
                return new JSONObject(new String(plain, StandardCharsets.UTF_8));
            } finally {
                Arrays.fill(plain, (byte) 0);
            }
        } catch (Exception error) {
            preferences.edit().remove(PREF_BLOB).commit();
            return new JSONObject();
        }
    }

    synchronized void saveState(JSONObject state) throws Exception {
        byte[] plain = state.toString().getBytes(StandardCharsets.UTF_8);
        byte[] encrypted = encrypt(plain);
        Arrays.fill(plain, (byte) 0);
        boolean ok = preferences.edit()
                .putString(PREF_BLOB, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .commit();
        Arrays.fill(encrypted, (byte) 0);
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
        Arrays.fill(ciphertext, (byte) 0);
        return output.toByteArray();
    }

    private byte[] decrypt(byte[] encrypted) throws Exception {
        return decryptWith(encrypted, stateKey(), aad());
    }

    private byte[] decryptWith(String encoded, SecretKey key, byte[] aad) throws Exception {
        byte[] encrypted = Base64.decode(encoded, Base64.NO_WRAP);
        try {
            return decryptWith(encrypted, key, aad);
        } finally {
            Arrays.fill(encrypted, (byte) 0);
        }
    }

    private byte[] decryptWith(byte[] encrypted, SecretKey key, byte[] aad) throws Exception {
        if (encrypted.length < 2 || encrypted[0] != FORMAT_VERSION) {
            throw new IllegalStateException("状态格式无效");
        }
        int ivLength = encrypted[1] & 0xff;
        if (ivLength < 12 || encrypted.length <= 2 + ivLength) {
            throw new IllegalStateException("状态格式无效");
        }
        byte[] iv = Arrays.copyOfRange(encrypted, 2, 2 + ivLength);
        byte[] ciphertext = Arrays.copyOfRange(encrypted, 2 + ivLength, encrypted.length);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
            cipher.updateAAD(aad);
            return cipher.doFinal(ciphertext);
        } finally {
            Arrays.fill(iv, (byte) 0);
            Arrays.fill(ciphertext, (byte) 0);
        }
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

    private SecretKey existingLegacyStateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        KeyStore.Entry existing = keyStore.getEntry(LEGACY_STATE_ALIAS, null);
        return existing instanceof KeyStore.SecretKeyEntry
                ? ((KeyStore.SecretKeyEntry) existing).getSecretKey()
                : null;
    }

    private byte[] aad() {
        return (context.getPackageName() + "|state|2").getBytes(StandardCharsets.UTF_8);
    }

    private byte[] legacyAad() {
        return (context.getPackageName() + "|state|1").getBytes(StandardCharsets.UTF_8);
    }

    private void deleteLegacyRuntimeCache() {
        File directory = new File(context.getFilesDir(), "runtime");
        deleteQuietly(new File(directory, "data.bin"));
        deleteQuietly(new File(directory, "data.tmp"));
        File[] remaining = directory.listFiles();
        if (remaining != null && remaining.length == 0) deleteQuietly(directory);
    }

    private static void deleteQuietly(File file) {
        try {
            if (file.exists()) file.delete();
        } catch (Exception ignored) { }
    }
}
