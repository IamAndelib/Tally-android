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
      h1: !!$("#app .appbar h1"),
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
      l.length === 1 && l[0].t === "Maya" && l[0].s === "Person · 3 entries",
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
  ok(errors.length === 0, "no page errors: " + errors.join("; "));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
