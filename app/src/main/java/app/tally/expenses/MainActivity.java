package app.tally.expenses;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
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
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSave;
    /** "loan:<id>[:pay]" from a tapped reminder, delivered to the page once it has loaded. */
    private String pendingOpen;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

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

        pendingOpen = getIntent().getStringExtra("open");
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("https://" + HOST + "/assets/index.html");
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

    private class Bridge {
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
                }
            });
        }
    }
}
