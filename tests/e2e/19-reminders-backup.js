// Reminders that arrive on time, the balance check, the wheel time picker and the daily auto backup: what the page
// hands the Android shell (ReminderReceiver / BackupReceiver) and how Settings drives it.
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("19-reminders-backup");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

/* a stand-in for the shell: records every call; is24h and the reminder health come from window.__cfg */
const stub = () => {
  window.__cfg = Object.assign({ h24: true, health: { notif: true, exact: true, battery: true } }, window.__cfg0);
  window.__calls = [];
  window.__haptics = [];
  const rec = (k, v) => window.__calls.push([k, v]);
  window.Android = {
    setReminders(j) {
      window.__rem = JSON.parse(j);
    },
    requestNotifications() {
      rec("askNotif");
    },
    takeActions() {
      return "[]";
    },
    getColors() {
      return null;
    },
    setBars() {},
    saveFile(name, mime) {
      rec("save", /json/.test(mime) ? "json" : mime);
    },
    haptic(kind) {
      window.__haptics.push(kind);
    },
    is24h() {
      return window.__cfg.h24;
    },
    reminderHealth() {
      return JSON.stringify(window.__cfg.health);
    },
    openSetting(k) {
      rec("openSetting", k);
    },
    setBackup(j) {
      window.__backup = JSON.parse(j);
    },
    setBackupData(j) {
      rec("data", j);
    },
    backupStatus() {
      return JSON.stringify(window.__cfg.status || { folder: "", last: 0, error: "" });
    },
    backupNow() {
      rec("now");
      return window.__cfg.nowErr || "";
    },
    pickBackupFolder() {
      rec("pick");
    },
    readAutoBackup() {
      rec("readAuto");
      return JSON.stringify(window.__cfg.auto || { error: "No folder is chosen." });
    },
    pickRestoreFile() {
      rec("pickRestore");
    },
    /* the shell's "first time on this install" (tally_perms/intro), only when a test asks for it */
    permsIntro() {
      if (!window.__cfg.intro || localStorage.getItem("__intro")) return false;
      localStorage.setItem("__intro", "1");
      return true;
    },
  };
};

