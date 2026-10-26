/*
 * backup.js — Export (CSV), backup (JSON), restore and delete-all.
 */
"use strict";

function exportCsv() {
  /* quoted text; a leading = + - @ (after any spaces) gets a ' so a spreadsheet shows it instead of running it as a
     formula */
  const q = s =>
    '"' +
    String(s ?? "")
      .replace(/^\s*[=+\-@\t\r]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  const kind = t =>
    t.type === "loan"
      ? (loan(t.loan) && loan(t.loan).kind === "lend" ? "lend" : "loan") + "-" + t.dir
      : t.feeOf
        ? ((entry(t.feeOf) || {}).type === "loan" ? "loan" : "transfer") + "-fee"
        : t.type;
  const lines = [
    [
      "date",
      "type",
      "amount",
      "currency",
      "account",
      "to_account",
      "to_amount",
      "category",
      "note",
      "to_currency",
      "person",
    ].join(","),
  ];
  [...S.txns]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0))
    .forEach(t => {
      const a = acc(t.account),
        to = acc(t.to),
        l = t.type === "loan" && loan(t.loan);
      lines.push(
        [
          t.date,
          kind(t),
          rnd(t.amount),
          a ? a.currency : "",
          q(a ? a.name : ""),
          q(to ? to.name : ""),
          t.type === "transfer" ? rnd(t.toAmount != null ? t.toAmount : t.amount) : "",
          q((t.type === "expense" && !t.feeOf) || t.type === "income" ? catName(cat(t.cat)) : ""),
          q(
            t.type === "adjust"
              ? noteShown(t, "fix.title")
              : t.feeOf
                ? noteShown(t, kind(t) === "loan-fee" ? "loan.feeNote" : "transfer.feeNote")
                : t.note
          ),
          to ? to.currency : "",
          q(l ? l.person : ""),
        ].join(",")
      );
    });
  /* the byte-order mark tells spreadsheets (Excel) the file is UTF-8, so names in any script read right */
  saveOut("tally-entries-" + today() + ".csv", "text/csv", "\ufeff" + lines.join("\n"));
}
/* A backup's text (a chosen file, or the auto backup): checked, then one confirmation, then it replaces everything.
   `auto` = {when} for the auto backup file, whose dialog also offers "Choose another file". */
/* after: what follows a restore (turning auto backup on, when it came from the folder being picked) */
/* false when the text isn't a backup that can be read */
/* a backup file's text as its data, or null when it isn't a Tally backup (a byte-order mark from an editor is fine) */
function backupData(t) {
  try {
    const o = JSON.parse(String(t).replace(/^\uFEFF/, ""));
    return o && Array.isArray(o.accounts) && Array.isArray(o.txns) ? o : null;
  } catch (e) {
    return null;
  }
}
function restoreText(t, auto, after) {
  const o = backupData(t);
  let n = null;
  if (!o) {
    snack(T("restore.notBackup"));
    return false;
  }
  try {
    n = migrate(o);
  } catch (e) {
    snack(T("restore.unreadable"));
    return false;
  }
  /* what will really be restored: an entry, account, loan or asset that can't be read (or on a missing account) is
     left out, and said so */
  const had = k => (Array.isArray(o[k]) ? o[k].length - n[k].length : 0),
    lost = had("txns") + had("accounts") + had("loans") + had("assets"),
    newer = typeof o.v === "number" && o.v > blank().v;
  const what = {
    accounts: T("restore.accounts", { count: n.accounts.length }),
    entries: T("restore.entries", { count: n.txns.length }),
    when: auto && auto.when ? backupWhen(auto.when, true) : "",
  };
  askDialog(
    auto ? T("restore.autoQ", { file: "Tally backup.json" }) : T("restore.q"),
    T(what.when ? "restore.bodySaved" : "restore.body", what) +
      (lost > 0 ? " " + T("restore.lost", { count: lost }) : "") +
      (newer ? " " + T("restore.newer") : ""),
    T("restore.ok"),
    () => {
      /* this phone's own set-up stays: its auto backup (the folder lives in the shell), a copy so Undo gets back what
         was here; while the saved data couldn't be read, the stand-in's setting means nothing: the backup's own is kept,
         but an auto backup the shell still runs is never switched off by it */
      const old = S,
        was = unreadable;
      if (!unreadable) n.settings.backup = { ...S.settings.backup };
      else if ((backupStatus() || {}).on) n.settings.backup.on = true;
      unreadable = null; // a real notebook again: auto backup may follow it
      S = n;
      commit();
      syncBackup();
      applyTheme();
      if (after) after();
      snack(T("restore.done"), () => {
        S = old;
        unreadable = was; // back to the stand-in: auto backup keeps its folder and file (syncBackup waits)
        commit();
        syncBackup();
        applyTheme();
        snack(T("common.undone"));
      });
    },
    auto ? { alt: [T("restore.other"), pickRestoreFile] } : undefined
  );
}
/* the file input (a browser without the Android shell): Settings → Restore from backup */
function restoreFile(input) {
  const f = input.files[0];
  input.value = "";
  if (!f) return;
  f.text().then(
    t => restoreText(t),
    () => snack(T("restore.cantRead"))
  );
}
/* Restore on Android: the shell reads the file itself (WebView's own File could refuse a document whose size the
   picker reports wrongly). With auto backup on, its file first, with "Choose another file" beside it. */
