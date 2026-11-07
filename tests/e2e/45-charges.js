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
          { of: "ep", date: D.d3, cur: "BDT", amount: 40, as: "income" },
        ]),
      "a payment made before a later draw: its ৳50.00 extra on the payment's day, the later ৳40.00 on its draw's day " +
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
      // a transfer with a ৳10.00 charge, pay, groceries; $50.00 moved with a $1.00 charge; Lee paid back $525.00
      x("tA", 700, dd(0), "transfer", 1000, "a", { to: "k", feeId: "tAc" }),
      x("tAc", 701, dd(0), "expense", 10, "a", { cat: "fees", feeOf: "tA" }),
      x("i1", 710, dd(0), "income", 40000, "a", { cat: "income" }),
      x("g1", 720, dd(0), "expense", 50, "a", { cat: "groceries" }),
      x("uT", 730, dd(0), "transfer", 50, "u", { to: "w", feeId: "uTc" }),
      x("uTc", 731, dd(0), "expense", 1, "u", { cat: "fees", feeOf: "uT" }),
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
    USD: { [dd(-2)]: 22, [dd(0)]: 26 },
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
    ok(
      r.check.BDT.includes(plain(r, "BDT", 1450)) && !r.check.USD.includes(plain(r, "USD", 22)),
      "the morning check: yesterday ৳1,450.00 (the dinner's charge and the plain Fees expense in it) " + r.check.BDT
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

  ok(errors.length === 0, "no page errors " + J(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
