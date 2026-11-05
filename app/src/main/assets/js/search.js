/*
 * search.js — Search (#37): every entry, all time, from Home and History. As you type, matches are grouped by kind (who
 * was paid, who paid, categories, accounts, people with a loan, then single entries), a few of each with a count and a
 * total; one of them opens its entries by Week, Month, Year or All, with bars and the total. Matching ignores case and accents; each word typed
 * must start a word of the entry (anywhere in it for scripts written without spaces), a number matches amounts, and
 * only when nothing matches are words one typo away offered.
 */
"use strict";

/* what Search shows: the text typed, the group item opened (scope: {k: "out"|"in"|"cat"|"acc"|"all", v, label}) and the
   screen it was opened from (Back returns there) */
let SR = null;
const SR_MAX = 3; // matches shown per group: typing more narrows them
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
/* a typed word against one text: it starts one of its words, or is one typo (a letter changed, missing, extra or two
   swapped) from one, for a word of five letters or more, when fuzzy */
function srHit(text, w, fuzzy) {
  const t = srFold(text);
  if (!t) return false;
  if (NO_SPACES.test(w)) return t.replace(/\s+/g, "").includes(w);
  const ws = srWords(t);
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
function srEntryHit(t, q, fuzzy) {
  return q.every(w => {
    const n = srNum(w);
    if (n && [t.amount, t.toAmount].some(a => a != null && a >= n.lo - 1e-9 && a < n.hi)) return true;
    return srTexts(t).some(x => srHit(x, w, fuzzy));
  });
}
const srNameHit = (name, q, fuzzy) => q.every(w => srHit(name, w, fuzzy));

function openSearch() {
  SR = { q: "", scope: null, from: V.screen };
  V.screen = "search";
  render();
  scrollTo(0, 0);
  const inp = $("#sr-q");
  if (inp) inp.focus();
}
/* the results drawn anew: another set of rows, so the row in view isn't kept in place (render's rowAnchor) */
function srRedraw() {
  drawnScreen = "";
  render();
}
function searchBack() {
  if (SR && SR.scope) {
    SR.scope = null;
    srRedraw();
    const inp = $("#sr-q");
    if (inp) inp.focus();
    return;
  }
  V.screen = (SR && SR.from) || "home";
  SR = null;
  render();
}
function searchView() {
  if (!SR) SR = { q: "", scope: null, from: "home" };
  const box = SR.scope
    ? '<button class="chip srscope" data-act="sr-unscope" aria-label="' +
      TH("search.unscope", { name: SR.scope.label }) +
      '"><span class="chn" dir="auto">' +
      esc(SR.scope.label) +
      "</span>" +
      ic("close") +
      "</button>"
    : '<input id="sr-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="' +
      TH("search.placeholder") +
      '" aria-label="' +
      TH("search.title") +
      '" value="' +
      esc(SR.q) +
      '"><button class="icon" data-act="sr-clear" aria-label="' +
      TH("search.clear") +
      '"' +
      (SR.q ? "" : " hidden") +
      ">" +
      ic("close") +
      "</button>";
  return (
    '<header class="appbar"><button class="icon" data-act="sr-back" aria-label="' +
    TH("common.back") +
    '">' +
    ic("back") +
    '</button><div class="srbox">' +
    ic("search") +
    box +
    '</div></header><div id="sr" aria-live="polite">' +
    searchBody() +
    "</div>"
  );
}
/* the results under the box, redrawn as you type (the box itself stays, with its caret) */
function searchInput(v) {
  SR.q = v;
  const c = $('#app [data-act="sr-clear"]');
  if (c) c.hidden = !v;
  $("#sr").innerHTML = searchBody();
  fitFigures($("#sr"));
}
function searchBody() {
  if (SR.scope) return srScoped();
  const q = srTerms(SR.q);
  if (!q.length) return '<p class="hint srhint">' + TH("search.hint") + "</p>";
  let h = srGroups(q, false);
  if (!h) {
    h = srGroups(q, true);
    if (h) h = '<p class="hint srhint">' + TH("search.close") + "</p>" + h;
  }
  return h || '<div class="empty">' + TH("search.none", { q: SR.q.trim() }) + "</div>";
}
/* totals of a set of entries: spent and received, per currency */
function srTotals(list) {
  const sp = {},
    got = {};
  list.forEach(t => {
    const c = (acc(t.account) || {}).currency;
    if (isSpend(t)) sp[c] = rnd((sp[c] || 0) + t.amount);
    else if (t.type === "income") got[c] = rnd((got[c] || 0) + t.amount);
  });
  const line = (m, key) =>
    Object.keys(m).length
      ? T(key, {
          amount: Object.entries(m)
            .map(([c, v]) => money(v, c))
            .join(" + "),
        })
      : "";
  return { spent: line(sp, "search.spent"), got: line(got, "search.received") };
}
function srGroups(q, fuzzy) {
  const all = S.txns.slice().sort(byNewest),
    row = (em, name, sub, act, v) =>
      '<button class="tx" data-act="' +
      act +
      '" data-v="' +
      esc(v) +
      '">' +
      emblem(em, "em") +
      '<span class="mid"><div class="d" dir="auto">' +
      esc(name) +
      '</div><div class="s">' +
      esc(sub) +
      "</div></span>" +
      ic("right") +
      "</button>",
    sub = list => {
      const tot = srTotals(list);
      return [T("home.entries", { count: list.length }), tot.spent, tot.got].filter(Boolean).join(" · ");
    },
    group = (title, rows) =>
      rows.length ? '<div class="sec">' + esc(title) + '</div><div class="list">' + rows.join("") + "</div>" : "";
  /* payees: one per name whatever its case or accents (the newest spelling shown), the most used first */
  const payees = type => {
    const m = new Map();
    all.forEach(t => {
      if (t.type !== type || !t.payee || t.feeOf) return;
      const k = srFold(t.payee);
      if (!m.has(k)) m.set(k, { name: t.payee, list: [] });
      m.get(k).list.push(t);
    });
    return [...m.entries()]
      .filter(([, x]) => srNameHit(x.name, q, fuzzy))
      .sort((a, b) => b[1].list.length - a[1].list.length)
      .slice(0, SR_MAX)
      .map(([k, x]) =>
        row(cat(x.list[0].cat) || XFER_EMB, x.name, sub(x.list), "sr-scope", (type === "expense" ? "out:" : "in:") + k)
      );
  };
  const used = (list, f) =>
    list
      .map(x => ({ x, list: all.filter(t => f(t, x)) }))
      .filter(y => y.list.length)
      .sort((a, b) => b.list.length - a.list.length)
      .slice(0, SR_MAX);
  const cats = used(
    S.cats.filter(c => srNameHit(catName(c), q, fuzzy)),
    (t, c) => t.cat === c.id && !t.feeOf
  ).map(({ x, list }) => row(x, catName(x), sub(list), "sr-scope", "cat:" + x.id));
  const accs = used(
    S.accounts.filter(a => srNameHit(a.name, q, fuzzy)),
    (t, a) => t.account === a.id || t.to === a.id
  ).map(({ x, list }) => row(accEmb(x), x.name, sub(list), "sr-scope", "acc:" + x.id));
  const people = S.loans
    .filter(l => l.person && srNameHit(l.person, q, fuzzy))
    .slice(0, SR_MAX)
    .map(l => {
      const i = loanInfo(l);
      return row(
        LOAN_EMB[l.kind],
        l.person,
        T(l.kind === "lend" ? "tx.lending" : "tx.loan") + " · " + stLabel(l, i.st),
        "loan-open",
        l.id
      );
    });
  const hits = all.filter(t => srEntryHit(t, q, fuzzy));
  let ents = "";
  if (hits.length)
    ents =
      '<div class="sec">' +
      TH("search.entries") +
      '</div><div class="list">' +
      hits.slice(0, SR_MAX).map(txLine).join("") +
      "</div>" +
      (hits.length > SR_MAX
        ? '<button class="btn text" data-act="sr-scope" data-v="all:">' +
          TH("search.showAll", { n: hits.length }) +
          "</button>"
        : "");
  return (
    group(T("entry.paidTo"), payees("expense")) +
    group(T("entry.receivedFrom"), payees("income")) +
    group(T("search.cats"), cats) +
    group(T("home.accounts"), accs) +
    group(T("search.people"), people) +
    ents
  );
}
/* one group item opened: all its entries by day (newest first) and their total, all time */
function srScope(v) {
  const i = v.indexOf(":"),
    k = v.slice(0, i),
    id = v.slice(i + 1);
  const label =
    k === "cat"
      ? catName(cat(id))
      : k === "acc"
        ? (acc(id) || {}).name
        : k === "all"
          ? SR.q.trim()
          : (S.txns.find(t => t.payee && srFold(t.payee) === id) || {}).payee;
  SR.scope = { k, v: id, label: label || "?", fuzzy: k === "all" && !S.txns.some(t => srEntryHit(t, srTerms(SR.q))) };
  srRedraw();
  scrollTo(0, 0);
}
/* one result's entries, by Week, Month, Year or All (SR.scope.span), like the Summary: up to six bars ending at the
   chosen period (years for All), none before its first entry, that period's total against the one before, and its entries. The bars are for looking only; they
   count spending, or money received when the result has no spending (a "Received from"). */
const SR_SPANS = ["a", "w", "m", "y"]; // the tabs, in order: All first
const srStart = (span, d) =>
  span === "w" ? weekStart(d) : span === "m" ? d.slice(0, 7) + "-01" : d.slice(0, 4) + "-01-01";
const srShift = (span, s, k) =>
  span === "w"
    ? addDays(s, 7 * k)
    : span === "m"
      ? shiftMonth(s.slice(0, 7), k) + "-01"
      : String(+s.slice(0, 4) + k).padStart(4, "0") + "-01-01";
const srEnd = (span, s) =>
  span === "w" ? addDays(s, 6) : span === "m" ? monthEnd(s.slice(0, 7)) : s.slice(0, 4) + "-12-31";
function srList() {
  const { k, v, fuzzy } = SR.scope,
    q = srTerms(SR.q),
    f =
      k === "out"
        ? t => t.type === "expense" && !t.feeOf && t.payee && srFold(t.payee) === v
        : k === "in"
          ? t => t.type === "income" && t.payee && srFold(t.payee) === v
          : k === "cat"
            ? t => t.cat === v && !t.feeOf
            : k === "acc"
              ? t => t.account === v || t.to === v
              : t => srEntryHit(t, q, fuzzy);
  return S.txns.filter(f).sort(byNewest);
}
function srSpan(span) {
  SR.scope.span = span;
  SR.scope.at = srStart(span, today());
  srRedraw();
}
function srNav(d) {
  const sc = SR.scope;
  sc.at = srShift(sc.span, sc.at, d);
  srRedraw();
}
function srScoped() {
  const all = srList(),
    sc = SR.scope,
    t = today();
  if (!all.length) return '<div class="empty">' + TH("search.none", { q: sc.label }) + "</div>";
  /* it opens on this month, or on All when nothing of it is this month */
  if (!sc.span) {
    sc.span = all[0].date >= srStart("m", t) ? "m" : "a";
    sc.at = srStart(sc.span, t);
  }
  const span = sc.span,
    A = span === "a",
    s = A ? "" : sc.at,
    e = A ? "" : srEnd(span, s),
    list = A ? all : all.filter(x => x.date >= s && x.date <= e),
    /* the bars: in the currency most of its entries are in, spending unless it has none */
    cn = {};
  all.forEach(x => {
    const c = (acc(x.account) || {}).currency;
    cn[c] = (cn[c] || 0) + 1;
  });
  const cur = Object.keys(cn).sort((p, q) => cn[q] - cn[p])[0],
    gotOnly = !all.some(isSpend),
    counts = gotOnly ? x => x.type === "income" : isSpend,
    vals = all.filter(x => counts(x) && inCur(x, cur)),
    sum = (a, b) => rnd(vals.reduce((n, x) => (x.date >= a && x.date <= b ? n + x.amount : n), 0));
  const first = srStart(A ? "y" : span, all[all.length - 1].date),
    bars = [];
  for (let i = 5; i >= 0; i--) {
    const bs = srShift(A ? "y" : span, A ? srStart("y", t) : s, -i);
    if (bs < first) continue; // nothing before its first entry
    const be = srEnd(A ? "y" : span, bs);
    bars.push({ s: bs, e: be, v: sum(bs, be) });
  }
  const max = Math.max(...bars.map(b => b.v), 0),
    xLabel = b =>
      span === "w"
        ? parseISO(b.s).toLocaleDateString(DATE_LOC, { day: "numeric", month: "short" })
        : span === "m"
          ? capFirst(parseISO(b.s).toLocaleDateString(DATE_LOC, { month: "short" }))
          : b.s.slice(0, 4),
    full = b =>
      span === "w"
        ? T("summary.weekOf", { date: parseISO(b.s).toLocaleDateString(DATE_LOC, { day: "numeric", month: "short" }) })
        : span === "m"
          ? capFirst(monthLabel(b.s.slice(0, 7)))
          : b.s.slice(0, 4);
  let h =
    '<div class="seg srspan">' +
    SR_SPANS.map(
      k =>
        '<button data-act="sr-span" data-v="' +
        k +
        '" aria-pressed="' +
        (span === k) +
        '">' +
        TH("search.span." + k) +
        "</button>"
    ).join("") +
    "</div>";
  if (!A)
    h +=
      '<div class="cal-h"><button class="icon" data-act="sr-nav" data-v="-1" aria-label="' +
      TH("summary.earlier") +
      '"' +
      (s <= first ? " disabled" : "") +
      ">" +
      ic("left") +
      "</button><b>" +
      esc(span === "w" ? rangeLabel(s, e) : span === "m" ? capFirst(monthLabel(s.slice(0, 7), true)) : s.slice(0, 4)) +
      '</b><button class="icon" data-act="sr-nav" data-v="1" aria-label="' +
      TH("summary.later") +
      '"' +
      (e >= t ? " disabled" : "") +
      ">" +
      ic("right") +
      "</button></div>";
  h +=
    '<div class="smchart smc srbars' +
    (gotOnly ? " got" : "") +
    '">' +
    bars
      .map(
        b =>
          '<div class="smcol' +
          (A || b.s === s ? " on" : "") +
          '" role="img" aria-label="' +
          TH("common.labelValue", { label: full(b), value: money(b.v, cur) }) +
          '"><span class="v">' +
          (b.v ? esc(compact(b.v)) : "") +
          '</span><span class="bw"><span class="b" style="height:' +
          (b.v ? Math.max(2, (b.v / max) * 100) : 0).toFixed(1) +
          '%"></span></span><span class="x">' +
          esc(xLabel(b)) +
          "</span></div>"
      )
      .join("") +
    "</div>";
  /* the period against the one before; one that isn't over yet by the same days of the one before; not when the
     notebook was started during the one before (its total would be only part of it) */
  let cmp = "";
  if (!A && srShift(span, s, -1) >= S.txns.reduce((m, x) => (x.date < m ? x.date : m), t)) {
    const v = sum(s, e > t ? t : e),
      ps = srShift(span, s, -1),
      pe = e > t ? addDays(ps, daysBetween(s, t)) : srEnd(span, ps),
      was = sum(ps, pe < srEnd(span, ps) ? pe : srEnd(span, ps));
    if (was > 0 && v > 0) {
      const p = Math.round(((v - was) / was) * 100),
        key = span === "y" ? (e > t ? "yp" : "y") : span;
      cmp = T("summary." + (p === 0 ? "same" : p > 0 ? "up" : "down") + "." + key, {
        pct: percent(Math.abs(p)),
        year: +s.slice(0, 4) - 1,
      });
    }
  }
  if (!list.length)
    return h + '<div class="empty">' + TH("history.none." + { w: "range", m: "month", y: "year" }[span]) + "</div>";
  const tot = srTotals(list),
    one = list.filter(counts),
    avg =
      one.length === list.length && one.every(x => inCur(x, cur))
        ? T("search.avg", { amount: money(rnd(one.reduce((n, x) => n + x.amount, 0) / one.length), cur) })
        : "",
    n = T("home.entries", { count: list.length });
  return (
    h +
    '<div class="smd srsum"><div class="muted small">' +
    esc([A ? T("search.allTime", { entries: n }) : n, avg].filter(Boolean).join(" · ")) +
    "</div>" +
    (tot.spent ? '<div class="big spent">' + esc(tot.spent) + "</div>" : "") +
    (tot.got ? '<div class="big got">' + esc(tot.got) + "</div>" : "") +
    (cmp ? '<div class="muted small">' + esc(cmp) + "</div>" : "") +
    "</div>" +
    dayGroups(list)
  );
}
