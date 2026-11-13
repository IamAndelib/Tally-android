// Search inside History, part 1: the words, a payee and an amount as History filters (histMatch), their chips,
// "Filters · N", Clear all and the folded-text cache.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
  await ctx.addInitScript(() => {
    window.Android = { getColors: () => null, setBars() {} };
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  await page.evaluate(() => {
    const d = today(),
      e = (id, type, amount, extra) => ({ id, ts: +id.slice(1), date: d, type, amount, account: "a", ...extra });
    S = blank();
    S.settings.cur = "USD";
    S.settings.lastCheck = d;
    S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 50000, archived: false });
    S.accounts.push({ id: "b", name: "Cash", type: "cash", currency: "USD", opening: 1000, archived: false });
    S.txns.push(e("t1", "expense", 4.75, { payee: "Corner Café", cat: "food" }));
    S.txns.push(e("t2", "expense", 50, { payee: "corner cafe", cat: "food" }));
    S.txns.push(e("t3", "expense", 50.99, { payee: "Fresh Corner", cat: "food" }));
    S.txns.push(e("t4", "expense", 51, { payee: "Bakery", cat: "food" }));
    S.txns.push(e("t5", "income", 120, { payee: "Corner Café", cat: "salary" }));
    S.txns.push(e("t6", "transfer", 30, { to: "b", toAmount: 70, note: "to wallet" }));
    S.txns.push(e("t7", "expense", 2, { feeOf: "t6", note: "charges" }));
    S.txns[5].feeId = "t7";
    S.txns.push(e("t8", "expense", 49.99, { payee: "Kiosk", cat: "food" }));
    save();
    window.ids = (f, skip) =>
      S.txns
        .filter(t => histMatch(t, { ...histBlank(), ...f }, skip))
        .map(t => t.id)
        .sort();
  });
  const ids = (f, skip) => page.evaluate(([f, s]) => ids(f, s), [f, skip]);
  const eq = async (f, want, msg) => {
    const got = await ids(f);
    ok(JSON.stringify(got) === JSON.stringify(want), msg + ": " + got);
  };

  const blank = await page.evaluate(() => histBlank());
  ok(blank.q === "" && blank.pay === "" && blank.amt === "", "histBlank has q, pay and amt: " + JSON.stringify(blank));

  await eq({ q: "corner" }, ["t1", "t2", "t3", "t5"], "words keep Corner Café and Fresh Corner (both kinds)");
  await eq({ q: "CAFÉ" }, ["t1", "t2", "t5"], "capitals and accents ignored");
  await eq({ q: "4.75" }, ["t1"], "a number finds its amount");
  await eq({ q: "charges" }, ["t6", "t7"], "a word only a fee has finds the transfer (and the fee follows it)");
  await eq({ q: "wallet charges" }, ["t6", "t7"], "words from the transfer and its fee together");
  await eq({ q: "zzz" }, [], "nothing found");
  await eq({ q: "corner", kind: "in" }, ["t5"], "words narrow together with the other filters");
  await eq({ pay: "out:corner cafe" }, ["t1", "t2"], "payee, spending only, whatever capitals and accents");
  await eq({ pay: "in:corner cafe" }, ["t5"], "payee, income only");
  await eq({ pay: "out:bakery" }, ["t4"], "another payee");
  await eq(
    { amt: "gt:50" },
    ["t3", "t4", "t5", "t6", "t7"],
    "more than 50 (the transfer's 70 counts, its fee follows)"
  );
  await eq({ amt: "lt:50" }, ["t1", "t6", "t7", "t8"], "less than 50 (the transfer's 30, its fee follows)");
  await eq({ amt: "eq:50:51" }, ["t2", "t3"], "50.00 to 50.99");
  await eq({ amt: "eq:70:71" }, ["t6", "t7"], "a transfer matches on the amount it received too");
  await eq({ amt: "eq:4.75:4.755" }, ["t1"], "an exact amount");
  await eq({ q: "corner", pay: "out:corner cafe", amt: "gt:10" }, ["t2"], "all three together");

  // the folded cache: one fold per entry until the next save
  const c = await page.evaluate(() => {
    const t = S.txns[0],
      a = srFolded(t),
      b = srFolded(t);
    const same = a === b;
    S.txns[0].payee = "Changed";
    const stale = srFolded(t) === a && srFolded(t).includes("corner cafe");
    save();
    const fresh = srFolded(t).includes("changed");
    S.txns[0].payee = "Corner Café";
    save();
    return { same, stale, fresh, has: srFolded(S.txns[1]).includes("corner cafe") };
  });
  ok(c.same && c.stale, "srFolded is kept until the next save: " + JSON.stringify(c));
  ok(c.fresh && c.has, "srFolded is rebuilt after save()");

  // chips and the count
  await page.evaluate(() => {
    V.screen = "history";
    HF = { ...histBlank(), pay: "out:corner cafe", amt: "eq:50:51", q: "corner" };
    render();
  });
  const chips = () =>
    page.evaluate(() => ({
      chips: [...document.querySelectorAll("#app .hchips .hchip")].map(b => b.textContent.trim()),
      label: document.querySelector("#app .hfbtn").textContent.trim(),
      aria: [...document.querySelectorAll("#app .hchips .hchip")].map(b => b.getAttribute("aria-label")),
      count: histCount(),
    }));
  let r = await chips();
  ok(r.chips.includes("Paid to corner cafe"), "pay chip with the newest spelling: " + r.chips);
  ok(r.chips.includes("$50.00 to $50.99"), "amount chip: " + r.chips);
  ok(r.chips.length === 2, "the words are not a chip: " + r.chips);
  ok(r.count === 2 && r.label === "Filters · 2", "Filters · 2 (words not counted): " + r.label);
  ok(r.aria.includes("Remove filter: Paid to corner cafe"), "chip aria-label: " + r.aria);
  const labels = await page.evaluate(() => [
    srAmtLabel("gt:50"),
    srAmtLabel("lt:50"),
    srAmtLabel("eq:4.75:4.755"),
    ((HF.pay = "in:corner cafe"), histChips()),
  ]);
  ok(labels[0] === "More than $50.00" && labels[1] === "Less than $50.00", "gt/lt labels: " + labels);
  ok(labels[2] === "$4.75", "exact amount label: " + labels[2]);
  ok(/Received from Corner Café/.test(labels[3]), "income payee chip");
  // removing a chip
  await page.evaluate(() => {
    HF = { ...histBlank(), pay: "out:corner cafe", amt: "gt:50", q: "x" };
    render();
  });
  await page.click('#app .hchip[data-v="pay"]');
  r = await page.evaluate(() => ({ pay: HF.pay, amt: HF.amt, q: HF.q }));
  ok(r.pay === "" && r.amt === "gt:50" && r.q === "x", "the pay chip's x clears only the payee: " + JSON.stringify(r));
  await page.click('#app .hchip[data-v="amt"]');
  r = await page.evaluate(() => ({ amt: HF.amt, q: HF.q }));
  ok(r.amt === "" && r.q === "x", "the amount chip's x clears only the amount");
  // Clear all
  await page.evaluate(() => {
    HF = { ...histBlank(), pay: "out:bakery", amt: "lt:3", q: "x" };
    histClear();
  });
  r = await page.evaluate(() => ({ ...HF }));
  ok(!r.q && !r.pay && !r.amt, "Clear all empties q, pay and amt");
  // a payee that no longer exists
  await page.evaluate(() => {
    HF = { ...histBlank(), pay: "out:gone shop", q: "kiosk" };
    histDrop();
  });
  r = await page.evaluate(() => ({ ...HF }));
  ok(r.pay === "" && r.q === "kiosk", "histDrop drops a payee that no longer exists, keeps the words");
  await page.evaluate(() => {
    HF = { ...histBlank(), pay: "out:kiosk" };
    histDrop();
  });
  ok((await page.evaluate(() => HF.pay)) === "out:kiosk", "histDrop keeps a payee that exists");
  await page.evaluate(() => {
    HF = { ...histBlank(), pay: "in:kiosk" };
    histDrop();
  });
  ok((await page.evaluate(() => HF.pay)) === "", "...but not as income when it was only spent at");

  // mixed currencies: the amount is a plain number
  await page.evaluate(() => {
    S.accounts.push({ id: "c", name: "Euro", type: "bank", currency: "EUR", opening: 0, archived: false });
  });
  const mixed = await page.evaluate(() => [srAmtLabel("gt:50"), srAmtLabel("eq:50:51")]);
  ok(mixed[0] === "More than 50.00" && mixed[1] === "50.00 to 50.99", "several currencies: plain numbers: " + mixed);

  await ctx.close();

  // ---- part 2: search as a mode of History, opened from every tab
  {
    const fs = require("fs"),
      path = require("path");
    const openApp = async (locale = "en-US") => {
      const c = await browser.newContext({ viewport: { width: 393, height: 852 }, locale });
      await c.addInitScript(() => {
        window.Android = { getColors: () => null, setBars() {} };
      });
      const p = await c.newPage();
      p.on("pageerror", e => errors.push(e.message));
      await p.goto(appUrl);
      await p.evaluate(() => {
        S = blank();
        S.settings.cur = "USD";
        S.settings.lastCheck = today();
        S.accounts.push(
          { id: "b", name: "Everyday", type: "bank", currency: "USD", opening: 5000, archived: false },
          { id: "c", name: "Cash", type: "cash", currency: "USD", opening: 300, archived: false }
        );
        let n = 0;
        const t = (days, type, amount, account, extra) =>
          S.txns.push({
            id: "t" + ++n,
            ts: n,
            date: addDays(today(), -days),
            type,
            amount,
            account,
            note: "",
            ...extra,
          });
        t(0, "expense", 36.8, "b", { cat: "groceries", payee: "Green Market" });
        t(1, "expense", 41.3, "b", { cat: "groceries", payee: "green market" });
        t(2, "expense", 12.5, "b", { cat: "groceries", payee: "Fresh Corner" });
        t(3, "expense", 4.75, "c", { cat: "food", payee: "Corner Café", note: "Coffee" });
        t(4, "expense", 45.2, "c", { cat: "shopping", payee: "Outdoor Store", note: "Rain jacket" });
        t(5, "expense", 9, "c", { cat: "food", payee: "茶餐厅", note: "午饭" });
        t(6, "income", 150, "c", { cat: "gift", payee: "Grandma" });
        t(7, "transfer", 200, "b", { to: "c" });
        S.loans.push({
          id: "L1",
          kind: "lend",
          person: "Greta",
          account: "c",
          date: today(),
          note: "",
          status: "open",
        });
        t(1, "loan", 20, "c", { dir: "out", loan: "L1", principal: true });
        save();
        render();
      });
      return { c, p };
    };
    const { c: c2, p: pg } = await openApp();
    const st = () =>
      pg.evaluate(() => ({
        find: !!V.find,
        screen: V.screen,
        q: HF.q,
        period: HP.period,
        kind: HF.kind,
        n: histCount(),
        focus: document.activeElement && document.activeElement.id,
        val: ($("#find-q") || {}).value,
      }));
    const rows = () => pg.evaluate(() => [...document.querySelectorAll("#hbody .tx .d")].map(d => d.textContent));
    const type = async q => {
      await pg.fill("#find-q", "");
      await pg.keyboard.type(q);
      await pg.waitForTimeout(250);
    };
    const SB = '#app [data-act="search-open"]';

    // from Home, Assets and Liabilities
    for (const [scr, label] of [
      ["home", "Home"],
      ["assets", "Assets"],
      ["liabs", "Liabilities"],
    ]) {
      await pg.evaluate(x => {
        V.screen = x;
        render();
      }, scr);
      await pg.click(SB);
      let r = await st();
      ok(
        r.find && r.screen === "history" && r.focus === "find-q" && r.period === "all" && r.n === 0 && r.q === "",
        label + ": Search opens History in search mode, the field focused, clean: " + JSON.stringify(r)
      );
      await pg.evaluate(() => goBack());
      r = await st();
      ok(!r.find && r.screen === scr, label + ": Back returns to it: " + JSON.stringify(r));
    }

    // from History: always clean, and Back puts its filters and period back
    await pg.evaluate(() => {
      openHistory({ kind: "out" });
      Object.assign(HP, { period: "month", anchor: today() });
      render();
    });
    await pg.click(SB);
    let r = await st();
    ok(
      r.find && r.period === "all" && r.kind === "" && r.n === 0 && r.focus === "find-q",
      "History: opens clean (all time, no filters): " + JSON.stringify(r)
    );
    await pg.click('#app [data-act="find-back"]');
    r = await st();
    ok(
      !r.find && r.screen === "history" && r.kind === "out" && r.period === "month",
      "History: Back restores its filter and period: " + JSON.stringify(r)
    );
    await pg.evaluate(() => {
      openHistory();
    });

    // the top bar and the empty state
    await pg.click(SB);
    const bar = await pg.evaluate(() => ({
      field: !!$('#app .appbar input#find-q[type="search"]'),
      label: $("#find-q").getAttribute("aria-label"),
      ph: $("#find-q").placeholder,
      back: !!$('#app .appbar [data-act="find-back"]'),
      sbtn: !!$('#app .appbar [data-act="search-open"]'),
      sel: !!$('#app .appbar [data-act="sel-start"]'),
      h1: !!$("#app .appbar h1:not(.vh)"),
      hbar: !!$("#app .hbar .hpl") && !!$("#app .hbar .hfbtn"),
      body: $("#hbody").innerHTML,
    }));
    ok(
      bar.field && bar.back && !bar.sbtn && !bar.sel && !bar.h1 && bar.hbar,
      "search mode: Back and the field in the bar, no Search or Select, period and Filters under it: " +
        JSON.stringify(bar)
    );
    ok(bar.ph === "Search History" && bar.label === "Search History", "the field is labelled Search History");
    ok(bar.body === "", "nothing typed, no filter, all time: #hbody shows nothing");

    // typing: after a pause, only #hbody (and the bar) change; the field keeps its caret, focus and element
    await pg.evaluate(() => {
      $("#find-q").__mark = 1;
    });
    await pg.evaluate(() => {
      const i = $("#find-q");
      i.value = "gr";
      i.dispatchEvent(new Event("input", { bubbles: true }));
    });
    ok((await pg.evaluate(() => $("#hbody").innerHTML)) === "", "the list waits for a pause in typing");
    await pg.waitForTimeout(250);
    let list = await rows();
    ok(
      list.filter(x => /green market/i.test(x)).length === 2 && list.length >= 4,
      "typing filters the list: " + JSON.stringify(list)
    );
    ok(
      await pg.evaluate(() => $("#find-q").__mark === 1 && document.activeElement === $("#find-q") && HF.q === "gr"),
      "the field is the same element, still focused"
    );
    await type("cafe COF");
    list = await rows();
    ok(
      list.length === 1 && /Corner Café/.test(list[0]),
      "cafe COF: the coffee at Corner Café only: " + JSON.stringify(list)
    );
    await type("rket");
    ok(
      (await rows()).length === 0 && (await pg.textContent("#hbody .empty")).includes("Nothing matches"),
      "the middle of a word doesn't count"
    );
    await type("午");
    ok((await rows()).length === 1, "Chinese matches anywhere in the text");
    await type("4.75");
    list = await rows();
    ok(list.length === 1 && /Corner Café/.test(list[0]), "4.75 finds the 4.75 entry");
    await type("45");
    list = await rows();
    ok(list.length === 1 && /Outdoor Store/.test(list[0]), "45 finds 45.20, not 4.75");

    // nothing found: History's message and Clear all (which also empties the field)
    await type("zzz");
    ok(!!(await pg.$("#hbody .empty [data-act='hf-clear']")), "nothing found: History's message with Clear all");
    await pg.click("#hbody .empty [data-act='hf-clear']");
    r = await st();
    ok(
      r.find && r.val === "" && r.q === "",
      "Clear all empties the field and stays in search mode: " + JSON.stringify(r)
    );

    // the field's x empties it and stays
    await type("gr");
    ok(await pg.evaluate(() => !$('#app [data-act="find-clear"]').hidden), "the x shows once there are words");
    await pg.click('#app [data-act="find-clear"]');
    r = await st();
    ok(
      r.find && r.val === "" && r.focus === "find-q" && (await pg.evaluate(() => $("#hbody").innerHTML)) === "",
      "the x empties the field, keeps search mode and the focus: " + JSON.stringify(r)
    );

    // a filter set from the sheet: the list shows without words; layers close first
    await pg.click('#app [data-act="hf-open"]');
    ok(!!(await pg.$("#sheet .sheet, #sheet .p, #sheet [role=dialog]")), "Filters opens from search mode");
    await pg.evaluate(() => goBack());
    r = await st();
    ok(r.find && !(await pg.evaluate(() => $("#sheet").innerHTML)), "Back closes the sheet first, search mode stays");
    await pg.evaluate(() => {
      HF.kind = "in";
      render();
    });
    list = await rows();
    ok(list.length === 1 && /Grandma/.test(list[0]), "a filter alone lists its entries: " + JSON.stringify(list));
    await pg.evaluate(() => {
      HF.kind = "";
      render();
    });

    // render() in search mode rebuilds the field with the text and puts the caret back
    await type("green");
    await pg.evaluate(() => $("#find-q").setSelectionRange(2, 2));
    await pg.evaluate(() => render());
    r = await pg.evaluate(() => ({
      v: $("#find-q").value,
      f: document.activeElement === $("#find-q"),
      s: $("#find-q").selectionStart,
      e: $("#find-q").selectionEnd,
    }));
    ok(
      r.v === "green" && r.f && r.s === 2 && r.e === 2,
      "render() keeps the words, focus and caret: " + JSON.stringify(r)
    );

    // rotation keeps the words and the focus
    await pg.evaluate(() => $("#find-q").setSelectionRange(3, 3));
    await pg.setViewportSize({ width: 852, height: 393 });
    await pg.waitForTimeout(300);
    r = await pg.evaluate(() => ({
      v: $("#find-q").value,
      f: document.activeElement === $("#find-q"),
      s: $("#find-q").selectionStart,
      find: !!V.find,
    }));
    ok(
      r.v === "green" && r.f && r.s === 3 && r.find,
      "rotation keeps the words, focus and caret: " + JSON.stringify(r)
    );
    await pg.setViewportSize({ width: 393, height: 852 });
    await pg.waitForTimeout(300);
    r = await st();
    ok(r.find && r.val === "green" && r.focus === "find-q", "and back upright: " + JSON.stringify(r));

    // an opened row, a held row (selection), then Back
    await pg.click("#hbody .tx[data-act='row-open']");
    ok(!!(await pg.$("#hbody .txo")), "a result opens in place");
    await pg.evaluate(() => {
      V.sel = new Set([S.txns[0].id]);
      render();
    });
    ok(
      !!(await pg.$('#app .appbar [data-act="sel-cancel"]')) && !(await pg.$("#find-q")),
      "holding a row starts selection (the selection bar replaces the field)"
    );
    await pg.evaluate(() => goBack());
    r = await st();
    ok(
      r.find && r.val === "green",
      "Back ends the selection first, search mode stays with its words: " + JSON.stringify(r)
    );

    // leaving History another way ends search mode and forgets the words
    await pg.evaluate(() => {
      HF.pay = "out:green market";
      V.screen = "liabs";
      render();
    });
    r = await pg.evaluate(() => ({ find: !!V.find, q: HF.q, pay: HF.pay, amt: HF.amt, keep: !!FIND.keep }));
    ok(
      !r.find && r.q === "" && r.pay === "" && r.amt === "" && !r.keep,
      "leaving History another way ends search mode: " + JSON.stringify(r)
    );
    await pg.evaluate(() => {
      V.screen = "home";
      render();
    });

    // opened from History, then left by another way: nothing is restored
    await pg.evaluate(() => {
      openHistory({ kind: "out" });
    });
    await pg.click(SB);
    await pg.evaluate(() => {
      V.screen = "assets";
      render();
    });
    r = await pg.evaluate(() => ({ find: !!V.find, kind: HF.kind, keep: !!FIND.keep }));
    ok(!r.find && r.kind === "" && !r.keep, "History's kept filters are forgotten when search ends elsewhere");

    // history's own Search button reaches the same mode
    await pg.evaluate(() => openHistory());
    ok(!!(await pg.$('#app .appbar [data-act="search-open"]')), "History has the Search button");

    // no old Search page left
    const walk = d =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
        const f = path.join(d, e.name);
        return e.isDirectory() ? (e.name === "i18n" ? [] : walk(f)) : /\.(js|html|css)$/.test(e.name) ? [f] : [];
      });
    const old = /V\.screen === "search"|searchView|srGroups|srScope|srScoped|srSpan|srNav|SR_SPANS|"sr-|#sr\b|\bSR\./;
    const left = walk(path.join(__dirname, "..", "..", "app", "src", "main", "assets")).filter(f =>
      old.test(fs.readFileSync(f, "utf8"))
    );
    ok(left.length === 0, "the old Search screen is gone from the code: " + left.join(", "));
    await c2.close();

    // a German phone: amounts typed the German way
    {
      const { c: c3, p: p3 } = await openApp("de-DE");
      await p3.click(SB);
      await p3.keyboard.type("4,75");
      await p3.waitForTimeout(250);
      const got = await p3.evaluate(() => [...document.querySelectorAll("#hbody .tx .d")].map(d => d.textContent));
      ok(got.length === 1 && /Corner Café/.test(got[0]), "German: 4,75 finds the 4.75 entry: " + got);
      await c3.close();
    }
  }

  // ---- part 3: suggestions, on the notebook of the store pictures (media.js demo())
  {
    const fs = require("fs"),
      path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "media.js"), "utf8"),
      demo = new Function(src.slice(src.indexOf("const pad"), src.indexOf("/* each picture")) + "; return demo();")();
    const open = async (locale = "en-US", extra) => {
      const c = await browser.newContext({ viewport: { width: 393, height: 852 }, locale });
      await c.addInitScript(s => {
        window.Android = { getColors: () => null, setBars() {} };
        if (!localStorage.getItem("tally:v1")) localStorage.setItem("tally:v1", s);
      }, JSON.stringify(demo));
      const p = await c.newPage();
      p.on("pageerror", e => errors.push(e.message));
      await p.goto(appUrl);
      if (extra) await p.evaluate(extra);
      await p.click('#app [data-act="search-open"]');
      return { c, p };
    };
    const typeIn = async (p, q) => {
      await p.fill("#find-q", "");
      await p.keyboard.type(q);
      await p.waitForTimeout(250);
    };
    const sugs = p =>
      p.evaluate(() =>
        [...document.querySelectorAll("#hbody .sug")].map(b => ({
          t: b.querySelector(".sgt").textContent,
          s: b.querySelector(".s").textContent,
          a: b.getAttribute("aria-label"),
          act: b.dataset.act,
          h: b.getBoundingClientRect().height,
        }))
      );
    const line = (l, t) => l.find(x => x.t === t);
    const { c: c4, p: pg } = await open();

    await typeIn(pg, "corner");
    let l = await sugs(pg);
    ok(
      line(l, "Corner Café") && line(l, "Corner Café").s === "Paid to · 19 entries",
      "corner: Paid to Corner Café, 19: " + JSON.stringify(l.map(x => [x.t, x.s]))
    );
    ok(
      line(l, "Fresh Corner") && line(l, "Fresh Corner").s === "Paid to · 14 entries",
      "corner: Paid to Fresh Corner, 14"
    );
    ok(line(l, "Corner Café").a === "Paid to Corner Café, 19 entries", "one-line label: " + line(l, "Corner Café").a);
    ok(
      l.every(x => x.act === "fs-pick" && x.h >= 48),
      "rows are fs-pick buttons of 48 px or more"
    );
    const look = await pg.evaluate(() => {
      const t = getComputedStyle(document.querySelector("#hbody .sug .sgt")),
        d = getComputedStyle(document.querySelector("#hbody .tx .d"));
      return { size: t.fontSize === d.fontSize, bg: t.backgroundColor, pad: t.paddingLeft };
    });
    ok(
      look.size && look.bg === "rgba(0, 0, 0, 0)" && look.pad === "0px",
      "a suggestion's title reads like a row's title, not a status pill: " + JSON.stringify(look)
    );
    const heads = await pg.evaluate(() => {
      const b = document.querySelector("#hbody");
      return {
        first: b.firstElementChild.textContent,
        secs: [...b.querySelectorAll(".sec")].map(x => x.textContent),
        order: b.querySelector(".sec").compareDocumentPosition(b.querySelector(".sug")) & 4,
      };
    });
    ok(
      heads.first === "Suggestions" && heads.secs.join("|") === "Suggestions|Entries",
      "one Suggestions heading on top, then Entries: " + heads.secs
    );

    await typeIn(pg, "eat");
    l = await sugs(pg);
    const eat = await pg.evaluate(() => histRows(histList({ ...histBlank(), cat: "food" })).length);
    ok(
      l.length === 1 && l[0].t === "Eating out" && l[0].s === "Category · " + eat + " entries",
      "eat: the category Eating out: " + JSON.stringify(l.map(x => [x.t, x.s]))
    );

    await typeIn(pg, "cash");
    l = await sugs(pg);
    const cash = await pg.evaluate(() => histRows(histList({ ...histBlank(), acc: "c" })).length);
    ok(
      l.length === 1 && l[0].t === "Cash" && l[0].s === "Account · " + cash + " entries",
      "cash: the account: " + JSON.stringify(l.map(x => [x.t, x.s]))
    );

    await typeIn(pg, "maya");
    l = await sugs(pg);
    ok(
      l.length === 1 && l[0].t === "Maya" && l[0].s === "Borrowed from · 3 entries",
      "maya: the person: " + JSON.stringify(l.map(x => [x.t, x.s]))
    );

    await typeIn(pg, "transf");
    l = await sugs(pg);
    ok(
      l.length === 1 && l[0].t === "Transfers" && l[0].s === "Kind · 4 entries",
      "transf: Transfers: " + JSON.stringify(l.map(x => [x.t, x.s]))
    );
    await typeIn(pg, "tr");
    ok(
      (await sugs(pg)).every(x => x.t !== "Transfers"),
      "kind names match from 3 letters"
    );

    await typeIn(pg, "june");
    l = await sugs(pg);
    const june = await pg.evaluate(() => {
      const [s, e] = [today().slice(0, 4) + "-06-01", today().slice(0, 4) + "-06-30"];
      return histRows(S.txns.filter(t => t.date >= s && t.date <= e)).length;
    });
    ok(
      line(l, "June 2026") && line(l, "June 2026").s === "Period · " + june + " entries",
      "june: June 2026 with its count: " + JSON.stringify(l.map(x => [x.t, x.s]))
    );
    let rowsTxt = await pg.evaluate(() => document.querySelector("#hbody").textContent);
    ok(/June rent/.test(rowsTxt), "june: the June rent entry is still listed");
    await typeIn(pg, "jun");
    ok(!!line(await sugs(pg), "June 2026"), "a month from 3 letters");
    await typeIn(pg, "ju");
    ok(!(await sugs(pg)).some(x => x.s.startsWith("Period")), "not from 2 letters");

    await typeIn(pg, "2026");
    l = await sugs(pg);
    const yr = await pg.evaluate(() => histRows(S.txns).length);
    ok(
      line(l, "2026") && line(l, "2026").s === "Period · " + yr + " entries",
      "2026: the year: " + JSON.stringify(l.map(x => [x.t, x.s]))
    );
    await typeIn(pg, "2024");
    ok(!(await sugs(pg)).some(x => x.s.startsWith("Period")), "a year without entries is not offered");

    // amounts: an entry for each row to have something to leave
    await pg.evaluate(() => {
      const e = (id, amount) => ({
        id,
        ts: 9e3 + +id.slice(1),
        date: today(),
        type: "expense",
        amount,
        account: "b",
        cat: "shopping",
        payee: "Kiosk",
        note: "",
      });
      S.txns.push(e("x1", 50.25), e("x2", 2026.5), e("x3", 1250.5));
      save();
    });
    await typeIn(pg, "50");
    l = await sugs(pg);
    ok(
      l.map(x => x.t).join("|") === "50.00 to 50.99|More than 50.00|Less than 50.00" &&
        l.every(x => x.s.startsWith("Amount · ")),
      "50: three amount rows: " + JSON.stringify(l.map(x => [x.t, x.s]))
    );
    await typeIn(pg, ">50");
    l = await sugs(pg);
    ok(l.length === 1 && l[0].t === "More than 50.00", ">50: one row: " + JSON.stringify(l.map(x => x.t)));
    await typeIn(pg, "<50");
    l = await sugs(pg);
    ok(l.length === 1 && l[0].t === "Less than 50.00", "<50: one row");
    await typeIn(pg, "50.25");
    l = await sugs(pg);
    ok(l[0].t === "50.25" && l.length === 3, "50.25: exactly that amount: " + JSON.stringify(l.map(x => x.t)));
    await typeIn(pg, "2026");
    l = await sugs(pg);
    ok(
      l.some(x => x.s.startsWith("Period")) && l.some(x => x.t === "2,026.00 to 2,026.99"),
      "2026: the year and the amount rows: " + JSON.stringify(l.map(x => x.t))
    );

    // tapping
    const tap = async (p, t) => {
      await p.click('#hbody .sug:has(.sgt:text-is("' + t + '"))');
      await p.waitForTimeout(60);
      return p.evaluate(() => ({
        hf: { ...HF },
        hp: { ...HP },
        val: $("#find-q").value,
        focus: document.activeElement && document.activeElement.id,
        caret: $("#find-q").selectionStart === $("#find-q").value.length,
        chips: [...document.querySelectorAll("#app .hchip")].map(b => b.textContent.trim()),
        sugs: [...document.querySelectorAll("#hbody .sug .sgt")].map(x => x.textContent),
      }));
    };
    await typeIn(pg, "corner cafe");
    let r = await tap(pg, "Corner Café");
    ok(
      r.hf.pay === "out:corner cafe" && r.hf.q === "" && r.val === "",
      "tap Paid to: payee set, both words removed: " + JSON.stringify([r.hf.pay, r.hf.q, r.val])
    );
    ok(r.focus === "find-q" && r.caret, "the field keeps the focus, caret at the end");
    ok(r.chips.includes("Paid to Corner Café"), "its chip: " + r.chips);
    await typeIn(pg, "corner");
    l = await sugs(pg);
    ok(!l.some(x => x.t === "Corner Café"), "one already set is not shown");
    ok(!!line(l, "Fresh Corner"), "another payee replaces the one set (14 entries)");
    await pg.evaluate(() => (findClear(), histClear(), findDraw()));
    await typeIn(pg, "corner coffee");
    ok(!line(await sugs(pg), "Fresh Corner"), "Fresh Corner with the other word would leave none: not shown");
    r = await tap(pg, "Corner Café");
    ok(
      r.hf.pay === "out:corner cafe" && r.hf.q === "coffee" && r.val === "coffee" && r.caret,
      "only the words that found it go: " + r.hf.q
    );
    await pg.evaluate(() => (histClear(), findDraw()));
    await typeIn(pg, "eat");
    r = await tap(pg, "Eating out");
    ok(r.hf.cat === "food" && r.hf.q === "", "tap category: " + r.hf.cat);
    await pg.evaluate(() => (histClear(), findDraw()));
    await typeIn(pg, "cash");
    r = await tap(pg, "Cash");
    ok(r.hf.acc === "c" && r.hf.q === "" && r.chips.includes("Cash"), "tap account");
    await pg.evaluate(() => (histClear(), findDraw()));
    await typeIn(pg, "maya");
    r = await tap(pg, "Maya");
    ok(r.hf.who === "Maya" && r.hf.q === "", "tap person");
    await pg.evaluate(() => (histClear(), findDraw()));
    await typeIn(pg, "transf");
    r = await tap(pg, "Transfers");
    ok(r.hf.kind === "xfer" && r.hf.q === "", "tap kind");
    await pg.evaluate(() => (histClear(), findDraw()));
    await typeIn(pg, "june");
    r = await tap(pg, "June 2026");
    ok(
      r.hp.period === "month" && r.hp.anchor.slice(0, 7) === "2026-06" && r.hf.q === "" && r.val === "",
      "tap Period sets the month: " + JSON.stringify(r.hp)
    );
    ok(r.chips.length === 0 && !r.sugs.length, "the period chip is the bar's own; no suggestion left");
    await pg.evaluate(() => (histClear(), findDraw()));
    await typeIn(pg, "2026");
    r = await tap(pg, "2026");
    ok(r.hp.period === "year" && r.hp.anchor.slice(0, 4) === "2026", "tap the year");
    await pg.evaluate(() => (histClear(), findDraw()));
    await typeIn(pg, "50");
    r = await tap(pg, "More than 50.00");
    ok(r.hf.amt === "gt:50" && r.hf.q === "" && r.chips.includes("More than 50.00"), "tap amount: " + r.hf.amt);
    await pg.evaluate(() => (histClear(), findDraw()));
    await typeIn(pg, "50");
    r = await tap(pg, "50.00 to 50.99");
    ok(r.hf.amt === "eq:50:51", "tap the amount itself: " + r.hf.amt);

    // one that would leave none is not shown
    await pg.evaluate(() => {
      histClear();
      HF.kind = "in";
      findDraw();
    });
    await typeIn(pg, "corner");
    ok(!(await sugs(pg)).some(x => x.t === "Corner Café"), "a suggestion leaving no entries is not shown");

    // Enter: the pending redraw at once, and the keyboard closes
    await pg.evaluate(() => (histClear(), findClear(), findDraw()));
    await pg.fill("#find-q", "");
    await pg.keyboard.type("corner");
    await pg.keyboard.press("Enter");
    r = await pg.evaluate(() => ({
      n: document.querySelectorAll("#hbody .sug").length,
      focus: document.activeElement && document.activeElement.id,
      q: HF.q,
    }));
    ok(
      r.n > 0 && r.focus !== "find-q" && r.q === "corner",
      "Enter draws now and blurs the field: " + JSON.stringify(r)
    );
    // the focus lands on the heading (no ring, TalkBack reads it), never on a suggestion
    r = await pg.evaluate(() => {
      const a = document.activeElement;
      return {
        head: !!a && a.getAttribute("role") === "heading" && a.getAttribute("tabindex") === "-1",
        txt: a && a.textContent,
        sug: !!(a && a.closest(".sug")),
        outline: a && getComputedStyle(a).outlineStyle,
      };
    });
    ok(
      r.head && !r.sug && r.txt === "Suggestions" && r.outline === "none",
      "after Enter the focus is on the Suggestions heading, no ring: " + JSON.stringify(r)
    );

    // with every account in one currency the labels carry it
    await pg.evaluate(() => (histClear(), S.accounts.forEach(a => (a.currency = "USD")), findDraw()));
    await typeIn(pg, "50");
    ok(
      (await sugs(pg)).map(x => x.t).join("|") === "$50.00 to $50.99|More than $50.00|Less than $50.00",
      "one currency: amounts in it"
    );

    // the exact amount in a currency of three decimals
    const k = await pg.evaluate(() => {
      const was = S.accounts.map(a => a.currency);
      S.accounts.forEach(a => (a.currency = "KWD"));
      const out = [srAmtLabel("eq:4.75:4.755"), money(4.75, "KWD"), srNum("4.755").hi];
      S.accounts.forEach((a, i) => (a.currency = was[i]));
      return out;
    });
    ok(k[0] === k[1], "a typed exact amount reads as itself in a 3-decimal currency: " + k[0]);
    ok(Math.abs(k[2] - 4.7555) < 1e-9, "4.755 is an exact amount, not 4.755 to 5.755: " + k[2]);
    // a transfer with a fee is one entry in its suggestion; a repeated year is one row
    await typeIn(pg, "cash");
    const before = (await sugs(pg)).find(x => x.t === "Cash").s;
    await pg.evaluate(() => {
      const d = today();
      S.txns.push({
        id: "f1",
        ts: 9100,
        date: d,
        type: "transfer",
        amount: 10,
        account: "b",
        to: "c",
        note: "",
        feeId: "f2",
      });
      S.txns.push({ id: "f2", ts: 9101, date: d, type: "expense", amount: 1, account: "b", feeOf: "f1", note: "" });
      save();
    });
    await typeIn(pg, "cash");
    const after = (await sugs(pg)).find(x => x.t === "Cash").s,
      nb = +before.match(/\d+/)[0],
      na = +after.match(/\d+/)[0];
    ok(na === nb + 1, "a transfer and its fee count as one entry: " + before + " -> " + after);
    await typeIn(pg, "2026 2026");
    l = await sugs(pg);
    ok(l.filter(x => x.t === "2026").length === 1, "a repeated year is one row: " + JSON.stringify(l.map(x => x.t)));
    // Enter while an IME composes is left alone
    await pg.fill("#find-q", "corner");
    const comp = await pg.evaluate(() => {
      const i = $("#find-q");
      i.focus();
      i.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })
      );
      return document.activeElement === i;
    });
    ok(comp, "Enter during a composition keeps the field");
    // "Nothing matches" under suggestions is not pushed over them
    await typeIn(pg, "corner zzzz");
    const em = await pg.evaluate(() => {
      const e = document.querySelector("#hbody .empty"),
        sg = document.querySelector("#hbody .list");
      return !e || !sg || e.getBoundingClientRect().top >= sg.getBoundingClientRect().bottom - 1;
    });
    ok(em, "the empty message sits below the suggestions");
    await c4.close();

    // a German phone
    {
      const { c: c5, p: pd } = await open("de-DE");
      await pd.evaluate(() => {
        S.txns.push({
          id: "x3",
          ts: 9e3,
          date: today(),
          type: "expense",
          amount: 1250.5,
          account: "b",
          cat: "shopping",
          payee: "Kiosk",
          note: "",
        });
        save();
      });
      await typeIn(pd, "1.250,50");
      l = await sugs(pd);
      ok(
        l.length === 3 && /^1\.250,50/.test(l[0].t) && l.every(x => x.s.startsWith("Amount")),
        "German: 1.250,50 is 1250.50: " + JSON.stringify(l.map(x => x.t))
      );
      r = await tap(pd, l[0].t);
      ok(r.hf.amt === "eq:1250.5:1250.505", "German: the amount filter: " + r.hf.amt);
      await typeIn(pd, "juni");
      l = await sugs(pd);
      ok(line(l, "Juni 2026"), "German: juni finds Juni 2026: " + JSON.stringify(l.map(x => x.t)));
      await c5.close();
    }

    // a phone set to the Persian calendar: January's name (in Gregorian) still finds January
    {
      const { c: c6, p: pf } = await open("fa-IR");
      await pf.evaluate(() => {
        S.txns.push({
          id: "j1",
          ts: 9200,
          date: "2026-01-10",
          type: "expense",
          amount: 5,
          account: "b",
          cat: "food",
          note: "",
        });
        save();
      });
      const name = await pf.evaluate(() => sugMonths()[0][0]);
      await typeIn(pf, name);
      l = await sugs(pf);
      const jan = await pf.evaluate(
        n => new Intl.DateTimeFormat("fa-IR-u-ca-gregory", { month: "long" }).format(new Date(2021, 0, 15)) === n,
        name
      );
      ok(
        jan && l.length > 0 && l.some(x => x.s.startsWith("Period")),
        "fa-IR: January's Gregorian name is January: " + name + " " + JSON.stringify(l.map(x => x.t))
      );
      const pick = l.find(x => x.s.startsWith("Period"));
      r = await tap(pf, pick.t);
      ok(r.hp.anchor.slice(0, 7) === "2026-01", "fa-IR: it sets January: " + JSON.stringify(r.hp));
      await c6.close();
    }

    // a Turkish phone: İ and ı fold with i
    {
      const { c: c7, p: pt } = await open("tr-TR");
      await pt.evaluate(() => {
        S.txns.push({
          id: "k1",
          ts: 9300,
          date: today(),
          type: "expense",
          amount: 5,
          account: "b",
          cat: "food",
          payee: "İstanbul Kahve",
          note: "",
        });
        S.txns.push({
          id: "k2",
          ts: 9301,
          date: today(),
          type: "expense",
          amount: 6,
          account: "b",
          cat: "food",
          payee: "Kırmızı Çay",
          note: "",
        });
        save();
      });
      for (const [q, want] of [
        ["İSTANBUL", "İstanbul Kahve"],
        ["istanbul", "İstanbul Kahve"],
        ["KIRMIZI", "Kırmızı Çay"],
        ["kirmizi cay", "Kırmızı Çay"],
      ]) {
        await typeIn(pt, q);
        l = await sugs(pt);
        ok(!!line(l, want), "Turkish: " + q + " finds " + want + ": " + JSON.stringify(l.map(x => x.t)));
      }
      r = await tap(pt, "Kırmızı Çay");
      ok(r.hf.q === "" && r.val === "", "Turkish: both words of the name leave the field");
      await c7.close();
    }
  }
  // ---- part 4: marks, the note that matched, nothing found, the count for TalkBack, speed, IME
  {
    const open4 = async (locale = "en-US") => {
      const c = await browser.newContext({ viewport: { width: 393, height: 852 }, locale });
      await c.addInitScript(() => {
        window.Android = { getColors: () => null, setBars() {} };
      });
      const p = await c.newPage();
      p.on("pageerror", e => errors.push(e.message));
      await p.goto(appUrl);
      await p.evaluate(() => {
        S = blank();
        S.settings.cur = "USD";
        S.settings.lastCheck = today();
        S.accounts.push({ id: "b", name: "Everyday", type: "bank", currency: "USD", opening: 5000, archived: false });
        let n = 0;
        const t = (days, type, amount, extra) =>
          S.txns.push({
            id: "t" + ++n,
            ts: n,
            date: addDays(today(), -days),
            type,
            amount,
            account: "b",
            note: "",
            ...extra,
          });
        t(0, "expense", 4.75, { cat: "food", payee: "Corner Café", note: "morning" });
        t(1, "expense", 12.5, { cat: "groceries", payee: "Fresh Corner" });
        t(2, "expense", 3, { cat: "food", payee: "Coffee Hub" });
        t(3, "expense", 3.5, { cat: "food", payee: "Coffee Hub" });
        t(4, "expense", 4, { cat: "food", payee: "Bean Coffee" });
        t(5, "adjust", 3, { note: "Counted the coins" });
        t(6, "expense", 8, { cat: "food", payee: "Straße & Café" });
        S.loans.push({
          id: "L1",
          kind: "lend",
          person: "Greta",
          account: "b",
          date: today(),
          note: "",
          status: "open",
        });
        t(1, "loan", 20, { dir: "out", loan: "L1", principal: true, note: "Dinner with coins" });
        save();
        render();
      });
      await p.click('#app [data-act="search-open"]');
      return { c, p };
    };
    const typeIn = async (p, q) => {
      await p.fill("#find-q", "");
      await p.keyboard.type(q);
      await p.waitForTimeout(250);
    };
    const { c: c9, p: pm } = await open4();

    await typeIn(pm, "corner");
    let mk = await pm.evaluate(() => ({
      marks: [...document.querySelectorAll("#hbody mark.hl")].map(m => ({
        t: m.textContent,
        in: m.closest(".d") ? "d" : m.closest(".s") ? "s" : m.closest(".a") ? "a" : "other",
      })),
      rows: document.querySelectorAll("#hbody .tx.en").length,
      title: document.querySelector("#hbody .tx.en .d").innerHTML,
    }));
    ok(
      mk.marks.length === 2 && mk.marks.every(m => m.in === "d" && m.t.toLowerCase() === "corner"),
      "corner marks Corner in the two titles: " + JSON.stringify(mk.marks)
    );
    ok(
      /<bdi>.*<mark class="hl">Corner<\/mark> Café.*<\/bdi>/.test(mk.title),
      "the mark sits inside the title: " + mk.title
    );
    await typeIn(pm, "cafe");
    mk = await pm.evaluate(() => [...document.querySelectorAll("#hbody mark.hl")].map(m => m.textContent));
    ok(mk.join("|").includes("Café") && mk.includes("Café"), "cafe marks Café (accent ignored): " + mk);
    ok(!mk.some(t => /\d/.test(t)), "no digits marked");
    await typeIn(pm, "ST&");
    await typeIn(pm, "strasse");
    mk = await pm.evaluate(() => ({
      m: [...document.querySelectorAll("#hbody mark.hl")].map(m => m.textContent),
      rows: document.querySelectorAll("#hbody .tx.en").length,
    }));
    ok(
      mk.rows === 0 || mk.m.length === 0 || mk.m.every(x => /^Stra/.test(x)),
      "ß matches ss: any mark covers whole characters: " + JSON.stringify(mk)
    );
    await typeIn(pm, "and");
    mk = await pm.evaluate(() => [...document.querySelectorAll("#hbody .tx.en .d mark.hl")].map(m => m.textContent));
    ok(
      mk.every(x => x !== "&" && x !== " "),
      "& read as 'and' is not half-marked: " + mk
    );
    // the category and the account in the second line
    await typeIn(pm, "everyday");
    mk = await pm.evaluate(() =>
      [...document.querySelectorAll("#hbody mark.hl")].map(m => m.closest(".s") && m.textContent)
    );
    ok(mk.length > 0 && mk.every(x => x === "Everyday"), "account name in the second line marked: " + mk.length);
    await typeIn(pm, "4.75");
    mk = await pm.evaluate(() => document.querySelectorAll("#hbody mark.hl").length);
    ok(mk === 0, "a number is not marked");

    // the note a collapsed row hides
    await typeIn(pm, "coins");
    const nl = await pm.evaluate(() =>
      [...document.querySelectorAll("#hbody .tx.en")].map(b => ({
        note: b.querySelector(".hnote") && b.querySelector(".hnote").textContent,
        mark: b.querySelector(".hnote mark.hl") && b.querySelector(".hnote mark.hl").textContent,
        open: b.getAttribute("aria-expanded"),
        d: b.querySelector(".d").textContent,
      }))
    );
    ok(nl.length === 2, "coins finds the balance fix and the loan: " + nl.length);
    ok(
      nl.some(x => x.note === "Note: Counted the coins" && x.mark === "coins" && x.open === "false"),
      "the balance fix shows 'Note: Counted the coins', coins marked, row collapsed: " + JSON.stringify(nl)
    );
    ok(
      nl.some(x => x.note === "Note: Dinner with coins" && x.mark === "coins"),
      "the loan's note too"
    );
    const nls = await pm.evaluate(() => {
      const n = document.querySelector("#hbody .hnote"),
        s = document.querySelector("#hbody .tx.en .s"),
        a = getComputedStyle(n),
        b = getComputedStyle(s);
      return {
        color: a.color === b.color,
        size: a.fontSize === b.fontSize,
        bdi: !!n.querySelector("bdi"),
        wrap: a.overflowWrap,
      };
    });
    ok(
      nls.color && nls.size && nls.bdi && nls.wrap === "break-word",
      "the note line looks like the second line, wraps, has bdi: " + JSON.stringify(nls)
    );
    await typeIn(pm, "morning");
    ok(
      (await pm.evaluate(() => document.querySelectorAll("#hbody .hnote").length)) === 0,
      "a visible note gets no third line"
    );
    await typeIn(pm, "counted");
    ok(
      (await pm.evaluate(() => document.querySelectorAll("#hbody .hnote mark.hl").length)) === 1,
      "the word 'counted' finds the fix by its note"
    );
    // not in History itself
    await pm.evaluate(() => {
      findEnd();
      HF = histBlank();
      V.screen = "history";
      render();
    });
    ok(
      (await pm.evaluate(() => document.querySelectorAll("#app mark.hl, #app .hnote").length)) === 0,
      "History itself: no marks, no note line"
    );
    await pm.evaluate(() => {
      V.screen = "home";
      render();
    });
    await pm.click('#app [data-act="search-open"]');

    // nothing found
    await typeIn(pm, "cofee");
    const nf = await pm.evaluate(() => {
      const e = document.querySelector("#hbody .empty"),
        b = e && e.getBoundingClientRect(),
        fix = e && e.querySelector('[data-act="find-fix"]');
      return {
        text: e && e.textContent,
        fix: fix && fix.textContent,
        fixH: fix && fix.getBoundingClientRect().height,
        tonal: fix && fix.classList.contains("tonal"),
        clear: !!(e && e.querySelector('[data-act="hf-clear"]')),
        mid: b && Math.abs(b.top + b.height / 2 + scrollY - innerHeight / 2) < 70,
        hint: !!document.querySelector("#hbody .hint, #hbody .srhint"),
        order:
          fix && e.querySelector('[data-act="hf-clear"]')
            ? !!(fix.compareDocumentPosition(e.querySelector('[data-act="hf-clear"]')) & 4)
            : false,
      };
    });
    ok(nf.text.includes("Nothing matches “cofee”"), "cofee: Nothing matches “cofee”: " + nf.text);
    ok(nf.fix === "Search “coffee” · 3 entries", "the typo button: " + nf.fix);
    ok(nf.fixH >= 48 && nf.tonal && nf.clear && nf.order, "tonal, 48 px, Clear all after it: " + JSON.stringify(nf));
    ok(nf.mid && !nf.hint, "centred like History's, no hint line: " + JSON.stringify(nf));
    await pm.click('#hbody [data-act="find-fix"]');
    await pm.waitForTimeout(80);
    const fx = await pm.evaluate(() => ({
      v: $("#find-q").value,
      q: HF.q,
      rows: document.querySelectorAll("#hbody .tx.en").length,
      marks: [...document.querySelectorAll("#hbody .tx.en mark.hl")].map(m => m.textContent.toLowerCase()),
    }));
    ok(
      fx.v === "coffee" && fx.q === "coffee" && fx.rows === 3,
      "the button fills the field and lists them: " + JSON.stringify(fx)
    );
    await typeIn(pm, "bean cofee");
    ok(
      (await pm.evaluate(() => $("#hbody [data-act='find-fix']").textContent)) === "Search “coffee” · 1 entry",
      "one entry reads singular"
    );
    await pm.click('#hbody [data-act="find-fix"]');
    ok((await pm.evaluate(() => $("#find-q").value)) === "bean coffee", "only the misspelt word is replaced");
    await typeIn(pm, "zzzzzz");
    ok(await pm.evaluate(() => !document.querySelector("#hbody [data-act='find-fix']")), "no near word: no button");
    await pm.evaluate(() => {
      HF.q = "";
      HF.kind = "in";
      findDraw();
    });
    const nf2 = await pm.evaluate(() => document.querySelector("#hbody .empty").textContent);
    ok(
      nf2.includes("Nothing matches these filters") && !nf2.includes("“"),
      "no words: Nothing matches these filters: " + nf2
    );
    await pm.evaluate(() => {
      HF = histBlank();
    });

    // the count for TalkBack: one status that stays, set after the pause, only when the count changed
    await pm.fill("#find-q", "");
    await pm.waitForTimeout(200);
    await pm.evaluate(() => {
      window.LIVE = document.querySelector("#find-live");
      window.LIVEN = [];
      new MutationObserver(() => LIVEN.push(LIVE.textContent)).observe(LIVE, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
    const lv = await pm.evaluate(() => ({ role: LIVE.getAttribute("role"), vh: LIVE.classList.contains("vh") }));
    ok(lv.role === "status" && lv.vh, "a visually hidden status element exists: " + JSON.stringify(lv));
    await pm.keyboard.type("coffee", { delay: 30 });
    await pm.waitForTimeout(300);
    let st = await pm.evaluate(() => ({
      same: LIVE === document.querySelector("#find-live"),
      t: LIVE.textContent,
      n: LIVEN.length,
    }));
    ok(st.same && st.t === "3 entries" && st.n === 1, "typed fast: set once, never replaced: " + JSON.stringify(st));
    await pm.keyboard.type(" ", { delay: 30 });
    await pm.waitForTimeout(250);
    st = await pm.evaluate(() => ({ t: LIVE.textContent, n: LIVEN.length }));
    ok(st.n === 1, "same count after another pause: not set again: " + JSON.stringify(st));
    await pm.keyboard.type("hub", { delay: 30 });
    await pm.waitForTimeout(250);
    st = await pm.evaluate(() => ({
      same: LIVE === document.querySelector("#find-live"),
      t: LIVE.textContent,
      n: LIVEN.length,
    }));
    ok(st.same && st.t === "2 entries" && st.n === 2, "a new count: set once more: " + JSON.stringify(st));
    await pm.keyboard.type("x", { delay: 30 });
    await pm.waitForTimeout(250);
    ok((await pm.evaluate(() => LIVE.textContent)) === "0 entries", "nothing found: 0 entries");

    // an IME composing: no redraw drops what is composed
    const cdp = await pm.context().newCDPSession(pm);
    await pm.fill("#find-q", "");
    await pm.focus("#find-q");
    await cdp.send("Input.imeSetComposition", { text: "c", selectionStart: 1, selectionEnd: 1 });
    await pm.waitForTimeout(250);
    await cdp.send("Input.imeSetComposition", { text: "cof", selectionStart: 3, selectionEnd: 3 });
    await pm.waitForTimeout(250);
    let ime = await pm.evaluate(() => ({ v: $("#find-q").value, f: document.activeElement.id, q: HF.q }));
    ok(
      ime.v === "cof" && ime.f === "find-q",
      "during composition the field keeps the composed text: " + JSON.stringify(ime)
    );
    await cdp.send("Input.insertText", { text: "coffee" });
    await pm.waitForTimeout(250);
    ime = await pm.evaluate(() => ({
      v: $("#find-q").value,
      f: document.activeElement.id,
      q: HF.q,
      rows: document.querySelectorAll("#hbody .tx.en").length,
    }));
    ok(
      ime.v === "coffee" && ime.q === "coffee" && ime.rows === 3 && ime.f === "find-q",
      "composition ended: text kept and listed: " + JSON.stringify(ime)
    );
    await c9.close();

    // 10,000 entries: a keystroke's redraw stays quick
    const { c: c10, p: pb } = await open4();
    const ms = await pb.evaluate(() => {
      const words = ["corner", "cafe", "market", "coffee", "store", "fresh", "bakery", "kiosk", "bean", "hub"];
      for (let i = 0; i < 10000; i++)
        S.txns.push({
          id: "x" + i,
          ts: 1000 + i,
          date: addDays(today(), -(i % 300)),
          type: "expense",
          amount: 1 + (i % 50),
          account: "b",
          cat: "food",
          payee: words[i % 10] + " " + words[(i * 7) % 10],
          note: "n" + i,
        });
      save();
      const res = [];
      for (const q of ["c", "co", "cor", "corn", "corne", "corner"]) {
        HF.q = q;
        const a = performance.now();
        findDraw();
        res.push(performance.now() - a);
      }
      return res;
    });
    const worst = Math.max(...ms);
    console.log("redraw ms per keystroke: " + ms.map(x => x.toFixed(1)).join(", "));
    ok(worst <= 240, "10,000 entries: a keystroke's redraw " + worst.toFixed(1) + " ms (aim 80, guard 240)");
    await c10.close();
  }
  // ---- part 5: recent searches, kept by the shell on this phone only
  {
    const open5 = async (withBridge = true, seed = null) => {
      const c = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
      await c.addInitScript(
        ([wb, seed]) => {
          window.__rec = seed;
          window.__recSets = [];
          window.__kept = [];
          window.Android = { getColors: () => null, setBars() {}, keepState: j => window.__kept.push(j) };
          if (wb) {
            Android.recentGet = () => window.__rec;
            Android.recentSet = j => {
              window.__recSets.push(j);
              window.__rec = j;
            };
          }
        },
        [withBridge, seed]
      );
      const p = await c.newPage();
      p.on("pageerror", e => errors.push(e.message));
      await p.goto(appUrl);
      await p.evaluate(() => {
        S = blank();
        S.settings.cur = "USD";
        S.settings.lastCheck = today();
        S.accounts.push({ id: "b", name: "Everyday", type: "bank", currency: "USD", opening: 5000, archived: false });
        S.txns.push({
          id: "t1",
          ts: 1,
          date: today(),
          type: "expense",
          amount: 4.75,
          account: "b",
          cat: "food",
          payee: "Corner Café",
        });
        S.txns.push({
          id: "t2",
          ts: 2,
          date: today(),
          type: "expense",
          amount: 9,
          account: "b",
          cat: "food",
          payee: "Bakery",
        });
        save();
        V.screen = "history";
        render();
        openFind();
      });
      return { c, p };
    };
    const rec = p => p.evaluate(() => JSON.parse(window.__rec || "[]"));
    const rows = p =>
      p.evaluate(() => [...document.querySelectorAll("#hbody .rec .recq")].map(b => b.textContent.trim()));
    const type = async (p, v) => {
      await p.fill("#find-q", v);
      await p.waitForTimeout(220);
    };
    const back = async p => {
      await p.evaluate(() => findBack());
      await p.evaluate(() => openFind());
    };

    // none yet: nothing shown, no heading
    let { c: c5, p: p5 } = await open5();
    let r = await p5.evaluate(() => ({
      html: $("#hbody").innerHTML.trim(),
      rec: !!$("#hbody .rec"),
      sec: !!$("#hbody .sec"),
    }));
    ok(r.html === "" && !r.rec && !r.sec, "no recent searches: the space stays empty: " + r.html.slice(0, 60));

    // kept: search mode closed by leaving History another way (not Back)
    await type(p5, "bakery");
    await p5.evaluate(() => {
      V.screen = "home";
      render();
    });
    ok(
      (await rec(p5))[0] === "bakery",
      "leaving History another way keeps the search: " + JSON.stringify(await rec(p5))
    );
    await p5.evaluate(() => {
      recentSave([]);
      V.screen = "history";
      render();
      openFind();
    });

    // kept: a suggestion tapped
    await type(p5, "corner");
    await p5.click('#hbody .sug[data-act="fs-pick"]');
    ok(
      (await rec(p5)).length === 1 && /^\u0001pay\u0001\u0001Corner Café\u0001corner$/.test((await rec(p5))[0]),
      "a suggestion tapped keeps that suggestion: " + JSON.stringify(await rec(p5))
    );
    // kept: a row opened
    await back(p5); // the suggestion's payee filter goes with search mode
    await type(p5, "bakery");
    await p5.click('#hbody [data-act="row-open"]');
    ok(
      (await rec(p5)).length === 2 && (await rec(p5))[0] === "bakery" && /Corner Café/.test((await rec(p5))[1]),
      "an entry opened keeps them, newest first: " + JSON.stringify(await rec(p5))
    );
    // kept: search mode closed; too short is not kept
    await type(p5, "b");
    await back(p5);
    ok((await rec(p5)).length === 2, "one character is not kept: " + JSON.stringify(await rec(p5)));
    await type(p5, "  caf ");
    await back(p5);
    ok(
      (await rec(p5))[0] === "caf" && (await rec(p5)).length === 3,
      "closing search mode keeps it, trimmed: " + JSON.stringify(await rec(p5))
    );
    // a search that found nothing, or under three letters, is not kept
    await type(p5, "zzzz");
    await back(p5);
    await type(p5, "ca");
    await back(p5);
    ok((await rec(p5)).length === 3, "nothing found, and two letters, are not kept");
    // the same words (capitals, accents) move to the top with the newest spelling
    await type(p5, "BAKERY");
    await back(p5);
    ok(
      (await rec(p5)).slice(0, 2).join() === "BAKERY,caf" && (await rec(p5)).length === 3,
      "same words move to the top, newest spelling: " + JSON.stringify(await rec(p5))
    );
    // at most five
    for (const w of ["cor", "corn", "corne", "bak"]) {
      await type(p5, w);
      await back(p5);
    }
    ok(
      JSON.stringify(await rec(p5)) === '["bak","corne","corn","cor","BAKERY"]',
      "at most five: " + (await p5.evaluate(() => window.__rec))
    );
    // shown: empty field, newest first, clock icon, a Forget button each, 48 px targets
    r = await p5.evaluate(() => {
      const q = [...document.querySelectorAll("#hbody .rec")];
      const sec = $("#hbody .sec");
      return {
        sec: sec && sec.textContent.trim(),
        role: sec && sec.getAttribute("role"),
        texts: q.map(x => x.querySelector(".recq").textContent.trim()),
        clock: q.every(x => !!x.querySelector(".recq svg, .recq .ic, .recq [class*=icon]")),
        labels: q.map(x => x.querySelector(".recx").getAttribute("aria-label")),
        hs: q.map(x => Math.round(x.querySelector(".recq").getBoundingClientRect().height)),
        xs: q.map(x => {
          const b = x.querySelector(".recx").getBoundingClientRect();
          return Math.round(b.width) + "x" + Math.round(b.height);
        }),
        live: $("#find-live").textContent,
      };
    });
    ok(r.sec === "Recent searches" && r.role === "heading", "heading Recent searches: " + r.sec);
    ok(r.texts.join() === "bak,corne,corn,cor,BAKERY", "five rows, newest first: " + r.texts);
    ok(r.clock, "each row has the clock icon");
    ok(r.labels[0] === "Forget: bak" && r.labels[4] === "Forget: BAKERY", "Forget labels: " + r.labels);
    ok(
      r.hs.every(h => h >= 48) && r.xs.every(s => s === "48x48" || (parseInt(s) >= 48 && +s.split("x")[1] >= 48)),
      "48 px targets: " + r.hs + " / " + r.xs
    );
    ok(r.live === "", "no count said for the recent list: " + JSON.stringify(r.live));
    // a recent search tapped: in the field, caret at the end, focus kept, results as typing
    await p5.click("#hbody .rec:nth-child(5) .recq, #hbody .list .rec:nth-of-type(5) .recq");
    r = await p5.evaluate(() => ({
      v: $("#find-q").value,
      q: HF.q,
      caret: $("#find-q").selectionStart + "/" + $("#find-q").selectionEnd,
      focus: document.activeElement && document.activeElement.id,
      rec: !!$("#hbody .rec"),
      sug: !!$("#hbody .sug"),
      clr: !$('#app [data-act="find-clear"]').hidden,
    }));
    ok(
      r.v === "BAKERY" && r.q === "BAKERY" && r.caret === "6/6" && r.focus === "find-q",
      "tapping fills the field, caret at the end, focus kept: " + JSON.stringify(r)
    );
    ok(!r.rec && r.sug && r.clr, "the list follows as typing would: " + JSON.stringify(r));
    // forget one
    await p5.click('#find-clear, [data-act="find-clear"]');
    await p5.waitForTimeout(50);
    await p5.click('#hbody [aria-label="Forget: corn"]');
    ok(
      JSON.stringify(await rec(p5)) === '["bak","corne","cor","BAKERY"]',
      "Forget removes just that one: " + (await p5.evaluate(() => window.__rec))
    );
    r = await p5.evaluate(() => ({
      texts: [...document.querySelectorAll("#hbody .rec .recq")].map(b => b.textContent.trim()),
      focus: document.activeElement && (document.activeElement.getAttribute("aria-label") || document.activeElement.id),
    }));
    ok(r.texts.join() === "bak,corne,cor,BAKERY", "the row is gone at once: " + r.texts);
    ok(r.focus === "Forget: cor", "focus moves to the next Forget: " + r.focus);
    for (const w of ["corne", "cor", "BAKERY"]) await p5.click('#hbody [aria-label="Forget: ' + w + '"]');
    r = await p5.evaluate(() => ({
      f: document.activeElement && document.activeElement.id,
      rows: document.querySelectorAll("#hbody .rec").length,
    }));
    ok(r.rows === 1, "one left");
    await p5.click('#hbody [aria-label="Forget: bak"]');
    r = await p5.evaluate(() => ({
      f: document.activeElement && document.activeElement.id,
      html: $("#hbody").innerHTML.trim(),
    }));
    ok(
      r.html === "" && r.f === "find-q" && (await p5.evaluate(() => window.__rec)) === "[]",
      "the last forgotten: empty space, focus to the field: " + JSON.stringify(r)
    );

    // never in saved data, localStorage, the shell's copy, a backup or CSV
    await p5.evaluate(() => recentKeep("zebrastripe"));
    r = await p5.evaluate(() => {
      const s = JSON.stringify(S),
        ls = Object.keys(localStorage)
          .map(k => k + "=" + localStorage.getItem(k))
          .join("\n");
      return {
        rec: window.__rec.includes("zebrastripe"),
        s: s.includes("zebrastripe"),
        ls: ls.includes("zebrastripe"),
        kept: window.__kept.join("").includes("zebrastripe"),
      };
    });
    ok(r.rec && !r.s && !r.ls && !r.kept, "recent searches only in the shell's own list: " + JSON.stringify(r));
    // Erase everything forgets them
    await p5.evaluate(() => {
      window.__recSets.length = 0;
      wipeConfirm();
    });
    await p5.click(".cd-destroy");
    r = await p5.evaluate(() => ({ rec: window.__rec, last: window.__recSets[window.__recSets.length - 1] }));
    ok(r.rec === "[]" && r.last === "[]", 'Erase everything calls recentSet("[]"): ' + JSON.stringify(r));
    await c5.close();

    // seeded by the shell: only five shown, a long one fits, garbage is ignored
    ({ c: c5, p: p5 } = await open5(true, JSON.stringify(["a1", "b2", "c3", "d4", "e5", "f6", "g7"])));
    ok((await rows(p5)).join() === "a1,b2,c3,d4,e5", "at most five shown: " + (await rows(p5)));
    await c5.close();
    for (const bad of ["not json", '{"a":1}', "[1,2]", "null", ""]) {
      ({ c: c5, p: p5 } = await open5(true, bad));
      ok(
        (await rows(p5)).length === 0 && !(await p5.$("#hbody .sec")),
        "an unreadable list shows nothing: " + JSON.stringify(bad)
      );
      await c5.close();
    }
    // a very long search is cut to 100 characters, not refused
    ({ c: c5, p: p5 } = await open5());
    await p5.evaluate(() => recentKeep("x".repeat(150)));
    r = await rec(p5);
    ok(r.length === 1 && r[0].length === 100, "a long search is cut to 100: " + r.map(x => x.length));
    await c5.close();

    // without the shell's methods (browser tests, older shells): kept in memory only
    ({ c: c5, p: p5 } = await open5(false));
    await p5.evaluate(() => recentKeep("memory"));
    await p5.evaluate(() => (findBack(), openFind()));
    ok((await rows(p5)).join() === "memory", "no Android.recentGet: kept in memory: " + (await rows(p5)));
    r = await p5.evaluate(() =>
      Object.keys(localStorage)
        .map(k => localStorage.getItem(k))
        .join()
        .includes("memory")
    );
    ok(!r, "and not in localStorage");
    await c5.close();
  }
  // ---- part 6: final review fixes: typed > and <, a person chip, Back restores History, the Filters sheet, the status
  {
    const open6 = async (many = false) => {
      const c = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
      await c.addInitScript(() => {
        window.Android = { getColors: () => null, setBars() {} };
      });
      const p = await c.newPage();
      p.on("pageerror", e => errors.push(e.message));
      await p.goto(appUrl);
      await p.evaluate(many => {
        S = blank();
        S.settings.cur = "USD";
        S.settings.lastCheck = today();
        S.accounts.push(
          { id: "b", name: "Everyday", type: "bank", currency: "USD", opening: 500000, archived: false },
          { id: "c", name: "Cash", type: "cash", currency: "USD", opening: 3000, archived: false }
        );
        let n = 0;
        const t = (days, type, amount, extra) =>
          S.txns.push({
            id: "t" + ++n,
            ts: n,
            date: addDays(today(), -days),
            type,
            amount,
            account: "b",
            note: "",
            ...extra,
          });
        if (many)
          for (let i = 0; i < 420; i++)
            t(i, "expense", 5 + (i % 7), { cat: "food", payee: "Shop", note: "store " + i });
        else {
          t(0, "expense", 49.99, { cat: "food", payee: "Kiosk", note: "coffee" });
          t(1, "expense", 50, { cat: "food", payee: "Bakery", note: "coffee" });
          t(2, "expense", 1250.5, { cat: "food", payee: "Outdoor Store", note: "rain jacket" });
          t(3, "expense", 50.5, { cat: "food", payee: "Bakery", note: "coffee" });
          S.loans.push(
            { id: "L1", kind: "lend", person: "Maya", account: "b", date: today(), note: "", status: "open" },
            { id: "L2", kind: "borrow", person: "Omar", account: "b", date: today(), note: "", status: "open" }
          );
          t(2, "loan", 300, { dir: "out", loan: "L1", principal: true });
          t(2, "loan", 80, { dir: "in", loan: "L2", principal: true });
        }
        save();
        render();
      }, many);
      return { c, p };
    };
    const type6 = async (p, q) => {
      await p.fill("#find-q", "");
      await p.keyboard.type(q);
      await p.waitForTimeout(250);
    };
    let { c: c6, p: p6 } = await open6();
    await p6.click('#app [data-act="search-open"]');

    // I1: a typed > or < filters as more / less than, as its suggestion does
    for (const [q, kind] of [
      [">50", "More than"],
      ["<50", "Less than"],
    ]) {
      await type6(p6, q);
      const r = await p6.evaluate(kind => {
        const amts = HLIST.map(t => t.amount).sort((a, b) => a - b);
        const sug = [...document.querySelectorAll("#hbody .sug")].find(x => x.textContent.includes(kind));
        return { amts, said: sug && /(\d+) entr/.exec(sug.textContent)[1], rows: histRows(HLIST).length };
      }, kind);
      const want = q[0] === ">" ? [50.5, 80, 300, 1250.5] : [49.99];
      ok(
        JSON.stringify(r.amts) === JSON.stringify(want),
        q + " lists " + (q[0] === ">" ? "only more" : "only less") + " than 50: " + r.amts
      );
      ok(
        r.said === String(r.rows),
        q + ": the list (" + r.rows + ") agrees with the suggestion's count (" + r.said + ")"
      );
    }

    // I2: a person from a suggestion reads as the name alone; with a kind, as History does
    for (const [who, other] of [
      ["maya", "Maya"],
      ["omar", "Omar"],
    ]) {
      await type6(p6, who);
      await p6.click('#hbody .sug:has-text("' + other + '")');
      const chip = await p6.evaluate(() =>
        [...document.querySelectorAll("#app .hchips .hchip")].map(x => x.textContent.trim())
      );
      ok(chip.length === 1 && chip[0] === other, "a person chip from a suggestion is just the name: " + chip);
      await p6.evaluate(() => (histClear(), render()));
    }
    for (const [kind, who, text] of [
      ["lend", "Maya", "Lent to Maya"],
      ["borrow", "Omar", "Borrowed from Omar"],
    ]) {
      const chip = await p6.evaluate(
        ([kind, who]) => {
          HF = { ...histBlank(), kind, who };
          render();
          return [...document.querySelectorAll("#app .hchips .hchip")].map(x => x.textContent.trim());
        },
        [kind, who]
      );
      ok(chip.includes(text), "with the kind set the person chip says '" + text + "': " + chip);
    }
    await p6.evaluate(() => (histClear(), render()));

    // I4: the Filters sheet's Clear all clears only the sheet's choices; the bar's Clear all clears everything
    await type6(p6, "coffee");
    await p6.evaluate(() => {
      HF.pay = "out:bakery";
      HF.amt = "gt:10";
      render();
    });
    await p6.click("#app .hfbtn");
    let r6 = await p6.evaluate(() => ({ q: HFD.q, count: $("#hfs-foot").textContent }));
    ok(r6.q === "coffee", "the sheet is opened with the words in it: " + JSON.stringify(r6));
    const want6 = await p6.evaluate(() => histRows(HLIST).length);
    ok(
      want6 === 2 && new RegExp("\\b" + want6 + "\\b").test(r6.count),
      "the sheet's count includes the words, the payee and the amount (" + want6 + "): " + JSON.stringify(r6.count)
    );
    await p6.evaluate(() => HFD && ($('#sheet [data-act="hfs-acc"][data-v="b"]') || { click() {} }).click());
    await p6.click('#sheet [data-act="hfs-clear"]');
    r6 = await p6.evaluate(() => ({ q: HFD.q, pay: HFD.pay, amt: HFD.amt, acc: HFD.acc }));
    ok(
      r6.q === "coffee" && r6.pay === "out:bakery" && r6.amt === "gt:10" && !r6.acc,
      "the sheet's Clear all keeps words, payee and amount: " + JSON.stringify(r6)
    );
    await p6.evaluate(() => $('#sheet [data-act="hfs-acc"][data-v="b"]').click());
    await p6.click('#sheet [data-act="hfs-show"]');
    r6 = await p6.evaluate(() => ({ q: HF.q, field: $("#find-q").value, pay: HF.pay, amt: HF.amt, acc: HF.acc }));
    ok(
      r6.q === "coffee" && r6.field === "coffee" && r6.pay === "out:bakery" && r6.amt === "gt:10" && r6.acc === "b",
      "Show keeps the field and the payee and amount, and sets the account: " + JSON.stringify(r6)
    );

    // M1: the status says the new count after a chip is removed
    await p6.click('#app .hchips .hchip[aria-label*="Paid to"]');
    r6 = await p6.evaluate(() => ({
      live: $("#find-live").textContent,
      want: T("history.count", { count: histRows(HLIST).length }),
    }));
    ok(r6.live === r6.want && r6.want !== "", "the status follows a chip removed: " + JSON.stringify(r6));

    // the bar's Clear all clears everything, the field too
    await p6.click('#app [data-act="hf-clear"]');
    r6 = await p6.evaluate(() => ({ q: HF.q, field: $("#find-q").value, pay: HF.pay, amt: HF.amt, acc: HF.acc }));
    ok(
      !r6.q && !r6.field && !r6.pay && !r6.amt && !r6.acc,
      "the bar's Clear all clears everything: " + JSON.stringify(r6)
    );

    // M7: search mode has a heading of its own
    r6 = await p6.evaluate(() => [...document.querySelectorAll("#app h1")].map(h => h.textContent.trim()));
    ok(r6.length === 1 && r6[0] === "Search History", "search mode has one h1, 'Search History': " + r6);

    // M6: Enter closes the keyboard and the focus moves on to the list, not to nowhere
    await p6.fill("#find-q", "");
    await p6.keyboard.type("coffee");
    await p6.keyboard.press("Enter");
    r6 = await p6.evaluate(() => ({
      body: document.activeElement === document.body,
      inList: !!document.activeElement.closest("#hbody"),
    }));
    ok(!r6.body && r6.inList, "after Enter the focus is on the first result: " + JSON.stringify(r6));

    // M4: a suggestion that leaves other words keeps one search, not two
    await p6.evaluate(() => recentSave([]));
    await p6.evaluate(() => (histClear(), findClear()));
    await type6(p6, "rain outdoor");
    await p6.click('#hbody .sug:has-text("Outdoor Store")');
    r6 = await p6.evaluate(() => HF.q);
    ok(r6 === "rain", "the suggestion leaves the rest in the field: " + r6);
    await p6.click('#app [data-act="find-back"]');
    r6 = await p6.evaluate(() => recentLoad());
    ok(
      r6.length === 2 && r6[0] === "rain" && /Outdoor Store/.test(r6[1]),
      "Back keeps the words left and the suggestion: " + JSON.stringify(r6)
    );

    // T4: marks on hostile and folded text (hl)
    r6 = await p6.evaluate(() => {
      const m = (q, text) => {
        HLW = hlTerms(q);
        const h = hl(text);
        HLW = null;
        return h;
      };
      return [
        m("jerry", "Tom & Jerry <b>"),
        m("strasse", "Straße"),
        m("ist", "İstanbul"),
        m("cafe", "Café"),
        m("咖啡", "咖啡店"),
        m("b", "<b>bold</b>"),
        m("amp", "AT&amp;T amp"),
      ];
    });
    const wantMarks = [
      'Tom &amp; <mark class="hl">Jerry</mark> &lt;b&gt;',
      '<mark class="hl">Straße</mark>',
      '<mark class="hl">İst</mark>anbul',
      '<mark class="hl">Café</mark>',
      '<mark class="hl">咖啡</mark>店',
      '&lt;b&gt;bold&lt;/<mark class="hl">b</mark>&gt;',
      'AT&amp;<mark class="hl">amp</mark>;T <mark class="hl">amp</mark>',
    ];
    wantMarks.forEach((w, i) => ok(r6[i] === w, "marks keep escaping and folding right (" + i + "): " + r6[i]));
    // HLW is reset even when drawing the rows throws
    r6 = await p6.evaluate(() => {
      const keep = dayGroups;
      try {
        dayGroups = () => {
          throw new Error("x");
        };
        HF.q = "coffee";
        histMonths(S.txns.slice(), 0, 5);
      } catch (e) {}
      dayGroups = keep;
      return HLW;
    });
    ok(r6 === null, "marks are switched off again when drawing throws");
    await c6.close();

    // I3: Back to History as it was left: place, opened row and drawn rows
    ({ c: c6, p: p6 } = await open6(true));
    const left = await p6.evaluate(() => {
      HF = { ...histBlank(), kind: "out" };
      V.screen = "history";
      render();
      histMore();
      scrollTo(0, 9000);
      const row = [...document.querySelectorAll('#app [data-act="row-open"]')].find(x => {
        const b = x.getBoundingClientRect();
        return b.top > 100 && b.bottom < innerHeight - 100;
      });
      row.click();
      return { y: scrollY, open: V.open, n: HSHOW.n, kind: HF.kind, a: rowAnchor($("#app")) };
    });
    ok(
      left.y > 3000 && left.open && left.n > 300,
      "History is scrolled, a row open and a second chunk drawn: " + JSON.stringify(left)
    );
    await p6.evaluate(() => openFind()); // opened from elsewhere (not History's bar)
    await p6.keyboard.type("store 3");
    await p6.waitForTimeout(250);
    await p6.evaluate(() => scrollTo(0, 400));
    await p6.click('#app [data-act="find-back"]');
    await p6.waitForTimeout(100);
    r6 = await p6.evaluate(() => ({
      y: scrollY,
      open: V.open,
      n: HSHOW.n,
      kind: HF.kind,
      rowOpen: !!document.querySelector('#app .tx.en[aria-expanded="true"]'),
      a: rowAnchor($("#app")),
    }));
    ok(
      r6.y > 3000 && r6.a.v === left.a.v && Math.abs(r6.a.top - left.a.top) <= 3,
      "Back: History is where it was left (the same row in the same place, not the search list's): " +
        JSON.stringify([r6.y, r6.a, left.a])
    );
    ok(r6.open === left.open && r6.rowOpen, "Back: the opened row is open again: " + JSON.stringify(r6));
    ok(r6.n >= left.n && r6.kind === "out", "Back: the drawn rows and filter are back: " + JSON.stringify(r6));
    // a row that no longer exists is not reopened
    await p6.click('#app [data-act="search-open"]');
    await p6.evaluate(() => {
      FIND.keep.open = "gone";
    });
    await p6.click('#app [data-act="find-back"]');
    r6 = await p6.evaluate(() => V.open);
    ok(r6 === "", "Back: an opened entry that is gone stays closed: " + r6);
    // opened from the top, results scrolled, Back: History is at the top again (once the place put back by the last Back
    // has settled: toAnchor holds it for a moment)
    await p6.waitForTimeout(300);
    await p6.evaluate(() => scrollTo(0, 0));
    await p6.click('#app [data-act="search-open"]');
    await p6.keyboard.type("store 3");
    await p6.waitForTimeout(250);
    await p6.evaluate(() => scrollTo(0, 1500));
    await p6.click('#app [data-act="find-back"]');
    await p6.waitForTimeout(100);
    r6 = await p6.evaluate(() => scrollY);
    ok(r6 <= 3, "Back: History from the top comes back at the top, not where the results were scrolled: " + r6);
    await c6.close();
  }
  // ---- part 7: Back steps back through suggestion taps; people from lendings and loans, an exact name first
  {
    const c7 = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
    await c7.addInitScript(() => {
      window.Android = { getColors: () => null, setBars() {} };
    });
    const p7 = await c7.newPage();
    p7.on("pageerror", e => errors.push(e.message));
    await p7.goto(appUrl);
    await p7.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push({ id: "b", name: "Everyday", type: "bank", currency: "USD", opening: 500000, archived: false });
      let n = 0;
      const t = (type, amount, extra) =>
        S.txns.push({
          id: "t" + ++n,
          ts: n,
          date: addDays(today(), -n),
          type,
          amount,
          account: "b",
          note: "",
          ...extra,
        });
      t("expense", 4.75, { cat: "food", payee: "Corner Café" });
      t("expense", 6, { cat: "food", payee: "Corner Café" });
      [
        ["L1", "lend", "Mahin bhai", 7],
        ["L2", "lend", "Mahin", 6],
        ["L3", "lend", "Mahadi", 2],
        ["L4", "borrow", "Ma", 3],
      ].forEach(([id, kind, person, count]) => {
        S.loans.push({ id, kind, person, account: "b", date: today(), note: "", status: "open" });
        for (let i = 0; i < count; i++)
          t("loan", 10 + i, { dir: kind === "lend" ? "out" : "in", loan: id, principal: true });
      });
      save();
      V.screen = "assets";
      render();
    });
    const sugs7 = () =>
      p7.evaluate(() =>
        [...document.querySelectorAll("#hbody .sug")].map(x => ({
          t: x.querySelector(".sgt").textContent,
          s: x.querySelector(".s").textContent,
          a: x.getAttribute("aria-label"),
        }))
      );
    const type7 = async q => {
      await p7.fill("#find-q", "");
      await p7.keyboard.type(q);
      await p7.waitForTimeout(250);
    };
    // B: the people
    await p7.click('#app [data-act="search-open"]');
    await type7("ma");
    let r7 = (await sugs7()).filter(x => /^(Lent to|Borrowed from|Person)/.test(x.s));
    ok(r7.length === 3 && r7[0].t === "Ma", "an exact name is offered first among the people: " + JSON.stringify(r7));
    ok(r7[0].s === "Borrowed from · 3 entries", "a borrowed person says Borrowed from: " + r7[0].s);
    ok(
      r7[1].t === "Mahin bhai" && r7[1].s === "Lent to · 7 entries",
      "then the most used, Lent to: " + JSON.stringify(r7[1])
    );
    ok(/Borrowed from Ma, 3 entries/.test(r7[0].a), "the spoken label says it too: " + r7[0].a);
    // A: Back steps back through suggestion taps
    await type7("corner");
    await p7.click('#hbody .sug:has-text("Corner Café")');
    r7 = await p7.evaluate(() => ({
      q: HF.q,
      pay: HF.pay,
      chips: document.querySelectorAll("#app .hchips .hchip").length,
    }));
    ok(r7.pay && r7.q === "" && r7.chips === 1, "the tap set the payee and left the field: " + JSON.stringify(r7));
    await p7.evaluate(() => goBack());
    r7 = await p7.evaluate(() => ({
      find: V.find,
      field: $("#find-q").value,
      q: HF.q,
      pay: HF.pay,
      chips: document.querySelectorAll("#app .hchips .hchip").length,
      sugs: document.querySelectorAll("#hbody .sug").length,
      focus: document.activeElement === $("#find-q"),
    }));
    ok(
      r7.find && r7.field === "corner" && r7.q === "corner" && !r7.pay && r7.chips === 0 && r7.sugs > 0 && r7.focus,
      "Back undoes the tap: the words, the suggestions, no chip, still searching: " + JSON.stringify(r7)
    );
    // a chip's x is not a step; two taps take two Backs
    await p7.click('#hbody .sug:has-text("Corner Café")');
    await p7.click('#app .hchips .hchip[aria-label*="Paid to"]');
    await type7("everyday");
    await p7.click('#hbody .sug:has-text("Everyday")');
    await p7.evaluate(() => goBack());
    r7 = await p7.evaluate(() => ({ find: V.find, field: $("#find-q").value, acc: HF.acc }));
    ok(
      r7.find && r7.field === "everyday" && !r7.acc,
      "Back undoes the last tap only (the chip's x added no step): " + JSON.stringify(r7)
    );
    await p7.evaluate(() => goBack());
    r7 = await p7.evaluate(() => ({ find: V.find, field: $("#find-q").value, pay: HF.pay }));
    ok(
      r7.find && r7.field === "corner everyday" && !r7.pay,
      "the earlier tap is undone by the next Back (the words typed since stay): " + JSON.stringify(r7)
    );
    await p7.evaluate(() => goBack());
    r7 = await p7.evaluate(() => ({ find: V.find, screen: V.screen }));
    ok(
      !r7.find && r7.screen === "assets",
      "Back with no tap left leaves search mode for Assets: " + JSON.stringify(r7)
    );
    // a sheet closes first
    await p7.click('#app [data-act="search-open"]');
    await type7("corner");
    await p7.click('#hbody .sug:has-text("Corner Café")');
    await p7.click("#app .hfbtn");
    await p7.evaluate(() => goBack());
    r7 = await p7.evaluate(() => ({ sheet: !!$("#sheet").innerHTML, pay: HF.pay }));
    ok(!r7.sheet && r7.pay, "Back closes the sheet before undoing a tap: " + JSON.stringify(r7));
    // Clear all and the field's x are resets: Back does not undo a tap before them
    await p7.evaluate(() => closeSheet());
    for (const how of ["hf-clear", "find-clear"]) {
      await p7.evaluate(() => {
        histClear();
        findClear();
        FIND.steps.splice(0);
        render();
      });
      await type7("corner");
      await p7.click('#hbody .sug:has-text("Corner Café")');
      const picked = await p7.evaluate(() => FIND.steps.length);
      if (how === "find-clear") await type7("zz");
      await p7.click('#app [data-act="' + how + '"]');
      await p7.evaluate(() => goBack());
      r7 = await p7.evaluate(() => ({ find: V.find, screen: V.screen }));
      ok(picked === 1 && !r7.find, "Back after " + how + " leaves search mode: " + JSON.stringify([picked, r7]));
      await p7.evaluate(() => {
        V.screen = "assets";
        render();
      });
      await p7.click('#app [data-act="search-open"]');
    }
    await c7.close();
  }

  // ---- part 8 (round 2a): a typed < or > on an entry with a fee, Back undoes one suggestion, the period put back,
  // word starts from Intl.Segmenter, the typo ladder, folding per language
  {
    const c8 = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
    await c8.addInitScript(() => {
      window.Android = { getColors: () => null, setBars() {} };
    });
    const p8 = await c8.newPage();
    p8.on("pageerror", e => errors.push(e.message));
    await p8.goto(appUrl);
    await p8.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push(
        { id: "b", name: "Everyday", type: "bank", currency: "USD", opening: 500000, archived: false },
        { id: "c", name: "Cash", type: "cash", currency: "USD", opening: 3000, archived: false }
      );
      let n = 0;
      const t = (days, type, amount, extra) =>
        S.txns.push({
          id: "t" + ++n,
          ts: n,
          date: addDays(today(), -days),
          type,
          amount,
          account: "b",
          note: "",
          ...extra,
        });
      t(0, "expense", 49.99, { cat: "food", payee: "Kiosk", note: "coffee" });
      t(1, "transfer", 1000, { to: "c", toAmount: 1000, feeId: "t3" });
      t(1, "expense", 2, { feeOf: "t2", note: "transfer fee" });
      t(2, "expense", 70, { cat: "food", payee: "Outdoor Store", note: "rain jacket" });
      t(3, "expense", 12, { cat: "food", payee: "Corner Café", note: "lunch" });
      save();
      V.screen = "assets";
      render();
    });
    const type8 = async q => {
      await p8.fill("#find-q", "");
      await p8.keyboard.type(q);
      await p8.waitForTimeout(250);
    };
    const st8 = () =>
      p8.evaluate(() => ({
        find: V.find,
        screen: V.screen,
        field: $("#find-q") ? $("#find-q").value : null,
        q: HF.q,
        pay: HF.pay,
        acc: HF.acc,
        kind: HF.kind,
        period: HP.period,
        anchor: HP.anchor,
        steps: FIND.steps.length,
      }));
    const openS = () => p8.click('#app [data-act="search-open"]');
    const toAssets = () =>
      p8.evaluate(() => {
        V.screen = "assets";
        render();
      });

    // N1: a typed < or > compares the entry's own amount, never its fee's
    await openS();
    await type8("<50");
    let r8 = await p8.evaluate(() => {
      const sug = [...document.querySelectorAll("#hbody .sug")].find(x => x.textContent.includes("Less than"));
      return {
        ids: HLIST.map(t => t.id).sort(),
        said: sug && /(\d+) entr/.exec(sug.textContent)[1],
        rows: histRows(HLIST).length,
      };
    });
    ok(
      JSON.stringify(r8.ids) === JSON.stringify(["t1", "t5"]),
      "<50 lists only the entries of less than 50, not the $1,000 transfer with its $2 fee: " + r8.ids
    );
    ok(r8.said === String(r8.rows), "<50: the suggestion's count (" + r8.said + ") is the list's (" + r8.rows + ")");
    await type8(">50");
    r8 = await p8.evaluate(() => ({ ids: HLIST.map(t => t.id).sort() }));
    ok(
      JSON.stringify(r8.ids) === JSON.stringify(["t2", "t3", "t4"]),
      ">50 lists the transfer (its own amount), its fee following it: " + r8.ids
    );

    // Ruling 7: Back undoes only the suggestion tapped; what was chosen after it stays
    await p8.fill("#find-q", "");
    await type8("rain outdoor");
    await p8.click('#hbody .sug:has-text("Outdoor Store")');
    await p8.click("#app .hfbtn");
    await p8.click('#sheet [data-act="hfs-acc"][data-v="b"]');
    await p8.click('#sheet [data-act="hfs-show"]');
    await type8("rain jacket");
    await p8.evaluate(() => goBack());
    r8 = await st8();
    const caret = await p8.evaluate(() => [
      $("#find-q").selectionStart,
      $("#find-q").selectionEnd,
      $("#find-q").value.length,
      document.activeElement === $("#find-q"),
    ]);
    ok(
      r8.find && !r8.pay && r8.acc === "b" && r8.field === "rain outdoor jacket" && r8.q === r8.field,
      "Back after a tap: the payee comes off, its word returns, the account and the typed word stay: " +
        JSON.stringify(r8)
    );
    ok(
      caret[0] === caret[2] && caret[1] === caret[2] && caret[3],
      "Back after a tap: the caret is at the end of the field, which has the focus: " + caret
    );
    await p8.evaluate(() => goBack());
    r8 = await st8();
    ok(!r8.find && r8.screen === "assets", "the next Back leaves search mode: " + JSON.stringify(r8));

    // two taps, a typed word, Back twice: the last tap first, the period too
    await openS();
    await type8("outdoor");
    await p8.click('#hbody .sug:has-text("Outdoor Store")');
    await type8(await p8.evaluate(() => today().slice(0, 4)));
    await p8.click('#hbody .sug:has-text("Spent"), #hbody .sug >> text=/^\\d{4}/');
    r8 = await st8();
    ok(
      r8.period === "year" && r8.pay && r8.steps === 2,
      "two taps: the year and the payee are set: " + JSON.stringify(r8)
    );
    await p8.evaluate(() => goBack());
    r8 = await st8();
    ok(
      r8.find && r8.period === "all" && !!r8.pay && r8.field === (await p8.evaluate(() => today().slice(0, 4))),
      "Back one: the year comes off and its word returns, the payee stays: " + JSON.stringify(r8)
    );
    await p8.evaluate(() => goBack());
    r8 = await st8();
    ok(r8.find && !r8.pay && r8.field.includes("outdoor"), "Back two: the payee comes off: " + JSON.stringify(r8));

    // a choice that replaced the suggestion's filter is the user's now: Back leaves it
    await p8.evaluate(() => (histClear(), findClear(), FIND.steps.splice(0), render()));
    await type8("everyday");
    await p8.click('#hbody .sug:has-text("Everyday")');
    await p8.click("#app .hfbtn");
    await p8.click('#sheet [data-act="hfs-acc"][data-v="c"]');
    await p8.click('#sheet [data-act="hfs-show"]');
    await p8.evaluate(() => goBack());
    r8 = await st8();
    ok(
      r8.find && r8.acc === "c" && r8.field === "everyday",
      "a later account choice stays after Back: " + JSON.stringify(r8)
    );

    // the top bar's arrow leaves at once, and the words are kept as one recent search
    await p8.evaluate(() => (histClear(), findClear(), FIND.steps.splice(0), recentSave([]), render()));
    await type8("rain outdoor");
    await p8.click('#hbody .sug:has-text("Outdoor Store")');
    await p8.click('#app [data-act="find-back"]');
    r8 = await st8();
    const rec8 = await p8.evaluate(() => recentLoad());
    ok(!r8.find && r8.screen === "assets", "the top bar's arrow leaves search mode at once: " + JSON.stringify(r8));
    ok(
      rec8.length === 2 && rec8[0] === "rain" && /Outdoor Store/.test(rec8[1]),
      "…and keeps the words left and the suggestion tapped: " + JSON.stringify(rec8)
    );

    // Clear all and the field's x empty the steps
    for (const how of ["hf-clear", "find-clear"]) {
      await openS();
      await type8("outdoor");
      await p8.click('#hbody .sug:has-text("Outdoor Store")');
      const n1 = await p8.evaluate(() => FIND.steps.length);
      if (how === "find-clear") await type8("zz");
      await p8.click('#app [data-act="' + how + '"]');
      const n2 = await p8.evaluate(() => FIND.steps.length);
      ok(n1 === 1 && n2 === 0, how + " empties the steps: " + [n1, n2]);
      await p8.click('#app [data-act="find-back"]');
    }

    // Ruling 8: History's period is put back by every way out of search mode
    const yr = await p8.evaluate(() => today().slice(0, 4));
    const tapYear = async () => {
      await type8(yr);
      await p8.click("#hbody .sug >> nth=0");
      return (await st8()).period;
    };
    for (const [how, leave] of [
      ["Back", () => p8.evaluate(() => (goBack(), goBack()))],
      ["the arrow", () => p8.click('#app [data-act="find-back"]')],
      ["a tab", () => p8.evaluate(() => ((V.screen = "home"), render()))],
      ["a link to History", () => p8.evaluate(() => openHistory({ acc: "b" }))],
    ]) {
      await toAssets();
      await openS();
      const during = await tapYear();
      await leave();
      r8 = await st8();
      ok(
        during === "year" && r8.period === "all",
        "from a tab, leaving by " + how + ": all time again: " + JSON.stringify([during, r8.period])
      );
    }
    for (const [how, leave] of [
      ["Back", () => p8.evaluate(() => (goBack(), goBack()))],
      ["the arrow", () => p8.click('#app [data-act="find-back"]')],
      ["a tab", () => p8.evaluate(() => ((V.screen = "home"), render()))],
    ]) {
      await p8.evaluate(() => {
        openHistory({ kind: "out" });
        Object.assign(HP, { period: "month", anchor: today(), rs: null, re: null });
        render();
      });
      await openS();
      const during = await tapYear();
      await leave();
      r8 = await st8();
      ok(
        during === "year" && r8.period === "month" && r8.anchor === (await p8.evaluate(() => today())),
        "from History, leaving by " + how + ": its own period again: " + JSON.stringify([during, r8.period, r8.anchor])
      );
      if (how !== "a tab") ok(r8.screen === "history" && r8.kind === "out", "…and its filter: " + JSON.stringify(r8));
    }
    await toAssets();

    // 6a: word starts from Intl.Segmenter
    const hit8 = (q, payee) =>
      p8.evaluate(
        ([q, payee]) => {
          const saved = [S.txns, S.accounts];
          S.txns = [{ id: "x1", ts: 1, date: today(), type: "expense", amount: 5, account: "b", payee, cat: "food" }];
          saveSeq++;
          const r = histMatch(S.txns[0], { ...histBlank(), q });
          [S.txns, S.accounts] = saved;
          saveSeq++;
          return r;
        },
        [q, payee]
      );
    for (const [q, payee, want, why] of [
      ["京大", "東京大学", true, "Japanese: two characters match anywhere (京大 across two words)"],
      ["大学", "東京大学", true, "Japanese: 大学 starts the word 大学"],
      ["東京", "東京大学", true, "Japanese: 東京 starts the first word"],
      ["東京大", "東京大学", true, "Japanese: a start of a word, going on into the next"],
      ["スタンド", "ガソリンスタンド", true, "Japanese katakana: スタンド finds the compound ガソリンスタンド"],
      ["バックス", "スターバックス", true, "Japanese katakana: バックス starts a word"],
      ["京烤", "北京烤鸭", true, "Chinese: two characters match anywhere"],
      ["烤鸭", "北京烤鸭", true, "Chinese: 烤鸭 starts a word"],
      ["京", "北京烤鸭", false, "Chinese: 京 alone is inside 北京"],
      ["北京", "北京烤鸭", true, "Chinese: 北京 starts the first word"],
      ["แฟ", "ร้านกาแฟ", true, "Thai: two characters match anywhere"],
      ["กาแฟ", "ร้านกาแฟ", true, "Thai: กาแฟ starts a word"],
      ["ร้าน", "ร้านกาแฟ", true, "Thai: ร้าน starts the first word"],
      ["벅스", "스타벅스에서 커피", true, "Korean: two characters match anywhere"],
      ["스타", "스타벅스에서 커피", true, "Korean: 스타 starts a word"],
      ["커피", "스타벅스에서 커피", true, "Korean: a word after a space"],
      ["都", "京都大学", false, "Chinese: one character mid-word does not match"],
      ["大", "京都大学", true, "Chinese: one character at the start of a word matches"],
      ["ス", "ガソリンスタンド", false, "Japanese: one character inside a word does not match"],
      ["ガ", "ガソリンスタンド", true, "Japanese: one character at a word start matches"],
      ["ฟ", "ร้านกาแฟ", false, "Thai: one character inside a word does not match"],
      ["ก", "ร้านกาแฟ", true, "Thai: one character at a word start matches"],
      ["벅", "스타벅스에서 커피", false, "Korean: one character inside a word does not match"],
      ["스", "스타벅스에서 커피", true, "Korean: one character at a word start matches"],
      ["abc", "東京abc", true, "a Latin word right after Chinese characters starts a word"],
      ["ramen", "Ramen 東京", true, "Latin words beside Chinese characters"],
    ]) {
      const got = await hit8(q, payee);
      ok(got === want, why + ": " + q + " in " + payee + " → " + got);
    }
    // marks use the same word starts and map back exactly
    r8 = await p8.evaluate(() => {
      const m = (q, text) => {
        HLW = hlTerms(q);
        const h = hl(text);
        HLW = null;
        return h;
      };
      return [
        m("大学", "東京大学"),
        m("京大", "東京大学"),
        m("都", "京都大学"),
        m("東京大", "東京大学"),
        m("กาแฟ", "ร้านกาแฟ"),
        m("ฟ", "ร้านกาแฟ"),
        m("烤鸭", "北京烤鸭 & 酒"),
        m("ガソリン", "ｶﾞｿﾘﾝ 24h"),
        m("abc", "東京abc"),
      ];
    });
    [
      '東京<mark class="hl">大学</mark>',
      '東<mark class="hl">京大</mark>学',
      "京都大学",
      '<mark class="hl">東京大</mark>学',
      'ร้าน<mark class="hl">กาแฟ</mark>',
      "ร้านกาแฟ", // one character inside a word: no mark
      '北京<mark class="hl">烤鸭</mark> &amp; 酒',
      '<mark class="hl">ｶﾞｿﾘﾝ</mark> 24h',
      '東京<mark class="hl">abc</mark>',
    ].forEach((want, i) => ok(r8[i] === want, "mark " + (i + 1) + ": " + r8[i]));
    // no Intl.Segmenter: today's behaviour (a short word matches anywhere in these scripts)
    r8 = await p8.evaluate(() => {
      const seg = Intl.Segmenter;
      Intl.Segmenter = undefined;
      saveSeq++;
      try {
        const f = (q, payee) => srEntryHit({ id: "y" + payee, payee, account: "b" }, srTerms(q), false);
        return [
          f("京大", "東京大学"),
          f("ターバ", "スターバックス"),
          f("大学", "東京大学"),
          f("cafe", "Café"),
          f("都", "京都大学"),
        ];
      } finally {
        Intl.Segmenter = seg;
        saveSeq++;
      }
    });
    ok(
      JSON.stringify(r8) === "[true,true,true,true,true]",
      "without Intl.Segmenter these scripts match anywhere again, as before: " + r8
    );

    // 6b: the typo ladder: 1 typo from 5 letters, 2 from 9, only through the near-word button
    await p8.evaluate(() => {
      S.txns.push(
        {
          id: "w1",
          ts: 90,
          date: today(),
          type: "expense",
          amount: 3,
          account: "b",
          cat: "food",
          payee: "Coffee House",
        },
        {
          id: "w2",
          ts: 91,
          date: today(),
          type: "expense",
          amount: 3,
          account: "b",
          cat: "food",
          payee: "Supermarket",
        },
        { id: "w3", ts: 92, date: today(), type: "expense", amount: 3, account: "b", cat: "food", payee: "Pharmacy" }
      );
      save();
    });
    await openS();
    for (const [typed, want, why] of [
      ["cofee", "coffee", "5 letters, one letter missing"],
      ["cofe", "", "4 letters: no typo allowed"],
      ["cofeee", "coffee", "6 letters, a letter missing and one more (one typo of two)"],
      ["pharmcy", "pharmacy", "7 letters, one typo"],
      ["pharmcey", "", "8 letters, two typos: only one allowed"],
      ["sopermrket", "supermarket", "10 letters, two typos"],
      ["sopermrkat", "", "10 letters, three typos"],
      ["supermakret", "supermarket", "11 letters, a swapped pair"],
    ]) {
      await type8(typed);
      const got = await p8.evaluate(() => ({
        word: FIXW ? FIXW.word : "",
        rows: histRows(HLIST).length,
        field: $("#find-q").value,
        btn: !!$('#hbody [data-act="find-fix"]'),
      }));
      ok(
        got.word === want && got.btn === !!want && got.rows === 0 && got.field === typed,
        why + ": " + typed + " → '" + got.word + "', nothing swapped in by itself: " + JSON.stringify(got)
      );
    }
    r8 = await p8.evaluate(() => {
      const e = (q, payee) => srEntryHit({ id: "z" + payee + q, payee, account: "b" }, [q], true);
      saveSeq++;
      return [
        e("cofee", "Coffee"),
        e("cofe", "Coffee"),
        e("pharmcey", "Pharmacy"),
        e("sopermrket", "Supermarket"),
        e("sopermrket", "Supper"),
      ];
    });
    ok(JSON.stringify(r8) === "[true,false,false,true,false]", "the ladder in the entry match too: " + r8);
    await p8.click('#app [data-act="find-back"]');

    // 6c: folding per language: typed plain, the written form is found
    r8 = await p8.evaluate(() => {
      const out = [];
      const pairs = [
        ["German", "Straße Müller Bäckerei Köln", "strasse muller backerei koln"],
        ["German ß", "Fußgängerzone", "fussgangerzone"],
        ["Turkish", "İstanbul Şehir Müzesi Doğan Işık ığdır", "istanbul sehir muzesi dogan isik igdir"],
        ["Russian ё", "Ёжик Мёд", "ежик мед"],
        ["Russian й", "Йогурт Чай", "иогурт чаи"],
        ["Vietnamese", "Phở Bò Việt Nam Đà Nẵng", "pho bo viet nam da nang"],
        ["Spanish", "Peña Niño Pingüino", "pena nino pinguino"],
        ["French", "Œuf Cœur Façade", "oeuf coeur facade"],
        ["Portuguese", "São João Coração", "sao joao coracao"],
        ["Indonesian", "Warung Makan Bu Siti", "warung makan siti"],
        ["Chinese full-width", "ＳＴＡＲＢＵＣＫＳ ＡＢＣ１２３", "starbucks abc123"],
        ["Japanese half-width katakana", "ﾄﾖﾀ ｶﾞｿﾘﾝ", "トヨタ ガソリン"],
      ];
      S.accounts = S.accounts.slice(0, 2);
      pairs.forEach(([name, written, typed]) => {
        saveSeq++;
        const t = {
          id: "f-" + name,
          ts: 1,
          date: today(),
          type: "expense",
          amount: 5,
          account: "b",
          payee: written,
          cat: "food",
        };
        S.txns.push(t);
        const found = srEntryHit(t, srTerms(typed), false);
        HLW = hlTerms(typed);
        const h = hl(written);
        HLW = null;
        out.push([name, found, (h.match(/<mark/g) || []).length]);
      });
      return out;
    });
    r8.forEach(([name, found, marks]) =>
      ok(found && marks >= 1, name + ": typed plain, the written form is found and marked: " + [found, marks])
    );
    await c8.close();
  }
  // ---- part 9: Charges and Extras as kind suggestions (docs/plans/2026-11-13-preview-polish.md, item 4): found by
  // their names and by other words ("fee", "tip"), with a grey emblem; "Nothing matches" only when nothing did
  {
    const J9 = JSON.stringify;
    const open9 = async locale => {
      const c = await browser.newContext({ viewport: { width: 393, height: 852 }, locale });
      await c.addInitScript(locale => {
        const ui = locale.slice(0, 2);
        window.Android = { getLocale: () => JSON.stringify({ ui, fmt: locale }), getColors: () => null, setBars() {} };
      }, locale);
      const p = await c.newPage();
      p.on("pageerror", e => errors.push(e.message));
      await p.goto(appUrl);
      await p.evaluate(() => {
        const d = today(),
          e = (id, type, amount, account, extra) => ({
            id,
            ts: +id.slice(1),
            date: d,
            type,
            amount,
            account,
            ...extra,
          });
        S = blank();
        S.settings.cur = "USD";
        S.settings.lastCheck = d;
        S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 5000, archived: false });
        S.accounts.push({ id: "b", name: "Cash", type: "cash", currency: "USD", opening: 100, archived: false });
        S.txns.push(
          e("t1", "expense", 70, "a", { payee: "Harbour Grill", cat: "food", feeId: "t2" }),
          e("t2", "expense", 6.4, "a", { cat: "food", feeOf: "t1" }),
          e("t3", "transfer", 300, "a", { to: "b", feeId: "t4" }),
          e("t4", "expense", 1.5, "a", { cat: "fees", feeOf: "t3" }),
          e("t5", "loan", 500, "a", { dir: "out", loan: "L", principal: true, onTop: 50 }),
          e("t6", "loan", 100, "a", { dir: "in", loan: "L", feeId: "t7" }),
          e("t7", "income", 2, "a", { cat: "otherin", feeOf: "t6" }),
          e("t8", "expense", 12, "a", { payee: "Kiosk", cat: "groceries" }),
          // archived: never a row, so never counted in a suggestion either
          e("t9", "expense", 40, "a", { cat: "shopping", feeId: "t10", archived: true }),
          e("t10", "expense", 4, "a", { cat: "shopping", feeOf: "t9", archived: true })
        );
        S.loans.push({ id: "L", ts: 1, kind: "lend", person: "Rafi", account: "a", date: d, note: "", status: "open" });
        save();
        V.screen = "home";
        render();
      });
      await p.click('#app [data-act="search-open"]');
      return { c, p };
    };
    const type9 = async (p, q) => {
      await p.fill("#find-q", "");
      await p.keyboard.type(q);
      await p.waitForTimeout(250);
    };
    const look9 = p =>
      p.evaluate(() => ({
        sugs: [...document.querySelectorAll("#hbody .sug")].map(b => {
          const em = b.querySelector(".em"),
            r = em.getBoundingClientRect();
          return {
            t: b.querySelector(".sgt").textContent,
            s: b.querySelector(".s").textContent,
            a: b.getAttribute("aria-label"),
            w: Math.round(r.width),
            h: Math.round(r.height),
            bg: getComputedStyle(em).backgroundColor,
            /* which icon: its path is the one in ICONS */
            i: Object.keys(ICONS).find(k => em.querySelector('svg path[d="' + ICONS[k][0] + '"]')) || "",
          };
        }),
        empty: (document.querySelector("#hbody .empty") || {}).textContent || "",
        rows: document.querySelectorAll("#hbody .tx").length,
      }));
    const { c: c9, p: p9 } = await open9("en-US");
    const grey = "rgb(122, 129, 144)"; // CHARGES_C, #7a8190
    for (const [q, want] of [
      ["fee", "Charges"],
      ["FEES", "Charges"],
      ["charge", "Charges"],
      ["charges", "Charges"],
      ["tip", "Extras"],
      ["Tips", "Extras"],
      ["interest", "Extras"],
      ["extras", "Extras"],
    ]) {
      await type9(p9, q);
      const r = await look9(p9),
        s = r.sugs.find(x => x.t === want);
      ok(!!s && /^Kind · \d+ entr/.test(s.s), q + ": the kind " + want + " is suggested: " + J9(r.sugs.map(x => x.t)));
    }
    await type9(p9, "fee");
    let r = await look9(p9);
    let s = r.sugs.find(x => x.t === "Charges");
    ok(
      s.s === "Kind · 2 entries" && s.a === "Kind Charges, 2 entries",
      "fee: Charges, 2 entries (not the archived one)"
    );
    ok(
      s.w === 40 && s.h === 40 && s.bg === grey && s.i === "request_quote",
      "Charges' emblem: a 40 px grey circle with the receipt icon, not a bare dot: " + JSON.stringify(s)
    );
    ok(!r.empty && r.rows === 0, "no entry has the word, a suggestion does: no “Nothing matches”: " + J9(r));
    await type9(p9, "tip");
    r = await look9(p9);
    s = r.sugs.find(x => x.t === "Extras");
    ok(
      s.s === "Kind · 2 entries" && s.w === 40 && s.bg === grey && s.i === "add_circle",
      "tip: Extras, 2 entries, a grey circle with the plus icon: " + JSON.stringify(s)
    );
    ok(!r.empty, "…and no “Nothing matches” under it");
    // with a filter set, no rows and a suggestion (so no message with its Clear all): Clear all stays on the bar
    await p9.evaluate(() => {
      HF.acc = "a";
      findDraw();
    });
    await type9(p9, "fee");
    r = await look9(p9);
    const bar = await p9.evaluate(() => ({
      clear: [...document.querySelectorAll('#app [data-act="hf-clear"]')].map(b => !!b.closest(".hbar")),
      chips: document.querySelectorAll("#app .hchips .hchip").length,
    }));
    ok(
      r.sugs.some(x => x.t === "Charges") && !r.empty && r.rows === 0 && J9(bar.clear) === "[true]",
      "a filter set, a suggestion and no rows: Clear all is on the bar: " + J9(bar)
    );
    await p9.click('#app .hbar [data-act="hf-clear"]');
    await p9.waitForTimeout(250);
    ok(await p9.evaluate(() => histCount() === 0 && !HF.q), "…and it clears the filter and the words");
    await type9(p9, "zzzz");
    r = await look9(p9);
    ok(!r.sugs.length && r.empty.includes("Nothing matches “zzzz”"), "nothing at all: Nothing matches “zzzz”");
    await type9(p9, "fe");
    r = await look9(p9);
    ok(!r.sugs.some(x => x.t === "Charges"), "two letters of a short word are not enough: " + J9(r.sugs));
    // tapped: the kind is set, its words leave the field, the rows are History's own
    await type9(p9, "fee");
    await p9.click('#hbody .sug[data-act="fs-pick"]');
    await p9.waitForTimeout(250);
    const got = await p9.evaluate(() => ({
      kind: HF.kind,
      q: $("#find-q").value,
      chips: [...document.querySelectorAll("#app .hchips .hchip")].map(b => b.textContent.trim()),
      btn: document.querySelector("#app .hfbtn").textContent.trim(),
      rows: [...document.querySelectorAll("#hbody .tx")].length,
      mon: (document.querySelector("#hbody .hmon") || {}).textContent,
      say: $("#find-live").textContent,
    }));
    ok(
      got.kind === "charges" && got.q === "" && J9(got.chips) === J9(["Charges"]) && got.btn === "Filters · 1",
      "tapped: Charges set, the field empty, its chip and Filters · 1: " + J9(got)
    );
    ok(
      got.rows === 2 && /Charges \$11\.90/.test(got.mon),
      "two rows under Charges $11.90 (the archived purchase's charge counts, as in every total): " + J9(got)
    );
    await c9.close();

    // German: the kind's own name and its other words
    const { c: cd, p: pd } = await open9("de-DE");
    for (const [q, want] of [
      ["gebühren", "Gebühren"],
      ["Gebühr", "Gebühren"],
      ["trinkgeld", "Extras"],
      ["zinsen", "Extras"],
    ]) {
      await type9(pd, q);
      const l = (await look9(pd)).sugs;
      ok(
        l.some(x => x.t === want),
        "de " + q + ": " + want + ": " + J9(l.map(x => x.t))
      );
    }
    await cd.close();
  }
  ok(errors.length === 0, "no page errors: " + errors.join("; "));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
