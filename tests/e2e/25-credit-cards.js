// Credit cards: a card's limit and its monthly bill (statement day → bill, due day → when to pay it), what is owed and
// what is left to spend, Pay card, the bill on the Liabilities row, card bill reminders, the card fields in the
// account form, and saved data with card fields from anywhere.
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("25-credit-cards");
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
    window.__rem = [];
    window.Android = {
      setReminders(j) {
        window.__rem.push(JSON.parse(j));
      },
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
  const snackText = () => page.textContent("#snack").catch(() => "");
  const t = await page.evaluate(() => today()); // 2026-06-17 under the test clock
  const d = n => page.evaluate(n => addDays(today(), n), n);
  const [d12, d7, d5, d3, d2] = [await d(-12), await d(-7), await d(-5), await d(-3), await d(-2)];
  const X = (id, date, type, amount, account, extra) =>
    Object.assign({ id, ts: 1, date, type, amount, account, note: "" }, extra || {});
  const seed = async extra => {
    await page.evaluate(
      o => localStorage.setItem("tally:v1", JSON.stringify(o)),
      Object.assign(
        {
          v: 6,
          settings: { cur: "USD", clock: "24", lastCheck: t, dragTip: true },
          accounts: [
            { id: "b", name: "Bank", type: "bank", currency: "USD", opening: 5000 },
            /* owes 100 at the start; statement on the 10th, due on the 28th, limit 1,000 */
            {
              id: "c",
              name: "Visa",
              type: "card",
              currency: "USD",
              opening: -100,
              limit: 1000,
              stmtDay: 10,
              dueDay: 28,
            },
          ],
          txns: [
            X("s1", d12, "expense", 200, "c", { cat: "shopping" }), // on the 10 Jun statement
            X("s2", d5, "expense", 50, "c", { cat: "food" }), // after it: the next bill
            X("p1", d3, "transfer", 120, "b", { to: "c" }), // a payment
            X("r1", d2, "income", 10, "c", { cat: "otherin" }), // a refund
          ],
          loans: [],
          assets: [],
        },
        extra
      )
    );
    await page.reload();
    await settle();
  };
  await seed({});

  // ---- 1. the bill: what was owed on the statement day, less what came in since
  const bill = await page.evaluate(() => cardBill(acc("c")));
  ok(
    bill.stmt === "2026-06-10" && bill.due === "2026-06-28" && bill.bill === 300 && bill.paid === 130,
    "bill of 10 Jun: 300 owed then, 130 paid since " + JSON.stringify(bill)
  );
  ok(bill.left === 170 && bill.state === "due" && bill.days === 11, "170 left, due in 11 days");
  const owed = await page.evaluate(() => cardOwed(acc("c")));
  ok(owed.owed === 220 && owed.avail === 780, "owes 220 now, 780 of the limit left " + JSON.stringify(owed));
  const days = await page.evaluate(() => [
    cardBill({ type: "card", id: "z", stmtDay: 31, dueDay: 20 }, "2026-06-30"),
    cardBill({ type: "card", id: "z", stmtDay: 31, dueDay: 20 }, "2026-03-01"),
    cardBill({ type: "card", id: "z", stmtDay: 5, dueDay: 5 }, "2026-06-17"),
  ]);
  ok(days[0].stmt === "2026-06-30" && days[0].due === "2026-07-20", "the 31st in June is the 30th");
  ok(days[1].stmt === "2026-02-28" && days[1].due === "2026-03-20", "and in February the 28th");
  ok(days[2].stmt === "2026-06-05" && days[2].due === "2026-07-05", "same day: due the next month");
  ok(
    (await page.evaluate(() => cardBill(acc("b")))) === null &&
      (await page.evaluate(() => cardBill({ type: "card", id: "z" }))) === null,
    "no bill for a bank, or a card without bill days"
  );

  // ---- 2. the card sheet
  await page.evaluate(() => accOpen("c"));
  await settle();
  const hero = (await page.textContent("#sheet .hero")).replace(/\s+/g, " ");
  ok(/You owe/.test(hero) && hero.includes("$220.00"), "hero: you owe $220.00: " + hero);
  ok((await page.textContent("#sheet .cardlim")).includes("Available $780.00"), "limit: $780.00 available");
  ok(
    (await page.getAttribute('#sheet .cardlim [role="progressbar"]', "aria-valuenow")) === "22",
    "the limit bar says 22% used"
  );
  const billCard = (await page.textContent("#sheet .cardbill")).replace(/\s+/g, " ");
  ok(
    billCard.includes("$170.00") && /Paid \$130\.00 of \$300\.00/.test(billCard) && /11 days/.test(billCard),
    "bill card: " + billCard
  );
  await page.screenshot({ path: OUT + "/card-sheet.png" });

  // ---- 3. the Liabilities row shows the bill
  await page.evaluate(() => {
    closeSheet();
    V.screen = "liabs";
    render();
  });
  await settle();
  const row = (await page.textContent('[data-act="acc-open"][data-v="c"]')).replace(/\s+/g, " ");
  ok(row.includes("$170.00 due") && !row.includes("Overdue"), "row: " + row);
  await page.screenshot({ path: OUT + "/liabilities.png" });

  // ---- 4. the reminder: 2 days before the due date, with the due date and what to pay
  await page.evaluate(() => syncReminders());
  let rem = await page.evaluate(() => window.__rem[window.__rem.length - 1].dues.filter(x => x.kind === "card"));
  ok(
    rem.length === 1 &&
      rem[0].id === "c" &&
      rem[0].due === "2026-06-28" &&
      rem[0].date === "2026-06-26" &&
      rem[0].amount === "$170.00",
    "card reminder " + JSON.stringify(rem)
  );

  // ---- 5. Pay card: a transfer into the card of what is left, from the bank
  await page.evaluate(() => accOpen("c"));
  await settle();
  await page.click('#sheet [data-act="card-pay"]');
  await settle();
  const tr = await page.evaluate(() => ({ from: F.from, to: F.to, amt: $("#f-amt").value }));
  ok(
    tr.from === "b" && tr.to === "c" && tr.amt === "170",
    "Pay card opens a transfer of 170 from Bank " + JSON.stringify(tr)
  );
  await page.click('#sheet [data-act="tr-save"]');
  await page.waitForTimeout(300);
  ok((await page.evaluate(() => cardBill(acc("c")).state)) === "paid", "after it the bill is paid");
  await page.evaluate(() => syncReminders());
  rem = await page.evaluate(() => window.__rem[window.__rem.length - 1].dues.filter(x => x.kind === "card"));
  ok(rem.length === 0, "and no card reminder any more");
  ok((await page.textContent('[data-act="acc-open"][data-v="c"]')).includes("Bill paid"), "the row says Bill paid");
  await page.evaluate(() => accOpen("c"));
  await settle();
  ok(
    (await page.textContent("#sheet .cardbill")).includes("Paid") && !(await page.$('#sheet [data-act="card-pay"]')),
    "the sheet says Paid, without Pay card"
  );
  await page.evaluate(() => closeSheet());

  // ---- 6. overdue: due on the 15th, already past, not paid
  await seed({});
  await page.evaluate(() => {
    acc("c").dueDay = 15;
    save();
    V.screen = "liabs";
    render();
  });
  await settle();
  ok((await page.evaluate(() => cardBill(acc("c")).state)) === "overdue", "past the due day unpaid: overdue");
  ok((await page.textContent('[data-act="acc-open"][data-v="c"]')).includes("Overdue"), "the row has an Overdue pill");
  await page.evaluate(() => accOpen("c"));
  await settle();
  ok((await page.textContent("#sheet .cardbill")).includes("Overdue"), "so does the bill card");
  await page.evaluate(() => closeSheet());
  // over the limit
  await page.evaluate(() => {
    acc("c").limit = 200;
    save();
    accOpen("c");
  });
  await settle();
  ok((await page.textContent("#sheet .cardlim")).includes("Over the limit by $20.00"), "over the limit by 20");
  await page.evaluate(() => closeSheet());

  // ---- 7. a notification opens the card, or Pay card
  await seed({});
  await page.evaluate(() => openFromNative("card:c:pay"));
  await settle();
  ok(await page.evaluate(() => F && F.kind === "tr" && F.to === "c"), "card:<id>:pay opens Pay card");
  await page.evaluate(() => openFromNative("card:c"));
  await settle();
  ok(await page.evaluate(() => F && F.kind === "acc" && F.id === "c"), "card:<id> opens the card");

  // ---- 8. Doesn't match? on a card is typed as what is owed
  await page.fill("#f-actual", "300");
  ok((await page.textContent("#fix-prev")).includes("Raises what you owe by $80.00"), "preview: raises by 80");
  await page.click('#sheet [data-act="fix-save"]');
  await settle();
  ok((await page.evaluate(() => cardOwed(acc("c")).owed)) === 300, "now owes 300");

  // ---- 9. the account form: a card asks what is owed, its limit and its bill dates
  await seed({ accounts: [{ id: "b", name: "Bank", type: "bank", currency: "USD", opening: 5000 }], txns: [] });
  await page.evaluate(() => accForm());
  await settle();
  ok(await page.isHidden("#card-wrap"), "a bank: no card fields");
  await page.click('[data-act="f-type"][data-v="card"]');
  ok(
    (await page.isVisible("#card-wrap")) && (await page.textContent("#f-openlbl")) === "You owe now",
    "a card: You owe now, limit and bill dates"
  );
  await page.screenshot({ path: OUT + "/card-form.png" });
  await page.fill("#f-name", "Mastercard");
  await page.fill("#f-open", "500");
  await page.fill("#f-limit", "2,000");
  await page.evaluate(() => setDateField($("#f-stmt"), "2026-06-05"));
  await page.click('#sheet [data-act="acc-save"]');
  await settle();
  ok((await snackText()).includes("Add both bill dates"), "one bill date alone is refused");
  await page.evaluate(() => setDateField($("#f-duedate"), "2026-06-01"));
  await page.click('#sheet [data-act="acc-save"]');
  await settle();
  ok((await snackText()).includes("due after the statement"), "a due date before the statement is refused");
  await page.evaluate(() => setDateField($("#f-duedate"), "2026-06-25"));
  await page.click('#sheet [data-act="acc-save"]');
  await settle();
  let S = await state();
  const mc = S.accounts.find(a => a.name === "Mastercard");
  ok(
    mc && mc.type === "card" && mc.opening === -500 && mc.limit === 2000 && mc.stmtDay === 5 && mc.dueDay === 25,
    "saved: owes 500 (stored -500), limit 2,000, days 5 and 25 " + JSON.stringify(mc)
  );
  await page.evaluate(id => accForm(id), mc.id);
  await settle();
  ok(
    (await page.inputValue("#f-open")) === "500" &&
      (await page.getAttribute("#f-stmt", "data-v")) === "2026-06-05" &&
      (await page.getAttribute("#f-duedate", "data-v")) === "2026-06-25",
    "editing shows 500 owed and the bill dates"
  );
  // turned into a bank: the card fields go
  await page.click('[data-act="f-type"][data-v="bank"]');
  await page.fill("#f-open", "0");
  await page.click('#sheet [data-act="acc-save"]');
  await settle();
  S = await state();
  const was = S.accounts.find(a => a.id === mc.id);
  ok(was.type === "bank" && !("limit" in was) && !("stmtDay" in was), "no longer a card: limit and days removed");
  // a negative amount owed asks first
  await page.evaluate(() => accForm());
  await settle();
  await page.click('[data-act="f-type"][data-v="card"]');
  await page.fill("#f-name", "Amex");
  await page.fill("#f-open", "-50");
  await page.click('#sheet [data-act="acc-save"]');
  await settle();
  ok((await page.textContent("#pop")).includes("Card in credit?"), "a negative amount owed: asks first");
  await page.click('#pop [data-act="pd-close"]');
  await page.evaluate(() => closeSheet());

  // ---- 10. saved data from anywhere: card fields checked, balances unchanged
  const m = await page.evaluate(() =>
    migrate({
      v: 6,
      settings: { cur: "USD" },
      accounts: [
        { id: "c1", name: "A", type: "card", currency: "USD", opening: -10, limit: "abc", stmtDay: 0, dueDay: 40 },
        { id: "c2", name: "B", type: "card", currency: "USD", opening: -20, limit: 500, stmtDay: 10 },
        { id: "c3", name: "C", type: "card", currency: "USD", opening: -30, limit: 900, stmtDay: 3, dueDay: 23 },
        { id: "b1", name: "D", type: "bank", currency: "USD", opening: 40, limit: 100, stmtDay: 3, dueDay: 23 },
      ],
    }).accounts.map(a => [a.opening, a.limit, a.stmtDay, a.dueDay])
  );
  ok(
    JSON.stringify(m) ===
      JSON.stringify([
        [-10, undefined, undefined, undefined],
        [-20, 500, undefined, undefined],
        [-30, 900, 3, 23],
        [40, undefined, undefined, undefined],
      ]),
    "bad fields dropped, one day alone dropped, banks get none, balances kept " + JSON.stringify(m)
  );
  // a card from before bill days: no bill, a nudge to add the dates
  await seed({
    accounts: [{ id: "c", name: "Old card", type: "card", currency: "USD", opening: -100 }],
    txns: [],
  });
  await page.evaluate(() => accOpen("c"));
  await settle();
  ok(
    (await page.isVisible('#sheet [data-act="acc-form"][data-v="c"]')) &&
      (await page.textContent("#sheet")).includes("Add bill dates") &&
      !(await page.$("#sheet .cardlim")),
    "an older card: Add bill dates, no limit bar"
  );
  await page.screenshot({ path: OUT + "/card-old.png" });

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