(async () => {
  const browser = await chromium.launch(launchOptions);
  const newPage = async cfg0 => {
    const ctx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 2,
      locale: "en-CA",
    });
    await ctx.addInitScript(c => (window.__cfg0 = c), cfg0 || {});
    await ctx.addInitScript(stub);
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    return page;
  };
  const errors = [];
  let page = await newPage();
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const settle = (ms = 150) => page.waitForTimeout(ms);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const calls = k => page.evaluate(k => window.__calls.filter(c => c[0] === k), k);
  const seed = async o => {
    await page.evaluate(s => localStorage.setItem("tally:v1", s), JSON.stringify(o));
    await page.reload();
    await settle();
  };
  /* turns a wheel so `v` sits in its middle copy's centre row */
  const setWheel = (id, v) =>
    page.evaluate(
      ([id, v]) => {
        const c = TP.cols.find(x => x.id === id);
        document.getElementById("tp-" + id).scrollTop = ((c.loop ? c.vals.length : 0) + c.vals.indexOf(v)) * W_ROW;
      },
      [id, v]
    );
  const selText = id => page.textContent("#tp-" + id + " .witem.sel");
  const bank = { id: "a", name: "Bank", type: "bank", currency: "CAD", opening: 1234 };
  const cash = { id: "c", name: "Cash", type: "cash", currency: "CAD", opening: 50 };
  const lend = { id: "L1", kind: "lend", person: "Rafi", account: "a", date: today(), note: "", status: "open" };
  const draw = {
    id: "t1",
    ts: Date.now(),
    date: today(),
    type: "loan",
    dir: "out",
    loan: "L1",
    principal: true,
    amount: 100,
    account: "a",
    due: today(),
  };
  const base = () => ({
    v: 6,
    settings: { cur: "CAD" },
    accounts: [bank, cash],
    txns: [draw],
    loans: [lend],
    assets: [],
  });

  await page.goto(appUrl);

  // ---- 1. what the shell is told: nudge, balance check (with balances), due days at their own time
  await seed(base());
  let rem = await page.evaluate(() => window.__rem);
  ok(
    rem.daily.on === true && rem.daily.h === 21 && rem.daily.m === 0,
    "evening nudge 21:00 " + JSON.stringify(rem.daily)
  );
  ok(
    rem.check.on === true &&
      rem.check.h === 8 &&
      rem.check.m === 0 &&
      rem.check.checked === "" &&
      /Bank .*1,134.* · Cash .*50/.test(rem.check.text),
    "balance check at 08:00 with the balances " + JSON.stringify(rem.check)
  );
  ok(rem.duesAt.h === 9 && rem.duesAt.m === 0 && rem.dues.length === 1 && rem.dues[0].id === "L1", "due days at 09:00");
  await act("check-ok");
  await settle();
  rem = await page.evaluate(() => window.__rem);
  ok(rem.check.checked === today(), "confirming the balances tells the shell (no check notification today)");
  await seed({ v: 6, settings: { cur: "CAD" }, accounts: [], txns: [], loans: [], assets: [] });
  rem = await page.evaluate(() => window.__rem);
  ok(rem.check.on === false, "no accounts: no balance check");
  const mg = await page.evaluate(() => {
    const s = migrate({
      settings: { remind: { dueTime: "25:00", checkTime: "x", check: 0 }, backup: { on: "yes", time: "7:5" } },
    });
    return [s.settings.remind, s.settings.backup];
  });
  ok(
    mg[0].dueTime === "09:00" &&
      mg[0].checkTime === "08:00" &&
      mg[0].check === true &&
      mg[1].on === false &&
      mg[1].time === "23:00",
    "migrate() normalises the new reminder and backup settings " + JSON.stringify(mg)
  );

  // ---- 2. the wheel time picker (24-hour phone)
  await seed(base());
  await act("go", "settings");
  await settle();
  await act("pick-time", "check");
  await settle(300);
  ok(
    (await page.$$("#pop .wcol")).length === 2 && (await selText("h")) === "08" && (await selText("m")) === "00",
    "24-hour: two wheels, starting at 08:00"
  );
  await page.screenshot({ path: OUT + "/wheel-light.png" });
  await page.evaluate(() => (window.__haptics = []));
  await page.click("#tp-h .witem.sel + .witem"); // the faded 09 below
  await settle(600);
  ok((await selText("h")) === "09", "tapping a faded row glides it to the middle");
  const hs = await page.evaluate(() => window.__haptics);
  ok(
    hs.includes("tick") && !hs.includes("tap"),
    "each row passed ticks; the tap itself doesn't click " + JSON.stringify(hs)
  );
  await setWheel("m", 45);
  await settle(300);
  ok((await selText("m")) === "45", "minutes in one-minute steps");
  await act("tp-ok");
  await settle();
  let S = await state();
  rem = await page.evaluate(() => window.__rem);
  ok(
    S.settings.remind.checkTime === "09:45" && rem.check.h === 9 && rem.check.m === 45,
    "OK saves 09:45 and re-arms the check"
  );
  ok(
    (await page.textContent('[data-act="pick-time"][data-v="check"]')).includes("09:45"),
    "the Settings button shows 09:45"
  );
  // wrapping: from 23 one row further is 00, and the wheel quietly recentres
  await act("pick-time", "nudge");
  await settle(300);
  await setWheel("h", 23);
  await settle(300);
  await page.evaluate(() => (document.getElementById("tp-h").scrollTop += W_ROW));
  await settle(400);
  const wrap = await page.evaluate(() => {
    const c = TP.cols[0];
    return [c.idx, c.vals.length];
  });
  ok(
    (await selText("h")) === "00" && wrap[0] >= wrap[1] && wrap[0] < 2 * wrap[1],
    "hours wrap 23 → 00 and stay in the middle copy " + JSON.stringify(wrap)
  );
  await act("pd-close");
  S = await state();
  ok(S.settings.remind.time === "21:00", "Cancel keeps the old time");
  await act("pick-time", "due");
  await settle(300);
  await setWheel("h", 7);
  await setWheel("m", 30);
  await settle(300);
  await page.keyboard.press("Escape");
  ok((await state()).settings.remind.dueTime === "09:00", "back closes the picker without saving");
  await act("pick-time", "due");
  await settle(300);
  await setWheel("h", 7);
  await setWheel("m", 30);
  await settle(300);
  await act("tp-ok");
  rem = await page.evaluate(() => window.__rem);
  ok(rem.duesAt.h === 7 && rem.duesAt.m === 30, "due-day reminders move to 07:30");

  // dark theme look
  await page.evaluate(() => {
    S.settings.theme = "dark";
    applyTheme();
  });
  await act("pick-time", "nudge");
  await settle(300);
  await page.screenshot({ path: OUT + "/wheel-dark.png" });
  const look = await page.evaluate(() => {
    const sel = getComputedStyle(document.querySelector("#tp-h .witem.sel")),
      dim = getComputedStyle(document.querySelector("#tp-h .witem:not(.sel)"));
    return [sel.fontWeight, dim.fontWeight, sel.color !== dim.color];
  });
  ok(look[0] === "600" && look[1] === "400" && look[2], "centre row bold and bright, neighbours faded " + look);
  await act("pd-close");
  await page.evaluate(() => {
    S.settings.theme = "system";
    applyTheme();
  });

  // ---- 3. notifications open the right place
  await seed(base());
  await page.evaluate(() => window.tallyOpen("check"));
  await settle();
  ok(
    (await page.evaluate(() => V.screen === "home" && V.period === "day")) && (await page.isVisible("#app .check")),
    "the balance check opens today's check on Home"
  );
  await page.evaluate(() => window.tallyOpen("loan:L1"));
  await settle();
  ok(await page.isVisible('#sheet [data-act="loan-pay"]'), "a due reminder opens that lending's page");
  await page.evaluate(() => window.tallyOpen("loan:L1:pay"));
  await settle();
  ok((await page.evaluate(() => document.activeElement.id)) === "f-amt", "Record payment opens the payment form");
  await page.evaluate(() => window.tallyOpen("loan:gone"));
  await settle();
  ok(await page.isVisible('#sheet [data-act="loan-pay"]'), "a reminder for a deleted loan changes nothing");
  await page.evaluate(() => window.tallyOpen("backup"));
  await settle();
  ok(
    (await page.evaluate(() => V.screen)) === "settings" && !(await page.evaluate(() => $("#sheet").innerHTML)),
    "a failed backup notice opens Settings"
  );

  // ---- 4. the permissions card: one row with Allow per permission Android was denied
  await page.evaluate(() => {
    window.__cfg.health = { notif: true, exact: false, battery: false };
    render();
  });
  const cardKinds = () => page.$$eval('.rhealth [data-act="rem-fix"]', b => b.map(x => x.dataset.v));
  ok(
    (await page.textContent(".rhealth")).includes("Permissions") &&
      JSON.stringify(await cardKinds()) === '["battery"]' &&
      (await page.isVisible('[data-act="rem-fix"][data-v="battery"]')),
    "card lists just the denied ones; unrestricted battery covers alarms & reminders"
  );
  ok(
    !(await page.textContent(".rhealth")).includes("Battery is fine") &&
      (await page.$$eval('.rhealth [data-act="rem-fix"]', b => b.every(x => x.textContent === "Allow"))),
    "each row has one Allow button, no 'Battery is fine'"
  );
  await page.evaluate(() => document.querySelector(".rhealth").scrollIntoView({ block: "center" }));
  await page.screenshot({ path: OUT + "/health.png" });
  await act("rem-fix", "battery");
  await page.evaluate(() => {
    window.__cfg.health = { notif: true, exact: false, battery: true };
    render();
  });
  ok(
    JSON.stringify(await cardKinds()) === '["exact"]',
    "a phone where alarms stay off with battery allowed: then the Alarms & reminders row"
  );
  await act("rem-fix", "exact");
  ok(
    JSON.stringify((await calls("openSetting")).map(c => c[1])) === '["battery","exact"]',
    "Allow opens Android's own screen or popup"
  );
  await page.evaluate(() => {
    window.__cfg.health = { notif: false, exact: true, battery: true };
    window.__calls = [];
    render();
  });
  ok(
    (await page.$$('.rhealth [data-act="rem-fix"]')).length === 1 &&
      (await page.textContent(".rhealth")).includes("Reminders can't show without them"),
    "notifications denied: just that row"
  );
  await act("rem-fix", "notif");
  ok(
    (await calls("openSetting")).pop()[1] === "notif",
    "Allow notifications goes to the shell (Android's prompt while it can, else the settings page)"
  );
  // the card follows a permission answer at once, without leaving Settings
  await page.evaluate(() => {
    window.__cfg.health.notif = true;
    window.tallyPerms();
  });
  await settle();
  ok(
    !(await page.$(".rhealth")) && (await page.evaluate(() => V.screen)) === "settings",
    "allowed: the card disappears at once"
  );
  await page.evaluate(() => {
    window.__cfg.health = { notif: true, exact: true, battery: false };
    ["daily", "check", "dues"].forEach(k => (S.settings.remind[k] = false));
    render();
  });
  ok(!(await page.$(".rhealth")), "no card while every reminder is off");
  await page.evaluate(() => {
    S.settings.backup.on = true;
    render();
  });
  ok(!!(await page.$('.rhealth [data-v="battery"]')), "the daily backup alone still shows the card");
  await page.evaluate(() => {
    S.settings.backup.on = false;
    render();
  });
  await page.evaluate(() => (window.__calls = []));
  await act("rem-daily");
  ok(
    (await calls("askNotif")).length === 1 && (await page.isVisible('[data-act="rem-fix"][data-v="battery"]')),
    "switching a reminder on asks the shell for notifications; the battery row shows on any phone"
  );
  await page.evaluate(() => {
    ["daily", "check", "dues"].forEach(k => (S.settings.remind[k] = true));
    window.__cfg.health = { notif: true, exact: true, battery: true };
    render();
  });
  ok(!(await page.$(".rhealth")), "no card when all is well");

  // ---- 5. daily auto backup
  await page.evaluate(() => (window.__calls = []));
  await act("bk-auto");
  await settle();
  ok(
    (await calls("pick")).length === 1 && !(await state()).settings.backup.on,
    "turning it on the first time asks for a folder"
  );
  await page.evaluate(() => window.tallyFolder(null));
  ok(!(await state()).settings.backup.on, "cancelled: stays off");
  await page.evaluate(() => {
    window.__cfg.status = { folder: "Documents/Tally", usable: true, last: 0, error: "" };
    window.__calls = [];
    window.tallyFolder("");
  });
  await settle();
  S = await state();
  let bk = await page.evaluate(() => window.__backup);
  ok(S.settings.backup.on && bk.on && bk.h === 23 && bk.m === 0, "folder picked: on, daily at 23:00");
  ok(
    (await calls("now")).length === 0 && (await page.textContent("#snack")).includes("Auto backup on · daily at 23:00"),
    "no backup right away: it's scheduled"
  );
  ok((await page.textContent("#bk")).includes("First backup at 23:00"), "Settings says when the first backup comes");
  await settle(1000);
  ok((await calls("data")).length === 1, "the data is handed to the shell once, after the tap");
  await page.evaluate(() => {
    window.__cfg.status.last = Date.now();
    render();
  });
  const bkText = await page.textContent("#bk");
  ok(
    bkText.includes("Documents/Tally") && bkText.includes("Last backup: Today") && bkText.includes("Tally backup.json"),
    "shows the file, its folder and the last backup: " + bkText
  );
  await page.evaluate(() => document.getElementById("bk").scrollIntoView({ block: "center" }));
  await page.screenshot({ path: OUT + "/backup.png" });
  await page.evaluate(() => (window.__calls = []));
  await page.evaluate(() => {
    S.accounts[1].name = "Wallet cash";
    save();
    save();
    save();
  });
  await settle(1200);
  const mirrored = await calls("data");
  ok(
    mirrored.length === 1 && JSON.parse(mirrored[0][1]).accounts[1].name === "Wallet cash",
    "saves are mirrored to the shell once, debounced (" + mirrored.length + ")"
  );
  await act("pick-time", "backup");
  await settle(300);
  await setWheel("h", 22);
  await setWheel("m", 15);
  await settle(300);
  await act("tp-ok");
  bk = await page.evaluate(() => window.__backup);
  ok(bk.on && bk.h === 22 && bk.m === 15, "backup time 22:15 re-arms it");
  await act("bk-now");
  ok((await page.textContent("#snack")).includes("Backed up") && (await calls("now")).length === 1, "Back up now");
  await page.evaluate(() => (window.__cfg.nowErr = "The backup folder can't be found."));
  await act("bk-now");
  ok((await page.textContent("#snack")).includes("can't be found"), "a failed backup says why");
  await page.evaluate(() => {
    window.__cfg.status = { folder: "Documents/Tally", last: 0, error: "The backup folder can't be found." };
    render();
  });
  ok(
    (await page.$("#bk .s.err")) && (await page.textContent("#bk")).includes("can't be found"),
    "Settings shows the problem"
  );
  await act("bk-folder");
  ok((await calls("pick")).length === 1, "Change picks another folder");
  // Delete all data keeps reminders and auto backup
  await page.evaluate(() => {
    S.settings.remind.dueTime = "07:30";
    save();
  });
  await act("wipe");
  await settle();
  ok(
    (await page.textContent("#pop")).includes("No backup yet"),
    "the auto backup never wrote: a backup is offered first"
  );
  await act("ask-alt"); // No
  await settle();
  await act("ask-ok");
  await settle();
  S = await state();
  ok(
    S.accounts.length === 0 &&
      S.settings.backup.on &&
      S.settings.backup.time === "22:15" &&
      S.settings.remind.dueTime === "07:30",
    "Delete all data keeps the reminder and backup settings"
  );
  await act("bk-auto");
  await settle();
  bk = await page.evaluate(() => window.__backup);
  ok(!bk.on && !(await state()).settings.backup.on, "switched off: the shell cancels it");
  await page.evaluate(() => {
    window.__calls = [];
    save();
  });
  await settle(1200);
  ok((await calls("data")).length === 0, "off: nothing is mirrored");
  // back on: the remembered folder is reused (no new pick), and it's only scheduled
  await page.evaluate(() => {
    window.__cfg.status = { folder: "Documents/Tally", usable: true, last: Date.now(), error: "" };
    window.__cfg.nowErr = "";
    window.__calls = [];
  });
  await act("bk-auto");
  await settle(1000);
  bk = await page.evaluate(() => window.__backup);
  ok(
    (await calls("pick")).length === 0 &&
      (await calls("now")).length === 0 &&
      (await calls("data")).length === 1 &&
      bk.on &&
      (await state()).settings.backup.on,
    "switched back on: same folder, no picker, no immediate backup, data handed over"
  );
  ok((await page.textContent("#bk")).includes("Documents/Tally"), "and it shows that folder");
  // the folder's permission is gone (e.g. revoked): then it asks again
  await act("bk-auto");
  await page.evaluate(() => {
    window.__cfg.status = { folder: "Documents/Tally", usable: false, last: 0, error: "" };
    window.__calls = [];
  });
  await act("bk-auto");
  await settle();
  ok(
    (await calls("pick")).length === 1 && !(await state()).settings.backup.on,
    "no access to the old folder any more: asks for one"
  );
  await page.evaluate(() => {
    delete window.Android.pickBackupFolder;
    render();
  });
  ok(!(await page.$("#bk")), "no Auto backup without the shell (a browser)");

  // ---- 6. a 12-hour phone
  page = await newPage({ h24: false });
  await page.goto(appUrl);
  await seed(base());
  await act("go", "settings");
  await settle();
  ok(/9:00 a\.m\.|9:00 AM/i.test(await page.textContent('[data-act="pick-time"][data-v="due"]')), "12-hour labels");
  await act("pick-time", "check");
  await settle(300);
  ok((await page.$$("#pop .wcol")).length === 3 && (await selText("ap")) === "AM", "12-hour: an AM/PM wheel");
  await page.screenshot({ path: OUT + "/wheel-12h.png" });
  await setWheel("h", 7);
  await setWheel("m", 45);
  await setWheel("ap", "PM");
  await settle(300);
  await act("tp-ok");
  S = await state();
  ok(S.settings.remind.checkTime === "19:45", "7:45 PM saves as 19:45");
  await act("pick-time", "check");
  await settle(300);
  await setWheel("h", 12);
  await setWheel("ap", "AM");
  await settle(300);
  await act("tp-ok");
  ok((await state()).settings.remind.checkTime === "00:45", "12:45 AM saves as 00:45");

  // ---- 7. Restore reads the file through the shell; with auto backup on, its file comes first
  page = await newPage();
  await page.goto(appUrl);
  const full = base();
  full.accounts[0].name = "Restored bank";
  await seed(Object.assign(base(), { settings: { cur: "CAD", backup: { on: true, time: "23:00" } } }));
  await page.evaluate(
    t => (window.__cfg.auto = { text: t, when: Date.now(), folder: "Documents/Tally" }),
    JSON.stringify(full)
  );
  await act("go", "settings");
  await settle();
  ok(
    !(await page.$('[data-act="backup"]')) && (await page.$('[data-act="bk-now"]')),
    "auto backup on: Back up now, no separate Save backup"
  );
  ok(
    (await page.textContent("#app")).includes("with a daily copy in your backup folder"),
    "the intro says there's a daily copy"
  );
  // Delete all data, then restore from the auto backup file
  await page.evaluate(() => (window.__cfg.status = { folder: "Documents/Tally", usable: true, last: Date.now() }));
  await page.evaluate(() => (window.__calls = []));
  await act("wipe");
  await settle();
  ok(
    (await page.textContent("#pop")).includes("may not have your latest entries"),
    "a backup exists: still offered first, since it may miss the latest entries"
  );
  await act("ask-ok"); // OK: auto backup is on, so it backs up into its folder now
  await settle();
  ok(
    (await calls("now")).length === 1 && (await page.textContent("#pop")).includes("Delete all data?"),
    "OK with auto backup on: Back up now, then the final Yes / No"
  );
  await act("ask-ok");
  await settle();
  await act("restore");
  await settle();
  const dlg = await page.textContent("#pop");
  ok(
    dlg.includes("Restore Tally backup.json?") &&
      dlg.includes("2 accounts and 1 entries") &&
      dlg.includes("saved Today") &&
      dlg.includes("Choose another file"),
    "Restore offers the auto backup with its counts and date: " + dlg
  );
  await act("ask-ok");
  await settle();
  S = await state();
  ok(
    S.accounts.length === 2 && S.accounts[0].name === "Restored bank" && S.loans.length === 1,
    "after Delete all data the auto backup brings everything back"
  );
  ok(S.settings.backup.on === true, "restoring keeps this phone's auto backup on (the file's own settings had it off)");
  await act("restore");
  await settle();
  await act("ask-alt");
  ok((await calls("pickRestore")).length === 1, "Choose another file opens the file picker");
  // the picked file's text comes back from the shell
  const other = base();
  other.accounts = [bank];
  await page.evaluate(t => window.tallyRestore(t, null), JSON.stringify(other));
  await settle();
  ok((await page.textContent("#pop")).includes("Restore this backup?"), "a picked file asks first");
  await act("ask-ok");
  await settle();
  ok((await state()).accounts.length === 1, "and restores it");
  await page.evaluate(() => window.tallyRestore(null, null));
  await settle();
  ok(!(await page.evaluate(() => $("#pop").innerHTML)), "cancelled picker: nothing happens");
  await page.evaluate(() => window.tallyRestore(null, "Couldn't read that file"));
  ok((await page.textContent("#snack")).includes("Couldn't read that file"), "an unreadable file says so");
  await page.evaluate(() => window.tallyRestore('{"hello":1}', null));
  ok((await page.textContent("#snack")).includes("isn't a Tally backup"), "a file that isn't a backup says so");
  // auto backup file missing: straight to the picker
  await page.evaluate(() => {
    window.__cfg.auto = { error: "There's no file" };
    window.__calls = [];
  });
  await act("restore");
  await settle();
  ok(
    (await calls("pickRestore")).length === 1 && !(await page.evaluate(() => $("#pop").innerHTML)),
    "no auto backup file: the picker opens directly"
  );
  // auto backup off: Save backup is back, and Restore goes straight to the picker
  await page.evaluate(() => {
    S.settings.backup.on = false;
    window.__calls = [];
    render();
  });
  ok(await page.$('[data-act="backup"]'), "auto backup off: Save backup shows");
  await act("restore");
  ok(
    (await calls("pickRestore")).length === 1 && (await calls("readAuto")).length === 0,
    "auto backup off: Restore opens the picker"
  );

  // ---- 8. first open: one Permissions dialog, each permission with its own Allow, then Done
  page = await newPage({ intro: true, health: { notif: false, exact: false, battery: false } });
  await page.goto(appUrl);
  await settle();
  const ppRows = () =>
    page.$$eval("#pp-rows .setrow", rs =>
      rs.map(r => r.querySelector("div").textContent + ":" + (r.querySelector("button") ? "Allow" : "Allowed"))
    );
  ok(
    JSON.stringify(await ppRows()) === '["Notifications:Allow","Unrestricted battery:Allow"]' &&
      (await page.isVisible('#pop [data-act="pd-close"]')),
    "first open: notifications and unrestricted battery (which covers alarms & reminders), each with Allow, and Done"
  );
  ok(
    (await page.evaluate(() => window.__rem.daily.on)) === false,
    "no evening nudge before there's an account to write in"
  );
  ok(
    (await calls("askNotif")).length === 0 && (await calls("openSetting")).length === 0,
    "nothing is asked until a row's Allow is tapped"
  );
  await page.screenshot({ path: OUT + "/perms-dialog.png" });
  await act("rem-fix", "battery");
  ok(JSON.stringify((await calls("openSetting")).map(c => c[1])) === '["battery"]', "Allow opens just that one");
  await page.evaluate(() => {
    Object.assign(window.__cfg.health, { battery: true, exact: true }); // Android: allowlisted → exact alarms allowed
    window.tallyPerms();
  });
  await settle();
  ok(
    JSON.stringify(await ppRows()) === '["Notifications:Allow","Unrestricted battery:Allowed"]' &&
      (await calls("openSetting")).length === 1,
    "allowed: its row turns to Allowed at once, the dialog stays, nothing else opens"
  );
  await act("pd-close");
  ok(!(await page.evaluate(() => $("#pop").innerHTML)), "Done closes it");
  await page.reload();
  await settle();
  ok(!(await page.evaluate(() => $("#pop").innerHTML)), "only once per install");
  // Settings: what's still denied waits there
  await page.evaluate(() => {
    Object.assign(window.__cfg.health, { battery: true, exact: true }); // the stub forgets on reload; the phone wouldn't
    V.screen = "settings";
    render();
  });
  ok(
    JSON.stringify(await page.$$eval('.rhealth [data-act="rem-fix"]', b => b.map(x => x.dataset.v))) === '["notif"]',
    "the one left denied is in Settings → Reminders"
  );
  // everything already allowed: no dialog at all
  page = await newPage({ intro: true });
  await page.goto(appUrl);
  await settle();
  ok(!(await page.evaluate(() => $("#pop").innerHTML)), "all allowed: no dialog");
  // unreadable saved data: that dialog comes first
  page = await newPage({ intro: true, health: { notif: false, exact: false, battery: false } });
  await page.goto(appUrl);
  await page.evaluate(() => {
    localStorage.removeItem("__intro");
    localStorage.setItem("tally:v1", "{broken");
  });
  await page.reload();
  await settle();
  ok(
    !(await page.$("#pp-rows")) && (await page.textContent("#pop")).includes("Couldn't open your saved data"),
    "unreadable data: its dialog, not the permissions one"
  );
  page = await newPage({ health: { notif: false, exact: false, battery: false } });
  await page.goto(appUrl);
  await settle();
  // ---- 9. no backup yet: Delete all data offers one first; auto backup is suggested once a week
  page = await newPage();
  await page.goto(appUrl);
  const three = Object.assign(base(), {
    txns: [
      draw,
      ...[1, 2].map(i => ({
        id: "e" + i,
        ts: i,
        date: today(),
        type: "expense",
        amount: 5,
        account: "c",
        cat: "food",
      })),
    ],
  });
  await seed(three);
  ok(
    (await page.textContent("#pop")).includes("Keep your data safe?") &&
      (await page.evaluate(() => S.settings.backupAsk)) === today(),
    "3 entries and auto backup off: the daily backup is suggested"
  );
  await act("ask-ok"); // Turn on
  ok((await calls("pick")).length === 1, "Turn on opens the folder picker");
  await page.reload();
  await settle();
  ok(!(await page.evaluate(() => $("#pop").innerHTML)), "not again the same week");
  await page.evaluate(() => {
    S.settings.backupAsk = addDays(today(), -8);
    save();
    window.tallyResume();
  });
  ok((await page.textContent("#pop")).includes("Keep your data safe?"), "a week later: again (on return, too)");
  await act("pd-close");
  await seed(Object.assign(three, { settings: { cur: "CAD", backup: { on: true, time: "23:00" } } }));
  ok(!(await page.evaluate(() => $("#pop").innerHTML)), "auto backup on: never suggested");
  await seed(base());
  ok(!(await page.evaluate(() => $("#pop").innerHTML)), "fewer than 3 entries: not yet");
  // Delete all data with no backup: OK saves one first, then the final Yes / No
  await act("go", "settings");
  await settle();
  await act("wipe");
  await settle();
  ok(
    (await page.textContent("#pop")).includes("Save a backup of your data before deleting it?"),
    "no backup: the first question"
  );
  await act("ask-ok"); // OK
  await settle();
  ok((await calls("save")).length === 1 && (await calls("save"))[0][1] === "json", "OK saves a backup file");
  await page.evaluate(() => window.tallySaved(true));
  await settle();
  ok(
    (await page.textContent("#pop")).includes("Delete all data?") &&
      (await page.evaluate(() => S.settings.savedBackup > 0)),
    "saved: remembered, then the final Yes / No"
  );
  await act("pd-close"); // No
  await settle();
  ok((await state()).accounts.length === 2, "No: nothing deleted");
  await act("wipe");
  await settle();
  ok(
    (await page.textContent("#pop")).includes("Back up first?"),
    "a backup was saved here: the backup offer still comes first"
  );
  await act("ask-alt"); // No
  await settle();
  ok((await page.textContent("#pop")).includes("Delete all data?"), "No: then the final Yes / No");
  await act("pd-close");

  // old page-side flags from an earlier version are dropped
  await seed(
    Object.assign(base(), {
      settings: { cur: "CAD", notifAsked: true, exactAsked: true, batteryAsked: true, batteryOk: true },
    })
  );
  const live = await page.evaluate(() => S.settings);
  ok(
    ["notifAsked", "exactAsked", "batteryAsked", "batteryOk"].every(k => !(k in live)) &&
      (await calls("askNotif")).length === 0,
    "migrate drops the old permission flags"
  );
  // going to the background hands over data a save left waiting, and only then
  await page.evaluate(() => {
    S.settings.backup.on = true;
    save();
    window.__calls = [];
    S.accounts[0].name = "Paused bank";
    save();
    window.tallyPause();
  });
  ok((await calls("data")).length === 1, "tallyPause hands over the waiting data at once");
  ok(
    (await calls("data"))[0][1] === (await page.evaluate(() => localStorage.getItem("tally:v1"))),
    "the backup gets exactly the text that was saved"
  );
  await page.evaluate(() => window.tallyPause());
  await settle(1000);
  ok((await calls("data")).length === 1, "and nothing more when nothing is waiting");

  ok(errors.length === 0, "no page errors: " + JSON.stringify(errors));
  await browser.close();
  if (fails) {
    console.log(fails + " FAILED");
    process.exit(1);
  }
})();
