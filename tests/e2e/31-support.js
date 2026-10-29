// Buy me a coffee: Settings → About starts with a link to Tally's Ko-fi page, which the shell opens in the browser
// (Tally stays offline: no permission, the CSP unchanged), labelled in Tally's language, a full touch target, in
// Ko-fi's coral in light and dark with text that passes WCAG AA on it.
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
      const about = [...document.querySelectorAll("#app .sec")].pop(),
        rgb = c => c.match(/\d+/g).slice(0, 3).map(Number),
        lum = c =>
          rgb(c)
            .map(v => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
            .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0),
        st = getComputedStyle(a),
        [l1, l2] = [lum(st.color), lum(st.backgroundColor)].sort((x, y) => y - x);
      return {
        bg: st.backgroundColor,
        contrast: (l1 + 0.05) / (l2 + 0.05),
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
  for (const colorScheme of ["light", "dark"]) {
    const { ctx, page } = await open({ colorScheme });
    const a = await info(page);
    ok(
      a && a.bg === "rgb(255, 94, 91)" && a.contrast >= 4.5,
      colorScheme + ": Ko-fi's coral, its text readable (" + (a && a.contrast.toFixed(2)) + ":1)"
    );
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
