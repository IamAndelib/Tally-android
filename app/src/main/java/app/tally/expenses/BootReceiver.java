package app.tally.expenses;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Alarms don't survive a reboot, and are set in absolute time: re-arm the saved reminders and the daily backup after
 * one, after an app update (harmless, to be safe), after the clock or time zone changes (so 21:00 stays 21:00 local
 * time), and once exact alarms are allowed ("Alarms & reminders", Android 12+), so the next ones are on time. A
 * change of the phone's language renames the notification channels and rewrites what's on screen (Lang).
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent in) {
        String a = in.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                || Intent.ACTION_TIME_CHANGED.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a)
                || "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED".equals(a)
                // "fast boot" on some HTC, Xiaomi and older phones sends these instead of BOOT_COMPLETED
                || "android.intent.action.QUICKBOOT_POWERON".equals(a)
                || "com.htc.intent.action.QUICKBOOT_POWERON".equals(a)) {
            ReminderReceiver.schedule(ctx);
            BackupReceiver.schedule(ctx);
        } else if (Intent.ACTION_LOCALE_CHANGED.equals(a)) {
            Lang.syncIfChanged(ctx); // the phone's language: notification channels, notices and widget follow
        }
    }
}
