// Charges and extras (docs/specs/charges.md). Saved data version 8: an add-on that moves money is an entry linked both
// ways to its entry (feeOf on it, feeId on the entry), what only changes what is owed is a draw's onTop. migrate()
// keeps only the allowed links, never changes an amount, account, date or balance, loads a v7 save or backup as it
// was, is a no-op the second time, and leaves a v8 file that an older Tally reads (without the links and onTop) with
// every balance. setAddOn() makes, updates and removes an entry's add-on; deleting a lend's only draw takes the
// lending with its transfer charge.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
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
const same = (a, b) => canon(a) === canon(b);
const copy = o => JSON.parse(JSON.stringify(o));
const J = JSON.stringify;
/* balances worked out here, independently of the app: each account's opening balance and what every entry (dated
   before `before`, when given) moves */
function refBalances(o, before) {
  const b = {};
  o.accounts.forEach(a => (b[a.id] = a.opening));
  o.txns.forEach(t => {
    if ((before && !(t.date < before)) || !(t.account in b)) return;
    if (t.type === "expense") b[t.account] -= t.amount;
    else if (t.type === "income" || t.type === "adjust") b[t.account] += t.amount;
    else if (t.type === "transfer") {
      b[t.account] -= t.amount;
      if (t.to in b) b[t.to] += t.toAmount != null ? t.toAmount : t.amount;
    } else if (t.type === "loan") b[t.account] += t.dir === "in" ? t.amount : -t.amount;
  });
  for (const k in b) b[k] = Math.round(b[k] * 1000) / 1000 + 0;
  return b;
}
/* every day the notebook has an entry on, and the day after the last: balances at the start of each */
const daysOf = o => {
  const d = [...new Set(o.txns.map(t => t.date))].sort();
  return d.concat("9999-12-31");
};
/* what 1.4.2–1.4.4 keep of a v8 file (spec "What older versions do"): no links, no onTop */
const asOlder = o => {
  const n = copy(o);
  n.txns.forEach(t => {
    delete t.feeOf;
    delete t.feeId;
    delete t.onTop;
  });
  return n;
};

const D = {
  d1: "2026-03-02",
  d2: "2026-03-10",
  d3: "2026-04-01",
  d4: "2026-04-15",
  d5: "2026-05-01",
  d6: "2026-05-20",
  due1: "2026-07-01",
  due2: "2026-08-01",
};
const settings = {
  cur: "BDT",
  week: 1,
  clock: "24",
  home: "day",
  theme: "system",
  haptics: true,
  hapticLevel: 3,
  donut: "both",
  remind: { daily: true, time: "21:00", dues: true, dueTime: "09:00", check: true, checkTime: "08:00" },
  backup: { on: false, time: "23:00" },
  hiddenPeople: [],
  hiddenPayees: [],
  customCols: [],
  dragTip: true,
  hiddenCols: [],
  hiddenTypes: [],
  lastCheck: D.d6,
};
const acct = (id, name, type, currency, opening) => ({
  id,
  name,
  type,
  currency,
  opening,
  archived: false,
  i: "",
  e: "",
  c: "",
});
/* the built-in categories as a v7 Tally saves them, Fees renamed "Food" (the reported case) */
const cats7 = [
  { id: "groceries", name: "Groceries", e: "🛒", c: "#15a06f", i: "shopping_cart", kind: "out", hidden: false },
  { id: "food", name: "Eating out", e: "🍔", c: "#c98500", i: "restaurant", kind: "out", hidden: false },
  { id: "transport", name: "Transport", e: "🚌", c: "#0a91b8", i: "directions_bus", kind: "out", hidden: false },
  { id: "housing", name: "Rent", e: "🏠", c: "#7c9a0d", i: "home", kind: "out", hidden: false },
  { id: "bills", name: "Bills", e: "📱", c: "#a646c9", i: "receipt_long", kind: "out", hidden: false },
  { id: "shopping", name: "Shopping", e: "🛍️", c: "#e0578c", i: "shopping_bag", kind: "out", hidden: false },
  { id: "education", name: "Study", e: "📚", c: "#4b5fd6", i: "school", kind: "out", hidden: false },
  { id: "health", name: "Health", e: "💊", c: "#e0504f", i: "medication", kind: "out", hidden: false },
  { id: "fun", name: "Fun", e: "🎬", c: "#2a78d6", i: "movie", kind: "out", hidden: false },
  { id: "family", name: "Family", e: "🎁", c: "#df5f2b", i: "family_restroom", kind: "out", hidden: false },
  { id: "fees", name: "Food", e: "🏦", c: "#c98500", i: "restaurant", kind: "out", hidden: false },
  { id: "other", name: "Other", e: "🧾", c: "#b0671f", i: "category", kind: "out", hidden: false },
  { id: "income", name: "Income", e: "💰", c: "#15a06f", i: "payments", kind: "in", hidden: false },
  { id: "gift", name: "Gift", e: "🎁", c: "#e0578c", i: "redeem", kind: "in", hidden: false },
  { id: "otherin", name: "Other", e: "➕", c: "#5f7389", i: "add_circle", kind: "in", hidden: false },
];
/* a new v8 notebook's categories: the same without the retired Fees */
const cats8 = cats7.filter(c => c.id !== "fees");
const x = (id, ts, date, type, amount, account, extra) => ({
  id,
  ts,
  date,
  type,
  amount,
  account,
  note: "",
  ...extra,
});
const loanOf = (id, kind, person, account, date, status = "open") => ({
  id,
  ts: 1,
  kind,
  person,
  account,
  date,
  note: "",
  status,
});

