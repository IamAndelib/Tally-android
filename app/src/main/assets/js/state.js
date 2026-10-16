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
    settings: {
      /* the main currency, chosen when the notebook starts ("" until then); weeks start on Monday (0 = Sunday) and
         times show as 24-hour (ISO 8601) until changed in Settings → Region */
      cur: "",
      week: 1,
      clock: "24",
      theme: "system",
      haptics: true,
      hapticLevel: 3,
      donut: "both",
      remind: { daily: true, time: "21:00", dues: true, dueTime: "09:00", check: true, checkTime: "08:00" },
      backup: { on: false, time: "23:00" },
    },
    accounts: [],
    types: [],
    cats: CATS.map(c => ({ ...c, hidden: false })),
    txns: [],
    loans: [],
    assets: [],
  };
}
/* Brings any saved state or backup (old or new format) to the current shape without changing any balance.
   A backup can come from anywhere, so ids, currencies, colours and numbers are checked here, once. */
function migrate(o) {
  const s = blank();
  if (!o || typeof o !== "object") return s;
  /* text from a field that may hold anything (an object would make String() throw); a stored amount (one the app
     worked out, like a balance fix, can be past what a field takes, amtOk(); doubles keep its 3 decimals well beyond);
     a real calendar date (2024-02-30 becomes 2024-03-01, as the app itself would read it) */
  const str = v => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : ""),
    own = (m, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(m, k),
    okNum = v => (typeof v === "number" || typeof v === "string") && Number.isFinite(+v) && Math.abs(+v) < 1e15,
    num = v => (okNum(v) ? +v : 0),
    /* a moment in ms (Date.now()), 0 when there is none; not an amount: today's are past a trillion */
    stamp = v => {
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? +v : NaN;
      return Number.isFinite(n) && n > 0 && n < 8.64e15 ? Math.round(n) : 0;
    },
    /* a date of years 1000–9999 that stays one once read (2024-02-30 is 2024-03-01; 9999-12-32 would be year 10000) */
    isDay = v => typeof v === "string" && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(v) && /^[1-9]\d{3}-/.test(iso(parseISO(v))),
    day = v => iso(parseISO(v)),
    /* the first of each id keeps it, later ones (a hand-made or damaged backup) get their own */
    uniq = list => {
      const seen = new Set();
      list.forEach(x => {
        if (seen.has(x.id)) x.id = "x" + newId();
        seen.add(x.id);
      });
      return list;
    },
    hex = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v),
    isCur = v => /^[A-Z]{3}$/.test(v),
    curOf = v => {
      const c = str(v).trim().toUpperCase();
      return isCur(c) ? c : s.settings.cur || "USD";
    };
  /* every id and every reference to one goes through sid(): the app's own ids pass unchanged, anything else
     (quotes, markup, "__proto__", "constructor") is swapped for a fresh id, the same one everywhere it appears */
  const ids = new Map(),
    sid = v => {
      v = str(v);
      if (/^[A-Za-z0-9-]{1,64}$/.test(v) && !(v in Object.prototype)) return v;
      if (!v) return "x" + newId(); // no usable id: nothing can refer to it either
      if (!ids.has(v)) ids.set(v, "x" + newId());
      return ids.get(v);
    };
  const ver = typeof o.v === "number" ? o.v : 0,
    os = o.settings && typeof o.settings === "object" ? o.settings : {};
  /* only the settings Tally knows, each checked below */
  Object.keys(s.settings)
    .concat(["backupAsk", "customCols", "dragTip", "hiddenCols", "hiddenTypes", "lastAcc", "lastAccIn"])
    .concat(["lastCheck", "savedBackup"])
    .forEach(k => {
      if (own(os, k)) s.settings[k] = os[k];
    });
  /* a missing or broken main currency: an account's, else still to choose (or USD, for accounts with none valid) */
  if (!isCur(s.settings.cur)) {
    const accs = Array.isArray(o.accounts) ? o.accounts.filter(a => a && a.id) : [];
    s.settings.cur = accs.map(a => str(a.currency).trim().toUpperCase()).find(isCur) || (accs.length ? "USD" : "");
  }
  s.settings.week = Number.isInteger(os.week) && os.week >= 0 && os.week <= 6 ? os.week : 1;
  /* saves from before the Time format setting keep what the phone showed them */
  s.settings.clock = os.clock === "12" || os.clock === "24" ? os.clock : phoneClock();
  if (!["system", "light", "dark"].includes(s.settings.theme)) s.settings.theme = "system";
  const obj = v => (v && typeof v === "object" ? v : {}),
    hm = (v, d) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d),
    r = obj(s.settings.remind),
    bk = obj(s.settings.backup);
  s.settings.remind = {
    daily: r.daily !== false,
    time: hm(r.time, "21:00"),
    dues: r.dues !== false,
    dueTime: hm(r.dueTime, "09:00"),
    check: r.check !== false,
    checkTime: hm(r.checkTime, "08:00"),
  };
  s.settings.backup = { on: bk.on === true, time: hm(bk.time, "23:00") };
  /* when a backup was last saved here (ms) and when the auto-backup suggestion last showed (YYYY-MM-DD) */
  if (!(Number.isFinite(s.settings.savedBackup) && s.settings.savedBackup > 0)) delete s.settings.savedBackup;
  if (!isDay(s.settings.backupAsk)) delete s.settings.backupAsk;
  if (!isDay(s.settings.lastCheck)) delete s.settings.lastCheck;
  if (s.settings.dragTip !== true) delete s.settings.dragTip;
  s.settings.haptics = s.settings.haptics !== false;
  s.settings.hapticLevel = Math.min(5, Math.max(1, Math.round(num(s.settings.hapticLevel)) || 3));
  if (!DONUT_MODES.includes(s.settings.donut)) s.settings.donut = "both";
  ["lastAcc", "lastAccIn"].forEach(k => {
    if (s.settings[k] != null) s.settings[k] = sid(s.settings[k]);
  });
  s.settings.customCols = (Array.isArray(s.settings.customCols) ? s.settings.customCols : [])
    .filter(c => typeof c === "string" && /^#[0-9a-f]{6}$/.test(c))
    .slice(0, 6);
  s.settings.hiddenCols = (Array.isArray(s.settings.hiddenCols) ? s.settings.hiddenCols : []).filter(c =>
    PALETTE.includes(c)
  );
  s.settings.hiddenTypes = (Array.isArray(s.settings.hiddenTypes) ? s.settings.hiddenTypes : []).filter(k =>
    own(TYPES, k)
  );
  s.types = (Array.isArray(o.types) ? o.types : [])
    .filter(t => t && t.id && str(t.name) && !own(TYPES, t.id))
    .map(t => ({
      id: sid(t.id),
      name: str(t.name).slice(0, 20),
      i: own(ICONS, t.i) ? t.i : "account_balance_wallet",
      c: hex(t.c) ? t.c : "#5f7389",
    }));
  uniq(s.types);
  s.accounts = (Array.isArray(o.accounts) ? o.accounts : [])
    .filter(a => a && a.id)
    .map(a => {
      const type = own(TYPES, a.type) ? a.type : sid(a.type);
      return {
        id: sid(a.id),
        name: str(a.name) || "Account",
        type: own(TYPES, type) || s.types.some(t => t.id === type) ? type : "bank",
        currency: curOf(a.currency),
        opening: num(a.opening),
        archived: !!a.archived,
        i: own(ICONS, a.i) ? a.i : "",
        e: a.i ? "" : str(a.e),
        c: hex(a.c) ? a.c : "",
      };
    });
  if (Array.isArray(o.cats)) {
    const valid = o.cats.filter(c => c && c.id && str(c.name) && c.id !== "transfer");
    if (ver >= 2) {
      s.cats = valid.map(c => ({
        id: sid(c.id),
        name: str(c.name),
        e: str(c.e) || "🏷️",
        c: hex(c.c) ? c.c : "#9AA3B2",
        i: own(ICONS, c.i) ? c.i : "",
        kind: c.kind === "in" ? "in" : "out",
        hidden: !!c.hidden,
      }));
      if (!(ver >= 4))
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
            id: sid(c.id),
            name: str(c.name),
            e: str(c.e) || "🏷️",
            c: hex(c.c) ? c.c : "#9AA3B2",
            kind: "out",
          })
        );
    }
  }
  uniq(s.cats);
  uniq(s.accounts);
  const okAcc = new Set(s.accounts.map(a => a.id));
  s.txns = (Array.isArray(o.txns) ? o.txns : [])
    .filter(t => t && t.id && isDay(t.date) && okNum(t.amount) && okAcc.has(sid(t.account)))
    .map(t0 => {
      const t = {
        id: sid(t0.id),
        ts: stamp(t0.ts),
        date: day(t0.date),
        type: t0.type,
        amount: +t0.amount,
        account: sid(t0.account),
        note: str(t0.note),
      };
      if (t0.type === "transfer") {
        t.to = sid(t0.to);
        if (t0.toAmount !== "" && okNum(t0.toAmount)) t.toAmount = +t0.toAmount;
        if (t0.feeId) t.feeId = sid(t0.feeId);
      } else if (t0.type === "adjust") {
        /* signed amount, nothing else */
      } else if (t0.type === "loan") {
        if (!t0.loan) return null;
        t.dir = t0.dir === "in" ? "in" : "out";
        t.loan = sid(t0.loan);
        if (t0.principal) t.principal = true;
        if (t0.principal && isDay(t0.due)) t.due = day(t0.due);
        if (!t0.principal && t0.feeId) t.feeId = sid(t0.feeId);
      } else if (t0.type === "expense" || t0.type === "income") {
        if (t0.cat === "transfer") {
          // v1 imported one-sided "own transfer" rows: keep their balance effect, never count as spending
          t.type = "adjust";
          t.amount = t0.type === "expense" ? -Math.abs(t.amount) : Math.abs(t.amount);
          if (!t.note) t.note = "Transfer (not tracked)";
        } else {
          let c = t0.cat ? sid(t0.cat) : t0.type === "income" ? "income" : "other";
          if (t0.type === "income" && c === "family") c = "gift";
          if (t0.type === "income" && c === "other") c = "otherin";
          t.cat = c;
          if (t0.feeOf) t.feeOf = sid(t0.feeOf);
        }
      } else return null;
      return t;
    })
    .filter(Boolean);
  uniq(s.txns);
  /* entries without a time (1.3.1 read times as amounts and dropped them all) get one on their own day, in the order
     they were written, so the newest still comes first; balances don't depend on it */
  s.txns.forEach((t, i) => {
    if (!t.ts) t.ts = parseISO(t.date).getTime() + i;
  });
  /* a transfer or loan payment and its fee point at each other; a fee whose transfer or payment is gone is plain
     spending, and one whose fee is gone has none (balances stay as they are either way) */
  const byId = new Map(s.txns.map(t => [t.id, t])),
    feeHost = x => !!x && (x.type === "transfer" || (x.type === "loan" && !x.principal));
  s.txns.forEach(t => {
    if (t.feeOf && !feeHost(byId.get(t.feeOf))) delete t.feeOf;
    if (t.feeId && (byId.get(t.feeId) || {}).feeOf !== t.id) delete t.feeId;
  });
  /* a loan's account is its newest draw's; if the saved one is gone, take it from the draws rather than lose the loan */
  const newestDraw = id =>
    s.txns
      .filter(t => t.type === "loan" && t.principal && t.loan === id)
      .sort((x, y) => x.date.localeCompare(y.date) || x.ts - y.ts)
      .pop();
  s.loans = (Array.isArray(o.loans) ? o.loans : [])
    .filter(l => l && l.id && (l.kind === "borrow" || l.kind === "lend") && (ver >= 6 || okNum(l.amount)))
    .map(l => {
      const id = sid(l.id),
        draw = newestDraw(id),
        account = okAcc.has(sid(l.account)) ? sid(l.account) : draw ? draw.account : null;
      if (!account) return null;
      return {
        id,
        ts: stamp(l.ts),
        kind: l.kind,
        person: str(l.person),
        account,
        date: isDay(l.date) ? day(l.date) : today(),
        note: str(l.note),
        status: l.status === "writeoff" ? "writeoff" : "open",
      };
    })
    .filter(Boolean);
  uniq(s.loans);
  /* v6: a loan's due date used to live on the loan itself; move it onto its (first/only) principal draw */
  if (!(ver >= 6) && Array.isArray(o.loans))
    o.loans.forEach(ol => {
      if (!ol || !isDay(ol.due)) return;
      const draw = s.txns.find(t => t.type === "loan" && t.principal && t.loan === sid(ol.id));
      if (draw && !draw.due) draw.due = day(ol.due);
    });
  s.assets = (Array.isArray(o.assets) ? o.assets : [])
    .filter(x => x && x.id)
    .map(x => ({
      id: sid(x.id),
      name: str(x.name) || "Asset",
      e: x.e && x.e !== "💎" ? str(x.e) : "",
      i: own(ICONS, x.i) ? x.i : !x.e || x.e === "💎" ? "diamond" : "",
      c: hex(x.c) ? x.c : "#a646c9",
      value: num(x.value),
      currency: curOf(x.currency),
    }));
  uniq(s.assets);
  return s;
}
let S = blank();
/* raw text of saved data that couldn't be read at start-up (kept aside under LS+":unreadable" and offered as a file),
   and whether that copy could be kept (it needs as much room again) */
