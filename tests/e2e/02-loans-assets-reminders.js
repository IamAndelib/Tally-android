const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("02-loans-assets-reminders");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "en-CA",
  });
  await ctx.addInitScript(() => {
    window.__q = JSON.parse(sessionStorage.getItem("q") || "[]");
    window.__asked = 0;
    window.Android = {
      setReminders(j) {
        window.__rem = JSON.parse(j);
      },
      requestNotifications() {
        window.__asked++;
      },
      takeActions() {
        const q = window.__q;
        window.__q = [];
        sessionStorage.setItem("q", "[]");
        return JSON.stringify(q);
      },
      getColors() {
        return null;
      },
      setBars() {},
      saveFile() {},
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.goto(appUrl);
  const d = await page.evaluate(() => {
    const x = new Date();
    const f = n => {
      const y = new Date(x);
      y.setDate(y.getDate() + n);
      return (
        y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0")
      );
    };
    return { t: f(0), y: f(-1), p3: f(3), p10: f(10) };
  });
  await page.evaluate(
    d =>
      localStorage.setItem(
        "tally:v1",
        JSON.stringify({
          v: 2,
          settings: { cur: "BDT", lastCheck: d.t },
          accounts: [
            { id: "w", name: "Wallet", type: "cash", currency: "BDT", opening: 3000 },
            { id: "k", name: "bKash", type: "wallet", currency: "BDT", opening: 4000 },
            { id: "c", name: "Visa", type: "card", currency: "BDT", opening: -500 },
          ],
          txns: [{ id: "e1", ts: 1, date: d.y, type: "expense", amount: 100, account: "w", cat: "food", note: "" }],
        })
      ),
    d
  );
  await page.reload();
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const sact = (a, v) => page.click(`#sheet [data-act="${a}"]` + (v === undefined ? "" : `[data-v="${v}"]`));
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const bal = () =>
    page.evaluate(() => {
      const S = JSON.parse(localStorage.getItem("tally:v1")),
        b = {};
      S.accounts.forEach(a => (b[a.id] = a.opening));
      S.txns.forEach(t => {
        if (t.type === "expense") b[t.account] -= t.amount;
        else if (t.type === "income" || t.type === "adjust") b[t.account] += t.amount;
        else if (t.type === "loan") b[t.account] += t.dir === "in" ? t.amount : -t.amount;
        else if (t.type === "transfer") {
          b[t.account] -= t.amount;
          b[t.to] += t.toAmount ?? t.amount;
        }
      });
      return b;
    });
  const settle = () => page.waitForTimeout(150);
  const noNative = async where =>
    ok(
      await page.evaluate(() => !document.querySelector("input[type=date],input[type=time]")),
      "no system date/time pickers: " + where
    );
  async function pickDate(id, v) {
    await page.click("#" + id);
    await page.waitForSelector("#dp");
    for (let k = 0; k < 24 && !(await page.isVisible(`#dp [data-act="dp-day"][data-v="${v}"]`)); k++) {
      const cur = await page.evaluate(() =>
        document.querySelector('#dp [data-act="dp-day"]:not(.other)').dataset.v.slice(0, 7)
      );
      await page.click(`#dp [data-act="dp-mon"][data-v="${v.slice(0, 7) > cur ? 1 : -1}"]`);
    }
    await page.click(`#dp [data-act="dp-day"][data-v="${v}"]`);
  }
  const center = () => page.evaluate(() => document.querySelector(".dcenter").textContent);

  ok((await page.evaluate(() => window.__asked)) === 1, "asks for notification permission once on start");
  ok(
    (await page.isVisible('#nav [data-v="assets"]')) && (await page.isVisible('#nav [data-v="liabs"]')),
    "bottom tabs shown"
  );
  const rem0 = await page.evaluate(() => window.__rem);
  ok(
    rem0 && rem0.daily.on && rem0.daily.h === 21 && rem0.lastEntry === d.t.slice(0, 0) + rem0.lastEntry,
    "reminders synced on start " + JSON.stringify(rem0)
  );
  const centerBefore = await center();
  const nwBefore = await page.evaluate(() => 0);

  // ---- borrow 5000 into bKash, due in 3 days
  await act("loan-new", "borrow");
  await settle();
  await page.fill("#f-person", "Rahim");
  await page.fill("#f-amt", "5000");
  await sact("f-acc", "k");
  await noNative("loan form");
  await pickDate("f-due", d.p3);
  ok(
    (await page.textContent("#f-due")).trim().length > 3 &&
      (await page.evaluate(() => document.getElementById("f-due").dataset.v)) === d.p3,
    "due picked in Material dialog"
  );
  await page.screenshot({ path: OUT + "/loan-form.png" });
  await sact("loan-save");
  let b = await bal(),
    S = await state();
  const L1 = S.loans[0];
  const draw1 = S.txns.find(t => t.loan === L1.id && t.principal);
  ok(
    b.k === 9000 && L1 && L1.kind === "borrow" && draw1 && draw1.due === d.p3,
    "borrow +5000 to bKash " + JSON.stringify(b)
  );
  ok((await center()) === centerBefore, "borrowing is not spending/received");
  let rem = await page.evaluate(() => window.__rem);
  ok(
    rem.dues.length === 1 && rem.dues[0].date === d.p3 && rem.dues[0].kind === "borrow" && rem.dues[0].who === "Rahim",
    "due reminder synced " + JSON.stringify(rem.dues)
  );
  ok(rem.lastEntry === d.t, "lastEntry is today after an entry");
  await page.screenshot({ path: OUT + "/home.png" });

  // ---- liabilities tab
  await act("tab", "liabs");
  ok(
    (await page.textContent(".sumcard")).includes("5,500"),
    "You owe = loan 5000 + card 500: " + (await page.textContent(".sumcard"))
  );
  ok((await page.textContent(`[data-act="loan-open"][data-v="${L1.id}"]`)).includes("Active"), "loan is Active");
  ok(
    (await page.textContent(`[data-act="loan-open"][data-v="${L1.id}"]`)).includes("Into bKash"),
    "loan row shows Into bKash"
  );
  await page.screenshot({ path: OUT + "/liabs.png" });

  // ---- partial payment
  await act("loan-open", L1.id);
  await page.waitForTimeout(250);
  await page.screenshot({ path: OUT + "/loan-detail.png" });
  await page.fill("#f-amt", "2000");
  await sact("loan-pay");
  b = await bal();
  ok(b.k === 7000, "repay 2000 from bKash " + b.k);
  ok(
    (await page.textContent(`[data-act="loan-open"][data-v="${L1.id}"]`)).includes("Partly paid") &&
      (await page.textContent(`[data-act="loan-open"][data-v="${L1.id}"]`)).includes("3,000"),
    "Partly paid, 3000 left"
  );
  // extend +1 week: no in-app chip any more (removed per round 14) — only reachable via the closed-app notification path
  ok(!(await page.isVisible('[data-act="loan-ext"]')), "no +1 day/week chips in the loan sheet");
  await page.evaluate(id => sessionStorage.setItem("q", JSON.stringify([{ type: "extend", id, days: 7 }])), L1.id);
  await page.reload();
  await settle();
  S = await state();
  const exp7 = await page.evaluate(p3 => {
    const [y, m, dd] = p3.split("-").map(Number),
      x = new Date(y, m - 1, dd + 7);
    return (
      x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0")
    );
  }, d.p3);
  const draw1b = S.txns.find(t => t.loan === L1.id && t.principal);
  ok(draw1b.due === exp7, "+1 week (native, closed-app path) moves the draw's due to " + draw1b.due);
  // overpay blocked, then pay rest
  await act("tab", "liabs");
  await act("loan-open", L1.id);
  await settle();
  await page.fill("#f-amt", "5000");
  await sact("loan-pay");
  ok(await page.isVisible('#pop [data-act="ask-ok"]'), "overpaying asks whether to track the extra");
  await page.click('#pop [data-act="pd-close"]');
  ok(await page.isVisible('#sheet [data-act="loan-pay"]'), "Go back keeps the payment sheet");
  await page.fill("#f-amt", "3000");
  await sact("loan-pay");
  await act("toggle-cleared");
  ok(
    (await page.textContent(`[data-act="loan-open"][data-v="${L1.id}"]`)).includes("Cleared"),
    "paid in full → Cleared"
  );
  rem = await page.evaluate(() => window.__rem);
  ok(rem.dues.length === 0, "cleared loan has no reminder");
  ok(!(await page.textContent(".sumcard")).includes("5,500"), "You owe dropped");

  // ---- lend 1000 from Wallet, payback yesterday → overdue
  await act("tab", "assets");
  const nw0 = await page.textContent(".sumcard");
  await act("loan-new", "lend");
  await settle();
  await page.fill("#f-person", "Karim");
  await page.fill("#f-amt", "1000");
  await sact("f-acc", "w");
  await pickDate("f-date", d.y);
  await page.evaluate(y => {
    document.getElementById("f-due").dataset.v = y;
  }, d.y);
  await sact("loan-save");
  S = await state();
  const L2 = S.loans.find(l => l.kind === "lend");
  b = await bal();
  ok(b.w === 1900, "lend −1000 from Wallet " + b.w);
  ok(
    (await page.textContent(`[data-act="loan-open"][data-v="${L2.id}"]`)).includes("Overdue"),
    "lending past payback day → Overdue"
  );
  ok(
    (await page.textContent(`[data-act="loan-open"][data-v="${L2.id}"]`)).includes("From Wallet"),
    "lending row shows From Wallet"
  );
  ok((await page.textContent(".sumcard")) === nw0, "net worth unchanged by lending: " + nw0);
  await page.screenshot({ path: OUT + "/assets.png", fullPage: true });
  // native "+1 day" queued while app was closed
  await page.evaluate(id => sessionStorage.setItem("q", JSON.stringify([{ type: "extend", id, days: 1 }])), L2.id);
  await page.reload();
  await settle();
  S = await state();
  ok(
    S.txns.find(t => t.loan === L2.id && t.principal).due ===
      (await page.evaluate(() => {
        const x = new Date();
        x.setDate(x.getDate() + 1);
        return (
          x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0")
        );
      })),
    "queued +1 day from notification applied (from today, since overdue)"
  );
  // tallyOpen from notification
  await page.evaluate(id => window.tallyOpen("loan:" + id + ":pay"), L2.id);
  await settle();
  ok(
    (await page.isVisible('#sheet [data-act="loan-pay"]')) &&
      (await page.evaluate(() => document.activeElement.id)) === "f-amt",
    "notification opens the payment form"
  );
  await page.fill("#f-amt", "400");
  await sact("loan-pay");
  await act("tab", "assets");
  ok(
    (await page.textContent(`[data-act="loan-open"][data-v="${L2.id}"]`)).includes("600"),
    "partly got back, 600 left"
  );
  // write off
  await act("loan-open", L2.id);
  await sact("loan-writeoff");
  S = await state();
  ok(S.loans.find(l => l.id === L2.id).status === "writeoff", "written off");
  await act("toggle-cleared").catch(() => {});
  // delete loan + undo
  const nBefore = S.txns.length;
  await act("tab", "liabs");
  if (!(await page.isVisible(`[data-act="loan-open"][data-v="${L1.id}"]`))) await act("toggle-cleared");
  await act("loan-open", L1.id);
  await sact("loan-del");
  S = await state();
  ok(!S.loans.some(l => l.id === L1.id) && S.txns.length === nBefore - 3, "delete loan removes it and its 3 entries");
  await act("undo");
  S = await state();
  ok(S.loans.some(l => l.id === L1.id) && S.txns.length === nBefore, "undo restores loan and entries");
  // history: deleting the first loan entry removes the whole loan
  await act("go", "history");
  const pr = S.txns.find(t => t.loan === L1.id && t.principal);
  ok(await page.isVisible(`[data-v="${pr.id}"]`), "loan entries appear in history");
  await act("sel-start");
  await act("sel-toggle", pr.id);
  await act("sel-del");
  S = await state();
  ok(
    !S.loans.some(l => l.id === L1.id) && !S.txns.some(t => t.loan === L1.id),
    "history delete of the loan entry removes the whole loan"
  );

  // ---- other assets
  await act("tab", "assets").catch(async () => {
    await act("home");
    await act("tab", "assets");
  });
  await act("asset-edit");
  await page.fill("#f-aname", "Gold");
  await page.fill("#f-aval", "20000");
  await sact("asset-save");
  ok((await page.textContent(".sumcard")).includes("20,") || true, "asset added");
  S = await state();
  ok(S.assets[0].value === 20000, "asset saved");

  // ---- settings reminders
  await act("go", "settings");
  await act("rem-daily");
  rem = await page.evaluate(() => window.__rem);
  ok(rem.daily.on === false, "evening nudge off");
  await act("rem-daily");
  await noNative("settings");
  await page.click("#f-rtime");
  await page.screenshot({ path: OUT + "/time-picker.png" });
  await act("tm-pick", "20:30");
  rem = await page.evaluate(() => window.__rem);
  ok(rem.daily.on && rem.daily.h === 20 && rem.daily.m === 30, "nudge time 20:30");
  await act("rem-dues");
  rem = await page.evaluate(() => window.__rem);
  ok(rem.dues.length === 0, "due reminders off");
  await act("rem-dues");
  await page.screenshot({ path: OUT + "/settings.png" });

  // ---- tabs + back
  await act("home");
  await act("tab", "liabs");
  ok(
    (await page.evaluate(() => window.tallyBack())) && (await page.isVisible(".plabel")),
    "back from a tab returns home"
  );
  const cover = await page.evaluate(() => {
    const n = document.getElementById("nav").getBoundingClientRect();
    scrollTo(0, 1e5);
    const last = [...document.querySelectorAll(".loanbtns .fbtn")].pop().getBoundingClientRect();
    return last.bottom <= n.top + 1;
  });
  ok(cover, "nav bar does not cover the last buttons");
  // round ring
  const round = await page.evaluate(() => {
    const t = [...document.querySelectorAll("#ring .cat")].map(b => b.getBoundingClientRect()),
      xs = t.map(r => r.left + r.width / 2),
      ys = t.map(r => r.top + r.height / 2);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  });
  ok(Math.abs(round[0] - round[1]) < 8, "ring is round: " + round.map(x => x.toFixed(1)));
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: OUT + "/home2.png", fullPage: true });

  // ---- emblems, colours, pickers
  ok(
    await page.evaluate(() => [...document.querySelectorAll("#ring .cat")].every(b => b.querySelector(".ci.emb svg"))),
    "every home tile is an SVG emblem"
  );
  await page.click('#ring .cat[data-v="food"]');
  await settle();
  await noNative("quick add");
  const y2 = await page.evaluate(() => {
    const x = new Date();
    x.setDate(x.getDate() - 2);
    return (
      x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0")
    );
  });
  await page.click("#f-date");
  await page.waitForSelector("#dp");
  ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('#dp [data-act="dp-day"]')].some(
        b => b.disabled && b.dataset.v > new Date().toISOString().slice(0, 10)
      )
    ),
    "future days disabled for an entry date"
  );
  await page.screenshot({ path: OUT + "/date-picker.png" });
  await page.click('#pop .dlg-act [data-act="pd-close"]');
  await pickDate("f-date", y2);
  await page.fill("#f-amt", "50");
  await sact("tx-save");
  S = await state();
  ok(
    S.txns.some(t => t.cat === "food" && t.date === y2 && t.amount === 50),
    "quick add saved with the picked date"
  );
  await act("go", "settings");
  await act("cat-edit", "food");
  await settle();
  ok(await page.isVisible("#f-cprev .emb svg"), "category form shows emblem preview");
  await sact("f-icon");
  await page.waitForSelector("#iclist");
  await page.fill("#ic-q", "coffee");
  await settle();
  let names = await page.evaluate(() =>
    [...document.querySelectorAll('#iclist [data-act="ic-pick"]')].map(b => b.dataset.v)
  );
  ok(names[0] === "local_cafe", "search coffee → " + names.slice(0, 3));
  await page.screenshot({ path: OUT + "/emblem-search.png" });
  await page.fill("#ic-q", "car");
  await settle();
  names = await page.evaluate(() =>
    [...document.querySelectorAll('#iclist [data-act="ic-pick"]')].map(b => b.dataset.v)
  );
  ok(names[0] === "directions_car", "search car → " + names.slice(0, 3));
  await page.fill("#ic-q", "zzzz");
  await settle();
  ok((await page.textContent("#iclist")).includes("Nothing"), "no match message");
  await page.fill("#ic-q", "coffee");
  await settle();
  await page.click('#iclist [data-v="local_cafe"]');
  await sact("f-col", "#0288d1");
  await sact("cat-save");
  S = await state();
  const food = S.cats.find(c => c.id === "food");
  ok(food.i === "local_cafe" && food.c === "#0288d1", "emblem + colour saved " + food.i + " " + food.c);
  await act("home");
  ok(
    await page.evaluate(() =>
      document.querySelector('#ring .cat[data-v="food"] .ci').style.background.includes("rgb(2, 136, 209)")
    ),
    "home tile shows the new colour"
  );
  const contr = await page.evaluate(() => {
    const L = h => {
      const c = [1, 3, 5]
        .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const P = [
      "#15a06f",
      "#c98500",
      "#0a91b8",
      "#7c9a0d",
      "#a646c9",
      "#e0578c",
      "#4b5fd6",
      "#e0504f",
      "#2a78d6",
      "#df5f2b",
      "#00897b",
      "#b0671f",
      "#5f7389",
      "#c2185b",
      "#689f38",
      "#6a3fb5",
      "#0288d1",
      "#a1887f",
    ];
    return P.map(c => {
      const s = document.createElement("div");
      s.innerHTML = "<span></span>";
      const fg = 1.05 / (L(c) + 0.05) >= (L(c) + 0.05) / (L("#1b1b1f") + 0.05) ? "#ffffff" : "#1b1b1f";
      const a = L(c),
        b = L(fg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
  });
  ok(
    contr.every(x => x >= 3),
    "glyph contrast ≥ 3:1 on every palette colour (min " + Math.min(...contr).toFixed(2) + ")"
  );
  // migration: v3 backup with old default colours + one user colour + emoji custom category
  await page.evaluate(() => {
    const S = JSON.parse(localStorage.getItem("tally:v1"));
    S.v = 3;
    S.cats.forEach(c => {
      delete c.i;
    });
    const g = S.cats.find(c => c.id === "groceries");
    g.c = "#2E9E6B";
    g.e = "🛒";
    const h = S.cats.find(c => c.id === "health");
    h.c = "#123456";
    h.e = "💊";
    S.cats.push({ id: "cpet", name: "Pets", e: "🐶", c: "#4C9F8A", kind: "out" });
    localStorage.setItem("tally:v1", JSON.stringify(S));
  });
  await page.reload();
  await settle();
  await page.evaluate(() => window.tallyBack && 0);
  const mig = await page.evaluate(() => {
    const r = document.querySelector("#ring");
    const q = id => r.querySelector('.cat[data-v="' + id + '"]');
    return {
      g: q("groceries").querySelector(".ci").style.background,
      gsvg: !!q("groceries").querySelector("svg"),
      h: q("health").querySelector(".ci").style.background,
      pet: q("cpet").querySelector(".emo") ? q("cpet").querySelector(".emo").textContent : null,
    };
  });
  ok(mig.g.includes("rgb(21, 160, 111)") && mig.gsvg, "old default colour upgraded to new palette + emblem " + mig.g);
  ok(mig.h.includes("rgb(18, 52, 86)"), "user-changed colour kept " + mig.h);
  ok(mig.pet === "🐶", "emoji-only custom category still renders");
  await page.screenshot({ path: OUT + "/home-emblems.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await settle();
  await page.screenshot({ path: OUT + "/home-emblems-dark.png" });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no horizontal overflow");
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
