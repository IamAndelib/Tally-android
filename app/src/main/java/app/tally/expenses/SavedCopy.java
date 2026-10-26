package app.tally.expenses;

import android.content.Context;
import android.os.SystemClock;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * The shell's own copy of the page's saved data: files/saved.json, the save number on its first line and the JSON
 * after it. WebView writes localStorage to disk a few seconds after a change, so a save made just before Android ends
 * Tally (swiped away from Recents) could be missing from it. This copy is on disk moments after each save, and the
 * page's start-up (state.js loadState) takes whichever copy has the higher save number.
 */
final class SavedCopy {
    private static final Object LOCK = new Object();
    private static String next; // the newest save not written yet
    private static int nextSeq;
    private static boolean writing;
    /** The last write failed (a full disk, out of memory): the page then says its save may be lost (state.js save()). */
    static volatile boolean failed;

    private SavedCopy() { }

    /** Returns at once; a background thread writes it. Saves that arrive meanwhile are merged: only the newest is written. */
    static void keep(Context ctx, int seq, String json) {
        if (json == null) return;
        final File f = file(ctx);
        synchronized (LOCK) {
            next = json;
            nextSeq = seq;
            if (writing) return;
            writing = true;
        }
        try {
            new Thread(() -> {
                while (true) {
                    String j;
                    int s;
                    synchronized (LOCK) {
                        if (next == null) {
                            writing = false;
                            LOCK.notifyAll();
                            return;
                        }
                        j = next;
                        s = nextSeq;
                        next = null;
                    }
                    write(f, s, j);
                }
            }, "tally-saved-copy").start();
        } catch (Throwable e) { // no thread to be had (out of memory): the next save tries again
            synchronized (LOCK) {
                writing = false;
                LOCK.notifyAll();
            }
        }
    }

    /** The copy, once any write under way has finished (2 s at most); null when there is none. */
    static String read(Context ctx) {
        synchronized (LOCK) {
            long until = SystemClock.uptimeMillis() + 2000;
            while (writing && SystemClock.uptimeMillis() < until) {
                try {
                    LOCK.wait(200);
                } catch (InterruptedException e) {
                    break;
                }
            }
        }
        return BackupReceiver.read(file(ctx));
    }

    /** Flushed to the disk before it replaces the old copy, so an interrupted write leaves the old one whole. */
    private static void write(File f, int seq, String json) {
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream os = new FileOutputStream(tmp)) {
            os.write((seq + "\n").getBytes(StandardCharsets.UTF_8));
            os.write(json.getBytes(StandardCharsets.UTF_8));
            os.getFD().sync();
        } catch (Throwable e) { // a full disk, or out of memory: the old copy stays, its lower number loses to localStorage
            tmp.delete();
            failed = true;
            return;
        }
        failed = !tmp.renameTo(f);
        if (failed) tmp.delete();
    }

    private static File file(Context ctx) { return new File(ctx.getFilesDir(), "saved.json"); }
}
