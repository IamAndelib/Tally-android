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
        signed(-5, "USD") === "−$5.00"
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

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
