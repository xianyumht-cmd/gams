from pathlib import Path

path = Path("client/src/main/java/com/jinli/quickweb/MainActivity.java")
text = path.read_text(encoding="utf-8")

def swap(old, new):
    global text
    if old not in text:
        raise SystemExit("Missing activity marker")
    text = text.replace(old, new, 1)

swap('''            if (!result.valid) {
                showLicenseScreen(result.message);
                return;
            }
            if (result.offline) Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
            showBrowser(savedInstanceState, result.source);''', '''            if (!result.valid) {
                showLicenseScreen(result.message);
                if (result.updateRequired) showUpdateDialog(result.updateMessage, result.updateUrl, true);
                return;
            }
            if (result.offline) Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
            showBrowser(savedInstanceState, result.source);
            if (result.updateAvailable) showUpdateDialog(result.updateMessage, result.updateUrl, false);''')

swap('''                if (!result.valid) {
                    status.setTextColor(Color.rgb(185, 28, 28));
                    status.setText(result.message);
                    return;
                }
                Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
                showBrowser(null, result.source);''', '''                if (!result.valid) {
                    status.setTextColor(Color.rgb(185, 28, 28));
                    status.setText(result.message);
                    if (result.updateRequired) showUpdateDialog(result.updateMessage, result.updateUrl, true);
                    return;
                }
                Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
                showBrowser(null, result.source);
                if (result.updateAvailable) showUpdateDialog(result.updateMessage, result.updateUrl, false);''')

swap('''                .setMessage(summary + "\n\n自助更换设备会扣除6小时有效期；永久服务将在6小时后允许新设备激活。")''', '''                .setMessage(summary + "\n\n" + onlineLicenseManager.getSelfUnbindSummary())''')
swap('''                        .setMessage("当前设备将立即退出。限时服务会扣除6小时，24小时内只能自助操作一次。是否继续？")''', '''                        .setMessage("当前设备将立即退出。" + onlineLicenseManager.getSelfUnbindSummary() + " 是否继续？")''')

marker = '''    private void showNetworkError(WebView view) {'''
insert = '''    private void showUpdateDialog(String message, String url, boolean required) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle(required ? "需要更新" : "发现新版本")
                .setMessage(message == null || message.trim().isEmpty() ? "发现新版本" : message)
                .setNegativeButton(required ? "关闭" : "稍后", null);
        if (url != null && !url.trim().isEmpty())
            builder.setPositiveButton("下载更新", (dialog, which) -> openUpdateUrl(url));
        builder.show();
    }

    private void openUpdateUrl(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (Exception error) { Toast.makeText(this, "无法打开更新地址", Toast.LENGTH_SHORT).show(); }
    }

'''
if marker not in text:
    raise SystemExit("Missing update insertion marker")
text = text.replace(marker, insert + marker, 1)
path.write_text(text, encoding="utf-8")
print("Applied GG v1.4 update interface")
