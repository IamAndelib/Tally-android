// Loan dues per draw: payments go to the draw due soonest; reminders, status, the next due day and the suggested
// payment follow what is really due, not the whole tab. A tab with no payback day is reminded monthly.
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
  // after a tap in a sheet (it may close it): a tap where it was, sooner than 300 ms, counts as a double tap
  const sact = a => page.click(`#sheet [data-act="${a}"]`).then(() => page.waitForTimeout(300));
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
  ok(
    row.includes(await m(1300)) && !row.includes((await m(300)) + " due"),
    "row shows the 1,300 left, not the part due: " + row
  );
  const sub = await page.$eval('[data-act="loan-open"][data-v="L"] .s', e => ({
    text: e.textContent.trim(),
    dot: !!e.querySelector(".adot"),
  }));
  ok(
    sub.dot && /^\S.* · Due /.test(sub.text) && !/^(Into|From) /.test(sub.text) && !sub.text.includes(await m(300)),
    "row line is ● account · Due date, with no Into/From word and no part-due amount: " + sub.text
  );
  ok(
    (await page.textContent('[data-act="loan-open"][data-v="L"] .a small .st')).trim() === "Overdue",
    "the row keeps its status chip under the amount"
  );
  await act("loan-open", "L");
  await settle();
  const head = (await page.textContent("#loan-due")).trim();
  ok(head.startsWith("Due") && head.endsWith(await m(300)), "due card names the 300: " + head);
  ok((await page.inputValue("#f-amt")) === "300.00", "payment pre-filled with the 300 that is due");
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
  ok((await page.inputValue("#f-amt")) === "200.00", "payment pre-filled with the 200 still due");
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
  await act("loan-open", "L");
  await settle();
  ok((await page.inputValue("#f-amt")) === "1,000.00", "nothing due yet: payment pre-filled with all that is left");
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
  r = (await rem()).dues;
  ok(
    r.length === 1 &&
      r[0].monthly === +d.m3.slice(8) &&
      r[0].since === d.m3 &&
      r[0].amount === (await m(500)) &&
      !r[0].date &&
      r[0].kind === "lend",
    "nothing dated left: a monthly reminder on the day the 500 still out was lent: " + JSON.stringify(r)
  );

  // ---- 7. a paid-off draw no longer keeps the tab overdue (the old bug)
  await seed(
    [lend("L", "Rahim", d.m3)],
    [draw("a1", "L", 300, d.m3, d.m2), draw("b2", "L", 700, d.m2, d.p5), pay("p3", "L", 300, d.m1)]
  );
  await page.reload();
  await settle();
  i = await info("L");
  ok(i.st === "partly" && i.nextDue === d.p5, "paid-off overdue draw no longer counts: " + JSON.stringify(i));

  // ---- 8. no payback day at all: monthly from the oldest money still out, both directions; none once settled
  await seed(
    [lend("L", "Rahim", d.m3), Object.assign(lend("B", "Mina", d.m2), { kind: "borrow" }), lend("C", "Sam", d.m3)],
    [
      draw("a1", "L", 200, d.m3, ""),
      draw("b2", "L", 400, d.m1, ""),
      pay("p3", "L", 250, d.m1),
      Object.assign(draw("c4", "B", 900, d.m2, ""), { dir: "in" }),
      draw("e5", "C", 100, d.m3, ""),
      pay("p6", "C", 100, d.m1),
    ]
  );
  await page.reload();
  await settle();
  r = (await rem()).dues;
  const by = id => r.find(x => x.id === id) || {};
  ok(
    by("L").monthly === +d.m1.slice(8) && by("L").since === d.m1 && by("L").amount === (await m(350)),
    "the first 200 is paid back, so the day counts from the 400 still out, for all 350 left: " + JSON.stringify(by("L"))
  );
  ok(
    by("B").kind === "borrow" && by("B").monthly === +d.m2.slice(8) && by("B").amount === (await m(900)),
    "a loan without a payback day reminds too: " + JSON.stringify(by("B"))
  );
  ok(!by("C").id, "a settled tab has no reminder");
  /* "Set a due date" from the notification opens the tab with its payback day picker */
  await page.evaluate(() => window.tallyOpen("loan:L:due"));
  await settle();
  ok(
    !!(await page.$('#sheet [data-act="loan-pay"]')) && !!(await page.$("#pop .dialog")),
    "Set a due date opens the tab and its date picker"
  );
  await page.evaluate(() => {
    S.settings.remind.dues = false;
    save();
    syncReminders();
  });
  ok((await rem()).dues.length === 0, "the due reminders switch turns the monthly ones off too");

  // ---- what is due counts what a draw owes on top (a lend's extra): the reminder, the payment card's amount, its line
  await page.evaluate(() => closePop());
  await seed(
    [lend("X", "Rafi", d.m3)],
    [Object.assign(draw("x1", "X", 300, d.m3, d.m1), { onTop: 50 }), draw("x2", "X", 1000, d.t, d.p5)]
  );
  await page.reload();
  await settle();
  i = await info("X");
  r = (await rem()).dues;
  ok(
    i.dueAmt === 350 && i.left === 1350 && (r.find(x => x.id === "X") || {}).amount === (await m(350)),
    "300 + 50 extra due yesterday: 350 due, 1,350 in all, the reminder asks for 350 " + JSON.stringify([i, r])
  );
  await page.evaluate(() => loanOpen("X"));
  await settle();
  const xline = (await page.textContent("#sheet .aoline")).replace(/\u2060/g, "").trim();
  ok(
    (await page.inputValue("#f-amt")) === "350.00" &&
      xline === "bKash +" + (await m(350)) + " · lending " + (await m(300)) + " + extra " + (await m(50)),
    "the payment card: prefilled with the 350 due, the line naming the extra it covers " + JSON.stringify(xline)
  );

  // ---- saved data: a lending made from the form has its time; a draw saved with no due day keeps no empty one
  await page.evaluate(() => closeSheet());
  await settle();
  await page.evaluate(() => {
    loanForm("lend");
    $("#f-person").value = "Noor";
    $("#f-person").dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.fill("#f-amt", "100");
  await settle();
  await page.evaluate(() => saveLoan());
  await settle();
  const st = await state();
  const nl = st.loans.find(l => l.person === "Noor") || {},
    nd = st.txns.find(t => t.loan === nl.id && t.principal) || {};
  ok(
    nl.ts > 0 && nl.ts === nd.ts && !("due" in nd),
    "a lending made from the form is saved with its time (its draw's), its draw with no due day " + JSON.stringify(nl)
  );
  const edited = async (id, clear) => {
    await page.evaluate(
      ([l, id, clear]) => {
        closeSheet();
        loanOpen(l);
        loanDrawEdit(id);
        if (clear) $("#ed-due").dataset.v = "";
        saveLoanDraw();
      },
      [nl.id, id, clear]
    );
    await settle();
    return (await state()).txns.find(t => t.id === id);
  };
  let ed = await edited(nd.id, false);
  ok(ed && !("due" in ed), "a draw edited with no due day is saved without one " + JSON.stringify(ed));
  await page.evaluate(id => {
    entry(id).due = addDays(today(), 3);
    save();
  }, nd.id);
  ed = await edited(nd.id, true);
  ok(ed && !("due" in ed), "… and a due day cleared in the edit is removed, not saved empty " + JSON.stringify(ed));

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
