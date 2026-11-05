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
      const ids = l => l.map(t => t.id).join();
      const x = histList({ ...HF, kind: "xfer" });
      const got = histList({ ...HF, kind: "in" });
      const lend = histList({ ...HF, kind: "lend" });
      const out = {
        xids: ids(x),
        xrows: ids(histRows(x)),
        xwords: histWords(x, "xfer"),
        in: histWords(got, "in"),
        lend: histWords(lend, "lend"),
        borrow: histWords(histList({ ...HF, kind: "borrow" }), "borrow"),
        fix: histWords(histList({ ...HF, kind: "fix" }), "fix"),
        all: histWords(histList(), ""),
        spent: histWords(histList({ ...HF, kind: "out" }), "out"),
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
    ok(JSON.stringify(r.xwords) === '["$240.00 moved","$2.00 fees"]', "transfer words: " + JSON.stringify(r.xwords));
    ok(JSON.stringify(r.in) === '["€80.00 + $150.00 received"]', "received words: " + JSON.stringify(r.in));
    ok(JSON.stringify(r.lend) === '["$50.00 lent"]', "lent words, no zero got back: " + JSON.stringify(r.lend));
    ok(
      JSON.stringify(r.borrow) === '["$600.00 borrowed","$100.00 paid back","$1.00 fees"]',
      "borrowed words: " + JSON.stringify(r.borrow)
    );
    ok(JSON.stringify(r.fix) === '["$10.00 added","$4.00 taken off"]', "fix words: " + JSON.stringify(r.fix));
    ok(
      JSON.stringify(r.all) === '["$30.00 spent","€80.00 + $150.00 received","$3.00 fees"]',
      "all words (loans and transfers are neither): " + JSON.stringify(r.all)
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
      r.drop === '{"acc":"","kind":"out","cat":"","who":"","from":"b","to":""}',
      "gone account, category and person are dropped: " + r.drop
    );
    ok(r.orphan, "a fee whose entry is gone stays a row");
    ok(r.cleared === '{"acc":"","kind":"","cat":"","who":"","from":"","to":""}all', "histClear: " + r.cleared);
    ok(r.opened === "bhistoryall", "openHistory sets the filter and all time: " + r.opened);
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
    ok((await page.getAttribute("#app .hfsum", "role")) === "status", "the summary line is a status region");
    const mons = await page.evaluate(() => [...document.querySelectorAll("#app .hmon")].map(e => e.textContent));
    const yr = new Date().getFullYear() - 1;
    ok(
      mons.length === 2 && mons[0].startsWith("June " + yr) && mons[0].includes("$30.00 spent · $100.00 received"),
      "month headings carry the month's words: " + JSON.stringify(mons)
    );
    ok(mons[1].startsWith("May " + yr) && mons[1].includes("$5.00 spent"), "second month: " + mons[1]);

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
    await act("hf-clear");
    r = await sub();
    ok(
      (await page.evaluate(() => JSON.stringify(HF) + HP.period)) ===
        '{"acc":"","kind":"","cat":"","who":"","from":"","to":""}all' && r.clear === 0,
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
    // selection hides the rows above; Select all takes the listed
    await page.evaluate(() => {
      HF.acc = "c";
      render();
    });
    await act("sel-start");
    ok(
      (await page.$("#app .hbar")) === null && (await page.$("#app .hchips")) === null,
      "selection hides the period and filter rows"
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
      (await page.evaluate(() => JSON.stringify(HF))) === '{"acc":"","kind":"","cat":"","who":"","from":"","to":""}',
      "leaving History and coming back resets the filters"
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
