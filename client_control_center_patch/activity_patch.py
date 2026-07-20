from pathlib import Path
import re

path = Path("client/src/main/java/com/jinli/quickweb/MainActivity.java")
text = path.read_text(encoding="utf-8")

# The saved-start callback is already present in the v1.4 source parts. Keep this
# fallback for builds reconstructed from an older payload.
if "showBrowser(savedInstanceState, result.source);\n            if (result.updateAvailable)" not in text:
    pattern = re.compile(
        r"(?P<indent>\s*)if \(!result\.valid\) \{\s*showLicenseScreen\(result\.message\);\s*return;\s*\}\s*"
        r"if \(result\.offline\) Toast\.makeText\(this, result\.message, Toast\.LENGTH_LONG\)\.show\(\);\s*"
        r"showBrowser\(savedInstanceState, result\.source\);"
    )
    replacement = '''            if (!result.valid) {
                showLicenseScreen(result.message);
                if (result.updateRequired) showUpdateDialog(result.updateMessage, result.updateUrl, true);
                return;
            }
            if (result.offline) Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
            showBrowser(savedInstanceState, result.source);
            if (result.updateAvailable) showUpdateDialog(result.updateMessage, result.updateUrl, false);'''
    text, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise SystemExit("Cannot patch saved-start update handling")

# Activation callback.
if "showBrowser(null, result.source);\n                if (result.updateAvailable)" not in text:
    pattern = re.compile(
        r"(?P<indent>\s*)if \(!result\.valid\) \{\s*"
        r"status\.setTextColor\(Color\.rgb\(185, 28, 28\)\);\s*"
        r"status\.setText\(result\.message\);\s*return;\s*\}\s*"
        r"Toast\.makeText\(this, result\.message, Toast\.LENGTH_LONG\)\.show\(\);\s*"
        r"showBrowser\(null, result\.source\);"
    )
    replacement = '''                if (!result.valid) {
                    status.setTextColor(Color.rgb(185, 28, 28));
                    status.setText(result.message);
                    if (result.updateRequired) showUpdateDialog(result.updateMessage, result.updateUrl, true);
                    return;
                }
                Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
                showBrowser(null, result.source);
                if (result.updateAvailable) showUpdateDialog(result.updateMessage, result.updateUrl, false);'''
    text, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise SystemExit("Cannot patch activation update handling")

# Dynamic self-unbind text.
old_summary = 'summary + "\\n\\n自助更换设备会扣除6小时有效期；永久服务将在6小时后允许新设备激活。"'
new_summary = 'summary + "\\n\\n" + onlineLicenseManager.getSelfUnbindSummary()'
if new_summary not in text:
    if old_summary not in text:
        raise SystemExit("Cannot patch service policy summary")
    text = text.replace(old_summary, new_summary, 1)

old_confirm = '"当前设备将立即退出。限时服务会扣除6小时，24小时内只能自助操作一次。是否继续？"'
new_confirm = '"当前设备将立即退出。" + onlineLicenseManager.getSelfUnbindSummary() + " 是否继续？"'
if new_confirm not in text:
    if old_confirm not in text:
        raise SystemExit("Cannot patch device-change confirmation")
    text = text.replace(old_confirm, new_confirm, 1)

# Update dialog and URL launcher.
if "private void showUpdateDialog(" not in text:
    marker = "    private void showNetworkError(WebView view) {"
    if marker not in text:
        raise SystemExit("Cannot insert update dialog")
    insert = '''    private void showUpdateDialog(String message, String url, boolean required) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle(required ? "需要更新" : "发现新版本")
                .setMessage(message == null || message.trim().isEmpty() ? "发现新版本" : message)
                .setNegativeButton(required ? "关闭" : "稍后", null);
        if (url != null && !url.trim().isEmpty()) {
            builder.setPositiveButton("下载更新", (dialog, which) -> openUpdateUrl(url));
        }
        builder.show();
    }

    private void openUpdateUrl(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception error) {
            Toast.makeText(this, "无法打开更新地址", Toast.LENGTH_SHORT).show();
        }
    }

'''
    text = text.replace(marker, insert + marker, 1)

required = [
    "result.updateRequired",
    "result.updateAvailable",
    "onlineLicenseManager.getSelfUnbindSummary()",
    "private void showUpdateDialog(",
    "private void openUpdateUrl(",
]
for marker in required:
    if marker not in text:
        raise SystemExit("Incomplete activity patch: " + marker)

path.write_text(text, encoding="utf-8")
print("Applied GG v1.4 update interface")
