package app.tally.expenses;

import android.app.LocaleManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Resources;
import android.os.Build;
import android.os.LocaleList;

import java.util.Locale;

/**
 * Tally's two locales, read the same way by the page (Bridge.getLocale) and by notifications:
 * <ul>
 * <li>{@link #ui}: the language of Tally's words. It is whichever translation Android picked for the app from the
 * phone's languages (or the app's own language, Android 13+), named by the {@code lang} string each values folder
 * carries (values/lang.xml, values-es/lang.xml, …).</li>
 * <li>{@link #fmt}: how numbers, dates and times are written: the phone's first language with its regional
 * preferences, or the app's own language (Android 13+) with the phone's region. Never Locale.getDefault(): Android moves that to the language it
 * picked for the app's words, so a phone in Dutch, with English second, would start writing numbers the English way.</li>
 * </ul>
 */
final class Lang {
    private Lang() { }

    static String ui(Context ctx) {
        return ctx.getString(R.string.lang);
    }

    static Locale fmt(Context ctx) {
        LocaleList phones = Resources.getSystem().getConfiguration().getLocales();
        Locale phone = phones.isEmpty() ? Locale.getDefault() : phones.get(0);
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                LocaleManager lm = ctx.getSystemService(LocaleManager.class);
                LocaleList app = lm == null ? null : lm.getApplicationLocales();
                // Tally's own language, written the phone's way: the phone's locale when it's the same language (a
                // Mexican phone set to Español keeps 1,234.50, regional preferences included), else that language
                // with the phone's region (a German phone set to English writes en-DE's 1.234,50)
                if (app != null && !app.isEmpty()) {
                    Locale a = app.get(0);
                    if (a.getLanguage().equals(phone.getLanguage())) return phone;
                    if (a.getCountry().isEmpty() && !phone.getCountry().isEmpty())
                        return new Locale.Builder().setLocale(a).setRegion(phone.getCountry()).build();
                    return a;
                }
            } catch (RuntimeException ignored) { } // IllformedLocaleException is one
        }
        return phone;
    }

    /**
     * After the phone's or the app's language changed (BootReceiver's LOCALE_CHANGED, which Android 13+ also sends to
     * the app for its own language; MainActivity.onCreate as a safety net): the notification channels get their new
     * names, the notices on screen and the widget are written again. Nothing happens while the language stays the same.
     */
    static void syncIfChanged(Context ctx) {
        String now = ui(ctx) + "|" + fmt(ctx).toLanguageTag();
        SharedPreferences p = ctx.getSharedPreferences("tally_lang", Context.MODE_PRIVATE);
        if (now.equals(p.getString("was", null))) return;
        p.edit().putString("was", now).apply();
        ReminderReceiver.channels(ctx);
        ReminderReceiver.refreshShown(ctx);
        BackupReceiver.refreshNotice(ctx);
        TallyWidget.refresh(ctx);
    }
}