let unreadable = null,
  unreadableKept = false;
/* the copies kept aside, until the user saves or deletes them (Settings → Your data) */
const keptKeys = () => {
  try {
    return Object.keys(localStorage).filter(k => k.startsWith(LS + ":unreadable"));
  } catch (e) {
    return [];
  }
};
/* the text save() last stored, handed as is to the backup mirror (no second JSON.stringify of the whole notebook) */
let savedJson = "";
/* Every save is numbered, here (LS + ":seq") and in the shell's own copy (Android.keepState, SavedCopy.java). WebView
   writes localStorage to disk a few seconds late, so a save made just before the phone ends Tally (swiped away) can be
   missing from it, but not from the shell's copy: start-up takes whichever has the higher number. */
let saveSeq = 0;
/* the shell's copy: {seq, text}, or null (none yet, or no shell) */
function shellCopy() {
  try {
    const t = window.Android && Android.keptState ? Android.keptState() : "",
      i = t ? t.indexOf("\n") : -1;
    return i > 0 ? { seq: +t.slice(0, i) || 0, text: t.slice(i + 1) } : null;
  } catch (e) {
    return null;
  }
}
/* Loads the saved notebook. Called once from the start-up code at the end, after every constant migrate() uses exists. */
function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(LS);
    saveSeq = +localStorage.getItem(LS + ":seq") || 0;
  } catch (e) {
    return;
  }
  const kept = shellCopy();
  if (kept && kept.seq > saveSeq) {
    raw = kept.text;
    saveSeq = kept.seq;
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
    unreadableKept = keptKeys().some(k => localStorage.getItem(k) === raw);
  }
}
/* a save that fails (the phone's storage for Tally is full or blocked) is said in a dialog, which the change's own
   message can't cover, every time: the change may be lost when Tally closes unless it's saved as a file */
