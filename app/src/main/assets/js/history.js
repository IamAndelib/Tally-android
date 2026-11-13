/*
 * history.js — History: its filters and totals, the Filters sheet and the screen. What filters History has (`HF`:
 * account, kind, then a category, a person or a transfer's two sides), which entries they leave (`histList()`,
 * `histMatch()`), which of those are rows (`histRows()`: an add-on, a charge, a tip or a lend's transfer charge, is
 * shown inside its entry, never as a row, and an archived entry is not listed, though it counts in every total; search
 * lists it too while Settings says so: `listRows()`), the totals in words (`histLines()`, `histHeadSay()`,
 * `histColumn()`), and going back to the default view (`histClear()`, `histDrop()`, `openHistory()`); and the screen
 * itself (`historyView()`: period chip, Filters button, one chip per set filter, month headings with their totals; only
 * the first rows are drawn, the rest as the end comes near), with its pinned header (`histPin()`: the bar, the Filters
 * row and the month in view stay at the top while the entries scroll; Settings' bar and section headings the same
 * way). A fee follows its entry everywhere: it has that entry's kind and matches whatever that entry matches, but an
 * account only on its own (a transfer's charge is its From account's). Last, the Archived screen (`archiveView()`,
 * `archOpen()`, `archBack()`): the archived entries, reached from the Filters row's archive button.
 */
const histBlank = () => ({ acc: "", kind: "", cat: "", who: "", from: "", to: "", q: "", pay: "", amt: "" });
let HF = histBlank();
/* the kinds of money movement, in the order they are offered; a fee (feeOf) takes its entry's kind (histKind) */
const HIST_KINDS = [
  ["out", isSpend],
  ["in", t => t.type === "income"],
  ["xfer", t => t.type === "transfer"],
  ["lend", t => t.type === "loan" && (loan(t.loan) || {}).kind === "lend"],
  ["borrow", t => t.type === "loan"],
  ["fix", t => t.type === "adjust"],
];
/* Charges and Extras, offered after them: not kinds of movement but what an entry carries (docs/specs/charges.md), so an
   entry is in its own kind and in either or both of these. Charges: a charge paid with it (a purchase's, a transfer's
   or a loan payment's, a lending payment's older paid fee), a lend's transfer charge, a borrow's charges (listed while
   unpaid too) or a payment covering them; Extras: a tip on a payback, a lend's extra or a payment covering one. With an
   account filter a charge or tip is carried only into the view of the account it is paid from or into, as on Spent
   and Received (histCarries). Worked out from the entries and loanParts(), never stored; the id goes in HF.kind like
   any kind's. */
const HIST_MORE = [
  [
    "charges",
    (t, f, skip) => histAddOn(t, ["expense", "loan"], f, skip) || histDraw(t, "borrow") || histCarry(t, "out"),
  ],
  ["extras", (t, f, skip) => histAddOn(t, ["income"], f, skip) || histDraw(t, "lend") || histCarry(t, "in")],
];
const histAddOn = (t, types, f, skip) => {
  const a = addOnOf(t);
  return !!a && types.includes(a.type) && (skip === "acc" || !f.acc || a.account === f.acc);
};
/* a draw of a loan of this kind owing an amount on top (a borrow's charges, a lend's extra) */
const histDraw = (t, kind) => t.type === "loan" && !!t.principal && t.onTop > 0 && (loan(t.loan) || {}).kind === kind;
/* is entry t in kind k: its own kind, Spent or Received carrying such money, or Charges or Extras */
function histIs(t, k, f = HF, skip = "") {
  const more = HIST_MORE.find(m => m[0] === k);
  if (more) return more[1](t, f, skip);
  return histKind(t) === k || ((k === "out" || k === "in") && histCarries(t, k, f, skip));
}
const histHost = t => (t.feeOf ? entry(t.feeOf) || null : null);
function histKind(t) {
  const host = histHost(t);
  if (host) return histKind(host);
  const found = HIST_KINDS.find(k => k[1](t));
  return found ? found[0] : "out"; // a fee whose entry is gone is still an expense
}
/* the words typed, split once per text (every entry is compared against the same ones) */
let HQ = ["", []];
const srTermsOf = q => (HQ[0] === q ? HQ[1] : ((HQ = [q, srTerms(q)]), HQ[1]));
/* The entries that carry spending or received money inside them without being spending or income (docs/specs/charges.md,
   D1), which the Spent ("out") and Received ("in") views list too: a transfer's or loan payment's charge, a payment
   covering a loan's charges and a written-off lend's draw; a lending's payback with a tip or covering its extra. Their
   ids, worked out once per loanParts(). With an account filter (f.acc, unless skipped), a charge is carried only into
   the view of the account that paid it: a transfer's From side (an add-on matches an account on its own: histMatch). */
let HCARRY = null;
/* whether a worked-out part of entry t counts as spending ("out") or received ("in") */
function histCarry(t, kind) {
  const parts = loanParts();
  if (!HCARRY || HCARRY.parts !== parts) {
    HCARRY = { parts, out: new Set(), in: new Set() };
    parts.forEach(p => HCARRY[p.as === "spend" ? "out" : "in"].add(p.of));
  }
  return HCARRY[kind].has(t.id);
}
const histCarries = (t, kind, f, skip) =>
  histAddOn(t, [kind === "out" ? "expense" : "income"], f, skip) || histCarry(t, kind);
/* The draws a worked-out part is dated on when that isn't its payment's day (credit covering a later draw's extra or
   charges: loanParts()'s at), each with the payments whose parts they are: whatever keeps such a payment keeps that
   draw too, so the day the part counts on is drawn, with its heading. Worked out once per loanParts(). */
let HAT = null;
function histAt(id) {
  const parts = loanParts();
  if (!HAT || HAT.parts !== parts) {
    HAT = { parts, m: new Map() };
    parts.forEach(p => p.at && HAT.m.set(p.at, (HAT.m.get(p.at) || []).concat(p.of)));
  }
  return HAT.m.get(id);
}
/* skip: "acc", "kind" or "sub" (category, person, sides) is left out, to count what an option would leave. An add-on
   matches what its entry matches, but an account only on its own: a transfer's charge is the From account's, so
   filtered to the To account the transfer is kept and its charge is not counted (docs/specs/history-filters.md). */
