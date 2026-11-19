package com.jinli.ggsecure;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.SignatureException;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;
import java.util.Base64;

/** Real JCA DER→P1363→DER + native canonical/JSON for the EdgeOne Node verifier. */
public final class DeviceProofInteropSmoke {
    public static void main(String[] args) throws Exception {
        final String key = "0123456789ABCDEF0123456789ABCDEF";
        final String deviceId = "ab".repeat(32);
        final long now = 1_794_344_400L;
        final String canonical = NativeRuntimeBridge.proofCanonical("activate", now, deviceId, key);
        String expected = "activate\n" + now + "\n" + deviceId + "\n" + hex(
                MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
        if (!expected.equals(canonical)) throw new AssertionError("Native proof material drift");

        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair identity = generator.generateKeyPair();
        byte[] raw = DeviceProofCodec.sign(identity.getPrivate(), identity.getPublic(), canonical);
        if (raw.length != 64) throw new AssertionError("EdgeOne expects 64-byte P1363");
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(identity.getPublic());
        verifier.update(canonical.getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(DeviceProofCodec.p1363ToDer(raw))) {
            throw new AssertionError("P1363 signature does not verify after DER encoding");
        }
        try {
            DeviceProofCodec.derToP1363(new byte[]{0x30, 0x03, 0x02});
            throw new AssertionError("Truncated ECDSA signature accepted");
        } catch (SignatureException expectedFailure) { /* invalid DER rejected */ }
        byte[] invalid = Arrays.copyOf(raw, raw.length - 1);
        try {
            DeviceProofCodec.p1363ToDer(invalid);
            throw new AssertionError("Truncated P1363 signature accepted");
        } catch (SignatureException expectedFailure) { /* short signature rejected */ }

        String publicKey = Base64.getEncoder().encodeToString(identity.getPublic().getEncoded());
        String proof = Base64.getEncoder().encodeToString(raw);
        System.out.println(NativeRuntimeBridge.signedRequestJson(
                "activate", deviceId, publicKey, now, proof, key, ""));
        Arrays.fill(raw, (byte) 0);
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }
}
