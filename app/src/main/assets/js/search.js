/*
 * search.js — Search, a mode of History (#37) opened from every tab: what a typed word finds (ignoring case and accents;
 * each word must start a word of the entry, anywhere in it for scripts written without spaces; a number matches
 * amounts), a payee and an amount as History filters, and the mode itself: `V.find`, the field in History's top bar and
 * the list under it redrawn after typing pauses (`findInput()`, `findDraw()`), Back to where it was opened from
 * (`findBack()`).
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
/* a typed number, the phone's way ("45", "1,250.50", "1.250,50"): "45" is anything from 45 to 45.99, "45.50" just that */
function srNum(w) {
  if (!/^\d[\d.,'’\s]*$/.test(w)) return null;
  const v = evalAmt(w);
  if (v == null) return null;
  const whole = !/[.,]\d{1,2}$/.test(w) || (NUMSEP.grp && new RegExp("\\" + NUMSEP.grp + "\\d{3}$").test(w));
  return { lo: v, hi: whole ? v + 1 : v + 0.005 };
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
  return hi <= lo + 1e-9 || +p[2] - lo < 10 ** -digits * 2
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
