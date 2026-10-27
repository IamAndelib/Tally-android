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
    o = { date: t, balance: money(balanceIn(cur, b), cur), spent: money(spentOn(t, cur), cur), zero: money(0, cur) };
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
  /* a +1 day tapped on a notification while the page was in the background: apply it first, or the old due date
     sent below would bring the reminder back */
  applyNativeActions();
  const r = S.settings.remind,
    now = today();
  /* the last day something was written: the day of its writing (an entry dated ahead counts on that day, never past
     today; an old one without a time on its date) */
  let maxTs = 0,
    maxDate = "";
  S.txns.forEach(t => {
    if (t.ts) maxTs = Math.max(maxTs, t.ts);
    else if (t.date > maxDate) maxDate = t.date;
  });
  const c = maxTs ? iso(new Date(maxTs)) : "",
    newest = c > maxDate ? c : maxDate,
    last = newest < now ? newest : now;
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
            who: l.person || "", // none: the shell says "Someone" in the phone's language
            amount: money(i.dueAmt, i.cur),
            total: i.dueAmt < i.left ? money(i.left, i.cur) : "", // the whole tab, when more is out than is due
          }));
  try {
    Android.setReminders(
      JSON.stringify({
        daily: Object.assign({ on: r.daily && activeAccounts().length > 0 }, hmObj(r.time)), // nothing to write in yet
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
      nudge: [T("remind.nudgeAt"), r.time, v => (r.time = v)],
      check: [T("remind.checkAt"), r.checkTime, v => (r.checkTime = v)],
      due: [T("remind.duesAt"), r.dueTime, v => (r.dueTime = v)],
      backup: [T("backup.at"), b.time, v => (b.time = v)],
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
   the permission is missing and Android still lets it ask. On first open, permsIntro() lists the permissions. */
function askNotify() {
  try {
    if (window.Android && Android.requestNotifications) Android.requestNotifications();
  } catch (e) {}
}
/* the permissions reminders need, shared by Settings' card and the first-open dialog: [kind] (texts perms.<kind>) */
const PERM_ROWS = [["notif"], ["battery"], ["exact"]];
/* the rows to offer: Android counts unrestricted battery as allowing alarms & reminders, so that row only shows on a
   phone where it's still off although battery is already allowed */
const permRows = h => PERM_ROWS.filter(([k]) => k !== "exact" || (h.battery !== false && h.exact === false));
/* one permission: Allow (the shell opens Android's prompt, popup or switch screen), or a quiet "Allowed" */
function permRow([k], ok) {
  return (
    '<div class="setrow"><span class="mid"><div>' +
    TH("perms." + k) +
    '</div><div class="s">' +
    TH("perms." + k + "Why") +
    "</div></span>" +
    (ok
      ? '<span class="pok">' + ic("check") + TH("perms.allowed") + "</span>"
      : '<button class="btn tonal" data-act="rem-fix" data-v="' + k + '">' + TH("perms.allow") + "</button>") +
    "</div>"
  );
}
/* first open on this install (the shell remembers): one dialog listing the permissions, each with its own Allow, and
   Done. Nothing follows on its own; whatever stays denied waits in Settings → Reminders. Skipped when all's allowed.
   True when it showed. */
function permsIntro() {
  let first = false;
  try {
    first = !!(window.Android && Android.permsIntro && Android.permsIntro());
  } catch (e) {}
  const h = first && reminderHealth();
  if (!h || permRows(h).every(([k]) => h[k] !== false)) return false;
  $("#pop").innerHTML =
    '<div class="pop scrim" data-act="pop-bg"><div class="dialog" role="dialog" aria-modal="true" aria-label="' +
    TH("perms.title") +
    '">' +
    '<h3 class="dlg-t">' +
    TH("perms.title") +
    '</h3><p class="dlg-x">' +
    TH("perms.intro") +
    '</p><div id="pp-rows">' +
    permRows(h)
      .map(r => permRow(r, h[r[0]] !== false))
      .join("") +
    '</div><div class="dlg-act end"><button class="btn text" data-act="pd-close">' +
    TH("common.done") +
    "</button></div></div></div>";
  return true;
}
/* window.tallyPerms / resume: a permission may have changed; the open dialog's rows and Settings' card follow at once
   (on Android, allowing unrestricted battery also allows alarms & reminders, so that row turns too) */
function onPerms() {
  const rows = $("#pp-rows"),
    h = rows && reminderHealth();
  if (h)
    rows.innerHTML = permRows(h)
      .map(r => permRow(r, h[r[0]] !== false))
      .join("");
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
      extendLoan(l, +x.days || 1, /^\d{4}-\d{2}-\d{2}$/.test(x.on) && x.on <= today() ? x.on : "");
      changed = true;
    }
  });
  if (changed) {
    dropUndo(); // its snapshot is from before: Undo would take the new due date back
    save();
    render();
  }
}
/* ---- daily auto backup (BackupReceiver.java): the shell keeps a copy of S and writes it to the picked folder ---- */
/* the auto backup's file in the folder picked (BackupReceiver.NAME) */
const BACKUP_FILE = "Tally backup.json";
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
  if (!S.settings.backup.on || !canBackup() || unreadable) return;
  try {
    Android.setBackupData(savedJson || JSON.stringify(S)); // what save() just stored (stringified once)
  } catch (e) {}
}
/* the daily alarm: on/off and its time; not while the saved data couldn't be read (the notebook in use is a blank
   stand-in, whose "off" would make the shell drop its copy of the real one) */
