package com.jinli.ggsecure;

/** Shared API surface; only the isolated C++ candidate loads this library. */
final class NativeRuntimeBridge {
    static {
        System.loadLibrary("ggnative");
    }

    private NativeRuntimeBridge() { }

    static native long open(byte[] zip, String bundleSha, int nonameSize, String nonameSha,
                            int gameSize, String gameSha);

    static native String nonameSource(long handle);

    static native byte[] gameBytes(long handle);

    static native int gameSize(long handle);

    static native void close(long handle);

    static native String proofCanonical(String action, long epochSeconds,
                                        String deviceId, String material);

    static native int savedAuthPlan(String normalizedLicense, String savedToken);

    static native boolean shouldReactivate(String errorCode);

    static native String signedRequestJson(String action, String deviceId,
            String devicePublicKey, long requestTime, String proof,
            String credential, String deliveryPublicKey);

    /** Returns [AES-256 key, AES-GCM associated data], both newly allocated. */
    static native byte[][] deliveryMaterial(byte[] ecdhShared, String deviceId, String token);
}
