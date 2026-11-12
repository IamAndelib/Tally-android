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

/* what version 7's loanInfo() gave for each loan of the v7 save on the suites' day (2026-06-17): total, paid, left,
   rem, next due day, due amount and status */
const RECORDED7 = {
  B: [15000, 5000, 10000, { bd1: 5000, bd2: 5000 }, "2026-07-01", 5000, "partly"],
  L: [3000, 1500, 1500, { ld1: 500, ld2: 1000 }, "2026-07-01", 500, "partly"],
  W: [800, 300, 500, { wd: 500 }, "", 0, "writeoff"],
};
/* ---- the loanInfo() and runBal() of data version 7 (commit fa17d61), kept here exactly as they were (runBal without
   its cache): every loan recorded before version 8, which has no transfer charge on a draw and no onTop, must give
   exactly their results. Put into the page as loanInfo7() and runBal7(). */
const before8 = () => {
  window.loanInfo7 = function (l) {
    const mine = loanEntries(l.id);
    const draws = mine.filter(t => t.principal).sort(byOldest);
    const pays = mine.filter(t => !t.principal);
    const newest = draws[draws.length - 1],
      a = acc(newest ? newest.account : l.account),
      cur = a ? a.currency : S.settings.cur,
      owed = n => (shown(n, cur) > 0 ? rnd(n) : 0);
    const total = rnd(draws.reduce((s, t) => s + t.amount, 0)),
      paid = rnd(pays.reduce((s, t) => s + t.amount, 0)),
      left = owed(total - paid);
    const order = draws.slice().sort((x, y) => (x.due ? (y.due ? cmpDay(x.due, y.due) : -1) : y.due ? 1 : 0)),
      rem = {};
    draws.forEach(t => (rem[t.id] = t.amount));
    const take = (by, n) => {
      for (const t of order) {
        if (n <= 0) break;
        if (by && t.date > by) continue;
        const x = Math.min(rem[t.id], n);
        rem[t.id] = rnd(rem[t.id] - x);
        n = rnd(n - x);
      }
      return n;
    };
    let credit = 0;
    pays
      .slice()
      .sort(byOldest)
      .forEach(p => (credit = take(p.date, rnd(credit + p.amount))));
    take("", credit);
    draws.forEach(t => (rem[t.id] = owed(rem[t.id])));
    const owing = order.filter(t => rem[t.id] > 0),
      dueDraw = owing.find(t => t.due) || null,
      nextDue = dueDraw ? dueDraw.due : "",
      by = nextDue > today() ? nextDue : today(),
      dueAmt = rnd(owing.filter(t => t.due && t.due <= by).reduce((s, t) => s + rem[t.id], 0));
    const st =
      left <= 0
        ? "cleared"
        : l.status === "writeoff"
          ? "writeoff"
          : nextDue && nextDue < today()
            ? "overdue"
            : paid > 0
              ? "partly"
              : "active";
    return {
      draws,
      pays,
      total,
      paid,
      left,
      cur,
      rem,
      nextDue,
      dueDraw,
      dueAmt,
      st,
      open: st !== "cleared" && st !== "writeoff",
    };
  };
  window.runBal7 = function () {
    const b = openingBalances(),
      m = {},
      paid = {},
      amt = {},
      all = {};
    S.loans.forEach(l => {
      amt[l.id] = 0;
      paid[l.id] = 0;
      all[l.id] = 0;
    });
    S.txns.forEach(t => {
      if (t.type === "loan" && t.principal && t.loan in all) all[t.loan] += t.amount;
    });
    S.txns
      .slice()
      .sort(byOldest)
      .forEach(t => {
        if (!applyEntry(b, t)) return;
        const r = { a: rnd(b[t.account]), t: t.type === "transfer" && t.to in b ? rnd(b[t.to]) : null };
        if (t.type === "loan" && t.loan in amt) {
          if (t.principal) amt[t.loan] += t.amount;
          else {
            paid[t.loan] += t.amount;
            const owed = paid[t.loan] > amt[t.loan] + 0.0005 ? all[t.loan] : amt[t.loan];
            r.left = Math.max(0, rnd(owed - paid[t.loan]));
            if (shown(r.left, (acc(t.account) || {}).currency) <= 0) r.left = 0;
            r.ls = r.left <= 0 ? "cleared" : "partly";
          }
        }
        m[t.id] = r;
      });
    return m;
  };
};
/* ---- a varied v7 notebook of loans, the same every run (a seeded generator): 1 to 4 draws each, with and without due
   days (past, today's month, later), payments before, between and after them, part paid, paid off, paid over, thirds
   of a cent, written off and forgiven, in taka, dollars and yen (no decimals), on an archived account too, and older
   fees on payments */
