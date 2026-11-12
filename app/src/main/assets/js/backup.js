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
  /* an entry's type column: a payment keeps "lend-in"/"loan-out", its whole amount; an add-on gets its own (a charge on a
     transfer or a loan payment stays "transfer-fee"/"loan-fee") */
  const kind = t => {
    if (t.feeOf) {
      const h = entry(t.feeOf) || {};
      if (t.type === "income") return "loan-extra"; // a tip on top of a payback
      if (t.type === "loan") return "lend-fee"; // a lend's transfer charge
      return h.type === "loan" ? "loan-fee" : h.type === "expense" ? "expense-fee" : "transfer-fee";
    }
    return t.type === "loan" ? (loan(t.loan) && loan(t.loan).kind === "lend" ? "lend" : "loan") + "-" + t.dir : t.type;
  };
  /* what an add-on's note says when the user wrote none */
  const wordOf = {
    "loan-fee": "loan.feeNote",
    "transfer-fee": "transfer.feeNote",
    "expense-fee": "csv.chargeNote",
    "lend-fee": "csv.xchargeNote",
    "loan-extra": "csv.extraNote",
    "lend-extra": "csv.extraNote",
    "borrow-fee": "csv.chargesNote",
  };
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
      "payee", // last, so files read by column position keep their columns
    ].join(","),
  ];
  [...S.txns].sort(byOldest).forEach(t => {
    const a = acc(t.account),
      to = acc(t.to),
      l = t.type === "loan" && loan(t.loan);
    const row = (type, amount, note) =>
      [
        t.date,
        type,
        rnd(amount),
        a ? a.currency : "",
        q(a ? a.name : ""),
        q(""),
        "",
        q(""),
        q(note),
        "",
        q(l ? l.person : ""),
        q(""),
      ].join(",");
    lines.push(
      [
        t.date,
        kind(t),
        rnd(t.amount),
        a ? a.currency : "",
        q(a ? a.name : ""),
        q(to ? to.name : ""),
        t.type === "transfer" ? rnd(t.toAmount != null ? t.toAmount : t.amount) : "",
        q(
          (t.type === "expense" && !t.feeOf) || (t.type === "income" && !t.feeOf) || kind(t) === "expense-fee"
            ? catName(cat(t.cat))
            : ""
        ),
        q(t.type === "adjust" ? noteShown(t, "fix.title") : t.feeOf ? noteShown(t, wordOf[kind(t)]) : t.note),
        to ? to.currency : "",
        q(l ? l.person : ""),
        q(t.payee || ""),
      ].join(",")
    );
    /* a draw's amount on top moves no money: a line of its own after the draw */
    if (t.type === "loan" && t.principal && t.onTop > 0 && !t.feeOf)
      lines.push(
        l && l.kind === "lend"
          ? row("lend-extra", t.onTop, T("csv.extraNote"))
          : row("borrow-fee", t.onTop, T("csv.chargesNote"))
      );
  });
  /* the byte-order mark tells spreadsheets (Excel) the file is UTF-8, so names in any script read right */
  saveOut("tally-entries-" + today() + ".csv", "text/csv", "\ufeff" + lines.join("\n"));
}
/* a backup file's text as its data, or null when it isn't a Tally backup (a byte-order mark from an editor is fine) */
function backupData(t) {
  try {
    const o = JSON.parse(String(t).replace(/^\uFEFF/, ""));
    return o && Array.isArray(o.accounts) && Array.isArray(o.txns) ? o : null;
  } catch (e) {
    return null;
  }
}
/* A backup's text read for restoring: {err} (the snack's key) when it isn't a backup that can be read, else what the
   restore will do: n (the data), notes (what can't be restored as it was), run(after) (replaces everything; after: what
   follows, like turning auto backup on when the backup came from the folder being picked) */
