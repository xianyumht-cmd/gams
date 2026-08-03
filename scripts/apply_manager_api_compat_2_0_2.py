#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "v2/android/manager/src/main/java/com/jinli/ggsecure/manager/MainActivity.java"
GRADLE = ROOT / "v2/android/manager/build.gradle.kts"


def replace_method(text: str, name: str, next_name: str, replacement: str) -> str:
    pattern = re.compile(
        rf"    private void {re.escape(name)}\([^\n]*\) \{{.*?(?=\n    private void {re.escape(next_name)}\()",
        re.S,
    )
    updated, count = pattern.subn(replacement.rstrip() + "\n", text, count=1)
    if count != 1:
        raise SystemExit(f"unable to replace method {name}; matches={count}")
    return updated


text = MAIN.read_text(encoding="utf-8")

text = replace_method(
    text,
    "showConsole",
    "addMenu",
    '''    private void showConsole() {
        LinearLayout root = page("GG V2 管理器", "当前生产接口管理控制台");
        TextView state = box("当前服务支持：卡密创建、列表、停用、启用、续期、永久和解绑");
        root.addView(state, full(dp(16)));

        addMenu(root, "系统总览", "查看当前卡密与设备数量信息", this::showDashboard);
        addMenu(root, "卡密管理", "创建、查看、续期、停用、启用和解绑", this::showLicenseManager);

        Button logout = secondary("退出管理登录");
        logout.setOnClickListener(v -> { api.logout(); showLogin(""); });
        root.addView(logout, full(dp(12)));
        setContentView(wrap(root));
    }
''',
)

text = replace_method(
    text,
    "showDashboard",
    "handlePageResult",
    '''    private void showDashboard() {
        showLoading("系统总览");
        api.get("/v1/admin/licenses?limit=100", result -> handlePageResult("系统总览", result));
    }
''',
)

text = replace_method(
    text,
    "showLicenseManager",
    "showCreateLicenseDialog",
    '''    private void showLicenseManager() {
        LinearLayout root = page("卡密管理", "与当前生产接口完全一致");
        TextView output = box("点击刷新读取卡密列表");

        Button refresh = primary("刷新卡密列表");
        refresh.setOnClickListener(v -> {
            refresh.setEnabled(false);
            api.get("/v1/admin/licenses?limit=100", result -> {
                refresh.setEnabled(true);
                if (redirectUnauthorized(result)) return;
                output.setText(result.success ? pretty(result.data) : result.message);
            });
        });
        root.addView(refresh, full(dp(10)));
        root.addView(output, full(dp(16)));

        Button create = secondary("创建卡密");
        create.setOnClickListener(v -> showCreateLicenseDialog(output));
        root.addView(create, full(dp(18)));

        root.addView(section("单张卡密操作"), full(dp(8)));
        EditText keyOrId = input("输入完整卡密或卡密编号", false);
        root.addView(keyOrId, full(dp(10)));

        LinearLayout row = horizontal();
        Button disable = small("停用");
        Button enable = small("启用");
        Button unbind = small("解绑设备");
        row.addView(disable, weight());
        row.addView(enable, weightMargins());
        row.addView(unbind, weight());
        root.addView(row, full(dp(10)));
        disable.setOnClickListener(v -> licenseAction(keyOrId, "disable", 0L, output));
        enable.setOnClickListener(v -> licenseAction(keyOrId, "enable", 0L, output));
        unbind.setOnClickListener(v -> confirmDanger(
                "管理员解绑",
                "将撤销该卡密绑定的全部设备，不会扣除有效期。",
                () -> licenseAction(keyOrId, "unbind", 0L, output)));

        LinearLayout row2 = horizontal();
        Button permanent = small("改为永久");
        Button extend = small("自定义续期");
        row2.addView(permanent, weight());
        row2.addView(extend, weightMargins());
        root.addView(row2, full(dp(16)));
        permanent.setOnClickListener(v -> licenseAction(keyOrId, "permanent", 0L, output));
        extend.setOnClickListener(v -> showExtendDialog(keyOrId, output));

        Button back = secondary("返回控制台");
        back.setOnClickListener(v -> showConsole());
        root.addView(back, full(0));
        setContentView(wrap(root));
    }
''',
)

old = '''    private void licenseAction(EditText keyOrId, String action, long seconds, TextView output) {
        String value = keyOrId.getText().toString().trim();
        if (value.isEmpty()) { output.setText("请输入卡密或卡密编号"); return; }
        J body = identifier(value).put("action", action);
        if (seconds > 0) body.put("seconds", seconds);
        api.post("/v1/admin/licenses/action", body, result -> {
            if (redirectUnauthorized(result)) return;
            output.setText(result.success ? pretty(result.data) : result.message);
        });
    }
'''
new = '''    private void licenseAction(EditText keyOrId, String action, long days, TextView output) {
        String value = keyOrId.getText().toString().trim();
        if (value.isEmpty()) { output.setText("请输入卡密或卡密编号"); return; }
        J body = identifier(value).put("action", action);
        if (days > 0) body.put("days", days);
        api.post("/v1/admin/licenses/action", body, result -> {
            if (redirectUnauthorized(result)) return;
            output.setText(result.success ? pretty(result.data) : result.message);
        });
    }
'''
if text.count(old) != 1:
    raise SystemExit(f"licenseAction expected once, found {text.count(old)}")
text = text.replace(old, new)

old_extend = 'licenseAction(keyOrId, "extend", parseLong(days, 30L) * 86400L, output)'
new_extend = 'licenseAction(keyOrId, "extend", parseLong(days, 30L), output)'
if text.count(old_extend) != 1:
    raise SystemExit(f"extend conversion expected once, found {text.count(old_extend)}")
text = text.replace(old_extend, new_extend)

MAIN.write_text(text, encoding="utf-8")

gradle = GRADLE.read_text(encoding="utf-8")
for old, new in [
    ('versionCode = 2', 'versionCode = 3'),
    ('versionName = "2.0.1"', 'versionName = "2.0.2"'),
]:
    if gradle.count(old) != 1:
        raise SystemExit(f"version replacement {old!r} expected once")
    gradle = gradle.replace(old, new)
GRADLE.write_text(gradle, encoding="utf-8")

print("manager API compatibility patch applied")
