// Currencies: the picker lists every currency with a name, also on Android's web view (names for only some 60
// currencies, a short list) and on web views too old to list them (before Chrome 99); search finds a currency by any of
// its names (accents, plurals, the English name), its sign, or a country that uses it; signs the phone's data leaves
// out come from the currency's home country (B/. for the Panamanian balboa).
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (locale, init) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale });
    await ctx.addInitScript(fn => {
      window.Android = {
        is24h() {
          return true;
        },
        setReminders() {},
        takeActions() {
          return "[]";
        },
        getColors() {
          return null;
        },
        setBars() {},
        saveFile() {},
      };
      if (fn) new Function(fn)();
    }, init || "");
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(() =>
      localStorage.setItem(
        "tally:v1",
        JSON.stringify({
          v: 6,
          settings: { cur: "USD", week: 1, clock: "24", lastCheck: today() },
          accounts: [{ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 100 }],
          txns: [],
          loans: [],
          assets: [],
        })
      )
    );
    await page.reload();
    await page.waitForTimeout(150);
    return { ctx, page };
  };
  const listed = page => page.$$eval('#curlist [data-act="cur-pick"]', l => l.map(b => b.dataset.v));
  const search = async (page, q) => {
    await page.fill("#cur-q", q);
    await page.waitForTimeout(50);
    return listed(page);
  };

  // ---- 1. Android's web view: currency names for a few currencies only, no country names, a short list
  {
    const few = ["USD", "EUR", "GBP", "JPY", "CNY", "INR", "CAD", "AUD", "CHF", "MXN", "BRL", "RUB", "KRW", "TRY"];
    const { ctx, page } = await open(
      "en-US",
      `const keep = new Set(${JSON.stringify(few)}), DN = Intl.DisplayNames;
       Intl.DisplayNames = function (loc, o) {
         const d = new DN(loc, o);
         return { of: c => (o.type === "currency" && keep.has(c) ? d.of(c) : c) };
       };
       Intl.supportedValuesOf = () => [...keep];`
    );
    ok(
      await page.evaluate(() => new Intl.DisplayNames("en", { type: "currency" }).of("GTQ") === "GTQ"),
      "android: no name for GTQ"
    );
    await page.evaluate(() => curPicker("USD", () => {}));
    await page.waitForTimeout(100);
    const all = await listed(page);
    ok(
      all.includes("GTQ") && all.includes("PAB") && all.length > 150,
      "android: every currency is listed (" + all.length + ")"
    );
    const name = c => page.textContent(`#curlist [data-v="${c}"] .d`);
    ok(
      (await name("GTQ")) === "Guatemalan Quetzal" && (await name("PAB")) === "Panamanian Balboa",
      "android: rows show names"
    );
    for (const [q, c] of [
      ["quetzales", "GTQ"],
      ["balboa", "PAB"],
      ["Panamanian", "PAB"],
      ["B/.", "PAB"],
      ["GTQ", "GTQ"],
      ["pab", "PAB"],
      ["Guatemala", "GTQ"],
      ["Germany", "EUR"],
      ["spain", "EUR"],
      ["United Kingdom", "GBP"],
      ["UK", "GBP"],
      ["Ecuador", "USD"],
      ["El Salvador", "USD"],
      ["cote d'ivoire", "XOF"],
      ["Ivory Coast", "XOF"],
      ["Switzerland", "CHF"],
      ["Bulgaria", "EUR"],
    ])
      ok((await search(page, q)).includes(c), `android: search "${q}" finds ${c}`);
    const pa = await search(page, "Panama");
    ok(pa[0] === "PAB" && pa.includes("USD"), "android: Panama lists the balboa first, then the US dollar: " + pa);
    ok(
      !(await search(page, "United Kingdom")).includes("USD"),
      "android: a country's words must all match one country"
    );
    await ctx.close();
  }

  // ---- 2. a web view before Chrome 99 (no Intl.supportedValuesOf) still lists every currency
  {
    const { ctx, page } = await open("en-US", "delete Intl.supportedValuesOf;");
    ok(await page.evaluate(() => !Intl.supportedValuesOf), "old web view: Intl.supportedValuesOf is missing");
    await page.evaluate(() => curPicker("USD", () => {}));
    await page.waitForTimeout(100);
    const all = await listed(page);
    ok(all.includes("GTQ") && all.includes("PAB"), "old web view: GTQ and PAB are listed");
    ok(all.length > 150, "old web view: every currency is listed (" + all.length + ")");
    const heads = await page.$$eval("#curlist .day", l => l.map(d => d.textContent));
    ok(heads.includes("All currencies"), "old web view: the All currencies section shows");
    ok((await search(page, "GTQ"))[0] === "GTQ", "old web view: searching GTQ finds it");
    await ctx.close();
  }

  // ---- 3. search: accents, plurals, the English name, signs, codes, countries in the phone's language
  {
    const { ctx, page } = await open("es-ES");
    await page.evaluate(() => curPicker("USD", () => {}));
    await page.waitForTimeout(100);
    for (const [q, c] of [
      ["quetzales", "GTQ"],
      ["Quetzal", "GTQ"],
      ["guatemala", "GTQ"],
      ["panameno", "PAB"],
      ["balboa", "PAB"],
      ["balboas", "PAB"],
      ["B/.", "PAB"],
      ["Panamanian", "PAB"],
      ["pab", "PAB"],
      ["Q", "GTQ"],
      ["dolares", "USD"],
      ["Alemania", "EUR"],
      ["Panamá", "PAB"],
      ["Germany", "EUR"],
    ])
      ok((await search(page, q)).includes(c), `search "${q}" finds ${c}`);
    ok(!(await search(page, "quetzales")).includes("PAB"), 'search "quetzales" leaves out PAB');
    await search(page, "zzz");
    ok((await page.textContent("#curlist")).includes("No currency found"), 'search "zzz" finds nothing');
    const m = await page.evaluate(() => [
      curMatch("GTQ", "  "),
      curMatch("EUR", "quetzal"),
      curMatch("PAB", "balboa panameño"),
    ]);
    ok(m[0] && !m[1] && m[2], "curMatch: empty matches all, words must all match");
    // fast enough to filter as you type, on a slow phone too
    const ms = await page.evaluate(() => {
      CURQ.clear(); // from cold: the first keystroke builds every currency's search text
      const t = performance.now();
      for (const q of ["g", "ge", "ger", "germ", "germa", "german"]) curList(q);
      return (performance.now() - t) / 6;
    });
    ok(ms < 50, "a keystroke filters the list in " + ms.toFixed(1) + " ms");
    await ctx.close();
  }

  // ---- 4. signs: the home country's where the phone has none, everything else as before
  {
    const { ctx, page } = await open("en-US");
    const r = await page.evaluate(() => ({
      sym: curSym("PAB"),
      pen: curSym("PEN"),
      gtq: curSym("GTQ"),
      sar: curSym("SAR"),
      short: money(12, "PAB", true),
      big: money(1234, "PAB", true),
      full: money(12, "PAB"),
      neg: signed(-5, "PAB"),
      usd: [money(5, "USD", true), money(5, "USD"), signed(-5, "USD")],
      sek: money(5, "SEK", true),
      sarShort: money(5, "SAR", true),
    }));
    ok(r.sym === "B/." && r.pen === "S/" && r.gtq === "Q", "picker signs: PAB B/., PEN S/, GTQ Q (" + r.gtq + ")");
    ok(r.sar === "", "SAR, with no sign in Latin letters, shows none on an English phone");
    ok(r.short.includes("B/.") && !r.short.includes("PAB") && r.big.includes("B/."), "short PAB: " + r.short);
    ok(r.full.includes("B/.") && r.full.includes("12.00"), "full PAB: " + r.full);
    ok(r.neg.includes("B/.") && r.neg.includes("−") && r.neg.includes("5.00"), "signed PAB: " + r.neg);
    ok(r.usd.join("|") === "$5.00|$5.00|−⁠$5.00", "USD unchanged: " + r.usd.join("|"));
    ok(r.sek === "kr\u00a05.00", "SEK short unchanged: " + r.sek);
    ok(r.sarShort.includes("SAR"), "SAR keeps its code: " + r.sarShort);
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
