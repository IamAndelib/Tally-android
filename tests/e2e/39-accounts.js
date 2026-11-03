// Accounts at a glance (#37, #33). History rows show each account's name in a soft pill of its colour (a transfer, one per
// account), readable (WCAG AA) on every colour of the palette in light and dark; a card without a colour of its own is
// purple, not the bank's blue. Hold and drag reorders every list in Assets and Liabilities (accounts, cards, money owed
// either way, other assets) and Home's balance chips; Home and Assets share one account order, other kinds keep their
// places among them, and a drop onto a section's box still archives instead of reordering.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (scheme = "light") => {
    const ctx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      locale: "en-US",
      colorScheme: scheme,
    });
    await ctx.addInitScript(() => {
      window.Android = { getColors: () => null, setBars() {} };
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      const add = (id, name, type, c) =>
        S.accounts.push({ id, name, type, currency: "USD", opening: 500, archived: false, ...(c ? { c } : {}) });
      add("b", "Bank", "bank");
      add("k", "Card", "card");
      add("c", "Cash", "cash");
      const t = (id, type, account, extra) =>
        S.txns.push({ id, ts: 1, date: today(), type, amount: 5, account, note: "", ...extra });
      t("e1", "expense", "b", { cat: "food" });
      t("e2", "expense", "k", { cat: "food" });
      t("x1", "transfer", "b", { to: "c" });
      save();
      V.screen = "history";
      render();
    });
    return { ctx, page };
  };

  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await open(scheme);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll("#app .tx[data-v]")].map(r => ({
        id: r.dataset.v,
        pills: [...r.querySelectorAll(".s .apill")].map(p => p.textContent),
      }))
    );
    const by = id => (rows.find(r => r.id === id) || {}).pills || [];
    ok(by("e1").join() === "Bank" && by("e2").join() === "Card", scheme + ": the account name sits in a pill");
    ok(by("x1").join() === "Bank,Cash", scheme + ": a transfer has a pill for each account: " + by("x1").join());
    /* every palette colour (and each type's) as an account colour: the name in its pill keeps 4.5:1 on the row */
    const worst = await page.evaluate(() => {
      const cols = [...new Set(PALETTE.concat(Object.values(TYPE_COL)))],
        pill = document.querySelector("#app .tx[data-v] .apill"),
        row = pill.closest(".tx"),
        rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
      let bgEl = row;
      while (bgEl && rgb(getComputedStyle(bgEl).backgroundColor)[3] === 0) bgEl = bgEl.parentElement;
      const under = rgb(getComputedStyle(bgEl || document.body).backgroundColor).slice(0, 3);
      const lum = c =>
        c
          .map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          })
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      let min = 99,
        at = "";
      for (const c of cols) {
        pill.style.setProperty("--acr", hexRgb(c).join(" "));
        const st = getComputedStyle(pill),
          bg = rgb(st.backgroundColor),
          a = bg.length > 3 ? bg[3] : 1,
          mixed = bg.slice(0, 3).map((v, i) => v * a + under[i] * (1 - a)),
          fg = rgb(st.color).slice(0, 3),
          [x, y] = [lum(mixed), lum(fg)],
          ratio = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        if (ratio < min) {
          min = ratio;
          at = c;
        }
      }
      return { min: Math.round(min * 100) / 100, at };
    });
    ok(worst.min >= 4.5, scheme + ": every account colour keeps the name readable, lowest " + JSON.stringify(worst));
    await ctx.close();
  }
  {
    const { ctx, page } = await open();
    const c = await page.evaluate(() => [accEmb(acc("k")).c, accEmb(acc("b")).c]);
    ok(c[0] === "#a646c9" && c[0] !== c[1], "a card without its own colour is purple: " + c.join(" vs "));
    await ctx.close();
  }

  // ---- hold and drag to reorder
  {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US", hasTouch: true });
    await ctx.addInitScript(() => {
      window.Android = { getColors: () => null, setBars() {} };
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.settings.dragTip = true;
      const add = (id, name, type) =>
        S.accounts.push({ id, name, type, currency: "USD", opening: 100, archived: false });
      add("b", "Bank", "bank");
      add("k", "Card", "card");
      add("c", "Cash", "cash");
      add("s", "Savings", "savings");
      add("k2", "Store card", "card");
      S.loans.push({ id: "L1", kind: "lend", person: "Sam", account: "b", date: today(), note: "", status: "open" });
      S.loans.push({ id: "L2", kind: "lend", person: "Mina", account: "b", date: today(), note: "", status: "open" });
      ["L1", "L2"].forEach((l, i) =>
        S.txns.push({
          id: "d" + i,
          ts: 1,
          date: today(),
          type: "loan",
          amount: 10,
          account: "b",
          dir: "out",
          loan: l,
          principal: true,
        })
      );
      S.assets.push(
        { id: "a1", name: "Laptop", value: 900, currency: "USD" },
        { id: "a2", name: "Bike", value: 300, currency: "USD" }
      );
      save();
      V.screen = "assets";
      render();
    });
    const cdp = await ctx.newCDPSession(page);
    const T = (type, x, y) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const mid = sel =>
      page.evaluate(sel => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2, r.height, r.width];
      }, sel);
    /* hold (long enough to lift), slide onto the target's far half, let go */
    const drag = async (from, to, sideways) => {
      await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: "center" }), from);
      const [x, y] = await mid(from);
      await T("touchStart", x, y);
      await page.waitForTimeout(450);
      const [tx, ty, h, w] = await mid(to);
      const ex = sideways ? tx + (tx > x ? w / 4 : -w / 4) : tx,
        ey = sideways ? ty : ty + (ty > y ? h / 4 : -h / 4);
      for (let k = 1; k <= 8; k++) {
        await T("touchMove", x + ((ex - x) * k) / 8, y + ((ey - y) * k) / 8);
        await page.waitForTimeout(16);
      }
      await T("touchEnd");
      await page.waitForTimeout(250);
    };
    const ids = key => page.evaluate(k => JSON.parse(localStorage.getItem("tally:v1"))[k].map(x => x.id), key);
    await drag('[data-src="acc"] [data-v="s"]', '[data-src="acc"] [data-v="b"]');
    ok(
      (await ids("accounts")).join() === "s,k,b,c,k2",
      "Savings above Bank; the cards keep their places: " + (await ids("accounts"))
    );
    ok(
      (await page.evaluate(() =>
        [...document.querySelectorAll('[data-src="acc"] .tx')].map(r => r.dataset.v).join()
      )) === "s,b,c",
      "Assets lists them in the new order"
    );
    await drag('[data-src="lend-open"] [data-v="L2"]', '[data-src="lend-open"] [data-v="L1"]');
    ok((await ids("loans")).join() === "L2,L1", "money owed to you reorders: " + (await ids("loans")));
    await drag('[data-src="assets"] [data-v="a2"]', '[data-src="assets"] [data-v="a1"]');
    ok((await ids("assets")).join() === "a2,a1", "other assets reorder: " + (await ids("assets")));
    await page.evaluate(() => {
      V.screen = "liabs";
      render();
    });
    await drag('[data-src="cards"] [data-v="k2"]', '[data-src="cards"] [data-v="k"]');
    ok((await ids("accounts")).join() === "s,k2,b,c,k", "cards reorder among themselves: " + (await ids("accounts")));
    await page.evaluate(() => {
      V.screen = "home";
      render();
    });
    const chips = () =>
      page.evaluate(() => [...document.querySelectorAll(".strip .acc[data-v]")].map(c => c.dataset.v).join());
    ok((await chips()) === "s,k2,b,c,k", "Home's chips follow the same order");
    await drag('.strip .acc[data-v="b"]', '.strip .acc[data-v="s"]', true);
    ok(
      (await ids("accounts")).join() === "b,s,k2,c,k" && (await chips()) === "b,s,k2,c,k",
      "a chip dragged to the front: " + (await chips())
    );
    /* a short hold that moves at once is a scroll of the strip, not a drag */
    const [x, y] = await mid('.strip .acc[data-v="c"]');
    await T("touchStart", x, y);
    await T("touchMove", x - 60, y);
    await T("touchEnd");
    await page.waitForTimeout(250);
    ok((await ids("accounts")).join() === "b,s,k2,c,k", "a quick swipe on the chips changes nothing");
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
