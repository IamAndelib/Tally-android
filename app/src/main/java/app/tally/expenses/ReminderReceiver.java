package app.tally.expenses;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Shows Tally's reminders. The page sends its reminder settings with Android.setReminders(json):
 *   {daily:{on,h,m}, lastEntry:"yyyy-MM-dd", dues:[{id,date,kind:"borrow"|"lend",who,amount}]}
 * - daily: at h:m, "Nothing written today" if lastEntry is not today; re-armed for the next day.
 * - dues: on the due date at 09:00 (and each morning while overdue), with "Record payment", "+1 day", "+1 week".
 *   The +N buttons move the stored date and queue {type:"extend",id,days} for the page (Android.takeActions()).
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String A_DAILY = "app.tally.expenses.DAILY";
    static final String A_DUE = "app.tally.expenses.DUE";
    static final String A_EXTEND = "app.tally.expenses.EXTEND";
    private static final String PREFS = "tally_reminders";
    private static final String CHANNEL = "reminders";
    private static final int DAILY_ID = 1;
    private static final int DUE_HOUR = 9;

    @Override
    public void onReceive(Context ctx, Intent in) {
        String a = in.getAction();
        if (A_DAILY.equals(a)) {
            if (!today().equals(prefs(ctx).getString("lastEntry", ""))) {
                show(ctx, DAILY_ID, "Nothing written in Tally today",
                        "Take a minute to note what you spent.", openApp(ctx, null, DAILY_ID), null);
            }
        } else if (A_DUE.equals(a)) {
            JSONObject d = findDue(ctx, in.getStringExtra("id"));
            if (d != null) showDue(ctx, d);
        } else if (A_EXTEND.equals(a)) {
            extend(ctx, in.getStringExtra("id"), in.getIntExtra("days", 1));
        }
        schedule(ctx);
    }

    // ---------- called from the page (MainActivity bridge) ----------

    static void save(Context ctx, String json) {
        try {
            JSONObject o = new JSONObject(json);
            prefs(ctx).edit().putString("config", o.toString()).putString("lastEntry", o.optString("lastEntry", "")).apply();
        } catch (JSONException ignored) { }
        schedule(ctx);
    }

    static synchronized String takeActions(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String q = p.getString("actions", "[]");
        p.edit().putString("actions", "[]").apply();
        return q;
    }

    // ---------- alarms ----------

    static void schedule(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        JSONObject cfg = config(ctx);
        long now = System.currentTimeMillis();

        PendingIntent daily = broadcast(ctx, A_DAILY, null, DAILY_ID);
        JSONObject dl = cfg.optJSONObject("daily");
        if (dl != null && dl.optBoolean("on", true)) {
            Calendar c = Calendar.getInstance();
            c.set(Calendar.HOUR_OF_DAY, dl.optInt("h", 21));
            c.set(Calendar.MINUTE, dl.optInt("m", 0));
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            if (c.getTimeInMillis() <= now + 1000) c.add(Calendar.DAY_OF_MONTH, 1);
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(), daily);
        } else {
            am.cancel(daily);
        }

        SharedPreferences p = prefs(ctx);
        try {
            JSONArray armed = new JSONArray(p.getString("armed", "[]"));
            for (int i = 0; i < armed.length(); i++) am.cancel(broadcast(ctx, A_DUE, armed.getString(i), code(armed.getString(i))));
        } catch (JSONException ignored) { }
        JSONArray nowArmed = new JSONArray();
        JSONArray dues = cfg.optJSONArray("dues");
        String t = today();
        for (int i = 0; dues != null && i < dues.length(); i++) {
            JSONObject d = dues.optJSONObject(i);
            if (d == null) continue;
            String id = d.optString("id"), date = d.optString("date");
            Calendar c = parse(date);
            if (id.isEmpty() || c == null) continue;
            long when;
            if (date.compareTo(t) > 0) {
                c.set(Calendar.HOUR_OF_DAY, DUE_HOUR);
                when = c.getTimeInMillis();
            } else if (!t.equals(p.getString("shown:" + id, ""))) {
                // due today or overdue and not shown yet today: at 09:00, or in a minute if that has passed
                Calendar nine = Calendar.getInstance();
                nine.set(Calendar.HOUR_OF_DAY, DUE_HOUR);
                nine.set(Calendar.MINUTE, 0);
                nine.set(Calendar.SECOND, 0);
                when = Math.max(nine.getTimeInMillis(), now + 60_000);
            } else {
                // already reminded today: again tomorrow morning while it stays open
                Calendar nine = Calendar.getInstance();
                nine.add(Calendar.DAY_OF_MONTH, 1);
                nine.set(Calendar.HOUR_OF_DAY, DUE_HOUR);
                nine.set(Calendar.MINUTE, 0);
                nine.set(Calendar.SECOND, 0);
                when = nine.getTimeInMillis();
            }
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, broadcast(ctx, A_DUE, id, code(id)));
            nowArmed.put(id);
        }
        p.edit().putString("armed", nowArmed.toString()).apply();
    }

    // ---------- notifications ----------

    private static void showDue(Context ctx, JSONObject d) {
        String id = d.optString("id"), date = d.optString("date"), who = d.optString("who"), amount = d.optString("amount");
        boolean lend = "lend".equals(d.optString("kind"));
        boolean dueToday = date.equals(today());
        String title = lend ? who + " owes you " + amount : "You owe " + who + " " + amount;
        String text = lend
                ? (dueToday ? "Payback day is today" : "Payback was due " + pretty(date))
                : (dueToday ? "Due today" : "Was due " + pretty(date));
        int base = code(id);
        Notification.Action[] actions = {
                action(ctx, "Record payment", openApp(ctx, "loan:" + id + ":pay", base + 1)),
                action(ctx, "+1 day", extendIntent(ctx, id, 1, base + 2)),
                action(ctx, "+1 week", extendIntent(ctx, id, 7, base + 3)),
        };
        show(ctx, base, title, text, openApp(ctx, "loan:" + id, base), actions);
        prefs(ctx).edit().putString("shown:" + id, today()).apply();
    }

    private static void show(Context ctx, int nid, String title, String text, PendingIntent tap, Notification.Action[] actions) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_DEFAULT));
            b = new Notification.Builder(ctx, CHANNEL);
        } else {
            b = new Notification.Builder(ctx);
        }
        b.setSmallIcon(R.drawable.ic_launcher).setContentTitle(title).setContentText(text)
                .setAutoCancel(true).setContentIntent(tap);
        if (actions != null) for (Notification.Action a : actions) b.addAction(a);
        try { nm.notify(nid, b.build()); } catch (SecurityException ignored) { } // notifications not allowed
    }

    private static Notification.Action action(Context ctx, String label, PendingIntent pi) {
        return new Notification.Action.Builder(Icon.createWithResource(ctx, R.drawable.ic_launcher), label, pi).build();
    }

    /** Synchronized with {@link #takeActions}: both rewrite the queued "actions" list. */
    private static synchronized void extend(Context ctx, String id, int days) {
        if (id == null) return;
        SharedPreferences p = prefs(ctx);
        JSONObject cfg = config(ctx);
        JSONArray dues = cfg.optJSONArray("dues");
        try {
            for (int i = 0; dues != null && i < dues.length(); i++) {
                JSONObject d = dues.getJSONObject(i);
                if (!id.equals(d.optString("id"))) continue;
                String due = d.optString("date"), t = today();
                Calendar c = parse(due.compareTo(t) > 0 ? due : t); // same rule as the page: from the later of due and today
                if (c == null) break;
                c.add(Calendar.DAY_OF_MONTH, days);
                d.put("date", fmt().format(c.getTime()));
            }
            JSONArray q = new JSONArray(p.getString("actions", "[]"));
            q.put(new JSONObject().put("type", "extend").put("id", id).put("days", days));
            p.edit().putString("config", cfg.toString()).putString("actions", q.toString()).remove("shown:" + id).apply();
        } catch (JSONException ignored) { }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(code(id));
    }

    // ---------- helpers ----------

    private static PendingIntent openApp(Context ctx, String open, int req) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (open != null) i.putExtra("open", open);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent extendIntent(Context ctx, String id, int days, int req) {
        Intent i = new Intent(ctx, ReminderReceiver.class).setAction(A_EXTEND).putExtra("id", id).putExtra("days", days);
        return PendingIntent.getBroadcast(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent broadcast(Context ctx, String action, String id, int req) {
        Intent i = new Intent(ctx, ReminderReceiver.class).setAction(action);
        if (id != null) i.putExtra("id", id);
        return PendingIntent.getBroadcast(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static JSONObject findDue(Context ctx, String id) {
        JSONArray dues = config(ctx).optJSONArray("dues");
        for (int i = 0; id != null && dues != null && i < dues.length(); i++) {
            JSONObject d = dues.optJSONObject(i);
            if (d != null && id.equals(d.optString("id"))) return d;
        }
        return null;
    }

    /** Four request codes per loan: notification/tap, Record payment, +1 day, +1 week. */
    private static int code(String id) { return 1000 + (id.hashCode() & 0xffff) * 4; }

    private static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static JSONObject config(Context ctx) {
        try { return new JSONObject(prefs(ctx).getString("config", "{}")); }
        catch (JSONException e) { return new JSONObject(); }
    }

    private static SimpleDateFormat fmt() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US); }

    private static String today() { return fmt().format(new Date()); }

    private static Calendar parse(String s) {
        try {
            Calendar c = Calendar.getInstance();
            c.setTime(fmt().parse(s));
            return c;
        } catch (ParseException | NullPointerException e) {
            return null;
        }
    }

    private static String pretty(String s) {
        Calendar c = parse(s);
        return c == null ? s : new SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(c.getTime());
    }
}
