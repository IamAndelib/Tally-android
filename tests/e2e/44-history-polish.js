// The design round's small items for History and search (A2–A14 and A16 of docs/specs/design-round.md): period
// suggestions for "may 2025" and "jun 14", suggestions from two letters, recent searches kept as used, the snack for an
// entry that leaves the list, "any account", suggestions hidden while selecting, Clear selection, an empty notebook's
// History, prefilled amounts with the currency's decimals, the true minus in money(), the welcome bar, the reminder
// line, and the name chips with ✕ and Undo (hidden names kept in the settings, migrated, in backups).
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async seed => {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
    await ctx.addInitScript(() => {
      window.__rec = "[]";
      window.Android = {
        getColors: () => null,
        setBars() {},
        recentGet: () => window.__rec,
        recentSet: j => (window.__rec = j),
      };
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(seed, null);
    return page;
  };
  const seed = () => {
    const e = (id, date, type, amount, extra) => ({ id, ts: +id.slice(1), date, type, amount, account: "a", ...extra });
    S = blank();
    S.settings.cur = "USD";
    S.settings.lastCheck = today();
    S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 50000, archived: false });
    S.accounts.push({ id: "b", name: "Cash", type: "cash", currency: "USD", opening: 1000, archived: false });
    S.txns.push(e("t1", "2025-05-10", "expense", 4.5, { payee: "Corner Café", cat: "food" }));
    S.txns.push(e("t2", "2025-05-20", "expense", 12, { payee: "Corner Café", cat: "food" }));
    S.txns.push(e("t3", "2025-06-14", "expense", 7, { payee: "Bakery", cat: "food" }));
    S.txns.push(e("t4", "2024-06-14", "expense", 9, { payee: "Bakery", cat: "food" }));
    S.txns.push(e("t5", "2024-06-14", "income", 100, { payee: "Corner Café", cat: "salary" }));
    S.txns.push(e("t6", "2025-06-01", "expense", 3, { account: "b", cat: "food", note: "kiosk" }));
    S.loans.push({ id: "L1", kind: "lend", person: "Sam", account: "a", date: "2025-06-01", note: "", status: "open" });
    S.loans.push({
      id: "L2",
      kind: "lend",
      person: "Mahin",
      account: "a",
      date: "2025-06-02",
      note: "",
      status: "open",
    });
    S.txns.push(
      e("t7", "2025-06-01", "loan", 10, { dir: "out", loan: "L1", principal: true }),
      e("t8", "2025-06-02", "loan", 10, { dir: "out", loan: "L2", principal: true })
    );
    save();
    V.screen = "history";
    render();
    openFind();
  };
  const type = async (p, v) => {
    await p.fill("#find-q", v);
    await p.waitForTimeout(220);
  };
  const sugs = p =>
    p.evaluate(() =>
      [...document.querySelectorAll("#hbody .sug")].map(b => ({
        t: b.querySelector(".sgt").textContent,
        s: b.querySelector(".s").textContent,
      }))
    );

  // ---- A2: "may 2025" is one Period suggestion, first; nothing says "Nothing matches" under it
  let p = await open(seed);
  await type(p, "may 2025");
  let s = await sugs(p);
  ok(
    s[0] && s[0].t === "May 2025" && /^Period · 2 entries$/.test(s[0].s),
    "A2: May 2025 first: " + JSON.stringify(s[0])
  );
  ok(s.filter(x => /Period/.test(x.s)).length === 1, "A2: one Period suggestion only: " + JSON.stringify(s));
  ok(!(await p.$("#hbody .empty")), "A2: no 'Nothing matches' under it");
  await p.click("#hbody .sug");
  let r = await p.evaluate(() => ({ hp: { ...HP }, q: HF.q, label: periodLabel(HP) }));
  ok(
    r.hp.period === "month" && r.hp.anchor === "2025-05-01" && r.q === "",
    "A2: tapped: that month, words gone: " + JSON.stringify(r)
  );

  // ---- A3: "jun 14" is that day, in each year that has entries on it
  p = await open(seed);
  await type(p, "jun 14");
  s = await sugs(p);
  ok(
    s[0] && s[0].t === "Sat, Jun 14, 2025" && s[0].s === "Period · 1 entry",
    "A3: the day with weekday and year: " + JSON.stringify(s.slice(0, 2))
  );
  ok(
    s[1] && s[1].t === "Fri, Jun 14, 2024" && s[1].s === "Period · 2 entries",
    "A3: older year after it: " + JSON.stringify(s[1])
  );
  ok(!(await p.$("#hbody .empty")), "A3: no 'Nothing matches'");
  await p.click("#hbody .sug");
  r = await p.evaluate(() => ({ ...HP, q: HF.q }));
  ok(r.period === "day" && r.anchor === "2025-06-14" && r.q === "", "A3: tapped: that day: " + JSON.stringify(r));

  // ---- A4: suggestions start from two letters
  p = await open(seed);
  await type(p, "c");
  ok((await sugs(p)).length === 0, "A4: one letter, no suggestions");
  ok(
    (await p.$$("#hbody .tx, #hbody .row")).length > 0 || (await p.$$("#hbody [data-act='row-open']")).length > 0,
    "A4: the entries are listed"
  );
  await type(p, "co");
  ok((await sugs(p)).length > 0, "A4: two letters, suggestions");

  // ---- A5: recent searches kept as used
  p = await open(seed);
  await type(p, "co");
  await p.click("#hbody .sug"); // the payee Corner Café (most used)
  let rec = await p.evaluate(() => recentLoad());
  ok(rec.length === 1, "A5: the suggestion is kept: " + JSON.stringify(rec));
  await p.evaluate(() => findBack());
  await p.evaluate(() => openFind());
  let rows = await p.evaluate(() =>
    [...document.querySelectorAll("#hbody .rec .recq")].map(b => ({
      t: b.querySelector(".recw").textContent,
      emb: !!b.querySelector(".emb"),
      clock: !!b.querySelector(".ic"),
    }))
  );
  ok(
    rows.length === 1 && rows[0].t === "Paid to Corner Café" && rows[0].emb && !rows[0].clock,
    "A5: shown with its emblem, no clock: " + JSON.stringify(rows)
  );
  await p.click("#hbody .rec .recq");
  r = await p.evaluate(() => ({
    pay: HF.pay,
    q: HF.q,
    chip: [...document.querySelectorAll(".hchip")].map(c => c.textContent.trim()),
  }));
  ok(r.pay === "out:corner cafe" && r.q === "", "A5: tapping it sets the filter again: " + JSON.stringify(r));
  // nothing found, and under three letters: not kept
  await p.evaluate(() => (recentSave([]), findBack(), openFind()));
  await type(p, "zzzzz");
  await p.evaluate(() => findBack());
  ok((await p.evaluate(() => recentLoad())).length === 0, "A5: a search that found nothing is not kept");
  await p.evaluate(() => openFind());
  await type(p, "ko");
  await p.evaluate(() => findBack());
  ok((await p.evaluate(() => recentLoad())).length === 0, "A5: under three letters is not kept");
  await p.evaluate(() => openFind());
  await type(p, "kiosk");
  await p.evaluate(() => findBack());
  ok(
    JSON.stringify(await p.evaluate(() => recentLoad())) === '["kiosk"]',
    "A5: words that found something are kept on Back"
  );

  // ---- A6: an entry saved out of the list
  p = await open(seed);
  await p.evaluate(() => {
    findBack();
    HF = { ...histBlank(), acc: "a" };
    render();
    withUndo(T("common.saved"), () => (entry("t1").account = "b"), { row: "t1" });
  });
  let sn = await p.evaluate(() => document.querySelector("#snack").textContent);
  ok(/Saved · no longer in this list/.test(sn) && /Undo/.test(sn), "A6: the snack says so with Undo: " + sn);
  await p.evaluate(() => withUndo(T("common.saved"), () => (entry("t2").note = "x"), { row: "t2" }));
  sn = await p.evaluate(() => document.querySelector("#snack").textContent);
  ok(/^Saved\s*Undo/.test(sn) && !/no longer/.test(sn), "A6: one still listed: plain Saved: " + sn);

  // ---- A7: "any account" in lower case
  p = await open(seed);
  await p.evaluate(() => {
    findBack();
    HF = { ...histBlank(), kind: "xfer" };
    filtersSheet();
  });
  const chips = await p.evaluate(() =>
    [...document.querySelectorAll('#sheet [data-act^="hfs-from"], #sheet [data-act="hfs-to"]')].map(b =>
      b.textContent.trim()
    )
  );
  ok(
    chips.includes("From any account") && chips.includes("To any account"),
    "A7: From any account / To any account: " + chips
  );

  // ---- A8: no suggestions while selecting
  p = await open(seed);
  await type(p, "co");
  ok((await sugs(p)).length > 0, "A8: suggestions before selecting");
  await p.evaluate(() => {
    V.sel = new Set(["t1"]);
    render();
  });
  ok((await sugs(p)).length === 0, "A8: hidden while selecting");

  // ---- A9: everything selected, the button clears
  p = await open(seed);
  await p.evaluate(() => {
    findBack();
    V.screen = "history";
    V.sel = new Set(["t1"]);
    render();
  });
  const sel = () =>
    p.evaluate(() => {
      const b = document.querySelector('[data-act="sel-all"]');
      return { label: b.getAttribute("aria-label"), vb: b.querySelector("svg").getAttribute("viewBox") };
    });
  let b9 = await sel();
  ok(b9.label === "Select all", "A9: not all selected: Select all: " + b9.label);
  await p.click('[data-act="sel-all"]');
  b9 = await sel();
  ok(b9.label === "Clear selection", "A9: all selected: Clear selection: " + b9.label);
  ok(
    await p.evaluate(
      () =>
        !iconSearch("").includes("deselect") && !iconSearch("clear selection").includes("deselect") && !ICONS.deselect
    ),
    "A9: the deselect icon is not an emblem the picker offers"
  );
  ok(
    await p.evaluate(() => document.querySelector('[data-act="sel-all"] svg path').getAttribute("d").length > 100),
    "A9: the button draws it"
  );
  await p.click('[data-act="sel-all"]');
  ok(await p.evaluate(() => V.sel === null || V.sel.size === 0), "A9: tapping it clears the selection");

  // ---- A10: an empty notebook's History keeps Search only
  p = await open(() => {
    S = blank();
    S.settings.cur = "USD";
    S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 0, archived: false });
    save();
    V.screen = "history";
    render();
  });
  r = await p.evaluate(() => ({
    hp: !!document.querySelector(".hp"),
    f: !!document.querySelector(".hfbtn"),
    s: !!document.querySelector('[data-act="search-open"]'),
  }));
  ok(!r.hp && !r.f && r.s, "A10: no period chip or Filters, Search stays: " + JSON.stringify(r));
  await p.evaluate(() => {
    S.txns.push({ id: "t1", ts: 1, date: today(), type: "expense", amount: 1, account: "a", cat: "food" });
    save();
    render();
  });
  ok(!!(await p.$(".hfbtn")) && !!(await p.$(".hp")), "A10: back with the first entry");

  // ---- A11: prefilled amounts keep the currency's decimals
  p = await open(seed);
  await p.evaluate(() => {
    S.txns.push({ id: "t9", ts: 9, date: today(), type: "expense", amount: 4167.5, account: "a", cat: "food" });
    S.accounts.push({ id: "j", name: "Yen", type: "cash", currency: "JPY", opening: 0, archived: false });
    S.txns.push({ id: "t10", ts: 10, date: today(), type: "expense", amount: 4167, account: "j", cat: "food" });
    S.txns.push({ id: "t11", ts: 11, date: today(), type: "expense", amount: 1.125, account: "a", cat: "food" });
    save();
    findBack();
  });
  const pre = id => p.evaluate(id => (txSheet(id, "expense"), document.querySelector("#f-amt").value), id);
  ok((await pre("t9")) === "4,167.50", "A11: 4,167.50: " + (await pre("t9")));
  await p.evaluate(() => closeSheet());
  ok((await pre("t10")) === "4,167", "A11: a yen has none: " + (await pre("t10")));
  await p.evaluate(() => closeSheet());
  ok((await pre("t11")) === "1.125", "A11: more decimals than the currency's are kept: " + (await pre("t11")));
  await p.evaluate(() => closeSheet());

  // ---- A12: money() writes the true minus
  r = await p.evaluate(() => [money(-5, "USD"), money(5, "USD"), money(-0.001, "USD"), signed(-5, "USD")]);
  ok(
    r[0] === "−⁠$5.00" && r[1] === "$5.00" && r[2] === "$0.00" && r[3] === "−⁠$5.00",
    "A12: true minus: " + JSON.stringify(r)
  );

  // ---- A13: the welcome screen's bar holds only Settings
  p = await open(() => {
    S = blank();
    save();
    V.screen = "home";
    render();
  });
  r = await p.evaluate(() =>
    [...document.querySelectorAll("header.appbar button")].map(b => b.dataset.act + ":" + (b.dataset.v || ""))
  );
  ok(r.length === 1 && r[0] === "go:settings", "A13: only Settings: " + JSON.stringify(r));

  // ---- A14: the reminder line
  r = await p.evaluate(() => T("remind.duesHint"));
  ok(r === "On the due day, or monthly when there is none", "A14: reminder text: " + r);

  // ---- A16: name chips with ✕ and Undo
  p = await open(seed);
  await p.evaluate(() => {
    findBack();
    V.screen = "home";
    render();
    loanForm("lend");
  });
  const names = () =>
    p.evaluate(() =>
      [...document.querySelectorAll("#f-person-sug .nchip")].map(c => c.querySelector(".chn").textContent)
    );
  ok((await names()).join() === "Mahin,Sam", "A16: people as chips: " + (await names()));
  r = await p.evaluate(() => {
    const c = document.querySelector("#f-person-sug .nchip"),
      x = c.querySelector(".nchip-x"),
      pk = c.querySelector(".nchip-pick"),
      b = c.getBoundingClientRect(),
      xr = x.getBoundingClientRect(),
      after = getComputedStyle(x, "::after");
    return {
      h: Math.round(b.height),
      label: x.getAttribute("aria-label"),
      pick: pk.dataset.act,
      xh: xr.height,
      afterH: parseFloat(after.height),
    };
  });
  ok(r.h === 34 || r.h === 35, "A16: compact 34px chip: " + r.h);
  ok(
    r.label === "Remove “Mahin” from suggestions" && r.pick === "f-person-pick",
    "A16: labelled ✕, name still picks: " + JSON.stringify(r)
  );
  await p.click("#f-person-sug .nchip .nchip-x");
  ok((await names()).join() === "Sam", "A16: Mahin gone from the chips");
  sn = await p.evaluate(() => document.querySelector("#snack").textContent);
  ok(/Removed “Mahin” from suggestions/.test(sn) && /Undo/.test(sn), "A16: the snack with Undo: " + sn);
  r = await p.evaluate(() => ({ h: S.settings.hiddenPeople, loans: S.loans.length, txns: S.txns.length }));
  ok(
    JSON.stringify(r.h) === '["mahin"]' && r.loans === 2 && r.txns === 8,
    "A16: stored folded, entries untouched: " + JSON.stringify(r)
  );
  await p.click('#snack [data-act="undo"]');
  ok(
    (await names()).join() === "Mahin,Sam" && (await p.evaluate(() => S.settings.hiddenPeople.length)) === 0,
    "A16: Undo brings it back"
  );
  await p.click("#f-person-sug .nchip .nchip-x");
  await p.evaluate(() => closeSheet());
  await p.evaluate(() => loanForm("lend"));
  ok((await names()).join() === "Sam", "A16: still hidden in the next form: " + (await names()));
  // hiding a name only takes it out of the chips: typing it in full still offers to add to that person's open tab
  await p.fill("#f-person", "Mahin");
  await p.fill("#f-amt", "5");
  r = await p.evaluate(() => ({
    merge: F.merge,
    hint: !$("#f-mergehint").hidden && $("#f-mergehint").textContent,
    chips: [...document.querySelectorAll("#f-person-sug .nchip .chn")].map(c => c.textContent),
  }));
  ok(
    r.merge === "L2" && /Mahin/.test(r.hint) && !r.chips.includes("Mahin"),
    "A16: hidden Mahin still merges: " + JSON.stringify(r)
  );
  await p.click('[data-act="loan-save"]');
  r = await p.evaluate(() => ({
    mahin: S.loans.filter(l => l.person === "Mahin").length,
    drawn: S.txns.filter(t => t.loan === "L2" && t.principal).length,
  }));
  ok(r.mahin === 1 && r.drawn === 2, "A16: saving added to the open tab, no second one: " + JSON.stringify(r));
  await p.evaluate(() => (closeSheet(), loanForm("lend")));
  // currencies in Assets' net worth and Liabilities' "You owe": the notebook's own first, the others by code
  r = await p.evaluate(() => {
    const h = document.createElement("div");
    h.innerHTML = curLines({ EUR: 5, GBP: 3, USD: 2, AUD: 1 });
    return [...h.querySelectorAll(".big")].map(x => x.textContent.replace(/[\d.,\s\u00a0\u2060\u2212-]/g, ""));
  });
  ok(r.join() === "$,A$,€,£", "curLines: the main currency first, the rest by code: " + r);
  // a one-character name (common in Chinese) still gives both buttons a 48px tap area
  r = await p.evaluate(() => {
    const box = $("#f-person-sug");
    box.hidden = false;
    box.insertAdjacentHTML("beforeend", nameChip("people", "f-person-pick", "x", "王"));
    const c = box.lastElementChild,
      area = el => {
        const b = el.getBoundingClientRect(),
          a = getComputedStyle(el, "::after");
        return { w: Math.max(b.width, parseFloat(a.width)), h: Math.max(b.height, parseFloat(a.height)) };
      };
    const out = { pick: area(c.querySelector(".nchip-pick")), x: area(c.querySelector(".nchip-x")), h: c.offsetHeight };
    c.remove();
    return out;
  });
  ok(
    r.pick.w >= 48 && r.pick.h >= 48 && r.x.w >= 48 && r.x.h >= 48 && r.h <= 35,
    "A16: a one-character name has 48px targets and the same chip height: " + JSON.stringify(r)
  );
  // payees, after a letter
  await p.evaluate(() => (closeSheet(), txSheet(null, "expense", "food")));
  await p.fill("#f-payee", "co");
  let pn = await p.evaluate(() => [...document.querySelectorAll("#f-payee-sug .nchip .chn")].map(c => c.textContent));
  ok(pn.join() === "Corner Café", "A16: payees as chips: " + pn);
  await p.click("#f-payee-sug .nchip .nchip-x");
  sn = await p.evaluate(() => document.querySelector("#snack").textContent);
  ok(/Removed “Corner Café” from suggestions/.test(sn), "A16: payee snack: " + sn);
  r = await p.evaluate(() => ({
    h: S.settings.hiddenPayees,
    hp: S.settings.hiddenPeople,
    n: document.querySelectorAll("#f-payee-sug .nchip").length,
  }));
  ok(
    JSON.stringify(r.h) === '["corner cafe"]' && r.n === 0 && r.hp.join() === "mahin",
    "A16: payees kept apart from people: " + JSON.stringify(r)
  );
  await p.evaluate(() => (closeSheet(), txSheet(null, "income")));
  await p.fill("#f-payee", "co");
  ok((await p.$$("#f-payee-sug .nchip")).length === 0, "A16: hidden for money in too (the same payees)");
  // typing the full name is still possible and picking works
  await p.evaluate(() => closeSheet());

  // migration and backups
  r = await p.evaluate(() => {
    const many = Array.from({ length: 250 }, (_, i) => "n" + i);
    const m = migrate({
      v: 9,
      settings: { cur: "USD", hiddenPeople: ["Sam", "SAM", 5, null, "Émile", ""], hiddenPayees: many },
    });
    const old = migrate({ v: 9, settings: { cur: "USD" } });
    const bad = migrate({ v: 9, settings: { cur: "USD", hiddenPeople: "x", hiddenPayees: { a: 1 } } });
    const back = migrate(JSON.parse(JSON.stringify(S)));
    return {
      people: m.settings.hiddenPeople,
      payees: m.settings.hiddenPayees.length,
      old: [old.settings.hiddenPeople, old.settings.hiddenPayees],
      bad: [bad.settings.hiddenPeople, bad.settings.hiddenPayees],
      back: [back.settings.hiddenPeople, back.settings.hiddenPayees],
    };
  });
  ok(
    JSON.stringify(r.people) === '["sam","emile"]',
    "A16 migrate: strings, folded, unique: " + JSON.stringify(r.people)
  );
  ok(r.payees === 200, "A16 migrate: capped at 200: " + r.payees);
  ok(
    JSON.stringify(r.old) === "[[],[]]" && JSON.stringify(r.bad) === "[[],[]]",
    "A16 migrate: older saves and junk get []: " + JSON.stringify([r.old, r.bad])
  );
  ok(JSON.stringify(r.back) === '[["mahin"],["corner cafe"]]', "A16: a backup carries them: " + JSON.stringify(r.back));

  // ---- A1: while selecting, the period / Filters row stays, dimmed and out of reach
  p = await open(seed);
  await p.evaluate(() => {
    findBack();
    HF = { ...histBlank(), kind: "out", cat: "food" };
    V.screen = "history";
    V.sel = null;
    render();
  });
  const top = () =>
    p.evaluate(() => {
      const y = sel => Math.round(document.querySelector(sel).getBoundingClientRect().top + scrollY); // in the page: the view may follow its middle row
      const win = sel => Math.round(document.querySelector(sel).getBoundingClientRect().top); // pinned: in the window
      const bar = document.querySelector(".hbar");
      return {
        bar: win(".hfbtn"),
        chip: win(".hchip"),
        row: y("#app .tx, #app [data-act='row-open']"),
        off: [...document.querySelectorAll(".hbar button")].every(b => b.disabled),
        dim: +getComputedStyle(bar).opacity,
        pe: getComputedStyle(bar).pointerEvents,
      };
    });
  await p.evaluate(() => (render(), scrollTo(0, 0)));
  const before = await top();
  await p.evaluate(() => {
    V.sel = new Set(["t1"]);
    render();
  });
  const during = await top();
  ok(
    before.bar === during.bar && before.row === during.row && before.chip === during.chip,
    "A1: nothing moves when selecting starts: " + JSON.stringify([before, during])
  );
  ok(
    during.off && during.dim < 0.6 && during.pe === "none",
    "A1: the row is there, dimmed, not tappable and not focusable: " + JSON.stringify(during)
  );
  ok(!before.off && before.dim === 1, "A1: normal before selecting");
  await p.evaluate(() => {
    V.sel = null;
    render();
  });
  const after = await top();
  ok(
    after.bar === before.bar && after.row === before.row && !after.off,
    "A1: nothing moves when it ends: " + JSON.stringify(after)
  );

  // ---- A15: the chips continue on the Filters line, Clear all last
  r = await p.evaluate(() => {
    const bar = document.querySelector(".hbar"),
      f = document.querySelector(".hfbtn").getBoundingClientRect(),
      chips = [...document.querySelectorAll(".hbar .hchip")],
      c0 = chips[0].getBoundingClientRect(),
      kids = [...bar.querySelectorAll("button")],
      clear = bar.querySelector('[data-act="hf-clear"]');
    return {
      n: chips.length,
      sameLine: Math.abs(c0.top + c0.height / 2 - (f.top + f.height / 2)) < 6,
      after: c0.left >= f.right,
      lastIsClear: kids[kids.length - 1] === clear,
      oneBlock:
        !document.querySelector("#app > .hchips, #app > div > .hchips") ||
        getComputedStyle(document.querySelector(".hchips")).display === "contents",
      h: chips.map(c => Math.round(c.getBoundingClientRect().height)),
    };
  });
  ok(r.n === 2 && r.sameLine && r.after, "A15: the first chip sits on the Filters line: " + JSON.stringify(r));
  ok(
    r.lastIsClear && r.oneBlock && r.h.every(h => h >= 48),
    "A15: Clear all is the last item, chips keep 48px: " + JSON.stringify(r)
  );

  // ---- fix round: malformed recents, one CJK character, the dimmed row hidden from TalkBack, one cap
  p = await open(seed);
  await p.evaluate(() => {
    findBack();
    recentSave([
      "\u0001pay\u0001\u0001",
      "\u0001",
      "\u0001nope\u0001\u0001Corner Café\u0001co",
      "\u0001pay\u0001\u0001Gone Shop\u0001gone",
      "plain words",
    ]);
    openFind();
  });
  r = await p.evaluate(() => ({
    rows: [...document.querySelectorAll("#hbody .rec .recw")].map(x => x.textContent),
    raw: document.querySelector("#hbody").textContent.includes("\u0001"),
  }));
  ok(
    r.rows.join("|") === "plain words" && !r.raw,
    "malformed or gone recents are dropped, plain words stay words, nothing raw: " + JSON.stringify(r)
  );
  await p.evaluate(
    () => (findBack(), recentSave(["\u0001pay\u0001\u0001", "\u0001pay\u0001\u0001Corner Café\u0001co"]), openFind())
  );
  await p.click("#hbody .rec .recq");
  ok((await p.evaluate(() => HF.pay)) === "out:corner cafe", "a valid one still applies, beside a malformed one");

  p = await open(seed);
  await p.evaluate(() => {
    S.txns.push({
      id: "t20",
      ts: 20,
      date: "2025-05-11",
      type: "expense",
      amount: 2,
      account: "a",
      cat: "food",
      payee: "茶館",
    });
    save();
    render();
  });
  await type(p, "茶");
  ok(
    (await sugs(p)).length > 0,
    "one CJK character is a word: suggestions start from it: " + JSON.stringify(await sugs(p))
  );
  await type(p, "c");
  ok((await sugs(p)).length === 0, "one Latin letter still gives none");

  p = await open(seed);
  await p.evaluate(() => {
    findBack();
    V.sel = new Set(["t1"]);
    render();
  });
  r = await p.evaluate(() => {
    const bar = document.querySelector(".hbar");
    return {
      hidden: bar.getAttribute("aria-hidden"),
      all: [...bar.querySelectorAll("button")].every(b => b.disabled && b.tabIndex === -1),
    };
  });
  ok(
    r.hidden === "true" && r.all,
    "A1: the dimmed row is aria-hidden and its controls are out of the tab order: " + JSON.stringify(r)
  );
  await p.evaluate(() => {
    V.sel = null;
    render();
  });
  r = await p.evaluate(() => {
    const bar = document.querySelector(".hbar");
    return {
      hidden: bar.getAttribute("aria-hidden"),
      all: [...bar.querySelectorAll("button")].every(b => !b.disabled && b.tabIndex === 0),
    };
  });
  ok(r.hidden === null && r.all, "A1: the row comes back after selecting: " + JSON.stringify(r));

  r = await p.evaluate(() => {
    const names = Array.from({ length: 250 }, (_, i) => "n" + i);
    const m = migrate({ v: 9, settings: { cur: "USD", hiddenPeople: names, hiddenPayees: names } });
    S.settings.hiddenPayees = names.slice(0, 200).map(n => curFold(n));
    hideName("payees", "Newest One");
    return {
      m: [m.settings.hiddenPeople[0], m.settings.hiddenPeople[199]],
      h: [S.settings.hiddenPayees.length, S.settings.hiddenPayees[0], S.settings.hiddenPayees[199]],
    };
  });
  ok(r.m.join() === "n50,n249", "migrate keeps the newest 200: " + r.m);
  ok(r.h.join() === "200,n1,newest one", "hideName keeps the newest 200: " + r.h);

  // ---- recent searches: Clear all and Undo
  p = await open(seed);
  await p.evaluate(() => (findBack(), recentSave([]), openFind()));
  ok(!(await p.$(".recall")), "no recent searches: no Clear all");
  const list5 = ["bakery", "corner", "cafe"];
  await p.evaluate(l => (findBack(), recentSave(l), openFind()), list5);
  r = await p.evaluate(() => {
    const b = document.querySelector(".recall"),
      h = document.querySelector(".rechead .sec"),
      br = b.getBoundingClientRect(),
      hr = h.getBoundingClientRect();
    return {
      label: b.getAttribute("aria-label"),
      text: b.textContent,
      h: Math.round(br.height),
      w: br.width,
      line: Math.abs(br.top + br.height / 2 - (hr.top + hr.height / 2)) < 12,
      end: br.right > hr.right - 1,
    };
  });
  ok(
    r.label === "Clear all recent searches" && r.text === "Clear all" && r.h >= 48 && r.line && r.end,
    "Clear all ends the heading line, 48px: " + JSON.stringify(r)
  );
  await p.click(".recall");
  r = await p.evaluate(() => ({
    rec: window.__rec,
    rows: document.querySelectorAll("#hbody .rec").length,
    focus: document.activeElement.id,
    snack: document.querySelector("#snack").textContent,
  }));
  ok(
    r.rec === "[]" &&
      r.rows === 0 &&
      r.focus === "find-q" &&
      /Recent searches cleared/.test(r.snack) &&
      /Undo/.test(r.snack),
    "Clear all empties the list, focus in the field, snack: " + JSON.stringify(r)
  );
  await p.click('#snack [data-act="undo"]');
  r = await p.evaluate(() => ({
    rec: window.__rec,
    find: V.find,
    rows: [...document.querySelectorAll("#hbody .rec .recw")].map(x => x.textContent),
  }));
  ok(
    r.rec === JSON.stringify(list5) && r.find && r.rows.join() === list5.join(),
    "Undo puts the list back, in order, search still open: " + JSON.stringify(r)
  );
  await p.click('#hbody [aria-label="Forget: corner"]');
  sn = await p.evaluate(() => document.querySelector("#snack").textContent);
  ok(
    /Removed “corner” from recent searches/.test(sn) &&
      /Undo/.test(sn) &&
      (await p.evaluate(() => window.__rec)) === '["bakery","cafe"]',
    "a single ✕ says so with Undo: " + sn
  );
  await p.click('#snack [data-act="undo"]');
  ok((await p.evaluate(() => window.__rec)) === JSON.stringify(list5), "Undo puts it back in its place");

  // ---- the pinned header while selecting, in search and on a phone held sideways (docs/specs/history-archive.md, A3–A5)
  {
    const pinned = async (vp, scale = 1) => {
      const ctx = await browser.newContext({ viewport: vp, screen: vp, locale: "en-US" });
      await ctx.addInitScript(s => {
        window.Android = { getColors: () => null, setBars() {}, fontScale: () => s };
      }, scale);
      const page = await ctx.newPage();
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(appUrl);
      await page.evaluate(() => {
        S = blank();
        S.settings.cur = "USD";
        S.settings.lastCheck = today();
        S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 90000, archived: false });
        let n = 0;
        const day = (m, d) => "2026-" + m + "-" + String(d).padStart(2, "0");
        [
          ["06", 17],
          ["05", 31],
          ["04", 30],
        ].forEach(([m, last]) => {
          for (let d = last; d >= 1; d--)
            for (let i = 0; i < 3; i++)
              S.txns.push({
                id: "q" + ++n,
                ts: n,
                date: day(m, d),
                type: i === 2 ? "income" : "expense",
                amount: 10 + i,
                account: "a",
                cat: i === 2 ? "salary" : "food",
                payee: i ? "Green Market" : "Corner Café",
              });
        });
        save();
        openHistory({});
      });
      return { ctx, page };
    };
    const frame = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    /* halfway through June */
    const midJune = p =>
      p.evaluate(() => {
        const t = m =>
          [...document.querySelectorAll("#app .hmon")]
            .find(h => h.getAttribute("aria-label").startsWith(m))
            .getBoundingClientRect().top + scrollY;
        scrollTo(0, Math.round((t("June") + t("May")) / 2));
      });
    const look = p =>
      p.evaluate(() => {
        const W = innerWidth,
          box = e => (e ? e.getBoundingClientRect() : null),
          at = (x, y) => document.elementFromPoint(x, y) || document.body,
          bar = box($("#app .appbar")),
          fb = box($("#app .hfbtn")),
          seen = (r, sel) => !!r && r.bottom > 0 && !!at(r.left + r.width / 2, r.top + r.height / 2).closest(sel),
          heads = [...document.querySelectorAll("#app .hmon")].map(h => [h, box(h)]),
          /* the heading that stands right under the bar and the Filters row, if one does */
          under = (fb && fb.bottom > 0 ? fb.bottom : bar.bottom) + 0,
          hd = heads.find(([, r]) => r.top >= under - 1 && r.top < under + 14 && r.bottom > under),
          hcl = hd ? [...hd[0].querySelectorAll(".hcl")].map(x => Math.round(box(x).top)) : [];
        return {
          y: scrollY,
          bar: bar && Math.abs(bar.top) < 1 && seen(bar, ".appbar"),
          barBottom: bar.bottom,
          fb: !!fb && fb.top >= bar.bottom - 1 && fb.bottom > 0 && fb.top < innerHeight,
          fbTop: fb ? fb.top : null,
          fbBottom: fb ? fb.bottom : null,
          rowUnderFb: !!fb && !!at(fb.left + fb.width / 2, fb.top + fb.height / 2).closest(".tx, .dayh, .hmon"),
          head: hd ? hd[0].getAttribute("aria-label").split(",")[0] : "",
          headTop: hd ? hd[1].top : null,
          headBottom: hd ? hd[1].bottom : null,
          headSeen: !!hd && seen(hd[1], ".hmon"),
          oneLine: hcl.length > 1 && new Set(hcl).size === 1,
          /* what is right under the pinned part: a row or day heading means no month heading is held there */
          next: (() => {
            const e = at(W / 2, (fb && fb.bottom > 0 ? fb.bottom : bar.bottom) + 6);
            return e.closest(".hmon") ? "month" : e.closest(".tx, .dayh, .dl") ? "entries" : e.className;
          })(),
        };
      });

    /* selecting: the bar ("1 selected") and the dimmed Filters row stay; the month headings scroll with the entries */
    let { ctx, page } = await pinned({ width: 393, height: 852 });
    await page.evaluate(() => {
      V.sel = new Set([histRows(HLIST)[5].id]);
      render();
    });
    await page.waitForTimeout(300); // render() keeps the row in view in place for a moment (toAnchor)
    await midJune(page);
    await frame(page);
    let L = await look(page);
    ok(
      L.y > 300 && L.bar && (await page.evaluate(() => $("#app .appbar h1").textContent)) === "1\u00a0selected",
      "selecting: the bar with its count stays at the top: " + JSON.stringify(L)
    );
    ok(L.fb && !L.rowUnderFb, "selecting: the dimmed Filters row stays under it: " + JSON.stringify(L));
    ok(!L.head && L.next === "entries", "selecting: no month heading is held at the top: " + JSON.stringify(L));
    await ctx.close();

    /* search: the field and the Filters row stay, and the month heading under them */
    ({ ctx, page } = await pinned({ width: 393, height: 852 }));
    await page.evaluate(() => {
      openFind();
      $("#find-q").value = "market";
      findInput("market");
      findDraw();
      document.activeElement.blur();
    });
    await midJune(page);
    await frame(page);
    L = await look(page);
    const field = await page.evaluate(() => {
      const r = $("#find-q").getBoundingClientRect();
      return document.elementFromPoint(r.left + 10, r.top + r.height / 2) === $("#find-q") && r.top >= 0;
    });
    ok(L.y > 300 && L.bar && field, "search: the field stays at the top: " + JSON.stringify(L));
    ok(L.fb && !L.rowUnderFb, "search: the Filters row stays under it");
    ok(L.head === "June 2026" && L.headSeen, "search: June's heading stays under them: " + JSON.stringify(L));
    await ctx.close();

    /* a phone held sideways (800 × 360, text 1.3×): the bar and a one-line month heading stay; the Filters row scrolls
       away with the entries and comes back as soon as the list scrolls up */
    ({ ctx, page } = await pinned({ width: 800, height: 360 }, 1.3));
    ok(await page.evaluate(() => document.body.classList.contains("land")), "sideways: the sideways layout");
    await page.evaluate(() => scrollTo(0, 0));
    await page.mouse.move(400, 250);
    const atTop = await look(page);
    await midJune(page);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(250);
    L = await look(page);
    ok(L.bar, "sideways: the bar stays at the top: " + JSON.stringify(L));
    ok(!L.fb, "sideways: the Filters row has scrolled away: " + JSON.stringify(L));
    ok(
      L.head === "June 2026" && L.headSeen && Math.abs(L.headTop - L.barBottom) < 2,
      "sideways: June's heading stays right under the bar: " + JSON.stringify(L)
    );
    ok(L.oneLine, "sideways: the month heading on one line, its + and − side by side");
    ok(
      L.headBottom !== null && L.headBottom <= 360 * 0.4,
      "sideways: the pinned part takes about a third of the height: " + L.headBottom
    );
    await page.mouse.wheel(0, -60);
    await page.waitForTimeout(250);
    L = await look(page);
    ok(
      L.bar && L.fb && !L.rowUnderFb && Math.abs(L.fbTop - atTop.fbTop) < 2,
      "sideways: scrolling up brings the Filters row back under the bar: " + JSON.stringify([L, atTop.fbTop])
    );
    ok(
      L.head === "June 2026" && L.headSeen && L.headTop >= L.fbBottom - 1,
      "sideways: the month heading under it, uncovered: " + JSON.stringify(L)
    );
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(250);
    L = await look(page);
    ok(L.bar && !L.fb && L.head === "June 2026", "sideways: scrolling down again takes it away: " + JSON.stringify(L));
    await ctx.close();
  }

  ok(errors.length === 0, "no page errors: " + errors.join(" | "));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
