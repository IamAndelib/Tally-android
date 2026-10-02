// QA fixes for 1.3.1: money in every currency's own decimals, loan and delete guards, Undo that never restores over a
// newer change, archiving an account that still holds money, saves and backups from anywhere read safely, pasted
// amounts, the calculator's operators, the back button's order, the snackbar beside the keypad and double taps.
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("23-qa-fixes");
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
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const t = await page.evaluate(() => today());
  const ago = n => page.evaluate(n => addDays(today(), -n), n);
  const d5 = await ago(5),
    d3 = await ago(3),
    d1 = await ago(1);
  const seed = async extra => {
    await page.evaluate(
      o => localStorage.setItem("tally:v1", JSON.stringify(o)),
      Object.assign(
        {
          v: 6,
          settings: { cur: "USD", lastCheck: t, dragTip: true },
          accounts: [
            { id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1000 },
            { id: "b", name: "Cash", type: "cash", currency: "USD", opening: 0 },
          ],
          txns: [],
          loans: [],
          assets: [],
        },
        extra
      )
    );
    await page.reload();
    await settle();
  };
  const snackText = () => page.textContent("#snack").catch(() => "");

  // ---- 1. money in the currency's own decimals; amounts keep 3 decimals; never "−0"
  await seed({});
  const m = await page.evaluate(() => ({
    jpy: money(1250.4, "JPY"),
    kwd: money(1.25, "KWD"),
    usd: money(12.5, "USD"),
    neg0: money(-0.001, "USD"),
    amt: evalAmt("1.255"),
    zero: Object.is(rnd(-0.0001), 0),
    sum: rnd(0.1 + 0.2),
  }));
  ok(/^\D*1,250$/.test(m.jpy), "yen without decimals: " + m.jpy);
  ok(/1[.,]250/.test(m.kwd), "dinar with 3 decimals: " + m.kwd);
  ok(/12[.,]50/.test(m.usd), "dollars with 2: " + m.usd);
  ok(!/[-−]/.test(m.neg0), "a tiny negative shows no minus: " + m.neg0);
  ok(m.amt === 1.255 && m.zero && m.sum === 0.3, "amounts keep 3 decimals, rounding gives +0");

  // ---- 2. a loan's draw can't be deleted below what was already paid back
  const L = (id, date, amount, account, extra) =>
    Object.assign({ id, ts: 1, date, type: "loan", amount, account, note: "", dir: "out", loan: "L" }, extra);
  await seed({
    loans: [{ id: "L", kind: "lend", person: "Sam", account: "a", date: d5, status: "open" }],
    txns: [
      L("d1", d5, 100, "a", { principal: true }),
      L("d2", d3, 50, "a", { principal: true }),
      L("p1", d1, 120, "a", { dir: "in" }),
      { id: "x1", ts: 2, date: t, type: "expense", amount: 5, account: "a", cat: "food", note: "" },
    ],
  });
  await page.evaluate(() => deleteLoanEntry("d2"));
  await settle();
  ok(
    (await state()).txns.some(x => x.id === "d2"),
    "deleting a draw below the paid-back amount is refused"
  );
  ok((await snackText()).includes("already paid back"), "and says why: " + (await snackText()));
  await page.evaluate(() => deleteLoanEntry("p1"));
  await settle();
  ok(!(await state()).txns.some(x => x.id === "p1"), "a payment can still be deleted");
  await page.click('[data-act="undo"]');
  await settle();
  // the same through History's multi-select
  await page.evaluate(() => {
    V.screen = "history";
    V.sel = new Set(["d2", "x1"]);
    render();
  });
  await page.click('[data-act="sel-del"]');
  await settle();
  ok(
    (await state()).txns.some(x => x.id === "d2") && (await state()).txns.some(x => x.id === "x1"),
    "multi-select delete is refused as a whole when it would undo a payment"
  );
  // the payment's date can't be before the first draw
  await page.evaluate(() => {
    V.screen = "home";
    render();
    loanOpen("L");
  });
  await settle();
  const dmin = await page.getAttribute("#f-date", "data-min").catch(() => null);
  ok(dmin === d5, "a payment's date starts at the first draw: " + dmin);
  await page.evaluate(() => closeSheet());

  // ---- 3. multi-select delete counts what actually went (a transfer's fee goes with it)
  await seed({
    txns: [
      { id: "t1", ts: 1, date: t, type: "transfer", amount: 50, account: "a", to: "b", note: "", feeId: "f1" },
      { id: "f1", ts: 1, date: t, type: "expense", amount: 1, account: "a", cat: "other", note: "", feeOf: "t1" },
    ],
  });
  await page.evaluate(() => {
    V.screen = "history";
    V.sel = new Set(["t1"]);
    render();
  });
  await page.click('[data-act="sel-del"]');
  await settle();
  ok((await snackText()).includes("Deleted 2 entries"), "delete message counts the fee: " + (await snackText()));

  // ---- 4. Undo never restores over a newer change
  await seed({ txns: [{ id: "e1", ts: 1, date: t, type: "expense", amount: 5, account: "a", cat: "food", note: "" }] });
  await page.evaluate(() => withUndo("Deleted", () => deleteEntries(["e1"])));
  ok(await page.isVisible('[data-act="undo"]'), "Undo offered");
  await page.evaluate(() => {
    S.txns.push({ id: "e2", ts: 2, date: today(), type: "expense", amount: 7, account: "a", cat: "food", note: "" });
    commit();
  });
  ok(!(await page.$('[data-act="undo"]')), "a later change removes the stale Undo");
  ok(
    (await state()).txns.some(x => x.id === "e2"),
    "and the later change stays"
  );

  // ---- 5. archiving: asks while the account holds money, not when it is empty
  await seed({});
  await page.evaluate(() => setArchived("b", true));
  await settle();
  ok((await state()).accounts.find(a => a.id === "b").archived && !(await page.$("#pop .dialog")), "empty: archives");
  await page.evaluate(() => setArchived("a", true));
  await settle();
  ok(
    !(await state()).accounts.find(a => a.id === "a").archived &&
      (await page.textContent("#pop .dlg-x")).includes("$1,000.00"),
    "with money: asks first, naming the balance"
  );
  await page.click('#pop [data-act="pd-close"]');
  await settle();
  ok(!(await state()).accounts.find(a => a.id === "a").archived, "Cancel keeps it");

  // ---- 6. a save or backup from anywhere is read safely
  const S6 = await page.evaluate(() =>
    migrate(
      JSON.parse(
        '{"v":{"toString":1},"settings":{"__proto__":{"evil":1},"cur":"USD","week":{"valueOf":1},"junk":"x",' +
          '"dragTip":"yes","lastCheck":"soon","hapticLevel":{"toString":1},"remind":{"time":{"toString":1}}},' +
          '"accounts":[{"id":"constructor","name":{"toString":1},"currency":"USD","opening":"1e15"},' +
          '{"id":"ok","name":"Bank","currency":"USD","opening":10}],' +
          '"txns":[{"id":"t1","date":"2024-02-30","type":"expense","amount":5,"account":"ok","cat":"food"},' +
          '{"id":"t2","date":"2024-03-01","type":"expense","amount":1e15,"account":"ok","cat":"food"},' +
          '{"id":"t3","date":"2024-03-01","type":"expense","amount":[5],"account":"ok","cat":"food"}]}'
      )
    )
  );
  ok(
    !Object.prototype.hasOwnProperty.call(S6.settings, "junk") && !("evil" in S6.settings),
    "unknown settings dropped"
  );
  ok(
    S6.settings.week === 1 && S6.settings.hapticLevel === 3 && S6.settings.remind.time === "21:00",
    "bad values reset"
  );
  ok(!("dragTip" in S6.settings) && !("lastCheck" in S6.settings), "dragTip and lastCheck checked");
  ok(
    S6.accounts[0].id !== "constructor" && S6.accounts[0].name === "Account" && S6.accounts[0].opening === 0,
    "ids, names, numbers"
  );
  ok(S6.txns.length === 1 && S6.txns[0].date === "2024-03-01", "impossible dates fixed, impossible amounts left out");

  // ---- 7. pasted amounts and the calculator's operators
  await seed({});
  await page.evaluate(() => txSheet(null, "expense"));
  await settle();
  const paste = async text => {
    await page.$eval(
      "#f-amt",
      (el, text) => {
        el.value = text;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: text }));
      },
      text
    );
    return page.inputValue("#f-amt");
  };
  ok((await paste("12,50")) === "12.50", "pasted 12,50 reads as 12.50");
  ok((await paste("1.234,56")) === "1,234.56", "pasted 1.234,56 reads as 1,234.56");
  ok((await paste("1,250")) === "1,250", "pasted 1,250 stays a thousand");
  await page.fill("#f-amt", "");
  await page.click('[data-act="calc-toggle"][data-v="f-amt"]');
  for (const k of ["5", "+", "3"]) await page.click(`#calc-f-amt [data-v="${k}"]`);
  await page.evaluate(() => {
    CALC.pos = 1; // the caret between 5 and +
    calcKey("×");
  });
  ok((await page.evaluate(() => CALC.expr)) === "5×3", "an operator right before another replaces it");

  // ---- 8. back closes the topmost layer first, the keypad's own sheet after
  await page.evaluate(() => datePicker($("#f-date")));
  await settle();
  const hadPop = !!(await page.$("#pop .dialog"));
  await page.evaluate(() => goBack());
  ok(hadPop && !(await page.$("#pop .dialog")) && (await page.evaluate(() => !!CALC)), "back: the date picker first");
  await page.evaluate(() => goBack());
  ok(!(await page.evaluate(() => !!CALC)) && (await page.isVisible("#f-amt")), "then the keypad");

  // ---- 9. the snackbar sits above an open keypad
  await page.click('[data-act="calc-toggle"][data-v="f-amt"]');
  await settle();
  await page.evaluate(() => snack("Hello"));
  const pos = await page.evaluate(() => ({
    s: document.querySelector("#snack .snack").getBoundingClientRect().bottom,
    k: document.querySelector("#calc-f-amt").getBoundingClientRect().top,
  }));
  ok(pos.s <= pos.k + 1, "snackbar above the keypad " + JSON.stringify(pos));
  await page.screenshot({ path: OUT + "/snack-keypad.png" });
  await page.evaluate(() => closeSheet());
  await settle();

  // ---- 10. a quick second tap where a tap just closed a sheet doesn't reach the screen below
  await seed({});
  await page.evaluate(() => txSheet(null, "expense"));
  await settle();
  const xb = await page.$eval('#sheet [data-act="close"]', b => {
    const r = b.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  // every tap that reaches the page is counted where it ends (a dropped one never gets there)
  await page.evaluate(() => {
    window.__hit = 0;
    window.addEventListener("click", e => e.detail && window.__hit++);
  });
  await page.mouse.click(xb[0], xb[1]);
  await page.mouse.click(xb[0], xb[1]);
  ok(
    !(await page.$("#sheet .p")) && (await page.evaluate(() => window.__hit)) === 1,
    "double tap: the second is dropped"
  );
  await page.waitForTimeout(400);
  await page.mouse.click(xb[0], xb[1]);
  ok((await page.evaluate(() => window.__hit)) === 2, "a later tap goes through");

  // ---- 11. date ranges the phone's way, the year when it isn't this one
  const rl = await page.evaluate(() => [
    rangeLabel("2026-06-03", "2026-06-09"),
    rangeLabel("2025-12-29", "2026-01-04"),
    rangeLabel("2026-04-01", "2026-09-30", true),
  ]);
  ok(/^Jun 3\s*–\s*9$/.test(rl[0]), "en-US range: " + rl[0]);
  ok(/2025/.test(rl[1]) && /2026/.test(rl[1]), "across years, with the years: " + rl[1]);
  ok(/^Apr\s*–\s*Sep$/.test(rl[2]), "months: " + rl[2]);

  // ---- 12. Delete all data: the backup question's buttons say what they do
  await page.evaluate(() => wipeAll());
  await settle();
  ok(
    (await page.textContent('#pop [data-act="ask-ok"]')).trim() === "Save backup" &&
      (await page.textContent('#pop [data-act="ask-alt"]')).trim() === "Skip",
    "Save backup / Skip"
  );
  await page.evaluate(() => closePop());

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));

  // ---- 13. a German phone: amounts as 1.234,56, the keypad's decimal key is ","
  const de = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "de-DE" });
  const dp = await de.newPage();
  await dp.goto(appUrl);
  await dp.evaluate(o => localStorage.setItem("tally:v1", JSON.stringify(o)), {
    v: 6,
    settings: { cur: "EUR", lastCheck: t, dragTip: true },
    accounts: [{ id: "a", name: "Bank", type: "bank", currency: "EUR", opening: 1000 }],
    txns: [],
    loans: [],
    assets: [],
  });
  await dp.reload();
  await dp.evaluate(() => txSheet(null, "expense"));
  await dp.waitForTimeout(150);
  await dp.click("#f-amt");
  await dp.keyboard.type("1234,5");
  ok((await dp.inputValue("#f-amt")) === "1.234,5", "typed the German way: " + (await dp.inputValue("#f-amt")));
  ok((await dp.evaluate(() => evalAmt($("#f-amt").value))) === 1234.5, "and read as 1234.5");
  await dp.fill("#f-amt", "");
  await dp.keyboard.type("12.5");
  ok(
    (await dp.inputValue("#f-amt")) === "12,5",
    "a typed . is the decimal point too: " + (await dp.inputValue("#f-amt"))
  );
  await dp.click('[data-act="calc-toggle"][data-v="f-amt"]');
  ok((await dp.textContent('#calc-f-amt [data-v="."]')).trim() === ",", "the keypad's decimal key shows ,");
  for (const k of ["×", "2"]) await dp.click(`#calc-f-amt [data-v="${k}"]`);
  ok((await dp.evaluate(() => CALC.expr)) === "12,5×2", "the expression too: " + (await dp.evaluate(() => CALC.expr)));
  await dp.evaluate(() => calcToggle("f-amt", calcToggleBtn("f-amt"))); // = and close
  ok((await dp.inputValue("#f-amt")) === "25", "the result comes back: " + (await dp.inputValue("#f-amt")));
  await dp.evaluate(() => closeSheet());
  const deEdit = await dp.evaluate(() => {
    S.txns.push({
      id: "e",
      ts: 1,
      date: today(),
      type: "expense",
      amount: 1234.56,
      account: "a",
      cat: "food",
      note: "",
    });
    commit();
    txSheet("e");
    return $("#f-amt").value;
  });
  ok(deEdit === "1.234,56", "an entry opens as 1.234,56: " + deEdit);
  await de.close();

  // ---- 14. a tablet held sideways with its keyboard up is not a sideways phone
  const tab = await browser.newContext({
    viewport: { width: 1280, height: 420 },
    screen: { width: 1280, height: 800 },
  });
  const tp = await tab.newPage();
  await tp.goto(appUrl);
  ok(!(await tp.evaluate(() => phoneLand())), "tablet + keyboard: not phoneLand");
  const phone = await browser.newContext({
    viewport: { width: 852, height: 393 },
    screen: { width: 852, height: 393 },
  });
  const pp = await phone.newPage();
  await pp.goto(appUrl);
  ok(await pp.evaluate(() => phoneLand()), "a sideways phone still is");
  await tab.close();
  await phone.close();

  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
