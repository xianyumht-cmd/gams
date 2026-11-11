package com.jinli.ggsecure;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

/** GG-owned dialogs only; authorization and WebView actions arrive as callbacks. */
final class ClientDialogs {
    private final Activity activity;

    ClientDialogs(Activity activity) {
        this.activity = activity;
    }

    void confirmReset(Runnable onConfirmed) {
        new AlertDialog.Builder(activity)
                .setTitle(UiText.get(UiText.RESET_TITLE))
                .setMessage(UiText.get(UiText.RESET_BODY))
                .setNegativeButton(UiText.get(UiText.CANCEL), null)
                .setPositiveButton(UiText.get(UiText.CONFIRM),
                        (dialog, which) -> onConfirmed.run())
                .show();
    }

    void serviceInfo(String summary, Runnable onLogout, Runnable onDeviceChange) {
        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle(UiText.get(UiText.SERVICE_TITLE))
                .setMessage(summary)
                .setNegativeButton(UiText.get(UiText.CLOSE), null)
                .setNeutralButton(UiText.get(UiText.DEVICE_CHANGE), null)
                .setPositiveButton(UiText.get(UiText.LOGOUT),
                        (ignored, which) -> onLogout.run())
                .create();
        dialog.setOnShowListener(ignored ->
                dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v ->
                        new AlertDialog.Builder(activity)
                                .setTitle(UiText.get(UiText.CONFIRM_DEVICE_CHANGE))
                                .setMessage(UiText.get(UiText.CONFIRM_DEVICE_CHANGE_BODY))
                                .setNegativeButton(UiText.get(UiText.CANCEL), null)
                                .setPositiveButton(UiText.get(UiText.CONFIRM), (confirm, which) -> {
                                    dialog.dismiss();
                                    onDeviceChange.run();
                                })
                                .show()));
        dialog.show();
    }

    void update(String message, String url, boolean required) {
        AlertDialog.Builder builder = new AlertDialog.Builder(activity)
                .setTitle(UiText.get(required ? UiText.UPDATE_REQUIRED : UiText.UPDATE_AVAILABLE))
                .setMessage(message == null || message.trim().isEmpty()
                        ? UiText.get(UiText.UPDATE_FOUND) : message)
                .setNegativeButton(UiText.get(required ? UiText.CLOSE : UiText.LATER), null);
        if (url != null && !url.trim().isEmpty()) {
            builder.setPositiveButton(UiText.get(UiText.DOWNLOAD_UPDATE), (dialog, which) -> {
                try {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception error) {
                    Toast.makeText(activity, UiText.get(UiText.OPEN_UPDATE_FAILED),
                            Toast.LENGTH_SHORT).show();
                }
            });
        }
        builder.show();
    }
}
