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
      r.drop === '{"acc":"","kind":"out","cat":"","who":"","from":"","to":""}',
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
          t: b.textContent.replace(/\s+/g, " ").trim(),
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
        z = getComputedStyle(c, "::before");
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
      /From Any account/.test(r.from) && /To Any account/.test(r.to) && !r.hint,
      "From any account, To any account, no hint: " + r.from + " / " + r.to
    );
    ok(r.hfd.includes('"who":""'), "changing the kind drops the person");
    await page.click('#sheet [data-act="hfs-from"]');
    await page.click('#pop [data-act="hfs-pick"][data-v="b"]');
    r = await sheet();
    ok(/From Everyday/.test(r.from) && /To Any account/.test(r.to), "From Everyday: " + r.from + " / " + r.to);
    await tap("hfs-swap");
    r = await sheet();
    ok(/From Any account/.test(r.from) && /To Everyday/.test(r.to), "swap swaps: " + r.from + " / " + r.to);
    await tap("hfs-swap");
    // with Credit card picked
    await tap("hfs-acc", "k");
    r = await sheet();
    ok(
      /From Any account/.test(r.from) && /To Any account/.test(r.to) && r.hint === "One side is Credit card",
      "both any, with the hint: " + r.from + " / " + r.to + " / " + r.hint
    );
    ok(r.show === "Show 3 entries", "every transfer in and out of it: " + r.show);
    await page.click('#sheet [data-act="hfs-from"]');
    const menu = await page.evaluate(() => ({
      role: document.querySelector("#pop [role=dialog]") && 1,
      items: [...document.querySelectorAll('#pop [data-act="hfs-pick"]')].map(b => ({
        v: b.dataset.v,
        t: b.textContent.replace(/\s+/g, " ").trim(),
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
      r.hfd === '{"acc":"","kind":"","cat":"","who":"","from":"","to":""}' &&
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

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
