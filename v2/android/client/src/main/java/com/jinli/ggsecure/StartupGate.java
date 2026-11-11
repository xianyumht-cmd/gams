package com.jinli.ggsecure;

/**
 * Tracks the one authorization request allowed to publish state and UI.
 * Android remains the lifecycle owner; the C++ candidate owns the generation.
 */
final class StartupGate {
    private final boolean nativeCore = BuildConfig.GG_NATIVE_CORE && BuildConfig.EDGEONE_CANDIDATE;
    private long nativeHandle;
    private long javaGeneration;
    private boolean closed;

    StartupGate() {
        if (nativeCore) nativeHandle = NativeRuntimeBridge.createStartupGate();
    }

    synchronized long begin() {
        if (closed) throw new IllegalStateException("Startup gate closed");
        if (nativeCore) return NativeRuntimeBridge.beginStartupOperation(nativeHandle);
        if (javaGeneration == Long.MAX_VALUE) {
            closed = true;
            throw new IllegalStateException("Startup ticket counter exhausted");
        }
        return ++javaGeneration;
    }

    synchronized boolean isCurrent(long ticket) {
        if (closed || ticket <= 0) return false;
        return nativeCore
                ? NativeRuntimeBridge.isCurrentStartupOperation(nativeHandle, ticket)
                : ticket == javaGeneration;
    }

    synchronized void invalidate() {
        if (closed) return;
        if (nativeCore) NativeRuntimeBridge.invalidateStartupGate(nativeHandle);
        else if (javaGeneration == Long.MAX_VALUE) closed = true;
        else ++javaGeneration;
    }

    synchronized void close() {
        if (closed) return;
        closed = true;
        if (nativeCore) {
            NativeRuntimeBridge.closeStartupGate(nativeHandle);
            nativeHandle = 0;
        }
    }
}
