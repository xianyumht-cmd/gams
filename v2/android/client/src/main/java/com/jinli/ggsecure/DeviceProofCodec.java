package com.jinli.ggsecure;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.SignatureException;

/**
 * P-256 ECDSA wire format shared by Android Keystore and EdgeOne Node crypto.
 * Android SHA256withECDSA emits ASN.1 DER; EdgeOne expects IEEE P1363 r||s.
 * This class has no Android dependency so the actual conversion is host-testable.
 */
final class DeviceProofCodec {
    private static final int FIELD = 32;

    private DeviceProofCodec() { }

    static byte[] sign(PrivateKey privateKey, PublicKey publicKey, String canonical)
            throws GeneralSecurityException {
        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(privateKey);
        signer.update(canonical.getBytes(StandardCharsets.UTF_8));
        byte[] raw = derToP1363(signer.sign());
        // Verify the *transmitted encoding*, not just the provider's original
        // DER signature. This detects a mismatched Keystore key or DER codec
        // before the authorization request reaches the server.
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(publicKey);
        verifier.update(canonical.getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(p1363ToDer(raw))) {
            throw new SignatureException("设备签名与公钥不匹配");
        }
        return raw;
    }

    static byte[] derToP1363(byte[] der) throws SignatureException {
        if (der == null || der.length < 8 || der.length > 80 || der[0] != 0x30) {
            throw new SignatureException("设备 ECDSA 签名编码无效");
        }
        int[] pos = {1};
        int sequenceLength = readLength(der, pos);
        if (sequenceLength != der.length - pos[0]) {
            throw new SignatureException("设备 ECDSA 签名长度无效");
        }
        byte[] raw = new byte[FIELD * 2];
        readInteger(der, pos, raw, 0);
        readInteger(der, pos, raw, FIELD);
        if (pos[0] != der.length) throw new SignatureException("设备 ECDSA 签名尾部无效");
        return raw;
    }

    static byte[] p1363ToDer(byte[] raw) throws SignatureException {
        if (raw == null || raw.length != FIELD * 2) {
            throw new SignatureException("设备 ECDSA 签名长度无效");
        }
        byte[] r = derInteger(raw, 0);
        byte[] s = derInteger(raw, FIELD);
        int contentLength = r.length + s.length;
        byte[] result = new byte[contentLength + 2];
        result[0] = 0x30;
        result[1] = (byte) contentLength;
        System.arraycopy(r, 0, result, 2, r.length);
        System.arraycopy(s, 0, result, 2 + r.length, s.length);
        return result;
    }

    private static int readLength(byte[] der, int[] pos) throws SignatureException {
        if (pos[0] >= der.length) throw new SignatureException("设备 ECDSA 签名截断");
        int first = der[pos[0]++] & 0xff;
        if (first < 0x80) return first;
        int count = first & 0x7f;
        if (count == 0 || count > 1 || pos[0] + count > der.length) {
            throw new SignatureException("设备 ECDSA 签名长度编码无效");
        }
        int length = der[pos[0]++] & 0xff;
        if (length < 0x80) throw new SignatureException("设备 ECDSA 签名长度不规范");
        return length;
    }

    private static void readInteger(byte[] der, int[] pos, byte[] raw, int offset)
            throws SignatureException {
        if (pos[0] >= der.length || der[pos[0]++] != 0x02) {
            throw new SignatureException("设备 ECDSA 整数标记无效");
        }
        int count = readLength(der, pos);
        if (count < 1 || count > FIELD + 1 || pos[0] + count > der.length) {
            throw new SignatureException("设备 ECDSA 整数长度无效");
        }
        int start = pos[0];
        if ((der[start] & 0x80) != 0 || (count > 1 && der[start] == 0 &&
                (der[start + 1] & 0x80) == 0)) {
            throw new SignatureException("设备 ECDSA 整数符号或前导零无效");
        }
        if (count == FIELD + 1 && der[start] != 0) {
            throw new SignatureException("设备 ECDSA 整数溢出");
        }
        int strip = count > 1 && der[start] == 0 ? 1 : 0;
        int length = count - strip;
        if (length > FIELD) throw new SignatureException("设备 ECDSA 整数溢出");
        System.arraycopy(der, start + strip, raw, offset + FIELD - length, length);
        pos[0] += count;
    }

    private static byte[] derInteger(byte[] raw, int offset) {
        int first = offset;
        while (first < offset + FIELD - 1 && raw[first] == 0) first++;
        int count = offset + FIELD - first;
        boolean prefixZero = (raw[first] & 0x80) != 0;
        byte[] result = new byte[count + (prefixZero ? 3 : 2)];
        result[0] = 0x02;
        result[1] = (byte) (count + (prefixZero ? 1 : 0));
        System.arraycopy(raw, first, result, prefixZero ? 3 : 2, count);
        return result;
    }
}
