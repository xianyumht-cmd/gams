package com.jinli.quickweb;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureStore {
    private static final String PREFS = "gg_state_v1";
    private static final String PREF_BLOB = "payload";
    private static final String STATE_ALIAS = "gg_state_aes_v1";
    private static final String CACHE_ALIAS = "gg_cache_aes_v1";
    private static final byte FORMAT_VERSION = 1;
    private static final int MAX_CACHE_BYTES = 3 * 1024 * 1024;

    private final Context context;
    private final SharedPreferences preferences;
    private final File cacheFile;

    SecureStore(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.cacheFile = new File(new File(this.context.getFilesDir(), "runtime"), "data.bin");
        migrateLegacyState();
    }

    private void migrateLegacyState() {
        if (!preferences.getString(PREF_BLOB, "").isEmpty()) return;
        SharedPreferences legacy = context.getSharedPreferences("license_state", Context.MODE_PRIVATE);
        String installId = legacy.getString("online_install_id", "");
        String licenseKey = legacy.getString("license_key", "");
        if (installId.isEmpty() && licenseKey.isEmpty()) return;
        try {
            JSONObject state = new JSONObject();
            if (!installId.isEmpty()) state.put("installId", installId);
            if (!licenseKey.isEmpty()) state.put("licenseKey", licenseKey);
            saveState(state);
            legacy.edit().clear().commit();
        } catch (Exception ignored) { }
    }

    synchronized JSONObject loadState() {
        String encoded = preferences.getString(PREF_BLOB, "");
        if (encoded.isEmpty()) return new JSONObject();
        try {
            byte[] plain = decrypt(Base64.decode(encoded, Base64.NO_WRAP), stateKey(), "state");
            return new JSONObject(new String(plain, StandardCharsets.UTF_8));
        } catch (Exception error) {
            preferences.edit().remove(PREF_BLOB).commit();
            deleteCache();
            return new JSONObject();
        }
    }

    synchronized void saveState(JSONObject state) throws Exception {
        byte[] encrypted = encrypt(state.toString().getBytes(StandardCharsets.UTF_8), stateKey(), "state");
        if (!preferences.edit().putString(PREF_BLOB, Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit()) {
            throw new IllegalStateException("无法保存服务状态");
        }
    }

    synchronized void clearAuthorization() {
        JSONObject state = loadState();
        String installId = state.optString("installId", "");
        JSONObject fresh = new JSONObject();
        try {
            if (!installId.isEmpty()) fresh.put("installId", installId);
            saveState(fresh);
        } catch (Exception ignored) {
            preferences.edit().remove(PREF_BLOB).commit();
        }
        deleteCache();
    }

    synchronized void writeCache(JSONObject cache) throws Exception {
        File directory = cacheFile.getParentFile();
        if (!directory.exists() && !directory.mkdirs() && !directory.isDirectory()) {
            throw new IllegalStateException("无法创建运行目录");
        }
        byte[] plain = cache.toString().getBytes(StandardCharsets.UTF_8);
        byte[] encrypted = encrypt(plain, cacheKey(), "script-cache");
        File temporary = new File(directory, "data.tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(encrypted);
            output.flush();
            output.getFD().sync();
        }
        if (cacheFile.exists() && !cacheFile.delete()) throw new IllegalStateException("无法更新运行数据");
        if (!temporary.renameTo(cacheFile)) {
            try (FileInputStream input = new FileInputStream(temporary);
                 FileOutputStream output = new FileOutputStream(cacheFile)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                output.flush();
                output.getFD().sync();
            }
            temporary.delete();
        }
    }

    synchronized JSONObject readCache() {
        if (!cacheFile.isFile() || cacheFile.length() <= 0 || cacheFile.length() > MAX_CACHE_BYTES) return null;
        try (FileInputStream input = new FileInputStream(cacheFile);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_CACHE_BYTES) throw new IllegalStateException("运行数据过大");
                output.write(buffer, 0, read);
            }
            byte[] plain = decrypt(output.toByteArray(), cacheKey(), "script-cache");
            return new JSONObject(new String(plain, StandardCharsets.UTF_8));
        } catch (Exception error) {
            deleteCache();
            return null;
        }
    }

    synchronized void deleteCache() {
        try { if (cacheFile.exists()) cacheFile.delete(); } catch (Exception ignored) { }
        File temporary = new File(cacheFile.getParentFile(), "data.tmp");
        try { if (temporary.exists()) temporary.delete(); } catch (Exception ignored) { }
    }

    private SecretKey stateKey() throws Exception { return getOrCreateKey(STATE_ALIAS); }
    private SecretKey cacheKey() throws Exception { return getOrCreateKey(CACHE_ALIAS); }

    private SecretKey getOrCreateKey(String alias) throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        KeyStore.Entry existing = keyStore.getEntry(alias, null);
        if (existing instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private byte[] encrypt(byte[] plain, SecretKey key, String purpose) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        cipher.updateAAD(aad(purpose));
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(plain);
        ByteArrayOutputStream output = new ByteArrayOutputStream(2 + iv.length + ciphertext.length);
        output.write(FORMAT_VERSION);
        output.write(iv.length);
        output.write(iv);
        output.write(ciphertext);
        return output.toByteArray();
    }

    private byte[] decrypt(byte[] encrypted, SecretKey key, String purpose) throws Exception {
        if (encrypted.length < 2 || encrypted[0] != FORMAT_VERSION) throw new IllegalStateException("数据格式无效");
        int ivLength = encrypted[1] & 0xff;
        if (ivLength < 12 || encrypted.length <= 2 + ivLength) throw new IllegalStateException("数据格式无效");
        byte[] iv = new byte[ivLength];
        System.arraycopy(encrypted, 2, iv, 0, ivLength);
        byte[] ciphertext = new byte[encrypted.length - 2 - ivLength];
        System.arraycopy(encrypted, 2 + ivLength, ciphertext, 0, ciphertext.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
        cipher.updateAAD(aad(purpose));
        return cipher.doFinal(ciphertext);
    }

    private byte[] aad(String purpose) {
        return (context.getPackageName() + "|" + purpose + "|1").getBytes(StandardCharsets.UTF_8);
    }
}