const canRestore = () => !!(window.Android && Android.pickRestoreFile);
function restoreStart() {
  // while the saved data can't be read, the shell's own setting says whether auto backup runs
  const on = S.settings.backup.on || (unreadable && (backupStatus() || {}).on);
  if (!(on && Android.readAutoBackup)) return pickRestoreFile();
  /* the auto backup's file first; with none that can be read, the picker */
  readAutoBackup(r => {
    if (typeof r.text !== "string" || restoreText(r.text, r) === false) pickRestoreFile();
  });
}
function pickRestoreFile() {
  try {
    Android.pickRestoreFile();
  } catch (e) {}
}
/* window.tallyRestore: the picked file's text, or why it couldn't be read; both null = cancelled */
function onRestorePicked(text, err) {
  if (err) snack(nativeErr(err));
  else if (text != null) restoreText(text);
}
/* whether a backup of this notebook exists: the daily auto backup has written its file, or a backup was saved here */
function hasBackup() {
  const bs = backupStatus();
  return !!((bs && bs.last > 0) || S.settings.savedBackup > 0);
}
/* Settings → Save backup: the whole notebook as a JSON file; `then` runs once Android's save dialog has answered */
let AFTER_SAVE = null,
  SAVING_BACKUP = false;
function saveBackup(then) {
  const bridged = !!(window.Android && Android.saveFile); // else there's no save dialog to wait for
  SAVING_BACKUP = bridged;
  saveOut("tally-backup-" + today() + ".json", "application/json", JSON.stringify(S), then);
  if (!bridged && then) then();
}
/* Delete all data: always offers a backup first, since even an existing one may miss the latest entries (Save backup /
   Skip). Save backup backs up now into the auto backup's folder when that's set up, else (or if that fails) saves a file; then the
   final Yes / No. */
function wipeAll() {
  const had = hasBackup(),
    bs = backupStatus(),
    auto = S.settings.backup.on && bs && bs.usable;
  askDialog(
    T(had ? "wipe.first.title" : "wipe.none.title"),
    T(had ? "wipe.first.body" : "wipe.none.body"),
    T("backup.save"),
    () => {
      if (!auto) return saveBackup(wipeConfirm);
      /* a failed Back up now: a file instead. If the user has moved on meanwhile (a slow folder), the answer is only
         said: the final question never pops up over something else */
      backupNow(err => {
        if (V.screen !== "settings" || $("#pop").innerHTML || $("#sheet").innerHTML) return;
        if (err) saveBackup(wipeConfirm);
        else wipeConfirm();
      });
    },
    { cancel: T("wipe.skip"), no: wipeConfirm }
  );
}
/* the final Yes / No; keeps the preferences: main currency, week start, time format, theme, reminders, haptics, the
   donut's middle and auto backup (which never overwrites its file with an empty notebook) */
function wipeConfirm() {
  askDialog(
    T("wipe.title"),
    T("wipe.body"),
    T("common.yes"),
    () => {
      const keep = {
        cur: S.settings.cur,
        week: S.settings.week,
        clock: S.settings.clock,
        theme: S.settings.theme,
        remind: S.settings.remind,
        haptics: S.settings.haptics,
        hapticLevel: S.settings.hapticLevel,
        donut: S.settings.donut,
        backup: S.settings.backup,
      };
      S = blank();
      Object.assign(S.settings, keep);
      commit();
      snack(T("wipe.done"));
    },
    { danger: true, cancel: T("common.no") }
  );
}
