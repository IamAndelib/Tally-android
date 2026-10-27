// Payee (GitHub issue #32): "Paid to" beside the picked category on spending, "Received from" under the categories on
// money in; saved trimmed and only when filled, cleared on edit, kept by Undo and the low-balance question; earlier
// names offered as you type (any case or accents, Turkish İ too, same kind first, newest first); shown in lists as the
// entry's title; the CSV's last column; kept on spending and money in by migrate(), whose saves are version 7, so an
// older Tally warns before restoring a newer backup. The account chips fit three short names on a phone's row and
// keep their size when one is picked.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (o = {}, scale = 1) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: "en-US", ...o });
    await ctx.addInitScript(s => {
      window.__saved = [];
      window.Android = {
        fontScale: () => s,
        getColors: () => null,
        setBars() {},
        saveFile: (name, mime, text) => window.__saved.push({ name, mime, text }),
      };
    }, scale);
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      [
        ["a", "City Bank", "bank", 1000],
        ["b", "Bkash", "wallet", 5],
        ["c", "Wallet", "cash", 100],
      ].forEach(([id, name, type, opening]) =>
        S.accounts.push({ id, name, type, currency: "USD", opening, archived: false })
      );
      S.settings.lastAcc = "a";
      save();
      render();
    });
    return { ctx, page };
  };
  const rect = (page, sel) =>
    page.evaluate(s => {
      const r = $(s).getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width };
    }, sel);

  // ---- the form (a 393px-wide phone, like a Pixel or a Galaxy)
  {
    const { ctx, page } = await open({ viewport: { width: 393, height: 852 } });
    await page.evaluate(() => txSheet(null, "expense"));
    ok(
      await page.evaluate(() => $("#f-catrow").hidden),
      "before a category is picked, its row (and Paid to) is hidden"
    );
    await page.click('#sheet [data-act="f-cat"][data-v="food"]');
    const chip = await rect(page, "#f-catchip"),
      box = await rect(page, "#f-payee");
    ok(
      Math.abs(chip.t + (chip.b - chip.t) / 2 - (box.t + (box.b - box.t) / 2)) < 4 && box.l > chip.r,
      "Paid to sits beside the picked category"
    );
    ok(
      (await page.getAttribute("#f-payee", "placeholder")) === "Paid to" &&
        (await page.getAttribute("#f-payee", "aria-label")) === "Paid to",
      "its placeholder and label say Paid to"
    );
    // three short accounts on one row whichever is picked, and picking changes no chip's size or place
    const chips = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#sheet [data-act="f-acc"]')].map(c => {
          const r = c.getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.top), Math.round(r.width)].join(":");
        })
      );
    const before = await chips();
    ok(new Set(before.map(x => x.split(":")[1])).size === 1, "City Bank, Bkash and Wallet fit on one row: " + before);
    await page.click('#sheet [data-act="f-acc"][data-v="c"]');
    const after = await chips();
    ok(after.join() === before.join(), "picking a chip moves and resizes nothing: " + after);
    ok(
      await page.evaluate(() => {
        const on = $('#sheet [data-act="f-acc"][data-v="c"]'),
          off = $('#sheet [data-act="f-acc"][data-v="a"]'),
          shown = el => getComputedStyle(el).display !== "none";
        return (
          on.getAttribute("aria-pressed") === "true" &&
          shown(on.querySelector(".emb > .ic")) &&
          !shown(on.querySelector(".emb > svg:not(.ic)")) &&
          !shown(off.querySelector(".emb > .ic")) &&
          getComputedStyle(on, "::after").content === "none"
        );
      }),
      "the picked chip shows a check in its emblem instead of a ✓ after its name"
    );
    await ctx.close();
  }
  {
    const { ctx, page } = await open({}, 1.3);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => txSheet(null, "expense", "groceries"));
    const chip = await rect(page, "#f-catchip"),
      box = await rect(page, "#f-payee");
    ok(box.t >= chip.b - 1, "on a narrow screen with large text Paid to goes below the category");
    await page.evaluate(() => {
      closeSheet();
      txSheet(null, "income");
    });
    const grid = await rect(page, "#sheet .catgrid"),
      inBox = await rect(page, "#f-payee");
    ok(
      inBox.t >= grid.b && (await page.getAttribute("#f-payee", "placeholder")) === "Received from",
      "money in: Received from under the categories"
    );
    await ctx.close();
  }

  // ---- saving, editing, Undo, the low-balance question
  {
    const { ctx, page } = await open();
    const r = await page.evaluate(() => {
      const out = {};
      txSheet(null, "expense", "food");
      $("#f-amt").value = "12";
      $("#f-payee").value = "  Corner Shop  ";
      $("#f-note").value = "milk";
      saveTx();
      const t = S.txns[S.txns.length - 1];
      out.payee = t.payee;
      V.screen = "history";
      render();
      out.title = $(`#app [data-v="${t.id}"] .d`).textContent;
      txSheet(null, "expense", "food");
      $("#f-amt").value = "3";
      saveTx();
      out.empty = "payee" in S.txns[S.txns.length - 1];
      txSheet(t.id);
      out.prefill = $("#f-payee").value;
      $("#f-payee").value = "";
      saveTx();
      out.cleared = "payee" in S.txns.find(x => x.id === t.id);
      undoFn();
      out.undone = S.txns.find(x => x.id === t.id).payee;
      // the low-balance question: Save anyway keeps it, Go back saves nothing
      txSheet(null, "expense", "food");
      F.account = "b";
      $("#f-amt").value = "50";
      $("#f-payee").value = "Pharmacy";
      saveTx();
      $("#pop [data-act=ask-ok]").click();
      out.anyway = S.txns[S.txns.length - 1].payee;
      const n = S.txns.length;
      txSheet(null, "expense", "food");
      F.account = "b";
      $("#f-amt").value = "50";
      $("#f-payee").value = "Bakery";
      saveTx();
      $("#pop [data-act=pd-close]").click();
      out.goBack = S.txns.length - n;
      return out;
    });
    ok(r.payee === "Corner Shop", "saved trimmed: " + r.payee);
    ok(r.title === "Corner Shop · milk", "the list shows payee and note: " + r.title);
    ok(!r.empty, "an empty box stores nothing");
    ok(r.prefill === "Corner Shop", "editing shows it");
    ok(!r.cleared, "cleared on edit, it's gone");
    ok(r.undone === "Corner Shop", "Undo brings it back");
    ok(r.anyway === "Pharmacy" && r.goBack === 0, "the low-balance question keeps it or saves nothing");
    // CSV: the last column, guarded against formulas
    const csv = await page.evaluate(() => {
      S.txns.push({ id: "z", ts: 9, type: "expense", amount: 1, account: "a", cat: "food", date: today(), note: "" });
      S.txns.push({
        id: "y",
        ts: 10,
        type: "income",
        amount: 2,
        account: "a",
        cat: "income",
        date: today(),
        note: "",
        payee: "=cmd",
      });
      exportCsv();
      return window.__saved[window.__saved.length - 1].text.split("\n");
    });
    ok(csv[0].endsWith(",person,payee"), "the CSV's last column is payee");
    ok(
      csv.some(l => l.endsWith(',"Pharmacy"')) && csv.some(l => l.endsWith(',"\'=cmd"')),
      "payees in the CSV, a formula guarded"
    );
    await ctx.close();
  }

  // ---- suggestions
  {
    const { ctx, page } = await open({ locale: "tr-TR", uiLang: "tr" });
    const r = await page.evaluate(() => {
      const d = n => addDays(today(), n),
        e = (id, type, payee, date, ts) =>
          S.txns.push({
            id,
            ts,
            type,
            amount: 1,
            account: "a",
            cat: type === "income" ? "income" : "food",
            date,
            note: "",
            payee,
          });
      e("1", "expense", "İstanbul Market", d(-5), 1);
      e("2", "expense", "istanbul cafe", d(-3), 2);
      e("3", "expense", "ISTANBUL Cafe", d(-1), 3);
      e("4", "income", "Istanbul Office", d(0), 4);
      e("5", "expense", "Corner Shop", d(0), 5);
      commit();
      txSheet(null, "expense", "food");
      const sug = q => {
        $("#f-payee").value = q;
        $("#f-payee").dispatchEvent(new Event("input", { bubbles: true }));
        return [...document.querySelectorAll("#f-payee-sug .chip")].map(c => c.textContent);
      };
      return { ist: sug("ist"), caf: sug("caf"), exact: sug("corner shop"), none: sug("") };
    });
    ok(
      r.ist.join("|") === "ISTANBUL Cafe|İstanbul Market|Istanbul Office",
      "any case or accents, once each in its newest spelling, spending first, newest first: " + r.ist
    );
    ok(r.caf.join("|") === "ISTANBUL Cafe", "a word of the name matches too: " + r.caf);
    ok(!r.exact.length && !r.none.length, "nothing offered for a name typed out in full, or nothing typed");
    await page.fill("#f-payee", "cor");
    await page.click("#f-payee-sug .chip");
    ok(
      (await page.inputValue("#f-payee")) === "Corner Shop" && (await page.evaluate(() => $("#f-payee-sug").hidden)),
      "a tap fills the box"
    );
    // a big notebook: the first letter stays quick
    const ms = await page.evaluate(() => {
      for (let i = 0; i < 20000; i++)
        S.txns.push({
          id: "p" + i,
          ts: i,
          type: "expense",
          amount: 1,
          account: "a",
          cat: "food",
          date: addDays(today(), -(i % 300)),
          note: "",
          payee: "Shop " + (i % 2000),
        });
      closeSheet();
      txSheet(null, "expense", "food");
      const t0 = performance.now();
      $("#f-payee").value = "sh";
      $("#f-payee").dispatchEvent(new Event("input", { bubbles: true }));
      return performance.now() - t0;
    });
    ok(ms < 300, "with 20,000 entries the suggestions take " + Math.round(ms) + " ms");
    await ctx.close();
  }

  // ---- migrate and the backup's version
  {
    const { ctx, page } = await open();
    const r = await page.evaluate(() => {
      const t = today(),
        n = migrate({
          v: 7,
          accounts: [{ id: "a", name: "A", type: "cash", currency: "USD", opening: 0 }],
          txns: [
            { id: "1", ts: 1, date: t, type: "expense", amount: 1, account: "a", cat: "food", payee: " Shop " },
            { id: "2", ts: 2, date: t, type: "income", amount: 1, account: "a", cat: "income", payee: 42 },
            { id: "3", ts: 3, date: t, type: "expense", amount: 1, account: "a", cat: "food", payee: { x: 1 } },
            { id: "4", ts: 4, date: t, type: "adjust", amount: 1, account: "a", payee: "X" },
            { id: "5", ts: 5, date: t, type: "expense", amount: 1, account: "a", cat: "food", payee: "   " },
          ],
        });
      const p = id => n.txns.find(x => x.id === id).payee;
      return { v: n.v, p1: p("1"), p2: p("2"), p3: p("3"), p4: p("4"), p5: p("5") };
    });
    ok(r.v === 7, "saves are version 7");
    ok(r.p1 === " Shop " && r.p2 === "42", "a payee is kept as written on spending and money in");
    ok(r.p3 === undefined && r.p4 === undefined && r.p5 === undefined, "none kept that isn't text, on a fix, or blank");
    const q = async v => {
      await page.evaluate(v => {
        closePop();
        restoreText(JSON.stringify({ v, accounts: [], txns: [] }));
      }, v);
      return (await page.textContent("#pop")).includes("newer version");
    };
    ok(!(await q(7)) && (await q(8)), "a version 8 backup is newer, a 7 isn't");
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
