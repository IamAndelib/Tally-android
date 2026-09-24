/*
 * state.js — The notebook's data (S) and how it is stored: the default state, migrate() for any older save or backup,
 * loading and saving to localStorage, look-ups, and the balance maths (balances, runBal). Every change to
 * entries goes through withUndo(); saves that take money out go through guardOverdraw().
 */
"use strict";

const LS = "tally:v1";
function blank() {
  return {
    v: 6,
    settings: { cur: "CAD", theme: "system", remind: { daily: true, time: "21:00", dues: true } },
    accounts: [],
    types: [],
    cats: CATS.map(c => ({ ...c })),
    txns: [],
    loans: [],
    assets: [],
  };
}
/* Brings any saved state or backup (old or new format) to the current shape without changing any balance. */
function migrate(o) {
  const s = blank();
  if (!o || typeof o !== "object") return s;
  Object.assign(s.settings, o.settings || {});
  s.settings.customCols = (Array.isArray(s.settings.customCols) ? s.settings.customCols : [])
    .filter(c => /^#[0-9a-f]{6}$/.test(c))
    .slice(0, 6);
  s.settings.hiddenCols = (Array.isArray(s.settings.hiddenCols) ? s.settings.hiddenCols : []).filter(c =>
    PALETTE.includes(c)
  );
  s.settings.hiddenTypes = (Array.isArray(s.settings.hiddenTypes) ? s.settings.hiddenTypes : []).filter(k => TYPES[k]);
  s.types = (Array.isArray(o.types) ? o.types : [])
    .filter(t => t && t.id && t.name && !TYPES[t.id])
    .map(t => ({
      id: String(t.id),
      name: String(t.name).slice(0, 20),
      i: t.i && ICONS[t.i] ? t.i : "account_balance_wallet",
      c: /^#[0-9a-f]{6}$/i.test(t.c) ? t.c : "#5f7389",
    }));
  s.accounts = (Array.isArray(o.accounts) ? o.accounts : [])
    .filter(a => a && a.id)
    .map(a => ({
      id: String(a.id),
      name: String(a.name || "Account"),
      type: TYPES[a.type] || s.types.some(t => t.id === a.type) ? a.type : "bank",
      currency: String(a.currency || s.settings.cur),
      opening: +a.opening || 0,
      archived: !!a.archived,
      i: a.i && ICONS[a.i] ? a.i : "",
      e: a.i ? "" : String(a.e || ""),
      c: /^#[0-9a-f]{6}$/i.test(a.c) ? a.c : "",
    }));
  if (Array.isArray(o.cats)) {
    const valid = o.cats.filter(c => c && c.id && c.name && c.id !== "transfer");
    if (o.v >= 2) {
      s.cats = valid.map(c => ({
        id: String(c.id),
        name: String(c.name),
        e: c.e || "🏷️",
        c: c.c || "#9AA3B2",
        i: c.i && ICONS[c.i] ? c.i : "",
        kind: c.kind === "in" ? "in" : "out",
        hidden: !!c.hidden,
      }));
      if (!(o.v >= 4))
        s.cats.forEach(c => {
          const d = CATS.find(x => x.id === c.id);
          if (!d) return;
          if (!c.i && c.e === d.e) c.i = d.i;
          if (String(c.c).toLowerCase() === String(OLD_CAT_COLS[c.id] || "").toLowerCase()) c.c = d.c;
        });
      CATS.forEach(d => {
        if (!s.cats.some(c => c.id === d.id)) s.cats.push({ ...d });
      });
    } else {
      valid
        .filter(c => !OLD_DEFAULT_IDS.includes(c.id) && !CATS.some(d => d.id === c.id))
        .forEach(c =>
          s.cats.splice(12, 0, {
            id: String(c.id),
            name: String(c.name),
            e: c.e || "🏷️",
            c: c.c || "#9AA3B2",
            kind: "out",
          })
        );
    }
  }
  const okAcc = new Set(s.accounts.map(a => a.id));
  s.txns = (Array.isArray(o.txns) ? o.txns : [])
    .filter(t => t && t.id && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && isFinite(+t.amount) && okAcc.has(t.account))
    .map(t0 => {
      const t = {
        id: String(t0.id),
        ts: +t0.ts || 0,
        date: t0.date,
        type: t0.type,
        amount: +t0.amount,
        account: t0.account,
        note: String(t0.note || ""),
      };
      if (t0.type === "transfer") {
        t.to = t0.to;
        if (t0.toAmount != null && t0.toAmount !== "" && isFinite(+t0.toAmount)) t.toAmount = +t0.toAmount;
        if (t0.feeId) t.feeId = t0.feeId;
      } else if (t0.type === "adjust") {
        /* signed amount, nothing else */
      } else if (t0.type === "loan") {
        if (!t0.loan) return null;
        t.dir = t0.dir === "in" ? "in" : "out";
        t.loan = String(t0.loan);
        if (t0.principal) t.principal = true;
        if (t0.principal && /^\d{4}-\d{2}-\d{2}$/.test(t0.due || "")) t.due = t0.due;
      } else if (t0.type === "expense" || t0.type === "income") {
        if (t0.cat === "transfer") {
          // v1 imported one-sided "own transfer" rows: keep their balance effect, never count as spending
          t.type = "adjust";
          t.amount = t0.type === "expense" ? -Math.abs(t.amount) : Math.abs(t.amount);
          if (!t.note) t.note = "Transfer (not tracked)";
        } else {
          let c = t0.cat || (t0.type === "income" ? "income" : "other");
          if (t0.type === "income" && c === "family") c = "gift";
          if (t0.type === "income" && c === "other") c = "otherin";
          t.cat = c;
          if (t0.feeOf) t.feeOf = t0.feeOf;
        }
      } else return null;
      return t;
    })
    .filter(Boolean);
  s.loans = (Array.isArray(o.loans) ? o.loans : [])
    .filter(
      l =>
        l &&
        l.id &&
        (l.kind === "borrow" || l.kind === "lend") &&
        okAcc.has(l.account) &&
        (o.v >= 6 || isFinite(+l.amount))
    )
    .map(l => ({
      id: String(l.id),
      ts: +l.ts || 0,
      kind: l.kind,
      person: String(l.person || ""),
      account: l.account,
      date: /^\d{4}-\d{2}-\d{2}$/.test(l.date) ? l.date : today(),
      note: String(l.note || ""),
      status: l.status === "writeoff" ? "writeoff" : "open",
    }));
  /* v6: a loan's due date used to live on the loan itself; move it onto its (first/only) principal draw */
  if (!(o.v >= 6) && Array.isArray(o.loans))
    o.loans.forEach(ol => {
      if (!ol || !/^\d{4}-\d{2}-\d{2}$/.test(ol.due || "")) return;
      const draw = s.txns.find(t => t.type === "loan" && t.principal && t.loan === String(ol.id));
      if (draw && !draw.due) draw.due = ol.due;
    });
  s.assets = (Array.isArray(o.assets) ? o.assets : [])
    .filter(x => x && x.id)
    .map(x => ({
      id: String(x.id),
      name: String(x.name || "Asset"),
      e: x.e && x.e !== "💎" ? x.e : "",
      i: x.i && ICONS[x.i] ? x.i : !x.e || x.e === "💎" ? "diamond" : "",
      c: /^#[0-9a-f]{6}$/i.test(x.c) ? x.c : "#a646c9",
      value: +x.value || 0,
      currency: String(x.currency || s.settings.cur),
    }));
  if (!s.settings.remind || typeof s.settings.remind !== "object")
    s.settings.remind = { daily: true, time: "21:00", dues: true };
  return s;
}
let S = blank();
/* raw text of saved data that couldn't be read at start-up (kept aside under LS+":unreadable" and offered as a file) */
let unreadable = null;
/* Loads the saved notebook. Called once from the start-up code at the end, after every constant migrate() uses exists. */
function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(LS);
  } catch (e) {
    return;
  }
  if (!raw) return;
  try {
    S = migrate(JSON.parse(raw));
  } catch (e) {
    unreadable = raw;
    try {
      const k = LS + ":unreadable",
        had = localStorage.getItem(k);
      if (had !== raw) localStorage.setItem(had ? k + ":" + Date.now() : k, raw);
    } catch (e2) {}
  }
}
function save() {
  try {
    localStorage.setItem(LS, JSON.stringify(S));
  } catch (e) {
    snack("Couldn't save on this phone");
  }
}
function commit() {
  save();
  render();
  syncReminders();
  syncWidget();
}
const cat = id => S.cats.find(c => c.id === id) || S.cats.find(c => c.id === "other") || CATS[11];
const acc = id => S.accounts.find(a => a.id === id);
const activeAccounts = () => S.accounts.filter(a => !a.archived);
const outCats = () => S.cats.filter(c => c.kind === "out" && !c.hidden);
const inCats = () => S.cats.filter(c => c.kind === "in" && !c.hidden);
/* balance of each account right after each entry (date, then time order) and, for loan payments, whether that payment
   left the loan partly paid or cleared. Cached until the next render. */
