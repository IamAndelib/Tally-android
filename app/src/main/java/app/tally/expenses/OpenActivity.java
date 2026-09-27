package app.tally.expenses;

import android.app.Activity;
import android.os.Bundle;

/**
 * The widget body's tap. Invisible and gone at once: it only opens {@link MainActivity}. The home screen starts
 * widget taps with a plain-colour splash (no logo); started from here instead, like the widget's + via
 * {@link QuickAddActivity}, the app gets its logo splash, or resumes where it was if it is already running.
 */
public class OpenActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        startActivity(MainActivity.openIntent(this, null));
        finish();
        overridePendingTransition(0, 0);
    }
}
