package com.jinli.ggsecure;

/** Host-JVM parity: these expected strings are test-only, never packaged in the APK. */
public final class UiTextSmoke {
    public static void main(String[] args) {
        String[] expected = {
                "GG", "请输入激活码后启动", "请输入32位激活码", "粘贴", "启动",
                "返回", "首页", "刷新", "重置", "服务", "加载中…", "已就绪",
                "无法打开此链接", "页面加载失败", "正在启动…", "正在初始化中…",
                "激活码格式错误", "正在验证，请稍候…", "重置网页数据",
                "清除网页缓存、Cookie和本地网页设置，不会影响账号授权。",
                "取消", "确认", "服务信息", "关闭", "更换设备", "退出账号",
                "确认更换设备", "当前设备会立即退出账号，是否继续？",
                "正在解除设备绑定…", "需要更新", "发现更新", "发现新版本",
                "稍后", "下载更新", "无法打开更新地址", "已开始下载", "下载失败",
                "GG 页面兼容处理失败，请重试或更新客户端。",
                "安装包签名校验失败"
        };
        for (int i = 0; i < expected.length; i++) {
            String actual = UiText.get(i);
            if (!expected[i].equals(actual) || actual != UiText.get(i)) {
                throw new AssertionError("UI copy mismatch at " + i);
            }
        }
        try {
            UiText.get(expected.length);
            throw new AssertionError("Out-of-range UI copy ID accepted");
        } catch (IllegalArgumentException expectedError) {
            // Expected.
        }
        System.out.println("UI text parity: " + expected.length + " entries");
    }
}
