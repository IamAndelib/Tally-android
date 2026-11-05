// Accounts at a glance (#37, #33). History rows name each account on a line of its own with its balance, after a dot of
// its colour (a transfer, a line per account), the name readable (WCAG AA) in light and dark; a card without a colour of its own is
// purple, not the bank's blue. Hold and drag reorders every list in Assets and Liabilities (accounts, cards, money owed
// either way, other assets) and Home's balance chips; Home keeps an order of its own (settings.chipOrder, new accounts
// last), Assets the accounts' order, other kinds keep their places among them, and a drop onto a section's box still
// archives instead of reordering.
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
        accs: [...r.querySelectorAll(".s bdi")].map(p => p.textContent),
        dots: [...r.querySelectorAll(".s .adot")].map(d => getComputedStyle(d).backgroundColor),
        bals: [...r.querySelectorAll(".rb, .ac")].length,
      }))
    );
    const by = id => rows.find(r => r.id === id) || { accs: [], dots: [] };
    ok(
      by("e1").accs.join() === "Bank" && by("e2").accs.join() === "Card" && by("e1").bals === 0,
      scheme + ": each entry names its account on its second line, with no balance on the row"
    );
    ok(
      by("x1").accs.join() === "Bank,Cash" && by("x1").bals === 0,
      scheme + ": a transfer reads From → To: " + by("x1").accs.join()
    );
    const want = await page.evaluate(() => ["b", "k"].map(id => "rgb(" + hexRgb(accEmb(acc(id)).c).join(", ") + ")"));
    ok(
      by("e1").dots[0] === want[0] && by("e2").dots[0] === want[1],
      scheme + ": a dot of the account's colour before its name " + JSON.stringify([by("e1").dots, want])
    );
    /* the name itself is plain text in the row's quiet colour: readable (4.5:1) whatever the account's colour */
    const worst = await page.evaluate(() => {
      const an = document.querySelector("#app .tx[data-v] .s"),
        rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
      let bgEl = an;
      while (bgEl && rgb(getComputedStyle(bgEl).backgroundColor)[3] === 0) bgEl = bgEl.parentElement;
      const lum = c =>
        c
          .map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          })
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const [x, y] = [
        lum(rgb(getComputedStyle(bgEl || document.body).backgroundColor).slice(0, 3)),
        lum(rgb(getComputedStyle(an).color).slice(0, 3)),
      ];
      return { min: Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100 };
    });
    ok(worst.min >= 4.5, scheme + ": the account's name is readable on the row " + JSON.stringify(worst));
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
    ok((await chips()) === "s,k2,b,c,k", "with no order of their own yet, Home's chips follow the accounts' order");
    /* mid-drag: the chip's place is faded where it will land, the lifted copy at its own size */
    const look = await (async () => {
      await page.evaluate(() => document.querySelector('.strip .acc[data-v="b"]').scrollIntoView({ inline: "center" }));
      const [x0, y0] = await mid('.strip .acc[data-v="b"]');
      await T("touchStart", x0, y0);
      await page.waitForTimeout(450);
      await T("touchMove", x0 - 4, y0); // lifted, not yet past another chip
      const r = await page.evaluate(() => ({
        faded: getComputedStyle(document.querySelector(".strip .acc.placeholder")).opacity,
        scale: getComputedStyle(document.querySelector(".ghost")).transform,
      }));
      await T("touchEnd");
      await page.waitForTimeout(250);
      await page.evaluate(() => (document.querySelector(".strip").scrollLeft = 0));
      return r;
    })();
    ok(
      look.faded === "0.3" && look.scale === "none",
      "while dragged: its place faded, the lifted chip unscaled " + JSON.stringify(look)
    );
    /* one tick per switch: hovering over a neighbour, even wiggling on it, doesn't keep ticking */
    {
      await page.evaluate(() => {
        window.__ticks = 0;
        Android.haptic = k => k === "tick" && window.__ticks++;
      });
      await page.evaluate(() => document.querySelector('.strip .acc[data-v="c"]').scrollIntoView({ inline: "center" }));
      const [x0, y0] = await mid('.strip .acc[data-v="c"]');
      const [kx, , , kw] = await mid('.strip .acc[data-v="k"]');
      await T("touchStart", x0, y0);
      await page.waitForTimeout(450);
      for (let k = 1; k <= 6; k++) await T("touchMove", x0 + ((kx + kw / 4 - x0) * k) / 6, y0);
      for (let k = 0; k < 10; k++) await T("touchMove", kx + kw / 4 + (k % 2 ? 6 : -6), y0);
      const n = await page.evaluate(() => window.__ticks);
      await T("touchEnd");
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        delete Android.haptic;
        delete S.settings.chipOrder;
        save();
        render();
        document.querySelector(".strip").scrollLeft = 0;
      });
      ok(n === 1, "a chip held over its neighbour ticks once, not on every move: " + n);
    }
    await drag('.strip .acc[data-v="b"]', '.strip .acc[data-v="s"]', true);
    ok(
      (await chips()) === "b,s,k2,c,k" && (await ids("accounts")).join() === "s,k2,b,c,k",
      "a chip dragged to the front moves on Home only; Assets keeps its order: " + (await chips())
    );
    ok(
      (await page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")).settings.chipOrder.join())) ===
        "b,s,k2,c,k",
      "Home's order is kept as its own"
    );
    /* and the other way round: reordering in Assets leaves Home as it is */
    await page.evaluate(() => {
      V.screen = "assets";
      render();
    });
    await drag('[data-src="acc"] [data-v="c"]', '[data-src="acc"] [data-v="s"]');
    await page.evaluate(() => {
      V.screen = "home";
      render();
    });
    ok(
      (await ids("accounts")).join() === "c,k2,s,b,k" && (await chips()) === "b,s,k2,c,k",
      "a drag in Assets doesn't move Home's chips: " + (await ids("accounts")) + " / " + (await chips())
    );
    /* a new account comes last on Home; a deleted one drops out of Home's order on the next start */
    const after = await page.evaluate(() => {
      S.accounts.push({ id: "n", name: "New", type: "bank", currency: "USD", opening: 0, archived: false });
      save();
      render();
      const chipsNow = homeAccounts()
        .map(a => a.id)
        .join();
      const m = migrate({ v: 7, settings: { cur: "USD", chipOrder: ["b", "gone", "b", 5, "c"] }, accounts: S.accounts })
        .settings.chipOrder;
      return { chipsNow, m: m.join() };
    });
    ok(after.chipsNow === "b,s,k2,c,k,n", "a new account comes last on Home: " + after.chipsNow);
    ok(after.m === "b,c", "a broken saved order keeps only known accounts, once: " + after.m);
    /* a short hold that moves at once is a scroll of the strip, not a drag */
    const [x, y] = await mid('.strip .acc[data-v="c"]');
    await T("touchStart", x, y);
    await T("touchMove", x - 60, y);
    await T("touchEnd");
    await page.waitForTimeout(250);
    ok((await chips()) === "b,s,k2,c,k,n", "a quick swipe on the chips changes nothing");
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
