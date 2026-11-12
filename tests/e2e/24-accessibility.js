// Accessibility: focus moves into sheets and dialogs and back, the page behind them is hidden from screen readers,
// expandable rows, the time wheel, the ring's currency switch and the loan bar say what they are, calendar days are read
// as dates, percentages and swatches are readable, and every control is 48px to tap (the keypad's too); the charges'
// cards, chips and overpaid dialog are named for TalkBack, and the Charges grey stands out and never stands alone.
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
  /* the Charges label (docs/specs/charges.md, Home): hidden from TalkBack, which hears it in the donut's label; its
     words in the muted text colour (4.5:1), the grey only for its dot (3:1), in both themes */
  for (const th of ["light", "dark"]) {
    const chg = await page.evaluate(th => {
      document.documentElement.dataset.theme = th;
      if (!S.accounts.some(a => a.id === "b"))
        S.accounts.push({ id: "b", name: "Wallet", type: "wallet", currency: "USD", opening: 0 });
      if (!S.txns.some(x => x.id === "tr")) {
        S.txns.push({
          id: "tr",
          ts: 7,
          date: today(),
          type: "transfer",
          amount: 10,
          account: "a",
          to: "b",
          feeId: "tf",
        });
        S.txns.push({
          id: "tf",
          ts: 8,
          date: today(),
          type: "expense",
          amount: 2.5,
          account: "a",
          cat: "other",
          feeOf: "tr",
        });
      }
      V.cur = "USD";
      render();
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
      const hex = c =>
        "#" +
        c
          .match(/\d+/g)
          .slice(0, 3)
          .map(v => (+v).toString(16).padStart(2, "0"))
          .join("");
      const lab = document.querySelector("#ring .rchg");
      return {
        hidden: lab.getAttribute("aria-hidden"),
        focusable: lab.querySelectorAll("button, [tabindex], a, input").length + (lab.tabIndex >= 0 ? 1 : 0),
        aria: document.querySelector("#ring .dwrap").getAttribute("aria-label"),
        text: [...lab.querySelectorAll("span, b")].map(e => +contrast(hex(getComputedStyle(e).color), bg).toFixed(2)),
        dot: +contrast(hex(getComputedStyle(lab.querySelector("i")).backgroundColor), bg).toFixed(2),
      };
    }, th);
    ok(
      chg.hidden === "true" && chg.focusable === 0,
      th + ": the Charges label is hidden from TalkBack and takes no focus " + JSON.stringify(chg)
    );
    ok(
      chg.aria === "Spending summary: spent $52.50, of which charges $2.50",
      th + ": the donut's button says the charges: " + chg.aria
    );
    ok(
      chg.text.length === 2 && chg.text.every(r => r >= 4.5) && chg.dot >= 3,
      th + ": its words read at 4.5:1, its grey dot at 3:1 " + JSON.stringify([chg.text, chg.dot])
    );
  }
  await page.evaluate(() => {
    delete document.documentElement.dataset.theme;
    S.txns = S.txns.filter(x => x.id !== "tr" && x.id !== "tf");
    S.accounts = S.accounts.filter(a => a.id !== "b");
    V.cur = "EUR";
    render();
  });
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
  /* charges (docs/specs/charges.md): a loan from Bo, and a lending to Cy with a transfer charge and an extra (chips) */
  await sp.evaluate(() => {
    const t = today(),
      e = (id, amount, more) =>
        S.txns.push({ id, ts: 10 + S.txns.length, date: t, type: "loan", amount, account: "a", note: "", ...more });
    S.loans.push(
      { id: "B", kind: "borrow", person: "Bo", account: "a", date: t, status: "open" },
      { id: "C", kind: "lend", person: "Cy", account: "a", date: t, status: "open" }
    );
    e("bd", 20, { dir: "in", loan: "B", principal: true, onTop: 2 });
    e("cd", 30, { dir: "out", loan: "C", principal: true, onTop: 3, feeId: "cc" });
    e("cc", 1, { dir: "out", loan: "C", principal: true, feeOf: "cd" });
    save();
  });
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
          /* a compact chip's touch target is its ::after, reaching past the drawn chip (History's Filters sheet, the
             names offered under a field) */
          if (["hfc", "nchip-pick", "nchip-x"].some(c => e.classList.contains(c))) {
            const q = getComputedStyle(e, "::after");
            if (q.content !== "none" && q.position === "absolute" && q.display !== "none") {
              b.width = Math.max(b.width, parseFloat(q.width) || 0);
              b.height = Math.max(b.height, parseFloat(q.height) || 0);
            }
          }
          if (!b.width || !b.height || getComputedStyle(e).visibility === "hidden") return;
          if (e.tagName === "A" && b.height < 24) return; // a link inside a sentence
          if (e.dataset.act === "calc-pos") return; // the caret's mirror over a field: the field itself, not a button
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
    ["a transfer, its charge card", () => (trSheet(), $('#sheet [data-act="addon-add"]').click())],
    [
      "a transfer, the keypad on its charge",
      () => (trSheet(), $('#sheet [data-act="addon-add"]').click(), padOn("f-charge")),
    ],
    ["a balance fix", () => adjSheet()],
    ["an account", () => accOpen("a")],
    ["a loan", () => loanOpen("L")],
    ["a new loan", () => loanForm("borrow")],
    [
      "a new lending, its card of two rows",
      () => (
        loanForm("lend"),
        $('#sheet [data-act="addon-add"][data-v="xcharge"]').click(),
        $('#sheet [data-act="addon-add"][data-v="extra"]').click()
      ),
    ],
    [
      "a new loan, its charges card",
      () => (loanForm("borrow"), $('#sheet [data-act="addon-add"][data-v="charges"]').click()),
    ],
    [
      "an expense, its charge card",
      () => (txSheet(null, "expense", "food"), $('#sheet [data-act="addon-add"]').click()),
    ],
    [
      "an expense, the keypad on its charge",
      () => (txSheet(null, "expense", "food"), $('#sheet [data-act="addon-add"]').click(), padOn("f-charge")),
    ],
    ["a lending's payment, its extra card", () => (loanOpen("L"), $('#sheet [data-act="addon-add"]').click())],
    ["a loan's payment, its transfer charge card", () => (loanOpen("B"), $('#sheet [data-act="addon-add"]').click())],
    ["a loan with chips", () => loanOpen("C")],
    [
      "a lend's Edit, its card of two rows, the keypad on its extra",
      () => (loanOpen("C"), loanDrawEdit("cd"), padOn("ed-extra")),
    ],
    ["a borrow's Edit, its charges", () => (loanOpen("B"), loanDrawEdit("bd"))],
    ["paid more than owed", () => (loanOpen("L"), ($("#f-amt").value = "50"), payLoan())],
    [
      "History, a lend row with its chips",
      () => (openHistory({ who: "Cy" }), rowToggle($('#app .tx[data-v="cd"]'), "cd")),
    ],
    ["a category", () => catForm("food")],
    ["the icons", () => iconPicker("food", "#2a78d6", () => {})],
    ["the currencies", () => curPicker("USD", () => {}, "Currency")],
    ["the time wheel", () => timePicker("Time", "21:00", () => {})],
    ["the summary", () => summarySheet()],
    ["History, Filters", () => (openHistory(), filtersSheet())],
    ["History, Filters, Transfers", () => (openHistory({ kind: "xfer" }), filtersSheet())],
    [
      "History, From menu",
      () => (openHistory({ kind: "xfer" }), filtersSheet(), $('#sheet [data-act="hfs-from"]').click()),
    ],
    ["History, an opened row", () => (openHistory(), rowToggle($('#app .tx[data-v="e"]'), "e"))],
    ["a date picker", () => (txSheet(null, "expense", "food"), $("#sheet .datefld").click())],
    ["the period picker", () => ((V.screen = "home"), render(), $(".plabel").click())],
    ["Delete all data", () => ((V.screen = "settings"), render(), wipeAll())],
    [
      "Delete all data, final step",
      () => ((V.screen = "settings"), render(), wipeAll(), $("#pop .cd-destroy").click()),
    ],
    ["History, selecting", () => (openHistory(), (V.sel = new Set(["e"])), render())],
    /* archived entries (docs/specs/history-archive.md, B): History's icon, the Archived screen, an opened row there, the
       delete question there (Delete and Cancel), and the screen once empty */
    ["History, its archive icon", () => (archiveEntries(["e"], true), commit(), openHistory())],
    ["Archived", () => archOpen()],
    ["Archived, an opened row", () => (archOpen(), rowToggle($('#app .tx[data-v="e"]'), "e"))],
    [
      "Archived, the delete question",
      () => (archOpen(), rowToggle($('#app .tx[data-v="e"]'), "e"), $('#app .txo [data-act="tx-del"]').click()),
    ],
    ["Archived, empty", () => (archiveEntries(["e"], false), commit(), archOpen())],
    /* archived entries in search (spec C): an archived match opened, Unarchive and Delete (search stays on: last) */
    [
      "Search, an archived match opened",
      () => (
        archiveEntries(["e"], true),
        (S.settings.searchArch = true),
        commit(),
        openFind(),
        ($("#find-q").value = HF.q = "5"),
        findDraw(),
        rowToggle($('#app .tx[data-v="e"]'), "e")
      ),
    ],
  ];
  /* the keypad opened on a field once the form has focused its first field (60ms after it opens: focusAmt), which
     would close it */
  await sp.evaluate(() => {
    window.padOn = id => new Promise(r => setTimeout(() => (calcToggle(id, calcToggleBtn(id)), r()), 120));
  });
  for (const [name, open] of views) {
    await sp.evaluate(() => (closePop(), closeSheet2(), closeSheet()));
    await sp.waitForTimeout(150);
    await sp.evaluate(open);
    if (/keypad on/.test(name))
      ok(await sp.evaluate(() => !!CALC && !$("#calc-" + CALC.id).hidden), name + ": the keypad is open");
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

  // ---- 7b. the transfer charge's card for TalkBack: a group named after its field, the field named by its label, its
  // own calculator and remove buttons; the button that opens it says what it adds
  await page.evaluate(() => (closePop(), closeSheet2(), closeSheet()));
  await settle();
  await page.evaluate(() => trSheet());
  await settle();
  await page.click('#sheet [data-act="addon-add"][data-v="xcharge"]');
  await settle();
  const ao = await page.evaluate(() => {
    const card = $("#sheet .aocard"),
      inp = $("#f-charge"),
      by = inp.getAttribute("aria-labelledby");
    return {
      role: card.getAttribute("role"),
      group: card.getAttribute("aria-label"),
      field: by ? ($("#" + by) || {}).textContent : inp.getAttribute("aria-label"),
      calc: card.querySelector('[data-act="calc-toggle"]').getAttribute("aria-label"),
      expanded: card.querySelector('[data-act="calc-toggle"]').getAttribute("aria-expanded"),
      remove: card.querySelector('[data-act="addon-remove"]').getAttribute("aria-label"),
      amtCalc: $('#sheet [data-act="calc-toggle"][data-v="f-amt"]').getAttribute("aria-label"),
    };
  });
  ok(
    ao.role === "group" && ao.group === "Transfer charge" && ao.field === "Transfer charge",
    "the card is a group named Transfer charge, its field too " + JSON.stringify(ao)
  );
  ok(
    ao.calc === "Calculator for the transfer charge" &&
      ao.expanded === "false" &&
      ao.remove === "Remove the transfer charge",
    "its own calculator and remove buttons " + JSON.stringify(ao)
  );
  ok(ao.amtCalc === "Calculator", "the amount's calculator keeps its name");
  await page.evaluate(() => closeSheet());
  await settle();

  // ---- 7c. the lend form's card of two rows: a group named "Transfer charge and extra", each row's field, calculator
  // and ✕ named after it, the two buttons saying what they add; one row left: the card takes its name; Borrow's Charges
  await page.evaluate(() => loanForm("lend"));
  await settle();
  const adds = await page.evaluate(() =>
    [...document.querySelectorAll("#sheet .aoadd")].map(b => [b.dataset.v, b.textContent.trim()])
  );
  ok(
    JSON.stringify(adds) ===
      JSON.stringify([
        ["xcharge", "Transfer charge"],
        ["extra", "Add an extra"],
      ]),
    "lend: + Transfer charge and + Add an extra " + JSON.stringify(adds)
  );
  await page.click('#sheet [data-act="addon-add"][data-v="xcharge"]');
  await page.click('#sheet [data-act="addon-add"][data-v="extra"]');
  await settle();
  const rowNames = (layer = "#sheet") =>
    page.evaluate(layer => {
      const card = $(layer + " .aocard:not([hidden])") || $(layer + " .aocard");
      return {
        role: card.getAttribute("role"),
        group: card.getAttribute("aria-label"),
        rows: [...card.querySelectorAll(".aorow:not([hidden])")].map(r => {
          const inp = r.querySelector("input");
          return [
            ($("#" + inp.getAttribute("aria-labelledby")) || {}).textContent,
            r.querySelector('[data-act="calc-toggle"]').getAttribute("aria-label"),
            r.querySelector('[data-act="addon-remove"]').getAttribute("aria-label"),
          ];
        }),
        focus: document.activeElement && document.activeElement.id,
      };
    }, layer);
  let rn = await rowNames();
  ok(
    rn.role === "group" &&
      rn.group === "Transfer charge and extra" &&
      JSON.stringify(rn.rows) ===
        JSON.stringify([
          ["Transfer charge", "Calculator for the transfer charge", "Remove the transfer charge"],
          ["Extra", "Calculator for the extra", "Remove the extra"],
        ]) &&
      rn.focus === "f-extra",
    "the card of two rows is the group “Transfer charge and extra”, each row named, the focus in the new field " +
      JSON.stringify(rn)
  );
  await page.click('#sheet [data-act="addon-remove"][data-v="extra"]');
  await settle();
  rn = await rowNames();
  ok(
    rn.group === "Transfer charge" &&
      rn.rows.length === 1 &&
      (await page.evaluate(() => document.activeElement.dataset.v)) === "extra",
    "✕ on the extra: the card is “Transfer charge”, the focus back on + Add an extra " + JSON.stringify(rn)
  );
  await page.evaluate(() => (closeSheet(), loanForm("borrow")));
  await settle();
  await page.click('#sheet [data-act="addon-add"][data-v="charges"]');
  await settle();
  rn = await rowNames();
  ok(
    rn.group === "Charges" &&
      JSON.stringify(rn.rows) === JSON.stringify([["Charges", "Calculator for the charges", "Remove the charges"]]),
    "borrow: the Charges card, its field, calculator and ✕ named " + JSON.stringify(rn)
  );
  await page.evaluate(() => closeSheet());
  await settle();

  // ---- 7d. the other cards for TalkBack (docs/specs/charges.md, "Which form offers what"): Spent's charge, a lending's
  // payment's extra, a loan's payment's transfer charge, a lend's and a borrow's Edit; each a group named after its
  // rows, each row's field, calculator and ✕ named, its button saying what it adds, the focus in the new field
  const NAMES = {
    charge: ["Charge", "Calculator for the charge", "Remove the charge"],
    xcharge: ["Transfer charge", "Calculator for the transfer charge", "Remove the transfer charge"],
    extra: ["Extra", "Calculator for the extra", "Remove the extra"],
    charges: ["Charges", "Calculator for the charges", "Remove the charges"],
  };
  await page.evaluate(() => {
    const t = today();
    S.loans.push(
      { id: "M", kind: "borrow", person: "Mia", account: "a", date: t, status: "open" },
      { id: "N", kind: "lend", person: "Noor", account: "a", date: t, status: "open" }
    );
    const e = (id, amount, more) =>
      S.txns.push({ id, ts: 20 + S.txns.length, date: t, type: "loan", amount, account: "a", note: "", ...more });
    e("md", 200, { dir: "in", loan: "M", principal: true, onTop: 20 });
    e("nd", 100, { dir: "out", loan: "N", principal: true, onTop: 15, feeId: "nc" });
    e("nc", 5, { dir: "out", loan: "N", principal: true, feeOf: "nd" });
    save();
    render();
  });
  for (const [name, open, layer, kinds, group, focus] of [
    ["Spent", () => txSheet(null, "expense", "food"), "#sheet", ["charge"], "Charge", "f-charge"],
    ["a lending's payment", () => loanOpen("L"), "#sheet", ["extra"], "Extra", "f-extra"],
    ["a loan's payment", () => loanOpen("M"), "#sheet", ["xcharge"], "Transfer charge", "f-charge"],
    [
      "a lend's Edit",
      () => (loanOpen("L"), loanDrawEdit("d1")),
      "#sheet2",
      ["xcharge", "extra"],
      "Transfer charge and extra",
      "ed-extra",
    ],
    ["a borrow's Edit", () => (loanOpen("M"), loanDrawEdit("md")), "#sheet2", ["charges"], "Charges", "ed-charge"],
  ]) {
    await page.evaluate(() => (closePop(), closeSheet2(), closeSheet()));
    await settle();
    await page.evaluate(open);
    await settle();
    /* a borrow's draw with charges on top opens with its row; the others are opened by their buttons */
    const adds = await page.evaluate(
      layer =>
        [...document.querySelectorAll(layer + " .aoadd:not([hidden])")].map(b => [b.dataset.v, b.textContent.trim()]),
      layer
    );
    for (const k of kinds)
      if (adds.some(([v]) => v === k)) await page.click(layer + ' [data-act="addon-add"][data-v="' + k + '"]');
    await settle();
    const rn = await rowNames(layer);
    const want = { charge: "Add a charge", xcharge: "Transfer charge", extra: "Add an extra", charges: "Add charges" };
    ok(
      rn.role === "group" &&
        rn.group === group &&
        JSON.stringify(rn.rows) === JSON.stringify(kinds.map(k => NAMES[k])) &&
        adds.every(([v, txt]) => txt === want[v]) &&
        (name === "a borrow's Edit" || rn.focus === focus),
      name +
        ": the card is the group “" +
        group +
        "”, each row named, its button says what it adds " +
        JSON.stringify([rn, adds])
    );
  }
  await page.evaluate(() => (closePop(), closeSheet2(), closeSheet()));
  await settle();

  // ---- 7e. paid more than owed: a dialog named and described, its three answers in words, the sheet behind hidden;
  // Escape saves nothing and gives the focus back to the button that paid
  await page.evaluate(() => loanOpen("L"));
  await settle();
  await page.fill("#f-amt", "100");
  const before = await page.evaluate(() => S.txns.length);
  await page.click('#sheet [data-act="loan-pay"]');
  await settle();
  const ovp = await page.evaluate(() => {
    const d = document.querySelector("#pop .dialog"),
      name = d && document.getElementById(d.getAttribute("aria-labelledby")),
      desc = d && document.getElementById(d.getAttribute("aria-describedby"));
    return (
      d && {
        role: d.getAttribute("role"),
        name: name && name.textContent,
        desc: desc && desc.textContent,
        answers: [...d.querySelectorAll("button")].map(b => b.textContent.trim()).filter(Boolean),
        focus: d.contains(document.activeElement),
        behind: $("#sheet").getAttribute("aria-hidden") === "true" && $("#sheet").inert,
      }
    );
  });
  ok(
    ovp &&
      ovp.role === "alertdialog" &&
      ovp.name === "Sam paid $40.00 more" &&
      /Sam owed you \$60\.00/.test(ovp.desc) &&
      ovp.answers.length === 3 &&
      ovp.focus &&
      ovp.behind,
    "paid more than owed: an alertdialog named and described, three answers in words, focused, the sheet hidden " +
      JSON.stringify(ovp)
  );
  await page.keyboard.press("Escape");
  await settle();
  ok(
    await page.evaluate(
      n => !$("#pop").innerHTML && document.activeElement.dataset.act === "loan-pay" && S.txns.length === n,
      before
    ),
    "Escape saves nothing and gives the focus back to the pay button"
  );
  await page.evaluate(() => closeSheet());
  await settle();

  // ---- 7f. chips (a draw's parts in History's opened row and under the loan sheet's figure): each its words over its
  // figure, read as text, nothing hidden from TalkBack
  for (const [where, open, sel] of [
    ["History", () => (openHistory({ who: "Noor" }), rowToggle($('#app .tx[data-v="nd"]'), "nd")), "#app .txo"],
    ["the loan sheet", () => loanOpen("N"), "#sheet .hero"],
  ]) {
    await page.evaluate(open);
    await settle();
    const chips = await page.evaluate(
      sel =>
        [...document.querySelectorAll(sel + " .lpart")].map(c => [
          (c.querySelector(".lpc") || {}).textContent,
          (c.querySelector(".lpv") || {}).textContent,
          !!c.closest("[aria-hidden=true]"),
        ]),
      sel
    );
    ok(
      chips.length === 3 && chips.every(([w, v, h]) => w && /\$\d/.test(v) && !h),
      where + ": the chips say their words and figures " + JSON.stringify(chips)
    );
    await page.evaluate(() => (closeSheet(), (V.screen = "home"), render()));
    await settle();
  }

  // ---- 7g. the Charges grey (CHARGES_C) carries meaning as a part of a drawing: Home's ring slice, the Summary pie's
  // slice and the dot on its Charges line each stand out 3:1 against what lies behind them, in light and dark; and
  // never by colour alone: the slice has its label, the line its word
  for (const th of ["light", "dark"]) {
    const g = await page.evaluate(th => {
      S.settings.theme = th;
      applyTheme();
      if (!S.accounts.some(a => a.id === "b"))
        S.accounts.push({ id: "b", name: "Wallet", type: "wallet", currency: "USD", opening: 0 });
      if (!S.txns.some(x => x.id === "tr"))
        S.txns.push(
          { id: "tr", ts: 7, date: today(), type: "transfer", amount: 10, account: "a", to: "b", feeId: "tf" },
          { id: "tf", ts: 8, date: today(), type: "expense", amount: 2.5, account: "a", cat: "other", feeOf: "tr" }
        );
      V.cur = "USD";
      V.screen = "home";
      render();
      const hex = c =>
        "#" +
        c
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(v => (+v).toString(16).padStart(2, "0"))
          .join("");
      /* the colour behind e: the first ancestor with a background */
      const behind = e => {
        for (let p = e.parentElement; p; p = p.parentElement) {
          const b = getComputedStyle(p).backgroundColor;
          if (!/rgba\(.*, 0\)$|transparent/.test(b)) return hex(b);
        }
        return hex(getComputedStyle(document.body).backgroundColor);
      };
      const slice = document.querySelector('#ring circle[stroke="' + CHARGES_C + '"]'),
        out = {
          ring: slice ? +contrast(CHARGES_C, behind(slice.closest("svg"))).toFixed(2) : 0,
          label: (document.querySelector("#ring .rchg") || {}).textContent || "",
        };
      summarySheet();
      $('#sheet [data-act="sm-mode"][data-v="m"]').click();
      const pie = [...document.querySelectorAll("#sm .smpie path")].find(p => p.getAttribute("fill") === CHARGES_C),
        dot = document.querySelector("#sm .smtop .chdot");
      out.pie = pie ? +contrast(CHARGES_C, behind(pie.closest("svg"))).toFixed(2) : 0;
      out.dot = dot ? +contrast(hex(getComputedStyle(dot).backgroundColor), behind(dot)).toFixed(2) : 0;
      out.line = dot ? dot.closest(".tx").getAttribute("aria-label") + " | " + dot.closest(".tx").textContent : "";
      out.pieHidden = document.querySelector("#sm .smpie svg").getAttribute("aria-hidden") === "true";
      closeSheet();
      return out;
    }, th);
    ok(
      g.ring >= 3 && g.pie >= 3 && g.dot >= 3,
      th + ": the Charges grey stands out 3:1 as the ring's slice, the pie's and the line's dot " + JSON.stringify(g)
    );
    ok(
      /^Charges\$2\.50$/.test(g.label) && /^Charges, \$2\.50/.test(g.line) && /Charges/.test(g.line.split(" | ")[1]),
      th + ": the grey is never alone: the slice has its label, the line its word " + JSON.stringify(g)
    );
    ok(g.pieHidden, th + ": the pie is a drawing, its names in the list under it");
  }
  await page.evaluate(() => {
    S.settings.theme = "light";
    applyTheme();
    S.txns = S.txns.filter(x => x.id !== "tr" && x.id !== "tf");
    S.accounts = S.accounts.filter(a => a.id !== "b");
    render();
  });

  // ---- 8. the stacked-button dialogs: named and described for TalkBack, focus inside, back where it was
  await page.evaluate(() => (closePop(), closeSheet2(), closeSheet()));
  await page.evaluate(() => ((V.screen = "settings"), render()));
  await settle();
  await page.focus('[data-act="wipe"]');
  await page.evaluate(() => wipeAll());
  await settle();
  const cdA = await page.evaluate(() => {
    const d = document.querySelector("#pop .dialog"),
      name = document.getElementById(d.getAttribute("aria-labelledby")),
      desc = document.getElementById(d.getAttribute("aria-describedby"));
    return {
      role: d.getAttribute("role"),
      name: name && name.textContent,
      desc: desc && desc.textContent,
      focus: d.contains(document.activeElement) || d === document.activeElement,
      behind: $("#app").inert && $("#app").getAttribute("aria-hidden") === "true",
      labelled: [...d.querySelectorAll("button")].every(b => b.textContent.trim()),
    };
  });
  ok(
    cdA.role === "alertdialog" && cdA.name && cdA.desc && cdA.focus && cdA.behind && cdA.labelled,
    "a stacked-button dialog is an alertdialog with a name and a description, focused, the page behind hidden " +
      JSON.stringify(cdA)
  );
  await page.click("#pop .cd-destroy");
  await settle();
  ok(
    await page.evaluate(() => {
      const d = document.querySelector("#pop .dialog");
      return !!d && (d.contains(document.activeElement) || d === document.activeElement);
    }),
    "its second step takes the focus too"
  );
  await page.keyboard.press("Escape");
  await settle();
  ok(
    await page.evaluate(() => !$("#pop").innerHTML && document.activeElement.dataset.act === "wipe"),
    "Escape closes both steps and the focus is back on Delete all data"
  );

  // ---- design round, task 9: the emblem is its own 48dp button; the net worth card; History's Select icon
  {
    await page.evaluate(() => {
      render();
      catForm("food", "out");
    });
    await settle();
    const e = await page.evaluate(() => {
      const b = $('#sheet .cprevbtn[data-act="f-icon"]'),
        r = b.getBoundingClientRect(),
        pen = b.querySelector(":scope > .ic");
      const veil = getComputedStyle(b, "::after").backgroundColor;
      return {
        name: b.getAttribute("aria-label"),
        w: r.width,
        h: r.height,
        pen: !!pen && getComputedStyle(pen).color,
        veil,
        textBtn: !!$('#sheet .btn.text[data-act="f-icon"]'),
        count: document.querySelectorAll('#sheet [data-act="f-icon"]').length,
      };
    });
    ok(e.name === "Change emblem", "the emblem button is called Change emblem for TalkBack");
    ok(e.w >= 48 && e.h >= 48, "the emblem button is at least 48px: " + e.w + "x" + e.h);
    ok(
      e.pen === "rgb(255, 255, 255)" && /rgba\(0, 0, 0, 0\.5\)/.test(e.veil),
      "a white pen over a 50% dark veil: " + e.pen + " " + e.veil
    );
    ok(!e.textBtn && e.count === 1, "the 'Change emblem' text button is gone");
    await page.click('#sheet .cprevbtn[data-act="f-icon"]');
    await settle();
    ok(await page.evaluate(() => !!$("#ic-q") || !!$("#sheet2 .icgrid, #sheet .icgrid")), "it opens the emblem picker");
    await page.evaluate(() => {
      closeSheet();
      closeSheet();
    });
    await settle();

    // net worth: no explaining line, the same soft container as You owe, both themes; still named
    for (const scheme of ["light", "dark"]) {
      await page.evaluate(th => {
        S.settings.theme = th;
        applyTheme();
        V.screen = "assets";
        render();
      }, scheme);
      await settle();
      const n = await page.evaluate(() => {
        const c = $(".sumcard.soft"),
          cs = getComputedStyle(c),
          sc = getComputedStyle(document.documentElement).getPropertyValue("--secondary-container").trim();
        const probe = document.createElement("i");
        probe.style.background = sc;
        document.body.append(probe);
        const want = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { text: c.textContent, bg: cs.backgroundColor, want, small: !!c.querySelector(".small"), fg: cs.color };
      });
      ok(
        /^Net worth/.test(n.text) && !n.small && !/minus what you owe/.test(n.text),
        scheme + ": net worth has its title and no explaining line: " + n.text
      );
      ok(n.bg === n.want, scheme + ": net worth uses the soft container " + n.bg);
      const rgb = x =>
        x
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number);
      const lum = c => {
        const f = v => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      const a = lum(rgb(n.bg)),
        b = lum(rgb(n.fg));
      ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, scheme + ": net worth text passes AA");
    }
    await page.evaluate(() => {
      S.settings.theme = "light";
      applyTheme();
    });

    // History's Select icon is the outlined checklist (not the old checked box), 48px, still named Select
    await page.evaluate(() => {
      V.screen = "history";
      render();
    });
    await settle();
    const sel = await page.evaluate(() => {
      const b = $('[data-act="sel-start"]');
      return (
        b && {
          name: b.getAttribute("aria-label"),
          same: b.querySelector("path").getAttribute("d") === P.checklist,
          old: "checkbox" in P,
          w: b.getBoundingClientRect().width,
        }
      );
    });
    ok(
      sel && sel.name === "Select entries" && sel.same && sel.w >= 48 && !sel.old,
      "History's Select icon is the checklist: " + (sel && sel.name)
    );
    ok(
      !(await page.evaluate(() => Object.keys(window.TALLY_ICONS).some(k => /checklist|deselect/i.test(k)))),
      "the checklist is not offered as a category emblem"
    );

    // archived entries (docs/specs/history-archive.md, B): History's archive icon and Archive selected are named and
    // 48px; the Archived screen's headings are headings, its opened row says so, and Back gives the focus to the icon
    const named = sel =>
      page.evaluate(sel => {
        const b = $(sel),
          r = b && b.getBoundingClientRect();
        return (
          b && {
            name: b.getAttribute("aria-label"),
            tap: r.width >= 48 && r.height >= 48,
            mute: [...b.querySelectorAll("svg")].every(s => s.getAttribute("aria-hidden") === "true"),
          }
        );
      }, sel);
    const id = await page.evaluate(() => {
      const t = histRows(S.txns)[0];
      archiveEntries([t.id], true);
      commit();
      V.screen = "history";
      render();
      return t.id;
    });
    await settle();
    const icon = await named('#app [data-act="arch-open"]');
    ok(
      icon && icon.name === "Archived entries" && icon.tap && icon.mute,
      "History's archive icon is called “Archived entries”, 48px: " + JSON.stringify(icon)
    );
    await page.evaluate(() => {
      V.sel = new Set([histRows(S.txns)[0].id]);
      render();
    });
    const sa = await named('#app [data-act="sel-arch"]');
    ok(
      sa && sa.name === "Archive selected" && sa.tap && sa.mute,
      "Archive selected is named, 48px: " + JSON.stringify(sa)
    );
    await page.evaluate(() => {
      V.sel = null;
      render();
    });
    await page.click('#app [data-act="arch-open"]');
    await settle();
    await page.click('#app .tx[data-v="' + id + '"]');
    await settle();
    const ar = await page.evaluate(id => {
      const row = $('#app .tx[data-v="' + id + '"]');
      return {
        back: $("#app .appbar button").getAttribute("aria-label"),
        title: $("#app .appbar h1").textContent,
        month: [...document.querySelectorAll("#app .hmon")].map(
          h => h.getAttribute("role") + h.getAttribute("aria-level")
        ),
        day: [...document.querySelectorAll("#app .dayh")].map(
          h => h.getAttribute("role") + h.getAttribute("aria-level")
        ),
        open: row.getAttribute("aria-expanded"),
        acts: [...document.querySelectorAll("#app .txo .acts button")].map(b => b.textContent),
      };
    }, id);
    ok(
      ar.back === "Back" &&
        ar.title === "Archived" &&
        ar.month.length === 1 &&
        ar.month.every(m => m === "heading2") &&
        ar.day.length === 1 &&
        ar.day.every(d => d === "heading3") &&
        ar.open === "true" &&
        JSON.stringify(ar.acts) === JSON.stringify(["Unarchive", "Delete"]),
      "the Archived screen: Back, its title, month and day headings, the opened row and its actions " +
        JSON.stringify(ar)
    );
    await page.click('#app [data-act="arch-back"]');
    await settle();
    ok(
      (await page.evaluate(() => [V.screen, document.activeElement.dataset.act].join())) === "history,arch-open",
      "Back gives the focus to the archive icon"
    );
    // archived entries in search (spec C): Settings' switch is a named switch, 48px; an archived match says
    // "Archived" in words (its box is hidden from TalkBack), in its line's own colour: not colour alone
    await page.evaluate(() => {
      V.screen = "settings";
      render();
    });
    await settle();
    const sw = await page.evaluate(() => {
      const b = $('#app [data-act="search-arch"]'),
        r = b && b.getBoundingClientRect();
      return (
        b && {
          role: b.getAttribute("role"),
          name: b.getAttribute("aria-label"),
          on: b.getAttribute("aria-checked"),
          w: r.width,
          h: r.height,
        }
      );
    });
    ok(
      sw &&
        sw.role === "switch" &&
        sw.name === "Archived entries in search" &&
        sw.on === "false" &&
        sw.w >= 48 &&
        sw.h >= 48,
      "Settings → History: the switch is named “Archived entries in search”, a switch, 48px " + JSON.stringify(sw)
    );
    await page.click('#app [data-act="search-arch"]');
    await settle();
    ok(
      (await page.evaluate(() => $('#app [data-act="search-arch"]').getAttribute("aria-checked"))) === "true" &&
        (await page.evaluate(() => document.activeElement.dataset.act)) === "search-arch",
      "tapped, it says it is on and keeps the focus"
    );
    const mk = await page.evaluate(id => {
      const t = entry(id),
        words = (t.payee || catName(cat(t.cat)) || "").split(/\s+/)[0];
      openFind();
      $("#find-q").value = HF.q = words;
      findDraw();
      const r = $('#app .tx[data-v="' + id + '"]'),
        m = r && r.querySelector(".s .tarch"),
        s = r && r.querySelector(".s");
      const out = r && {
        name: r.textContent,
        word: m && m.textContent,
        mute: !!m && [...m.querySelectorAll("svg")].every(x => x.getAttribute("aria-hidden") === "true"),
        colour: !!m && getComputedStyle(m).color === getComputedStyle(s).color,
        others: [...document.querySelectorAll("#app .tx[data-v] .tarch")].map(e => e.closest(".tx").dataset.v),
      };
      /* selecting in that search: the archived match can't be selected, and says so (Ruling O) */
      V.sel = new Set();
      render();
      const q = $('#app .tx[data-v="' + id + '"]');
      if (out)
        out.sel = q && {
          disabled: q.getAttribute("aria-disabled"),
          pressed: q.getAttribute("aria-pressed"),
          act: q.dataset.act || "",
          same: q.textContent === out.name,
        };
      V.sel = null;
      findEnd();
      V.screen = "settings";
      render();
      return out;
    }, id);
    ok(
      mk &&
        /Archived/.test(mk.name) &&
        mk.word === "Archived" &&
        mk.mute &&
        mk.colour &&
        JSON.stringify(mk.others) === JSON.stringify([id]),
      "an archived match says “Archived” in words, its box hidden, in its line's colour " + JSON.stringify(mk)
    );
    ok(
      mk && mk.sel && mk.sel.disabled === "true" && mk.sel.pressed === null && !mk.sel.act && mk.sel.same,
      "while selecting, an archived match is read as unavailable (aria-disabled), its name unchanged " +
        JSON.stringify(mk && mk.sel)
    );
    await page.click('#app [data-act="search-arch"]');
    await settle();
    await page.evaluate(id => {
      archiveEntries([id], false);
      commit();
    }, id);
    await page.evaluate(() => {
      V.screen = "home";
      render();
    });
  }

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