function save() {
  savedJson = JSON.stringify(S);
  saveSeq++;
  try {
    if (window.Android && Android.keepState) Android.keepState(saveSeq, savedJson);
  } catch (e) {}
  try {
    localStorage.setItem(LS, savedJson);
    localStorage.setItem(LS + ":seq", String(saveSeq)); // after the data: a number never claims data that didn't fit
  } catch (e) {
    setTimeout(() =>
      askDialog(
        "Couldn't save on this phone",
        "Tally's storage on this phone is full or blocked, so this change may be lost when Tally closes. Save a backup " +
          "file now to keep everything.",
        "Save backup",
        () => saveBackup(),
        { cancel: "Not now" }
      )
    );
  }
  mirrorSoon();
}
function commit() {
  dropUndo(); // an Undo still on screen would restore its snapshot over this newer change
  save();
  render();
  syncReminders();
  syncWidget();
}
const cat = id => S.cats.find(c => c.id === id) || S.cats.find(c => c.id === "other") || CATS[11];
const acc = id => S.accounts.find(a => a.id === id);
const activeAccounts = () => S.accounts.filter(a => !a.archived);
/* A transfer's or loan payment's fee is its own entry, an expense linked to it (feeOf ↔ feeId), so it comes off the
   paying account in every version of Tally; but like the transfer or payment it is never spending: the ring, day
   totals, summaries and the widget count only isSpend() entries, and History shows the fee with what it was charged on.
   Its stored category ("fees") is only for older versions: Tally never files an entry under a category by itself,
   since a built-in one keeps its id when renamed into anything. */
