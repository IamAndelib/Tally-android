// History: its own period (all time by default, never on Home), the period dialog opened from all time (Month tab, no
// month picked, this month marked, Today and Cancel only), picking a month leaving all time.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (w = 393) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 852 }, locale: "en-US" });
    await ctx.addInitScript(() => {
      window.Android = { getColors: () => null, setBars() {} };
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(() => {
      const y = +today().slice(0, 4),
        t = (date, amount, cat) => ({ id: "t" + date + cat, ts: 1, date, type: "expense", amount, account: "a", cat });
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 50000, archived: false });
      S.txns.push(t(y - 3 + "-03-05", 11, "food"));
      S.txns.push(t(today(), 22, "food"));
      save();
      location.reload();
    });
    await page.waitForLoadState();
    await page.waitForTimeout(200);
    return { ctx, page };
  };

  // ---- all time
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      V.screen = "history";
      render();
    });
    const r = await page.evaluate(() => ({
      period: HP.period,
      label: periodLabel(HP),
      rng: range(HP),
      next: canNext(HP),
      homeOk: V.period !== "all",
      rows: document.querySelectorAll("#app .row, #app .tx").length,
      oldDate: historyList().some(t => t.date.startsWith(+today().slice(0, 4) - 3 + "-03")),
    }));
    ok(r.period === "all", "History opens on all time: " + r.period);
    ok(r.label === "All time", "its label: " + r.label);
    ok(r.rng[0] === "0000-01-01" && r.rng[1] === "9999-12-31", "its range: " + r.rng);
    ok(r.oldDate, "the entry from three years ago is listed");
    ok(!r.next, "no later period to step to");
    ok(r.homeOk, "Home does not take all");
    await page.evaluate(() => shiftPeriod(-1, HP));
    ok((await page.evaluate(() => HP.period)) === "all", "shifting does nothing on all time");
    await page.evaluate(() => {
      lastDay = addDays(today(), -1);
      catchUpToday();
    });
    ok((await page.evaluate(() => HP.period)) === "all", "a new day leaves all time alone");

    const d = await page.evaluate(() => {
      periodDialog(HP);
      const m = [...document.querySelectorAll("#pd .mgrid button")];
      return {
        tab: $('#pd [data-act="pd-tab"][aria-pressed="true"]').dataset.v,
        sel: m.filter(b => b.classList.contains("sel")).length,
        now: m.filter(b => b.classList.contains("now")).map(b => b.dataset.v),
        acts: [...document.querySelectorAll("#pd .dlg-act button")].map(b => b.dataset.act),
        tm: today().slice(0, 7),
      };
    });
    ok(d.tab === "month", "the dialog opens on the Month tab: " + d.tab);
    ok(d.sel === 0, "no month picked");
    ok(d.now.length === 1 && d.now[0] === d.tm, "this month is marked: " + d.now);
    ok(d.acts.join() === "pd-today,pd-close", "only Today and Cancel: " + d.acts);
    await page.click("#pd .mgrid button.now");
    const p = await page.evaluate(() => ({ period: HP.period, anchor: HP.anchor }));
    ok(p.period === "month", "picking a month leaves all time: " + JSON.stringify(p));
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
