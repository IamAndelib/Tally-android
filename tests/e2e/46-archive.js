// Archived entries (docs/specs/history-archive.md, B): archiving hides an entry from History and changes nothing else.
// An entry's mark (`archived: true`, data version 8) is kept and sanitised by migrate() and carried by backups; an
// entry and its linked charge or extra are archived and shown again together. Every balance, loan and total stays
// (History's headings, Home, Summary, the widget, the morning check, CSV); History's rows, search and the Filters
// sheet's counts leave archived entries out, and a day or month heading shows only while it has a row to show. The
// delete question: a warning line, then Delete, Archive instead and Cancel.
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
        out = {};
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
    /* showing again takes the mark off the entry and its add-on */
    await page.evaluate(() => {
      archiveEntries(["sp"], false);
      commit();
    });
    ok((await marked()) === "p1,p1t", "shown again: the entry and its charge lose the mark " + (await marked()));
  }

  // ---- 10. empty states: the entries sheet and Home's two-pane list say "Nothing written down yet." when every entry
  // of the period is archived; so does the entries sheet right after its last row is archived from it
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
        (await page.textContent("#sheet .empty").catch(() => "")) === "Nothing written down yet.",
      "archiving the last row from the entries sheet leaves its empty state"
    );
    await page.evaluate(() => {
      closeSheet();
      entriesSheet();
    });
    await pause();
    ok(
      (await page.textContent("#sheet .empty").catch(() => "")) === "Nothing written down yet.",
      "the entries sheet with only archived entries shows its empty state"
    );
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
      wide.panes && !wide.rows && wide.empty === "Nothing written down yet.",
      "Home's two-pane list at 1000px with only archived entries shows its empty state " + J(wide)
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

  ok(errors.length === 0, "no page errors " + J(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