/* ---- a v7 save, exactly as 1.4.2–1.4.4 write one: a transfer fee (1.3.1's, with its note and its transfer's time),
   a loan payment's fee, a lending payment's paid fee, a lending and a loan with several draws, due days and part
   payments, a written-off lending, a plain expense in Fees (renamed "Food"), a transfer across currencies */
const v7 = {
  v: 7,
  settings,
  accounts: [
    acct("a", "Bank", "bank", "BDT", 50000),
    acct("k", "Bkash", "wallet", "BDT", 20000),
    acct("c", "Cash", "cash", "BDT", 1000),
    acct("u", "Dollars", "savings", "USD", 100),
  ],
  types: [],
  cats: cats7,
  txns: [
    x("t1", 100, D.d1, "transfer", 5000, "a", { to: "k", feeId: "t1f" }),
    x("t1f", 100, D.d1, "expense", 10, "a", { note: "Transfer fee", cat: "fees", feeOf: "t1" }),
    x("t2", 105, D.d2, "transfer", 1200, "a", { to: "u", toAmount: 10 }),
    x("bd1", 200, D.d1, "loan", 10000, "a", { dir: "in", loan: "B", principal: true, due: D.due1 }),
    x("bd2", 210, D.d3, "loan", 5000, "a", { dir: "in", loan: "B", principal: true, due: D.due2 }),
    x("bp1", 220, D.d4, "loan", 3000, "a", { dir: "out", loan: "B", feeId: "bp1f" }),
    x("bp1f", 221, D.d4, "expense", 20, "a", { cat: "fees", feeOf: "bp1" }),
    x("bp2", 230, D.d5, "loan", 2000, "a", { dir: "out", loan: "B" }),
    x("ld1", 300, D.d1, "loan", 2000, "k", { dir: "out", loan: "L", principal: true, due: D.due1 }),
    x("ld2", 310, D.d2, "loan", 1000, "k", { dir: "out", loan: "L", principal: true }),
    x("lp1", 320, D.d4, "loan", 1500, "k", { dir: "in", loan: "L", feeId: "lp1f" }),
    x("lp1f", 321, D.d4, "expense", 15, "k", { cat: "fees", feeOf: "lp1" }),
    x("wd", 400, D.d2, "loan", 800, "c", { dir: "out", loan: "W", principal: true }),
    x("wp", 410, D.d3, "loan", 300, "c", { dir: "in", loan: "W" }),
    x("e1", 500, D.d5, "expense", 300, "c", { cat: "fees", payee: "Corner cafe" }),
    x("e2", 510, D.d5, "expense", 50, "a", { cat: "groceries" }),
    x("i1", 520, D.d6, "income", 40000, "a", { cat: "income", payee: "Employer" }),
    x("adj", 530, D.d6, "adjust", -12.5, "k"),
  ],
  loans: [
    loanOf("B", "borrow", "Sam", "a", D.d1),
    loanOf("L", "lend", "Rina", "k", D.d1),
    loanOf("W", "lend", "Joy", "c", D.d2, "writeoff"),
  ],
  assets: [{ id: "g", name: "Gold", e: "", i: "diamond", c: "#a646c9", value: 1000, currency: "BDT" }],
};

/* ---- a v8 save with every add-on: a transfer charge on a transfer, on a loan payment and (a linked loan entry) on a
   lend; a lend's extra and a borrow's charges as onTop; a purchase's charge; a tip on a lending payment; and an older
   lending payment's paid fee, which stays a charge */