const isSpend = t => t.type === "expense" && !t.feeOf;
/* whether entry t is in currency cur (its account's) */
const inCur = (t, cur) => (acc(t.account) || {}).currency === cur;
/* what was spent on day d in currency cur, and the active accounts' total in it (b: balances()) */
const spentOn = (d, cur) =>
  rnd(S.txns.filter(t => t.date === d && isSpend(t) && inCur(t, cur)).reduce((q, t) => q + t.amount, 0));
const balanceIn = (cur, b) =>
  rnd(
    activeAccounts()
      .filter(a => a.currency === cur)
      .reduce((q, a) => q + b[a.id], 0)
  );
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
    .sort((x, y) => x.date.localeCompare(y.date) || (x.ts || 0) - (y.ts || 0))
    .forEach(t => {
      if (!applyEntry(b, t)) return;
      const r = { a: rnd(b[t.account]), t: t.type === "transfer" && t.to in b ? rnd(b[t.to]) : null };
      if (t.type === "loan" && t.loan in amt) {
        if (t.principal) amt[t.loan] += t.amount;
        else {
          paid[t.loan] += t.amount;
          /* a payment before what it pays (saved by an older version) is measured against the whole tab */
          const owed = paid[t.loan] > amt[t.loan] + 0.0005 ? all[t.loan] : amt[t.loan];
          r.left = Math.max(0, rnd(owed - paid[t.loan]));
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
  for (const k in b) b[k] = rnd(b[k]);
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
/* msg may be a function, read after the change */
function withUndo(msg, change, fx) {
  applyNativeActions(); // a +1 day tapped meanwhile goes in first, so this Undo can't take it back
  const before = JSON.stringify({ txns: S.txns, loans: S.loans, accounts: S.accounts, assets: S.assets });
  change();
  FX = fx || {};
  commit();
  FX = {};
  snack(typeof msg === "function" ? msg() : msg, () => {
    const o = JSON.parse(before);
    S.txns = o.txns;
    S.loans = o.loans;
    S.accounts = o.accounts;
    S.assets = o.assets;
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
  const low = (n, o) => n < -0.0005 && n < o - 0.0005;
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
/* delete entries by id, keeping transfers + fees and loans + their payments consistent: a loan goes (with its
   payments) only when every one of its draws is deleted; otherwise it follows its remaining draws */
function deleteEntries(ids) {
  ids = new Set(ids);
  const isDraw = t => t.type === "loan" && t.principal,
    hit = new Set(S.txns.filter(t => ids.has(t.id) && isDraw(t)).map(t => t.loan)),
    gone = new Set([...hit].filter(lid => S.txns.every(t => !(isDraw(t) && t.loan === lid) || ids.has(t.id))));
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
  hit.forEach(lid => {
    if (!gone.has(lid)) relinkLoan(lid);
  });
}
