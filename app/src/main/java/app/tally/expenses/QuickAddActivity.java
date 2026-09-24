package app.tally.expenses;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** The widget's +: a small dialog over the home screen with Spent / Received / Transfer. Picking one opens Tally on that form. */
public class QuickAddActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.quick_add);
        findViewById(R.id.qa_out).setOnClickListener(v -> go("add:out"));
        findViewById(R.id.qa_in).setOnClickListener(v -> go("add:in"));
        findViewById(R.id.qa_tr).setOnClickListener(v -> go("add:tr"));
    }

    private void go(String what) {
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("open", what);
        startActivity(i);
        finish();
    }
}
