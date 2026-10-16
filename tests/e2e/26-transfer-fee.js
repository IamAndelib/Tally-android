// A transfer's fee comes off the paying account but, like the transfer, is never spending: not on the ring, in the
// day's total, the summaries, the balance check or the widget. History shows it with its transfer, not under a
// category, whatever the built-in "fees" category was renamed to (the reported case: "Food").
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("26-transfer-fee");
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
    window.__w = [];
    window.Android = {
      setWidget(j) {
        window.__w.push(JSON.parse(j));
      },
      setReminders() {},
      takeActions() {
        return "[]";
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
  const settle = () => page.waitForTimeout(150);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const t = await page.evaluate(() => today());
  const y = await page.evaluate(() => addDays(today(), -1));
  /* the reported notebook: the built-in "fees" category turned into "Food" */
  await page.evaluate(
    ([t, y]) => {
      const o = migrate({
        v: 6,
        settings: { cur: "BDT", clock: "24", lastCheck: y, dragTip: true },
        accounts: [
          { id: "a", name: "City Bank", type: "bank", currency: "BDT", opening: 119269 },
          { id: "b", name: "Brac Joint", type: "bank", currency: "BDT", opening: 44177 },
        ],
        txns: [{ id: "e1", ts: 1, date: t, type: "expense", amount: 50, account: "a", cat: "groceries", note: "" }],
      });
      Object.assign(
        o.cats.find(c => c.id === "fees"),
        { name: "Food", i: "restaurant", c: "#c98500" }
      );
      localStorage.setItem("tally:v1", JSON.stringify(o));
    },
    [t, y]
  );
  await page.reload();
  await settle();

  // ---- 1. a transfer of 20,000 with a 10 fee
  await page.click('[data-act="tr-new"]');
  await settle();
  await page.click('#sheet [data-act="tr-to"][data-v="b"]');
  await page.fill("#f-amt", "20000");
  await page.click('#sheet [data-act="tr-fee"]');
  await page.fill("#f-fee", "10");
  ok((await page.textContent("#fee-lbl")).includes("not counted as spending"), "the fee field says it isn't spending");
  ok((await page.textContent("#tr-prev")).includes("20,010.00"), "preview: City Bank −20,010");
  await page.click('#sheet [data-act="tr-save"]');
  await page.waitForTimeout(350);
  const bal = await page.evaluate(() => balances());
  ok(bal.a === 99209 && bal.b === 64177, "City Bank −20,010 (and the 50), Brac Joint +20,000 " + JSON.stringify(bal));
  const S = await state(),
    fee = S.txns.find(x => x.feeOf),
    tr = S.txns.find(x => x.type === "transfer");
  ok(fee && fee.amount === 10 && fee.account === "a" && tr.feeId === fee.id, "the fee is linked to its transfer");

  // ---- 2. not spending: the ring, the day's total, the summary, the widget
  const ring = await page.evaluate(() =>
    [...document.querySelectorAll(".rt .cp")].map(e => e.textContent).filter(Boolean)
  );
  ok(ring.length === 1 && ring[0] === "100%", "the ring shows only the groceries " + JSON.stringify(ring));
  ok(
    !(await page.textContent(".dcenter")).includes("60") && (await page.textContent(".dcenter")).includes("50"),
    "spent today: 50, not 60"
  );
  const foodTile = await page.evaluate(() => {
    const b = document.querySelector('.rt [data-v="fees"] .cp');
    return b ? b.textContent : "";
  });
  ok(foodTile === "", "nothing under Food");
  const w = await page.evaluate(() => window.__w[window.__w.length - 1]);
  ok(w && /50\.00/.test(w.spent), "widget: spent today 50 " + (w && w.spent));
  const sm = await page.evaluate(() => {
    summarySheet();
    const v = smBuckets().map(b => b.v);
    closeSheet();
    return v;
  });
  ok(sm[sm.length - 1] === 50, "summary: today 50 " + JSON.stringify(sm.slice(-3)));

  // ---- 3. History: the fee with its transfer, not a category's spending
  await page.evaluate(() => {
    V.screen = "history";
    render();
  });
  await settle();
  const row = (await page.textContent(`[data-v="${fee.id}"]`)).replace(/\s+/g, " ");
  ok(/Transfer fee\s*City Bank → Brac Joint/.test(row) && !row.includes("Food"), "History row: " + row);
  const day = (await page.textContent("#app .day")).replace(/\s+/g, " ");
  ok(day.includes("50.00") && !day.includes("60.00"), "the day's total leaves out the fee: " + day);
  await page.screenshot({ path: OUT + "/history.png" });
  await page.click(`[data-v="${fee.id}"]`);
  await settle();
  ok(await page.evaluate(() => F && F.kind === "tr"), "tapping the fee opens its transfer");
  await page.evaluate(() => closeSheet());

  // ---- 4. saved data: a fee whose transfer is gone is plain spending; a transfer whose fee is gone has none
  const m = await page.evaluate(t => {
    const o = migrate({
      v: 6,
      settings: { cur: "BDT" },
      accounts: [
        { id: "a", name: "A", type: "bank", currency: "BDT", opening: 100 },
        { id: "b", name: "B", type: "bank", currency: "BDT", opening: 0 },
      ],
      txns: [
        { id: "f1", ts: 1, date: t, type: "expense", amount: 5, account: "a", cat: "fees", feeOf: "gone" },
        { id: "t2", ts: 1, date: t, type: "transfer", amount: 10, account: "a", to: "b", feeId: "gone" },
      ],
    });
    return [!("feeOf" in o.txns[0]), !("feeId" in o.txns[1]), o.txns.length];
  }, t);
  ok(m[0] && m[1] && m[2] === 2, "dangling links dropped, entries kept " + JSON.stringify(m));

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
