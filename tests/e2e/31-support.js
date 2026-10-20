// Support Tally: Settings ends with a link to the donation page, opened in the browser (Tally stays offline).
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async locale => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale });
    await ctx.addInitScript(() => {
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
    });
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
  {
    const { ctx, page } = await open("en-US");
    await page.evaluate(() => {
      V.screen = "settings";
      render();
    });
    const a = await page.$('a.btn[href^="https://"]');
    ok(!!a, "Support Tally shows");
    const info = await a.evaluate(e => ({
      text: e.textContent.trim(),
      href: e.getAttribute("href"),
      h: e.getBoundingClientRect().height,
    }));
    ok(info.text === "Support Tally", "it is labelled: " + info.text);
    ok(
      /^https:\/\/(ko-fi\.com|buymeacoffee\.com|www\.buymeacoffee\.com)\//.test(info.href),
      "it leads to " + info.href
    );
    ok(info.h >= 48, "it is at least 48px tall (" + info.h + ")");
    ok((await page.textContent("#app")).includes("Source on GitHub"), "the rest of About stays");
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
