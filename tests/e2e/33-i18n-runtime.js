// Translations at run time: Tally picks its language from the phone's languages (es-MX shows Spanish, zh-TW English),
// takes the language and the number format from the shell independently (English words with German numbers), fills
// in values, picks plural forms by each language's rules, escapes names in HTML, and falls back to English for a text
// a catalogue lacks.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
/* small stand-in catalogues, put in before the page's own */
const CATS = {
  es: { "day.today": "Hoy", "t.hi": "Hola, {{name}}" },
  "pt-BR": { "day.today": "Hoje" },
  "zh-Hans": { "day.today": "今天" },
  id: { "day.today": "Hari ini" },
  de: { "day.today": "Heute" },
  ru: {
    "day.today": "Сегодня",
    "t.n_one": "{{count}} запись",
    "t.n_few": "{{count}} записи",
    "t.n_many": "{{count}} записей",
    "t.n_other": "{{count}} записи",
  },
};
/* no-break spaces (between number and currency, in groups of digits) as plain ones */
const sp = s => String(s).replace(/[\u00a0\u202f]/g, " ");
const EN = {
  "t.hi": "Hi, {{name}}",
  "t.n_one": "{{count}} entry",
  "t.n_other": "{{count}} entries",
  "t.only": "English",
};

(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (o, android) => {
    const { locale = "en-US", ...rest } = o;
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale, ...rest });
    await ctx.addInitScript(
      ([cats, en, android]) => {
        window.I18N = {};
        for (const c in cats) window.I18N[c] = JSON.stringify(cats[c]);
        window.__en = en;
        if (android) window.Android = { getLocale: () => JSON.stringify(android), getColors: () => null, setBars() {} };
      },
      [CATS, EN, android]
    );
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    // the test texts join English's
    await page.evaluate(() => Object.assign(i18nCat("en"), window.__en));
    return { ctx, page };
  };

  // ---- 1. the language from the browser's languages, by language and script
  for (const [langs, want] of [
    [["es-MX"], "es"],
    [["es"], "es"],
    [["pt-PT"], "pt-BR"],
    [["pt-BR"], "pt-BR"],
    [["zh-CN"], "zh-Hans"],
    [["zh-SG"], "zh-Hans"],
    [["zh-TW"], "en"],
    [["zh-HK"], "en"],
    [["in"], "id"],
    [["id-ID"], "id"],
    [["nb-NO"], "en"],
    [["nb-NO", "de-AT"], "de"],
    [["en-GB", "de"], "en"],
  ]) {
    const { ctx, page } = await open({ uiLang: langs });
    const r = await page.evaluate(() => [LOC.ui, document.documentElement.lang]);
    ok(r[0] === want && r[1] === want, langs.join(",") + " → " + want + ": " + r);
    await ctx.close();
  }

  // ---- 2. on Android, the shell says both: the words' language and the number format, independently
  {
    const { ctx, page } = await open({ locale: "en-US" }, { ui: "en", fmt: "de-DE" });
    const r = await page.evaluate(() => ({
      loc: LOC,
      today: T("day.today"),
      money: money(1234.5, "EUR"),
      sep: NUMSEP.dec,
      date: dayLabel("2026-03-05"),
    }));
    ok(r.loc.ui === "en" && r.loc.fmt === "de-DE", "android: ui en, fmt de-DE: " + JSON.stringify(r.loc));
    ok(r.today === "Today", "android: English words: " + r.today);
    ok(sp(r.money) === "1.234,50 €" && r.sep === ",", "android: German numbers: " + r.money);
    ok(/März/.test(r.date), "android: German dates: " + r.date);
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ locale: "de-DE" }, { ui: "de", fmt: "en-US" });
    const r = await page.evaluate(() => [T("day.today"), money(1234.5, "USD"), document.documentElement.lang]);
    ok(r[0] === "Heute" && r[1] === "$1,234.50" && r[2] === "de", "android: German words, American numbers: " + r);
    await ctx.close();
  }
  {
    // a language the app has no catalogue for, or a broken format: English, and the web view's own format
    const { ctx, page } = await open({ locale: "nl-NL" }, { ui: "xx", fmt: "not a locale!" });
    const r = await page.evaluate(() => [LOC.ui, LOC.fmt === undefined, money(5, "EUR")]);
    ok(r[0] === "en" && r[1] && sp(r[2]) === "€ 5,00", "android: unknown language and broken format fall back: " + r);
    await ctx.close();
  }

  // ---- 3. values, plurals, escaping, fallbacks
  {
    const { ctx, page } = await open({ uiLang: "ru", locale: "ru-RU" });
    const r = await page.evaluate(() => ({
      n: [1, 2, 5, 21, 22, 11, 1.5, 1000].map(count => T("t.n", { count })),
      only: T("t.only"),
      hi: T("t.hi", { name: "Аня" }),
    }));
    ok(
      sp(r.n.join("|")) === "1 запись|2 записи|5 записей|21 запись|22 записи|11 записей|1,5 записи|1 000 записей",
      "ru: plural forms and counts in the number format: " + r.n.join("|")
    );
    ok(r.only === "English", "ru: a text the catalogue lacks comes in English: " + r.only);
    ok(r.hi === "Hi, Аня", "ru: the English text, with its value: " + r.hi);
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ uiLang: "es" });
    const r = await page.evaluate(() => {
      const logged = [],
        err = console.error;
      console.error = m => logged.push(m);
      const out = {
        plain: T("t.hi", { name: '<img src=x onerror="alert(1)">' }),
        html: TH("t.hi", { name: "<b>\"Tom\" & 'Jerry'</b>" }),
        raw: TH("t.hi", { name: { html: "<bdi>Ana</bdi>" } }),
        missing: T("t.nope"),
        noValue: T("t.hi"),
        logged,
      };
      console.error = err;
      return out;
    });
    ok(r.plain === 'Hola, <img src=x onerror="alert(1)">', "T: plain text, as given: " + r.plain);
    ok(r.html === "Hola, &lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;", "TH: values escaped: " + r.html);
    ok(r.raw === "Hola, <bdi>Ana</bdi>", "TH: {html} values kept: " + r.raw);
    ok(r.missing === "t.nope" && r.noValue === "Hola, ", "missing: the key, a missing value empty");
    ok(
      r.logged.join("|") === "i18n: missing t.nope|i18n: t.hi needs {{name}}",
      "missing texts and values are reported: " + r.logged.join("|")
    );
    await ctx.close();
  }
  {
    // the app's own texts: Spanish where the catalogue has them, English for the rest
    const { ctx, page } = await open({ uiLang: "es" });
    const r = await page.evaluate(() => [shortDay(today()), shortDay(addDays(today(), -1))]);
    ok(r[0] === "Hoy" && r[1] === "Yesterday", "es: Hoy, and English where the catalogue has no text: " + r);
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
