// Buy me a coffee: Settings → About starts with a link to Tally's Ko-fi page, which the shell opens in the browser
// (Tally stays offline: no permission, the CSP unchanged), labelled in Tally's language, a full touch target.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (o = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: "en-US", ...o });
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
      S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 100, archived: false });
      save();
      V.screen = "settings";
      render();
    });
    return { ctx, page };
  };
  const info = page =>
    page.evaluate(() => {
      const a = document.querySelector('#app a.btn[href^="https://ko-fi.com/"]');
      if (!a) return null;
      const about = [...document.querySelectorAll("#app .sec")].pop();
      return {
        text: a.textContent.trim(),
        href: a.getAttribute("href"),
        h: a.getBoundingClientRect().height,
        afterAbout: about.nextElementSibling === a,
      };
    });
  {
    const { ctx, page } = await open();
    const a = await info(page);
    ok(!!a, "Buy me a coffee shows in Settings");
    ok(a && a.text === "Buy me a coffee", "it is labelled: " + (a && a.text));
    ok(a && a.href === "https://ko-fi.com/iamandelib", "it leads to Tally's Ko-fi page: " + (a && a.href));
    ok(a && a.afterAbout, "it opens the About section");
    ok(a && a.h >= 48, "it is at least 48px tall (" + (a && a.h) + ")");
    ok((await page.textContent("#app")).includes("Source on GitHub"), "the rest of About stays");
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ uiLang: "de", locale: "de-DE" });
    const a = await info(page);
    ok(a && a.text === "Spendier mir einen Kaffee", "in Tally's language: " + (a && a.text));
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
