/*
 * search.js — Search, a mode of History (#37) opened from every tab: what a typed word finds (ignoring case and accents;
 * each word must start a word of the entry, anywhere in it for scripts written without spaces; a number matches
 * amounts), a payee and an amount as History filters, and the mode itself: `V.find`, the field in History's top bar and
 * the list under it redrawn after typing pauses (`findInput()`, `findDraw()`), Back to where it was opened from
 * (`findBack()`), and the suggestions above the list (`findSugs()`: a payee, category, account, person, kind, month or
 * year, an amount that the typed words could mean, each with the entries it would leave; a tap sets it as a filter and
 * takes its words out of the field, `findPick()`).
 */
"use strict";

const srFold = s => curFold(s || "").trim();
/* scripts without spaces between words: a word may start anywhere */
const NO_SPACES = /[぀-ヿ㐀-䶿一-鿿가-힯฀-๿]/;
const srWords = s =>
  srFold(s)
    .split(/[\s.,;:!?()[\]{}"«»“”/\\|·•–—_-]+/)
    .filter(Boolean);
/* the words typed: split at spaces only, so "4.75" or "1,250" stays one number; punctuation around a word goes */
const srTerms = s =>
  srFold(s)
    .split(/\s+/)
    .map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
/* a typed word against one folded text: it starts one of its words, or is one typo (a letter changed, missing, extra or
   two swapped) from one, for a word of five letters or more, when fuzzy */
function srHitFolded(t, ws, w, fuzzy) {
  if (!t) return false;
  if (NO_SPACES.test(w)) return t.replace(/\s+/g, "").includes(w);
  if (ws.some(x => x.startsWith(w))) return true;
  return fuzzy && w.length >= 5 && ws.some(x => oneTypo(w, x.slice(0, w.length)) || oneTypo(w, x));
}
/* Damerau–Levenshtein distance of at most 1 */
function oneTypo(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length)
    return (
      a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
    );
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
/* a typed number, the phone's way ("45", "1,250.50", "1.250,50"): "45" is anything from 45 to 45.99, "45.50" just that
   (up to three decimals, for the currencies that have them) */
function srNum(w) {
  if (!/^\d[\d.,'’\s]*$/.test(w)) return null;
  const v = evalAmt(w);
  if (v == null) return null;
  const m = /[.,](\d{1,3})$/.exec(w),
    grp = m && m[1].length === 3 && !!NUMSEP.grp && w.charAt(w.length - 4) === NUMSEP.grp, // "1,250": thousands
    d = m && !grp ? m[1].length : 0;
  return { lo: v, hi: d === 0 ? v + 1 : d === 3 ? +(v + 0.0005).toFixed(4) : v + 0.005 };
}
/* what an entry can be found by: its payee, note, category, accounts and the loan's person */
function srTexts(t) {
  const out = [t.payee, t.note, (acc(t.account) || {}).name, t.to && (acc(t.to) || {}).name];
  if (t.cat) out.push(catName(cat(t.cat)));
  if (t.type === "loan" && loan(t.loan)) out.push(loanWho(loan(t.loan)));
  return out.filter(Boolean);
}
/* each entry's texts folded (and split into words) once, kept until the next save(): a keystroke then only compares */
let SR_CACHE = new Map(),
  SR_SEQ = -1;
function srCached(t) {
  if (SR_SEQ !== saveSeq) {
    SR_CACHE = new Map();
    SR_SEQ = saveSeq;
  }
  let c = SR_CACHE.get(t.id);
  if (!c) {
    const texts = srTexts(t).map(srFold).filter(Boolean);
    texts.words = texts.map(srWords); // each text's words, for srHitFolded
    c = { texts, pay: t.payee ? srFold(t.payee) : "" };
    SR_CACHE.set(t.id, c);
  }
  return c;
}
const srFolded = t => srCached(t).texts;
/* an entry is found by its own words and amounts, or by its fee's (a fee has no row of its own: it is shown inside its
   transfer or payment, so that is the hit, listed once) */
function srEntryHit(t, q, fuzzy) {
  const fee = t.feeId && entry(t.feeId),
    one = (x, w, n) => {
      if (n && [x.amount, x.toAmount].some(a => a != null && a >= n.lo - 1e-9 && a < n.hi)) return true;
      const tx = srFolded(x);
      return tx.some((s, i) => srHitFolded(s, tx.words[i], w, fuzzy));
    };
  return q.every(w => {
    const n = srNum(w);
    return one(t, w, n) || (fee && one(fee, w, n));
  });
}
/* ---- the payee and amount filters of History (`HF.pay`, `HF.amt`) */
/* "out:<folded payee>" is money spent there, "in:…" money received from them */
function srPayHit(t, pay) {
  const i = pay.indexOf(":"),
    out = pay.slice(0, i) === "out";
  return (out ? isSpend(t) : t.type === "income") && !!t.payee && srCached(t).pay === pay.slice(i + 1);
}
/* the payee as last written (a name is one whatever its capitals or accents), "" when no entry has it */
function srPayName(pay) {
  const i = pay.indexOf(":");
  let best = null;
  S.txns.forEach(t => {
    if (!srPayHit(t, pay)) return;
    if (!best || cmpDay(t.date, best.date) > 0 || (t.date === best.date && (t.ts || 0) >= (best.ts || 0))) best = t;
  });
  return i < 0 || !best ? "" : best.payee.trim();
}
/* "eq:lo:hi" is lo up to but not including hi, "gt:n" more than n, "lt:n" less than n; an entry counts by its own
   amount (a transfer: the amount sent or received) */
function srAmtHit(t, amt) {
  const p = amt.split(":"),
    v = [t.amount, t.toAmount].filter(a => a != null);
  if (p[0] === "eq") return v.some(a => a >= +p[1] - 1e-9 && a < +p[2]);
  if (p[0] === "gt") return v.some(a => a > +p[1]);
  if (p[0] === "lt") return v.some(a => a < +p[1]);
  return true;
}
/* the chip's words: "$50.00 to $50.99", "More than $50.00", "Less than $50.00". In the notebook's currency when every
   account has it, else the plain number in the phone's format. */
function srAmtLabel(amt) {
  const p = amt.split(":"),
    cur = S.accounts.length && S.accounts.every(a => a.currency === S.accounts[0].currency) && S.accounts[0].currency;
  let digits = 2;
  if (cur)
    try {
      digits = new Intl.NumberFormat("en", { style: "currency", currency: cur }).resolvedOptions()
        .maximumFractionDigits;
    } catch (e) {}
  const show = n =>
    cur
      ? money(n, cur)
      : new Intl.NumberFormat(LOC.fmt, { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(n);
  if (p[0] === "gt") return T("history.amtMore", { amount: show(+p[1]) });
  if (p[0] === "lt") return T("history.amtLess", { amount: show(+p[1]) });
  const lo = +p[1],
    hi = rnd(+p[2] - 10 ** -digits);
  return hi <= lo + 1e-9 || +p[2] - lo < 1 - 1e-9 // a single amount (its range is narrower than a whole unit)
    ? show(lo)
    : T("history.amtRange", { from: show(lo), to: show(hi) });
}
/* ---- the mode: History with a field in its top bar (V.find). It always opens clean (all time, no filters, no words); from
   History its own filters and period wait in `keep` and come back with Back. */
let FIND = { from: "home", keep: null },
  FIND_T = 0;
function openFind() {
  if (V.find) return;
  FIND = { from: V.screen, keep: V.screen === "history" ? { hf: { ...HF }, hp: { ...HP } } : null };
  HF = histBlank();
  histAllTime();
  HSHOW.sig = "";
  Object.assign(V, { find: true, screen: "history", sel: null, open: "" });
  render();
  scrollTo(0, 0);
  const inp = $("#find-q");
  if (inp) inp.focus();
}
/* search mode over, its words and payee / amount forgotten (the caller sets the screen) */
function findEnd() {
  clearTimeout(FIND_T);
  V.find = false;
  FIND.keep = null;
}
function findBack() {
  const { from, keep } = FIND;
  findEnd();
  V.sel = null;
  V.open = "";
  HSHOW.sig = "";
  if (keep) {
    HF = keep.hf;
    Object.assign(HP, keep.hp);
    V.screen = "history";
  } else {
    histAllTime();
    V.screen = from; // drawScreen forgets History's filters
  }
  render();
}
/* a word typed: the list under the bar follows after a short pause; the field itself is never redrawn (its caret, focus
   and an IME's composition stay) */
function findInput(v) {
  HF.q = v;
  const c = $('#app [data-act="find-clear"]');
  if (c) c.hidden = !v;
  clearTimeout(FIND_T);
  FIND_T = setTimeout(findDraw, 120);
}
function findDraw() {
  clearTimeout(FIND_T);
  if (!V.find || V.screen !== "history" || !$("#hbody")) return;
  histDrop();
  const p = histParts();
  $("#hhead").innerHTML = p.head;
  $("#hbody").innerHTML = p.body;
  scrollTo(0, 0);
  fitFigures($("#app"));
  histCenter($("#app"));
  histWatch();
}
function findClear() {
  HF.q = "";
  const inp = $("#find-q");
  if (inp) {
    inp.value = "";
    inp.focus();
  }
  const c = $('#app [data-act="find-clear"]');
  if (c) c.hidden = true;
  findDraw();
}
/* the top bar of search mode: Back and the field (its ✕ only while there are words) */
function findBar() {
  return (
    '<header class="appbar"><button class="icon" data-act="find-back" aria-label="' +
    TH("common.back") +
    '">' +
    ic("back") +
    '</button><div class="srbox">' +
    ic("search") +
    '<input id="find-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="' +
    TH("search.field") +
    '" aria-label="' +
    TH("search.field") +
    '" value="' +
    esc(HF.q) +
    '"><button class="icon" data-act="find-clear" aria-label="' +
    TH("search.clear") +
    '"' +
    (HF.q ? "" : " hidden") +
    ">" +
    ic("close") +
    "</button></div></header>"
  );
}
/* the field as it is now (focus and caret), to be put back after the screen is drawn anew */
function findKeep() {
  const i = $("#find-q");
  return i && document.activeElement === i ? { a: i.selectionStart, b: i.selectionEnd } : null;
}
function findRestore(k) {
  const i = $("#find-q");
  if (!k || !i) return;
  if (document.activeElement !== i) i.focus({ preventScroll: true });
  try {
    i.setSelectionRange(k.a, k.b);
  } catch (e) {}
}

/* ---- suggestions: what the typed words could mean as a filter. Each one is {g (group), title, emb, idx (the typed words
   that found it), apply() → {f, p} (the filters, and the period if it changes, that tapping sets)}. */
let SUGS = [];
const SUG_MAX = 3, // shown per group
  SUG_LOOK = 8; // counted per group before the three with entries are picked
/* the typed words with their folded spelling; ">50" and "<50" are amounts only, never part of a name */
function sugTokens(q) {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(raw => {
      const cmp = /^[<>]/.test(raw);
      return { raw, cmp, f: cmp ? "" : srFold(raw).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") };
    });
}
/* which typed words find a name: each starts one of its words (anywhere in it for scripts without spaces). `whole`: from
   3 letters on, or the whole name, for the short fixed names (a month, a kind). */
function sugHits(name, toks, whole) {
  const fold = srFold(name),
    ws = srWords(name),
    flat = fold.replace(/\s+/g, "");
  const out = [];
  toks.forEach((t, i) => {
    if (!t.f) return;
    const starts = NO_SPACES.test(t.f) ? flat.includes(t.f) : ws.some(w => w.startsWith(t.f));
    if (whole ? t.f === fold || (t.f.length >= 3 && starts) : starts) out.push(i);
  });
  return out;
}
/* the entries a choice would leave, as History counts them: rows, in that period */
function sugCount(f, p) {
  const [s, e] = range(p);
  return histRows(S.txns.filter(t => t.date >= s && t.date <= e && histMatch(t, f))).length;
}
const MONTH_DTF = {};
/* the 12 months' names in the phone's own language, full and short ("Jun." loses its dot) */
function sugMonths() {
  const key = String(DATE_LOC);
  if (!MONTH_DTF[key]) {
    const make = month => {
      let f;
      try {
        f = new Intl.DateTimeFormat(DATE_LOC, { month }); // the Gregorian calendar, as every month label is
      } catch (e) {
        f = new Intl.DateTimeFormat("en", { month });
      }
      return Array.from({ length: 12 }, (_, m) => f.format(new Date(2021, m, 15)).replace(/\.$/, ""));
    };
    const long = make("long"),
      short = make("short");
    MONTH_DTF[key] = long.map((n, m) => [n, short[m]]);
  }
  return MONTH_DTF[key];
}
const SUG_KIND_EMB = {
  out: { i: "payments", c: "#5f7389" },
  in: { i: "savings", c: "#15a06f" },
  xfer: XFER_EMB,
  lend: LOAN_EMB.lend,
  borrow: LOAN_EMB.borrow,
  fix: { i: "build", c: "#7a8190" },
};
const SUG_AMT_EMB = { i: "paid", c: "#7a8190" };
const SUG_PERIOD_EMB = { i: "event", c: "#4b5fd6" };
/* every suggestion the typed words give, in the order of the groups (not yet counted) */
function sugFind(toks) {
  const out = [],
    add = (g, title, emb, idx, use, apply, set) => out.push({ g, title, emb, idx, use, apply, set });
  const pays = new Map(),
    cats = new Map(),
    accs = new Map(),
    whos = new Map();
  S.txns.forEach(t => {
    if (t.feeOf && entry(t.feeOf)) return;
    if (t.cat) cats.set(t.cat, (cats.get(t.cat) || 0) + 1);
    accs.set(t.account, (accs.get(t.account) || 0) + 1);
    if (t.to) accs.set(t.to, (accs.get(t.to) || 0) + 1);
    const lo = t.loan && loan(t.loan);
    if (lo && lo.person) whos.set(lo.person, (whos.get(lo.person) || 0) + 1);
    if (!t.payee || !srCached(t).pay) return;
    const way = isSpend(t) ? "out:" : t.type === "income" ? "in:" : "";
    if (!way) return;
    const key = way + srCached(t).pay;
    const p = pays.get(key);
    if (!p) pays.set(key, { name: t.payee.trim(), best: t, n: 1 });
    else {
      p.n++;
      if (cmpDay(t.date, p.best.date) > 0 || (t.date === p.best.date && (t.ts || 0) >= (p.best.ts || 0))) {
        p.best = t;
        p.name = t.payee.trim();
      }
    }
  });
  const hit = (name, whole) => sugHits(name, toks, whole);
  ["out", "in"].forEach(kind =>
    pays.forEach((p, key) => {
      if (!key.startsWith(kind + ":")) return;
      const idx = hit(p.name);
      if (idx.length)
        add(
          kind === "out" ? "pay" : "payIn",
          p.name,
          cat(p.best.cat) || XFER_EMB,
          idx,
          p.n,
          f => ({ f: { ...f, pay: key } }),
          () => HF.pay === key
        );
    })
  );
  S.cats.forEach(c => {
    const idx = hit(catName(c));
    if (idx.length)
      add(
        "cat",
        catName(c),
        c,
        idx,
        cats.get(c.id) || 0,
        f => ({ f: { ...f, cat: c.id } }),
        () => HF.cat === c.id
      );
  });
  histAccs().forEach(a => {
    const idx = hit(a.name);
    if (idx.length)
      add(
        "acc",
        a.name,
        accEmb(a),
        idx,
        accs.get(a.id) || 0,
        f => ({ f: { ...f, acc: a.id, from: "", to: "" } }),
        () => HF.acc === a.id
      );
  });
  const seen = new Set();
  S.loans.forEach(l => {
    if (!l.person || seen.has(l.person)) return;
    seen.add(l.person);
    const idx = hit(l.person);
    if (idx.length)
      add(
        "who",
        l.person,
        LOAN_EMB[l.kind],
        idx,
        whos.get(l.person) || 0,
        f => ({ f: { ...f, who: l.person } }),
        () => HF.who === l.person
      );
  });
  HIST_KINDS.forEach(([k]) => {
    const name = T("history.kind." + k),
      idx = hit(name, true);
    if (idx.length)
      add(
        "kind",
        name,
        SUG_KIND_EMB[k],
        idx,
        0,
        f => ({ f: { ...f, kind: k, cat: "", who: "", from: "", to: "" } }),
        () => HF.kind === k
      );
  });
  /* a month: for each year that has entries in it, newest first; a year that has entries */
  const have = new Set(S.txns.map(t => t.date.slice(0, 7))),
    months = [];
  sugMonths().forEach((names, m) => {
    const idx = [...new Set(names.flatMap(n => hit(n, true)))];
    if (!idx.length) return;
    [...have].filter(ym => +ym.slice(5) === m + 1).forEach(ym => months.push({ ym, idx }));
  });
  months
    .sort((a, b) => (a.ym < b.ym ? 1 : -1))
    .forEach(({ ym, idx }) =>
      add(
        "period",
        capFirst(monthLabel(ym, true)),
        SUG_PERIOD_EMB,
        idx,
        0,
        f => ({ f, p: { period: "month", anchor: ym + "-01", rs: null, re: null } }),
        () => HP.period === "month" && HP.anchor.slice(0, 7) === ym
      )
    );
  toks.forEach((t, i) => {
    if (!/^\d{4}$/.test(t.f) || !S.txns.some(x => x.date.slice(0, 4) === t.f)) return;
    add(
      "period",
      t.f,
      SUG_PERIOD_EMB,
      [i],
      0,
      f => ({ f, p: { period: "year", anchor: t.f + "-01-01", rs: null, re: null } }),
      () => HP.period === "year" && HP.anchor.slice(0, 4) === t.f
    );
  });
  /* an amount: a bare number gives the amount itself, more than and less than; ">50" and "<50" just that one */
  toks.forEach((t, i) => {
    const m = /^([<>])(.*)$/.exec(t.raw),
      n = srNum(m ? srFold(m[2]) : t.f);
    if (!n) return;
    const list = m
      ? [(m[1] === ">" ? "gt:" : "lt:") + rnd(n.lo)]
      : ["eq:" + n.lo + ":" + n.hi, "gt:" + rnd(n.lo), "lt:" + rnd(n.lo)];
    list.forEach(amt =>
      add(
        "amount",
        srAmtLabel(amt),
        SUG_AMT_EMB,
        [i],
        0,
        f => ({ f: { ...f, amt } }),
        () => HF.amt === amt
      )
    );
  });
  return out;
}
const SUG_GROUPS = ["pay", "payIn", "cat", "acc", "who", "kind", "period", "amount"];
/* the suggestions for the words in the field, counted, as markup (at most three a group; one already set, or leaving no
   entry, is left out); "" when there are none */
function findSugs() {
  const q = HF.q,
    toks = sugTokens(q);
  SUGS = [];
  if (!toks.length) return "";
  const seen = new Set(),
    all = sugFind(toks).filter(s => {
      if (s.g !== "period" && s.g !== "amount") return true;
      const k = s.g + "|" + s.title; // "2026 2026" is one suggestion
      return !seen.has(k) && !!seen.add(k);
    });
  let rows = "";
  SUG_GROUPS.forEach(g => {
    const mine = all.filter(s => s.g === g && !s.set());
    /* the most used first (the months already newest first), then counted: the first few that leave something */
    if (g !== "period" && g !== "amount") mine.sort((a, b) => b.idx.length - a.idx.length || b.use - a.use);
    let kept = 0;
    mine.slice(0, SUG_LOOK).forEach(s => {
      if (kept >= SUG_MAX) return;
      const left = toks
          .filter((_, i) => !s.idx.includes(i))
          .map(t => t.raw)
          .join(" "),
        r = s.apply({ ...HF, q: left }),
        n = sugCount(histNorm(r.f), r.p ? { ...HP, ...r.p } : HP);
      if (!n) return;
      kept++;
      s.q = q;
      s.left = left;
      s.r = r;
      const group = T("search.group." + g),
        line = T("search.sugLine", { group, count: n });
      rows +=
        '<button class="sug" data-act="fs-pick" data-v="' +
        SUGS.length +
        '" aria-label="' +
        esc(T("search.sugLabel", { group, title: s.title, count: n })) +
        '">' +
        emblem(s.emb, "em") +
        '<span class="mid"><span class="st" dir="auto">' +
        esc(s.title) +
        '</span><span class="s">' +
        esc(line) +
        "</span></span></button>";
      SUGS.push(s);
    });
  });
  return rows
    ? '<div class="sec" role="heading" aria-level="2">' +
        TH("search.suggestions") +
        '</div><div class="list">' +
        rows +
        "</div>"
    : "";
}
/* a suggestion tapped: its filter is set, the words that found it leave the field (the rest stay) and the field keeps
   the focus, the caret at its end */
function findPick(i) {
  const s = SUGS[i];
  if (!s || s.q !== HF.q) return findDraw(); // the field moved on: the list is about to follow
  HF = histNorm(s.r.f);
  if (s.r.p) Object.assign(HP, s.r.p);
  HSHOW.sig = "";
  const inp = $("#find-q");
  if (inp) inp.value = HF.q;
  const c = $('#app [data-act="find-clear"]');
  if (c) c.hidden = !HF.q;
  findDraw();
  if (inp) {
    inp.focus({ preventScroll: true });
    try {
      inp.setSelectionRange(inp.value.length, inp.value.length);
    } catch (e) {}
  }
}
/* Enter: the list follows at once and the keyboard closes */
function findSubmit() {
  findDraw();
  const inp = $("#find-q");
  if (inp) inp.blur();
}
