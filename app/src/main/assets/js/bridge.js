/*
 * bridge.js — Talking to the Android shell (window.Android, see MainActivity.java): home-screen widget numbers, reminders,
 * notification actions, saving files, and the handlers behind the window.tally* hooks.
 */
"use strict";

/* home-screen widget: today's total balance (same number as the Home banner, main currency) and today's spending */
let lastWidget = "";
function syncWidget() {
  if (!(window.Android && Android.setWidget)) return;
  const act = activeAccounts(),
    cs = currencies(),
    t = today();
  let o = { date: t };
  if (act.length) {
    const cur = cs.includes(S.settings.cur) ? S.settings.cur : cs[0],
      b = balances();
    const total = r2(act.filter(a => a.currency === cur).reduce((q, a) => q + b[a.id], 0));
    const spent = r2(
      S.txns
        .filter(x => x.type === "expense" && x.date === t && (acc(x.account) || {}).currency === cur)
        .reduce((q, x) => q + x.amount, 0)
    );
    o = { date: t, balance: money(total, cur), spent: money(spent, cur), zero: money(0, cur) };
  }
  const j = JSON.stringify(o);
  if (j === lastWidget) return;
  lastWidget = j;
  try {
    Android.setWidget(j);
  } catch (e) {}
}
function syncReminders() {
  if (!(window.Android && Android.setReminders)) return;
  const r = S.settings.remind || {},
    tm = /^\d\d:\d\d$/.test(r.time) ? r.time : "21:00";
  const last = S.txns.reduce((m, t) => {
    const c = t.ts ? iso(new Date(t.ts)) : t.date,
      d = c > t.date ? c : t.date;
    return d > m ? d : m;
  }, "");
  const dues =
    r.dues === false
      ? []
      : S.loans
          .map(l => ({ l, i: loanInfo(l) }))
          .filter(x => x.i.open && x.i.nextDue)
          .map(({ l, i }) => ({
            id: l.id,
            date: i.nextDue,
            kind: l.kind,
            who: loanWho(l),
            amount: money(i.left, i.cur),
          }));
  try {
    Android.setReminders(
      JSON.stringify({ daily: { on: r.daily !== false, h: +tm.slice(0, 2), m: +tm.slice(3) }, lastEntry: last, dues })
    );
  } catch (e) {}
}
/* Settings switch for the evening nudge ("daily") or due-day reminders ("dues") */
function toggleReminder(k) {
  const r = S.settings.remind;
  r[k] = r[k] === false;
  save();
  syncReminders();
  render();
  if (r[k]) askNotify();
}
function askNotify() {
  if (S.settings.notifAsked || !(window.Android && Android.requestNotifications)) return;
  S.settings.notifAsked = true;
  save();
  try {
    Android.requestNotifications();
  } catch (e) {}
}
/* +1 day / +1 week tapped on a notification while the app was closed */
function applyNativeActions() {
  if (!(window.Android && Android.takeActions)) return;
  let list = [];
  try {
    list = JSON.parse(Android.takeActions() || "[]");
  } catch (e) {}
  let changed = false;
  list.forEach(x => {
    const l = x && loan(x.id);
    if (x.type === "extend" && l && loanInfo(l).open) {
      extendLoan(l, +x.days || 1);
      changed = true;
    }
  });
  if (changed) {
    save();
    render();
  }
}
/* "add:out|in|tr" from the widget's quick add, "loan:<id>[:pay]" from a reminder (window.tallyOpen) */
function openFromNative(s) {
  const [k, id, pay] = String(s || "").split(":");
  if (k === "add") {
    /* from the widget's quick add: today, on Home */
    applyNativeActions();
    closePop();
    BACKTO = null;
    closeSheet();
    V.screen = "home";
    V.period = "day";
    V.anchor = today();
    render();
    if (!activeAccounts().length) return;
    if (id === "out") txSheet(null, "expense");
    else if (id === "in") txSheet(null, "income");
    else if (id === "tr") trSheet();
    return;
  }
  if (k !== "loan" || !loan(id)) return;
  applyNativeActions();
  closePop();
  closeSheet();
  loanOpen(id, pay === "pay");
}
/* the app came back to the foreground (window.tallyResume) */
function onAppResume() {
  applyNativeActions();
  syncWidget();
  catchUpToday();
  syncReminders();
}
function saveOut(name, mime, text) {
  if (window.Android && Android.saveFile) Android.saveFile(name, mime, text);
  else snack("Saving isn't available here");
}
/* Android back / Escape: closes the top-most layer, else returns Home. False when there is nothing left to close
   (then the app itself closes). Order: calculator, dialog, picker sheet, sheet, selection, other screen. */
function goBack() {
  if (CALC) {
    calcClose(CALC.id, calcToggleBtn(CALC.id), true);
    return true;
  }
  if ($("#pop").innerHTML) {
    closePop();
    return true;
  }
  if ($("#sheet2").innerHTML) {
    closeSheet2();
    return true;
  }
  if ($("#sheet").innerHTML) {
    closeSheet();
    return true;
  }
  if (V.sel) {
    V.sel = null;
    render();
    return true;
  }
  if (V.screen !== "home") {
    V.screen = "home";
    render();
    return true;
  }
  return false;
}
/* result of Android.saveFile (window.tallySaved) */
function onFileSaved(ok) {
  snack(ok ? "Saved" : "Not saved");
}
