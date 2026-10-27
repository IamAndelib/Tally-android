// Add category / Add account from the entry form: the dashed tile ends the categories (spending and money in) and the
// dashed chip ends the accounts; each opens Settings' own form, and the entry form comes back with everything typed
// (amount as shown, note, payee, picked date, account, category) and the new one picked, or as it was when the form is
// closed unsaved (✕, Back, a tap outside). The 24-category limit holds; no Add account where only one currency will do;
// an entry opened from the entries list still goes back to it; "today" still moves at midnight. The category name box
// gives an example for its kind.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (o = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US", ...o });
    await ctx.addInitScript(() => {
      window.Android = { getColors: () => null, setBars() {} };
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1000, archived: false });
      S.accounts.push({ id: "b", name: "Cash", type: "cash", currency: "USD", opening: 500, archived: false });
      save();
      render();
    });
    return { ctx, page };
  };
  const form = page =>
    page.evaluate(() => ({
      h2: ($("#sheet h2") || {}).textContent,
      cat: F && F.cat,
      account: F && F.account,
      amt: ($("#f-amt") || {}).value,
      note: ($("#f-note") || {}).value,
      payee: ($("#f-payee") || {}).value,
      date: ($("#f-date") || { dataset: {} }).dataset.v,
      now: !!($("#f-date") || { dataset: {} }).dataset.now,
      grid: $("#f-catgrid") ? $("#f-catgrid").hidden : null,
      cur: ($("#amt-cur") || {}).textContent,
    }));
  const fill = page =>
    page.evaluate(() => {
      txSheet(null, "expense", "food");
      $("#f-amt").value = "1,234.5";
      $("#f-note").value = "lunch";
      $("#f-payee").value = "Cafe";
      pickAccount("b");
      setDateField($("#f-date"), addDays(today(), -1));
    });

  // ---- spending: add a category, saved
  {
    const { ctx, page } = await open();
    await page.evaluate(() => txSheet(null, "expense"));
    ok(
      (await page.textContent('#f-catgrid [data-act="f-cat-new"]')).includes("Add") &&
        !!(await page.$('#sheet .chips [data-act="f-acc-new"]')),
      "the dashed Add tile ends the categories, Add account ends the accounts"
    );
    await page.evaluate(() => closeSheet());
    await fill(page);
    await page.evaluate(() => $("#f-catchip").click());
    await page.click('#f-catgrid [data-act="f-cat-new"]');
    ok(
      (await page.textContent("#sheet h2")) === "New spending category" &&
        (await page.getAttribute("#f-cname", "placeholder")) === "e.g. Pets, Gym",
      "Settings' own form opens, with a spending example"
    );
    await page.fill("#f-cname", "Pets");
    await page.click('#sheet [data-act="cat-save"]');
    const f = await form(page);
    const c = await page.evaluate(() => S.cats.find(x => x.name === "Pets"));
    ok(c && c.kind === "out" && f.cat === c.id && f.grid === true, "back on the entry with Pets picked: " + f.cat);
    ok(
      f.amt === "1,234.5" &&
        f.note === "lunch" &&
        f.payee === "Cafe" &&
        f.account === "b" &&
        f.date === (await page.evaluate(() => addDays(today(), -1))) &&
        !f.now,
      "everything typed is kept: " + JSON.stringify(f)
    );
    await page.waitForTimeout(350); // a tap right after the swap would be taken for a double tap
    await page.click('#sheet [data-act="tx-save"]');
    await page.click('#pop [data-act="ask-ok"]'); // more than Cash holds: Save anyway
    const t = await page.evaluate(() => S.txns[S.txns.length - 1]);
    ok(t && t.amount === 1234.5 && t.cat === c.id && t.payee === "Cafe", "and it saves");
    await ctx.close();
  }

  // ---- closed without saving: ✕, Back, a tap outside
  {
    const { ctx, page } = await open();
    for (const how of ["close", "back", "outside"]) {
      await fill(page);
      const n = await page.evaluate(() => S.cats.length);
      await page.evaluate(() => txQuickAdd("cat"));
      if (how === "close") await page.click('#sheet [data-act="close"]');
      else if (how === "back") await page.evaluate(() => goBack());
      else await page.mouse.click(200, 20);
      await page.waitForTimeout(50);
      const f = await form(page);
      ok(
        f.h2 === "Spent" && f.cat === "food" && f.amt === "1,234.5" && f.payee === "Cafe" && f.account === "b",
        how + ": back on the entry as it was: " + JSON.stringify(f)
      );
      ok((await page.evaluate(() => S.cats.length)) === n, how + ": no category added");
      await page.evaluate(() => closeSheet());
    }
    await ctx.close();
  }

  // ---- the limit, money in, accounts
  {
    const { ctx, page } = await open();
    const r = await page.evaluate(() => {
      for (let i = outCats().length; i < 24; i++)
        S.cats.push({ id: "x" + i, name: "X" + i, e: "🏷️", c: "#888888", kind: "out" });
      txSheet(null, "expense");
      $('#f-catgrid [data-act="f-cat-new"]').click();
      return { h2: $("#sheet h2").textContent, snack: $("#snack").textContent };
    });
    ok(r.h2 === "Spent" && r.snack.includes("24"), "at 24 spending categories it says so and stays: " + r.snack);
    await page.evaluate(() => {
      closeSheet();
      txSheet(null, "income");
      $("#f-amt").value = "50";
    });
    await page.click('#sheet .catgrid [data-act="f-cat-new"]');
    ok((await page.getAttribute("#f-cname", "placeholder")) === "e.g. Freelance, Refunds", "money in: its own example");
    await page.fill("#f-cname", "Freelance");
    await page.click('#sheet [data-act="cat-save"]');
    const f = await form(page);
    const c = await page.evaluate(() => S.cats.find(x => x.name === "Freelance"));
    ok(c && c.kind === "in" && f.cat === c.id && f.amt === "50", "money in: a money-in category, picked");
    // Add account: picked, in its own currency
    await page.click('#sheet [data-act="f-acc-new"]');
    ok((await page.textContent("#sheet h2")) === "New account", "Add account opens the account form");
    await page.fill("#f-name", "Euro card");
    await page.evaluate(() => {
      F.cur = "EUR";
      $("#f-cur span").textContent = "EUR";
    });
    await page.click('#sheet [data-act="acc-save"]');
    const g = await form(page);
    const a = await page.evaluate(() => S.accounts.find(x => x.name === "Euro card"));
    ok(a && g.account === a.id && g.cur === "EUR" && g.cat === c.id, "back with the new account picked: " + g.cur);
    await ctx.close();
  }

  // ---- from the entries list; an over-repaid lending's extra; today at midnight; German numbers
  {
    const { ctx, page } = await open({ locale: "de-DE" });
    const r = await page.evaluate(() => {
      S.txns.push({ id: "e1", ts: 1, type: "expense", amount: 5, account: "a", cat: "food", date: today(), note: "" });
      commit();
      entriesSheet();
      openEntry("e1");
      $("#f-amt").value = "1.234,5";
      txQuickAdd("acc");
      $("#f-name").value = "Wallet";
      saveAccount();
      const out = { amt: $("#f-amt").value, account: acc(F.account).name };
      closeSheet();
      return out;
    });
    await page.waitForTimeout(50);
    ok(r.amt === "1.234,5" && r.account === "Wallet", "German numbers kept as shown: " + r.amt);
    ok(!!(await page.$("#sheet #ent-list")), "closing the entry still goes back to the entries list");
    const p = await page.evaluate(() => {
      closeSheet();
      txSheet(null, "income", null, { amount: 5, cur: "USD", account: "a", date: today(), note: "x" });
      return !!$('#sheet [data-act="f-acc-new"]');
    });
    ok(!p, "no Add account where only one currency will do");
    const m = await page.evaluate(() => {
      closeSheet();
      txSheet(null, "expense", "food");
      txQuickAdd("cat");
      closeSheet();
      return new Promise(res =>
        setTimeout(() => {
          const d = $("#f-date");
          res(!!(d && d.dataset.now));
        }, 20)
      );
    });
    ok(m, "an untouched date is still today's, to move at midnight");
    await ctx.close();
  }

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