function variedV7() {
  let seed = 20261107;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = list => list[Math.floor(rand() * list.length)];
  const day = n => {
    const d = new Date(Date.UTC(2026, 0, 1) + n * 864e5);
    return d.toISOString().slice(0, 10);
  };
  const amount = () =>
    pick([
      () => Math.round(rand() * 5000),
      () => Math.round(rand() * 500000) / 100,
      () => Math.round(rand() * 300000) / 1000,
      () => 33.333,
      () => 100,
    ])();
  const accounts = [
    acct("a", "Bank", "bank", "BDT", 50000),
    acct("k", "Bkash", "wallet", "BDT", 20000),
    acct("u", "Dollars", "savings", "USD", 1000),
    acct("y", "Yen", "cash", "JPY", 100000),
    { ...acct("z", "Old", "bank", "BDT", 0), archived: true },
  ];
  const txns = [],
    loans = [];
  let ts = 1;
  for (let n = 0; n < 120; n++) {
    const id = "V" + n,
      kind = rand() < 0.5 ? "lend" : "borrow",
      account = pick(["a", "k", "u", "y", "z"]),
      out = kind === "lend" ? "out" : "in",
      back = kind === "lend" ? "in" : "out",
      start = Math.floor(rand() * 200),
      draws = [];
    const nd = 1 + Math.floor(rand() * 4);
    for (let j = 0; j < nd; j++) {
      const date = day(start + Math.floor(rand() * 60) + j * 5),
        due = pick(["", "", day(start + Math.floor(rand() * 250)), day(160 + Math.floor(rand() * 60))]),
        t = x(id + "d" + j, ts++, date, "loan", amount(), account, { dir: out, loan: id, principal: true });
      if (due) t.due = due;
      draws.push(t);
      txns.push(t);
    }
    const total = draws.reduce((s, t) => s + t.amount, 0),
      np = Math.floor(rand() * 6),
      share = pick([0.3, 0.6, 1, 1, 1.2]);
    for (let j = 0; j < np; j++) {
      const date = day(start + Math.floor(rand() * 90)),
        amt = pick([() => Math.round(((total * share) / np) * 1000) / 1000, amount])(),
        p = x(id + "p" + j, ts++, date, "loan", amt || 1, account, { dir: back, loan: id });
      txns.push(p);
      if (rand() < 0.2) {
        p.feeId = p.id + "f";
        txns.push(x(p.id + "f", ts++, date, "expense", 5, account, { cat: "fees", feeOf: p.id }));
      }
    }
    loans.push(loanOf(id, kind, "P" + n, account, draws[0].date, rand() < 0.2 ? "writeoff" : "open"));
  }
  loans.push(loanOf("E", "lend", "Nobody", "k", day(10))); // a loan with no entries at all
  return { v: 7, settings, accounts, types: [], cats: cats7, txns, loans, assets: [] };
}

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

  /* ---- what is owed, the share-out and the worked-out parts (docs/specs/charges.md, "loanInfo() in version 8").
     In the page: the notebook o read by migrate(), then after each step (entries added, a loan's status set) what
     loanInfo() says of each loan, loanParts(), each payment's runBal() and the balances */
  const loanRun = (o, steps) =>
    page.evaluate(
      ([o, steps]) => {
        const keep = S,
          out = [];
        try {
          S = migrate(o);
          const look = () => {
            RBC = null;
            LPC = null;
            const info = {};
            S.loans.forEach(l => {
              const i = loanInfo(l);
              info[l.id] = {
                draws: i.draws.map(t => t.id),
                total: i.total,
                money: i.money,
                top: i.top,
                paid: i.paid,
                left: i.left,
                unpaid: i.unpaid,
                moneyLeft: i.moneyLeft,
                topLeft: i.topLeft,
                topPaid: i.topPaid,
                feeLeft: i.feeLeft,
                rem: i.rem,
                nextDue: i.nextDue,
                dueDraw: i.dueDraw && i.dueDraw.id,
                dueAmt: i.dueAmt,
                st: i.st,
              };
            });
            const rb = runBal(),
              pays = {};
            S.txns.forEach(t => {
              if (t.type === "loan" && !t.principal) pays[t.id] = { left: rb[t.id].left, ls: rb[t.id].ls };
            });
            return { info, parts: typeof loanParts === "function" ? loanParts() : null, pays, bal: balances() };
          };
          out.push(look());
          for (const s of steps) {
            if (s.add) S.txns.push(...JSON.parse(JSON.stringify(s.add)));
            if (s.status) loan(s.status[0]).status = s.status[1];
            out.push(look());
          }
          return out;
        } finally {
          S = keep;
          RBC = null;
          LPC = null;
        }
      },
      [o, steps]
    );
  const notebook = (txns, loans) => ({
    v: 8,
    settings,
    accounts: [acct("a", "Bank", "bank", "BDT", 50000), acct("k", "Bkash", "wallet", "BDT", 20000)],
    types: [],
    cats: cats8,
    txns,
    loans,
    assets: [],
  });
  /* Rafi: lent ৳1,000.00 from Bkash with a ৳100.00 transfer charge and a ৳150.00 extra; Sam: borrowed ৳1,000.00 into
     Bank with ৳100.00 of charges */
  const rafi = () => [
    x("rD", 300, D.d1, "loan", 1000, "k", { dir: "out", loan: "R", principal: true, onTop: 150, feeId: "rDc" }),
    x("rDc", 301, D.d1, "loan", 100, "k", { dir: "out", loan: "R", principal: true, feeOf: "rD" }),
  ];
  const sam = () => [x("sD", 200, D.d1, "loan", 1000, "a", { dir: "in", loan: "S", principal: true, onTop: 100 })];
  const back = (id, ts, date, amount, l = "R", account = "k", dir = "in") =>
    x(id, ts, date, "loan", amount, account, { dir, loan: l });
  const twoLoans = () =>
    notebook(rafi().concat(sam()), [loanOf("R", "lend", "Rafi", "k", D.d1), loanOf("S", "borrow", "Sam", "a", D.d1)]);
  const partsOf = (r, of) => r.parts && r.parts.filter(p => !of || of.includes(p.of));

  // ---- 10. a lend with a transfer charge and an extra, a borrow with charges
  try {
    const [r] = await loanRun(twoLoans(), []),
      R = r.info.R,
      Sm = r.info.S;
    ok(same(R.draws, ["rD"]), "a lend and its transfer charge are one draw " + J(R.draws));
    ok(
      R.total === 1250 && R.money === 1100 && R.top === 150 && R.left === 1250,
      "Rafi owes ৳1,250.00: ৳1,100.00 of money, ৳150.00 on top " + J(R)
    );
    ok(R.moneyLeft === 1100 && R.topLeft === 150 && R.rem.rD === 1250, "nothing paid yet: all of it left " + J(R));
    ok(r.bal.k === 20000 - 1100, "Bkash −৳1,100.00 " + r.bal.k);
    ok(Sm.total === 1100 && Sm.money === 1000 && Sm.top === 100 && Sm.left === 1100, "you owe Sam ৳1,100.00 " + J(Sm));
    ok(r.bal.a === 50000 + 1000, "Bank +৳1,000.00 " + r.bal.a);
    ok(same(r.parts, []), "nothing counts yet " + J(r.parts));
  } catch (e) {
    ok(false, "a lend's and a borrow's add-ons: " + e.message.split("\n")[0]);
  }

  // ---- 11. part paybacks, in order: the money first, the extra last
  try {
    const r = await loanRun(twoLoans(), [
      { add: [back("p1", 400, D.d2, 500)] },
      { add: [back("p2", 410, D.d3, 700)] },
      { add: [back("p3", 420, D.d4, 50)] },
      { add: [back("sp", 430, D.d4, 1100, "S", "a", "out")] },
    ]);
    const [, s1, s2, s3, s4] = r;
    ok(
      s1.info.R.moneyLeft === 600 && s1.info.R.topLeft === 150 && !(s1.info.R.topPaid.p1 > 0) && s1.info.R.left === 750,
      "৳500.00 back covers money only: ৳600.00 of it left, then the ৳150.00 extra " + J(s1.info.R)
    );
    ok(s1.info.R.st === "partly" && same(partsOf(s1), []), "… partly paid, nothing counted " + J(s1.parts));
    ok(
      s2.info.R.moneyLeft === 0 && s2.info.R.topLeft === 50 && s2.info.R.topPaid.p2 === 100 && s2.info.R.left === 50,
      "then ৳700.00 covers ৳600.00 of money and ৳100.00 of the extra " + J(s2.info.R)
    );
    ok(
      s3.info.R.topPaid.p3 === 50 && s3.info.R.topLeft === 0 && s3.info.R.left === 0 && s3.info.R.st === "cleared",
      "then ৳50.00 the rest of the extra, and it's cleared " + J(s3.info.R)
    );
    ok(
      same(partsOf(s3, ["p1", "p2", "p3"]), [
        { of: "p2", date: D.d3, cur: "BDT", amount: 100, as: "income" },
        { of: "p3", date: D.d4, cur: "BDT", amount: 50, as: "income" },
      ]),
      "loanParts(): income ৳100.00 and ৳50.00, on those days " + J(s3.parts)
    );
    ok(
      same(
        [s3.pays.p1, s3.pays.p2, s3.pays.p3],
        [
          { left: 750, ls: "partly" },
          { left: 50, ls: "partly" },
          { left: 0, ls: "cleared" },
        ]
      ),
      "each payback's own line: what was left after it, the extra included " + J(s3.pays)
    );
    ok(
      s4.info.S.left === 0 &&
        s4.info.S.topPaid.sp === 100 &&
        same(partsOf(s4, ["sp"]), [{ of: "sp", date: D.d4, cur: "BDT", amount: 100, as: "spend" }]),
      "the borrow's ৳1,100.00 payback: ৳100.00 of spending, on its day " + J(s4.parts)
    );
    ok(same(s4.pays.sp, { left: 0, ls: "cleared" }), "… and it clears the loan " + J(s4.pays.sp));
    ok(
      s4.bal.k === 20000 - 1100 + 1250 && s4.bal.a === 50000 + 1000 - 1100,
      "balances: Bkash and Bank as the money moved " + J(s4.bal)
    );
    const once = await loanRun(twoLoans(), [
      { add: [back("p", 400, D.d2, 1250), back("sp", 430, D.d4, 1000, "S", "a", "out")] },
    ]);
    ok(
      once[1].info.R.topPaid.p === 150 &&
        once[1].info.S.left === 100 &&
        !(once[1].info.S.topPaid.sp > 0) &&
        same(partsOf(once[1]), [{ of: "p", date: D.d2, cur: "BDT", amount: 150, as: "income" }]),
      "a ৳1,250.00 payback counts ৳150.00 as income; ৳1,000.00 of a borrow paid back counts none " + J(once[1].parts)
    );
  } catch (e) {
    ok(false, "part paybacks: " + e.message.split("\n")[0]);
  }

  // ---- 12. several draws with due days, and credit
  try {
    const joy = notebook(
      [
        // m1: ৳650.00 of money (৳50.00 charge) + ৳60.00, due later; m2: ৳420.00 + ৳40.00, due sooner; m3: ৳300.00 + ৳30.00
        x("m1", 300, D.d1, "loan", 600, "k", {
          dir: "out",
          loan: "M",
          principal: true,
          due: D.due2,
          onTop: 60,
          feeId: "m1c",
        }),
        x("m1c", 301, D.d1, "loan", 50, "k", { dir: "out", loan: "M", principal: true, feeOf: "m1" }),
        x("m2", 310, D.d2, "loan", 400, "k", {
          dir: "out",
          loan: "M",
          principal: true,
          due: D.due1,
          onTop: 40,
          feeId: "m2c",
        }),
        x("m2c", 311, D.d2, "loan", 20, "k", { dir: "out", loan: "M", principal: true, feeOf: "m2" }),
        x("m3", 320, D.d3, "loan", 300, "k", { dir: "out", loan: "M", principal: true, onTop: 30 }),
      ],
      [loanOf("M", "lend", "Joy", "k", D.d1)]
    );
    const [s0, s1, s2] = await loanRun(joy, [
      { add: [back("q1", 400, D.d4, 500, "M")] },
      { add: [back("q2", 410, D.d5, 650, "M")] },
    ]);
    ok(
      same(s0.info.M.draws, ["m1", "m2", "m3"]) &&
        s0.info.M.total === 1500 &&
        same(s0.info.M.rem, { m1: 710, m2: 460, m3: 330 }),
      "each draw owes its amount, its transfer charge and its amount on top " + J(s0.info.M)
    );
    ok(
      s0.info.M.nextDue === D.due1 && s0.info.M.dueDraw === "m2" && s0.info.M.dueAmt === 460,
      "what's due first includes its amount on top " + J(s0.info.M)
    );
    ok(
      same(s1.info.M.rem, { m1: 670, m2: 0, m3: 330 }) && s1.info.M.topPaid.q1 === 40,
      "a payment fills the draw due soonest (amount, charge, extra) before the next " + J(s1.info.M)
    );
    ok(
      s1.info.M.nextDue === D.due2 && s1.info.M.dueDraw === "m1" && s1.info.M.dueAmt === 670 && s1.info.M.left === 1000,
      "then the next due, with its extra " + J(s1.info.M)
    );
    ok(
      same(s2.info.M.rem, { m1: 20, m2: 0, m3: 330 }) &&
        s2.info.M.topPaid.q2 === 40 &&
        s2.info.M.moneyLeft === 300 &&
        s2.info.M.topLeft === 50 &&
        s2.info.M.dueAmt === 20,
      "a draw's extra is the last money paid back on it " + J(s2.info.M)
    );
    ok(
      same(
        partsOf(s2).map(p => [p.of, p.amount, p.as]),
        [
          ["q1", 40, "income"],
          ["q2", 40, "income"],
        ]
      ),
      "each payment's extra counts on its own day " + J(s2.parts)
    );
    // a payment before a later draw is credit for it, as before
    const cr = notebook(
      [
        x("c1", 300, D.d1, "loan", 500, "k", { dir: "out", loan: "C", principal: true, onTop: 50 }),
        back("cp", 310, D.d2, 800, "C"),
        x("c2", 320, D.d3, "loan", 400, "k", { dir: "out", loan: "C", principal: true, onTop: 40, feeId: "c2c" }),
        x("c2c", 321, D.d3, "loan", 10, "k", { dir: "out", loan: "C", principal: true, feeOf: "c2" }),
      ],
      [loanOf("C", "lend", "Ana", "k", D.d1)]
    );
    const [c] = await loanRun(cr, []);
    // credit that covers a later draw's extra counts on that draw's day: nothing is earned before it was lent
    const late = notebook(
      [
        x("e1", 300, D.d1, "loan", 500, "k", { dir: "out", loan: "E", principal: true, onTop: 50 }),
        back("ep", 310, D.d2, 1000, "E"),
        x("e2", 320, D.d3, "loan", 400, "k", { dir: "out", loan: "E", principal: true, onTop: 40 }),
      ],
      [loanOf("E", "lend", "Ana", "k", D.d1)]
    );
    const [e] = await loanRun(late, []);
    ok(
      e.info.E.topPaid.ep === 90 &&
        same(e.parts, [
          { of: "ep", date: D.d2, cur: "BDT", amount: 50, as: "income" },
          { of: "ep", date: D.d3, cur: "BDT", amount: 40, as: "income", at: "e2" },
        ]),
      "a payment made before a later draw: its ৳50.00 extra on the payment's day, the later ৳40.00 on its draw's day " +
        "(at: the draw, for History's heading) " +
        J(e.parts)
    );
    ok(
      same(c.info.C.rem, { c1: 0, c2: 200 }) &&
        c.info.C.total === 1000 &&
        c.info.C.left === 200 &&
        c.info.C.moneyLeft === 160 &&
        c.info.C.topLeft === 40 &&
        c.info.C.topPaid.cp === 50,
      "a payment before a later draw: what's over is credit for it, its money first " + J(c.info.C)
    );
  } catch (e) {
    ok(false, "several draws: " + e.message.split("\n")[0]);
  }

  // ---- 13. writing off, reopening, forgiving
  try {
    const wo = paid =>
      loanRun(twoLoans(), [
        { add: [back("w1", 400, D.d2, paid), back("sw", 430, D.d2, 600, "S", "a", "out")] },
        { status: ["R", "writeoff"] },
        { status: ["R", "open"] },
        { status: ["S", "writeoff"] },
      ]);
    const [, , a1] = await wo(1000);
    ok(
      a1.info.R.st === "writeoff" && a1.info.R.left === 100 && same(a1.info.R.feeLeft, { rD: 100 }),
      "written off after ৳1,000.00 back: ৳100.00 let go, the transfer charge unpaid " + J(a1.info.R)
    );
    ok(
      same(partsOf(a1, ["rD", "rDc", "w1"]), [{ of: "rD", date: D.d1, cur: "BDT", amount: 100, as: "spend" }]),
      "… its transfer charge counts as spending on the lend's day, the extra is gone " + J(a1.parts)
    );
    const [, , b1, b2, b3] = await wo(500);
    ok(
      b1.info.R.left === 600 &&
        same(partsOf(b1, ["rD", "rDc", "w1"]), [{ of: "rD", date: D.d1, cur: "BDT", amount: 100, as: "spend" }]),
      "written off after ৳500.00 back: ৳100.00 of spending, ৳600.00 let go " + J(b1)
    );
    ok(
      b2.info.R.st === "partly" && b2.info.R.left === 750 && same(partsOf(b2, ["rD", "rDc", "w1"]), []),
      "reopened: nothing counted, ৳750.00 left " + J(b2.info.R)
    );
    ok(
      b3.info.S.st === "writeoff" && b3.info.S.left === 400 && same(partsOf(b3, ["sD", "sw"]), []),
      "a borrow forgiven after ৳600.00 back: ৳400.00 let go, its charges never spending " + J(b3.info.S)
    );
    ok(b1.info.R.unpaid === 750, "… while ৳750.00 in all is unpaid, the extra included " + J(b1.info.R));
    const [, , all] = await wo(1100);
    ok(
      all.info.R.st === "writeoff" &&
        all.info.R.left === 0 &&
        all.info.R.unpaid === 150 &&
        same(partsOf(all, ["rD", "rDc", "w1"]), []),
      "written off with all the money back, the extra not: still written off, ৳0.00 let go, nothing counted " +
        J(all.info.R)
    );
    // reopening says what is owed again: everything unpaid, the extra included
    const said = await page.evaluate(
      o => {
        const keep = S,
          snack0 = snack;
        let msg = "";
        try {
          S = migrate(o);
          snack = m => (msg = m);
          reopenLoan("R");
          return [msg, loan("R").status];
        } finally {
          snack = snack0;
          S = keep;
          save();
          render();
        }
      },
      notebook(rafi().concat([back("w1", 400, D.d2, 500)]), [loanOf("R", "lend", "Rafi", "k", D.d1, "writeoff")])
    );
    const m750 = await page.evaluate(() => money(750, "BDT"));
    ok(
      said[1] === "open" && said[0].includes(m750),
      "reopening Rafi's lending written off after ৳500.00 back: owes ৳750.00 again " + J(said)
    );
  } catch (e) {
    ok(false, "write-off: " + e.message.split("\n")[0]);
  }

  // ---- 13b. deleting a draw: what the others owe, transfer charge and extra included, must cover what was paid back
  try {
    const o = notebook(
      rafi().concat([
        x("rD2", 310, D.d2, "loan", 500, "k", { dir: "out", loan: "R", principal: true }),
        back("rp", 400, D.d3, 1200),
      ]),
      [loanOf("R", "lend", "Rafi", "k", D.d1)]
    );
    const r = await page.evaluate(o => {
      const keep = S;
      try {
        S = migrate(o);
        return [loanBlock(["rD2"]), loanBlock(["rD"])];
      } finally {
        S = keep;
      }
    }, o);
    ok(r[0] === "", "the other draw may go: Rafi's ৳1,250.00 still covers the ৳1,200.00 paid back " + J(r));
    ok(r[1] !== "", "… but not the lend itself: ৳500.00 left against ৳1,200.00 paid back " + J(r));
    // a transfer charge taken off on its own: what is left must still cover what was paid back
    const fee = paid =>
      page.evaluate(
        o => {
          const keep = S;
          try {
            S = migrate(o);
            return loanBlock(["rDc"]);
          } finally {
            S = keep;
          }
        },
        notebook(
          [
            x("rD", 300, D.d1, "loan", 1000, "k", { dir: "out", loan: "R", principal: true, feeId: "rDc" }),
            x("rDc", 301, D.d1, "loan", 100, "k", { dir: "out", loan: "R", principal: true, feeOf: "rD" }),
            x("rD2", 310, D.d2, "loan", 500, "k", { dir: "out", loan: "R", principal: true }),
            back("rp", 400, D.d3, paid),
          ],
          [loanOf("R", "lend", "Rafi", "k", D.d1)]
        )
      );
    const f1600 = await fee(1600),
      f1500 = await fee(1500);
    ok(
      f1600 !== "",
      "a transfer charge alone can't go when ৳1,500.00 left would be less than ৳1,600.00 paid " + J(f1600)
    );
    ok(f1500 === "", "… and can when what is left still covers it (৳1,500.00 paid) " + J(f1500));
  } catch (e) {
    ok(false, "loanBlock(): " + e.message.split("\n")[0]);
  }

  // ---- 14. old data: every loan recorded before version 8 gives exactly what version 7 gave
  try {
    await page.evaluate(before8);
    const compare = o =>
      page.evaluate(o => {
        const keep = S;
        try {
          S = migrate(o);
          RBC = LPC = null;
          const pick = i => ({
            draws: i.draws.map(t => t.id),
            pays: i.pays.map(t => t.id),
            total: i.total,
            paid: i.paid,
            left: i.left,
            cur: i.cur,
            rem: i.rem,
            nextDue: i.nextDue,
            dueDraw: i.dueDraw && i.dueDraw.id,
            dueAmt: i.dueAmt,
            st: i.st,
            open: i.open,
          });
          const now = {},
            was = {};
          S.loans.forEach(l => {
            now[l.id] = pick(loanInfo(l));
            was[l.id] = pick(loanInfo7(l));
          });
          const rb = runBal(),
            rb7 = runBal7();
          return {
            now,
            was,
            rbSame: JSON.stringify(rb) === JSON.stringify(rb7),
            parts: typeof loanParts === "function" ? loanParts() : null,
            n: S.loans.length,
          };
        } finally {
          S = keep;
          RBC = null;
          LPC = null;
        }
      }, o);
    const r7 = await compare(copy(v7));
    ok(same(r7.now, r7.was), "v7 notebook: every loan's loanInfo() exactly as version 7's " + J(r7.now));
    ok(r7.rbSame && same(r7.parts, []), "v7 notebook: each payment's runBal() the same, nothing worked out");
    /* recorded from version 7 on the suites' day (2026-06-17); on another day the status and dues move with it */
    if ((await page.evaluate(() => today())) === "2026-06-17")
      ok(
        same(
          Object.fromEntries(
            Object.entries(r7.now).map(([k, i]) => [k, [i.total, i.paid, i.left, i.rem, i.nextDue, i.dueAmt, i.st]])
          ),
          RECORDED7
        ),
        "v7 notebook: total, paid, left, rem, next due, due amount and status as recorded from version 7"
      );
    const vr = variedV7(),
      rv = await compare(vr);
    const off = Object.keys(rv.was).filter(id => !same(rv.now[id], rv.was[id]));
    ok(
      rv.n === vr.loans.length && !off.length,
      "a varied v7 notebook (" +
        rv.n +
        " loans): every loanInfo() exactly as version 7's " +
        J(off.slice(0, 3).map(id => [rv.now[id], rv.was[id]]))
    );
    const sts = new Set(Object.values(rv.was).map(i => i.st));
    ok(
      ["active", "partly", "overdue", "cleared", "writeoff"].every(s => sts.has(s)),
      "… with every status among them " + J([...sts])
    );
    ok(rv.rbSame, "… each payment's runBal() the same");
    ok(same(rv.parts, []), "… and nothing worked out as income or spending " + J(rv.parts && rv.parts.slice(0, 3)));
  } catch (e) {
    ok(false, "old data: " + e.message.split("\n")[0]);
  }

  /* ---- the counting rule (docs/specs/charges.md, "Counting"): one notebook with every add-on, in two currencies.
     What each day spent and received is worked out here by hand from the entries (SPENT, GOT, BY); every total in the
     page must give exactly that: spentOn(), the widget, the morning check, Home's figures and the ring's sums, the
     entries sheet's day totals, History's month and day headings (default, Spent and Received), the Spent and
     Received filters' rows, and Summary's every tab. */
  const T0 = await page.evaluate(() => today()),
    dd = n => {
      const [y, m, d] = T0.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    };
  const countBook = () => ({
    v: 8,
    settings: { ...settings, lastCheck: dd(0) },
    accounts: [
      acct("a", "Bank", "bank", "BDT", 50000),
      acct("k", "Bkash", "wallet", "BDT", 20000),
      acct("c", "Card", "card", "BDT", 0),
      acct("u", "Dollars", "savings", "USD", 1000),
      acct("w", "Wallet", "wallet", "USD", 0),
    ],
    types: [],
    cats: cats7, // Fees renamed "Food": no charge may ever count under it
    txns: [
      // Sam: borrowed ৳1,000.00 with ৳100.00 of charges; Rafi: lent ৳1,000.00 + ৳100.00 transfer charge + ৳150.00
      // extra; Lee: borrowed $500.00 with $25.00 of charges
      x("sD", 100, dd(-6), "loan", 1000, "a", { dir: "in", loan: "S", principal: true, onTop: 100 }),
      x("rD", 110, dd(-6), "loan", 1000, "k", { dir: "out", loan: "R", principal: true, onTop: 150, feeId: "rDc" }),
      x("rDc", 111, dd(-6), "loan", 100, "k", { dir: "out", loan: "R", principal: true, feeOf: "rD" }),
      x("eD", 120, dd(-6), "loan", 500, "u", { dir: "in", loan: "E", principal: true, onTop: 25 }),
      // Mia: lent ৳2,000.00; Joy: lent ৳500.00 + ৳20.00 transfer charge, then written off
      x("mD", 200, dd(-5), "loan", 2000, "a", { dir: "out", loan: "M", principal: true }),
      x("jD", 210, dd(-5), "loan", 500, "k", { dir: "out", loan: "J", principal: true, feeId: "jDc" }),
      x("jDc", 211, dd(-5), "loan", 20, "k", { dir: "out", loan: "J", principal: true, feeOf: "jD" }),
      // a day with only a payback: no total
      x("rP1", 300, dd(-4), "loan", 500, "k", { dir: "in", loan: "R" }),
      // Rafi's ৳750.00 covers the last ৳600.00 of money and the ৳150.00 extra; Joy's ৳200.00 with an older paid fee
      x("rP2", 400, dd(-3), "loan", 750, "k", { dir: "in", loan: "R" }),
      x("jP", 410, dd(-3), "loan", 200, "k", { dir: "in", loan: "J", feeId: "jPf" }),
      x("jPf", 411, dd(-3), "expense", 3, "k", { cat: "fees", feeOf: "jP" }),
      // Sam paid back ৳1,100.00 (his ৳100.00 charges) with a ৳5.00 transfer charge; $20.00 of fun with a $2.00 charge
      x("sP", 500, dd(-2), "loan", 1100, "a", { dir: "out", loan: "S", feeId: "sPc" }),
      x("sPc", 501, dd(-2), "expense", 5, "a", { cat: "fees", feeOf: "sP" }),
      x("uE", 510, dd(-2), "expense", 20, "u", { cat: "fun", feeId: "uEc" }),
      x("uEc", 511, dd(-2), "expense", 2, "u", { cat: "fun", feeOf: "uE" }),
      // dinner ৳1,000.00 + ৳150.00 charge; Mia paid back with a ৳200.00 tip; a plain expense in Fees ("Food")
      x("pE", 600, dd(-1), "expense", 1000, "c", { cat: "food", feeId: "pEc" }),
      x("pEc", 601, dd(-1), "expense", 150, "c", { cat: "food", feeOf: "pE" }),
      x("mP", 610, dd(-1), "loan", 2000, "a", { dir: "in", loan: "M", feeId: "mPt" }),
      x("mPt", 611, dd(-1), "income", 200, "a", { cat: "otherin", feeOf: "mP" }),
      x("e1", 620, dd(-1), "expense", 300, "c", { cat: "fees" }),
      // yesterday too: $50.00 moved with a $1.00 charge
      x("uT", 630, dd(-1), "transfer", 50, "u", { to: "w", feeId: "uTc" }),
      x("uTc", 631, dd(-1), "expense", 1, "u", { cat: "fees", feeOf: "uT" }),
      // a transfer with a ৳10.00 charge, pay, groceries; Lee paid back $525.00
      x("tA", 700, dd(0), "transfer", 1000, "a", { to: "k", feeId: "tAc" }),
      x("tAc", 701, dd(0), "expense", 10, "a", { cat: "fees", feeOf: "tA" }),
      x("i1", 710, dd(0), "income", 40000, "a", { cat: "income" }),
      x("g1", 720, dd(0), "expense", 50, "a", { cat: "groceries" }),
      x("eP", 740, dd(0), "loan", 525, "u", { dir: "out", loan: "E" }),
    ],
    loans: [
      loanOf("S", "borrow", "Sam", "a", dd(-6)),
      loanOf("R", "lend", "Rafi", "k", dd(-6)),
      loanOf("E", "borrow", "Lee", "u", dd(-6)),
      loanOf("M", "lend", "Mia", "a", dd(-5)),
      loanOf("J", "lend", "Joy", "k", dd(-5), "writeoff"),
    ],
    assets: [],
  });
  /* by hand: what each day spent and received, per currency, and the period's spending by part */
  const SPENT = {
    BDT: { [dd(-5)]: 20, [dd(-3)]: 3, [dd(-2)]: 105, [dd(-1)]: 1450, [dd(0)]: 60 },
    USD: { [dd(-2)]: 22, [dd(-1)]: 1, [dd(0)]: 25 },
  };
  const GOT = { BDT: { [dd(-3)]: 150, [dd(-1)]: 200, [dd(0)]: 40000 }, USD: {} };
  const BY = { BDT: { food: 1150, fees: 300, groceries: 50, _charges: 138 }, USD: { fun: 22, _charges: 26 } };
  const DAYS = [-6, -5, -4, -3, -2, -1, 0].map(dd),
    CURS = ["BDT", "USD"];
  const sumIn = (m, s, e) =>
    Math.round(
      Object.entries(m)
        .filter(([d]) => d >= s && d <= e)
        .reduce((q, [, v]) => q + v, 0) * 1000
    ) / 1000;
  const monthsOf = days => [...new Set(days.map(d => d.slice(0, 7)))];
  /* in the page: the notebook o made the state, and every total it shows */
  const totals = o =>
    page.evaluate(
      ([o, days, curs]) => {
        const keep = S,
          keepV = { ...V },
          keepHF = HF,
          keepHP = { ...HP },
          keepRing = window.ringHTML,
          keepW = Android.setWidget;
        const out = { spentOn: {}, home: {}, homeDay: {}, entries: [], hist: {}, rows: {}, sm: {}, check: {} };
        try {
          S = migrate(o);
          RBC = LPC = null;
          let ring = null;
          window.ringHTML = (c, r) => ((ring = r.mode === "home" ? r : ring), keepRing(c, r));
          curs.forEach(c => (out.spentOn[c] = Object.fromEntries(days.map(d => [d, spentOn(d, c)]))));
          /* the widget and the morning check */
          let w = null;
          Android.setWidget = j => (w = JSON.parse(j));
          lastWidget = "";
          syncWidget();
          out.widget = w && w.spent;
          out.yWords = T("home.checkYesterday", { amount: "{A}" });
          curs.forEach(c => {
            const box = document.createElement("div");
            box.innerHTML = checkCard(balances(), c);
            out.check[c] = box.textContent;
          });
          /* Home: the whole week, then each day, in each currency */
          V.screen = "home";
          const home = () => {
            ring = null;
            render();
            const by = {};
            Object.entries(ring.by).forEach(([k, v]) => v && (by[k] = rnd(v)));
            return { spent: ring.spent, got: ring.got, by, hole: $(".dcenter").textContent };
          };
          curs.forEach(c => {
            V.cur = c;
            Object.assign(V, { period: "range", rs: days[0], re: days[days.length - 1] });
            out.home[c] = home();
            out.homeDay[c] = {};
            days.forEach(d => {
              Object.assign(V, { period: "day", anchor: d });
              out.homeDay[c][d] = home();
            });
          });
          /* the entries sheet's day totals, for the whole week */
          V.cur = null;
          Object.assign(V, { period: "range", rs: days[0], re: days[days.length - 1] });
          render();
          entriesSheet();
          out.entries = [...document.querySelectorAll("#sheet .day")].map(e => [
            e.firstElementChild.textContent,
            e.lastElementChild.textContent.replace(/\u2060/g, ""),
          ]);
          closeSheet();
          /* History's headings and rows, in each view */
          const col = e => [...e.querySelectorAll(".hcl")].map(l => l.textContent.replace(/⁠/g, ""));
          ["", "out", "in"].forEach(k => {
            openHistory(k ? { kind: k } : {});
            out.hist[k] = {
              mon: [...document.querySelectorAll("#app .hmon")].map(e => [e.firstElementChild.textContent, col(e)]),
              day: [...document.querySelectorAll("#app .dayh")].map(e => [e.firstElementChild.textContent, col(e)]),
            };
            out.rows[k] = [...document.querySelectorAll("#app .tx[data-v]")].map(e => e.dataset.v).sort();
          });
          /* how History names its headings, and the figures they should show (from the hand-made tables) */
          out.dayTitle = Object.fromEntries(days.map(d => [d, capFirst(dayLabel(d))]));
          out.monTitle = Object.fromEntries(days.map(d => [d.slice(0, 7), capFirst(monthLabel(d.slice(0, 7), true))]));
          out.fmt = curs.map(c => [
            c,
            ...[signed(1234.5, c), signed(-1234.5, c), money(1234.5, c)].map(t => t.replace(/\u2060/g, "")),
          ]);
          /* Summary: each tab in each currency */
          V.screen = "home";
          render();
          curs.forEach(c => {
            summarySheet();
            SM.cur = c;
            SM.end = days[days.length - 1];
            const tab = m => {
              SM.mode = m;
              SM.sel = null;
              return smBuckets().map(b => [b.s, b.e, b.v, catSplit(b.list)]);
            };
            SM.mode = "y";
            smRender();
            out.sm[c] = { d: tab("d"), w: tab("w"), m: tab("m"), y: $("#sm .big.spent").textContent };
            closeSheet();
          });
          out.charges = CHARGES;
          return out;
        } finally {
          S = keep;
          Object.assign(V, keepV);
          HF = keepHF;
          Object.assign(HP, keepHP);
          window.ringHTML = keepRing;
          Android.setWidget = keepW;
          lastWidget = "";
          RBC = LPC = null;
          closeSheet();
          render();
        }
      },
      [o, DAYS, CURS]
    );
  /* the column a heading should show, from the hand-made tables: + received over − spent, each currency (the main one
     first) on its own line, nothing that is 0 */
  const fmtOf = r => Object.fromEntries(r.fmt.map(([c, p, m, b]) => [c, { p, m, b }]));
  const fig = (r, c, n, sign) => {
    const f = fmtOf(r)[c],
      t = sign > 0 ? f.p : f.m;
    return t.replace(/1,234\.50/, Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 }));
  };
  const plain = (r, c, n) =>
    fmtOf(r)[c].b.replace(/1,234\.50/, Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 }));
  const column = (r, s, e, kinds) => {
    const out = [];
    if (kinds.includes("in")) CURS.forEach(c => sumIn(GOT[c], s, e) && out.push(fig(r, c, sumIn(GOT[c], s, e), 1)));
    if (kinds.includes("out"))
      CURS.forEach(c => sumIn(SPENT[c], s, e) && out.push(fig(r, c, sumIn(SPENT[c], s, e), -1)));
    return out;
  };
  const monEnd = m => {
    const [y, mo] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  };
  const checkHeads = (r, view, kinds, tag) => {
    const h = r.hist[view];
    const mons = monthsOf(DAYS)
      .slice()
      .reverse()
      .map(m => [r.monTitle[m], column(r, m + "-01", monEnd(m), kinds)]);
    ok(same(h.mon, mons), tag + ": month headings " + J(h.mon) + " want " + J(mons));
    const days = DAYS.slice()
      .reverse()
      .filter(d => h.day.some(x => x[0] === r.dayTitle[d]))
      .map(d => [r.dayTitle[d], column(r, d, d, kinds)]);
    ok(same(h.day, days) && days.length === h.day.length, tag + ": day headings " + J(h.day) + " want " + J(days));
  };

  // ---- 15. every total follows the counting rule
  try {
    const r = await totals(countBook());
    ok(r.charges === "_charges", "CHARGES is a key no category id can be (" + r.charges + ")");
    ok(
      same(r.spentOn, Object.fromEntries(CURS.map(c => [c, Object.fromEntries(DAYS.map(d => [d, SPENT[c][d] || 0]))]))),
      "spentOn(): each day's spending, charges and worked-out spending included " + J(r.spentOn)
    );
    ok(
      r.widget === plain(r, "BDT", SPENT.BDT[dd(0)]),
      "the widget: spent today ৳60.00, the transfer's charge in it " + r.widget
    );
    const yWords = (c, n) => r.yWords.replace("{A}", plain(r, c, n));
    ok(
      r.check.BDT.includes(yWords("BDT", 1450)) && r.check.USD.includes(yWords("USD", 1)),
      "the morning check: yesterday ৳1,450.00 (the dinner's charge and the plain Fees expense in it), and $1.00 (a " +
        "transfer's charge, alone) " +
        J([r.check.BDT, r.check.USD])
    );
    CURS.forEach(c => {
      const h = r.home[c],
        s = sumIn(SPENT[c], DAYS[0], dd(0)),
        g = sumIn(GOT[c], DAYS[0], dd(0));
      ok(h.spent === s && h.got === g, "Home, " + c + ": spent " + s + ", received " + g + " " + J([h.spent, h.got]));
      ok(
        same(h.by, BY[c]),
        "Home, " +
          c +
          ": the ring's sums, a purchase's charge in its category, the rest in CHARGES, nothing under Food " +
          J(h.by)
      );
      const n = v => Number(v).toLocaleString("en-US");
      ok(h.hole.includes(n(s)) && (!g || h.hole.includes(n(g))), "Home, " + c + ": the hole shows them " + h.hole);
      const off = DAYS.filter(
        d => r.homeDay[c][d].spent !== (SPENT[c][d] || 0) || r.homeDay[c][d].got !== (GOT[c][d] || 0)
      );
      ok(
        !off.length,
        "Home, " + c + ", day by day: spent and received as by hand " + J(off.map(d => [d, r.homeDay[c][d]]))
      );
    });
    ok(
      !Object.keys(r.home.BDT.by).some(k => k === "otherin" || k === "income"),
      "extras count as received only, never on the ring " + J(r.home.BDT.by)
    );
    const ent = DAYS.slice()
      .reverse()
      .filter(d => r.entries.some(e => e[0] === r.dayTitle[d]))
      .map(d => [
        r.dayTitle[d],
        CURS.filter(c => SPENT[c][d])
          .map(c => fig(r, c, SPENT[c][d], -1))
          .join(" · "),
      ]);
    ok(
      same(r.entries, ent) && ent.length === 7,
      "the entries sheet's day totals count what is inside their rows " + J(r.entries)
    );
    checkHeads(r, "", ["in", "out"], "History");
    ok(
      same(
        r.hist[""].day.find(x => x[0] === r.dayTitle[dd(-4)]),
        [r.dayTitle[dd(-4)], []]
      ),
      "a day with only a payback has no total"
    );
    checkHeads(r, "out", ["out"], "Spent");
    checkHeads(r, "in", ["in"], "Received");
    ok(
      same(r.rows.out, ["e1", "eP", "g1", "jD", "jP", "pE", "sP", "tA", "uE", "uT"]),
      "Spent lists the spending and the entries carrying spending inside them (charges, charges paid back, a written-off lend) " +
        J(r.rows.out)
    );
    ok(
      same(r.rows.in, ["i1", "mP", "rP2"]),
      "Received lists money received and the paybacks carrying an extra " + J(r.rows.in)
    );
    CURS.forEach(c => {
      const sm = r.sm[c];
      const off = ["d", "w", "m"].flatMap(k =>
        sm[k].filter(([s, e, v]) => v !== sumIn(SPENT[c], s, e)).map(b => [k, b[0], b[1], b[2]])
      );
      ok(!off.length, "Summary, " + c + ": every bar of Days, Weeks and Months as by hand " + J(off));
      const yr = sumIn(SPENT[c], dd(0).slice(0, 4) + "-01-01", dd(0).slice(0, 4) + "-12-31");
      ok(sm.y === plain(r, c, yr), "Summary, " + c + ": the Year tab's total " + sm.y);
    });
    const month = r.sm.BDT.m.find(([s, e]) => s <= dd(-1) && dd(-1) <= e)[3];
    ok(
      (month.find(([k]) => k === "food") || [])[1] === 1150 && (month.find(([k]) => k === "fees") || [])[1] === 300,
      "Summary's categories: the dinner's charge in Eating out, nothing more under Food " + J(month)
    );
  } catch (e) {
    ok(false, "the counting rule: " + e.message.split("\n")[0]);
  }

  // ---- 16. a lend's transfer charge is lent money: never spending while the lending is open
  try {
    const o = countBook();
    o.loans.find(l => l.id === "J").status = "open";
    const r = await totals(o);
    ok(
      r.spentOn.BDT[dd(-5)] === 0,
      "Joy's lending open: its ৳20.00 transfer charge isn't spending " + r.spentOn.BDT[dd(-5)]
    );
    ok(r.home.BDT.spent === 1618 && r.home.BDT.by._charges === 118, "… nor on Home " + J(r.home.BDT));
    ok(
      same(
        r.hist[""].day.find(x => x[0] === r.dayTitle[dd(-5)]),
        [r.dayTitle[dd(-5)], []]
      ) && !r.rows.out.includes("jD"),
      "… nor in History, nor among Spent's rows " + J(r.rows.out)
    );
  } catch (e) {
    ok(false, "an open lending's transfer charge: " + e.message.split("\n")[0]);
  }

  // ---- 17. old data: every total goes up by exactly the fees already recorded, and no balance moves
  try {
    const cur7 = t => (t.account === "u" ? "USD" : "BDT"),
      days7 = daysOf(v7).slice(0, -1),
      ref = { old: { BDT: {}, USD: {} }, fee: { BDT: {}, USD: {} } },
      by7 = {};
    v7.txns.forEach(t => {
      if (t.type !== "expense") return;
      const m = ref[t.feeOf ? "fee" : "old"][cur7(t)];
      m[t.date] = (m[t.date] || 0) + t.amount;
      if (cur7(t) === "BDT") by7[t.feeOf ? "_charges" : t.cat] = (by7[t.feeOf ? "_charges" : t.cat] || 0) + t.amount;
    });
    const want = c => Object.fromEntries(days7.map(d => [d, (ref.old[c][d] || 0) + (ref.fee[c][d] || 0)]));
    const r = await page.evaluate(
      ([o, days, D]) => {
        const keep = S,
          keepV = { ...V },
          keepRing = window.ringHTML;
        try {
          S = migrate(o);
          RBC = LPC = null;
          const out = { spentOn: {}, bal: balances(), parts: loanParts() };
          ["BDT", "USD"].forEach(c => (out.spentOn[c] = Object.fromEntries(days.map(d => [d, spentOn(d, c)]))));
          let ring = null;
          window.ringHTML = (c, r) => ((ring = r.mode === "home" ? r : ring), keepRing(c, r));
          Object.assign(V, { screen: "home", cur: "BDT", period: "range", rs: D.d1, re: D.d6 });
          render();
          out.home = {
            spent: ring.spent,
            got: ring.got,
            by: Object.fromEntries(Object.entries(ring.by).filter(e => e[1])),
          };
          summarySheet();
          Object.assign(SM, { cur: "BDT", end: D.d6, mode: "m", sel: null });
          out.months = smBuckets().map(b => [b.s.slice(0, 7), b.v]);
          closeSheet();
          openHistory();
          out.hist = [...document.querySelectorAll("#app .hmon")].map(e => [
            e.firstElementChild.textContent,
            [...e.querySelectorAll(".hcl")].map(l => l.textContent.replace(/\u2060/g, "")),
          ]);
          const sg = n => signed(n, "BDT").replace(/\u2060/g, "");
          /* by hand: March ৳10.00 of fees, April ৳20.00 + ৳15.00, May ৳300.00 + ৳50.00 and ৳40,000.00 received */
          out.histWant = [
            [capFirst(monthLabel("2026-05", true)), [sg(40000), sg(-350)]],
            [capFirst(monthLabel("2026-04", true)), [sg(-35)]],
            [capFirst(monthLabel("2026-03", true)), [sg(-10)]],
          ];
          return out;
        } finally {
          S = keep;
          Object.assign(V, keepV);
          window.ringHTML = keepRing;
          RBC = LPC = null;
          closeSheet();
          render();
        }
      },
      [v7, days7, D]
    );
    ok(same(r.bal, refBalances(v7)), "v7: every balance identical " + J(r.bal));
    ok(same(r.parts, []), "v7: nothing worked out as income or spending");
    ok(
      same(r.spentOn.BDT, want("BDT")) && same(r.spentOn.USD, want("USD")),
      "v7: each day's spending is what it was plus that day's fees (৳10.00, ৳20.00 + ৳15.00) " + J(r.spentOn)
    );
    const old = Object.values(ref.old.BDT).reduce((q, v) => q + v, 0);
    ok(
      r.home.spent === old + 45 && r.home.got === 40000,
      "v7: Home's spent goes up by the ৳45.00 of fees, received doesn't move " + J(r.home)
    );
    ok(
      same(r.home.by, by7) && r.home.by.fees === 300,
      'v7: the fees in CHARGES, the plain Fees ("Food") expense where it was ' + J(r.home.by)
    );
    const mWant = { "2026-03": 10, "2026-04": 35, "2026-05": 0 };
    const offM = r.months.filter(
      ([m, v]) =>
        v !==
        Object.entries(ref.old.BDT)
          .filter(([d]) => d.startsWith(m))
          .reduce((q, e) => q + e[1], 0) +
          (mWant[m] || 0)
    );
    ok(!offM.length && r.months.length > 2, "v7: Summary's months go up by their fees " + J(r.months));
    ok(same(r.hist, r.histWant), "v7: History's month headings, the fees inside spent as before " + J(r.hist));
  } catch (e) {
    ok(false, "old data's totals: " + e.message.split("\n")[0]);
  }

  /* ---- Home's grey Charges part (docs/specs/charges.md, Home; D9-home without its line): one slice in #7a8190 after
     the categories', true to size, and a label in the ring's top right corner (a grey dot, "Charges", the amount under
     it; no %, no icon, no line), only when the period has charges outside purchases in the viewed currency, in every
     Settings donut mode; the donut's button says it, the label is hidden from TalkBack */
  const homeRing = (o, view) =>
    page.evaluate(
      ([o, view]) => {
        const keep = S,
          keepV = { ...V };
        try {
          S = migrate(o);
          RBC = LPC = null;
          const C = 2 * Math.PI * 40;
          const out = {};
          DONUT_MODES.forEach(mode => {
            S.settings.donut = mode;
            Object.assign(V, { screen: "home" }, view);
            render();
            const segs = [...document.querySelectorAll("#ring .donut g circle[stroke-dasharray]")].map(c => ({
              col: c.getAttribute("stroke"),
              start: -parseFloat(c.getAttribute("stroke-dashoffset")) / C,
            }));
            const lab = document.querySelector("#ring .rchg"),
              dot = lab && lab.querySelector("i");
            out[mode] = {
              segs,
              lab: lab && {
                text: [...lab.children].map(e => e.textContent),
                dot: dot && getComputedStyle(dot).backgroundColor,
                ink: getComputedStyle(lab).color,
                hidden: lab.getAttribute("aria-hidden"),
                icons: lab.querySelectorAll("svg, .emb, img").length,
                tile: !!lab.closest("button, [data-act]"),
              },
              lines: [...document.querySelectorAll("#ring .leaders [stroke], #ring .leaders [fill]")].filter(e =>
                /7a8190/i.test(e.getAttribute("stroke") + e.getAttribute("fill"))
              ).length,
              aria: document.querySelector("#ring .dwrap").getAttribute("aria-label"),
            };
          });
          const cur = V.cur || viewCur();
          out.money = Object.fromEntries(
            [26, 48, 138, 1638, 40350].map(n => [n, [money(n, cur, true), money(n, cur)]])
          );
          out.tiles = [...document.querySelectorAll("#ring .rt")].map(e => e.dataset.v);
          return JSON.parse(JSON.stringify(out));
        } finally {
          S = keep;
          Object.assign(V, keepV);
          RBC = LPC = null;
          render();
        }
      },
      [o, view]
    );
  // ---- 18. Home's grey Charges part and its label
  try {
    const week = { period: "range", rs: dd(-6), re: dd(0) };
    const bdt = await homeRing(countBook(), { ...week, cur: "BDT" });
    const m = bdt.money;
    for (const mode of ["out", "in", "both", "none"]) {
      const r = bdt[mode],
        last = r.segs[r.segs.length - 1];
      ok(
        last && last.col === "#7a8190" && r.segs.filter(x => x.col === "#7a8190").length === 1,
        "BDT, donut " + mode + ": one grey slice, after every category's " + J(r.segs.map(x => x.col))
      );
      ok(
        last && Math.abs(1 - last.start - 138 / 1638) < 1e-4,
        "… true to size: ৳138.00 of ৳1,638.00 (" + (last && (1 - last.start).toFixed(5)) + ")"
      );
      ok(
        r.lab && same(r.lab.text, ["", "Charges", m[138][0]]) && r.lab.dot === "rgb(122, 129, 144)",
        "… the label: a grey dot, Charges, the amount under it " + J(r.lab)
      );
      ok(
        r.lab && !/%/.test(r.lab.text.join("")) && r.lab.icons === 0 && !r.lab.tile && r.lines === 0,
        "… no %, no icon, not a tile or button, no line to the slice"
      );
      ok(r.lab && r.lab.ink !== "rgb(122, 129, 144)", "… its text isn't the grey " + (r.lab && r.lab.ink));
      ok(
        r.lab &&
          r.lab.hidden === "true" &&
          r.aria ===
            "Spending summary: spent " + m[1638][1] + ", of which charges " + m[138][1] + ", received " + m[40350][1],
        "… hidden from TalkBack; the donut's button says it: " + r.aria
      );
    }
    /* a hidden category with spending has no tile either: its slice still comes before the grey one */
    const hid = countBook();
    hid.cats = cats7.map(c => (c.id === "health" ? { ...c, hidden: true } : c));
    hid.txns.push(x("hH", 900, dd(0), "expense", 362, "a", { cat: "health" }));
    const h = (await homeRing(hid, { ...week, cur: "BDT" })).both,
      hl = h.segs[h.segs.length - 1];
    ok(
      hl && hl.col === "#7a8190" && h.segs.length === 5 && Math.abs(1 - hl.start - 138 / 2000) < 1e-4,
      "a hidden category's slice comes before the grey one, which stays last and true to size " +
        J(h.segs.map(x => x.col))
    );
    const usd = await homeRing(countBook(), { ...week, cur: "USD" });
    ok(
      usd.both.lab &&
        same(usd.both.lab.text, ["", "Charges", usd.money[26][0]]) &&
        usd.both.aria === "Spending summary: spent " + usd.money[48][1] + ", of which charges " + usd.money[26][1],
      "USD: the label and the donut's button count the dollars' charges only " + J([usd.both.lab, usd.both.aria])
    );
    /* yesterday: the dinner's charge (in its category) and a plain expense in Fees ("Food"), no charge outside them */
    const yd = await homeRing(countBook(), { period: "day", anchor: dd(-1), cur: "BDT" });
    for (const mode of ["out", "in", "both", "none"])
      ok(
        !yd[mode].lab && !yd[mode].segs.some(x => x.col === "#7a8190") && !/charges/.test(yd[mode].aria),
        "a day with charges only inside a purchase: no label, no grey slice (donut " + mode + ") " + yd[mode].aria
      );
    ok(!yd.tiles.includes("_charges"), "Charges is never a tile");
    const blankBook = await page.evaluate(() => JSON.parse(JSON.stringify(blank())));
    const fresh = await homeRing(
      {
        ...blankBook,
        settings: { ...blankBook.settings, cur: "BDT" },
        accounts: [acct("a", "Bank", "bank", "BDT", 100)],
      },
      { period: "day", anchor: dd(0), cur: "BDT" }
    );
    const old = await homeRing(copy(v7), { period: "day", anchor: D.d6, cur: "BDT" });
    ok(
      fresh.tiles.length > 0 && !fresh.tiles.includes("fees") && old.tiles.includes("fees"),
      "a new notebook's ring has no Fees tile, an older one keeps its own " + J([fresh.tiles, old.tiles])
    );
  } catch (e) {
    ok(false, "Home's Charges part: " + e.message.split("\n")[0]);
  }

  /* ---- Summary's Charges line (docs/specs/charges.md, Summary; C-summary): every list ends with it whenever the
     period has charges outside purchases: a grey dot where an emblem would be, the word, its share on Months and Year
     ("<1%"), a grey bar and the amount; after the top three categories on Days and Weeks, after all of them on Months
     and Year, whatever its size. The Months pie ends with the grey slice. TalkBack: "Charges, ৳158.00, less than 1%".
     Summary's total is Home's for the same period. */
  const smView = (o, cur, end, mode, sel, home) =>
    page.evaluate(
      ([o, cur, end, mode, sel, home]) => {
        const keep = S,
          keepV = { ...V },
          keepRing = window.ringHTML;
        try {
          S = migrate(o);
          RBC = LPC = null;
          let ring = null;
          window.ringHTML = (c, r) => ((ring = r.mode === "home" ? r : ring), keepRing(c, r));
          const cl = v => (v == null ? v : String(v).replace(/\u2060/g, ""));
          /* Home for the same period: the one given, or (home "bucket") the bucket picked, as "Open … on Home" opens it */
          const homeFor = h => {
            closeSheet();
            Object.assign(V, { screen: "home", cur }, h);
            render();
            return cl(money(ring.spent, cur));
          };
          Object.assign(V, { screen: "home", cur }, home === "bucket" ? { period: "day", anchor: today() } : home);
          render();
          summarySheet();
          Object.assign(SM, { cur, end, mode, sel });
          smRender();
          const grey = "rgb(122, 129, 144)";
          const rows = [...document.querySelectorAll("#sm .smtop .tx")].map(e => {
            const d = e.querySelector(".d"),
              sm = d.querySelector(".small"),
              dot = e.querySelector(".smi .chdot"),
              bar = e.querySelector(".pbar span");
            return {
              name: (sm ? d.textContent.replace(sm.textContent, "") : d.textContent).trim(),
              share: sm ? sm.textContent : "",
              amount: cl(e.querySelector(".a").textContent),
              /* TalkBack hears the whole line, wherever it is touched, as one sentence */
              say: cl(e.getAttribute("aria-label")),
              shown: e.getAttribute("role") === "img",
              dot: dot ? getComputedStyle(dot).backgroundColor : null,
              emblem: !!e.querySelector(".emb"),
              bar: getComputedStyle(bar).backgroundColor,
              ink: getComputedStyle(d).color,
              grey,
            };
          });
          const b = SM.mode === "y" ? null : smBuckets().slice(1)[SM.sel];
          const pie = [...document.querySelectorAll("#sm .smpie path, #sm .smpie circle")].map(p => ({
            fill: p.getAttribute("fill"),
            title: (p.querySelector("title") || {}).textContent,
          }));
          const said = n => money(n, cur);
          const smd = cl($("#sm .smd").textContent),
            total = cl($("#sm .big.spent").textContent);
          const homeSpent = homeFor(
            home === "bucket" ? { period: "range", rs: b.s, re: b.e > today() ? today() : b.e } : home
          );
          return {
            rows,
            pie,
            total,
            smd,
            homeSpent,
            span: b ? [b.s, b.e] : null,
            under: cl(T("summary.under", { pct: percent(1) })),
            tpl: said(1234.5).replace(/\u2060/g, ""),
          };
        } finally {
          S = keep;
          Object.assign(V, keepV);
          window.ringHTML = keepRing;
          RBC = LPC = null;
          closeSheet();
          render();
        }
      },
      [o, cur, end, mode, sel, home]
    );
  // ---- 19. Summary's Charges line, the pie's grey slice, TalkBack, and Summary = Home
  try {
    /* today in BDT, beside the ৳10.00 transfer charge and ৳50.00 of groceries: Rent ৳100,000.00 and four more
       categories, one of them (Transport ৳5.00) smaller than the charge */
    const book = countBook();
    book.txns.push(
      x("h1", 800, dd(0), "expense", 100000, "a", { cat: "housing" }),
      x("s1", 801, dd(0), "expense", 500, "a", { cat: "shopping" }),
      x("f1", 802, dd(0), "expense", 400, "a", { cat: "fun" }),
      x("m1", 803, dd(0), "expense", 300, "a", { cat: "health" }),
      x("b1", 804, dd(0), "expense", 5, "a", { cat: "transport" }),
      // last month: ৳3,000.00 of bills, for the Months tab's comparison
      x(
        "pm",
        805,
        new Date(Date.UTC(+dd(0).slice(0, 4), +dd(0).slice(5, 7) - 2, 15)).toISOString().slice(0, 10),
        "expense",
        3000,
        "a",
        { cat: "bills" }
      )
    );
    /* by hand: charges outside purchases, by day (Joy's written-off transfer charge, an older paid fee, Sam's ৳100.00
       charges paid back with a ৳5.00 transfer charge, today's transfer charge) */
    const CH = { BDT: { [dd(-5)]: 20, [dd(-3)]: 3, [dd(-2)]: 105, [dd(0)]: 10 }, USD: { [dd(-1)]: 1, [dd(0)]: 25 } };
    const isCh = r => r.name === "Charges";
    const mo = (r, n) => r.tpl.replace(/1,234\.50/, Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 }));
    const chargeRow = (r, tag) => {
      const c = r.rows[r.rows.length - 1];
      ok(
        c && isCh(c) && r.rows.filter(isCh).length === 1,
        tag + ": the list ends with one Charges line " + J(r.rows.map(x => x.name))
      );
      ok(
        c && c.dot === c.grey && !c.emblem && c.bar === c.grey && c.ink !== c.grey,
        tag + ": a grey dot where an emblem would be, a grey bar, the word not in grey " + J(c)
      );
      return c || {};
    };
    const week = dd(0);
    /* Days: today, the top three and Charges */
    const d0 = await smView(book, "BDT", week, "d", 6, { period: "day", anchor: dd(0) });
    let c = chargeRow(d0, "Days");
    ok(
      same(
        d0.rows.map(x => x.name),
        ["Rent", "Shopping", "Fun", "Charges"]
      ),
      "Days: the three top categories, then Charges " + J(d0.rows.map(x => x.name))
    );
    ok(c.amount === mo(d0, 10) && c.share === "", "Days: Charges ৳10.00, no share " + J(c));
    ok(c.say === "Charges, " + mo(d0, 10) && c.shown, "Days: TalkBack says " + J(c.say));
    ok(
      d0.total === mo(d0, 101265) && d0.total === d0.homeSpent,
      "Days: the total is Home's " + J([d0.total, d0.homeSpent])
    );
    /* yesterday: the dinner's charge is in Eating out, no charge outside a purchase: no Charges line */
    const d1 = await smView(book, "BDT", week, "d", 5, { period: "day", anchor: dd(-1) });
    ok(
      !d1.rows.some(isCh) && d1.rows.length === 2 && d1.total === d1.homeSpent,
      "Days, yesterday: charges only inside purchases, no Charges line; the total is Home's " +
        J([d1.rows.map(x => x.name), d1.total, d1.homeSpent])
    );
    /* Weeks: this week's top three and Charges, its charges worked out included */
    const w0 = await smView(book, "BDT", week, "w", 7, "bucket");
    c = chargeRow(w0, "Weeks");
    ok(
      w0.rows.length === 4 && c.amount === mo(w0, sumIn(CH.BDT, ...w0.span)) && c.share === "",
      "Weeks: the three top categories, then Charges " + sumIn(CH.BDT, ...w0.span) + " " + J(w0.rows)
    );
    ok(w0.total === w0.homeSpent, "Weeks: the total is Home's for that week " + J([w0.span, w0.total, w0.homeSpent]));
    /* Months: every category, then Charges, whatever its size, with "<1%"; the pie ends grey */
    const mon = dd(0).slice(0, 7);
    const m0 = await smView(book, "BDT", week, "m", 6, { period: "month", anchor: dd(0) });
    c = chargeRow(m0, "Months");
    const chM = sumIn(CH.BDT, mon + "-01", mon + "-31");
    ok(
      c.amount === mo(m0, chM) && c.share === "<1%" && c.say === "Charges, " + mo(m0, chM) + ", " + m0.under,
      "Months: Charges " + chM + " <1%; TalkBack: " + J(c.say)
    );
    ok(m0.under === "less than 1%", "… which says less than 1% " + J(m0.under));
    const names = m0.rows.map(x => x.name);
    ok(
      names.indexOf("Transport") >= 0 && names.indexOf("Transport") < names.indexOf("Charges") && names.length >= 7,
      "Months: every category first, Transport (৳5.00) too, then Charges " + J(names)
    );
    ok(
      m0.pie.length === m0.rows.length &&
        m0.pie[m0.pie.length - 1].fill === "#7a8190" &&
        m0.pie[m0.pie.length - 1].title === "Charges" &&
        m0.pie.filter(p => p.fill === "#7a8190").length === 1,
      "Months: the pie ends with the one grey slice " + J(m0.pie)
    );
    const pctSum = m0.rows.reduce((q, r) => q + (parseInt(r.share.replace("<", "")) || 0), 0);
    ok(Math.abs(pctSum - 100) <= m0.rows.length, "Months: the shares add up to about 100% " + pctSum);
    ok(m0.total === m0.homeSpent, "Months: the total is Home's " + J([m0.total, m0.homeSpent]));
    /* the month so far against last month (৳3,000.00 of bills), by daily average: both include the charges and Sam's
       charges paid back (worked out from his loan) */
    const tot = sumIn(SPENT.BDT, mon + "-01", mon + "-31") + 101205,
      [yy, mm] = mon.split("-").map(Number),
      lenPrev = new Date(Date.UTC(yy, mm - 1, 0)).getUTCDate(),
      days = +dd(0).slice(8),
      pc = Math.round((tot / days / (3000 / lenPrev) - 1) * 100);
    const smdWant = await page.evaluate(
      ([n, d, p]) =>
        [
          T("summary.avg", { amount: money(rnd(n / d), "BDT") }),
          T("summary." + (p === 0 ? "same" : p > 0 ? "up" : "down") + ".m", { pct: percent(Math.abs(p)) }),
        ].map(t => t.replace(/\u2060/g, "")),
      [tot, days, pc]
    );
    ok(
      smdWant.every(t => m0.smd.includes(t)) && tot === 102843,
      "Months: the average and the comparison with last month count the charges " + J([m0.smd, smdWant])
    );
    /* Year: every category, then Charges */
    const y0 = await smView(book, "BDT", week, "y", null, { period: "year", anchor: dd(0) });
    c = chargeRow(y0, "Year");
    const yr = dd(0).slice(0, 4),
      chY = sumIn(CH.BDT, yr + "-01-01", yr + "-12-31");
    ok(
      c.amount === mo(y0, chY) && c.share === "<1%" && c.say === "Charges, " + mo(y0, chY) + ", less than 1%",
      "Year: Charges " + chY + " <1% " + J(c)
    );
    ok(y0.total === y0.homeSpent, "Year: the total is Home's " + J([y0.total, y0.homeSpent]));
    /* USD: the dollars' charges only */
    const u0 = await smView(book, "USD", week, "m", 6, { period: "month", anchor: dd(0) });
    c = chargeRow(u0, "USD");
    const chU = sumIn(CH.USD, mon + "-01", mon + "-31");
    ok(c.amount === mo(u0, chU) && u0.total === u0.homeSpent, "USD: Charges " + chU + " " + J([c, u0.total]));
  } catch (e) {
    ok(false, "Summary's Charges line: " + e.message.split("\n")[0]);
  }

  /* ---- History's rows, headings and filters, and search (docs/specs/charges.md, "History rows", "History headings and
     filters", "Search"; C-rows, lend-refine, lend-payback). One notebook in May 2026 with each kind of row in the
     spec's two tables; book2 adds Rafi's ৳1,250.00 payback. In the page: History with filters f, its headings, each
     row's figure and the lines under it, and each row of `opens` opened (its boxes, the chips in the loan's box, the
     loan box's lines). */
  const M5 = n => "2026-05-" + String(n).padStart(2, "0");
  const rowBook = paid => ({
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
      // Maya: borrowed ৳60,000.00; paid back ৳5,000.00 with a ৳200.00 transfer charge
      x("mD", 100, M5(1), "loan", 60000, "a", { dir: "in", loan: "MY", principal: true }),
      x("mP", 900, M5(9), "loan", 5000, "a", { dir: "out", loan: "MY", feeId: "mPc" }),
      x("mPc", 901, M5(9), "expense", 200, "a", { cat: "fees", feeOf: "mP" }),
      // Ona: lent ৳5,000.00, paid back ৳3,000.00 with an older paid fee of ৳10.00; Tom: the same with a ৳150.00 tip
      x("oD", 200, M5(2), "loan", 5000, "c", { dir: "out", loan: "ON", principal: true }),
      x("tD", 210, M5(2), "loan", 5000, "c", { dir: "out", loan: "TM", principal: true }),
      x("oP", 1100, M5(11), "loan", 3000, "c", { dir: "in", loan: "ON", feeId: "oPf" }),
      x("oPf", 1101, M5(11), "expense", 10, "c", { cat: "fees", feeOf: "oP" }),
      x("tP", 1110, M5(11), "loan", 3000, "c", { dir: "in", loan: "TM", feeId: "tPt" }),
      x("tPt", 1111, M5(11), "income", 150, "c", { cat: "otherin", feeOf: "tP" }),
      // Rafi and Nila: lent ৳1,000.00 + ৳100.00 transfer charge + ৳150.00 extra; Nila paid back ৳500.00
      x("rD", 300, M5(3), "loan", 1000, "k", { dir: "out", loan: "R", principal: true, onTop: 150, feeId: "rDc" }),
      x("rDc", 301, M5(3), "loan", 100, "k", { dir: "out", loan: "R", principal: true, feeOf: "rD" }),
      x("nD", 310, M5(3), "loan", 1000, "k", { dir: "out", loan: "N", principal: true, onTop: 150, feeId: "nDc" }),
      x("nDc", 311, M5(3), "loan", 100, "k", { dir: "out", loan: "N", principal: true, feeOf: "nD" }),
      x("nP", 600, M5(6), "loan", 500, "k", { dir: "in", loan: "N" }),
      // Sam and Lee: borrowed ৳1,000.00 with ৳100.00 of charges; Sam paid back ৳1,100.00, Lee ৳400.00
      x("sD", 320, M5(3), "loan", 1000, "a", { dir: "in", loan: "S", principal: true, onTop: 100 }),
      x("lD", 330, M5(3), "loan", 1000, "a", { dir: "in", loan: "L", principal: true, onTop: 100 }),
      x("sP", 1000, M5(10), "loan", 1100, "a", { dir: "out", loan: "S" }),
      x("lP", 1010, M5(10), "loan", 400, "a", { dir: "out", loan: "L" }),
      // Joy: lent ৳500.00 + ৳20.00 transfer charge, written off
      x("jD", 340, M5(3), "loan", 500, "k", { dir: "out", loan: "J", principal: true, feeId: "jDc" }),
      x("jDc", 341, M5(3), "loan", 20, "k", { dir: "out", loan: "J", principal: true, feeOf: "jD" }),
      // dinner ৳1,000.00 + ৳150.00 charge; a transfer of ৳1,000.00 with a ৳10.00 charge
      x("pE", 1200, M5(12), "expense", 1000, "c", { cat: "food", payee: "Star Kabab", feeId: "pEc" }),
      x("pEc", 1201, M5(12), "expense", 150, "c", { cat: "food", feeOf: "pE" }),
      x("tX", 1300, M5(13), "transfer", 1000, "a", { to: "k", feeId: "tXc" }),
      x("tXc", 1301, M5(13), "expense", 10, "a", { cat: "fees", feeOf: "tX" }),
    ].concat(paid ? [x("rP", 800, M5(8), "loan", 1250, "k", { dir: "in", loan: "R" })] : []),
    loans: [
      loanOf("MY", "borrow", "Maya", "a", M5(1)),
      loanOf("ON", "lend", "Ona", "c", M5(2)),
      loanOf("TM", "lend", "Tom", "c", M5(2)),
      loanOf("R", "lend", "Rafi", "k", M5(3)),
      loanOf("N", "lend", "Nila", "k", M5(3)),
      loanOf("S", "borrow", "Sam", "a", M5(3)),
      loanOf("L", "borrow", "Lee", "a", M5(3)),
      loanOf("J", "lend", "Joy", "k", M5(3), "writeoff"),
    ],
    assets: [],
  });
  const histLook = (o, f, opens = []) =>
    page.evaluate(
      ([o, f, opens]) => {
        const keep = S,
          keepV = { ...V },
          keepHF = HF,
          keepHP = { ...HP };
        const cl = s => s.replace(/⁠/g, "").replace(/\s+/g, " ").trim();
        try {
          S = migrate(o);
          RBC = LPC = null;
          openHistory(f);
          const g = document.createElement("span");
          g.className = "got";
          document.body.appendChild(g);
          const green = getComputedStyle(g).color;
          g.remove();
          const isGreen = e => getComputedStyle(e).color === green;
          const col = e => [...e.querySelectorAll(".hcl")].map(l => cl(l.textContent));
          const out = {
            tpl: cl(money(1234.5, "BDT")),
            mon: [...document.querySelectorAll("#app .hmon")].map(e => [cl(e.firstElementChild.textContent), col(e)]),
            day: [...document.querySelectorAll("#app .dayh")].map(e => [cl(e.firstElementChild.textContent), col(e)]),
            dayTitle: Object.fromEntries(
              Array.from({ length: 31 }, (_, i) => i + 1).map(n => {
                const d = "2026-05-" + String(n).padStart(2, "0");
                return [n, capFirst(dayLabel(d))];
              })
            ),
            rows: {},
            open: {},
          };
          document.querySelectorAll("#app .tx[data-v]").forEach(e => {
            const a = e.querySelector(".a"),
              sm = [...a.querySelectorAll("small")];
            out.rows[e.dataset.v] = {
              amt: cl(
                [...a.childNodes]
                  .filter(n => n.nodeName !== "SMALL")
                  .map(n => n.textContent)
                  .join("")
              ),
              small: sm.map(s => cl(s.textContent)),
              green: sm.map(isGreen),
            };
          });
          opens.forEach(id => {
            V.open = id;
            render();
            const t = document.querySelector("#app .txo");
            if (!t) return;
            const box = t.querySelector(".lbox");
            out.open[id] = {
              text: cl(t.textContent),
              boxes: [...t.querySelectorAll(".fbox")].map(b => ({
                cap: cl(b.querySelector(".bcap").textContent),
                val: cl(b.querySelector(".bval").textContent),
                sub: [...b.querySelectorAll(".bin")].map(s => cl(s.textContent)).join(" "),
                green: isGreen(b.querySelector(".bval")),
              })),
              perRow: [...t.querySelectorAll(".frow")].map(r => r.querySelectorAll(".fbox").length),
              head: box ? [...box.querySelector(".lhead").children].map(c => cl(c.textContent)).join(" ") : null,
              foot: box ? [...box.querySelectorAll(".lfoot")].map(s => cl(s.textContent)) : [],
              chips: box
                ? [...box.querySelectorAll(".lpart")].map(c => [...c.children].map(s => cl(s.textContent)))
                : [],
              chipsOut: t.querySelectorAll(".lpart").length - (box ? box.querySelectorAll(".lpart").length : 0),
            };
          });
          return out;
        } finally {
          S = keep;
          Object.assign(V, keepV);
          HF = keepHF;
          Object.assign(HP, keepHP);
          RBC = LPC = null;
          render();
        }
      },
      [o, f, opens]
    );
  /* ৳ figures as the page writes them */
  const tkOf = r => (n, sign) =>
    (sign === "-" ? "−" : sign === "+" ? "+" : "") +
    r.tpl.replace(/1,234\.50/, Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 }));
  const bx = (o, cap) => (o && o.boxes.find(b => b.cap === cap)) || {};

  // ---- 20. History's rows, collapsed and opened: the money that moved, the small line, the boxes and the chips
  try {
    const OPEN = ["tX", "pE", "mP", "sP", "rD", "sD", "nP", "tP", "oP", "lP", "jD"];
    const r = await histLook(rowBook(false), {}, OPEN),
      r2 = await histLook(rowBook(true), {}, ["rP"]),
      tk = tkOf(r),
      row = id => r.rows[id] || {},
      op = id => r.open[id] || { boxes: [], foot: [], chips: [], perRow: [] };
    // a transfer: ৳1,000.00 / + ৳10.00 transfer charge; opened Sent | Transfer charge, then both Left after
    ok(
      row("tX").amt === tk(1000) && J(row("tX").small) === J(["+ " + tk(10) + " transfer charge"]),
      "transfer row: ৳1,000.00 / + ৳10.00 transfer charge " + J(row("tX"))
    );
    ok(
      J(op("tX").boxes.map(b => [b.cap, b.val])) ===
        J([
          ["Sent", tk(1000)],
          ["Transfer charge", tk(10)],
          ["Left after", tk(refBalances(rowBook(false)).a)],
          ["Left after", tk(refBalances(rowBook(false)).k)],
        ]) && J(op("tX").perRow) === J([2, 2]),
      "transfer opened: Sent | Transfer charge, then both Left after " + J(op("tX"))
    );
    // spending: −৳1,150.00 / incl. ৳150.00 charge; opened Charge | Left after
    ok(
      row("pE").amt === tk(1150, "-") && J(row("pE").small) === J(["incl. " + tk(150) + " charge"]),
      "purchase row: the total −৳1,150.00 / incl. ৳150.00 charge " + J(row("pE"))
    );
    ok(
      J(op("pE").boxes.map(b => b.cap)) === J(["Charge", "Left after"]) && bx(op("pE"), "Charge").val === tk(150),
      "purchase opened: Charge ৳150.00 · Left after " + J(op("pE").boxes)
    );
    // paid back a loan: −৳5,000.00 / + ৳200.00 transfer charge; opened the loan's box, Paid back | Transfer charge
    ok(
      row("mP").amt === tk(5000, "-") && J(row("mP").small) === J(["+ " + tk(200) + " transfer charge"]),
      "loan payment row " + J(row("mP"))
    );
    ok(
      op("mP").head === "You owe Maya " + tk(55000) &&
        J(op("mP").boxes.map(b => [b.cap, b.val])) ===
          J([
            ["Paid back", tk(5000)],
            ["Transfer charge", tk(200)],
            ["Left after", op("mP").boxes[2] && op("mP").boxes[2].val],
          ]) &&
        J(op("mP").perRow) === J([2, 1]),
      "loan payment opened: the loan's box, Paid back ৳5,000.00 | Transfer charge ৳200.00, then Left after " +
        J(op("mP"))
    );
    // paid back a loan, covering its charges: −৳1,100.00 / incl. ৳100.00 charges; opened Charges, counted as spending
    ok(
      row("sP").amt === tk(1100, "-") && J(row("sP").small) === J(["incl. " + tk(100) + " charges"]),
      "loan payment covering its charges " + J(row("sP"))
    );
    ok(
      op("sP").head === "Cleared" &&
        J(op("sP").boxes.map(b => b.cap)) === J(["Charges", "Left after"]) &&
        bx(op("sP"), "Charges").val === tk(100) &&
        bx(op("sP"), "Charges").sub === "counted as spending",
      "… opened: Charges ৳100.00, counted as spending · Left after " + J(op("sP"))
    );
    // lent: −৳1,000.00 / + ৳100.00 transfer charge (the extra moves no money); opened: chips in Rafi's box
    ok(
      row("rD").amt === tk(1000, "-") && J(row("rD").small) === J(["+ " + tk(100) + " transfer charge"]),
      "lend row: −৳1,000.00 / + ৳100.00 transfer charge, no extra " + J(row("rD"))
    );
    ok(
      op("rD").head === "Rafi owes you " + tk(1250) &&
        J(op("rD").foot) === J([tk(0) + " of " + tk(1250) + " back"]) &&
        J(op("rD").chips) ===
          J([
            ["Lent", tk(1000)],
            ["Transfer charge", tk(100)],
            ["Extra", tk(150)],
          ]) &&
        op("rD").chipsOut === 0,
      "lend opened: Rafi owes you ৳1,250.00, ৳0.00 of ৳1,250.00 back, chips Lent · Transfer charge · Extra in his box " +
        J(op("rD"))
    );
    ok(
      J(op("rD").boxes.map(b => [b.cap, b.val])) === J([["Left after", tk(18900)]]) && /in Bkash/.test(op("rD").text),
      "… then only Left after ৳18,900.00 in Bkash " + J(op("rD").boxes)
    );
    // borrowed: +৳1,000.00 with no small line; opened: chips Borrowed · Charges
    ok(
      row("sD").amt === tk(1000, "+") && !row("sD").small.length,
      "borrow row: +৳1,000.00, no small line " + J(row("sD"))
    );
    ok(
      J(op("sD").chips) ===
        J([
          ["Borrowed", tk(1000)],
          ["Charges", tk(100)],
        ]),
      "borrow opened: chips Borrowed · Charges " + J(op("sD").chips)
    );
    // a plain draw keeps its box without chips
    ok(
      !op("jD").chips.length || op("jD").chips.length > 1,
      "a draw's chips only when it has parts " + J(op("jD").chips)
    );
    // a lending paid back, covering its extra: +৳1,250.00 / incl. ৳150.00 extra, in green; opened Extra +৳150.00
    const rp = r2.rows.rP || {},
      rpo = r2.open.rP || { boxes: [] };
    ok(
      rp.amt === tk(1250, "+") && J(rp.small) === J(["incl. " + tk(150) + " extra"]) && rp.green[0] === true,
      "payback covering the extra: +৳1,250.00 / incl. ৳150.00 extra, green " + J(rp)
    );
    ok(
      rpo.head === "Cleared" &&
        J(rpo.boxes.map(b => b.cap)) === J(["Extra", "Left after"]) &&
        bx(rpo, "Extra").val === tk(150, "+") &&
        bx(rpo, "Extra").green &&
        bx(rpo, "Extra").sub === "counted as income" &&
        J(rpo.perRow) === J([2]),
      "… opened: Extra +৳150.00 (green), counted as income · Left after " + J(rpo)
    );
    // a lending paid back with a tip: +৳3,000.00 / + ৳150.00 extra, green; opened Got back | Extra, then Left after
    ok(
      row("tP").amt === tk(3000, "+") && J(row("tP").small) === J(["+ " + tk(150) + " extra"]) && row("tP").green[0],
      "payback with a tip " + J(row("tP"))
    );
    ok(
      J(op("tP").boxes.map(b => [b.cap, b.val])) ===
        J([
          ["Got back", tk(3000)],
          ["Extra", tk(150, "+")],
          ["Left after", (op("tP").boxes[2] || {}).val],
        ]) &&
        bx(op("tP"), "Extra").sub === "counted as income" &&
        bx(op("tP"), "Extra").green,
      "… opened: Got back ৳3,000.00 · Extra +৳150.00 counted as income · Left after " + J(op("tP").boxes)
    );
    // a lending paid back in part, before the extra: +৳500.00, no small line; the quiet line in the loan's box
    ok(row("nP").amt === tk(500, "+") && !row("nP").small.length, "part payback: +৳500.00 alone " + J(row("nP")));
    ok(
      op("nP").head === "Nila owes you " + tk(750) &&
        J(op("nP").foot) ===
          J([
            tk(500) + " of " + tk(1250) + " back",
            "Left: " + tk(600) + " of the money, then the " + tk(150) + " extra",
          ]),
      "… opened: Nila owes you ৳750.00, ৳500.00 of ৳1,250.00 back, Left: ৳600.00 of the money, then the ৳150.00 extra " +
        J(op("nP"))
    );
    ok(
      J(op("lP").foot.slice(1)) === J(["Left: " + tk(600) + " of the money, then the " + tk(100) + " charges"]),
      "a loan paid back in part: Left: ৳600.00 of the money, then the ৳100.00 charges " + J(op("lP").foot)
    );
    // a lending paid back, older paid fee: +৳3,000.00 / − ৳10.00 charge; opened Got back | Charge
    ok(
      row("oP").amt === tk(3000, "+") && J(row("oP").small) === J(["− " + tk(10) + " charge"]) && !row("oP").green[0],
      "payback with an older paid fee " + J(row("oP"))
    );
    ok(
      J(
        op("oP")
          .boxes.slice(0, 2)
          .map(b => [b.cap, b.val])
      ) ===
        J([
          ["Got back", tk(3000)],
          ["Charge", tk(10)],
        ]),
      "… opened: Got back ৳3,000.00 · Charge ৳10.00 " + J(op("oP").boxes)
    );
    /* written off with all the money back but the extra (or forgiven with all of it paid but the charges): what is
       on top is let go, so the box names the status with no figure, never "owes" or "Cleared"; its bar says what
       really came back */
    const wo = rowBook(false);
    wo.txns.push(
      x("rW", 800, M5(8), "loan", 1100, "k", { dir: "in", loan: "R" }),
      x("lW", 1020, M5(10), "loan", 600, "a", { dir: "out", loan: "L" })
    );
    wo.loans.find(l => l.id === "R").status = "writeoff";
    wo.loans.find(l => l.id === "L").status = "writeoff";
    const wl = await histLook(wo, {}, ["rW", "lW", "nP"]),
      w = wl.open.rW || {},
      fg = wl.open.lW || {};
    ok(
      w.head === "Written off" && J(w.foot) === J([tk(1100) + " of " + tk(1250) + " back"]),
      "written off with only the extra unpaid: Written off, ৳1,100.00 of ৳1,250.00 back " + J(w)
    );
    ok(
      fg.head === "Forgiven" && J(fg.foot) === J([tk(1000) + " of " + tk(1100) + " paid"]),
      "forgiven with only the charges unpaid: Forgiven, ৳1,000.00 of ৳1,100.00 paid " + J(fg)
    );
    // written off with money still unpaid: what was let go of it, the extra not counted
    const wn = rowBook(false);
    wn.loans.find(l => l.id === "N").status = "writeoff";
    const nw = (await histLook(wn, {}, ["nP"])).open.nP || {};
    ok(
      nw.head === "Nila owes you " + tk(600) && J(nw.foot) === J([tk(500) + " of " + tk(1250) + " back"]),
      "written off with money unpaid: the money only, ৳600.00, and no quiet line " + J(nw)
    );
    // never a total beside one of its parts
    const all = Object.values(r.open)
      .concat(Object.values(r2.open))
      .map(o => o.text)
      .join(" | ");
    ok(!/Paid in all|Reached you/.test(all), "no Paid in all or Reached you anywhere");
    ok(
      !/fee\b/i.test(
        Object.values(r.rows)
          .map(x => x.small.join(" "))
          .join(" ")
      ),
      "no row says fee"
    );
  } catch (e) {
    ok(false, "History's rows: " + e.message.split("\n")[0]);
  }

  // ---- 21. History's headings and filters
  try {
    const may = "May 2026";
    const view = f => histLook(rowBook(true), f);
    const d = await view({}),
      tk = tkOf(d),
      monOf = r => (r.mon.find(m => m[0] === may) || [])[1],
      dayOf = (r, n) => (r.day.find(x => x[0] === r.dayTitle[n]) || [])[1];
    ok(J(monOf(d)) === J([tk(300, "+"), tk(1490, "-")]), "default: +৳300.00 received, −৳1,490.00 spent " + J(monOf(d)));
    const rafi = await view({ kind: "lend", who: "Rafi" });
    ok(
      J(monOf(rafi)) === J([tk(1250, "+"), tk(1100, "-"), "Extras " + tk(150)]),
      "Lent, Rafi: +৳1,250.00 / −৳1,100.00 / Extras ৳150.00 " + J(monOf(rafi))
    );
    ok(
      J(dayOf(rafi, 8)) === J([tk(1250, "+"), "Extras " + tk(150)]) && J(dayOf(rafi, 3)) === J([tk(1100, "-")]),
      "… the days: +৳1,250.00 / Extras ৳150.00 and −৳1,100.00 " + J(rafi.day)
    );
    const lent = await view({ kind: "lend" });
    ok(
      J(monOf(lent)) === J([tk(7900, "+"), tk(12720, "-"), "Extras " + tk(300), "Charges " + tk(30)]),
      "Lent: back with the extras, lent with the transfer charges, Extras, and Charges (Joy's written-off ৳20.00, Ona's " +
        "older ৳10.00) " +
        J(monOf(lent))
    );
    const bor = await view({ kind: "borrow" });
    ok(
      J(monOf(bor)) === J([tk(62000, "+"), tk(6500, "-"), "Charges " + tk(300)]),
      "Borrowed: +৳62,000.00 / −৳6,500.00 / Charges ৳300.00 (charges paid back and transfer charges) " + J(monOf(bor))
    );
    const xf = await view({ kind: "xfer" });
    ok(
      J(monOf(xf)) === J(["Transferred " + tk(1000), "Charges " + tk(10)]),
      "Transfers: Transferred ৳1,000.00 / Charges ৳10.00 " + J(monOf(xf))
    );
    const sp = await view({ kind: "out" });
    ok(
      J(Object.keys(sp.rows).sort()) === J(["jD", "mP", "oP", "pE", "sP", "tX"]) &&
        J(monOf(sp)) === J([tk(1490, "-")]) &&
        monOf(sp)[0] === monOf(d)[1],
      "Spent: the entries carrying spending, its heading the default view's spent " +
        J([Object.keys(sp.rows), monOf(sp)])
    );
    const rc = await view({ kind: "in" });
    ok(
      J(Object.keys(rc.rows).sort()) === J(["rP", "tP"]) && J(monOf(rc)) === J([tk(300, "+")]),
      "Received: the paybacks with extras, counting only the extras " + J([Object.keys(rc.rows), monOf(rc)])
    );
    const food = await view({ cat: "food" });
    ok(J(monOf(food)) === J([tk(1150, "-")]), "Eating out counts ৳1,150.00 " + J(monOf(food)));
    const bothSay = await page.evaluate(() => [
      T("history.words.charges", { amount: "X" }),
      T("history.words.extras", { amount: "X" }),
    ]);
    ok(J(bothSay) === J(["Charges X", "Extras X"]), "the words lines' texts " + J(bothSay));
    /* credit from an earlier payment that covers a later draw's extra counts on that draw's day: under every filter
       that keeps the payment, that day has its heading */
    const credit = {
      ...rowBook(false),
      txns: [
        x("aD1", 100, M5(2), "loan", 500, "k", { dir: "out", loan: "A", principal: true, onTop: 50 }),
        x("aP", 200, M5(4), "loan", 1000, "k", { dir: "in", loan: "A", note: "cash back" }),
        x("aD2", 300, M5(20), "loan", 400, "k", { dir: "out", loan: "A", principal: true, onTop: 40 }),
      ],
      loans: [loanOf("A", "lend", "Ana", "k", M5(2))],
    };
    for (const [tag, f] of [
      ["Received", { kind: "in" }],
      ["Bkash", { acc: "k" }],
      ["a search", { q: "cash" }],
    ]) {
      const c = await histLook(credit, f);
      ok(
        J(dayOf(c, 20)) === J([tk(40, "+")]) && J(dayOf(c, 4)) === J([tk(50, "+")]) && J(monOf(c)) === J([tk(90, "+")]),
        tag + ": the extra covered by credit has its day's heading " + J([c.day, c.mon])
      );
    }
  } catch (e) {
    ok(false, "History's headings: " + e.message.split("\n")[0]);
  }

  // ---- 22. Search: a number finds the figure a row or its opened part shows; more and less than, the row's figure
  try {
    const hits = async f => Object.keys((await histLook(rowBook(true), f)).rows).sort();
    const h1150 = await hits({ q: "1150" });
    ok(h1150.includes("pE"), "“1150” finds the purchase by its row's total " + J(h1150));
    const h100 = await hits({ q: "100" });
    ok(h100.includes("rD"), "“100” finds Rafi's lend by its chip " + J(h100));
    const h150 = await hits({ q: "150" });
    ok(
      ["rD", "nD", "pE", "rP", "tP"].every(id => h150.includes(id)),
      "“150” finds the extras (chips, covered, tipped) and the charge " + J(h150)
    );
    const more = await hits({ q: ">1100" }),
      less = await hits({ q: "<1100" });
    ok(
      more.includes("pE") && more.includes("rP") && !more.includes("rD") && !more.includes("sP"),
      "“>1100” compares the row's figure (৳1,150.00, not ৳1,000.00) " + J(more)
    );
    ok(!less.includes("pE") && less.includes("rD"), "“<1100” too " + J(less));
    const gt = await hits({ amt: "gt:1100" }),
      lt = await hits({ amt: "lt:1100" }),
      eq = await hits({ amt: "eq:1150:1151" });
    ok(gt.includes("pE") && !lt.includes("pE") && eq.includes("pE"), "the amount filters too " + J([gt, lt, eq]));
    const sugs = await page.evaluate(o => {
      const keep = S;
      try {
        S = migrate(o);
        RBC = LPC = null;
        return sugCount({ ...histBlank(), q: "1150" }, { period: "all" });
      } finally {
        S = keep;
        RBC = LPC = null;
      }
    }, rowBook(true));
    ok(sugs === h1150.length, "the suggestion's count follows the rows " + J([sugs, h1150.length]));
  } catch (e) {
    ok(false, "Search: " + e.message.split("\n")[0]);
  }

  // ---- 23. a row whose title would be cut (the amount and its small line take its room) stacks as a tight list's
  // rows do: the title whole, then the amount and its small line under it; a short title keeps the amount on its right
  try {
    const book = {
      v: 8,
      settings: { ...settings, cur: "USD" },
      accounts: [acct("c", "Cash", "cash", "USD", 5000)],
      types: [],
      cats: cats8,
      txns: [
        x("mx", 100, D.d6, "loan", 1000, "c", { dir: "out", loan: "MX", principal: true, onTop: 150, feeId: "mxc" }),
        x("mxc", 101, D.d6, "loan", 100, "c", { dir: "out", loan: "MX", principal: true, feeOf: "mx" }),
        x("sm", 110, D.d6, "loan", 500, "c", { dir: "out", loan: "SM", principal: true, feeId: "smc" }),
        x("smc", 111, D.d6, "loan", 5, "c", { dir: "out", loan: "SM", principal: true, feeOf: "sm" }),
      ],
      loans: [
        loanOf("MX", "lend", "Maximiliane Hoffmann-Lindqvist", "c", D.d6),
        loanOf("SM", "lend", "Sam", "c", D.d6),
      ],
      assets: [],
    };
    /* History at the text size s, the row `open` opened (by a tap when tap, else by render): each row's title, whether
       it is clamped, where its amount sits against it, its parts in reading order */
    const look = (s, open, tap) =>
      page.evaluate(
        async ([o, s, open, tap]) => {
          const keep = S,
            keepV = { ...V },
            keepFS = Android.fontScale;
          try {
            Android.fontScale = () => s;
            applyTextScale();
            S = migrate(o);
            RBC = LPC = null;
            openHistory({});
            if (open && tap) document.querySelector('#app .tx[data-v="' + open + '"]').click();
            else if (open) {
              V.open = open;
              render();
            }
            const out = { tight: !!document.querySelector("#app .list.tight"), rows: {} };
            document.querySelectorAll("#app .tx.en[data-v]").forEach(e => {
              const d = e.querySelector(".d").getBoundingClientRect(),
                a = e.querySelector(".a").getBoundingClientRect(),
                dd = e.querySelector(".d");
              out.rows[e.dataset.v] = {
                title: dd.textContent.replace(/\s+/g, " ").trim(),
                clamped: dd.scrollHeight > dd.clientHeight + 1,
                under: a.top >= d.bottom - 1,
                right: a.left >= d.right - 1,
                stacked: e.classList.contains("stacked"),
                order: [...e.querySelector(".mid").children].map(c => c.className.split(" ")[0]).join(),
                text: e.textContent.replace(/\s+/g, " ").trim(),
                expanded: e.getAttribute("aria-expanded"),
                next: (e.nextElementSibling || {}).className || "",
              };
            });
            return out;
          } finally {
            S = keep;
            Object.assign(V, keepV);
            Android.fontScale = keepFS;
            applyTextScale();
            RBC = LPC = null;
            render();
          }
        },
        [book, s, open || "", !!tap]
      );
    const r1 = await look(1),
      mx = r1.rows.mx || {},
      sm = r1.rows.sm || {};
    ok(
      !r1.tight &&
        mx.title === "Lent to Maximiliane Hoffmann-Lindqvist" &&
        !mx.clamped &&
        mx.under &&
        mx.text.includes("+ $100.00 transfer charge"),
      "393 px, 1×: the long title is whole, its amount and “+ $100.00 transfer charge” under it " + J(mx)
    );
    ok(
      sm.title === "Lent to Sam" && sm.right && !sm.under && !sm.stacked,
      "… a short title keeps its amount on the right " + J(sm)
    );
    ok(
      mx.order === "d,a,s" && sm.order === "d,a,s",
      "… the reading order is the same: title, amount, account " + J([mx.order, sm.order])
    );
    const r13 = await look(1.3);
    ok(
      r13.tight && Object.values(r13.rows).every(r => !r.stacked && r.under && !r.clamped),
      "1.3×: the list is tight already, no row is marked to stack " + J(r13)
    );
    for (const tap of [false, true]) {
      const ro = await look(1, "mx", tap),
        m = ro.rows.mx || {};
      ok(
        m.expanded === "true" && /\btxo\b/.test(m.next) && !m.clamped && m.under && m.order === "d,a,s",
        "opened (" + (tap ? "a tap" : "rendered") + "): the stacked row, its opened part right after it " + J(m)
      );
    }
  } catch (e) {
    ok(false, "A row whose title would be cut: " + e.message.split("\n")[0]);
  }

  // ---- 24. the loan sheet (docs/specs/charges.md, "The loan sheet", "Previews", "Saving"; lend-after, lend-payback,
  // lend-refine): the payment card's transfer charge or extra, its preview and the line under the date when it covers
  // charges or an extra, the messages, an older paid fee on its edit, a draw's edit with its cards, the figure's chips,
  // the history lines, and every add-on going and coming with its entry
  try {
    const sheetBook = () => ({
      v: 8,
      settings,
      accounts: [
        acct("a", "Bank", "bank", "BDT", 50000),
        acct("k", "Bkash", "wallet", "BDT", 20000),
        acct("c", "Cash", "cash", "BDT", 10000),
      ],
      types: [],
      cats: cats8,
      txns: [
        // Maya: borrowed ৳60,000.00; Sam: borrowed ৳1,000.00 with ৳100.00 of charges
        x("mD", 100, D.d1, "loan", 60000, "a", { dir: "in", loan: "MY", principal: true }),
        x("sD", 110, D.d1, "loan", 1000, "a", { dir: "in", loan: "S", principal: true, onTop: 100 }),
        // Rafi and Nila: lent ৳1,000.00 + ৳100.00 transfer charge + ৳150.00 extra; Nila paid back ৳1,200.00
        x("rD", 200, D.d1, "loan", 1000, "k", { dir: "out", loan: "R", principal: true, onTop: 150, feeId: "rDc" }),
        x("rDc", 201, D.d1, "loan", 100, "k", { dir: "out", loan: "R", principal: true, feeOf: "rD" }),
        x("nD", 210, D.d1, "loan", 1000, "k", { dir: "out", loan: "N", principal: true, onTop: 150, feeId: "nDc" }),
        x("nDc", 211, D.d1, "loan", 100, "k", { dir: "out", loan: "N", principal: true, feeOf: "nD" }),
        x("nP", 220, D.d2, "loan", 1200, "k", { dir: "in", loan: "N" }),
        // Tom: lent ৳3,000.00; Ona: lent ৳5,000.00, paid back ৳3,000.00 with an older paid fee of ৳10.00
        x("tD", 300, D.d1, "loan", 3000, "k", { dir: "out", loan: "TM", principal: true }),
        x("oD", 310, D.d1, "loan", 5000, "c", { dir: "out", loan: "ON", principal: true }),
        x("oP", 320, D.d2, "loan", 3000, "c", { dir: "in", loan: "ON", feeId: "oPf" }),
        x("oPf", 321, D.d2, "expense", 10, "c", { cat: "fees", note: "Bkash cash-out", feeOf: "oP" }),
      ],
      loans: [
        loanOf("MY", "borrow", "Maya", "a", D.d1),
        loanOf("S", "borrow", "Sam", "a", D.d1),
        loanOf("R", "lend", "Rafi", "k", D.d1),
        loanOf("N", "lend", "Nila", "k", D.d1),
        loanOf("TM", "lend", "Tom", "k", D.d1),
        loanOf("ON", "lend", "Ona", "c", D.d1),
      ],
      assets: [],
    });
    const cl = s =>
      String(s || "")
        .replace(/\u2060/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const tap = async sel => {
      await page.click(sel);
      await page.waitForTimeout(320);
    };
    const fresh = () =>
      page.evaluate(o => {
        closeSheet2();
        closeSheet();
        closePop();
        S = migrate(o);
        RBC = LPC = null;
        commit();
        render();
      }, sheetBook());
    const tk = await page
      .evaluate(() => money(1234.5, "BDT"))
      .then(
        t => (n, sign) =>
          (sign === "-" ? "−" : sign === "+" ? "+" : "") +
          cl(t).replace(/1,234\.50/, Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 }))
      );
    const open = async id => {
      await page.evaluate(id => loanOpen(id), id);
      await page.waitForTimeout(120);
    };
    const txt = sel => page.evaluate(s => (document.querySelector(s) || {}).textContent || "", sel).then(cl);
    const raw = sel => page.evaluate(s => (document.querySelector(s) || {}).textContent || "", sel);
    /* a figure exactly as the page writes it, its own spaces kept: an amount and its word must hold on one line */
    const mr = n => page.evaluate(n => money(n, "BDT"), n);
    const snackText = () => txt("#snack");
    const db = () => page.evaluate(() => JSON.parse(JSON.stringify({ txns: S.txns, loans: S.loans, bal: balances() })));
    const info = id =>
      page.evaluate(id => {
        const i = loanInfo(loan(id));
        return { total: i.total, paid: i.paid, left: i.left, st: i.st };
      }, id);
    const typeIn = async (sel, v) => {
      await page.fill(sel, v);
      await page.waitForTimeout(60);
    };
    const visible = sel => page.isVisible(sel);

    // the sheet's figure and its chips
    await fresh();
    await open("R");
    ok(
      (await txt("#sheet .hero .v")) === tk(1250),
      "Rafi's sheet: the figure ৳1,250.00 " + (await txt("#sheet .hero .v"))
    );
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll("#sheet .hero .lpart")].map(c =>
        [...c.children].map(s =>
          s.textContent
            .replace(/\u2060/g, "")
            .replace(/\s+/g, " ")
            .trim()
        )
      )
    );
    ok(
      J(chips) ===
        J([
          ["Lent", tk(1000)],
          ["Transfer charge", tk(100)],
          ["Extra", tk(150)],
        ]),
      "… with the chips Lent ৳1,000.00 · Transfer charge ৳100.00 · Extra ৳150.00 under it " + J(chips)
    );
    ok(
      (await page.$$eval("#sheet .list .tx.exp", e => e.length)) === 1,
      "… one history line for the draw: its transfer charge is part of it, never a line of its own"
    );
    const drawLine = await raw("#sheet .list .tx.exp .more");
    ok(
      drawLine.includes((await mr(100)) + "\u00a0transfer charge") &&
        drawLine.includes((await mr(150)) + "\u00a0extra"),
      "… the draw's line: “৳100.00 transfer charge · ৳150.00 extra”, each amount and its word on one line " +
        J(drawLine)
    );
    // the lending's card: prefilled with everything owed, no transfer charge, + Add an extra
    ok(
      (await page.inputValue("#sheet #f-amt")) === "1,250.00" &&
        !(await page.$('#sheet [data-act="addon-add"][data-v="xcharge"]')) &&
        (await visible('#sheet [data-act="addon-add"][data-v="extra"]')),
      "“Got money back?” prefilled with ৳1,250.00, + Add an extra, no transfer charge " +
        (await page.inputValue("#sheet #f-amt"))
    );
    ok(
      (await txt("#sheet .aoline")) === "Bkash " + tk(1250, "+") + " · lending " + tk(1100) + " + extra " + tk(150),
      "the line under the date: ● Bkash +৳1,250.00 · lending ৳1,100.00 + extra ৳150.00 " + (await txt("#sheet .aoline"))
    );
    await typeIn("#sheet #f-amt", "500");
    ok((await txt("#sheet .aoline")) === "", "a part payback that covers none of the extra: no line");
    await typeIn("#sheet #f-amt", "1,250");
    const kR = (await db()).bal.k;
    await tap('#sheet [data-act="loan-pay"]');
    ok(
      (await snackText()).startsWith("Got back " + tk(1250) + ", incl. " + tk(150) + " extra · all cleared"),
      "message: Got back ৳1,250.00, incl. ৳150.00 extra · all cleared " + (await snackText())
    );
    let d = await db();
    let rp = d.txns.find(t => t.loan === "R" && !t.principal);
    ok(
      rp && rp.amount === 1250 && !rp.feeId && d.bal.k === kR + 1250,
      "a payment of ৳1,250.00 into Bkash, nothing linked " + J(rp)
    );
    await open("R");
    const payLine = await raw("#sheet .list .tx.exp .more");
    ok(payLine.includes("incl. " + (await mr(150)) + "\u00a0extra"), "its line: “incl. ৳150.00 extra” " + J(payLine));

    // a tip on top of a payback; a negative tip or one that isn't a number is refused
    await open("TM");
    await typeIn("#sheet #f-amt", "3000");
    ok((await txt("#sheet .aoline")) === "", "Tom: nothing on top, no line");
    await tap('#sheet [data-act="addon-add"][data-v="extra"]');
    ok(
      (await visible("#sheet #f-extra")) &&
        (await page.evaluate(() => document.activeElement && document.activeElement.id)) === "f-extra" &&
        !(await visible('#sheet [data-act="addon-add"][data-v="extra"]')),
      "+ Add an extra opens the Extra card with its field focused, the button gone"
    );
    await typeIn("#sheet #f-extra", "-5");
    await tap('#sheet [data-act="loan-pay"]');
    d = await db();
    ok(
      (await snackText()).includes("An extra can't be negative") && !d.txns.some(t => t.loan === "TM" && !t.principal),
      "a negative extra is refused " + (await snackText())
    );
    await typeIn("#sheet #f-extra", "12+");
    await tap('#sheet [data-act="loan-pay"]');
    ok((await snackText()).includes("That extra isn't a number"), "one that isn't a number too " + (await snackText()));
    await typeIn("#sheet #f-extra", "150");
    ok(
      (await txt("#sheet .aocard .aoprev")) ===
        "Bkash " + tk(3150, "+") + " · lending " + tk(3000) + " + extra " + tk(150) &&
        (await txt("#sheet .aoline")) === "",
      "in the card: ● Bkash +৳3,150.00 · lending ৳3,000.00 + extra ৳150.00 " + (await txt("#sheet .aocard .aoprev"))
    );
    const k0 = (await db()).bal.k;
    await tap('#sheet [data-act="loan-pay"]');
    ok(
      (await snackText()).startsWith("Got back " + tk(3000) + " + " + tk(150) + " extra · all cleared"),
      "message: Got back ৳3,000.00 + ৳150.00 extra · all cleared " + (await snackText())
    );
    d = await db();
    const tp = d.txns.find(t => t.loan === "TM" && !t.principal),
      tip = tp && d.txns.find(t => t.id === tp.feeId);
    ok(
      tp &&
        tp.amount === 3000 &&
        tip &&
        tip.type === "income" &&
        tip.amount === 150 &&
        tip.cat === "otherin" &&
        tip.feeOf === tp.id &&
        tip.account === "k" &&
        tip.date === tp.date &&
        d.bal.k === k0 + 3150,
      "a payment and its tip, an income linked both ways; Bkash +৳3,150.00 " + J([tp, tip])
    );
    await open("TM");
    ok(
      (await raw("#sheet .list .tx.exp .more")).includes("+" + (await mr(150)) + "\u00a0extra"),
      "its line: “+৳150.00 extra”"
    );
    // editing the payment: the tip changes and moves with its account and day
    await page.evaluate(id => loanDrawEdit(id), tp.id);
    await page.waitForTimeout(120);
    ok(
      (await page.inputValue("#sheet2 #ed-extra")) === "150.00" &&
        !(await visible('#sheet2 [data-act="addon-add"][data-v="extra"]')),
      "its edit opens with the Extra card " + (await page.inputValue("#sheet2 #ed-extra").catch(() => "none"))
    );
    await typeIn("#sheet2 #ed-extra", "100");
    const dayBefore = await page.evaluate(() => {
      const el = $("#ed-date"),
        v = addDays(el.dataset.v, -1);
      setDateField(el, v);
      return v;
    });
    await tap('#sheet2 [data-act="ed-acc"][data-v="a"]');
    await tap('#sheet2 [data-act="loandraw-save"]');
    d = await db();
    const tip2 = d.txns.find(t => t.id === tip.id) || d.txns.find(t => t.feeOf === tp.id);
    ok(
      tip2 &&
        tip2.amount === 100 &&
        tip2.account === "a" &&
        tip2.date === dayBefore &&
        d.txns.find(t => t.id === tp.id).account === "a",
      "editing the payment changes its tip and moves it with the account and day " + J(tip2)
    );
    // deleting the payment takes its tip along; Undo brings both back; reopening does the same
    await open("TM");
    await tap('#sheet .list .txh[data-act="row-exp"]');
    await tap(`#sheet [data-act="loanpay-del"][data-v="${tp.id}"]`);
    d = await db();
    ok(!d.txns.some(t => t.id === tp.id || t.feeOf === tp.id), "deleting the payment deletes its tip");
    await tap('[data-act="undo"]');
    d = await db();
    ok(
      d.txns.some(t => t.feeOf === tp.id),
      "Undo brings both back"
    );
    await open("TM");
    await tap('#sheet [data-act="loan-reopen"]');
    d = await db();
    ok(
      !d.txns.some(t => t.id === tp.id || t.feeOf === tp.id) && (await info("TM")).left === 3000,
      "reopening the cleared lending (undo last payment) takes the tip too"
    );
    await tap('[data-act="undo"]');

    // paying back a loan with a transfer charge
    await open("MY");
    ok(
      (await visible('#sheet [data-act="addon-add"][data-v="xcharge"]')) &&
        !(await page.$('#sheet [data-act="addon-add"][data-v="extra"]')) &&
        !(await page.$('#sheet [data-act="add-fee"]')),
      "“Paid some back?”: + Transfer charge, no extra, no old fee button"
    );
    await typeIn("#sheet #f-amt", "5000");
    ok((await txt("#sheet .aoline")) === "", "nothing added or covered: no preview");
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "200");
    ok(
      (await txt("#sheet .aocard .aoprev")) ===
        "Bank " + tk(5200, "-") + " · loan " + tk(5000) + " + transfer charge " + tk(200),
      "in the card: ● Bank −৳5,200.00 · loan ৳5,000.00 + transfer charge ৳200.00 " +
        (await txt("#sheet .aocard .aoprev"))
    );
    const bA = (await db()).bal.a;
    await tap('#sheet [data-act="loan-pay"]');
    ok(
      (await snackText()).startsWith("Paid back " + tk(5000) + " + " + tk(200) + " transfer charge") &&
        !(await snackText()).includes("cleared"),
      "message: Paid back ৳5,000.00 + ৳200.00 transfer charge " + (await snackText())
    );
    d = await db();
    const mp = d.txns.find(t => t.loan === "MY" && !t.principal),
      mc = mp && d.txns.find(t => t.id === mp.feeId);
    ok(
      mc &&
        mc.type === "expense" &&
        mc.amount === 200 &&
        mc.feeOf === mp.id &&
        mc.account === "a" &&
        d.bal.a === bA - 5200,
      "a payment and its transfer charge, Bank −৳5,200.00 " + J([mp, mc])
    );
    await open("MY");
    ok(
      (await txt("#sheet .hero .v")) === tk(55000) && !(await page.$("#sheet .hero .lpart")),
      "a loan without add-ons: no chips under its figure"
    );
    ok(
      (await raw("#sheet .list .tx.exp .more")).includes((await mr(200)) + "\u00a0transfer charge"),
      "its line: “৳200.00 transfer charge”"
    );
    // its edit: the card open; ✕ removes the charge
    await page.evaluate(id => loanDrawEdit(id), mp.id);
    await page.waitForTimeout(120);
    ok((await page.inputValue("#sheet2 #ed-charge")) === "200.00", "the payment's edit opens with its transfer charge");
    await tap('#sheet2 [data-act="addon-remove"][data-v="xcharge"]');
    ok(await visible('#sheet2 [data-act="addon-add"][data-v="xcharge"]'), "✕ brings + Transfer charge back");
    await tap('#sheet2 [data-act="loandraw-save"]');
    d = await db();
    ok(!d.txns.some(t => t.feeOf === mp.id) && !d.txns.find(t => t.id === mp.id).feeId, "… and saving removes it");

    // paying back the borrow, covering its charges
    await open("S");
    const sChips = await page.evaluate(() =>
      [...document.querySelectorAll("#sheet .hero .lpart")].map(c =>
        [...c.children].map(e => e.textContent).join(" | ")
      )
    );
    ok(
      J(sChips.map(cl)) === J(["Borrowed | " + tk(1000), "Charges | " + tk(100)]),
      "Sam's chips: Borrowed · Charges " + J(sChips)
    );
    ok(
      (await page.inputValue("#sheet #f-amt")) === "1,100.00" &&
        (await txt("#sheet .aoline")) === "Bank " + tk(1100, "-") + " · loan " + tk(1000) + " + charges " + tk(100),
      "prefilled ৳1,100.00, the line: ● Bank −৳1,100.00 · loan ৳1,000.00 + charges ৳100.00 " +
        (await txt("#sheet .aoline"))
    );
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "20");
    ok(
      (await txt("#sheet .aocard .aoprev")) ===
        "Bank " + tk(1120, "-") + " · loan " + tk(1000) + " + charges " + tk(100) + " + transfer charge " + tk(20),
      "with a transfer charge too: … + transfer charge ৳20.00 " + (await txt("#sheet .aocard .aoprev"))
    );
    await tap('#sheet [data-act="addon-remove"][data-v="xcharge"]');
    await tap('#sheet [data-act="loan-pay"]');
    ok(
      (await snackText()).startsWith("Paid back " + tk(1100) + ", incl. " + tk(100) + " charges · all cleared"),
      "message: Paid back ৳1,100.00, incl. ৳100.00 charges " + (await snackText())
    );
    await open("S");
    ok(
      (await raw("#sheet .list .tx.exp .more")).includes("incl. " + (await mr(100)) + "\u00a0charges"),
      "its line: “incl. ৳100.00 charges”"
    );

    // an older paid fee: kept, shown as its charge card on the payment's edit, editable and removable
    await open("ON");
    ok(
      (await raw("#sheet .list .tx.exp .more")).includes("−\u00a0" + (await mr(10)) + "\u00a0charge"),
      "Ona's older paid fee on its line, as History writes it: “− ৳10.00 charge”"
    );
    await page.evaluate(() => loanDrawEdit("oP"));
    await page.waitForTimeout(120);
    ok(
      (await page.inputValue("#sheet2 #ed-charge")) === "10.00" &&
        (await txt("#sheet2 .aocard .aol")) === "Charge" &&
        !(await visible('#sheet2 [data-act="addon-add"][data-v="extra"]')) &&
        (await txt("#sheet2 .aocard .aoprev")) ===
          "Cash " + tk(2990, "+") + " · lending " + tk(3000) + " − charge " + tk(10),
      "its edit: the Charge card, ● Cash +৳2,990.00 · lending ৳3,000.00 − charge ৳10.00, no + Add an extra " +
        (await txt("#sheet2 .aocard .aoprev"))
    );
    const c0 = (await db()).bal.c;
    await typeIn("#sheet2 #ed-charge", "20");
    await tap('#sheet2 [data-act="loandraw-save"]');
    d = await db();
    const oPf = d.txns.find(t => t.id === "oPf") || {};
    ok(
      oPf.amount === 20 &&
        oPf.note === "Bkash cash-out" &&
        oPf.cat === "fees" &&
        oPf.account === "c" &&
        d.txns.find(t => t.id === "oP").feeId === "oPf" &&
        d.bal.c === c0 - 10,
      "the paid fee is editable: ৳20.00, its note and category kept, Cash ৳10.00 less " + J(oPf)
    );
    await open("ON");
    await page.evaluate(() => loanDrawEdit("oP"));
    await page.waitForTimeout(120);
    await tap('#sheet2 [data-act="addon-remove"][data-v="charge"]');
    ok(
      (await visible('#sheet2 [data-act="addon-add"][data-v="extra"]')) &&
        !(await visible('#sheet2 [data-act="addon-add"][data-v="charge"]')),
      "✕ removes it, and + Add an extra comes instead (never + Charge again)"
    );
    await tap('#sheet2 [data-act="loandraw-save"]');
    d = await db();
    ok(!d.txns.some(t => t.id === "oPf") && !d.txns.find(t => t.id === "oP").feeId, "… saved without it");

    // a draw's edit: its cards, its transfer charge and onTop changed; never more paid back than owed
    await open("R");
    await page.evaluate(() => loanDrawEdit("rD"));
    await page.waitForTimeout(120);
    ok(
      (await page.inputValue("#sheet2 #ed-charge")) === "100.00" &&
        (await page.inputValue("#sheet2 #ed-extra")) === "150.00" &&
        (await page.getAttribute("#sheet2 .aocard", "aria-label")) === "Transfer charge and extra",
      "Rafi's draw: one card, Transfer charge and Extra"
    );
    ok(
      (await txt("#sheet2 .aocard .aoprev")) === "Bkash " + tk(1100, "-") + " · Rafi owes " + tk(1250),
      "… its preview, as the lend form's: ● Bkash −৳1,100.00 · Rafi owes ৳1,250.00 " +
        (await txt("#sheet2 .aocard .aoprev"))
    );
    await typeIn("#sheet2 #ed-charge", "120");
    await typeIn("#sheet2 #ed-extra", "200");
    await tap('#sheet2 [data-act="loandraw-save"]');
    d = await db();
    ok(
      d.txns.find(t => t.id === "rDc").amount === 120 &&
        d.txns.find(t => t.id === "rD").onTop === 200 &&
        (await info("R")).total === 1320,
      "editing the draw changes its transfer charge and its extra: owed ৳1,320.00 " + J(await info("R"))
    );
    await open("N");
    await page.evaluate(() => loanDrawEdit("nD"));
    await page.waitForTimeout(120);
    await tap('#sheet2 [data-act="addon-remove"][data-v="extra"]');
    await tap('#sheet2 [data-act="loandraw-save"]');
    d = await db();
    ok(
      (await snackText()).includes("Already paid back " + tk(1200)) && d.txns.find(t => t.id === "nD").onTop === 150,
      "Nila paid back ৳1,200.00: the extra can't go (৳1,100.00 would be less) " + (await snackText())
    );
    await page.evaluate(() => closeSheet2());
    await page.evaluate(() => loanDrawEdit("nD"));
    await page.waitForTimeout(120);
    await tap('#sheet2 [data-act="addon-remove"][data-v="xcharge"]');
    await tap('#sheet2 [data-act="loandraw-save"]');
    d = await db();
    ok(
      (await snackText()).includes("Already paid back") && d.txns.some(t => t.id === "nDc"),
      "… nor the transfer charge (৳1,150.00) " + (await snackText())
    );
    await page.evaluate(() => closeSheet2());
    await open("MY");
    await page.evaluate(() => loanDrawEdit("mD"));
    await page.waitForTimeout(120);
    ok(
      (await visible('#sheet2 [data-act="addon-add"][data-v="charges"]')) &&
        (await txt('#sheet2 [data-act="addon-add"][data-v="charges"]')) === "Add charges",
      "a borrow's draw: + Add charges"
    );
    await page.evaluate(() => closeSheet2());
    await open("S");
    await page.evaluate(() => loanDrawEdit("sD"));
    await page.waitForTimeout(120);
    ok(
      (await page.inputValue("#sheet2 #ed-charge")) === "100.00" &&
        (await txt("#sheet2 .aocard .aol")) === "Charges" &&
        (await txt("#sheet2 .aocard .aoprev")) === "Bank " + tk(1000, "+") + " · you owe Sam " + tk(1100),
      "Sam's draw: the Charges card, ● Bank +৳1,000.00 · you owe Sam ৳1,100.00 " +
        (await txt("#sheet2 .aocard .aoprev"))
    );
    await page.evaluate(() => closeSheet2());
    // deleting the loan takes every add-on along
    await open("R");
    await tap('#sheet [data-act="loan-del"]');
    if (await visible('#pop [data-act="ask-ok"]')) await tap('#pop [data-act="ask-ok"]');
    d = await db();
    ok(
      !d.loans.some(l => l.id === "R") && !d.txns.some(t => t.loan === "R" || t.id === "rDc"),
      "deleting Rafi's lending deletes its transfer charge"
    );
    ok(!d.txns.some(t => t.feeOf && !d.txns.some(y => y.id === t.feeOf)), "no add-on left without its entry");

    // Got it all / Paid it all: everything left, with the payment's message
    await fresh();
    await page.evaluate(() => clearLoan("R"));
    await page.waitForTimeout(120);
    await tap('#pop [data-act="ask-ok"]');
    d = await db();
    ok(
      (await snackText()).startsWith("Got back " + tk(1250) + ", incl. " + tk(150) + " extra · all cleared") &&
        d.txns.some(t => t.loan === "R" && !t.principal && t.amount === 1250),
      "Got it all back: ৳1,250.00, incl. ৳150.00 extra · all cleared " + (await snackText())
    );
    await page.evaluate(() => clearLoan("S"));
    await page.waitForTimeout(120);
    await tap('#pop [data-act="ask-ok"]');
    ok(
      (await snackText()).startsWith("Paid back " + tk(1100) + ", incl. " + tk(100) + " charges · all cleared"),
      "Paid it all back: ৳1,100.00, incl. ৳100.00 charges · all cleared " + (await snackText())
    );

    // a charge setAddOn() refuses is never dropped silently: nothing is saved, and it says so
    await fresh();
    await open("MY");
    await typeIn("#sheet #f-amt", "1000");
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "20");
    await page.evaluate(() => {
      window.__setAddOn = setAddOn;
      setAddOn = () => false;
    });
    await tap('#sheet [data-act="loan-pay"]');
    d = await db();
    ok(
      (await snackText()).includes("That charge isn't a number") && !d.txns.some(t => t.loan === "MY" && !t.principal),
      "a payment whose charge is refused is not saved " + (await snackText())
    );
    await page.evaluate(() => closeSheet());
    await page.evaluate(() => trSheet());
    await page.waitForTimeout(120);
    await typeIn("#sheet #f-amt", "100");
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "5");
    await tap('#sheet [data-act="tr-save"]');
    d = await db();
    ok(
      (await snackText()).includes("That charge isn't a number") && !d.txns.some(t => t.type === "transfer"),
      "nor a transfer whose charge is refused " + (await snackText())
    );
    await page.evaluate(() => {
      setAddOn = window.__setAddOn;
      closeSheet();
    });
  } catch (e) {
    ok(false, "The loan sheet: " + e.message.split("\n")[0]);
  }

  // ---- 25. the lend and borrow forms (docs/specs/charges.md, "The buttons", "The card", "Previews", "Saving";
  // lend-form, borrow-form, lend-after, lend-refine): the preview under the account chips, Lend's two buttons and its
  // one card of two rows with one preview at its bottom, Borrow's charges, what is saved and said, the low-balance
  // question, a merge into an open tab, and the names TalkBack and the keypad's bar give each field
  try {
    const formBook = () => ({
      v: 8,
      settings,
      accounts: [
        acct("a", "Bank", "bank", "BDT", 50000),
        acct("k", "Bkash", "wallet", "BDT", 20000),
        acct("c", "Cash", "cash", "BDT", 1050),
      ],
      types: [],
      cats: cats8,
      // Nila: lent ৳500.00 from Bkash, still open (a lend to her adds to it)
      txns: [x("nD", 100, D.d1, "loan", 500, "k", { dir: "out", loan: "N", principal: true })],
      loans: [loanOf("N", "lend", "Nila", "k", D.d1)],
      assets: [],
    });
    const cl = s =>
      String(s || "")
        .replace(/⁠/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const tap = async sel => {
      await page.click(sel);
      await page.waitForTimeout(320);
    };
    const fresh = kind =>
      page.evaluate(
        ([o, kind]) => {
          closeSheet2();
          closeSheet();
          closePop();
          S = migrate(o);
          RBC = LPC = null;
          commit();
          render();
          loanForm(kind);
        },
        [formBook(), kind]
      );
    const tk = await page
      .evaluate(() => money(1234.5, "BDT"))
      .then(
        t => (n, sign) =>
          (sign === "-" ? "−" : sign === "+" ? "+" : "") +
          cl(t).replace(/1,234\.50/, Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 }))
      );
    const txt = sel => page.evaluate(s => (document.querySelector(s) || {}).textContent || "", sel).then(cl);
    const snackText = () => txt("#snack");
    const db = () => page.evaluate(() => JSON.parse(JSON.stringify({ txns: S.txns, loans: S.loans, bal: balances() })));
    const typeIn = async (sel, v) => {
      await page.fill(sel, v);
      await page.waitForTimeout(60);
    };
    const visible = sel => page.isVisible(sel);
    const line = () => txt("#sheet .aoline");
    const prev = () => txt("#sheet .aocard .aoprev");
    const look = () =>
      page.evaluate(() => {
        const card = $("#sheet .aocard"),
          rows = [...card.querySelectorAll(".aorow")].filter(r => !r.hidden);
        return {
          card: !card.hidden,
          group: card.getAttribute("aria-label"),
          role: card.getAttribute("role"),
          rows: rows.map(r => r.dataset.k),
          prevLast: card.lastElementChild.classList.contains("aoprev"),
          adds: [...$("#sheet .aoadds").children].filter(b => !b.hidden && b.offsetParent).map(b => b.dataset.v),
        };
      });

    // Lend: the preview under the account chips, "Someone owes" until a name is typed
    await fresh("lend");
    await tap('#sheet [data-act="f-acc"][data-v="k"]');
    await typeIn("#sheet #f-amt", "1000");
    ok(
      (await line()) === "Bkash " + tk(1000, "-") + " · Someone owes " + tk(1000),
      "lend: ● Bkash −৳1,000.00 · Someone owes ৳1,000.00 before a name " + (await line())
    );
    ok(
      await page.evaluate(() => {
        const l = $("#sheet .aoline"),
          chips = $('#sheet [data-act="f-acc"]').parentElement,
          date = $("#sheet #f-date");
        return (
          !!(chips.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING) &&
          !!(l.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING)
        );
      }),
      "… under the account chips, above Date and Due"
    );
    await typeIn("#sheet #f-person", "Rafi");
    ok(
      (await line()) === "Bkash " + tk(1000, "-") + " · Rafi owes " + tk(1000),
      "… then ● Bkash −৳1,000.00 · Rafi owes ৳1,000.00 " + (await line())
    );
    let lk = await look();
    ok(
      !lk.card &&
        J(lk.adds) === J(["xcharge", "extra"]) &&
        (await txt('#sheet [data-act="addon-add"][data-v="xcharge"]')) === "Transfer charge" &&
        (await txt('#sheet [data-act="addon-add"][data-v="extra"]')) === "Add an extra",
      "… with + Transfer charge and + Add an extra side by side, no card yet " + J(lk)
    );
    // with the transfer charge: the card takes the preview
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "100");
    lk = await look();
    ok(
      lk.card &&
        J(lk.rows) === J(["xcharge"]) &&
        lk.group === "Transfer charge" &&
        J(lk.adds) === J(["extra"]) &&
        (await prev()) === "Bkash " + tk(1100, "-") + " · Rafi owes " + tk(1100) &&
        (await line()) === "",
      "with the transfer charge: its card and ● Bkash −৳1,100.00 · Rafi owes ৳1,100.00, the preview only in it " +
        J(lk) +
        " " +
        (await prev())
    );
    // with both: one card of two rows, one preview at its bottom
    await tap('#sheet [data-act="addon-add"][data-v="extra"]');
    await typeIn("#sheet #f-extra", "150");
    lk = await look();
    ok(
      lk.card &&
        lk.role === "group" &&
        J(lk.rows) === J(["xcharge", "extra"]) &&
        lk.group === "Transfer charge and extra" &&
        lk.prevLast &&
        J(lk.adds) === J([]) &&
        (await page.$$eval("#sheet .aocard", e => e.length)) === 1 &&
        (await prev()) === "Bkash " + tk(1100, "-") + " · Rafi owes " + tk(1250) &&
        (await line()) === "",
      "with both: one card of two rows, the group “Transfer charge and extra”, ● Bkash −৳1,100.00 · Rafi owes " +
        "৳1,250.00 at its bottom " +
        J(lk) +
        " " +
        (await prev())
    );
    const names = await page.evaluate(() =>
      ["f-charge", "f-extra"].map(id => {
        const inp = $("#" + id),
          row = inp.closest(".aorow");
        return [
          $("#" + inp.getAttribute("aria-labelledby")).textContent,
          row.querySelector('[data-act="calc-toggle"]').getAttribute("aria-label"),
          row.querySelector('[data-act="addon-remove"]').getAttribute("aria-label"),
        ];
      })
    );
    ok(
      J(names) ===
        J([
          ["Transfer charge", "Calculator for the transfer charge", "Remove the transfer charge"],
          ["Extra", "Calculator for the extra", "Remove the extra"],
        ]),
      "TalkBack names each row's field, calculator and ✕ " + J(names)
    );
    const bars = await page.evaluate(() =>
      ["f-charge", "f-extra", "f-amt"].map(id => {
        calcToggle(id, calcToggleBtn(id));
        const name = ($("#cr-" + id + " .calcname") || {}).textContent || "";
        calcClose(id, calcToggleBtn(id));
        return name;
      })
    );
    ok(
      J(bars) === J(["Transfer charge", "Extra", "Amount"]),
      "the keypad's bar names each row, and the amount while the card is open " + J(bars)
    );
    // ✕ on a row leaves one row and brings its button back
    await tap('#sheet [data-act="addon-remove"][data-v="xcharge"]');
    lk = await look();
    ok(
      J(lk.rows) === J(["extra"]) &&
        lk.group === "Extra" &&
        J(lk.adds) === J(["xcharge"]) &&
        (await prev()) === "Bkash " + tk(1000, "-") + " · Rafi owes " + tk(1150),
      "✕ on the transfer charge: one row left, + Transfer charge back, ● Bkash −৳1,000.00 · Rafi owes ৳1,150.00 " +
        J(lk) +
        " " +
        (await prev())
    );
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "100");
    lk = await look();
    ok(J(lk.rows) === J(["xcharge", "extra"]), "… and it opens again above the extra " + J(lk));
    // saved: the draw with onTop 150 and its linked loan transfer charge of 100
    await tap('#sheet [data-act="loan-save"]');
    let d = await db();
    const rl = d.loans.find(l => l.person === "Rafi"),
      rd = rl && d.txns.find(t => t.loan === rl.id && t.principal && !t.feeOf),
      rc = rd && d.txns.find(t => t.id === rd.feeId);
    ok(
      !!rd &&
        rd.amount === 1000 &&
        rd.onTop === 150 &&
        rd.account === "k" &&
        !!rc &&
        rc.feeOf === rd.id &&
        rc.type === "loan" &&
        rc.dir === "out" &&
        rc.principal === true &&
        rc.loan === rl.id &&
        rc.amount === 100 &&
        rc.account === "k" &&
        rc.date === rd.date,
      "saved: a draw with onTop 150 and a linked loan transfer charge of ৳100.00 " + J([rd, rc])
    );
    ok(d.bal.k === 18400, "Bkash −৳1,100.00 (৳20,000.00 − Nila's ৳500.00 − ৳1,100.00) " + d.bal.k);
    ok(
      (await snackText()).startsWith("Lent " + tk(1000) + " to Rafi · Rafi owes " + tk(1250)),
      "Lent ৳1,000.00 to Rafi · Rafi owes ৳1,250.00 " + (await snackText())
    );
    await page.evaluate(() => ((V.screen = "assets"), render()));
    const arow = await txt('#app [data-act="loan-open"][data-v="' + rl.id + '"]');
    ok(arow.includes(tk(1250)), "Assets: Rafi ৳1,250.00 " + arow);
    const hr = await page.evaluate(id => {
      openHistory();
      const a = document.querySelector('#app .tx[data-v="' + id + '"] .a'),
        c = s => s.replace(/⁠/g, "").replace(/\s+/g, " ").trim();
      return a
        ? {
            amt: c(
              [...a.childNodes]
                .filter(n => n.nodeName !== "SMALL")
                .map(n => n.textContent)
                .join("")
            ),
            small: [...a.querySelectorAll("small")].map(s => c(s.textContent)),
          }
        : null;
    }, rd.id);
    ok(
      !!hr && hr.amt === tk(1000, "-") && J(hr.small) === J(["+ " + tk(100) + " transfer charge"]),
      "History: −৳1,000.00 / + ৳100.00 transfer charge " + J(hr)
    );
    await page.evaluate(() => ((V.screen = "home"), render()));

    // a lend without add-ons says what it says today
    await fresh("lend");
    await typeIn("#sheet #f-person", "Tom");
    await typeIn("#sheet #f-amt", "300");
    await tap('#sheet [data-act="loan-save"]');
    ok(
      (await snackText()).startsWith("Lent " + tk(300) + " to Tom") && !(await snackText()).includes("owes"),
      "a lend without either: “Lent ৳300.00 to Tom” " + (await snackText())
    );

    // an extra that can't be read, or is below 0, saves nothing
    await fresh("lend");
    await typeIn("#sheet #f-person", "Rafi");
    await typeIn("#sheet #f-amt", "1000");
    await tap('#sheet [data-act="addon-add"][data-v="extra"]');
    await page.evaluate(() => ($("#f-extra").value = "1+"));
    await tap('#sheet [data-act="loan-save"]');
    d = await db();
    ok(
      (await snackText()).includes("That extra isn't a number") && d.loans.length === 1,
      "an unreadable extra: “That extra isn't a number”, nothing saved " + (await snackText())
    );
    await page.evaluate(() => ($("#f-extra").value = "−5"));
    await tap('#sheet [data-act="loan-save"]');
    d = await db();
    ok(
      (await snackText()).includes("An extra can't be negative") && d.loans.length === 1,
      "a negative extra: “An extra can't be negative” " + (await snackText())
    );
    await page.evaluate(() => ($("#f-extra").value = "0"));
    await tap('#sheet [data-act="loan-save"]');
    d = await db();
    const r0 = d.loans.find(l => l.person === "Rafi"),
      r0d = r0 && d.txns.find(t => t.loan === r0.id && t.principal);
    ok(
      !!r0d && r0d.onTop === undefined && !r0d.feeId && (await snackText()).startsWith("Lent " + tk(1000) + " to Rafi"),
      "an extra of 0 saves as nothing " + J(r0d) + " " + (await snackText())
    );

    // a charge setAddOn() refuses is never dropped silently
    await fresh("lend");
    await typeIn("#sheet #f-person", "Rafi");
    await typeIn("#sheet #f-amt", "1000");
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "20");
    await page.evaluate(() => {
      window.__setAddOn = setAddOn;
      setAddOn = () => false;
    });
    await tap('#sheet [data-act="loan-save"]');
    d = await db();
    ok(
      (await snackText()).includes("That charge isn't a number") && d.loans.length === 1,
      "a lend whose charge is refused is not saved " + (await snackText())
    );
    await page.evaluate(() => (setAddOn = window.__setAddOn));

    // the low-balance question counts the transfer charge: Cash ৳1,050.00, lend ৳1,000.00 + ৳100.00
    await fresh("lend");
    await typeIn("#sheet #f-person", "Rafi");
    await tap('#sheet [data-act="f-acc"][data-v="c"]');
    await typeIn("#sheet #f-amt", "1000");
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "100");
    await tap('#sheet [data-act="loan-save"]');
    ok(
      (await visible('#pop [data-act="ask-ok"]')) && (await db()).loans.length === 1,
      "the low-balance question counts the transfer charge (Cash would be −৳50.00)"
    );
    await tap('#pop [data-act="ask-ok"]');
    d = await db();
    ok(d.bal.c === -50 && d.loans.length === 2, "… Save anyway: Cash −৳50.00 " + d.bal.c);

    // a merge into an open tab: the new draw keeps its own add-ons; the hint, the preview and the message say the tab
    await fresh("lend");
    await tap('#sheet [data-act="f-acc"][data-v="k"]');
    await typeIn("#sheet #f-person", "Nila");
    await typeIn("#sheet #f-amt", "1000");
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "100");
    await tap('#sheet [data-act="addon-add"][data-v="extra"]');
    await typeIn("#sheet #f-extra", "150");
    ok(
      (await txt("#sheet #f-mergehint")).includes(tk(1750)) &&
        (await prev()) === "Bkash " + tk(1100, "-") + " · Nila owes " + tk(1750),
      "merging into Nila's ৳500.00: the hint and ● Bkash −৳1,100.00 · Nila owes ৳1,750.00 " +
        (await txt("#sheet #f-mergehint")) +
        " " +
        (await prev())
    );
    await tap('#sheet [data-act="loan-save"]');
    d = await db();
    const nd = d.txns.find(t => t.loan === "N" && t.principal && !t.feeOf && t.id !== "nD"),
      nc = nd && d.txns.find(t => t.id === nd.feeId);
    ok(
      d.loans.length === 1 &&
        !!nd &&
        nd.onTop === 150 &&
        !!nc &&
        nc.feeOf === nd.id &&
        nc.loan === "N" &&
        nc.amount === 100 &&
        !d.txns.find(t => t.id === "nD").onTop &&
        !d.txns.find(t => t.id === "nD").feeId,
      "… the new draw keeps its add-ons, the first draw stays as it was " + J(d.txns)
    );
    ok(
      (await snackText()).startsWith("Lent " + tk(1000) + " to Nila · Nila owes " + tk(1750)) &&
        (await page.evaluate(() => loanInfo(loan("N")).left)) === 1750,
      "… Lent ৳1,000.00 to Nila · Nila owes ৳1,750.00 " + (await snackText())
    );

    // Borrow: + Add charges, its card "Charges BDT 100", "you owe" until a name is typed
    await fresh("borrow");
    await tap('#sheet [data-act="f-acc"][data-v="a"]');
    await typeIn("#sheet #f-amt", "1000");
    ok(
      (await line()) === "Bank " + tk(1000, "+") + " · you owe " + tk(1000),
      "borrow: ● Bank +৳1,000.00 · you owe ৳1,000.00 before a name " + (await line())
    );
    await typeIn("#sheet #f-person", "Rafi");
    lk = await look();
    ok(
      (await line()) === "Bank " + tk(1000, "+") + " · you owe Rafi " + tk(1000) &&
        J(lk.adds) === J(["charges"]) &&
        (await txt('#sheet [data-act="addon-add"][data-v="charges"]')) === "Add charges",
      "… then ● Bank +৳1,000.00 · you owe Rafi ৳1,000.00, and + Add charges " + (await line())
    );
    await tap('#sheet [data-act="addon-add"][data-v="charges"]');
    await typeIn("#sheet #f-charge", "100");
    lk = await look();
    const bn = await page.evaluate(() => {
      const row = $("#sheet .aorow:not([hidden])");
      return [
        row.querySelector(".aol").textContent,
        row.querySelector(".aocur").textContent,
        row.querySelector("input").value,
        row.querySelector('[data-act="calc-toggle"]').getAttribute("aria-label"),
        row.querySelector('[data-act="addon-remove"]').getAttribute("aria-label"),
      ];
    });
    ok(
      J(bn) === J(["Charges", "BDT", "100", "Calculator for the charges", "Remove the charges"]) &&
        lk.group === "Charges" &&
        J(lk.adds) === J([]) &&
        (await prev()) === "Bank " + tk(1000, "+") + " · you owe Rafi " + tk(1100),
      "Charges BDT 100, ● Bank +৳1,000.00 · you owe Rafi ৳1,100.00 " + J(bn) + " " + (await prev())
    );
    ok(
      (await page.evaluate(() => {
        calcToggle("f-charge", calcToggleBtn("f-charge"));
        const n = ($("#cr-f-charge .calcname") || {}).textContent;
        calcClose("f-charge", calcToggleBtn("f-charge"));
        return n;
      })) === "Charges",
      "the keypad's bar names Charges"
    );
    await tap('#sheet [data-act="f-acc"][data-v="k"]');
    ok(
      (await prev()) === "Bkash " + tk(1000, "+") + " · you owe Rafi " + tk(1100),
      "the preview follows the account " + (await prev())
    );
    await tap('#sheet [data-act="f-acc"][data-v="a"]');
    await tap('#sheet [data-act="loan-save"]');
    d = await db();
    const bl = d.loans.find(l => l.kind === "borrow"),
      bd = bl && d.txns.find(t => t.loan === bl.id && t.principal);
    ok(
      !!bd && bd.onTop === 100 && !bd.feeId && bd.account === "a" && d.bal.a === 51000,
      "saved with onTop 100 and Bank +৳1,000.00 " + J(bd) + " " + d.bal.a
    );
    ok(
      (await snackText()).startsWith("Borrowed " + tk(1000) + " from Rafi · you owe " + tk(1100)),
      "Borrowed ৳1,000.00 from Rafi · you owe ৳1,100.00 " + (await snackText())
    );
    const bh = await page.evaluate(id => {
      openHistory();
      const a = document.querySelector('#app .tx[data-v="' + id + '"] .a');
      return a
        ? {
            amt: a.textContent.replace(/⁠/g, "").replace(/\s+/g, " ").trim(),
            small: a.querySelectorAll("small").length,
          }
        : null;
    }, bd.id);
    ok(!!bh && bh.amt === tk(1000, "+") && bh.small === 0, "History: +৳1,000.00 with no small line " + J(bh));
    await page.evaluate(() => ((V.screen = "home"), render()));
  } catch (e) {
    ok(false, "The lend and borrow forms: " + e.message.split("\n")[0]);
  }

  // ---- 26. the Spent form's charge (docs/specs/charges.md, "The buttons", "The card", "Previews", "Saving"; spend
  // with charge): "+ Add a charge" under the account chips, its card with the one preview, what is saved and said, the
  // charge kept in the purchase's category, an edit keeping it linked, ✕ removing it; and Received with none
  try {
    const spendBook = () => ({
      v: 8,
      settings,
      accounts: [
        acct("cc", "Credit card", "card", "BDT", 0),
        acct("a", "Bank", "bank", "BDT", 50000),
        acct("c", "Cash", "cash", "BDT", 1050),
        acct("u", "Dollars", "savings", "USD", 1000),
      ],
      types: [],
      cats: cats8,
      txns: [],
      loans: [],
      assets: [],
    });
    const cl = s =>
      String(s || "")
        .replace(/⁠/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const tap = async sel => {
      await page.click(sel);
      await page.waitForTimeout(320);
    };
    const fresh = (type, catId, id) =>
      page.evaluate(
        ([o, type, catId, id]) => {
          closeSheet2();
          closeSheet();
          closePop();
          if (o) {
            S = migrate(o);
            RBC = LPC = null;
            commit();
          }
          render();
          txSheet(id || null, type, catId);
        },
        [id ? null : spendBook(), type, catId, id]
      );
    const tk = await page
      .evaluate(() => money(1234.5, "BDT"))
      .then(
        t => (n, sign) =>
          (sign === "-" ? "−" : sign === "+" ? "+" : "") +
          cl(t).replace(/1,234\.50/, Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 }))
      );
    const txt = sel => page.evaluate(s => (document.querySelector(s) || {}).textContent || "", sel).then(cl);
    const snackText = () => txt("#snack");
    const db = () => page.evaluate(() => JSON.parse(JSON.stringify({ txns: S.txns, bal: balances() })));
    const typeIn = async (sel, v) => {
      await page.fill(sel, v);
      await page.waitForTimeout(60);
    };
    const line = () => txt("#sheet .aoline");
    const prev = () => txt("#sheet .aocard .aoprev");
    /* what spending each part counts in BDT (spendItems()), the day's total (spentOn()) */
    const parts = () =>
      page.evaluate(() => {
        const o = {};
        spendItems("BDT").forEach(x => (o[x.cat] = rnd((o[x.cat] || 0) + x.amount)));
        return { o, day: spentOn(S.txns.length ? S.txns[0].date : today(), "BDT") };
      });
    const look = () =>
      page.evaluate(() => {
        const card = $("#sheet .aocard"),
          adds = $("#sheet .aoadds");
        return {
          card: !!card && !card.hidden,
          group: card && card.getAttribute("aria-label"),
          rows: card ? [...card.querySelectorAll(".aorow")].filter(r => !r.hidden).map(r => r.dataset.k) : [],
          adds: adds ? [...adds.children].filter(b => !b.hidden && b.offsetParent).map(b => b.dataset.v) : [],
          focus: document.activeElement && document.activeElement.id,
          focusAdd: !!document.activeElement && document.activeElement.dataset.act === "addon-add",
        };
      });

    // Spent: "+ Add a charge" under the account chips, above note and date; no preview while nothing is added
    await fresh("expense", "food");
    await tap('#sheet [data-act="f-acc"][data-v="cc"]');
    await typeIn("#sheet #f-amt", "1000");
    let lk = await look();
    ok(
      !lk.card &&
        J(lk.adds) === J(["charge"]) &&
        (await txt('#sheet [data-act="addon-add"][data-v="charge"]')) === "Add a charge" &&
        (await line()) === "" &&
        (await prev()) === "",
      "Spent: + Add a charge, no card and no preview yet " + J(lk) + " " + (await line())
    );
    ok(
      await page.evaluate(() => {
        const b = $('#sheet [data-act="addon-add"][data-v="charge"]'),
          chips = $('#sheet [data-act="f-acc"]').parentElement,
          note = $("#sheet #f-note");
        return (
          !!(chips.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) &&
          !!(b.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING)
        );
      }),
      "… under the account chips, above note and date"
    );
    // the card: its names, its code, its preview
    await tap('#sheet [data-act="addon-add"][data-v="charge"]');
    lk = await look();
    ok(
      lk.card &&
        J(lk.rows) === J(["charge"]) &&
        lk.group === "Charge" &&
        J(lk.adds) === J([]) &&
        lk.focus === "f-charge",
      "+ Add a charge opens the Charge card with its field focused, the button gone " + J(lk)
    );
    ok((await prev()) === "", "an empty charge adds nothing: no preview " + (await prev()));
    const names = await page.evaluate(() => {
      const inp = $("#f-charge"),
        row = inp.closest(".aorow");
      return [
        $("#" + inp.getAttribute("aria-labelledby")).textContent,
        row.querySelector(".aocur").textContent,
        row.querySelector('[data-act="calc-toggle"]').getAttribute("aria-label"),
        row.querySelector('[data-act="addon-remove"]').getAttribute("aria-label"),
      ];
    });
    ok(
      J(names) === J(["Charge", "BDT", "Calculator for the charge", "Remove the charge"]),
      "Charge BDT, Calculator for the charge, Remove the charge " + J(names)
    );
    await typeIn("#sheet #f-charge", "150");
    ok(
      (await prev()) === "Credit card " + tk(1150, "-") + " · " + tk(1000) + " + charge " + tk(150) &&
        (await line()) === "",
      "● Credit card −৳1,150.00 · ৳1,000.00 + charge ৳150.00, in the card only " + (await prev())
    );
    ok(
      await page.evaluate(() =>
        [...document.querySelectorAll("#sheet .aoprev b")]
          .map(b => b.textContent)
          .join("|")
          .includes("1,150")
      ),
      "… its figures in bold"
    );
    const bars = await page
      .evaluate(() =>
        ["f-charge", "f-amt"].map(id => {
          calcToggle(id, calcToggleBtn(id));
          if (id === "f-charge") ["+", "5"].forEach(calcKey);
          const name = ($("#cr-" + id + " .calcname") || {}).textContent || "",
            p = $("#sheet .aoprev").textContent;
          calcClose(id, calcToggleBtn(id));
          return [name, p];
        })
      )
      .then(b => b.map(([n, p]) => [n, cl(p)]));
    ok(
      bars[0][0] === "Charge" && bars[1][0] === "Amount" && bars[0][1].includes("+ charge " + tk(155)),
      "the keypad's bar names Charge (and its sum counts in the preview), then Amount " + J(bars)
    );
    await typeIn("#sheet #f-charge", "150");
    // the code and the preview follow the account
    await tap('#sheet [data-act="f-acc"][data-v="u"]');
    ok(
      (await txt("#sheet .aocard .aocur")) === "USD" && (await prev()).startsWith("Dollars "),
      "the card's code follows the account (USD) " + (await txt("#sheet .aocard .aocur")) + " " + (await prev())
    );
    await tap('#sheet [data-act="f-acc"][data-v="cc"]');
    ok((await txt("#sheet .aocard .aocur")) === "BDT", "… and back (BDT)");
    // saved: the purchase and its linked charge in its category; the message says the total
    await tap('#sheet [data-act="tx-save"]');
    let d = await db();
    const p = d.txns.find(t => !t.feeOf),
      c = p && d.txns.find(t => t.id === p.feeId);
    ok(
      !!p &&
        p.type === "expense" &&
        p.amount === 1000 &&
        p.cat === "food" &&
        p.account === "cc" &&
        !!c &&
        c.feeOf === p.id &&
        c.type === "expense" &&
        c.amount === 150 &&
        c.cat === "food" &&
        c.account === "cc" &&
        c.date === p.date &&
        c.ts === p.ts + 1 &&
        d.txns.length === 2,
      "saved: ৳1,000.00 in Eating out and its linked ৳150.00 charge, same account, day and category " + J(d.txns)
    );
    ok(d.bal.cc === -1150, "Credit card −৳1,150.00 " + d.bal.cc);
    ok(
      (await snackText()).startsWith(tk(1150, "-") + " · Eating out"),
      "−৳1,150.00 · Eating out " + (await snackText())
    );
    let q = await parts();
    ok(
      J(q.o) === J({ food: 1150 }) && q.day === 1150,
      "spending: Eating out ৳1,150.00, nothing in Charges; the day ৳1,150.00 " + J(q)
    );
    // the charge opens its purchase; the purchase opens with its card open and filled
    await fresh("expense", null, c.id);
    lk = await look();
    ok(
      (await txt("#sheet h2")).length > 0 &&
        (await page.evaluate(() => F.id)) === p.id &&
        lk.card &&
        J(lk.rows) === J(["charge"]) &&
        J(lk.adds) === J([]) &&
        (await page.inputValue("#sheet #f-charge")) === "150.00" &&
        (await prev()) === "Credit card " + tk(1150, "-") + " · " + tk(1000) + " + charge " + tk(150),
      "the charge opens its purchase, the card open with ৳150.00 and its preview " +
        J(lk) +
        " " +
        (await page.inputValue("#sheet #f-charge").catch(() => ""))
    );
    // an edit: another category and charge, the charge moves with it and keeps its link
    await page.evaluate(() => pickCat("groceries"));
    await typeIn("#sheet #f-charge", "200");
    await tap('#sheet [data-act="tx-save"]');
    d = await db();
    const c2 = d.txns.find(t => t.feeOf === p.id),
      p2 = d.txns.find(t => t.id === p.id);
    ok(
      !!c2 &&
        c2.id === c.id &&
        p2.feeId === c.id &&
        c2.amount === 200 &&
        c2.cat === "groceries" &&
        p2.cat === "groceries" &&
        d.txns.length === 2 &&
        d.bal.cc === -1200,
      "edited: the charge keeps its id and link, ৳200.00 in Groceries; Credit card −৳1,200.00 " + J(d.txns)
    );
    q = await parts();
    ok(J(q.o) === J({ groceries: 1200 }), "changing the purchase's category moves its charge " + J(q));
    // the account and day of an edit move the charge with them
    await fresh("expense", null, p.id);
    await tap('#sheet [data-act="f-acc"][data-v="a"]');
    await page.evaluate(d => setDateField($("#f-date"), d), D.d2);
    await tap('#sheet [data-act="tx-save"]');
    d = await db();
    const c3 = d.txns.find(t => t.feeOf === p.id);
    ok(
      !!c3 && c3.account === "a" && c3.date === D.d2 && d.bal.a === 48800 && d.bal.cc === 0,
      "an edit's account and day move its charge: Bank −৳1,200.00, Credit card back to 0 " + J(c3) + J(d.bal)
    );
    // ✕ removes it: the linked entry goes, balances exact
    await fresh("expense", null, p.id);
    await tap('#sheet [data-act="addon-remove"][data-v="charge"]');
    lk = await look();
    ok(
      !lk.card && J(lk.adds) === J(["charge"]) && lk.focusAdd,
      "✕ closes the card and brings + Add a charge back, with the focus " + J(lk)
    );
    await tap('#sheet [data-act="tx-save"]');
    d = await db();
    ok(
      d.txns.length === 1 && !d.txns[0].feeId && d.bal.a === 49000,
      "saved without it: the charge is deleted, Bank −৳1,000.00 " + J(d.txns) + " " + d.bal.a
    );
    // Undo brings the charge back
    await page.evaluate(() => {
      const u = $('#snack [data-act="undo"], #snack button');
      if (u) u.click();
    });
    await page.waitForTimeout(100);
    d = await db();
    ok(
      d.txns.length === 2 && d.txns.some(t => t.feeOf === p.id) && d.bal.a === 48800,
      "Undo brings the charge back " + J(d.txns.length) + " " + d.bal.a
    );

    // checks: not a number, negative, 0
    for (const [v, said] of [
      ["abc", "That charge isn't a number"],
      ["-5", "A charge can't be negative"],
    ]) {
      await fresh("expense", "food");
      await typeIn("#sheet #f-amt", "100");
      await tap('#sheet [data-act="addon-add"][data-v="charge"]');
      await page.evaluate(v => ($("#f-charge").value = v), v);
      await tap('#sheet [data-act="tx-save"]');
      d = await db();
      ok(
        d.txns.length === 0 && (await snackText()).startsWith(said) && !!(await page.$("#sheet #f-charge")),
        v + ": “" + said + "”, nothing saved " + (await snackText())
      );
    }
    await fresh("expense", "food");
    await tap('#sheet [data-act="f-acc"][data-v="cc"]');
    await typeIn("#sheet #f-amt", "100");
    await tap('#sheet [data-act="addon-add"][data-v="charge"]');
    await typeIn("#sheet #f-charge", "0");
    await tap('#sheet [data-act="tx-save"]');
    d = await db();
    ok(
      d.txns.length === 1 && !d.txns[0].feeId && (await snackText()).startsWith(tk(100, "-") + " · Eating out"),
      "0 saves no charge: −৳100.00 · Eating out " + J(d.txns) + " " + (await snackText())
    );
    // the low-balance question counts the charge
    await fresh("expense", "food");
    await tap('#sheet [data-act="f-acc"][data-v="c"]');
    await typeIn("#sheet #f-amt", "1000");
    await tap('#sheet [data-act="addon-add"][data-v="charge"]');
    await typeIn("#sheet #f-charge", "100");
    await tap('#sheet [data-act="tx-save"]');
    ok(
      !!(await page.$('#pop [data-act="ask-ok"]')) && (await db()).txns.length === 0,
      "Cash ৳1,050.00: ৳1,000.00 + ৳100.00 charge asks first"
    );
    await tap('#pop [data-act="ask-ok"]');
    d = await db();
    ok(d.txns.length === 2 && d.bal.c === -50, "Save anyway: both saved, Cash −৳50.00 " + d.bal.c);
    // a charge refused by setAddOn(): nothing saved
    await fresh("expense", "food");
    await tap('#sheet [data-act="f-acc"][data-v="cc"]');
    await typeIn("#sheet #f-amt", "100");
    await tap('#sheet [data-act="addon-add"][data-v="charge"]');
    await typeIn("#sheet #f-charge", "10");
    await page.evaluate(() => {
      window.__setAddOn = setAddOn;
      setAddOn = () => false;
    });
    await tap('#sheet [data-act="tx-save"]');
    await page.evaluate(() => (setAddOn = window.__setAddOn));
    d = await db();
    ok(
      d.txns.length === 0 && (await snackText()).startsWith("That charge isn't a number"),
      "refused by setAddOn(): “That charge isn't a number”, nothing saved " + J(d.txns)
    );
    // deleting the purchase deletes its charge
    await fresh("expense", "food");
    await tap('#sheet [data-act="f-acc"][data-v="cc"]');
    await typeIn("#sheet #f-amt", "1000");
    await tap('#sheet [data-act="addon-add"][data-v="charge"]');
    await typeIn("#sheet #f-charge", "150");
    await tap('#sheet [data-act="tx-save"]');
    const pid = (await db()).txns.find(t => !t.feeOf).id;
    await page.evaluate(id => deleteEntries([id]), pid);
    d = await db();
    ok(d.txns.length === 0 && d.bal.cc === 0, "deleting the purchase deletes its charge " + J(d.txns));

    /* a figure that shows as 0 in its currency saves as nothing, so no preview counts it: ¥0.4 (JPY has no decimals) on
       Spent, a transfer, the payment cards and the lend form */
    const yenBook = () => {
      const o = spendBook();
      o.accounts.push(acct("y", "Yen", "cash", "JPY", 100000), acct("y2", "Yen wallet", "wallet", "JPY", 0));
      o.txns.push(
        x("jD", 100, D.d1, "loan", 10000, "y", { dir: "in", loan: "J", principal: true }),
        x("lD", 110, D.d1, "loan", 10000, "y", { dir: "out", loan: "L", principal: true })
      );
      o.loans.push(loanOf("J", "borrow", "Jun", "y", D.d1), loanOf("L", "lend", "Lin", "y", D.d1));
      return o;
    };
    const yen = (n, sign) =>
      page.evaluate(n => money(n, "JPY"), n).then(t => (sign === "-" ? "−" : sign === "+" ? "+" : "") + cl(t));
    const yenFresh = open =>
      page.evaluate(
        ([o, open]) => {
          closeSheet2();
          closeSheet();
          closePop();
          S = migrate(o);
          RBC = LPC = null;
          commit();
          render();
          new Function(open)();
        },
        [yenBook(), open]
      );
    const both = async () => cl((await line()) + " " + (await prev()));
    await yenFresh('txSheet(null, "expense", "food")');
    await tap('#sheet [data-act="f-acc"][data-v="y"]');
    await typeIn("#sheet #f-amt", "1000");
    await tap('#sheet [data-act="addon-add"][data-v="charge"]');
    await typeIn("#sheet #f-charge", "0.4");
    ok((await both()) === "", "Spent: a ¥0.4 charge shows as ¥0: no preview " + (await both()));
    await tap('#sheet [data-act="tx-save"]');
    d = await db();
    const yp = d.txns.filter(t => t.type === "expense");
    ok(
      yp.length === 1 && !yp[0].feeId && (await snackText()).startsWith((await yen(1000, "-")) + " · Eating out"),
      "… and it saves without a charge: −¥1,000 · Eating out " + J(yp) + " " + (await snackText())
    );
    await yenFresh("trSheet()");
    await page.evaluate(() => {
      F.from = "y";
      F.to = "y2";
      trSync();
    });
    await typeIn("#sheet #f-amt", "1000.2");
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "0.4");
    ok(
      (await both()) === "Yen " + (await yen(1000.2, "-")) + " · Yen wallet " + (await yen(1000.2, "+")),
      "a transfer: a ¥0.4 transfer charge adds nothing to ● Yen −¥1,000 " + (await both())
    );
    await yenFresh('loanOpen("J")');
    await typeIn("#sheet #f-amt", "1000");
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "0.4");
    ok((await both()) === "", "paying back a loan: a ¥0.4 transfer charge, no preview " + (await both()));
    await yenFresh('loanOpen("L")');
    await typeIn("#sheet #f-amt", "1000");
    await tap('#sheet [data-act="addon-add"][data-v="extra"]');
    await typeIn("#sheet #f-extra", "0.4");
    ok((await both()) === "", "being paid back: a ¥0.4 extra, no preview " + (await both()));
    await yenFresh('loanForm("lend")');
    await tap('#sheet [data-act="f-acc"][data-v="y"]');
    await typeIn("#sheet #f-amt", "1000");
    await tap('#sheet [data-act="addon-add"][data-v="xcharge"]');
    await typeIn("#sheet #f-charge", "0.4");
    await tap('#sheet [data-act="addon-add"][data-v="extra"]');
    await typeIn("#sheet #f-extra", "0.4");
    ok(
      (await both()) === "Yen " + (await yen(1000, "-")) + " · Someone owes " + (await yen(1000)),
      "the lend form: ¥0.4 transfer charge and extra, ● Yen −¥1,000 · Someone owes ¥1,000 " + (await both())
    );

    // Received: no button, no card, no preview
    await fresh("income", "income");
    await typeIn("#sheet #f-amt", "1000");
    const rv = await page.evaluate(() => ({
      card: !!$("#sheet .aocard"),
      adds: !!$('#sheet [data-act="addon-add"]'),
      line: ($("#sheet .aoline") || {}).textContent || "",
      calc: document.querySelectorAll('#sheet [data-act="calc-toggle"]').length,
    }));
    ok(!rv.card && !rv.adds && rv.line === "" && rv.calc === 1, "Received: no button, no card, no preview " + J(rv));
    await page.evaluate(() => (closeSheet(), (V.screen = "home"), render()));
  } catch (e) {
    ok(false, "The Spent form's charge: " + e.message.split("\n")[0]);
  }

  ok(errors.length === 0, "no page errors " + J(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
