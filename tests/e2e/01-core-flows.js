const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("01-core-flows");
const URL = appUrl;
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "en-CA",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.goto(URL);
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const sact = (a, v) => page.click(`#sheet [data-act="${a}"]` + (v === undefined ? "" : `[data-v="${v}"]`));
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const bal = () =>
    page.evaluate(() => {
      const S = JSON.parse(localStorage.getItem("tally:v1"));
      const b = {};
      S.accounts.forEach(a => (b[a.name] = +a.opening || 0));
      const n = id => S.accounts.find(a => a.id === id).name;
      S.txns.forEach(t => {
        if (t.type === "expense") b[n(t.account)] -= t.amount;
        else if (t.type === "income" || t.type === "adjust") b[n(t.account)] += t.amount;
        else if (t.type === "transfer") {
          b[n(t.account)] -= t.amount;
          b[n(t.to)] += t.toAmount != null ? t.toAmount : t.amount;
        }
      });
      for (const k in b) b[k] = Math.round(b[k] * 100) / 100;
      return b;
    });
  const tagSheet = () =>
    page.evaluate(() => {
      document.querySelector("#sheet .p").dataset.k = "1";
    });
  const sameSheet = () => page.evaluate(() => !!document.querySelector('#sheet .p[data-k="1"]'));
  const settle = () => page.waitForTimeout(120);

  // ---- accounts, using the new currency picker for bKash
  async function addAccount(name, type, cur, open) {
    await page.fill("#f-name", name);
    await sact("f-type", type);
    if (cur) {
      await sact("pick-acccur");
      await page.fill("#cur-q", cur.q);
      await settle();
      ok(await page.isVisible(`#curlist [data-v="${cur.code}"]`), `search "${cur.q}" finds ${cur.code}`);
      await page.click(`#curlist [data-v="${cur.code}"]`);
      ok(
        (await page.isVisible("#f-name")) && (await page.textContent("#f-cur")).includes(cur.code),
        "account form still open with " + cur.code
      );
    }
    await page.fill("#f-open", String(open));
    await sact("acc-save");
  }
  await act("acc-form");
  await addAccount("RBC", "bank", null, 500);
  await act("check-ok");
  await page.click(".acc.add");
  await addAccount("Wallet", "cash", null, 40);
  await page.click(".acc.add");
  await addAccount("bKash", "wallet", { q: "taka", code: "BDT" }, 2000);
  let S = await state();
  ok(S.accounts.map(a => a.currency).join() === "CAD,CAD,BDT", "currencies saved " + S.accounts.map(a => a.currency));

  // ---- 1. Transfer button
  const xf = await page.$(".fab.xfer");
  ok((await xf.textContent()).trim() === "Transfer", "button says Transfer");
  const [bb, ib] = await page.evaluate(() => {
    const b = document.querySelector(".fab.xfer"),
      i = b.querySelector(".ic");
    const r = b.getBoundingClientRect(),
      s = i.getBoundingClientRect();
    return [r.left + r.width / 2, s.left + s.width / 2];
  });
  ok(Math.abs(bb - ib) < 1.5, "transfer icon centred (" + bb.toFixed(1) + " vs " + ib.toFixed(1) + ")");

  // ---- 4. quick add does not rebuild; minus opens grid in same sheet
  await act("add-out");
  ok((await page.isVisible("#f-catgrid")) && !(await page.isVisible("#f-catchip")), "minus opens category grid");
  await tagSheet();
  await page.fill("#f-amt", "10+2.5");
  await sact("f-cat", "food");
  ok(
    !(await page.isVisible("#f-catgrid")) && (await page.textContent("#f-catchip")).includes("Eating out"),
    "picking collapses grid to chip"
  );
  await sact("f-showcats");
  await sact("f-cat", "shopping");
  await sact("f-showcats");
  await sact("f-cat", "groceries");
  await sact("f-acc", S.accounts[1].id);
  await sact("f-acc", S.accounts[0].id);
  ok(await sameSheet(), "sheet not rebuilt while cycling categories/accounts");
  ok((await page.inputValue("#f-amt")) === "10+2.5", "typed amount kept");
  await sact("tx-save");
  ok((await bal()).RBC === 487.5, "RBC 487.50 after groceries");
  // save requires category
  await act("add-out");
  await page.fill("#f-amt", "5");
  await sact("tx-save");
  ok(await page.isVisible("#f-catgrid"), "save blocked without category");
  await sact("close");
  // income sheet cycling
  await act("add-in");
  await tagSheet();
  await sact("f-cat", "gift");
  await sact("f-cat", "income");
  ok(await sameSheet(), "income sheet not rebuilt");
  await page.fill("#f-amt", "100");
  await sact("tx-save");

  // ---- transfer sheet: no rebuild, received field, fee
  await act("tr-new");
  await tagSheet();
  await page.fill("#f-amt", "60");
  await sact("tr-to", S.accounts[2].id);
  ok(await page.isVisible("#f-toamt"), "received field shows for CAD→BDT");
  await sact("tr-swap");
  await sact("tr-swap");
  await sact("tr-to", S.accounts[1].id);
  ok(!(await page.isVisible("#f-toamt")), "received field hidden for CAD→CAD");
  await sact("tr-fee");
  ok(await page.isVisible("#f-fee"), "fee field shown");
  ok(await sameSheet(), "transfer sheet not rebuilt");
  await page.fill("#f-fee", "2");
  ok((await page.textContent("#tr-prev")).includes("62.00"), "preview includes fee");
  await sact("tr-save");
  let b = await bal();
  ok(b.RBC === 525.5 && b.Wallet === 100, "after transfer+fee " + JSON.stringify(b));
  ok((await page.textContent("#snack")).includes("Transferred"), "snackbar says Transferred");
  await act("tr-new");
  await sact("tr-to", S.accounts[2].id);
  await page.fill("#f-amt", "10");
  await sact("tr-save");
  ok(await page.isVisible("#f-toamt"), "cross-currency blocked without received");
  await page.fill("#f-toamt", "850");
  await sact("tr-save");
  b = await bal();
  ok(b.bKash === 2850 && b.RBC === 515.5, "bKash 2850 " + JSON.stringify(b));
  // eating out entry so donut has 2+ categories
  await act("add-cat", "food");
  await page.fill("#f-amt", "8");
  await sact("tx-save");

  // ---- leader lines: one per spent category, start on the donut rim, end near the icon, never cross
  await settle();
  const geo = await page.evaluate(() => {
    const ring = document.getElementById("ring"),
      rr = ring.getBoundingClientRect(),
      dn = ring.querySelector(".donut").getBoundingClientRect();
    const cx = dn.left + dn.width / 2 - rr.left,
      cy = dn.top + dn.height / 2 - rr.top,
      R = dn.width * 0.46;
    const lines = [...ring.querySelectorAll(".leaders line")].map(l =>
      ["x1", "y1", "x2", "y2"].map(k => +l.getAttribute(k))
    );
    const tiles = [...ring.querySelectorAll(".cat")]
      .filter(b => b.querySelector(".cp").textContent)
      .map(b => {
        const r = b.getBoundingClientRect();
        return {
          l: r.left - rr.left,
          r: r.right - rr.left,
          t: r.top - rr.top,
          b: r.bottom - rr.top,
          c: b.className,
          st: b.style.top,
          v: b.dataset.v,
          tr: getComputedStyle(b).transform,
        };
      });
    return { cx, cy, R, lines, tiles };
  });
  ok(
    geo.lines.length === geo.tiles.length && geo.tiles.length >= 3,
    `one leader per spent category (${geo.lines.length}/${geo.tiles.length})`
  );
  ok(
    geo.lines.every(([x1, y1]) => Math.abs(Math.hypot(x1 - geo.cx, y1 - geo.cy) - geo.R) < 2),
    "every line starts on the donut rim"
  );
  if (
    !geo.lines.every(([, , x2, y2]) =>
      geo.tiles.some(t => x2 >= t.l - 6 && x2 <= t.r + 6 && y2 >= t.t - 6 && y2 <= t.b + 6)
    )
  )
    console.log("DBG", JSON.stringify(geo));
  ok(
    geo.lines.every(([, , x2, y2]) =>
      geo.tiles.some(t => x2 >= t.l - 6 && x2 <= t.r + 6 && y2 >= t.t - 6 && y2 <= t.b + 6)
    ),
    "every line ends at its tile"
  );
  const cross = (p, q) => {
    const [a, b, c, d] = p,
      [e, f, g, h] = q;
    const o = (x1, y1, x2, y2, x3, y3) => Math.sign((x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1));
    return o(a, b, c, d, e, f) * o(a, b, c, d, g, h) < 0 && o(e, f, g, h, a, b) * o(e, f, g, h, c, d) < 0;
  };
  let crossings = 0;
  geo.lines.forEach((p, i) =>
    geo.lines.forEach((q, j) => {
      if (i < j && cross(p, q)) crossings++;
    })
  );
  ok(crossings === 0, "no leader lines cross (" + crossings + ")");
  await page.screenshot({ path: OUT + "/home.png" });

  // ---- period dialog: Day / Range / Month, round highlights
  await act("period-open");
  ok(
    (await page.isVisible('[data-act="pd-tab"][data-v="range"]')) &&
      !(await page.isVisible('[data-act="pd-tab"][data-v="week"]')),
    "Range tab replaces Week"
  );
  const circ = await page.evaluate(() =>
    [...document.querySelectorAll("#pd .dd.now, #pd .dd.sel")].map(b => {
      const s = getComputedStyle(b, "::after");
      return [s.width, s.height];
    })
  );
  ok(
    circ.length && circ.every(([w, h]) => w === h && w === "40px"),
    "selected/today highlight is a 40px circle " + JSON.stringify(circ)
  );
  const thisMonth = await page.evaluate(() => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  });
  const prevMonth = await page.evaluate(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  });
  ok(await page.isDisabled('[data-act="pd-mon"][data-v="1"]'), "next month disabled");
  ok(
    await page.evaluate(() => [...document.querySelectorAll('[data-act="pd-day"]')].some(b => b.disabled)),
    "future days disabled"
  );
  await act("pd-day", thisMonth + "-10");
  ok((await page.textContent(".plabel")).includes("10"), "day picked: " + (await page.textContent(".plabel")));
  // range by mouse drag 3rd → 12th
  await act("period-open");
  await act("pd-tab", "range");
  const c3 = await (await page.$(`#pd [data-v="${thisMonth}-03"]`)).boundingBox(),
    c12 = await (await page.$(`#pd [data-v="${thisMonth}-12"]`)).boundingBox();
  await page.mouse.move(c3.x + c3.width / 2, c3.y + c3.height / 2);
  await page.mouse.down();
  await page.mouse.move(c12.x + c12.width / 2, c12.y + c12.height / 2, { steps: 10 });
  const midDrag = await page.evaluate(() => [
    document.querySelectorAll("#pd .dd.in").length,
    !!document.querySelector("#pd .dd.rs"),
    !!document.querySelector("#pd .dd.re"),
  ]);
  await page.screenshot({ path: OUT + "/range-drag.png" });
  await page.mouse.up();
  await settle();
  ok(midDrag[0] === 8 && midDrag[1] && midDrag[2], "band painted live while dragging " + midDrag);
  let rl = await page.textContent(".plabel");
  ok(/^3\s–\s12 /.test(rl.trim()), "drag picked range: " + rl);
  await act("prev");
  rl = await page.textContent(".plabel");
  ok(/^24 .+\s–\s2 /.test(rl.trim()), "‹ shifts by the range length: " + rl);
  // tap start, change month, tap end
  await act("period-open");
  await act("pd-tab", "range");
  await act("pd-mon", "-1");
  await act("pd-rday", prevMonth + "-28");
  ok((await page.textContent("#pd-hint")).includes("end"), "hint asks for the end day");
  await act("pd-mon", "1");
  await act("pd-rday", thisMonth + "-02");
  rl = await page.textContent(".plabel");
  ok(/^28 .+\s–\s2 /.test(rl.trim()), "tap-tap across months: " + rl);
  await act("period-open");
  await act("pd-tab", "month");
  await page.screenshot({ path: OUT + "/period-month.png" });
  await act("pd-month", prevMonth);
  const ml = await page.textContent(".plabel");
  ok(ml.trim().length > 2 && !/–/.test(ml), "month picked: " + ml);
  await act("period-open");
  await act("pd-tab", "day");
  await act("pd-today");
  ok((await page.textContent(".plabel")).startsWith("Today"), "back on Today");
  await act("period-open");
  await page.waitForTimeout(250);
  await page.screenshot({ path: OUT + "/period-day.png" });
  await act("pd-close");

  // ---- 2. history multi-select
  await act("go", "history");
  S = await state();
  const tr = S.txns.find(t => t.type === "transfer" && t.feeId);
  const food = S.txns.find(t => t.cat === "food");
  const gift = S.txns.find(t => t.type === "income");
  const before = S.txns.length;
  // long-press with mouse (same code path as touch)
  const row = await page.$(`[data-act="tx-open"][data-v="${tr.id}"]`);
  const rb = await row.boundingBox();
  await page.mouse.move(rb.x + 60, rb.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await settle();
  ok(
    (await page.isVisible('[data-act="sel-del"]')) && !(await page.isVisible("#sheet .p")),
    "long-press enters selection without opening the entry"
  );
  await act("sel-toggle", food.id);
  await act("sel-toggle", gift.id);
  ok((await page.textContent(".appbar h1")).startsWith("3 selected"), "3 selected");
  await page.screenshot({ path: OUT + "/history-select.png" });
  await act("sel-del");
  S = await state();
  ok(S.txns.length === before - 4 && !S.txns.some(t => t.id === tr.feeId), "deleted 3 + linked fee");
  await act("undo");
  S = await state();
  ok(S.txns.length === before, "undo restored all");
  // select button + select all + cancel
  await act("sel-start");
  await act("sel-all");
  ok(
    (await page.evaluate(() => document.querySelectorAll(".tx.on").length)) === before,
    "select all selects the month"
  );
  await act("sel-cancel");
  ok(!(await page.isVisible('[data-act="sel-del"]')), "cancel leaves selection");

  // ---- settings: spending categories laid out like home
  await act("home");
  const homePos = await page.evaluate(() =>
    [...document.querySelectorAll("#ring .cat")].map(b => [b.dataset.v, b.style.left, b.style.top])
  );
  await act("go", "settings");
  const setPos = await page.evaluate(() =>
    [...document.querySelectorAll(".ring.edit .tile")].map(b => [b.dataset.v, b.style.left, b.style.top])
  );
  ok(JSON.stringify(homePos) === JSON.stringify(setPos), "settings preview matches home positions");
  const orderBefore = (await state()).cats.filter(c => c.kind === "out" && !c.hidden).map(c => c.id);
  const t1 = await (await page.$(`.ring.edit [data-v="${orderBefore[0]}"]`)).boundingBox();
  const t4 = await (await page.$(`.ring.edit [data-v="${orderBefore[3]}"]`)).boundingBox();
  await page.mouse.move(t1.x + t1.width / 2, t1.y + t1.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.move(t1.x + 30, t1.y + 30, { steps: 3 });
  await page.mouse.move(t4.x + t4.width / 2, t4.y + t4.height / 2, { steps: 8 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: OUT + "/settings-drag.png" });
  await page.mouse.up();
  await settle();
  const orderAfter = (await state()).cats.filter(c => c.kind === "out" && !c.hidden).map(c => c.id);
  ok(orderAfter[3] === orderBefore[0] && orderAfter[0] === orderBefore[1], "drag reordered: " + orderAfter.slice(0, 4));
  ok(!(await page.isVisible("#sheet .p")), "drag did not open the edit sheet");
  // add spending category
  await act("cat-new", "out");
  await page.fill("#f-cname", "Coffee");
  await sact("f-icon");
  await page.click('[data-act="ic-emoji"]');
  await page.fill("#ic-emo", "☕");
  await page.click('[data-act="ic-emo-ok"]');
  await sact("f-col", "#a646c9");
  await sact("cat-save");
  S = await state();
  const cof = S.cats.find(c => c.name === "Coffee");
  ok(cof && cof.kind === "out" && cof.e === "☕" && !cof.i && cof.c === "#a646c9", "custom spending category added");
  ok(
    (await page.evaluate(() => document.querySelectorAll(".ring.edit .tile").length)) === 13,
    "preview re-laid out with 13 categories"
  );
  await act("cat-new", "in");
  await page.fill("#f-cname", "Tutoring");
  await sact("cat-save");
  S = await state();
  ok(S.cats.find(c => c.name === "Tutoring").kind === "in", "money-in category added");
  // remove unused custom → deleted; remove used built-in → hidden
  await act("cat-edit", cof.id);
  await sact("cat-del");
  S = await state();
  ok(!S.cats.some(c => c.name === "Coffee"), "unused custom deleted");
  await act("cat-edit", "food");
  await sact("cat-del");
  S = await state();
  ok(S.cats.find(c => c.id === "food").hidden, "used category hidden");
  ok(await page.isVisible('[data-act="cat-back"][data-v="food"]'), "shows in Removed");
  await page.screenshot({ path: OUT + "/settings.png", fullPage: true });
  await act("cat-back", "food");
  // main currency via picker
  await act("pick-maincur");
  await page.fill("#cur-q", "euro");
  await settle();
  await page.screenshot({ path: OUT + "/currency.png" });
  await page.click('#curlist [data-v="EUR"]');
  S = await state();
  ok(S.settings.cur === "EUR", "main currency EUR");
  await act("pick-maincur");
  await page.click('#curlist [data-v="CAD"]');
  // home ring order follows settings
  await act("home");
  const ringOrder = await page.evaluate(() =>
    [...document.querySelectorAll("#ring .cat")].map(b => b.dataset.v).slice(0, 4)
  );
  ok(ringOrder[3] === orderBefore[0], "home ring follows new order " + ringOrder);

  // ---- screenshots in dark
  await act("go", "settings");
  await act("theme", "dark");
  await act("home");
  await settle();
  await page.screenshot({ path: OUT + "/home-dark.png" });
  await act("add-out");
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + "/quickadd-dark.png" });
  await sact("close");
  await act("period-open");
  await page.screenshot({ path: OUT + "/period-dark.png" });
  await act("pd-close");
  await act("go", "settings");
  await act("theme", "system");
  await act("home");
  await act("add-out");
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + "/quickadd.png" });
  await sact("close");
  await act("tr-new");
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + "/transfer.png" });
  await sact("close");

  // ---- layout sweep: n categories always fill the ring with no gaps or overlaps
  for (const n of [1, 2, 3, 5, 8, 9, 10, 12, 13, 16, 20, 24]) {
    await page.evaluate(n => {
      const S = JSON.parse(localStorage.getItem("tally:v1"));
      const ins = S.cats.filter(c => c.kind === "in"),
        outs = Array.from({ length: n }, (_, i) => ({
          id: "x" + i,
          name: "Cat " + i,
          e: "🏷️",
          c: "#4C9F8A",
          kind: "out",
        }));
      S.cats = outs.concat(
        S.cats.filter(c => c.kind === "out" && !c.id.startsWith("x")).map(c => Object.assign(c, { hidden: true })),
        ins
      );
      localStorage.setItem("tally:v1", JSON.stringify(S));
    }, n);
    await page.reload();
    await settle();
    const g = await page.evaluate(() => {
      const ring = document.getElementById("ring"),
        rr = ring.getBoundingClientRect(),
        dn = ring.querySelector(".dwrap").getBoundingClientRect();
      const box = r => [r.left, r.top, r.right, r.bottom];
      const tiles = [...ring.querySelectorAll(".cat")];
      const labels = tiles.map(b => {
        const n = b.querySelector(".cn"),
          rg = document.createRange();
        rg.selectNodeContents(n);
        return box(rg.getBoundingClientRect());
      });
      return {
        rr: box(rr),
        dn: box(dn),
        dcx: dn.left + dn.width / 2,
        dcy: dn.top + dn.height / 2,
        dR: dn.width / 2,
        t: tiles.map(b => box(b.getBoundingClientRect())),
        ci: tiles.map(b => box(b.querySelector(".ci").getBoundingClientRect())),
        labels,
        over: document.documentElement.scrollWidth > innerWidth,
      };
    });
    const inside = g.t.every(
      r => r[0] >= g.rr[0] - 0.5 && r[2] <= g.rr[2] + 0.5 && r[1] >= g.rr[1] - 0.5 && r[3] <= g.rr[3] + 0.5
    );
    const ov = (a, b) => a[0] < b[2] - 0.5 && b[0] < a[2] - 0.5 && a[1] < b[3] - 0.5 && b[1] < a[3] - 0.5;
    const cen = r => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2],
      dia = r => r[2] - r[0];
    let iconHits = 0,
      labelHits = 0;
    g.ci.forEach((a, i) =>
      g.ci.forEach((b, j) => {
        if (i < j && Math.hypot(cen(a)[0] - cen(b)[0], cen(a)[1] - cen(b)[1]) < dia(a) + 2) iconHits++;
      })
    );
    g.labels.forEach((a, i) =>
      g.labels.forEach((b, j) => {
        if (i < j && ov(a, b)) labelHits++;
      })
    );
    const onDonut = g.ci.filter(c => Math.hypot(cen(c)[0] - g.dcx, cen(c)[1] - g.dcy) < g.dR + dia(c) / 2).length;
    const gaps = g.t.map((r, i) => {
      const q = g.t[(i + 1) % g.t.length];
      return Math.hypot(cen(r)[0] - cen(q)[0], cen(r)[1] - cen(q)[1]);
    });
    const even = n < 3 || Math.max(...gaps) / Math.min(...gaps) < 1.12;
    ok(
      g.t.length === n && inside && !iconHits && !labelHits && !onDonut && even && !g.over,
      `n=${n}: tiles=${g.t.length} inside=${inside} iconHits=${iconHits} labelHits=${labelHits} onDonut=${onDonut} spacing=${(Math.max(...gaps) / Math.min(...gaps)).toFixed(2)} icon=${dia(g.ci[0]).toFixed(0)}px`
    );
    if ([5, 9, 12, 16, 24].includes(n)) await page.screenshot({ path: OUT + `/home-n${n}.png` });
  }

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no horizontal overflow");
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
