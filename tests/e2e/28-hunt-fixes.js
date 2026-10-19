// Fixes from a pressure test of 1.3.2, one section each, every check failing before its fix:
//  A. Enter saves only the layer it was typed in (it used to record a payment on the loan sheet underneath)
//  B. the message bar's Undo can't be hit through a later sheet, and Undo never leaves a stale sheet open
//  C. data safety: a failed save is said in a dialog; amounts the app works out survive a restart; Delete all data
//     stops when its backup didn't save; Restore says what it really restores and can be undone; deleting an asset
//     can be undone; a +1 day from a reminder survives an Undo
//  D. amounts: text inserted at once (clipboard chip, voice) and pasted text read alike, 3 decimals and "0,250"
//     kept, other scripts' digits and commas, currency signs dropped; rounding as shown ($1.005 → $1.01, no "−$0.00")
//  E. a loan whose leftover shows as nothing is cleared
//  F. dates: Gregorian months on a Persian-calendar phone; at midnight Home, History and an open form move on
//  G. saved data: an unreadable start leaves the shell's auto backup alone and the kept copy stays offered; odd
//     backups load the same every time (dates, duplicate ids, names that aren't text); CSV formula guard
//  H. loans: no payment before its loan (and none shown "Cleared" while money is owed), the merge hint says what will
//     be owed, a due day moves every draw due by then, notes on added draws show, a name typed out in full adds to
//     its open tab, a written-off lending shows what was let go, +1 day counts from the day it was tapped
//  I. the shell: a picked folder holding a backup asks first, an unreachable folder is said, the first-open
//     permissions stay up when opened from the widget, the evening nudge never counts a future day, a fee sits above
//     its transfer
//  J. screens: long account names keep their words on the balance check (its balance and Fix together on the right,
//     beside a name that fits), in Settings and in chips; every account
//     archived isn't a new notebook; focus stays on the control after a redraw; screen readers hear values (donut
//     totals, ring %, currency, dialog text, chart bars pressed); the ring redraws on a theme switch; a one-day range
//     says Yesterday; chart labels follow the phone; the currency switch stays with "No stats"
//  K. loan amounts compared as shown, the loan form's currency, "Track as a fee" names the whole fee, no account in a
//     loan's currency is said, signs placed one way in every History row
//  L. screens on small, short and right-to-left setups: amounts never cut; right-to-left names keep the app's sentences
//     in order; long names end in "…" in chips and wrap in sheet titles; the add-colour ring; a 48px currency switch;
//     the pickers fit a short window and scroll by swipe; the range band joins up; short weekday names where long ones
//     don't fit; focus rings drawn whole; "Partly paid" ends in "…"; "cash‑out" doesn't break
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
outDir("28-hunt-fixes");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    locale: "en-US",
  });
  await ctx.addInitScript(() => {
    window.__shell = [];
    window.Android = {
      setWidget() {},
      setReminders() {},
      takeActions() {
        const a = JSON.stringify(window.__actions || []);
        window.__actions = [];
        return a;
      },
      saveFile(name) {
        window.__shell.push(["saveFile", name]);
      },
      getColors() {
        return null;
      },
      setBars() {},
      requestNotifications() {},
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  const settle = (ms = 150) => page.waitForTimeout(ms);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const t = await page.evaluate(() => today());
  const d5 = await page.evaluate(() => addDays(today(), -5));
  /* a fresh notebook: USD, a bank of 1000, plus whatever the section needs */
  const seed = async (extra = {}) => {
    await page.evaluate(
      ([t, extra]) => {
        localStorage.clear();
        const o = Object.assign(
          {
            v: 6,
            settings: { cur: "USD", clock: "24", lastCheck: t, dragTip: true },
            accounts: [{ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1000 }],
            txns: [],
            loans: [],
            assets: [],
          },
          extra
        );
        localStorage.setItem("tally:v1", JSON.stringify(o));
      },
      [t, extra]
    );
    await page.reload();
    await settle();
  };

  // ---- A. Enter in the second sheet saves that sheet
  await seed({
    txns: [
      {
        id: "d",
        ts: 1,
        date: d5,
        type: "loan",
        amount: 100,
        account: "a",
        note: "",
        dir: "out",
        loan: "L",
        principal: true,
      },
      { id: "p1", ts: 2, date: t, type: "loan", amount: 20, account: "a", note: "", dir: "in", loan: "L" },
    ],
    loans: [{ id: "L", kind: "lend", person: "Ann", account: "a", date: d5, status: "open" }],
  });
  await page.evaluate(() => {
    loanOpen("L");
    loanDrawEdit("p1");
  });
  await settle();
  await page.fill("#ed-amt", "30");
  await page.press("#ed-amt", "Enter");
  await settle();
  let S = await state();
  const pays = S.txns.filter(x => x.loan === "L" && !x.principal).map(x => [x.id, x.amount]);
  ok(
    JSON.stringify(pays) === '[["p1",30]]',
    "Enter in Edit payment saves the edit, records nothing new " + JSON.stringify(pays)
  );
  await page.evaluate(() => {
    closeSheet();
    catForm("food");
    iconPicker("restaurant", "#c98500", () => {});
  });
  await settle();
  await page.fill("#ic-q", "coffee");
  await page.press("#ic-q", "Enter");
  await settle();
  ok(
    (await page.evaluate(() => !!$("#sheet").innerHTML && !!$("#sheet2").innerHTML)) &&
      (await state()).cats.find(c => c.id === "food").i === "restaurant",
    "Enter in the emblem search saves nothing underneath"
  );
  await page.evaluate(() => closeSheet());

  // ---- B. Undo and later layers
  await seed();
  await page.evaluate(() => txSheet(null, "expense", "food"));
  await settle();
  await page.fill("#f-amt", "12");
  await page.click('#sheet [data-act="tx-save"]');
  await settle();
  ok(await page.isVisible('#snack [data-act="undo"]'), "saving shows Undo");
  await settle(400);
  await page.evaluate(() => txSheet(null, "expense", "food"));
  await settle();
  ok(
    !(await page.$('#snack [data-act="undo"]')) && (await page.evaluate(() => !undoFn)),
    "a sheet opened afterwards takes the Undo away, so a tap on the sheet can't undo the save"
  );
  await page.evaluate(() => closeSheet());
  /* editing from the entries list: the list comes back with the Undo; Undo closes it before undoing */
  const e1 = (await state()).txns[0].id;
  await page.evaluate(() => entriesSheet());
  await settle();
  await page.click(`#sheet [data-v="${e1}"]`);
  await settle();
  await page.fill("#f-amt", "13");
  await page.click('#sheet [data-act="tx-save"]');
  await settle(300);
  ok(
    !!(await page.$("#sheet #ent-list")) && (await page.isVisible('#snack [data-act="undo"]')),
    "back on the entries list, Undo still there"
  );
  await page.click('#snack [data-act="undo"]');
  await settle(300);
  ok(
    (await page.evaluate(() => !$("#sheet").innerHTML)) && (await state()).txns[0].amount === 12,
    "Undo closes the list first, then restores 12"
  );
  ok(
    await page.evaluate(() => {
      txSheet("gone");
      return !$("#sheet").innerHTML && $("#snack").textContent.includes("deleted");
    }),
    "an entry that's gone doesn't open as an empty form"
  );

  // ---- C. data safety
  await seed({ txns: [{ id: "e1", ts: 1, date: t, type: "expense", amount: 5, account: "a", cat: "food", note: "" }] });
  await page.evaluate(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "tally:v1") throw new Error("QuotaExceededError");
      return real.call(this, k, v);
    };
    window.__realSet = real;
    txSheet(null, "expense", "food");
  });
  await settle();
  await page.fill("#f-amt", "12");
  await page.click('#sheet [data-act="tx-save"]');
  await settle(300);
  ok(
    (await page.textContent("#pop")).includes("Couldn't save on this phone") &&
      (await page.isVisible('#pop [data-act="ask-ok"]')),
    "a save that fails says so in a dialog (with Save backup), not under the change's own message"
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__realSet;
    closePop();
  });
  ok(
    await page.evaluate(() => {
      const m = migrate({
        v: 6,
        settings: { cur: "USD" },
        accounts: [{ id: "a", name: "Bank", type: "bank", currency: "USD", opening: -9e11 }],
        txns: [{ id: "f", ts: 1, date: today(), type: "adjust", amount: 1.4e12, account: "a", note: "" }],
      });
      return m.txns.length === 1 && m.txns[0].amount === 1.4e12;
    }),
    "a balance fix the app worked out past a trillion survives the next start"
  );
  await seed({ txns: [{ id: "e1", ts: 1, date: t, type: "expense", amount: 5, account: "a", cat: "food", note: "" }] });
  await page.evaluate(() => wipeAll());
  await settle();
  await page.click('#pop [data-act="ask-ok"]'); // Save backup
  await settle();
  await page.evaluate(() => window.tallySaved(false));
  await settle();
  ok(
    !(await page.textContent("#pop")).includes("Delete all data?") &&
      (await page.textContent("#snack")).includes("nothing was deleted") &&
      (await state()).txns.length === 1,
    "Delete all data stops when its backup didn't save: " + (await page.textContent("#snack"))
  );
  await page.evaluate(b => restoreText(JSON.stringify(b)), {
    v: 7,
    settings: { cur: "USD" },
    accounts: [
      { id: "x", name: "Cash", type: "cash", currency: "USD", opening: 10 },
      { id: "y", name: "Card", type: "card", currency: "USD", opening: 0 },
    ],
    txns: [
      { id: "1", ts: 1, date: t, type: "expense", amount: 1, account: "x", cat: "food", note: "" },
      { id: "2", ts: 2, date: t, type: "split", amount: 1, account: "x", note: "" },
      { id: "3", ts: 3, date: t, type: "expense", amount: 2, account: "y", cat: "food", note: "" },
    ],
  });
  await settle();
  const rtext = await page.textContent("#pop");
  ok(
    /2 accounts and 2 entries/.test(rtext) && /1 item .*left out/.test(rtext) && /newer version/.test(rtext),
    "Restore says what it will really restore: " + rtext.replace(/\s+/g, " ")
  );
  await page.click('#pop [data-act="ask-ok"]');
  await settle();
  ok((await state()).accounts.length === 2, "restored");
  await page.click('#snack [data-act="undo"]');
  await settle();
  S = await state();
  ok(S.accounts.length === 1 && S.txns.length === 1 && S.txns[0].id === "e1", "and Undo brings back what was here");
  await seed({ assets: [{ id: "g", name: "Gold", value: 500, currency: "USD", date: t }] });
  await page.evaluate(() => {
    F = { kind: "assetf", id: "g" };
    deleteAsset();
  });
  await settle();
  await page.click('#snack [data-act="undo"]');
  await settle();
  ok(
    (await state()).assets.some(x => x.id === "g"),
    "deleting an asset can be undone"
  );
  await seed({
    txns: [
      { id: "e1", ts: 1, date: t, type: "expense", amount: 5, account: "a", cat: "food", note: "" },
      {
        id: "d",
        ts: 2,
        date: d5,
        type: "loan",
        amount: 100,
        account: "a",
        note: "",
        dir: "out",
        loan: "L",
        principal: true,
        due: d5,
      },
    ],
    loans: [{ id: "L", kind: "lend", person: "Ann", account: "a", date: d5, status: "open" }],
  });
  await page.evaluate(() => {
    window.__actions = [{ type: "extend", id: "L", days: 7 }];
    withUndo("Deleted", () => {
      S.txns = S.txns.filter(x => x.id !== "e1");
    });
  });
  await settle();
  const due1 = (await state()).txns.find(x => x.id === "d").due;
  await page.click('#snack [data-act="undo"]');
  await settle();
  S = await state();
  ok(
    due1 !== d5 && S.txns.find(x => x.id === "d").due === due1 && S.txns.some(x => x.id === "e1"),
    "a +1 week from a reminder stays through an Undo of something else " + [d5, due1]
  );

  // ---- D. amounts
  await seed();
  await page.evaluate(() => txSheet(null, "expense", "food"));
  await settle();
  const typed = async (how, text) => {
    await page.fill("#f-amt", "");
    if (how === "paste")
      await page.evaluate(x => {
        const el = $("#f-amt");
        el.value = x;
        el.dispatchEvent(new InputEvent("input", { inputType: "insertFromPaste", bubbles: true }));
      }, text);
    else if (how === "insert") {
      await page.focus("#f-amt");
      await page.keyboard.insertText(text);
    } else await page.type("#f-amt", text);
    return page.evaluate(() => evalAmt($("#f-amt").value));
  };
  ok((await typed("insert", "12,50")) === 12.5, "text inserted at once reads like a paste: 12,50 → 12.5");
  ok((await typed("paste", "1,234.567")) === 1234.567, "pasted 1,234.567 keeps its 3 decimals");
  ok((await typed("paste", "0,250")) === 0.25, "pasted 0,250 is 0.250");
  ok((await typed("paste", "$12.50")) === 12.5, "pasted $12.50: the sign goes");
  ok((await typed("type", "12،5")) === 12.5, "the Arabic comma key is a decimal point");
  ok((await typed("type", "１２３")) === 123, "full-width digits are digits");
  await page.evaluate(() => closeSheet());
  ok(
    await page.evaluate(
      () =>
        money(1.005, "USD") === "$1.01" &&
        money(-0.125, "USD") === "-$0.13" &&
        signed(-0.004, "USD") === "$0.00" &&
        signed(-5, "USD") === "−\u2060$5.00"
    ),
    "money rounds as shown: $1.005 is $1.01, −0.125 is −$0.13, and −0.004 has no sign"
  );
  await seed({
    accounts: [{ id: "a", name: "Wallet", type: "cash", currency: "JPY", opening: 666.667 }],
    settings: { cur: "JPY", clock: "24", lastCheck: t, dragTip: true },
  });
  await page.evaluate(() => accOpen("a"));
  await settle();
  await page.type("#f-actual", "667");
  ok((await page.textContent("#fix-prev")).includes("Already matches"), "¥666.667 shown as ¥667: typing 667 matches");

  // ---- E. a leftover that shows as nothing
  await seed({
    txns: [
      {
        id: "d",
        ts: 1,
        date: d5,
        type: "loan",
        amount: 33.333,
        account: "a",
        note: "",
        dir: "out",
        loan: "L",
        principal: true,
      },
      { id: "p", ts: 2, date: t, type: "loan", amount: 33.33, account: "a", note: "", dir: "in", loan: "L" },
    ],
    loans: [{ id: "L", kind: "lend", person: "Ann", account: "a", date: d5, status: "open" }],
  });
  ok(
    await page.evaluate(() => loanInfo(loan("L")).st === "cleared" && loanInfo(loan("L")).left === 0),
    "paying the $33.33 shown of $33.333 clears the lending"
  );

  // ---- F. dates
  const fa = await browser.newContext({ locale: "fa-IR" });
  await fa.addInitScript(() => {
    window.Android = { setReminders() {}, takeActions: () => "[]", getColors: () => null, setBars() {} };
  });
  const pf = await fa.newPage();
  await pf.goto(appUrl);
  const months = await pf.evaluate(() => [
    monthLabel("2026-06"),
    new Intl.DateTimeFormat("fa-IR-u-ca-gregory", { month: "long" }).format(new Date(2026, 5, 15)),
  ]);
  ok(
    months[0].includes(months[1]) && !/خرداد/.test(months[0]),
    "a Persian-calendar phone names June as June " + months
  );
  await fa.close();
  await seed();
  await page.evaluate(() => txSheet(null, "expense", "food"));
  await settle();
  const mid = await page.evaluate(() => {
    const R = Date,
      day = 864e5;
    window.Date = class extends R {
      constructor(...a) {
        if (a.length) super(...a);
        else super(R.now() + day);
      }
      static now() {
        return R.now() + day;
      }
    };
    catchUpToday();
    const f = $("#f-date");
    return { t: today(), v: f.dataset.v, max: f.dataset.max, anchor: V.anchor, entry: entryDate() };
  });
  ok(
    mid.v === mid.t && mid.max === mid.t && mid.anchor === mid.t && mid.entry === mid.t,
    "past midnight: Home and the open form's untouched date move to the new day " + JSON.stringify(mid)
  );
  await page.evaluate(() => closeSheet());
  await settle();
  ok((await page.textContent("#app")).includes("Today"), "and Home redraws on today once the form closes");

  // ---- G. saved data
  const shellPage = async () => {
    const c = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
    await c.addInitScript(() => {
      const cfg = () => JSON.parse(sessionStorage.getItem("cfg") || "{}");
      window.__calls = [];
      const rec = (k, v) => window.__calls.push([k, v]);
      window.Android = {
        setWidget() {},
        setReminders(j) {
          window.__rem = JSON.parse(j);
        },
        takeActions: () => "[]",
        getColors: () => null,
        setBars() {},
        setBackup(j) {
          rec("setBackup", j);
        },
        setBackupData() {
          rec("mirror");
        },
        pickBackupFolder() {
          rec("pick");
        },
        backupStatus: () =>
          JSON.stringify(cfg().status || { folder: "Documents/Tally", usable: true, last: 0, error: "" }),
        readAutoBackup: id => setTimeout(() => window.tallyAutoBackup(cfg().auto || { none: true, error: "none" }, id)),
        backupNow(id) {
          rec("now", id); // the test answers it: tallyBackedUp(err, id)
        },
        pickRestoreFile() {
          rec("pickRestore");
        },
        saveFile(name) {
          rec("saveFile", name);
        },
      };
    });
    const p = await c.newPage();
    p.on("pageerror", e => errors.push(e.message));
    await p.goto(appUrl);
    return [c, p];
  };
  let [bc, bp] = await shellPage();
  await bp.evaluate(() => {
    localStorage.setItem("tally:v1", '{"v":6,"accounts":[{"id":"a"'); // cut short: can't be read
  });
  await bp.reload();
  await bp.waitForTimeout(200);
  ok(
    (await bp.evaluate(() => window.__calls.filter(c => c[0] === "setBackup").length)) === 0,
    "an unreadable start doesn't tell the shell auto backup is off (which would drop its copy)"
  );
  await bp.evaluate(() => closePop());
  await bp.evaluate(() => {
    V.screen = "settings";
    render();
  });
  ok(
    (await bp.isVisible('[data-act="kept-save"]')) && (await bp.isVisible('[data-act="kept-del"]')),
    "Settings offers the kept copy: save it, or delete it"
  );
  await bp.click('[data-act="kept-del"]');
  await bp.click('#pop [data-act="ask-ok"]');
  ok(!(await bp.evaluate(() => keptKeys().length)) && !(await bp.$('[data-act="kept-save"]')), "and deleting it does");
  ok(
    await page.evaluate(() => {
      const raw = {
        v: 6,
        settings: { cur: "USD" },
        types: [{ id: "tx", name: {}, i: "", c: "#123456" }],
        accounts: [
          { id: "w", name: "Wallet", type: "tx", currency: "USD", opening: 10 },
          { id: "w", name: "Bank", type: "bank", currency: "USD", opening: 20 },
        ],
        txns: [
          { id: "a", ts: 1, date: "0999-06-01", type: "expense", amount: 1, account: "w", cat: "food", note: "" },
          { id: "b", ts: 2, date: "2026-02-30", type: "expense", amount: 2, account: "w", cat: "food", note: "" },
          { id: "b", ts: 3, date: "2026-03-02", type: "expense", amount: 3, account: "w", cat: "food", note: "" },
        ],
      };
      const one = migrate(raw),
        two = migrate(JSON.parse(JSON.stringify(one)));
      return (
        JSON.stringify(one) === JSON.stringify(two) &&
        one.accounts.length === 2 &&
        one.accounts[0].id !== one.accounts[1].id &&
        one.txns.length === 2 &&
        one.txns[0].id !== one.txns[1].id &&
        one.types.length === 0
      );
    }),
    "an odd backup loads the same every time: duplicate ids made unique, bad dates and nameless types left out"
  );
  await seed({
    txns: [{ id: "e", ts: 1, date: t, type: "expense", amount: 1, account: "a", cat: "food", note: " =1+1" }],
  });
  await page.evaluate(() => {
    window.Android.saveFile = (name, mime, text) => (window.__csv = text);
    exportCsv();
  });
  ok((await page.evaluate(() => window.__csv)).includes(`"' =1+1"`), "a formula after spaces is guarded in CSV");

  // ---- H. loans
  const lseed = async (draws, pays, extra = {}) =>
    seed(
      Object.assign(
        {
          txns: draws
            .map(([id, a, d, due]) => ({
              id,
              ts: 1,
              date: d,
              type: "loan",
              amount: a,
              account: "a",
              note: "",
              dir: "out",
              loan: "L",
              principal: true,
              due,
            }))
            .concat(
              pays.map(([id, a, d]) => ({
                id,
                ts: 2,
                date: d,
                type: "loan",
                amount: a,
                account: "a",
                note: "",
                dir: "in",
                loan: "L",
              }))
            ),
          loans: [{ id: "L", kind: "lend", person: "Ann", account: "a", date: draws[0][2], status: "open" }],
        },
        extra
      )
    );
  const d10 = await page.evaluate(() => addDays(today(), -10)),
    d7 = await page.evaluate(() => addDays(today(), -7)),
    d2 = await page.evaluate(() => addDays(today(), -2));
  await lseed(
    [
      ["d1", 100, d10],
      ["d2", 100, d2],
    ],
    [["p", 30, d7]]
  );
  await page.evaluate(() => {
    loanOpen("L");
    deleteLoanEntry("d1");
  });
  ok(
    (await state()).txns.some(x => x.id === "d1") && /comes before the rest/.test(await page.textContent("#snack")),
    "deleting the first draw would put a payment before the loan: refused"
  );
  await page.evaluate(() => {
    loanOpen("L");
    loanDrawEdit("d1");
    setDateField($("#ed-date"), addDays(today(), -3));
    saveLoanDraw();
  });
  ok(
    (await state()).txns.find(x => x.id === "d1").date === d10 &&
      /comes before that/.test(await page.textContent("#snack")),
    "moving it after the payment: refused"
  );
  await page.evaluate(() => closeSheet());
  ok(
    await page.evaluate(() => {
      S.txns.find(x => x.id === "d1").date = addDays(today(), -1); // as an older version could have saved it
      RBC = null;
      const r = runBal().p;
      return r.ls === "partly" && r.left === 170;
    }),
    "a payment before every draw (from an older version) isn't shown as Cleared"
  );
  await lseed([["d1", 1000, d10]], [["p", 600, d7]]);
  await page.evaluate(() => {
    loanForm("lend");
    $("#f-person").value = "ann";
    $("#f-person").dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.fill("#f-amt", "100");
  await settle();
  const hint = await page.textContent("#f-mergehint");
  ok(
    /500\.00 owed/.test(hint) && (await page.evaluate(() => F.merge === "L")),
    "Ann typed out adds to her open tab, now $500.00 owed: " + hint
  );
  await page.evaluate(() => closeSheet());
  await lseed(
    [
      ["d1", 300, d5, d2],
      ["d2", 200, d5, await page.evaluate(() => addDays(today(), -1))],
    ],
    []
  );
  await page.evaluate(() => {
    loanOpen("L");
    datePicker($("#f-due2"));
    dpSet(addDays(today(), 5));
  });
  const i5 = await page.evaluate(() => {
    const i = loanInfo(loan("L"));
    return { st: i.st, next: i.nextDue, amt: i.dueAmt, due: S.txns.filter(x => x.principal).map(x => x.due) };
  });
  ok(
    i5.st === "active" && i5.amt === 500 && i5.due.every(d => d === i5.next),
    "a new due day moves every draw due by then: no longer overdue " + JSON.stringify(i5)
  );
  ok(!/Overdue/.test(await page.textContent("#sheet .hero")), "and the open loan sheet follows");
  await page.evaluate(() => closeSheet());
  await lseed(
    [
      ["d1", 100, d10],
      ["d2", 50, d5],
    ],
    [],
    {}
  );
  await page.evaluate(() => {
    S.txns.find(x => x.id === "d2").note = "school fees";
    save();
    V.screen = "history";
    render();
  });
  ok(
    (await page.textContent('#app [data-v="d2"]')).includes("school fees"),
    "a note on an added draw shows in History"
  );
  await lseed([["d1", 1000, d10]], [["p", 600, d7]]);
  await page.evaluate(() => {
    loan("L").status = "writeoff";
    save();
    V.screen = "assets";
    V.showCleared = true;
    render();
  });
  ok(/400\.00/.test(await page.textContent('#app [data-v="L"]')), "a written-off lending shows the $400 let go");
  await lseed([["d1", 100, d10, d5]], []);
  await page.evaluate(d => {
    window.__actions = [{ type: "extend", id: "L", days: 7, on: d }];
    applyNativeActions();
  }, d2);
  ok(
    (await state()).txns.find(x => x.id === "d1").due === (await page.evaluate(d => addDays(d, 7), d2)),
    "+1 week tapped two days ago counts from that day"
  );

  // ---- I. the shell
  await bp.evaluate(() => {
    sessionStorage.setItem("cfg", JSON.stringify({ auto: { text: '{"v":6,"accounts":[],"txns":[]}', when: 0 } }));
    window.__calls = [];
    onFolderPicked("");
  });
  ok(
    (await bp.textContent("#pop")).includes("already has a Tally backup") &&
      !(await bp.evaluate(() => S.settings.backup.on)),
    "a picked folder that holds a backup asks before writing over it"
  );
  await bp.click('#pop [data-act="ask-alt"]'); // Replace it
  ok(await bp.evaluate(() => S.settings.backup.on), "Replace it turns auto backup on");
  await bp.evaluate(() => {
    sessionStorage.setItem("cfg", JSON.stringify({ status: { folder: "", usable: false, last: 0, error: "" } }));
    V.screen = "settings";
    render();
  });
  ok((await bp.textContent("#bk")).includes("Can't reach the folder"), "auto backup on without its folder says so");
  // the folder check whenever this install hasn't written to the folder yet; Restore's and Delete all's backup steps
  const bpop = async () => (await bp.textContent("#pop")) || "",
    bset = c => bp.evaluate(c => sessionStorage.setItem("cfg", JSON.stringify(c)), c),
    bnow = () => bp.evaluate(() => window.__calls.filter(c => c[0] === "now").map(c => c[1])),
    other = '{"v":6,"accounts":[{"id":"o","name":"Other phone","type":"bank","currency":"USD","opening":5}],"txns":[]}';
  await bp.evaluate(() => {
    localStorage.clear();
    sessionStorage.removeItem("cfg");
    localStorage.setItem(
      "tally:v1",
      JSON.stringify({
        v: 6,
        settings: { cur: "USD", clock: "24", lastCheck: today(), dragTip: true },
        accounts: [{ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 100 }],
        txns: [],
      })
    );
  });
  await bp.reload();
  await bp.waitForTimeout(200);
  await bset({ status: { folder: "Docs", usable: true, last: 0, error: "" }, auto: { text: other, when: 0 } });
  await bp.evaluate(() => toggleAutoBackup());
  await bp.waitForTimeout(100);
  ok(
    (await bpop()).includes("already has a Tally backup") && !(await bp.evaluate(() => S.settings.backup.on)),
    "turning auto backup on asks first while this phone hasn't written to that folder (after Not now)"
  );
  await bp.evaluate(() => closePop());
  await bset({ status: { folder: "Docs", usable: true, last: 1, error: "" } });
  await bp.evaluate(() => toggleAutoBackup());
  await bp.waitForTimeout(100);
  ok(
    (await bp.evaluate(() => S.settings.backup.on)) && !(await bpop()),
    "once this phone has written there, the switch just turns it on"
  );
  await bp.evaluate(() => (S.settings.backup.on = false));
  await bset({
    status: { folder: "Docs", usable: true, last: 0, error: "" },
    auto: { error: "The file can't be read." },
  });
  await bp.evaluate(() => onFolderPicked(""));
  await bp.waitForTimeout(100);
  ok(
    (await bpop()).includes("Couldn't read this folder's backup") && !(await bp.evaluate(() => S.settings.backup.on)),
    "a backup there that can't be read is asked about, not written over"
  );
  await bp.evaluate(() => closePop());
  await bset({ status: { folder: "Docs", usable: true, last: 0, error: "" }, auto: { text: other, when: 0 } });
  await bp.evaluate(() => onFolderPicked(""));
  await bp.waitForTimeout(100);
  await bp.click('#pop [data-act="ask-ok"]'); // Restore it
  await bp.waitForTimeout(100);
  await bp.click('#pop [data-act="ask-ok"]'); // Restore
  await bp.waitForTimeout(100);
  const restored = await bp.evaluate(() => [S.accounts.map(a => a.name).join(), S.settings.backup.on]);
  await bp.click('#snack [data-act="undo"]');
  await bp.waitForTimeout(100);
  const undone = await bp.evaluate(() => [S.accounts.map(a => a.name).join(), S.settings.backup.on]);
  ok(
    JSON.stringify([restored, undone]) === '[["Other phone",true],["Bank",false]]',
    "Restore it, then Undo: this phone's notebook back, with auto backup off again " +
      JSON.stringify([restored, undone])
  );
  await bset({ auto: { text: "{broken", when: 0 } });
  await bp.evaluate(() => {
    S.settings.backup.on = true;
    window.__calls = [];
    restoreStart();
  });
  await bp.waitForTimeout(100);
  ok(
    (await bp.evaluate(() => window.__calls.filter(c => c[0] === "pickRestore").length)) === 1,
    "a broken auto backup file doesn't block Restore: the file picker opens"
  );
  await bp.evaluate(() =>
    restoreText(
      '{"v":6,"accounts":[{"id":"b","name":"B","type":"bank","currency":"USD","opening":1}],"txns":[],' +
        '"loans":[{"id":"L","kind":"Borrow"}],"assets":[{"name":"no id"}]}'
    )
  );
  ok((await bpop()).includes("2 items in it can't be read"), "Restore counts the loans and assets it leaves out");
  await bp.evaluate(() => closePop());
  await bset({ status: { folder: "Docs", usable: true, last: 5, error: "" } });
  await bp.evaluate(() => {
    S.settings.backup.on = true;
    V.screen = "settings";
    render();
    window.__calls = [];
    wipeAll();
  });
  await bp.click('#pop [data-act="ask-ok"]'); // Save backup: Back up now
  await bp.evaluate(() => {
    V.screen = "home";
    render();
    txSheet(null, "expense");
  });
  await bp.evaluate(id => window.tallyBackedUp("", id), (await bnow())[0]);
  await bp.waitForTimeout(100);
  ok(
    !(await bpop()).includes("Delete all data?") && (await bp.evaluate(() => S.accounts.length)) === 1,
    "Delete all's backup answering after the user moved on asks nothing over the form"
  );
  await bp.evaluate(() => {
    closeSheet();
    V.screen = "settings";
    render();
    window.__calls = [];
    backupNow();
    wipeAll();
  });
  await bp.click('#pop [data-act="ask-ok"]');
  const ids = await bnow();
  await bp.evaluate(id => window.tallyBackedUp("", id), ids[0]);
  await bp.waitForTimeout(100);
  const first = await bpop();
  await bp.evaluate(id => window.tallyBackedUp("", id), ids[1]);
  await bp.waitForTimeout(100);
  ok(
    ids.length === 2 && !first.includes("Delete all data?") && (await bpop()).includes("Delete all data?"),
    "two Back up nows in a row: only Delete all's own answer goes on to its question"
  );
  await bp.evaluate(() => {
    closePop();
    localStorage.setItem("tally:v1:unreadable", "{x");
    render();
  });
  await bp.click('[data-act="kept-save"]');
  await bp.evaluate(() => window.tallySaved(true));
  ok(await bp.evaluate(() => keptKeys().length === 0), "a kept copy goes once it is saved as a file");
  await bc.close();
  ok(
    await page.evaluate(() => {
      S.txns = [
        {
          id: "e",
          ts: Date.now(),
          date: addDays(today(), 3),
          type: "expense",
          amount: 1,
          account: "a",
          cat: "food",
          note: "",
        },
      ];
      syncReminders();
      return window.__rem ? window.__rem.lastEntry === today() : true;
    }),
    "an entry dated ahead counts as written today for the evening nudge"
  );
  ok(
    await page.evaluate(() => {
      const tr = {
          id: "t",
          ts: 5,
          date: today(),
          type: "transfer",
          amount: 1,
          account: "a",
          to: "a",
          note: "",
          feeId: "f",
        },
        fee = {
          id: "f",
          ts: 5,
          date: today(),
          type: "expense",
          amount: 1,
          account: "a",
          cat: "fees",
          note: "",
          feeOf: "t",
        };
      return [tr, fee].sort(byNewest)[0].id === "f";
    }),
    "a fee saved with its transfer's own time lists just above it"
  );

  // ---- J. screens
  const small = await browser.newContext({ viewport: { width: 320, height: 640 }, locale: "en-US" });
  await small.addInitScript(() => {
    window.Android = {
      setReminders() {},
      takeActions: () => "[]",
      getColors: () => null,
      setBars() {},
      fontScale: () => 1.3,
    };
  });
  const sp = await small.newPage();
  sp.on("pageerror", e => errors.push(e.message));
  await sp.goto(appUrl);
  await sp.evaluate(
    y => {
      localStorage.setItem(
        "tally:v1",
        JSON.stringify({
          v: 6,
          settings: { cur: "IDR", clock: "24", lastCheck: y, dragTip: true, remind: { checkTime: "00:00" } }, // shown at any hour
          accounts: [
            { id: "a", name: "Everyday account", type: "bank", currency: "IDR", opening: 125500000 },
            { id: "b", name: "Savings for the new house", type: "savings", currency: "IDR", opening: 9500000 },
          ],
          txns: [],
          loans: [],
          assets: [],
        })
      );
    },
    await page.evaluate(() => addDays(today(), -1))
  );
  await sp.reload();
  await sp.waitForTimeout(200);
  const nm = await sp.evaluate(() => {
    const n = document.querySelector(".ckrow .nm");
    return n ? n.getBoundingClientRect().width : -1;
  });
  ok(nm > 60, "the balance check keeps a long name readable at 320px and large text (" + Math.round(nm) + "px)");
  /* each balance check row: the balance and Fix on the name's line, Fix at the row's right edge and after the balance */
  const ckRows = pg =>
    pg.evaluate(() =>
      [...document.querySelectorAll(".ckrow")].map(r => {
        const R = r.getBoundingClientRect(),
          box = q => r.querySelector(q).getBoundingClientRect(),
          mid = x => (x.top + x.bottom) / 2,
          e = box(".emb"),
          n = box(".nm"),
          b = box("b"),
          f = box(".fx");
        return {
          name: r.querySelector(".nm").textContent,
          beside: n.left >= e.right && n.top < e.bottom,
          inline: Math.abs(mid(b) - mid(n)) < 6 && Math.abs(mid(f) - mid(b)) < 6,
          right: Math.abs(R.right - parseFloat(getComputedStyle(r).paddingRight) - f.right) < 1.5,
          after: b.right <= f.left + 1 || b.bottom <= f.top + 1,
        };
      })
    );
  let rows = await ckRows(sp);
  ok(
    rows.length === 2 && rows.every(x => x.beside && x.right && x.after),
    "where a long name pushes them below, the balance and Fix stay on the right; a name stays beside its icon " +
      JSON.stringify(rows)
  );
  const ck = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
  await ck.addInitScript(() => {
    window.Android = {
      setReminders() {},
      takeActions: () => "[]",
      getColors: () => null,
      setBars() {},
      fontScale: () => 1.1,
    };
  });
  const mp = await ck.newPage();
  mp.on("pageerror", e => errors.push(e.message));
  await mp.goto(appUrl);
  await mp.evaluate(
    y =>
      localStorage.setItem(
        "tally:v1",
        JSON.stringify({
          v: 6,
          settings: { cur: "BDT", clock: "24", lastCheck: y, dragTip: true, remind: { checkTime: "00:00" } },
          accounts: [
            ["City Bank", 99259],
            ["Bkash", 2910],
            ["Wallet", 910],
            ["Brac Joint", 64177],
          ].map(([name, opening], i) => ({ id: "a" + i, name, type: "bank", currency: "BDT", opening })),
          txns: [],
          loans: [],
          assets: [],
        })
      ),
    await page.evaluate(() => addDays(today(), -1))
  );
  await mp.reload();
  await mp.waitForTimeout(200);
  rows = await ckRows(mp);
  ok(
    rows.length === 4 && rows.every(x => x.beside && x.inline && x.right && x.after),
    "names that fit keep their balance and Fix on their own line, Fix at the right " + JSON.stringify(rows)
  );
  await ck.close();
  await sp.evaluate(() => {
    V.screen = "settings";
    render();
  });
  const broken = await sp.evaluate(() =>
    [...document.querySelectorAll(".setrow .mid > div:first-child")]
      .filter(d => {
        const r = document.createRange();
        r.selectNodeContents(d);
        return r.getClientRects().length > 1 && d.textContent.split(/\s+/).length < r.getClientRects().length;
      })
      .map(d => d.textContent)
  );
  ok(broken.length === 0, "Settings titles don't break inside words " + JSON.stringify(broken));
  await sp.evaluate(() => {
    S.accounts[0].name = "Everyday spending account at the big bank";
    txSheet(null, "expense", "food");
  });
  const chip = await sp.evaluate(() => {
    const c = document.querySelector('#sheet [data-act="f-acc"]'),
      n = c.querySelector(".chn");
    return { fits: c.getBoundingClientRect().right <= innerWidth, cut: getComputedStyle(n).textOverflow };
  });
  ok(chip.fits && chip.cut === "ellipsis", "a long account name in its chip is cut with … " + JSON.stringify(chip));
  await small.close();
  await seed({ accounts: [{ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1, archived: true }] });
  ok(
    (await page.textContent("#app")).includes("Every account is archived") && (await page.isVisible("#nav")),
    "every account archived: Home says so, and the tabs stay"
  );
  await page.click('[data-act="show-arch"]');
  ok((await page.textContent("#app")).includes("Bank"), "and Show archived accounts lists them");
  await seed({
    txns: [{ id: "e", ts: 1, date: t, type: "expense", amount: 30, account: "a", cat: "food", note: "" }],
  });
  await page.focus('[data-act="prev"]');
  await page.keyboard.press("Enter");
  await settle();
  ok(
    await page.evaluate(() => document.activeElement.dataset.act === "prev"),
    "after ‹ redraws Home, the focus is still on ‹"
  );
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    V.anchor = today();
    render();
  });
  const names = await page.evaluate(() => ({
    donut: $(".dwrap").getAttribute("aria-label"),
    tile: $('#ring [data-v="food"]').getAttribute("aria-label"),
  }));
  ok(
    /spent \$30\.00/.test(names.donut) && /100% of spending/.test(names.tile),
    "the donut and ring tiles say their values " + JSON.stringify(names)
  );
  await page.evaluate(() => askDialog("Archive Bank?", "Its balance leaves the totals.", "Archive", () => {}));
  ok(
    await page.evaluate(() => {
      const d = document.querySelector('#pop [role="alertdialog"]');
      return $("#" + d.getAttribute("aria-describedby")).textContent.includes("leaves the totals");
    }),
    "a dialog's text is its description"
  );
  await page.evaluate(() => closePop());
  ok(
    await page.evaluate(() => {
      V.period = "range";
      V.rs = V.re = addDays(today(), -1);
      const yl = periodLabel();
      V.period = "day";
      V.anchor = today();
      return yl === "Yesterday";
    }),
    "a one-day range of yesterday says Yesterday"
  );
  ok(
    await page.evaluate(() => compact(1500) === "1.5K" && compact(0.25) === "0.25"),
    "chart labels in the phone's own short form"
  );
  await seed({
    settings: { cur: "USD", clock: "24", lastCheck: t, dragTip: true, donut: "none" },
    accounts: [
      { id: "a", name: "Bank", type: "bank", currency: "USD", opening: 100 },
      { id: "e", name: "Euro", type: "bank", currency: "EUR", opening: 50 },
    ],
  });
  ok(!!(await page.$('[data-act="cur-next"]')), 'two currencies with "No stats": the currency switch is still there');

  // ---- K. final QA: loan amounts as shown, the loan form's currency, signs placed one way everywhere
  await seed({
    accounts: [
      { id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1000 },
      { id: "e", name: "Euro", type: "bank", currency: "EUR", opening: 50 },
    ],
    txns: [
      {
        id: "d",
        ts: 1,
        date: d5,
        type: "loan",
        amount: 66.667,
        account: "a",
        note: "",
        dir: "out",
        loan: "L",
        principal: true,
      },
    ],
    loans: [{ id: "L", kind: "lend", person: "Rina", account: "a", date: d5, status: "open" }],
  });
  await page.evaluate(() => loanOpen("L"));
  await settle();
  await page.fill("#f-amt", "66.67");
  await page.click('#sheet [data-act="loan-pay"]');
  await settle();
  S = await state();
  const pill = await page.evaluate(() => {
    const p = S.txns.find(x => x.loan === "L" && !x.principal);
    return p ? (runBal()[p.id] || {}).ls : null;
  });
  ok(
    !((await page.textContent("#pop")) || "").includes("more") &&
      (await page.evaluate(() => !loanInfo(loan("L")).open)) &&
      pill === "cleared",
    'paying the $66.67 shown on a $66.667 lending clears it: no "$0.00 more", History says Cleared (' + pill + ")"
  );
  await page.evaluate(() => {
    closePop();
    closeSheet();
    loanForm("lend");
  });
  await settle();
  await page.click('#sheet [data-act="f-acc"][data-v="e"]');
  ok((await page.textContent("#amt-cur")) === "EUR", "the loan form's currency follows the account picked");
  await page.evaluate(() => closeSheet());
  await seed({
    txns: [
      {
        id: "d",
        ts: 1,
        date: d5,
        type: "loan",
        amount: 100,
        account: "a",
        note: "",
        dir: "in",
        loan: "B",
        principal: true,
      },
    ],
    loans: [{ id: "B", kind: "borrow", person: "Sam", account: "a", date: d5, status: "open" }],
  });
  await page.evaluate(() => loanOpen("B"));
  await settle();
  await page.fill("#f-amt", "110");
  await page.click('#sheet [data-act="add-fee"]');
  await page.fill("#f-fee", "2");
  await page.click('#sheet [data-act="loan-pay"]');
  await settle();
  await page.click('#pop [data-act="ask-alt"]'); // Track as a fee
  await settle();
  ok(
    (await page.textContent("#snack")).includes("$12.00 as its fee"),
    "Track as a fee names the whole fee: " + (await page.textContent("#snack"))
  );
  await page.evaluate(() => closeSheet());
  await seed({
    accounts: [
      { id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1000 },
      { id: "e", name: "Euro", type: "bank", currency: "EUR", opening: 50, archived: true },
    ],
    txns: [
      {
        id: "d",
        ts: 1,
        date: d5,
        type: "loan",
        amount: 20,
        account: "e",
        note: "",
        dir: "out",
        loan: "E",
        principal: true,
      },
    ],
    loans: [{ id: "E", kind: "lend", person: "Ana", account: "e", date: d5, status: "open" }],
  });
  await page.evaluate(() => loanOpen("E"));
  await settle();
  const card = await page.textContent("#sheet");
  await page.evaluate(() => {
    closeSheet();
    clearLoan("E");
  });
  await settle();
  ok(
    card.includes("No account in EUR to record it") &&
      (await page.textContent("#pop")).includes("no account in EUR") &&
      (await page.textContent('#pop [data-act="ask-ok"]')).includes("Write it off"),
    "no account left in a loan's currency: the card says so, and clearing offers only Write it off"
  );
  await page.evaluate(() => closePop());
  // past midnight with History on a day or a range, and a date picker open: they move to the new day too
  await seed();
  await page.evaluate(() => {
    HP.period = "day";
    HP.anchor = today();
    txSheet(null, "expense", "food");
  });
  await settle();
  await page.click("#sheet .datefld");
  await settle();
  const mid2 = await page.evaluate(() => {
    const R = Date,
      day = 864e5;
    window.Date = class extends R {
      constructor(...a) {
        if (a.length) super(...a);
        else super(R.now() + day);
      }
      static now() {
        return R.now() + day;
      }
    };
    catchUpToday();
    const tb = $('#dp [data-act="dp-set"]');
    return { t: today(), hp: HP.anchor, max: DP.max, todayBtn: tb && tb.dataset.v };
  });
  ok(
    mid2.hp === mid2.t && mid2.max === mid2.t && mid2.todayBtn === mid2.t,
    "past midnight: History's day and an open date picker (its Today, its latest day) move too " + JSON.stringify(mid2)
  );
  await seed();
  const last = await page.evaluate(() => {
    let sent = null;
    Android.setReminders = j => (sent = JSON.parse(j));
    S.txns = [
      {
        id: "x",
        ts: Date.now() - 2 * 864e5,
        date: addDays(today(), 2),
        type: "expense",
        amount: 1,
        account: "a",
        cat: "food",
        note: "",
      },
    ];
    syncReminders();
    return sent ? [sent.lastEntry, addDays(today(), -2)] : null;
  });
  ok(
    last && last[0] === last[1],
    "an entry written two days ago but dated ahead counts on the day it was written: tonight's nudge still comes " +
      JSON.stringify(last)
  );
  ok(
    await page.evaluate(
      () =>
        gregorian("ar-EG-u-nu-latn") === "ar-EG-u-ca-gregory-nu-latn" &&
        gregorian("fa-IR-u-ca-persian") === "fa-IR-u-ca-gregory"
    ),
    "dates use the Gregorian calendar and keep the phone's other choices, such as Latin digits"
  );
  ok(
    await page.evaluate(() => backupWhen(Date.now() - 864e5).startsWith("Yesterday, ")),
    "the last backup's time says Yesterday too"
  );
  const nl = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "nl-NL" });
  const np = await nl.newPage();
  np.on("pageerror", e => errors.push(e.message));
  await np.goto(appUrl);
  await np.evaluate(t => {
    localStorage.setItem(
      "tally:v1",
      JSON.stringify({
        v: 6,
        settings: { cur: "EUR", clock: "24", lastCheck: t, dragTip: true },
        accounts: [{ id: "a", name: "Bank", type: "bank", currency: "EUR", opening: 100 }],
        txns: [
          { id: "o", ts: 1, date: t, type: "expense", amount: 12.5, account: "a", cat: "food", note: "" },
          { id: "i", ts: 2, date: t, type: "income", amount: 40, account: "a", cat: "salary", note: "" },
          { id: "f", ts: 3, date: t, type: "adjust", amount: -3.25, account: "a", note: "" },
        ],
      })
    );
  }, t);
  await np.reload();
  await np.waitForTimeout(200);
  await np.evaluate(() => {
    V.screen = "history";
    render();
  });
  const amts = await np.$$eval("#app .tx .a", a => a.map(x => x.textContent.trim()));
  ok(
    amts.length === 3 && amts.every(x => /^€\u00a0[−+]\u2060\d/.test(x)),
    "in Dutch every History amount has its sign after the €: " + JSON.stringify(amts)
  );
  await nl.close();

  // ---- L. final QA: screens on narrow, short and right-to-left setups
  /* a page at a given size, text scale and language, with this notebook */
  const sized = async (o, st) => {
    const c = await browser.newContext({
      viewport: { width: o.w, height: o.h },
      screen: { width: o.w, height: o.h },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
      locale: o.locale || "en-US",
    });
    await c.addInitScript(s => {
      window.Android = {
        getColors: () => null,
        setBars() {},
        setReminders() {},
        setWidget() {},
        takeActions: () => "[]",
        requestNotifications() {},
        saveFile() {},
        fontScale: () => s,
      };
    }, o.s || 1);
    const p = await c.newPage();
    p.on("pageerror", e => errors.push(e.message));
    await p.goto(appUrl);
    await p.evaluate(st => localStorage.setItem("tally:v1", JSON.stringify(st)), st);
    await p.reload();
    await p.waitForTimeout(150);
    return p;
  };
  const book = {
    v: 6,
    settings: { cur: "IDR", week: 1, clock: "24", lastCheck: t, dragTip: true },
    accounts: [
      { id: "b", name: "Everyday account at Bank Central Asia", type: "bank", currency: "IDR", opening: 1234567890.5 },
      { id: "h", name: "חשבון בנק", type: "bank", currency: "IDR", opening: 5000 },
      { id: "u", name: "Dollars", type: "bank", currency: "USD", opening: 50 },
      { id: "i", name: "DE89370400440532013000", type: "bank", currency: "USD", opening: 0 },
    ],
    txns: [
      { id: "e1", ts: 1, date: t, type: "expense", amount: 1234567.5, account: "b", cat: "food", note: "" },
      { id: "e2", ts: 2, date: t, type: "expense", amount: 5, account: "b", cat: "groceries", note: "Weekly shop" },
      { id: "e3", ts: 3, date: t, type: "expense", amount: 2, account: "u", cat: "food", note: "" },
      { id: "x1", ts: 4, date: t, type: "transfer", amount: 100, account: "h", to: "u", toAmount: 6.5, note: "" },
      {
        id: "d1",
        ts: 5,
        date: t,
        type: "loan",
        amount: 1200,
        account: "b",
        note: "",
        dir: "out",
        loan: "L1",
        principal: true,
      },
      { id: "p1", ts: 6, date: t, type: "loan", amount: 200, account: "b", note: "", dir: "in", loan: "L1" },
      {
        id: "d2",
        ts: 7,
        date: t,
        type: "loan",
        amount: 50,
        account: "b",
        note: "",
        dir: "out",
        loan: "L2",
        principal: true,
      },
    ],
    loans: [
      { id: "L1", kind: "lend", person: "سارة", account: "b", date: t, status: "open" },
      { id: "L2", kind: "lend", person: "Maria Fernanda Gonzalez de la Cruz", account: "b", date: t, status: "open" },
    ],
    assets: [],
  };
  const narrow = await sized({ w: 320, h: 640, s: 1.3 }, book);
  /* every amount and balance line's figure lies wholly inside its row, bar or chip */
  const cutAmounts = () =>
    narrow.evaluate(() => {
      const cut = [];
      for (const el of document.querySelectorAll("#app .balbar b, #app .acc .b, #app .tx .a")) {
        const box = el.closest(".tx, .balbar, .acc").getBoundingClientRect(),
          w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
          if (!n.textContent.trim() || n.parentElement.closest(".rbn")) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          const b = r.getBoundingClientRect();
          if (b.left < box.left - 0.5 || b.right > box.right + 0.5) cut.push(n.textContent.trim());
        }
      }
      return cut;
    });
  const view = v =>
    narrow.evaluate(v => {
      closeSheet();
      V.screen = v;
      render();
    }, v);
  let cutL = await cutAmounts();
  await view("history");
  cutL = cutL.concat(await cutAmounts());
  await view("assets");
  cutL = cutL.concat(await cutAmounts());
  ok(
    cutL.length === 0,
    "320px at large text: a billion on the balance bar, chips and every row is shown whole " + JSON.stringify(cutL)
  );
  await view("history");
  const bidi = await narrow.evaluate(() => {
    const d = $('#app [data-v="p1"] .d'),
      b = d && d.querySelector("bdi"),
      r = document.createRange();
    if (!b || !b.nextSibling) return null;
    r.selectNodeContents(b.nextSibling);
    const rb = $('#app [data-v="x1"] .rb'),
      arrow = rb.firstChild;
    return {
      sentence:
        getComputedStyle(d).direction === "ltr" &&
        b.getBoundingClientRect().right <= r.getBoundingClientRect().left + 1,
      arrow: arrow.nodeType === 3 && arrow.textContent === "↓" && !rb.querySelector(".rbn").textContent.includes("↓"),
    };
  });
  ok(bidi && bidi.sentence, 'a right-to-left name keeps the sentence in order: "سارة paid back", name first');
  ok(bidi && bidi.arrow, "a transfer's arrow stays outside the account's name, on the app's side");
  await view("home");
  ok(
    await narrow.evaluate(() => {
      const n = $('.acc[data-v="h"] .n'),
        em = n.querySelector(".emb"),
        nm = n.querySelector("[dir=auto]");
      return !!nm && em.getBoundingClientRect().right <= nm.getBoundingClientRect().left;
    }),
    "a Home chip's emblem stays before a right-to-left name"
  );
  /* chips holding long names: the name ends in "…", nothing past the chip's edge (its ✓ shows) */
  const chipOk = sel =>
    narrow.evaluate(sel => {
      const c = document.querySelector(sel),
        n = c && c.querySelector(".chn");
      return (
        !!n &&
        getComputedStyle(n).textOverflow === "ellipsis" &&
        n.scrollWidth > n.clientWidth &&
        c.scrollWidth <= c.clientWidth + 1
      );
    }, sel);
  await narrow.evaluate(() => {
    V.screen = "history";
    V.hAcc = "b";
    render();
  });
  ok(
    await chipOk('.strip [data-act="hacc"][data-v="b"]'),
    'History\'s chip for a long account name ends in "…" and keeps its ✓'
  );
  await narrow.evaluate(() => {
    V.hAcc = "";
    V.screen = "home";
    render();
    loanForm("lend");
  });
  await narrow.waitForTimeout(150);
  await narrow.fill("#f-person", "Ma");
  await narrow.waitForTimeout(150);
  ok(await chipOk('#f-person-sug [data-act="f-person-pick"]'), 'a suggested person with a long name ends in "…"');
  await narrow.evaluate(() => {
    closeSheet();
    accOpen("i");
  });
  await narrow.waitForTimeout(150);
  ok(
    await narrow.evaluate(() => {
      const x = $('#sheet [data-act="close"]').getBoundingClientRect(),
        p = $("#sheet .p").getBoundingClientRect(),
        h = $("#sheet .h h2");
      return x.right <= p.right + 1 && h.scrollWidth <= h.clientWidth + 1;
    }),
    "a sheet titled with a long unbroken name (an IBAN) wraps it and keeps its close button"
  );
  await narrow.evaluate(() => {
    closeSheet();
    catForm("food");
  });
  await narrow.waitForTimeout(150);
  ok(
    await narrow.evaluate(() => {
      const d = $("#sheet .dots .dot.addnew");
      return ["::before", "::after"].some(p => {
        const s = getComputedStyle(d, p);
        return s.content !== "none" && s.borderTopStyle === "dashed" && +s.opacity > 0;
      });
    }),
    '"Add your own colour" shows its dashed ring'
  );
  await narrow.evaluate(() => {
    closeSheet();
    trSheet();
  });
  await narrow.waitForTimeout(150);
  ok(
    await narrow.evaluate(() => $("#fee-btn").textContent.includes("cash‑out")),
    '"cash‑out" on the fee button never breaks at its hyphen'
  );
  await narrow.evaluate(() => {
    closeSheet();
    loanOpen("L1");
  });
  await narrow.waitForTimeout(150);
  ok(
    await narrow.evaluate(() => {
      const st = $("#sheet .tx.exp .s .st");
      return (
        !!st &&
        (st.scrollWidth <= st.clientWidth + 1 || getComputedStyle(st).textOverflow === "ellipsis") &&
        st.getBoundingClientRect().right <= st.parentElement.getBoundingClientRect().right + 0.5
      );
    }),
    'a loan card\'s "Partly paid" fits or ends in "…" on a narrow screen'
  );
  await narrow.evaluate(() => {
    closeSheet();
    V.screen = "home";
    render();
  });
  const pillH = await narrow.evaluate(() => {
    const c = $(".curbtn");
    if (!c) return 0;
    const r = c.getBoundingClientRect(),
      x = r.left + r.width / 2;
    let n = 0;
    for (let y = r.top - 30; y < r.bottom + 60; y++) {
      const e = document.elementFromPoint(x, y);
      if (e && e.closest(".curbtn")) n++;
    }
    return n;
  });
  ok(pillH >= 47, "the donut's currency switch is 48px tall to tap (" + pillH + "px)");
  await narrow.context().close();

  /* a 16:9 phone once its bars are taken off, large text, a six-week month */
  const short = await sized({ w: 360, h: 568, s: 1.3 }, book);
  const pickFits = [];
  for (const [nm, open] of [
    [
      "date",
      () => {
        document.body.insertAdjacentHTML("beforeend", dateField("qa-x", "2026-05-12", {}));
        datePicker(document.getElementById("qa-x"));
        DP.month = "2026-08";
        dpRender();
      },
    ],
    [
      "range",
      () => {
        periodDialog(V);
        PD.tab = "range";
        PD.month = "2026-08";
        pdRender();
      },
    ],
  ]) {
    await short.evaluate(() => closePop());
    await short.evaluate(open);
    await short.waitForTimeout(100);
    pickFits.push(
      await short.evaluate(nm => {
        const d = $("#pop .dialog");
        return [
          nm,
          d.querySelectorAll(".wk").length,
          d.scrollHeight - d.clientHeight,
          getComputedStyle($("#pop .cal")).touchAction,
        ];
      }, nm)
    );
  }
  ok(
    pickFits.every(([, wk, over]) => wk === 6 && over <= 1),
    "a short window: the date picker and the Range tab fit a six-week month without scrolling " +
      JSON.stringify(pickFits)
  );
  ok(
    pickFits[0][3] === "pan-y" && pickFits[1][3] === "none",
    "a swipe on the date picker's calendar can scroll it; on the Range tab it picks days"
  );
  /* the band's days overlap a little, so no hairline shows between them */
  ok(
    await short.evaluate(() => {
      PD.p = { period: "range", rs: "2026-08-04", re: "2026-08-08", anchor: "2026-08-04" };
      pdRender();
      const band = [...document.querySelectorAll("#pd .dd.in, #pd .dd.rs, #pd .dd.re")].map(e =>
        e.getBoundingClientRect()
      );
      return band.length === 5 && band.every((r, i) => !i || band[i - 1].right > r.left + 0.5);
    }),
    "a range's band days overlap their neighbours, leaving no seam"
  );
  await short.evaluate(() => closePop());
  await short.context().close();
  const tiny = await sized({ w: 360, h: 440, s: 1 }, book);
  await tiny.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", dateField("qa-x", "2026-05-12", {}));
    datePicker(document.getElementById("qa-x"));
    DP.month = "2026-08";
    dpRender();
  });
  await tiny.waitForTimeout(100);
  const cdp = await tiny.context().newCDPSession(tiny);
  const at = await tiny.evaluate(() => {
    const c = $("#pop .cal").getBoundingClientRect();
    return [c.left + 30, c.top + c.height / 2];
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at[0], y: at[1] }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at[0], y: at[1] - 12 * i }] });
    await tiny.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await tiny.waitForTimeout(400);
  ok(
    (await tiny.evaluate(() => $("#pop .dialog").scrollTop)) > 0,
    "a window too short even for smaller days: a swipe on the calendar scrolls the date picker"
  );
  await tiny.context().close();

  /* Russian at 320px, large text: the long weekday names don't fit, so the short ones show (the long one read out) */
  const ru = await sized({ w: 320, h: 640, s: 1.3, locale: "ru-RU" }, book);
  const week = await ru.evaluate(() => {
    V.screen = "settings";
    render();
    return [...document.querySelectorAll('#app [data-act="week"]')].map(b => [
      b.textContent,
      b.getAttribute("aria-label"),
      b.scrollWidth <= b.clientWidth + 1,
    ]);
  });
  ok(
    week.length === 3 && week.every(([s, l, fits]) => fits && l && l.length > s.length),
    "First day of week: short day names where the long ones don't fit, the long ones read out " + JSON.stringify(week)
  );
  /* a keyboard's focus ring inside a box that clips: drawn inside the control, so it shows whole */
  await ru.evaluate(() => $('#app [data-act="clock"]').focus());
  await ru.keyboard.press("Shift+Tab");
  await ru.keyboard.press("Tab");
  ok(
    await ru.evaluate(() => {
      const a = document.activeElement;
      return !!a.closest(".seg") && a.matches(":focus-visible") && getComputedStyle(a).outlineOffset === "-2px";
    }),
    "the focus ring on a segmented button is drawn inside it"
  );
  await ru.context().close();

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
