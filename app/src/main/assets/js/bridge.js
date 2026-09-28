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
/* "HH:MM" → {h, m} for the shell's alarms */
const hmObj = t => ({ h: +t.slice(0, 2), m: +t.slice(3) });
/* the balance check's notification text: up to four accounts with their balances */
function checkText() {
  const act = activeAccounts(),
    b = balances();
  return (
    act
      .slice(0, 4)
      .map(a => a.name + " " + money(b[a.id], a.currency))
      .join(" · ") + (act.length > 4 ? " · …" : "")
  );
}
/* Sends the reminder settings to the shell (ReminderReceiver.java): the evening nudge, the balance check (skipped
   once the balances were confirmed today) and the loan / lending due days, each at its own time */
function syncReminders() {
  if (!(window.Android && Android.setReminders)) return;
  const r = S.settings.remind;
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
      JSON.stringify({
        daily: Object.assign({ on: r.daily }, hmObj(r.time)),
        check: Object.assign({ on: r.check && activeAccounts().length > 0 }, hmObj(r.checkTime), {
          text: checkText(),
          checked: S.settings.lastCheck || "",
        }),
        duesAt: hmObj(r.dueTime),
        lastEntry: last,
        dues,
      })
    );
  } catch (e) {}
}
/* Settings switch for haptics on taps, drags and saves; turning it on gives one click to feel */
function toggleHaptics() {
  S.settings.haptics = S.settings.haptics === false;
  save();
  render();
  if (S.settings.haptics) buzz("tap");
}
/* Settings → Feel → Strength: moves the slider, saves the level and plays it — when the stop changes, or always with
   `force` (the first touch), so the finger feels every level it passes */
function setHapticLevel(v, force) {
  const n = Math.min(5, Math.max(1, Math.round(+v) || 3)),
    el = $("#f-hlevel");
  if (el) sliderShow(el, n);
  if (n === S.settings.hapticLevel && !force) return;
  S.settings.hapticLevel = n;
  save();
  buzz("tap");
}
/* Settings switch for the evening nudge ("daily"), the balance check ("check") or due-day reminders ("dues") */
function toggleReminder(k) {
  const r = S.settings.remind;
  r[k] = r[k] === false;
  save();
  syncReminders();
  render();
  if (r[k]) askNotify();
}
/* a time button in Settings: the wheel picker for that reminder (or the daily backup), then save and re-arm */
function pickTime(k) {
  const r = S.settings.remind,
    b = S.settings.backup,
    c = {
      nudge: ["Evening nudge at", r.time, v => (r.time = v)],
      check: ["Balance check at", r.checkTime, v => (r.checkTime = v)],
      due: ["Due-day reminders at", r.dueTime, v => (r.dueTime = v)],
      backup: ["Back up every day at", b.time, v => (b.time = v)],
    }[k];
  if (!c) return;
  timePicker(c[0], c[1], v => {
    c[2](v);
    save();
    syncReminders();
    syncBackup();
    render();
  });
}
/* a reminder was switched on (or a due date set): Android's notification prompt, which the shell shows only while
   the permission is missing and Android still lets it ask. Android's own first-open prompts come from the shell. */
function askNotify() {
  try {
    if (window.Android && Android.requestNotifications) Android.requestNotifications();
  } catch (e) {}
}
/* the permissions reminders need, shared by Settings' card and the first-open dialog: [kind, name, why] */
const PERM_ROWS = [
  ["notif", "Notifications", "Reminders can't show without them"],
  ["exact", "Alarms &amp; reminders", "So reminders come on time"],
  ["battery", "Unrestricted battery", "So the phone doesn't pause Tally"],
];
/* one permission: Allow (the shell opens Android's prompt, popup or switch screen), or a quiet "Allowed" */
function permRow([k, t, why], ok) {
  return (
    '<div class="setrow"><span class="mid"><div>' +
    t +
    '</div><div class="s">' +
    why +
    "</div></span>" +
    (ok
      ? '<span class="pok">' + ic("check") + "Allowed</span>"
      : '<button class="btn tonal" data-act="rem-fix" data-v="' + k + '">Allow</button>') +
    "</div>"
  );
}
/* first open on this install (the shell remembers): one dialog listing the permissions, each with its own Allow, and
   Done. Nothing follows on its own; whatever stays denied waits in Settings → Reminders. Skipped when all's allowed. */
function permsIntro() {
  let first = false;
  try {
    first = !!(window.Android && Android.permsIntro && Android.permsIntro());
  } catch (e) {}
  const h = first && reminderHealth();
  if (!h || PERM_ROWS.every(([k]) => h[k] !== false)) return;
  $("#pop").innerHTML =
    '<div class="pop scrim" data-act="pop-bg"><div class="dialog" role="dialog" aria-modal="true" aria-label="Permissions">' +
    '<h3 class="dlg-t">Permissions</h3><p class="dlg-x">For reminders and the daily backup.</p><div id="pp-rows">' +
    PERM_ROWS.map(r => permRow(r, h[r[0]] !== false)).join("") +
    '</div><div class="dlg-act end"><button class="btn text" data-act="pd-close">Done</button></div></div></div>';
}
/* window.tallyPerms / resume: a permission may have changed; the open dialog's rows and Settings' card follow at once
   (on Android, allowing unrestricted battery also allows alarms & reminders, so that row turns too) */
