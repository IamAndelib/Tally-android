// A transfer's fee: it is spending in a category the transfer sheet shows and lets you change, remembered for the
// next fee. The built-in Fees is the start, unless that slot was turned into another category (renamed with another
// icon, as "Food") or removed; then Other. The two accounts move by the amount (+ the fee on the paying side).
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("26-transfer-fee-category");
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
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  const settle = () => page.waitForTimeout(150);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const t = await page.evaluate(() => today());
  /* cats: changes to make to the built-in categories after migrate() (by id), plus extra ones */
  const seed = async (cats, settings) => {
    await page.evaluate(
      ([cats, settings, t]) => {
        const o = migrate({
          v: 6,
          settings: Object.assign({ cur: "BDT", clock: "24", lastCheck: t, dragTip: true }, settings),
          accounts: [
            { id: "a", name: "City Bank", type: "bank", currency: "BDT", opening: 109269 },
            { id: "b", name: "Brac Joint", type: "bank", currency: "BDT", opening: 44177 },
          ],
        });
        (cats || []).forEach(c => {
          const x = o.cats.find(k => k.id === c.id);
          if (x) Object.assign(x, c);
          else o.cats.push(Object.assign({ kind: "out", e: "", c: "#5f7389" }, c));
        });
        localStorage.setItem("tally:v1", JSON.stringify(o));
      },
      [cats, settings, t]
    );
    await page.reload();
    await settle();
  };
  const chip = () => page.textContent("#fee-catchip").then(s => s.trim());
  const openTransfer = async () => {
    await page.click('[data-act="tr-new"]');
    await settle();
    await page.click('#sheet [data-act="tr-to"][data-v="b"]');
    await page.fill("#f-amt", "20000");
    await page.click('#sheet [data-act="tr-fee"]');
    await page.fill("#f-fee", "10");
  };
  const save = async () => {
    await page.click('#sheet [data-act="tr-save"]');
    await page.waitForTimeout(350); // a tap where Transfer just was, sooner, would count as a double tap
  };
  const feeEntries = async () => (await state()).txns.filter(x => x.feeOf);

  // ---- 1. a new notebook: the fee is spending in Fees, and the sheet says so
  await seed();
  await openTransfer();
  ok((await chip()) === "Fees", "fee counted in: " + (await chip()));
  ok(
    (await page.getAttribute("#fee-catchip", "aria-label")) === "Fee counted as spending in Fees",
    "the chip says what it is"
  );
  await page.screenshot({ path: OUT + "/fee-fees.png" });
  await save();
  let S = await state(),
    f = (await feeEntries())[0];
  const bal = await page.evaluate(() => balances());
  ok(f && f.cat === "fees" && f.amount === 10 && f.account === "a", "fee saved in Fees, paid by City Bank");
  ok(bal.a === 89259 && bal.b === 64177, "City Bank −20,010, Brac Joint +20,000 " + JSON.stringify(bal));

  // ---- 2. the Fees slot was turned into "Food" (the reported case): Other, and never Food
  await seed([{ id: "fees", name: "Food", i: "restaurant", c: "#c98500" }]);
  await openTransfer();
  ok((await chip()) === "Other", "Fees slot is now Food: the fee starts in Other, not Food: " + (await chip()));
  // pick another category: here a custom "Bank charges" made for it
  await page.evaluate(() => {
    S.cats.push({ id: "bankch", name: "Bank charges", e: "", i: "account_balance", c: "#00897b", kind: "out" });
    save();
  });
  await page.evaluate(() => closeSheet());
  await openTransfer();
  await page.click('#sheet [data-act="fee-showcats"]');
  ok(
    (await page.isVisible("#fee-catgrid")) && (await page.getAttribute("#fee-catchip", "aria-expanded")) === "true",
    "tapping it shows the spending categories"
  );
  await page.screenshot({ path: OUT + "/fee-picker.png" });
  await page.click('#fee-catgrid [data-act="fee-cat"][data-v="bankch"]');
  ok(
    (await chip()) === "Bank charges" && (await page.isHidden("#fee-catgrid")),
    "picking one closes the list and shows it"
  );
  await save();
  f = (await feeEntries()).pop();
  S = await state();
  ok(f.cat === "bankch" && S.settings.feeCat === "bankch", "fee saved in Bank charges, and remembered");
  await openTransfer();
  ok((await chip()) === "Bank charges", "the next fee starts in Bank charges");
  await page.evaluate(() => closeSheet());

  // ---- 3. renamed but still the bank icon ("Bank fees"): still the fee category; removed: Other
  await seed([{ id: "fees", name: "Bank fees" }]);
  await openTransfer();
  ok((await chip()) === "Bank fees", "renamed Fees keeps fees");
  await page.evaluate(() => closeSheet());
  await seed([{ id: "fees", hidden: true }]);
  await openTransfer();
  ok((await chip()) === "Other", "Fees removed: Other");
  await page.evaluate(() => closeSheet());
  // a remembered category that was removed since: back to the default
  await seed([{ id: "x1", name: "Old", i: "label", hidden: true }], { feeCat: "x1" });
  await openTransfer();
  ok((await chip()) === "Fees", "a removed remembered category isn't used");
  await page.evaluate(() => closeSheet());

  // ---- 4. an existing transfer whose fee went to Food: the sheet shows it, and it can be moved
  await seed([{ id: "fees", name: "Food", i: "restaurant", c: "#c98500" }]);
  await page.evaluate(t => {
    S.txns.push(
      { id: "t1", ts: 1, date: t, type: "transfer", amount: 20000, account: "a", to: "b", note: "", feeId: "f1" },
      {
        id: "f1",
        ts: 1,
        date: t,
        type: "expense",
        amount: 10,
        account: "a",
        cat: "fees",
        note: "Transfer fee",
        feeOf: "t1",
      }
    );
    commit();
  }, t);
  await page.evaluate(() => trSheet("t1"));
  await settle();
  ok((await chip()) === "Food", "editing shows where the fee went: Food");
  await page.click('#sheet [data-act="fee-showcats"]');
  await page.click('#fee-catgrid [data-act="fee-cat"][data-v="other"]');
  await save();
  S = await state();
  const fees = S.txns.filter(x => x.feeOf);
  ok(fees.length === 1 && fees[0].id === "f1" && fees[0].cat === "other" && fees[0].amount === 10, "moved to Other");
  const bal2 = await page.evaluate(() => balances());
  ok(bal2.a === 89259 && bal2.b === 64177, "balances unchanged by the move");

  // ---- 5. saved data: feeCat is only ever an id
  const m = await page.evaluate(() => [
    migrate({ v: 6, settings: { cur: "BDT", feeCat: "__proto__" } }).settings.feeCat,
    migrate({ v: 6, settings: { cur: "BDT", feeCat: "bankch" } }).settings.feeCat,
  ]);
  ok(
    m[0] !== "__proto__" && /^x/.test(m[0]) && m[1] === "bankch",
    "feeCat checked like other ids " + JSON.stringify(m)
  );

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