function restorePlan(t) {
  const o = backupData(t);
  let n = null;
  if (!o) return { err: "restore.notBackup" };
  try {
    n = migrate(o);
  } catch (e) {
    return { err: "restore.unreadable" };
  }
  /* what will really be restored: an entry, account, loan or asset that can't be read (or on a missing account) is
     left out, and said so */
  const had = k => (Array.isArray(o[k]) ? o[k].length - n[k].length : 0),
    lost = had("txns") + had("accounts") + had("loans") + had("assets"),
    newer = typeof o.v === "number" && o.v > blank().v;
  return {
    n,
    notes: [lost > 0 && T("restore.lost", { count: lost }), newer && T("restore.newer")],
    run: after => {
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
  };
}
/* What a Restore confirmation says: the data is replaced, what the backup holds (accounts, entries as History counts
   them: an add-on is in its entry, histRows(), and when it was saved if known), then the plan's notes (items left out,
   a newer version) */
function restoreBody(plan, when) {
  const ids = new Set(plan.n.txns.map(t => t.id)),
    what = {
      accounts: T("restore.accounts", { count: plan.n.accounts.length }),
      entries: T("restore.entries", { count: plan.n.txns.filter(t => !(t.feeOf && ids.has(t.feeOf))).length }),
      when: when ? backupWhen(when, true) : "",
    };
  return sentences(T(what.when ? "restore.bodySaved" : "restore.body", what), ...plan.notes);
}
/* A backup's text (a chosen file, or the auto backup): checked, then one confirmation, then it replaces everything.
   auto: {when} for the auto backup file, whose dialog also offers "Choose another file". False when the text isn't a
   backup that can be read. */
function restoreText(t, auto) {
  const plan = restorePlan(t);
  if (plan.err) {
    snack(T(plan.err));
    return false;
  }
  /* with the auto backup's file: Restore / Choose another file / Cancel; a file just picked: Cancel | Restore */
  const yes = { role: "keep", label: T("restore.ok"), run: () => plan.run() },
    no = { role: "out", label: T("common.cancel") };
  choiceDialog(
    auto ? T("restore.autoQ", { file: BACKUP_FILE }) : T("restore.q"),
    restoreBody(plan, auto && auto.when),
    auto ? [yes, { role: "alt", label: T("restore.other"), run: pickRestoreFile }, no] : [no, yes],
    { row: !auto }
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
   Delete without a backup). Save backup backs up now into the auto backup's folder when that's set up, else (or if that fails) saves a file; then the
   final Cancel | Delete. */
function wipeAll() {
  const had = hasBackup(),
    bs = backupStatus(),
    auto = S.settings.backup.on && bs && bs.usable;
  choiceDialog(T(had ? "wipe.first.title" : "wipe.none.title"), T(had ? "wipe.first.body" : "wipe.none.body"), [
    {
      role: "keep",
      label: T("backup.save"),
      run: () => {
        if (!auto) return saveBackup(wipeConfirm);
        /* a failed Back up now: a file instead. If the user has moved on meanwhile (a slow folder), the answer is only
           said: the final question never pops up over something else */
        backupNow(err => {
          if (V.screen !== "settings" || $("#pop").innerHTML || $("#sheet").innerHTML) return;
          if (err) saveBackup(wipeConfirm);
          else wipeConfirm();
        });
      },
    },
    {
      role: "destroy",
      label: T("wipe.noBackup"),
      run: wipeNow,
      confirm: { title: T("wipe.title"), text: T("wipe.body"), ok: T("common.delete") },
    },
    { role: "out", label: T("common.cancel") },
  ]);
}
/* the final Cancel | Delete, after a backup was saved (without one it is Delete without a backup's second step) */
function wipeConfirm() {
  choiceDialog(
    T("wipe.title"),
    T("wipe.body"),
    [
      { role: "out", label: T("common.cancel") },
      { role: "destroy", label: T("common.delete"), run: wipeNow },
    ],
    { row: true }
  );
}
/* the wipe itself; keeps the preferences: main currency, week start, time format, theme, reminders, haptics, the
   donut's middle and auto backup (which never overwrites its file with an empty notebook) */
function wipeNow() {
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
  recentSave([]); // the recent searches live in the shell, not in S
  commit();
  snack(T("wipe.done"));
}
