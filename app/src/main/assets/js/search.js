/*
 * search.js — Search, a mode of History (#37) opened from every tab: what a typed word finds (ignoring case and
 * accents; each word must start a word of the entry, in Chinese, Japanese and Thai as `Intl.Segmenter` finds them,
 * except that two characters or more match anywhere in those scripts; a number matches amounts), a payee and an amount
 * as History filters, and the mode itself: `V.find`, the field in History's top bar and the list under it redrawn
 * after typing pauses (`findInput()`, `findDraw()`), Back to where it was opened from (`findBack()`, `findUndo()`), and
 * the suggestions above the list (`findSugs()`: a payee, category, account, person, kind, month or year, an amount that
 * the typed words could mean, each with the entries it would leave; a tap sets it as a filter and takes its words out
 * of the field, `findPick()`).
 */
"use strict";

const srFold = s => curFold(s || "").trim();
/* scripts written without spaces between words (Chinese, Japanese kana, Thai, Lao, Myanmar, Khmer;
   Korean too: srFold decomposes Hangul into jamo): their word breaks come from Intl.Segmenter. */
const NO_SPACES =
  /[\u0E00-\u0EFF\u1000-\u109F\u1100-\u11FF\u1780-\u17FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;
const SR_SEP_CH = /[\s.,;:!?()[\]{}"«»“”/\\|·•–—_-]/,
  SR_SEP = new RegExp(SR_SEP_CH.source + "+");
const srSplit = f => f.split(SR_SEP).filter(Boolean);
/* the words typed: split at spaces only, so "4.75" or "1,250" stays one number; punctuation around a word goes, except
   the ">" or "<" in front of a number ("<50": less than 50) */
const srTerms = s =>
  srFold(s)
    .split(/\s+/)
    .map(w => {
      const cmp = /^[<>]/.test(w) ? w.charAt(0) : "",
        rest = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      return cmp && srNum(rest) != null ? cmp + rest : rest;
    })
    .filter(Boolean);
/* the word segmenter of the phone's number and date locale (Chrome 87 on), null where it is missing */
let SEG = null,
  SEG_KEY = "";
function srSegmenter() {
  if (typeof Intl.Segmenter !== "function") return null;
  const key = String(LOC.fmt);
  if (SEG_KEY !== key) {
    SEG_KEY = key;
    try {
      SEG = new Intl.Segmenter(LOC.fmt, { granularity: "word" });
    } catch (e) {
      try {
        SEG = new Intl.Segmenter("en", { granularity: "word" });
      } catch (e2) {
        SEG = null;
      }
    }
  }
  return SEG;
}
/* where the words of a folded text start, when it holds a script written without spaces (else none are needed: the
   words are the pieces between separators): the starts of the pieces and of every word the segmenter finds */
function srStarts(f) {
  const seg = NO_SPACES.test(f) && srSegmenter();
  if (!seg) return [];
  const at = new Set();
  for (let i = 0, was = true; i < f.length; i++) {
    const sep = SR_SEP_CH.test(f.charAt(i));
    if (was && !sep) at.add(i);
    was = sep;
  }
  /* the segmenter does not find the breaks in decomposed kana (バ as ハ + ゛), so it reads the composed text and each
     start is counted back into the folded one */
  let off = 0;
  const found = [];
  for (const g of seg.segment(f.normalize("NFC"))) {
    if (g.isWordLike) found.push(off);
    off += g.segment.normalize("NFD").length;
  }
  // not the same text (else): only the pieces between separators
  if (off === f.length) found.forEach(p => at.add(p));
  return [...at].sort((a, b) => a - b);
}
/* a folded text's words (the pieces between separators), with `.starts` (see srStarts) */
function srInfo(f) {
  const ws = srSplit(f);
  ws.starts = srStarts(f);
  return ws;
}
/* a typed word against one folded text: it starts one of its words, or is a few typos (a letter changed, missing, extra
   or two swapped) from one, when fuzzy: one typo from five letters, two from nine */
function srHitFolded(t, ws, w, fuzzy) {
  if (!t) return false;
  const nospace = NO_SPACES.test(w);
  /* in these scripts two characters or more match anywhere (compounds: スタンド in ガソリンスタンド); one character must
     start a word, which needs Intl.Segmenter (without it, anywhere) */
  if (nospace && (Array.from(w.normalize("NFC")).length >= 2 || !srSegmenter()))
    return t.replace(/\s+/g, "").includes(w);
  if (ws.starts.some(p => t.startsWith(w, p)) || (!nospace && ws.some(x => x.startsWith(w)))) return true;
  return fuzzy && !nospace && ws.some(x => typoNear(w, x));
}
/* the typos a word of this length may have: none under 5 letters, one from 5, two from 9 */
const typoMax = n => (n >= 9 ? 2 : n >= 5 ? 1 : 0);
/* the typed word is within its typos of a word, or of the start of one as long as the typed word */
function typoNear(w, x) {
  const k = typoMax(w.length);
  if (!k) return false;
  if (typos(w, x, k)) return true;
  for (let n = Math.max(1, w.length - k); n <= w.length + k && n < x.length; n++)
    if (typos(w, x.slice(0, n), k)) return true;
  return false;
}
/* Damerau–Levenshtein distance of at most `max` (a letter changed, missing, extra, or two neighbours swapped) */
function typos(a, b, max) {
  if (max <= 1) return oneTypo(a, b);
  if (Math.abs(a.length - b.length) > max) return false;
  let prev2 = null,
    prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      if (d < low) low = d;
    }
    if (low > max) return false; // every way on is already too far
    prev2 = prev;
    prev = row;
  }
  return prev[b.length] <= max;
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
/* ---- marks: the part of a title or second line that a typed word matched, found while a row's markup is built (no
   walk over the drawn DOM). `HLW` holds the folded words while History's rows are drawn in search mode (histMonths),
   else null. The match is the filter's (a word starts a word of the text, by Intl.Segmenter in scripts without spaces;
   accents and capitals ignored; numbers never) laid over the text as written: a character that folds to several (ß →
   ss, & → " and ") is marked only when the match takes all of it. */
let HLW = null;
const hlTerms = q => {
  const w = srTerms(q)
    .map(x => x.replace(/ς/g, "σ")) // a final sigma is the same letter
    .filter(x => srNum(x) == null && !/^[<>]/.test(x));
  return w.length ? w : null;
};
function hl(raw) {
  const s = String(raw == null ? "" : raw);
  if (!HLW || !s) return esc(s);
  let f = "",
    pos = 0;
  const cp = [], // per character: where it is in the folded text and in the original
    at = []; // per folded letter: its character
  for (const ch of s) {
    const g = curFold(ch).replace(/ς/g, "σ"),
      o = pos;
    pos += ch.length;
    if (!g) {
      if (cp.length) cp[cp.length - 1].oe = pos; // a combining mark belongs to the letter before it
      continue;
    }
    cp.push({ fa: f.length, fb: f.length + g.length, os: o, oe: pos });
    for (let i = 0; i < g.length; i++) at.push(cp.length - 1);
    f += g;
  }
  const R = [],
    add = (a, b) => {
      const x = cp[at[a]],
        y = cp[at[b - 1]];
      if (x && y && x.fa === a && y.fb === b) R.push([x.os, y.oe]);
    };
  const seg = srSegmenter(),
    starts = seg ? srStarts(f) : [];
  for (const w of HLW) {
    const nospace = NO_SPACES.test(w);
    if (nospace && (Array.from(w.normalize("NFC")).length >= 2 || !seg)) {
      for (let i = f.indexOf(w); i >= 0; i = f.indexOf(w, i + w.length)) add(i, i + w.length);
      continue;
    }
    const hits = new Set(starts.filter(p => f.startsWith(w, p))); // the segmenter's words
    for (let i = 0; !nospace && i < f.length;) {
      if (SR_SEP_CH.test(f.charAt(i))) {
        i++;
        continue;
      }
      let j = i;
      while (j < f.length && !SR_SEP_CH.test(f.charAt(j))) j++;
      if (j - i >= w.length && f.startsWith(w, i)) hits.add(i);
      i = j;
    }
    hits.forEach(i => add(i, i + w.length));
  }
  if (!R.length) return esc(s);
  R.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let h = "",
    last = 0;
  R.forEach(([a, b]) => {
    if (a < last) {
      if (b <= last) return;
      a = last;
    }
    h += esc(s.slice(last, a)) + '<mark class="hl">' + esc(s.slice(a, b)) + "</mark>";
    last = b;
  });
  return h + esc(s.slice(last));
}
/* what an entry can be found by: its payee, note, category, accounts and the loan's person */
function srTexts(t) {
  const out = [t.payee, t.note, (acc(t.account) || {}).name, t.to && (acc(t.to) || {}).name];
  if (t.cat) out.push(catName(cat(t.cat)));
  if (t.type === "loan" && loan(t.loan)) out.push(loanWho(loan(t.loan)));
  return out.filter(Boolean);
}
/* each entry's texts folded (and split into words, by Intl.Segmenter where needed) once, kept until the next save(): a
   keystroke then only compares */
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
    texts.words = texts.map(srInfo); // each text's words and where they start, for srHitFolded
    c = { texts, pay: t.payee ? srFold(t.payee) : "" };
    SR_CACHE.set(t.id, c);
  }
  return c;
}
const srFolded = t => srCached(t).texts;
/* an entry is found by its own words and amounts, or by its fee's (a fee has no row of its own: it is shown inside its
   transfer or payment, so that is the hit, listed once); ">50" and "<50" compare only the entry's own amount */
