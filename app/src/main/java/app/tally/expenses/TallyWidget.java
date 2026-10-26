package app.tally.expenses;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.ArrayMap;
import android.util.DisplayMetrics;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;

/**
 * Home-screen widget: today's total balance, today's spending and a + that opens {@link QuickAddActivity}.
 * The page is the source of truth: it sends ready-formatted numbers with Android.setWidget(json)
 *   {date:"yyyy-MM-dd", balance:"$1,250.00", spent:"$12.50", zero:"$0.00"}
 * and "spent" only counts for that date, so after midnight the widget shows zero until the app is opened.
 */
public class TallyWidget extends AppWidgetProvider {
    static final String A_TICK = "app.tally.expenses.WIDGET_TICK";
    private static final String PREFS = "tally_widget";
    /** The layout's text sizes (sp): heading, balance, spending line; a line of text is about 1.33 sizes tall. */
    private static final float T_TITLE = 12, T_BALANCE = 22, T_SPENT = 13, LINE = 1.33f;
    /** The layout's vertical padding (dp). */
    private static final int PAD = 20;

    static void save(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply();
        refresh(ctx);
    }

    static void refresh(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, TallyWidget.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) m.updateAppWidget(id, build(ctx, m, id));
        scheduleMidnight(ctx);
    }

    /**
     * Widget added, or the home screen's update after a reboot. Also re-arms the reminders and the backup: on phones
     * that hold back BOOT_COMPLETED (e.g. without "Autostart"), this can be the first chance to after a restart.
     */
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(ctx, m, id));
        scheduleMidnight(ctx);
        ReminderReceiver.schedule(ctx);
        BackupReceiver.schedule(ctx);
    }

    /** A text size (sp) as the phone shows it, in dp: Android 14+ scales large text less than in proportion. */
    private static float dp(DisplayMetrics dm, float sp) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, dm) / dm.density;
    }

    /** Resized: the text is fitted to the new height. */
    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager m, int id, Bundle options) {
        m.updateAppWidget(id, build(ctx, m, id));
    }

    @Override
    public void onReceive(Context ctx, Intent in) {
        super.onReceive(ctx, in);
        String a = in.getAction();
        if (A_TICK.equals(a) || Intent.ACTION_TIME_CHANGED.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
            refresh(ctx);
        }
    }

    /**
     * The widget for each size the home screen may show it at (Android 12+ picks among them itself), else one for its
     * landscape height and one for its portrait height (the home screen picks by its own orientation, not Tally's).
     */
    @SuppressWarnings("deprecation") // getParcelableArrayList(String): its typed form needs Android 13
    private static RemoteViews build(Context ctx, AppWidgetManager m, int id) {
        Bundle o = m.getAppWidgetOptions(id);
        if (Build.VERSION.SDK_INT >= 31) {
            ArrayList<SizeF> sizes = o.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if (sizes != null && !sizes.isEmpty() && sizes.size() <= 16) {
                ArrayMap<SizeF, RemoteViews> each = new ArrayMap<>();
                for (SizeF s : sizes) each.put(s, build(ctx, s.getHeight()));
                return new RemoteViews(each);
            }
        }
        return new RemoteViews(build(ctx, o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)),
                build(ctx, o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)));
    }

    /**
     * The widget at a height (dp; 0 = unknown, as laid out). Its text follows the phone's text size as far as the
     * height allows: at large sizes the heading goes first, then the text shrinks to fit (to 85% of the normal size at
     * least), instead of being cut off at the top and bottom.
     */
    private static RemoteViews build(Context ctx, float height) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_tally);
        if (height > 0) {
            DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
            float title = dp(dm, T_TITLE), bal = dp(dm, T_BALANCE), spent = dp(dm, T_SPENT), room = height - PAD;
            boolean withTitle = LINE * (title + bal + spent) <= room;
            float k = Math.min(1, room / (LINE * ((withTitle ? title : 0) + bal + spent)));
            v.setViewVisibility(R.id.w_title, withTitle ? View.VISIBLE : View.GONE);
            v.setTextViewTextSize(R.id.w_title, TypedValue.COMPLEX_UNIT_DIP, Math.max(0.85f * T_TITLE, title * k));
            v.setTextViewTextSize(R.id.w_balance, TypedValue.COMPLEX_UNIT_DIP, Math.max(0.85f * T_BALANCE, bal * k));
            v.setTextViewTextSize(R.id.w_spent_label, TypedValue.COMPLEX_UNIT_DIP, Math.max(0.85f * T_SPENT, spent * k));
            v.setTextViewTextSize(R.id.w_spent, TypedValue.COMPLEX_UNIT_DIP, Math.max(0.85f * T_SPENT, spent * k));
        }
        String balance = ctx.getString(R.string.w_open), spent = "";
        try {
            JSONObject o = new JSONObject(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", "{}"));
            if (o.has("balance")) {
                balance = o.optString("balance");
                spent = ReminderReceiver.today().equals(o.optString("date")) ? o.optString("spent") : o.optString("zero");
            }
        } catch (JSONException ignored) { }
        v.setTextViewText(R.id.w_balance, balance);
        v.setTextViewText(R.id.w_spent, spent);
        // the labels in the app's language: the layout's own would follow the home screen's (no per-app language)
        v.setTextViewText(R.id.w_title, ctx.getString(R.string.w_label));
        v.setTextViewText(R.id.w_spent_label, ctx.getString(R.string.w_spent));
        v.setContentDescription(R.id.w_add, ctx.getString(R.string.w_add));

        // through OpenActivity (like the + goes through QuickAddActivity): the home screen starts widget taps with a
        // plain-colour splash, so the app itself is started one step later, from our own activity, and gets its logo
        Intent open = new Intent(ctx, OpenActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
        v.setOnClickPendingIntent(R.id.w_body, PendingIntent.getActivity(ctx, 40, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        Intent add = new Intent(ctx, QuickAddActivity.class);
        add.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
        v.setOnClickPendingIntent(R.id.w_add, PendingIntent.getActivity(ctx, 41, add,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }

    /** Wake shortly after midnight so "Spent today" resets even if the app isn't opened. */
    private static void scheduleMidnight(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar c = ReminderReceiver.dayAt(1, 0, 0);
        c.add(Calendar.SECOND, 5);
        Intent i = new Intent(ctx, TallyWidget.class).setAction(A_TICK);
        am.set(AlarmManager.RTC, c.getTimeInMillis(), PendingIntent.getBroadcast(ctx, 42, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }
}
