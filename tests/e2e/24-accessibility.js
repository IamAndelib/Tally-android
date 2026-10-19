// Accessibility: focus moves into sheets and dialogs and back, the page behind them is hidden from screen readers,
// expandable rows, the time wheel, the ring's currency switch and the loan bar say what they are, calendar days are read
// as dates, percentages and swatches are readable, and every control is 48px to tap.
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
    ds.map(d => [d.getAttribute("aria-label"), d.offsetWidth, d.offsetHeight])
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

  // ---- 7. every control is 48px to tap, on the smallest phone width, on each screen and in each sheet and picker;
  // calendar days are 48px tall in the columns a 360px dialog has (43px), chart bars far taller than wide
  const small = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: "en-US" });
  await small.addInitScript(() => {
    window.Android = {
      setReminders() {},
      takeActions: () => "[]",
      getColors: () => null,
      setBars() {},
      requestNotifications() {},
    };
  });
  const sp = await small.newPage();
  sp.on("pageerror", e => errors.push(e.message));
  await sp.goto(appUrl);
  await sp.evaluate(() => {
    const t = today();
    localStorage.setItem(
      "tally:v1",
      JSON.stringify({
        v: 6,
        settings: { cur: "USD", clock: "24", lastCheck: t, dragTip: true },
        accounts: [
          { id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1000 },
          { id: "b", name: "Cash", type: "cash", currency: "USD", opening: 50 },
        ],
        txns: [
          { id: "e", ts: 1, date: t, type: "expense", amount: 5, account: "a", cat: "food", note: "" },
          {
            id: "d",
            ts: 2,
            date: t,
            type: "loan",
            amount: 9,
            account: "a",
            note: "",
            dir: "out",
            loan: "L",
            principal: true,
          },
        ],
        loans: [{ id: "L", kind: "lend", person: "Ann", account: "a", date: t, status: "open" }],
        assets: [],
      })
    );
  });
  await sp.reload();
  await sp.waitForTimeout(200);
  const tooSmall = () =>
    sp.evaluate(() => {
      const top = ["#pop", "#sheet2", "#sheet"].map(s => document.querySelector(s)).find(e => e && e.innerHTML.trim());
      const out = [];
      (top || document.querySelector("#app"))
        .querySelectorAll("button, a, [data-act], [role=button], [role=tab], [role=switch]")
        .forEach(e => {
          /* the layout size: a sheet or dialog still opening is drawn a little smaller (its animation's scale) */
          const b = { width: e.offsetWidth, height: e.offsetHeight };
          if (!b.width || !b.height || getComputedStyle(e).visibility === "hidden") return;
          if (e.tagName === "A" && b.height < 24) return; // a link inside a sentence
          if (e.classList.contains("dd") ? b.height >= 48 && b.width >= 42 : b.width >= 48 && b.height >= 48) return;
          if (e.classList.contains("smcol") && b.width >= 40 && b.height >= 96) return;
          out.push(
            (e.dataset.act || e.className || e.tagName) + " " + Math.round(b.width) + "x" + Math.round(b.height)
          );
        });
      return [...new Set(out)];
    });
  const views = [
    ["Home", () => {}],
    ["History", () => ((V.screen = "history"), render())],
    ["Assets", () => ((V.screen = "assets"), render())],
    ["Liabilities", () => ((V.screen = "liabs"), render())],
    ["Settings", () => ((V.screen = "settings"), render())],
    ["an expense", () => ((V.screen = "home"), render(), txSheet(null, "expense", "food"))],
    ["a transfer", () => trSheet()],
    ["a balance fix", () => adjSheet()],
    ["an account", () => accOpen("a")],
    ["a loan", () => loanOpen("L")],
    ["a new loan", () => loanForm("borrow")],
    ["a category", () => catForm("food")],
    ["the icons", () => iconPicker("food", "#2a78d6", () => {})],
    ["the currencies", () => curPicker("USD", () => {}, "Currency")],
    ["the time wheel", () => timePicker("Time", "21:00", () => {})],
    ["the summary", () => summarySheet()],
    ["a date picker", () => (txSheet(null, "expense", "food"), $("#sheet .datefld").click())],
    ["the period picker", () => ((V.screen = "home"), render(), $(".plabel").click())],
  ];
  for (const [name, open] of views) {
    await sp.evaluate(() => (closePop(), closeSheet2(), closeSheet()));
    await sp.waitForTimeout(150);
    await sp.evaluate(open);
    await sp.waitForTimeout(350);
    const bad = await tooSmall();
    ok(bad.length === 0, "48px to tap: " + name + (bad.length ? " " + bad.join(", ") : ""));
  }
  await small.close();
  /* a phone held sideways: a whole month fits, days as tall as that allows (44px or more on a 360px-high screen) */
  const side = await browser.newContext({ viewport: { width: 740, height: 360 }, locale: "en-US" });
  await side.addInitScript(() => {
    window.Android = {
      setReminders() {},
      takeActions: () => "[]",
      getColors: () => null,
      setBars() {},
      requestNotifications() {},
      screenLand: () => true,
    };
  });
  const lp = await side.newPage();
  lp.on("pageerror", e => errors.push(e.message));
  await lp.goto(appUrl);
  await lp.evaluate(() =>
    localStorage.setItem(
      "tally:v1",
      JSON.stringify({
        v: 6,
        settings: { cur: "USD", clock: "24", lastCheck: today(), dragTip: true },
        accounts: [{ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1 }],
        txns: [],
      })
    )
  );
  await lp.reload();
  await lp.waitForTimeout(200);
  for (const [name, open, id] of [
    ["the date picker", () => (txSheet(null, "expense", "food"), $("#sheet .datefld").click()), "dp"],
    ["the period picker", () => (closePop(), closeSheet(), $(".plabel").click()), "pd"],
  ]) {
    await lp.evaluate(open);
    await lp.waitForTimeout(350);
    const m = await lp.evaluate(id => {
      const d = $("#" + id);
      if (id === "dp")
        ((DP.month = "2026-08"), dpRender()); // six weeks
      else ((PD.month = "2026-08"), pdRender());
      const days = [...d.querySelectorAll(".dd")];
      return {
        weeks: d.querySelectorAll(".wk").length,
        tall: Math.min(...days.map(x => x.offsetHeight)),
        fits: d.scrollHeight <= d.clientHeight + 1,
      };
    }, id);
    ok(m.weeks === 6 && m.tall >= 44 && m.fits, "sideways, " + name + ": six weeks fit, days " + m.tall + "px tall");
  }
  await side.close();

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