function srEntryHit(t, q, fuzzy) {
  const fee = t.feeId && entry(t.feeId),
    one = (x, w, n, c) => {
      if (c) return [x.amount, x.toAmount].some(a => a != null && (c[0] === ">" ? a > rnd(n.lo) : a < rnd(n.lo)));
      if (n && [x.amount, x.toAmount].some(a => a != null && a >= n.lo - 1e-9 && a < n.hi)) return true;
      const tx = srFolded(x);
      return tx.some((s, i) => srHitFolded(s, tx.words[i], w, fuzzy));
    };
  return q.every(w => {
    const c = /^[<>]/.test(w) ? w : "", // ">50" / "<50": more / less than, as the suggestion
      n = srNum(c ? w.slice(1) : w);
    // more / less than: the entry's own amount only
    return c ? one(t, w, n, c) : one(t, w, n) || (fee && one(fee, w, n));
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
/* ---- the mode: History with a field in its top bar (V.find). It always opens clean (all time, no filters, no words);
   from History its own filters and period wait in `keep` and come back with Back. */
let FIND = { from: "home", keep: null, y: 0, steps: [] }, // steps: what each suggestion tapped changed, for Back
  FIND_BACK = false, // findBack is drawing: render() keeps no row of the search list in view
  FIND_T = 0,
  FIND_SAID = ""; // what the status for TalkBack (#find-live) says now
function openFind() {
  if (V.find) return;
  /* where it was left: History's filters, period, scroll, opened row and drawn rows; a tab's scroll */
  FIND = {
    from: V.screen,
    steps: [],
    y: scrollY,
    keep:
      V.screen === "history"
        ? { hf: { ...HF }, hp: { ...HP }, y: scrollY, open: V.open, n: HSHOW.n, a: rowAnchor($("#app")) }
        : null,
  };
  HF = histBlank();
  histAllTime();
  HSHOW.sig = "";
  FIND_SAID = "";
  Object.assign(V, { find: true, screen: "history", sel: null, open: "" });
  render();
  scrollTo(0, 0);
  const inp = $("#find-q");
  if (inp) inp.focus();
}
/* search mode ends (Back, or History left another way): the words typed are kept as a recent search first when they
   found something (and are 3 letters or more), unless a
   suggestion just kept them (they are among the newest search's words), the mode's words, payee and amount are
   forgotten and History's period is put back: its own when search was opened from History, else all time (the caller
   sets the screen) */
function findEnd() {
  const last = recentTerms(recentLoad()[0] || ""),
    mine = srTerms(HF.q);
  /* only words that found something, and not ones a suggestion just kept */
  if (HLIST.length && !(mine.length && mine.every(w => last.includes(w)))) recentKeep(HF.q);
  clearTimeout(FIND_T);
  V.find = false;
  if (FIND.keep) Object.assign(HP, FIND.keep.hp);
  else histAllTime();
  FIND.keep = null;
}
/* Android's Back in search mode: the last suggestion tapped is undone (its filter comes off, its words go back in the
   field at the places they were, the caret at the end); what was chosen or typed since stays. Returns false when no
   suggestion is left to undo. */
function findUndo() {
  const st = FIND.steps.pop();
  if (!st) return false;
  const back = {};
  Object.keys(st.hf).forEach(k => {
    if (HF[k] === st.hf[k][1]) back[k] = st.hf[k][0]; // not if it was changed again since
  });
  const words = HF.q.trim().split(/\s+/).filter(Boolean);
  st.words.forEach(([i, raw]) => words.splice(Math.min(i, words.length), 0, raw));
  HF = histNorm({ ...HF, ...back, q: words.join(" ") });
  if (st.hp && Object.keys(st.hp).every(k => HP[k] === st.hp[k][1]))
    Object.keys(st.hp).forEach(k => (HP[k] = st.hp[k][0]));
  HSHOW.sig = "";
  const inp = $("#find-q"),
    c = $('#app [data-act="find-clear"]');
  if (inp) inp.value = HF.q;
  if (c) c.hidden = !HF.q;
  findDraw();
  if (inp) {
    inp.focus({ preventScroll: true });
    try {
      inp.setSelectionRange(inp.value.length, inp.value.length);
    } catch (e) {}
  }
  return true;
}
/* the top bar's arrow: search mode ends at once, whatever suggestions were tapped */
function findBack() {
  const { from, keep, y } = FIND;
  findEnd();
  V.sel = null;
  V.open = "";
  HSHOW.sig = "";
  if (keep) {
    HF = keep.hf;
    V.screen = "history";
    HSHOW = { sig: histSig(), n: keep.n }; // the rows drawn so far, so the place can be reached
    if (keep.open && entry(keep.open)) V.open = keep.open;
  } else {
    V.screen = from; // drawScreen forgets History's filters
  }
  FIND_BACK = true;
  try {
    render();
  } finally {
    FIND_BACK = false;
  }
  scrollTo(0, keep ? keep.y : y);
  // the rows far down only have an estimated height until they are seen
  if (keep && keep.a) toAnchor(keep.a, $("#app"));
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
  /* the count, said once typing has paused (this is that pause) and only when it changed */
  const live = $("#find-live"),
    said = p.body && !p.idle ? T("history.count", { count: histRows(HLIST).length }) : "";
  if (live && said !== FIND_SAID) live.textContent = FIND_SAID = said;
}
function findClear() {
  FIND.steps = []; // a reset: Back does not undo the suggestions tapped before it
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
/* nothing found, in search mode: what was typed, a word one typo away that would find entries (never swapped in by
   itself), then Clear all */
let FIXW = null;
function findNone() {
  const q = HF.q.trim();
  let h = q ? TH("search.nothing", { q }) : TH("history.noMatch");
  FIXW = q ? findTypo() : null;
  if (FIXW)
    h +=
      '<div class="gap"></div><button class="btn tonal" data-act="find-fix">' +
      TH("search.fixBtn", { word: FIXW.word, count: FIXW.count }) +
      "</button>";
  return h + '<div class="gap"></div>' + histClearBtn();
}
/* the typed word (five letters or more) that a few typos (see typoMax) from a word of the entries would find most of
   them: {i (its place among the words), word, count, q (the field it was made for)} */
function findTypo() {
  const toks = HF.q.trim().split(/\s+/),
    terms = toks.map(tk => srFold(tk).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
  for (let i = 0; i < terms.length; i++) {
    const w = terms[i];
    if (w.length < 5 || NO_SPACES.test(w) || srNum(w) != null) continue;
    const others = terms.filter((x, j) => j !== i && x).join(" "),
      seen = new Map(); // folded word -> {raw, n (entries with it)}
    histPick({ ...HF, q: others }).forEach(t => {
      const own = new Set();
      srTexts(t).forEach(tx =>
        tx.split(SR_SEP).forEach(raw => {
          const f = srFold(raw);
          if (!f || /\s/.test(f) || own.has(f) || !typoNear(w, f)) return;
          own.add(f);
          const c = seen.get(f) || { raw: raw.toLowerCase(), n: 0 };
          c.n++;
          seen.set(f, c);
        })
      );
    });
    let best = null;
    [...seen.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)
      .forEach(c => {
        const n = histRows(histPick({ ...HF, q: (others + " " + srFold(c.raw)).trim() })).length;
        if (n && (!best || n > best.count)) best = { i, word: c.raw, count: n };
      });
    if (best) return { ...best, q: HF.q };
  }
  return null;
}
/* the button: that word takes the misspelt one's place in the field */
function findFix() {
  const f = FIXW;
  if (!f || f.q !== HF.q || f.i < 0) return findDraw(); // the field moved on: the list is about to follow
  const toks = HF.q.trim().split(/\s+/);
  toks[f.i] = f.word;
  HF.q = toks.join(" ");
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
/* the top bar of search mode: Back and the field (its ✕ only while there are words) */
function findBar() {
  return (
    '<header class="appbar"><button class="icon" data-act="find-back" aria-label="' +
    TH("common.back") +
    '">' +
    ic("back") +
    '</button><h1 class="vh">' +
    TH("search.field") +
    '</h1><div class="srbox">' +
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

/* ---- suggestions: what the typed words could mean as a filter. Each one is {g (group), title, emb, idx (the typed
   words that found it), apply() → {f, p} (the filters, and the period if it changes, that tapping sets)}. */
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
/* which typed words find a name, by the rule of the entries (srHitFolded): it starts one of its words, or, in scripts
   without spaces, a word of two characters or more is anywhere in it. `whole`: from 3 letters on, or the whole name,
   for the short fixed names (a month, a kind). */
function sugHits(name, toks, whole) {
  const fold = srFold(name),
    ws = srInfo(fold);
  const out = [];
  toks.forEach((t, i) => {
    if (Array.from(t.f).length < 2 && !NO_SPACES.test(t.f)) return; // from two typed letters (one character is a word in scripts without spaces)
    const starts = srHitFolded(fold, ws, t.f, false);
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
    add = (g, title, emb, idx, use, apply, set, label) => out.push({ g, title, emb, idx, use, apply, set, label });
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
  /* a person of lendings, of loans, or both: "Lent to", "Borrowed from" or just "Person" on the row */
  const kinds = new Map();
  S.loans.forEach(l => {
    if (l.person) kinds.set(l.person, new Set([...(kinds.get(l.person) || []), l.kind]));
  });
  kinds.forEach((ks, person) => {
    const idx = hit(person),
      emb = LOAN_EMB[ks.size === 1 ? [...ks][0] : "lend"];
    if (idx.length)
      add(
        "who",
        person,
        emb,
        idx,
        whos.get(person) || 0,
        f => ({ f: { ...f, who: person } }),
        () => HF.who === person,
        ks.size === 1 ? (ks.has("lend") ? "whoLend" : "whoBorrow") : "who"
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
  /* a month, with a year or a day typed beside it, is one period: "may 2025" the month, "jun 14" the day in each year
     that has entries on it (newest first), "jun 14 2026" that day. Those take the typed words they used, so the plain
     month and the plain year for the same words are left out. Else a month: for each year that has entries in it,
     newest first; a year that has entries. */
  const have = new Set(S.txns.map(t => t.date.slice(0, 7))),
    days = [...new Set(S.txns.map(t => t.date))].sort().reverse(),
    isYear = t => /^\d{4}$/.test(t.f),
    isDay = t => /^\d{1,2}$/.test(t.f) && +t.f >= 1 && +t.f <= 31,
    months = [],
    usedMon = new Set(),
    usedYear = new Set(),
    combos = [];
  const mnames = sugMonths().map((names, m) => ({ m, idx: [...new Set(names.flatMap(n => hit(n, true)))] }));
  mnames.forEach(({ m, idx }) => {
    if (!idx.length) return;
    const i = idx[0],
      dayToks = toks.map((t, j) => (j !== i && isDay(t) ? j : -1)).filter(j => j >= 0),
      yearToks = toks.map((t, j) => (j !== i && isYear(t) ? j : -1)).filter(j => j >= 0);
    dayToks.forEach(j =>
      (yearToks.length ? yearToks : [-1]).forEach(k => {
        days
          .filter(d => +d.slice(5, 7) === m + 1 && +d.slice(8) === +toks[j].f && (k < 0 || d.slice(0, 4) === toks[k].f))
          .forEach(d => {
            combos.push({
              title: dayFull(d),
              idx: k < 0 ? [i, j] : [i, j, k],
              p: { period: "day", anchor: d, rs: null, re: null },
              on: () => HP.period === "day" && HP.anchor === d,
            });
            usedMon.add(m);
            if (k >= 0) usedYear.add(k);
          });
      })
    );
    if (!dayToks.length)
      yearToks.forEach(k => {
        const ym = toks[k].f + "-" + pad(m + 1);
        if (!have.has(ym)) return;
        combos.push({
          title: capFirst(monthLabel(ym, true)),
          idx: [i, k],
          p: { period: "month", anchor: ym + "-01", rs: null, re: null },
          on: () => HP.period === "month" && HP.anchor.slice(0, 7) === ym,
        });
        usedMon.add(m);
        usedYear.add(k);
      });
  });
  combos.forEach(c => {
    add("period", c.title, SUG_PERIOD_EMB, c.idx, 0, f => ({ f, p: c.p }), c.on);
    out[out.length - 1].first = true; // listed before the other groups
  });
  mnames.forEach(({ m, idx }) => {
    if (!idx.length || usedMon.has(m)) return;
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
    if (!isYear(t) || usedYear.has(i) || !S.txns.some(x => x.date.slice(0, 4) === t.f)) return;
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
  (all.some(s => s.first) ? ["period"].concat(SUG_GROUPS.filter(g => g !== "period")) : SUG_GROUPS).forEach(g => {
    const mine = all.filter(s => s.g === g && !s.set());
    /* the most used first (the months already newest first), then counted: the first few that leave something */
    /* a name that is the typed words themselves comes first, whatever its use, so the cut to three never drops it */
    const typed = toks.map(t => t.f).join(" "),
      exact = s => +(!!typed && srFold(s.title) === typed);
    if (g !== "period" && g !== "amount")
      mine.sort((a, b) => exact(b) - exact(a) || b.idx.length - a.idx.length || b.use - a.use);
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
      const group = T("search.group." + (s.label || g)),
        line = T("search.sugLine", { group, count: n });
      rows +=
        '<button class="sug" data-act="fs-pick" data-v="' +
        SUGS.length +
        '" aria-label="' +
        esc(T("search.sugLabel", { group, title: s.title, count: n })) +
        '">' +
        emblem(s.emb, "em") +
        '<span class="mid"><span class="sgt" dir="auto">' +
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
  recentKeepSug(s);
  /* what the tap changes, to be undone alone: each filter and period field as [before, set], the words it takes out of
     the field with their places */
  const next = histNorm(s.r.f),
    tk = sugTokens(s.q),
    step = { hf: {}, hp: null, words: s.idx.map(n => [n, tk[n].raw]) };
  Object.keys(next).forEach(k => {
    if (k !== "q" && next[k] !== HF[k]) step.hf[k] = [HF[k], next[k]];
  });
  if (s.r.p) {
    const hp = {};
    Object.keys(s.r.p).forEach(k => {
      if (s.r.p[k] !== HP[k]) hp[k] = [HP[k], s.r.p[k]];
    });
    step.hp = hp;
  }
  FIND.steps.push(step);
  HF = next;
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
/* ---- recent searches: up to five, newest first, kept by the shell (recentLoad / recentSave, bridge.js) when a search
   is used: a suggestion or an entry tapped, or search mode closed. The same words again (curFold) move to the top, with
   their newest spelling. */
const RECENT_MAX = 5,
  RECENT_LEN = 100; // the shell refuses longer ones
function recentKeep(text) {
  let t = String(text || "")
    .trim()
    .slice(0, RECENT_LEN);
  if (/[\uD800-\uDBFF]$/.test(t)) t = t.slice(0, -1); // not half of a pair
  t = t.trim();
  if (Array.from(t).length < 3) return; // a fragment is not a search
  const f = curFold(t);
  recentSave(
    [t, ...recentLoad().filter(x => (recentSug(x) ? !recentSug(x).bad : curFold(x) !== f))].slice(0, RECENT_MAX)
  );
}
/* a suggestion tapped is kept as that suggestion: a text of its group, label, name and the words that found it, apart
   by U+0001 (the shell keeps plain strings), shown with its emblem and applied again when tapped */
const REC_SEP = "\u0001";
function recentSug(x) {
  if (x.charAt(0) !== REC_SEP) return null;
  const p = x.split(REC_SEP),
    ok =
      p.length === 5 &&
      SUG_GROUPS.includes(p[1]) &&
      ["", "who", "whoLend", "whoBorrow"].includes(p[2]) &&
      p[3].trim() &&
      p[4].trim();
  return ok ? { g: p[1], label: p[2], title: p[3], words: p[4] } : { bad: true }; // anything else with the marker is junk
}
function recentKeepSug(s) {
  const tk = sugTokens(s.q),
    item = REC_SEP + [s.g, s.label || "", s.title, s.idx.map(i => tk[i].raw).join(" ")].join(REC_SEP);
  if (item.length > RECENT_LEN) return recentKeep(s.q);
  recentSave([item, ...recentLoad().filter(x => x !== item && !(recentSug(x) || {}).bad)].slice(0, RECENT_MAX));
}
/* the words a recent search stands for, as terms */
const recentTerms = x => {
  const r = recentSug(x);
  return r && r.bad ? [] : srTerms(r ? r.words : x);
};
/* the recent searches to show: words as they are, a kept suggestion only while it still exists (a payee, category,
   account or person that is gone, or a malformed value, is left out) */
const recentList = () =>
  recentLoad().filter(x => {
    const r = recentSug(x);
    return !r || (!r.bad && !!recentFind(r));
  });
/* the suggestion a kept one stands for now (None when the notebook has changed): found again from its words */
function recentFind(r) {
  const toks = sugTokens(r.words);
  return (
    sugFind(toks).find(x => x.g === r.g && srFold(x.title) === srFold(r.title) && (x.label || "") === r.label) || null
  );
}
/* what a kept suggestion says: its filter's own chip */
function recentText(r) {
  if (r.g === "pay" || r.g === "payIn") return T(r.g === "pay" ? "history.payOut" : "history.payIn", { name: r.title });
  if (r.label === "whoLend" || r.label === "whoBorrow")
    return T(r.label === "whoLend" ? "history.lentTo" : "history.borrowedFrom", { who: r.title });
  return r.title;
}
/* what the empty field shows: "" when there are none */
function recentView() {
  const list = recentList();
  if (!list.length) return "";
  return (
    '<div class="sec" role="heading" aria-level="2">' +
    TH("search.recent") +
    '</div><div class="list">' +
    list
      .map((t, i) => {
        const r = recentSug(t),
          f = r && recentFind(r),
          text = r ? recentText(r) : t;
        return (
          '<div class="rec"><button class="recq" data-act="rec-use" data-v="' +
          i +
          '">' +
          (f ? emblem(f.emb, "recem") : ic("schedule")) +
          '<span class="recw" dir="auto">' +
          esc(text) +
          '</span></button><button class="icon recx" data-act="rec-del" data-v="' +
          i +
          '" aria-label="' +
          esc(T("search.forget", { text })) +
          '">' +
          ic("close") +
          "</button></div>"
        );
      })
      .join("") +
    "</div>"
  );
}
/* a recent search tapped: words are typed into the field (caret at its end, focus kept) and the list follows; a kept
   suggestion is applied as a suggestion again (its words typed, then it tapped), or its words are typed when it no
   longer exists */
function recentUse(i) {
  const item = recentList()[i];
  if (item === undefined) return;
  const r = recentSug(item),
    t = r ? r.words : item;
  HF.q = t;
  const inp = $("#find-q");
  if (inp) inp.value = t;
  const c = $('#app [data-act="find-clear"]');
  if (c) c.hidden = !t;
  if (r) {
    const f = recentFind(r);
    if (f) {
      findDraw();
      const at = SUGS.findIndex(
        x => x.g === f.g && srFold(x.title) === srFold(f.title) && (x.label || "") === (f.label || "")
      );
      if (at >= 0) return findPick(at);
    }
  }
  findDraw();
  if (inp) {
    inp.focus({ preventScroll: true });
    try {
      inp.setSelectionRange(t.length, t.length);
    } catch (e) {}
  }
}
/* its ✕: forgotten; the focus goes to the next row's ✕, or to the field when none is left */
function recentDel(i) {
  const list = recentList();
  if (i < 0 || i >= list.length) return;
  list.splice(i, 1);
  recentSave(list);
  findDraw();
  const next = $('#hbody .recx[data-v="' + Math.min(i, list.length - 1) + '"]'),
    inp = $("#find-q");
  const to = list.length ? next : inp;
  if (to) to.focus({ preventScroll: true });
}
/* Enter: the list follows at once and the keyboard closes. A page cannot close the keyboard and keep the focus on the
   field, and a blurred field would leave TalkBack's focus on nothing, so it moves to the first suggestion or entry
   (or the first button of what is shown). */
function findSubmit() {
  findDraw();
  const inp = $("#find-q");
  if (inp) inp.blur();
  const first = $("#hbody .sug, #hbody [data-act='row-open'], #hbody button");
  if (first) first.focus({ preventScroll: true });
}
