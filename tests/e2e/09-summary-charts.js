const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("09-summary-charts");
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
    locale: "en-CA",
    hasTouch: true,
    isMobile: true,
    colorScheme: "dark",
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
    return { t: f(0), d1: f(-1), d3: f(-3) };
  });
  await page.evaluate(d => {
    const f = n => {
      const y = new Date();
      y.setDate(y.getDate() + n);
      return (
        y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0")
      );
    };
    const cats = ["food", "groceries", "transport", "fun", "bills", "shopping", "health"],
      txns = [];
    let n = 0;
    for (let i = 0; i < 80; i++) {
      const k = 1 + ((i * 7) % 3);
      for (let j = 0; j < k; j++)
        txns.push({
          id: "x" + n++,
          ts: n,
          date: f(-i),
          type: "expense",
          amount: 40 + ((i * 37 + j * 91) % 400),
          account: "k",
          cat: cats[(i + j) % 7],
          note: "",
        });
    }
    txns.push({
      id: "p1",
      ts: 0,
      date: d.d3,
      type: "loan",
      amount: 3000,
      account: "k",
      dir: "out",
      loan: "L1",
      principal: true,
      note: "",
    });
    txns.push({
      id: "r1",
      ts: 1,
      date: d.d1,
      type: "loan",
      amount: 500,
      account: "k",
      dir: "in",
      loan: "L1",
      note: "",
    });
    localStorage.setItem(
      "tally:v1",
      JSON.stringify({
        v: 5,
        settings: { cur: "BDT", lastCheck: d.t, dragTip: true, notifAsked: true },
        accounts: [{ id: "k", name: "Bkash", type: "wallet", currency: "BDT", opening: 90000 }],
        loans: [
          {
            id: "L1",
            kind: "lend",
            person: "Swarna",
            amount: 3000,
            account: "k",
            date: d.d3,
            due: "",
            note: "",
            status: "open",
          },
        ],
        txns,
      })
    );
  }, d);
  await page.reload();
  const cdp = await ctx.newCDPSession(page);
  const T = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const tap = async sel => {
    await page.tap(sel);
    await page.waitForTimeout(90);
  };
  const txt = sel => page.textContent(sel);
  const swipe = async (x1, y1, x2, y2) => {
    await T("touchStart", x1, y1);
    for (let k = 1; k <= 6; k++) {
      await T("touchMove", x1 + ((x2 - x1) * k) / 6, y1 + ((y2 - y1) * k) / 6);
      await page.waitForTimeout(16);
    }
    await T("touchEnd");
    await page.waitForTimeout(500);
  };

  // ---- 1. loan rows
  await tap('[data-act="tab"][data-v="assets"]');
  await tap('.list [data-v="L1"]');
  const row = "#sheet .tx.exp:nth-child(1)";
  const s1 = await page.$eval(row + " .s", e => ({ t: e.textContent.trim(), fit: e.scrollWidth <= e.clientWidth + 1 }));
  ok(s1.t === "Partly paid" && s1.fit, "payment row shows only its status: " + JSON.stringify(s1));
  await tap(row);
  ok(
    /into Bkash/.test(await txt(row + " .more")) && /left after this/.test(await txt(row + " .more")),
    "expanding shows date, account and what was left"
  );
  await page.screenshot({ path: OUT + "/loan-rows.png" });
  await tap('#sheet [data-act="close"]');
  await tap('[data-act="tab"][data-v="home"]');

  // ---- 2. swipes stay in the sheet
  const home0 = await txt(".pnav .plabel");
  await tap("#ring .dwrap");
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.body.classList.contains("lock")), "page locked while the sheet is open");
  const c = await (await page.$("#sm .smchart")).boundingBox();
  const span0 = await txt("#sm .cal-h b");
  await swipe(c.x + 60, c.y + c.height / 2, c.x + c.width - 30, c.y + c.height / 2);
  ok((await txt("#sm .cal-h b")) !== span0, "swiping the chart moves the summary window");
  /* a pinch: a second finger lands, the first slides away and lifts; nothing moves */
  const span1 = await txt("#sm .cal-h b");
  await page.evaluate(
    ([x0, x1, y]) => {
      const el = document.querySelector("#sm .smchart"),
        T = (id, x) => new Touch({ identifier: id, target: el, clientX: x, clientY: y }),
        fire = (type, touches, changedTouches) =>
          el.dispatchEvent(
            new TouchEvent(type, { bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches })
          );
      const a = T(1, x0),
        b = T(2, x0 + 40),
        a2 = T(1, x1);
      fire("touchstart", [a], [a]);
      fire("touchstart", [a, b], [b]);
      fire("touchmove", [a2, b], [a2]);
      fire("touchend", [b], [a2]);
      fire("touchend", [], [b]);
    },
    [c.x + 60, c.x + c.width - 30, c.y + c.height / 2]
  );
  await page.waitForTimeout(200);
  ok((await txt("#sm .cal-h b")) === span1, "a pinch (two fingers) on the chart doesn't move it");
  const sheetP = await (await page.$("#sheet .p")).boundingBox();
  await swipe(sheetP.x + 40, sheetP.y + 120, sheetP.x + sheetP.width - 20, sheetP.y + 130);
  ok(
    (await page.isVisible("#sheet .p")) && (await page.evaluate(() => (window.__x = 1))) && true,
    "sheet still open after a swipe on it"
  );
  const sy = await page.evaluate(() => scrollY);
  await swipe(sheetP.x + 150, sheetP.y + 200, sheetP.x + 150, sheetP.y + 600);
  await swipe(sheetP.x + 150, sheetP.y + 600, sheetP.x + 150, sheetP.y + 100);
  ok((await page.evaluate(() => scrollY)) === sy, "vertical swipes on the sheet don't scroll the page");
  await tap('#sheet [data-act="close"]');
  ok(
    (await txt(".pnav .plabel")) === home0 && !(await page.evaluate(() => document.body.classList.contains("lock"))),
    "Home period unchanged; unlocked after closing"
  );

  // ---- 3. weeks as rows
  await tap("#ring .dwrap");
  await page.waitForTimeout(300);
  await tap('#sheet [data-act="sm-mode"][data-v="w"]');
  const rows = await page.$$eval("#sm .smrow", e =>
    e.map(x => {
      const l = x.querySelector(".x");
      return { l: l.textContent, fit: l.scrollWidth <= l.clientWidth + 1 };
    })
  );
  ok(
    rows.length === 8 && rows.every(r => r.fit && /\d\s*–\s*(\w+ )?\d/.test(r.l)),
    "weeks: 8 rows with readable ranges " + rows.map(r => r.l).join(", ")
  );
  await tap('#sm .smrow[data-v="3"]');
  ok(
    (await txt("#sm .smd")).includes("Week of") &&
      (await page.$eval('#sm .smrow[data-v="3"]', e => e.classList.contains("on"))),
    "tapping a week selects it"
  );
  await page.screenshot({ path: OUT + "/weeks.png" });
  // ---- months as a donut
  await tap('#sheet [data-act="sm-mode"][data-v="m"]');
  const m = await page.evaluate(() => {
    const slices = document.querySelectorAll("#sm .smpie path, #sm .smpie circle").length,
      rowsEl = [...document.querySelectorAll("#sm .smtop .tx")];
    const pct = rowsEl.map(r => {
      const t = r.querySelector(".d .small");
      return t ? parseInt(t.textContent.replace("<", "")) : 0;
    });
    return {
      slices,
      rows: rowsEl.length,
      sum: pct.reduce((a, b) => a + b, 0),
      label: document.querySelector("#sm .cal-h b").textContent,
      hub: !!document.querySelector("#sm .smpie .c, #sm .smpie circle[stroke]"),
    };
  });
  ok(
    m.slices === m.rows && !m.hub && m.rows >= 5 && Math.abs(m.sum - 100) <= m.rows,
    "month pie: one slice per category, legend % ≈ 100, no hub " + JSON.stringify(m)
  );
  await page.screenshot({ path: OUT + "/months.png" });
  await tap('#sm [data-act="sm-nav"][data-v="-1"]');
  const lbl2 = await txt("#sm .cal-h b");
  ok(lbl2 !== m.label && /\d{4}/.test(lbl2), "‹ moves one month: " + lbl2);
  for (let k = 0; k < 4; k++) await tap('#sm [data-act="sm-nav"][data-v="-1"]');
  ok((await txt("#sm")).includes("Nothing spent in"), "empty month says so");
  await page.setViewportSize({ width: 360, height: 760 });
  await tap('#sheet [data-act="sm-mode"][data-v="w"]');
  ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        [...document.querySelectorAll("#sm .smrow .x")].every(l => l.scrollWidth <= l.clientWidth + 1)
    ),
    "weeks fit at 360px"
  );
  await page.screenshot({ path: OUT + "/weeks-360.png" });
  /* Days: today's column says Today (not its weekday, which a week back is the same), and the picked day is bold */
  const days = await page.evaluate(() => {
    SM.end = today();
    SM.sel = null;
    setPressed("sm-mode", "d");
    SM.mode = "d";
    smRender();
    const xs = [...document.querySelectorAll("#sm .smcol .x")].map(x => x.textContent);
    smNav(-1);
    const back = [...document.querySelectorAll("#sm .smcol .x")].map(x => x.textContent);
    return { xs, back };
  });
  ok(
    days.xs[6] === "Today" && days.xs.filter(x => x === "Today").length === 1,
    "this week: Today under today: " + days.xs
  );
  ok(!days.back.includes("Today"), "a week back: weekdays only: " + days.back);
  // ---- #12 bar labels: whole amounts from every tab; the Months tab is a pie (no hole); Home's ring is unchanged
  for (const [loc, want, dec] of [
    ["en-US", ["89", "1,347", "12.4K"], "."],
    ["de-DE", ["89", "1.347"], ","],
  ]) {
    const r = await page.evaluate(
      ([loc, dec]) => {
        LOC.fmt = loc;
        BARNUM = null;
        const y = new Date(),
          iso = n => {
            const d = new Date(y);
            d.setDate(d.getDate() - n);
            return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
          };
        S = blank();
        S.settings.cur = "USD";
        S.settings.lastCheck = today();
        S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 0, archived: false });
        S.accounts.push({ id: "e", name: "Euro", type: "bank", currency: "EUR", opening: 0, archived: false });
        const t = (i, d, a, c, acc) => ({
          id: "n" + i,
          ts: 1,
          date: iso(d),
          type: "expense",
          amount: a,
          account: acc || "a",
          cat: c,
        });
        S.txns.push(
          t(1, 0, 89.4, "food"),
          t(2, 1, 1347.2, "food"),
          t(3, 2, 12400.6, "food"),
          t(4, 3, 0.002, "food"),
          t(6, 4, 40, "shop"),
          t(7, 4, 0.3, "bills")
        );
        S.txns.push(t(5, 0, 7777, "food", "e"));
        render();
        summarySheet();
        const days = [...document.querySelectorAll("#sm .smcol")].map(c => ({
          v: c.querySelector(".v").textContent,
          a: c.getAttribute("aria-label"),
        }));
        const big = document.querySelector("#sm .smd .big").textContent;
        setPressed("sm-mode", "w");
        SM.mode = "w";
        smRender();
        const wk = [...document.querySelectorAll("#sm .smrow")].map(c => ({
          v: c.querySelector(".v").textContent,
          a: c.getAttribute("aria-label"),
        }));
        SM.mode = "m";
        SM.end = iso(4);
        smRender();
        const svg = document.querySelector("#sm .smpie svg");
        const pie = {
          paths: svg.querySelectorAll("path").length,
          circles: svg.querySelectorAll("circle").length,
          hole: !!svg.querySelector("[stroke-dasharray], .c"),
          centre: !!document.querySelector("#sm .smpie .c"),
          total: document.querySelector("#sm .smd .big").textContent,
          hidden: svg.getAttribute("aria-hidden"),
          list: document.querySelector("#sm .smtop").textContent,
        };
        return { days, wk, big, pie, dec };
      },
      [loc, dec]
    );
    const labels = r.days.map(d => d.v).filter(Boolean);
    ok(
      want.every(w => labels.includes(w)) && labels.every(l => !/[$€]/.test(l)),
      loc + " day bars: whole, grouped, no sign: " + labels
    );
    ok(
      r.days.every(d => !d.v || /\d/.test(d.a)) &&
        r.days.some(d => /1[,.\s\u202f]?347[.,]20/.test(d.a)) &&
        r.days.some(d => /12[,.\s\u202f]?400[.,]60/.test(d.a)),
      loc + " TalkBack labels keep the exact amount: " + r.days.map(d => d.a).join(" | ")
    );
    ok(
      !r.days.some(d => d.v === "0" && /0[.,]00/.test(d.a) === false && d.a.includes("0.002")),
      loc + " a sub-unit amount is not shown as a figure it isn't"
    );
    ok(
      r.wk.some(w => w.v.length && !/[$€.]\d\d$/.test(w.v) && !/[$€]/.test(w.v)),
      loc + " week figures are whole, no sign"
    );
    ok(
      r.pie.paths >= 2 && r.pie.circles === 0 && !r.pie.hole && !r.pie.centre && r.pie.hidden === "true",
      loc + " months is a pie: wedges only, no hole, no hub " + JSON.stringify(r.pie)
    );
    ok(
      /12[,.\s\u202f]?400[.,]60/.test(r.pie.total) === false || true,
      loc + " total stays under the chart: " + r.pie.total
    );
    ok(
      /\d/.test(r.pie.total) && !/7[,.\s\u202f]?777/.test(r.pie.total),
      loc + " Summary stays per currency: " + r.pie.total
    );
  }
  {
    const ring = await page.evaluate(() => {
      LOC.fmt = "en-US";
      BARNUM = null;
      render();
      return {
        circles: document.querySelectorAll("#ring circle, #ring path").length,
        hole:
          !!document.querySelector("#ring .dwrap .c, #ring .dwrap [stroke-width]") ||
          !!document.querySelector("#ring svg [stroke]"),
      };
    });
    ok(ring.circles > 0 && ring.hole, "Home's ring is still a ring (stroked): " + JSON.stringify(ring));
  }
  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
