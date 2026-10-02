// Region: a new notebook chooses its currency; Settings → Region sets the main currency, the first day of the week
// (calendars and weekly summaries) and the time format. Saves from before these settings keep what they showed.
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("21-region");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    locale: "en-US",
  });
  await ctx.addInitScript(() => {
    window.Android = {
      is24h() {
        return sessionStorage.getItem("h24") !== "0";
      },
      setReminders() {},
      requestNotifications() {},
      takeActions() {
        return "[]";
      },
      getColors() {
        return null;
      },
      setBars() {},
      saveFile() {},
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  const settle = () => page.waitForTimeout(150);
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const t = await page.evaluate(() => today());
  const seed = async (settings, extra) => {
    await page.evaluate(
      ([settings, extra, t]) =>
        localStorage.setItem(
          "tally:v1",
          JSON.stringify(
            Object.assign(
              {
                v: 6,
                settings: Object.assign({ lastCheck: t }, settings),
                accounts: [{ id: "a", name: "Bank", type: "bank", currency: "CAD", opening: 100 }],
                txns: [],
                loans: [],
                assets: [],
              },
              extra
            )
          )
        ),
      [settings, extra, t]
    );
    await page.reload();
    await settle();
  };

  // ---- 1. a new notebook: no currency until one is chosen
  let S = await page.evaluate(() => S);
  ok(S.settings.cur === "" && S.settings.week === 1 && S.settings.clock === "24", "new: no currency, Monday, 24-hour");
  ok((await page.textContent(".welcome .fieldbtn")).includes("Choose your currency"), "welcome asks for a currency");
  await page.screenshot({ path: OUT + "/welcome.png" });
  // "Add first account" first asks for the currency, then opens the form in it
  await act("acc-form");
  await settle();
  ok(await page.isVisible("#curlist"), "adding the first account asks for the currency first");
  ok((await page.textContent("#sheet2 h2")).trim() === "Your currency", "picker titled Your currency");
  await page.fill("#cur-q", "euro");
  await settle();
  await page.click('#curlist [data-v="EUR"]');
  await settle();
  ok(await page.isVisible("#f-name"), "then the account form opens");
  ok((await page.textContent("#f-cur")).includes("EUR"), "in the chosen currency");
  ok((await state()).settings.cur === "EUR", "and it is the main currency");
  ok(!/RBC|bKash/.test(await page.getAttribute("#f-name", "placeholder")), "the name example names no bank or service");
  await page.click('#sheet [data-act="close"]');
  // a new asset asks the same way, once
  await seed({ cur: "" }, { accounts: [] });
  await page.evaluate(() => assetForm());
  await settle();
  ok(await page.isVisible("#curlist"), "a first asset asks for the currency too");
  await page.click('#curlist [data-v="JPY"]');
  await settle();
  ok((await page.textContent("#f-cur")).includes("JPY"), "the asset form opens in it");
  await page.click('#sheet [data-act="close"]');
  // cancelling the picker adds nothing and asks again next time
  await seed({ cur: "" }, { accounts: [] });
  await act("acc-form");
  await settle();
  await page.click('#sheet2 [data-act="close2"]');
  await settle();
  ok(!(await page.isVisible("#f-name")) && (await page.evaluate(() => S.settings.cur)) === "", "cancel: nothing set");

  // ---- 2. an existing notebook keeps what it had
  await seed({ cur: "CAD" });
  S = await page.evaluate(() => S);
  ok(S.settings.cur === "CAD" && S.settings.week === 1 && S.settings.clock === "24", "old save: CAD, Monday, 24h");
  await page.evaluate(() => sessionStorage.setItem("h24", "0"));
  await seed({ cur: "CAD" });
  ok((await page.evaluate(() => S.settings.clock)) === "12", "old save on a 12-hour phone stays 12-hour");
  await page.evaluate(() => sessionStorage.removeItem("h24"));
  await seed({ cur: "zz" });
  ok((await page.evaluate(() => S.settings.cur)) === "CAD", "a broken main currency takes the account's");
  await seed({ cur: "CAD", week: 9, clock: "x" });
  S = await page.evaluate(() => S);
  ok(S.settings.week === 1 && S.settings.clock === "24", "bad week / clock values are repaired");

  // ---- 3. Settings → Region
  await seed({ cur: "CAD", clock: "24" });
  await act("go", "settings");
  await settle();
  const segOn = act => page.$eval(`.seg [data-act="${act}"][aria-pressed="true"]`, b => b.dataset.v).catch(() => null);
  ok((await segOn("week")) === "1" && (await segOn("clock")) === "24", "Region shows Monday and 24-hour");
  const weekLabels = await page.$$eval('[data-act="week"]', b => b.map(x => x.textContent));
  ok(weekLabels.join() === "Monday,Sunday,Saturday", "week choices " + weekLabels);
  await page.screenshot({ path: OUT + "/settings.png" });
  const nudge = () => page.textContent('[data-act="pick-time"][data-v="nudge"] span');
  ok((await nudge()) === "21:00", "24-hour: 21:00");
  await act("clock", "12");
  await settle();
  ok((await nudge()).replace(/\s/g, " ") === "9:00 PM", "12-hour: " + (await nudge()));
  await act("pick-time", "nudge");
  await settle();
  ok(!!(await page.$("#tp-ap")), "12-hour wheel has AM/PM");
  await page.click('[data-act="tp-ok"]');
  await settle();
  await act("clock", "24");
  await settle();
  await act("pick-time", "nudge");
  await settle();
  ok(!(await page.$("#tp-ap")), "24-hour wheel has no AM/PM");
  await page.click('[data-act="tp-ok"]');
  await settle();

  // first day of week: calendars and summary weeks follow
  for (const w of [1, 0, 6]) {
    if (!(await page.$('[data-act="week"]'))) await act("go", "settings");
    await settle();
    await act("week", w);
    await settle();
    ok((await state()).settings.week === w, "week saved: " + w);
    await act("home");
    await settle();
    await page.click(".pnav .plabel");
    await page.click('#pd [data-act="pd-tab"][data-v="day"]');
    await settle();
    const cal = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#pd [data-act="pd-day"]')].map(b => b.dataset.v),
        head = [...document.querySelectorAll("#pd .cal-wd span")].map(s => s.textContent),
        first = cells.find(d => d.endsWith("-01"));
      return {
        firstDay: parseISO(cells[0]).getDay(),
        col1st: cells.indexOf(first) % 7,
        want1st: (parseISO(first).getDay() - S.settings.week + 7) % 7,
        head,
        headWant: [0, 1, 2, 3, 4, 5, 6].map(i =>
          parseISO(addDays("2024-01-07", S.settings.week + i)).toLocaleDateString(undefined, { weekday: "narrow" })
        ),
        wk: parseISO(weekStart(today())).getDay(),
      };
    });
    if (w === 0) await page.screenshot({ path: OUT + "/calendar-sunday.png" });
    ok(cal.firstDay === w && cal.col1st === cal.want1st, "calendar starts on day " + w + " " + JSON.stringify(cal));
    ok(cal.head.join() === cal.headWant.join(), "weekday header follows: " + cal.head.join(""));
    ok(cal.wk === w, "summary weeks start on day " + w);
    await page.click('#pd [data-act="pd-close"]');
    await settle();
  }

  // ---- 4. Delete all data keeps the region choices
  await page.evaluate(() => {
    S.settings.week = 0;
    S.settings.clock = "12";
    save();
    wipeConfirm();
  });
  await settle();
  const yes = await page.$('#pop [data-act="ask-ok"]');
  if (yes) await yes.click();
  await settle();
  S = await page.evaluate(() => S);
  ok(
    !S.accounts.length && S.settings.cur === "CAD" && S.settings.week === 0 && S.settings.clock === "12",
    "Delete all data keeps currency, week and time format " + JSON.stringify([S.settings.cur, S.settings.week])
  );
  ok((await page.textContent(".welcome .fieldbtn")).includes("CAD"), "welcome shows the kept currency");

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
