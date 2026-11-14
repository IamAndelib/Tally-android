// A transfer's fee (its transfer charge) comes off the paying account and is spending in Charges, never under a
// category: in the ring's figure (not on a category's tile), the day's total, the summaries and the widget, while the
// transfer itself never counts. History shows it with its transfer, not under a category, whatever the built-in "fees"
// category was renamed to (the reported case: "Food").
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("26-transfer-fee");
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
    window.__w = [];
    window.Android = {
      setWidget(j) {
        window.__w.push(JSON.parse(j));
      },
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
  const y = await page.evaluate(() => addDays(today(), -1));
  /* the reported notebook: the built-in "fees" category turned into "Food" */
  await page.evaluate(
    ([t, y]) => {
      const o = migrate({
        v: 6,
        settings: { cur: "BDT", clock: "24", lastCheck: y, dragTip: true },
        accounts: [
          { id: "a", name: "City Bank", type: "bank", currency: "BDT", opening: 120000 },
          { id: "b", name: "Brac Joint", type: "bank", currency: "BDT", opening: 45000 },
        ],
        txns: [{ id: "e1", ts: 1, date: t, type: "expense", amount: 50, account: "a", cat: "groceries", note: "" }],
      });
      Object.assign(
        o.cats.find(c => c.id === "fees"),
        { name: "Food", i: "restaurant", c: "#c98500" }
      );
      localStorage.setItem("tally:v1", JSON.stringify(o));
    },
    [t, y]
  );
  await page.reload();
  await settle();

  // ---- 1. a transfer of 20,000 with a 10 fee
  await page.click('[data-act="tr-new"]');
  await settle();
  await page.click('#sheet [data-act="tr-to"][data-v="b"]');
  await page.fill("#f-amt", "20000");
  /* the form's previews as a person sees them: [where, text], only the ones on screen */
  const previews = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#sheet .aoline, #sheet .aoprev")]
        .filter(e => e.offsetParent && e.textContent.trim())
        .map(e => [
          e.closest(".aocard") ? "card" : "line",
          e.textContent
            .replace(/\u2060/g, "")
            .replace(/\s+/g, " ")
            .trim(),
        ])
    );
  let pv = await previews();
  ok(
    pv.length === 1 &&
      pv[0][0] === "line" &&
      /^City Bank −\S*20,000\.00 · Brac Joint \+\S*20,000\.00$/.test(pv[0][1].replace(/BDT /g, "BDT")),
    "without a charge, the line under the amount (no arrow): " + JSON.stringify(pv)
  );
  ok(
    await page.evaluate(() => {
      const l = $("#sheet .aoline"),
        a = $("#sheet .amtwrap");
      return (
        !!l &&
        !!a &&
        l.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 1 &&
        !!l.querySelector(".adot")
      );
    }),
    "the line sits under the amount, each account with its dot"
  );
  const add = '#sheet [data-act="addon-add"][data-v="xcharge"]';
  ok((await page.textContent(add)).trim() === "Transfer charge", "the button: + Transfer charge");
  ok(!(await page.$('#sheet [data-act="add-fee"]')), "no old Add a fee button on the transfer form");
  await page.click(add);
  await settle();
  const st = await page.evaluate(() => ({
    focus: document.activeElement && document.activeElement.id,
    calc: document.body.classList.contains("calcopen"),
    mode: $("#f-charge").getAttribute("inputmode"),
    btn: !!$('#sheet [data-act="addon-add"][data-v="xcharge"]').offsetParent,
    label: $("#sheet .aocard .aol").textContent,
    cur: $("#sheet .aocard .aocur").textContent,
  }));
  ok(
    st.focus === "f-charge" && !st.calc && st.mode === "decimal" && !st.btn,
    "+ Transfer charge opens the card, its field focused with no keypad, the button gone " + JSON.stringify(st)
  );
  ok(st.label === "Transfer charge" && st.cur === "BDT", "the card: Transfer charge, BDT before the figure");
  await page.fill("#f-charge", "10");
  pv = await previews();
  ok(
    pv.length === 1 &&
      pv[0][0] === "card" &&
      /City Bank −\S*20,010\.00 · Brac Joint \+\S*20,000\.00/.test(pv[0][1].replace(/BDT /g, "BDT")),
    "the line moves into the card, counting the charge, never twice: " + JSON.stringify(pv)
  );
  await page.click('#sheet [data-act="addon-remove"][data-v="xcharge"]');
  await settle();
  pv = await previews();
  ok(
    pv.length === 1 && pv[0][0] === "line" && pv[0][1].includes("20,000.00") && !pv[0][1].includes("20,010"),
    "✕ closes the card and the line comes back: " + JSON.stringify(pv)
  );
  ok(
    await page.evaluate(
      () =>
        !!$('#sheet [data-act="addon-add"][data-v="xcharge"]').offsetParent &&
        document.activeElement === $('#sheet [data-act="addon-add"][data-v="xcharge"]') &&
        !$("#sheet .aocard").offsetParent &&
        $("#f-charge").value === ""
    ),
    "the button comes back with the focus, the card gone and emptied"
  );
  await page.click(add);
  await page.fill("#f-charge", "10");
  /* the code follows From */
  await page.evaluate(() => {
    S.accounts.push({ id: "u", name: "Dollar account", type: "bank", currency: "USD", opening: 0 });
    trPickFrom("u");
  });
  ok((await page.textContent("#sheet .aocard .aocur")) === "USD", "the card's code follows From");
  await page.evaluate(() => {
    trPickFrom("a");
    S.accounts.pop();
  });
  ok((await page.textContent("#sheet .aocard .aocur")) === "BDT", "and back");
  await page.click('#sheet [data-act="tr-save"]');
  await page.waitForTimeout(350);
  const bal = await page.evaluate(() => balances());
  ok(bal.a === 99940 && bal.b === 65000, "City Bank −20,010 (and the 50), Brac Joint +20,000 " + JSON.stringify(bal));
  const S = await state(),
    fee = S.txns.find(x => x.feeOf),
    tr = S.txns.find(x => x.type === "transfer");
  ok(fee && fee.amount === 10 && fee.account === "a" && tr.feeId === fee.id, "the fee is linked to its transfer");
  const ed = await page.evaluate(id => {
    trSheet(id);
    const r = {
      card: !!$("#sheet .aocard").offsetParent,
      v: $("#f-charge").value,
      btn: !!$('#sheet [data-act="addon-add"]').offsetParent,
      prev: $("#sheet .aocard .aoprev")
        .textContent.replace(/\u2060/g, "")
        .replace(/\s+/g, " "),
    };
    closeSheet();
    return r;
  }, tr.id);
  ok(
    ed.card && ed.v === "10.00" && !ed.btn && /20,010\.00/.test(ed.prev),
    "editing the transfer: its card open from the start, with its preview " + JSON.stringify(ed)
  );

  // ---- 2. spending in Charges, under no category: the ring, the day's total, the summary, the widget
  const ring = await page.evaluate(() =>
    [...document.querySelectorAll(".rt .cp")].map(e => e.textContent).filter(Boolean)
  );
  ok(
    ring.length === 1 && ring[0] === "83%",
    "only the groceries have a tile: 50 of the 60 spent " + JSON.stringify(ring)
  );
  ok((await page.textContent(".dcenter")).includes("60"), "spent today: 60, the fee in it");
  const foodTile = await page.evaluate(() => {
    const b = document.querySelector('.rt [data-v="fees"] .cp');
    return b ? b.textContent : "";
  });
  ok(foodTile === "", "nothing under Food");
  const w = await page.evaluate(() => window.__w[window.__w.length - 1]);
  ok(w && /60\.00/.test(w.spent), "widget: spent today 60 " + (w && w.spent));
  const sm = await page.evaluate(() => {
    summarySheet();
    const v = smBuckets().map(b => b.v);
    closeSheet();
    return v;
  });
  ok(sm[sm.length - 1] === 60, "summary: today 60 " + JSON.stringify(sm.slice(-3)));

  // ---- 3. History: the fee with its transfer, not a category's spending
  await page.evaluate(() => {
    V.screen = "history";
    render();
  });
  await settle();
  const row = (await page.textContent(`[data-v="${tr.id}"]`)).replace(/\s+/g, " ");
  ok(
    /City Bank.*→.*Brac Joint/.test(row) && /\+ .*10\.00 transfer charge/.test(row) && !row.includes("Food"),
    "History: the transfer row, with its transfer charge under the amount: " + row
  );
  ok(!(await page.$(`[data-v="${fee.id}"]`)), "the fee has no row of its own");
  const day = (await page.textContent("#app .day")).replace(/\s+/g, " ");
  ok(day.includes("60.00") && !day.includes("50.00"), "the day's spent counts the fee, inside it: " + day);
  await page.screenshot({ path: OUT + "/history.png" });
  await page.click(`[data-v="${tr.id}"]`);
  await page.click('#app .txo [data-act="tx-open"]');
  await settle();
  ok(await page.evaluate(() => F && F.kind === "tr"), "tapping Edit opens the transfer");
  await page.evaluate(() => closeSheet());

  // ---- 4. saved data: a fee whose transfer is gone is plain spending; a transfer whose fee is gone has none
  const m = await page.evaluate(t => {
    const o = migrate({
      v: 6,
      settings: { cur: "BDT" },
      accounts: [
        { id: "a", name: "A", type: "bank", currency: "BDT", opening: 100 },
        { id: "b", name: "B", type: "bank", currency: "BDT", opening: 0 },
      ],
      txns: [
        { id: "f1", ts: 1, date: t, type: "expense", amount: 5, account: "a", cat: "fees", feeOf: "gone" },
        { id: "t2", ts: 1, date: t, type: "transfer", amount: 10, account: "a", to: "b", feeId: "gone" },
      ],
    });
    return [!("feeOf" in o.txns[0]), !("feeId" in o.txns[1]), o.txns.length];
  }, t);
  ok(m[0] && m[1] && m[2] === 2, "dangling links dropped, entries kept " + JSON.stringify(m));

  // ---- 5. updating from 1.3.1: a notebook exactly as 1.3.1 saved it (made by 1.3.1's own transfer sheet, its "Fees"
  // slot renamed "Food"; 1.3.1 counted the fee as 10 of 60 spent, under Food). Its fee is spending in Charges, never
  // under Food, with nothing to sort out by hand, and the stored entries stay exactly as they were.
  const saved131 = {
    v: 6,
    settings: {
      cur: "BDT",
      week: 1,
      clock: "24",
      theme: "system",
      haptics: true,
      hapticLevel: 3,
      donut: "both",
      remind: { daily: true, time: "21:00", dues: true, dueTime: "09:00", check: true, checkTime: "08:00" },
      backup: { on: false, time: "23:00" },
      customCols: [],
      dragTip: true,
      hiddenCols: [],
      hiddenTypes: [],
      lastCheck: "2026-10-16",
      lastAcc: "a",
    },
    accounts: [
      {
        id: "a",
        name: "City Bank",
        type: "bank",
        currency: "BDT",
        opening: 120000,
        archived: false,
        i: "",
        e: "",
        c: "",
      },
      {
        id: "b",
        name: "Brac Joint",
        type: "bank",
        currency: "BDT",
        opening: 45000,
        archived: false,
        i: "",
        e: "",
        c: "",
      },
    ],
    types: [],
    cats: [
      { id: "groceries", name: "Groceries", e: "🛒", c: "#15a06f", i: "shopping_cart", kind: "out", hidden: false },
      { id: "food", name: "Eating out", e: "🍔", c: "#c98500", i: "restaurant", kind: "out", hidden: false },
      { id: "transport", name: "Transport", e: "🚌", c: "#0a91b8", i: "directions_bus", kind: "out", hidden: false },
      { id: "housing", name: "Rent", e: "🏠", c: "#7c9a0d", i: "home", kind: "out", hidden: false },
      { id: "bills", name: "Bills", e: "📱", c: "#a646c9", i: "receipt_long", kind: "out", hidden: false },
      { id: "shopping", name: "Shopping", e: "🛍️", c: "#e0578c", i: "shopping_bag", kind: "out", hidden: false },
      { id: "education", name: "Study", e: "📚", c: "#4b5fd6", i: "school", kind: "out", hidden: false },
      { id: "health", name: "Health", e: "💊", c: "#e0504f", i: "medication", kind: "out", hidden: false },
      { id: "fun", name: "Fun", e: "🎬", c: "#2a78d6", i: "movie", kind: "out", hidden: false },
      { id: "family", name: "Family", e: "🎁", c: "#df5f2b", i: "family_restroom", kind: "out", hidden: false },
      { id: "fees", name: "Food", e: "🏦", c: "#c98500", i: "restaurant", kind: "out", hidden: false },
      { id: "other", name: "Other", e: "🧾", c: "#b0671f", i: "category", kind: "out", hidden: false },
      { id: "income", name: "Income", e: "💰", c: "#15a06f", i: "payments", kind: "in", hidden: false },
      { id: "gift", name: "Gift", e: "🎁", c: "#e0578c", i: "redeem", kind: "in", hidden: false },
      { id: "otherin", name: "Other", e: "➕", c: "#5f7389", i: "add_circle", kind: "in", hidden: false },
    ],
    txns: [
      {
        id: "9lk97fyx8yjr",
        ts: 1792152369639,
        type: "transfer",
        amount: 20000,
        account: "a",
        to: "b",
        date: "2026-10-16",
        note: "",
        feeId: "4a1u7d6x8yjr",
      },
      {
        id: "4a1u7d6x8yjr",
        ts: 1792152369639,
        type: "expense",
        amount: 10,
        account: "a",
        cat: "fees",
        date: "2026-10-16",
        note: "Transfer fee",
        feeOf: "9lk97fyx8yjr",
      },
      {
        id: "c5zetmox8z6g",
        ts: 1792152370456,
        type: "expense",
        amount: 50,
        account: "a",
        cat: "groceries",
        date: "2026-10-16",
        note: "",
      },
    ],
    loans: [],
    assets: [],
  };
  await page.evaluate(
    ([o, t]) => {
      o.txns.forEach(x => (x.date = t));
      o.settings.lastCheck = t;
      localStorage.setItem("tally:v1", JSON.stringify(o));
    },
    [saved131, t]
  );
  await page.reload();
  await settle();
  const up = await page.evaluate(() => ({
    bal: balances(),
    centre: document.querySelector(".dcenter").textContent,
    ring: [...document.querySelectorAll("#ring .cp")]
      .filter(e => e.textContent)
      .map(e => e.closest("[data-v]").dataset.v + " " + e.textContent),
  }));
  ok(up.bal.a === 99940 && up.bal.b === 65000, "after the update: balances as before " + JSON.stringify(up.bal));
  const upCat = await page.evaluate(() => [S.v, S.cats.find(c => c.id === "fees")]);
  ok(
    upCat[0] === 8 && upCat[1] && upCat[1].name === "Food" && !upCat[1].hidden,
    "after the update: version 8, the renamed Fees category kept as it was " + JSON.stringify(upCat)
  );
  ok(
    /60\.00/.test(up.centre) && JSON.stringify(up.ring) === '["groceries 83%"]',
    "after the update: spent 60, the fee in Charges, only Groceries has a tile, nothing under Food " +
      JSON.stringify(up)
  );
  await page.evaluate(() => {
    V.screen = "history";
    render();
  });
  await settle();
  const oldFee = saved131.txns.find(x => x.feeOf);
  const upRow = (await page.textContent(`[data-v="${saved131.txns.find(x => x.type === "transfer").id}"]`)).replace(
    /\s+/g,
    " "
  );
  ok(
    /City Bank.*→.*Brac Joint/.test(upRow) && /\+ .*transfer charge/.test(upRow) && !upRow.includes("Food"),
    "after the update, History: " + upRow
  );
  ok((await page.textContent("#app .day")).includes("60.00"), "the day's spent is 50 and the 10 fee");
  const kept = await page.evaluate(id => S.txns.find(x => x.id === id), oldFee.id);
  const changed = Object.keys(oldFee).filter(k => k !== "date" && kept[k] !== oldFee[k]);
  ok(
    changed.length === 0 && Object.keys(kept).length === Object.keys(oldFee).length,
    "the saved fee entry itself is unchanged (an older version still reads it) " + JSON.stringify(kept)
  );

  // ---- 6. the card's checks: not a number, negative, and an empty or 0 card saves no charge
  const chk = await page.evaluate(() => {
    const out = [];
    const tryIt = v => {
      trSheet();
      $("#f-amt").value = "100";
      $('#sheet [data-act="addon-add"][data-v="xcharge"]').click();
      $("#f-charge").value = v;
      const n = S.txns.length;
      saveTr();
      out.push([v, ($("#snack") || {}).textContent || "", S.txns.length - n]);
      closeSheet();
    };
    ["5×", "−5", "0", "", "0.001"].forEach(tryIt);
    return out;
  });
  ok(chk[0][1].includes("That charge isn't a number") && chk[0][2] === 0, "not a number: " + JSON.stringify(chk[0]));
  ok(chk[1][1].includes("A charge can't be negative") && chk[1][2] === 0, "negative: " + JSON.stringify(chk[1]));
  ok(
    chk[2][2] === 1 && chk[3][2] === 1 && chk[4][2] === 1,
    "a 0, an empty card, or one that shows as 0 saves the transfer alone " + JSON.stringify(chk.slice(2))
  );

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