function syncBackup() {
  if (!canBackup() || unreadable) return;
  try {
    Android.setBackup(JSON.stringify(Object.assign({ on: S.settings.backup.on }, hmObj(S.settings.backup.time))));
  } catch (e) {}
}
/* a problem the shell reports as a code (no_folder, not_backup, …: BackupReceiver.E_*, MainActivity), said in Tally's
   language; a sentence an older Tally stored, or one the page made, is shown as it is */
const nativeErr = x =>
  /^[a-z_]+$/.test(x) && i18nGet("native.err." + x) != null
    ? T("native.err." + x, { file: x === "saved_temp" ? "Tally backup (new).json" : BACKUP_FILE })
    : String(x);
/* {on, folder, usable, last, error} from the shell (usable: Tally can still write there), or null in a browser */
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
  if (!bs.last) return folderCheck(); // nothing of this install's in that folder yet: what's there is asked about
  backupOn();
}
function backupOn() {
  S.settings.backup.on = true;
  save();
  syncBackup();
  if (V.screen === "settings") render();
  snack(T("backup.on", { time: timeLabel(S.settings.backup.time) }));
}
function pickBackupFolder() {
  try {
    Android.pickBackupFolder();
  } catch (e) {}
}
/* window.tallyFolder: null = cancelled (nothing changes), "" = folder saved, else what went wrong */
function onFolderPicked(err) {
  if (err == null) return;
  if (err) return snack(nativeErr(err));
  // the same folder picked again: its backup is this install's own (the shell keeps `last` only then), nothing to ask
  if ((backupStatus() || {}).last > 0) return backupOn();
  folderCheck();
}
/* Before auto backup first writes into a folder: a Tally backup already there (after a reinstall, from another phone,
   or Tally Dev's) is never written over unasked, nor one that can't be read; only an empty folder goes straight on */
function folderCheck() {
  readAutoBackup(r => {
    if (r.none) return backupOn();
    // the shell already writes to the new folder on schedule: until Restore it or Replace it, auto backup is off
    if (S.settings.backup.on) {
      S.settings.backup.on = false;
      save();
      syncBackup();
      if (V.screen === "settings") render();
    }
    if (typeof r.text === "string" && backupData(r.text))
      return askDialog(
        T("backup.found.title"),
        T("backup.found.body"),
        T("backup.found.restore"),
        () => restoreText(r.text, null, backupOn),
        { alt: [T("backup.found.replace"), backupOn], cancel: T("common.notNow") }
      );
    askDialog(
      T("backup.badFile.title"),
      sentences(r.error ? nativeErr(r.error) : T("backup.badFile.cantRead"), T("backup.badFile.replaceQ")),
      T("backup.found.replace"),
      backupOn,
      { cancel: T("common.notNow") }
    );
  });
}
/* Answers from the shell's own threads (a slow folder can't freeze the page), each matched to its request by number,
   so two in a row never trade answers */
let shellAsks = Date.now() % 1e9; // per page: an answer to the page before a recreate never matches (fits Java's int)
const shellThen = {};
function askShell(call, then, fail) {
  const id = ++shellAsks;
  shellThen[id] = then;
  try {
    call(id);
  } catch (e) {
    fail(id);
  }
}
function shellAnswer(id, v) {
  const then = shellThen[id];
  delete shellThen[id];
  if (then) then(v);
}
/* the auto backup's file (window.tallyAutoBackup): `then` gets {text, when}, or {error}, with none: true when
   the folder holds no backup */
function readAutoBackup(then) {
  askShell(
    id => Android.readAutoBackup(id),
    then,
    id => onAutoBackup({ error: T("backup.unavailable") }, id)
  );
}
function onAutoBackup(r, id) {
  shellAnswer(id, r && typeof r === "object" ? r : {});
}
/* "Back up now": the shell writes the latest save into the auto backup's folder (window.tallyBackedUp); `then` gets
   the problem, "" when done */
