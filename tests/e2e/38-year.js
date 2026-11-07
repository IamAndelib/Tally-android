// A year as a period (#41): the Year tab of the period dialog (12 years like the month grid, this one ringed, empty ones
// quieter, no future years), Home and History for a year, and moving year by year. The Summary's Year tab: 12 monthly
// bars that scroll sideways, five in view, this month at the right edge, the edges fading where months that have been are, the year against the
// same days of the year before (a past year: against the whole year before), its categories, and "Open this year on
// Home". Settings → Region → Home opens on: Today, This month or This year, which Home opens on and its chip comes
// back to; a broken saved value is mended to Today.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (home, w = 393) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 852 }, locale: "en-US" });
    await ctx.addInitScript(() => {
      window.Android = { getColors: () => null, setBars() {} };
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(home => {
      const y = +today().slice(0, 4),
        t = (date, amount, cat) => ({ id: "t" + date + cat, ts: 1, date, type: "expense", amount, account: "a", cat });
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      if (home) S.settings.home = home;
      S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 50000, archived: false });
      /* this year: 100 a month so far, plus 1,500 rent in January; last year: 80 a month all year */
      for (let m = 1; m <= +today().slice(5, 7); m++) S.txns.push(t(y + "-" + pad(m) + "-01", 100, "food"));
      S.txns.push(t(y + "-01-02", 1500, "housing"));
      for (let m = 1; m <= 12; m++) S.txns.push(t(y - 1 + "-" + pad(m) + "-01", 80, "food"));
      S.txns.push({ id: "in", ts: 1, date: y + "-02-03", type: "income", amount: 900, account: "a", cat: "income" });
      save();
      location.reload();
    }, home);
    await page.waitForLoadState();
    await page.waitForTimeout(200);
    return { ctx, page };
  };

  // ---- the Year tab of the period dialog, and Home for a year
  {
    const { ctx, page } = await open();
    const r = await page.evaluate(() => {
      periodDialog(V);
      $('#pd [data-act="pd-tab"][data-v="year"]').click();
      const btns = [...document.querySelectorAll('#pd .mgrid [data-act="pd-yr"]')];
      const y = +today().slice(0, 4);
      return {
        n: btns.length,
        last: +btns[11].dataset.v,
        now: btns.filter(b => b.classList.contains("now")).map(b => +b.dataset.v),
        dim: btns.filter(b => b.classList.contains("dim")).map(b => +b.dataset.v),
        later: $('#pd [data-act="pd-years"][data-v="12"]').disabled,
        y,
      };
    });
    ok(r.n === 12 && r.last === r.y && r.later, "12 years ending with this one, none later: " + JSON.stringify(r));
    ok(r.now.length === 1 && r.now[0] === r.y, "this year is ringed");
    ok(
      !r.dim.includes(r.y) && !r.dim.includes(r.y - 1) && r.dim.includes(r.y - 2),
      "years with nothing written down are quieter: " + r.dim.join(",")
    );
    await page.click(`#pd [data-act="pd-yr"][data-v="${r.y - 1}"]`);
    const h = await page.evaluate(() => ({
      period: V.period,
      label: $("#app .appbar").textContent,
      chip: !!$('#app [data-act="go-today"]'),
      next: !$('#app [data-act="next"]').disabled,
    }));
    ok(h.period === "year" && h.label.includes(String(r.y - 1)), "Home shows last year: " + h.label);
    ok(h.chip, "with the chip back to today");
    await page.click('#app [data-act="next"]');
    const h2 = await page.evaluate(() => ({
      label: $("#app .appbar").textContent,
      next: $('#app [data-act="next"]') ? $('#app [data-act="next"]').disabled : true,
      n: periodTxns().length,
    }));
    ok(h2.label.includes(String(r.y)) && h2.next, "› moves to this year, and no further: " + JSON.stringify(h2));
    ok(h2.n === +(await page.evaluate(() => today().slice(5, 7))) + 2, "the year's entries: " + h2.n);
    /* History for a year with nothing in it */
    const hist = await page.evaluate(y => {
      V.screen = "history";
      HP.period = "year";
      HP.anchor = y - 3 + "-01-01";
      render();
      return { label: $("#app").textContent.includes(String(y - 3)), empty: $("#app .empty").textContent };
    }, r.y);
    ok(
      hist.label && hist.empty.startsWith("Nothing matches these filters"),
      "History for an empty year: " + hist.empty
    );
    await ctx.close();
  }

  // ---- the Summary's Year tab
  {
    const { ctx, page } = await open();
    const s = await page.evaluate(() => {
      V.period = "year";
      V.anchor = today();
      render();
      summarySheet();
      const ch = $("#smy"),
        on = ch.querySelector(".on");
      return {
        mode: SM.mode,
        cols: ch.querySelectorAll(".smcol").length,
        first: ch.querySelector(".smcol .x").textContent,
        right: Math.abs(on.getBoundingClientRect().right - ch.getBoundingClientRect().right) < 2,
        five: Math.round(ch.clientWidth / on.offsetWidth),
        scrolls: ch.scrollWidth > ch.clientWidth,
        fades: [ch.classList.contains("fl"), ch.classList.contains("fr")],
        head: $("#sm .smd").textContent,
        cats: [...document.querySelectorAll("#sm .smtop .tx .d")].map(d => d.textContent),
        open: $('#sm [data-act="sm-open"]').textContent,
        later: $('#sm [data-act="sm-nav"][data-v="1"]').disabled,
        amt: [...ch.querySelectorAll(".v")].map(v => v.textContent).filter(Boolean),
      };
    });
    ok(s.mode === "y" && s.cols === 12 && s.first === "Jan", "a year on Home opens the Year tab: 12 months from Jan");
    ok(
      s.scrolls && s.right && s.five === 5,
      "the bars scroll sideways, five months in view, this month at the right edge"
    );
    ok(
      s.fades[0] && !s.fades[1],
      "earlier months fade on the left; the months still to come don't fade this one: " + s.fades
    );
    ok(
      s.amt.every(a => !/\.\d\d$/.test(a) && !/[$€]/.test(a)) && s.amt.includes("1,600"),
      "whole amounts on the bars, no currency sign: " + s.amt.join(" ")
    );
    const m = +(await page.evaluate(() => today().slice(5, 7)));
    const want = 100 * m + 1500,
      was = 80 * m,
      pct = Math.round(((want - was) / was) * 100);
    ok(
      s.head.includes("so far") &&
        s.head.includes("$" + want.toLocaleString("en-US") + ".00") &&
        s.head.includes(`↑ ${pct}% vs the same months of`),
      "the year so far against the same months of last year: " + s.head
    );
    ok(s.cats[0].startsWith("Rent") && s.cats.length === 2, "its categories, biggest first: " + s.cats.join(" | "));
    ok(s.open === "Open this year on Home" && s.later, "Open this year on Home; no later year");
    const fade = await page.evaluate(() => {
      const ch = $("#smy");
      ch.scrollLeft = 0;
      ch.dispatchEvent(new Event("scroll"));
      const start = [ch.classList.contains("fl"), ch.classList.contains("fr")];
      ch.scrollLeft = ch.scrollWidth;
      ch.dispatchEvent(new Event("scroll"));
      return { start, end: [ch.classList.contains("fl"), ch.classList.contains("fr")] };
    });
    ok(
      !fade.start[0] && fade.start[1] && fade.end[0] && !fade.end[1],
      "an edge fades only where more months are: " + JSON.stringify(fade)
    );
    /* dragging across the bars scrolls them; it doesn't move to another year */
    const box = await page.evaluate(() => {
      const r = $("#smy").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    ok(
      (await page.evaluate(() => SM.end.slice(0, 4))) === (await page.evaluate(() => today().slice(0, 4))),
      "still this year after a drag"
    );
    /* last year: the whole of it against the year before, December at the end */
    const p = await page.evaluate(() => {
      $('#sm [data-act="sm-nav"][data-v="-1"]').click();
      const ch = $("#smy");
      return {
        head: $("#sm .smd").textContent,
        end: ch.scrollLeft >= ch.scrollWidth - ch.clientWidth - 1,
        on: !!ch.querySelector(".on"),
        later: $('#sm [data-act="sm-nav"][data-v="1"]').disabled,
      };
    });
    ok(
      p.head.includes("$960.00") && !p.head.includes("so far") && p.end && !p.on && !p.later,
      "last year in full, December at the end: " + JSON.stringify(p)
    );
    await page.click('#sm [data-act="sm-open"]');
    const o = await page.evaluate(() => ({
      period: V.period,
      y: V.anchor.slice(0, 4),
      sheet: !!$("#sheet").innerHTML,
    }));
    ok(
      o.period === "year" && o.y === String(new Date().getFullYear() - 1) && !o.sheet,
      "Open this year on Home: last year on Home"
    );
    await ctx.close();
  }

  // ---- the Year tab's list ends with the Charges line, after every category, whatever its size
  {
    const { ctx, page } = await open();
    const r = await page.evaluate(() => {
      const y = today().slice(0, 4);
      S.accounts.push({ id: "b", name: "Cash", type: "cash", currency: "USD", opening: 0, archived: false });
      /* a transfer with a $5.00 charge, and $3.00 of fun: smaller than the charge, still before it */
      S.txns.push(
        { id: "tr", ts: 2, date: y + "-01-05", type: "transfer", amount: 100, account: "a", to: "b", feeId: "trc" },
        { id: "trc", ts: 3, date: y + "-01-05", type: "expense", amount: 5, account: "a", cat: "fees", feeOf: "tr" },
        { id: "fn", ts: 4, date: y + "-01-06", type: "expense", amount: 3, account: "a", cat: "fun" }
      );
      V.period = "year";
      V.anchor = today();
      render();
      summarySheet();
      return {
        cats: [...document.querySelectorAll("#sm .smtop .tx .d")].map(d => d.textContent.replace(/\s+/g, " ").trim()),
        amt: $("#sm .smtop .tx:last-child .a").textContent,
        say: $("#sm .smtop .tx:last-child").getAttribute("aria-label"),
        head: $("#sm .smd").textContent,
      };
    });
    const m = +(await page.evaluate(() => today().slice(5, 7)));
    ok(
      r.cats.length === 4 &&
        r.cats[0].startsWith("Rent") &&
        r.cats[2].startsWith("Fun") &&
        r.cats[3] === "Charges <1%" &&
        r.amt === "$5.00",
      "the year's categories, then Charges <1% with its amount: " + r.cats.join(" | ") + " " + r.amt
    );
    ok(r.say === "Charges, $5.00, less than 1%", "TalkBack: " + r.say);
    ok(
      r.head.includes("$" + (100 * m + 1508).toLocaleString("en-US") + ".00"),
      "the year's total includes the charge: " + r.head
    );
    await ctx.close();
  }

  // ---- Settings → Region → Home opens on
  {
    const { ctx, page } = await open("month");
    const a = await page.evaluate(() => ({ period: V.period, chip: !!$('#app [data-act="go-today"]') }));
    ok(a.period === "month" && !a.chip, "Home opens on this month, without a chip");
    await page.click('#app [data-act="prev"]');
    const chip = await page.textContent('#app [data-act="go-today"]');
    ok(chip.trim() === "This month", "a month back, the chip says This month: " + chip);
    await page.click('#app [data-act="go-today"]');
    ok(
      await page.evaluate(() => V.period === "month" && V.anchor === today() && !$('#app [data-act="go-today"]')),
      "and comes back to this month"
    );
    const row = await page.evaluate(() => {
      V.screen = "settings";
      render();
      return [...document.querySelectorAll('#app [data-act="home-opens"]')].map(
        b => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")
      );
    });
    ok(row.join("|") === "Today|This month*|This year", "the Region row: " + row.join("|"));
    await page.click('#app [data-act="home-opens"][data-v="year"]');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")).settings.home);
    ok(saved === "year", "saved: " + saved);
    await page.reload();
    await page.waitForTimeout(200);
    ok((await page.evaluate(() => V.period)) === "year", "the next start opens on this year");
    const mended = await page.evaluate(() => [
      migrate({ v: 7, settings: { home: "week" } }).settings.home,
      migrate({ v: 6, settings: {} }).settings.home,
    ]);
    ok(mended[0] === "day" && mended[1] === "day", "a broken or missing value is Today: " + mended);
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
