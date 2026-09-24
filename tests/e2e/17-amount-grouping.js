// Amounts get thousands commas as they are typed, in every amount field; saved numbers are unaffected.
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("17-amount-grouping");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
const today = () => {
  const d = new Date();
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
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const seed = async o => {
    await page.evaluate(s => localStorage.setItem("tally:v1", s), JSON.stringify(o));
    await page.reload();
    await settle();
  };
  const typeInto = async (sel, text) => {
    await page.click(sel);
    await page.keyboard.type(text);
  };

  await page.goto(appUrl);

  // ---- 1. groupDigits
  const g = await page.evaluate(() =>
    ["1234567", "1234.5678", "-1500", "12+3456", "", "999", "1,2,3,4", ".5"].map(groupDigits)
  );
  ok(
    JSON.stringify(g) === JSON.stringify(["1,234,567", "1,234.5678", "-1,500", "12+3,456", "", "999", "1,234", ".5"]),
    "groupDigits: " + JSON.stringify(g)
  );

  // ---- 2. Balance right now (the user's example)
  await seed({ v: 6, settings: { cur: "CAD" }, accounts: [], txns: [], loans: [], assets: [] });
  await act("acc-form");
  await settle();
  await page.fill("#f-name", "City Bank");
  await typeInto("#f-open", "123986");
  ok(
    (await page.inputValue("#f-open")) === "123,986",
    "Balance right now reads 123,986: " + (await page.inputValue("#f-open"))
  );
  await page.screenshot({ path: OUT + "/account-form.png" });
  await page.click('[data-act="acc-save"]');
  await settle();
  let S = await state();
  ok(S.accounts[0] && S.accounts[0].opening === 123986, "saved opening balance is 123986");

  // ---- 3. quick add: grouping, the "," key as a decimal point, caret, backspace
  await page.click("#ring .cat");
  await settle();
  await typeInto("#f-amt", "1234567");
  ok((await page.inputValue("#f-amt")) === "1,234,567", "quick add groups: " + (await page.inputValue("#f-amt")));
  // caret after "1,234" → type 0
  await page.evaluate(() => document.getElementById("f-amt").setSelectionRange(5, 5));
  await page.keyboard.type("0");
  const mid = await page.evaluate(() => {
    const i = document.getElementById("f-amt");
    return { v: i.value, c: i.selectionStart };
  });
  ok(
    mid.v === "12,340,567" && mid.c === 6,
    "typing mid-number regroups and keeps the caret after the digit: " + JSON.stringify(mid)
  );
  await page.keyboard.press("Backspace");
  const back = await page.evaluate(() => {
    const i = document.getElementById("f-amt");
    return { v: i.value, c: i.selectionStart };
  });
  ok(back.v === "1,234,567" && back.c === 5, "backspace regroups: " + JSON.stringify(back));
  await page.fill("#f-amt", "");
  await typeInto("#f-amt", "1250,5");
  ok(
    (await page.inputValue("#f-amt")) === "1,250.5",
    "the ',' key becomes the decimal point: " + (await page.inputValue("#f-amt"))
  );
  await page.keyboard.type(",7");
  ok((await page.inputValue("#f-amt")) === "1,250.57", "a second ',' is ignored: " + (await page.inputValue("#f-amt")));
  await page.click('[data-act="tx-save"]');
  await settle();
  S = await state();
  ok(S.txns[0] && S.txns[0].amount === 1250.57, "saved amount 1250.57: " + (S.txns[0] || {}).amount);

  // ---- 4. editing an entry opens grouped
  await seed({
    v: 6,
    settings: { cur: "CAD" },
    accounts: [
      { id: "a", name: "Chequing", type: "bank", currency: "CAD", opening: 50000 },
      { id: "b", name: "bKash", type: "wallet", currency: "BDT", opening: 90000 },
    ],
    txns: [{ id: "t1", ts: 1, type: "expense", amount: 3500, account: "a", cat: "food", date: today(), note: "" }],
    loans: [],
    assets: [],
  });
  await page.evaluate(() => txSheet("t1"));
  await settle();
  ok(
    (await page.inputValue("#f-amt")) === "3,500",
    "an existing 3500 opens as 3,500: " + (await page.inputValue("#f-amt"))
  );
  await page.click('[data-act="tx-save"]');
  await settle();
  S = await state();
  ok(S.txns[0].amount === 3500, "saving it unchanged keeps 3500");

  // ---- 5. transfer's received amount and fee
  await act("tr-new");
  await settle();
  await page.click('[data-act="tr-to"][data-v="b"]');
  await settle();
  await typeInto("#f-amt", "1000");
  await typeInto("#f-toamt", "86500");
  await page.click('[data-act="tr-fee"]');
  await typeInto("#f-fee", "1500");
  ok(
    (await page.inputValue("#f-amt")) === "1,000" &&
      (await page.inputValue("#f-toamt")) === "86,500" &&
      (await page.inputValue("#f-fee")) === "1,500",
    "transfer amount, received and fee group"
  );
  ok(/86,500/.test(await page.textContent("#sheet")), "preview still reads the grouped amounts");
  await page.click('[data-act="tr-save"]');
  await settle();
  S = await state();
  const tr = S.txns.find(t => t.type === "transfer"),
    fee = S.txns.find(t => t.feeOf);
  ok(
    tr && tr.amount === 1000 && tr.toAmount === 86500 && fee && fee.amount === 1500,
    "transfer saved with raw numbers"
  );

  // ---- 6. asset value
  await act("tab", "assets");
  await settle();
  await page.evaluate(() => assetForm());
  await settle();
  await page.fill("#f-aname", "Laptop");
  await typeInto("#f-aval", "245000");
  ok((await page.inputValue("#f-aval")) === "245,000", "asset value groups");
  await page.click('[data-act="asset-save"]');
  await settle();
  S = await state();
  ok(S.assets[0] && S.assets[0].value === 245000, "asset saved as 245000");

  // ---- 7. calculator: the display itself is unchanged, the result lands grouped
  await act("tab", "home");
  await settle();
  await page.click("#ring .cat");
  await settle();
  await page.click('[data-act="calc-toggle"][data-v="f-amt"]');
  for (const k of ["6", "5", "0", "+", "5", "8", "9", "3", "+", "6", "5", "3"])
    await page.click(`.calc [data-act="calc-key"][data-v="${k}"]`);
  ok((await page.textContent("#cm-f-amt")) === "650+5893+653", "calculator display is not regrouped while open");
  await page.click('#calc-f-amt [data-act="calc-kbd"]');
  await settle();
  ok(
    (await page.inputValue("#f-amt")) === "7,196",
    "calculator result shows as 7,196: " + (await page.inputValue("#f-amt"))
  );
  await page.keyboard.type("0");
  ok(
    (await page.inputValue("#f-amt")) === "71,960",
    "typing after it keeps grouping: " + (await page.inputValue("#f-amt"))
  );

  ok(errors.length === 0, "no page errors: " + JSON.stringify(errors));
  await browser.close();
  process.exitCode = fails ? 1 : 0;
})();
