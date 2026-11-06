// The calculator and the system keyboard never show together: focusing any field that isn't the calculator's own
// closes the calculator, "Add a fee" included (it used to focus the fee with the keypad still up, so Android's keyboard
// stacked over it). The fee field has its own calculator, which opens for the fee and closes the amount's. A tap on a
// field above the keypad must not close the form: the keypad closing shrinks the sheet under the finger, so the tap can
// end on the backdrop, which closes its layer only when the tap began on it.
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
outDir("43-calculator-keyboard");
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
      setWidget() {},
      setReminders() {},
      takeActions() {
        return "[]";
      },
      getColors() {
        return null;
      },
      setBars() {},
      requestNotifications() {},
      saveFile() {},
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  const settle = () => page.waitForTimeout(150);
  const click = async sel => {
    await page.click(sel);
    await page.waitForTimeout(320);
  };
  const t = await page.evaluate(() => today());
  const d5 = await page.evaluate(() => addDays(today(), -5));
  await page.evaluate(
    ([t, d5]) => {
      const o = migrate({
        v: 6,
        settings: { cur: "BDT", clock: "24", lastCheck: t, dragTip: true },
        accounts: [
          { id: "a", name: "Bank", type: "bank", currency: "BDT", opening: 10000 },
          { id: "c", name: "Cash", type: "cash", currency: "BDT", opening: 500 },
        ],
        txns: [
          {
            id: "ld",
            ts: 3,
            date: d5,
            type: "loan",
            amount: 2000,
            account: "a",
            note: "",
            dir: "out",
            loan: "L",
            principal: true,
          },
        ],
        loans: [{ id: "L", kind: "lend", person: "Rina", account: "a", date: d5, status: "open" }],
        assets: [],
      });
      localStorage.setItem("tally:v1", JSON.stringify(o));
    },
    [t, d5]
  );
  await page.reload();
  await settle();

  const snap = () =>
    page.evaluate(() => {
      const f = document.getElementById("f-fee");
      const vis = id => {
        const p = document.getElementById(id);
        return !!p && !p.hidden;
      };
      return {
        open: document.body.classList.contains("calcopen"),
        panelAmt: vis("calc-f-amt"),
        panelFee: vis("calc-f-fee"),
        feeFocus: !!f && document.activeElement === f,
        feeMode: f ? f.getAttribute("inputmode") : null,
        feeRO: f ? f.readOnly : null,
      };
    });

  // one run of the checks on a form that has "Add a fee"
  async function feeChecks(name) {
    await click('#sheet [data-act="calc-toggle"][data-v="f-amt"]');
    let s = await snap();
    ok(s.open && s.panelAmt, name + ": the amount's calculator is open");
    await click('#sheet [data-act="add-fee"]');
    s = await snap();
    ok(!s.open && !s.panelAmt && !s.panelFee, name + ": Add a fee closes the calculator (no keypad over the keyboard)");
    ok(s.feeFocus && s.feeMode === "decimal" && !s.feeRO, name + ": the fee is focused, with the system keyboard");
    ok(
      !!(await page.$('#sheet [data-act="calc-toggle"][data-v="f-fee"]')),
      name + ": the fee has its own calculator button"
    );
    await click('#sheet [data-act="calc-toggle"][data-v="f-amt"]');
    s = await snap();
    ok(s.open && s.panelAmt && !s.panelFee, name + ": the amount's calculator opens again");
    await click('#sheet [data-act="calc-toggle"][data-v="f-fee"]');
    s = await snap();
    ok(s.open && s.panelFee && !s.panelAmt, name + ": the fee's calculator opens and closes the amount's");
    ok(s.feeMode === "none" && s.feeRO && s.feeFocus, name + ": the fee shows no system keyboard while it is open");
    await page.click('#calc-f-fee [data-act="calc-key"][data-v="7"]');
    await page.click('#calc-f-fee [data-act="calc-key"][data-v="+"]');
    await page.click('#calc-f-fee [data-act="calc-key"][data-v="3"]');
    await click('#sheet [data-act="calc-kbd"][data-v="f-fee"]');
    s = await snap();
    ok(
      !s.open && (await page.inputValue("#f-fee")) === "10",
      name + ": the keyboard button works the sum out: " + (await page.inputValue("#f-fee"))
    );
    await click('#sheet [data-act="calc-toggle"][data-v="f-fee"]');
    await page.focus("#f-amt");
    s = await snap();
    ok(!s.open && !s.panelFee, name + ": focusing the amount closes the fee's calculator");
  }

  await page.evaluate(() => trSheet(null));
  await settle();
  await feeChecks("transfer");
  ok((await page.inputValue("#f-fee")) !== undefined, "transfer fee still readable");
  await page.evaluate(() => closeSheet());
  await settle();

  await page.evaluate(() => loanOpen("L"));
  await settle();
  await page.fill("#f-amt", "100");
  await feeChecks("loan payment");
  await page.evaluate(() => closeSheet());
  await settle();

  // any other field closes the calculator
  await page.evaluate(() => txSheet(null, "expense"));
  await settle();
  await click('#sheet [data-act="calc-toggle"][data-v="f-amt"]');
  ok((await snap()).open, "entry form: calculator open");
  const other = await page.evaluate(() => {
    const el = document.querySelector("#f-note");
    return el ? el.id : null;
  });
  ok(!!other, "entry form has another field: " + other);
  await page.focus("#" + other);
  ok(!(await snap()).open, "entry form: focusing another field closes the calculator");

  await page.evaluate(() => closeSheet());
  await page.waitForTimeout(150);

  // a tap on a field above the keypad (mouse and touch, phone size) keeps the form open and works the sum out
  for (const touch of [false, true]) {
    const c2 = await browser.newContext({
      viewport: { width: 412, height: 915 },
      locale: "en-US",
      hasTouch: touch,
      isMobile: touch,
    });
    await c2.addInitScript(() => {
      window.Android = {
        setWidget() {},
        setReminders() {},
        takeActions: () => "[]",
        getColors: () => null,
        setBars() {},
      };
    });
    const p2 = await c2.newPage();
    p2.on("pageerror", e => errors.push(e.message));
    await p2.goto(appUrl);
    await p2.evaluate(
      s => localStorage.setItem("tally:v1", s),
      await page.evaluate(() => localStorage.getItem("tally:v1"))
    );
    await p2.reload();
    await p2.waitForTimeout(200);
    const how = touch ? "touch" : "mouse";
    const tap = async sel => {
      const b = await (await p2.$(sel)).boundingBox();
      if (touch) await p2.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      else await p2.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await p2.waitForTimeout(350);
    };
    for (const [form, field] of [
      [() => txSheet(null, "expense"), "#f-payee"],
      [() => txSheet(null, "income"), "#f-payee"],
      [() => loanForm("lend"), "#f-person"],
    ]) {
      await p2.evaluate(form);
      await p2.waitForTimeout(400);
      await p2.evaluate(() => {
        const c = $('#sheet [data-act="f-cat"]');
        if (c) c.click();
      });
      await p2.waitForTimeout(200);
      await tap('#sheet [data-act="calc-toggle"][data-v="f-amt"]');
      for (const k of ["2", "5", "0", "+", "4", "0"]) await tap(`#calc-f-amt [data-act="calc-key"][data-v="${k}"]`);
      await tap(field);
      const r = await p2.evaluate(
        f => ({
          open: !!$("#sheet").innerHTML,
          focus: !!$(f) && document.activeElement === $(f),
          calc: document.body.classList.contains("calcopen"),
          amt: ($("#f-amt") || {}).value,
        }),
        field
      );
      ok(
        r.open && r.focus && !r.calc,
        how + ": tapping " + field + " with the keypad open keeps the form: " + JSON.stringify(r)
      );
      ok(r.amt === "290", how + ": and the sum is worked out: " + r.amt);
      await p2.evaluate(() => closeSheet());
      await p2.waitForTimeout(400);
    }
    // a tap on the backdrop itself still closes the form
    await p2.evaluate(() => txSheet(null, "expense"));
    await p2.waitForTimeout(400);
    if (touch) await p2.touchscreen.tap(200, 8);
    else await p2.mouse.click(200, 8);
    await p2.waitForTimeout(400);
    ok(!(await p2.evaluate(() => !!$("#sheet").innerHTML)), how + ": a tap on the backdrop still closes the form");
    await c2.close();
  }

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
