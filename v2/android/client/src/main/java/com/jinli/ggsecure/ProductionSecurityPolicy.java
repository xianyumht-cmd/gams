package com.jinli.ggsecure;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Debug;
import android.view.WindowManager;
import android.webkit.WebView;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.util.Locale;

/**
 * Baseline anti-analysis controls, deliberately isolated from license/runtime crypto.
 *
 * These are heuristic client-side checks, not an attestation service and not a
 * replacement for professional APK hardening. Never use a risk bit as a key
 * derivation input or as evidence of a paid license.
 */
final class ProductionSecurityPolicy {
    private ProductionSecurityPolicy() { }

    static boolean apply(Activity activity) {
        if (!BuildConfig.GG_PRODUCTION_PROTECTION) {
            // A developer-debug APK must stay observable in emulators.
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
            return true;
        }
        // Covers the entire Activity (including WebView, dialogs and recents).
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        WebView.setWebContentsDebuggingEnabled(false);
        return !isDebugged(activity) && !isRooted() && !isEmulator() && !isHooked();
    }

    static void showBlocked(Activity activity) {
        new AlertDialog.Builder(activity)
                .setTitle("安全环境校验未通过")
                .setMessage("此正式版本无法在当前设备环境中启动。请使用未修改的实体设备，或联系支持人员。")
                .setCancelable(false)
                .setPositiveButton("退出", (dialog, which) -> activity.finish())
                .show();
    }

    private static boolean isDebugged(Activity activity) {
        if ((activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            return true;
        }
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) return true;
        try (BufferedReader reader = new BufferedReader(new FileReader("/proc/self/status"))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("TracerPid:")) {
                    return Integer.parseInt(line.substring("TracerPid:".length()).trim()) != 0;
                }
            }
        } catch (IOException | NumberFormatException ignored) {
            // Debug API above remains active even when procfs is restricted.
        }
        return false;
    }

    private static boolean isRooted() {
        if (Build.TAGS != null && Build.TAGS.contains("test-keys")) return true;
        String[] paths = {
            "/system/bin/su", "/system/xbin/su", "/sbin/su",
            "/su/bin/su", "/data/local/bin/su", "/data/local/xbin/su",
            "/system/app/Superuser.apk", "/data/adb/magisk"
        };
        for (String path : paths) {
            if (new File(path).exists()) return true;
        }
        return false;
    }

    private static boolean isEmulator() {
        String fingerprint = lower(Build.FINGERPRINT);
        String model = lower(Build.MODEL);
        String hardware = lower(Build.HARDWARE);
        String product = lower(Build.PRODUCT);
        String manufacturer = lower(Build.MANUFACTURER);
        return fingerprint.startsWith("generic") || fingerprint.contains("vbox")
                || fingerprint.contains("emulator")
                || model.contains("emulator") || model.contains("android sdk")
                || hardware.contains("goldfish") || hardware.contains("ranchu")
                || product.contains("sdk_gphone") || product.contains("google_sdk")
                || manufacturer.contains("genymotion");
    }

    private static boolean isHooked() {
        String[] classes = {
            "de.robv.android.xposed.XposedBridge",
            "com.saurik.substrate.MS$2",
            "org.lsposed.lspd.core.Main"
        };
        for (String name : classes) {
            try {
                Class.forName(name, false, ProductionSecurityPolicy.class.getClassLoader());
                return true;
            } catch (ClassNotFoundException ignored) {
                // Absence is normal.
            } catch (LinkageError ignored) {
                // A broken/hidden class is not sufficient evidence by itself.
            }
        }
        try (BufferedReader reader = new BufferedReader(new FileReader("/proc/self/maps"))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String value = line.toLowerCase(Locale.ROOT);
                if (value.contains("libfrida") || value.contains("libxposed")
                        || value.contains("libsubstrate")) return true;
            }
        } catch (IOException ignored) {
            // Do not break legitimate OEM builds merely for procfs restrictions.
        }
        return false;
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}