let RBC = null;
function runBal() {
  if (RBC) return RBC;
  const b = openingBalances(),
    m = {},
    paid = {},
    amt = {};
  S.loans.forEach(l => {
    amt[l.id] = 0;
    paid[l.id] = 0;
  });
  S.txns
    .slice()
    .sort((x, y) => x.date.localeCompare(y.date) || (x.ts || 0) - (y.ts || 0))
    .forEach(t => {
      if (!applyEntry(b, t)) return;
      const r = { a: r2(b[t.account]), t: t.type === "transfer" && t.to in b ? r2(b[t.to]) : null };
      if (t.type === "loan" && t.loan in amt) {
        if (t.principal) amt[t.loan] += t.amount;
        else {
          paid[t.loan] += t.amount;
          r.left = Math.max(0, r2(amt[t.loan] - paid[t.loan]));
          r.ls = r.left <= 0 ? "cleared" : "partly";
        }
      }
      m[t.id] = r;
    });
  return (RBC = m);
}
/* Account balances from starting balance + every entry. With `before`, only entries dated earlier (start of that day). */
function balances(before) {
  const b = openingBalances();
  S.txns.forEach(t => {
    if (!before || t.date < before) applyEntry(b, t);
  });
  for (const k in b) b[k] = r2(b[k]);
  return b;
}
const openingBalances = () => {
  const b = {};
  S.accounts.forEach(a => (b[a.id] = +a.opening || 0));
  return b;
};
/* How one entry moves money: adds its effect to the running balances `b` (account id -> amount).
   False when the entry's account is unknown (then it moves nothing). */