const v8 = {
  v: 8,
  settings,
  accounts: [
    acct("a", "Bank", "bank", "BDT", 50000),
    acct("k", "Bkash", "wallet", "BDT", 20000),
    acct("c", "Card", "card", "BDT", 0),
  ],
  types: [],
  cats: cats8,
  txns: [
    x("tA", 100, D.d1, "transfer", 1000, "a", { to: "k", feeId: "tAc" }),
    x("tAc", 101, D.d1, "expense", 10, "a", { cat: "fees", feeOf: "tA" }),
    x("bD", 200, D.d1, "loan", 1000, "a", { dir: "in", loan: "B2", principal: true, due: D.due1, onTop: 100 }),
    x("bP", 210, D.d3, "loan", 500, "a", { dir: "out", loan: "B2", feeId: "bPc" }),
    x("bPc", 211, D.d3, "expense", 5, "a", { cat: "fees", feeOf: "bP" }),
    x("lD", 300, D.d1, "loan", 1000, "k", {
      dir: "out",
      loan: "L2",
      principal: true,
      due: D.due2,
      onTop: 150,
      feeId: "lDc",
    }),
    x("lDc", 301, D.d1, "loan", 100, "k", { dir: "out", loan: "L2", principal: true, feeOf: "lD" }),
    x("lP0", 310, D.d2, "loan", 200, "k", { dir: "in", loan: "L2", feeId: "lP0f" }),
    x("lP0f", 311, D.d2, "expense", 3, "k", { cat: "fees", feeOf: "lP0" }),
    x("lP", 320, D.d4, "loan", 500, "k", { dir: "in", loan: "L2", feeId: "lPt" }),
    x("lPt", 321, D.d4, "income", 50, "k", { cat: "otherin", feeOf: "lP" }),
    x("pE", 400, D.d5, "expense", 1000, "c", { cat: "food", payee: "Diner", feeId: "pEc" }),
    x("pEc", 401, D.d5, "expense", 150, "c", { cat: "food", feeOf: "pE" }),
  ],
  loans: [loanOf("B2", "borrow", "Sam", "a", D.d1), loanOf("L2", "lend", "Rafi", "k", D.d1)],
  assets: [],
};

