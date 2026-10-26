package app.tally.expenses;

import android.app.LocaleManager;
import android.content.Context;
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
 * <li>{@link #fmt}: how numbers, dates and times are written: the app's own language if one is set, else the phone's
 * first language, with its regional preferences. Never Locale.getDefault(): Android moves that to the language it
 * picked for the app's words, so a phone in Dutch, with English second, would start writing numbers the English way.</li>
 * </ul>
 */
final class Lang {
    private Lang() { }

    static String ui(Context ctx) {
        return ctx.getString(R.string.lang);
    }

    static Locale fmt(Context ctx) {
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                LocaleManager lm = ctx.getSystemService(LocaleManager.class);
                LocaleList app = lm == null ? null : lm.getApplicationLocales();
                if (app != null && !app.isEmpty()) return app.get(0);
            } catch (RuntimeException ignored) { }
        }
        LocaleList phone = Resources.getSystem().getConfiguration().getLocales();
        return phone.isEmpty() ? Locale.getDefault() : phone.get(0);
    }
}
