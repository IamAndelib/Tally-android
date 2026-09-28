/*
 * backup.js — Export (CSV), backup (JSON), restore and delete-all.
 */
"use strict";

function exportCsv() {
  /* quoted text; a leading = + - @ gets a ' so a spreadsheet shows it instead of running it as a formula */
  const q = s =>
    '"' +
    String(s ?? "")
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  const kind = t =>
    t.type === "loan" ? (loan(t.loan) && loan(t.loan).kind === "lend" ? "lend" : "loan") + "-" + t.dir : t.type;
  const lines = [
    ["date", "type", "amount", "currency", "account", "to_account", "to_amount", "category", "note"].join(","),
  ];
  [...S.txns]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0))
    .forEach(t => {
      const a = acc(t.account),
        to = acc(t.to);
      lines.push(
        [
          t.date,
          kind(t),
          t.amount,
          a ? a.currency : "",
          q(a ? a.name : ""),
          q(to ? to.name : ""),
          t.type === "transfer" ? (t.toAmount != null ? t.toAmount : t.amount) : "",
          q(t.type === "expense" || t.type === "income" ? cat(t.cat).name : ""),
          q(t.note),
        ].join(",")
      );
    });
  saveOut("tally-entries-" + today() + ".csv", "text/csv", lines.join("\n"));
}
/* A backup's text (a chosen file, or the auto backup): checked, then one confirmation, then it replaces everything.
   `auto` = {when, folder} for the auto backup file, whose dialog also offers "Choose another file". */
function restoreText(t, auto) {
  let o = null;
  try {
    o = JSON.parse(t);
  } catch (e) {}
  if (!o || !Array.isArray(o.accounts) || !Array.isArray(o.txns)) {
    snack("That isn't a Tally backup file");
    return;
  }
  askDialog(
    auto ? "Restore Tally backup.json?" : "Restore this backup?",
    "Replaces everything on this phone with " +
      o.accounts.length +
      " accounts and " +
      o.txns.length +
      " entries" +
      (auto && auto.when ? " · saved " + backupWhen(auto.when) : "") +
      ".",
    "Restore",
    () => {
      let n;
      try {
        n = migrate(o);
      } catch (e) {
        snack("That backup couldn't be read");
        return;
      }
      /* this phone's own set-up stays: its auto backup (the folder lives in the shell) and what Android has allowed */
      const keep = {
        backup: S.settings.backup,
        batteryOk: S.settings.batteryOk,
        exactAsked: S.settings.exactAsked,
        batteryAsked: S.settings.batteryAsked,
        notifAsked: S.settings.notifAsked,
      };
      S = n;
      Object.assign(S.settings, keep);
      commit();
      syncBackup();
      applyTheme();
      snack("Backup restored");
    },
    auto ? { alt: ["Choose another file", pickRestoreFile] } : undefined
  );
}
/* the file input (a browser without the Android shell): Settings → Restore from backup */
function restoreFile(input) {
  const f = input.files[0];
  input.value = "";
  if (!f) return;
  f.text().then(
    t => restoreText(t),
    () => snack("Couldn't read that file")
  );
}
/* Restore on Android: the shell reads the file itself (WebView's own File could refuse a document whose size the
   picker reports wrongly). With auto backup on, its file first, with "Choose another file" beside it. */
const canRestore = () => !!(window.Android && Android.pickRestoreFile);
function restoreStart() {
  if (S.settings.backup.on && Android.readAutoBackup) {
    let r = {};
    try {
      r = JSON.parse(Android.readAutoBackup() || "{}");
    } catch (e) {}
    if (typeof r.text === "string") return restoreText(r.text, r);
  }
  pickRestoreFile();
}
function pickRestoreFile() {
  try {
    Android.pickRestoreFile();
  } catch (e) {}
}
/* window.tallyRestore: the picked file's text, or why it couldn't be read; both null = cancelled */
function onRestorePicked(text, err) {
  if (err) snack(err);
  else if (text != null) restoreText(text);
}
/* keeps the preferences: main currency, theme, reminders, haptics, the donut's middle and auto backup (which never
   overwrites its file with an empty notebook) */
function wipeAll() {
  askDialog(
    "Delete all data?",
    "Every account and entry on this phone. This can't be undone.",
    "Delete all",
    () => {
      const keep = {
        cur: S.settings.cur,
        theme: S.settings.theme,
        remind: S.settings.remind,
        notifAsked: S.settings.notifAsked,
        haptics: S.settings.haptics,
        hapticLevel: S.settings.hapticLevel,
        donut: S.settings.donut,
        backup: S.settings.backup,
        batteryOk: S.settings.batteryOk,
        exactAsked: S.settings.exactAsked,
        batteryAsked: S.settings.batteryAsked,
      };
      S = blank();
      Object.assign(S.settings, keep);
      commit();
      snack("All data deleted");
    },
    { danger: true }
  );
}
