package app.tally.expenses;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * The daily automatic backup: one file, "Tally backup.json", in a folder the user picked once (kept after Tally is
 * uninstalled), rewritten at the chosen time whenever the data changed since. The page mirrors its data to
 * files/snapshot.json (Android.setBackupData) after every save while auto backup is on, so the alarm needs no WebView.
 * The file is exactly the manual backup, so Settings → Restore reads it (natively: readAuto, MainActivity's picker).
 * An empty state (after "Delete all data", or a start that couldn't read the saved data) never overwrites it.
 */
public class BackupReceiver extends BroadcastReceiver {
    static final String A_BACKUP = "app.tally.expenses.BACKUP";
    static final String NAME = "Tally backup.json", TEMP = "Tally backup (new).json";
    private static final String PREFS = "tally_backup";
    private static final int REQ = 3, NOTE_ID = 3;
    /** The largest backup read back (Restore, checks): far above any real one (a few hundred KB after years). */
    static final int MAX = 10 * 1024 * 1024; // a Tally backup is well under 1 MB; more is not one

    @Override
    public void onReceive(Context ctx, Intent in) {
        if (!A_BACKUP.equals(in.getAction())) return;
        final PendingResult pr = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                // the next one first: if Android ends this process mid-write, tomorrow's backup is still armed
                schedule(app);
                String err = run(app, false);
                if (err != null) {
                    // a lost folder needs a new pick; otherwise (e.g. kept in the temp file) Settings says what happened
                    boolean folder = err.contains("folder");
                    ReminderReceiver.show(app, ReminderReceiver.CH_BACKUP, NOTE_ID, "Tally couldn't back up",
                            err + (folder ? " Tap to choose the folder again." : " Tap to open Settings."),
                            ReminderReceiver.openApp(app, "backup", NOTE_ID), null);
                }
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
        if (json == null || json.length() > MAX) return; // never a real notebook: a backup couldn't be read back anyway
        File f = snapshot(ctx), tmp = new File(f.getPath() + ".tmp");
        if (json.equals(read(f))) return; // unchanged (e.g. every app start): nothing new to back up, no write
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

    /**
     * {folder, usable, last (ms, 0 = never), error} for Settings. The folder is remembered while auto backup is off;
     * usable = Tally still holds its write permission, so switching auto backup back on needs no new pick.
     */
    static String status(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String tree = p.getString("tree", null);
        boolean usable = false;
        for (UriPermission u : ctx.getContentResolver().getPersistedUriPermissions()) {
            if (tree != null && u.isWritePermission() && tree.equals(u.getUri().toString())) usable = true;
        }
        try {
            return new JSONObject().put("folder", p.getString("label", "")).put("usable", usable)
                    .put("last", p.getLong("last", 0)).put("error", p.getString("error", "")).toString();
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
        if (!worthKeeping(data)) return force ? "There's nothing to back up yet." : null;
        String err = write(ctx, Uri.parse(tree), data.getBytes(StandardCharsets.UTF_8));
        SharedPreferences.Editor e = p.edit();
        if (err == null) e.putBoolean("dirty", false).putLong("last", System.currentTimeMillis()).remove("error");
        else e.putString("error", err);
        e.apply();
        return err;
    }

    /**
     * Writes {@code bytes} as NAME in the folder. NAME stays one and the same document, rewritten in place: replacing
     * it (delete + rename) left the picker's index with a stale size, and then WebView refused to read it for Restore.
     * The data goes to TEMP first and is read back; only then is NAME rewritten and read back, and TEMP deleted. If
     * NAME can't be written, TEMP stays as a full copy.
     */
    private static String write(Context ctx, Uri tree, byte[] bytes) {
        ContentResolver cr = ctx.getContentResolver();
        try {
            Uri dir = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            Uri tmp = find(cr, tree, TEMP);
            if (tmp == null) tmp = DocumentsContract.createDocument(cr, dir, "application/json", TEMP);
            if (tmp == null) return "The folder can't be written to.";
            if (!put(cr, tmp, bytes)) return "The backup couldn't be written.";
            Uri main = find(cr, tree, NAME);
            if (main == null) main = DocumentsContract.createDocument(cr, dir, "application/json", NAME);
            if (main == null || !put(cr, main, bytes)) return "The backup was saved as \"" + TEMP + "\".";
            // the backup is written and checked: a temp file the provider won't delete is no failure
            try { DocumentsContract.deleteDocument(cr, tmp); } catch (Exception ignored) { }
            return null;
        } catch (SecurityException e) {
            return "Tally can't open the backup folder any more.";
        } catch (Exception e) { // FileNotFoundException, IllegalArgumentException: the folder or card is gone
            return "The backup folder can't be found.";
        }
    }

    /**
     * Replaces a document's content with {@code bytes} and reads it back: true only if it now holds exactly those
     * bytes. "rw" + truncate first, since a bare "w" doesn't truncate on some Android versions (a shorter backup
     * would keep the old tail and stop being valid JSON); "wt" where "rw" isn't offered.
     */
    static boolean put(ContentResolver cr, Uri doc, byte[] bytes) {
        boolean wrote = false;
        try {
            ParcelFileDescriptor pfd = cr.openFileDescriptor(doc, "rw");
            if (pfd != null) {
                // the stream owns the descriptor and closes it once (a second close would trip Android's fd checks)
                try (FileOutputStream os = new ParcelFileDescriptor.AutoCloseOutputStream(pfd)) {
                    os.write(bytes);
                    os.getChannel().truncate(bytes.length);
                    os.getFD().sync();
                    wrote = true;
                }
            }
        } catch (Exception ignored) { } // not a seekable file (a cloud or pipe provider): try "wt"
        if (!wrote) {
            try (OutputStream os = cr.openOutputStream(doc, "wt")) {
                if (os == null) return false;
                os.write(bytes);
            } catch (Exception e) {
                return false;
            }
        }
        try {
            return Arrays.equals(readDoc(cr, doc, bytes.length + 1), bytes);
        } catch (IOException e) {
            return false;
        }
    }

    /** A document's bytes, reading at most {@code max} (a longer one throws). Used for Restore too. */
    static byte[] readDoc(ContentResolver cr, Uri doc, int max) throws IOException {
        try (InputStream in = cr.openInputStream(doc)) {
            if (in == null) throw new IOException("no stream");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int r;
            while ((r = in.read(buf)) > 0) {
                out.write(buf, 0, r);
                if (out.size() > max) throw new IOException("too big");
            }
            return out.toByteArray();
        }
    }

    /**
     * The auto backup file's text for Settings → Restore, read straight from the picked folder:
     * {text, when (ms, the last backup), folder} or {error}.
     */
    static String readAuto(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String tree = p.getString("tree", null);
        JSONObject o = new JSONObject();
        try {
            try {
                if (tree == null) return o.put("error", "No folder is chosen.").toString();
                Uri doc = find(ctx.getContentResolver(), Uri.parse(tree), NAME);
                if (doc == null) return o.put("error", "There's no \"" + NAME + "\" in the backup folder.").toString();
                byte[] b = readDoc(ctx.getContentResolver(), doc, MAX);
                return o.put("text", new String(b, StandardCharsets.UTF_8)).put("when", p.getLong("last", 0))
                        .put("folder", p.getString("label", "")).toString();
            } catch (SecurityException e) {
                return o.put("error", "Tally can't open the backup folder any more.").toString();
            } catch (Exception e) {
                return o.put("error", "The backup file can't be read.").toString();
            }
        } catch (JSONException e) {
            return "{}";
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

    /**
     * Whether the page's data is worth writing: a Tally backup (it parses, with accounts and entries lists) holding at
     * least one account, entry, loan or other asset. Anything else never replaces a good backup.
     */
    private static boolean worthKeeping(String data) {
        try {
            JSONObject o = new JSONObject(data);
            if (o.optJSONArray("accounts") == null || o.optJSONArray("txns") == null) return false;
            for (String k : new String[]{"accounts", "txns", "loans", "assets"}) {
                JSONArray a = o.optJSONArray(k);
                if (a != null && a.length() > 0) return true;
            }
            return false;
        } catch (JSONException e) {
            return false;
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