function histMatch(t, f = HF, skip = "") {
  const host = histHost(t);
  if (host) return (skip === "acc" || !f.acc || t.account === f.acc) && histMatch(host, f, skip);
  if (histOwn(t, f, skip)) return true;
  const of = histAt(t.id);
  return !!of && of.some(id => !!entry(id) && histOwn(entry(id), f, skip));
}
function histOwn(t, f, skip) {
  if (skip !== "acc" && f.acc && t.account !== f.acc && t.to !== f.acc) return false;
  if (skip !== "kind" && f.kind && !histIs(t, f.kind, f, skip)) return false;
  if (f.q && !srEntryHit(t, srTermsOf(f.q), false)) return false;
  if (f.pay && !srPayHit(t, f.pay)) return false;
  if (f.amt && !srAmtHit(t, f.amt)) return false;
  if (skip === "sub") return true;
  if (f.cat && t.cat !== f.cat) return false;
  if (f.who && !(t.loan && loan(t.loan) && loanWho(loan(t.loan)) === f.who)) return false;
  if (f.from && !(t.type === "transfer" && t.account === f.from)) return false;
  if (f.to && !(t.type === "transfer" && t.to === f.to)) return false;
  return true;
}
const histPick = (f = HF, skip) => {
  const [s, e] = range(HP);
  return S.txns.filter(t => t.date >= s && t.date <= e && histMatch(t, f, skip));
};
const histList = (f = HF, skip) => histPick(f, skip).sort(byNewest);
/* the entries that have rows of their own: an add-on rides inside its entry */
const entryRows = list => list.filter(t => !(t.feeOf && entry(t.feeOf)));
/* the rows History shows: an archived entry is not listed (it still counts in every total: the headings work from the
   whole list); the Archived screen shows only those (archRows) */
const histRows = list => entryRows(list).filter(t => !t.archived);
const archRows = list => entryRows(list).filter(t => t.archived);
/* Settings → History → "Archived entries in search" (docs/specs/history-archive.md, C): search lists archived entries
   too, marked (txLine), and its suggestions, counts and typo hint count them; History without a search, Home and
   Summary still leave them out. listRows: the rows History lists now (search's, or its own) */
const findArch = () => !!V.find && S.settings.searchArch === true;
const listRows = list => (findArch() ? entryRows(list) : histRows(list));
/* the rows a selection can take: never an archived one (search may list it; it stays in sight, not selectable, so
   Select all, the count, Archive selected and Delete selected are about the others only) */
const selRows = histRows;
/* the totals of a list as lines, one per currency (by code) for each phrase of the kind shown, in the order they stack in a
   heading: {key, tone, cur, amount}. Tone: "in" (+, green), "out" (−, red), "mv" and "fee" (words only).
   By the counting rule (docs/specs/charges.md, "History headings and filters"): a charge is spending (inside "spent")
   on the default and Spent views, and in words ("Charges") on Transfers, Lent and Borrowed; a tip on a payback is
   received, and on Lent both back (with its payback) and in words ("Extras"); a lend's transfer charge is lent money.
   With span (the heading's first and last day), the parts of loans worked out (loanParts()) of those days whose entry
   the list's filters keep (histLoanParts()) count too: in "spent" and "received", or on Lent and Borrowed in words (an
   extra paid back in "extras", charges paid back or a written-off transfer charge in "charges"). On Charges and on
   Extras the one phrase is in words too: the charges counted as spending (a purchase's in its category included), or
   the extras counted as received; nothing else the entries move. A phrase whose amount is 0 is left out. */
const HIST_TONE = {
  received: "in",
  gotBack: "in",
  borrowed: "in",
  added: "in",
  spent: "out",
  lent: "out",
  paidBack: "out",
  takenOff: "out",
  moved: "mv",
  extras: "fee",
  charges: "fee",
};
const HIST_CLS = { in: "hc-in", out: "hc-out", mv: "hc-mv", fee: "hc-fee" };
function histLines(list, kind, span) {
  const sums = {};
  const add = (key, cur, v) => {
    const m = sums[key] || (sums[key] = {});
    m[cur] = rnd((m[cur] || 0) + v);
  };
  const words = kind === "xfer" || kind === "lend" || kind === "borrow",
    only = kind === "charges" ? ["expense", "spend"] : kind === "extras" ? ["income", "income"] : null;
  list.forEach(t => {
    const cur = (acc(t.account) || {}).currency || S.settings.cur;
    if (only) return t.feeOf && t.type === only[0] ? add(kind, cur, t.amount) : 0;
    if (t.feeOf && t.type === "expense")
      return words ? add("charges", cur, t.amount) : !kind || kind === "out" ? add("spent", cur, t.amount) : 0;
    if (t.feeOf && t.type === "income" && kind === "lend") {
      add("gotBack", cur, t.amount);
      return add("extras", cur, t.amount);
    }
    if (isSpend(t)) add("spent", cur, t.amount);
    else if (t.type === "income") add("received", cur, t.amount);
    else if (t.type === "transfer") add("moved", cur, t.amount);
    else if (t.type === "adjust") add(t.amount < 0 ? "takenOff" : "added", cur, Math.abs(t.amount));
    else if (t.type === "loan") {
      const lend = (loan(t.loan) || {}).kind === "lend";
      add(lend ? (t.dir === "out" ? "lent" : "gotBack") : t.dir === "in" ? "borrowed" : "paidBack", cur, t.amount);
    }
  });
  if (span)
    histLoanParts().forEach(
      p =>
        p.date >= span[0] &&
        p.date <= span[1] &&
        (only
          ? p.as === only[1] && add(kind, p.cur, p.amount)
          : add(p.as === "spend" ? (words ? "charges" : "spent") : words ? "extras" : "received", p.cur, p.amount))
    );
  const order = {
    "": ["received", "spent"],
    out: ["spent"],
    in: ["received"],
    xfer: ["moved", "charges"],
    lend: ["gotBack", "lent", "extras", "charges"],
    borrow: ["borrowed", "paidBack", "charges"],
    fix: ["added", "takenOff"],
    charges: ["charges"],
    extras: ["extras"],
  }[kind || ""];
  const lines = [];
  order.forEach(key =>
    Object.entries(sums[key] || {})
      .filter(e => e[1])
      .sort((a, b) => mainFirst(a[0], b[0]))
      .forEach(([cur, amount]) => lines.push({ key, tone: HIST_TONE[key], cur, amount }))
  );
  return lines;
}
/* the parts of loans worked out as spending or received (loanParts()) that History counts: those of its period whose
   entry its filters keep (as a fee follows its entry), each on its own day. Worked out once per loanParts() and view. */
