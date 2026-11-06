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
    // the click follows the touch a moment later (longer on a busy machine): wait for its effect, not a fixed time
    await tp
      .waitForFunction(() => document.querySelector(".pnav .plabel").textContent.includes("Today"), null, {
        timeout: 1500,
      })
      .catch(() => {});
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

  // ---- B9: the account chips fade at the edge they still scroll toward; the balance bar is stacked
  await page.evaluate(() => {
    closeSheet2();
    closeSheet();
    S = blank();
    S.settings.cur = "USD";
    S.settings.lastCheck = today();
    const add = (id, name, currency, opening) =>
      S.accounts.push({ id, name, type: "bank", currency, opening, archived: false });
    add("u1", "Everyday", "USD", 4167.5);
    add("u2", "Cash", "USD", 106.35);
    add("u3", "Card", "USD", 20);
    add("u4", "Rent savings", "USD", 20);
    S.txns.push({ id: "z1", ts: 1, date: today(), type: "expense", amount: 5, account: "u1", cat: "food", note: "" });
    save();
    V.screen = "home";
    V.cur = "";
    render();
  });
  const strip = () =>
    page.evaluate(() => {
      const s = document.querySelector(".strip"),
        cs = getComputedStyle(s);
      return {
        fade: s.classList.contains("fade"),
        mask: cs.webkitMaskImage || cs.maskImage,
        over: s.scrollWidth > s.clientWidth,
      };
    });
  let st = await strip();
  ok(
    st.over && st.fade && /linear-gradient/.test(st.mask),
    "the chip row fades where it still scrolls: " + JSON.stringify(st)
  );
  await page.evaluate(() => (document.querySelector(".strip").scrollLeft = 1e5));
  await page.waitForTimeout(100);
  st = await strip();
  ok(
    !st.fade && !/linear-gradient/.test(st.mask),
    "no fade once the row is scrolled to its end: " + JSON.stringify(st)
  );
  await page.evaluate(() => (document.documentElement.dir = "rtl"));
  await page.evaluate(() => (document.querySelector(".strip").scrollLeft = 0));
  await page.waitForTimeout(100);
  const rtl = await page.evaluate(() => {
    const s = document.querySelector(".strip");
    s.classList.add("fade");
    return (getComputedStyle(s).webkitMaskImage || getComputedStyle(s).maskImage).includes("to left");
  });
  ok(rtl, "in a right-to-left language the fade is on the left edge");
  await page.evaluate(() => (document.documentElement.dir = ""));
  const bar = () =>
    page.evaluate(() => {
      const b = document.querySelector(".balbar"),
        q = (s, r = b) => [...r.querySelectorAll(s)].map(e => e.textContent.trim()),
        rect = e => e.getBoundingClientRect();
      const bt = b.querySelector(".bt");
      return {
        left: q(".l")[0],
        cap: q(".bcap")[0],
        codes: q(".bcc"),
        figs: q("b"),
        say: b.getAttribute("aria-label"),
        hidden: [b.querySelector(".l"), bt].every(e => e.getAttribute("aria-hidden") === "true"),
        leftOfRight: rect(b.querySelector(".l")).right <= rect(bt).left + 1,
        rights: [...b.querySelectorAll("b")].map(e => Math.round(rect(e).right)),
        codeLefts: [...b.querySelectorAll(".bcc")].map(e => Math.round(rect(e).left)),
        inside: rect(bt).right <= rect(b).right && rect(bt).left >= rect(b).left,
        h: rect(b).height,
      };
    });
  const M = (v, c) => page.evaluate(([v, c]) => money(v, c), [v, c]);
  const usd = await M(4308.85, "USD");
  let bb = await bar();
  ok(
    bb.left === "1 entry" && bb.cap === "Total in USD" && bb.codes.length === 0 && bb.figs.join() === usd,
    "one currency: '1 entry ›' on the left, 'Total in USD' over the figure on the right " + JSON.stringify(bb)
  );
  ok(bb.say === "1 entry. Total in USD: " + usd && bb.hidden, "TalkBack reads the bar as one sentence: " + bb.say);
  await page.evaluate(() => {
    S.accounts.push({ id: "g1", name: "Pounds", type: "bank", currency: "GBP", opening: 380, archived: false });
    S.accounts.push({ id: "e1", name: "Euros", type: "bank", currency: "EUR", opening: 4758, archived: false });
    render();
  });
  bb = await bar();
  ok(
    bb.cap === "Total" &&
      bb.codes.join() === "USD,EUR,GBP" &&
      bb.figs.join() === [usd, await M(4758, "EUR"), await M(380, "GBP")].join(),
    "three currencies: one 'Total', a line each, the notebook's own first then the others by code " + JSON.stringify(bb)
  );
  ok(
    new Set(bb.rights).size === 1 && new Set(bb.codeLefts).size === 1 && bb.leftOfRight && bb.inside,
    "the codes line up in one column and the figures are right-aligned in the other " + JSON.stringify(bb)
  );
  ok(
    bb.say === "1 entry. Total: " + bb.figs.join(", ") && bb.hidden,
    "TalkBack reads every currency in one sentence: " + bb.say
  );
  // a currency the phone's locale has no symbol for prints its code in the figure: the code column stays empty then
  await page.evaluate(() => {
    S.accounts.push({ id: "h1", name: "Franc", type: "bank", currency: "CHF", opening: 1234, archived: false });
    render();
  });
  const chf = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".balbar .bcc")].map(e => e.textContent.trim());
    const fig = [...document.querySelectorAll(".balbar b")].map(e => e.textContent.trim());
    return { rows, fig };
  });
  const chfAt = chf.fig.findIndex(f => f.includes("CHF"));
  ok(
    chfAt >= 0 &&
      chf.rows[chfAt] === "" &&
      chf.rows.length === chf.fig.length &&
      chf.rows.filter(c => c === "USD").length === 1,
    "a currency printed with its code shows it once: " + JSON.stringify(chf)
  );
  await page.evaluate(() => {
    S.accounts = S.accounts.filter(a => a.id !== "h1");
    render();
  });
  /* the ring's ⇄ only changes the ring: the bar keeps every currency */
  const ringCur = () => page.evaluate(() => document.querySelector(".curbtn").textContent.trim());
  const r0 = await ringCur();
  await page.click('[data-act="cur-next"]');
  const r1 = await ringCur();
  const bb2 = await bar();
  ok(
    r0 !== r1 && bb2.figs.join() === bb.figs.join() && bb2.cap === "Total",
    "the ring's ⇄ " + r0 + " → " + r1 + " leaves the bar as it was"
  );
  await page.evaluate(() => {
    S.settings.cur = "EUR";
    V.cur = "";
    render();
  });
  ok(
    (await bar()).codes.join() === "EUR,GBP,USD",
    "the notebook's own currency comes first whichever it is: " + (await bar()).codes.join()
  );
  await page.evaluate(() => {
    S.settings.cur = "USD";
    S.txns = [];
    render();
  });
  ok(
    (await page.textContent(".balbar .l")).trim() === "0 entries",
    "with no entries the bar says so: " + (await page.textContent(".balbar .l"))
  );

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
