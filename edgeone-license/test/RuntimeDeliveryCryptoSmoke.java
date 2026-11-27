package com.jinli.ggsecure;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;

/** Node.js creates an ECIES fixture; this Java test decrypts it using Android runtime code. */
public final class RuntimeDeliveryCryptoSmoke {
    public static void main(String[] args) throws Exception {
        BufferedReader input = new BufferedReader(new InputStreamReader(System.in,
                StandardCharsets.UTF_8));
        PrivateKey clientPrivate = KeyFactory.getInstance("EC").generatePrivate(
                new PKCS8EncodedKeySpec(Base64.getDecoder().decode(input.readLine())));
        byte[] publicKey = Base64.getDecoder().decode(input.readLine());
        byte[] iv = Base64.getDecoder().decode(input.readLine());
        byte[] encrypted = Base64.getDecoder().decode(input.readLine());
        String deviceId = input.readLine();
        String token = input.readLine();
        byte[] expected = Base64.getDecoder().decode(input.readLine());
        byte[] actual = RuntimeDeliveryCrypto.decrypt(encrypted, clientPrivate,
                publicKey, iv, deviceId, token);
        if (!Arrays.equals(expected, actual)) throw new AssertionError("Node/Java mismatch");
        encrypted[0] ^= 1;
        try {
            RuntimeDeliveryCrypto.decrypt(encrypted, clientPrivate, publicKey, iv, deviceId, token);
            throw new AssertionError("Tampered ciphertext was accepted");
        } catch (javax.crypto.AEADBadTagException expectedFailure) {
            // Authenticated encryption must fail closed.
        }
        encrypted[0] ^= 1;
        try {
            RuntimeDeliveryCrypto.decrypt(encrypted, clientPrivate, publicKey, iv,
                    deviceId, token + "altered");
            throw new AssertionError("Wrong session was accepted");
        } catch (javax.crypto.AEADBadTagException expectedFailure) {
            // Key derivation binds a unique token to the transport.
        }
        System.out.println("Node/Java runtime transport interop OK");
    }
}
