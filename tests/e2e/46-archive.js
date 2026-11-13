// Archived entries (docs/specs/history-archive.md, B): archiving hides an entry from History and changes nothing else.
// An entry's mark (`archived: true`, data version 8) is kept and sanitised by migrate() and carried by backups; an
// entry and its linked charge or extra are archived and unarchived together. Every balance, loan and total stays
// (History's headings, Home, Summary, the widget, the morning check, CSV); History's rows, search and the Filters
// sheet's counts leave archived entries out, and a day or month heading shows only while it has a row to show. The
// delete question: a warning line, then Delete, Archive instead and Cancel. Settings can let search find archived
// entries (C, section 23).
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
const J = JSON.stringify;
/* the same data whatever the order of its keys */
const canon = v =>
  Array.isArray(v)
    ? "[" + v.map(canon).join(",") + "]"
    : v && typeof v === "object"
      ? "{" +
        Object.keys(v)
          .sort()
          .map(k => JSON.stringify(k) + ":" + canon(v[k]))
          .join(",") +
        "}"
      : JSON.stringify(v);
const x = (id, ts, date, type, amount, account, extra) => ({ id, ts, date, type, amount, account, note: "", ...extra });
/* a v8 notebook with every kind of entry: a purchase with its charge, a transfer with its charge, a lending's payback
   with a tip, a borrow's payment, a balance fix */
