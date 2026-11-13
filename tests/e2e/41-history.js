// History: its own period (all time by default, never on Home), the period dialog opened from all time (Month tab, no
// month picked, this month marked, Today and Cancel only), picking a month leaving all time; the filter logic and the
// totals' words (kinds, fees following their entry, accounts, people, transfers' sides, gone targets); the Charges
// and Extras kinds.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (w = 393, h = 852) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "en-US" });
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
      JSON.stringify(r.xwords) === '["Transferred $240.00","Charges $2.00"]',
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
      JSON.stringify(r.borrow) === '["$600.00 borrowed","$100.00 paid back","Charges $1.00"]',
      "borrowed words, the payment's transfer charge as Charges: " + JSON.stringify(r.borrow)
    );
    ok(JSON.stringify(r.fix) === '["$10.00 added","$4.00 taken off"]', "fix words: " + JSON.stringify(r.fix));
    ok(
      JSON.stringify(r.all) === '["$150.00 received","€80.00 received","$33.00 spent"]',
      "all words (fees inside spent; loans and transfers are neither): " + JSON.stringify(r.all)
    );
    ok(
      JSON.stringify(r.spent) === '["$33.00 spent"]',
      "spent words: the transfer's and the loan payment's fees too (Spent lists what carries them): " +
        JSON.stringify(r.spent)
    );
    ok(r.toK === "t2", "an account matches a transfer into it; its fee is the sending account's alone: " + r.toK);
    ok(r.bk === "t2" && r.ck === 0, "From narrows to the sending account: " + r.bk + " / " + r.ck);
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
    // the Spent view: every charge adds to spent too, as on the default view
    h = await heads("out");
    ok(J(h.mon[0].lines) === J(["−$47.75", "−€10.00"]), "Spent: the transfer's fee too " + J(h.mon[0].lines));
    // Transfers: words, Charges only when there are charges
    h = await heads("xfer");
    ok(
      J(h.mon[0].lines) === J(["Transferred $200.00", "Charges $2.50"]) && h.mon[0].title === "June 2026",
      "Transfers month, with charges: " + J(h.mon[0].lines)
    );
    ok(J(h.mon[1].lines) === J(["Transferred $50.00"]), "Transfers month without charges: " + J(h.mon[1].lines));
    ok(
      J(h.day[0].lines) === J(["Transferred $200.00", "Charges $2.50"]) && h.day.length === 2,
      "Transfers day, with charges: " + J(h.day[0].lines)
    );
    ok(J(h.day[1].lines) === J(["Transferred $50.00"]), "Transfers day without charges: " + J(h.day[1].lines));
    ok(
      h.mon[0].label === "June 2026, Transferred $200.00, Charges $2.50",
      "the Transfers month reads in words: " + h.mon[0].label
    );
    ok(h.fee === 2, "the Charges lines of these Transfers: " + h.fee);
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

  // ---- an account filter and a transfer's charge: the charge is the From account's alone (the transfer is listed on
  // either side; its charge, the spending it carries and the Charges figure only for the account that paid it)
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "BDT";
      S.settings.lastCheck = today();
      const a = (id, name) =>
        S.accounts.push({ id, name, type: "bank", currency: "BDT", opening: 50000, archived: false });
      a("k", "Bkash");
      a("b", "Bank");
      S.txns.push({ id: "x", ts: 1, date: today(), type: "transfer", amount: 1000, account: "k", to: "b", note: "" });
      setAddOn(S.txns[0], "charge", 10);
      save();
      location.reload();
    });
    await page.waitForLoadState();
    await page.waitForTimeout(200);
    const look = f =>
      page.evaluate(f => {
        openHistory(f);
        const col = e => [...e.querySelectorAll(".hcl")].map(l => l.textContent.replace(/\u2060/g, ""));
        return {
          rows: [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v),
          mon: [...document.querySelectorAll("#app .hmon")].map(col),
          day: [...document.querySelectorAll("#app .dayh")].map(col),
          say: [...document.querySelectorAll("#app .hmon, #app .dayh")].map(e => e.getAttribute("aria-label")),
          list: histList({ ...histBlank(), ...f })
            .map(t => (t.feeOf ? "charge" : t.id))
            .sort(),
          n: hfCount({ ...histBlank(), ...f }),
          sug: sugCount({ ...histBlank(), ...f }, HP),
        };
      }, f);
    const J = JSON.stringify;
    const tk = await page.evaluate(() => money(10, "BDT"));
    const spent = ["−" + tk];
    let r = await look({ acc: "b" });
    ok(
      J(r.rows) === J(["x"]) && J(r.list) === J(["x"]) && J(r.mon) === "[[]]" && J(r.day) === "[[]]",
      "filtered to Bank (the To side): the transfer is listed, nothing spent " + J(r)
    );
    ok(!r.say.some(s => s.includes("spent")), "… and its headings say no spending: " + J(r.say));
    r = await look({ acc: "b", kind: "out" });
    ok(
      J(r.rows) === "[]" && J(r.mon) === "[]" && r.n === 0 && r.sug === 0,
      "Bank + Spent: nothing listed, nothing counted " + J(r)
    );
    r = await look({ acc: "b", kind: "xfer" });
    ok(
      J(r.rows) === J(["x"]) &&
        r.n === 1 &&
        J(r.mon[0]) === J(["Transferred " + (await page.evaluate(() => money(1000, "BDT")))]),
      "Bank + Transfers: the transfer is listed, no Charges figure " + J(r)
    );
    r = await look({ acc: "k" });
    ok(
      J(r.rows) === J(["x"]) && J(r.list) === J(["charge", "x"]) && J(r.mon) === J([spent]) && J(r.day) === J([spent]),
      "filtered to Bkash (the From side): the charge counts as spent, as on the default view " + J(r)
    );
    r = await look({ acc: "k", kind: "out" });
    ok(
      J(r.rows) === J(["x"]) && J(r.mon) === J([spent]) && r.n === 1 && r.sug === 1,
      "Bkash + Spent: the transfer carries its charge " + J(r)
    );
    r = await look({ acc: "k", kind: "xfer" });
    ok(J(r.mon[0].slice(1)) === J(["Charges " + tk]), "Bkash + Transfers: Charges " + J(r.mon));
    r = await look({});
    ok(J(r.mon) === J([spent]), "the default view counts the charge once " + J(r.mon));
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
      r.kind.map(x => x.t).join("|") === "All|Spent 8|Received 1|Transfers 4|Lent 3|Charges 1", // Spent and Charges: the transfer with a fee
      "Transactions with counts, no Borrowed, no Balance fixes, no Extras (never had): " +
        r.kind.map(x => x.t).join("|")
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
        .join() === "in,charges" && r.kind.find(x => x.v === "xfer").t === "Transfers 1",
      "Cash's kinds (the transfer's fee was paid from another account): " + r.kind.map(x => x.t).join("|")
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
    ok(
      tr.includes("+ $2.00 transfer charge") && tr.includes("$200.00"),
      "a transfer's charge is under its amount: " + tr
    );
    ok(/Everyday\s*→\s*Cash/.test(tr), "a transfer reads From → To: " + tr);
    const pr = await text(row("pay"));
    ok(pr.includes("+ $1.50 transfer charge"), "a loan payment's transfer charge is under its amount: " + pr);
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
    ok(
      /^Sent ?\$200\.00$/.test(xo.boxes[0]) &&
        /^Transfer charge ?\$2\.00$/.test(xo.boxes[1]) &&
        !xo.text.includes("Paid in all"),
      "Sent $200.00 | Transfer charge $2.00, no total: " + xo.boxes
    );
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
    await page.click("#pop .cd-destroy"); // Delete
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
    ok(
      /Got back ?\$30\.00/.test(got) && /Charge ?\$0\.50/.test(got) && !got.includes("Reached you"),
      "an incoming loan payment with an older paid fee: Got back | Charge, no total: " + got
    );
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

  // Focus after removals (review I1, M2): whatever an action takes away, the focus goes on to the control that makes
  // sense (the next row, the bar's button), never back to the page
  {
    const { ctx, page } = await open();
    const seed = () =>
      page.evaluate(() => {
        closeSheet();
        closePop();
        S = blank();
        S.settings.cur = "USD";
        S.settings.lastCheck = today();
        S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 500, archived: false });
        S.accounts.push({ id: "b", name: "Cash", type: "cash", currency: "USD", opening: 500, archived: false });
        // newest first: e1 (today) … e4 (three days ago)
        [1, 2, 3, 4].forEach(n =>
          S.txns.push({ id: "e" + n, ts: n, date: addDays(today(), 1 - n), type: "expense", amount: n, account: "a" })
        );
        S.txns.forEach(t => (t.cat = "food"));
        V.screen = "home";
        commit();
        openHistory();
      });
    /* the focused control as act:v, "body" when it fell back to the page */
    const where = () =>
      page.evaluate(() => {
        const a = document.activeElement;
        return !a || a === document.body ? "body" : (a.dataset.act || a.tagName) + ":" + (a.dataset.v || "");
      });
    /* past the 300 ms in which a tap where a layer just closed is dropped */
    const tap = async sel => {
      await page.click(sel);
      await page.waitForTimeout(320);
    };
    const row = id => '#app .tx[data-v="' + id + '"]';
    const undo = () => tap('#snack [data-act="undo"]');
    const say = async (want, what) => {
      const w = await where();
      ok(w === want, what + ": " + w);
    };
    await seed();
    await tap('#app [data-act="sel-start"]');
    await say("sel-cancel:", "Select: the bar's button that ends the selection has the focus");
    await tap('#app [data-act="sel-cancel"]');
    await say("sel-start:", "its ✕: the Select button has it");
    await tap('#app [data-act="sel-start"]');
    await page.evaluate(() => goBack());
    await say("sel-start:", "Back while selecting: the Select button");
    await tap('#app [data-act="sel-start"]');
    await tap(row("e2"));
    await tap(row("e2"));
    await say("row-open:e2", "the last row unticked: that row keeps the focus, as it stays where it was");
    // archive selected: the row after the first selected one; Undo: the first restored one
    await tap('#app [data-act="sel-start"]');
    await tap(row("e2"));
    await tap(row("e3"));
    await tap('#app [data-act="sel-arch"]');
    await say("row-open:e4", "Archive selected: the row after them");
    await undo();
    await say("row-open:e2", "its Undo: the first row it brought back");
    // delete selected, the last row: the one before it
    await tap('#app [data-act="sel-start"]');
    await tap(row("e4"));
    await tap('#app [data-act="sel-del"]');
    await tap("#pop .cd-destroy");
    await say("row-open:e3", "Delete selected, the last row: the row before it");
    await undo();
    await say("row-open:e4", "its Undo: that row");
    // an opened row's Delete and Archive instead
    await tap(row("e2"));
    await tap('#app .txo [data-act="tx-del"]');
    await tap("#pop .cd-destroy");
    await say("row-open:e3", "an opened row's Delete: the next row");
    await undo();
    await say("row-open:e2", "its Undo: the row back");
    await tap(row("e2"));
    await tap('#app .txo [data-act="tx-del"]');
    await tap("#pop .cd-alt");
    await say("row-open:e3", "Archive instead: the next row");
    // the entry's own sheet: Delete there
    await seed();
    await tap(row("e1"));
    await tap('#app .txo [data-act="tx-open"]');
    await tap('#sheet [data-act="tx-del"]');
    await tap("#pop .cd-destroy");
    await say("row-open:e2", "Delete in the entry's own sheet: the next row");
    // saved out of a filtered list (its own sheet): the next row
    await seed();
    await page.evaluate(() => {
      HF = histNorm({ ...histBlank(), acc: "a" });
      render();
    });
    await tap(row("e2"));
    await tap('#app .txo [data-act="tx-open"]');
    await page.evaluate(() =>
      saveChecked(() => (entry("e2").account = "b"), entry("e2").date, T("common.saved"), { row: "e2" })
    );
    await page.waitForTimeout(60);
    ok(/no longer in this list/.test(await page.evaluate(() => $("#snack").textContent)), "saved out of the list");
    await say("row-open:e3", "Saved · no longer in this list: the next row");
    // every row gone: the Filters button
    await seed();
    await tap('#app [data-act="sel-start"]');
    await tap('#app [data-act="sel-all"]');
    await tap('#app [data-act="sel-del"]');
    await tap("#pop .cd-destroy");
    await say("hf-open:", "every row deleted: the Filters button");
    // Home's entries sheet: an entry opened from it and closed comes back to its row
    await seed();
    await page.evaluate(() => {
      V.screen = "home";
      render();
      entriesSheet();
    });
    await page.waitForTimeout(60);
    await tap('#sheet .tx[data-v="e1"]');
    await tap('#sheet .txo [data-act="tx-open"]');
    await page.evaluate(() => goBack());
    await page.waitForTimeout(100);
    ok(
      (await page.evaluate(() => $("#sheet").contains(document.activeElement))) && (await where()) === "row-open:e1",
      "Back to the entries sheet: the edited row has the focus: " + (await where())
    );
    // a tap leaves no ring on the control the focus went to; a key press before does
    await seed();
    await tap(row("e2"));
    await tap('#app .txo [data-act="tx-del"]');
    await tap("#pop .cd-destroy");
    ok(
      !(await page.evaluate(() => document.activeElement.matches(":focus-visible"))),
      "after taps, the row given the focus shows no ring"
    );
    await page.focus(row("e3"));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(60);
    await page.focus('#app .txo [data-act="tx-del"]');
    await page.keyboard.press("Enter");
    await page.waitForTimeout(60);
    await page.keyboard.press("Tab"); // Cancel → Archive instead → Delete, whichever: the key is what counts
    await page.evaluate(() => $("#pop .cd-destroy").focus());
    await page.keyboard.press("Enter");
    await page.waitForTimeout(60);
    ok(
      (await where()) === "row-open:e4" &&
        (await page.evaluate(() => document.activeElement.matches(":focus-visible"))),
      "with the keyboard, the row given the focus shows its ring: " + (await where())
    );
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

  // ---- a row whose title would be cut stacks (title whole, the amount under it); a short title keeps the amount on
  // its right; a row far down is measured as it comes near; selecting keeps it
  {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push({ id: "b", name: "Everyday", type: "bank", currency: "USD", opening: 90000, archived: false });
      const add = (id, date, amount, extra) =>
        S.txns.push({ id, ts: S.txns.length + 1, date, type: "expense", amount, account: "b", note: "", ...extra });
      add("long", addDays(today(), -40), 12345.6, {
        cat: "fun",
        payee: "Riverside Community Cinema and Bowling Centre",
        note: "Birthday tickets",
        feeId: "longc",
      });
      add("longc", addDays(today(), -40), 150, { cat: "fun", feeOf: "long" });
      add("bus", addDays(today(), -40), 2.5, { cat: "transport", payee: "Bus" });
      for (let i = 1; i <= 30; i++) add("f" + i, addDays(today(), -i), 3, { cat: "food", payee: "Bakery" });
      save();
      openHistory({});
    });
    const geo = () =>
      page.evaluate(() =>
        Object.fromEntries(
          ["long", "bus", "f1"].map(id => {
            const e = document.querySelector('#app .tx[data-v="' + id + '"]');
            if (!e) return [id, null];
            const dd = e.querySelector(".d"),
              d = dd.getBoundingClientRect(),
              a = e.querySelector(".a").getBoundingClientRect();
            return [
              id,
              {
                clamped: dd.scrollHeight > dd.clientHeight + 1,
                under: a.top >= d.bottom - 1,
                right: a.left >= d.right - 1,
              },
            ];
          })
        )
      );
    const near = async () => {
      await page.evaluate(() => document.querySelector('#app .tx[data-v="long"]').scrollIntoView({ block: "center" }));
      await page.waitForTimeout(250);
      return geo();
    };
    for (const w of [393, 360]) {
      await page.setViewportSize({ width: w, height: 852 });
      await page.evaluate(() => {
        scrollTo(0, 0);
        render();
      });
      await page.waitForTimeout(300); // render() holds the top row in place for a moment (toAnchor)
      const g = await near();
      ok(
        g.long && !g.long.clamped && g.long.under && g.bus.right && !g.bus.under && g.f1.right,
        w +
          " px: the long title (far down at first) is whole with its amount under it; short ones keep it on the right " +
          JSON.stringify(g)
      );
    }
    await page.evaluate(() => {
      V.sel = new Set();
      render();
    });
    await page.waitForTimeout(300);
    const gs = await near();
    ok(gs.long && !gs.long.clamped && gs.long.under && gs.bus.right, "selecting: the same rows " + JSON.stringify(gs));
    await ctx.close();
  }

  // ---- Delete asks first: a warning line, then Delete, Archive instead or Cancel (docs/specs/history-archive.md, B2)
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
    const marks = () =>
      page.evaluate(() =>
        S.txns
          .filter(t => t.archived)
          .map(t => t.id)
          .sort()
      );

    await seedAll();
    const before0 = await snap();
    await askRow("sp");
    const sh = await shape();
    ok(
      sh.title === "Delete this entry?" &&
        sh.text === "Deleting changes the account balance." &&
        same(sh.btns, ["cd-destroy:Delete", "cd-alt:Archive instead", "cd-out:Cancel"]),
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
    await page.click('#app .txo [data-act="tx-del"]'); // the row is still open after Cancel
    await pause();
    ok(await page.isVisible("#pop .dialog"), "the question is open before Back");
    ok(
      (await page.evaluate(() => goBack())) === true && (await snap()) === before0 && !(await page.$("#pop .dialog")),
      "Back closes the question and changes nothing"
    );

    /* every kind: Delete, Archive instead, Undo */
    const kinds = [
      ["sp", "spent", ["sp"], { a: -30.5 }],
      ["in", "received", ["in"], { a: 100 }],
      ["tr", "transfer with a fee", ["tr", "trf"], { a: -52, b: 50 }],
      ["fx", "transfer between two currencies", ["fx"], { a: -40, c: 36.123 }],
      ["ad", "balance fix", ["ad"], { b: -20 }],
      ["p1", "lending's payback", ["p1"], { a: 40 }],
    ];
    for (const [id, name, gone, fx] of kinds) {
      await seedAll();
      const s0 = await snap(),
        b0 = await bals(),
        o0 = await opens(),
        n0 = (await ids()).length;
      /* Delete: the entry goes, balances move */
      await askRow(id);
      await page.click("#pop .cd-destroy");
      await pause();
      const b1 = await bals();
      ok(
        (await ids()).length === n0 - gone.length &&
          Object.keys(fx).every(k => near(b1[k], b0[k] - fx[k])) &&
          same(await opens(), o0),
        name + ", Delete: the entry goes and the balance follows"
      );
      await page.click('#snack [data-act="undo"]');
      await pause();
      ok((await snap()) === s0, name + ", Delete, Undo: the state is restored exactly");
      /* Archive instead: every entry stays, so does every balance and opening; only the marks are new */
      await askRow(id);
      await page.click("#pop .cd-alt");
      await pause();
      const b2 = await bals();
      ok(
        Object.keys(b0).every(k => b2[k] === b0[k]) &&
          (await ids()).length === n0 &&
          same(await opens(), o0) &&
          same(await marks(), gone.slice().sort()),
        name + ", Archive instead: every balance and entry the same, " + gone.join(" and ") + " archived"
      );
      await page.click('#snack [data-act="undo"]');
      await pause();
      ok((await snap()) === s0, name + ", Archive instead, Undo: the state is restored exactly");
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
        (await page.isVisible("#pop .cd-alt")) && !!(await page.$("#sheet .p")) && (await snap()) === s0,
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
      await page.click("#pop .cd-destroy");
      await pause();
      const b1 = await bals();
      ok(
        !(await page.$("#sheet .p")) && Object.keys(b0).some(k => b1[k] !== b0[k]) && !(await ids()).includes(id),
        id + ": Delete from the sheet closes it and the balance follows"
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
      await selDel(["sp", "in", "tr", "fx", "ad", "p1"]);
      const sh2 = await shape();
      ok(
        sh2.title === "Delete these 6 entries?" &&
          sh2.text === "Deleting changes the account balances." &&
          sh2.btns.length === 3,
        "a selection is asked once, in the plural: " + JSON.stringify(sh2)
      );
      await page.click("#pop .cd-alt");
      await pause();
      const b1 = await bals();
      ok(
        Object.keys(b0).every(k => b1[k] === b0[k]) &&
          (await ids()).length === 8 &&
          same(await marks(), ["ad", "fx", "in", "p1", "sp", "tr", "trf"]),
        "Archive instead for several: every balance and entry the same, each archived"
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
        "Delete for several: the balances follow"
      );
      await page.click('#snack [data-act="undo"]');
      await pause();
      await selDel(["sp", "p1"]);
      await page.click("#pop .cd-out");
      await pause();
      ok((await snap()) === s0, "Cancel on a selection changes nothing");
      ok((await page.evaluate(() => V.sel && V.sel.size)) === 2, "…and the selection is still there for another try");
      await page.evaluate(() => goBack());
    }
    await ctx.close();
  }

  // ---- the pinned header (docs/specs/history-archive.md, A): the app bar, the period / Filters row and the heading of
  // the month in view stay at the top while the entries scroll; the next month's heading pushes the old one up
  {
    const { ctx, page } = await open();
    /* June (to the 17th), May and April with three entries a day, then March with thirteen a day: History's first
       chunk of rows ends inside March, and the rest of March is drawn as the end comes near */
    await page.evaluate(() => {
      const cats = ["food", "groceries", "transport"];
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 90000, archived: false });
      let n = 0;
      const add = (date, k) => {
        for (let i = 0; i < k; i++)
          S.txns.push({
            id: "p" + ++n,
            ts: n,
            date,
            type: i === 1 && date.endsWith("5") ? "income" : "expense",
            amount: 10 + i,
            account: "a",
            cat: i === 1 && date.endsWith("5") ? "salary" : cats[i % 3],
            payee: "Shop " + n,
          });
      };
      for (let d = 17; d >= 1; d--) add("2026-06-" + String(d).padStart(2, "0"), 3);
      for (let d = 31; d >= 1; d--) add("2026-05-" + String(d).padStart(2, "0"), 3);
      for (let d = 30; d >= 1; d--) add("2026-04-" + String(d).padStart(2, "0"), 3);
      for (let d = 31; d >= 1; d--) add("2026-03-" + String(d).padStart(2, "0"), 13);
      save();
      openHistory({});
    });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    /* what the window shows at the top: the bar, the Filters row, the month heading under them and its line */
    const look = () =>
      page.evaluate(() => {
        const W = innerWidth,
          box = e => e.getBoundingClientRect(),
          at = (x, y) => document.elementFromPoint(x, y),
          bar = box($("#app .appbar")),
          fb = box($("#app .hfbtn")),
          heads = [...document.querySelectorAll("#app .hmon")],
          below = Math.max(bar.bottom, fb.bottom),
          head = heads.find(h => box(h).bottom > below + 1 && box(h).top < below + 40),
          hb = head && box(head),
          probe = document.createElement("div");
        probe.style.color = "var(--outline-variant)";
        document.body.appendChild(probe);
        const outline = getComputedStyle(probe).color;
        probe.remove();
        /* nothing of the entries shows above the heading's bottom: every point down the middle is the bar, the row
           or the heading */
        let rowAbove = false;
        if (hb)
          for (let y = 2; y < hb.bottom - 1; y += 4) {
            const e = at(W / 2, y);
            if (e && e.closest(".tx, .dayh, .dl")) rowAbove = true;
          }
        return {
          y: scrollY,
          barTop: bar.top,
          barHit: !!(at(W / 2, bar.top + bar.height / 2) || { closest: () => 0 }).closest(".appbar"),
          fbTop: fb.top,
          fbHit: (at(fb.left + fb.width / 2, fb.top + fb.height / 2) || {}).closest
            ? !!at(fb.left + fb.width / 2, fb.top + fb.height / 2).closest(".hfbtn")
            : false,
          head: head ? head.getAttribute("aria-label").split(",")[0] : "",
          headTop: hb ? hb.top : -1,
          headBottom: hb ? hb.bottom : -1,
          headHit: !!hb && !!(at(W / 2, hb.top + hb.height / 2) || { closest: () => 0 }).closest(".hmon"),
          line: head ? [getComputedStyle(head).borderBottomWidth, getComputedStyle(head).borderBottomColor] : [],
          outline,
          rowAbove,
          below,
        };
      });
    const monTop = m =>
      page.evaluate(m => {
        const h = [...document.querySelectorAll("#app .hmon")].find(x => x.getAttribute("aria-label").startsWith(m));
        return h.getBoundingClientRect().top + scrollY;
      }, m);
    await frame();
    const top0 = await look();
    /* halfway through June */
    const jun = await monTop("June 2026"),
      may = await monTop("May 2026");
    await page.evaluate(y => scrollTo(0, y), Math.round(jun + (may - jun) / 2));
    await frame();
    let L = await look();
    ok(L.y > 300, "scrolled halfway through June: " + L.y);
    ok(Math.abs(L.barTop) < 1 && L.barHit, "the app bar stays at the top: " + JSON.stringify(L));
    ok(
      L.fbHit && L.fbTop >= 0 && Math.abs(L.fbTop - top0.fbTop) < 1,
      "the period / Filters row stays under it: " + JSON.stringify([L.fbTop, top0.fbTop])
    );
    ok(
      L.head === "June 2026" && L.headHit && L.headTop >= L.below - 1 && L.headTop <= L.below + 12,
      "June's heading stays under the Filters row: " + JSON.stringify(L)
    );
    ok(!L.rowAbove, "no entry shows above the month heading's bottom");
    ok(
      L.line[0] === "1px" && L.line[1] === L.outline,
      "a thin line in the outline-variant colour under it: " + JSON.stringify([L.line, L.outline])
    );
    const pinnedTop = L.headTop;
    /* the hand-over: May's heading reaches June's and pushes it up */
    const mayNow = await page.evaluate(() => {
      const h = [...document.querySelectorAll("#app .hmon")].find(x => x.getAttribute("aria-label").startsWith("May"));
      return h.getBoundingClientRect().top;
    });
    await page.evaluate(d => scrollBy(0, d), Math.round(mayNow - L.headBottom + 15));
    await frame();
    const hand = await page.evaluate(() => {
      const r = m =>
        [...document.querySelectorAll("#app .hmon")]
          .find(x => x.getAttribute("aria-label").startsWith(m))
          .getBoundingClientRect();
      return { jun: r("June"), may: r("May") };
    });
    ok(
      hand.jun.top < pinnedTop - 5 && hand.jun.bottom <= hand.may.top + 0.5 && hand.may.top - hand.jun.bottom < 10,
      "May's heading pushes June's up: " + JSON.stringify(hand)
    );
    await page.evaluate(() => scrollBy(0, 400));
    await frame();
    L = await look();
    ok(
      L.head === "May 2026" && L.headHit && Math.abs(L.headTop - pinnedTop) < 1,
      "then May's heading takes its place: " + JSON.stringify(L)
    );
    ok(Math.abs(L.barTop) < 1 && L.fbHit && !L.rowAbove, "the bar and the Filters row still above it");
    /* day headings scroll as before: none is held at the top */
    ok(
      await page.evaluate(
        () =>
          ![...document.querySelectorAll("#app .dayh")].some(
            d => getComputedStyle(d).position === "sticky" || getComputedStyle(d).position === "fixed"
          )
      ),
      "day headings scroll with the entries"
    );
    /* TalkBack reads the page in the same order: the bar, the Filters row, then each month's heading (still a heading,
       level 2, with its words) followed by its days and rows, before the next month's heading */
    const order = await page.evaluate(() => {
      const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      const heads = [...document.querySelectorAll("#app .hmon")],
        rows = [...document.querySelectorAll("#app .tx")],
        h1 = $("#app .appbar h1"),
        fb = $("#app .hfbtn");
      const monthOf = el => {
        let m = null;
        heads.forEach(h => before(h, el) && (m = h));
        return m && m.getAttribute("aria-label").split(",")[0];
      };
      return {
        top: before(h1, fb) && before(fb, heads[0]),
        roles: heads.every(h => h.getAttribute("role") === "heading" && h.getAttribute("aria-level") === "2"),
        words: heads[0].getAttribute("aria-label"),
        rowsInMonth: rows.every(r => {
          const t = entry(r.dataset.v);
          return t && monthOf(r) === capFirst(monthLabel(t.date.slice(0, 7), true));
        }),
        ariaHidden: !!document.querySelector("#app .hmon[aria-hidden], #app .hpin[aria-hidden]"),
      };
    });
    ok(
      order.top && order.roles && order.rowsInMonth && !order.ariaHidden,
      "TalkBack order unchanged: " + JSON.stringify(order)
    );
    ok(/^June 2026, .*received.*spent/.test(order.words), "the month heading keeps its words: " + order.words);
    /* jumping to a row (an opened row's part, a search match, the browser following the focus) leaves it below the
       pinned block, not under it */
    const hidden = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#app .tx")],
        head = [...document.querySelectorAll("#app .hmon")].find(h => h.getAttribute("aria-label").startsWith("May")),
        hb = head.getBoundingClientRect(),
        r = rows.find(x => x.getBoundingClientRect().top > hb.bottom + 80);
      scrollBy(0, r.getBoundingClientRect().top - hb.bottom + 30); // its top 30px under the pinned heading
      return r.dataset.v;
    });
    await frame();
    const jump = await page.evaluate(id => {
      const r = $('#app .tx[data-v="' + id + '"]'),
        before = r.getBoundingClientRect().top;
      r.scrollIntoView({ block: "nearest" });
      const hb = [...document.querySelectorAll("#app .hmon")]
        .find(h => h.getAttribute("aria-label").startsWith("May"))
        .getBoundingClientRect();
      return { before, after: r.getBoundingClientRect().top, head: hb.bottom };
    }, hidden);
    ok(
      jump.before < jump.head && jump.after >= jump.head - 1 && jump.after < jump.head + 40,
      "a row scrolled to lands just under the pinned month heading: " + JSON.stringify(jump)
    );
    /* the keyboard's focus on a row under the pinned block brings it out from under it */
    await page.evaluate(id => {
      const r = $('#app .tx[data-v="' + id + '"]');
      scrollBy(0, r.getBoundingClientRect().top - 40);
    }, hidden);
    await frame();
    const fk = await page.evaluate(id => {
      const r = $('#app .tx[data-v="' + id + '"]');
      r.focus();
      return new Promise(res =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const hb = [...document.querySelectorAll("#app .hmon")]
              .filter(h => h.getBoundingClientRect().top < 300)
              .map(h => h.getBoundingClientRect().bottom);
            res({ top: r.getBoundingClientRect().top, head: Math.max(...hb), focus: document.activeElement === r });
          })
        )
      );
    }, hidden);
    ok(
      fk.focus && fk.top >= fk.head - 1,
      "a row given the focus under the pinned block comes out from under it: " + JSON.stringify(fk)
    );
    /* a month drawn in two chunks: the rest of March goes into March's own section, so its heading stays pinned over
       all of its days */
    const chunk = await page.evaluate(async () => {
      const wait = () => new Promise(r => setTimeout(r, 60));
      for (let k = 0; k < 40 && $("#app .hmore"); k++) {
        scrollTo(0, document.body.scrollHeight);
        await wait();
      }
      const mar = [...document.querySelectorAll("#app .hmon")].filter(h =>
        h.getAttribute("aria-label").startsWith("March")
      );
      const rows = [...document.querySelectorAll("#app .tx")].filter(r =>
        entry(r.dataset.v).date.startsWith("2026-03")
      );
      return {
        done: !$("#app .hmore"),
        heads: mar.length,
        rows: rows.length,
        inside:
          mar[0].parentElement.querySelectorAll(".hmon").length === 1 &&
          rows.every(r => mar[0].parentElement.contains(r)),
        last: rows[rows.length - 1].dataset.v,
      };
    });
    ok(
      chunk.done && chunk.heads === 1 && chunk.rows === 403,
      "all of March drawn, its heading once: " + JSON.stringify(chunk)
    );
    ok(chunk.inside, "the rows of March's second chunk are in March's section");
    await page.evaluate(id => {
      const r = $('#app .tx[data-v="' + id + '"]');
      scrollBy(0, r.getBoundingClientRect().top - innerHeight / 2);
    }, chunk.last);
    await frame();
    L = await look();
    ok(
      L.head === "March 2026" && L.headHit && Math.abs(L.headTop - pinnedTop) < 1,
      "March's heading is pinned over its last day too: " + JSON.stringify(L)
    );
    /* a window so short that the block and a month's heading would cover over half of it: the headings scroll. Only
       the height changes (as when search's keyboard opens), so nothing draws History anew: the resize says so */
    const pinNow = () =>
      page.evaluate(
        () =>
          new Promise(res =>
            requestAnimationFrame(() =>
              res({
                pos: getComputedStyle($("#app .hmon")).position,
                pad: getComputedStyle(document.documentElement).scrollPaddingTop,
                pin: Math.ceil($("#app .hpin").getBoundingClientRect().height) + "px",
              })
            )
          )
      );
    await page.setViewportSize({ width: 300, height: 700 }); // upright: not the sideways layout
    await page.evaluate(() => (window.__drawn = $("#app .hpin")));
    ok((await pinNow()).pos === "sticky", "a narrower window: the month headings still pinned");
    await page.setViewportSize({ width: 300, height: 340 });
    const short = await pinNow();
    ok(
      short.pos !== "sticky" && short.pad === short.pin,
      "a short window: the month headings scroll, only the block is pinned: " + JSON.stringify(short)
    );
    await page.setViewportSize({ width: 300, height: 700 });
    ok((await pinNow()).pos === "sticky", "…and pin again in a taller one");
    ok(await page.evaluate(() => window.__drawn === $("#app .hpin")), "…without History being drawn anew");
    await page.setViewportSize({ width: 393, height: 852 });
    /* other screens have nothing pinned and no room kept at the top */
    await page.click('#app [data-act="home"]');
    ok(
      (await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop)) === "auto",
      "Home keeps no room at the top for a pinned block"
    );
    await ctx.close();
  }

  // ---- a sheet over a scrolled History: the pinned block stays, the page stays still (html.lock only)
  for (const vp of [
    { width: 393, height: 852, name: "phone" },
    { width: 852, height: 393, name: "sideways" },
    { width: 1000, height: 800, name: "two panes" },
  ]) {
    const { ctx, page } = await open(vp.width, vp.height);
    await page.evaluate(() => {
      for (let i = 0; i < 120; i++)
        S.txns.push({
          id: "k" + i,
          ts: 10 + i,
          date: addDays(today(), -i),
          type: "expense",
          amount: 1,
          account: "a",
          cat: "food",
        });
      save();
      V.screen = "history";
      render();
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => scrollTo({ top: 1500, behavior: "instant" }));
    await page.waitForTimeout(200);
    const y0 = await page.evaluate(() => scrollY);
    const fb = await page.evaluate(() => {
      const r = $('#app [data-act="hf-open"]').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    // a real tap where the button is (a locator click would scroll first); sideways only the bar is pinned, the button scrolls away
    if (fb.y > 0) await page.mouse.click(fb.x, fb.y);
    else await page.evaluate(() => $('#app [data-act="hf-open"]').click());
    await page.waitForTimeout(300);
    const m = () =>
      page.evaluate(() => ({
        y: scrollY,
        pin: Math.round($("#app .hpin").getBoundingClientRect().top),
        bar: Math.round($("#app .hbar, #app .hpin").getBoundingClientRect().top),
        mon: [...document.querySelectorAll("#app .hsec.pin > .hmon")].map(e =>
          Math.round(e.getBoundingClientRect().top)
        ),
      }));
    const a = await m();
    ok(
      await page.evaluate(() => !!$("#sheet .p") && document.documentElement.classList.contains("lock")),
      vp.name + ": the Filters sheet is open"
    );
    ok(y0 > 500, vp.name + ": History scrolled well down: " + y0);
    ok(
      a.y === y0 && a.bar === 0 && a.mon.some(t => t >= 0 && t < 200),
      vp.name + ": block and a month heading stay behind the Filters sheet: " + JSON.stringify(a)
    );
    await page.mouse.move(vp.width / 2, 40);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(250);
    ok(
      (await m()).y === y0,
      vp.name + ": a wheel scroll while the sheet is up leaves the page still " + JSON.stringify(await m())
    );
    await page.mouse.move(vp.width - 5, vp.height / 2); // on the scrim
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(250);
    ok((await m()).y === y0, vp.name + ": …also on the scrim");
    await ctx.close();
  }

  // ---- Charges and Extras (docs/plans/2026-11-13-preview-polish.md, item 4): two kinds worked out from what an
  // entry carries, after the others in the Filters sheet; their headings count the charges counted as spending, or the
  // extras counted as received, and agree with Summary and Home
  {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
    await ctx.addInitScript(() => {
      window.Android = { getColors: () => null, setBars() {} };
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(() => {
      const m = shiftMonth(today().slice(0, 7), -1),
        d = n => m + "-" + pad(n),
        x = (id, n, type, amount, account, extra) => ({
          id,
          ts: n * 10 + (id.endsWith("c") || id.endsWith("t") ? 1 : 0),
          date: d(n),
          type,
          amount,
          account,
          note: "",
          ...extra,
        }),
        loanOf = (id, kind, person, account, n, status = "open") => ({
          id,
          ts: 1,
          kind,
          person,
          account,
          date: d(n),
          note: "",
          status,
        });
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 50000, archived: false });
      S.accounts.push({ id: "k", name: "Wallet", type: "wallet", currency: "USD", opening: 5000, archived: false });
      S.accounts.push({ id: "e", name: "Euros", type: "cash", currency: "EUR", opening: 500, archived: false });
      S.txns.push(
        // a purchase with a charge (in its own category)
        x("pE", 16, "expense", 70, "a", { cat: "food", payee: "Harbour Grill", feeId: "pEc" }),
        x("pEc", 16, "expense", 6.4, "a", { cat: "food", feeOf: "pE" }),
        // a transfer with a transfer charge (paid from Bank)
        x("tA", 15, "transfer", 300, "a", { to: "k", feeId: "tAc" }),
        x("tAc", 15, "expense", 1.5, "a", { cat: "fees", feeOf: "tA" }),
        // a borrow with charges still unpaid, and its payment with a transfer charge
        x("bD", 2, "loan", 1000, "a", { dir: "in", loan: "B", principal: true, onTop: 20 }),
        x("bP", 14, "loan", 250, "a", { dir: "out", loan: "B", feeId: "bPc" }),
        x("bPc", 14, "expense", 0.75, "a", { cat: "fees", feeOf: "bP" }),
        // a borrow whose charges are paid back (spending in Charges on the payment's day)
        x("cD", 3, "loan", 100, "a", { dir: "in", loan: "C", principal: true, onTop: 10 }),
        x("cP", 12, "loan", 110, "a", { dir: "out", loan: "C" }),
        // a lend with a transfer charge and an extra, paid back with the extra and a tip
        x("lD", 4, "loan", 500, "k", { dir: "out", loan: "L", principal: true, onTop: 50, feeId: "lDc" }),
        x("lDc", 4, "loan", 5, "k", { dir: "out", loan: "L", principal: true, feeOf: "lD" }),
        x("lP", 11, "loan", 555, "k", { dir: "in", loan: "L", feeId: "lPt" }),
        x("lPt", 11, "income", 3, "k", { cat: "otherin", feeOf: "lP" }),
        // a written-off lend: its unpaid transfer charge is spending on the draw's day
        x("wD", 5, "loan", 200, "k", { dir: "out", loan: "W", principal: true, feeId: "wDc" }),
        x("wDc", 5, "loan", 4, "k", { dir: "out", loan: "W", principal: true, feeOf: "wD" }),
        // plain entries, in neither
        x("e1", 6, "expense", 30, "a", { cat: "groceries" }),
        x("i1", 7, "income", 1000, "a", { cat: "income" }),
        // an archived purchase with a charge: no row, but counted, as everywhere
        x("pX", 8, "expense", 20, "a", { cat: "shopping", feeId: "pXc", archived: true }),
        x("pXc", 8, "expense", 2, "a", { cat: "shopping", feeOf: "pX", archived: true }),
        // another currency
        x("eP", 9, "expense", 10, "e", { cat: "food", feeId: "ePc" }),
        x("ePc", 9, "expense", 1, "e", { cat: "food", feeOf: "eP" })
      );
      S.loans.push(
        loanOf("B", "borrow", "Maya", "a", 2),
        loanOf("C", "borrow", "Sam", "a", 3),
        loanOf("L", "lend", "Rafi", "k", 4),
        loanOf("W", "lend", "Joy", "k", 5, "writeoff")
      );
      save();
      location.reload();
    });
    await page.waitForLoadState();
    await page.waitForTimeout(200);
    await page.evaluate(() => (window.CM = shiftMonth(today().slice(0, 7), -1))); // the month of the entries
    const rowsOf = f =>
      page.evaluate(
        f =>
          histRows(histList({ ...histBlank(), ...f }))
            .map(t => t.id)
            .sort(),
        f
      );
    const J = JSON.stringify;
    let r = await rowsOf({ kind: "charges" });
    ok(
      J(r) === J(["bD", "bP", "cD", "cP", "eP", "lD", "pE", "tA", "wD"].sort()),
      "Charges: a purchase's charge, a transfer's and a loan payment's transfer charge, both borrows (charges unpaid " +
        "and paid back), a lend's transfer charge, a written-off lend; never the archived one: " +
        r
    );
    r = await rowsOf({ kind: "extras" });
    ok(J(r) === J(["lD", "lP"]), "Extras: the lend with an extra and the payback with the extra and a tip: " + r);
    r = await rowsOf({ kind: "charges", acc: "k" });
    ok(
      J(r) === J(["lD", "wD"]),
      "Charges on Wallet: the transfer's charge was paid from Bank, so the transfer is not listed there: " + r
    );
    r = await rowsOf({ kind: "charges", acc: "a" });
    ok(r.includes("tA") && !r.includes("lD"), "Charges on Bank: the transfer is: " + r);
    r = await rowsOf({ kind: "lend" });
    ok(r.includes("lD") && r.includes("lP"), "an entry stays in its own kind too: " + r);
    ok(
      await page.evaluate(() => histList({ ...histBlank(), kind: "charges" }).some(t => t.id === "pX")),
      "the archived entry is in the list behind the headings (it counts), not a row"
    );

    // the headings: the month's and the days', per currency, equal to Summary's and Home's counting
    await page.evaluate(() => {
      HP.period = "all";
      HF = { ...histBlank(), kind: "charges" };
      V.screen = "history";
      render();
    });
    const heads = () =>
      page.evaluate(() => ({
        mon: [...document.querySelectorAll("#app .hmon")].map(e => e.textContent.trim()),
        days: [...document.querySelectorAll("#app .dayh")].map(e => [
          e.querySelector("span").textContent,
          e.querySelector(".hcol") ? e.querySelector(".hcol").textContent : "",
        ]),
        say: [...document.querySelectorAll("#app .hmon")].map(e => e.getAttribute("aria-label")).join(),
        chips: [...document.querySelectorAll("#app .hchips .hchip")].map(b => b.textContent.trim()),
        btn: document.querySelector("#app .hfbtn").textContent.trim(),
      }));
    let h = await heads();
    const want = await page.evaluate(() => {
      const s = CM + "-01",
        e = monthEnd(CM),
        inM = x => x.date >= s && x.date <= e;
      /* Summary's Charges part, plus the purchases' charges it counts in their categories */
      const part = cur => (catSplit(spendItems(cur).filter(inM)).find(p => p[0] === CHARGES) || [0, 0])[1],
        onPurchases = cur =>
          S.txns
            .filter(t => inM(t) && t.feeOf && t.type === "expense" && entry(t.feeOf).type === "expense")
            .filter(t => acc(t.account).currency === cur)
            .reduce((q, t) => q + t.amount, 0),
        plainIn = S.txns.filter(t => inM(t) && t.type === "income" && !t.feeOf).reduce((q, t) => q + t.amount, 0);
      return {
        usd: rnd(part("USD") + onPurchases("USD")),
        eur: rnd(part("EUR") + onPurchases("EUR")),
        extras: rnd(gotIn("USD", s, e) - plainIn),
        part: part("USD"),
        day12: spentOn(CM + "-12", "USD"),
      };
    });
    ok(
      want.usd === 24.65 && want.eur === 1 && want.extras === 53 && want.part === 16.25,
      "the reference: $24.65 of charges ($16.25 in Summary's Charges, the rest in the purchases' categories), €1.00, " +
        "$53.00 of extras: " +
        J(want)
    );
    ok(
      h.mon.length === 1 && h.mon[0].includes("Charges $24.65") && h.mon[0].includes("Charges €1.00"),
      "the month's heading: Charges $24.65 and Charges €1.00, as Summary counts them: " + h.mon
    );
    ok(!/spent|received|lent|borrowed/i.test(h.mon[0]), "nothing else the entries move: " + h.mon[0]);
    ok(/Charges \$24\.65/.test(h.say), "TalkBack hears it: " + h.say);
    const dd = await page.evaluate(() =>
      [16, 15, 14, 12, 5, 3, 2, 8].map(n => [n, capFirst(dayLabel(CM + "-" + pad(n)))])
    );
    const dh = Object.fromEntries(dd.map(([n, label]) => [n, (h.days.find(x => x[0] === label) || [null, null])[1]]));
    ok(dh[16] === "Charges $6.40", "the purchase's day: Charges $6.40: " + dh[16]);
    ok(dh[15] === "Charges $1.50", "the transfer's day: Charges $1.50: " + dh[15]);
    ok(dh[14] === "Charges $0.75", "the loan payment's day: Charges $0.75: " + dh[14]);
    ok(
      dh[12] === "Charges $10.00" && want.day12 === 10,
      "the day the borrow's charges were paid back: Charges $10.00, as Home's spent that day: " + dh[12]
    );
    ok(dh[5] === "Charges $4.00", "the written-off lend's day: its transfer charge, $4.00: " + dh[5]);
    ok(dh[2] === "" && dh[3] === "", "a borrow's draw with charges unpaid: listed, with no total yet: " + J(dh));
    ok(dh[8] === null, "the archived entry's day has no heading (no row): " + J(h.days.map(x => x[0])));
    ok(J(h.chips) === J(["Charges"]) && h.btn === "Filters · 1", "the chip Charges, Filters · 1: " + J(h));

    await page.evaluate(() => {
      HF = { ...histBlank(), kind: "extras" };
      render();
    });
    h = await heads();
    ok(
      h.mon.length === 1 && h.mon[0].includes("Extras $53.00") && !/Charges|got back/i.test(h.mon[0]),
      "Extras: the month's heading, $53.00 (the extra paid back and the tip), as received counts them: " + h.mon
    );
    const d11 = await page.evaluate(() => capFirst(dayLabel(CM + "-11")));
    ok((h.days.find(x => x[0] === d11) || [])[1] === "Extras $53.00", "the payback's day: Extras $53.00: " + J(h.days));
    ok(J(h.chips) === J(["Extras"]), "the chip Extras: " + h.chips);

    // the Filters sheet: Charges and Extras after the other kinds, with counts; picking one hides category and people
    await page.evaluate(() => {
      HF = histBlank();
      render();
    });
    await page.click('#app [data-act="hf-open"]');
    const sheet = () =>
      page.evaluate(() => ({
        kinds: [...document.querySelectorAll('#sheet [data-act="hfs-kind"]')].map(b => [
          b.dataset.v,
          b.textContent.replace("✓", "").trim(),
        ]),
        secs: [...document.querySelectorAll("#sheet .sec")].map(e => e.textContent),
        show: document.querySelector('#sheet [data-act="hfs-show"]').textContent,
      }));
    let s = await sheet();
    const vs = s.kinds.map(k => k[0]);
    ok(
      J(vs.slice(-2)) === J(["charges", "extras"]) && vs.indexOf("fix") < 0 && vs.indexOf("borrow") < vs.length - 2,
      "Charges and Extras come after the other kinds: " + J(vs)
    );
    ok(
      J(s.kinds.slice(-2).map(k => k[1])) === J(["Charges 9", "Extras 2"]),
      "with their counts (rows, archived ones left out): " + J(s.kinds)
    );
    await page.click('#sheet [data-act="hfs-kind"][data-v="charges"]');
    s = await sheet();
    ok(
      !s.secs.some(x => /Category|Lent|Borrowed|Between/.test(x)) && s.show === "Show 9 entries",
      "Charges picked: no category, people or sides to choose, Show 9 entries: " + J(s)
    );
    await page.click('#sheet [data-act="hfs-show"]');
    await page.waitForTimeout(300);
    h = await heads();
    ok(J(h.chips) === J(["Charges"]) && h.btn === "Filters · 1", "Show: the chip Charges and Filters · 1: " + J(h));
    // its chip's ✕ takes it away
    await page.click('#app .hchips [data-act="hf-del"]');
    await page.waitForTimeout(200);
    ok((await page.evaluate(() => HF.kind)) === "", "the chip's ✕ clears the kind");
    // a notebook without any charge or extra offers neither
    await page.evaluate(() => {
      S.txns = S.txns.filter(t => !t.feeOf && !t.feeId && !t.onTop && !t.loan);
      S.loans = [];
      save();
      filtersSheet();
    });
    s = await sheet();
    ok(!s.kinds.some(k => k[0] === "charges" || k[0] === "extras"), "no charge or extra: neither is offered");
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
