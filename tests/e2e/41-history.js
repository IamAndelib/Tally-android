// History: its own period (all time by default, never on Home), the period dialog opened from all time (Month tab, no
// month picked, this month marked, Today and Cancel only), picking a month leaving all time; the filter logic and the
// totals' words (kinds, fees following their entry, accounts, people, transfers' sides, gone targets).
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (w = 393) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 852 }, locale: "en-US" });
    await ctx.addInitScript(() => {
      window.Android = { getColors: () => null, setBars() {} };
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(() => {
      const y = +today().slice(0, 4),
        t = (date, amount, cat) => ({ id: "t" + date + cat, ts: 1, date, type: "expense", amount, account: "a", cat });
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 50000, archived: false });
      S.txns.push(t(y - 3 + "-03-05", 11, "food"));
      S.txns.push(t(today(), 22, "food"));
      save();
      location.reload();
    });
    await page.waitForLoadState();
    await page.waitForTimeout(200);
    return { ctx, page };
  };

  // ---- all time
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      V.screen = "history";
      render();
    });
    const r = await page.evaluate(() => ({
      period: HP.period,
      label: periodLabel(HP),
      rng: range(HP),
      homeOk: V.period !== "all",
      rows: document.querySelectorAll("#app .row, #app .tx").length,
      oldDate: histList().some(t => t.date.startsWith(+today().slice(0, 4) - 3 + "-03")),
    }));
    ok(r.period === "all", "History opens on all time: " + r.period);
    ok(r.label === "All time", "its label: " + r.label);
    ok(r.rng[0] === "0000-01-01" && r.rng[1] === "9999-12-31", "its range: " + r.rng);
    ok(r.oldDate, "the entry from three years ago is listed");
    ok(r.rows === 2, "both entries are rows: " + r.rows);
    ok(r.homeOk, "Home does not take all");
    await page.evaluate(() => {
      lastDay = addDays(today(), -1);
      catchUpToday();
    });
    ok((await page.evaluate(() => HP.period)) === "all", "a new day leaves all time alone");

    const d = await page.evaluate(() => {
      periodDialog(HP);
      const m = [...document.querySelectorAll("#pd .mgrid button")];
      return {
        tab: $('#pd [data-act="pd-tab"][aria-pressed="true"]').dataset.v,
        sel: m.filter(b => b.classList.contains("sel")).length,
        now: m.filter(b => b.classList.contains("now")).map(b => b.dataset.v),
        acts: [...document.querySelectorAll("#pd .dlg-act button")].map(b => b.dataset.act),
        tm: today().slice(0, 7),
      };
    });
    ok(d.tab === "month", "the dialog opens on the Month tab: " + d.tab);
    ok(d.sel === 0, "no month picked");
    ok(d.now.length === 1 && d.now[0] === d.tm, "this month is marked: " + d.now);
    ok(d.acts.join() === "pd-today,pd-close", "only Today and Cancel: " + d.acts);
    await page.click("#pd .mgrid button.now");
    const p = await page.evaluate(() => ({ period: HP.period, anchor: HP.anchor }));
    ok(p.period === "month", "picking a month leaves all time: " + JSON.stringify(p));
    await ctx.close();
  }

  // ---- filter logic and totals
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      const a = (id, name, currency) =>
        S.accounts.push({ id, name, type: "bank", currency, opening: 0, archived: false });
      a("b", "Everyday", "USD");
      a("c", "Cash", "USD");
      a("k", "Credit card", "USD");
      a("e", "Euro", "EUR");
      let n = 0;
      const t = (type, amount, account, extra) =>
        S.txns.push({ id: "t" + ++n, ts: n, date: today(), type, amount, account, note: "", ...extra });
      t("expense", 30, "b", { cat: "food" });
      t("transfer", 200, "b", { to: "k", feeId: "fx" });
      t("expense", 2, "b", { id: "fx", cat: "fees", feeOf: "t2" });
      t("income", 80, "e", { cat: "gift" });
      t("income", 150, "b", { cat: "gift" });
      t("transfer", 40, "c", { to: "b" });
      t("adjust", 10, "c");
      t("adjust", -4, "c");
      S.loans.push({ id: "L1", kind: "lend", person: "Sam", account: "c", date: today(), note: "", status: "open" });
      S.loans.push({ id: "L2", kind: "borrow", person: "Maya", account: "b", date: today(), note: "", status: "open" });
      t("loan", 50, "c", { loan: "L1", dir: "out", principal: true });
      t("loan", 600, "b", { loan: "L2", dir: "in", principal: true });
      t("loan", 100, "b", { loan: "L2", dir: "out", feeId: "fy" });
      t("expense", 1, "b", { id: "fy", cat: "fees", feeOf: "t11" });
    });
    const r = await page.evaluate(() => {
      const W = (l, k) => histLines(l, k).map(x => histSay([x])),
        ids = l => l.map(t => t.id).join();
      const x = histList({ ...HF, kind: "xfer" });
      const got = histList({ ...HF, kind: "in" });
      const lend = histList({ ...HF, kind: "lend" });
      const out = {
        xids: ids(x),
        xrows: ids(histRows(x)),
        xwords: W(x, "xfer"),
        in: W(got, "in"),
        lend: W(lend, "lend"),
        borrow: W(histList({ ...HF, kind: "borrow" }), "borrow"),
        fix: W(histList({ ...HF, kind: "fix" }), "fix"),
        all: W(histList(), ""),
        spent: W(histList({ ...HF, kind: "out" }), "out"),
        feeKind: histKind(S.txns.find(t => t.id === "fx")) + "," + histKind(S.txns.find(t => t.id === "fy")),
        kinds: HIST_KINDS.map(k => k[0]).join(),
        toK: histList({ ...HF, acc: "k" })
          .map(t => t.id)
          .sort()
          .join(),
        bk: histList({ ...HF, acc: "k", from: "b" })
          .map(t => t.id)
          .sort()
          .join(),
        ck: histList({ ...HF, acc: "k", from: "c" }).length,
        toB: histList({ ...HF, kind: "xfer", to: "b" })
          .map(t => t.id)
          .join(),
        who: histList({ ...HF, who: "Maya" })
          .map(t => t.id)
          .sort()
          .join(),
        cat: histList({ ...HF, kind: "in", cat: "gift" }).length,
        skipKind: histList({ ...HF, kind: "in", acc: "b" }, "kind").length,
        skipAcc: histList({ ...HF, kind: "in", acc: "b" }, "acc").length,
        skipSub: histList({ ...HF, kind: "in", cat: "nothing" }, "sub").length,
      };
      /* a gone account, category and person are dropped */
      HF = { acc: "c", kind: "out", cat: "gone", who: "Nobody", from: "b", to: "gone" };
      S.accounts = S.accounts.filter(a => a.id !== "c");
      histDrop();
      out.drop = JSON.stringify(HF);
      /* an orphan fee stays a row */
      S.txns = S.txns.filter(t => t.id !== "t11");
      out.orphan = histRows(histList(histBlank())).some(t => t.id === "fy");
      out.cleared = ((HP.period = "month"), histClear(), JSON.stringify(HF) + HP.period);
      openHistory({ acc: "b" });
      out.opened = HF.acc + HF.kind + V.screen + HP.period + V.open;
      return out;
    });
    ok(r.kinds === "out,in,xfer,lend,borrow,fix", "the kinds in order: " + r.kinds);
    ok(r.feeKind === "xfer,borrow", "a fee has its entry's kind: " + r.feeKind);
    ok(
      r.xids.split(",").includes("t2") && r.xids.split(",").includes("fx"),
      "Transfers hold the transfers and the fee: " + r.xids
    );
    ok(!r.xrows.split(",").includes("fx") && r.xrows.split(",").includes("t2"), "histRows drops the fee: " + r.xrows);
    ok(
      JSON.stringify(r.xwords) === '["Transferred $240.00","Fees $2.00"]',
      "transfer words: " + JSON.stringify(r.xwords)
    );
    ok(
      JSON.stringify(r.in) === '["$150.00 received","€80.00 received"]',
      "received words, a line per currency: " + JSON.stringify(r.in)
    );
    ok(JSON.stringify(r.lend) === '["$50.00 lent"]', "lent words, no zero got back: " + JSON.stringify(r.lend));
    const back = await page.evaluate(() => {
      const W = (l, k) => histLines(l, k).map(x => histSay([x]));
      const e = (kind, dir) => ({ type: "loan", loan: kind === "lend" ? "L1" : "L2", dir, amount: 20, account: "c" });
      return {
        lendIn: W([e("lend", "in")], "lend"),
        lendOut: W([e("lend", "out")], "lend"),
        borIn: W([e("borrow", "in")], "borrow"),
        borOut: W([e("borrow", "out")], "borrow"),
      };
    });
    ok(
      JSON.stringify(back) ===
        JSON.stringify({
          lendIn: ["$20.00 got back"],
          lendOut: ["$20.00 lent"],
          borIn: ["$20.00 borrowed"],
          borOut: ["$20.00 paid back"],
        }),
      "lend and borrow, in and out: " + JSON.stringify(back)
    );
    ok(
      JSON.stringify(r.borrow) === '["$600.00 borrowed","$100.00 paid back"]',
      "borrowed words, no fees line: " + JSON.stringify(r.borrow)
    );
    ok(JSON.stringify(r.fix) === '["$10.00 added","$4.00 taken off"]', "fix words: " + JSON.stringify(r.fix));
    ok(
      JSON.stringify(r.all) === '["$150.00 received","€80.00 received","$33.00 spent"]',
      "all words (fees inside spent; loans and transfers are neither): " + JSON.stringify(r.all)
    );
    ok(JSON.stringify(r.spent) === '["$30.00 spent"]', "spent words: " + JSON.stringify(r.spent));
    ok(r.toK === "fx,t2", "an account matches a transfer into it, and the fee follows: " + r.toK);
    ok(r.bk === "fx,t2" && r.ck === 0, "From narrows to the sending account: " + r.bk + " / " + r.ck);
    ok(r.toB === "t6", "To matches the destination: " + r.toB);
    ok(r.who === "fy,t10,t11", "a person's loan entries and fee: " + r.who);
    ok(r.cat === 2, "a category within a kind: " + r.cat);
    ok(
      r.skipKind === 8 && r.skipAcc === 2 && r.skipSub === 2,
      "skip ignores one filter: " + [r.skipKind, r.skipAcc, r.skipSub]
    );
    ok(
      r.drop === '{"acc":"","kind":"out","cat":"","who":"","from":"","to":""}',
      "gone account, category and person are dropped: " + r.drop
    );
    ok(r.orphan, "a fee whose entry is gone stays a row");
    ok(
      r.cleared === '{"acc":"","kind":"","cat":"","who":"","from":"","to":"","q":"","pay":"","amt":""}all',
      "histClear: " + r.cleared
    );
    ok(r.opened === "bhistoryall", "openHistory sets the filter and all time: " + r.opened);
    await ctx.close();
  }

  // ---- heading columns: + received over − spent, a line per currency, fees inside spent, Transfers in words, signs of loans
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      const a = (id, name, currency) =>
        S.accounts.push({ id, name, type: "bank", currency, opening: 0, archived: false });
      a("b", "Everyday", "USD");
      a("c", "Cash", "USD");
      a("e", "Euro", "EUR");
      const t = (id, date, type, amount, account, extra) =>
        S.txns.push({ id, ts: 1, date, type, amount, account, note: "", ...extra });
      t("e1", "2026-06-17", "expense", 3.25, "b", { cat: "food" });
      t("e2", "2026-06-17", "expense", 40, "b", { cat: "food", feeId: "e2f" });
      t("e2f", "2026-06-17", "expense", 2, "b", { cat: "fees", feeOf: "e2" }); // a charge on a purchase: inside spent
      t("e3", "2026-06-17", "expense", 10, "e", { cat: "food" });
      t("i1", "2026-06-17", "income", 150, "b", { cat: "gift" });
      t("x1", "2026-06-10", "transfer", 200, "b", { to: "c", feeId: "x1f" });
      t("x1f", "2026-06-10", "expense", 2.5, "b", { cat: "fees", feeOf: "x1" });
      t("x2", "2026-05-04", "transfer", 50, "b", { to: "c" });
      S.loans.push({
        id: "L1",
        kind: "lend",
        person: "Sam",
        account: "c",
        date: "2026-06-12",
        note: "",
        status: "open",
      });
      S.loans.push({
        id: "L2",
        kind: "borrow",
        person: "Maya",
        account: "b",
        date: "2026-06-05",
        note: "",
        status: "open",
      });
      t("l1", "2026-06-12", "loan", 50, "c", { loan: "L1", dir: "out", principal: true });
      t("l2", "2026-06-17", "loan", 20, "c", { loan: "L1", dir: "in" });
      t("l3", "2026-06-05", "loan", 100, "b", { loan: "L2", dir: "in", principal: true });
      t("l4", "2026-06-06", "loan", 30, "b", { loan: "L2", dir: "out" });
      save();
      location.reload();
    });
    await page.waitForLoadState();
    await page.waitForTimeout(200);
    const heads = async kind => {
      await page.evaluate(k => openHistory(k ? { kind: k } : {}), kind);
      return page.evaluate(() => {
        const col = e => [...e.querySelectorAll(".hcl")].map(l => l.textContent.replace(/\u2060/g, ""));
        const one = e => ({
          title: e.firstElementChild.textContent,
          lines: col(e),
          label: e.getAttribute("aria-label"),
          role: e.getAttribute("role"),
          hidden: [...e.children].every(c => c.getAttribute("aria-hidden") === "true"),
        });
        return {
          mon: [...document.querySelectorAll("#app .hmon")].map(one),
          day: [...document.querySelectorAll("#app .dayh")].map(one),
          fee: document.querySelectorAll("#app .hc-fee").length,
        };
      });
    };
    const J = JSON.stringify;
    // the default view: two currencies, each with its own line; the fees are inside spent
    let h = await heads("");
    ok(
      h.mon.length === 2 && h.mon[0].title === "June 2026" && h.mon[1].title === "May 2026",
      "default: month headings " + h.mon.map(m => m.title)
    );
    ok(
      J(h.mon[0].lines) === J(["+$150.00", "−$47.75", "−€10.00"]),
      "default month: + received over − spent, a line per currency (own currency first), the fees inside spent: " +
        J(h.mon[0].lines)
    );
    ok(J(h.mon[1].lines) === "[]", "default month with only a transfer: no column: " + J(h.mon[1].lines));
    const day = d => h.day.find(x => x.title.includes(d));
    ok(
      J(day("Jun 17").lines) === J(["+$150.00", "−$45.25", "−€10.00"]),
      "a day with income and spending, the purchase's charge inside: " + J(day("Jun 17").lines)
    );
    ok(J(day("Jun 10").lines) === J(["−$2.50"]), "a day with only a fee: spent " + J(day("Jun 10").lines));
    ok(h.fee === 0, "no separate fees line anywhere on the default view");
    ok(
      h.mon[0].role === "heading" && h.mon[0].hidden && day("Jun 17").role === "heading" && day("Jun 17").hidden,
      "headings are headings; the column is hidden from screen readers"
    );
    // TalkBack: one sentence, with the words
    ok(
      h.mon[0].label === "June 2026, $150.00 received, $47.75 + €10.00 spent",
      "the month reads as one sentence: " + h.mon[0].label
    );
    ok(
      day("Jun 17").label.endsWith(", $150.00 received, $45.25 + €10.00 spent") &&
        day("Jun 17").label.startsWith("Wed, Jun 17"),
      "the day reads as one sentence: " + day("Jun 17").label
    );
    ok(h.mon[1].label === "May 2026", "a heading with nothing to add says only its name: " + h.mon[1].label);
    // the Spent view: fees add to spent too
    h = await heads("out");
    ok(J(h.mon[0].lines) === J(["−$45.25", "−€10.00"]), "Spent: " + J(h.mon[0].lines));
    // Transfers: words, Fees only when there are fees
    h = await heads("xfer");
    ok(
      J(h.mon[0].lines) === J(["Transferred $200.00", "Fees $2.50"]) && h.mon[0].title === "June 2026",
      "Transfers month, with fees: " + J(h.mon[0].lines)
    );
    ok(J(h.mon[1].lines) === J(["Transferred $50.00"]), "Transfers month without fees: " + J(h.mon[1].lines));
    ok(
      J(h.day[0].lines) === J(["Transferred $200.00", "Fees $2.50"]) && h.day.length === 2,
      "Transfers day, with fees: " + J(h.day[0].lines)
    );
    ok(J(h.day[1].lines) === J(["Transferred $50.00"]), "Transfers day without fees: " + J(h.day[1].lines));
    ok(
      h.mon[0].label === "June 2026, Transferred $200.00, Fees $2.50",
      "the Transfers month reads in words: " + h.mon[0].label
    );
    ok(h.fee === 2, "the Fees lines exist only on Transfers: " + h.fee);
    // lent and borrowed: the rows' signs
    h = await heads("lend");
    ok(J(h.mon[0].lines) === J(["+$20.00", "−$50.00"]), "Lent month: got back +, lent −: " + J(h.mon[0].lines));
    ok(J(h.day.map(d => d.lines)) === J([["+$20.00"], ["−$50.00"]]), "Lent days: " + J(h.day.map(d => d.lines)));
    ok(
      h.mon[0].label === "June 2026, $20.00 got back, $50.00 lent",
      "the Lent month reads as one sentence: " + h.mon[0].label
    );
    h = await heads("borrow");
    ok(
      J(h.mon[0].lines) === J(["+$100.00", "−$30.00"]),
      "Borrowed month: borrowed +, paid back −: " + J(h.mon[0].lines)
    );
    ok(J(h.day.map(d => d.lines)) === J([["−$30.00"], ["+$100.00"]]), "Borrowed days: " + J(h.day.map(d => d.lines)));
    // colours: + green, − red
    h = await heads("");
    const col = await page.evaluate(() => {
      const c = s => getComputedStyle(document.querySelector(s)).color;
      return [c(".hcol .hc-in"), c(".hcol .hc-out")];
    });
    ok(col[0] !== col[1], "received and spent have their own colours: " + col);
    await ctx.close();
  }

  // ---- the screen: period chip, Filters, chips, month headings
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      const a = (id, name) => S.accounts.push({ id, name, type: "bank", currency: "USD", opening: 0, archived: false });
      a("b", "Everyday");
      a("c", "Cash");
      const y = +today().slice(0, 4) - 1;
      const t = (id, date, type, amount, account, extra) =>
        S.txns.push({ id, ts: 1, date, type, amount, account, note: "", ...extra });
      t("e1", y + "-06-17", "expense", 20, "c", { cat: "food" });
      t("e2", y + "-06-16", "expense", 10, "b", { cat: "food" });
      t("e3", y + "-05-02", "expense", 5, "c", { cat: "transport" });
      t("i1", y + "-06-10", "income", 100, "b", { cat: "gift" });
      t("x1", y + "-06-12", "transfer", 40, "b", { to: "c" });
      save();
      location.reload();
    });
    await page.waitForLoadState();
    await page.waitForTimeout(200);
    const act = (a, v) => page.click(`#app [data-act="${a}"]` + (v === undefined ? "" : `[data-v="${v}"]`));
    const sub = () =>
      page.evaluate(() => ({
        sel: document.querySelectorAll('#app [data-act="tx-open"]').length,
        chips: [...document.querySelectorAll('#app .hchips [data-act="hf-del"]')].map(b => b.dataset.v),
        clear: document.querySelectorAll('#app [data-act="hf-clear"]').length,
        filters: (document.querySelector('#app [data-act="hf-open"]') || {}).textContent,
        all: !!document.querySelector('#app [data-act="hp-all"]'),
      }));
    await page.click('[data-act="go"][data-v="history"]');
    let r = await sub();
    ok(
      r.chips.length === 0 && r.clear === 0 && !r.all,
      "from Home: all time, no chips, no Clear all: " + JSON.stringify(r)
    );
    ok(r.filters.trim() === "Filters", "Filters unfilled: " + r.filters);
    ok(
      (await page.getAttribute('#app [data-act="hp-open"]', "aria-label")).startsWith("Choose a period"),
      "the period chip's label is named"
    );
    ok(await page.evaluate(() => !document.querySelector("#app .hfsum")), "no visible summary line under the chips");
    const hs = await page.evaluate(() => {
      const e = document.querySelector('#app [role="status"].vh'),
        b = e && e.getBoundingClientRect();
      return (
        e && { text: e.textContent.trim(), rows: document.querySelectorAll("#app .tx").length, w: b.width, h: b.height }
      );
    });
    ok(
      hs && hs.text === hs.rows + (hs.rows === 1 ? " entry" : " entries") && hs.w <= 1 && hs.h <= 1,
      "a hidden status region says the count: " + JSON.stringify(hs)
    );
    const mons = await page.evaluate(() => [...document.querySelectorAll("#app .hmon")].map(e => e.textContent));
    const yr = new Date().getFullYear() - 1;
    ok(
      mons.length === 2 &&
        mons[0].startsWith("June " + yr) &&
        mons[0].replace(/\u2060/g, "").endsWith("+$100.00−$30.00"),
      "month headings carry the month's words: " + JSON.stringify(mons)
    );
    ok(
      mons[1].startsWith("May " + yr) && mons[1].replace(/\u2060/g, "").endsWith("−$5.00"),
      "second month: " + mons[1]
    );

    // an account's "Open in History"
    await page.evaluate(() => {
      V.screen = "home";
      render();
      accOpen("c");
    });
    await page.click('#sheet [data-act="hist-acc"]');
    r = await sub();
    ok(
      (await page.evaluate(() => HF.acc + HP.period)) === "call" && r.chips.join() === "acc" && r.clear === 1,
      "Open in History sets the account chip: " + JSON.stringify(r)
    );
    ok(/Filters\s*·\s*1/.test(r.filters), "Filters · 1: " + r.filters);
    ok(
      (await page.getAttribute('#app [data-act="hf-del"][data-v="acc"]', "aria-label")) === "Remove filter: Cash",
      "the chip's ✕ is labelled"
    );
    ok(await page.isVisible('#app [data-act="hf-del"][data-v="acc"] .adot'), "an account chip has its colour dot");
    ok(
      await page.evaluate(
        () =>
          !!document.querySelector('.hbar [data-act="hf-clear"]') &&
          !document.querySelector('.hchips [data-act="hf-clear"]')
      ),
      "Clear all sits in the bar, not among the chips"
    );
    await page.evaluate(() => {
      HF.kind = "out";
      render();
    });
    ok(
      await page.evaluate(() => {
        const h = v => document.querySelector('.hchips [data-v="' + v + '"]').getBoundingClientRect().height;
        return Math.abs(h("acc") - h("kind")) < 1;
      }),
      "the account chip is as tall as a kind chip (dot and name on one line)"
    );
    await page.evaluate(() => {
      HF.kind = "";
      render();
    });
    // a period, then ✕ back to all time keeping the account
    await page.evaluate(() => {
      Object.assign(HP, { period: "month", anchor: today().slice(0, 4) - 1 + "-06-15" });
      render();
    });
    ok((await sub()).all, "a set period has its ✕");
    ok(
      (await page.getAttribute('#app [data-act="hp-all"]', "aria-label")) === "Show all time",
      "the ✕ is labelled Show all time"
    );
    for (const sel of ['[data-act="hp-open"]', '[data-act="hp-all"]']) {
      const b = await (await page.$("#app " + sel)).boundingBox();
      ok(b.height >= 47.5 && b.width >= 47.5, sel + " is a target: " + b.width + "x" + b.height);
    }
    await act("hp-all");
    ok((await page.evaluate(() => HP.period + HF.acc)) === "allc", "✕ returns to all time and keeps the account");
    // kind and its category
    await page.evaluate(() => {
      HF.kind = "out";
      HF.cat = "food";
      render();
    });
    ok((await sub()).chips.join() === "acc,kind,sub", "chips: account, kind, category");
    await act("hf-del", "kind");
    ok((await page.evaluate(() => HF.kind + "|" + HF.cat)) === "|", "removing the kind removes its category");
    // Clear all, with a period set
    await page.evaluate(() => {
      HF.kind = "in";
      Object.assign(HP, { period: "month", anchor: today() });
      render();
    });
    ok(
      (await page.evaluate(() => document.querySelector("#app .empty").textContent)).includes(
        "Nothing matches these filters"
      ) &&
        (await sub()).clear === 1 &&
        (await page.$$('#app .empty [data-act="hf-clear"]')).length === 1,
      "nothing matches: one Clear all, under the words"
    );
    const mid = await page.evaluate(() => {
      const b = document.querySelector("#app .empty").getBoundingClientRect();
      return Math.round(b.top + b.height / 2 - innerHeight / 2);
    });
    ok(
      Math.abs(mid) <= 2,
      "nothing matches sits in the middle of the window, within the thumb's reach: " + mid + "px off"
    );
    await act("hf-clear");
    r = await sub();
    ok(
      (await page.evaluate(() => JSON.stringify(HF) + HP.period)) ===
        '{"acc":"","kind":"","cat":"","who":"","from":"","to":"","q":"","pay":"","amt":""}all' && r.clear === 0,
      "Clear all goes back to the default view"
    );
    // Filters is wired to filtersSheet() (Task 4 fills it)
    ok(
      await page.evaluate(() => {
        let called = 0;
        const f = filtersSheet;
        filtersSheet = () => called++;
        document.querySelector('#app [data-act="hf-open"]').click();
        filtersSheet = f;
        return called === 1;
      }),
      "Filters calls filtersSheet()"
    );
    // selection keeps the rows above, out of reach; Select all takes the listed
    await page.evaluate(() => {
      HF.acc = "c";
      render();
    });
    await act("sel-start");
    ok(
      await page.$$eval("#app .hbar button", bs => bs.length > 0 && bs.every(b => b.disabled)),
      "selection keeps the period and filter row, dimmed and out of reach"
    );
    await act("sel-all");
    ok((await page.evaluate(() => V.sel.size)) === 3, "Select all selects only the listed entries");
    await act("sel-cancel");
    // a sideways swipe does nothing
    const before = await page.evaluate(() => JSON.stringify(HF) + JSON.stringify(HP));
    const box = await (await page.$("#app .hmon")).boundingBox();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + 12, { steps: 6 });
    await page.mouse.up();
    ok(
      (await page.evaluate(() => JSON.stringify(HF) + JSON.stringify(HP))) === before,
      "a sideways swipe changes nothing"
    );
    // leaving History forgets the filters
    await page.click('#app [data-act="home"]');
    await page.click('[data-act="go"][data-v="history"]');
    ok(
      (await page.evaluate(() => JSON.stringify(HF))) ===
        '{"acc":"","kind":"","cat":"","who":"","from":"","to":"","q":"","pay":"","amt":""}',
      "leaving History and coming back resets the filters"
    );
    await ctx.close();
  }

  // ---- the Filters sheet
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      const a = (id, name, extra) =>
        S.accounts.push({ id, name, type: "bank", currency: "USD", opening: 0, archived: false, ...extra });
      a("b", "Everyday");
      a("c", "Cash");
      a("k", "Credit card", { type: "card" });
      a("s", "Savings");
      a("o", "Old savings", { archived: true });
      let n = 0;
      const t = (type, amount, account, extra) =>
        S.txns.push({ id: "t" + ++n, ts: n, date: today(), type, amount, account, note: "", ...extra });
      t("expense", 20, "c", { cat: "food" });
      t("expense", 10, "b", { cat: "food" });
      t("expense", 5, "c", { cat: "transport" });
      t("expense", 3, "k", { cat: "food" });
      t("expense", 4, "k", { cat: "food" });
      t("expense", 6, "b", { cat: "transport" });
      t("expense", 1, "o", { cat: "food" });
      t("income", 100, "b", { cat: "gift" });
      t("transfer", 30, "b", { to: "k", feeId: "fx" });
      t("expense", 2, "b", { id: "fx", cat: "fees", feeOf: "t9" });
      t("transfer", 40, "b", { to: "c" });
      t("transfer", 20, "k", { to: "s" });
      t("transfer", 10, "b", { to: "k" });
      S.loans.push({ id: "L1", kind: "lend", person: "Sam", account: "c", date: today(), note: "", status: "open" });
      S.loans.push({
        id: "L2",
        kind: "lend",
        person: "Priya",
        account: "c",
        date: today(),
        note: "",
        status: "settled",
      });
      t("loan", 50, "c", { loan: "L1", dir: "out", principal: true });
      t("loan", 30, "c", { loan: "L2", dir: "out", principal: true });
      t("loan", 30, "c", { loan: "L2", dir: "in" });
      save();
      location.reload();
    });
    await page.waitForLoadState();
    await page.waitForTimeout(200);
    await page.click('[data-act="go"][data-v="history"]');
    const sheet = () =>
      page.evaluate(() => {
        const q = s => [...document.querySelectorAll("#sheet " + s)];
        const info = b => ({
          v: b.dataset.v,
          t: b.textContent.replace("✓", "").replace(/\s+/g, " ").trim(),
          on: b.getAttribute("aria-pressed") === "true",
          dim: b.getAttribute("aria-disabled") === "true",
        });
        return {
          secs: q(".sec").map(e => e.textContent.trim()),
          acc: q('[data-act="hfs-acc"]').map(info),
          kind: q('[data-act="hfs-kind"]').map(info),
          sub: q('[data-act="hfs-sub"]').map(info),
          from: (q('[data-act="hfs-from"]')[0] || {}).textContent,
          to: (q('[data-act="hfs-to"]')[0] || {}).textContent,
          locked: q(".hfc.lock").map(e => e.textContent.replace(/\s+/g, " ").trim()),
          hint: (q(".hfhint")[0] || {}).textContent,
          show: (q('[data-act="hfs-show"]')[0] || {}).textContent,
          showOff: !!(q('[data-act="hfs-show"]')[0] || {}).disabled,
          hf: JSON.stringify(HF),
          hfd: JSON.stringify(HFD),
        };
      });
    const tap = (a, v) => page.click(`#sheet [data-act="${a}"]` + (v === undefined ? "" : `[data-v="${v}"]`));
    await page.click('#app [data-act="hf-open"]');
    let r = await sheet();
    ok(r.secs.join() === "Account,Transactions", "sections without a kind: " + r.secs);
    ok(
      r.acc.map(x => x.t.split(" ")[0]).join() === "All,Everyday,Cash,Credit,Savings,Old",
      "every account, archived one with entries: " + r.acc.map(x => x.t)
    );
    ok(r.acc.find(x => x.v === "o").t.includes("archived"), "the archived one is marked");
    ok(r.acc[0].on, "All accounts is picked");
    ok(
      r.kind.map(x => x.t).join("|") === "All|Spent 7|Received 1|Transfers 4|Lent 3",
      "Transactions with counts, no Borrowed, no Balance fixes (never had): " + r.kind.map(x => x.t).join("|")
    );
    ok(r.show === "Show 15 entries", "the foot counts: " + r.show);
    ok(
      await page.evaluate(() => {
        const l = document.querySelector('#sheet [data-act="hfs-acc"][data-v="b"]');
        return !!l.querySelector(".adot");
      }),
      "an account chip has its dot"
    );
    const tall = await page.evaluate(() => {
      const c = document.querySelector('#sheet [data-act="hfs-kind"]');
      const b = c.getBoundingClientRect(),
        z = getComputedStyle(c, "::after");
      return { h: b.height, up: parseFloat(z.top), bh: parseFloat(z.height) };
    });
    ok(Math.round(tall.h) === 34, "compact chips are 34px tall: " + tall.h);
    ok(tall.bh + 0 >= 48 || tall.h - 2 * tall.up >= 48, "the tap area reaches 48px: " + JSON.stringify(tall));
    // focus, Back
    ok(await page.evaluate(() => $("#sheet").contains(document.activeElement)), "the sheet takes the focus");
    // pick Cash: kinds with 0 are dimmed, never the picked one
    await tap("hfs-acc", "c");
    r = await sheet();
    ok(r.acc.find(x => x.v === "c").on, "Cash picked");
    ok(
      r.kind
        .filter(x => x.dim)
        .map(x => x.v)
        .join() === "in" && r.kind.find(x => x.v === "xfer").t === "Transfers 1",
      "Cash's kinds: " + r.kind.map(x => x.t).join("|")
    );
    await tap("hfs-acc", "s");
    r = await sheet();
    ok(
      r.kind.find(x => x.v === "out").dim && r.kind.find(x => x.v === "out").t === "Spent 0",
      "Savings: Spent is 0 and dimmed: " + r.kind.map(x => x.t).join("|")
    );
    await page.click('#sheet [data-act="hfs-kind"][data-v="out"]', { force: true }); // dimmed: ignored
    ok((await sheet()).hfd.includes('"kind":""'), "a dimmed option ignores taps");
    await tap("hfs-kind", "xfer");
    await tap("hfs-acc", "");
    await tap("hfs-kind", "out");
    r = await sheet();
    ok(r.kind.find(x => x.v === "out").on && !r.kind.find(x => x.v === "out").dim, "a picked kind is never dimmed");
    // Spent: categories, most used first
    ok(r.secs.join() === "Account,Transactions,Category", "Spent adds Category: " + r.secs);
    ok(
      /^All\|\S.* 5\|\S.* 2$/.test(r.sub.map(x => x.t).join("|")) && r.sub[1].v === "food",
      "categories most used first: " + r.sub.map(x => x.t).join("|")
    );
    // an account dims what isn't there
    await tap("hfs-acc", "o");
    r = await sheet();
    ok(r.sub.length === 2 && / 1$/.test(r.sub[1].t), "only categories that have entries: " + r.sub.map(x => x.t));
    await tap("hfs-acc", "");
    // Lent
    await tap("hfs-kind", "lend");
    r = await sheet();
    ok(r.secs.join() === "Account,Transactions,Lent to", "Lent adds Lent to: " + r.secs);
    ok(
      r.sub.map(x => x.t).join("|") === "Everyone|Priya 2|Sam 1",
      "Everyone and each person, a settled tab too: " + r.sub.map(x => x.t).join("|")
    );
    await tap("hfs-sub", "Sam");
    r = await sheet();
    ok(r.show === "Show 1 entry" && r.hfd.includes('"who":"Sam"'), "a person narrows the count: " + r.show);
    // Transfers, no account: From ▾ ⇄ To ▾
    await tap("hfs-kind", "xfer");
    r = await sheet();
    ok(r.secs.join() === "Account,Transactions,Between", "Transfers adds Between: " + r.secs);
    ok(
      /From any account/.test(r.from) && /To any account/.test(r.to) && !r.hint,
      "From any account, To any account, no hint: " + r.from + " / " + r.to
    );
    ok(r.hfd.includes('"who":""'), "changing the kind drops the person");
    await page.click('#sheet [data-act="hfs-from"]');
    await page.click('#pop [data-act="hfs-pick"][data-v="b"]');
    r = await sheet();
    ok(/From Everyday/.test(r.from) && /To any account/.test(r.to), "From Everyday: " + r.from + " / " + r.to);
    await tap("hfs-swap");
    r = await sheet();
    ok(/From any account/.test(r.from) && /To Everyday/.test(r.to), "swap swaps: " + r.from + " / " + r.to);
    await tap("hfs-swap");
    // with Credit card picked
    await tap("hfs-acc", "k");
    r = await sheet();
    ok(
      /From any account/.test(r.from) && /To any account/.test(r.to) && r.hint === "One side is Credit card",
      "both any, with the hint: " + r.from + " / " + r.to + " / " + r.hint
    );
    ok(r.show === "Show 3 entries", "every transfer in and out of it: " + r.show);
    await page.click('#sheet [data-act="hfs-from"]');
    const menu = await page.evaluate(() => ({
      role: document.querySelector("#pop [role=dialog]") && 1,
      items: [...document.querySelectorAll('#pop [data-act="hfs-pick"]')].map(b => ({
        v: b.dataset.v,
        t: b.textContent.replace("✓", "").replace(/\s+/g, " ").trim(),
        dim: b.getAttribute("aria-disabled") === "true",
      })),
      focus: $("#pop").contains(document.activeElement),
    }));
    ok(!menu.items.some(x => x.v === "k"), "the menu never lists the picked account: " + JSON.stringify(menu.items));
    ok(
      menu.items.find(x => x.v === "b").t === "Everyday 2" && !menu.items.find(x => x.v === "b").dim,
      "Everyday: 2 " + JSON.stringify(menu.items)
    );
    ok(menu.items.find(x => x.v === "c").dim && menu.items.find(x => x.v === "s").dim, "accounts at 0 are dimmed");
    ok(menu.focus, "the menu takes the focus");
    await page.click('#pop [data-act="hfs-pick"][data-v="c"]', { force: true }); // dimmed: ignored
    ok(await page.evaluate(() => !!$("#pop").innerHTML), "a dimmed menu item ignores taps");
    await page.click('#pop [data-act="hfs-pick"][data-v="b"]');
    r = await sheet();
    ok(
      /From Everyday/.test(r.from || "") && r.locked.join() === "To Credit card" && r.show === "Show 2 entries",
      "From Everyday locks To as Credit card, 2 entries: " + r.from + " / " + r.locked + " / " + r.show
    );
    ok(!r.to, "the locked side is not a button");
    // Back closes the menu first, then the sheet
    await page.click('#sheet [data-act="hfs-from"]');
    ok(
      await page.evaluate(() => goBack() && !$("#pop").innerHTML && !!$("#sheet").innerHTML),
      "Back closes the menu first"
    );
    // the menu opens upward when it wouldn't fit below (a short window)
    await page.setViewportSize({ width: 393, height: 520 });
    await page.click('#sheet [data-act="hfs-from"]');
    const up = await page.evaluate(() => {
      const m = document.querySelector("#pop .hmenu").getBoundingClientRect();
      return { top: m.top, bottom: m.bottom, h: innerHeight };
    });
    ok(up.top >= 0 && up.bottom <= up.h + 0.5, "the menu stays on the screen: " + JSON.stringify(up));
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 393, height: 852 });
    // the sheet's Clear all clears only the draft, the period stays
    await page.evaluate(() => {
      HP.period = "year";
      HP.anchor = today();
      HF.acc = "b";
    });
    await tap("hfs-clear");
    r = await sheet();
    ok(
      r.hfd === '{"acc":"","kind":"","cat":"","who":"","from":"","to":"","q":"","pay":"","amt":""}' &&
        r.hf.includes('"acc":"b"') &&
        (await page.evaluate(() => HP.period)) === "year",
      "the sheet's Clear all clears only the draft: " + r.hfd
    );
    // ✕ drops the draft
    await tap("hfs-kind", "in");
    await page.click('#sheet [data-act="close"]');
    ok(
      (await page.evaluate(() => HF.kind + "|" + HF.acc + "|" + !$("#sheet").innerHTML)) === "|b|true",
      "✕ leaves HF as it was"
    );
    // Show applies
    await page.click('#app [data-act="hf-open"]');
    await tap("hfs-acc", "c");
    await tap("hfs-kind", "out");
    await page.click('#sheet [data-act="hfs-show"]');
    ok(
      (await page.evaluate(() => HF.acc + "|" + HF.kind + "|" + !$("#sheet").innerHTML)) === "c|out|true" &&
        (await page.evaluate(() => document.querySelectorAll('#app .hchips [data-act="hf-del"]').length)) === 2,
      "Show applies the draft and renders"
    );
    // outside and Back drop it
    await page.click('#app [data-act="hf-open"]');
    await tap("hfs-kind", "");
    await page.mouse.click(190, 20);
    ok((await page.evaluate(() => HF.kind + !$("#sheet").innerHTML)) === "outtrue", "outside drops the draft");
    await page.click('#app [data-act="hf-open"]');
    await tap("hfs-kind", "");
    await page.evaluate(() => goBack());
    ok((await page.evaluate(() => HF.kind + !$("#sheet").innerHTML)) === "outtrue", "Back drops the draft");
    // ✕ on the account chip with Transfers and one side set: the account and both sides go (the locked side with it)
    await page.evaluate(() => {
      HF = histBlank();
      openHistory({ acc: "k", kind: "xfer", from: "b" });
    });
    await page.click('#app [data-act="hf-del"][data-v="acc"]');
    ok(
      (await page.evaluate(() => [HF.acc, HF.from, HF.to, HF.kind].join("|"))) === "|||xfer" &&
        (await page.evaluate(() =>
          [...document.querySelectorAll('#app .hchips [data-act="hf-del"]')].map(b => b.dataset.v).join()
        )) === "kind",
      "✕ on the account clears it and both transfer sides: " + (await page.evaluate(() => JSON.stringify(HF)))
    );
    // a compact chip takes taps 48px tall: just above and below it lands on it, not on what lies behind
    await page.click('#app [data-act="hf-open"]');
    const taps = await page.evaluate(() =>
      [...document.querySelectorAll("#sheet .hfc")].slice(0, 6).map(c => {
        const b = c.getBoundingClientRect(),
          x = b.left + b.width / 2,
          hit = y => (document.elementFromPoint(x, y) || {}).closest?.(".hfc") === c;
        return hit(b.top - 6) && hit(b.bottom + 6);
      })
    );
    ok(taps.length && taps.every(Boolean), "Filters chips take taps 6px above and below: " + taps);
    await page.click('#sheet [data-act="close"]');
    // a state reached from outside the sheet: one side set with an account picked
    await page.evaluate(() => {
      HF = histBlank();
      openHistory({ acc: "k", kind: "xfer", from: "b" });
    });
    ok((await page.evaluate(() => HF.to)) === "k", "openHistory fills the other side with the account");
    await page.click('#app [data-act="hf-open"]');
    r = await sheet();
    ok(
      r.locked.join() === "To Credit card" && /From Everyday/.test(r.from) && r.show === "Show 2 entries",
      "a locked To Credit card, 2 entries: " + r.locked + " / " + r.show
    );
    await tap("hfs-swap");
    r = await sheet();
    ok(
      r.locked.join() === "From Credit card" && /To Everyday/.test(r.to) && r.show === "No entries",
      "swap: From Credit card locked, To Everyday, none: " + r.locked + " / " + r.to + " / " + r.show
    );
    await page.click('#sheet [data-act="close"]');
    await page.click('#app [data-act="hf-del"][data-v="from"]');
    ok(
      (await page.evaluate(() => HF.from + "|" + HF.to + "|" + HF.acc)) === "||k",
      "removing the From chip sets both sides back to any"
    );
    await page.click('#app [data-act="hf-open"]');
    r = await sheet();
    ok(
      r.hint === "One side is Credit card" && r.show === "Show 3 entries",
      "both any again: " + r.hint + " / " + r.show
    );
    await page.click('#sheet [data-act="close"]');
    // nothing left: No entries, disabled
    await page.evaluate(() => {
      HF = histBlank();
      render();
    });
    await page.click('#app [data-act="hf-open"]');
    await tap("hfs-acc", "o");
    await tap("hfs-kind", "out");
    await page.evaluate(() => {
      HFD.cat = "transport";
      hfsDraw();
    });
    r = await sheet();
    ok(r.show === "No entries" && r.showOff, "no entries: " + r.show + " " + r.showOff);
    await ctx.close();
  }

  // a picked chip in the Filters sheet starts with its tick; picking doesn't move the chip to another line
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S.accounts.push({ id: "k", name: "Cash", type: "cash", currency: "USD", opening: 10, archived: false });
      S.txns.push({ id: "xf", ts: 2, date: today(), type: "transfer", amount: 5, account: "a", to: "k", note: "" });
      V.screen = "history";
      render();
      filtersSheet();
    });
    /* the tick is a real element, first in the chip, drawn (size, opacity, colour), left of the dot and the name */
    const parts = sel =>
      page.evaluate(sel => {
        const b = document.querySelector(sel),
          tk = b.querySelector(".hftk"),
          dot = b.querySelector(".adot"),
          name = b.querySelector(".chn"),
          q = tk && getComputedStyle(tk),
          bf = getComputedStyle(b, "::before"),
          r = e => e.getBoundingClientRect();
        return {
          tick: !!tk,
          first: !!tk && b.firstElementChild === tk,
          text: tk ? tk.textContent : "",
          w: tk ? r(tk).width : 0,
          h: tk ? r(tk).height : 0,
          opacity: q ? q.opacity : "",
          color: q ? q.color : "",
          hidden: tk ? tk.getAttribute("aria-hidden") : "",
          leftOfDot: tk && dot ? r(tk).left < r(dot).left : null,
          leftOfName: tk && name ? r(tk).left < r(name).left : null,
          before: bf.content,
          beforePos: bf.position,
          after: getComputedStyle(b, "::after").content,
          top: Math.round(r(b).top - r(document.querySelector('#sheet [data-act="hfs-acc"]')).top),
          pressed: b.getAttribute("aria-pressed"),
        };
      }, sel);
    const chip = '#sheet [data-act="hfs-acc"][data-v="a"]';
    const off = await parts(chip);
    ok(off.pressed === "false" && !off.tick, "an unpicked chip has no tick: " + JSON.stringify(off));
    await page.click(chip);
    const on = await parts(chip);
    ok(
      on.pressed === "true" && on.tick && on.first && on.text === "✓",
      "a picked chip's first child is the tick: " + JSON.stringify(on)
    );
    ok(on.w > 0 && on.h > 0, "the tick has a size: " + on.w + "x" + on.h);
    ok(
      on.opacity === "1" && on.color !== "rgba(0, 0, 0, 0)" && on.color !== "transparent",
      "and is drawn: " + on.opacity + " " + on.color
    );
    ok(on.leftOfDot === true && on.leftOfName === true, "left of the dot and the name");
    ok(on.hidden === "true", "hidden from screen readers (aria-pressed says it)");
    ok(
      on.before === '""' && on.beforePos === "absolute",
      "the state layer is intact: " + on.before + " " + on.beforePos
    );
    ok(!on.after.includes("✓"), "no tick after the name");
    ok(on.top === off.top, "picking doesn't move the chip's row: " + off.top + " -> " + on.top);
    const kindOn = await page.evaluate(() => {
      document.querySelector('#sheet [data-act="hfs-kind"][data-v="xfer"]').click();
      const c = document.querySelector('#sheet [data-act="hfs-kind"][data-v="xfer"]');
      return c.firstElementChild.className + "|" + c.firstElementChild.textContent;
    });
    ok(kindOn === "hftk|✓", "a kind chip too: " + kindOn);
    /* Between: a chosen side leads with the tick; an unset one has none */
    await page.evaluate(() => {
      HFD.acc = "";
      HFD.from = "a";
      hfsDraw();
    });
    const side = await page.evaluate(() =>
      [...document.querySelectorAll("#sheet .hfsides > button.hfc")].map(b => {
        const t = b.querySelector(".hftk"),
          d = b.querySelector(".adot");
        return t
          ? b.firstElementChild === t && (!d || t.getBoundingClientRect().left < d.getBoundingClientRect().left)
          : false;
      })
    );
    ok(
      side[0] === true && side[1] === false,
      "Between: the chosen side has the tick first, the open one none: " + side
    );
    /* chips elsewhere keep theirs after the name */
    const elsewhere = await page.evaluate(() => {
      const b = document.createElement("button");
      b.className = "chip";
      b.setAttribute("aria-pressed", "true");
      b.textContent = "x";
      document.body.append(b);
      const r = getComputedStyle(b, "::after").content + "|" + getComputedStyle(b, "::before").content;
      b.remove();
      return r;
    });
    ok(elsewhere.startsWith('"✓"'), "other chips keep the tick after the name: " + elsewhere);
    await ctx.close();
  }

  // a notebook that never had a loan or a fix: no Lent, no Borrowed, no Balance fixes
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      V.screen = "history";
      render();
      filtersSheet();
    });
    const kinds = await page.evaluate(() =>
      [...document.querySelectorAll('#sheet [data-act="hfs-kind"]')].map(b => b.dataset.v).join()
    );
    ok(kinds === ",out", "kinds the notebook never had aren't listed: " + kinds);
    await ctx.close();
  }

  // ---- the rows: two lines, fees inside, opened in place
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.clock = "12";
      S.settings.lastCheck = today();
      const acct = (id, name, opening) =>
        S.accounts.push({ id, name, type: "bank", currency: "USD", opening, archived: false });
      acct("b", "Everyday", 5050);
      acct("c", "Cash", 118);
      const at = (date, h, m) => {
        const [y, mo, d] = date.split("-").map(Number);
        return new Date(y, mo - 1, d, h, m).getTime();
      };
      const add = (id, date, h, m, type, amount, account, extra) =>
        S.txns.push({ id, ts: at(date, h, m), date, type, amount, account, note: "", ...extra });
      S.loans.push({
        id: "L2",
        kind: "borrow",
        person: "Maya",
        account: "b",
        date: addDays(today(), -8),
        note: "",
        status: "open",
      });
      add("draw", addDays(today(), -8), 10, 0, "loan", 600, "b", { loan: "L2", dir: "in", principal: true });
      /* written down two days after its date */
      add("late", addDays(today(), -6), 9, 0, "expense", 12.5, "b", { cat: "fun", payee: "Riverside Cinema" });
      S.txns.find(t => t.id === "late").ts = at(today(), 9, 3);
      add("coffee", addDays(today(), -4), 18, 14, "expense", 4.85, "c", {
        cat: "food",
        payee: "Corner Café",
        note: "Coffee",
      });
      add("tr1", addDays(today(), -3), 12, 0, "transfer", 200, "b", { to: "c", feeId: "fee1" });
      add("fee1", addDays(today(), -3), 12, 0, "expense", 2, "b", { cat: "fees", feeOf: "tr1" });
      S.txns.find(t => t.id === "fee1").ts += 1;
      add("pay", addDays(today(), -2), 12, 0, "loan", 250, "b", { loan: "L2", dir: "out", feeId: "fee2" });
      add("fee2", addDays(today(), -2), 12, 0, "expense", 1.5, "b", { cat: "fees", feeOf: "pay" });
      S.txns.find(t => t.id === "fee2").ts += 1;
      add("orph", addDays(today(), -1), 12, 0, "expense", 3, "b", { cat: "fees", feeOf: "gone" });
      save();
      V.screen = "history";
      render();
    });
    const row = id => `#app .tx[data-v="${id}"]`;
    const text = async sel => (await page.textContent(sel)).replace(/\s+/g, " ");
    const state = () =>
      page.evaluate(() => ({
        open: V.open,
        txo: document.querySelectorAll("#app .txo").length,
        exp: [...document.querySelectorAll("#app .tx[aria-expanded]")]
          .map(r => r.dataset.v + r.getAttribute("aria-expanded"))
          .join(),
      }));
    const rb = await page.evaluate(() => ({
      feeRow: !!document.querySelector('#app .tx[data-v="fee1"], #app .tx[data-v="fee2"]'),
      acts: [...document.querySelectorAll("#app .tx[data-v]")].map(r => r.dataset.act).join(),
      orphan: !!document.querySelector('#app .tx[data-v="orph"]'),
      noBal: !document.querySelector("#app .tx .rb, #app .tx .ac"),
    }));
    ok(!rb.feeRow, "a fee with its transfer or payment has no row of its own");
    ok(rb.orphan, "an orphan fee is a row of its own");
    ok(
      rb.acts.split(",").every(a => a === "row-open"),
      "every row opens in place: " + rb.acts
    );
    ok(rb.noBal, "no running balance on the row");
    const tr = await text(row("tr1"));
    ok(tr.includes("+ $2.00 fee") && tr.includes("$200.00"), "a transfer's fee is under its amount: " + tr);
    ok(/Everyday\s*→\s*Cash/.test(tr), "a transfer reads From → To: " + tr);
    const pr = await text(row("pay"));
    ok(pr.includes("+ $1.50 fee"), "a loan payment's fee is under its amount: " + pr);
    const cf = await text(row("coffee"));
    const cs = await page.textContent(row("coffee") + " .s");
    ok(cs.replace(/\s+/g, " ").trim() === "Eating out · Cash", "category and account on the second line: " + cs);

    /* tap opens, a second tap on another row closes the first */
    await page.click(row("coffee"));
    let st = await state();
    ok(
      st.open === "coffee" && st.txo === 1 && st.exp.includes("coffeetrue"),
      "a tap opens the row: " + JSON.stringify(st)
    );
    const op = await text("#app .txo");
    ok(
      op.includes("Left after") && op.includes("$113.15") && op.includes("in Cash"),
      "a purchase: Left after $113.15 in Cash: " + op
    );
    ok(op.includes("Added at 6:14 PM"), "the time it was added: " + op);
    ok(!/rate/i.test(op), "no exchange rate");
    await page.click(row("late"));
    st = await state();
    ok(
      st.open === "late" && st.txo === 1 && st.exp.includes("coffeefalse") && st.exp.includes("latetrue"),
      "one open at a time: " + JSON.stringify(st)
    );
    const late = await text("#app .txo");
    const want = await page.evaluate(
      () =>
        "Added " + parseISO(today()).toLocaleDateString(DATE_LOC, { day: "numeric", month: "short" }) + " at 9:03 AM"
    );
    ok(late.replace(/\s+/g, " ").includes(want), "written down later: " + late + " / " + want);
    await page.click(row("late"));
    st = await state();
    ok(st.open === "" && st.txo === 0, "a second tap closes it: " + JSON.stringify(st));

    /* a transfer */
    await page.click(row("tr1"));
    const xo = await page.evaluate(() => ({
      text: document.querySelector("#app .txo").textContent.replace(/\s+/g, " "),
      boxes: [...document.querySelectorAll("#app .txo .fbox")].map(b => b.textContent.replace(/\s+/g, " ")),
    }));
    ok(
      xo.boxes.filter(b => b.includes("Left after")).length === 2,
      "a transfer: a Left after box for each account: " + xo.boxes
    );
    ok(xo.text.includes("Paid in all") && xo.text.includes("$202.00"), "Paid in all $202.00: " + xo.text);
    ok(
      xo.boxes.some(b => b.includes("$5,435.50") && b.includes("in Everyday")),
      "the paying account's balance is after its fee ($5,050 + $600 draw - $12.50 cinema - $200 - $2): " + xo.boxes
    );
    ok(
      xo.boxes.some(b => b.includes("$313.15") && b.includes("in Cash")),
      "the receiving account's balance: " + xo.boxes
    );
    ok(!/rate/i.test(xo.text), "no rate line");

    /* a loan payment */
    await page.click(row("pay"));
    const lo = await page.evaluate(() => ({
      text: document.querySelector("#app .txo").innerText.replace(/\s+/g, " "),
      acts: [...document.querySelectorAll("#app .txo .acts button")]
        .map(b => b.dataset.act + ":" + b.textContent.trim())
        .join(),
      bar: !!document.querySelector("#app .txo .lbox"),
    }));
    ok(lo.text.includes("You owe Maya $350.00") && lo.text.includes("$250.00 of $600.00 paid"), "the loan: " + lo.text);
    ok(lo.bar, "the loan has its bar box");
    ok(
      lo.acts === "tx-open:Edit,tx-del:Delete",
      "buttons: Edit, Delete (no Open loan: Edit opens the loan): " + lo.acts
    );
    await page.click('#app .txo [data-act="tx-open"]');
    const lt = await page.evaluate(() => ($("#sheet .p h2") || {}).textContent || "");
    ok(lt === "Maya", "Edit on a loan payment opens the loan: its title is the person's name: " + lt);
    await page.evaluate(() => goBack());

    /* Edit opens the entry form; Delete removes the entry (and its fee) */
    await page.click(row("coffee"));
    await page.click('#app .txo [data-act="tx-open"]');
    ok(!!(await page.$("#sheet #f-amt")), "Edit opens the entry form");
    await page.evaluate(() => goBack());
    ok((await state()).open === "coffee", "the row stays open behind the form");
    await page.click('#app .txo [data-act="tx-del"]');
    await page.waitForTimeout(100);
    await page.click("#pop .cd-destroy"); // Delete and update the balance
    await page.waitForTimeout(350);
    const del = await page.evaluate(() => ({
      txo: document.querySelectorAll("#app .txo").length,
      gone: !S.txns.some(t => t.id === "coffee"),
      open: V.open,
    }));
    ok(del.gone && del.txo === 0 && del.open === "", "Delete removes the entry and closes it: " + JSON.stringify(del));

    /* Home's entries sheet and search show the same rows */
    const other = await page.evaluate(() => {
      V.screen = "home";
      Object.assign(V, { period: "range", rs: addDays(today(), -10), re: today() });
      render();
      entriesSheet();
      const sheet = [...document.querySelectorAll("#sheet .tx[data-v]")].map(r => r.dataset.v + ":" + r.dataset.act);
      closeSheet();
      return sheet.join();
    });
    ok(other.includes("tr1:row-open") && !other.includes("fee1"), "Home's entries: the same rows: " + other);
    const sr = await page.evaluate(() => {
      openFind();
      HF.q = "everyday";
      findDraw();
      return [...document.querySelectorAll("#hbody .tx[data-v]")].map(r => r.dataset.v + ":" + r.dataset.act).join();
    });
    ok(sr.includes("tr1:row-open") && !sr.includes("fee1"), "search: the same rows: " + sr);
    await ctx.close();
  }

  // a loan's or balance fix's note shows only in the opened row, under "Added at"
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.clock = "12";
      S.settings.lastCheck = today();
      S.accounts.push({ id: "b", name: "Everyday", type: "bank", currency: "USD", opening: 5000, archived: false });
      S.loans.push({ id: "L1", kind: "lend", person: "Sam", account: "b", date: today(), note: "", status: "open" });
      const at = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 9, 30).getTime();
      S.txns.push({
        id: "ln",
        ts: at,
        date: today(),
        type: "loan",
        amount: 40,
        account: "b",
        loan: "L1",
        dir: "out",
        principal: true,
        note: "Back by Friday",
      });
      S.txns.push({
        id: "fx",
        ts: at + 1,
        date: today(),
        type: "adjust",
        amount: -3,
        account: "b",
        note: "Counted the drawer",
      });
      S.txns.push({
        id: "xf",
        ts: at + 2,
        date: today(),
        type: "transfer",
        amount: 5,
        account: "b",
        to: "b",
        note: "Rent share",
      });
      save();
      V.screen = "history";
      render();
    });
    const t = id =>
      page.evaluate(i => document.querySelector('#app .tx[data-v="' + i + '"]').textContent.replace(/\s+/g, " "), id);
    const lnT = await t("ln"),
      fxT = await t("fx"),
      xfT = await t("xf");
    ok(!lnT.includes("Back by Friday") && lnT.includes("Sam"), "a collapsed loan row has no note: " + lnT);
    ok(!fxT.includes("Counted the drawer") && fxT.includes("Balance fix"), "a collapsed fix row has no note: " + fxT);
    ok(xfT.includes("Rent share"), "a transfer's note stays its title: " + xfT);
    for (const [id, note] of [
      ["ln", "Back by Friday"],
      ["fx", "Counted the drawer"],
    ]) {
      await page.click('#app .tx[data-v="' + id + '"]');
      const o = await page.evaluate(() => {
        const a = document.querySelector("#app .txo .added"),
          n = document.querySelector("#app .txo .onote");
        return {
          after: !!(a && n && a.nextElementSibling === n),
          text: n ? n.textContent.trim() : "",
          bdi: !!(n && n.querySelector("bdi")),
        };
      });
      ok(
        o.after && o.text === note && o.bdi,
        "opened " + id + ": the note is right under Added at: " + JSON.stringify(o)
      );
      await page.click('#app .tx[data-v="' + id + '"]');
    }
    await ctx.close();
  }

  // rows: undo redraws the entries sheet; opening stays inside its list; search counts rows; the kinds of rows' boxes
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      const acct = (id, name, opening) =>
        S.accounts.push({ id, name, type: "bank", currency: "USD", opening, archived: false });
      acct("b", "Everyday", 5050);
      acct("c", "Cash", 118);
      const add = (id, date, type, amount, account, extra) =>
        S.txns.push({ id, ts: 1000 + S.txns.length, date, type, amount, account, note: "", ...extra });
      const d = n => addDays(today(), n);
      S.loans.push({ id: "L1", kind: "lend", person: "Noor", account: "c", date: d(-5), note: "", status: "open" });
      S.loans.push({ id: "L2", kind: "borrow", person: "Maya", account: "b", date: d(-9), note: "", status: "open" });
      S.loans.push({ id: "L3", kind: "lend", person: "Omar", account: "c", date: d(-7), note: "", status: "open" });
      add("e1", d(-1), "expense", 7.25, "c", { cat: "food", payee: "Bakery" });
      add("e2", d(-1), "expense", 2.5, "c", { cat: "food", payee: "Tea House" });
      add("xf", d(-2), "transfer", 200, "b", { to: "c", feeId: "xfee" });
      add("xfee", d(-2), "expense", 2, "b", { cat: "fees", feeOf: "xf" });
      add("draw", d(-9), "loan", 600, "b", { loan: "L2", dir: "in", principal: true });
      add("back", d(-3), "loan", 100, "b", { loan: "L2", dir: "out", feeId: "bfee" });
      add("bfee", d(-3), "expense", 1, "b", { cat: "fees", feeOf: "back" });
      /* a lending paid back to us, with a fee on our side */
      add("lend", d(-7), "loan", 80, "c", { loan: "L3", dir: "out", principal: true, due: d(30) });
      add("got", d(-4), "loan", 30, "c", { loan: "L3", dir: "in", feeId: "gfee" });
      add("gfee", d(-4), "expense", 0.5, "c", { cat: "fees", feeOf: "got" });
      add("fix", d(-6), "adjust", -4, "c", {});
      save();
      V.screen = "history";
      render();
    });
    const row = id => `#app .tx[data-v="${id}"]`;
    const txt = async sel => (await page.textContent(sel)).replace(/\s+/g, " ");

    /* more kinds of rows */
    await page.click(row("got"));
    const got = await txt("#app .txo");
    ok(got.includes("Reached you"), "an incoming loan payment with a fee shows Reached you: " + got);
    await page.click(row("lend"));
    const lent = await txt("#app .txo");
    ok(lent.includes("Due"), "a draw with a due date still owed shows Due: " + lent);
    await page.click(row("fix"));
    const fx = await txt("#app .txo");
    ok(/Was\s*\$?[\d.,]+/.test(fx) && fx.includes("Now"), "a balance fix shows Was and Now: " + fx);
    const fb = await page.evaluate(() =>
      [...document.querySelectorAll("#app .txo .fbox")].map(b => b.textContent.replace(/\s+/g, " "))
    );
    /* Cash held $118 - $80 lent = $38 when the $4 was taken off */
    ok(
      fb.some(b => b.includes("Was") && b.includes("$38.00")) &&
        fb.some(b => b.includes("Now") && b.includes("$34.00")),
      "Was $38.00, Now $34.00: " + fb
    );

    /* selection mode: rows don't expand, a tap selects */
    const sel = await page.evaluate(() => {
      V.sel = new Set();
      render();
      return {
        exp: document.querySelectorAll("#app .tx[aria-expanded]").length,
        rows: document.querySelectorAll("#app .tx[data-v]").length,
      };
    });
    ok(sel.rows > 0 && sel.exp === 0, "in selection mode rows have no aria-expanded: " + JSON.stringify(sel));
    await page.click(row("e1"));
    const picked = await page.evaluate(() => ({
      open: V.open,
      txo: document.querySelectorAll("#app .txo").length,
      sel: V.sel ? [...V.sel].join() : null,
    }));
    ok(
      picked.sel === "e1" && picked.txo === 0 && picked.open === "",
      "a tap selects, doesn't open: " + JSON.stringify(picked)
    );
    await page.evaluate(() => {
      V.sel = null;
      render();
    });

    /* V.open clears when the screen changes */
    await page.click(row("e1"));
    ok((await page.evaluate(() => V.open)) === "e1", "e1 open");
    const away = await page.evaluate(() => {
      V.screen = "home";
      render();
      V.screen = "history";
      render();
      return { open: V.open, txo: document.querySelectorAll("#app .txo").length };
    });
    ok(away.open === "" && away.txo === 0, "an open row closes when the screen changes: " + JSON.stringify(away));

    /* opening stays inside its list: the entries sheet's row doesn't close History's, and closing the sheet leaves
       none open (the rule is in rowToggle) */
    await page.click(row("e1"));
    const behind = await page.evaluate(() => {
      Object.assign(V, { period: "range", rs: addDays(today(), -12), re: today() });
      entriesSheet();
      return { open: V.open, pageTxo: document.querySelectorAll("#app .txo").length };
    });
    ok(
      behind.open === "" && behind.pageTxo === 0,
      "opening the sheet closes the page's row, V.open with it: " + JSON.stringify(behind)
    );
    await page.click('#sheet .tx[data-v="e2"]');
    const inSheet = await page.evaluate(() => ({
      open: V.open,
      sheetTxo: document.querySelectorAll("#sheet .txo").length,
      pageTxo: document.querySelectorAll("#app .txo").length,
    }));
    ok(
      inSheet.open === "e2" && inSheet.sheetTxo === 1 && inSheet.pageTxo === 0,
      "the sheet's row opens: " + JSON.stringify(inSheet)
    );
    /* a row opened on the page behind the sheet (e.g. after a redraw) is not closed by a tap in the sheet */
    const kept = await page.evaluate(() => {
      const r = document.querySelector('#app .tx[data-v="e1"]');
      r.setAttribute("aria-expanded", "true");
      r.insertAdjacentHTML("afterend", '<div class="txo" id="mark"></div>');
      rowToggle(document.querySelector('#sheet .tx[data-v="e1"]'), "e1");
      return {
        mark: !!document.querySelector("#app #mark"),
        sheetTxo: document.querySelectorAll("#sheet .txo").length,
      };
    });
    ok(kept.mark && kept.sheetTxo === 1, "a tap in the sheet leaves the page's rows alone: " + JSON.stringify(kept));
    await page.evaluate(() => {
      document.querySelector("#app #mark").remove();
      closeSheet();
    });
    const closed = await page.evaluate(() => ({ open: V.open, txo: document.querySelectorAll("#app .txo").length }));
    ok(closed.open === "" && closed.txo === 0, "closing the sheet leaves no row open: " + JSON.stringify(closed));

    /* Delete in the entries sheet, then Undo: the sheet shows the entry again */
    await page.evaluate(() => entriesSheet());
    await page.click('#sheet .tx[data-v="e2"]');
    await page.click('#sheet .txo [data-act="tx-del"]');
    await page.waitForTimeout(100);
    await page.click("#pop .cd-destroy");
    await page.waitForTimeout(350);
    ok(!(await page.$('#sheet .tx[data-v="e2"]')), "deleted: the row leaves the sheet");
    await page.click('#snack [data-act="undo"]');
    await page.waitForTimeout(100);
    ok(!!(await page.$('#sheet .tx[data-v="e2"]')), "Undo: the row is back in the sheet");
    ok(!!(await page.$("#sheet #ent-list")), "the entries sheet is still open");
    await page.evaluate(() => closeSheet());

    /* Undo after the sheet was closed: the entry is back and the sheet stays closed */
    await page.evaluate(() => entriesSheet());
    await page.click('#sheet .tx[data-v="e2"]');
    await page.click('#sheet .txo [data-act="tx-del"]');
    await page.waitForTimeout(100);
    await page.click("#pop .cd-destroy");
    await page.waitForTimeout(350);
    await page.evaluate(() => closeSheet());
    await page.click('#snack [data-act="undo"]');
    await page.waitForTimeout(150);
    ok(
      (await page.evaluate(() => S.txns.some(t => t.id === "e2"))) && !(await page.$("#sheet .p")),
      "Undo with the sheet closed: the entry is back and the sheet stays closed"
    );

    /* search counts the rows it shows; a fee that matches makes its entry the hit, listed once */
    const sr = await page.evaluate(() => {
      V.screen = "home";
      openFind();
      HF.q = "2";
      findDraw();
      const ids = [...document.querySelectorAll("#hbody .tx[data-act='row-open']")].map(r => r.dataset.v);
      const q = srTerms("2");
      return {
        ids,
        hits: histRows(S.txns.filter(t => srEntryHit(t, q, false)))
          .map(t => t.id)
          .sort(),
      };
    });
    ok(
      sr.ids.includes("xf") && !sr.ids.includes("xfee"),
      "search 2: the transfer (its $2 fee matches) is listed: " + sr.ids
    );
    ok(sr.ids.filter(x => x === "xf").length === 1, "listed once");
    ok(sr.ids.slice().sort().join() === sr.hits.join(), "the rows shown are the hits: " + sr.ids + " / " + sr.hits);
    await ctx.close();
  }

  // I2: the side that follows from the account is not a chip of its own and is not counted
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      ["b:Everyday", "k:Credit card"].forEach(x =>
        S.accounts.push({ id: x[0], name: x.slice(2), type: "bank", currency: "USD", opening: 0, archived: false })
      );
      S.txns.push({ id: "x1", ts: 1, date: today(), type: "transfer", amount: 5, account: "b", to: "k", note: "" });
      V.screen = "home";
      openHistory({ acc: "k", kind: "xfer", from: "b" });
    });
    const chips = () =>
      page.evaluate(() => ({
        chips: [...document.querySelectorAll("#app .hchips .hchip")].map(c => c.textContent.trim()),
        bar: document.querySelector("#app .hfbtn").textContent.trim(),
        hf: JSON.stringify(HF),
      }));
    let r = await chips();
    ok(
      r.chips.join("|") === "Credit card|Transfers|From Everyday" && r.bar === "Filters · 3",
      "account + Transfers + From: three chips, counted 3: " + JSON.stringify(r)
    );
    await page.evaluate(() => openHistory({ acc: "k", kind: "xfer", to: "b" }));
    r = await chips();
    ok(
      r.chips.join("|") === "Credit card|Transfers|To Everyday" && r.bar === "Filters · 3",
      "account + Transfers + To: " + JSON.stringify(r)
    );
    await page.evaluate(() => openHistory({ kind: "xfer", from: "b", to: "k" }));
    r = await chips();
    ok(
      r.chips.join("|") === "Transfers|From Everyday|To Credit card" && r.bar === "Filters · 3",
      "no account, both sides: all three shown: " + JSON.stringify(r)
    );
    await ctx.close();
  }

  // I3: after removing a filter, the period or everything, the focus is on something that still exists
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      ["b:Everyday", "k:Credit card"].forEach(x =>
        S.accounts.push({ id: x[0], name: x.slice(2), type: "bank", currency: "USD", opening: 0, archived: false })
      );
      S.txns.push({ id: "x1", ts: 1, date: today(), type: "expense", amount: 5, account: "k", cat: "food", note: "" });
      S.txns.push({ id: "x2", ts: 2, date: today(), type: "expense", amount: 6, account: "k", cat: "food", note: "" });
      V.screen = "home";
      openHistory({ acc: "k", kind: "out", cat: "food" });
    });
    const where = () =>
      page.evaluate(() => {
        const a = document.activeElement;
        return a === document.body
          ? "body"
          : (a.dataset.act || a.tagName) + ":" + (a.dataset.v || "") + (document.body.contains(a) ? "" : "(gone)");
      });
    await page.click('#app [data-act="hf-del"][data-v="kind"]'); // takes the category with it
    let w = await where();
    ok(w === "hf-del:acc", "after a removed chip the focus is on the next chip's ✕ (the one now in its place): " + w);
    await page.click('#app [data-act="hf-del"][data-v="acc"]');
    w = await where();
    ok(w === "hf-open:", "the last chip removed: the Filters button has it: " + w);
    await page.evaluate(() => {
      openHistory({ acc: "k" });
      HP.period = "month";
      HP.anchor = today();
      render();
    });
    await page.click('#app [data-act="hp-all"]');
    w = await where();
    ok(w === "hp-open:", "the period's ✕: the period chip has the focus: " + w);
    await page.evaluate(() => {
      openHistory({ acc: "k", kind: "out" });
      render();
    });
    await page.click('#app [data-act="hf-clear"]');
    w = await where();
    ok(w === "hf-open:", "Clear all: the Filters button has the focus: " + w);
    await ctx.close();
  }

  // I4: History > Search > Back comes back as it was left; leaving any other way resets
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push({ id: "k", name: "Credit card", type: "bank", currency: "USD", opening: 0, archived: false });
      S.txns.push({ id: "x1", ts: 1, date: today(), type: "expense", amount: 5, account: "k", cat: "food", note: "" });
      V.screen = "home";
      openHistory({ acc: "k", kind: "out" });
      HP.period = "month";
      HP.anchor = today();
      render();
    });
    await page.click('#app [data-act="search-open"]');
    await page.evaluate(() => findBack());
    let r = await page.evaluate(() => ({ s: V.screen, hf: JSON.stringify(HF), p: HP.period }));
    ok(
      r.s === "history" && r.hf.includes('"acc":"k"') && r.hf.includes('"kind":"out"') && r.p === "month",
      "Search and back keeps the filters and the period: " + JSON.stringify(r)
    );
    await page.click('#app [data-act="home"]');
    await page.evaluate(() => {
      V.screen = "history";
      render();
    });
    r = await page.evaluate(() => ({ hf: JSON.stringify(HF), p: HP.period }));
    ok(
      !r.hf.includes('"acc":"k"') && r.p === "month",
      "(Home and back to History from the app: filters gone) " + JSON.stringify(r)
    );
    await page.evaluate(() => {
      openHistory({ acc: "k" });
      openFind();
      V.screen = "home";
      render();
    });
    ok(
      (await page.evaluate(() => JSON.stringify(HF))) === (await page.evaluate(() => JSON.stringify(histBlank()))),
      "Search then Home: reset"
    );
    await ctx.close();
  }

  // I5: Home's balance bar counts rows, a fee folded into its entry
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      ["b:Everyday", "k:Credit card"].forEach(x =>
        S.accounts.push({ id: x[0], name: x.slice(2), type: "bank", currency: "USD", opening: 100, archived: false })
      );
      S.txns.push({
        id: "x1",
        ts: 1,
        date: today(),
        type: "transfer",
        amount: 5,
        account: "b",
        to: "k",
        feeId: "f1",
        note: "",
      });
      S.txns.push({
        id: "f1",
        ts: 1,
        date: today(),
        type: "expense",
        amount: 1,
        account: "b",
        cat: "fees",
        feeOf: "x1",
        note: "",
      });
      V.screen = "home";
      render();
    });
    const bar = await page.evaluate(() => document.querySelector("#app .balbar .l").textContent);
    ok(/1 entry/.test(bar), "Home's bar counts the transfer once, not its fee: " + bar);
    await page.click('#app [data-act="entries"]');
    const rows = await page.evaluate(() => document.querySelectorAll("#sheet .tx[data-v]").length);
    ok(rows === 1, "the list it opens has one row: " + rows);
    await ctx.close();
  }

  // I1: a big notebook: History opens and the Filters sheet answers quickly, and scrolling to the end shows every row
  {
    const { ctx, page } = await open();
    const r = await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      "abcde"
        .split("")
        .forEach(id =>
          S.accounts.push({ id, name: "Acc " + id, type: "bank", currency: "USD", opening: 0, archived: false })
        );
      for (let i = 0; i < 10000; i++) {
        const date = addDays(today(), -Math.floor(i / 10)),
          id = "t" + i;
        if (i % 20 === 0) {
          S.txns.push({
            id,
            ts: i,
            date,
            type: "transfer",
            amount: 10,
            account: "a",
            to: "b",
            feeId: "f" + i,
            note: "",
          });
          S.txns.push({
            id: "f" + i,
            ts: i,
            date,
            type: "expense",
            amount: 1,
            account: "a",
            cat: "fees",
            feeOf: id,
            note: "",
          });
        } else
          S.txns.push({
            id,
            ts: i,
            date,
            type: i % 7 ? "expense" : "income",
            amount: 5,
            account: "abcde"[i % 5],
            cat: i % 2 ? "food" : "gift",
            note: "",
          });
      }
      V.screen = "home";
      let t0 = performance.now();
      openHistory();
      const open = performance.now() - t0;
      const drawn = document.querySelectorAll("#app .tx").length;
      t0 = performance.now();
      filtersSheet();
      const sheet = performance.now() - t0;
      t0 = performance.now();
      document.querySelector('#sheet [data-act="hfs-acc"][data-v="b"]').click();
      const chip = performance.now() - t0;
      closeSheet();
      return {
        open,
        sheet,
        chip,
        drawn,
        total: histRows(histList()).length,
        status: document.querySelector("#app [role=status]").textContent,
      };
    });
    console.log(
      "timings (ms): open " + Math.round(r.open) + ", sheet " + Math.round(r.sheet) + ", chip " + Math.round(r.chip)
    );
    ok(r.open < 750, "10,000 entries: History opens in under 750 ms (budget 250): " + Math.round(r.open));
    ok(r.chip < 240, "a Filters chip answers in under 240 ms (budget 80): " + Math.round(r.chip));
    ok(r.sheet < 750, "the Filters sheet opens in under 750 ms: " + Math.round(r.sheet));
    ok(r.drawn < r.total && r.drawn > 0, "only the first rows are drawn at first: " + r.drawn + " of " + r.total);
    ok(
      r.status.startsWith(String(r.total).replace(/(\d)(?=(\d{3})$)/, "$1,")) || r.status.includes(String(r.total)),
      "the count still reads from the data: " + r.status
    );
    for (let k = 0; k < 60; k++) {
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(60);
      if ((await page.evaluate(() => document.querySelectorAll("#app .tx").length)) >= r.total) break;
    }
    const end = await page.evaluate(() => ({
      n: document.querySelectorAll("#app .tx").length,
      more: !!document.querySelector("#app .hmore"),
      mons: document.querySelectorAll("#app .hmon").length,
    }));
    ok(
      end.n === r.total && !end.more,
      "scrolling to the end shows every row: " + JSON.stringify(end) + " / " + r.total
    );
    await ctx.close();
  }

  // ---- Delete asks whether the balance changes or stays
  {
    const { ctx, page } = await open();
    const seedAll = () =>
      page.evaluate(() => {
        const d = today(),
          e = (id, type, amount, account, extra) =>
            Object.assign({ id, ts: 1, date: d, type, amount, account, cat: "food", note: "" }, extra);
        S = blank();
        S.settings.cur = "USD";
        S.settings.lastCheck = d;
        S.accounts.push(
          { id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1000, archived: false },
          { id: "b", name: "Cash", type: "cash", currency: "USD", opening: 500, archived: false },
          { id: "c", name: "Euro", type: "bank", currency: "EUR", opening: 200, archived: false }
        );
        S.loans.push({ id: "L", kind: "lend", person: "Sam", account: "a", date: d, status: "open" });
        S.txns.push(
          e("sp", "expense", 30.5, "a"),
          e("in", "income", 100, "a"),
          e("tr", "transfer", 50, "a", { to: "b", feeId: "trf" }),
          e("trf", "expense", 2, "a", { cat: "fees", feeOf: "tr" }),
          e("fx", "transfer", 40, "a", { to: "c", toAmount: 36.123 }),
          e("ad", "adjust", -20, "b"),
          e("d1", "loan", 100, "a", { dir: "out", loan: "L", principal: true }),
          e("p1", "loan", 40, "a", { dir: "in", loan: "L" })
        );
        save();
        V.screen = "history";
        V.sel = null;
        V.open = "";
        render();
      });
    const snap = () => page.evaluate(() => JSON.stringify(S));
    const bals = () => page.evaluate(() => balances());
    const opens = () => page.evaluate(() => Object.fromEntries(S.accounts.map(a => [a.id, a.opening])));
    const ids = () => page.evaluate(() => S.txns.map(t => t.id).sort());
    const pause = () => page.waitForTimeout(350);
    const shape = () =>
      page.evaluate(() => ({
        title: (document.querySelector("#pop .dlg-t") || {}).textContent,
        text: (document.querySelector("#pop .dlg-x") || {}).textContent,
        btns: [...document.querySelectorAll("#pop .btn")].map(
          b => b.className.replace("btn ", "") + ":" + b.textContent
        ),
      }));
    const askRow = async id => {
      await page.evaluate(id => rowToggle(document.querySelector('.tx[data-v="' + id + '"]'), id), id);
      await page.click('#app .txo [data-act="tx-del"]');
      await pause();
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const near = (a, b) => Math.abs(a - b) < 0.0005;

    await seedAll();
    const before0 = await snap();
    await askRow("sp");
    const sh = await shape();
    ok(
      sh.title === "Delete this entry?" &&
        sh.text === "Should its amount go back to the account, or the balance stay as it is?" &&
        same(sh.btns, [
          "cd-destroy:Delete and update the balance",
          "cd-destroy-out:Delete, keep the balance",
          "cd-out:Cancel",
        ]),
      "an opened row's Delete asks: " + JSON.stringify(sh)
    );
    ok((await snap()) === before0, "asking changes nothing");
    await page.click("#pop .cd-out");
    await pause();
    ok(
      (await snap()) === before0 &&
        !(await page.$("#pop .dialog")) &&
        (await page.evaluate(() => document.activeElement.matches('[data-act="tx-del"]'))),
      "Cancel changes nothing and the focus returns to Delete"
    );
    await askRow("sp").catch(() => {});
    ok(
      (await page.evaluate(() => goBack())) === true && (await snap()) === before0 && !(await page.$("#pop .dialog")),
      "Back closes the question and changes nothing"
    );

    /* every kind: Update, Keep, Undo */
    const kinds = [
      ["sp", "spent", ["sp"], { a: -30.5 }, false],
      ["in", "received", ["in"], { a: 100 }, false],
      ["tr", "transfer with a fee", ["tr", "trf"], { a: -52, b: 50 }, false],
      ["fx", "transfer between two currencies", ["fx"], { a: -40, c: 36.123 }, false],
      ["ad", "balance fix", ["ad"], { b: -20 }, false],
    ];
    for (const [id, name, gone, fx] of kinds) {
      await seedAll();
      const s0 = await snap(),
        b0 = await bals(),
        o0 = await opens(),
        n0 = (await ids()).length;
      /* Update: today's delete, balances move */
      await askRow(id);
      await page.click("#pop .cd-destroy");
      await pause();
      const b1 = await bals();
      ok(
        (await ids()).length === n0 - gone.length &&
          Object.keys(fx).every(k => near(b1[k], b0[k] - fx[k])) &&
          same(await opens(), o0),
        name + ", update: the entry goes and the balance follows"
      );
      await page.click('#snack [data-act="undo"]');
      await pause();
      ok((await snap()) === s0, name + ", update, Undo: the state is restored exactly");
      /* Keep: balances identical, only the openings changed, no new entry */
      await askRow(id);
      await page.click("#pop .cd-destroy-out");
      await pause();
      const b2 = await bals(),
        o2 = await opens();
      ok(
        Object.keys(b0).every(k => near(b2[k], b0[k])) &&
          (await ids()).length === n0 - gone.length &&
          Object.keys(o0).every(k => (fx[k] === undefined ? o2[k] === o0[k] : near(o2[k], o0[k] + fx[k]))) &&
          (await page.evaluate(g => g.every(x => !S.txns.some(t => t.id === x)), gone)),
        name + ", keep: every balance is the same, only the openings changed " + JSON.stringify(o2)
      );
      await page.click('#snack [data-act="undo"]');
      await pause();
      ok((await snap()) === s0, name + ", keep, Undo: entries, fee link and every opening restored exactly");
    }

    /* a loan payment: only "update" */
    await seedAll();
    {
      const s0 = await snap();
      await askRow("p1");
      const lp = await shape();
      ok(
        lp.title === "Delete this entry?" &&
          lp.btns.length === 2 &&
          lp.btns[0] === "cd-destroy:Delete and update the balance" &&
          lp.btns[1] === "cd-out:Cancel",
        "a loan payment is not offered to keep the balance: " + JSON.stringify(lp)
      );
      await page.click("#pop .cd-destroy");
      await pause();
      ok(!(await ids()).includes("p1"), "…and its delete works");
      await page.click('#snack [data-act="undo"]');
      await pause();
      ok((await snap()) === s0, "…and Undo restores exactly");
    }

    /* the entry sheet's Delete and the transfer and fix sheets' Delete ask the same */
    await seedAll();
    for (const [id, open] of [
      ["sp", () => txSheet("sp")],
      ["fx", () => trSheet("fx")],
      ["ad", () => adjSheet("ad")],
    ]) {
      const s0 = await snap(),
        b0 = await bals();
      await page.evaluate(open);
      await page.waitForTimeout(150);
      const act = await page.evaluate(() => (document.querySelector('#sheet [data-act$="-del"]') || {}).dataset.act);
      await page.click('#sheet [data-act="' + act + '"]');
      await pause();
      ok(
        (await page.isVisible("#pop .cd-destroy-out")) && !!(await page.$("#sheet .p")) && (await snap()) === s0,
        id + ": the sheet's Delete asks first, the sheet stays"
      );
      await page.click("#pop .cd-out");
      await pause();
      ok(
        !!(await page.$("#sheet .p")) &&
          (await page.evaluate(a => document.activeElement.matches('[data-act="' + a + '"]'), act)),
        id + ": Cancel leaves the sheet, the focus back on Delete"
      );
      await page.click('#sheet [data-act="' + act + '"]');
      await pause();
      await page.click("#pop .cd-destroy-out");
      await pause();
      const b1 = await bals();
      ok(
        !(await page.$("#sheet .p")) && Object.keys(b0).every(k => near(b1[k], b0[k])) && !(await ids()).includes(id),
        id + ": keep from the sheet closes it and every balance is the same"
      );
      await page.click('#snack [data-act="undo"]');
      await pause();
      ok((await snap()) === s0, id + ": Undo restores exactly");
    }

    /* selections: asked once, the answer applies to each entry */
    const selDel = async set => {
      await page.evaluate(set => {
        V.screen = "history";
        V.sel = new Set(set);
        render();
      }, set);
      await page.click('[data-act="sel-del"]');
      await pause();
    };
    await seedAll();
    {
      const s0 = await snap(),
        b0 = await bals();
      await selDel(["sp", "in", "tr", "fx", "ad"]);
      const sh2 = await shape();
      ok(
        sh2.title === "Delete these 5 entries?" &&
          sh2.text === "Should their amounts go back to the accounts, or the balances stay as they are?" &&
          sh2.btns.length === 3,
        "a selection is asked once, in the plural: " + JSON.stringify(sh2)
      );
      await page.click("#pop .cd-destroy-out");
      await pause();
      const b1 = await bals(),
        o1 = await opens();
      ok(
        Object.keys(b0).every(k => near(b1[k], b0[k])) &&
          (await ids()).join() === "d1,p1" &&
          near(o1.a, 1000 + 30.5 * -1 + 100 - 52 - 40) &&
          near(o1.b, 500 + 50 - 20) &&
          near(o1.c, 200 + 36.123),
        "keep for several: all balances identical, each opening takes its entries: " + JSON.stringify(o1)
      );
      await page.click('#snack [data-act="undo"]');
      await pause();
      ok((await snap()) === s0, "Undo restores a selection exactly");
      await selDel(["sp", "in", "tr", "fx", "ad"]);
      await page.click("#pop .cd-destroy");
      await pause();
      const b2 = await bals();
      ok(
        near(b2.a, b0.a - (-30.5 + 100 - 52 - 40)) && near(b2.b, b0.b - 30) && near(b2.c, b0.c - 36.123),
        "update for several: the balances follow"
      );
      await page.click('#snack [data-act="undo"]');
      await pause();
      /* with a loan entry in it, keep is not offered */
      await selDel(["sp", "p1"]);
      const sh3 = await shape();
      ok(
        sh3.btns.length === 2 && sh3.btns[0].startsWith("cd-destroy:") && sh3.btns[1] === "cd-out:Cancel",
        "a selection holding a loan entry has no keep: " + JSON.stringify(sh3)
      );
      await page.click("#pop .cd-out");
      await pause();
      ok((await snap()) === s0, "Cancel on a selection changes nothing");
      ok((await page.evaluate(() => V.sel && V.sel.size)) === 2, "…and the selection is still there for another try");
      await page.evaluate(() => goBack());
    }
    ctx.close();
  }

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
