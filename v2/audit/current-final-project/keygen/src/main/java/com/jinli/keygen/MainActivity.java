package com.jinli.keygen;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class MainActivity extends Activity {
    private AdminApiManager api;
    private JSONObject currentSettings = new J();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        api = new AdminApiManager(this);
        if (api.hasSession()) showConsole();
        else showLogin("");
    }

    private void showLogin(String initialMessage) {
        LinearLayout root = page("GG 管理器", "完整授权控制台");
        EditText password = input("管理密码", true);
        TextView status = status(initialMessage);
        Button login = primary("登录管理端");
        root.addView(password, full(dp(14)));
        root.addView(login, full(dp(10)));
        root.addView(status, full(0));
        login.setOnClickListener(v -> {
            String value = password.getText().toString();
            if (value.isEmpty()) { status.setText("请输入管理密码"); return; }
            login.setEnabled(false);
            status.setText("正在登录…");
            api.login(value, result -> {
                login.setEnabled(true);
                if (!result.success) { status.setText(result.message); return; }
                showConsole();
            });
        });
        setContentView(wrap(root));
    }

    private void showConsole() {
        LinearLayout root = page("GG 管理器", "服务器、卡密、设备、版本、安全策略和远程资源统一控制");
        TextView state = box("请选择管理模块");
        root.addView(state, full(dp(16)));

        addMenu(root, "系统总览", "查看卡密、设备、风险、版本和运行状态", this::showDashboard);
        addMenu(root, "卡密管理", "创建、搜索、详情、续期、停用、解绑和批量操作", this::showLicenseManager);
        addMenu(root, "设备管理", "查看设备详情、风险信息和撤销绑定", this::showDeviceManager);
        addMenu(root, "版本与更新", "最低版本、最新版本、强制更新和下载地址", this::showVersionSettings);
        addMenu(root, "安全策略", "会话、复检、离线、租期、解绑和风险阈值", this::showSecuritySettings);
        addMenu(root, "远程资源", "运行状态、已登记版本、暂停、恢复和回滚", this::showRuntimeManager);
        addMenu(root, "审计日志", "查看登录、激活、验证、解绑和风险记录", this::showAudit);
        addMenu(root, "配置历史", "查看配置变更并回滚历史版本", this::showSettingsHistory);

        Button revoke = danger("全局撤销全部会话");
        revoke.setOnClickListener(v -> confirmDanger(
                "全局撤销会话",
                "所有客户端当前会话将立即失效，并在下次操作时重新验证。",
                () -> api.post("/v1/admin/sessions/revoke-all", new J(), result -> {
                    toastResult(result);
                    if (result.success) showJson("撤销结果", result.data);
                })));
        root.addView(revoke, full(dp(12)));

        Button logout = secondary("退出管理登录");
        logout.setOnClickListener(v -> { api.logout(); showLogin(""); });
        root.addView(logout, full(0));
        setContentView(wrap(root));
    }

    private void addMenu(LinearLayout root, String title, String description, Runnable action) {
        Button button = secondary(title + "\n" + description);
        button.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        button.setMinHeight(dp(64));
        button.setOnClickListener(v -> action.run());
        root.addView(button, full(dp(10)));
    }

    private void showDashboard() {
        showLoading("系统总览");
        api.get("/v1/admin/dashboard", result -> handlePageResult("系统总览", result));
    }

    private void handlePageResult(String title, AdminApiManager.Result result) {
        if (result.unauthorized) { showLogin(result.message); return; }
        if (!result.success) { showErrorPage(title, result.message); return; }
        showJson(title, result.data);
    }

    private void showLoading(String title) {
        LinearLayout root = page(title, "正在读取服务器数据…");
        Button back = secondary("返回控制台");
        back.setOnClickListener(v -> showConsole());
        root.addView(back, full(0));
        setContentView(wrap(root));
    }

    private void showErrorPage(String title, String message) {
        LinearLayout root = page(title, "操作未完成");
        root.addView(status(message), full(dp(16)));
        Button back = secondary("返回控制台");
        back.setOnClickListener(v -> showConsole());
        root.addView(back, full(0));
        setContentView(wrap(root));
    }

    private void showJson(String title, JSONObject data) {
        LinearLayout root = page(title, "服务器实时数据");
        TextView output = box(pretty(data));
        output.setTextIsSelectable(true);
        root.addView(output, full(dp(14)));
        Button copy = secondary("复制内容");
        copy.setOnClickListener(v -> copyText(pretty(data)));
        Button back = secondary("返回控制台");
        back.setOnClickListener(v -> showConsole());
        root.addView(copy, full(dp(10)));
        root.addView(back, full(0));
        setContentView(wrap(root));
    }
    private void showLicenseManager() {
        LinearLayout root = page("卡密管理", "支持搜索、创建、查看详情、续期、停用、解绑和批量处理");
        EditText query = input("输入卡密预览、备注或卡密编号", false);
        TextView output = box("点击查询读取服务器卡密列表");
        Button search = primary("查询卡密");
        root.addView(query, full(dp(10)));
        root.addView(search, full(dp(12)));
        root.addView(output, full(dp(16)));
        search.setOnClickListener(v -> {
            search.setEnabled(false);
            String path = "/v1/admin/licenses?limit=100&q=" + encode(query.getText().toString());
            api.get(path, result -> {
                search.setEnabled(true);
                if (redirectUnauthorized(result)) return;
                output.setText(result.success ? pretty(result.data) : result.message);
            });
        });

        Button create = secondary("创建卡密");
        create.setOnClickListener(v -> showCreateLicenseDialog(output));
        root.addView(create, full(dp(18)));

        root.addView(section("单张卡密操作"), full(dp(8)));
        EditText keyOrId = input("输入完整卡密或卡密编号", false);
        root.addView(keyOrId, full(dp(10)));
        Button detail = secondary("查看卡密与设备详情");
        detail.setOnClickListener(v -> {
            String value = keyOrId.getText().toString().trim();
            if (value.isEmpty()) { output.setText("请输入卡密或卡密编号"); return; }
            api.get(detailPath(value), result -> {
                if (redirectUnauthorized(result)) return;
                output.setText(result.success ? pretty(result.data) : result.message);
            });
        });
        root.addView(detail, full(dp(10)));

        LinearLayout row = horizontal();
        Button disable = small("停用");
        Button enable = small("启用");
        Button unbind = small("解绑全部设备");
        row.addView(disable, weight());
        row.addView(enable, weightMargins());
        row.addView(unbind, weight());
        root.addView(row, full(dp(10)));
        disable.setOnClickListener(v -> licenseAction(keyOrId, "disable", 0L, output));
        enable.setOnClickListener(v -> licenseAction(keyOrId, "enable", 0L, output));
        unbind.setOnClickListener(v -> confirmDanger("管理员解绑", "将撤销该卡密绑定的全部设备，不会扣除有效期。",
                () -> licenseAction(keyOrId, "unbind", 0L, output)));

        LinearLayout row2 = horizontal();
        Button permanent = small("改为永久");
        Button extend = small("自定义续期");
        Button edit = small("修改参数");
        row2.addView(permanent, weight());
        row2.addView(extend, weightMargins());
        row2.addView(edit, weight());
        root.addView(row2, full(dp(16)));
        permanent.setOnClickListener(v -> licenseAction(keyOrId, "permanent", 0L, output));
        extend.setOnClickListener(v -> showExtendDialog(keyOrId, output));
        edit.setOnClickListener(v -> showLicenseEditDialog(keyOrId, output));

        root.addView(section("批量操作"), full(dp(8)));
        EditText ids = input("卡密编号，使用逗号或换行分隔，最多100个", false);
        EditText batchDays = numeric("续期天数，仅批量续期时填写");
        root.addView(ids, full(dp(10)));
        root.addView(batchDays, full(dp(10)));
        LinearLayout batchRow = horizontal();
        Button batchDisable = small("批量停用");
        Button batchEnable = small("批量启用");
        Button batchExtend = small("批量续期");
        batchRow.addView(batchDisable, weight());
        batchRow.addView(batchEnable, weightMargins());
        batchRow.addView(batchExtend, weight());
        root.addView(batchRow, full(dp(16)));
        batchDisable.setOnClickListener(v -> batchAction(ids, "disable", 0L, output));
        batchEnable.setOnClickListener(v -> batchAction(ids, "enable", 0L, output));
        batchExtend.setOnClickListener(v -> batchAction(ids, "extend", parseLong(batchDays, 30L) * 86400L, output));

        Button back = secondary("返回控制台");
        back.setOnClickListener(v -> showConsole());
        root.addView(back, full(0));
        setContentView(wrap(root));
    }

    private void showCreateLicenseDialog(TextView output) {
        LinearLayout form = dialogForm();
        EditText days = numeric("有效天数；输入 -1 表示永久有效");
        EditText count = numeric("生成数量 1-50");
        EditText devices = numeric("最多允许设备数 1-10");
        EditText note = input("备注，可留空", false);
        days.setText("30"); count.setText("1"); devices.setText("1");
        form.addView(days, full(dp(8)));
        form.addView(count, full(dp(8)));
        form.addView(devices, full(dp(8)));
        form.addView(note, full(0));
        new AlertDialog.Builder(this)
                .setTitle("创建卡密")
                .setView(form)
                .setNegativeButton("取消", null)
                .setPositiveButton("创建", (dialog, which) -> {
                    J body = new J()
                            .put("durationDays", parseLong(days, 30L))
                            .put("count", parseLong(count, 1L))
                            .put("maxDevices", parseLong(devices, 1L))
                            .put("note", note.getText().toString());
                    api.post("/v1/admin/licenses/create", body, result -> {
                        if (redirectUnauthorized(result)) return;
                        output.setText(result.success ? pretty(result.data) : result.message);
                    });
                }).show();
    }

    private void licenseAction(EditText keyOrId, String action, long seconds, TextView output) {
        String value = keyOrId.getText().toString().trim();
        if (value.isEmpty()) { output.setText("请输入卡密或卡密编号"); return; }
        J body = identifier(value).put("action", action);
        if (seconds > 0) body.put("seconds", seconds);
        api.post("/v1/admin/licenses/action", body, result -> {
            if (redirectUnauthorized(result)) return;
            output.setText(result.success ? pretty(result.data) : result.message);
        });
    }

    private void showExtendDialog(EditText keyOrId, TextView output) {
        EditText days = numeric("续期天数 1-3650");
        days.setText("30");
        new AlertDialog.Builder(this).setTitle("自定义续期").setView(days)
                .setNegativeButton("取消", null)
                .setPositiveButton("续期", (dialog, which) ->
                        licenseAction(keyOrId, "extend", parseLong(days, 30L) * 86400L, output)).show();
    }

    private void showLicenseEditDialog(EditText keyOrId, TextView output) {
        String value = keyOrId.getText().toString().trim();
        if (value.isEmpty()) { output.setText("请输入卡密或卡密编号"); return; }
        LinearLayout form = dialogForm();
        EditText note = input("新备注；留空表示不修改", false);
        EditText devices = numeric("最多允许设备数 1-10；留空不修改");
        EditText expires = input("到期时间，例如 2026-08-31 23:59；留空不修改", false);
        form.addView(note, full(dp(8)));
        form.addView(devices, full(dp(8)));
        form.addView(expires, full(0));
        new AlertDialog.Builder(this).setTitle("修改卡密参数").setView(form)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (dialog, which) -> {
                    J body = identifier(value);
                    if (!note.getText().toString().trim().isEmpty()) body.put("note", note.getText().toString());
                    if (!devices.getText().toString().trim().isEmpty()) body.put("maxDevices", parseLong(devices, 1L));
                    String expiresText = expires.getText().toString().trim();
                    if (!expiresText.isEmpty()) {
                        Long parsed = parseDateTimeSeconds(expiresText);
                        if (parsed == null) {
                            output.setText("到期时间格式不正确，请按“年-月-日 时:分”填写，例如 2026-08-31 23:59");
                            return;
                        }
                        body.put("expiresAt", parsed);
                    }
                    api.post("/v1/admin/licenses/update", body, result -> {
                        if (redirectUnauthorized(result)) return;
                        output.setText(result.success ? pretty(result.data) : result.message);
                    });
                }).show();
    }

    private void batchAction(EditText idsInput, String action, long seconds, TextView output) {
        JSONArray ids = splitIds(idsInput.getText().toString());
        if (ids.length() == 0) { output.setText("请输入至少一个卡密编号"); return; }
        J body = new J().put("ids", ids).put("action", action);
        if (seconds > 0) body.put("seconds", seconds);
        api.post("/v1/admin/licenses/batch-action", body, result -> {
            if (redirectUnauthorized(result)) return;
            output.setText(result.success ? pretty(result.data) : result.message);
        });
    }    private void showDeviceManager() {
        LinearLayout root = page("设备管理", "查看绑定设备、风险提示、最近在线情况和会话状态");
        TextView output = box("点击刷新设备列表");
        Button refresh = primary("刷新设备列表");
        root.addView(refresh, full(dp(10)));
        root.addView(output, full(dp(16)));
        refresh.setOnClickListener(v -> api.get("/v1/admin/devices?limit=100", result -> {
            if (redirectUnauthorized(result)) return;
            output.setText(result.success ? pretty(result.data) : result.message);
        }));

        EditText deviceId = input("设备记录编号", false);
        root.addView(deviceId, full(dp(10)));
        LinearLayout row = horizontal();
        Button detail = small("设备详情");
        Button revoke = small("撤销设备");
        row.addView(detail, weight());
        row.addView(revoke, weightMargins());
        root.addView(row, full(dp(14)));
        detail.setOnClickListener(v -> {
            String id = deviceId.getText().toString().trim();
            if (id.isEmpty()) { output.setText("请输入设备记录编号"); return; }
            api.get("/v1/admin/devices/detail?id=" + encode(id), result -> {
                if (redirectUnauthorized(result)) return;
                output.setText(result.success ? pretty(result.data) : result.message);
            });
        });
        revoke.setOnClickListener(v -> confirmDanger("撤销设备", "该设备当前登录状态将立即失效。", () -> {
            String id = deviceId.getText().toString().trim();
            if (id.isEmpty()) { output.setText("请输入设备记录编号"); return; }
            api.post("/v1/admin/devices/revoke", new J().put("id", id), result -> {
                if (redirectUnauthorized(result)) return;
                output.setText(result.success ? pretty(result.data) : result.message);
            });
        }));

        EditText license = input("卡密或卡密编号，用于撤销该卡全部设备", false);
        root.addView(license, full(dp(10)));
        Button revokeAll = danger("撤销该卡全部设备");
        revokeAll.setOnClickListener(v -> confirmDanger("撤销全部设备", "该卡密当前绑定的所有设备都会立即退出。", () -> {
            String value = license.getText().toString().trim();
            if (value.isEmpty()) { output.setText("请输入卡密或卡密编号"); return; }
            api.post("/v1/admin/devices/revoke-all", identifier(value), result -> {
                if (redirectUnauthorized(result)) return;
                output.setText(result.success ? pretty(result.data) : result.message);
            });
        }));
        root.addView(revokeAll, full(dp(16)));
        addBack(root);
        setContentView(wrap(root));
    }

    private void showVersionSettings() {
        showLoading("版本与更新");
        api.get("/v1/admin/settings", result -> {
            if (redirectUnauthorized(result)) return;
            if (!result.success) { showErrorPage("版本与更新", result.message); return; }
            currentSettings = result.data.optJSONObject("settings");
            if (currentSettings == null) currentSettings = new J();
            renderVersionSettings();
        });
    }

    private void renderVersionSettings() {
        LinearLayout root = page("版本与更新", "保存后服务器会自动下发，不需要重新编译客户端");
        EditText minimum = numeric("最低可用客户端版本数字");
        EditText latest = numeric("最新客户端版本数字");
        CheckBox force = check("旧版本必须更新后才能继续使用", currentSettings.optBoolean("forceUpdate", false));
        EditText url = input("更新包 HTTPS 下载地址", false);
        EditText message = multiline("展示给用户的更新说明");
        minimum.setText(String.valueOf(currentSettings.optInt("minAppVersion", 5)));
        latest.setText(String.valueOf(currentSettings.optInt("latestAppVersion", 8)));
        url.setText(currentSettings.optString("updateUrl", ""));
        message.setText(currentSettings.optString("updateMessage", ""));
        root.addView(minimum, full(dp(8)));
        root.addView(latest, full(dp(8)));
        root.addView(force, full(dp(8)));
        root.addView(url, full(dp(8)));
        root.addView(message, full(dp(12)));
        TextView result = status("");
        Button save = primary("保存版本配置");
        save.setOnClickListener(v -> {
            J changes = new J()
                    .put("minAppVersion", parseLong(minimum, 5L))
                    .put("latestAppVersion", parseLong(latest, 8L))
                    .put("forceUpdate", force.isChecked())
                    .put("updateUrl", url.getText().toString().trim())
                    .put("updateMessage", message.getText().toString().trim());
            saveSettings(changes, "version-update", result, this::showVersionSettings);
        });
        root.addView(save, full(dp(8)));
        root.addView(result, full(dp(12)));
        addBack(root);
        setContentView(wrap(root));
    }

    private void showSecuritySettings() {
        showLoading("安全策略");
        api.get("/v1/admin/settings", result -> {
            if (redirectUnauthorized(result)) return;
            if (!result.success) { showErrorPage("安全策略", result.message); return; }
            currentSettings = result.data.optJSONObject("settings");
            if (currentSettings == null) currentSettings = new J();
            renderSecuritySettings();
        });
    }

    private void renderSecuritySettings() {
        LinearLayout root = page("安全策略", "直接填写小时、分钟和天数；服务器仍会自动限制不安全的数值");
        EditText session = numeric("客户端保持登录（小时，1-24）");
        EditText adminSession = numeric("管理器保持登录（小时，1-24）");
        EditText recheck = numeric("客户端前台复检间隔（分钟，5-720）");
        EditText offline = numeric("新版客户端允许离线（小时，0-24）");
        EditText legacyOffline = numeric("旧版客户端允许离线（小时，0-48）");
        EditText lease = numeric("远程资源授权有效期（小时，1-24）");
        EditText challenge = numeric("单次安全验证有效期（秒，30-300）");
        EditText risk = numeric("达到几级风险时强制联网（1-5）");
        CheckBox globalOnline = check("所有客户端必须联网验证", currentSettings.optBoolean("globalForceOnline", false));
        CheckBox selfUnbind = check("允许用户自己更换绑定设备", currentSettings.optBoolean("selfUnbindEnabled", true));
        EditText penalty = numeric("用户自助换设备扣除时长（小时，0-72）");
        EditText cooldown = numeric("两次自助换设备至少间隔（天，0-30）");
        EditText window = numeric("解绑次数统计周期（天，1-90）");
        EditText limit = numeric("统计周期内最多解绑次数（1-30）");

        setScaledNumber(session, "sessionSeconds", 3600L, 7200L);
        setScaledNumber(adminSession, "adminSessionSeconds", 3600L, 43200L);
        setScaledNumber(recheck, "foregroundRecheckSeconds", 60L, 1800L);
        setScaledNumber(offline, "offlineGraceSeconds", 3600L, 21600L);
        setScaledNumber(legacyOffline, "legacyOfflineGraceSeconds", 3600L, 86400L);
        setScaledNumber(lease, "scriptLeaseSeconds", 3600L, 21600L);
        setNumber(challenge, "challengeSeconds", 90L);
        setNumber(risk, "riskForceOnlineThreshold", 2L);
        setScaledNumber(penalty, "unbindPenaltySeconds", 3600L, 21600L);
        setScaledNumber(cooldown, "unbindCooldownSeconds", 86400L, 86400L);
        setScaledNumber(window, "unbindWindowSeconds", 86400L, 2592000L);
        setNumber(limit, "unbindWindowLimit", 5L);

        EditText[] fields = {session, adminSession, recheck, offline, legacyOffline, lease,
                challenge, risk, penalty, cooldown, window, limit};
        for (EditText field : fields) root.addView(field, full(dp(8)));
        root.addView(globalOnline, full(dp(8)));
        root.addView(selfUnbind, full(dp(12)));
        TextView result = status("");
        Button save = primary("保存安全策略");
        save.setOnClickListener(v -> {
            J changes = new J()
                    .put("sessionSeconds", scaledSeconds(session, 3600L, 7200L))
                    .put("adminSessionSeconds", scaledSeconds(adminSession, 3600L, 43200L))
                    .put("foregroundRecheckSeconds", scaledSeconds(recheck, 60L, 1800L))
                    .put("offlineGraceSeconds", scaledSeconds(offline, 3600L, 21600L))
                    .put("legacyOfflineGraceSeconds", scaledSeconds(legacyOffline, 3600L, 86400L))
                    .put("scriptLeaseSeconds", scaledSeconds(lease, 3600L, 21600L))
                    .put("challengeSeconds", parseLong(challenge, 90L))
                    .put("riskForceOnlineThreshold", parseLong(risk, 2L))
                    .put("globalForceOnline", globalOnline.isChecked())
                    .put("selfUnbindEnabled", selfUnbind.isChecked())
                    .put("unbindPenaltySeconds", scaledSeconds(penalty, 3600L, 21600L))
                    .put("unbindCooldownSeconds", scaledSeconds(cooldown, 86400L, 86400L))
                    .put("unbindWindowSeconds", scaledSeconds(window, 86400L, 2592000L))
                    .put("unbindWindowLimit", parseLong(limit, 5L));
            saveSettings(changes, "security-policy", result, this::showSecuritySettings);
        });
        root.addView(save, full(dp(8)));
        root.addView(result, full(dp(12)));
        addBack(root);
        setContentView(wrap(root));
    }    private void showRuntimeManager() {
        LinearLayout root = page("远程资源", "查看当前签名版本、暂停下发、恢复服务和选择已登记版本");
        TextView output = box("点击刷新读取运行状态");
        Button refresh = primary("刷新运行状态");
        Button releases = secondary("查看已登记版本");
        root.addView(refresh, full(dp(8)));
        root.addView(releases, full(dp(10)));
        root.addView(output, full(dp(14)));
        refresh.setOnClickListener(v -> api.get("/v1/admin/runtime", result -> {
            if (redirectUnauthorized(result)) return;
            output.setText(result.success ? pretty(result.data) : result.message);
        }));
        releases.setOnClickListener(v -> api.get("/v1/admin/runtime/releases", result -> {
            if (redirectUnauthorized(result)) return;
            output.setText(result.success ? pretty(result.data) : result.message);
        }));

        LinearLayout row = horizontal();
        Button pause = danger("暂停下发");
        Button resume = small("恢复下发");
        row.addView(pause, weight());
        row.addView(resume, weightMargins());
        root.addView(row, full(dp(12)));
        pause.setOnClickListener(v -> confirmDanger("暂停远程资源", "新启动且没有有效缓存的客户端将无法进入。", () ->
                runtimeToggle("/v1/admin/runtime/pause", output)));
        resume.setOnClickListener(v -> runtimeToggle("/v1/admin/runtime/resume", output));

        EditText version = input("选择已登记版本；留空恢复跟随最新版本", false);
        Button select = secondary("应用资源版本");
        root.addView(version, full(dp(8)));
        root.addView(select, full(dp(14)));
        select.setOnClickListener(v -> confirmDanger("切换资源版本",
                "只允许选择服务器已经登记并验证过的签名版本。",
                () -> api.post("/v1/admin/runtime/select",
                        new J().put("version", version.getText().toString().trim()), result -> {
                            if (redirectUnauthorized(result)) return;
                            output.setText(result.success ? pretty(result.data) : result.message);
                        })));
        addBack(root);
        setContentView(wrap(root));
    }

    private void runtimeToggle(String path, TextView output) {
        api.post(path, new J().put("reason", "GG 管理器操作"), result -> {
            if (redirectUnauthorized(result)) return;
            output.setText(result.success ? pretty(result.data) : result.message);
        });
    }

    private void showAudit() {
        LinearLayout root = page("审计日志", "按操作类型或卡密编号筛选最近记录，中文和英文名称都可以");
        EditText event = input("操作类型，可留空，例如：管理员登录成功、设备激活、自助换设备", false);
        EditText licenseId = input("卡密编号，可留空", false);
        TextView output = box("点击查询读取最近100条记录");
        Button query = primary("查询日志");
        root.addView(event, full(dp(8)));
        root.addView(licenseId, full(dp(8)));
        root.addView(query, full(dp(10)));
        root.addView(output, full(dp(14)));
        query.setOnClickListener(v -> {
            String path = "/v1/admin/audit?limit=100&event=" + encode(eventCode(event.getText().toString()))
                    + "&licenseId=" + encode(licenseId.getText().toString());
            api.get(path, result -> {
                if (redirectUnauthorized(result)) return;
                output.setText(result.success ? pretty(result.data) : result.message);
            });
        });
        addBack(root);
        setContentView(wrap(root));
    }

    private void showSettingsHistory() {
        LinearLayout root = page("配置历史", "每次保存前都会记录完整快照，可按历史编号回滚");
        TextView output = box("点击刷新读取最近配置历史");
        Button refresh = primary("刷新配置历史");
        root.addView(refresh, full(dp(10)));
        root.addView(output, full(dp(12)));
        refresh.setOnClickListener(v -> api.get("/v1/admin/settings/history?limit=50", result -> {
            if (redirectUnauthorized(result)) return;
            output.setText(result.success ? pretty(result.data) : result.message);
        }));
        EditText historyId = input("历史记录编号", false);
        Button rollback = danger("回滚到该历史配置");
        root.addView(historyId, full(dp(8)));
        root.addView(rollback, full(dp(14)));
        rollback.setOnClickListener(v -> confirmDanger("回滚系统配置",
                "将恢复该历史快照，并保留当前会话代数，防止旧会话意外恢复。",
                () -> {
                    String id = historyId.getText().toString().trim();
                    if (id.isEmpty()) { output.setText("请输入历史记录编号"); return; }
                    api.post("/v1/admin/settings/rollback",
                            new J().put("historyId", id), result -> {
                                if (redirectUnauthorized(result)) return;
                                output.setText(result.success ? pretty(result.data) : result.message);
                            });
                }));
        addBack(root);
        setContentView(wrap(root));
    }

    private void saveSettings(JSONObject changes, String reason, TextView result, Runnable afterSuccess) {
        int version = currentSettings.optInt("configVersion", 0);
        J body = new J()
                .put("settings", changes)
                .put("expectedVersion", version)
                .put("reason", reason);
        api.post("/v1/admin/settings/update", body, response -> {
            if (redirectUnauthorized(response)) return;
            result.setText(response.success ? "保存成功" : response.message);
            if (response.success && afterSuccess != null) afterSuccess.run();
        });
    }

    private J identifier(String value) {
        String clean = value == null ? "" : value.trim();
        J body = new J();
        String normalized = clean.replaceAll("[^0-9A-Fa-f]", "").toUpperCase(Locale.ROOT);
        if (normalized.length() == 32) body.put("licenseKey", normalized);
        else body.put("id", clean);
        return body;
    }

    private String detailPath(String value) {
        J id = identifier(value);
        if (id.has("licenseKey")) return "/v1/admin/licenses/detail?licenseKey=" + encode(id.optString("licenseKey"));
        return "/v1/admin/licenses/detail?id=" + encode(id.optString("id"));
    }

    private JSONArray splitIds(String value) {
        JSONArray array = new JSONArray();
        if (value == null) return array;
        String[] pieces = value.split("[,\\n\\r\\t ]+");
        for (String piece : pieces) {
            String clean = piece.trim();
            if (!clean.isEmpty()) array.put(clean);
            if (array.length() >= 100) break;
        }
        return array;
    }

    private boolean redirectUnauthorized(AdminApiManager.Result result) {
        if (!result.unauthorized) return false;
        showLogin(result.message);
        return true;
    }

    private void toastResult(AdminApiManager.Result result) {
        if (redirectUnauthorized(result)) return;
        Toast.makeText(this, result.success ? "操作成功" : result.message, Toast.LENGTH_LONG).show();
    }

    private void confirmDanger(String title, String message, Runnable action) {
        new AlertDialog.Builder(this)
                .setTitle(title)
                .setMessage(message)
                .setNegativeButton("取消", null)
                .setPositiveButton("确认执行", (dialog, which) -> action.run())
                .show();
    }

    private void addBack(LinearLayout root) {
        Button back = secondary("返回控制台");
        back.setOnClickListener(v -> showConsole());
        root.addView(back, full(0));
    }

    private void setNumber(EditText field, String key, long fallback) {
        field.setText(String.valueOf(currentSettings.optLong(key, fallback)));
    }

    private void setScaledNumber(EditText field, String key, long divisor, long fallbackSeconds) {
        long value = currentSettings.optLong(key, fallbackSeconds);
        long shown = Math.max(0L, Math.round((double) value / (double) divisor));
        field.setText(String.valueOf(shown));
    }

    private long scaledSeconds(EditText input, long multiplier, long fallbackSeconds) {
        long fallbackValue = Math.max(0L, fallbackSeconds / Math.max(1L, multiplier));
        long value = parseLong(input, fallbackValue);
        if (value <= 0L) return 0L;
        if (value > Long.MAX_VALUE / multiplier) return fallbackSeconds;
        return value * multiplier;
    }

    private long parseLong(EditText input, long fallback) {
        try { return Long.parseLong(input.getText().toString().trim()); }
        catch (Exception ignored) { return fallback; }
    }

    private Long parseDateTimeSeconds(String value) {
        String clean = value == null ? "" : value.trim();
        if (clean.isEmpty()) return null;
        if (clean.matches("\\d{9,13}")) {
            try {
                long raw = Long.parseLong(clean);
                return raw > 100000000000L ? raw / 1000L : raw;
            } catch (Exception ignored) {
                return null;
            }
        }
        String[] patterns = {"yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm", "yyyy-MM-dd"};
        for (String pattern : patterns) {
            try {
                SimpleDateFormat parser = new SimpleDateFormat(pattern, Locale.CHINA);
                parser.setLenient(false);
                Date parsed = parser.parse(clean);
                if (parsed != null) return parsed.getTime() / 1000L;
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    private String pretty(JSONObject object) {
        if (object == null) return "暂无数据";
        StringBuilder out = new StringBuilder();
        appendObject(out, object, 0);
        String text = out.toString().trim();
        return text.isEmpty() ? "操作成功，服务器没有返回更多内容" : text;
    }

    private void appendObject(StringBuilder out, JSONObject object, int depth) {
        java.util.Iterator<String> keys = object.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object value = object.opt(key);
            String normalized = normalizeKey(key);
            if ("ok".equals(normalized) && Boolean.TRUE.equals(value)) continue;
            if ("settingsjson".equals(normalized) || "manifestjson".equals(normalized) || "token".equals(normalized)) continue;
            appendHumanValue(out, key, value, depth);
        }
    }

    private void appendArray(StringBuilder out, JSONArray array, int depth) {
        if (array == null || array.length() == 0) {
            indent(out, depth).append("暂无记录\n");
            return;
        }
        for (int i = 0; i < array.length(); i++) {
            Object value = array.opt(i);
            indent(out, depth).append("第 ").append(i + 1).append(" 项\n");
            if (value instanceof JSONObject) {
                appendObject(out, (JSONObject) value, depth + 1);
            } else if (value instanceof JSONArray) {
                appendArray(out, (JSONArray) value, depth + 1);
            } else {
                indent(out, depth + 1).append(humanScalar("", value)).append('\n');
            }
            if (i < array.length() - 1) out.append('\n');
        }
    }

    private void appendHumanValue(StringBuilder out, String key, Object value, int depth) {
        String label = humanLabel(key);
        if (value == null || value == JSONObject.NULL) {
            indent(out, depth).append(label).append("：")
                    .append(isExpiryKey(key) ? "永久有效" : "暂无").append('\n');
            return;
        }
        if (value instanceof JSONObject) {
            indent(out, depth).append(label).append("：\n");
            appendObject(out, (JSONObject) value, depth + 1);
            return;
        }
        if (value instanceof String && ("detail".equals(normalizeKey(key)) || "reason".equals(normalizeKey(key)))) {
            String text = String.valueOf(value).trim();
            if (text.startsWith("{") && text.endsWith("}")) {
                try {
                    indent(out, depth).append(label).append("：\n");
                    appendObject(out, new JSONObject(text), depth + 1);
                    return;
                } catch (Exception ignored) {
                }
            }
        }
        if (value instanceof JSONArray) {
            indent(out, depth).append(label).append("：\n");
            appendArray(out, (JSONArray) value, depth + 1);
            return;
        }
        indent(out, depth).append(label).append("：").append(humanScalar(key, value)).append('\n');
    }

    private StringBuilder indent(StringBuilder out, int depth) {
        for (int i = 0; i < depth; i++) out.append("  ");
        return out;
    }

    private String humanScalar(String key, Object value) {
        String normalizedKey = normalizeKey(key);
        if (value instanceof Boolean) {
            boolean enabled = (Boolean) value;
            if ("permanent".equals(normalizedKey)) return enabled ? "是（永久有效）" : "否（有固定到期时间）";
            if ("scriptdeliveryenabled".equals(normalizedKey) || "enabled".equals(normalizedKey)) {
                return enabled ? "正常下发" : "已暂停下发";
            }
            return enabled ? "是（已开启）" : "否（已关闭）";
        }
        if (value instanceof Number) {
            long number = ((Number) value).longValue();
            if (isTimeKey(normalizedKey)) return formatTimestamp(number);
            if (isDurationKey(normalizedKey)) {
                if (number <= 0L && normalizedKey.contains("offline")) return "不允许离线";
                if (number <= 0L && normalizedKey.contains("penalty")) return "不扣除有效期";
                if (number <= 0L && normalizedKey.contains("cooldown")) return "无需等待";
                return formatDuration(number);
            }
            if ("sizebytes".equals(normalizedKey)) return formatBytes(number);
            return String.valueOf(value);
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            if ("riskflags".equals(normalizedKey)) return "未发现风险";
            return "暂无";
        }
        if (isTimeKey(normalizedKey) && text.matches("\\d{9,13}")) {
            try { return formatTimestamp(Long.parseLong(text)); }
            catch (Exception ignored) {}
        }
        String mapped = humanValue(text);
        if (!mapped.equals(text)) return mapped;
        if ("riskflags".equals(normalizedKey)) return text.isEmpty() ? "未发现风险" : text;
        return text;
    }

    private String humanLabel(String key) {
        switch (normalizeKey(key)) {
            case "ok": return "操作是否成功";
            case "message": return "提示信息";
            case "code": return "结果代码";
            case "total": return "总数量";
            case "count": return "数量";
            case "limit": return "每页数量";
            case "offset": return "起始位置";
            case "licenses": return "卡密列表";
            case "license": return "卡密信息";
            case "devices": return "设备列表";
            case "device": return "设备信息";
            case "settings": return "系统设置";
            case "audit": return "操作日志";
            case "history": return "配置历史";
            case "releases": return "已登记版本";
            case "runtime": return "远程资源状态";
            case "dashboard": return "系统总览";
            case "service": return "服务名称";
            case "apiversion": return "接口版本";
            case "id": return "记录编号";
            case "licenseid": return "卡密编号";
            case "licensekey": return "完整卡密";
            case "keypreview": return "卡密预览";
            case "status": return "当前状态";
            case "createdat": return "创建时间";
            case "activatedat": return "首次激活时间";
            case "expiresat": return "到期时间";
            case "maxdevices": return "最多允许设备数";
            case "note": return "备注";
            case "lastseenat": return "最后在线时间";
            case "lastunbindat": return "最后解绑时间";
            case "rebindavailableat": return "可再次绑定时间";
            case "activedevices": return "当前有效设备数";
            case "devicehash": return "设备识别码";
            case "label": return "设备名称";
            case "revokedat": return "撤销时间";
            case "keyfingerprint": return "设备公钥指纹";
            case "certificatedigest": return "应用证书指纹";
            case "riskflags": return "风险提示";
            case "sessionversion": return "设备会话代数";
            case "configversion": return "配置版本";
            case "minappversion": return "最低可用客户端版本";
            case "secureappversion": return "启用安全验证的最低客户端版本";
            case "latestappversion": return "最新客户端版本";
            case "forceupdate": return "是否强制更新";
            case "updateurl": return "更新下载地址";
            case "updatemessage": return "更新说明";
            case "sessionseconds": return "客户端保持登录时间";
            case "adminsessionseconds": return "管理器保持登录时间";
            case "foregroundrecheckseconds": return "前台授权复检间隔";
            case "offlinegraceseconds": return "新版客户端离线宽限时间";
            case "legacyofflinegraceseconds": return "旧版客户端离线宽限时间";
            case "scriptleaseseconds": return "远程资源授权租期";
            case "challengeseconds": return "安全验证有效时间";
            case "riskforceonlinethreshold": return "强制在线风险等级";
            case "globalforceonline": return "是否全局强制联网";
            case "selfunbindenabled": return "是否允许用户自助换设备";
            case "unbindpenaltyseconds": return "自助换设备扣除时长";
            case "unbindcooldownseconds": return "自助换设备冷却时间";
            case "unbindwindowseconds": return "解绑次数统计周期";
            case "unbindwindowlimit": return "统计周期内最多解绑次数";
            case "sessiongeneration": return "全局会话代数";
            case "scriptdeliveryenabled": return "远程资源是否允许下发";
            case "activescriptversion": return "当前指定的远程资源版本";
            case "configcacheseconds": return "配置缓存时间";
            case "activations24h": return "最近24小时激活数量";
            case "riskdevices": return "存在风险的在线设备数量";
            case "active": return "正常数量";
            case "disabled": return "已停用数量";
            case "expired": return "已到期数量";
            case "enabled": return "远程资源下发状态";
            case "manifest": return "资源签名信息";
            case "error": return "错误信息";
            case "requested": return "请求处理数量";
            case "success": return "成功处理数量";
            case "permanent": return "是否永久有效";
            case "forceonline": return "是否强制联网";
            case "tokenexpiresat": return "登录状态到期时间";
            case "licenseexpiresat": return "卡密到期时间";
            case "penaltyseconds": return "换设备扣除时长";
            case "purpose": return "请求用途";
            case "servertime": return "服务器时间";
            case "nonce": return "安全验证随机码";
            case "event": return "操作类型";
            case "detail": return "操作详情";
            case "reason": return "操作原因";
            case "changedat": return "修改时间";
            case "changedby": return "操作者";
            case "updatedat": return "更新时间";
            case "updatedby": return "更新者";
            case "licensestatus": return "卡密状态";
            case "version": return "版本号";
            case "filename": return "文件名称";
            case "file": return "资源文件名称";
            case "sha256": return "文件校验值";
            case "sizebytes": return "文件大小";
            case "size": return "文件大小";
            case "firstseenat": return "首次登记时间";
            case "manifestjson": return "签名清单";
            case "currentversion": return "当前使用版本";
            case "selectedversion": return "手动指定版本";
            case "paused": return "是否暂停下发";
            case "created": return "新建数量";
            case "updated": return "更新数量";
            case "affected": return "受影响数量";
            default: return fallbackLabel(key);
        }
    }

    private String fallbackLabel(String key) {
        if (key == null || key.trim().isEmpty()) return "信息";
        String spaced = key.replace('_', ' ').replace('-', ' ')
                .replaceAll("([a-z0-9])([A-Z])", "$1 $2").trim();
        String[] words = spaced.split("\\s+");
        StringBuilder result = new StringBuilder();
        for (String word : words) {
            if (result.length() > 0) result.append(' ');
            result.append(humanToken(word));
        }
        return result.toString();
    }

    private String humanToken(String word) {
        switch (word.toLowerCase(Locale.ROOT)) {
            case "admin": return "管理员";
            case "app": return "客户端";
            case "active": return "有效";
            case "available": return "可用";
            case "current": return "当前";
            case "device": return "设备";
            case "devices": return "设备";
            case "error": return "错误";
            case "enabled": return "已启用";
            case "disabled": return "已停用";
            case "expired": return "已到期";
            case "expires": return "到期";
            case "expiry": return "到期";
            case "force": return "强制";
            case "generation": return "代数";
            case "key": return "卡密";
            case "last": return "最后";
            case "license": return "卡密";
            case "licenses": return "卡密";
            case "max": return "最大";
            case "minimum": return "最低";
            case "new": return "新";
            case "online": return "在线";
            case "preview": return "预览";
            case "release": return "版本";
            case "releases": return "版本";
            case "risk": return "风险";
            case "script": return "远程资源";
            case "session": return "会话";
            case "time": return "时间";
            case "token": return "令牌";
            case "update": return "更新";
            case "url": return "地址";
            case "version": return "版本";
            default: return word;
        }
    }

    private String humanValue(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        switch (normalized) {
            case "active": return "正常使用";
            case "enabled": return "已启用";
            case "disabled": return "已停用";
            case "expired": return "已到期";
            case "revoked": return "已撤销";
            case "paused": return "已暂停";
            case "running": return "运行中";
            case "success": return "成功";
            case "failed": return "失败";
            case "admin_login": return "管理员登录";
            case "admin_login_ok": return "管理员登录成功";
            case "admin_login_failed": return "管理员登录失败";
            case "activate": return "设备激活";
            case "verify": return "授权复检";
            case "self_unbind": return "用户自助更换设备";
            case "admin_unbind": return "管理员解绑设备";
            case "admin_device_revoked": return "管理员撤销单个设备";
            case "admin_devices_revoked_all": return "管理员撤销该卡全部设备";
            case "license_create":
            case "license_created": return "创建卡密";
            case "license_update":
            case "license_updated": return "修改卡密";
            case "license_disable": return "停用卡密";
            case "license_enable": return "启用卡密";
            case "license_extend": return "续期卡密";
            case "license_permanent": return "将卡密改为永久有效";
            case "license_unbind": return "解绑卡密设备";
            case "license_batch_action": return "批量处理卡密";
            case "license_batch_disable": return "批量停用卡密";
            case "license_batch_enable": return "批量启用卡密";
            case "license_batch_extend": return "批量续期卡密";
            case "license_batch_unbind": return "批量解绑卡密";
            case "settings_update":
            case "settings_updated": return "修改系统设置";
            case "settings_rollback": return "回滚系统设置";
            case "sessions_revoke_all":
            case "sessions_revoked_all": return "全局撤销会话";
            case "runtime_pause":
            case "runtime_paused": return "暂停远程资源";
            case "runtime_resume":
            case "runtime_resumed": return "恢复远程资源";
            case "runtime_select":
            case "runtime_selected": return "切换远程资源版本";
            case "security-policy": return "修改安全策略";
            case "version-update": return "修改版本与更新设置";
            case "revoke-all-sessions": return "全局撤销全部会话";
            case "disable": return "停用";
            case "enable": return "启用";
            case "unbind": return "解绑设备";
            case "extend": return "续期";
            case "permanent": return "改为永久有效";
            default: return value;
        }
    }

    private String eventCode(String input) {
        String clean = input == null ? "" : input.trim();
        switch (clean) {
            case "管理员登录":
            case "管理员登录成功": return "admin_login_ok";
            case "管理员登录失败": return "admin_login_failed";
            case "设备激活":
            case "激活": return "activate";
            case "授权复检":
            case "复检": return "verify";
            case "用户自助更换设备":
            case "自助换设备": return "self_unbind";
            case "管理员撤销单个设备":
            case "撤销设备": return "admin_device_revoked";
            case "管理员撤销该卡全部设备":
            case "撤销该卡全部设备": return "admin_devices_revoked_all";
            case "创建卡密": return "license_created";
            case "修改卡密": return "license_updated";
            case "停用卡密": return "license_disable";
            case "启用卡密": return "license_enable";
            case "续期卡密": return "license_extend";
            case "卡密改为永久": return "license_permanent";
            case "解绑卡密设备": return "license_unbind";
            case "批量停用卡密": return "license_batch_disable";
            case "批量启用卡密": return "license_batch_enable";
            case "批量续期卡密": return "license_batch_extend";
            case "批量解绑卡密": return "license_batch_unbind";
            case "修改系统设置":
            case "修改设置": return "settings_updated";
            case "回滚系统设置":
            case "回滚配置": return "settings_rollback";
            case "全局撤销会话": return "sessions_revoked_all";
            case "暂停远程资源": return "runtime_paused";
            case "恢复远程资源": return "runtime_resumed";
            case "切换远程资源版本": return "runtime_selected";
            default: return clean;
        }
    }

    private String normalizeKey(String key) {
        return key == null ? "" : key.replaceAll("[^A-Za-z0-9]", "").toLowerCase(Locale.ROOT);
    }

    private boolean isExpiryKey(String key) {
        return normalizeKey(key).contains("expires");
    }

    private boolean isTimeKey(String key) {
        return key.endsWith("at") || key.endsWith("time") || "servertime".equals(key);
    }

    private boolean isDurationKey(String key) {
        return key.endsWith("seconds") || key.endsWith("duration");
    }

    private String formatTimestamp(long value) {
        if (value <= 0L) return "暂无";
        long millis = value > 100000000000L ? value : value * 1000L;
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.CHINA).format(new Date(millis));
    }

    private String formatDuration(long totalSeconds) {
        if (totalSeconds <= 0L) return "0秒";
        long days = totalSeconds / 86400L;
        long hours = (totalSeconds % 86400L) / 3600L;
        long minutes = (totalSeconds % 3600L) / 60L;
        long seconds = totalSeconds % 60L;
        StringBuilder value = new StringBuilder();
        if (days > 0) value.append(days).append("天");
        if (hours > 0) value.append(hours).append("小时");
        if (minutes > 0) value.append(minutes).append("分钟");
        if (seconds > 0 || value.length() == 0) value.append(seconds).append("秒");
        return value.toString();
    }

    private String formatBytes(long bytes) {
        if (bytes < 1024L) return bytes + " B";
        if (bytes < 1024L * 1024L) return String.format(Locale.CHINA, "%.1f KB", bytes / 1024.0);
        if (bytes < 1024L * 1024L * 1024L) return String.format(Locale.CHINA, "%.1f MB", bytes / 1048576.0);
        return String.format(Locale.CHINA, "%.1f GB", bytes / 1073741824.0);
    }

    private String encode(String value) {
        try { return java.net.URLEncoder.encode(value == null ? "" : value, "UTF-8"); }
        catch (Exception ignored) { return ""; }
    }

    private void copyText(String value) {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (clipboard != null) {
            clipboard.setPrimaryClip(ClipData.newPlainText("GG 管理器", value));
            Toast.makeText(this, "已复制", Toast.LENGTH_SHORT).show();
        }
    }    private LinearLayout page(String titleText, String description) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(22), dp(30), dp(22), dp(30));
        root.setBackgroundColor(Color.rgb(245, 247, 251));
        TextView title = new TextView(this);
        title.setText(titleText);
        title.setTextSize(27);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Color.rgb(17, 24, 39));
        root.addView(title, full(dp(8)));
        TextView subtitle = new TextView(this);
        subtitle.setText(description);
        subtitle.setTextSize(14);
        subtitle.setTextColor(Color.rgb(75, 85, 99));
        subtitle.setLineSpacing(0, 1.2f);
        root.addView(subtitle, full(dp(22)));
        return root;
    }

    private ScrollView wrap(LinearLayout root) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return scroll;
    }

    private LinearLayout dialogForm() {
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(22), dp(8), dp(22), 0);
        return form;
    }

    private LinearLayout horizontal() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        return row;
    }

    private EditText input(String hint, boolean password) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setTextSize(15);
        field.setSingleLine(true);
        field.setPadding(dp(12), dp(12), dp(12), dp(12));
        field.setInputType(password
                ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
                : InputType.TYPE_CLASS_TEXT);
        return field;
    }

    private EditText numeric(String hint) {
        EditText field = input(hint, false);
        field.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_SIGNED);
        return field;
    }

    private EditText multiline(String hint) {
        EditText field = input(hint, false);
        field.setSingleLine(false);
        field.setMinLines(3);
        field.setGravity(Gravity.TOP);
        return field;
    }

    private CheckBox check(String text, boolean checked) {
        CheckBox box = new CheckBox(this);
        box.setText(text);
        box.setTextSize(15);
        box.setChecked(checked);
        return box;
    }

    private TextView section(String text) {
        TextView title = new TextView(this);
        title.setText(text);
        title.setTextSize(18);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Color.rgb(31, 41, 55));
        return title;
    }

    private TextView status(String value) {
        TextView text = new TextView(this);
        text.setText(value == null ? "" : value);
        text.setTextSize(14);
        text.setTextColor(Color.rgb(185, 28, 28));
        text.setLineSpacing(0, 1.2f);
        return text;
    }

    private TextView box(String value) {
        TextView text = new TextView(this);
        text.setText(value == null ? "" : value);
        text.setTextSize(13);
        text.setTextColor(Color.rgb(31, 41, 55));
        text.setTypeface(Typeface.MONOSPACE);
        text.setPadding(dp(14), dp(14), dp(14), dp(14));
        text.setBackgroundColor(Color.WHITE);
        text.setTextIsSelectable(true);
        return text;
    }

    private Button primary(String text) {
        Button button = baseButton(text);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(Color.rgb(79, 70, 229));
        return button;
    }

    private Button secondary(String text) {
        Button button = baseButton(text);
        button.setTextColor(Color.rgb(31, 41, 55));
        button.setBackgroundColor(Color.rgb(229, 231, 235));
        return button;
    }

    private Button danger(String text) {
        Button button = baseButton(text);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(Color.rgb(185, 28, 28));
        return button;
    }

    private Button small(String text) {
        Button button = secondary(text);
        button.setTextSize(13);
        button.setMinHeight(dp(48));
        return button;
    }

    private Button baseButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(15);
        button.setPadding(dp(12), dp(8), dp(12), dp(8));
        return button;
    }

    private LinearLayout.LayoutParams full(int bottomMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, 0, bottomMargin);
        return params;
    }

    private LinearLayout.LayoutParams weight() {
        return new LinearLayout.LayoutParams(0, dp(50), 1f);
    }

    private LinearLayout.LayoutParams weightMargins() {
        LinearLayout.LayoutParams params = weight();
        params.setMargins(dp(8), 0, dp(8), 0);
        return params;
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
