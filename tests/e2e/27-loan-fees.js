// A loan payment's fee (a sending or cash-out charge) works like a transfer's: off the paying account, shown with the
// payment, never spending. It goes with its payment (delete, reopen, deleting the loan) and survives a reload. Tally
// never files it, or anything else, under a category by itself: here the built-in "fees" slot is renamed "Food" and the
// income "Other" one "Salary", and neither ever shows a fee.
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
outDir("27-loan-fees");
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
    window.__files = [];
    window.Android = {
      setWidget() {},
      setReminders() {},
      takeActions() {
        return "[]";
      },
      getColors() {
        return null;
      },
      setBars() {},
      requestNotifications() {},
      saveFile(name, mime, text) {
        window.__files.push({ name, text });
      },
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  const settle = () => page.waitForTimeout(150);
  /* a tap, then past the guard that drops a second tap at the same spot */
  const click = async sel => {
    await page.click(sel);
    await page.waitForTimeout(320);
  };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const bal = id => page.evaluate(id => balances()[id], id);
  const t = await page.evaluate(() => today());
  const d5 = await page.evaluate(() => addDays(today(), -5));
  await page.evaluate(
    ([t, d5]) => {
      const o = migrate({
        v: 6,
        settings: { cur: "BDT", clock: "24", lastCheck: t, dragTip: true },
        accounts: [
          { id: "a", name: "Bank", type: "bank", currency: "BDT", opening: 10000 },
          { id: "c", name: "Cash", type: "cash", currency: "BDT", opening: 500 },
        ],
        txns: [
          { id: "g", ts: 1, date: t, type: "expense", amount: 50, account: "a", cat: "groceries", note: "" },
          {
            id: "bd",
            ts: 2,
            date: d5,
            type: "loan",
            amount: 5000,
            account: "a",
            note: "",
            dir: "in",
            loan: "B",
            principal: true,
          },
          {
            id: "ld",
            ts: 3,
            date: d5,
            type: "loan",
            amount: 2000,
            account: "a",
            note: "",
            dir: "out",
            loan: "L",
            principal: true,
          },
        ],
        loans: [
          { id: "B", kind: "borrow", person: "Sam", account: "a", date: d5, status: "open" },
          { id: "L", kind: "lend", person: "Rina", account: "a", date: d5, status: "open" },
        ],
        assets: [],
      });
      Object.assign(
        o.cats.find(c => c.id === "fees"),
        { name: "Food", i: "restaurant" }
      );
      Object.assign(
        o.cats.find(c => c.id === "otherin"),
        { name: "Salary" }
      );
      localStorage.setItem("tally:v1", JSON.stringify(o));
    },
    [t, d5]
  );
  await page.reload();
  await settle();
  const a0 = await bal("a");

  // ---- 1. paying back 1,000 with a 20 fee
  await page.evaluate(() => loanOpen("B"));
  await settle();
  ok(
    (await page.isHidden("#fee-wrap")) && (await page.textContent('[data-act="add-fee"]')).includes("Add a fee"),
    "the payment card offers a fee behind a button"
  );
  await page.fill("#f-amt", "1000");
  await click('#sheet [data-act="add-fee"]');
  ok(
    (await page.textContent("#fee-lbl")).includes("not counted as spending") && (await page.isVisible("#f-fee")),
    "the fee field: " + (await page.textContent("#fee-lbl"))
  );
  await page.fill("#f-fee", "12+");
  await click('#sheet [data-act="loan-pay"]');
  ok(
    (await page.textContent("#snack")).includes("isn't a number") && (await state()).txns.length === 3,
    "a fee that isn't a number is refused"
  );
  await page.fill("#f-fee", "20");
  await click('#sheet [data-act="loan-pay"]');
  let S = await state();
  const p1 = S.txns.find(x => x.loan === "B" && !x.principal);
  const f1 = p1 && S.txns.find(x => x.id === p1.feeId);
  ok(
    p1 && p1.amount === 1000 && f1 && f1.amount === 20 && f1.feeOf === p1.id && f1.account === "a",
    "a payment and its fee, linked both ways " + JSON.stringify([p1, f1])
  );
  ok((await bal("a")) === a0 - 1020, "Bank paid 1,020 " + (await bal("a")));
  ok(/\+ BDT.20\.00 fee/.test(await page.textContent("#snack")), "message: " + (await page.textContent("#snack")));
  ok(
    await page.evaluate(() => loanInfo(loan("B")).paid === 1000 && loanInfo(loan("B")).left === 4000),
    "the loan counts the 1,000, not the fee"
  );

  // ---- 2. not spending, under no category
  await page.evaluate(() => {
    V.screen = "home";
    render();
  });
  await settle();
  const ring = await page.evaluate(() =>
    [...document.querySelectorAll("#ring .cp")].filter(e => e.textContent).map(e => e.closest("[data-v]").dataset.v)
  );
  ok(JSON.stringify(ring) === '["groceries"]', "the ring shows only Groceries " + JSON.stringify(ring));
  await page.evaluate(() => {
    V.screen = "history";
    render();
  });
  await settle();
  const row = (await page.textContent(`[data-v="${f1.id}"]`)).replace(/\s+/g, " ");
  ok(
    /Payment fee/.test(row) && /paid back Sam/.test(row) && !/Food/.test(row),
    "History shows it with the payment: " + row
  );
  ok(/50\.00/.test(await page.textContent("#app .day")), "the day's total is the 50 spent");
  await click(`[data-v="${f1.id}"]`);
  ok((await page.textContent("#sheet h2")) === "Sam", "tapping the fee opens its loan");
  await click('#sheet .tx.exp .txh[data-act="row-exp"]');
  ok(/BDT.20\.00 fee/.test(await page.textContent("#sheet .tx.exp.open .more")), "the payment's row shows its fee");

  // ---- 3. it goes with its payment
  await click(`#sheet [data-act="loanpay-del"][data-v="${p1.id}"]`);
  S = await state();
  ok(!S.txns.some(x => x.id === p1.id || x.id === f1.id), "deleting the payment deletes its fee");
  await click('[data-act="undo"]');
  ok(
    (await state()).txns.some(x => x.id === f1.id),
    "Undo brings both back"
  );

  // ---- 4. getting money back, with a cash-out fee
  await page.evaluate(() => loanOpen("L"));
  await settle();
  await page.fill("#f-amt", "2000");
  await click('#sheet [data-act="add-fee"]');
  await page.fill("#f-fee", "15");
  const a1 = await bal("a");
  await click('#sheet [data-act="loan-pay"]');
  S = await state();
  const p2 = S.txns.find(x => x.loan === "L" && !x.principal);
  ok(p2 && p2.feeId && (await bal("a")) === a1 + 1985, "got back 2,000, cash-out fee 15: Bank +1,985");
  ok(await page.evaluate(() => loanInfo(loan("L")).st === "cleared"), "the lending is cleared");
  await page.evaluate(() => {
    V.screen = "history";
    render();
  });
  await settle();
  ok(
    /got back from Rina/.test(await page.textContent(`[data-v="${p2.feeId}"]`)),
    "its History row: " + (await page.textContent(`[data-v="${p2.feeId}"]`)).replace(/\s+/g, " ")
  );
  await page.evaluate(() => loanOpen("L"));
  await settle();
  await click('#sheet [data-act="loan-reopen"]');
  S = await state();
  ok(!S.txns.some(x => x.id === p2.id || x.id === p2.feeId), "reopening (undo last payment) removes its fee too");
  await click('[data-act="undo"]');

  // ---- 5. the overdraw check counts the fee
  await page.evaluate(() => loanOpen("B"));
  await settle();
  await page.fill("#f-amt", "500");
  await click('#sheet [data-act="f-acc"][data-v="c"]');
  await click('#sheet [data-act="add-fee"]');
  await page.fill("#f-fee", "10");
  await click('#sheet [data-act="loan-pay"]');
  ok((await page.textContent("#pop")).includes("Not enough in Cash"), "500 + 10 from 500 in Cash: asks first");
  await click('#pop [data-act="pd-close"]');
  await page.evaluate(() => closeSheet());

  // ---- 6. kept on reload; CSV says what it is; a fee pointing at a draw is unlinked
  await page.reload();
  await settle();
  S = await state();
  ok(
    S.txns.find(x => x.id === p1.id).feeId === f1.id && S.txns.find(x => x.id === f1.id).feeOf === p1.id,
    "the link survives a reload"
  );
  await page.evaluate(() => exportCsv());
  const csv = await page.evaluate(() => window.__files.pop().text);
  const line = csv.split("\n").find(l => l.includes(",loan-fee,"));
  ok(line && /,loan-fee,20,BDT,"Bank",/.test(line) && /,"","Payment fee",,"",""$/.test(line), "CSV: " + line);
  /* editing the payment (another account, a day earlier) takes its fee along */
  await page.evaluate(id => {
    loanOpen("B");
    loanDrawEdit(id);
  }, p1.id);
  await settle();
  const day = await page.evaluate(() => {
    const d = $("#ed-date"),
      v = addDays(d.dataset.v, -1);
    F.editAcc = "c";
    setDateField(d, v);
    saveLoanDraw();
    return v;
  });
  await settle();
  if (await page.isVisible('#pop [data-act="ask-ok"]')) await click('#pop [data-act="ask-ok"]'); // not enough in Cash: go on
  S = await state();
  ok(
    JSON.stringify(
      [p1.id, f1.id].map(id => [S.txns.find(x => x.id === id).account, S.txns.find(x => x.id === id).date])
    ) ===
      JSON.stringify([
        ["c", day],
        ["c", day],
      ]),
    "editing a payment's account and day moves its fee with it"
  );
  await page.evaluate(() => (closeSheet2(), closeSheet()));
  ok(
    await page.evaluate(() => {
      const m = migrate({
        v: 6,
        settings: { cur: "BDT" },
        accounts: [{ id: "a", name: "Bank", type: "bank", currency: "BDT", opening: 0 }],
        txns: [
          {
            id: "d",
            ts: 1,
            date: today(),
            type: "loan",
            amount: 5,
            account: "a",
            dir: "in",
            loan: "X",
            principal: true,
          },
          { id: "f", ts: 2, date: today(), type: "expense", amount: 1, account: "a", cat: "fees", feeOf: "d" },
        ],
        loans: [{ id: "X", kind: "borrow", person: "Z", account: "a", date: today(), status: "open" }],
      });
      return !m.txns.find(x => x.id === "f").feeOf;
    }),
    "a fee may only hang on a transfer or a payment, never on a draw"
  );

  // ---- 7. deleting the loan takes its payments' fees with it
  await page.evaluate(() => loanOpen("B"));
  await settle();
  await click('#sheet [data-act="loan-del"]');
  if (await page.isVisible('#pop [data-act="ask-ok"]')) await click('#pop [data-act="ask-ok"]');
  S = await state();
  ok(!S.loans.some(l => l.id === "B") && !S.txns.some(x => x.id === f1.id), "the loan and its payment's fee are gone");
  ok(!S.txns.some(x => x.feeOf && !S.txns.some(y => y.id === x.feeOf)), "no fee is left without its payment");

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
