/*
 * backup.js — Export (CSV), backup (JSON), restore and delete-all.
 */
"use strict";

function exportCsv() {
  const q = s => '"' + String(s ?? "").replace(/"/g, '""') + '"';
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
/* the chosen backup file (Settings → Restore) replaces everything after a confirmation */
function restoreFile(input) {
  const f = input.files[0];
  input.value = "";
  if (!f) return;
  f.text().then(t => {
    let o;
    try {
      o = JSON.parse(t);
    } catch (e) {
      snack("That isn't a Tally backup file");
      return;
    }
    if (!o || !Array.isArray(o.accounts) || !Array.isArray(o.txns)) {
      snack("That isn't a Tally backup file");
      return;
    }
    askDialog(
      "Restore this backup?",
      "Replaces everything on this phone with " + o.accounts.length + " accounts and " + o.txns.length + " entries.",
      "Restore",
      () => {
        let n;
        try {
          n = migrate(o);
        } catch (e) {
          snack("That backup couldn't be read");
          return;
        }
        S = n;
        commit();
        applyTheme();
        snack("Backup restored");
      }
    );
  });
}
/* keeps the main currency, theme and reminder settings */
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
      };
      S = blank();
      Object.assign(S.settings, keep);
      commit();
      snack("All data deleted");
    },
    { danger: true }
  );
}
