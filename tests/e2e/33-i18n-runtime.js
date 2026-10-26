// Translations at run time: Tally picks its language from the phone's languages (es-MX shows Spanish, zh-TW English),
// takes the language and the number format from the shell independently (English words with German numbers), fills
// in values, picks plural forms by each language's rules, escapes names in HTML, and falls back to English for a text
// a catalogue lacks. Built-in categories show in the language but keep their English name in the data; problem codes
// from the shell, AM/PM, account types, colour names, the Language row and name search follow the language too.
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
  de: {
    "day.today": "Heute",
    "cat.groceries": "Lebensmittel",
    "type.cash": "Bargeld",
    "color.green": "Grün",
    "color.blueDark": "Dunkelblau",
    "native.err.no_folder": "Kein Ordner gewählt.",
    "native.err.saved_temp": "Gesichert als „{{file}}“.",
    "settings.language": "Sprache",
    "lang.name": "Deutsch",
  },
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

  // ---- 4. built-in categories speak the language, but keep their English name in the data
  {
    const { ctx, page } = await open({ uiLang: "de", locale: "de-DE" });
    const r = await page.evaluate(() => {
      localStorage.clear();
      S = blank();
      S.settings.cur = "EUR";
      S.accounts.push({ id: "a", name: "Konto", type: "bank", currency: "EUR", opening: 10 });
      const g = S.cats.find(c => c.id === "groceries");
      const out = { shown: catName(g) };
      catForm("groceries", "out");
      out.field = $("#f-cname").value;
      saveCat(); // unchanged: stays the English default, still translated
      out.kept = S.cats.find(c => c.id === "groceries").name;
      out.still = catName(S.cats.find(c => c.id === "groceries"));
      catForm("groceries", "out");
      $("#f-cname").value = "Supermarkt";
      saveCat();
      out.renamed = [S.cats.find(c => c.id === "groceries").name, catName(S.cats.find(c => c.id === "groceries"))];
      out.other = catName(S.cats.find(c => c.id === "fun")); // no German text in this catalogue: English
      return out;
    });
    ok(r.shown === "Lebensmittel" && r.field === "Lebensmittel", "de: a built-in category shows in German: " + r.field);
    ok(r.kept === "Groceries" && r.still === "Lebensmittel", "de: saved unchanged, it stays Groceries in the data");
    ok(r.renamed.join() === "Supermarkt,Supermarkt", "de: a renamed one shows as typed: " + r.renamed);
    ok(r.other === "Fun", "de: a category the catalogue lacks shows in English");
    // types: found as taken in English or German; colour names whole
    const t = await page.evaluate(() => {
      accForm();
      typeDialog();
      $("#nt-name").value = "cash";
      addType();
      const a = F.type;
      typeDialog();
      $("#nt-name").value = "BARGELD";
      addType();
      return [a, F.type, S.types.length, typeName("cash"), colName("#15a06f"), colName("#102a60")];
    });
    ok(t[0] === "cash" && t[1] === "cash" && t[2] === 0, "de: a type typed in English or German is the built-in one");
    ok(t[3] === "Bargeld" && t[4] === "Grün" && t[5] === "Dunkelblau", "de: type and colour names: " + t.slice(3));
    await ctx.close();
  }

  // ---- 5. problems the shell reports as codes; the Language row (Android 13+)
  {
    const { ctx, page } = await open({ uiLang: "de" });
    const r = await page.evaluate(() => [
      nativeErr("no_folder"),
      nativeErr("saved_temp"),
      nativeErr("Tally can't open the backup folder any more."), // stored by 1.4.1: shown as it is
      nativeErr("not_backup"), // no German text: English
    ]);
    ok(r[0] === "Kein Ordner gewählt." && r[1] === "Gesichert als „Tally backup (new).json“.", "codes said in German");
    ok(
      r[2] === "Tally can't open the backup folder any more." && r[3] === "That isn't a Tally backup file",
      "old sentences and gaps"
    );
    await ctx.close();
  }
  for (const on of [true, false]) {
    const { ctx, page } = await open({ uiLang: "de" });
    const r = await page.evaluate(on => {
      window.Android = {
        appLanguage: () => on,
        openSetting: k => (window.opened = k),
        getColors: () => null,
        setBars() {},
      };
      V.screen = "settings";
      render();
      const b = $('[data-act="lang-open"]');
      if (b) b.click();
      return [!!b, b ? b.textContent : "", window.opened || ""];
    }, on);
    ok(
      on ? r[0] && r[1] === "Deutsch" && r[2] === "lang" : !r[0],
      on ? "Android 13+: Settings → Region shows the language and opens Android's setting" : "older: no Language row"
    );
    await ctx.close();
  }

  // ---- 6. AM/PM as the phone writes them; Turkish names found with ı / İ
  {
    const { ctx, page } = await open({ locale: "es-ES" });
    const r = await page.evaluate(() => {
      S.settings.clock = "12";
      const want = new Intl.DateTimeFormat(LOC.fmt, { hour: "numeric", hourCycle: "h12" })
        .formatToParts(new Date(2024, 0, 1, 15))
        .find(x => x.type === "dayPeriod").value;
      let got = "";
      timePicker("x", "15:30", v => (got = v));
      const shown = $("#tp-ap").getAttribute("aria-valuetext");
      timeOk();
      return [want, shown, got];
    });
    ok(r[1] === r[0] && r[0] !== "PM" && r[2] === "15:30", "es: the picker says " + r[0] + " and still saves 15:30");
    const t = await page.evaluate(() => {
      S.settings.cur = "TRY";
      S.accounts.push({ id: "a", name: "Kasa", type: "cash", currency: "TRY", opening: 100 });
      S.loans.push({ id: "L", kind: "lend", person: "İrem", account: "a", date: today(), note: "", status: "open" });
      S.txns.push({
        id: "p",
        ts: 1,
        type: "loan",
        dir: "out",
        loan: "L",
        principal: true,
        amount: 5,
        account: "a",
        date: today(),
      });
      return ["irem", "ırem", "İR"].map(q => personCandidates("lend", "TRY", q).length);
    });
    ok(t.join() === "1,1,1", "tr: İrem is suggested for irem, ırem and İR: " + t);
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