function backupNow(then) {
  mirrorNow();
  snack(T("backup.running"));
  askShell(
    id => Android.backupNow(id),
    then,
    id => onBackedUp(T("backup.unavailable"), id)
  );
}
function onBackedUp(err, id) {
  if (V.screen === "settings") render();
  snack(err ? nativeErr(err) : T("backup.done"));
  shellAnswer(id, err || "");
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
   settings page; "exact": the Alarms & reminders switch; "battery": Android's battery popup; and "lang": Android's
   language setting for Tally (Settings → Region) */
function fixReminders(kind) {
  try {
    Android.openSetting(kind);
  } catch (e) {}
}
/* the first-open permissions dialog stays up when Tally was first opened from the widget (it shows once per install) */
const keepPermsUp = () => {
  if (!$("#pp-rows")) closePop();
};
/* "add:out|in|tr" from the widget's quick add, "loan:<id>[:pay]" from a reminder, "check" from the balance check,
   "backup" from a failed auto backup (window.tallyOpen) */
function openFromNative(s) {
  const [k, id, pay] = String(s || "").split(":");
  if (k === "add") {
    /* from the widget's quick add: today, on Home */
    applyNativeActions();
    keepPermsUp();
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
    keepPermsUp();
    BACKTO = null;
    closeSheet();
    if (k === "check") {
      checkAsked = today(); // the notification was tapped: the card shows even before the check time
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
  keepPermsUp();
  closeSheet();
  loanOpen(id, pay === "pay");
}
/* the app came back to the foreground (window.tallyResume) */
function onAppResume() {
  applyNativeActions();
  syncWidget();
  catchUpToday();
  syncReminders();
  onPerms(); // permissions may have changed in Android's settings
  /* the balance card appears once its time has come (or goes once confirmed) without another tap */
  if (V.screen === "home" && !$("#sheet").innerHTML && !$("#pop").innerHTML && checkDue() !== !!$("#app .check"))
    render();
  backupNudge();
}
/* a file through Android's save dialog; `then` runs once it is saved (onFileSaved) */
function saveOut(name, mime, text, then) {
  const bridged = !!(window.Android && Android.saveFile);
  AFTER_SAVE = bridged ? then || null : null;
  if (bridged) Android.saveFile(name, mime, text);
  else snack(T("data.noSaving"));
}
/* Android back / Escape: closes the top layer first (a dialog, then the keypad of the sheet on top, then that sheet),
   then a selection, then another screen goes Home. False when there is nothing left to close (then the app closes). */
function goBack() {
  if ($("#pop").innerHTML) {
    closePop();
    return true;
  }
  if (CALC) {
    const top = $("#sheet2").innerHTML ? $("#sheet2") : $("#sheet");
    if (CALC.inp && CALC.inp.isConnected) {
      if (top.contains(CALC.inp)) {
        calcClose(CALC.id, calcToggleBtn(CALC.id));
        return true;
      }
    } else {
      stopRepeat(); // its sheet closed while it was open: forget it and go on
      CALC = null;
    }
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
  if (SAVING_BACKUP && ok) {
    S.settings.savedBackup = Date.now(); // Delete all data then knows a backup exists
    save();
  }
  SAVING_BACKUP = false;
  const then = AFTER_SAVE;
  AFTER_SAVE = null;
  /* what waited on the file (Delete all data) goes on only once it landed */
  snack(T(ok ? "data.fileSaved" : then ? "data.notSavedKept" : "data.notSaved"));
  if (then && ok) then();
}
/* Auto backup is off but there's something worth keeping (3+ entries): now and then (at start or on return, at most
   once a week, never over another dialog or sheet) suggest turning it on. "Turn on" is the Settings switch. */
function backupNudge() {
  const s = S.settings,
    bs = canBackup() && s.backup.on ? backupStatus() : null,
    lost = !!bs && !bs.usable; // on, but the folder isn't reachable (moved to a new phone, reinstalled)
  if (!canBackup() || (s.backup.on && !lost) || (!lost && S.txns.length < 3)) return;
  if ($("#pop").innerHTML || $("#sheet").innerHTML || (s.backupAsk && s.backupAsk > addDays(today(), -7))) return;
  s.backupAsk = today();
  save();
  if (lost)
    askDialog(T("backup.lostAsk.title"), T("backup.lostAsk.body"), T("backup.lostAsk.ok"), pickBackupFolder, {
      cancel: T("common.notNow"),
    });
  else
    askDialog(T("backup.nudge.title"), T("backup.nudge.body"), T("backup.nudge.ok"), toggleAutoBackup, {
      cancel: T("common.notNow"),
    });
}