let HPARTS = null;
function histLoanParts() {
  const parts = loanParts(),
    sig = histSig();
  if (!HPARTS || HPARTS.parts !== parts || HPARTS.sig !== sig) {
    const [s, e] = range(HP);
    HPARTS = {
      parts,
      sig,
      list: parts.filter(p => p.date >= s && p.date <= e && entry(p.of) && histMatch(entry(p.of))),
    };
  }
  return HPARTS.list;
}
/* a line in words ("$X spent", "Transferred $X"): what a screen reader says */
const histSay = ls =>
  T(ls[0].key === "spent" || ls[0].key === "received" ? "search." + ls[0].key : "history.words." + ls[0].key, {
    amount: ls.map(l => money(l.amount, l.cur)).join(" + "),
  });
/* what a heading says to a screen reader: its title and each kind once ("$X + €Y spent"), as one sentence */
function histHeadSay(title, lines) {
  const kinds = [];
  lines.forEach(l => {
    const k = kinds.find(g => g[0].key === l.key);
    if (k) k.push(l);
    else kinds.push([l]);
  });
  return kinds.length ? T("history.headSay", { title, parts: kinds.map(histSay).join(", ") }) : title;
}
/* the stacked column at the right of a month or day heading: signed figures (+ green over − red), or words
   (Transfers). Hidden from screen readers: the heading's own name says it all (histHeadSay). */
function histColumn(lines) {
  if (!lines.length) return "";
  const one = l =>
    '<span class="' +
    (l.tone === "in" || l.tone === "out" ? "hcl hcf " : "hcl ") +
    HIST_CLS[l.tone] +
    '">' +
    esc(l.tone === "in" || l.tone === "out" ? signed(l.tone === "in" ? l.amount : -l.amount, l.cur) : histSay([l])) +
    "</span>";
  return '<span class="hcol" aria-hidden="true">' + lines.map(one).join("") + "</span>";
}
/* a filter whose account, category or person is gone (an account can't be deleted, but a backup can be restored) */
function histDrop() {
  ["acc", "from", "to"].forEach(k => HF[k] && !acc(HF[k]) && (HF[k] = ""));
  if (HF.cat && !S.cats.some(c => c.id === HF.cat)) HF.cat = "";
  if (HF.who && !S.loans.some(l => loanWho(l) === HF.who)) HF.who = "";
  if (HF.pay && !S.txns.some(t => srPayHit(t, HF.pay))) HF.pay = "";
  HF = histNorm(HF);
}
/* the sides of a transfer filter, made to agree with the rest: only for Transfers; with an account picked, one side set
   means the other is that account, and a side that is the account with the other empty means "both ways" (neither) */
function histNorm(f) {
  const o = { ...f };
  if (o.kind !== "xfer") return { ...o, from: "", to: "" };
  if (o.acc && !o.from !== !o.to) {
    if (o.from === o.acc || o.to === o.acc) Object.assign(o, { from: "", to: "" });
    else if (o.from) o.to = o.acc;
    else o.from = o.acc;
  }
  return o;
}
function histClear() {
  HF = histBlank();
  HSHOW.sig = "";
  histAllTime();
}
/* History with the given filters (an account's "Open in History"), on all time or on period p (a Summary part's
   "Show all": {period, anchor, rs, re}) */
function openHistory(f = {}, p = null) {
  if (V.find) findEnd();
  HF = histNorm({ ...histBlank(), ...f });
  if (p) Object.assign(HP, p);
  else histAllTime();
  HSHOW.sig = "";
  V.screen = "history";
  V.open = "";
  render();
}

/* an entry just saved that the History list (its filters, words and period) no longer holds: its own row, or the one
   its fee is shown in */
function histGone(id) {
  const filtered = HP.period !== "all" || histCount() > 0 || !!(V.find && HF.q.trim());
  return filtered && !!entry(id) && !HLIST.some(t => t.id === id || t.feeOf === id || t.feeId === id);
}
/* the filters that are set and shown as chips and counted: with an account picked, a transfer side that is that account
   is implied by the other side (the sheet shows it locked), so it is neither */
const histSet = () =>
  ["acc", "kind", "cat", "who", "from", "to", "pay", "amt"].filter(
    k => HF[k] && !((k === "from" || k === "to") && HF.acc && HF[k] === HF.acc && HF.from && HF.to)
  );
const histCount = () => histSet().length;
/* ---- the Filters sheet: works on a copy (HFD); Show makes it the filters (HF), closing it any other way drops it */
let HFD = null,
  HFSIDE = "";
const histAcc = a => a && (!a.archived || S.txns.some(t => t.account === a.id || t.to === a.id));
const histAccs = () => S.accounts.filter(histAcc);
/* what picking one side (From or To) gives; with an account picked the other side is that account (an empty side
   empties both) */
