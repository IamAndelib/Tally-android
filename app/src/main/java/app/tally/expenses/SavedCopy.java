package app.tally.expenses;

import android.content.Context;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
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
    }

    /** The copy, once any write under way has finished; null when there is none. */
    static String read(Context ctx) {
        synchronized (LOCK) {
            long until = System.currentTimeMillis() + 2000;
            while (writing && System.currentTimeMillis() < until) {
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
            os.write((seq + "\n" + json).getBytes(StandardCharsets.UTF_8));
            os.getFD().sync();
        } catch (IOException e) {
            tmp.delete();
            return;
        }
        if (!tmp.renameTo(f)) tmp.delete();
    }

    private static File file(Context ctx) { return new File(ctx.getFilesDir(), "saved.json"); }
}
