from pathlib import Path
import re

main_path = Path('client/src/main/java/com/jinli/quickweb/MainActivity.java')
build_path = Path('client/build.gradle.kts')
main = main_path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global main
    count = main.count(old)
    if count != 1:
        raise SystemExit(f'Cannot patch {label}: expected 1 match, got {count}')
    main = main.replace(old, new, 1)

for line in [
    'import java.nio.ByteBuffer;\n',
    'import java.security.MessageDigest;\n',
    'import java.util.Locale;\n',
    'import javax.crypto.Mac;\n',
    'import javax.crypto.spec.SecretKeySpec;\n',
]:
    main = main.replace(line, '')

replace_once(
    '    private RemoteScriptManager scriptManager;\n'
    '    private boolean nativeDocumentStartEnabled;',
    '    private RemoteScriptManager scriptManager;\n'
    '    private OnlineLicenseManager onlineLicenseManager;\n'
    '    private boolean nativeDocumentStartEnabled;',
    'online manager field',
)

replace_once(
    '''    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        String savedKey = preferences.getString(PREF_KEY, "");
        LicenseResult result = LicenseCodec.validate(savedKey);
        if (result.valid && isClockValid()) {
            rememberCurrentDay();
            showBrowser(savedInstanceState);
        } else {
            String message = result.valid ? "设备日期异常，请校准系统日期后重试。" : "";
            showLicenseScreen(message);
        }
    }''',
    '''    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        onlineLicenseManager = new OnlineLicenseManager(this);
        if (onlineLicenseManager.getSavedKey().isEmpty()) {
            showLicenseScreen("");
            return;
        }
        showLicenseLoading("正在联网验证授权…");
        onlineLicenseManager.validateSavedAsync(result -> {
            if (isFinishing() || isDestroyed()) return;
            if (result.valid) {
                if (result.offline) {
                    Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
                }
                showBrowser(savedInstanceState);
            } else {
                showLicenseScreen(result.message);
            }
        });
    }

    private void showLicenseLoading(String message) {
        destroyWebView();
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(48), dp(28), dp(48));
        root.setBackgroundColor(Color.rgb(245, 247, 251));
        ProgressBar loading = new ProgressBar(this);
        root.addView(loading, new LinearLayout.LayoutParams(dp(52), dp(52)));
        TextView text = new TextView(this);
        text.setText(message);
        text.setTextSize(16);
        text.setTextColor(Color.rgb(55, 65, 81));
        text.setGravity(Gravity.CENTER);
        text.setPadding(0, dp(18), 0, 0);
        root.addView(text, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);
    }''',
    'online startup',
)

replace_once(
    '''        input.setPadding(dp(14), dp(14), dp(14), dp(14));
        root.addView(input, new LinearLayout.LayoutParams(''',
    '''        input.setPadding(dp(14), dp(14), dp(14), dp(14));
        String savedInput = onlineLicenseManager == null ? "" : onlineLicenseManager.getSavedKey();
        if (!savedInput.isEmpty()) {
            input.setText(savedInput);
            input.setSelection(input.length());
        }
        root.addView(input, new LinearLayout.LayoutParams(''',
    'saved key prefill',
)

replace_once(
    '''        activate.setOnClickListener(v -> {
            String normalized = LicenseCodec.normalize(input.getText().toString());
            LicenseResult result = LicenseCodec.validate(normalized);
            if (!result.valid) {
                status.setText(result.message);
                return;
            }
            if (!isClockValid()) {
                status.setText("设备日期异常，请校准系统日期后重试。");
                return;
            }
            preferences.edit().putString(PREF_KEY, normalized).apply();
            rememberCurrentDay();
            Toast.makeText(this,
                    result.permanent ? "永久卡密验证成功" : "卡密验证成功，到期日：" + result.expiryText,
                    Toast.LENGTH_LONG).show();
            showBrowser(null);
        });''',
    '''        activate.setOnClickListener(v -> {
            String normalized = OnlineLicenseManager.normalizeKey(input.getText().toString());
            if (normalized.length() != 32) {
                status.setText("卡密必须是 32 位。");
                return;
            }
            activate.setEnabled(false);
            paste.setEnabled(false);
            status.setTextColor(Color.rgb(55, 65, 81));
            status.setText("正在连接授权服务器…");
            onlineLicenseManager.activateAsync(normalized, result -> {
                if (isFinishing() || isDestroyed()) return;
                activate.setEnabled(true);
                paste.setEnabled(true);
                if (!result.valid) {
                    status.setTextColor(Color.rgb(185, 28, 28));
                    status.setText(result.message);
                    return;
                }
                Toast.makeText(this, result.message, Toast.LENGTH_LONG).show();
                showBrowser(null);
            });
        });''',
    'online activation',
)

