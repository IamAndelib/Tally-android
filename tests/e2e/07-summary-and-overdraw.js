const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("07-summary-and-overdraw");
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
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  let dialogs = 0;
  page.on("dialog", d => {
    dialogs++;
    d.accept();
  });
  await page.goto(appUrl);
  const d = await page.evaluate(() => {
    const f = n => {
      const y = new Date();
      y.setDate(y.getDate() + n);
      return (
        y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0")
      );
    };
    return { t: f(0), d1: f(-1), d2: f(-2), d3: f(-3) };
  });
  const X = (id, date, ts, type, amount, account, extra) =>
    Object.assign({ id, ts, date, type, amount, account, note: "" }, extra || {});
  const seed = {
    v: 5,
    settings: { cur: "BDT", lastCheck: d.t, dragTip: true },
    accounts: [
      { id: "w", name: "Wallet", type: "cash", currency: "BDT", opening: 1000 },
      { id: "k", name: "Bkash", type: "wallet", currency: "BDT", opening: 500 },
      { id: "c", name: "Card", type: "card", currency: "BDT", opening: 0 },
    ],
    loans: [
      {
        id: "L1",
        kind: "lend",
        person: "Swarna",
        amount: 300,
        account: "k",
        date: d.d3,
        due: "",
        note: "",
        status: "open",
      },
    ],
    txns: [
      X("p1", d.d3, 0, "loan", 300, "k", { dir: "out", loan: "L1", principal: true }),
      X("e0", d.d3, 9, "expense", 70, "w", { cat: "food" }),
      X("e1", d.d2, 1, "expense", 100, "w", { cat: "groceries" }),
      X("r1", d.d2, 2, "loan", 100, "k", { dir: "in", loan: "L1" }),
      X("i1", d.d1, 2, "income", 50, "w", { cat: "income" }),
      X("t1", d.d1, 3, "transfer", 200, "k", { to: "w" }),
      X("e2", d.t, 4, "expense", 30, "w", { cat: "food" }),
      X("r2", d.t, 5, "loan", 200, "w", { dir: "in", loan: "L1" }),
    ],
  };
  await page.evaluate(s => localStorage.setItem("tally:v1", JSON.stringify(s)), seed);
  await page.reload();
  const cdp = await ctx.newCDPSession(page);
  const T = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const tap = async sel => {
    await page.tap(sel);
    await page.waitForTimeout(80);
  };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const hold = async sel => {
    await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: "center" }), sel);
    const b = await (await page.$(sel)).boundingBox();
    await T("touchStart", b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(650);
    await T("touchEnd");
    await page.waitForTimeout(150);
  };
  const txt = sel => page.textContent(sel);

  // ---- 6/7. History: colours, running balances, loan pills
  await tap('[data-act="go"][data-v="history"]');
  const col = sel => page.$eval(sel, e => getComputedStyle(e).color);
  const [cs, cg, cx] = [await col('[data-v="e1"] .a'), await col('[data-v="i1"] .a'), await col('[data-v="t1"] .a')];
  ok(
    cs !== cg &&
      cg !== cx &&
      cs !== cx &&
      cs === (await page.evaluate(() => getComputedStyle(document.querySelector(".spent")).color)),
    "expense red, income green, transfer blue " + [cs, cg, cx]
  );
  const rb = async id => page.$$eval(`[data-v="${id}"] .rb`, e => e.map(x => x.textContent));
  const want = {
    e0: "Wallet BDT 930",
    e1: "Wallet BDT 830",
    i1: "Wallet BDT 880",
    e2: "Wallet BDT 1,050",
    r2: "Wallet BDT 1,250",
    r1: "Bkash BDT 300",
    p1: "Bkash BDT 200",
  };
  let allRb = true,
    dump = {};
  for (const [id, w] of Object.entries(want)) {
    const v = (await rb(id)).join("|").replace(/\s/g, " ");
    dump[id] = v;
    if (!v.includes(w)) allRb = false;
  }
  ok(allRb, "running balances match (incl. a backdated entry) " + JSON.stringify(dump));
  const tr = await rb("t1");
  ok(
    tr.length === 2 &&
      tr[0].includes("Bkash") &&
      tr[0].includes("100") &&
      tr[1].includes("Wallet") &&
      tr[1].includes("1,080"),
    "transfer shows both accounts " + JSON.stringify(tr)
  );
  ok(
    (await txt('[data-v="r1"] .s')).includes("Partly paid") &&
      (await txt('[data-v="r2"] .s')).includes("Cleared") &&
      !(await txt('[data-v="p1"] .s')).includes("paid"),
    "loan pills: partly paid, then cleared"
  );
  await page.screenshot({ path: OUT + "/history.png" });
  await tap('[data-act="home"]');

  // ---- 5. summary from the donut; balance bar still lists entries
  await tap("#ring .dwrap");
  ok(
    (await page.isVisible('#sheet [data-act="sm-mode"][data-v="w"]')) && (await page.$$("#sheet .smcol")).length === 7,
    "donut opens the summary with 7 day bars"
  );
  const vals = await page.$$eval("#sheet .smcol .v", e => e.map(x => x.textContent));
  ok(
    vals[6] === "30" && vals[5] === "" && vals[4] === "100" && vals[3] === "70",
    "bar values match the entries " + JSON.stringify(vals)
  );
  ok((await txt("#sm .smd")).includes("30") && (await txt("#sm .smd")).includes("Today"), "today selected by default");
  await tap('#sheet .smcol[data-v="4"]');
  const det = await txt("#sm .smd");
  ok(
    det.includes("100") && det.includes("↑ 43%"),
    "tapping a bar shows its total and comparison: " + det.replace(/\s+/g, " ")
  );
  ok((await txt("#sm .smtop")).includes("Groceries"), "top categories listed");
  await page.screenshot({ path: OUT + "/summary-days.png" });
  await tap('#sheet [data-act="sm-mode"][data-v="w"]');
  ok((await page.$$("#sheet .smrow")).length === 8, "8 week rows");
  await tap('#sheet [data-act="sm-mode"][data-v="m"]');
  ok(!!(await page.$("#sheet .smpie svg")), "month donut");
  const lbl0 = await txt("#sm .cal-h b");
  await tap('#sheet [data-act="sm-nav"][data-v="-1"]');
  ok((await txt("#sm .cal-h b")) !== lbl0, "‹ moves the window");
  await tap('#sheet [data-act="sm-mode"][data-v="d"]');
  await tap('#sheet [data-act="sm-nav"][data-v="1"]');
  await tap('#sheet .smcol[data-v="4"]');
  await tap('#sheet [data-act="sm-open"]');
  ok(
    !(await page.isVisible("#sheet .p")) &&
      !(await txt(".pnav .plabel")).includes("Today") &&
      !!(await page.$('[data-act="go-today"]')),
    "Open on Home shows that day: " + (await txt(".pnav .plabel"))
  );
  await tap('[data-act="go-today"]');
  await tap(".balbar");
  ok(await page.isVisible('#sheet [data-v="e2"]'), "balance bar still opens the entries");
  await tap('#sheet [data-act="close"]');

  // ---- 4. account sheet
  await tap('[data-act="tab"][data-v="assets"]');
  await tap('[data-src="acc"] [data-v="k"]');
  ok(
    (await page.isVisible('#sheet [data-act="acc-arch"]')) &&
      (await page.isVisible('#sheet [data-act="hist-acc"]')) &&
      !(await page.$('#sheet [data-act="tr-from-acc"]')),
    "active account: Archive + History, no Transfer"
  );
  await page.screenshot({ path: OUT + "/acc-sheet.png" });
  await tap('#sheet [data-act="acc-arch"]');
  let S = await state();
  ok(S.accounts.find(a => a.id === "k").archived, "Archive archives");
  await tap('[data-act="toggle-arch"]');
  await tap('[data-src="arch"] [data-v="k"]');
  ok(
    (await page.isVisible('#sheet [data-act="acc-unarch"]')) && (await page.isVisible('#sheet [data-act="hist-acc"]')),
    "archived account: Show again + History"
  );
  await tap('#sheet [data-act="acc-unarch"]');
  S = await state();
  ok(!S.accounts.find(a => a.id === "k").archived, "Show again unarchives");
  await tap('[data-src="acc"] [data-v="k"]');
  await tap('#sheet [data-act="acc-form"]');
  ok(!(await page.$('#sheet [data-act="acc-arch"]')), "Edit account has no Archive button");

  // ---- 1. hold a colour to remove it
  await hold('#f-dots .dot[data-v="#15a06f"]');
  ok(await page.isVisible('#pop [data-act="ask-ok"]'), "holding a colour asks with a Material dialog");
  await page.screenshot({ path: OUT + "/remove-colour.png" });
  await tap('#pop [data-act="ask-ok"]');
  S = await state();
  ok(
    S.settings.hiddenCols.includes("#15a06f") && !(await page.$('#f-dots .dot[data-v="#15a06f"]')),
    "palette colour removed"
  );
  await tap('#sheet [data-act="col-new"]');
  await page.fill("#hx-in", "#123456");
  await tap('[data-act="hx-ok"]');
  await hold('#f-dots .dot[data-v="#e0578c"]');
  await tap('#pop [data-act="pd-close"]');
  ok(!!(await page.$('#f-dots .dot[data-v="#e0578c"]')), "Cancel keeps the colour");
  // ---- 2. types: hold any
  await hold('#sheet .chip[data-v="savings"]');
  await tap('#pop [data-act="ask-ok"]');
  S = await state();
  ok(
    S.settings.hiddenTypes.includes("savings") && !(await page.$('#sheet .chip[data-v="savings"]')),
    "built-in type removed (hidden)"
  );
  await hold('#sheet .chip[data-v="wallet"]');
  ok((await txt("#snack")).includes("used by 1"), "a used type is refused");
  await tap('#sheet [data-act="type-new"]');
  await page.fill("#nt-name", "savings");
  await tap('[data-act="nt-add"]');
  S = await state();
  ok(
    !S.settings.hiddenTypes.includes("savings") &&
      (await page.$eval('#sheet .chip[data-v="savings"]', e => e.getAttribute("aria-pressed"))) === "true",
    'Add new "savings" brings the built-in back'
  );
  await tap('#sheet [data-act="close"]');
  // colours elsewhere: hidden palette gone, but kept where used; hex brings back; custom removal
  await tap('[data-act="go"][data-v="settings"]');
  await tap('.ring.edit .tile[data-v="groceries"]');
  ok(
    (await page.$eval('#f-dots .dot[data-v="#15a06f"]', e => e.getAttribute("aria-pressed"))) === "true",
    "a category already in the removed colour still shows it"
  );
  await tap('#sheet [data-act="close"]');
  await tap('.ring.edit .tile[data-v="food"]');
  ok(
    !(await page.$('#f-dots .dot[data-v="#15a06f"]')) && !!(await page.$('#f-dots .dot[data-v="#123456"]')),
    "other pickers: removed colour gone, custom one there"
  );
  await hold('#f-dots .dot[data-v="#123456"]');
  await tap('#pop [data-act="ask-ok"]');
  S = await state();
  ok(!S.settings.customCols.includes("#123456"), "custom colour removed");
  await tap('#sheet [data-act="col-new"]');
  await page.fill("#hx-in", "15a06f");
  await tap('[data-act="hx-ok"]');
  S = await state();
  ok(!S.settings.hiddenCols.includes("#15a06f"), "typing a removed palette colour brings it back");
  await tap('#sheet [data-act="close"]');

  // ---- 3. confirms are Material: delete account, wipe (cancel), restore
  await tap('[data-act="home"]');
  await tap('[data-act="tab"][data-v="assets"]');
  await tap('[data-act="acc-form"]');
  await page.fill("#f-name", "Temp");
  await tap('#sheet [data-act="acc-save"]');
  let tmp = (await state()).accounts.find(a => a.name === "Temp");
  await tap(`[data-src="acc"] [data-v="${tmp.id}"]`);
  await tap('#sheet [data-act="acc-form"]');
  await tap('#sheet [data-act="acc-del"]');
  await tap('#pop [data-act="pd-close"]');
  ok(
    (await state()).accounts.some(a => a.id === tmp.id) && (await page.isVisible("#sheet .p")),
    "Cancel keeps the account"
  );
  await tap('#sheet [data-act="acc-del"]');
  await tap('#pop [data-act="ask-ok"]');
  ok(!(await state()).accounts.some(a => a.id === tmp.id), "delete account via Material dialog");
  // negative opening for a non-card warns
  await tap('[data-act="acc-form"]');
  await page.fill("#f-name", "Neg");
  await page.fill("#f-open", "-50");
  await tap('#sheet [data-act="acc-save"]');
  ok(await page.isVisible('#pop [data-act="ask-ok"]'), "negative starting balance on a non-card asks");
  await tap('#pop [data-act="pd-close"]');
  await tap('#sheet [data-act="close"]');
  await tap('[data-act="go"][data-v="settings"]');
  await tap('[data-act="wipe"]');
  await tap('#pop [data-act="pd-close"]');
  ok((await state()).accounts.length === 3, "wipe: Cancel keeps data");
  const backup = JSON.stringify(
    Object.assign({}, seed, { accounts: seed.accounts.slice(0, 2), txns: seed.txns.filter(t => t.account !== "c") })
  );
  await page.setInputFiles("#restore-file", {
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await page.waitForTimeout(200);
  ok(
    (await page.isVisible('#pop [data-act="ask-ok"]')) && (await txt("#pop")).includes("2 accounts"),
    "restore asks with a Material dialog"
  );
  await tap('#pop [data-act="ask-ok"]');
  ok((await state()).accounts.length === 2, "restore after OK");
  await page.evaluate(s => localStorage.setItem("tally:v1", JSON.stringify(s)), seed);
  await page.reload();

  // ---- 8. overdraw warnings
  const addOut = async (acc, amt) => {
    await tap('[data-act="add-out"]');
    await page.waitForTimeout(100);
    const c = await page.$('#sheet [data-act="f-cat"][data-v="food"]');
    if (c) await tap('#sheet [data-act="f-cat"][data-v="food"]');
    await tap(`#sheet [data-act="f-acc"][data-v="${acc}"]`);
    await page.fill("#f-amt", String(amt));
    await tap('#sheet [data-act="tx-save"]');
  };
  await addOut("w", 2000);
  ok(
    (await page.isVisible('#pop [data-act="ask-ok"]')) &&
      (await txt("#pop")).includes("Not enough in Wallet") &&
      (await txt("#pop")).includes("1,250"),
    "expense bigger than Wallet warns: " + (await txt("#pop")).replace(/\s+/g, " ")
  );
  await page.screenshot({ path: OUT + "/overdraw.png" });
  await tap('#pop [data-act="pd-close"]');
  ok((await page.isVisible("#f-amt")) && (await state()).txns.length === 8, "Go back: sheet stays, nothing saved");
  await tap('#sheet [data-act="tx-save"]');
  await tap('#pop [data-act="ask-ok"]');
  ok((await state()).txns.length === 9, "Save anyway saves");
  await addOut("c", 5000);
  ok(
    !(await page.isVisible('#pop [data-act="ask-ok"]')) && (await state()).txns.length === 10,
    "credit card never warns"
  );
  // transfer from Bkash (100)
  await tap('[data-act="tr-new"]');
  await tap('#sheet [data-act="tr-from"][data-v="k"]').catch(() => {});
  await tap('#sheet [data-act="tr-to"][data-v="w"]').catch(() => {});
  await page.fill("#f-amt", "500");
  await tap('#sheet [data-act="tr-save"]');
  ok(
    (await page.isVisible('#pop [data-act="ask-ok"]')) && (await txt("#pop")).includes("Bkash"),
    "transfer larger than the source warns"
  );
  await tap('#pop [data-act="pd-close"]');
  await tap('#sheet [data-act="close"]');
  // lending from Bkash
  await tap('[data-act="loan-new"][data-v="lend"]');
  await page.waitForTimeout(100);
  await page.fill("#f-person", "Rafi");
  await page.fill("#f-amt", "1000");
  await tap('#sheet [data-act="f-acc"][data-v="k"]');
  await tap('#sheet [data-act="loan-save"]');
  ok(await page.isVisible('#pop [data-act="ask-ok"]'), "lending more than the source has warns");
  await tap('#pop [data-act="pd-close"]');
  await tap('#sheet [data-act="close"]');
  ok(dialogs === 0, "the browser dialog never appears");

  await page.setViewportSize({ width: 360, height: 760 });
  await tap('[data-act="go"][data-v="history"]');
  ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "no horizontal overflow at 360px (history with balances)"
  );
  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
