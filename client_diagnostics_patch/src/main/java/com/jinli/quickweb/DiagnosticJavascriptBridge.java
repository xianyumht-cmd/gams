package com.jinli.quickweb;

import android.webkit.JavascriptInterface;

final class DiagnosticJavascriptBridge {
    private final DiagnosticLogger logger;

    DiagnosticJavascriptBridge(DiagnosticLogger logger) {
        this.logger = logger;
    }

    @JavascriptInterface
    public void emit(String payload) {
        logger.logBridgePayload(payload);
    }
}
