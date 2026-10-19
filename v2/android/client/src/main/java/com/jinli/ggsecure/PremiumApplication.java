package com.jinli.ggsecure;

import android.app.Activity;
import android.app.Application;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

public final class PremiumApplication extends Application implements Application.ActivityLifecycleCallbacks {
    private static final int BG_START = Color.rgb(7, 10, 20);
    private static final int BG_END = Color.rgb(14, 20, 38);
    private static final int CARD = Color.rgb(18, 25, 43);
    private static final int CARD_SOFT = Color.rgb(25, 34, 56);
    private static final int ACCENT = Color.rgb(124, 92, 255);
    private static final int ACCENT_2 = Color.rgb(54, 199, 190);
    private static final int TEXT = Color.rgb(244, 247, 255);
    private static final int MUTED = Color.rgb(169, 180, 205);
    private static final int DANGER = Color.rgb(255, 117, 129);

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(this);
    }

    @Override
    public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
        schedule(activity, 0);
    }

    @Override
    public void onActivityResumed(Activity activity) {
        schedule(activity, 0);
    }

    private void schedule(Activity activity, int attempt) {
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) return;
        long delay = attempt == 0 ? 0L : Math.min(1200L, 180L * attempt);
        mainHandler.postDelayed(() -> {
            if (activity.isFinishing() || activity.isDestroyed()) return;
            apply(activity);
            if (attempt < 8) schedule(activity, attempt + 1);
        }, delay);
    }

    private void apply(Activity activity) {
        styleWindow(activity.getWindow());
        View root = activity.getWindow().getDecorView().findViewById(android.R.id.content);
        if (!(root instanceof ViewGroup)) return;

        EditText input = first(root, EditText.class);
        WebView webView = first(root, WebView.class);
        if (input != null) {
            styleLogin((ViewGroup) root, input);
        } else if (webView != null) {
            styleBrowser((ViewGroup) root, webView);
        } else {
            styleLoading((ViewGroup) root);
        }
    }

    private void styleWindow(Window window) {
        if (window == null) return;
        window.setStatusBarColor(BG_START);
        window.setNavigationBarColor(BG_START);
        window.getDecorView().setBackgroundColor(BG_START);
    }

    private void styleLoading(ViewGroup root) {
        root.setBackground(gradient(BG_START, BG_END, 0));
        TextView brand = exactText(root, "GG");
        if (brand != null) {
            brand.setTextColor(TEXT);
            brand.setTextSize(34);
            brand.setTypeface(Typeface.DEFAULT_BOLD);
            brand.setLetterSpacing(0.12f);
            brand.setGravity(Gravity.CENTER);
            brand.setPadding(dp(24), dp(14), dp(24), dp(14));
            brand.setBackground(gradient(ACCENT, ACCENT_2, 24));
            brand.setElevation(dp(12));
        }
        for (ProgressBar bar : all(root, ProgressBar.class)) {
            bar.setIndeterminateTintList(ColorStateList.valueOf(ACCENT_2));
            bar.setProgressTintList(ColorStateList.valueOf(ACCENT));
        }
        for (TextView view : all(root, TextView.class)) {
            if (view != brand) view.setTextColor(MUTED);
        }
    }

    private void styleLogin(ViewGroup root, EditText input) {
        root.setBackground(gradient(BG_START, BG_END, 0));
        ScrollView scroll = first(root, ScrollView.class);
        if (scroll != null) {
            scroll.setBackground(gradient(BG_START, BG_END, 0));
            scroll.setFillViewport(true);
        }

        TextView brand = exactText(root, "GG");
        if (brand != null) {
            brand.setTextColor(TEXT);
            brand.setTextSize(35);
            brand.setTypeface(Typeface.DEFAULT_BOLD);
            brand.setLetterSpacing(0.14f);
            brand.setGravity(Gravity.CENTER);
            brand.setPadding(dp(24), dp(18), dp(24), dp(18));
            brand.setBackground(gradient(Color.rgb(108, 82, 255), Color.rgb(46, 190, 190), 26));
            brand.setElevation(dp(14));
        }

        TextView subtitle = exactText(root, "请输入激活码后启动");
        if (subtitle != null) {
            subtitle.setText("安全验证 · 仅保存在当前设备");
            subtitle.setTextColor(MUTED);
            subtitle.setTextSize(14);
            subtitle.setLetterSpacing(0.03f);
        }

        input.setTextColor(TEXT);
        input.setHintTextColor(Color.rgb(112, 126, 154));
        input.setTextSize(16);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        input.setPadding(dp(18), dp(15), dp(18), dp(15));
        input.setBackground(stroked(CARD, Color.rgb(62, 77, 108), 18, 1));
        input.setElevation(dp(4));

        Button paste = exactButton(root, "粘贴");
        Button activate = exactButton(root, "启动");
        if (paste != null) styleActionButton(paste, false);
        if (activate != null) {
            activate.setText("验证并启动");
            styleActionButton(activate, true);
        }

        for (TextView text : all(root, TextView.class)) {
            if (text == brand || text == subtitle || text == input
                    || text == paste || text == activate) continue;
            String value = text.getText() == null ? "" : text.getText().toString();
            if (!value.isEmpty()) {
                text.setTextColor(value.contains("错误") || value.contains("失败") ? DANGER : MUTED);
                text.setTextSize(13);
            }
        }

        for (LinearLayout layout : all(root, LinearLayout.class)) {
            layout.setClipToPadding(false);
        }
    }

    private void styleBrowser(ViewGroup root, WebView webView) {
        root.setBackgroundColor(BG_START);
        webView.setBackgroundColor(BG_START);

        Button back = exactButton(root, "返回");
        ViewGroup toolbar = back == null ? null : parentGroup(back);
        if (toolbar != null) {
            toolbar.setPadding(dp(8), dp(7), dp(8), dp(7));
            toolbar.setBackground(gradient(Color.rgb(13, 18, 31), Color.rgb(20, 28, 48), 0));
            toolbar.setElevation(dp(10));
        }

        for (String label : new String[]{"返回", "首页", "刷新", "重置", "服务"}) {
            Button button = exactButton(root, label);
            if (button != null) styleToolbarButton(button);
        }

        for (TextView text : all(root, TextView.class)) {
            String value = text.getText() == null ? "" : text.getText().toString();
            if ("加载中…".equals(value) || "已就绪".equals(value) || "页面加载失败".equals(value)) {
                text.setTextColor("页面加载失败".equals(value) ? DANGER : TEXT);
                text.setTextSize(11);
                text.setGravity(Gravity.CENTER);
                text.setPadding(dp(12), 0, dp(12), 0);
                text.setBackground(stroked(Color.rgb(29, 39, 64), Color.rgb(63, 79, 112), 16, 1));
            }
        }

        for (ProgressBar bar : all(root, ProgressBar.class)) {
            bar.setProgressTintList(ColorStateList.valueOf(ACCENT_2));
            bar.setIndeterminateTintList(ColorStateList.valueOf(ACCENT_2));
        }

        try {
            webView.evaluateJavascript(overlayScript(), null);
        } catch (Throwable ignored) { }
    }

    private void styleActionButton(Button button, boolean primary) {
        button.setAllCaps(false);
        button.setTextSize(15);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setLetterSpacing(0.04f);
        button.setTextColor(primary ? Color.WHITE : TEXT);
        button.setPadding(dp(14), 0, dp(14), 0);
        button.setBackground(actionBackground(primary));
        button.setElevation(primary ? dp(8) : dp(3));
    }

    private void styleToolbarButton(Button button) {
        button.setAllCaps(false);
        button.setTextSize(11);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setTextColor(TEXT);
        button.setPadding(dp(10), 0, dp(10), 0);
        button.setBackground(toolbarBackground());
        button.setElevation(dp(2));
    }

    private StateListDrawable actionBackground(boolean primary) {
        StateListDrawable states = new StateListDrawable();
        int normalStart = primary ? ACCENT : CARD_SOFT;
        int normalEnd = primary ? Color.rgb(74, 157, 226) : Color.rgb(34, 45, 70);
        states.addState(new int[]{-android.R.attr.state_enabled}, solid(Color.rgb(55, 61, 78), 18));
        states.addState(new int[]{android.R.attr.state_pressed}, solid(primary
                ? Color.rgb(89, 67, 207) : Color.rgb(42, 52, 78), 18));
        states.addState(new int[]{}, gradient(normalStart, normalEnd, 18));
        return states;
    }

    private StateListDrawable toolbarBackground() {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_pressed}, solid(Color.rgb(48, 61, 91), 14));
        states.addState(new int[]{}, stroked(Color.rgb(26, 35, 58), Color.rgb(54, 68, 97), 14, 1));
        return states;
    }

    private GradientDrawable gradient(int start, int end, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{start, end});
        drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    private GradientDrawable solid(int color, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    private GradientDrawable stroked(int color, int strokeColor, int radiusDp, int strokeDp) {
        GradientDrawable drawable = solid(color, radiusDp);
        drawable.setStroke(dp(strokeDp), strokeColor);
        return drawable;
    }

    private ViewGroup parentGroup(View view) {
        return view != null && view.getParent() instanceof ViewGroup
                ? (ViewGroup) view.getParent() : null;
    }

    private TextView exactText(View root, String text) {
        for (TextView view : all(root, TextView.class)) {
            if (!(view instanceof Button) && text.equals(String.valueOf(view.getText()))) return view;
        }
        return null;
    }

    private Button exactButton(View root, String text) {
        for (Button button : all(root, Button.class)) {
            if (text.equals(String.valueOf(button.getText()))) return button;
        }
        return null;
    }

    private <T extends View> T first(View root, Class<T> type) {
        List<T> values = all(root, type);
        return values.isEmpty() ? null : values.get(0);
    }

    private <T extends View> List<T> all(View root, Class<T> type) {
        List<T> result = new ArrayList<>();
        collect(root, type, result);
        return result;
    }

    private <T extends View> void collect(View view, Class<T> type, List<T> out) {
        if (type.isInstance(view)) out.add(type.cast(view));
        if (!(view instanceof ViewGroup)) return;
        ViewGroup group = (ViewGroup) view;
        for (int i = 0; i < group.getChildCount(); i++) {
            collect(group.getChildAt(i), type, out);
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private String overlayScript() {
        return "(function(){"
                + "if(window.__GG_PREMIUM_UI__)return;window.__GG_PREMIUM_UI__=true;"
                + "var s=document.getElementById('gg-premium-ui-style');"
                + "if(!s){s=document.createElement('style');s.id='gg-premium-ui-style';"
                + "s.textContent='"
                + "#orange-script-panel-button{width:58px!important;height:58px!important;right:18px!important;bottom:18px!important;border-radius:20px!important;border:1px solid rgba(255,255,255,.28)!important;background:linear-gradient(145deg,#7c5cff,#36c7be)!important;color:#fff!important;box-shadow:0 18px 42px rgba(24,20,70,.42),inset 0 1px 0 rgba(255,255,255,.28)!important;font:800 13px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif!important;letter-spacing:.08em!important;backdrop-filter:blur(18px)!important;-webkit-backdrop-filter:blur(18px)!important;transition:transform .18s ease,box-shadow .18s ease!important;}"
                + "#orange-script-panel-button:active{transform:scale(.94)!important;box-shadow:0 10px 24px rgba(24,20,70,.32)!important;}"
                + "#orange-script-panel{width:min(390px,calc(100vw - 24px))!important;max-height:min(78vh,680px)!important;border-radius:28px!important;border:1px solid rgba(164,181,255,.22)!important;background:linear-gradient(155deg,rgba(14,20,36,.97),rgba(22,31,53,.96))!important;color:#f5f7ff!important;box-shadow:0 28px 80px rgba(2,6,23,.56),inset 0 1px 0 rgba(255,255,255,.08)!important;backdrop-filter:blur(24px) saturate(150%)!important;-webkit-backdrop-filter:blur(24px) saturate(150%)!important;overflow:auto!important;}"
                + "#orange-script-panel,#orange-script-panel *{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif!important;box-sizing:border-box!important;color:#edf2ff!important;}"
                + "#orange-script-panel>div,#orange-script-panel section{background-color:transparent!important;border-color:rgba(150,165,210,.18)!important;}"
                + "#orange-script-panel button{min-height:42px!important;border-radius:14px!important;border:1px solid rgba(255,255,255,.16)!important;background:linear-gradient(135deg,#7457f7,#3aa8cb)!important;color:#fff!important;font-weight:750!important;box-shadow:0 10px 24px rgba(50,54,150,.24)!important;}"
                + "#orange-script-panel button:active{transform:scale(.98)!important;}"
                + "#orange-script-panel input,#orange-script-panel select,#orange-script-panel textarea{border-radius:14px!important;border:1px solid rgba(137,155,205,.28)!important;background:#0c1322!important;color:#fff!important;outline:none!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)!important;}"
                + "#orange-script-panel hr{border-color:rgba(137,155,205,.18)!important;}"
                + "#orange-script-panel::-webkit-scrollbar{width:6px!important;}#orange-script-panel::-webkit-scrollbar-thumb{background:rgba(130,118,255,.55)!important;border-radius:99px!important;}"
                + "';document.documentElement.appendChild(s);}"
                + "var map={'使用前必看':'快捷控制中心','iOS 风格主题':'精致深色主题','状态：2026年7月23日正常使用':'服务状态 · 已就绪','按住这里可拖动悬浮窗':'按住顶部即可拖动','全屏模式':'沉浸显示','一键进入或退出页面全屏显示':'快速切换沉浸式显示','修改累充':'参数设置','自定义当前鲜花与累充数量':'调整当前显示参数','切换':'立即切换','去修改':'打开设置'};"
                + "function tune(){var b=document.getElementById('orange-script-panel-button');if(b){b.textContent='GG';b.setAttribute('aria-label','打开快捷控制中心');}var p=document.getElementById('orange-script-panel');if(!p)return;var w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);var n;while(n=w.nextNode()){var t=(n.nodeValue||'').trim();if(map[t])n.nodeValue=n.nodeValue.replace(t,map[t]);}}"
                + "var o=new MutationObserver(tune);o.observe(document.documentElement,{childList:true,subtree:true,characterData:true});tune();setTimeout(tune,500);setTimeout(tune,1500);"
                + "})();";
    }

    @Override public void onActivityStarted(Activity activity) { }
    @Override public void onActivityPaused(Activity activity) { }
    @Override public void onActivityStopped(Activity activity) { }
    @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) { }
    @Override public void onActivityDestroyed(Activity activity) { }
}
