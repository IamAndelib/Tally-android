package app.tally.expenses;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * The daily automatic backup: one file, "Tally backup.json", in a folder the user picked once (kept after Tally is
 * uninstalled), rewritten at the chosen time whenever the data changed since. The page mirrors its data to
 * files/snapshot.json (Android.setBackupData) after every save while auto backup is on, so the alarm needs no WebView.
 * The file is exactly the manual backup, so Settings → Restore reads it. An empty state (after "Delete all data", or a
 * start that couldn't read the saved data) never overwrites it.
 */
public class BackupReceiver extends BroadcastReceiver {
    static final String A_BACKUP = "app.tally.expenses.BACKUP";
    static final String NAME = "Tally backup.json", TEMP = "Tally backup (new).json";
    private static final String PREFS = "tally_backup";
    private static final int REQ = 3, NOTE_ID = 3;

    @Override
    public void onReceive(Context ctx, Intent in) {
        if (!A_BACKUP.equals(in.getAction())) return;
        final PendingResult pr = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                String err = run(app, false);
                if (err != null) {
                    ReminderReceiver.show(app, ReminderReceiver.CH_BACKUP, NOTE_ID, "Tally couldn't back up",
                            err + " Tap to choose the folder again.", ReminderReceiver.openApp(app, "backup", NOTE_ID), null);
                }
                schedule(app);
            } finally {
                pr.finish();
            }
        }).start();
    }

    // ---------- called from the page (MainActivity bridge) ----------

    /** {on, h, m}: arms (or cancels) the daily alarm; turning it off also drops the mirrored data. */
    static void setConfig(Context ctx, String json) {
        try {
            JSONObject o = new JSONObject(json);
            prefs(ctx).edit().putBoolean("on", o.optBoolean("on")).putInt("h", o.optInt("h", 23)).putInt("m", o.optInt("m", 0)).apply();
            if (!o.optBoolean("on")) snapshot(ctx).delete();
        } catch (JSONException ignored) { }
        schedule(ctx);
    }

    /** The page's latest data (JSON.stringify(S)): written atomically, and marked as not backed up yet. */
    static synchronized void setData(Context ctx, String json) {
        File f = snapshot(ctx), tmp = new File(f.getPath() + ".tmp");
        try (OutputStream os = new FileOutputStream(tmp)) {
            os.write(json.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            return;
        }
        if (tmp.renameTo(f)) prefs(ctx).edit().putBoolean("dirty", true).apply();
    }

    /** A folder picked with ACTION_OPEN_DOCUMENT_TREE (its permission already taken): remembered, and the old one released. */
    static void setFolder(Context ctx, Uri tree) {
        SharedPreferences p = prefs(ctx);
        String old = p.getString("tree", null);
        if (old != null && !old.equals(tree.toString())) {
            try {
                ctx.getContentResolver().releasePersistableUriPermission(Uri.parse(old),
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (SecurityException ignored) { }
        }
        p.edit().putString("tree", tree.toString()).putString("label", label(ctx, tree)).putBoolean("dirty", true)
                .remove("error").apply();
        schedule(ctx);
    }

    /** {folder, last (ms, 0 = never), error} for Settings. */
    static String status(Context ctx) {
        SharedPreferences p = prefs(ctx);
        try {
            return new JSONObject().put("folder", p.getString("label", "")).put("last", p.getLong("last", 0))
                    .put("error", p.getString("error", "")).toString();
        } catch (JSONException e) {
            return "{}";
        }
    }

    // ---------- the backup ----------

    static void schedule(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        SharedPreferences p = prefs(ctx);
        Intent i = new Intent(ctx, BackupReceiver.class).setAction(A_BACKUP);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (p.getBoolean("on", false) && p.getString("tree", null) != null) {
            ReminderReceiver.arm(am, ReminderReceiver.nextAt(p.getInt("h", 23), p.getInt("m", 0)), pi);
        } else {
            am.cancel(pi);
        }
    }

    /**
     * Writes the backup file when the data changed since the last one (or always, with {@code force}: "Back up now",
     * a newly picked folder). Returns null when done or when there was nothing to do, else a short reason.
     */
    static synchronized String run(Context ctx, boolean force) {
        SharedPreferences p = prefs(ctx);
        String tree = p.getString("tree", null);
        if (tree == null) return "No folder is chosen.";
        String data = read(snapshot(ctx));
        if (data == null || (!force && !p.getBoolean("dirty", false))) return null;
        if (empty(data)) return force ? "There's nothing to back up yet." : null;
        String err = write(ctx, Uri.parse(tree), data.getBytes(StandardCharsets.UTF_8));
        SharedPreferences.Editor e = p.edit();
        if (err == null) e.putBoolean("dirty", false).putLong("last", System.currentTimeMillis()).remove("error");
        else e.putString("error", err);
        e.apply();
        return err;
    }

    /**
     * Writes {@code bytes} as NAME in the folder: into a new TEMP file first, then swapped in by rename, so a failure
     * part-way never leaves a half-written backup. Where the folder's provider can't rename, NAME is rewritten in place.
     */
    private static String write(Context ctx, Uri tree, byte[] bytes) {
        ContentResolver cr = ctx.getContentResolver();
        try {
            Uri dir = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            Uri old = find(cr, tree, NAME), stale = find(cr, tree, TEMP);
            if (stale != null) DocumentsContract.deleteDocument(cr, stale);
            Uri tmp = DocumentsContract.createDocument(cr, dir, "application/json", TEMP);
            if (tmp == null) return "The folder can't be written to.";
            if (!put(cr, tmp, bytes, "w")) {
                DocumentsContract.deleteDocument(cr, tmp);
                return "The backup couldn't be written.";
            }
            if (canRename(cr, tmp)) {
                if (old != null) DocumentsContract.deleteDocument(cr, old);
                try {
                    DocumentsContract.renameDocument(cr, tmp, NAME);
                } catch (Exception e) { // the data is safe in TEMP; the next run tries again
                    return "The backup was saved as \"" + TEMP + "\".";
                }
                return null;
            }
            DocumentsContract.deleteDocument(cr, tmp);
            if (old == null) old = DocumentsContract.createDocument(cr, dir, "application/json", NAME);
            return old != null && put(cr, old, bytes, "wt") ? null : "The backup couldn't be written.";
        } catch (SecurityException e) {
            return "Tally can't open the backup folder any more.";
        } catch (Exception e) { // FileNotFoundException, IllegalArgumentException: the folder or card is gone
            return "The backup folder can't be found.";
        }
    }

    private static boolean put(ContentResolver cr, Uri doc, byte[] bytes, String mode) {
        try (OutputStream os = cr.openOutputStream(doc, mode)) {
            if (os == null) return false;
            os.write(bytes);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /** A file directly in the picked folder, by its exact name. */
    private static Uri find(ContentResolver cr, Uri tree, String name) {
        Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        String[] cols = {DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME};
        try (Cursor c = cr.query(kids, cols, null, null, null)) {
            while (c != null && c.moveToNext()) {
                if (name.equals(c.getString(1))) return DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0));
            }
        }
        return null;
    }

    private static boolean canRename(ContentResolver cr, Uri doc) {
        try (Cursor c = cr.query(doc, new String[]{DocumentsContract.Document.COLUMN_FLAGS}, null, null, null)) {
            return c != null && c.moveToFirst() && (c.getInt(0) & DocumentsContract.Document.FLAG_SUPPORTS_RENAME) != 0;
        }
    }

    /** "Documents/Tally" for phone storage, "SD card/Backups" for a card, else the folder's own name. */
    private static String label(Context ctx, Uri tree) {
        try {
            String id = DocumentsContract.getTreeDocumentId(tree);
            int colon = id.indexOf(':');
            if ("com.android.externalstorage.documents".equals(tree.getAuthority()) && colon >= 0) {
                String path = id.substring(colon + 1);
                if (id.startsWith("primary:")) return path.isEmpty() ? "Phone storage" : path;
                return path.isEmpty() ? "SD card" : "SD card/" + path;
            }
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, id);
            String[] cols = {DocumentsContract.Document.COLUMN_DISPLAY_NAME};
            try (Cursor c = ctx.getContentResolver().query(doc, cols, null, null, null)) {
                if (c != null && c.moveToFirst() && c.getString(0) != null) return c.getString(0);
            }
        } catch (Exception ignored) { }
        return "Chosen folder";
    }

    /** No accounts, entries, loans or other assets: nothing worth keeping. */
    private static boolean empty(String data) {
        try {
            JSONObject o = new JSONObject(data);
            for (String k : new String[]{"accounts", "txns", "loans", "assets"}) {
                JSONArray a = o.optJSONArray(k);
                if (a != null && a.length() > 0) return false;
            }
            return true;
        } catch (JSONException e) {
            return true; // unreadable: never let it replace a good backup
        }
    }

    private static String read(File f) {
        if (!f.exists()) return null;
        try (InputStream in = new FileInputStream(f)) {
            byte[] b = new byte[(int) f.length()];
            int n = 0, r;
            while (n < b.length && (r = in.read(b, n, b.length - n)) > 0) n += r;
            return new String(b, 0, n, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    private static File snapshot(Context ctx) { return new File(ctx.getFilesDir(), "snapshot.json"); }

    private static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
