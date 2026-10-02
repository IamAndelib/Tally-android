// Accessibility: focus moves into sheets and dialogs and back, the page behind them is hidden from screen readers,
// expandable rows, the time wheel, the ring's currency switch and the loan bar say what they are, calendar days are read
// as dates, percentages and swatches are readable and large enough to tap.
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
outDir("24-accessibility");
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
    locale: "en-US",
  });
  await ctx.addInitScript(() => {
    window.Android = {
      setReminders() {},
      takeActions() {
        return "[]";
      },
      getColors() {
        return null;
      },
      setBars() {},
      requestNotifications() {},
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  const settle = () => page.waitForTimeout(150);
  const t = await page.evaluate(() => today());
  const d5 = await page.evaluate(() => addDays(today(), -5));
  await page.evaluate(o => localStorage.setItem("tally:v1", JSON.stringify(o)), {
    v: 6,
    settings: { cur: "USD", clock: "24", lastCheck: t, dragTip: true },
    accounts: [
      { id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1000 },
      { id: "e", name: "Euro cash", type: "cash", currency: "EUR", opening: 50 },
    ],
    txns: [
      { id: "x1", ts: 1, date: t, type: "expense", amount: 30, account: "a", cat: "food", note: "" },
      { id: "x2", ts: 2, date: t, type: "expense", amount: 20, account: "a", cat: "transport", note: "" },
      { id: "x3", ts: 3, date: t, type: "expense", amount: 10, account: "e", cat: "shopping", note: "" },
      {
        id: "d1",
        ts: 4,
        date: d5,
        type: "loan",
        amount: 100,
        account: "a",
        note: "",
        dir: "out",
        loan: "L",
        principal: true,
      },
      { id: "p1", ts: 5, date: t, type: "loan", amount: 40, account: "a", note: "", dir: "in", loan: "L" },
    ],
    loans: [{ id: "L", kind: "lend", person: "Sam", account: "a", date: d5, status: "open" }],
    assets: [],
  });
  await page.reload();
  await settle();

  // ---- 1. focus into a sheet, the page behind hidden, focus back on close
  await page.focus('[data-act="add-out"]');
  await page.keyboard.press("Enter");
  await settle();
  const inSheet = await page.evaluate(() => ({
    focus: !!document.activeElement.closest("#sheet"),
    app: $("#app").getAttribute("aria-hidden") === "true" && $("#app").inert !== false,
    nav: $("#nav").getAttribute("aria-hidden") === "true",
  }));
  ok(
    inSheet.focus && inSheet.app && inSheet.nav,
    "a sheet takes the focus and hides the page " + JSON.stringify(inSheet)
  );
  await page.evaluate(() => datePicker($("#f-date")));
  await settle();
  const inPop = await page.evaluate(() => ({
    focus: !!document.activeElement.closest("#pop"),
    sheet: $("#sheet").getAttribute("aria-hidden") === "true",
  }));
  ok(inPop.focus && inPop.sheet, "a dialog over it takes the focus and hides the sheet " + JSON.stringify(inPop));
  await page.keyboard.press("Escape");
  await settle();
  ok(
    await page.evaluate(() => !!document.activeElement.closest("#sheet") && !$("#sheet").hasAttribute("aria-hidden")),
    "closing the dialog gives the focus back to the sheet"
  );
  await page.keyboard.press("Escape");
  await settle();
  ok(
    await page.evaluate(
      () => document.activeElement.dataset.act === "add-out" && !$("#app").hasAttribute("aria-hidden")
    ),
    "closing the sheet gives it back to the button that opened it"
  );

  // ---- 2. calendar days read as dates; today and the chosen day marked
  await page.evaluate(() => txSheet(null, "expense"));
  await settle();
  await page.evaluate(() => datePicker($("#f-date")));
  await settle();
  const cal = await page.evaluate(() => {
    const now = document.querySelector('#pop [aria-current="date"]');
    return {
      label: now && now.getAttribute("aria-label"),
      pressed: now && now.getAttribute("aria-pressed"),
      all: [...document.querySelectorAll('#pop [data-act="dp-day"]')].every(b =>
        /\d{4}/.test(b.getAttribute("aria-label"))
      ),
    };
  });
  ok(
    cal.all && /\w+day, \w+ \d+, \d{4}/.test(cal.label) && cal.pressed === "true",
    "calendar days: " + JSON.stringify(cal)
  );
  await page.keyboard.press("Escape");
  await page.evaluate(() => closeSheet());
  await settle();

  // ---- 3. the ring: readable percentages, a real currency switch
  const ring = await page.evaluate(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
    const toHex = c =>
      "#" +
      c
        .match(/\d+/g)
        .slice(0, 3)
        .map(v => (+v).toString(16).padStart(2, "0"))
        .join("");
    return {
      ratios: [...document.querySelectorAll(".rt .cp")]
        .filter(e => e.textContent)
        .map(e => +contrast(toHex(getComputedStyle(e).color), bg).toFixed(2)),
      sw: (document.querySelector('button.vh[data-act="cur-next"]') || {}).textContent || "",
      inDonut: !!document.querySelector('.dwrap button, .dwrap [role="button"]'),
    };
  });
  ok(ring.ratios.length > 0 && ring.ratios.every(r => r >= 4.5), "percentages read at 4.5:1 or more " + ring.ratios);
  ok(/Showing USD\. Switch to EUR/.test(ring.sw) && !ring.inDonut, "currency switch: " + ring.sw);
  await page.click('button.vh[data-act="cur-next"]', { force: true });
  await settle();
  ok(/Showing EUR/.test(await page.textContent('button.vh[data-act="cur-next"]')), "and it switches");
  for (const th of ["dark"]) {
    await page.evaluate(th => {
      S.settings.theme = th;
      applyTheme();
      render();
    }, th);
    await settle();
    const r2 = await page.evaluate(() => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
      const toHex = c =>
        "#" +
        c
          .match(/\d+/g)
          .slice(0, 3)
          .map(v => (+v).toString(16).padStart(2, "0"))
          .join("");
      return [...document.querySelectorAll(".rt .cp")]
        .filter(e => e.textContent)
        .map(e => +contrast(toHex(getComputedStyle(e).color), bg).toFixed(2));
    });
    ok(r2.length > 0 && r2.every(r => r >= 4.5), th + ": percentages read at 4.5:1 or more " + r2);
  }

  // ---- 4. loan rows: the head is a button that says whether it is open; the bar is a progress bar
  await page.evaluate(() => loanOpen("L"));
  await settle();
  const head = '#sheet .tx.exp .txh[data-act="row-exp"]';
  ok((await page.getAttribute(head, "aria-expanded")) === "false", "a loan row's head: aria-expanded false");
  await page.click(head);
  ok((await page.getAttribute(head, "aria-expanded")) === "true", "true once opened");
  const bar = await page.evaluate(() => {
    const b = document.querySelector('#sheet [role="progressbar"]');
    return b && [b.getAttribute("aria-valuenow"), b.getAttribute("aria-label")];
  });
  ok(bar && bar[0] === "40" && bar[1] === "Paid back", "the bar is a progress bar at 40 " + JSON.stringify(bar));
  await page.evaluate(() => closeSheet());

  // ---- 5. the time wheel is a spin button with its value
  await page.evaluate(() => timePicker("Remind me at", "21:30", () => {}));
  await settle();
  const wheel = await page.evaluate(() =>
    [...document.querySelectorAll("#pop .wcol")].map(w => [w.getAttribute("role"), w.getAttribute("aria-valuetext")])
  );
  ok(wheel[0][0] === "spinbutton" && wheel[0][1] === "21" && wheel[1][1] === "30", "wheels: " + JSON.stringify(wheel));
  await page.focus("#tp-h");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(500);
  ok((await page.getAttribute("#tp-h", "aria-valuetext")) === "22", "↓ steps it and the value follows");
  await page.evaluate(() => closePop());

  // ---- 6. colour swatches: named, 48px to tap; switches 48px tall
  await page.evaluate(() => catForm("food"));
  await settle();
  const dots = await page.$$eval("#f-dots .dot[data-act='f-col']", ds =>
    ds.map(d => [d.getAttribute("aria-label"), d.getBoundingClientRect().width, d.getBoundingClientRect().height])
  );
  ok(
    dots.every(d => !/#/.test(d[0]) && d[1] >= 48 && d[2] >= 48),
    "swatches named and 48px: " + dots.slice(0, 3)
  );
  ok(
    dots.some(d => d[0] === "Green"),
    "the palette's own names"
  );
  await page.evaluate(() => closeSheet());
  await page.evaluate(() => {
    V.screen = "settings";
    render();
  });
  await settle();
  const sw = await page.$$eval(".sw", s => s.map(x => x.getBoundingClientRect().height));
  ok(sw.length > 0 && sw.every(h => h >= 48), "switches are 48px tall: " + sw);

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
