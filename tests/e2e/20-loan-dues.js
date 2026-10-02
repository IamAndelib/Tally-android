// Loan dues per draw: payments go to the draw due soonest; reminders, status, the next due day and the suggested
// payment follow what is really due, not the whole tab.
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("20-loan-dues");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    locale: "en-CA",
  });
  await ctx.addInitScript(() => {
    window.__q = JSON.parse(sessionStorage.getItem("q") || "[]");
    window.Android = {
      setReminders(j) {
        window.__rem = JSON.parse(j);
      },
      requestNotifications() {},
      takeActions() {
        const q = window.__q;
        window.__q = [];
        sessionStorage.setItem("q", "[]");
        return JSON.stringify(q);
      },
      getColors() {
        return null;
      },
      setBars() {},
      saveFile() {},
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  const d = await page.evaluate(() => {
    const f = n => {
      const y = new Date();
      y.setDate(y.getDate() + n);
      return (
        y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0")
      );
    };
    return { t: f(0), m1: f(-1), m2: f(-2), m3: f(-3), p1: f(1), p5: f(5), p8: f(8) };
  });
  const draw = (id, loan, amount, date, due) =>
    Object.assign(
      { id, ts: 1000 + Number(id.replace(/\D/g, "")), date, type: "loan", dir: "out", loan, amount, account: "k" },
      { principal: true },
      due ? { due } : {}
    );
  const pay = (id, loan, amount, date) => ({ id, ts: 5000, date, type: "loan", dir: "in", loan, amount, account: "k" });
  const seed = (loans, txns) =>
    page.evaluate(
      ([d, loans, txns]) =>
        localStorage.setItem(
          "tally:v1",
          JSON.stringify({
            v: 6,
            settings: { cur: "BDT", lastCheck: d.t },
            accounts: [{ id: "k", name: "bKash", type: "wallet", currency: "BDT", opening: 10000 }],
            txns,
            loans,
          })
        ),
      [d, loans, txns]
    );
  const lend = (id, person, date) => ({ id, kind: "lend", person, account: "k", date, note: "", status: "open" });
  const settle = () => page.waitForTimeout(150);
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const sact = a => page.click(`#sheet [data-act="${a}"]`);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const rem = () => page.evaluate(() => window.__rem);
  const info = id =>
    page.evaluate(id => {
      const i = loanInfo(loan(id));
      return { left: i.left, nextDue: i.nextDue, dueAmt: i.dueAmt, st: i.st, rem: i.rem };
    }, id);
  const m = n => page.evaluate(n => money(n, "BDT"), n);

  // ---- 1. 300 due yesterday, then 1000 more today, due in 5 days
  await seed([lend("L", "Rahim", d.m2)], [draw("a1", "L", 300, d.m2, d.m1), draw("b2", "L", 1000, d.t, d.p5)]);
  await page.reload();
  await settle();
  let i = await info("L");
  ok(
    i.left === 1300 && i.dueAmt === 300 && i.nextDue === d.m1 && i.st === "overdue",
    "300 overdue of 1300: " + JSON.stringify(i)
  );
  let r = (await rem()).dues;
  ok(
    r.length === 1 && r[0].date === d.m1 && r[0].amount === (await m(300)) && r[0].total === (await m(1300)),
    "reminder asks for 300, with 1,300 in all: " + JSON.stringify(r)
  );
  await act("tab", "assets");
  await settle();
  const row = (await page.textContent('[data-act="loan-open"][data-v="L"]')).trim();
  ok(row.includes((await m(300)) + " due") && row.includes(await m(1300)), "row shows 300 due and 1,300 left: " + row);
  await act("loan-open", "L");
  await settle();
  const head = (await page.textContent("#loan-due")).trim();
  ok(head.startsWith("Payback day") && head.endsWith(await m(300)), "due card names the 300: " + head);
  ok((await page.inputValue("#f-amt")) === "300", "payment pre-filled with the 300 that is due");
  const m300 = await m(300),
    m1000 = await m(1000);
  for (const x of await page.$$("#sheet .tx.exp")) await x.click();
  let mores = await page.$$eval("#sheet .tx.exp .more", els => els.map(e => e.textContent));
  ok(
    mores.some(s => s.includes(m300 + " left")) && mores.some(s => s.includes(m1000 + " left")),
    "each draw shows what is still out: " + JSON.stringify(mores)
  );

  // ---- 2. part of it paid: 100 → 200 due, 1,200 in all
  await page.fill("#f-amt", "100");
  await sact("loan-pay");
  await settle();
  i = await info("L");
  r = (await rem()).dues;
  ok(i.dueAmt === 200 && i.left === 1200 && i.st === "overdue", "after 100: 200 still overdue of 1200");
  ok(r[0].amount === (await m(200)) && r[0].total === (await m(1200)), "reminder follows: 200, 1,200 in all");

  // ---- 3. the rest of the 300 paid: the next due day moves on to the 1000's, no longer overdue
  await act("loan-open", "L");
  await settle();
  ok((await page.inputValue("#f-amt")) === "200", "payment pre-filled with the 200 still due");
  await sact("loan-pay");
  await settle();
  i = await info("L");
  r = (await rem()).dues;
  ok(
    i.nextDue === d.p5 && i.st === "partly" && i.dueAmt === 1000 && i.rem.a1 === 0,
    "300 paid off, next due is the 1000's: " + JSON.stringify(i)
  );
  ok(
    r.length === 1 && r[0].date === d.p5 && r[0].amount === (await m(1000)) && r[0].total === "",
    "reminder moves to the 1000's day, no total: " + JSON.stringify(r)
  );
  await page.waitForTimeout(300); // a tap right where Pay just was, sooner, counts as a double tap
  await act("loan-open", "L");
  await settle();
  ok((await page.inputValue("#f-amt")) === "1,000", "nothing due yet: payment pre-filled with all that is left");
  ok(!(await page.textContent("#loan-due")).includes(m1000), "card heading has no amount once all that is left is due");
  for (const x of await page.$$("#sheet .tx.exp")) await x.click();
  mores = await page.$$eval("#sheet .tx.exp .more", els => els.map(e => e.textContent));
  ok(
    mores.some(s => s.includes("paid off")),
    "the 300 reads paid off: " + JSON.stringify(mores)
  );
  await page.screenshot({ path: OUT + "/after-300.png" });
  await act("close");

  // ---- 4. the 300 still unpaid when the 1000 comes due: the whole 1,300, dated from the missed day
  await seed([lend("L", "Rahim", d.m3)], [draw("a1", "L", 300, d.m3, d.m2), draw("b2", "L", 1000, d.m2, d.t)]);
  await page.reload();
  await settle();
  r = (await rem()).dues;
  ok(
    r[0].amount === (await m(1300)) && r[0].total === "" && r[0].date === d.m2,
    "both due: 1,300 from the older day: " + JSON.stringify(r)
  );

  // ---- 5. +1 day from the notification moves every unpaid draw due by today, not the future one
  await seed(
    [lend("L", "Rahim", d.m3)],
    [draw("a1", "L", 300, d.m3, d.m2), draw("b2", "L", 200, d.m3, d.m1), draw("c3", "L", 900, d.m3, d.p5)]
  );
  await page.evaluate(() => sessionStorage.setItem("q", JSON.stringify([{ type: "extend", id: "L", days: 1 }])));
  await page.reload();
  await settle();
  let S = await state();
  const due = id => S.txns.find(t => t.id === id).due;
  ok(
    due("a1") === d.p1 && due("b2") === d.p1 && due("c3") === d.p5,
    "both overdue draws move to tomorrow, the later one stays"
  );

  // ---- 6. a draw without a due date is paid after the dated ones
  await seed(
    [lend("L", "Rahim", d.m3)],
    [draw("a1", "L", 500, d.m3, ""), draw("b2", "L", 300, d.m2, d.p8), pay("p3", "L", 300, d.m1)]
  );
  await page.reload();
  await settle();
  i = await info("L");
  ok(
    i.rem.b2 === 0 && i.rem.a1 === 500 && i.nextDue === "" && i.st === "partly",
    "payment went to the dated draw: " + JSON.stringify(i)
  );
  ok((await rem()).dues.length === 0, "nothing dated left, no reminder");

  // ---- 7. a paid-off draw no longer keeps the tab overdue (the old bug)
  await seed(
    [lend("L", "Rahim", d.m3)],
    [draw("a1", "L", 300, d.m3, d.m2), draw("b2", "L", 700, d.m2, d.p5), pay("p3", "L", 300, d.m1)]
  );
  await page.reload();
  await settle();
  i = await info("L");
  ok(i.st === "partly" && i.nextDue === d.p5, "paid-off overdue draw no longer counts: " + JSON.stringify(i));

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
