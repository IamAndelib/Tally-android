package app.tally.expenses;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarms don't survive a reboot or an app update: re-arm the saved reminders. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent in) {
        String a = in.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            ReminderReceiver.schedule(ctx);
        }
    }
}
