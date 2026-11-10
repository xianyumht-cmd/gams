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

    /** Copies at most one bounded chunk; never returns an entire private engine buffer. */
    static native int copyGameRange(long handle, int position, byte[] output,
                                    int outputOffset, int count);

    static native int gameSize(long handle);

    static native void close(long handle);

    /** C++ owns bounded encrypted-download accumulation; JCA still decrypts. */
    static native long beginEncryptedTransfer(int expectedBytes, int maximumBytes)
            throws java.io.IOException;

    static native int appendEncryptedTransfer(long handle, byte[] bytes, int offset, int count)
            throws java.io.IOException;

    static native byte[] finishEncryptedTransfer(long handle) throws java.io.IOException;

    static native void releaseEncryptedTransfer(long handle);

    static native String proofCanonical(String action, long epochSeconds,
                                        String deviceId, String material);

    static native int savedAuthPlan(String normalizedLicense, String savedToken);

    static native String normalizeLicenseKey(String rawLicense);

    /** 0 = invalid card, 1 = activate, 2 = check saved session. */
    static native int authorizationStart(String license, String token, boolean manualActivation);

    /** False means the server requires an update before any JS is downloaded. */
    static native boolean shouldDownloadRuntime(boolean forceUpdate,
                                                int latestAppVersion, int currentAppVersion);

    /** 0 = activation screen, 1 = WebView, 2 = mandatory update dialog. */
    static native int startupPresentation(boolean valid, boolean hasRuntime,
                                          boolean updateRequired);

    static native int initializationPercent(int received, int expected);

    static native boolean shouldReactivate(String errorCode);

    static native String signedRequestJson(String action, String deviceId,
            String devicePublicKey, long requestTime, String proof,
            String credential, String deliveryPublicKey);

    /** 0 = accepted, 1 = HTTP error, 2 = JSON `ok` rejected. */
    static native int classifyApiResponse(String action, int httpStatus, boolean bodyOk);

    static native void validateAuthResponse(String token, long licenseExpiresAt,
                                            boolean permanent, int latestAppVersion);

    static native void validateDeliveryHeaders(String version, String serverPublicKey,
            String iv, String manifestBase64, String bundleSha);

    static native void validateDeliveryManifest(int size, String manifestSha,
            int nonameSize, String nonameSha, int gameSize, String gameSha,
            String headerSha);

    /** Returns [AES-256 key, AES-GCM associated data], both newly allocated. */
    static native byte[][] deliveryMaterial(byte[] ecdhShared, String deviceId, String token);
}