const seed = () => ({
  v: 8,
  settings: { cur: "USD", lastCheck: "2026-06-17", week: 1, clock: "24" },
  accounts: [
    { id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1000, archived: false },
    { id: "b", name: "Cash", type: "cash", currency: "USD", opening: 500, archived: false },
  ],
  loans: [
    { id: "L", kind: "lend", person: "Sam", account: "a", date: "2026-05-02", status: "open" },
    { id: "B", kind: "borrow", person: "Kim", account: "a", date: "2026-05-10", status: "open" },
  ],
  txns: [
    x("sp", 10, "2026-06-17", "expense", 30.5, "a", { cat: "food", payee: "Corner Cafe", feeId: "spc" }),
    x("spc", 11, "2026-06-17", "expense", 1.5, "a", { cat: "food", feeOf: "sp" }),
    x("bus", 12, "2026-06-17", "expense", 5, "a", { cat: "transport", payee: "City Bus" }),
    x("in", 20, "2026-06-16", "income", 100, "a", { cat: "income", payee: "Employer" }),
    x("tr", 21, "2026-06-16", "transfer", 50, "a", { to: "b", feeId: "trf" }),
    x("trf", 22, "2026-06-16", "expense", 2, "a", { cat: "food", feeOf: "tr" }),
    x("ad", 30, "2026-06-15", "adjust", -20, "b"),
    x("p1", 31, "2026-06-15", "loan", 40, "a", { dir: "in", loan: "L", feeId: "p1t" }),
    x("p1t", 32, "2026-06-15", "income", 5, "a", { cat: "income", feeOf: "p1" }),
    x("bp", 40, "2026-06-14", "loan", 50, "a", { dir: "out", loan: "B" }),
    x("d1", 50, "2026-05-02", "loan", 100, "a", { dir: "out", loan: "L", principal: true }),
    x("bd", 51, "2026-05-10", "loan", 200, "a", { dir: "in", loan: "B", principal: true }),
    x("old", 52, "2026-05-20", "expense", 12, "b", { cat: "groceries", payee: "Green Market" }),
  ],
  assets: [],
});

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
  await ctx.addInitScript(() => {
    window.Android = { getColors: () => null, setBars() {}, setWidget() {}, setReminders() {} };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  const pause = () => page.waitForTimeout(350);
  const load = (o = seed()) =>
    page.evaluate(o => {
      closeSheet2();
      closeSheet();
      closePop();
      if (V.find) findEnd();
      S = migrate(o);
      RBC = LPC = null;
      commit();
      V.screen = "history";
      V.sel = null;
      V.open = "";
      HF = histBlank();
      histAllTime();
      render();
    }, o);
  const snap = () => page.evaluate(() => JSON.stringify(S));
  /* the notebook without the archive marks: what archiving must leave exactly as it was */
  const bare = () =>
    page.evaluate(() =>
      JSON.stringify(
        S.txns.map(t => {
          const c = { ...t };
          delete c.archived;
          return c;
        })
      )
    );
  const marked = () =>
    page.evaluate(() =>
      S.txns
        .filter(t => t.archived)
        .map(t => t.id)
        .sort()
        .join()
    );
  /* every figure worked out from the entries, whole: balances (now and at the start of each day), each loan as
     loanInfo() gives it, the parts of loans, History's month totals, Home, Summary, the widget, the morning check and
     the CSV export */
  const figures = () =>
    page.evaluate(() => {
      const noMark = (k, v) => (k === "archived" ? undefined : v),
        was = V.screen,
        hf = HF, // History's filters and period, worked on without them and put back
        hp = { ...HP },
        out = {};
      HF = histBlank();
      histAllTime();
      RBC = LPC = null;
      out.bal = balances();
      out.at = [...new Set(S.txns.map(t => t.date))]
        .sort()
        .concat("9999-12-31")
        .map(d => balances(d));
      out.loans = S.loans.map(l => JSON.stringify(loanInfo(l), noMark));
      out.parts = JSON.stringify(loanParts(), noMark);
      out.check = checkText();
      let w = "";
      const sw = Android.setWidget;
      Android.setWidget = j => (w = j);
      lastWidget = "";
      syncWidget();
      Android.setWidget = sw;
      out.widget = w;
      let csv = "";
      const so = saveOut;
      saveOut = (n, m, t) => (csv = t);
      exportCsv();
      saveOut = so;
      out.csv = csv;
      out.hist = ["2026-06", "2026-05"].map(m =>
        J(
          histLines(
            histList().filter(t => t.date.startsWith(m)),
            "",
            [m + "-01", monthEnd(m)]
          )
        )
      );
      V.screen = "home";
      render();
      const c = $("#app").cloneNode(true);
      c.querySelectorAll(".tx").forEach(e => e.remove());
      /* the balance bar's "N entries" counts rows (as the list it opens), so archiving changes it: checked on its own */
      const n = c.querySelector(".balbar .l");
      out.homeCount = n ? n.textContent : "";
      if (n) n.remove();
      out.home = c.textContent;
      summarySheet();
      out.summary = $("#sheet").textContent;
      closeSheet();
      HF = hf;
      Object.assign(HP, hp);
      V.screen = was;
      render();
      return out;
      function J(v) {
        return JSON.stringify(v);
      }
    });
  const sameFigures = (a, b, tag) => {
    const off = Object.keys(a).filter(k => k !== "homeCount" && J(a[k]) !== J(b[k]));
    ok(!off.length, tag + ": every balance, loan figure and total is the same " + J(off));
  };
  const rows = () => page.evaluate(() => [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v));
  const askRow = async id => {
    await page.evaluate(id => {
      V.screen = "history";
      render();
      rowToggle(document.querySelector('#app .tx[data-v="' + id + '"]'), id);
    }, id);
    await page.click('#app .txo [data-act$="-del"]');
    await pause();
  };
  const shape = () =>
    page.evaluate(() => {
      const d = document.querySelector("#pop .dialog");
      return {
        role: d && d.getAttribute("role"),
        desc: d && d.getAttribute("aria-describedby"),
        title: (document.querySelector("#pop .dlg-t") || {}).textContent,
        text: (document.querySelector("#pop .dlg-x") || {}).textContent,
        btns: [...document.querySelectorAll("#pop .btn")].map(
          b => b.className.replace("btn ", "") + ":" + b.textContent
        ),
        tall: [...document.querySelectorAll("#pop .btn")].every(b => b.getBoundingClientRect().height >= 48),
      };
    });
  const snackText = () => page.evaluate(() => (document.querySelector("#snack") || {}).textContent || "");
  const undo = async () => {
    await page.click('#snack [data-act="undo"]');
    await pause();
  };

  // ---- 1. the seed is what it says: every link kept by migrate()
  await load();
  ok(
    (await page.evaluate(() => ["spc", "trf", "p1t"].map(id => entry(id).feeOf).join())) === "sp,tr,p1",
    "the seed's add-ons are linked to their entries"
  );

  // ---- 2. the delete question: its warning line and its three answers
  {
    const s0 = await snap();
    await askRow("sp");
    const sh = await shape();
    ok(
      sh.role === "alertdialog" &&
        sh.title === "Delete this entry?" &&
        sh.text === "Deleting changes the account balance." &&
        sh.desc === "cd-x" &&
        J(sh.btns) === J(["cd-destroy:Delete", "cd-alt:Archive instead", "cd-out:Cancel"]) &&
        sh.tall,
      "an entry: “Delete this entry?”, the balance warning, Delete / Archive instead / Cancel " + J(sh)
    );
    await page.click("#pop .cd-out");
    await pause();
    ok((await snap()) === s0, "Cancel changes nothing");
    for (const id of ["p1", "bp", "d1"]) {
      await askRow(id);
      const l = await shape();
      ok(
        l.title === "Delete this entry?" &&
          l.text === "Deleting changes the account balance and the loan." &&
          l.btns.length === 3 &&
          l.btns[1] === "cd-alt:Archive instead",
        id + ": a loan or lending entry warns about the loan too, and can be archived " + J(l)
      );
      await page.click("#pop .cd-out");
      await pause();
    }
    await askRow("ad");
    ok((await shape()).text === "Deleting changes the account balance.", "a balance fix: the balance warning");
    await page.click("#pop .cd-out");
    await pause();
    await page.evaluate(() => {
      V.sel = new Set(["sp", "tr"]);
      render();
    });
    await page.click('[data-act="sel-del"]');
    await pause();
    const m = await shape();
    ok(
      m.title === "Delete these 2 entries?" &&
        m.text === "Deleting changes the account balances." &&
        J(m.btns) === J(["cd-destroy:Delete", "cd-alt:Archive instead", "cd-out:Cancel"]),
      "several (each with its charge, counted as History lists them): the balances warning " + J(m)
    );
    await page.click("#pop .cd-out");
    await pause();
    await page.evaluate(() => {
      V.sel = null;
      render();
      deleteAsk(["sp"], () => {}, { archive: false });
    });
    await pause();
    const n = await shape();
    ok(
      J(n.btns) === J(["cd-destroy:Delete", "cd-out:Cancel"]) && n.text === "Deleting changes the account balance.",
      "deleteAsk without Archive instead: Delete and Cancel " + J(n)
    );
    await page.click("#pop .cd-out");
    await pause();
    ok((await snap()) === s0, "asking changes nothing");
  }

  // ---- 3. archiving a purchase: its row and its charge leave History, nothing else changes; Undo restores it
  {
    await load();
    const s0 = await snap(),
      b0 = await bare(),
      f0 = await figures(),
      mon0 = await page.evaluate(() =>
        [...document.querySelectorAll("#app .hmon")].map(e => e.getAttribute("aria-label"))
      );
    await askRow("sp");
    await page.click("#pop .cd-alt");
    await pause();
    ok((await marked()) === "sp,spc", "the purchase and its charge are archived together: " + (await marked()));
    ok((await bare()) === b0, "nothing but the mark changes: amounts, accounts, dates, categories and links");
    const f1 = await figures();
    sameFigures(f0, f1, "a purchase archived");
    ok(
      f0.homeCount === "2 entries" && f1.homeCount === "1 entry",
      "Home's count is of rows, so it leaves the archived entry out: " + f0.homeCount + " → " + f1.homeCount
    );
    const r = await rows();
    ok(!r.includes("sp") && r.includes("bus"), "its row leaves History, the others stay " + J(r));
    const said = await snackText();
    ok(/^Archived/.test(said) && (await page.$('#snack [data-act="undo"]')) !== null, "“Archived”, with Undo: " + said);
    const mon1 = await page.evaluate(() =>
      [...document.querySelectorAll("#app .hmon")].map(e => e.getAttribute("aria-label"))
    );
    ok(J(mon1) === J(mon0), "the month headings' totals still count it " + J(mon1));
    const st = await page.evaluate(() => (document.querySelector("#app .vh[role=status]") || {}).textContent);
    ok(/^9 entries/.test(st), "History's count leaves it out: " + st);
    await undo();
    ok((await snap()) === s0, "Undo restores the exact state");
    ok((await rows()).includes("sp"), "…and its row is back");
  }

  // ---- 4. archiving a lending's payback with its tip: the loan stays as it was
  {
    await load();
    const s0 = await snap(),
      b0 = await bare(),
      f0 = await figures();
    await askRow("p1");
    await page.click("#pop .cd-alt");
    await pause();
    ok((await marked()) === "p1,p1t", "the payback and its tip are archived together: " + (await marked()));
    ok((await bare()) === b0, "nothing but the mark changes");
    sameFigures(f0, await figures(), "a payback archived");
    ok(!(await rows()).includes("p1"), "its row leaves History");
    await undo();
    ok((await snap()) === s0, "Undo restores the exact state");
  }

  // ---- 5. two selected (a purchase and a transfer with its charge): both archived, the selection ends
  {
    await load();
    const s0 = await snap(),
      b0 = await bare(),
      f0 = await figures();
    await page.evaluate(() => {
      V.sel = new Set(["in", "tr"]);
      render();
    });
    await page.click('[data-act="sel-del"]');
    await pause();
    await page.click("#pop .cd-alt");
    await pause();
    ok((await marked()) === "in,tr,trf", "both are archived, the transfer with its charge: " + (await marked()));
    ok((await bare()) === b0, "nothing but the mark changes");
    sameFigures(f0, await figures(), "two selected archived");
    ok((await page.evaluate(() => V.sel)) === null, "the selection ends");
    const r = await rows();
    ok(!r.includes("in") && !r.includes("tr"), "their rows leave History " + J(r));
    ok(/^Archived/.test(await snackText()), "“Archived”, with Undo");
    await undo();
    ok((await snap()) === s0, "Undo restores the exact state");
  }

  // ---- 6. from an entry's own sheet, and the balance fix's: Archive instead closes the sheet
  for (const [id, open] of [
    ["bus", () => txSheet("bus")],
    ["ad", () => adjSheet("ad")],
    ["tr", () => trSheet("tr")],
  ]) {
    await load();
    const s0 = await snap(),
      f0 = await figures();
    await page.evaluate(open);
    await page.waitForTimeout(150);
    const act = await page.evaluate(() => (document.querySelector('#sheet [data-act$="-del"]') || {}).dataset.act);
    await page.click('#sheet [data-act="' + act + '"]');
    await pause();
    await page.click("#pop .cd-alt");
    await pause();
    ok(
      !(await page.$("#sheet .p")) && (await marked()).split(",").includes(id) && !(await rows()).includes(id),
      id + ": Archive instead from its sheet closes it and the row leaves History"
    );
    sameFigures(f0, await figures(), id + " archived from its sheet");
    await undo();
    ok((await snap()) === s0, id + ": Undo restores the exact state");
  }

  // ---- 7. a day whose every row is archived has no heading; a month likewise. Search, its suggestions and the
  // Filters sheet's counts leave archived entries out
  {
    await load();
    await page.evaluate(() => {
      archiveEntries(["old"], true);
      archiveEntries(["d1", "bd"], true);
      archiveEntries(["bp"], true);
      commit();
      render();
    });
    const h = await page.evaluate(() => ({
      days: [...document.querySelectorAll("#app .dayh")].map(e => e.textContent),
      months: [...document.querySelectorAll("#app .hmon")].map(e => e.textContent),
    }));
    ok(!h.days.some(d => /Jun 14/.test(d)), "a day with only archived entries has no heading " + J(h.days));
    ok(
      h.months.length === 1 && /June 2026/.test(h.months[0]),
      "a month with only archived entries has no heading " + J(h.months)
    );
    const counts = await page.evaluate(() => ({
      food: hfCount({ ...HF, cat: "food" }),
      groceries: hfCount({ ...HF, cat: "groceries" }),
      all: hfCount(HF),
    }));
    ok(
      counts.groceries === 0 && counts.food === 1 && counts.all === 6,
      "the Filters sheet counts only the rows History shows " + J(counts)
    );
    await page.evaluate(() => {
      archiveEntries(["sp"], true);
      commit();
      render();
    });
    const sr = await page.evaluate(() => {
      V.find = true;
      HF.q = "corner";
      render();
      const a = { rows: [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v) };
      findSugs();
      a.sugs = SUGS.map(s => s.title);
      HF.q = "green";
      render();
      a.rows2 = [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v);
      findSugs();
      a.sugs2 = SUGS.map(s => s.title);
      HF.q = "city";
      render();
      a.rows3 = [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v);
      findEnd();
      V.find = false;
      render();
      return a;
    });
    ok(
      !sr.rows.length &&
        !sr.sugs.some(s => /corner/i.test(s)) &&
        !sr.rows2.length &&
        !sr.sugs2.some(s => /green/i.test(s)),
      "search finds no archived entry, and suggests none of their names " + J(sr)
    );
    ok(J(sr.rows3) === J(["bus"]), "…while it still finds the others " + J(sr.rows3));
    /* Home's list of the day's entries leaves them out too; its totals keep them */
    const home = await page.evaluate(() => {
      V.screen = "home";
      render();
      entriesSheet();
      const r = [...document.querySelectorAll("#sheet .tx[data-v]")].map(e => e.dataset.v);
      closeSheet();
      return r;
    });
    ok(J(home) === J(["bus"]), "Home's list of the day's entries leaves an archived entry out " + J(home));
  }

  // ---- 8. migrate(): the mark is kept only when exactly true; an add-on follows its entry; balances never move
  {
    const o = seed();
    const t = id => o.txns.find(e => e.id === id);
    t("sp").archived = true; // its charge has none: it follows its entry
    t("tr").archived = "yes";
    t("trf").archived = true; // its transfer isn't archived: it follows that
    t("in").archived = 1;
    t("ad").archived = { a: 1 };
    t("bus").archived = false;
    t("p1").archived = "true";
    t("bp").archived = true;
    t("old").archived = null;
    const r = await page.evaluate(o => {
      const canon = v =>
        Array.isArray(v)
          ? "[" + v.map(canon).join(",") + "]"
          : v && typeof v === "object"
            ? "{" +
              Object.keys(v)
                .sort()
                .map(k => JSON.stringify(k) + ":" + canon(v[k]))
                .join(",") +
              "}"
            : JSON.stringify(v);
      const m = migrate(o),
        m2 = migrate(JSON.parse(JSON.stringify(m))),
        keep = S;
      S = m;
      const b = balances();
      S = keep;
      return {
        marks: m.txns.filter(t => "archived" in t).map(t => t.id + ":" + t.archived),
        again: canon(m2.txns) === canon(m.txns),
        b,
      };
    }, o);
    ok(J(r.marks) === J(["sp:true", "spc:true", "bp:true"]), "only a mark that is exactly true stays " + J(r.marks));
    ok(r.again, "migrate() a second time changes nothing");
    await load(seed());
    const b0 = await page.evaluate(() => balances());
    ok(J(r.b) === J(b0), "the marks move no balance " + J(r.b));
  }

  // ---- 9. a backup carries the mark: saved, restored, still archived
  {
    await load();
    await page.evaluate(() => {
      archiveEntries(["sp", "p1"], true);
      commit();
    });
    const s0 = await snap();
    const r = await page.evaluate(() => {
      const text = JSON.stringify(S);
      S = migrate({ ...blank(), v: 8 });
      commit();
      const plan = restorePlan(text);
      plan.run();
      return S.txns
        .filter(t => t.archived)
        .map(t => t.id)
        .sort()
        .join();
    });
    ok(r === "p1,p1t,sp,spc", "a restored backup keeps every mark: " + r);
    ok(canon(await page.evaluate(() => S.txns)) === canon(JSON.parse(s0).txns), "…and every entry as it was");
    /* unarchiving takes the mark off the entry and its add-on */
    await page.evaluate(() => {
      archiveEntries(["sp"], false);
      commit();
    });
    ok((await marked()) === "p1,p1t", "unarchived: the entry and its charge lose the mark " + (await marked()));
  }

  // ---- 10. empty states: the entries sheet and Home's two-pane list say "Every entry is archived." when every entry
  // of the period is archived (Ruling J); so does the entries sheet right after its last row is archived from it. A
  // period with no entries still says "Nothing written down yet." as before
  {
    await load();
    await page.evaluate(() => {
      archiveEntries(["sp"], true);
      commit();
      V.screen = "home";
      render();
      entriesSheet();
    });
    await pause();
    ok(
      (await page.evaluate(() => [...document.querySelectorAll("#sheet .tx[data-v]")].map(e => e.dataset.v).join())) ===
        "bus" && !(await page.$("#sheet .empty")),
      "the entries sheet lists the day's one row left"
    );
    await page.evaluate(() => rowToggle(document.querySelector('#sheet .tx[data-v="bus"]'), "bus"));
    await page.click('#sheet .txo [data-act="tx-del"]');
    await pause();
    await page.click("#pop .cd-alt");
    await pause();
    ok(
      (await marked()) === "bus,sp,spc" &&
        !(await page.$("#sheet .tx[data-v]")) &&
        (await page.textContent("#sheet .empty").catch(() => "")) === "Every entry is archived.",
      "archiving the last row from the entries sheet leaves its empty state"
    );
    await page.evaluate(() => {
      closeSheet();
      entriesSheet();
    });
    await pause();
    ok(
      (await page.textContent("#sheet .empty").catch(() => "")) === "Every entry is archived.",
      "the entries sheet with only archived entries shows its empty state"
    );
    const none = await page.evaluate(() => {
      closeSheet();
      V.anchor = "2026-06-13"; // a day with no entries
      render();
      entriesSheet();
      const e = (document.querySelector("#sheet .empty") || {}).textContent;
      closeSheet();
      V.anchor = today();
      render();
      return e;
    });
    ok(none === "Nothing written down yet.", "a day with no entries: “Nothing written down yet.” " + J(none));
    await page.evaluate(() => closeSheet());
    await page.setViewportSize({ width: 1000, height: 852 });
    await page.evaluate(() => {
      V.screen = "home";
      render();
    });
    await pause();
    const wide = await page.evaluate(() => ({
      panes: !!document.querySelector("#app .panes"),
      rows: [...document.querySelectorAll("#app .tx[data-v]")].filter(e => entry(e.dataset.v)).length, // entries, not loans
      empty: (document.querySelector("#app .empty") || {}).textContent,
    }));
    ok(
      wide.panes && !wide.rows && wide.empty === "Every entry is archived.",
      "Home's two-pane list at 1000px with only archived entries shows its empty state " + J(wide)
    );
    const wideNone = await page.evaluate(() => {
      V.anchor = "2026-06-13";
      render();
      const e = (document.querySelector("#app .empty") || {}).textContent;
      V.anchor = today();
      render();
      return e;
    });
    ok(
      wideNone === "Nothing written down yet.",
      "…and a day with no entries: “Nothing written down yet.” " + J(wideNone)
    );
    await page.setViewportSize({ width: 393, height: 852 });
    await pause();
  }

  // ---- 11. an archived payback's tip edited from the loan sheet: both stay archived (setAddOn keeps the mark)
  {
    await load();
    await page.evaluate(() => {
      archiveEntries(["p1"], true);
      commit();
      V.screen = "home";
      render();
      loanOpen("L");
      loanDrawEdit("p1");
    });
    await pause();
    const had = await page.evaluate(() => !!document.querySelector("#sheet2 #ed-extra"));
    ok(had, "the payback's form has its tip");
    await page.evaluate(() => {
      $("#sheet2 #ed-extra").value = groupDigits("6");
      saveLoanDraw();
    });
    await pause();
    const t = await page.evaluate(() => ({
      tip: entry("p1t") && entry("p1t").amount,
      marks: S.txns
        .filter(t => t.archived)
        .map(t => t.id)
        .sort()
        .join(),
    }));
    ok(t.tip === 6 && t.marks === "p1,p1t", "the tip is saved, and the payback and its tip stay archived " + J(t));
    /* a new add-on on an archived entry is archived with it */
    await page.evaluate(() => {
      closeSheet2();
      closeSheet();
      archiveEntries(["bus"], true);
      setAddOn(entry("bus"), "charge", 2);
      commit();
    });
    const nb = await page.evaluate(() => {
      const a = entry(entry("bus").feeId);
      return a && a.archived === true;
    });
    ok(nb, "a charge added to an archived purchase is archived with it");
  }

  // ---- 12. a draw that can't be deleted (what the other draws owe would be less than was paid back) can still be
  // archived from its row; Delete still says why it is refused
  {
    const o = seed();
    o.loans.push({ id: "M", kind: "lend", person: "Ann", account: "a", date: "2026-04-01", status: "open" });
    o.txns.push(
      x("m1", 60, "2026-04-01", "loan", 100, "a", { dir: "out", loan: "M", principal: true }),
      x("m2", 61, "2026-04-05", "loan", 50, "a", { dir: "out", loan: "M", principal: true }),
      x("mp", 62, "2026-04-20", "loan", 120, "a", { dir: "in", loan: "M" })
    );
    await load(o);
    const s0 = await snap(),
      f0 = await figures();
    ok(!!(await page.evaluate(() => loanBlock(["m2"]))), "deleting the draw is refused (loanBlock)");
    await askRow("m2");
    const sh = await shape();
    ok(sh.btns.includes("cd-alt:Archive instead"), "its row still asks, with Archive instead " + J(sh.btns));
    await page.click("#pop .cd-alt");
    await pause();
    ok((await marked()) === "m2", "Archive instead archives it");
    sameFigures(f0, await figures(), "a refused draw archived");
    await undo();
    ok((await snap()) === s0, "Undo restores the exact state");
    await askRow("m2");
    await page.click("#pop .cd-destroy");
    await pause();
    ok(
      (await page.evaluate(() => !!entry("m2"))) && (await snackText()).includes("already paid back"),
      "Delete is still refused, and says why: " + (await snackText())
    );
    ok((await snap()) === s0, "…and nothing changed");
    /* the same through a selection */
    await page.evaluate(() => {
      V.screen = "history";
      V.sel = new Set(["m2", "bus"]);
      render();
    });
    await page.click('[data-act="sel-del"]');
    await pause();
    await page.click("#pop .cd-alt");
    await pause();
    ok((await marked()) === "bus,m2", "a selection holding it can be archived");
    await undo();
    ok((await snap()) === s0, "Undo restores the exact state");
  }

  // ---- 13. a selection keeps only what History lists: an archived entry never stays selected
  {
    await load();
    const sel = await page.evaluate(() => {
      archiveEntries(["sp"], true);
      commit();
      V.screen = "history";
      V.sel = new Set(["sp", "bus"]);
      render();
      const r = [...V.sel].join();
      V.sel = null;
      render();
      return r;
    });
    ok(sel === "bus", "an archived entry drops out of the selection: " + sel);
  }

  /* History's or the Archived screen's top bar: each button's action and name */
  const bar = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#app header.appbar button")].map(
        b => b.dataset.act + ":" + (b.getAttribute("aria-label") || "") + (b.disabled ? ":off" : "")
      )
    );
  /* the Filters line's buttons: action and name */
  const filtersRow = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#app .hbar button")].map(
        b => b.dataset.act + ":" + (b.getAttribute("aria-label") || "")
      )
    );
  const title = () => page.evaluate(() => (document.querySelector("#app header.appbar h1") || {}).textContent);
  const opened = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#app .txo .acts button")].map(b => b.dataset.act + ":" + b.textContent)
    );
  const emptyText = () =>
    page.evaluate(() => {
      const e = document.querySelector("#app .empty");
      return e ? [...e.childNodes].map(n => n.textContent.trim()).filter(Boolean) : null;
    });
  const openRow = async id => {
    await page.click('#app .tx[data-v="' + id + '"]');
    await pause();
  };

  // ---- 14. History's archive button (B4, moved by the maintainer's ruling to the Filters line): last on that line,
  // after Clear all, only while an entry is archived, never in the top bar, in search or usable while selecting; the Archived
  // screen (B5): History's rows with their month and day headings, no totals, no Filters, search or select
  {
    await load();
    const b0 = await bar();
    ok(
      J(b0) === J(["home:Back", "search-open:Search", "sel-start:Select entries"]) &&
        !(await page.$('#app [data-act="arch-open"]')),
      "nothing archived: no archive button " + J(b0)
    );
    /* History filtered and on a period: the Archived screen and Back keep both */
    await page.evaluate(() => {
      HF.kind = "out";
      Object.assign(HP, { period: "month", anchor: "2026-06-17" });
      render();
    });
    await askRow("sp");
    await page.click("#pop .cd-alt");
    await pause();
    const b1 = await bar(),
      r1 = await filtersRow();
    ok(
      J(b1) === J(["home:Back", "search-open:Search", "sel-start:Select entries"]) &&
        r1[r1.length - 1] === "arch-open:Archived entries" &&
        r1[r1.length - 2] === "hf-clear:",
      "the first archived entry brings the archive button, last on the Filters line after Clear all, named “Archived entries”; the top bar keeps Back, Search and Select " +
        J([b1, r1])
    );
    const look = await page.evaluate(() => {
      const b = $('#app [data-act="arch-open"]'),
        f = document.createElement("button"); // Filters as it is with no filter set: outlined
      f.className = "chip hfbtn";
      $("#app .hbar").appendChild(f);
      const r = b.getBoundingClientRect(),
        cs = getComputedStyle(b),
        fs = getComputedStyle(f);
      const out = {
        w: Math.round(r.width),
        h: Math.round(r.height),
        svg:
          b.querySelector("path").getAttribute("d") ===
          new DOMParser().parseFromString(icArchive(), "text/html").querySelector("path").getAttribute("d"),
        outline:
          cs.borderTopWidth !== "0px" &&
          cs.borderTopWidth === fs.borderTopWidth &&
          cs.borderTopColor === fs.borderTopColor &&
          cs.borderRadius === fs.borderRadius,
        pinned: !!b.closest(".hpin .hhd .hbar"), // with the Filters line: pinned upright, back with it sideways
      };
      f.remove();
      return out;
    });
    ok(
      look.w === 48 && look.h === 48 && look.svg && look.outline && look.pinned,
      "the button: 48×48, the outlined archive box, outlined as Filters, in the pinned block " + J(look)
    );
    /* not in search; while selecting it stays in its place, dimmed and out of reach, as Filters */
    const modes = await page.evaluate(() => {
      const out = {};
      V.sel = new Set();
      render();
      const b = $('#app [data-act="arch-open"]');
      out.sel = !!b && b.disabled && !!b.closest(".hbar.hoff");
      V.sel = null;
      render();
      const keepHF = { ...HF },
        keepHP = { ...HP };
      openFind();
      out.find = !!$('#app [data-act="arch-open"]');
      findEnd();
      V.find = false;
      HF = keepHF;
      Object.assign(HP, keepHP);
      render();
      return out;
    });
    ok(modes.sel && !modes.find, "selecting: dimmed and disabled with the Filters line; search: not there " + J(modes));
    await page.evaluate(() => {
      archiveEntries(["p1", "bp"], true);
      commit();
    });
    const s0 = await snap(),
      f0 = await figures();
    await page.click('#app [data-act="arch-open"]');
    await pause();
    const a = await page.evaluate(() => ({
      screen: V.screen,
      rows: [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v),
      months: [...document.querySelectorAll("#app .hmon")].map(e => [e.getAttribute("aria-label"), e.textContent]),
      days: [...document.querySelectorAll("#app .dayh")].map(e => [e.getAttribute("aria-label"), e.textContent]),
      totals: document.querySelectorAll("#app .hcol").length,
      filters: !!document.querySelector("#app .hbar"),
      nav: !!document.querySelector("#nav button"),
      pinned: !!document.querySelector("#app .hpin > header.appbar"),
    }));
    ok((await title()) === "Archived" && a.screen === "archive", "the screen is titled “Archived” " + J(a.screen));
    ok(J(await bar()) === J(["arch-back:Back"]), "its bar has Back only: no search or select " + J(await bar()));
    ok(
      J(a.rows) === J(["sp", "p1", "bp"]),
      "it lists every archived entry, newest first, an add-on inside its entry, whatever History's filters " + J(a.rows)
    );
    ok(
      J(a.months) === J([["June 2026", "June 2026"]]) &&
        a.days.length === 3 &&
        a.days.every(d => d[0] === d[1]) &&
        !a.totals,
      "month and day headings, without totals " + J([a.months, a.days])
    );
    ok(!a.filters && !a.nav && a.pinned, "no period or Filters row, no bottom bar; the bar is pinned " + J(a));
    /* an opened row: Unarchive and Delete only */
    await openRow("sp");
    const o = await opened();
    ok(J(o) === J(["unarchive:Unarchive", "tx-del:Delete"]), "an opened row offers Unarchive and Delete " + J(o));
    ok(
      await page.evaluate(() =>
        [...document.querySelectorAll("#app .txo .acts button")].every(b => b.getBoundingClientRect().height >= 48)
      ),
      "…each 48px to tap"
    );
    /* Unarchive: back in History, with Undo; every figure stays */
    await page.click('#app .txo [data-act="unarchive"]');
    await pause();
    ok((await marked()) === "bp,p1,p1t", "Unarchive takes the mark off the entry and its charge " + (await marked()));
    ok(
      /^Back in History/.test(await snackText()) && (await page.$('#snack [data-act="undo"]')) !== null,
      "“Back in History”, with Undo: " + (await snackText())
    );
    ok(
      J(await rows()) === J(["p1", "bp"]) && (await page.evaluate(() => V.screen)) === "archive",
      "the row leaves the Archived screen, which stays " + J(await rows())
    );
    sameFigures(f0, await figures(), "unarchived");
    await undo();
    ok((await snap()) === s0, "Undo restores the exact state");
    ok(J(await rows()) === J(["sp", "p1", "bp"]), "…and the row is back on the Archived screen");
    /* Delete: the question without Archive instead; Cancel changes nothing */
    await openRow("p1");
    await page.click('#app .txo [data-act="tx-del"]');
    await pause();
    const d = await shape();
    ok(
      d.role === "alertdialog" &&
        d.title === "Delete this entry?" &&
        d.text === "Deleting changes the account balance and the loan." &&
        J(d.btns) === J(["cd-destroy:Delete", "cd-out:Cancel"]) &&
        d.tall,
      "Delete asks “Delete this entry?” with its warning, Delete and Cancel only " + J(d)
    );
    await page.click("#pop .cd-out");
    await pause();
    ok((await snap()) === s0, "Cancel changes nothing");
    await openRow("sp");
    await page.click('#app .txo [data-act="tx-del"]');
    await pause();
    ok((await shape()).text === "Deleting changes the account balance.", "a purchase: the balance warning");
    await page.click("#pop .cd-destroy");
    await pause();
    ok(
      (await page.evaluate(() => !entry("sp") && !entry("spc"))) &&
        J(await rows()) === J(["p1", "bp"]) &&
        /^Deleted/.test(await snackText()),
      "Delete deletes it with its charge: “" + (await snackText()) + "”"
    );
    await undo();
    ok((await snap()) === s0, "Undo restores the exact state");
    /* Back, the app bar's and Android's: History as it was, filtered and on its period */
    await page.click('#app [data-act="arch-back"]');
    await pause();
    const h = await page.evaluate(() => ({ screen: V.screen, kind: HF.kind, period: HP.period, anchor: HP.anchor }));
    ok(
      J(h) === J({ screen: "history", kind: "out", period: "month", anchor: "2026-06-17" }),
      "Back returns to History with its filters and period " + J(h)
    );
    ok(
      (await title()) === "History" && !!(await page.$('#app [data-act="arch-open"]')),
      "History again, with the icon"
    );
    await page.click('#app [data-act="arch-open"]');
    await pause();
    const back = await page.evaluate(() => [goBack(), V.screen, HF.kind, HP.period]);
    ok(J(back) === J([true, "history", "out", "month"]), "Android's Back too " + J(back));
    ok((await page.evaluate(() => [goBack(), V.screen].join())) === "true,home", "Back from History goes Home");
  }

  // ---- 15. the last archived entry unarchived or deleted: the Archived screen stays, empty; the icon is gone from
  // History; Undo brings the entry back
  for (const how of ["unarchive", "delete"]) {
    await load();
    await page.evaluate(() => {
      archiveEntries(["bus"], true);
      commit();
    });
    const s0 = await snap();
    await page.click('#app [data-act="arch-open"]');
    await pause();
    await openRow("bus");
    if (how === "unarchive") await page.click('#app .txo [data-act="unarchive"]');
    else {
      await page.click('#app .txo [data-act="tx-del"]');
      await pause();
      await page.click("#pop .cd-destroy");
    }
    await pause();
    const e = await emptyText();
    ok(
      (await page.evaluate(() => V.screen)) === "archive" &&
        J(e) === J(["Nothing archived.", "Entries you archive wait here, with every balance as it is."]) &&
        (await title()) === "Archived",
      how + ": the screen stays, with its empty state's two lines " + J(e)
    );
    await undo();
    ok((await snap()) === s0 && J(await rows()) === J(["bus"]), how + ": Undo brings the entry back");
    await openRow("bus");
    await page.click('#app .txo [data-act="' + (how === "unarchive" ? "unarchive" : "tx-del") + '"]');
    await pause();
    if (how === "delete") {
      await page.click("#pop .cd-destroy");
      await pause();
    }
    await page.click('#app [data-act="arch-back"]');
    await pause();
    ok(
      J(await bar()) === J(["home:Back", "search-open:Search", "sel-start:Select entries"]),
      how + ": back in History, the icon is gone " + J(await bar())
    );
  }

  // ---- 16. selecting (B6): Archive selected beside Delete selected archives at once, never refused, with Undo
  {
    const o = seed();
    o.loans.push({ id: "M", kind: "lend", person: "Ann", account: "a", date: "2026-04-01", status: "open" });
    o.txns.push(
      x("m1", 60, "2026-04-01", "loan", 100, "a", { dir: "out", loan: "M", principal: true }),
      x("m2", 61, "2026-04-05", "loan", 50, "a", { dir: "out", loan: "M", principal: true }),
      x("mp", 62, "2026-04-20", "loan", 120, "a", { dir: "in", loan: "M" })
    );
    await load(o);
    const s0 = await snap(),
      b0 = await bare(),
      f0 = await figures();
    await page.evaluate(() => {
      V.sel = new Set();
      render();
    });
    ok(
      (await page.evaluate(() => {
        const h = $("#app header.appbar h1");
        return h.textContent + "|" + h.getAttribute("aria-label");
      })) === "0|0 selected",
      "the selection bar shows only the count; TalkBack reads “0 selected”"
    );
    ok(
      J(await bar()) ===
        J([
          "sel-cancel:Stop selecting",
          "sel-all:Select all",
          "sel-arch:Archive selected:off",
          "sel-del:Delete selected:off",
        ]),
      "Archive selected sits beside Delete selected, off while nothing is selected " + J(await bar())
    );
    await page.evaluate(() => {
      V.sel = new Set(["sp", "tr", "m2"]);
      render();
    });
    ok(
      (await page.evaluate(() => {
        const b = $('#app [data-act="sel-arch"]'),
          r = b.getBoundingClientRect();
        return !b.disabled && r.width >= 48 && r.height >= 48;
      })) && !!(await page.evaluate(() => loanBlock(["m2"]))),
      "on once something is selected, 48px; the draw selected can't be deleted"
    );
    await page.click('#app [data-act="sel-arch"]');
    await pause();
    ok(!(await page.$("#pop .dialog")), "it asks nothing");
    ok(
      (await marked()) === "m2,sp,spc,tr,trf",
      "everything selected is archived, with its add-ons " + (await marked())
    );
    ok((await bare()) === b0, "nothing but the mark changes");
    sameFigures(f0, await figures(), "archived from a selection");
    ok(
      (await page.evaluate(() => V.sel)) === null &&
        /^Archived/.test(await snackText()) &&
        (await page.$('#snack [data-act="undo"]')) !== null,
      "the selection ends; “Archived”, with Undo"
    );
    await undo();
    ok((await snap()) === s0, "Undo restores the exact state");
  }

  // ---- 17. every entry archived: History doesn't say "Nothing written down yet."; its icon leads to them
  {
    await load();
    await page.evaluate(() => {
      archiveEntries(
        S.txns.map(t => t.id),
        true
      );
      commit();
      V.screen = "history";
      render();
    });
    const e = await emptyText();
    ok(J(e) === J(["Every entry is archived."]), "History says every entry is archived " + J(e));
    ok(
      J(await bar()) === J(["home:Back", "search-open:Search"]) &&
        !!(await page.$('#app .hbar [data-act="arch-open"]')),
      "…with the archive button on the Filters line, and nothing to select " + J(await bar())
    );
  }

  // ---- 18. the row kept in place over a redraw (toAnchor) is let go once the screen is drawn anew: Back from the
  // Archived screen, or another screen opened right after, is never scrolled to where that row was
  {
    const o = seed();
    for (let i = 0; i < 40; i++)
      o.txns.push(x("f" + i, 100 + i, "2026-06-1" + (i % 7), "expense", 1, "a", { cat: "food" }));
    await load(o);
    await page.setViewportSize({ width: 393, height: 400 });
    const y = await page.evaluate(async () => {
      const frames = () => new Promise(r => setTimeout(r, 150));
      openHistory();
      scrollTo(0, document.body.scrollHeight);
      render(); // the same screen: the row in view is kept where it is for a few frames
      V.screen = "home";
      render();
      openHistory();
      scrollTo(0, 0);
      await frames();
      return scrollY;
    });
    ok(y === 0, "History opened anew stays at its top: " + y);
    await page.setViewportSize({ width: 393, height: 852 });
  }

  // ---- 19. Delete counts the rows that go, archived or not, from an opened row and from a selection alike: the
  // borrow's only draw takes its loan's payments, one of them archived
  for (const how of ["row", "selection"]) {
    const o = seed();
    o.txns.push(x("bp2", 41, "2026-06-13", "loan", 20, "a", { dir: "out", loan: "B", archived: true }));
    await load(o);
    const s0 = await snap();
    if (how === "row") await askRow("bd");
    else {
      await page.evaluate(() => {
        V.sel = new Set(["bd"]);
        render();
      });
      await page.click('[data-act="sel-del"]');
      await pause();
    }
    await page.click("#pop .cd-destroy");
    await pause();
    ok(
      (await page.evaluate(() => ["bd", "bp", "bp2"].every(id => !entry(id)) && !loan("B"))) &&
        /^Deleted 3 entries/.test(await snackText()),
      how + ": the draw, its payment and its archived payment go: “" + (await snackText()) + "”"
    );
    await undo();
    ok((await snap()) === s0, how + ": Undo restores the exact state");
  }

  // ---- 20. Delete on the Archived screen goes through loanBlock(): the draw it refuses stays, and the message says why
  {
    const o = seed();
    o.loans.push({ id: "M", kind: "lend", person: "Ann", account: "a", date: "2026-04-01", status: "open" });
    o.txns.push(
      x("m1", 60, "2026-04-01", "loan", 100, "a", { dir: "out", loan: "M", principal: true }),
      x("m2", 61, "2026-04-05", "loan", 50, "a", { dir: "out", loan: "M", principal: true, archived: true }),
      x("mp", 62, "2026-04-20", "loan", 120, "a", { dir: "in", loan: "M" })
    );
    await load(o);
    const s0 = await snap();
    await page.click('#app [data-act="arch-open"]');
    await pause();
    await openRow("m2");
    await page.click('#app .txo [data-act="tx-del"]');
    await pause();
    ok(J((await shape()).btns) === J(["cd-destroy:Delete", "cd-out:Cancel"]), "Delete and Cancel");
    await page.click("#pop .cd-destroy");
    await pause();
    ok(
      (await snackText()).includes("already paid back") && (await snap()) === s0 && (await rows()).includes("m2"),
      "the draw can't be deleted: “" + (await snackText()) + "”, nothing changes, its row stays"
    );
  }

  // ---- 21. Back from the Archived screen puts History's row in view back where it was
  {
    const o = seed();
    for (let i = 0; i < 40; i++)
      o.txns.push(x("f" + i, 100 + i, "2026-06-1" + (i % 7), "expense", 1, "a", { cat: "food" }));
    o.txns.find(t => t.id === "old").archived = true;
    await load(o);
    await page.setViewportSize({ width: 393, height: 500 });
    await page.evaluate(async () => {
      scrollTo(0, document.body.scrollHeight / 2);
      await new Promise(r => setTimeout(r, 150));
    });
    await page.click('#app [data-act="arch-open"]');
    await pause();
    const a = await page.evaluate(() => ABACK.a); // the row in view as the screen opened (the tap may scroll first)
    await page.click('#app [data-act="arch-back"]');
    await pause();
    const top = await page.evaluate(
      v => document.querySelector('#app .tx[data-v="' + v + '"]').getBoundingClientRect().top,
      a.v
    );
    ok(
      (await page.evaluate(() => scrollY)) > 500 && Math.abs(top - a.top) <= 1,
      "the row in view is back in place: " + J([a, top])
    );
    await page.setViewportSize({ width: 393, height: 852 });
  }

  // ---- 22. one action, one icon (Ruling I): an account's Archive and Unarchive and the Assets drop slots use the
  // entries' outlined archive box
  {
    await load();
    const icons = await page.evaluate(() => {
      const path = h => {
        const d = document.createElement("div");
        d.innerHTML = h;
        return d.querySelector("path").getAttribute("d");
      };
      const of = sel => {
        const e = document.querySelector(sel);
        return e && e.querySelector("path") ? e.querySelector("path").getAttribute("d") : null;
      };
      const out = { arch: path(icArchive()), unarch: path(icUnarchive()), old: "archive" in P };
      V.screen = "assets";
      render();
      out.dropAcc = of('.dropbox[data-zone="acc"]');
      out.dropArch = of('.dropbox[data-zone="arch"]');
      accOpen("b");
      out.accArch = of('#sheet [data-act="acc-arch"]');
      closeSheet();
      S.accounts.find(a => a.id === "b").archived = true;
      accOpen("b");
      out.accUnarch = of('#sheet [data-act="acc-unarch"]');
      closeSheet();
      S.accounts.find(a => a.id === "b").archived = false;
      V.screen = "history";
      render();
      return out;
    });
    ok(
      icons.accArch === icons.arch &&
        icons.dropArch === icons.arch &&
        icons.accUnarch === icons.unarch &&
        icons.dropAcc === icons.unarch &&
        !icons.old,
      "an account's Archive and Unarchive and the drop slots use the outlined archive and unarchive " +
        J({ ...icons, arch: undefined, unarch: undefined })
    );
  }

  // ---- 23. archived entries in search (spec C): a Settings switch, off by default. On, search lists archived matches
  // among the others in date order, each marked "Archived" in words; opened, one offers Unarchive and Delete; search's
  // suggestions, counts and typo hint count them. History itself, Filters outside search, Home, Summary and every
  // total stay as they are; migrate() keeps the setting only when exactly true, and backups carry it
  {
    /* three entries at Green Market: two archived, one between them in date order that isn't */
    const green = (on, sa) => {
      const o = seed();
      o.txns.find(t => t.id === "old").archived = true;
      o.txns.push(
        x("gm2", 60, "2026-06-12", "expense", 8, "b", { cat: "groceries", payee: "Green Market" }),
        x("gm3", 61, "2026-06-13", "expense", 9, "b", { cat: "groceries", payee: "Green Market", archived: true })
      );
      if (on) o.settings.searchArch = sa === undefined ? true : sa;
      return o;
    };
    const find = q =>
      page.evaluate(q => {
        if (V.find) findEnd();
        V.screen = "history";
        V.open = "";
        openFind();
        const inp = $("#find-q");
        inp.value = q;
        findInput(q);
        findDraw();
        inp.blur();
        const sug = [...document.querySelectorAll("#hbody .sug")].map(s => s.textContent);
        return {
          rows: [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v),
          marked: [...document.querySelectorAll("#app .tx[data-v]")]
            .filter(e => e.querySelector(".s .tarch"))
            .map(e => e.dataset.v),
          said: FIND_SAID,
          sug,
          fix: FIXW && FIXW.count,
          months: [...document.querySelectorAll("#app .hmon")].map(e => e.getAttribute("aria-label")),
        };
      }, q);
    const settingsRow = () =>
      page.evaluate(() => {
        if (V.find) findEnd();
        V.screen = "settings";
        render();
        const secs = [...document.querySelectorAll("#app .sec")].map(e => e.textContent),
          sw = $('#app [data-act="search-arch"]'),
          row = sw && sw.closest(".setrow");
        return {
          secs,
          role: sw && sw.getAttribute("role"),
          on: sw && sw.getAttribute("aria-checked"),
          name: sw && sw.getAttribute("aria-label"),
          title: row && row.querySelector(".mid div").textContent,
          hint: row && row.querySelector(".mid .s").textContent,
        };
      });
    await load(green(false));
    ok(!("searchArch" in (await page.evaluate(() => S.settings))), "the setting is off by default (not stored)");
    const s0 = await settingsRow();
    const at = n => s0.secs.indexOf(n);
    ok(
      at("History") === at("Reminders") + 1 && at("Spending categories") === at("History") + 1,
      "Settings has a section “History” after Reminders, before Spending categories " + J(s0.secs)
    );
    ok(
      s0.role === "switch" &&
        s0.on === "false" &&
        s0.name === "Archived entries in search" &&
        s0.title === "Archived entries in search" &&
        s0.hint === "Search also finds entries you archived.",
      "its switch: “Archived entries in search”, its hint, off " + J(s0)
    );
    const off = await find("green");
    ok(
      J(off.rows) === J(["gm2"]) && !off.marked.length && off.said === "1 entry",
      "off: search leaves archived matches out " + J(off)
    );
    ok(
      off.sug.some(s => /Green Market/.test(s) && /1 entry/.test(s)),
      "off: the suggestion counts only what is listed " + J(off.sug)
    );
    ok((await find("greem")).fix === 1, "off: the typo hint counts only what is listed");
    const fOff = await figures();
    const histOff = await page.evaluate(() => {
      if (V.find) findEnd();
      openHistory();
      return {
        rows: [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v),
        all: hfCount(HF),
        groceries: hfCount({ ...HF, cat: "groceries" }),
      };
    });
    /* the switch, tapped: saved, and said */
    await settingsRow();
    await page.click('#app [data-act="search-arch"]');
    await pause();
    const s1 = await page.evaluate(() => ({
      on: $('#app [data-act="search-arch"]').getAttribute("aria-checked"),
      stored: S.settings.searchArch,
      saved: JSON.parse(localStorage.getItem(LS)).settings.searchArch,
    }));
    ok(s1.on === "true" && s1.stored === true && s1.saved === true, "tapped, the switch is on and saved " + J(s1));
    const on = await find("green");
    ok(
      J(on.rows) === J(["gm3", "gm2", "old"]),
      "on: search lists the archived matches among the others, in date order " + J(on.rows)
    );
    ok(J(on.marked) === J(["gm3", "old"]), "on: each archived match is marked, the others aren't " + J(on.marked));
    const mark = await page.evaluate(() => {
      const r = $('#app .tx[data-v="old"]'),
        s = r.querySelector(".s"),
        m = s.querySelector(".tarch");
      return {
        first: s.firstElementChild === m,
        text: m.textContent,
        line: s.textContent,
        icon: !!m.querySelector("svg.ic[aria-hidden=true]"),
        oneLine: m.getClientRects().length === 1, // the box and the word together, on one line
        same:
          m.querySelector("path").getAttribute("d") ===
          new DOMParser().parseFromString(icArchive(), "text/html").querySelector("path").getAttribute("d"),
        name: r.textContent,
      };
    });
    ok(
      mark.first &&
        mark.text === "Archived" &&
        /^Archived · Groceries · Cash/.test(mark.line) &&
        mark.icon &&
        mark.same &&
        mark.oneLine,
      "the mark starts the second line: the archive box and the word “Archived” " + J(mark)
    );
    ok(on.said === "3 entries", "on: the count said includes them " + J(on.said));
    ok(
      on.sug.some(s => /Green Market/.test(s) && /3 entries/.test(s)),
      "on: the suggestion counts them " + J(on.sug)
    );
    ok(
      on.months[0] === off.months[0] && J(on.months.slice(1)) === J(["May 2026, $12.00 spent"]),
      "the month headings' totals are the same either way; a month with only archived matches gets its heading " +
        J([off.months, on.months])
    );
    ok((await find("greem")).fix === 3, "on: the typo hint counts them");
    const fq = await page.evaluate(() => {
      HF.q = "green";
      return { all: hfCount(HF), groceries: hfCount({ ...HF, cat: "groceries" }) };
    });
    ok(fq.all === 3 && fq.groceries === 3, "in search, Filters counts what the list shows " + J(fq));
    /* opened: Unarchive and Delete; Unarchive keeps it in the results, unmarked; Undo marks it again */
    await find("green");
    await openRow("old");
    ok(
      J(await opened()) === J(["unarchive:Unarchive", "tx-del:Delete"]),
      "an archived match opened offers Unarchive and Delete " + J(await opened())
    );
    const live = await openRow("gm2").then(opened);
    ok(J(live) === J(["tx-open:Edit", "tx-del:Delete"]), "a live match still offers Edit and Delete " + J(live));
    await openRow("old");
    await page.click('#app .txo [data-act="unarchive"]');
    await pause();
    const un = await page.evaluate(() => ({
      find: V.find,
      q: HF.q,
      rows: [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v),
      marked: [...document.querySelectorAll("#app .tx[data-v] .tarch")].map(e => e.closest(".tx").dataset.v),
      arch: !!entry("old").archived,
    }));
    ok((await snackText()).startsWith("Back in History"), "Unarchive says “Back in History” " + (await snackText()));
    ok(
      un.find && un.q === "green" && J(un.rows) === J(["gm3", "gm2", "old"]) && J(un.marked) === J(["gm3"]) && !un.arch,
      "unarchived, it stays in the results, unmarked " + J(un)
    );
    await undo();
    ok((await marked()) === "gm3,old", "Undo archives it again " + (await marked()));
    /* Delete: the question leaves out Archive instead; Undo brings the entry back */
    const before = await snap();
    await find("green");
    await openRow("gm3");
    await page.click('#app .txo [data-act="tx-del"]');
    await pause();
    const q = await shape();
    ok(
      J(q.btns) === J(["destroy:Delete", "out:Cancel"]) ||
        J(q.btns.map(b => b.split(":")[1])) === J(["Delete", "Cancel"]),
      "Delete from search: Delete and Cancel, no Archive instead " + J(q.btns)
    );
    await page.click("#pop .cd-destroy");
    await pause();
    const del = await page.evaluate(() => ({
      gone: !entry("gm3"),
      rows: [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v),
    }));
    ok(del.gone && J(del.rows) === J(["gm2", "old"]), "Delete takes it out of the notebook and the results " + J(del));
    await undo();
    ok(canon(JSON.parse(await snap())) === canon(JSON.parse(before)), "Undo puts it back exactly");
    /* History without a search, Filters there, Home, Summary and every total: as with the switch off */
    ok(J(await figures()) === J(fOff), "on: every balance, total, Home and Summary are the same");
    const histOn = await page.evaluate(() => {
      if (V.find) findEnd();
      openHistory();
      return {
        rows: [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v),
        all: hfCount(HF),
        groceries: hfCount({ ...HF, cat: "groceries" }),
      };
    });
    ok(J(histOn) === J(histOff), "on: History without a search and its Filters counts are as before " + J(histOn));
    /* off again: hidden again */
    await settingsRow();
    await page.click('#app [data-act="search-arch"]');
    await pause();
    ok(!("searchArch" in (await page.evaluate(() => S.settings))), "off again: the setting is no longer stored");
    const off2 = await find("green");
    ok(J(off2.rows) === J(["gm2"]) && !off2.marked.length, "off again: search hides archived matches " + J(off2));
    await page.evaluate(() => findEnd());
    /* migrate(): only exactly true is kept */
    const san = await page.evaluate(
      vals =>
        vals.map(v => {
          const o = { v: 8, settings: { cur: "USD", searchArch: v }, accounts: [], txns: [] },
            m = migrate(o);
          return "searchArch" in m.settings ? m.settings.searchArch : "-";
        }),
      ["true", 1, { a: 1 }, null, false, "yes", true]
    );
    ok(
      J(san) === J(["-", "-", "-", "-", "-", "-", true]),
      "migrate() keeps the setting only when exactly true " + J(san)
    );
    const twice = await page.evaluate(() => {
      const m = migrate({ v: 8, settings: { cur: "USD", searchArch: true }, accounts: [], txns: [] });
      return [m.settings, migrate(JSON.parse(JSON.stringify(m))).settings];
    });
    ok(canon(twice[0]) === canon(twice[1]) && twice[1].searchArch === true, "migrate() a second time changes nothing");
    /* a backup carries it: on restores on, off restores off */
    await load(green(true));
    const bk = await page.evaluate(() => {
      const out = [];
      for (const v of [true, false]) {
        if (v) S.settings.searchArch = true;
        else delete S.settings.searchArch;
        const text = JSON.stringify(S);
        S = migrate({ ...blank(), v: 8, settings: { cur: "USD", searchArch: !v } });
        commit();
        restorePlan(text).run();
        out.push(S.settings.searchArch === true);
      }
      return out;
    });
    ok(J(bk) === J([true, false]), "a backup carries the setting, on or off " + J(bk));
    /* Delete all data keeps it, as the other preferences */
    const wiped = await page.evaluate(() => {
      S.settings.searchArch = true;
      wipeNow();
      return S.settings.searchArch === true;
    });
    ok(wiped, "Delete all data keeps the setting, as the other preferences");
    /* catalogue fixes: "N selected" has plain spaces (Ruling P: a long title wraps); Indonesian Unarchive's message */
    const cat = await page.evaluate(() => [
      i18nCat("zh-Hans")["history.selected_other"],
      i18nCat("id")["archive.back"],
    ]);
    ok(
      cat[0] === "已选 {{count}} 项" && !/[\u00a0\u2060]/.test(cat[0]) && cat[1] === "Dikembalikan ke Riwayat",
      "zh's selected count uses plain spaces; id's “Back in History” reads “Dikembalikan ke Riwayat” " + J(cat)
    );
  }

  // ---- 24. selecting in a search that lists archived matches (Ruling O): they stay in sight but can't be selected;
  // a long press on one starts nothing, a tap on one while selecting does nothing (no tick box, aria-disabled), and
  // Select all, the count, Archive selected and Delete selected are about the live matches only
  {
    const o = seed();
    o.settings.searchArch = true;
    o.txns.find(t => t.id === "old").archived = true;
    o.txns.push(
      x("gm2", 60, "2026-06-12", "expense", 8, "b", { cat: "groceries", payee: "Green Market" }),
      x("gm3", 61, "2026-06-13", "expense", 9, "b", { cat: "groceries", payee: "Green Market", archived: true }),
      x("gm4", 62, "2026-06-11", "expense", 7, "b", { cat: "groceries", payee: "Green Market" })
    );
    await load(o);
    const f0 = await figures();
    const search = () =>
      page.evaluate(() => {
        if (V.find) findEnd();
        V.sel = null;
        openFind();
        const inp = $("#find-q");
        inp.value = "green";
        findInput("green");
        findDraw();
        inp.blur();
      });
    const press = async id => {
      const b = await (await page.$('#app .tx[data-v="' + id + '"]')).boundingBox();
      await page.mouse.move(b.x + 60, b.y + 20);
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();
      await pause();
    };
    const st = () =>
      page.evaluate(() => {
        const row = id => {
          const r = $('#app .tx[data-v="' + id + '"]');
          return (
            r && {
              act: r.dataset.act || "",
              pressed: r.getAttribute("aria-pressed"),
              disabled: r.getAttribute("aria-disabled"),
              pick: !!r.querySelector(".em.pick"),
              faded: r.classList.contains("unsel"),
              name: r.textContent,
            }
          );
        };
        return {
          sel: V.sel ? [...V.sel].sort().join() : null,
          title: $("#app header.appbar h1") && $("#app header.appbar h1").getAttribute("aria-label"), // what TalkBack reads
          rows: [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v),
          gm2: row("gm2"),
          gm3: row("gm3"),
          old: row("old"),
        };
      });
    await search();
    const s0 = await st();
    ok(J(s0.rows) === J(["gm3", "gm2", "gm4", "old"]), "the search lists live and archived matches " + J(s0.rows));
    await press("gm3");
    const s1 = await st();
    ok(
      s1.sel === null && !(await page.$('#app [data-act="sel-del"]')),
      "a long press on an archived match starts nothing " + J(s1.sel)
    );
    await press("gm2");
    const s2 = await st();
    ok(s2.sel === "gm2" && s2.title === "1 selected", "a long press on a live match starts selecting it " + J(s2));
    const shown = await page.evaluate(() => {
      const h = $("#app header.appbar h1");
      return [
        h.textContent,
        h.querySelector("[aria-hidden=true]") && h.querySelector("[aria-hidden=true]").textContent,
      ];
    });
    ok(shown[0] === "1" && shown[1] === "1", "the bar shows only the count, hidden from TalkBack " + J(shown));
    /* the count as the phone writes numbers; a tap on a row (selSync) keeps the count and the phrase together */
    const big = await page.evaluate(() => selTitle(1234));
    ok(
      /aria-label="1,234 selected"/.test(big) && />1,234<\/span>/.test(big),
      "the count in the phone's number format " + big
    );
    await page.click('#app .tx[data-v="gm4"]');
    await pause();
    const tapped = await page.evaluate(() => {
      const h = $("#app header.appbar h1");
      return h.textContent + "|" + h.getAttribute("aria-label");
    });
    ok(tapped === "2|2 selected", "a row ticked: the count and TalkBack's phrase follow " + tapped);
    await page.click('#app .tx[data-v="gm4"]');
    await pause();
    ok(
      J(s2.rows) === J(s0.rows) &&
        s2.gm3.act === "" &&
        s2.gm3.disabled === "true" &&
        s2.gm3.pressed === null &&
        !s2.gm3.pick &&
        s2.gm3.name === s0.gm3.name &&
        s2.gm3.faded &&
        s2.old.faded &&
        !s2.gm2.faded &&
        !s0.gm3.faded &&
        !s0.old.faded &&
        s2.gm2.act === "sel-toggle" &&
        s2.gm2.pick,
      "while selecting, archived matches stay in sight, without a tick box, aria-disabled, faded (.unsel, only then), their label the same " +
        J(s2.gm3)
    );
    await page.click('#app .tx[data-v="gm3"]', { force: true }); // Playwright won't tap what says it is disabled
    await pause();
    const s3 = await st();
    ok(
      s3.sel === "gm2" && s3.title === "1 selected" && !s3.gm3.pick,
      "a tap on an archived match ticks nothing " + J(s3.sel)
    );
    await page.click('#app [data-act="sel-all"]');
    await pause();
    const s4 = await st();
    ok(
      s4.sel === "gm2,gm4" &&
        s4.title === "2 selected" &&
        (await page.evaluate(() => histAllSelected() && $('#app [data-act="sel-all"]').getAttribute("aria-label"))) ===
          "Clear selection",
      "Select all selects only the live matches, and then reads as all selected " + J(s4.sel)
    );
    /* Archive selected: only the live ones are archived (the others already were); they stay in the results, marked */
    await page.click('#app [data-act="sel-arch"]');
    await pause();
    ok((await marked()) === "gm2,gm3,gm4,old", "Archive selected archives the live matches " + (await marked()));
    ok(
      (await page.evaluate(() => document.querySelectorAll("#app .tx.unsel").length)) === 0,
      "selection over: no row is faded"
    );
    ok(
      (await page.evaluate(() => !V.sel && [...document.querySelectorAll("#app .tx .tarch")].length)) === 4,
      "…the selection ends; every match is still listed, now marked"
    );
    sameFigures(f0, await figures(), "archived from a search's selection");
    await undo();
    ok((await marked()) === "gm3,old", "Undo: as it was " + (await marked()));
    /* Delete selected: only the live ones go */
    await search();
    await press("gm4");
    await page.click('#app [data-act="sel-all"]');
    await pause();
    await page.click('#app [data-act="sel-del"]');
    await pause();
    await page.click("#pop .cd-destroy");
    await pause();
    const d = await page.evaluate(() => ["gm2", "gm3", "gm4", "old"].filter(id => entry(id)).join());
    ok(d === "gm3,old", "Delete selected deletes the live matches only " + d);
    await undo();
    await page.evaluate(() => {
      findEnd();
      render();
    });
  }

  // ---- 25. a payee's name as shown on its filter chip: the latest spelling on an entry search lists (an archived
  // one only while Settings lets search find it)
  {
    const o = seed();
    o.txns.push(
      x("pn1", 70, "2026-06-01", "expense", 3, "b", { cat: "food", payee: "corner cafe" }),
      x("pn2", 71, "2026-06-20", "expense", 3, "b", { cat: "food", payee: "CORNER CAFÉ", archived: true })
    );
    await load(o);
    const names = await page.evaluate(() => {
      const pay = "out:" + srCached(entry("sp")).pay,
        out = [srPayName(pay)];
      V.find = true;
      out.push(srPayName(pay));
      S.settings.searchArch = true;
      out.push(srPayName(pay));
      V.find = false;
      out.push(srPayName(pay));
      delete S.settings.searchArch;
      S.txns.forEach(t => t.payee && /corner/i.test(t.payee) && (t.archived = true));
      out.push(srPayName(pay));
      return out;
    });
    ok(
      J(names) === J(["Corner Cafe", "Corner Cafe", "CORNER CAFÉ", "Corner Cafe", "CORNER CAFÉ"]),
      "a payee's name comes from a listed entry, an archived one only when search finds it (else any) " + J(names)
    );
  }

  // ---- 26. focus after removals (review I1, M2): Unarchive and Delete on the Archived screen hand the focus to the next
  // row, else the one before, else the back button; Undo to the row it brings back; in a search that lists archived
  // entries, an unarchived row stays and keeps it
  {
    const o = seed();
    ["bus", "ad", "old"].forEach(id => (o.txns.find(t => t.id === id).archived = true));
    await load(o);
    const where = () =>
      page.evaluate(() => {
        const a = document.activeElement;
        return !a || a === document.body ? "body" : (a.dataset.act || a.tagName) + ":" + (a.dataset.v || "");
      });
    const say = async (want, what) => {
      const w = await where();
      ok(w === want, what + ": " + w);
    };
    await page.click('#app [data-act="arch-open"]');
    await pause();
    ok(J(await rows()) === J(["bus", "ad", "old"]), "the Archived screen, newest first " + J(await rows()));
    await openRow("ad");
    await page.click('#app .txo [data-act="unarchive"]');
    await pause();
    await say("row-open:old", "Unarchive: the next row");
    await undo();
    await say("row-open:ad", "its Undo: the row it brought back");
    await openRow("old");
    await page.click('#app .txo [data-act="tx-del"]');
    await pause();
    await page.click("#pop .cd-destroy");
    await pause();
    await say("row-open:ad", "Delete, the last row: the row before it");
    for (const id of ["bus", "ad"]) {
      await openRow(id);
      await page.click('#app .txo [data-act="unarchive"]');
      await pause();
    }
    ok(J(await rows()) === "[]", "nothing archived is left");
    await say("arch-back:", "the last one unarchived: the back button");

    // search listing archived entries: the row stays, unmarked, with the focus
    o.settings.searchArch = true;
    await load(o);
    await page.evaluate(() => {
      openFind();
      const inp = $("#find-q");
      inp.value = "City Bus";
      findInput(inp.value);
      findDraw();
      inp.blur();
    });
    await openRow("bus");
    await page.click('#app .txo [data-act="unarchive"]');
    await pause();
    await say("row-open:bus", "search: an unarchived row stays listed and keeps the focus");
  }

  {
    // the Archived button's icon is centred in its square (the chip's leading-icon pull must not apply)
    await load(seed());
    await page.evaluate(() => {
      S.txns.find(t => t.id === "old").archived = true;
      render();
    });
    const d = await page.evaluate(() => {
      const b = document.querySelector(".chip.harch"),
        i = b && b.querySelector(".ic, svg");
      if (!i) return null;
      const br = b.getBoundingClientRect(),
        ir = i.getBoundingClientRect();
      return {
        x: ir.left + ir.width / 2 - (br.left + br.width / 2),
        y: ir.top + ir.height / 2 - (br.top + br.height / 2),
      };
    });
    ok(d && Math.abs(d.x) <= 0.5 && Math.abs(d.y) <= 0.5, "the Archived button's icon is centred " + J(d));
  }

  ok(errors.length === 0, "no page errors " + J(errors));

  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