function onPerms() {
  const rows = $("#pp-rows"),
    h = rows && reminderHealth();
  if (h) rows.innerHTML = PERM_ROWS.map(r => permRow(r, h[r[0]] !== false)).join("");
  else if (V.screen === "settings" && !$("#sheet").innerHTML && !$("#pop").innerHTML) render();
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
/* ---- daily auto backup (BackupReceiver.java): the shell keeps a copy of S and writes it to the picked folder ---- */
const canBackup = () => !!(window.Android && Android.setBackupData && Android.pickBackupFolder);
let mirrorT = 0;
/* after every save while auto backup is on, hand the shell the data (debounced: a drag saves many times) */
function mirrorSoon() {
  if (!S.settings.backup || !S.settings.backup.on || !canBackup()) return;
  clearTimeout(mirrorT);
  mirrorT = setTimeout(mirrorNow, 800);
}
/* going to the background (window.tallyPause): hand over only data a save left waiting in the debounce */
function flushMirror() {
  if (mirrorT) mirrorNow();
}
function mirrorNow() {
  clearTimeout(mirrorT);
  mirrorT = 0;
  if (!S.settings.backup.on || !canBackup()) return;
  try {
    Android.setBackupData(JSON.stringify(S));
  } catch (e) {}
}
/* the daily alarm: on/off and its time */
function syncBackup() {
  if (!canBackup()) return;
  try {
    Android.setBackup(JSON.stringify(Object.assign({ on: S.settings.backup.on }, hmObj(S.settings.backup.time))));
  } catch (e) {}
}
/* {folder, last, error} from the shell, or null in a browser */
function backupStatus() {
  if (!canBackup()) return null;
  try {
    return JSON.parse(Android.backupStatus() || "{}");
  } catch (e) {
    return {};
  }
}
/* The Auto backup switch. Off keeps the folder; on reuses it while Tally can still write there. Only the first time,
   or once that permission is gone, asks for a folder (the answer comes back in onFolderPicked); "Change" picks
   another one any time. Switching on only schedules it: the first backup comes at the set time (save() hands the
   data over, debounced), so the tap stays instant; Back up now is the one immediate write. */
function toggleAutoBackup() {
  if (S.settings.backup.on) {
    S.settings.backup.on = false;
    save();
    syncBackup();
    render();
    return;
  }
  const bs = backupStatus();
  if (!bs || !bs.folder || !bs.usable) return pickBackupFolder();
  backupOn();
}
function backupOn() {
  S.settings.backup.on = true;
  save();
  syncBackup();
  if (V.screen === "settings") render();
  snack("Auto backup on · daily at " + timeLabel(S.settings.backup.time));
}
function pickBackupFolder() {
  try {
    Android.pickBackupFolder();
  } catch (e) {}
}
/* window.tallyFolder: null = cancelled (nothing changes), "" = folder saved, else what went wrong */
function onFolderPicked(err) {
  if (err == null) return;
  if (err) snack(err);
  else backupOn();
}
function backupNow() {
  mirrorNow();
  let err = "Backup isn't available here";
  try {
    err = Android.backupNow();
  } catch (e) {}
  if (V.screen === "settings") render();
  snack(err || "Backed up");
}
/* ---- what may keep reminders from arriving on time (Settings → Reminders shows a card with the fixes) ---- */
function reminderHealth() {
  if (!(window.Android && Android.reminderHealth)) return null;
  try {
    return JSON.parse(Android.reminderHealth());
  } catch (e) {
    return null;
  }
}
/* an Allow button on the permissions card; "notif": the shell shows Android's prompt while it still can, else the
   settings page; "exact": the Alarms & reminders switch; "battery": Android's battery popup */
function fixReminders(kind) {
  try {
    Android.openSetting(kind);
  } catch (e) {}
}
/* "add:out|in|tr" from the widget's quick add, "loan:<id>[:pay]" from a reminder, "check" from the balance check,
   "backup" from a failed auto backup (window.tallyOpen) */
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
  if (k === "check" || k === "backup") {
    applyNativeActions();
    closePop();
    BACKTO = null;
    closeSheet();
    if (k === "check") {
      V.screen = "home";
      V.period = "day";
      V.anchor = today();
    } else V.screen = "settings";
    render();
    const el = $(k === "check" ? "#app .check" : "#bk");
    if (el) el.scrollIntoView({ block: "center" });
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
  H24 = null;
  onPerms(); // permissions may have changed in Android's settings
}
function saveOut(name, mime, text) {
  if (window.Android && Android.saveFile) Android.saveFile(name, mime, text);
  else snack("Saving isn't available here");
}
/* Android back / Escape: closes the top-most layer, else returns Home. False when there is nothing left to close
   (then the app itself closes). Order: calculator, dialog, picker sheet, sheet, selection, other screen. */
function goBack() {
  if (CALC) {
    if (CALC.inp && CALC.inp.isConnected) {
      calcClose(CALC.id, calcToggleBtn(CALC.id), true);
      return true;
    }
    stopRepeat(); // its sheet closed while it was open: forget it and go on
    CALC = null;
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