/* ---- links no version may keep, and amounts on top that can't be read: each comes out as a plain entry */
const bad = {
  v: 8,
  settings,
  accounts: [acct("a", "Bank", "bank", "BDT", 50000), acct("k", "Bkash", "wallet", "BDT", 20000)],
  types: [],
  cats: cats8,
  txns: [
    // a tip on a transfer, on a borrow's payment and on a lend's draw
    x("tr", 100, D.d1, "transfer", 100, "a", { to: "k", feeId: "x1" }),
    x("x1", 101, D.d1, "income", 5, "a", { cat: "otherin", feeOf: "tr" }),
    x("bdr", 110, D.d1, "loan", 1000, "a", { dir: "in", loan: "BB", principal: true }),
    x("bpay", 120, D.d2, "loan", 200, "a", { dir: "out", loan: "BB", feeId: "x2" }),
    x("x2", 121, D.d2, "income", 4, "a", { cat: "otherin", feeOf: "bpay" }),
    x("ldr", 130, D.d1, "loan", 500, "k", { dir: "out", loan: "LL", principal: true, feeId: "x3" }),
    x("x3", 131, D.d1, "income", 6, "k", { cat: "otherin", feeOf: "ldr" }),
    // a charge on money received and on a draw
    x("inc", 140, D.d2, "income", 300, "a", { cat: "income", feeId: "x4" }),
    x("x4", 141, D.d2, "expense", 2, "a", { cat: "fees", feeOf: "inc" }),
    x("ldr2", 150, D.d2, "loan", 400, "k", { dir: "out", loan: "LL", principal: true, feeId: "x5" }),
    x("x5", 151, D.d2, "expense", 3, "k", { cat: "fees", feeOf: "ldr2" }),
    // a loan transfer charge on a borrow's draw, on another loan, on a payment, not principal, not out
    x("bdr2", 160, D.d2, "loan", 600, "a", { dir: "in", loan: "BB", principal: true, feeId: "x6" }),
    x("x6", 161, D.d2, "loan", 10, "a", { dir: "out", loan: "BB", principal: true, feeOf: "bdr2" }),
    x("l3d", 170, D.d2, "loan", 700, "k", { dir: "out", loan: "L3", principal: true, feeId: "x7" }),
    x("x7", 171, D.d2, "loan", 7, "k", { dir: "out", loan: "LL", principal: true, feeOf: "l3d" }),
    x("lpay", 180, D.d3, "loan", 100, "k", { dir: "in", loan: "LL", feeId: "x8" }),
    x("x8", 181, D.d3, "loan", 8, "k", { dir: "out", loan: "LL", principal: true, feeOf: "lpay" }),
    x("ldr3", 190, D.d3, "loan", 300, "k", { dir: "out", loan: "LL", principal: true, feeId: "x9" }),
    x("x9", 191, D.d3, "loan", 9, "k", { dir: "out", loan: "LL", feeOf: "ldr3" }),
    x("ldr4", 200, D.d3, "loan", 250, "k", { dir: "out", loan: "LL", principal: true, feeId: "x10" }),
    x("x10", 201, D.d3, "loan", 11, "k", { dir: "in", loan: "LL", principal: true, feeOf: "ldr4" }),
    // a charge on a charge (an expense, and a lend's transfer charge)
    x("pur", 210, D.d4, "expense", 100, "a", { cat: "groceries", feeId: "c1" }),
    x("c1", 211, D.d4, "expense", 5, "a", { cat: "fees", feeOf: "pur", feeId: "c2" }),
    x("c2", 212, D.d4, "expense", 1, "a", { cat: "fees", feeOf: "c1" }),
    x("ldr5", 220, D.d4, "loan", 200, "k", { dir: "out", loan: "LL", principal: true, feeId: "lc1" }),
    x("lc1", 221, D.d4, "loan", 20, "k", { dir: "out", loan: "LL", principal: true, feeOf: "ldr5", feeId: "lc2" }),
    x("lc2", 222, D.d4, "loan", 2, "k", { dir: "out", loan: "LL", principal: true, feeOf: "lc1" }),
    // two on one entry
    x("pur2", 230, D.d4, "expense", 50, "a", { cat: "food", feeId: "c3" }),
    x("c3", 231, D.d4, "expense", 2, "a", { cat: "food", feeOf: "pur2" }),
    x("c4", 232, D.d4, "expense", 3, "a", { cat: "fees", feeOf: "pur2" }),
    // one-sided links, either way
    x("tr2", 240, D.d5, "transfer", 70, "a", { to: "k" }),
    x("c5", 241, D.d5, "expense", 4, "a", { cat: "fees", feeOf: "tr2" }),
    x("tr3", 250, D.d5, "transfer", 80, "a", { to: "k", feeId: "c6" }),
    x("c6", 251, D.d5, "expense", 6, "a", { cat: "fees" }),
    // amounts on top that can't be kept: on a payment or an expense, negative, text, too big, nothing
    x("bpay2", 260, D.d5, "loan", 50, "a", { dir: "out", loan: "BB", onTop: 5 }),
    x("eTop", 265, D.d5, "expense", 9, "a", { cat: "fun", onTop: 3 }),
    x("ldr6", 270, D.d5, "loan", 100, "k", { dir: "out", loan: "LL", principal: true, onTop: -5 }),
    x("ldr7", 271, D.d5, "loan", 100, "k", { dir: "out", loan: "LL", principal: true, onTop: "abc" }),
    x("ldr8", 272, D.d5, "loan", 100, "k", { dir: "out", loan: "LL", principal: true, onTop: 1e13 }),
    x("ldr9", 273, D.d5, "loan", 100, "k", { dir: "out", loan: "LL", principal: true, onTop: 0 }),
  ],
  loans: [
    loanOf("BB", "borrow", "Sam", "a", D.d1),
    loanOf("LL", "lend", "Rina", "k", D.d1),
    loanOf("L3", "lend", "Joy", "k", D.d2),
  ],
  assets: [],
};

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
  /* in the page: the notebook o read by migrate(), once and twice; balances() of the result now and at the start of
     each day; each loan's total from loanInfo() */
  const read = (o, days) =>
    page.evaluate(
      ([o, days]) => {
        const keep = S;
        try {
          const m = migrate(o),
            m2 = migrate(JSON.parse(JSON.stringify(m)));
          S = m;
          const bal = balances(),
            at = days.map(d => balances(d)),
            owed = Object.fromEntries(S.loans.map(l => [l.id, loanInfo(l).total]));
          return { m, m2, bal, at, owed };
        } finally {
          S = keep;
        }
      },
      [o, days]
    );
  const byId = (o, id) => o.txns.find(t => t.id === id);
  const sameMoney = (o, n) =>
    o.txns.every(t => {
      const u = byId(n, t.id);
      return u && u.amount === t.amount && u.account === t.account && u.date === t.date && u.type === t.type;
    }) && o.txns.length === n.txns.length;
  const sameBalances = (o, r, tag) => {
    const days = daysOf(o);
    ok(same(r.bal, refBalances(o)), tag + ": every balance as before " + J(r.bal));
    const off = days.filter((d, i) => !same(r.at[i], refBalances(o, d)));
    ok(!off.length, tag + ": every balance at the start of every day as before " + J(off));
  };

  // ---- 1. old data unchanged: a v7 save and a v7 backup
  {
    const r = await read(v7, daysOf(v7));
    ok(r.m.v === 8, "a v7 save comes up to version 8 (" + r.m.v + ")");
    ok(sameMoney(v7, r.m), "v7: every entry's amount, account, date and kind unchanged");
    const { v: _a, ...was } = v7,
      { v: _b, ...now } = r.m;
    ok(same(was, now), "v7: everything else exactly as saved, links kept " + (same(was, now) ? "" : J(r.m.txns)));
    sameBalances(v7, r, "v7");
    const fees = r.m.cats.find(c => c.id === "fees");
    ok(fees && fees.name === "Food" && !fees.hidden, "v7: Fees kept, still named Food " + J(fees));
    ok(
      ["t1", "bp1", "lp1"].every(id => byId(r.m, id).feeId === id + "f" && byId(r.m, id + "f").feeOf === id),
      "v7: the transfer's, the loan payment's and the lending payment's fees stay linked"
    );
    ok(byId(r.m, "e1").cat === "fees" && !byId(r.m, "e1").feeOf, "v7: the plain expense in Fees stays in Fees");
    ok(same(r.m, r.m2), "v7: migrating twice changes nothing more");
    const plan = await page.evaluate(t => {
      const p = restorePlan(t);
      return { n: p.n, notes: p.notes.filter(Boolean) };
    }, JSON.stringify(v7));
    ok(same(plan.n, r.m) && !plan.notes.length, "a v7 backup restores the same, with nothing to warn " + J(plan.notes));
    ok(!r.m.cats.some(c => "retired" in c), "the retired mark is never saved");
  }

  // ---- 2. the built-in Fees: older saves keep it, a new notebook has none, a v8 save keeps what it has
  {
    const v1 = {
      settings: { cur: "BDT" },
      accounts: [{ id: "a", name: "Cash", currency: "BDT", opening: 100 }],
      txns: [{ id: "f", date: D.d1, type: "expense", amount: 5, account: "a", cat: "fees", note: "" }],
    };
    const r = await read(v1, daysOf(v1));
    const ids = r.m.cats.map(c => c.id);
    ok(
      ids.includes("fees") &&
        ids.indexOf("fees") === ids.indexOf("family") + 1 &&
        ids.indexOf("fees") < ids.indexOf("other"),
      "a 1.0 save (no category list) keeps Fees in its place " + J(ids)
    );
    ok(byId(r.m, "f").cat === "fees" && r.bal.a === 95, "… with its Fees entry in it, balance kept");
    ok(same(r.m, r.m2), "… and migrating it twice changes nothing more");
    const v1c = {
      v: 1,
      settings: { cur: "BDT" },
      accounts: [{ id: "a", name: "Cash", currency: "BDT", opening: 100 }],
      cats: [
        { id: "fees", name: "Fees", e: "🏦", c: "#7A8190" },
        { id: "pets", name: "Pets", e: "🐶", c: "#123456" },
      ],
      txns: [{ id: "f", date: D.d1, type: "expense", amount: 5, account: "a", cat: "fees", note: "" }],
    };
    const ids1 = (await read(v1c, [])).m.cats.map(c => c.id);
    ok(
      ids1.indexOf("fees") < ids1.indexOf("other") && ids1.indexOf("pets") === ids1.indexOf("other") + 1,
      "a v1 save with its own categories keeps Fees, its own after Other " + J(ids1)
    );
    const mid = copy(v7);
    mid.v = 5;
    mid.cats = cats8;
    ok(
      (await read(mid, [])).m.cats.some(c => c.id === "fees"),
      "a save older than 8 without Fees gets it back, as every older version did"
    );
    const nb = await page.evaluate(() => [blank().v, blank().cats.map(c => c.id), migrate(null).cats.map(c => c.id)]);
    ok(nb[0] === 8 && !nb[1].includes("fees") && !nb[2].includes("fees"), "a new notebook has no Fees " + J(nb));
    ok(
      !(await read({ ...copy(v8), cats: cats8 }, [])).m.cats.some(c => c.id === "fees"),
      "a v8 save without Fees doesn't get it back"
    );
    for (const hidden of [true, false]) {
      const o = copy(v8);
      o.cats = cats7.map(c => (c.id === "fees" ? { ...c, hidden } : c));
      const f = (await read(o, [])).m.cats.find(c => c.id === "fees");
      ok(
        f && f.hidden === hidden && f.name === "Food",
        "a v8 save with Fees " + (hidden ? "hidden" : "shown") + " keeps it so"
      );
    }
    const removed = await page.evaluate(o => {
      const keep = S;
      S = migrate(o);
      F = { id: "fees" };
      removeCat();
      const f = S.cats.find(c => c.id === "fees");
      S = keep;
      save();
      return f;
    }, copy(v7));
    ok(removed && removed.hidden === true, "Remove on the retired Fees hides it, as any built-in, never deletes it");
  }

  // ---- 3. a v8 save with every add-on round-trips unchanged
  {
    const r = await read(v8, daysOf(v8));
    ok(same(r.m, v8), "v8 with every add-on: read back exactly as saved " + (same(r.m, v8) ? "" : J(r.m.txns)));
    ok(same(r.m, r.m2), "v8: migrating twice changes nothing more");
    sameBalances(v8, r, "v8");
    const plan = await page.evaluate(t => restorePlan(t).notes.filter(Boolean), JSON.stringify(v8));
    ok(!plan.length, "a v8 backup restores with nothing to warn " + J(plan));
  }

  // ---- 4. what isn't allowed is unlinked, with every amount, account, date and balance as it was
  {
    const r = await read(bad, daysOf(bad));
    const plain =
      "tr x1 bpay x2 ldr x3 inc x4 ldr2 x5 bdr2 x6 l3d x7 lpay x8 ldr3 x9 ldr4 x10 c2 lc2 c4 tr2 c5 tr3 c6".split(" ");
    const linked = plain.filter(id => byId(r.m, id).feeOf || byId(r.m, id).feeId);
    ok(!linked.length, "every link that isn't allowed is dropped from both ends " + J(linked));
    ok(
      byId(r.m, "c1").feeOf === "pur" && byId(r.m, "pur").feeId === "c1" && !byId(r.m, "c1").feeId,
      "a charge on a charge: the first stays its purchase's, the second is a plain expense"
    );
    ok(
      byId(r.m, "lc1").feeOf === "ldr5" && byId(r.m, "ldr5").feeId === "lc1" && !byId(r.m, "lc1").feeId,
      "a transfer charge on a lend's transfer charge: the first stays its draw's, the second is a draw"
    );
    ok(
      byId(r.m, "c3").feeOf === "pur2" && byId(r.m, "pur2").feeId === "c3",
      "two on one entry: the one it names stays"
    );
    ok(
      ["x6", "x7", "x8", "x10"].every(id => byId(r.m, id).principal === true && byId(r.m, id).type === "loan"),
      "an unlinked loan transfer charge stays a draw of its own loan"
    );
    ok(
      ["x1", "x2", "x3"].every(id => byId(r.m, id).type === "income" && byId(r.m, id).cat === "otherin") &&
        ["x4", "x5", "c2", "c4", "c5"].every(id => byId(r.m, id).type === "expense"),
      "an unlinked tip or charge stands as what it is, in its stored category"
    );
    const tops = r.m.txns.filter(t => "onTop" in t).map(t => t.id);
    ok(!tops.length, "onTop on a payment or an expense, negative, text, too big or 0 is dropped " + J(tops));
    ok(sameMoney(bad, r.m), "every entry kept, its amount, account, date and kind unchanged");
    sameBalances(bad, r, "unlinked");
    const owed = {};
    bad.txns.forEach(t => {
      if (t.type === "loan" && t.principal) owed[t.loan] = (owed[t.loan] || 0) + t.amount;
    });
    ok(same(r.owed, owed), "what each loan owes is unchanged " + J(r.owed));
    ok(same(r.m, r.m2), "unlinked: migrating twice changes nothing more");
  }

  // ---- 5. a purchase's charge takes its purchase's category
  {
    const o = copy(v8);
    byId(o, "pEc").cat = "fees";
    const r = await read(o, []);
    ok(byId(r.m, "pEc").cat === "food", "a purchase's charge in another category takes the purchase's (food)");
    ok(byId(r.m, "tAc").cat === "fees" && byId(r.m, "bPc").cat === "fees", "other charges keep theirs (fees)");
  }

  // ---- 6. an older Tally reads a v8 file without the links and onTop: every balance the same
  {
    const r8 = await read(v8, daysOf(v8)),
      old = asOlder(r8.m);
    const ro = await page.evaluate(
      ([o, days]) => {
        const keep = S;
        S = o; // as an older version holds it: no migrate() of ours in between
        const r = { bal: balances(), at: days.map(d => balances(d)) };
        S = keep;
        return r;
      },
      [old, daysOf(v8)]
    );
    ok(same(ro.bal, r8.bal), "an older version: the same balances " + J(ro.bal));
    ok(same(ro.at, r8.at), "an older version: the same balances at the start of every day");
  }

  // ---- 7. setAddOn(): makes, updates and removes an entry's add-on, with its account, date and category
  try {
    const r = await page.evaluate(
      ([o, d6]) => {
        const keep = S,
          out = {};
        S = migrate(o);
        const t = id => entry(id),
          snap = a => (a ? JSON.parse(JSON.stringify(a)) : null);
        try {
          // a transfer
          const tA = t("tA");
          out.trRemove = [setAddOn(tA, "charge", 0), !!addOnOf(tA), "feeId" in tA, S.txns.some(x => x.feeOf === "tA")];
          out.trMake = setAddOn(tA, "charge", 10);
          out.tr = snap(addOnOf(tA));
          out.trHost = [tA.feeId, tA.ts, tA.account, tA.date];
          out.isAddOn = [isAddOn(addOnOf(tA)), isAddOn(tA), isAddOn(t("lDc")), isAddOn(t("lD"))];
          tA.account = "k";
          tA.date = d6;
          const id0 = tA.feeId;
          out.trEdit = [setAddOn(tA, "charge", 12.3456), snap(addOnOf(tA)), id0];
          out.trWrong = [setAddOn(tA, "extra", 5), setAddOn(tA, "top", 5), snap(addOnOf(tA)).amount];
          // a purchase: its charge in its category, following it
          const pE = t("pE");
          pE.cat = "fun";
          out.pur = [setAddOn(pE, "charge", 150), snap(addOnOf(pE))];
          out.onCharge = [setAddOn(addOnOf(pE), "charge", 1), S.txns.filter(x => x.feeOf === "pEc").length];
          // a borrow's payment: a charge, never an extra
          const bP = t("bP");
          out.pay = [setAddOn(bP, "charge", 7), snap(addOnOf(bP)), setAddOn(bP, "extra", 2), setAddOn(bP, "top", 2)];
          // a lending payment: a new add-on is an extra; an older paid fee stays a charge
          const lP = t("lP");
          out.tipRemove = [setAddOn(lP, "extra", 0), !!addOnOf(lP), S.txns.some(x => x.id === "lPt")];
          out.tipCharge = setAddOn(lP, "charge", 4);
          out.tip = [setAddOn(lP, "extra", 60), snap(addOnOf(lP))];
          const lP0 = t("lP0");
          out.oldFee = [setAddOn(lP0, "charge", 4), snap(addOnOf(lP0))];
          out.otherKind = [setAddOn(lP0, "extra", 2), setAddOn(lP0, "extra", 0), snap(addOnOf(lP0))];
          out.oldFeeGone = [setAddOn(lP0, "charge", 0), !!addOnOf(lP0), setAddOn(lP0, "extra", 2), snap(addOnOf(lP0))];
          // a lend's draw: a linked loan entry for its transfer charge, onTop for its extra
          const lD = t("lD");
          out.lend = [setAddOn(lD, "charge", 120), snap(addOnOf(lD)), addOnOf(lD).id === "lDc"];
          out.lendTop = [setAddOn(lD, "top", 175.12345), lD.onTop, setAddOn(lD, "top", 0), "onTop" in lD];
          setAddOn(lD, "top", 150);
          out.lendExtra = setAddOn(lD, "extra", 5);
          // a borrow's draw: charges on top, never a linked charge
          const bD = t("bD");
          out.borrow = [setAddOn(bD, "charge", 5), !!addOnOf(bD), setAddOn(bD, "top", 90), bD.onTop];
          // an amount that isn't a number, or past what a field takes, changes nothing; only 0 or less removes
          out.badAmt = ["abc", NaN, null, undefined, Infinity, "5"].map(v => setAddOn(tA, "charge", v));
          out.badKept = snap(addOnOf(tA)).amount;
          out.bigTop = [
            setAddOn(bD, "top", 1e13),
            bD.onTop,
            setAddOn(t("lD"), "charge", 1e13),
            addOnOf(t("lD")).amount,
          ];
          out.negative = [setAddOn(pE, "charge", -1), !!addOnOf(pE)];
          // none on money received, a balance fix, or an add-on
          S.txns.push({
            id: "in1",
            ts: 900,
            date: d6,
            type: "income",
            amount: 5,
            account: "a",
            note: "",
            cat: "income",
          });
          S.txns.push({ id: "ad1", ts: 901, date: d6, type: "adjust", amount: 5, account: "a", note: "" });
          out.none = [t("in1"), t("ad1"), addOnOf(tA), addOnOf(lP), addOnOf(lD)].map(e =>
            ["charge", "extra", "top"].map(k => (e ? setAddOn(e, k, 3) : "missing"))
          );
          out.noneAdded = S.txns.filter(x => ["in1", "ad1"].includes(x.feeOf)).length;
          // what setAddOn() leaves, migrate() keeps as it is
          const now = JSON.parse(JSON.stringify(S));
          out.kept = [migrate(now).txns, now.txns];
        } finally {
          S = keep;
        }
        return out;
      },
      [copy(v8), D.d6]
    );
    ok(same(r.trRemove, [true, false, false, false]), "amount 0 removes the add-on and its link " + J(r.trRemove));
    ok(
      r.trMake === true &&
        same(r.tr, {
          id: r.trHost[0],
          ts: r.trHost[1] + 1,
          date: r.trHost[3],
          type: "expense",
          amount: 10,
          account: r.trHost[2],
          note: "",
          cat: "fees",
          feeOf: "tA",
        }),
      "a transfer's charge: an expense from its From account on its day, just after it, linked both ways " + J(r.tr)
    );
    ok(same(r.isAddOn, [true, false, true, false]), "isAddOn(): the add-ons, not their entries " + J(r.isAddOn));
    ok(
      r.trEdit[0] === true &&
        r.trEdit[1].id === r.trEdit[2] &&
        r.trEdit[1].amount === 12.346 &&
        r.trEdit[1].account === "k" &&
        r.trEdit[1].date === D.d6,
      "updating keeps its id and moves it with its entry's account and day " + J(r.trEdit)
    );
    ok(same(r.trWrong, [false, false, 12.346]), "no extra or amount on top on a transfer " + J(r.trWrong));
    ok(
      r.pur[0] === true && r.pur[1].cat === "fun" && r.pur[1].type === "expense",
      "a purchase's charge: its category " + J(r.pur)
    );
    ok(same(r.onCharge, [false, 0]), "no charge on a charge");
    ok(
      r.pay[0] === true &&
        r.pay[1].type === "expense" &&
        r.pay[1].cat === "fees" &&
        r.pay[2] === false &&
        r.pay[3] === false,
      "a loan payment's transfer charge, never an extra " + J(r.pay)
    );
    ok(same(r.tipRemove, [true, false, false]), "a tip removed");
    ok(r.tipCharge === false, "a lending payment gets no new charge (its new add-on is an extra)");
    ok(
      r.tip[0] === true &&
        r.tip[1].type === "income" &&
        r.tip[1].cat === "otherin" &&
        r.tip[1].amount === 60 &&
        r.tip[1].account === "k" &&
        r.tip[1].feeOf === "lP",
      "a tip on a lending payment: income into its account, Other " + J(r.tip)
    );
    ok(
      r.oldFee[0] === true && r.oldFee[1].id === "lP0f" && r.oldFee[1].type === "expense" && r.oldFee[1].amount === 4,
      "an older lending payment's paid fee stays a charge when changed " + J(r.oldFee)
    );
    ok(
      r.otherKind[0] === false &&
        r.otherKind[1] === true &&
        r.otherKind[2].id === "lP0f" &&
        r.otherKind[2].amount === 4,
      "an add-on of another kind is never replaced or removed by it " + J(r.otherKind)
    );
    ok(
      r.oldFeeGone[0] === true && !r.oldFeeGone[1] && r.oldFeeGone[2] === true && r.oldFeeGone[3].type === "income",
      "… and once removed, an extra can be added " + J(r.oldFeeGone)
    );
    ok(
      r.lend[0] === true &&
        r.lend[2] &&
        same(r.lend[1], {
          id: "lDc",
          ts: 301,
          date: D.d1,
          type: "loan",
          amount: 120,
          account: "k",
          note: "",
          dir: "out",
          loan: "L2",
          principal: true,
          feeOf: "lD",
        }),
      "a lend's transfer charge: a loan entry of the same lending, no due day " + J(r.lend)
    );
    ok(
      same(r.lendTop, [true, 175.123, true, false]),
      "a lend's extra: onTop, kept to 3 decimals, 0 removes it " + J(r.lendTop)
    );
    ok(r.lendExtra === false, "a lend's extra is its amount on top, not a linked entry");
    ok(same(r.borrow, [false, false, true, 90]), "a borrow: charges on top, never a linked charge " + J(r.borrow));
    ok(
      r.none.every(k => k.every(v => v === false)) && r.noneAdded === 0,
      "none on money received, a balance fix, or an add-on " + J(r.none)
    );
    ok(
      r.badAmt.every(v => v === false) && r.badKept === 12.346,
      "an amount that isn't a number changes nothing, never removes " + J(r.badAmt)
    );
    ok(same(r.bigTop, [false, 90, false, 120]), "an amount past what a field takes is refused " + J(r.bigTop));
    ok(same(r.negative, [true, false]), "an amount below 0 removes the add-on");
    ok(same(r.kept[0], r.kept[1]), "what setAddOn() leaves, migrate() keeps exactly");
  } catch (e) {
    ok(false, "setAddOn(): " + e.message.split("\n")[0]);
  }

  // ---- 8. deleting a lend's only draw deletes the lending with its transfer charge
  {
    const r = await page.evaluate(o => {
      const keep = S;
      S = migrate(o);
      try {
        deleteEntries(["lD"]);
        const one = {
          loan: S.loans.some(l => l.id === "L2"),
          left: S.txns.filter(t => t.loan === "L2").map(t => t.id),
        };
        S = migrate(o);
        S.txns.push({
          id: "lD2",
          ts: 330,
          date: "2026-04-20",
          type: "loan",
          amount: 400,
          account: "k",
          note: "",
          dir: "out",
          loan: "L2",
          principal: true,
        });
        deleteEntries(["lD"]);
        const two = {
          loan: S.loans.some(l => l.id === "L2"),
          left: S.txns.filter(t => t.loan === "L2").map(t => t.id),
        };
        return { one, two };
      } finally {
        S = keep;
      }
    }, copy(v8));
    ok(
      !r.one.loan && !r.one.left.length,
      "the lend's only draw deleted: the lending goes, its transfer charge too " + J(r.one)
    );
    ok(
      r.two.loan && !r.two.left.includes("lDc") && r.two.left.includes("lD2"),
      "one of two draws deleted: the lending stays, without that draw's transfer charge " + J(r.two)
    );
  }

  // ---- 9. a loan's due day from before version 6 goes on its draw, never on the draw's transfer charge
  {
    const v5 = {
      v: 5,
      settings: { cur: "BDT" },
      accounts: [acct("k", "Bkash", "wallet", "BDT", 20000)],
      txns: [
        x("c", 2, D.d1, "loan", 100, "k", { dir: "out", loan: "L", principal: true, feeOf: "d" }),
        x("d", 1, D.d1, "loan", 1000, "k", { dir: "out", loan: "L", principal: true, feeId: "c" }),
      ],
      loans: [{ ...loanOf("L", "lend", "Rafi", "k", D.d1), amount: 1000, due: D.due1 }],
    };
    const r = await read(v5, []);
    ok(
      byId(r.m, "d").due === D.due1 && !("due" in byId(r.m, "c")) && byId(r.m, "c").feeOf === "d",
      "v<6: the loan's due day goes on its draw, not on its transfer charge " + J(r.m.txns)
    );
    ok(same(r.m, r.m2), "… and migrating it twice changes nothing more");
  }

  ok(errors.length === 0, "no page errors " + J(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
