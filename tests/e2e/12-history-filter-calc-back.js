const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("12-history-filter-calc-back");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    locale: "en-CA",
  });
  await ctx.addInitScript(() => {
    window.Android = {
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
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const settle = () => page.waitForTimeout(150);

  // ---- 1. History account filter: chips size to their text and the row scrolls
  await page.goto(appUrl);
  await page.evaluate(() =>
    localStorage.setItem(
      "tally:v1",
      JSON.stringify({
        v: 6,
        settings: { cur: "BDT" },
        accounts: [
          { id: "c", name: "City Bank", type: "bank", currency: "BDT", opening: 1000 },
          { id: "k", name: "Bkash", type: "wallet", currency: "BDT", opening: 1000 },
          { id: "w", name: "Wallet", type: "cash", currency: "BDT", opening: 1000 },
          { id: "b", name: "Brac Joint", type: "bank", currency: "BDT", opening: 1000 },
          { id: "d", name: "Dbbl", type: "bank", currency: "BDT", opening: 1000 },
        ],
        txns: [],
        loans: [],
        assets: [],
      })
    )
  );
  await page.reload();
  await settle();
  await act("go", "history");
  await settle();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await settle();
  const chipBoxes = await page.evaluate(() =>
    [...document.querySelectorAll(".strip .chip")].map(c => ({
      text: c.textContent,
      width: c.getBoundingClientRect().width,
      scrollWidth: c.scrollWidth,
    }))
  );
  ok(
    chipBoxes.every(c => c.scrollWidth <= c.width + 1),
    "every account chip is wide enough for its own text, no clipping: " + JSON.stringify(chipBoxes)
  );
  const stripOverflow = await page.evaluate(() => {
    const s = document.querySelector(".strip");
    return { clientWidth: s.clientWidth, scrollWidth: s.scrollWidth };
  });
  ok(
    stripOverflow.scrollWidth > stripOverflow.clientWidth,
    "the filter row overflows and scrolls instead of squeezing chips: " + JSON.stringify(stripOverflow)
  );
  await page.screenshot({ path: OUT + "/history-chips.png" });
  // scroll it to confirm the last chip is reachable, not just visually truncated
  await page.evaluate(() => {
    document.querySelector(".strip").scrollLeft = 9999;
  });
  await settle();
  await page.screenshot({ path: OUT + "/history-chips-scrolled.png" });
  const lastChip = await page.evaluate(() => {
    const cs = [...document.querySelectorAll(".strip .chip")];
    const c = cs[cs.length - 1];
    return { text: c.textContent, width: c.getBoundingClientRect().width, scrollWidth: c.scrollWidth };
  });
  ok(
    lastChip.scrollWidth <= lastChip.width + 1,
    "scrolled into view, the last chip is unclipped too: " + JSON.stringify(lastChip)
  );

  // ---- 2/3. calculator: taller keys, visible caret (stays focused, not blurred), inputmode swap
  await act("home");
  await settle();
  await page.click("#ring .cat");
  await settle();
  const keyHeight = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector(".calc button:not(.calcbtn)")).height)
  );
  ok(keyHeight >= 50, "calculator keys are taller than before (>=50px): " + keyHeight);
  await act("calc-toggle", "f-amt");
  await settle();
  const openState = await page.evaluate(() => {
    const inp = document.getElementById("f-amt");
    return { active: document.activeElement === inp, readOnly: inp.readOnly, inputmode: inp.getAttribute("inputmode") };
  });
  ok(openState.active, "the amount field stays focused while the calculator is open (so its caret shows), not blurred");
  ok(openState.readOnly === true, "the field is read-only while the calculator is open (no manual typing)");
  ok(
    openState.inputmode === "none",
    'inputmode is "none" while the calculator is open, suppressing the system keyboard'
  );
  await page.screenshot({ path: OUT + "/calc-taller-caret.png" });
  await act("calc-toggle", "f-amt");
  await settle();
  const closedState = await page.evaluate(() => {
    const inp = document.getElementById("f-amt");
    return { readOnly: inp.readOnly, inputmode: inp.getAttribute("inputmode") };
  });
  ok(
    closedState.readOnly === false && closedState.inputmode === "decimal",
    "after closing, the field is editable again with the normal decimal keyboard: " + JSON.stringify(closedState)
  );
  await act("close");

  // ---- 4. Android back closes just the calculator (applying the result), not the whole sheet
  await page.click("#ring .cat");
  await settle();
  await act("calc-toggle", "f-amt");
  await settle();
  for (const k of ["5", "0", "×", "2"]) await page.click(`#calc-f-amt [data-act="calc-key"][data-v="${k}"]`);
  const backResult = await page.evaluate(() => window.tallyBack());
  ok(backResult === true, "tallyBack() reports it handled the back press");
  ok(await page.isHidden("#calc-f-amt"), "the calculator panel closed on back");
  ok(await page.isVisible("#sheet .btn"), "the sheet underneath stayed open — back only closed the calculator");
  ok(
    (await page.inputValue("#f-amt")) === "100",
    "the in-progress calculation (50×2) was applied on back, got " + (await page.inputValue("#f-amt"))
  );
  await act("close");

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  ok(
    !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)),
    "no horizontal overflow outside the intentionally-scrollable strip"
  );

  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
