package com.jinli.keygen;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String PREFS = "keygen_history";
    private static final String PREF_HISTORY = "history";
    private static final int MAX_HISTORY_LINES = 180;
    private static final String[] VALIDITY_LABELS = {"1 天", "7 天", "30 天", "90 天", "180 天", "365 天", "永久"};
    private static final int[] VALIDITY_DAYS = {1, 7, 30, 90, 180, 365, -1};
    private static final String[] COUNT_LABELS = {"1 个", "5 个", "10 个", "20 个", "50 个"};
    private static final int[] COUNTS = {1, 5, 10, 20, 50};
    private static final String[] DEVICE_LABELS = {"1 台设备", "2 台设备", "3 台设备", "5 台设备"};
    private static final int[] DEVICE_COUNTS = {1, 2, 3, 5};

    private SharedPreferences preferences;
    private AdminApiManager api;
    private TextView resultText;
    private TextView historyText;
    private String latestRawKeys = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        api = new AdminApiManager(this);
        if (api.hasSession()) showGenerator();
        else showLogin("");
    }

    private void showLogin(String initialMessage) {
        LinearLayout root = baseRoot("在线卡密管理器",
                "输入服务器管理密码后登录。卡密由服务器生成，可远程停用、续期和解绑设备。");
        EditText password = passwordInput("管理密码");
        TextView status = statusText();
        status.setText(initialMessage);
        Button login = primaryButton("登录管理端");
        root.addView(password, matchWrap(dp(18)));
        root.addView(login, matchWrap(dp(10)));
        root.addView(status, matchWrap(0));

        login.setOnClickListener(v -> {
            String value = password.getText().toString();
            if (value.isEmpty()) {
                status.setText("请输入管理密码。");
                return;
            }
            login.setEnabled(false);
            status.setTextColor(Color.rgb(55, 65, 81));
            status.setText("正在登录…");
            api.login(value, result -> {
                login.setEnabled(true);
                if (!result.success) {
                    status.setTextColor(Color.rgb(185, 28, 28));
                    status.setText(result.message);
                    return;
                }
                showGenerator();
            });
        });
        setContentView(wrap(root));
    }

    private void showGenerator() {
        LinearLayout root = baseRoot("在线卡密生成器",
                "生成的卡密立即写入服务器。默认一机一码，明文卡密只在生成时返回一次。");

        Spinner validity = spinner(VALIDITY_LABELS);
        Spinner count = spinner(COUNT_LABELS);
        Spinner devices = spinner(DEVICE_LABELS);
        EditText note = textInput("备注（可不填）", 120);
        root.addView(sectionLabel("有效期"), matchWrap(dp(6)));
        root.addView(validity, matchWrap(dp(16)));
        root.addView(sectionLabel("生成数量"), matchWrap(dp(6)));
        root.addView(count, matchWrap(dp(16)));
        root.addView(sectionLabel("允许设备数"), matchWrap(dp(6)));
        root.addView(devices, matchWrap(dp(16)));
        root.addView(note, matchWrap(dp(18)));

        Button generate = primaryButton("联网生成卡密");
        root.addView(generate, matchWrap(dp(14)));

        resultText = resultBox("尚未生成");
        root.addView(resultText, matchWrap(dp(12)));

        LinearLayout resultActions = new LinearLayout(this);
        resultActions.setOrientation(LinearLayout.HORIZONTAL);
        Button copy = secondaryButton("复制全部");
        Button share = secondaryButton("分享文本");
        resultActions.addView(copy, new LinearLayout.LayoutParams(0, dp(50), 1));
        LinearLayout.LayoutParams shareParams = new LinearLayout.LayoutParams(0, dp(50), 1);
        shareParams.setMargins(dp(10), 0, 0, 0);
        resultActions.addView(share, shareParams);
        root.addView(resultActions, matchWrap(dp(30)));

        root.addView(sectionLabel("远程管理已有卡密"), matchWrap(dp(8)));
        EditText manageKey = textInput("输入需要操作的 32 位卡密", 48);
        manageKey.setTypeface(Typeface.MONOSPACE);
        root.addView(manageKey, matchWrap(dp(10)));

        LinearLayout row1 = new LinearLayout(this);
        row1.setOrientation(LinearLayout.HORIZONTAL);
        Button disable = secondaryButton("停用");
        Button enable = secondaryButton("启用");
        Button unbind = secondaryButton("解绑设备");
        row1.addView(disable, new LinearLayout.LayoutParams(0, dp(48), 1));
        LinearLayout.LayoutParams middle = new LinearLayout.LayoutParams(0, dp(48), 1);
        middle.setMargins(dp(8), 0, dp(8), 0);
        row1.addView(enable, middle);
        row1.addView(unbind, new LinearLayout.LayoutParams(0, dp(48), 1));
        root.addView(row1, matchWrap(dp(10)));

        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        Button extend = secondaryButton("续期 30 天");
        Button permanent = secondaryButton("改为永久");
        row2.addView(extend, new LinearLayout.LayoutParams(0, dp(48), 1));
        LinearLayout.LayoutParams permanentParams = new LinearLayout.LayoutParams(0, dp(48), 1);
        permanentParams.setMargins(dp(8), 0, 0, 0);
        row2.addView(permanent, permanentParams);
        root.addView(row2, matchWrap(dp(24)));

        TextView operationStatus = statusText();
        root.addView(operationStatus, matchWrap(dp(26)));

        root.addView(sectionLabel("本机生成历史"), matchWrap(dp(8)));
        historyText = resultBox(preferences.getString(PREF_HISTORY, "暂无历史记录"));
        historyText.setTextSize(13);
        root.addView(historyText, matchWrap(dp(10)));
        Button clearHistory = secondaryButton("清空本机历史");
        Button logout = secondaryButton("退出管理登录");
        root.addView(clearHistory, matchWrap(dp(10)));
        root.addView(logout, matchWrap(0));

        generate.setOnClickListener(v -> {
            generate.setEnabled(false);
            resultText.setText("正在连接服务器生成…");
            api.createLicenses(
                    VALIDITY_DAYS[validity.getSelectedItemPosition()],
                    COUNTS[count.getSelectedItemPosition()],
                    DEVICE_COUNTS[devices.getSelectedItemPosition()],
                    note.getText().toString(),
                    result -> {
                        generate.setEnabled(true);
                        if (result.unauthorized) {
                            showLogin(result.message);
                            return;
                        }
                        if (!result.success) {
                            resultText.setText(result.message);
                            return;
                        }
                        displayGenerated(result.licenses);
                    });
        });

        copy.setOnClickListener(v -> copyLatest());
        share.setOnClickListener(v -> shareLatest());
        disable.setOnClickListener(v -> manage(manageKey, "disable", 0, operationStatus));
        enable.setOnClickListener(v -> manage(manageKey, "enable", 0, operationStatus));
        unbind.setOnClickListener(v -> manage(manageKey, "unbind", 0, operationStatus));
        extend.setOnClickListener(v -> manage(manageKey, "extend", 30, operationStatus));
        permanent.setOnClickListener(v -> manage(manageKey, "permanent", 0, operationStatus));

        clearHistory.setOnClickListener(v -> new AlertDialog.Builder(this)
                .setTitle("清空历史")
                .setMessage("只会删除本机记录，不会删除服务器上的卡密。")
                .setNegativeButton("取消", null)
                .setPositiveButton("确认清空", (dialog, which) -> {
                    preferences.edit().remove(PREF_HISTORY).apply();
                    historyText.setText("暂无历史记录");
                }).show());
        logout.setOnClickListener(v -> {
            api.logout();
            showLogin("");
        });
        setContentView(wrap(root));
    }

    private void displayGenerated(List<AdminApiManager.LicenseItem> items) {
        StringBuilder raw = new StringBuilder();
        StringBuilder display = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            AdminApiManager.LicenseItem item = items.get(i);
            if (i > 0) { raw.append('\n'); display.append('\n'); }
            raw.append(item.key);
            display.append(group(item.key));
        }
        latestRawKeys = raw.toString();
        resultText.setText(display.toString());
        String time = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(new Date());
        String entry = "[" + time + "] 数量=" + items.size() + "\n" + raw + "\n";
        String old = preferences.getString(PREF_HISTORY, "");
        String merged = trimHistory(entry + (old.isEmpty() ? "" : "\n" + old));
        preferences.edit().putString(PREF_HISTORY, merged).apply();
        historyText.setText(merged);
        Toast.makeText(this, "在线卡密生成成功", Toast.LENGTH_SHORT).show();
    }

    private void manage(EditText keyInput, String action, int days, TextView status) {
        String key = AdminApiManager.normalizeKey(keyInput.getText().toString());
        if (key.length() != 32) {
            status.setText("请输入完整的 32 位卡密。");
            return;
        }
        status.setTextColor(Color.rgb(55, 65, 81));
        status.setText("正在提交操作…");
        api.action(key, action, days, result -> {
            if (result.unauthorized) {
                showLogin(result.message);
                return;
            }
            status.setTextColor(result.success ? Color.rgb(22, 101, 52) : Color.rgb(185, 28, 28));
            status.setText(result.message);
        });
    }

    private void copyLatest() {
        if (latestRawKeys.isEmpty()) {
            Toast.makeText(this, "请先生成卡密", Toast.LENGTH_SHORT).show();
            return;
        }
        ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(ClipData.newPlainText("在线卡密", latestRawKeys));
        Toast.makeText(this, "已复制全部卡密", Toast.LENGTH_SHORT).show();
    }

    private void shareLatest() {
        if (latestRawKeys.isEmpty()) {
            Toast.makeText(this, "请先生成卡密", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("text/plain");
        intent.putExtra(Intent.EXTRA_TEXT, latestRawKeys);
        startActivity(Intent.createChooser(intent, "分享卡密"));
    }

    private String trimHistory(String value) {
        String[] lines = value.split("\\n");
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < Math.min(lines.length, MAX_HISTORY_LINES); i++) {
            if (i > 0) out.append('\n');
            out.append(lines[i]);
        }
        return out.toString();
    }

    private LinearLayout baseRoot(String titleText, String description) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(24), dp(36), dp(24), dp(36));
        root.setBackgroundColor(Color.rgb(245, 247, 251));
        TextView title = new TextView(this);
        title.setText(titleText);
        title.setTextSize(27);
        title.setTextColor(Color.rgb(17, 24, 39));
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title, matchWrap(dp(10)));
        TextView subtitle = new TextView(this);
        subtitle.setText(description);
        subtitle.setTextSize(14);
        subtitle.setTextColor(Color.rgb(75, 85, 99));
        subtitle.setLineSpacing(0, 1.25f);
        root.addView(subtitle, matchWrap(dp(28)));
        return root;
    }

    private ScrollView wrap(LinearLayout root) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return scroll;
    }

    private EditText passwordInput(String hint) {
        EditText input = textInput(hint, 128);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        return input;
    }

    private EditText textInput(String hint, int maxLength) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setSingleLine(true);
        input.setTextSize(16);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(maxLength)});
        input.setPadding(dp(14), dp(14), dp(14), dp(14));
        return input;
    }

    private Spinner spinner(String[] values) {
        Spinner spinner = new Spinner(this);
        spinner.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item, Arrays.asList(values)));
        return spinner;
    }

    private TextView sectionLabel(String text) {
        TextView label = new TextView(this);
        label.setText(text);
        label.setTextSize(15);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setTextColor(Color.rgb(31, 41, 55));
        return label;
    }

    private TextView statusText() {
        TextView status = new TextView(this);
        status.setTextSize(14);
        status.setTextColor(Color.rgb(185, 28, 28));
        status.setGravity(Gravity.CENTER);
        return status;
    }

    private TextView resultBox(String text) {
        TextView result = new TextView(this);
        result.setText(text);
        result.setTextSize(15);
        result.setTextColor(Color.rgb(17, 24, 39));
        result.setTypeface(Typeface.MONOSPACE);
        result.setTextIsSelectable(true);
        result.setPadding(dp(14), dp(14), dp(14), dp(14));
        result.setBackgroundColor(Color.rgb(238, 242, 255));
        return result;
    }

    private Button primaryButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(16);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(Color.rgb(79, 70, 229));
        return button;
    }

    private Button secondaryButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTextColor(Color.rgb(31, 41, 55));
        button.setBackgroundColor(Color.rgb(229, 231, 235));
        return button;
    }

    private LinearLayout.LayoutParams matchWrap(int bottomMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, 0, bottomMargin);
        return params;
    }

    private String group(String key) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < key.length(); i++) {
            if (i > 0 && i % 4 == 0) out.append('-');
            out.append(key.charAt(i));
        }
        return out.toString();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        if (api != null) api.shutdown();
        super.onDestroy();
    }
}