function applyEntry(b, t) {
  if (!(t.account in b)) return false;
  if (t.type === "expense") b[t.account] -= t.amount;
  else if (t.type === "income" || t.type === "adjust") b[t.account] += t.amount;
  else if (t.type === "transfer") {
    b[t.account] -= t.amount;
    if (t.to in b) b[t.to] += t.toAmount != null ? t.toAmount : t.amount;
  } else if (t.type === "loan") b[t.account] += t.dir === "in" ? t.amount : -t.amount;
  return true;
}
function currencies() {
  return [...new Set(activeAccounts().map(a => a.currency))];
}
/* Every add/edit/delete of entries goes through here: snapshot entries, loans and accounts, apply the change,
   save + render once with the feedback `fx`, and offer Undo in the snackbar to restore the snapshot exactly. */
function withUndo(msg, change, fx) {
  const before = JSON.stringify({ txns: S.txns, loans: S.loans, accounts: S.accounts });
  change();
  FX = fx || {};
  commit();
  FX = {};
  snack(msg, () => {
    const o = JSON.parse(before);
    S.txns = o.txns;
    S.loans = o.loans;
    S.accounts = o.accounts;
    commit();
    snack("Undone");
  });
}
/* Money sources (not credit cards) shouldn't go below zero. Try the change on a copy first; if it would take an account
   below zero (now, or at the end of that day) and lower than it already was, ask before saving. */
function guardOverdraw(mutate, date, proceed) {
  const b0 = balances(),
    d0 = balances(addDays(date, 1)),
    T = S.txns,
    L = S.loans;
  let b1, d1;
  S.txns = JSON.parse(JSON.stringify(T));
  S.loans = JSON.parse(JSON.stringify(L));
  try {
    mutate();
    b1 = balances();
    d1 = balances(addDays(date, 1));
  } finally {
    S.txns = T;
    S.loans = L;
  }
  const low = (n, o) => n < -0.004 && n < o - 0.004;
  const bad = S.accounts.find(a => a.type !== "card" && (low(b1[a.id], b0[a.id]) || low(d1[a.id], d0[a.id])));
  if (!bad) {
    proceed();
    return;
  }
  const now = low(b1[bad.id], b0[bad.id]),
    had = now ? b0[bad.id] : d0[bad.id],
    will = now ? b1[bad.id] : d1[bad.id];
  askDialog(
    "Not enough in " + bad.name,
    now
      ? bad.name + " has " + money(had, bad.currency) + ". This would make it " + signed(will, bad.currency) + "."
      : bad.name +
          " had " +
          money(had, bad.currency) +
          " at the end of " +
          shortDay(date) +
          ". This would make it " +
          signed(will, bad.currency) +
          " that day.",
    "Save anyway",
    proceed,
    { cancel: "Go back" }
  );
}
/* delete entries by id, keeping transfers + fees and loans + their payments consistent */
function deleteEntries(ids) {
  ids = new Set(ids);
  const gone = new Set(S.txns.filter(t => ids.has(t.id) && t.type === "loan" && t.principal).map(t => t.loan));
  if (gone.size) {
    S.txns.forEach(t => {
      if (t.type === "loan" && gone.has(t.loan)) ids.add(t.id);
    });
    S.loans = S.loans.filter(l => !gone.has(l.id));
  }
  S.txns.forEach(t => {
    if (ids.has(t.id) && t.feeId) ids.add(t.feeId);
  });
  S.txns = S.txns.filter(t => !ids.has(t.id));
  S.txns.forEach(t => {
    if (t.feeId && ids.has(t.feeId)) delete t.feeId;
  });
}
