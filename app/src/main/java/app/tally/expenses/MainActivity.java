package app.tally.expenses;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.media.AudioAttributes;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.text.format.DateFormat;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int SAVE_FILE = 2;
    private static final int PICK_FOLDER = 4;
    private static final int PICK_RESTORE = 5;
    private static final int NOTIF_REQ = 3;
    /** Set while the activity is in the background (the WebView pauses once the page has saved what it must). */
    private boolean paused;
    /** The notification prompt came from a Settings "Allow" button: refused for good, it opens the settings page. */
    private boolean notifFromButton;
    /** Android's notification prompt is up (its answer not back yet). */
    private boolean asking;

    private WebView web;
    /** Holds the WebView; padded for the system bars and keyboard, since Android 15 draws apps edge to edge. */
    private FrameLayout root;
    /** True once the page has installed its window.tally* hooks (Android.ready); calls made before wait in queued. */
    private boolean pageUp;
    private final ArrayList<String> queued = new ArrayList<>();
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
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // only when there is something to open: a plain tap on the widget must not close a save dialog or a
        // settings page left open on top of Tally
        if (open != null) i.putExtra("open", open).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return i;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            web = new WebView(this);
        } catch (RuntimeException e) { // Android System WebView missing, disabled or being updated
            ready = true;
            TextView msg = new TextView(this);
            msg.setText(R.string.no_webview);
            msg.setGravity(android.view.Gravity.CENTER);
            msg.setPadding(64, 64, 64, 64);
            setContentView(msg);
            return;
        }
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
        // hardening: the page is only ever the app's own assets; files are read and written by the shell (Restore,
        // backups), never by the WebView, which gets no file/content access, no location and no mixed content
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // the page follows the phone's text size itself (fontScale(), capped so layouts hold), not the WebView's
        // text zoom, which would scale text past what the layout was made for
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            /**
             * The WebView's renderer crashed or was killed for memory (low-RAM phones, WebView updates). Unhandled, it
             * takes the whole app down; instead the page starts afresh (everything is saved as it happens).
             */
            @Override
            @TargetApi(26)
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != web) return true;
                root.removeView(web);
                web.destroy();
                web = null;
                pageUp = false;
                queued.clear();
                recreate();
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(java.util.Locale.ROOT);
                // only the app's own https assets stay in the WebView (WebViewAssetLoader serves nothing over http)
                if ("https".equals(scheme) && HOST.equals(u.getHost())) return false;
                // web links (the About footer) open in the browser; anything else (intent:, content:, file:…) is dropped
                if ("https".equals(scheme) || "http".equals(scheme)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE));
                    } catch (ActivityNotFoundException ignored) { }
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "Android");
        ReminderReceiver.channels(this); // listed in Android's settings from the start, one per kind of reminder

        // only a fresh launch opens a form: relaunched from Recents (or recreated), the task's old intent would
        // reopen the quick-add form or payment sheet it once asked for
        if (savedInstanceState == null && (getIntent().getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0) {
            open(getIntent().getStringExtra("open"));
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
        paused = false;
        if (web == null) return; // renderer gone: being recreated
        web.resumeTimers();
        web.onResume();
        pushTheme();
        web.evaluateJavascript("window.tallyResume&&window.tallyResume()", null);
    }

    /**
     * In the background the page does nothing, so its timers and rendering stop (battery). First the page hands over
     * any data still waiting for the backup (tallyPause → mirrorNow), then the WebView pauses, unless the app came
     * back in the meantime.
     */
    @Override
    protected void onPause() {
        super.onPause();
        paused = true;
        if (web == null) return;
        web.evaluateJavascript("window.tallyPause&&window.tallyPause()", v -> {
            if (Build.VERSION.SDK_INT >= 29) sleep();
        });
    }

    /** Before Android 10 a visible app in split screen is paused too: there it only sleeps once out of sight. */
    @Override
    protected void onStop() {
        super.onStop();
        if (Build.VERSION.SDK_INT < 29) sleep();
    }

    private void sleep() {
        if (paused && !isDestroyed() && web != null) {
            web.onPause();
            web.pauseTimers();
        }
    }

    /** The answer to Android's notification prompt: the page re-checks (Settings' card, the first-open dialog). */
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != NOTIF_REQ) return;
        asking = false;
        // empty: the request was interrupted (a second one while the prompt was up), not refused
        if (results.length == 0) return;
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        boolean fromButton = notifFromButton;
        notifFromButton = false;
        // asked from Settings' button and Android didn't show its prompt (denied for good): open the settings page
        if (!granted && fromButton && Build.VERSION.SDK_INT >= 33
                && !shouldShowRequestPermissionRationale("android.permission.POST_NOTIFICATIONS")) {
            openNotifSettings();
        }
        perms();
    }

    private void perms() {
        if (web != null && !isDestroyed()) web.evaluateJavascript("window.tallyPerms&&window.tallyPerms()", null);
    }

    /** Android 13+: shows the system prompt; true if it was asked (the answer then arrives in onRequestPermissionsResult). */
    private boolean askNotifPermission() {
        if (Build.VERSION.SDK_INT < 33
                || checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        if (asking) return true; // its prompt is already up: one Allow, one prompt
        asking = true;
        getSharedPreferences("tally_perms", MODE_PRIVATE).edit().putBoolean("notif", true).apply();
        requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, NOTIF_REQ);
        return true;
    }

    /** Android 13+'s prompt can still show: never asked on this install, or refused only once so far. */
    private boolean canPromptNotif() {
        return Build.VERSION.SDK_INT >= 33
                && (!getSharedPreferences("tally_perms", MODE_PRIVATE).getBoolean("notif", false)
                    || shouldShowRequestPermissionRationale("android.permission.POST_NOTIFICATIONS"));
    }

    private void openNotifSettings() {
        Uri pkg = Uri.parse("package:" + getPackageName());
        Intent i = Build.VERSION.SDK_INT >= 26
                ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg);
        try { startActivity(i); }
        catch (ActivityNotFoundException e) {
            try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)); }
            catch (ActivityNotFoundException ignored) { }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        open(intent.getStringExtra("open"));
    }

    /** "loan:<id>[:pay]", "add:out", "check"… from the widget or a reminder: handed to the page (window.tallyOpen). */
    private void open(String what) {
        if (what != null) callPage("window.tallyOpen&&window.tallyOpen(" + JSONObject.quote(what) + ")");
    }

    /**
     * Runs a window.tally* call in the page, or keeps it until the page is up. After Android reclaimed Tally's memory
     * while a picker was open, the answer arrives while the page is still loading and would otherwise be lost.
     */
    private void callPage(String js) {
        if (pageUp && web != null && !isDestroyed()) web.evaluateJavascript(js, null);
        else queued.add(js);
    }

    /** Ends the launch screen: called by the page (Android.ready) once it has rendered, or by the 3 s fallback. */
    private void showPage() {
        if (ready || isDestroyed() || web == null) return;
        ready = true;
        if (pageColor != null) root.setBackgroundColor(pageColor);
        web.setVisibility(View.VISIBLE);
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
        if (web != null) web.saveState(out);
    }

    /** An export waiting for Android's save dialog: on disk, so it survives Tally's process being reclaimed meanwhile. */
    private File pendingSave() {
        return new File(getCacheDir(), "pending-save");
    }

    private static byte[] readFile(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            for (int r; (r = in.read(buf)) > 0; ) out.write(buf, 0, r);
            return out.toByteArray();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == SAVE_FILE) {
            final File f = pendingSave();
            final Uri doc = resultCode == RESULT_OK && data != null ? data.getData() : null;
            final Context app = getApplicationContext();
            // written off the UI thread (a slow cloud folder must not freeze the app) and read back like the auto
            // backup: "Saved" only when the file holds exactly the bytes, so Delete all data never goes on after a
            // backup that didn't land (a provider often reports a failed write only when the file is closed)
            new Thread(() -> {
                boolean ok = false;
                if (doc != null && f.exists()) {
                    try { ok = BackupReceiver.put(app.getContentResolver(), doc, readFile(f)); }
                    catch (Throwable ignored) { }
                }
                f.delete();
                final boolean saved = ok;
                runOnUiThread(() -> {
                    if (!isDestroyed()) callPage("window.tallySaved&&window.tallySaved(" + saved + ")");
                });
            }).start();
        } else if (requestCode == PICK_RESTORE) {
            restorePicked(resultCode == RESULT_OK && data != null ? data.getData() : null);
        } else if (requestCode == PICK_FOLDER) {
            Uri tree = resultCode == RESULT_OK && data != null ? data.getData() : null;
            if (tree == null) {
                folderPicked(null);
                return;
            }
            try {
                getContentResolver().takePersistableUriPermission(tree,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (SecurityException e) {
                folderPicked(null);
                return;
            }
            // remembered and marked not backed up yet: the first backup comes at the set time (Back up now: at once)
            BackupReceiver.setFolder(this, tree);
            folderPicked("");
        }
    }

    /**
     * Hands a picked backup file's text to the page: window.tallyRestore(text, err). Both null = cancelled. Read here,
     * with the real bytes, rather than through WebView's own file chooser, whose File refuses a document whose size
     * the picker's index reports wrongly (what made an auto backup "can't be opened").
     */
    private void restorePicked(Uri doc) {
        if (doc == null) {
            restoreResult(null, null);
            return;
        }
        final Context app = getApplicationContext();
        new Thread(() -> {
            String text = null, err = null;
            try {
                text = new String(BackupReceiver.readDoc(app.getContentResolver(), doc, BackupReceiver.MAX), StandardCharsets.UTF_8);
            } catch (IOException e) {
                err = "too big".equals(e.getMessage()) ? "That file is too big to be a Tally backup" : "Couldn't read that file";
            } catch (Throwable e) { // SecurityException, or out of memory on a small phone
                err = "Couldn't read that file";
            }
            final String t = text, e2 = err;
            runOnUiThread(() -> restoreResult(t, e2));
        }).start();
    }

    private void restoreResult(String text, String err) {
        if (isDestroyed()) return;
        String a = text == null ? "null" : JSONObject.quote(text), b = err == null ? "null" : JSONObject.quote(err);
        callPage("window.tallyRestore&&window.tallyRestore(" + a + "," + b + ")");
    }

    /** Tells the page how picking a backup folder went: null = cancelled, "" = backed up, else the problem. */
    private void folderPicked(String err) {
        if (isDestroyed()) return;
        String arg = err == null ? "null" : JSONObject.quote(err);
        callPage("window.tallyFolder&&window.tallyFolder(" + arg + ")");
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
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

    /**
     * Pulse length (ms) and amplitude for strengths 1–5: both rise, so a stronger level is never felt as lighter, on
     * any motor (without amplitude control the length alone orders them). The page's browser fallback uses the same
     * lengths (PULSE_MS in js/core.js).
     */
    private static final int[] PULSE_MS = {14, 20, 28, 38, 52};
    private static final int[] PULSE_AMP = {90, 130, 175, 215, 255};
    /** Strengths 1–3 as one click primitive at a rising scale, where the vibrator really has it (see crisp()). */
    private static final float[] CLICK_SCALE = {0.35f, 0.65f, 1f};
    private Boolean crisp;

    /**
     * Whether the vibrator plays a real click primitive (API 30+, reported by the hardware). Not the predefined
     * EFFECT_TICK / CLICK / HEAVY_CLICK: on phones whose hardware lacks those, Android plays the maker's fallback
     * patterns instead, often buzzes of unrelated lengths, and "tick" could feel stronger than "heavy click".
     */
    private boolean crisp(Vibrator v) {
        if (crisp == null) {
            boolean ok = false;
            if (Build.VERSION.SDK_INT >= 30) {
                try {
                    ok = v.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK);
                } catch (RuntimeException ignored) { }
            }
            crisp = ok;
        }
        return crisp;
    }

    /**
     * The haptic for strength n (1–5), each stronger than the one before on every phone: 1–3 are the same click at a
     * rising scale where the hardware has it (crisp and phone-tuned), otherwise a pulse; 4–5 are always longer
     * pulses, which even a basic vibration motor makes clearly felt (and a full click, ~10 ms, is lighter than them).
     */
    @TargetApi(26)
    private VibrationEffect effect(Vibrator v, int n) {
        if (n <= 3 && crisp(v)) return click(CLICK_SCALE[n - 1]);
        int amp = v.hasAmplitudeControl() ? PULSE_AMP[n - 1] : VibrationEffect.DEFAULT_AMPLITUDE;
        return VibrationEffect.createOneShot(PULSE_MS[n - 1], amp);
    }

    @TargetApi(30)
    private static VibrationEffect click(float scale) {
        return VibrationEffect.startComposition()
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, scale).compose();
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

        /** The page has rendered and installed its hooks: end the launch screen and hand over anything waiting. */
        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> {
                showPage();
                pageUp = true;
                ArrayList<String> q = new ArrayList<>(queued);
                queued.clear();
                for (String js : q) callPage(js);
            });
        }

        /** True only the first time on this install: the page then shows its Permissions dialog (once, never again). */
        @JavascriptInterface
        public boolean permsIntro() {
            SharedPreferences p = getSharedPreferences("tally_perms", MODE_PRIVATE);
            if (p.getBoolean("intro", false)) return false;
            p.edit().putBoolean("intro", true).apply();
            return true;
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

        /** The daily backup's settings: {on, h, m}. */
        @JavascriptInterface
        public void setBackup(String json) {
            BackupReceiver.setConfig(MainActivity.this, json);
        }

        /** The page's data, mirrored after every save while auto backup is on (see BackupReceiver). */
        @JavascriptInterface
        public void setBackupData(String json) {
            BackupReceiver.setData(MainActivity.this, json);
        }

        /** {folder, last, error} for Settings. */
        @JavascriptInterface
        public String backupStatus() {
            return BackupReceiver.status(MainActivity.this);
        }

        /** "Back up now": runs on the bridge's own thread (not the UI thread); "" when done, else the problem. */
        @JavascriptInterface
        public String backupNow() {
            String err = BackupReceiver.run(getApplicationContext(), true);
            return err == null ? "" : err;
        }

        /** Settings → Restore, from the auto backup: {text, when, folder} or {error}. On the bridge's own thread. */
        @JavascriptInterface
        public String readAutoBackup() {
            return BackupReceiver.readAuto(getApplicationContext());
        }

        /** Settings → Restore, any file: Android's document picker; the text comes back through window.tallyRestore. */
        @JavascriptInterface
        public void pickRestoreFile() {
            runOnUiThread(() -> {
                // every file: a backup's type is reported differently by different apps; the page checks the content
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try {
                    startActivityForResult(i, PICK_RESTORE);
                } catch (ActivityNotFoundException e) {
                    restoreResult(null, "No file picker on this phone");
                }
            });
        }

        /** Opens Android's folder picker for the daily backup; the answer comes back through window.tallyFolder. */
        @JavascriptInterface
        public void pickBackupFolder() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try {
                    startActivityForResult(i, PICK_FOLDER);
                } catch (ActivityNotFoundException e) {
                    folderPicked(null);
                }
            });
        }

        /**
         * What could keep reminders from arriving on time: {notif} notifications allowed, {exact} exact alarms
         * allowed (Android 12+), {battery} Tally isn't battery-optimised (the phone may otherwise hold its alarms).
         */
        @JavascriptInterface
        public String reminderHealth() {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            // Android 13+: the runtime permission is the real grant; areNotificationsEnabled() also covers "all off"
            boolean notif = (nm == null || nm.areNotificationsEnabled()) && (Build.VERSION.SDK_INT < 33
                    || checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED);
            boolean exact = Build.VERSION.SDK_INT < 31 || am == null || am.canScheduleExactAlarms();
            boolean battery = pm == null || pm.isIgnoringBatteryOptimizations(getPackageName());
            return "{\"notif\":" + notif + ",\"exact\":" + exact + ",\"battery\":" + battery + "}";
        }

        /**
         * Settings' Allow buttons. "notif": Android's own prompt while it can still show it, else Tally's notification
         * settings. "exact": Android's "Alarms & reminders" switch. "battery": Android's "Stop optimising battery
         * usage?" popup. Anything else, or a phone without that screen: App info.
         */
        @SuppressLint("BatteryLife") // on purpose: reminders and the backup must never be held back
        @JavascriptInterface
        public void openSetting(final String kind) {
            runOnUiThread(() -> {
                Uri pkg = Uri.parse("package:" + getPackageName());
                if ("notif".equals(kind)) {
                    boolean prompt = canPromptNotif();
                    notifFromButton = prompt;
                    if (!(prompt && askNotifPermission())) openNotifSettings();
                    return;
                }
                Intent i;
                if ("exact".equals(kind) && Build.VERSION.SDK_INT >= 31) {
                    i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg);
                } else if ("battery".equals(kind)) {
                    i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg);
                } else {
                    i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg);
                }
                try {
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)); }
                    catch (ActivityNotFoundException ignored) { }
                }
            });
        }

        /** The phone's text size (Settings → Display → Font size), 1 = default. A change restarts the activity. */
        @JavascriptInterface
        public float fontScale() {
            return MainActivity.this.getResources().getConfiguration().fontScale;
        }

        /** The phone's 12 / 24-hour setting, for the time picker and time labels. */
        @JavascriptInterface
        public boolean is24h() {
            return DateFormat.is24HourFormat(MainActivity.this);
        }

        /**
         * A reminder was switched on: Android 13+'s notification prompt, only while it can still show and the
         * permission is missing (never a settings page unasked). The page hears back through window.tallyPerms.
         */
        @JavascriptInterface
        public void requestNotifications() {
            runOnUiThread(() -> {
                notifFromButton = false;
                if (!(canPromptNotif() && askNotifPermission())) perms();
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
                // before Android 8 the navigation bar's buttons are always white: keep it dark under a light page
                w.setNavigationBarColor(Build.VERSION.SDK_INT >= 26 || dark ? c : Color.BLACK);
                if (web != null) web.setBackgroundColor(c);
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
            // written here, on the bridge's own thread: the text waits on disk while Android's save dialog is open
            boolean parked;
            try (OutputStream os = new FileOutputStream(pendingSave())) {
                os.write(content.getBytes(StandardCharsets.UTF_8));
                parked = true;
            } catch (IOException | RuntimeException e) {
                parked = false;
            }
            if (!parked) {
                runOnUiThread(() -> callPage("window.tallySaved&&window.tallySaved(false)"));
                return;
            }
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(i, SAVE_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingSave().delete();
                    callPage("window.tallySaved&&window.tallySaved(false)");
                }
            });
        }
    }
}
