package app.tally.expenses;

import android.app.AlarmManager;
import android.app.NotificationManager;
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
import java.util.List;

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
    /**
     * What went wrong, as a code: kept in prefs and handed to the page, which says it in its language (native.err.*);
     * the notification says it with R.string.bk_err_*. Never a sentence, so a language change finds no stale English.
     */
    static final String E_NO_FOLDER = "no_folder", E_NOT_READY = "not_ready", E_NOTHING = "nothing",
            E_UNWRITABLE = "unwritable", E_WRITE = "write_failed", E_TEMP = "saved_temp", E_NO_ACCESS = "no_access",
            E_GONE = "folder_gone", E_NO_FILE = "no_file", E_READ = "read_failed";
    /** the problems that need the folder picked again (the notification says so) */
    private static final List<String> FOLDER_ERRORS = Arrays.asList(E_NO_FOLDER, E_UNWRITABLE, E_NO_ACCESS, E_GONE);
    private static final String PREFS = "tally_backup";
    private static final int REQ = 3, NOTE_ID = 3;
    /** The largest backup read back (Restore, checks): far above any real one (a few hundred KB after years). */
    static final int MAX = 10 * 1024 * 1024; // a Tally backup is well under 1 MB; more is not one
    /** snapshot.json and its "dirty" mark: held only for quick file work, so a save never waits on a slow folder */
    private static final Object DATA = new Object();
    /** one write (and read-back) of the backup file, or read of it, at a time */
    private static final Object RUN = new Object();
    /** bumped by every setData that changed the snapshot: a save during a backup's write stays "not backed up" */
    private static int gen;

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
                    boolean folder = FOLDER_ERRORS.contains(err);
                    ReminderReceiver.show(app, ReminderReceiver.CH_BACKUP, NOTE_ID, app.getString(R.string.bk_failed),
                            errorText(app, err) + " " + app.getString(folder ? R.string.bk_tap_folder : R.string.bk_tap_settings),
                            ReminderReceiver.openApp(app, "backup", NOTE_ID), null);
                }
            } catch (Throwable ignored) { // out of memory on a small phone: never a crash; tomorrow's is armed
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
            if (!o.optBoolean("on")) {
                synchronized (DATA) {
                    snapshot(ctx).delete();
                }
            }
        } catch (JSONException ignored) { }
        schedule(ctx);
    }

    /** The page's latest data (JSON.stringify(S)): written atomically, and marked as not backed up yet. */
    static void setData(Context ctx, String json) {
        if (json == null || json.length() > MAX) return; // never a real notebook: a backup couldn't be read back anyway
        synchronized (DATA) {
            File f = snapshot(ctx), tmp = new File(f.getPath() + ".tmp");
            if (json.equals(read(f))) return; // unchanged (e.g. every app start): nothing new to back up, no write
            try (OutputStream os = new FileOutputStream(tmp)) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                return;
            }
            if (tmp.renameTo(f)) {
                gen++;
                prefs(ctx).edit().putBoolean("dirty", true).apply();
            }
        }
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
        SharedPreferences.Editor e = p.edit().putString("tree", tree.toString()).putString("label", providerName(ctx, tree))
                .putBoolean("dirty", true).remove("error");
        // another folder: nothing of this install's is in it yet (the page asks before writing over what is there)
        if (old == null || !old.equals(tree.toString())) e.remove("last");
        e.apply();
        clearNotice(ctx);
        schedule(ctx);
    }

    /** Takes away the "Tally couldn't back up" notification. */
    private static void clearNotice(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTE_ID);
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
            return new JSONObject().put("folder", folderLabel(ctx, p)).put("usable", usable)
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
     * Writes the backup file when the data changed since the last one (or always, with {@code force}: "Back up now").
     * Returns null when done or when there was nothing to do, else a short reason.
     */
    static String run(Context ctx, boolean force) {
        synchronized (RUN) {
            SharedPreferences p = prefs(ctx);
            String tree = p.getString("tree", null);
            if (tree == null) return E_NO_FOLDER;
            String data;
            int g;
            synchronized (DATA) {
                data = read(snapshot(ctx));
                g = gen;
            }
            if (data == null) return force ? E_NOT_READY : null;
            if (!force && !p.getBoolean("dirty", false)) return null;
            if (!worthKeeping(data)) return force ? E_NOTHING : null;
            String err = write(ctx, Uri.parse(tree), data.getBytes(StandardCharsets.UTF_8));
            synchronized (DATA) {
                SharedPreferences.Editor e = p.edit();
                if (err == null) {
                    e.putLong("last", System.currentTimeMillis()).remove("error");
                    if (gen == g) e.putBoolean("dirty", false); // saved again meanwhile: still to back up
                } else e.putString("error", err);
                e.apply();
            }
            if (err == null) clearNotice(ctx); // an earlier "couldn't back up" no longer applies
            return err;
        }
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
            if (tmp == null) return E_UNWRITABLE;
            if (!put(cr, tmp, bytes)) return E_WRITE;
            Uri main = find(cr, tree, NAME);
            if (main == null) main = DocumentsContract.createDocument(cr, dir, "application/json", NAME);
            if (main == null || !put(cr, main, bytes)) return E_TEMP;
            // the backup is written and checked: a temp file the provider won't delete is no failure
            try { DocumentsContract.deleteDocument(cr, tmp); } catch (Exception ignored) { }
            return null;
        } catch (SecurityException e) {
            return E_NO_ACCESS;
        } catch (Exception e) { // FileNotFoundException, IllegalArgumentException: the folder or card is gone
            return E_GONE;
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
            return readAll(in, max);
        }
    }

    private static byte[] readAll(InputStream in, int max) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int r; (r = in.read(buf)) != -1; ) {
            out.write(buf, 0, r);
            if (out.size() > max) throw new IOException("too big");
        }
        return out.toByteArray();
    }

    /**
     * The auto backup file's text for Settings → Restore and a newly picked folder, read straight from the folder:
     * {text, when (ms, the last backup), folder} or {error}, with none: true when the folder holds no backup file.
     */
    static String readAuto(Context ctx) {
        synchronized (RUN) { // never half-way through a backup's rewrite of the file
            return readAutoNow(ctx);
        }
    }

    private static String readAutoNow(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String tree = p.getString("tree", null);
        JSONObject o = new JSONObject();
        try {
            try {
                if (tree == null) return o.put("error", E_NO_FOLDER).toString();
                Uri doc = find(ctx.getContentResolver(), Uri.parse(tree), NAME);
                if (doc == null) {
                    return o.put("none", true).put("error", E_NO_FILE).toString();
                }
                byte[] b = readDoc(ctx.getContentResolver(), doc, MAX);
                return o.put("text", new String(b, StandardCharsets.UTF_8)).put("when", p.getLong("last", 0))
                        .put("folder", folderLabel(ctx, p)).toString();
            } catch (SecurityException e) {
                return o.put("error", E_NO_ACCESS).toString();
            } catch (Exception e) {
                return o.put("error", E_READ).toString();
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

    /**
     * The folder as Settings names it, in the app's language at the time it's read: "Documents/Tally" for phone
     * storage, "SD card/Backups" for a card, else the folder's own name from its app (remembered when it was picked).
     */
    private static String folderLabel(Context ctx, SharedPreferences p) {
        String t = p.getString("tree", null);
        if (t == null) return "";
        try {
            Uri tree = Uri.parse(t);
            String id = DocumentsContract.getTreeDocumentId(tree);
            int colon = id.indexOf(':');
            if ("com.android.externalstorage.documents".equals(tree.getAuthority()) && colon >= 0) {
                String path = id.substring(colon + 1);
                if (id.startsWith("primary:")) return path.isEmpty() ? ctx.getString(R.string.bk_folder_phone) : path;
                return path.isEmpty() ? ctx.getString(R.string.bk_folder_sd) : ctx.getString(R.string.bk_folder_sd_path, path);
            }
        } catch (Exception ignored) { }
        String name = p.getString("label", "");
        // "Chosen folder": what Tally 1.4.1 and earlier stored when the folder's app gave no name
        return name.isEmpty() || "Chosen folder".equals(name) ? ctx.getString(R.string.bk_folder_other) : name;
    }

    /** The folder's own name, from the app it lives in (a cloud drive's folder), or "" when it has none. */
    private static String providerName(Context ctx, Uri tree) {
        try {
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            String[] cols = {DocumentsContract.Document.COLUMN_DISPLAY_NAME};
            try (Cursor c = ctx.getContentResolver().query(doc, cols, null, null, null)) {
                if (c != null && c.moveToFirst() && c.getString(0) != null) return c.getString(0);
            }
        } catch (Exception ignored) { }
        return "";
    }

    /** A problem's code said in the app's language; a sentence an older Tally stored is shown as it is. */
    static String errorText(Context ctx, String code) {
        switch (code) {
            case E_NO_FOLDER: return ctx.getString(R.string.bk_err_no_folder);
            case E_NOT_READY: return ctx.getString(R.string.bk_err_not_ready);
            case E_NOTHING: return ctx.getString(R.string.bk_err_nothing);
            case E_UNWRITABLE: return ctx.getString(R.string.bk_err_unwritable);
            case E_WRITE: return ctx.getString(R.string.bk_err_write_failed);
            case E_TEMP: return ctx.getString(R.string.bk_err_saved_temp, TEMP);
            case E_NO_ACCESS: return ctx.getString(R.string.bk_err_no_access);
            case E_GONE: return ctx.getString(R.string.bk_err_folder_gone);
            case E_NO_FILE: return ctx.getString(R.string.bk_err_no_file, NAME);
            case E_READ: return ctx.getString(R.string.bk_err_read_failed);
            default: return code;
        }
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

    /** A file's bytes. */
    static byte[] readFile(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            return readAll(in, Integer.MAX_VALUE);
        }
    }

    /** A file's text, or null when there is none or it can't be read. */
    static String read(File f) {
        if (!f.exists()) return null;
        try {
            return new String(readFile(f), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    private static File snapshot(Context ctx) { return new File(ctx.getFilesDir(), "snapshot.json"); }

    private static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
