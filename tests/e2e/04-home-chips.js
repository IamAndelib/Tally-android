const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("04-home-chips");
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
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.goto(appUrl);
  const t = await page.evaluate(() => {
    const x = new Date();
    return (
      x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0")
    );
  });
  await page.evaluate(
    t =>
      localStorage.setItem(
        "tally:v1",
        JSON.stringify({
          v: 4,
          settings: { cur: "BDT", lastCheck: t },
          accounts: [
            { id: "c", name: "City Bank", type: "bank", currency: "BDT", opening: 51200 },
            { id: "k", name: "Bkash", type: "wallet", currency: "BDT", opening: 9500 },
            { id: "w", name: "Wallet", type: "cash", currency: "BDT", opening: 2400 },
          ],
          txns: [
            { id: "a", ts: 1, date: t, type: "expense", amount: 300, account: "w", cat: "transport", note: "" },
            { id: "b", ts: 2, date: t, type: "expense", amount: 500, account: "k", cat: "family", note: "" },
          ],
        })
      ),
    t
  );
  await page.reload();
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const chip = () => page.$('[data-act="go-today"]');
  const label = () => page.textContent(".pnav .plabel");

  // ---- Loan / Lend buttons
  const cols = async () =>
    page.evaluate(() => {
      const bg = s => getComputedStyle(document.querySelector(s)).backgroundColor;
      return {
        loan: bg(".fbtn.loan"),
        lend: bg(".fbtn.lend"),
        minus: bg(".fab.minus"),
        plus: bg(".fab.plus"),
        bal: bg(".balbar"),
        svg: [...document.querySelectorAll(".loanbtns .fbtn")].every(b => b.querySelector(".emb svg")),
        h: document.querySelector(".fbtn.loan").getBoundingClientRect().height,
      };
    });
  for (const th of ["light", "dark"]) {
    await page.evaluate(th => (document.documentElement.dataset.theme = th), th);
    const c = await cols();
    const all = [c.loan, c.lend, c.minus, c.plus, c.bal];
    ok(
      new Set(all).size === 5 && c.svg && c.h === 64,
      th + ": Loan/Lend have their own fills + emblems " + JSON.stringify(c)
    );
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await act("loan-new", "borrow");
  ok(await page.isVisible("#f-person"), "Loan button opens the loan form");
  await act("close");
  await act("loan-new", "lend");
  ok(await page.isVisible("#f-person"), "Lend button opens the lend form");
  await act("close");

  // ---- Today chip
  ok(!(await chip()), "no reset chip on Today");
  await act("prev");
  ok(!!(await chip()), "chip appears after ‹");
  const pos = await page.evaluate(() => {
    const c = document.querySelector('[data-act="go-today"]').getBoundingClientRect(),
      b = document.querySelector(".balbar").getBoundingClientRect();
    return { cr: c.right, br: b.right, cb: c.bottom, bt: b.top };
  });
  ok(
    Math.abs(pos.cr - pos.br) < 2 && pos.cb <= pos.bt,
    "chip sits above the banner, right-aligned " + JSON.stringify(pos)
  );
  await page.screenshot({ path: OUT + "/home-pastday.png" });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.waitForTimeout(100);
  await page.screenshot({ path: OUT + "/home-pastday-dark.png" });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await act("go-today");
  ok((await label()).includes("Today") && !(await chip()), "tapping it returns to Today and hides it");
  // swipe on the ring (touch, as on the phone)
  {
    const tc = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
    const tp = await tc.newPage();
    await tp.goto(appUrl);
    await tp.evaluate(
      s => localStorage.setItem("tally:v1", s),
      await page.evaluate(() => localStorage.getItem("tally:v1"))
    );
    await tp.reload();
    const cdp = await tc.newCDPSession(tp);
    const T = (type, x, y) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const r = await (await tp.$("#ring .dwrap")).boundingBox(),
      x = r.x + r.width / 2,
      y = r.y + r.height / 2;
    await T("touchStart", x - 80, y);
    await T("touchMove", x, y);
    await T("touchMove", x + 60, y);
    await T("touchEnd");
    await tp.waitForTimeout(500);
    ok(
      !!(await tp.$('[data-act="go-today"]')) && !(await tp.textContent(".pnav .plabel")).includes("Today"),
      "chip appears after swiping to another day: " + (await tp.textContent(".pnav .plabel"))
    );
    await tp.evaluate(() => {
      window.__ev = [];
      ["pointerdown", "touchstart", "touchend", "click"].forEach(t =>
        document.addEventListener(
          t,
          e =>
            window.__ev.push(
              t + ":" + (e.target.className || e.target.tagName) + (t === "click" ? ":" + e.defaultPrevented : "")
            ),
          true
        )
      );
    });
    await tp.tap('[data-act="go-today"]');
    await tp.waitForTimeout(50);
    console.log(
      "DBG",
      JSON.stringify(await tp.evaluate(() => window.__ev)),
      await tp.textContent(".pnav .plabel"),
      !!(await tp.$('[data-act="go-today"]')),
      await tp.evaluate(() => document.querySelectorAll('[data-act="go-today"]').length)
    );
    ok(
      (await tp.textContent(".pnav .plabel")).includes("Today") && !(await tp.$('[data-act="go-today"]')),
      "tapping the chip (touch) returns to Today"
    );
    await tc.close();
  }
  // month pick
  await page.click(".pnav .plabel");
  await act("pd-tab", "month");
  await page.click(`#pd [data-act="pd-month"][data-v="${t.slice(0, 7)}"]`);
  ok(!!(await chip()), "chip appears for a month view (" + (await label()) + ")");
  await act("go-today");
  ok((await label()).includes("Today"), "back to Today from month");
  // range pick
  await page.click(".pnav .plabel");
  await act("pd-tab", "range");
  const ds = await page.$$eval('#pd [data-act="pd-rday"]:not(.other):not([disabled])', x => x.map(e => e.dataset.v));
  await page.click(`#pd [data-v="${ds[0]}"]`);
  await page.click(`#pd [data-v="${ds[ds.length - 1]}"]`);
  ok(!!(await chip()), "chip appears for a range");
  await page.setViewportSize({ width: 360, height: 760 });
  await page.waitForTimeout(300);
  console.log(
    "DBG2",
    await page.evaluate(() => [
      document.documentElement.scrollWidth,
      innerWidth,
      [...document.querySelectorAll("body *")]
        .filter(e => e.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 6)
        .map(e => e.tagName + "." + e.className + " " + Math.round(e.getBoundingClientRect().right)),
    ])
  );
  ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "no horizontal overflow at 360px with the chip"
  );
  await page.setViewportSize({ width: 393, height: 852 });
  await act("go-today");

  // ---- emoji box centred
  await act("go", "settings");
  await page.click('.ring.edit .tile[data-v="groceries"]');
  await page.click('#sheet [data-act="f-icon"]');
  await page.click('#sheet2 [data-act="ic-emoji"]');
  const cen = await page.evaluate(() => {
    const p = document.querySelector("#sheet2 .p").getBoundingClientRect(),
      mid = p.left + p.width / 2;
    const i = document.getElementById("ic-emo").getBoundingClientRect(),
      sp = document.querySelector("#ic-emo-box .field>span");
    const rg = document.createRange();
    rg.selectNodeContents(sp);
    const tr = rg.getBoundingClientRect();
    return { mid, input: i.left + i.width / 2, text: tr.left + tr.width / 2 };
  });
  ok(
    Math.abs(cen.input - cen.mid) < 2 && Math.abs(cen.text - cen.mid) < 2,
    "emoji label + box centred " + JSON.stringify(cen)
  );
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.evaluate(() => document.querySelector("#ic-emo-box").scrollIntoView());
  await page.waitForTimeout(100);
  await page.screenshot({ path: OUT + "/emoji-box-dark.png" });
  await page.fill("#ic-emo", "🐶");
  await act("ic-emo-ok");
  ok((await page.textContent("#f-cprev")).includes("🐶"), "emoji still applies");

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
