// Accounts at a glance (#37, #33). History rows show each account's name in a soft pill of its colour (a transfer, one per
// account), readable (WCAG AA) on every colour of the palette in light and dark; a card without a colour of its own is
// purple, not the bank's blue.
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

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