replace_once(
    '''    private void showLicenseInfoDialog() {
        String key = preferences.getString(PREF_KEY, "");
        LicenseResult result = LicenseCodec.validate(key);
        String summary = result.valid
                ? (result.permanent ? "当前卡密：永久有效" : "当前卡密到期日：" + result.expiryText)
                : "当前卡密状态异常";
        summary += "\\n脚本版本：" + loadedScriptVersionName + "（" + loadedScriptOrigin + "）";
        new AlertDialog.Builder(this)
                .setTitle("卡密信息")
                .setMessage(summary + "\\n\\n退出后需要重新输入卡密。")
                .setNegativeButton("关闭", null)
                .setPositiveButton("退出卡密", (dialog, which) -> {
                    preferences.edit().remove(PREF_KEY).remove(PREF_LAST_DAY).apply();
                    showLicenseScreen("");
                })
                .show();
    }''',
    '''    private void showLicenseInfoDialog() {
        String summary = onlineLicenseManager.getStatusSummary();
        summary += "\\n脚本版本：" + loadedScriptVersionName + "（" + loadedScriptOrigin + "）";
        new AlertDialog.Builder(this)
                .setTitle("授权信息")
                .setMessage(summary + "\\n\\n退出后需要重新输入卡密。")
                .setNegativeButton("关闭", null)
                .setPositiveButton("退出卡密", (dialog, which) -> {
                    onlineLicenseManager.clear();
                    showLicenseScreen("");
                })
                .show();
    }''',
    'online license information',
)

clock_pattern = re.compile(
    r'\n    private boolean isClockValid\(\) \{.*?\n    \}\n\n'
    r'    private void rememberCurrentDay\(\) \{.*?\n    \}\n',
    re.S,
)
main, clock_count = clock_pattern.subn('\n', main, count=1)
if clock_count != 1:
    raise SystemExit(f'Cannot remove offline clock validation: got {clock_count}')

replace_once(
    '''    @Override
    protected void onDestroy() {
        if (scriptManager != null) {
            scriptManager.shutdown();
            scriptManager = null;
        }
        destroyWebView();
        super.onDestroy();
    }''',
    '''    @Override
    protected void onDestroy() {
        if (onlineLicenseManager != null) {
            onlineLicenseManager.shutdown();
            onlineLicenseManager = null;
        }
        if (scriptManager != null) {
            scriptManager.shutdown();
            scriptManager = null;
        }
        destroyWebView();
        super.onDestroy();
    }''',
    'online manager shutdown',
)

legacy_pattern = re.compile(r'\n    private static final class LicenseResult \{.*\n\}\s*$', re.S)
main, legacy_count = legacy_pattern.subn('\n}\n', main, count=1)
if legacy_count != 1:
    raise SystemExit(f'Cannot remove legacy offline codec: got {legacy_count}')

main_path.write_text(main, encoding='utf-8')

build = build_path.read_text(encoding='utf-8')
build, code_count = re.subn(r'versionCode\s*=\s*\d+', 'versionCode = 3', build, count=1)
build, name_count = re.subn(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.2.0"', build, count=1)
if code_count != 1 or name_count != 1:
    raise SystemExit('Cannot update online client version')
build_path.write_text(build, encoding='utf-8')
print('Patched client for online license validation')
