package app.tally.expenses;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * When a loan with no payback day is next reminded (ReminderReceiver): once a month, on the day of the month it was
 * lent, from a month after. Plain Java (dates as "yyyy-MM-dd"), so app/src/test checks it without a phone.
 * A day it was armed for that passed without showing (the phone off, a battery saver holding the alarm) comes as soon
 * as Tally re-arms (a reboot, the next alarm, the next sync): once, however many months were missed. A day it was never
 * armed for doesn't count: a loan written down after today's reminder time waits for its next day.
 */
final class MonthlyDue {
    private MonthlyDue() { }

    /**
     * The day to arm. {@code shown}: the day it last showed ("" never); {@code armed}: the day it was last armed for
     * ("" never); {@code past}: whether today's reminder time has gone by.
     */
    static String date(int day, String since, String t, String shown, String armed, boolean past) {
        if (missed(t, shown, armed)) return t;
        if (armed.equals(t) && !shown.equals(t)) return t; // armed for today: still today, also when held back
        return next(day, since, t, shown.equals(t) || past);
    }

    /**
     * The day to remember as armed for, after arming {@code date}: a missed day stays until the reminder has shown, so
     * Tally re-arming again meanwhile (a sync, another alarm) still sends it at once rather than at the set time.
     */
    static String mark(String t, String shown, String armed, String date) {
        return missed(t, shown, armed) ? armed : date;
    }

    /** Armed for a day before today that passed without showing. */
    static boolean missed(String t, String shown, String armed) {
        return !armed.isEmpty() && armed.compareTo(t) < 0 && shown.compareTo(armed) < 0;
    }

    /**
     * The next monthly day from today ({@code t}, unless {@code skipToday}): {@code day} of the month (a month without
     * it, such as the 31st in April, uses its last day), after {@code since}. "" when there is none.
     */
    static String next(int day, String since, String t, boolean skipToday) {
        Calendar now = parse(t);
        if (day < 1 || day > 31 || now == null) return "";
        for (int k = 0; k < 24; k++) {
            Calendar o = (Calendar) now.clone();
            o.set(Calendar.DAY_OF_MONTH, 1);
            o.add(Calendar.MONTH, k);
            o.set(Calendar.DAY_OF_MONTH, Math.min(day, o.getActualMaximum(Calendar.DAY_OF_MONTH)));
            String s = fmt().format(o.getTime());
            if (s.compareTo(t) < 0 || (s.equals(t) && skipToday) || s.compareTo(since) <= 0) continue;
            return s;
        }
        return "";
    }

    private static SimpleDateFormat fmt() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setLenient(false);
        return f;
    }

    private static Calendar parse(String s) {
        try {
            Calendar c = Calendar.getInstance();
            c.setTime(fmt().parse(s));
            return c;
        } catch (ParseException | NullPointerException e) {
            return null;
        }
    }
}
