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
    await page.click("#f-catchip"); // money in has the same category chip as spending: the grid opens from it
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

  // ---- design round, task 9: forms and small marks
  {
    const { ctx, page } = await open();
    // Received uses Spent's category control: the chip (Income ▾) opens the grid; picking closes it and says the pick
    await page.evaluate(() => txSheet(null, "income"));
    const r = await page.evaluate(() => ({
      chip: $("#f-catchip").textContent.trim(),
      expanded: $("#f-catchip").getAttribute("aria-expanded"),
      gridHidden: $("#f-catgrid").hidden,
      payee: $("#f-payee").placeholder,
      payeeInRow: !!$("#f-catrow #f-payee"),
    }));
    ok(
      r.chip === "Income" && r.gridHidden && r.expanded === "false",
      "Received: the chip says Income, the grid is closed"
    );
    ok(r.payee === "Received from" && r.payeeInRow, "Received: 'Received from' sits next to the chip");
    await page.click("#f-catchip");
    ok(!(await page.evaluate(() => $("#f-catgrid").hidden)), "Received: the chip opens the grid");
    await page.evaluate(() => $('#f-catgrid [data-act="f-cat"]:not([aria-pressed="true"])').click());
    const r2 = await page.evaluate(() => ({
      gridHidden: $("#f-catgrid").hidden,
      chip: $("#f-catchip").textContent.trim(),
      cat: F.cat,
    }));
    ok(
      r2.gridHidden && r2.cat && r2.chip !== "Income",
      "Received: picking another category closes the grid and shows it on the chip"
    );
    // quick add and a typed payee still work
    await page.fill("#f-payee", "Employer");
    await page.fill("#f-amt", "10");
    await page.click('#sheet [data-act="tx-save"]');
    const saved = await page.evaluate(() => S.txns.filter(t => t.type === "income").map(t => t.payee + "|" + t.amount));
    ok(saved.join() === "Employer|10", "Received: saved with its payee " + saved);

    // one note style on every form: a field with no label, the placeholder "Note (optional)", the name "Note"
    const forms = {
      spent: () => txSheet(null, "expense"),
      received: () => txSheet(null, "income"),
      transfer: () => trSheet(),
      lend: () => loanForm("lend"),
      borrow: () => loanForm("borrow"),
    };
    for (const [k, open1] of Object.entries(forms)) {
      await page.evaluate(open1);
      const n = await page.evaluate(() => {
        const el = $("#sheet #f-note");
        return (
          el && {
            ph: el.placeholder,
            name: el.getAttribute("aria-label"),
            label: !!(el.closest("label") && el.closest("label").querySelector("span")),
            lbl:
              !!$("#sheet .lbl") &&
              [...document.querySelectorAll("#sheet .lbl")].some(l => /^Note/.test(l.textContent)),
          }
        );
      });
      ok(
        n && n.ph === "Note (optional)" && n.name === "Note" && !n.label && !n.lbl,
        k + ": the note is one unlabelled field " + JSON.stringify(n)
      );
      await page.evaluate(() => closeSheet());
    }

    // a picked account is tinted in its own colour (alpha of the account's colour), the ✓ stays, text stays AA
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => {
        S.accounts[0].c = "#8E24AA";
        txSheet(null, "expense");
      });
      const t = await page.evaluate(() => {
        const on = $('#sheet [data-act="f-acc"][aria-pressed="true"]'),
          off = $('#sheet [data-act="f-acc"][aria-pressed="false"]');
        const cs = getComputedStyle(on);
        const m = cs.backgroundColor.match(/[\d.]+/g).map(Number);
        let sheet = "rgb(255,255,255)";
        for (let n = on.parentElement; n; n = n.parentElement) {
          const b = getComputedStyle(n).backgroundColor;
          if (b !== "rgba(0, 0, 0, 0)" && b !== "transparent") {
            sheet = b;
            break;
          }
        }
        return {
          bg: m,
          offBg: getComputedStyle(off).backgroundColor,
          fg: cs.color,
          tick: !!on.querySelector(".emb .ic"),
          page: sheet,
        };
      });
      const lum = c => {
        const f = v => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      const surf = t.page.match(/[\d.]+/g).map(Number);
      const a = t.bg[3] == null ? 1 : t.bg[3];
      const mix = [0, 1, 2].map(i => t.bg[i] * a + surf[i] * (1 - a));
      const fg = t.fg.match(/[\d.]+/g).map(Number);
      const L1 = lum(mix),
        L2 = lum(fg);
      const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      ok(
        t.bg[0] === 142 && t.bg[1] === 36 && t.bg[2] === 170 && a > 0.1 && a < 0.6,
        scheme + ": the picked account chip is tinted in its colour " + t.bg
      );
      ok(t.tick, scheme + ": the picked chip keeps its check");
      ok(cr >= 4.5, scheme + ": the tinted chip's text passes AA (" + cr.toFixed(1) + ":1)");
      await page.evaluate(() => closeSheet());
    }
    // very light custom colours: the text over the tint still passes AA in both themes, in a form and in Filters
    for (const scheme of ["light", "dark"]) {
      for (const col of ["#ffffff", "#ffeb3b"]) {
        await page.evaluate(
          ([th, c]) => {
            S.settings.theme = th;
            applyTheme();
            S.accounts[0].c = c;
            txSheet(null, "expense");
          },
          [scheme, col]
        );
        const t = await page.evaluate(() => {
          const rgb = x => x.match(/[\d.]+/g).map(Number);
          const surfOf = el => {
            for (let n = el.parentElement; n; n = n.parentElement) {
              const b = getComputedStyle(n).backgroundColor;
              if (b !== "rgba(0, 0, 0, 0)" && b !== "transparent") return rgb(b);
            }
            return [255, 255, 255];
          };
          const lum = c => {
            const f = v => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
            return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
          };
          const ratio = el => {
            const cs = getComputedStyle(el),
              b = rgb(cs.backgroundColor),
              a = b[3] == null ? 1 : b[3],
              s = surfOf(el),
              mix = [0, 1, 2].map(i => b[i] * a + s[i] * (1 - a)),
              L1 = lum(mix),
              L2 = lum(rgb(cs.color));
            return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          };
          const chip = $('#sheet [data-act="f-acc"][aria-pressed="true"]');
          const probe = document.createElement("button");
          probe.className = "chip hfc tinted";
          probe.setAttribute("style", chip.getAttribute("style")); // Filters' chip, same colour variable
          probe.textContent = "Bank";
          chip.parentElement.append(probe);
          const r = { form: ratio(chip), filters: ratio(probe) };
          probe.remove();
          return r;
        });
        ok(
          t.form >= 4.5 && t.filters >= 4.5,
          scheme + " " + col + ": tinted text passes AA in the form and Filters " + JSON.stringify(t)
        );
        await page.evaluate(() => closeSheet());
      }
    }
    // the same tint in the other forms' chips
    await page.evaluate(() => trSheet());
    ok(
      await page.evaluate(() =>
        [...document.querySelectorAll('#sheet [data-act="tr-from"], #sheet [data-act="tr-to"]')].every(
          c => c.classList.contains("acchip") && /--acr/.test(c.getAttribute("style"))
        )
      ),
      "transfer From / To chips carry the account colour"
    );
    await page.evaluate(() => closeSheet());
    await page.evaluate(() => loanForm("lend"));
    ok(
      await page.evaluate(() =>
        [...document.querySelectorAll('#sheet [data-act="f-acc"]')].every(c => c.classList.contains("acchip"))
      ),
      "Lend's account chips carry the account colour"
    );
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
