package app.tally.expenses;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Home-screen widget: today's total balance, today's spending and a + that opens {@link QuickAddActivity}.
 * The page is the source of truth: it sends ready-formatted numbers with Android.setWidget(json)
 *   {date:"yyyy-MM-dd", balance:"BDT 60,600.00", spent:"BDT 1,041.00", zero:"BDT 0.00"}
 * and "spent" only counts for that date, so after midnight the widget shows zero until the app is opened.
 */
public class TallyWidget extends AppWidgetProvider {
    static final String A_TICK = "app.tally.expenses.WIDGET_TICK";
    private static final String PREFS = "tally_widget";

    static void save(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply();
        refresh(ctx);
    }

    static void refresh(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, TallyWidget.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) m.updateAppWidget(id, build(ctx));
        scheduleMidnight(ctx);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(ctx));
        scheduleMidnight(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent in) {
        super.onReceive(ctx, in);
        String a = in.getAction();
        if (A_TICK.equals(a) || Intent.ACTION_TIME_CHANGED.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a)
                || Intent.ACTION_DATE_CHANGED.equals(a)) {
            refresh(ctx);
        }
    }

    private static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_tally);
        String balance = ctx.getString(R.string.w_open), spent = "";
        try {
            JSONObject o = new JSONObject(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", "{}"));
            if (o.has("balance")) {
                balance = o.optString("balance");
                spent = today().equals(o.optString("date")) ? o.optString("spent") : o.optString("zero");
            }
        } catch (JSONException ignored) { }
        v.setTextViewText(R.id.w_balance, balance);
        v.setTextViewText(R.id.w_spent, spent);

        Intent open = new Intent(ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
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
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_MONTH, 1);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 5);
        c.set(Calendar.MILLISECOND, 0);
        Intent i = new Intent(ctx, TallyWidget.class).setAction(A_TICK);
        am.set(AlarmManager.RTC, c.getTimeInMillis(), PendingIntent.getBroadcast(ctx, 42, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }

    private static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }
}
