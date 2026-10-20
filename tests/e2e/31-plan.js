// Plan: repeating items (S.repeats) and what is due (upcoming()). Dates fall from the first one every time (month ends,
// last day, leap years); the Plan tab lists what's due (every overdue occurrence, oldest first) and what repeats;
// Record opens the usual form filled in and links the entry it saves; Skip, Pause / Resume, End and Delete; a new
// entry's Repeat starts a series; loans due soon show too; Home shows one line while something is due; saved data
// from before (v6) loads, and repeating items in a backup are checked like everything else.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: "en-US" });
  await ctx.addInitScript(() => {
    window.Android = {
      is24h: () => true,
      setReminders() {},
      takeActions: () => "[]",
      getColors: () => null,
      setBars() {},
      saveFile() {},
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  const settle = () => page.waitForTimeout(150);
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const t = await page.evaluate(() => today());
  const day = n => page.evaluate(([t, n]) => addDays(t, n), [t, n]);
  const seed = async extra => {
    await page.evaluate(
      ([extra, t]) =>
        localStorage.setItem(
          "tally:v1",
          JSON.stringify(
            Object.assign(
              {
                v: 7,
                settings: { cur: "USD", week: 1, clock: "24", lastCheck: t },
                accounts: [
                  { id: "a", name: "Bank", type: "bank", currency: "USD", opening: 5000 },
                  { id: "s", name: "Savings", type: "savings", currency: "USD", opening: 0 },
                ],
                txns: [],
                loans: [],
                assets: [],
                repeats: [],
              },
              extra
            )
          )
        ),
      [extra, t]
    );
    await page.reload();
    await settle();
  };

  // ---- 1. dates: from the first one every time
  const dates = await page.evaluate(() => {
    const r = (first, unit, o) => Object.assign({ first, unit, every: 1, last: false }, o);
    const ks = (x, n) => [...Array(n)].map((_, k) => repDate(x, k));
    return {
      monthEnd: ks(r("2026-01-31", "m"), 4),
      lastDay: ks(r("2026-02-28", "m", { last: true }), 3),
      leap: ks(r("2024-02-29", "y"), 5),
      twoWeeks: ks(r("2026-06-01", "w", { every: 2 }), 3),
      daily: ks(r("2026-12-30", "d"), 3),
      quarter: ks(r("2026-11-30", "m", { every: 3 }), 3),
    };
  });
  ok(
    dates.monthEnd.join() === "2026-01-31,2026-02-28,2026-03-31,2026-04-30",
    "the 31st stays the 31st: " + dates.monthEnd
  );
  ok(dates.lastDay.join() === "2026-02-28,2026-03-31,2026-04-30", "last day of the month: " + dates.lastDay);
  ok(dates.leap.join() === "2024-02-29,2025-02-28,2026-02-28,2027-02-28,2028-02-29", "a yearly Feb 29: " + dates.leap);
  ok(dates.twoWeeks.join() === "2026-06-01,2026-06-15,2026-06-29", "every 2 weeks: " + dates.twoWeeks);
  ok(dates.daily.join() === "2026-12-30,2026-12-31,2027-01-01", "daily over the new year: " + dates.daily);
  ok(dates.quarter.join() === "2026-11-30,2027-02-28,2027-05-30", "every 3 months from a 30th: " + dates.quarter);

  // ---- 2. saved data: v6 loads, a v7 backup's repeating items are checked, a link to a missing series goes
  const m = await page.evaluate(t => {
    const old = migrate({
      v: 6,
      settings: { cur: "USD" },
      accounts: [{ id: "a", name: "Bank", currency: "USD" }],
      txns: [],
    });
    const n = migrate({
      v: 7,
      settings: { cur: "USD" },
      accounts: [
        { id: "a", name: "Bank", currency: "USD" },
        { id: "b", name: "Cash", currency: "USD" },
      ],
      txns: [
        { id: "t1", date: t, type: "expense", amount: 5, account: "a", cat: "bills", rep: "r1", due: t },
        { id: "t2", date: t, type: "expense", amount: 5, account: "a", cat: "bills", rep: "gone", due: t },
      ],
      repeats: [
        { id: "r1", type: "expense", account: "a", cat: "bills", amount: 5, first: t, unit: "m", every: 1 },
        { id: "r2", type: "transfer", account: "a", to: "a", amount: 5, first: t, unit: "m" },
        { id: "r3", type: "expense", account: "zzz", cat: "bills", amount: 5, first: t },
        {
          id: "r4",
          type: "income",
          account: "b",
          cat: "nope",
          amount: "7",
          first: t,
          unit: "q",
          every: 500,
          skip: [t, t, "x"],
        },
        { id: "r5", type: "expense", account: "a", amount: -1, first: t },
      ],
    });
    return {
      v: blank().v,
      old: Array.isArray(old.repeats) && old.repeats.length === 0,
      ids: n.repeats.map(r => r.id).join(),
      r4: n.repeats.find(r => r.id === "r4"),
      t1: n.txns.find(x => x.id === "t1").rep,
      t2: "rep" in n.txns.find(x => x.id === "t2"),
      again: JSON.stringify(migrate(JSON.parse(JSON.stringify(n)))) === JSON.stringify(n),
    };
  }, t);
  ok(m.v === 7 && m.old, "v7, and a save from before has no repeating items");
  ok(m.ids === "r1,r4", "repeating items on a missing account, to itself or of no amount are left out: " + m.ids);
  ok(
    m.r4.cat === "otherin" && m.r4.unit === "m" && m.r4.every === 1 && m.r4.amount === 7 && m.r4.skip.length === 1,
    "odd fields are made sane: " + JSON.stringify(m.r4)
  );
  ok(m.t1 === "r1" && !m.t2, "an entry keeps its link to a series, not to one that's gone");
  ok(m.again, "loading it again changes nothing");

  // ---- 3. the Plan tab, empty
  await seed({});
  const tabs = await page.$$eval("#nav [data-act=tab]", l => l.map(b => b.dataset.v));
  ok(tabs.join() === "home,plan,assets,liabs", "the bar: Home, Plan, Assets, Liabilities: " + tabs);
  await act("tab", "plan");
  await settle();
  ok((await page.textContent("#app")).includes("Nothing due in the next two weeks"), "Plan: nothing due");
  ok(!(await page.$("#app .planline")), "Home has no Plan line with nothing due");

  // ---- 4. a new repeating item, from Plan
  await act("rep-new");
  await settle();
  await act("f-cat", "bills");
  await page.fill("#f-amt", "12.99");
  await page.fill("#f-note", "Phone");
  await act("rp-save");
  await settle();
  let s = await state();
  ok(
    s.repeats.length === 1 && s.repeats[0].amount === 12.99 && s.repeats[0].unit === "m" && s.repeats[0].first === t,
    "saved: monthly, first due today " + JSON.stringify(s.repeats[0])
  );
  ok((await page.textContent("#app .duerow")).includes("Due today"), "Upcoming: due today");
  ok((await page.textContent("#app")).includes("Monthly"), "Repeating: Monthly");
  await act("tab", "home");
  await settle();
  ok(/Phone · today · \$12\.99/.test(await page.textContent("#app .planline")), "Home: one line while it's due");

  // ---- 5. Record: the form, filled in; the saved entry is linked
  await act("tab", "plan");
  await settle();
  await page.click("#app .duerow [data-act=due-rec]");
  await settle();
  ok((await page.inputValue("#f-amt")).replace(/,/g, "") === "12.99", "Record: the amount is filled in");
  ok((await page.inputValue("#f-note")) === "Phone", "and the note");
  await act("tx-save");
  await settle();
  s = await state();
  const e = s.txns.find(x => x.rep === s.repeats[0].id);
  ok(
    e && e.due === t && e.date === t && e.cat === "bills" && e.amount === 12.99,
    "the entry settles today's: " + JSON.stringify(e)
  );
  ok(!(await page.$("#app .duerow")), "nothing due any more");
  ok(
    (await page.textContent("#app")).includes(
      "Next " + (await page.evaluate(d => shortDay(d), await page.evaluate(t => repDate(S.repeats[0], 1), t)))
    ),
    "Repeating: the next date"
  );
  await page.click("#snack [data-act=undo], #snack button");
  await settle();
  ok(!(await state()).txns.length && (await page.$("#app .duerow")), "Undo takes the entry back: due again");

  // ---- 6. overdue: every missed one, oldest first; Record dates it on its day; Skip
  const first = await day(-62);
  await seed({
    repeats: [
      { id: "g", type: "expense", account: "a", cat: "fun", amount: 20, note: "Gym", first, unit: "m", every: 1 },
    ],
  });
  await act("tab", "plan");
  await settle();
  const n = await page.evaluate(() => repInfo(rep("g")).open.length);
  ok(n >= 3, "three months back: " + n + " open");
  ok((await page.textContent("#app .duerow")).includes(n + " due"), "one row says how many are due");
  ok((await page.textContent("#app .duerow")).includes("Overdue"), "and that they're overdue (in words)");
  await page.click("#app .duerow [data-act=due-rec]");
  await settle();
  ok((await page.getAttribute("#f-date", "data-v")) === first, "Record: dated on the oldest's day");
  await act("tx-save");
  await settle();
  ok((await state()).txns[0].due === first, "it settles the oldest");
  await page.click("#app .duerow [data-act=due-open]");
  await settle();
  await act("due-skip", "r:g");
  await settle();
  s = await state();
  ok(s.repeats[0].skip.length === 1 && s.repeats[0].skip[0] > first, "Skip: the next oldest is skipped");
  ok((await page.evaluate(() => repInfo(rep("g")).open.length)) === n - 2, "two fewer open");

  // ---- 7. Pause and Resume: what fell due while paused isn't owed
  await act("rep-edit", "g");
  await settle();
  await act("rp-pause");
  await settle();
  ok(!(await page.$("#app .duerow")) && (await page.textContent("#app")).includes("Paused"), "paused: nothing due");
  await act("rep-edit", "g");
  await settle();
  await act("rp-pause");
  await settle();
  const after = await page.evaluate(() => repInfo(rep("g")).open);
  ok(
    after.every(d => d >= t),
    "resumed: only from today on " + after
  );

  // ---- 8. a new entry's Repeat starts a series, linked to it
  await act("tab", "home");
  await settle();
  await page.evaluate(() => txSheet(null, "expense", "housing"));
  await settle();
  await page.fill("#f-amt", "900");
  await act("f-rep");
  await act("f-repunit", "m");
  await act("tx-save");
  await settle();
  s = await state();
  const rent = s.repeats.find(r => r.cat === "housing");
  ok(rent && rent.amount === 900 && rent.first === t, "Repeat on a new entry starts a monthly series");
  ok(
    s.txns.some(x => x.rep === rent.id && x.due === t),
    "and the entry is its first, settled"
  );
  await act("go", "history");
  await settle();
  ok(!!(await page.$("#app .repmark")), "History marks entries written for a repeating item");

  // ---- 9. a repeating transfer: Record opens the transfer form, filled in
  await seed({
    repeats: [{ id: "sv", type: "transfer", account: "a", to: "s", amount: 100, first: t, unit: "m", note: "Save" }],
  });
  await act("tab", "plan");
  await settle();
  await page.click("#app .duerow [data-act=due-rec]");
  await settle();
  ok(
    (await page.inputValue("#f-amt")) === "100" && (await page.$("#sheet [data-act=tr-save]")),
    "Record: the transfer form"
  );
  await act("tr-save");
  await settle();
  s = await state();
  ok(
    s.txns.length === 1 && s.txns[0].type === "transfer" && s.txns[0].rep === "sv" && s.txns[0].to === "s",
    "a linked transfer"
  );

  // ---- 10. Delete: entries stay, unlinked
  await act("rep-edit", "sv");
  await settle();
  await act("rp-del");
  await settle();
  await page.click('#pop [data-act="ask-ok"]');
  await settle();
  s = await state();
  ok(!s.repeats.length && s.txns.length === 1 && !s.txns[0].rep, "deleted: the entry stays, without the link");

  // ---- 11. loans due soon are in Upcoming too; End stops a series
  const due = await day(3);
  await seed({
    loans: [{ id: "L", kind: "lend", person: "Ann", account: "a", date: t, status: "open" }],
    txns: [{ id: "d", type: "loan", dir: "out", loan: "L", principal: true, amount: 50, account: "a", date: t, due }],
    repeats: [{ id: "w", type: "expense", account: "a", cat: "food", amount: 5, first: t, unit: "w" }],
  });
  await act("tab", "plan");
  await settle();
  const rows = await page.$$eval("#app .duerow .d", l => l.map(x => x.textContent));
  ok(rows.includes("Ann") && rows.length === 2, "Upcoming: the weekly item and the lending due in 3 days " + rows);
  await act("rep-edit", "w");
  await settle();
  await act("rp-endnow");
  await settle();
  ok((await page.evaluate(() => repInfo(rep("w")).soon.length)) === 0, "End: nothing after today");

  // ---- 12. an account or custom category a repeating item uses can't be deleted from under it
  await seed({
    cats: [{ id: "pets", name: "Pets", e: "🐾", c: "#a646c9", kind: "out" }],
    repeats: [{ id: "p", type: "expense", account: "s", cat: "pets", amount: 9, first: t, unit: "m" }],
  });
  await page.evaluate(() => accForm("s"));
  await settle();
  ok(
    !(await page.$("#sheet [data-act=acc-del]")) && (await page.textContent("#sheet")).includes("repeating item uses"),
    "an account a repeating item uses has no Delete, and says why"
  );
  await page.evaluate(() => {
    closeSheet();
    catForm("pets");
    removeCat();
  });
  await settle();
  s = await state();
  ok(
    s.cats.some(c => c.id === "pets" && c.hidden) && s.repeats[0].cat === "pets",
    "its category is hidden, not deleted"
  );

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
