// Fixes from the final 1.4.2 review, each failing before its fix:
//  - a long list drawn anew (a save, Undo) keeps the row that was in view where it was, in History and in the entries
//    sheet an entry was opened from, although its day lists off screen have only an estimated height
//  - rows of a list fitted later stay fitted on a second pass (no stale "far" marks)
//  - a payee longer than the box takes (an old backup) isn't cut by an edit of something else
//  - History keeps only listed entries selected: an Undo that takes one away, or midnight moving to the next month,
//    never leaves an entry out of sight to be deleted
//  - an answer the shell owed the page before a recreate never settles the new page's question
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (scale = 1) => {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
    await ctx.addInitScript(s => {
      window.Android = { getColors: () => null, setBars() {}, fontScale: () => s };
    }, scale);
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 100000, archived: false });
      const base = Date.now();
      for (let i = 0; i < 400; i++)
        S.txns.push({
          id: "t" + i,
          ts: base - i * 1000,
          date: addDays(today(), -Math.floor(i / 3)),
          type: "expense",
          amount: 5 + i,
          account: "a",
          cat: "food",
          note: i % 2 ? "note " + i : "",
        });
      save();
      render();
    });
    return { ctx, page };
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ---- long lists keep their place
  for (const scale of [1, 1.3]) {
    const { ctx, page } = await open(scale);
    await page.evaluate(() => {
      V.screen = "history";
      HP.period = "range";
      HP.rs = addDays(today(), -140);
      HP.re = today();
      render();
    });
    await wait(200);
    const r = await page.evaluate(async () => {
      scrollTo(0, 6000);
      await new Promise(res => setTimeout(res, 200));
      const el = [...document.querySelectorAll("#app .tx[data-v]")].find(e => e.getBoundingClientRect().top > 400);
      const id = el.dataset.v,
        top = el.getBoundingClientRect().top;
      el.click();
      await new Promise(res => setTimeout(res, 200));
      $('#sheet [data-act="tx-save"]').click();
      await new Promise(res => setTimeout(res, 400));
      return [id, Math.round(top), Math.round($(`.tx[data-v="${id}"]`).getBoundingClientRect().top)];
    });
    ok(Math.abs(r[1] - r[2]) <= 2, "History at " + scale + "×: the row saved stays where it was: " + r);
    const s = await page.evaluate(async () => {
      V.screen = "home";
      V.period = "month";
      V.anchor = today();
      render();
      entriesSheet();
      const p = $("#sheet .p");
      for (let y = 0; y <= 4000; y += 400) {
        p.scrollTop = y;
        await new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));
      }
      await new Promise(res => setTimeout(res, 200));
      const y = p.getBoundingClientRect().top + 300,
        el = [...p.querySelectorAll(".tx[data-v]")].find(e => e.getBoundingClientRect().top > y);
      const id = el.dataset.v,
        top = el.getBoundingClientRect().top;
      el.click();
      await new Promise(res => setTimeout(res, 300));
      $('#sheet [data-act="close"]').click();
      await new Promise(res => setTimeout(res, 500));
      return [id, Math.round(top), Math.round($(`#sheet .tx[data-v="${id}"]`).getBoundingClientRect().top)];
    });
    ok(Math.abs(s[1] - s[2]) <= 2, "the entries sheet at " + scale + "×: back where it was: " + s);
    // a second fitting pass after scrolling: nothing left marked far that is near
    const far = await page.evaluate(() => {
      closeSheet();
      V.screen = "history";
      render();
      scrollTo(0, 9000);
      fitFigures($("#app"));
      return [...document.querySelectorAll("#app [data-far]")].filter(l => {
        const b = l.getBoundingClientRect();
        return b.bottom > -800 && b.top < innerHeight + 800;
      }).length;
    });
    ok(far === 0, "a second fitting pass leaves no near list waiting: " + far);
    await ctx.close();
  }

  // ---- a long payee, History's selection, an old answer
  {
    const { ctx, page } = await open();
    const r = await page.evaluate(async () => {
      const out = {},
        long = "Stadtwerke München Energie und Wasser GmbH Kundencenter";
      entry("t0").payee = long;
      txSheet("t0");
      $("#f-amt").value = "7";
      saveTx();
      out.payee = entry("t0").payee === long;
      // Undo takes a selected entry away
      txSheet(null, "expense", "food");
      $("#f-amt").value = "1";
      saveTx();
      const fresh = S.txns[S.txns.length - 1].id;
      V.screen = "history";
      HP.period = "month";
      HP.anchor = today();
      V.sel = new Set([fresh, "t1"]);
      render();
      undoFn();
      out.afterUndo = [...V.sel].join();
      out.header = $("#app .appbar h1").textContent;
      // History on an old month with two of its entries selected, then the day changes: History moves to this month
      const old = addDays(today(), -40); // t120, t121 are from that day
      HP.anchor = old;
      V.sel = new Set(["t120", "t121"]);
      render();
      lastDay = old;
      catchUpToday();
      render();
      out.afterDay = [HP.anchor.slice(0, 7) === today().slice(0, 7), V.sel ? V.sel.size : 0];
      // an answer to the page before a recreate (id 1) doesn't settle this page's question
      let settled = false;
      window.Android.readAutoBackup = () => {};
      readAutoBackup(() => (settled = true));
      onBackedUp("", 1);
      out.stale = settled;
      return out;
    });
    ok(r.payee, "a payee longer than the box takes isn't cut by an edit of the amount");
    ok(
      r.afterUndo === "t1" && r.header === "1 selected",
      "after Undo only the listed entry stays selected: " + r.header
    );
    ok(
      r.afterDay[0] && r.afterDay[1] === 0,
      "when the day changes, entries out of sight are no longer selected: " + r.afterDay
    );
    ok(!r.stale, "an answer owed to the page before a recreate is ignored");
    await ctx.close();
  }

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
