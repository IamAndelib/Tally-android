// Stability pass for 1.1.1: loan draws deleted one at a time, Save with the calculator still open, a calculator left
// behind by a closed sheet, backups from elsewhere, and the smaller guards (fee, CSV, history filter, restore).
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("18-stability");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const ago = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    locale: "en-CA",
  });
  await ctx.addInitScript(() => {
    window.__saved = [];
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
      saveFile(name, mime, text) {
        window.__saved.push({ name, text });
      },
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const settle = () => page.waitForTimeout(150);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const snackText = () => page.textContent("#snack");
  const seed = async o => {
    await page.evaluate(s => localStorage.setItem("tally:v1", s), JSON.stringify(o));
    await page.reload();
    await settle();
  };
  const keys = async list => {
    for (const k of list) await page.click(`.calc:not([hidden]) [data-act="calc-key"][data-v="${k}"]`);
  };
  const bank = { id: "a", name: "Bank", type: "bank", currency: "CAD", opening: 1000 };
  const cash = { id: "c", name: "Cash", type: "cash", currency: "CAD", opening: 500 };

  await page.goto(appUrl);

  // ---- 1. evalAmt: calculator expressions and limits
  const ev = await page.evaluate(() =>
    ["12−3", "12×3", "100÷4", "1,234.5", "12,5", "5+2", "9".repeat(400), "1000000000000", "abc", "12×3abc", "12+"].map(
      evalAmt
    )
  );
  ok(
    JSON.stringify(ev) === JSON.stringify([9, 36, 25, 1234.5, 12.5, 7, null, null, null, null, null]),
    "evalAmt reads calculator expressions and refuses runaway numbers: " + JSON.stringify(ev)
  );

  // ---- 2. Save with the keypad still open
  await seed({ v: 6, settings: { cur: "CAD" }, accounts: [bank], txns: [], loans: [], assets: [] });
  await page.click("#ring .cat");
  await settle();
  await act("calc-toggle");
  await keys(["1", "2", "×", "3"]);
  await act("tx-save");
  await settle();
  let S = await state();
  ok(S.txns.length === 1 && S.txns[0].amount === 36, "12×3 with the keypad open saves 36: " + JSON.stringify(S.txns));
  await page.click("#ring .cat");
  await settle();
  await act("calc-toggle");
  await keys(["5", "0", "−", "5"]);
  await act("tx-save");
  await settle();
  S = await state();
  ok(S.txns.length === 2 && S.txns.some(t => t.amount === 45), "50−5 saves 45");
  ok(!(await page.evaluate(() => CALC && CALC.inp && CALC.inp.isConnected)), "no live calculator left after saving");

  // ---- 3. a calculator left behind by a closed sheet
  await page.click("#ring .cat");
  await settle();
  await act("calc-toggle");
  await keys(["5", "×", "4"]);
  await page.evaluate(() => closeSheet()); // what tapping the dimmed background does
  await page.click("#ring .cat");
  await settle();
  const back = await page.evaluate(() => [tallyBack(), !!$("#sheet").innerHTML, CALC]);
  ok(
    back[0] === true && back[1] === false && back[2] === null,
    "back after that closes the new sheet: " + JSON.stringify(back)
  );
  await page.click("#ring .cat");
  await settle();
  ok((await page.inputValue("#f-amt")) === "", "and the new form's amount is untouched");
  await act("calc-toggle");
  await keys(["−", "×"]);
  ok((await page.evaluate(() => CALC.expr)) === "−", "a lone leading − can't become ×");
  await page.evaluate(() => closeSheet());

  // ---- 4. loan draws: delete one, the loan stays
  const loanState = () => ({
    v: 6,
    settings: { cur: "CAD" },
    accounts: [bank, cash],
    txns: [
      {
        id: "d1",
        ts: 1,
        date: ago(5),
        type: "loan",
        dir: "out",
        loan: "L",
        principal: true,
        amount: 100,
        account: "a",
        note: "",
      },
      {
        id: "d2",
        ts: 2,
        date: ago(2),
        type: "loan",
        dir: "out",
        loan: "L",
        principal: true,
        amount: 50,
        account: "c",
        note: "",
      },
      { id: "p1", ts: 3, date: ago(1), type: "loan", dir: "in", loan: "L", amount: 30, account: "a", note: "" },
    ],
    loans: [{ id: "L", kind: "lend", person: "Sam", account: "c", date: ago(5), note: "", status: "open" }],
    assets: [],
  });
  await seed(loanState());
  await act("go", "history");
  await settle();
  await act("sel-start");
  await act("sel-toggle", "d2");
  await act("sel-del");
  await settle();
  S = await state();
  ok(
    S.loans.length === 1 && S.txns.map(t => t.id).join() === "d1,p1",
    "History: deleting one of two draws keeps the loan, the other draw and the payment: " + S.txns.map(t => t.id)
  );
  ok(S.loans[0].account === "a", "the loan now follows its remaining draw's account: " + S.loans[0].account);
  await act("undo");
  await settle();
  S = await state();
  ok(S.txns.length === 3 && S.loans[0].account === "c", "Undo brings the draw and the account back");
  await act("sel-start");
  await act("sel-toggle", "d1");
  await act("sel-toggle", "d2");
  await act("sel-del");
  await settle();
  S = await state();
  ok(S.loans.length === 0 && S.txns.length === 0, "deleting every draw removes the loan and its payment");

  // loan sheet: Delete on a draw relinks too
  await seed(loanState());
  await page.evaluate(() => {
    loanOpen("L");
    deleteLoanEntry("d2");
  });
  await settle();
  S = await state();
  ok(S.loans[0].account === "a" && S.txns.length === 2, "loan sheet Delete on a draw relinks the loan");
  await page.evaluate(() => {
    loanOpen("L");
    deleteLoanEntry("d1");
  });
  await settle();
  S = await state();
  ok(
    S.txns.some(t => t.id === "d1"),
    "the loan's only draw can't be deleted from its sheet"
  );

  // ---- 5. editing a draw or payment can't overpay; a valid edit relinks
  const paidMore = loanState();
  paidMore.txns[2].amount = 120;
  await seed(paidMore);
  await page.evaluate(() => {
    loanOpen("L");
    loanDrawEdit("p1");
  });
  await settle();
  await page.fill("#ed-amt", "200");
  await act("loandraw-save");
  await settle();
  S = await state();
  ok(S.txns.find(t => t.id === "p1").amount === 120, "a payment can't be raised past what's left");
  ok((await snackText()).includes("150"), "the snack says how much it can be: " + (await snackText()));
  await page.evaluate(() => {
    closeSheet();
    loanOpen("L");
    loanDrawEdit("d1");
  });
  await settle();
  await page.fill("#ed-amt", "1");
  await act("loandraw-save");
  await settle();
  S = await state();
  ok(
    S.txns.find(t => t.id === "d1").amount === 100 && (await snackText()).includes("120"),
    "a draw can't be lowered below what's been paid: " + (await snackText())
  );
  await page.evaluate(() => {
    closeSheet();
    loanOpen("L");
    loanDrawEdit("d2");
  });
  await settle();
  await page.click('#sheet2 [data-act="ed-acc"][data-v="a"]');
  await act("loandraw-save");
  await settle();
  S = await state();
  ok(S.loans[0].account === "a", "moving the newest draw to Bank moves the loan's account too");

  // ---- 6. a loan whose account was deleted survives a restart
  const lost = loanState();
  lost.loans[0].account = "gone";
  await seed(lost);
  S = await page.evaluate(() => S);
  ok(S.loans.length === 1 && S.loans[0].account === "c", "loan with a missing account is repaired, not dropped");

  // ---- 7. a crafted backup: ids, currency, colours, numbers and settings are checked
  await seed({
    v: 6,
    settings: { cur: "<b>", theme: "neon", remind: { daily: false, time: "99:99" }, lastAcc: 'x"y' },
    accounts: [
      { id: 'x"y', name: "Odd", type: "toString", currency: '<b class="inj">X</b>', opening: 100, c: "red;x" },
    ],
    cats: [{ id: '"><b class="inj">', name: "Weird", kind: "out", c: "url(x)", i: "constructor" }],
    txns: [
      {
        id: "t<1>",
        ts: 1,
        date: today(),
        type: "expense",
        amount: 30,
        account: 'x"y',
        cat: '"><b class="inj">',
        note: "",
      },
    ],
    loans: [],
    assets: [{ id: "s'1", name: "Gold", value: "1e999", currency: "zz", c: "#12345g" }],
  });
  S = await page.evaluate(() => S);
  const a0 = S.accounts[0];
  ok(/^[A-Za-z0-9-]+$/.test(a0.id) && S.txns[0].account === a0.id, "unsafe ids are replaced, the same everywhere");
  ok(S.settings.lastAcc === a0.id, "settings follow the replaced id");
  ok(
    S.cats.some(c => c.id === S.txns[0].cat && c.name === "Weird"),
    "the entry keeps its category"
  );
  ok(
    a0.currency === "CAD" && S.settings.cur === "CAD" && S.assets[0].currency === "CAD",
    "bad currencies fall back to CAD"
  );
  ok(
    a0.type === "bank" && a0.c === "" && S.cats.find(c => c.name === "Weird").c === "#9AA3B2",
    "type and colours fall back"
  );
  ok(S.cats.find(c => c.name === "Weird").i === "" && S.assets[0].value === 0, "icon and Infinity value fall back");
  ok(
    S.settings.theme === "system" && S.settings.remind.time === "21:00" && S.settings.remind.daily === false,
    "theme and reminder time fall back, the off switch is kept"
  );
  await act("go", "history");
  await settle();
  ok((await page.$$(".inj")).length === 0, "nothing from the file turns into page elements");
  ok((await page.textContent("#app")).includes("Weird"), "the entry shows in History");
  const bal = await page.evaluate(() => balances()[S.accounts[0].id]);
  ok(bal === 70, "balance still adds up: " + bal);

  // ---- 8. transfer fee that isn't a number
  await seed({ v: 6, settings: { cur: "CAD" }, accounts: [bank, cash], txns: [], loans: [], assets: [] });
  await act("tr-new");
  await settle();
  await page.fill("#f-amt", "20");
  await act("tr-fee");
  await page.fill("#f-fee", "abc");
  await act("tr-save");
  await settle();
  S = await state();
  ok(S.txns.length === 0 && (await snackText()).includes("fee"), "a fee that isn't a number is refused, nothing saved");
  await page.fill("#f-fee", "2");
  await act("tr-save");
  await settle();
  S = await state();
  ok(S.txns.length === 2 && S.txns.some(t => t.feeOf), "with a real fee it saves the transfer and its fee");

  // ---- 9. CSV: text that a spreadsheet would run as a formula
  await seed({
    v: 6,
    settings: { cur: "CAD" },
    accounts: [bank],
    txns: [{ id: "t1", ts: 1, date: today(), type: "expense", amount: 5, account: "a", cat: "food", note: "=1+1" }],
    loans: [],
    assets: [],
  });
  await page.evaluate(() => exportCsv());
  const csv = await page.evaluate(() => window.__saved.pop().text);
  ok(csv.includes(`"'=1+1"`) && !csv.includes(`"=1+1"`), "CSV note =1+1 is exported as '=1+1");

  // ---- 10. History filter on an account that's gone
  await seed({
    v: 6,
    settings: { cur: "CAD" },
    accounts: [bank, cash],
    txns: [{ id: "t1", ts: 1, date: today(), type: "expense", amount: 5, account: "a", cat: "food", note: "" }],
    loans: [],
    assets: [],
  });
  await page.evaluate(() => {
    V.screen = "history";
    V.hAcc = "c";
    S.accounts = S.accounts.filter(x => x.id !== "c");
    render();
  });
  ok(
    (await page.evaluate(() => V.hAcc)) === "" && (await page.$$('#app [data-act="tx-open"]')).length === 1,
    "a filter on a deleted account resets to All"
  );

  // ---- 11. restore: a file that can't be read
  await page.evaluate(() => restoreFile({ files: [{ text: () => Promise.reject(new Error("io")) }], value: "x" }));
  await settle();
  ok((await snackText()).includes("Couldn't read that file"), "a file that can't be read says so");

  await page.screenshot({ path: OUT + "/end.png" });
  ok(errors.length === 0, "no page errors: " + JSON.stringify(errors));
  await browser.close();
  if (fails) {
    console.log(fails + " FAILED");
    process.exit(1);
  }
})();
