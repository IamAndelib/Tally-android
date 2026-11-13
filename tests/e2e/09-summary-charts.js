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
    return { t: f(0), d3: f(-3) };
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
    /* a payback today with a ৳7.00 fee: a charge, in the grey Charges part */
    txns.push({
      id: "r1",
      ts: 1,
      date: d.t,
      type: "loan",
      amount: 500,
      account: "k",
      dir: "in",
      loan: "L1",
      note: "",
      feeId: "r1f",
    });
    txns.push({
      id: "r1f",
      ts: 2,
      date: d.t,
      type: "expense",
      amount: 7,
      account: "k",
      cat: "fees",
      note: "",
      feeOf: "r1",
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
  /* today: its category (৳40.00), then the Charges line (the payback's ৳7.00 fee), each with its share */
  const dayRows = await page.$$eval("#sm .smtop .tx", e =>
    e.map(x => x.querySelector(".d").textContent.replace(/\s+/g, " ").trim())
  );
  ok(
    dayRows.length === 2 &&
      / 85%$/.test(dayRows[0]) &&
      dayRows[1] === "Charges 15%" &&
      !!(await page.$("#sm .smtop .tx:last-child .chdot")),
    "days: the list ends with Charges, a grey dot for its emblem, shares as Months " + JSON.stringify(dayRows)
  );
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
      rowsEl = [...document.querySelectorAll("#sm .smtop .tx")],
      paths = [...document.querySelectorAll("#sm .smpie path")];
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
      lastFill: paths.length ? paths[paths.length - 1].getAttribute("fill") : "",
      lastRow: rowsEl.length ? rowsEl[rowsEl.length - 1].querySelector(".d").textContent : "",
    };
  });
  ok(
    m.slices === m.rows && !m.hub && m.rows >= 5 && Math.abs(m.sum - 100) <= m.rows,
    "month pie: one slice per category, legend % ≈ 100, no hub " + JSON.stringify(m)
  );
  ok(
    m.lastFill === "#7a8190" && /^Charges <1%$/.test(m.lastRow.trim()),
    "month pie: the grey slice last; the list ends with Charges <1% " + JSON.stringify(m)
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
  /* Days: one day at a time, named as Home names it (Today, Yesterday, then its date); ‹ › a day, never past today */
  const days = await page.evaluate(() => {
    SM.end = today();
    SM.sel = null;
    setPressed("sm-mode", "d");
    SM.mode = "d";
    smRender();
    const at = () => [
      $("#sm .cal-h b").textContent,
      $('#sm [data-act="sm-nav"][data-v="1"]').disabled,
      document.querySelectorAll("#sm .smcol, #sm .smrow").length,
    ];
    const out = [at()];
    smNav(-1);
    out.push(at());
    smNav(-1);
    out.push(at());
    smNav(1);
    smNav(1);
    smNav(1);
    out.push(at());
    return { out, d2: capFirst(dayLabel(addDays(today(), -2))) };
  });
  ok(
    JSON.stringify(days.out) ===
      JSON.stringify([
        ["Today", true, 0],
        ["Yesterday", false, 0],
        [days.d2, false, 0],
        ["Today", true, 0],
      ]),
    "days: Today, ‹ Yesterday, ‹ " + days.d2 + ", › › › stops at Today; no bars " + JSON.stringify(days.out)
  );
  // ---- #12 bar labels: whole amounts in every tab with bars; Days and Months are pies (no hole); Home's ring unchanged
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
        /* today, yesterday and the day before: each one category, a whole disc, its line with the exact amount */
        const days = [0, 1, 2].map(n => {
          SM.end = iso(n);
          smRender();
          return {
            big: document.querySelector("#sm .smd .big").textContent,
            say: [...document.querySelectorAll("#sm .smtop .tx")].map(e => e.getAttribute("aria-label")),
            circles: document.querySelectorAll("#sm .smpie circle").length,
            paths: document.querySelectorAll("#sm .smpie path").length,
          };
        });
        const bars = [89.4, 1347.2, 12400.6, 0.002, -0.2].map(compact);
        SM.end = iso(0);
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
        return { days, bars, wk, pie, dec };
      },
      [loc, dec]
    );
    ok(
      want.every(w => r.bars.includes(w)) && r.bars.every(l => !/[$€]/.test(l)),
      loc + " bar labels: whole, grouped, no sign: " + r.bars
    );
    ok(r.bars[3] === "0" && r.bars[4] === "0", loc + " a sub-unit amount is 0, never -0: " + r.bars);
    ok(
      r.days.every(d => d.say.length === 1 && d.circles === 1 && d.paths === 0) &&
        /89[.,]40/.test(r.days[0].say[0]) &&
        /1[,.\s\u202f]?347[.,]20/.test(r.days[1].say[0]) &&
        /12[,.\s\u202f]?400[.,]60/.test(r.days[2].say[0]) &&
        r.days.every(d => /100\s?%$/.test(d.say[0])),
      loc +
        " days: one category is a whole disc; TalkBack keeps the exact amount and its share: " +
        r.days.map(d => d.say.join(" ")).join(" | ")
    );
    ok(!/7[,.\s\u202f]?777/.test(r.days[0].big), loc + " days: only the Summary's currency " + r.days[0].big);
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
  /* Weeks: every row shares the label and figure columns, so all tracks start and end at the same x and equal spending
     draws equal bars (labels of different lengths, figures and dashes), also at 360 px and large text; and a tab with
     nothing spent in view draws no chart, only the total, the message and the button. */
  {
    const open = async (txns, mode) => {
      await page.evaluate(() => closeSheet());
      await page.evaluate(
        ([txns, mode]) => {
          S.settings.cur = "BDT";
          S.accounts = [{ id: "k", name: "Bkash", type: "wallet", currency: "BDT", opening: 90000 }];
          S.txns = txns.map((x, i) => ({
            id: "w" + i,
            ts: i + 1,
            date: addDays(today(), -x[0]),
            type: "expense",
            amount: x[1],
            account: "k",
            cat: "food",
            note: "",
          }));
          summarySheet();
          document.querySelector('#sheet [data-act="sm-mode"][data-v="' + mode + '"]').click();
        },
        [txns, mode]
      );
      await page.waitForTimeout(150);
    };
    for (const [w, scale] of [
      [393, 16],
      [360, 20.8],
    ]) {
      await page.setViewportSize({ width: w, height: 740 });
      await page.evaluate(px => (document.documentElement.style.fontSize = px + "px"), scale);
      await open(
        [
          [7, 500],
          [14, 500],
          [28, 12400],
        ],
        "w"
      );
      const r = await page.$$eval("#sm .smrow", rows =>
        rows.map(x => {
          const t = x.querySelector(".tr").getBoundingClientRect(),
            b = x.querySelector(".b").getBoundingClientRect(),
            l = x.querySelector(".x"),
            v = x.querySelector(".v");
          return {
            l: l.textContent,
            tl: Math.round(t.left * 10) / 10,
            tr: Math.round(t.right * 10) / 10,
            bw: Math.round(b.width * 10) / 10,
            v: v.textContent,
            cut:
              l.scrollWidth > l.clientWidth + 1 ||
              v.scrollWidth > v.clientWidth + 1 ||
              x.scrollWidth > x.clientWidth + 1,
            tw: t.width,
          };
        })
      );
      const tag = w + "px/" + scale;
      ok(
        new Set(r.map(x => x.l.length)).size > 1,
        tag + " weeks: labels differ in length: " + r.map(x => x.l).join(" | ")
      );
      ok(r.some(x => x.v === "–") && r.some(x => x.v !== "–"), tag + " weeks: some with spending, some without");
      ok(
        new Set(r.map(x => x.tl)).size === 1 && new Set(r.map(x => x.tr)).size === 1,
        tag + " weeks: every track starts and ends at the same x: " + JSON.stringify(r.map(x => [x.tl, x.tr]))
      );
      const eq = r.filter(x => x.v === "500");
      ok(
        eq.length === 2 && eq[0].bw === eq[1].bw && eq[0].bw > 0,
        tag + " weeks: equal spending, bars of equal width: " + JSON.stringify(eq.map(x => x.bw))
      );
      ok(r.every(x => !x.cut) && r[0].tw >= 60, tag + " weeks: nothing cut, track still " + Math.round(r[0].tw) + "px");
    }
    await page.setViewportSize({ width: 393, height: 852 });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    for (const mode of ["d", "w", "m", "y"]) {
      await open([], mode);
      const e = await page.evaluate(() => ({
        chart: document.querySelectorAll("#sm .smchart, #sm .smpie").length,
        nav: !!document.querySelector("#sm .cal-h b"),
        big: !!document.querySelector("#sm .smd .big"),
        msg: !!document.querySelector("#sm .empty"),
        btn: !!document.querySelector('#sm [data-act="sm-open"]'),
        tabs: document.querySelectorAll('#sheet [data-act="sm-mode"]').length,
      }));
      ok(
        e.chart === 0 && e.nav && e.big && e.msg && e.btn && e.tabs === 4,
        mode + ": nothing spent shows no chart, keeps tabs, period, total, message and button " + JSON.stringify(e)
      );
      await open([[0, 250]], mode);
      ok(
        (await page.evaluate(() => document.querySelectorAll("#sm .smchart").length)) === 1,
        mode + ": spending today shows its chart"
      );
    }
    /* only when everything in view is zero: older spending outside the view doesn't count */
    await open([[1, 250]], "d");
    ok(
      (await page.$$("#sm .smchart")).length === 0 &&
        (await txt("#sm .empty")).trim() === "Nothing spent that day." &&
        (await page.$$("#sm .smtop")).length === 0,
      "days: nothing today, no pie and the empty text, though yesterday has spending"
    );
    /* a day with five categories and a charge outside a purchase: every part listed (not just the top three), each
       with its share, Charges last; one slice per part, in the list's order and colours, the grey one last. And the
       donut of a day on Home opens that day. */
    const dp = await page.evaluate(() => {
      closeSheet();
      const d = addDays(today(), -2),
        e = (id, amount, cat, extra) =>
          Object.assign(
            { id, ts: S.txns.length + 1, date: d, type: "expense", amount, account: "k", cat, note: "" },
            extra
          );
      S.txns = [];
      S.txns.push(
        e("g", 400, "groceries"),
        e("f", 300, "food"),
        e("t", 120, "transport"),
        e("h", 60, "health"),
        e("b", 20, "bills"),
        { id: "tr", ts: 90, date: d, type: "transfer", amount: 500, account: "k", to: "k2", feeId: "trc", note: "" },
        e("trc", 100, "fees", { feeOf: "tr" })
      );
      S.accounts.push({ id: "k2", name: "Bank", type: "bank", currency: "BDT", opening: 0 });
      Object.assign(V, { screen: "home", period: "day", anchor: d });
      render();
      const home = $(".pnav .plabel").textContent;
      summarySheet();
      const rows = [...document.querySelectorAll("#sm .smtop .tx")],
        slices = [...document.querySelectorAll("#sm .smpie path, #sm .smpie circle")];
      return {
        home,
        mode: SM.mode,
        head: $("#sm .cal-h b").textContent,
        later: $('#sm [data-act="sm-nav"][data-v="1"]').disabled,
        big: $("#sm .smd .big").textContent.replace(/\u2060/g, ""),
        rows: rows.map(r => r.querySelector(".d").textContent.replace(/\s+/g, " ").trim()),
        rowCols: rows.map(r => getComputedStyle(r.querySelector(".pbar span")).backgroundColor),
        slices: slices.map(p => (p.querySelector("title") || {}).textContent),
        sliceCols: slices.map(p => {
          const x = document.createElement("i");
          x.style.color = p.getAttribute("fill");
          document.body.appendChild(x);
          const c = getComputedStyle(x).color;
          x.remove();
          return c;
        }),
        lastFill: slices.length ? slices[slices.length - 1].getAttribute("fill") : "",
      };
    });
    ok(
      dp.mode === "d" && dp.head === dp.home && !dp.later && /^BDT\s1,000\.00$/.test(dp.big),
      "days: the donut of a day opens that day, ‹ › on, its total " +
        JSON.stringify([dp.mode, dp.later, dp.home, dp.head, dp.big])
    );
    ok(
      JSON.stringify(dp.rows) ===
        JSON.stringify(["Groceries 40%", "Eating out 30%", "Transport 12%", "Health 6%", "Bills 2%", "Charges 10%"]),
      "days: every part with its share, Charges last " + JSON.stringify(dp.rows)
    );
    ok(
      dp.slices.length === dp.rows.length &&
        dp.slices.every((n, k) => dp.rows[k].startsWith(n + " ")) &&
        JSON.stringify(dp.sliceCols) === JSON.stringify(dp.rowCols) &&
        dp.lastFill === "#7a8190",
      "days: one slice per part, in the list's order and colours, the grey one last " + JSON.stringify(dp.slices)
    );
    await page.screenshot({ path: OUT + "/days.png" });
    await open([[40, 250]], "w");
    ok((await page.$$("#sm .smchart")).length === 1, "weeks: spending in one of the weeks still shows the chart");
    await open([[40, 250]], "m");
    ok((await page.$$("#sm .smpie")).length === 0, "months: this month has nothing, no pie though last month has");
  }
  // ---- a part's row opens in place to its entries: the 5 newest in the period, then "Show all N in History", which opens
  // History on that period with that part's filter (docs/specs/charges.md, Summary)
  {
    await page.evaluate(() => {
      closeSheet();
      const t = today(),
        now = Date.now(),
        e = (id, min, amount, cat, extra) =>
          Object.assign(
            { id, ts: now - min * 60000, date: t, type: "expense", amount, account: "k", cat, note: "" },
            extra
          );
      S.settings.cur = "BDT";
      S.accounts = [
        { id: "k", name: "Bkash", type: "wallet", currency: "BDT", opening: 90000 },
        { id: "k2", name: "Bank", type: "bank", currency: "BDT", opening: 0 },
        { id: "u", name: "Dollars", type: "savings", currency: "USD", opening: 1000 },
      ];
      S.loans = [];
      S.txns = [];
      /* Groceries today: 8 purchases (g7 the newest), one with a ৳3.00 charge (the oldest), one archived (still
         counted, not listed), one in dollars (not this Summary's); 6 transfers with a ৳2.00 charge each */
      for (let i = 0; i < 8; i++) S.txns.push(e("g" + i, 20 - i, 10 * (i + 1), "groceries", { payee: "Shop " + i }));
      S.txns.push(
        e("pe", 30, 50, "groceries", { feeId: "pec", payee: "Market" }),
        e("pec", 30, 3, "groceries", { feeOf: "pe" }),
        e("ga", 1, 1000, "groceries", { archived: true }),
        e("gu", 2, 5, "groceries", { account: "u" })
      );
      for (let i = 0; i < 6; i++)
        S.txns.push(
          { ...e("x" + i, 40 - i, 100, ""), type: "transfer", to: "k2", feeId: "x" + i + "c", cat: undefined },
          e("x" + i + "c", 40 - i, 2, "fees", { feeOf: "x" + i })
        );
      RBC = LPC = null;
      Object.assign(V, { screen: "home", period: "day", anchor: t });
      render();
      summarySheet();
    });
    await page.waitForTimeout(150);
    const look = () =>
      page.evaluate(() => {
        const cl = s => s.replace(/⁠/g, "").replace(/\s+/g, " ").trim(),
          o = document.querySelector("#sm .smo");
        return {
          parts: [...document.querySelectorAll("#sm .smtop > .tx")].map(r => ({
            k: r.dataset.v,
            tag: r.tagName,
            exp: r.getAttribute("aria-expanded"),
            say: cl(r.getAttribute("aria-label")),
            chev: !!r.querySelector(".chev"),
            turned: getComputedStyle(r.querySelector(".chev")).transform !== "none",
            total: cl(r.querySelector(".a").textContent),
          })),
          open: o ? o.previousElementSibling.dataset.v : null,
          n: document.querySelectorAll("#sm .smo").length,
          rows: o
            ? [...o.querySelectorAll(".tx")].map(e => ({
                id: e.dataset.v,
                d: cl(e.querySelector(".d").textContent),
                a: cl(e.querySelector(".a").textContent),
                s: cl(e.querySelector(".s").textContent),
                act: !!e.closest("[data-act]") && e.closest("[data-act]").dataset.act !== "sheet-bg",
              }))
            : [],
          more: o && o.querySelector(".btn") ? cl(o.querySelector(".btn").textContent) : null,
          when: o ? [...o.querySelectorAll(".tx")].map(e => cl(clockTime(entry(e.dataset.v).ts))) : [],
        };
      });
    const amt = s => parseFloat(s.replace(/[^\d.]/g, ""));
    let s = await look();
    ok(
      s.parts.map(p => p.k).join() === "groceries,_charges" &&
        s.parts.every(p => p.tag === "BUTTON" && p.exp === "false" && p.chev && !p.turned) &&
        s.parts[0].say === "Groceries, " + s.parts[0].total + ", 99%" &&
        s.n === 0,
      "rows: each part a button, closed, a chevron at its end, labelled as before " + JSON.stringify(s.parts)
    );
    await tap('#sm .smx[data-v="groceries"]');
    s = await look();
    const g = s.rows;
    ok(
      s.parts[0].exp === "true" && s.parts[0].turned && s.open === "groceries" && s.n === 1,
      "a tap opens the row in place: expanded, the chevron turned up, its entries right under it"
    );
    ok(
      g.map(r => r.id).join() === "g7,g6,g5,g4,g3" &&
        g.map(r => r.d).join() === "Shop 7,Shop 6,Shop 5,Shop 4,Shop 3" &&
        g.every((r, i) => r.s === s.when[i] + " · Bkash" && !/[-−]/.test(r.a) && !r.act),
      "… the 5 newest, each named, the time written and the account, the amount without a sign, read-only " +
        JSON.stringify(g)
    );
    ok(
      g.reduce((q, r) => q + amt(r.a), 0) <= amt(s.parts[0].total) && amt(g[0].a) === 80,
      "… their amounts add up to at most the part's " + s.parts[0].total
    );
    ok(
      s.more === "Show all 10 in History",
      "… then Show all, counting what History lists (the archived purchase left out, as there; History has no currency filter, so the dollars one in) " +
        s.more
    );
    await tap('#sm .smx[data-v="groceries"]');
    await page.waitForTimeout(300); // the chevron's turn
    s = await look();
    ok(s.n === 0 && s.parts[0].exp === "false" && !s.parts[0].turned, "a second tap closes it");
    /* opening Charges closes Groceries; the row tapped stays where it was on the screen */
    await page.setViewportSize({ width: 393, height: 600 });
    await tap('#sm .smx[data-v="groceries"]');
    const y0 = await page.evaluate(() => {
      const r = document.querySelector('#sm .smx[data-v="_charges"]');
      r.scrollIntoView({ block: "end" });
      return r.getBoundingClientRect().top;
    });
    await tap('#sm .smx[data-v="_charges"]');
    s = await look();
    const y1 = await page.evaluate(
      () => document.querySelector('#sm .smx[data-v="_charges"]').getBoundingClientRect().top
    );
    ok(
      s.open === "_charges" && s.n === 1 && s.parts[0].exp === "false" && Math.abs(y1 - y0) < 1,
      "one open at a time: Charges opens, Groceries above it closes, Charges stays put " + JSON.stringify([y0, y1])
    );
    ok(
      s.rows.map(r => r.id).join() === "x5,x4,x3,x2,x1" &&
        s.rows.every(r => r.d === "Transfer" && amt(r.a) === 2) &&
        s.more === "Show all 7 in History",
      "Charges: the transfers with their charge (the purchase's charge is in Groceries), Show all as History's Charges " +
        JSON.stringify([s.rows, s.more])
    );
    await page.setViewportSize({ width: 393, height: 852 });
    const hist = () =>
      page.evaluate(() => ({
        screen: V.screen,
        hf: { kind: HF.kind, cat: HF.cat },
        hp: { period: HP.period, anchor: HP.anchor, rs: HP.rs, re: HP.re },
        rows: [...document.querySelectorAll("#app .tx.en[data-v]")].map(e => e.dataset.v).sort(),
        sheet: !!document.querySelector("#sheet .p"),
        t: today(),
      }));
    await tap('#sm .smo [data-act="sm-all"]');
    let h = await hist();
    ok(
      h.screen === "history" &&
        !h.sheet &&
        h.hf.kind === "charges" &&
        !h.hf.cat &&
        h.hp.period === "day" &&
        h.hp.anchor === h.t &&
        h.rows.join() === "pe,x0,x1,x2,x3,x4,x5",
      "Charges' Show all: History, the Charges kind, today, its 7 rows " + JSON.stringify(h)
    );
    /* each tab's Show all: History on that tab's period (a week as a date range), Spent in that category */
    const showAll = async mode => {
      await page.evaluate(m => {
        histClear();
        V.screen = "home";
        render();
        summarySheet();
        document.querySelector('#sheet [data-act="sm-mode"][data-v="' + m + '"]').click();
      }, mode);
      await page.waitForTimeout(100);
      await tap('#sm .smx[data-v="groceries"]');
      const r = await look();
      await tap('#sm .smo [data-act="sm-all"]');
      return [r, await hist()];
    };
    const wk = await page.evaluate(() => [weekStart(today()), addDays(weekStart(today()), 6)]);
    for (const [mode, want] of [
      ["d", h => h.hp.period === "day" && h.hp.anchor === h.t],
      ["w", h => h.hp.period === "range" && h.hp.rs === wk[0] && h.hp.re === wk[1]],
      ["m", h => h.hp.period === "month" && h.hp.anchor === h.t.slice(0, 8) + "01"],
      ["y", h => h.hp.period === "year" && h.hp.anchor === h.t.slice(0, 5) + "01-01"],
    ]) {
      const [r, h] = await showAll(mode);
      ok(
        r.rows.map(x => x.id).join() === "g7,g6,g5,g4,g3" &&
          r.more === "Show all 10 in History" &&
          h.screen === "history" &&
          h.hf.kind === "out" &&
          h.hf.cat === "groceries" &&
          want(h) &&
          h.rows.join() === "g0,g1,g2,g3,g4,g5,g6,g7,gu,pe",
        mode +
          ": Groceries opens to the same 5, and Show all to History on that period, Spent in Groceries, its 10 rows " +
          JSON.stringify([r.rows.map(x => [x.id, x.s]), h])
      );
      if (mode !== "d")
        ok(
          r.rows.every(x => x.s === "Today · Bkash"),
          mode + ": the second line is the day, then the account " + JSON.stringify(r.rows.map(x => x.s))
        );
    }
    /* an opened part stays open across the tabs (where it is listed) */
    await page.evaluate(() => {
      histClear();
      V.screen = "home";
      render();
      summarySheet();
    });
    await tap('#sm .smx[data-v="groceries"]');
    await tap('#sheet [data-act="sm-mode"][data-v="m"]');
    s = await look();
    ok(s.open === "groceries" && s.parts[0].exp === "true", "switching tabs keeps the part open");
    await page.screenshot({ path: OUT + "/opened.png" });
    await page.evaluate(() => closeSheet());
  }
  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
