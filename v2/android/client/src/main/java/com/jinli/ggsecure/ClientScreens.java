package com.jinli.ggsecure;

import android.app.Activity;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

/** Pure view construction. Authorization and browser lifecycles belong to their controllers. */
final class ClientScreens {
    private final Activity activity;

    ClientScreens(Activity activity) {
        this.activity = activity;
    }

    static final class Loading {
        final View root;
        final ProgressBar downloadProgress;

        Loading(View root, ProgressBar downloadProgress) {
            this.root = root;
            this.downloadProgress = downloadProgress;
        }
    }

    static final class License {
        final View root;
        final EditText input;
        final TextView status;
        final Button paste;
        final Button activate;

        License(View root, EditText input, TextView status, Button paste, Button activate) {
            this.root = root;
            this.input = input;
            this.status = status;
            this.paste = paste;
            this.activate = activate;
        }
    }

    static final class Browser {
        final View root;
        final WebView webView;
        final ProgressBar progress;
        final TextView status;
        final Button back;
        final Button home;
        final Button refresh;
        final Button reset;
        final Button service;

        Browser(View root, WebView webView, ProgressBar progress, TextView status,
                Button back, Button home, Button refresh, Button reset, Button service) {
            this.root = root;
            this.webView = webView;
            this.progress = progress;
            this.status = status;
            this.back = back;
            this.home = home;
            this.refresh = refresh;
            this.reset = reset;
            this.service = service;
        }
    }

    Loading loading(String message, boolean initializing) {
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(48), dp(28), dp(48));
        root.setBackgroundColor(Color.rgb(7, 10, 35));

        if (!initializing) {
            ProgressBar spinner = new ProgressBar(activity);
            root.addView(spinner, new LinearLayout.LayoutParams(dp(56), dp(56)));
        }

        TextView title = new TextView(activity);
        title.setText(UiText.get(UiText.GG));
        title.setTextSize(29);
        title.setTextColor(Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(20), 0, 0);
        root.addView(title, matchWrap(0));

        TextView text = new TextView(activity);
        text.setText(message);
        text.setTextSize(15);
        text.setTextColor(initializing ? Color.rgb(173, 225, 241) : Color.rgb(196, 181, 253));
        text.setGravity(Gravity.CENTER);
        text.setPadding(0, dp(12), 0, 0);
        root.addView(text, matchWrap(0));

        ProgressBar downloadBar = null;
        if (initializing) {
            downloadBar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
            downloadBar.setIndeterminate(true);
            downloadBar.setMax(100);
            ColorStateList cyan = ColorStateList.valueOf(Color.rgb(22, 190, 222));
            downloadBar.setProgressTintList(cyan);
            downloadBar.setIndeterminateTintList(cyan);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(250), dp(5));
            params.topMargin = dp(24);
            root.addView(downloadBar, params);
        }
        return new Loading(root, downloadBar);
    }

    License license(String initialMessage, String rememberedKey) {
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(245, 247, 251));

        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(44), dp(28), dp(34));
        scroll.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = new TextView(activity);
        title.setText(UiText.get(UiText.GG));
        title.setTextSize(27);
        title.setTextColor(Color.rgb(17, 24, 39));
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title, matchWrap(dp(10)));

        TextView subtitle = new TextView(activity);
        subtitle.setText(UiText.get(UiText.LICENSE_SUBTITLE));
        subtitle.setTextSize(14);
        subtitle.setTextColor(Color.rgb(75, 85, 99));
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setLineSpacing(0, 1.25f);
        root.addView(subtitle, matchWrap(dp(24)));

        EditText input = new EditText(activity);
        input.setHint(UiText.get(UiText.LICENSE_HINT));
        input.setSingleLine(true);
        input.setTextSize(17);
        input.setTypeface(Typeface.MONOSPACE);
        input.setPadding(dp(14), dp(14), dp(14), dp(14));
        if (rememberedKey != null && !rememberedKey.isEmpty()) {
            input.setText(rememberedKey);
            input.setSelection(input.length());
        }
        root.addView(input, matchWrap(dp(14)));

        LinearLayout actions = new LinearLayout(activity);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button paste = actionButton(UiText.get(UiText.PASTE), false);
        Button activate = actionButton(UiText.get(UiText.START), true);
        actions.addView(paste, new LinearLayout.LayoutParams(0, dp(52), 1));
        LinearLayout.LayoutParams activateParams = new LinearLayout.LayoutParams(0, dp(52), 2);
        activateParams.setMargins(dp(10), 0, 0, 0);
        actions.addView(activate, activateParams);
        root.addView(actions, matchWrap(dp(16)));

        TextView status = new TextView(activity);
        status.setText(initialMessage == null ? "" : initialMessage);
        status.setTextSize(14);
        status.setTextColor(Color.rgb(185, 28, 28));
        status.setGravity(Gravity.CENTER);
        root.addView(status, matchWrap(0));
        return new License(scroll, input, status, paste, activate);
    }

    Browser browser() {
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout toolbar = new LinearLayout(activity);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(3), dp(3), dp(3), dp(3));
        toolbar.setBackgroundColor(Color.rgb(17, 24, 39));

        Button back = toolbarButton(UiText.get(UiText.BACK));
        Button home = toolbarButton(UiText.get(UiText.HOME));
        Button refresh = toolbarButton(UiText.get(UiText.REFRESH));
        Button reset = toolbarButton(UiText.get(UiText.RESET));
        Button service = toolbarButton(UiText.get(UiText.SERVICE));

        TextView status = new TextView(activity);
        status.setText(UiText.get(UiText.LOADING));
        status.setTextColor(Color.WHITE);
        status.setTextSize(11);
        status.setSingleLine(true);
        status.setGravity(Gravity.CENTER_VERTICAL);
        status.setPadding(dp(5), 0, dp(2), 0);

        toolbar.addView(back);
        toolbar.addView(home);
        toolbar.addView(refresh);
        toolbar.addView(reset);
        toolbar.addView(service);
        toolbar.addView(status, new LinearLayout.LayoutParams(0, dp(40), 1));

        ProgressBar progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        WebView webView = new WebView(activity);
        webView.setBackgroundColor(Color.WHITE);

        root.addView(toolbar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
        root.addView(progress, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));
        root.addView(webView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        return new Browser(root, webView, progress, status, back, home, refresh, reset, service);
    }

    private Button actionButton(String text, boolean primary) {
        Button button = new Button(activity);
        button.setText(text);
        button.setTextSize(15);
        button.setAllCaps(false);
        button.setTextColor(primary ? Color.WHITE : Color.rgb(31, 41, 55));
        button.setBackgroundColor(primary ? Color.rgb(79, 70, 229) : Color.rgb(229, 231, 235));
        return button;
    }

    private Button toolbarButton(String text) {
        Button button = new Button(activity);
        button.setText(text);
        button.setTextSize(11);
        button.setTextColor(Color.WHITE);
        button.setAllCaps(false);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(dp(8), 0, dp(8), 0);
        button.setBackgroundColor(Color.TRANSPARENT);
        return button;
    }

    private LinearLayout.LayoutParams matchWrap(int bottomMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, 0, bottomMargin);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}