function hfSide(d, side, id) {
  const o = { ...d },
    other = side === "from" ? "to" : "from";
  o[side] = id;
  if (d.acc) o[other] = id ? d.acc : "";
  return o;
}
/* in search, the Filters sheet counts what the list would show (archived matches too, when Settings says so) */
const hfRows = f => listRows(histList(f));
/* how many rows a choice would leave (no sorting: only the count is wanted) */
const hfCount = f => listRows(histPick(f)).length;
/* how often each key comes up among the entries (most used first, then as listed) */
function hfTally(list, key) {
  const m = new Map();
  list.forEach(t => {
    const k = key(t);
    if (k) m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
const HF_TICK = '<span class="hftk" aria-hidden="true">✓</span>';
/* a compact option: dimmed (aria-disabled, taps ignored) at 0 unless picked; its count is read with it */
function hfChip(act, v, on, inner, n, o = {}) {
  const dim = n === 0 && !on,
    tick = on && !/\blead\b/.test(o.cls || ""); // a chip with an emblem shows its check in the emblem
  if (tick) inner = HF_TICK + inner;
  return (
    '<button class="chip hfc' +
    (tick ? " tk" : "") +
    (o.cls ? " " + o.cls : "") +
    (dim ? " dim" : "") +
    '" data-act="' +
    act +
    '" data-v="' +
    esc(v) +
    '"' +
    (o.k ? ' data-k="' + o.k + '"' : "") +
    ' aria-pressed="' +
    on +
    '"' +
    (dim ? ' aria-disabled="true"' : "") +
    (o.attrs || "") +
    ">" +
    inner +
    (n == null ? "" : ' <span class="hfn">' + n + "</span>") +
    "</button>"
  );
}
const hfName = s => '<span class="chn" dir="auto">' + esc(s) + "</span>";
/* a dropdown chip (From, To): the account's dot and tint once one is chosen */
function hfSideChip(side) {
  const id = HFD[side],
    a = id && acc(id),
    label = a ? T("history." + side + "Acc", { account: a.name }) : T("history." + side + "Any"),
    lock = !!(HFD.acc && id === HFD.acc),
    inner = (a ? '<span class="adot"' + accVar(a) + "></span>" : "") + hfName(label);
  if (lock) return '<span class="chip hfc lock tinted"' + accVar(a) + ">" + inner + "</span>";
  return (
    '<button class="chip hfc' +
    (a ? " tinted tk" : "") +
    '" data-act="' +
    (side === "from" ? "hfs-from" : "hfs-to") +
    '" aria-haspopup="dialog"' +
    (a ? accVar(a) : "") +
    ">" +
    (a ? HF_TICK : "") +
    inner +
    ic("down") +
    "</button>"
  );
}
function hfBody() {
  const d = HFD,
    kindOf = k => ({ ...d, kind: k, cat: "", who: "", from: "", to: "" });
  let h = '<div class="sec">' + TH("common.account") + '</div><div class="hfrow">';
  h += hfChip("hfs-acc", "", !d.acc, hfName(T("history.all")));
  histAccs().forEach(a => {
    const n = hfCount({ ...d, acc: a.id });
    h += hfChip(
      "hfs-acc",
      a.id,
      d.acc === a.id,
      '<span class="adot"' +
        accVar(a) +
        "></span>" +
        hfName(a.name + (a.archived ? " (" + T("account.archivedTag") + ")" : "")),
      n,
      { cls: "acct", attrs: accVar(a) }
    );
  });
  h += '</div><div class="sec">' + TH("history.transactions") + '</div><div class="hfrow">';
  h += hfChip("hfs-kind", "", !d.kind, hfName(T("history.all")));
  HIST_KINDS.forEach(([k]) => {
    if (!S.txns.some(t => histKind(t) === k)) return; // never had one
    h += hfChip("hfs-kind", k, d.kind === k, hfName(T("history.kind." + k)), hfCount(kindOf(k)));
  });
  HIST_MORE.forEach(([k, has]) => {
    if (!S.txns.some(t => has(t, histBlank(), ""))) return;
    h += hfChip("hfs-kind", k, d.kind === k, hfName(T("history.kind." + k)), hfCount(kindOf(k)));
  });
  h += "</div>";
  if (d.kind === "out" || d.kind === "in") {
    const rows = hfRows({ ...d, cat: "" }),
      cats = hfTally(rows, t => t.cat);
    if (d.cat && !cats.some(c => c[0] === d.cat)) cats.push([d.cat, 0]);
    h += '<div class="sec">' + TH("history.category") + '</div><div class="hfrow">';
    h += hfChip("hfs-sub", "", !d.cat, hfName(T("history.all")), null, { k: "cat" });
    cats.forEach(([id, n]) => {
      const c = S.cats.find(x => x.id === id);
      if (c) h += hfChip("hfs-sub", id, d.cat === id, chipEmb(c) + hfName(catName(c)), n, { k: "cat", cls: "lead" });
    });
    h += "</div>";
  } else if (d.kind === "lend" || d.kind === "borrow") {
    const people = hfTally(hfRows({ ...d, who: "" }), t => t.loan && loan(t.loan) && loanWho(loan(t.loan)));
    if (d.who && !people.some(p => p[0] === d.who)) people.push([d.who, 0]);
    h +=
      '<div class="sec">' +
      TH(d.kind === "lend" ? "history.lentSec" : "history.borrowedSec") +
      '</div><div class="hfrow">';
    h += hfChip("hfs-sub", "", !d.who, hfName(T("history.everyone")), null, { k: "who" });
    people.forEach(([who, n]) => {
      h += hfChip("hfs-sub", who, d.who === who, hfName(who), n, { k: "who" });
    });
    h += "</div>";
  } else if (d.kind === "xfer") {
    h +=
      '<div class="sec">' +
      TH("history.between") +
      '</div><div class="hfrow hfsides">' +
      hfSideChip("from") +
      '<button class="icon hfswap" data-act="hfs-swap" aria-label="' +
      TH("history.swap") +
      '">' +
      ic("swap") +
      "</button>" +
      hfSideChip("to") +
      "</div>";
    const a = d.acc && acc(d.acc);
    if (a) h += '<div class="hfhint">' + TH("history.oneSide", { account: { html: accTag(a) } }) + "</div>";
  }
  return h;
}
function hfFoot() {
  const n = hfCount(HFD);
  return (
    '<button class="hclear" data-act="hfs-clear">' +
    TH("history.clearAll") +
    '</button><button class="btn" data-act="hfs-show"' +
    (n ? "" : " disabled") +
    ">" +
    TH(n ? "history.show" : "history.showNone", { count: n }) +
    "</button>"
  );
}
/* draw the sheet's choices again (the foot too), keeping the focus where it was */
function hfsDraw() {
  const root = $("#sheet");
  if (!HFD || !$("#hfs-body")) return;
  keepFocus(root, () => {
    $("#hfs-body").innerHTML = hfBody();
    $("#hfs-foot").innerHTML = hfFoot();
  });
  fitWrapped(root, ".chip .chn");
}
function filtersSheet() {
  histDrop();
  HFD = histNorm(HF);
  openSheet(T("history.filters"), '<div id="hfs-body"></div><div class="hfs-foot" id="hfs-foot"></div>');
  hfsDraw();
}
/* From / To as a menu of accounts with how many entries each leaves; it opens downward, or upward where there is no
   room below */
function hfMenu(side, btn) {
  HFSIDE = side;
  const a = HFD.acc,
    items = [["", T("history.anyAccount"), hfCount(hfSide(HFD, side, ""))]].concat(
      histAccs()
        .filter(x => x.id !== a)
        .map(x => [x.id, x.name, hfCount(hfSide(HFD, side, x.id)), x])
    );
  $("#pop").innerHTML =
    '<div class="pop" data-act="pop-bg"><div class="hmenu" role="dialog" aria-modal="true" aria-label="' +
    esc(T(side === "from" ? "transfer.from" : "transfer.to")) +
    '">' +
    items
      .map(([id, name, n, x]) => {
        const on = HFD[side] === id,
          dim = n === 0 && !on;
        return (
          '<button class="hmi' +
          (dim ? " dim" : "") +
          '" data-act="hfs-pick" data-v="' +
          esc(id) +
          '" aria-pressed="' +
          on +
          '"' +
          (dim ? ' aria-disabled="true"' : "") +
          ">" +
          (x ? '<span class="adot"' + accVar(x) + "></span>" : "") +
          hfName(name) +
          (id ? ' <span class="hfn">' + n + "</span>" : "") +
          (on ? ic("check") : "") +
          "</button>"
        );
      })
      .join("") +
    "</div></div>";
  const m = $("#pop .hmenu"),
    r = btn.getBoundingClientRect(),
    h = m.offsetHeight,
    below = innerHeight - r.bottom - 8,
    up = r.top - 8;
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + "px";
  if (h <= below || below >= up) {
    m.style.top = r.bottom + 4 + "px";
    m.style.maxHeight = Math.max(120, below - 4) + "px";
  } else {
    m.style.bottom = innerHeight - r.top + 4 + "px";
    m.style.maxHeight = Math.max(120, up - 4) + "px";
  }
  fitWrapped($("#pop"), ".chn");
}
const histChip = (v, text, label, attrs = "") =>
  '<button class="chip hchip" data-act="hf-del" data-v="' +
  v +
  '" aria-label="' +
  esc(T("history.removeFilter", { name: label })) +
  '"' +
  attrs +
  ">" +
  text +
  ic("close") +
  "</button>";
/* the set filters, one full-size chip each: account (with its colour dot and tint), kind, then what depends on it */
function histChips() {
  const h = [],
    plain = s => '<span class="chn" dir="auto">' + esc(s) + "</span>";
  const a = HF.acc && acc(HF.acc);
  if (a)
    h.push(
      histChip(
        "acc",
        '<span class="adot"' + accVar(a) + '></span><span class="chn" dir="auto">' + esc(a.name) + "</span>",
        a.name,
        accVar(a)
      )
    );
  if (HF.kind) {
    const k = T("history.kind." + HF.kind);
    h.push(histChip("kind", plain(k), k));
  }
  if (HF.cat) {
    const c = S.cats.find(x => x.id === HF.cat),
      n = c ? catName(c) : HF.cat;
    h.push(histChip("sub", plain(n), n));
  }
  if (HF.who) {
    /* the name alone when no kind says which way (a person picked from a search suggestion) */
    const n =
      HF.kind === "lend" || HF.kind === "borrow"
        ? T(HF.kind === "borrow" ? "history.borrowedFrom" : "history.lentTo", { who: HF.who })
        : HF.who;
    h.push(histChip("sub", plain(n), n));
  }
  [
    ["from", "history.fromAcc"],
    ["to", "history.toAcc"],
  ].forEach(([k, key]) => {
    if (!histSet().includes(k) || !acc(HF[k])) return;
    const n = T(key, { account: acc(HF[k]).name });
    h.push(histChip(k, plain(n), n));
  });
  if (HF.pay) {
    const name = srPayName(HF.pay),
      n = T(HF.pay.startsWith("in:") ? "history.payIn" : "history.payOut", { name });
    h.push(histChip("pay", plain(n), n));
  }
  if (HF.amt) {
    const n = srAmtLabel(HF.amt);
    h.push(histChip("amt", plain(n), n));
  }
  return h.join("");
}
/* the period chip (its label opens the period dialog; once set, its ✕ goes back to all time), Filters, Clear all */
function histBar(clearHere, chips = "", off = false) {
  if (!S.txns.length && !chips && HP.period === "all") return ""; // nothing to filter in a notebook with no entries yet
  const set = HP.period !== "all",
    n = histCount();
  const h =
    '<div class="hbar' +
    (off ? " hoff" : "") +
    '"><div class="hp' +
    (set ? " set" : "") +
    '"><button class="hpl" data-act="hp-open" aria-haspopup="dialog" aria-label="' +
    esc(T("history.choosePeriod", { period: periodLabel(HP) })) +
    '"><span>' +
    esc(periodLabel(HP)) +
    "</span>" +
    (set ? "" : ic("down")) +
    "</button>" +
    (set
      ? '<button class="hpx" data-act="hp-all" aria-label="' + TH("history.showAll") + '">' + ic("close") + "</button>"
      : "") +
    '</div><button class="chip hfbtn' +
    (n ? " on" : "") +
    '" data-act="hf-open" aria-haspopup="dialog">' +
    ic("tune") +
    "<span>" +
    TH(n ? "history.filtersN" : "history.filters", { count: n }) +
    "</span></button>" +
    (chips ? '<div class="hchips">' + chips + "</div>" : "") +
    (clearHere ? histClearBtn() : "") +
    /* the way to the Archived screen: last on the line, only while an entry is archived (not in search) */
    (!V.find && S.txns.some(t => t.archived)
      ? '<button class="chip harch" data-act="arch-open" aria-label="' +
        TH("archive.open") +
        '">' +
        icArchive() +
        "</button>"
      : "") +
    "</div>";
  /* while selecting the row stays where it is, dimmed and out of reach (disabled, out of the tab order and hidden from screen readers; `inert` where the web view knows it) */
  return off
    ? h
        .replace(/<button /g, '<button disabled tabindex="-1" ')
        .replace('class="hbar hoff"', 'class="hbar hoff" aria-hidden="true" inert')
    : h;
}
/* after a chip, the period or Clear all is gone, the focus goes on: to the chip now in the removed one's place (else the
   one before it), else the Filters button, so it never falls back to the page */
function histFocus(sel, at) {
  const all = [...document.querySelectorAll("#app " + sel)];
  landFocus([at == null ? all[0] : all[Math.min(at, all.length - 1)], ".hfbtn"]);
}
/* where the focus goes once the rows of entries `ids` leave the list (deleted, archived, unarchived, saved out of it),
   for landFocus(): the first of them if the list still shows it (search listing archived entries), else the row after
   it, else the one before it, else the Filters button (the Archived screen: its first row, else its back button). By
   entry id, from the list as it is before the change: History's or the Archived screen's whole list (HLIST, drawn or
   not), the entries sheet's or Home's pane's (DAYL, drawn or not). */
function rowsAround(ids) {
  const box = landRoot(),
    own = box !== $("#app") && box.querySelector(".tx.en[data-v]"), // the entries sheet
    rows = b => {
      /* the entries sheet's rows, or Home's (two panes); not the accounts' rows */
      const key = b === $("#sheet") ? "#sheet" : b === $("#app") ? "#app" : "";
      return key && DAYL[key] && b.querySelector(".dmore")
        ? histRows(DAYL[key]).map(t => t.id)
        : [...b.querySelectorAll(".tx.en[data-v]")].map(r => r.dataset.v);
    },
    order =
      own || !histLike()
        ? rows(own ? box : $("#app"))
        : (V.screen === "archive" ? archRows : listRows)(HLIST).map(t => t.id),
    set = new Set(ids),
    i = order.findIndex(id => set.has(id)),
    row = id => ({ row: id }),
    other = list => list.filter(id => !set.has(id)).map(row);
  return [
    ...(i < 0 ? [] : [row(order[i]), ...other(order.slice(i + 1)), ...other(order.slice(0, i).reverse())]),
    ...(V.screen === "archive" ? ['.tx[data-act="row-open"]', '[data-act="arch-back"]'] : [".hfbtn"]),
    ".tx.en[data-v]",
  ];
}
/* the selection ends (its ✕, Back, its last row unticked): a row that had the focus keeps it, else the Select button
   takes it */
function selEnd() {
  const a = document.activeElement,
    r = a && a.closest && a.closest("#app .tx.en[data-v]");
  V.sel = null;
  render();
  landFocus([r && { row: r.dataset.v }, '[data-act="sel-start"]', ".hfbtn"]);
}
const histClearBtn = () => '<button class="hclear" data-act="hf-clear">' + TH("history.clearAll") + "</button>";
/* the entries, month by month: each month in a section of its own (.hsec), a heading with the month's words, then its
   days (dayGroups); the heading stays pinned under the bar while its month scrolls, and the next month's heading pushes
   it up (histPin). Only the first rows are drawn (a notebook of years is thousands of rows); the rest follow as the end
   of the list comes near (histWatch). A chunk ends at the end of a day, and a month cut in two has its heading, with the
   whole month's words, only once: the days that continue it (`cont`) go into its section (histMore). The list holds the
   archived entries too, for the words: a heading shows only over a row (listRows), with every entry in its totals.
   The Archived screen draws its list the same way (arch: its rows are the archived entries, its headings have no
   totals). */
const HIST_CHUNK = 300;
let HSHOW = { sig: "", n: HIST_CHUNK }, // what is drawn: the entries so far, for these filters and this period
  HLIST = [], // the entries it is drawn from (History's, or the Archived screen's)
  HIO = null,
  HARCH = false; // while History's list is drawn, search lists archived entries: their rows are marked (txLine)
const histSig = () => JSON.stringify([HF, HP.period, range(HP)]); // the dates shown, so midnight keeps the rows drawn
const histMonth = t => t.date.slice(0, 7);
/* the markup for list[i..] up to about `budget` entries: `cont`, the days of a month begun in an earlier chunk, and
   `html`, the months that begin in this one; `next` is where the following chunk starts. While selecting, the month
   headings scroll with the entries (their totals are not about the selection): their sections don't pin. arch: the
   Archived screen's list. */
function histMonths(list, i, budget, arch) {
  let h = "",
    cont = "";
  const stop = i + budget,
    sec = '<div class="hsec' + (V.sel ? "" : " pin") + '">',
    rowsOf = arch ? archRows : listRows;
  HLW = V.find && HF.q.trim() ? hlTerms(HF.q) : null; // search mode marks the words in the rows
  HARCH = !arch && findArch();
  try {
    while (i < list.length && i < stop) {
      const m = histMonth(list[i]);
      let j = i;
      while (j < list.length && histMonth(list[j]) === m) j++;
      const head = i === 0 || histMonth(list[i - 1]) !== m;
      /* a month whose entries are all archived has nothing to show: no heading (its days have none either) */
      if (head && !rowsOf(list.slice(i, j)).length) {
        i = j;
        continue;
      }
      let part = "";
      if (head) {
        const title = capFirst(monthLabel(m, true)),
          lines = arch ? [] : histLines(list.slice(i, j), HF.kind, [m + "-01", monthEnd(m)]);
        part +=
          '<div class="hmon" role="heading" aria-level="2" aria-label="' +
          esc(histHeadSay(title, lines)) +
          '"><span aria-hidden="true">' +
          esc(title) +
          "</span>" +
          histColumn(lines) +
          "</div>";
      }
      let e = j;
      if (e > stop) {
        e = stop;
        while (e < j && list[e].date === list[e - 1].date) e++; // the day is whole
      }
      part += dayGroups(list.slice(i, e), arch ? "arch" : true);
      if (head) h += sec + part + "</div>";
      else cont += part; // only a chunk's first month can be one begun before
      i = e;
    }
  } finally {
    HLW = null; // never left on for the rows drawn elsewhere
    HARCH = false;
  }
  return { html: cont + h, cont, months: h, next: i };
}
/* the rest of the list is drawn when the marker after the last row comes within a few screens */
function histWatch() {
  histUnwatch();
  const end = $("#app .hmore");
  if (!end || typeof IntersectionObserver === "undefined") return;
  HIO = new IntersectionObserver(es => es.some(e => e.isIntersecting) && histMore(), { rootMargin: "1500px 0px" });
  HIO.observe(end);
}
function histUnwatch() {
  if (HIO) HIO.disconnect();
  HIO = null;
}
function histMore() {
  const end = $("#app .hmore"),
    arch = V.screen === "archive";
  if (!end || !histLike()) return histUnwatch();
  const r = histMonths(HLIST, +end.dataset.next, HIST_CHUNK, arch),
    secs = document.querySelectorAll("#app .hsec"),
    last = secs[secs.length - 1];
  if (r.cont && last) {
    last.insertAdjacentHTML("beforeend", "<div>" + r.cont + "</div>");
    fitFigures(last.lastElementChild);
  }
  if (r.months) {
    end.insertAdjacentHTML("beforebegin", "<div>" + r.months + "</div>");
    fitFigures(end.previousElementSibling);
  }
  histPinSet();
  if (arch) ASHOW = r.next;
  else HSHOW.n = r.next;
  if (r.next >= HLIST.length) end.remove();
  else end.dataset.next = r.next;
  histWatch(); // still near the end? this says so again
}
/* History (or the Archived screen) with nothing to list: its words and Clear all sit in the middle of the window,
   where a thumb reaches them (never above where the list would start) */
function histCenter(app) {
  const e = histLike() && app.querySelector(".empty");
  if (!e) return;
  e.style.marginTop = "";
  if (e.previousElementSibling && e.previousElementSibling.classList.contains("list")) return; // search suggestions above it: it follows them, never overlapping
  const b = e.getBoundingClientRect();
  e.style.marginTop = Math.max(0, Math.round(innerHeight / 2 - (b.top + scrollY) - b.height / 2)) + "px";
}
/* what sits under the top bar: the period chip, Filters, the chips and a hidden status (`head`), then the entries
   (`body`). In search mode nothing is listed until there is something to look for: words, a filter or a period. */
function histParts() {
  const idle = V.find && !V.sel && !HF.q.trim() && histCount() === 0 && HP.period === "all",
    list = idle ? [] : histList(HF, ""), // nothing skipped; archived entries too, for the headings' totals
    nRows = listRows(list).length;
  /* drawn anew after a change: only so far (drawTo; by the list before the change when the rows in view are gone) */
  if (HSHOW.sig !== histSig()) HSHOW = { sig: histSig(), n: HIST_CHUNK };
  else if (DRAWAT) HSHOW.n = drawTo(list, DRAWAT.ids, HSHOW.n) || drawTo(HLIST, DRAWAT.ids, HSHOW.n) || HSHOW.n;
  HLIST = list;
  /* only what's listed stays selected (midnight moved to the next month, an Undo took one away): Delete never takes an
     entry out of sight */
  if (V.sel) {
    const listed = new Set(selRows(list).map(t => t.id));
    V.sel = new Set([...V.sel].filter(id => listed.has(id)));
  }
  const chips = histChips(),
    anySet = HP.period !== "all" || histCount() > 0 || !!(V.find && HF.q.trim());
  const sug = V.find && !V.sel && HF.q.trim() ? findSugs() : ""; // search mode: what the words could mean, above the entries
  /* the chips and Clear all follow the Filters button on its line, wrapping when it is full; Clear all is left out when
     the list is empty and its message, which has one, is shown (not under a suggestion) */
  let head = histBar(anySet && (nRows || sug), chips, !!V.sel);
  if (!V.sel) {
    /* no visible summary (the months carry their totals); a hidden status says the count after each change */
    if (!V.find)
      head += '<div class="vh" role="status">' + (nRows ? TH("history.count", { count: nRows }) : "") + "</div>"; // search mode has one that stays (#find-live)
  }
  if (idle) return { head, body: recentView(), idle: true }; // search mode, nothing asked yet: the recent searches
  /* a suggestion ("may 2025", "Charges" for "fee") is the answer: nothing is said about the words finding no entries */
  if (!nRows && sug) return { head, body: sug };
  if (!nRows)
    return {
      head,
      body:
        '<div class="empty">' +
        (V.find
          ? findNone()
          : anySet
            ? TH("history.noMatch") + '<div class="gap"></div>' + histClearBtn()
            : S.txns.length // entries, none listed: every one is archived (the archive button leads to them)
              ? TH("history.none.archived")
              : TH("history.none.all")) +
        "</div>",
    };
  const r = histMonths(list, 0, Math.max(HSHOW.n, HIST_CHUNK));
  return {
    head,
    body:
      sug +
      (sug ? '<div class="sec" role="heading" aria-level="2">' + TH("search.entries") + "</div>" : "") +
      r.html +
      (r.next < list.length ? '<div class="hmore" data-next="' + r.next + '"></div>' : ""),
  };
}
/* the selection bar's title: only the count shows (a phrase of the longest words can't fit beside four buttons on a
   small phone), and TalkBack reads the whole phrase ("2 selected") */
const selTitle = n =>
  '<h1 aria-label="' +
  TH("history.selected", { count: n }) +
  '"><span aria-hidden="true">' +
  esc(countText(n)) +
  "</span></h1>";
/* is every row listed in History selected (the select-all button then clears) */
const histAllSelected = () => selRows(HLIST).every(t => V.sel.has(t.id));
function historyView() {
  histDrop();
  const p = histParts();
  let h;
  if (V.sel) {
    const n = V.sel.size,
      all = n > 0 && histAllSelected();
    h =
      '<header class="appbar"><button class="icon" data-act="sel-cancel" aria-label="' +
      TH("history.stopSel") +
      '">' +
      ic("close") +
      "</button>" +
      selTitle(n) +
      '<button class="icon" data-act="sel-all" aria-label="' +
      TH(all ? "history.clearSel" : "history.selAll") +
      '">' +
      (all ? icDeselect() : ic("selectall")) +
      "</button>" +
      '<button class="icon" data-act="sel-arch" aria-label="' +
      TH("history.archSel") +
      '"' +
      (n ? "" : " disabled") +
      ">" +
      icArchive() +
      "</button>" +
      '<button class="icon" data-act="sel-del" aria-label="' +
      TH("history.delSel") +
      '"' +
      (n ? "" : " disabled") +
      ">" +
      ic("delete") +
      "</button></header>";
  } else if (V.find) h = findBar();
  else
    h =
      '<header class="appbar"><button class="icon" data-act="home" aria-label="' +
      TH("common.back") +
      '">' +
      ic("back") +
      "</button><h1>" +
      TH("common.history") +
      "</h1>" +
      searchBtn() +
      (selRows(HLIST).length
        ? '<button class="icon" data-act="sel-start" aria-label="' +
          TH("history.select") +
          '">' +
          ic("checklist") +
          "</button>"
        : "") +
      "</header>";
  /* search mode keeps the bar and the list in two boxes of their own, so typing redraws them without the field; its
     status says the count of this draw (findDraw says it again after each pause) */
  if (V.find) FIND_SAID = p.body && !p.idle ? T("history.count", { count: listRows(HLIST).length }) : "";
  /* the bar and the period / Filters row in one block that stays at the top while the entries scroll (histPin) */
  return V.find
    ? '<div class="hpin">' +
        h +
        '<div id="find-live" class="vh" role="status">' +
        esc(FIND_SAID) +
        '</div><div id="hhead" class="hhd">' +
        p.head +
        '</div></div><div id="hbody">' +
        p.body +
        "</div>"
    : '<div class="hpin">' + h + '<div class="hhd">' + p.head + "</div></div>" + p.body;
}
/* The pinned block (docs/specs/history-archive.md, A): the bar and the period / Filters row stay at the top while the
   entries scroll, and under them the heading of the month in view (.hsec.pin, CSS position: sticky). Its height, which
   follows the text size and the chips' lines, is measured into --hpin, where the month headings stop; the room above a
   row scrolled to (an opened row's part, the focus, a search match) is that plus the tallest month heading
   (scroll-padding-top), so the row lands under the block, not behind it; where the two would cover over half the
   window, the month headings scroll (#app.hfree). A phone held sideways (body.land) keeps only
   the bar there: the Filters row scrolls away with the entries and comes back (.back) as soon as the list scrolls up.
   The Archived screen pins its bar and month headings the same way, and Settings its bar and the heading of the
   section in view (.ssec, D), with the thin line under that heading only while it is held there (.held). */
const HPIN = { ro: null, ref: null, at: 0, raf: 0, on: false };
const pinLike = () => histLike() || V.screen === "settings"; // a screen with a pinned block
function histPin() {
  if (HPIN.ro) HPIN.ro.disconnect();
  HPIN.ro = null;
  const pin = pinLike() && $("#app .hpin");
  if (pin && typeof ResizeObserver !== "undefined") {
    HPIN.ro = new ResizeObserver(histPinSet);
    [...pin.children].forEach(e => HPIN.ro.observe(e));
  }
  HPIN.ref = null;
  if (!HPIN.on) {
    HPIN.on = true;
    addEventListener("scroll", histScroll, { passive: true });
  }
  histPinSet();
}
function histPinSet() {
  const root = document.documentElement,
    pin = pinLike() && $("#app .hpin");
  if (!pin) {
    $("#app").classList.remove("hfree");
    root.style.removeProperty("--hpin");
    root.style.scrollPaddingTop = "";
    return;
  }
  const h = e => (e ? e.getBoundingClientRect().height : 0),
    head = pin.querySelector(".hhd"),
    top = document.body.classList.contains("land")
      ? h(pin.querySelector(".appbar")) + (head && head.classList.contains("back") ? h(head) : 0)
      : h(pin),
    month = Math.max(0, ...[...document.querySelectorAll("#app .hsec.pin > .hmon, #app .ssec > .sec")].map(h)),
    /* where the bar, the Filters row and a month's heading together would cover over half the window (a short
       window, a large text size, a heading in words wrapped over several lines), the headings scroll with their
       entries */
    free = top + month > innerHeight / 2;
  $("#app").classList.toggle("hfree", free);
  root.style.setProperty("--hpin", top + "px");
  root.style.scrollPaddingTop = Math.ceil(top + (free ? 0 : month)) + "px";
  secHeld();
}
/* Settings: the line under a section's heading only while the heading is held under the bar, which is when it has
   left the top of its section (sticky: it stays put while the section moves up under it) */
function secHeld() {
  for (const s of document.querySelectorAll("#app .ssec")) {
    const h = s.firstElementChild;
    h.classList.toggle("held", h.getBoundingClientRect().top > s.getBoundingClientRect().top + 0.5);
  }
}
/* sideways, the Filters row comes back on the way up and goes on the way down (once a frame, on a change of way). The
   way is how the entries moved in the window, not scrollY: the page's own adjustments (scroll anchoring, as a day's
   list comes into view with its real height) change scrollY while what is seen stays put */
function histScroll() {
  if (V.screen === "settings") {
    /* Settings: which heading is held, once a frame (before it is painted) */
    if (!HPIN.raf)
      HPIN.raf = requestAnimationFrame(() => {
        HPIN.raf = 0;
        secHeld();
      });
    return;
  }
  if (V.screen !== "history" || !document.body.classList.contains("land")) return (HPIN.ref = null); // nothing to do
  if (HPIN.raf) return;
  HPIN.raf = requestAnimationFrame(() => {
    HPIN.raf = 0;
    const head = V.screen === "history" && document.body.classList.contains("land") && $("#app .hpin .hhd"),
      ref = HPIN.ref,
      d = ref && ref.isConnected ? ref.getBoundingClientRect().top - HPIN.at : 0; // > 0: the entries moved down
    if (head && ref && ref.isConnected && Math.abs(d) < 2) return; // a finger's tremble, or a slow drag: it adds up
    HPIN.ref = head ? document.elementFromPoint(innerWidth / 2, innerHeight * 0.7) : null; // under the pinned part
    HPIN.at = HPIN.ref ? HPIN.ref.getBoundingClientRect().top : 0;
    if (!head || Math.abs(d) < 2 || d > 0 === head.classList.contains("back")) return;
    head.classList.toggle("back", d > 0);
    histPinSet();
  });
}

/* ---- The Archived screen (docs/specs/history-archive.md, B5): every archived entry, newest first, in History's rows
   under its month and day headings, without totals (History's headings count these entries; this screen only finds
   them), and no period, Filters, search or selection. An opened row offers Unarchive and Delete (txOpenView). It is
   reached from the archive button on History's Filters line while an entry is archived, and Back returns to History as it was: its filters and period
   are kept (drawScreen), and the row in view comes back where it was. Unarchiving or deleting the last one leaves
   the screen where it is, with its empty state. */
let ASHOW = HIST_CHUNK, // the entries drawn so far (histMore)
  ABACK = null; // History's place when the screen opened: {y, a: rowAnchor}
const histLike = () => V.screen === "history" || V.screen === "archive"; // History's list, bar and pinned block
function archOpen() {
  ABACK = { y: scrollY, a: rowAnchor($("#app")) };
  ASHOW = HIST_CHUNK;
  V.screen = "archive";
  render();
  scrollTo(0, 0);
}
function archBack() {
  const back = ABACK,
    had = $("#app").contains(document.activeElement);
  ABACK = null;
  V.screen = "history";
  render();
  scrollTo(0, back ? back.y : 0);
  if (back && back.a) toAnchor(back.a, $("#app")); // the rows far down only have an estimated height until seen
  /* the focus goes back to what opened the screen (search, once nothing is archived any more) */
  const b = had && ($('#app [data-act="arch-open"]') || $('#app [data-act="search-open"]'));
  if (b) b.focus({ preventScroll: true });
}
function archiveView() {
  const list = S.txns.filter(t => t.archived).sort(byNewest); // an archived add-on too: its entry's row shows it
  if (DRAWAT) ASHOW = drawTo(list, DRAWAT.ids, ASHOW) || drawTo(HLIST, DRAWAT.ids, ASHOW) || ASHOW; // as History's
  HLIST = list;
  let body;
  if (!archRows(HLIST).length)
    body = '<div class="empty">' + TH("archive.none") + '<div class="gap"></div>' + TH("archive.noneHint") + "</div>";
  else {
    const r = histMonths(HLIST, 0, Math.max(ASHOW, HIST_CHUNK), true);
    body = r.html + (r.next < HLIST.length ? '<div class="hmore" data-next="' + r.next + '"></div>' : "");
  }
  return (
    '<div class="hpin"><header class="appbar"><button class="icon" data-act="arch-back" aria-label="' +
    TH("common.back") +
    '">' +
    ic("back") +
    "</button><h1>" +
    TH("archive.title") +
    "</h1></header></div>" +
    body
  );
}
