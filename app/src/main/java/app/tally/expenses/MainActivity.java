package app.tally.expenses;

import android.annotation.TargetApi;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.media.AudioAttributes;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PICK_FILE = 1;
    private static final int SAVE_FILE = 2;

    private WebView web;
    /** Holds the WebView; padded for the system bars and keyboard, since Android 15 draws apps edge to edge. */
    private FrameLayout root;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSave;
    /** "loan:<id>[:pay]" from a tapped reminder, delivered to the page once it has loaded. */
    private String pendingOpen;
    /** False while the launch screen (the logo) is up: until the page calls Android.ready(), or 3 s at most. */
    private boolean ready;
    /** The page's surface colour from setBars, applied to root once the page is showing (so the logo stays until then). */
    private Integer pageColor;
    private final Handler handler = new Handler(Looper.getMainLooper());

    /**
     * How the widget, its quick add and reminders open the app: dressed like the launcher's own intent (MAIN +
     * LAUNCHER), because Android only resumes an already-running app from its last screen for such intents, and shows
     * the splash again for anything else. CLEAR_TOP + SINGLE_TOP still hand {@code open} to onNewIntent.
     */
    static Intent openIntent(Context ctx, String open) {
        Intent i = new Intent(ctx, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (open != null) i.putExtra("open", open);
        return i;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        // launch screen: the window background (Android 7-11) or the system splash (12+) shows the logo until the
        // page has drawn; the WebView is hidden until then and never shows its default white
        web.setBackgroundColor(getColor(R.color.surface));
        web.setVisibility(View.INVISIBLE);
        if (Build.VERSION.SDK_INT >= 31) {
            final View content = findViewById(android.R.id.content);
            content.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
                @Override
                public boolean onPreDraw() {
                    if (!ready) return false;
                    content.getViewTreeObserver().removeOnPreDrawListener(this);
                    return true;
                }
            });
        }
        handler.postDelayed(this::showPage, 3000);
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
        }

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                deliverOpen();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "Choose a file"), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "Android");

        // only a fresh launch opens a form: relaunched from Recents (or recreated), the task's old intent would
        // reopen the quick-add form or payment sheet it once asked for
        if (savedInstanceState == null && (getIntent().getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0) {
            pendingOpen = getIntent().getStringExtra("open");
        }
        // after the process was killed the WebView can come back empty: load the page whenever restoring fails
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl("https://" + HOST + "/assets/index.html");
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        pushTheme();
    }

    @Override
    protected void onResume() {
        super.onResume();
        pushTheme();
        web.evaluateJavascript("window.tallyResume&&window.tallyResume()", null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pendingOpen = intent.getStringExtra("open");
        deliverOpen();
    }

    /** Ends the launch screen: called by the page (Android.ready) once it has rendered, or by the 3 s fallback. */
    private void showPage() {
        if (ready || isDestroyed()) return;
        ready = true;
        if (pageColor != null) root.setBackgroundColor(pageColor);
        web.setVisibility(View.VISIBLE);
    }

    private void deliverOpen() {
        if (pendingOpen == null || web == null) return;
        String open = JSONObject.quote(pendingOpen);
        pendingOpen = null;
        web.evaluateJavascript("window.tallyOpen&&window.tallyOpen(" + open + ")", null);
    }

    /** Re-sends the phone's light/dark mode and wallpaper palette to the page. */
    private void pushTheme() {
        if (web != null) web.evaluateJavascript("window.tallyTheme&&window.tallyTheme(" + colorsJson() + ")", null);
    }

    /**
     * Light/dark mode plus, on Android 12+, the Material You tonal palettes
     * (accent1-3, neutral1-2), each ordered from tone 100 (white) down to tone 0 (black).
     */
    private String colorsJson() {
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        StringBuilder sb = new StringBuilder("{\"dark\":").append(dark);
        if (Build.VERSION.SDK_INT >= 31) {
            String[] names = {"a1", "a2", "a3", "n1", "n2"};
            int[][] ids = {
                {android.R.color.system_accent1_0, android.R.color.system_accent1_10, android.R.color.system_accent1_50,
                 android.R.color.system_accent1_100, android.R.color.system_accent1_200, android.R.color.system_accent1_300,
                 android.R.color.system_accent1_400, android.R.color.system_accent1_500, android.R.color.system_accent1_600,
                 android.R.color.system_accent1_700, android.R.color.system_accent1_800, android.R.color.system_accent1_900,
                 android.R.color.system_accent1_1000},
                {android.R.color.system_accent2_0, android.R.color.system_accent2_10, android.R.color.system_accent2_50,
                 android.R.color.system_accent2_100, android.R.color.system_accent2_200, android.R.color.system_accent2_300,
                 android.R.color.system_accent2_400, android.R.color.system_accent2_500, android.R.color.system_accent2_600,
                 android.R.color.system_accent2_700, android.R.color.system_accent2_800, android.R.color.system_accent2_900,
                 android.R.color.system_accent2_1000},
                {android.R.color.system_accent3_0, android.R.color.system_accent3_10, android.R.color.system_accent3_50,
                 android.R.color.system_accent3_100, android.R.color.system_accent3_200, android.R.color.system_accent3_300,
                 android.R.color.system_accent3_400, android.R.color.system_accent3_500, android.R.color.system_accent3_600,
                 android.R.color.system_accent3_700, android.R.color.system_accent3_800, android.R.color.system_accent3_900,
                 android.R.color.system_accent3_1000},
                {android.R.color.system_neutral1_0, android.R.color.system_neutral1_10, android.R.color.system_neutral1_50,
                 android.R.color.system_neutral1_100, android.R.color.system_neutral1_200, android.R.color.system_neutral1_300,
                 android.R.color.system_neutral1_400, android.R.color.system_neutral1_500, android.R.color.system_neutral1_600,
                 android.R.color.system_neutral1_700, android.R.color.system_neutral1_800, android.R.color.system_neutral1_900,
                 android.R.color.system_neutral1_1000},
                {android.R.color.system_neutral2_0, android.R.color.system_neutral2_10, android.R.color.system_neutral2_50,
                 android.R.color.system_neutral2_100, android.R.color.system_neutral2_200, android.R.color.system_neutral2_300,
                 android.R.color.system_neutral2_400, android.R.color.system_neutral2_500, android.R.color.system_neutral2_600,
                 android.R.color.system_neutral2_700, android.R.color.system_neutral2_800, android.R.color.system_neutral2_900,
                 android.R.color.system_neutral2_1000}
            };
            try {
                for (int p = 0; p < ids.length; p++) {
                    sb.append(",\"").append(names[p]).append("\":[");
                    for (int i = 0; i < ids[p].length; i++) {
                        if (i > 0) sb.append(',');
                        sb.append('"').append(String.format("#%06X", 0xFFFFFF & getColor(ids[p][i]))).append('"');
                    }
                    sb.append(']');
                }
            } catch (Exception e) {
                return "{\"dark\":" + dark + "}";
            }
        }
        return sb.append('}').toString();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE) {
            if (fileCallback == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        } else if (requestCode == SAVE_FILE) {
            boolean ok = false;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                    if (os != null) { os.write(pendingSave.getBytes(StandardCharsets.UTF_8)); ok = true; }
                } catch (Exception ignored) { }
            }
            pendingSave = null;
            web.evaluateJavascript("window.tallySaved&&window.tallySaved(" + ok + ")", null);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("window.tallyBack?window.tallyBack():false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    private Vibrator vibrator; // looked up once, on the first haptic

    @SuppressWarnings("deprecation")
    private Vibrator vibrator() {
        if (vibrator != null) return vibrator;
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager m = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = m == null ? null : m.getDefaultVibrator();
        } else vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        return vibrator;
    }

    /** Pulse lengths (ms) for strengths 1–5 where there are no predefined effects; the page's fallback uses the same. */
    private static final int[] PULSE_MS = {8, 14, 20, 30, 45};

    /**
     * The haptic for strength n (1–5), each stronger than the one before: 1–3 are the phone's own tick, click and
     * heavy click (API 29+), 4–5 longer full-strength pulses, which even a basic vibration motor makes clearly felt.
     */
    @TargetApi(26)
    private static VibrationEffect effect(Vibrator v, int n) {
        if (Build.VERSION.SDK_INT >= 29 && n <= 3) {
            return VibrationEffect.createPredefined(n == 1 ? VibrationEffect.EFFECT_TICK
                    : n == 2 ? VibrationEffect.EFFECT_CLICK : VibrationEffect.EFFECT_HEAVY_CLICK);
        }
        int amp = !v.hasAmplitudeControl() ? VibrationEffect.DEFAULT_AMPLITUDE : n >= 3 ? 255 : n == 2 ? 170 : 100;
        return VibrationEffect.createOneShot(PULSE_MS[n - 1], amp);
    }

    /**
     * Plays e as media vibration. Without attributes, Android 12+ files short effects under "touch feedback", which the
     * phone's own touch-vibration setting scales down or silences (often off), so taps were barely felt. The app has
     * its own on/off switch and strength instead.
     */
    @TargetApi(26)
    @SuppressWarnings("deprecation")
    private static void play(Vibrator v, VibrationEffect e) {
        if (Build.VERSION.SDK_INT >= 33) {
            v.vibrate(e, android.os.VibrationAttributes.createForUsage(android.os.VibrationAttributes.USAGE_MEDIA));
        } else {
            v.vibrate(e, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build());
        }
    }

    private class Bridge {
        /**
         * Haptic feedback on the vibrator directly (performHapticFeedback follows the phone's touch-feedback switch,
         * often off, so it was never felt). {@code level} is Settings → Feel → Strength, 1 (the phone's lightest tick)
         * … 5 (strong); "long" (a long-press) plays one level up. See {@link #effect} and {@link #play}.
         * The Vibrator is thread-safe: no UI thread needed. The page skips the call when vibration is switched off.
         */
        @JavascriptInterface
        public void haptic(final String kind, final int level) {
            Vibrator v = vibrator();
            if (v == null || !v.hasVibrator()) return;
            int n = Math.max(1, Math.min(5, level + ("long".equals(kind) ? 1 : 0)));
            try {
                if (Build.VERSION.SDK_INT >= 26) play(v, effect(v, n));
                else v.vibrate(PULSE_MS[n - 1]);
            } catch (RuntimeException ignored) { } // a vibrator that refuses must never break the page
        }

        /** The page has rendered: end the launch screen. */
        @JavascriptInterface
        public void ready() {
            runOnUiThread(MainActivity.this::showPage);
        }

        @JavascriptInterface
        public String getVersion() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public void setReminders(String json) {
            ReminderReceiver.save(MainActivity.this, json);
        }

        /** Today's balance + spending for the home-screen widget, formatted by the page. */
        @JavascriptInterface
        public void setWidget(String json) {
            TallyWidget.save(MainActivity.this, json);
        }

        @JavascriptInterface
        public String takeActions() {
            return ReminderReceiver.takeActions(MainActivity.this);
        }

        /** Android 13+ asks the user before an app may post notifications. */
        @JavascriptInterface
        public void requestNotifications() {
            if (Build.VERSION.SDK_INT < 33) return;
            runOnUiThread(() -> {
                if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 3);
                }
            });
        }

        @JavascriptInterface
        public String getColors() {
            return colorsJson();
        }

        /** Colours the status and navigation bars to match the page surface. */
        @JavascriptInterface
        public void setBars(final String color, final boolean dark) {
            runOnUiThread(() -> {
                int c;
                try { c = Color.parseColor(color); } catch (Exception e) { return; }
                Window w = getWindow();
                w.setStatusBarColor(c);
                w.setNavigationBarColor(c);
                web.setBackgroundColor(c);
                // root shows behind the (transparent) system bars on Android 15+; it is coloured only once the page
                // shows, so until then the logo in the window background stays visible
                pageColor = c;
                if (ready) root.setBackgroundColor(c);
                View decor = w.getDecorView();
                int flags = decor.getSystemUiVisibility();
                int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= 26) light |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                decor.setSystemUiVisibility(dark ? (flags & ~light) : (flags | light));
            });
        }

        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String content) {
            runOnUiThread(() -> {
                pendingSave = content;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(i, SAVE_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingSave = null;
                    web.evaluateJavascript("window.tallySaved&&window.tallySaved(false)", null);
                }
            });
        }
    }
}
