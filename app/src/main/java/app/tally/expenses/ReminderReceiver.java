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
import java.util.Arrays;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Shows Tally's reminders. The page sends its reminder settings with Android.setReminders(json):
 *   {daily:{on,h,m}, lastEntry:"yyyy-MM-dd", check:{on,h,m,text,checked}, duesAt:{h,m},
 *    dues:[{id,date,kind:"borrow"|"lend",who,amount,total?}]}
 * - daily: at h:m, "Nothing written today" if lastEntry is not today; re-armed for the next day.
 * - check: at h:m, "Do your balances still match?" with the balances in text, unless checked (the day the balances
 *   were last confirmed) is today. Tapping it opens the morning check on Home.
 * - dues: on the due date at duesAt (and each day while overdue), with "Record payment", "+1 day", "+1 week".
 *   amount is what is due by date; total (only when larger) is the whole tab, shown after the date.
 *   The +N buttons move the stored date and queue {type:"extend",id,days} for the page (Android.takeActions()).
 * Every alarm is exact when the phone allows it (see {@link #arm}); each daily notice shows at most once a day.
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String A_DAILY = "app.tally.expenses.DAILY";
    static final String A_CHECK = "app.tally.expenses.CHECK";
    static final String A_DUE = "app.tally.expenses.DUE";
    static final String A_EXTEND = "app.tally.expenses.EXTEND";
    private static final String PREFS = "tally_reminders";
    /** Channels: loan due days keep the original id (and whatever the user set for it). */
    static final String CH_DUES = "reminders", CH_NUDGE = "nudge", CH_CHECK = "check", CH_BACKUP = "backup";
    private static final int DAILY_ID = 1, CHECK_ID = 2;
    /** The config (plus exact-alarm ability) this process last armed: an unchanged sync re-arms nothing. In memory
     *  only, so the first sync after a force-stop or reboot (when Android has dropped the alarms) always re-arms. */
    private static String armedFor;

    @Override
    public void onReceive(Context ctx, Intent in) {
        String a = in.getAction();
        SharedPreferences p = prefs(ctx);
        String t = today();
        if (A_DAILY.equals(a)) {
            if (reached(config(ctx).optJSONObject("daily"), 21) && !t.equals(p.getString("lastEntry", ""))
                    && !t.equals(p.getString("shown:nudge", ""))) {
                show(ctx, CH_NUDGE, DAILY_ID, "Nothing written in Tally today",
                        "Take a minute to note what you spent.", openApp(ctx, null, DAILY_ID), null);
                p.edit().putString("shown:nudge", t).apply();
            }
        } else if (A_CHECK.equals(a)) {
            JSONObject ck = config(ctx).optJSONObject("check");
            if (ck != null && ck.optBoolean("on") && reached(ck, 8) && !t.equals(ck.optString("checked"))
                    && !t.equals(p.getString("shown:check", ""))) {
                show(ctx, CH_CHECK, CHECK_ID, "Do your balances still match?", ck.optString("text"),
                        openApp(ctx, "check", CHECK_ID), null);
                p.edit().putString("shown:check", t).apply();
            }
        } else if (A_DUE.equals(a)) {
            JSONObject d = findDue(ctx, in.getStringExtra("id"));
            if (d != null) showDue(ctx, d);
        } else if (A_EXTEND.equals(a)) {
            extend(ctx, in.getStringExtra("id"), in.getIntExtra("days", 1));
        }
        schedule(ctx);
    }

    /**
     * Whether today's h:m has come. An alarm delivered late (inexact, or the clock changed) after midnight must not
     * say "Nothing written today" about a day that has just begun; it only re-arms.
     */
    private static boolean reached(JSONObject o, int defH) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, Math.max(0, Math.min(23, o == null ? defH : o.optInt("h", defH))));
        c.set(Calendar.MINUTE, Math.max(0, Math.min(59, o == null ? 0 : o.optInt("m", 0))));
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return System.currentTimeMillis() >= c.getTimeInMillis() - 60_000; // a minute's slack for clock drift
    }

    // ---------- called from the page (MainActivity bridge) ----------

    /** The page's reminder settings (after every save and on resume): stored and armed, unless nothing changed. */
    static synchronized void save(Context ctx, String json) {
        String cfg;
        try {
            cfg = new JSONObject(json).toString();
        } catch (JSONException e) {
            return;
        }
        SharedPreferences p = prefs(ctx);
        String key = cfg + canExact(ctx);
        if (key.equals(armedFor) && cfg.equals(p.getString("config", null))) return;
        p.edit().putString("config", cfg).putString("lastEntry", config(cfg).optString("lastEntry", "")).apply();
        schedule(ctx);
        armedFor = key;
    }

    static synchronized String takeActions(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String q = p.getString("actions", "[]");
        p.edit().putString("actions", "[]").apply();
        return q;
    }

    // ---------- alarms ----------

    /**
     * Arms one alarm: exact when allowed (always before Android 12; on 12+ once "Alarms & reminders" is allowed),
     * otherwise inexact, which Android may deliver minutes (or, for a rarely used app, hours) late.
     */
    static void arm(AlarmManager am, long when, PendingIntent pi) {
        if (canExact(am)) {
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
                return;
            } catch (SecurityException ignored) { } // permission withdrawn in between: fall back
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
    }

    private static boolean canExact(AlarmManager am) {
        return Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
    }

    private static boolean canExact(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        return am != null && canExact(am);
    }

    /** The next h:m from now (today if still ahead, else tomorrow); out-of-range values are clamped, never rolled over. */
    static long nextAt(int h, int m) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, Math.max(0, Math.min(23, h)));
        c.set(Calendar.MINUTE, Math.max(0, Math.min(59, m)));
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() <= System.currentTimeMillis() + 1000) c.add(Calendar.DAY_OF_MONTH, 1);
        return c.getTimeInMillis();
    }

    static void schedule(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        JSONObject cfg = config(ctx);
        long now = System.currentTimeMillis();

        armDaily(ctx, am, cfg.optJSONObject("daily"), A_DAILY, DAILY_ID, 21, true);
        armDaily(ctx, am, cfg.optJSONObject("check"), A_CHECK, CHECK_ID, 8, false);

        JSONObject at = cfg.optJSONObject("duesAt");
        int dh = Math.max(0, Math.min(23, at == null ? 9 : at.optInt("h", 9)));
        int dm = Math.max(0, Math.min(59, at == null ? 0 : at.optInt("m", 0)));
        SharedPreferences p = prefs(ctx);
        try {
            JSONArray armed = new JSONArray(p.getString("armed", "[]"));
            for (int i = 0; i < armed.length(); i++) am.cancel(broadcast(ctx, A_DUE, armed.getString(i), code(armed.getString(i))));
        } catch (JSONException ignored) { }
        JSONArray nowArmed = new JSONArray();
        Set<String> keep = new HashSet<>(Arrays.asList("shown:nudge", "shown:check"));
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
                c.set(Calendar.HOUR_OF_DAY, dh);
                c.set(Calendar.MINUTE, dm);
                when = c.getTimeInMillis();
            } else if (!t.equals(p.getString("shown:" + id, ""))) {
                // due today or overdue and not shown yet today: at the set time, or in a minute if that has passed
                Calendar c2 = Calendar.getInstance();
                c2.set(Calendar.HOUR_OF_DAY, dh);
                c2.set(Calendar.MINUTE, dm);
                c2.set(Calendar.SECOND, 0);
                when = Math.max(c2.getTimeInMillis(), now + 60_000);
            } else {
                // already reminded today: again tomorrow at the set time while it stays open
                Calendar c2 = Calendar.getInstance();
                c2.add(Calendar.DAY_OF_MONTH, 1);
                c2.set(Calendar.HOUR_OF_DAY, dh);
                c2.set(Calendar.MINUTE, dm);
                c2.set(Calendar.SECOND, 0);
                when = c2.getTimeInMillis();
            }
            arm(am, when, broadcast(ctx, A_DUE, id, code(id)));
            nowArmed.put(id);
            keep.add("shown:" + id);
        }
        SharedPreferences.Editor e = p.edit().putString("armed", nowArmed.toString());
        // "shown today" marks of loans no longer reminded about (cleared, deleted, due date removed) are dropped
        for (String k : p.getAll().keySet()) {
            if (k.startsWith("shown:") && !keep.contains(k)) e.remove(k);
        }
        e.apply();
    }

    /** A once-a-day notice (the nudge, the balance check): armed at its h:m while on, cancelled when off. */
    private static void armDaily(Context ctx, AlarmManager am, JSONObject o, String action, int req, int defH, boolean defOn) {
        PendingIntent pi = broadcast(ctx, action, null, req);
        if (o == null) o = new JSONObject();
        if (o.optBoolean("on", defOn)) arm(am, nextAt(o.optInt("h", defH), o.optInt("m", 0)), pi);
        else am.cancel(pi);
    }

    // ---------- notifications ----------

    private static void showDue(Context ctx, JSONObject d) {
        String id = d.optString("id"), date = d.optString("date"), who = d.optString("who"), amount = d.optString("amount");
        String total = d.optString("total");
        boolean lend = "lend".equals(d.optString("kind"));
        boolean dueToday = date.equals(today());
        String title = lend ? who + " owes you " + amount : "You owe " + who + " " + amount;
        String text = (lend
                ? (dueToday ? "Payback day is today" : "Payback was due " + pretty(date))
                : (dueToday ? "Due today" : "Was due " + pretty(date)))
                + (total.isEmpty() ? "" : " · " + total + " in all");
        int base = code(id);
        Notification.Action[] actions = {
                action(ctx, "Record payment", openApp(ctx, "loan:" + id + ":pay", base + 1)),
                action(ctx, "+1 day", extendIntent(ctx, id, 1, base + 2)),
                action(ctx, "+1 week", extendIntent(ctx, id, 7, base + 3)),
        };
        show(ctx, CH_DUES, base, title, text, openApp(ctx, "loan:" + id, base), actions);
        prefs(ctx).edit().putString("shown:" + id, today()).apply();
    }

    /** Creates (or renames) Tally's channels, so each kind can be silenced on its own in Android's settings. */
    static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.createNotificationChannels(Arrays.asList(
                new NotificationChannel(CH_NUDGE, "Evening nudge", NotificationManager.IMPORTANCE_DEFAULT),
                new NotificationChannel(CH_CHECK, "Balance check", NotificationManager.IMPORTANCE_DEFAULT),
                new NotificationChannel(CH_DUES, "Loan & lending due days", NotificationManager.IMPORTANCE_DEFAULT),
                new NotificationChannel(CH_BACKUP, "Backup problems", NotificationManager.IMPORTANCE_DEFAULT)));
    }

    static void show(Context ctx, String channel, int nid, String title, String text, PendingIntent tap, Notification.Action[] actions) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) channels(ctx);
        Notification.Builder b = builder(ctx, channel);
        b.setSmallIcon(R.drawable.ic_notif).setContentTitle(title).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true).setContentIntent(tap)
                // on a lock screen that hides sensitive content: which kind of reminder, never names or amounts
                .setPublicVersion(builder(ctx, channel).setSmallIcon(R.drawable.ic_notif).setContentTitle("Tally")
                        .setContentText(publicText(channel)).build());
        if (actions != null) for (Notification.Action a : actions) b.addAction(a);
        try { nm.notify(nid, b.build()); } catch (SecurityException ignored) { } // notifications not allowed
    }

    @SuppressWarnings("deprecation")
    private static Notification.Builder builder(Context ctx, String channel) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, channel) : new Notification.Builder(ctx);
    }

    private static String publicText(String channel) {
        switch (channel) {
            case CH_CHECK: return "Balance check";
            case CH_DUES: return "A loan or lending is due";
            case CH_BACKUP: return "Backup problem";
            default: return "Nothing written today";
        }
    }

    private static Notification.Action action(Context ctx, String label, PendingIntent pi) {
        return new Notification.Action.Builder(Icon.createWithResource(ctx, R.drawable.ic_notif), label, pi).build();
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

    static PendingIntent openApp(Context ctx, String open, int req) {
        return PendingIntent.getActivity(ctx, req, MainActivity.openIntent(ctx, open),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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
        return config(prefs(ctx).getString("config", "{}"));
    }

    private static JSONObject config(String json) {
        try { return new JSONObject(json); }
        catch (JSONException e) { return new JSONObject(); }
    }

    private static SimpleDateFormat fmt() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US); }

    static String today() { return fmt().format(new Date()); }

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
