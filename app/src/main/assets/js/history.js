/*
 * history.js — History: its filters and totals, the Filters sheet and the screen. What filters History has (`HF`: account, kind, then a
 * category, a person or a transfer's two sides), which entries they leave (`histList()`, `histMatch()`), which of those
 * are rows (`histRows()`: a fee is shown inside what it was charged on, never as a row), the totals in words
 * (`histWords()`), and going back to the default view (`histClear()`, `histDrop()`, `openHistory()`); and the screen
 * itself (`historyView()`: period chip, Filters button, one chip per set filter, month headings with their totals; only
 * the first rows are drawn, the rest as the end comes near). A fee follows its entry everywhere: it has that entry's kind and matches whatever that entry matches.
 */
const histBlank = () => ({ acc: "", kind: "", cat: "", who: "", from: "", to: "" });
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
const histHost = t => (t.feeOf ? entry(t.feeOf) || null : null);
function histKind(t) {
  const host = histHost(t);
  if (host) return histKind(host);
  const found = HIST_KINDS.find(k => k[1](t));
  return found ? found[0] : "out"; // a fee whose entry is gone is still an expense
}
/* skip: "acc", "kind" or "sub" (category, person, sides) is left out, to count what an option would leave */
function histMatch(t, f = HF, skip = "") {
  const host = histHost(t);
  if (host) return histMatch(host, f, skip);
  if (skip !== "acc" && f.acc && t.account !== f.acc && t.to !== f.acc) return false;
  if (skip !== "kind" && f.kind && histKind(t) !== f.kind) return false;
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
function histRows(list) {
  return list.filter(t => !(t.feeOf && entry(t.feeOf)));
}
/* the totals of a list, per currency (by code, joined with " + ") in the words of the kind shown: ["$X spent", "€Y + $Z
   received", "$W fees"]; a phrase whose amount is 0 is left out */
function histWords(list, kind) {
  const sums = {};
  const add = (key, cur, v) => {
    const m = sums[key] || (sums[key] = {});
    m[cur] = rnd((m[cur] || 0) + v);
  };
  list.forEach(t => {
    const cur = (acc(t.account) || {}).currency || S.settings.cur;
    if (t.feeOf) return add("fees", cur, t.amount);
    if (isSpend(t)) add("spent", cur, t.amount);
    else if (t.type === "income") add("received", cur, t.amount);
    else if (t.type === "transfer") add("moved", cur, t.amount);
    else if (t.type === "adjust") add(t.amount < 0 ? "takenOff" : "added", cur, Math.abs(t.amount));
    else if (t.type === "loan") {
      const lend = (loan(t.loan) || {}).kind === "lend";
      add(lend ? (t.dir === "out" ? "lent" : "gotBack") : t.dir === "in" ? "borrowed" : "paidBack", cur, t.amount);
    }
  });
  const order = {
    "": ["spent", "received"],
    out: ["spent"],
    in: ["received"],
    xfer: ["moved"],
    lend: ["lent", "gotBack"],
    borrow: ["borrowed", "paidBack"],
    fix: ["added", "takenOff"],
  }[kind || ""];
  const say = key => {
    const amount = Object.entries(sums[key] || {})
      .filter(e => e[1])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(e => money(e[1], e[0]))
      .join(" + ");
    if (!amount) return "";
    return T(key === "spent" || key === "received" ? "search." + key : "history.words." + key, { amount });
  };
  return order.concat("fees").map(say).filter(Boolean);
}
/* a filter whose account, category or person is gone (an account can't be deleted, but a backup can be restored) */
function histDrop() {
  ["acc", "from", "to"].forEach(k => HF[k] && !acc(HF[k]) && (HF[k] = ""));
  if (HF.cat && !S.cats.some(c => c.id === HF.cat)) HF.cat = "";
  if (HF.who && !S.loans.some(l => loanWho(l) === HF.who)) HF.who = "";
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
/* History with the given filters (an account's "Open in History"), on all time */
function openHistory(f = {}) {
  HF = histNorm({ ...histBlank(), ...f });
  histAllTime();
  HSHOW.sig = "";
  V.screen = "history";
  V.open = "";
  render();
}

/* the filters that are set and shown as chips and counted: with an account picked, a transfer side that is that account
   is implied by the other side (the sheet shows it locked), so it is neither */
const histSet = () =>
  ["acc", "kind", "cat", "who", "from", "to"].filter(
    k => HF[k] && !((k === "from" || k === "to") && HF.acc && HF[k] === HF.acc && HF.from && HF.to)
  );
const histCount = () => histSet().length;
/* ---- the Filters sheet: works on a copy (HFD); Show makes it the filters (HF), closing it any other way drops it */
let HFD = null,
  HFSIDE = "";
const histAcc = a => a && (!a.archived || S.txns.some(t => t.account === a.id || t.to === a.id));
const histAccs = () => S.accounts.filter(histAcc);
const histAccVar = a => ' style="--acr:' + hexRgb(accEmb(a).c).join(" ") + '"';
/* what picking one side (From or To) gives; with an account picked the other side is that account (an empty side
   empties both) */
function hfSide(d, side, id) {
  const o = { ...d },
    other = side === "from" ? "to" : "from";
  o[side] = id;
  if (d.acc) o[other] = id ? d.acc : "";
  return o;
}
const hfRows = f => histRows(histList(f));
/* how many rows a choice would leave (no sorting: only the count is wanted) */
const hfCount = f => histRows(histPick(f)).length;
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
    label = T("history." + side + "Acc", { account: a ? a.name : T("history.anyAccount") }),
    lock = !!(HFD.acc && id === HFD.acc),
    inner = (a ? '<span class="adot"' + histAccVar(a) + "></span>" : "") + hfName(label);
  if (lock) return '<span class="chip hfc lock tinted"' + histAccVar(a) + ">" + inner + "</span>";
  return (
    '<button class="chip hfc' +
    (a ? " tinted tk" : "") +
    '" data-act="' +
    (side === "from" ? "hfs-from" : "hfs-to") +
    '" aria-haspopup="dialog"' +
    (a ? histAccVar(a) : "") +
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
        histAccVar(a) +
        "></span>" +
        hfName(a.name + (a.archived ? " (" + T("account.archivedTag") + ")" : "")),
      n,
      { cls: "acct", attrs: histAccVar(a) }
    );
  });
  h += '</div><div class="sec">' + TH("history.transactions") + '</div><div class="hfrow">';
  h += hfChip("hfs-kind", "", !d.kind, hfName(T("history.all")));
  HIST_KINDS.forEach(([k]) => {
    if (!S.txns.some(t => histKind(t) === k)) return; // never had one
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
    if (a) h += '<div class="hfhint">' + TH("history.oneSide", { account: a.name }) + "</div>";
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
          (x ? '<span class="adot"' + histAccVar(x) + "></span>" : "") +
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
        '<span class="adot" style="--acr:' +
          hexRgb(accEmb(a).c).join(" ") +
          '"></span><span class="chn" dir="auto">' +
          esc(a.name) +
          "</span>",
        a.name,
        ' style="--acr:' + hexRgb(accEmb(a).c).join(" ") + '"'
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
    const n = T(HF.kind === "borrow" ? "history.borrowedFrom" : "history.lentTo", { who: HF.who });
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
  return h.join("");
}
/* the period chip (its label opens the period dialog; once set, its ✕ goes back to all time), Filters, Clear all */
function histBar(clearHere) {
  const set = HP.period !== "all",
    n = histCount();
  return (
    '<div class="hbar"><div class="hp' +
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
    (clearHere ? histClearBtn() : "") +
    "</div>"
  );
}
/* after a chip, the period or Clear all is gone, the focus goes on: to the chip now in the removed one's place (else the
   one before it), else the Filters button, so it never falls back to the page */
function histFocus(sel, at) {
  const all = [...document.querySelectorAll("#app " + sel)],
    el = at == null ? all[0] : all[Math.min(at, all.length - 1)];
  const to = el || $("#app .hfbtn");
  if (to) to.focus({ preventScroll: true });
}
const histClearBtn = () => '<button class="hclear" data-act="hf-clear">' + TH("history.clearAll") + "</button>";
/* the entries, month by month: a heading with the month's words, then its days (dayGroups). Only the first rows are
   drawn (a notebook of years is thousands of rows); the rest follow as the end of the list comes near (histWatch). A
   chunk ends at the end of a day, and a month cut in two has its heading, with the whole month's words, only once. */
const HIST_CHUNK = 300;
let HSHOW = { sig: "", n: HIST_CHUNK }, // what is drawn: the entries so far, for these filters and this period
  HLIST = [], // the entries it is drawn from
  HIO = null;
const histSig = () => JSON.stringify([HF, HP.period, range(HP)]); // the dates shown, so midnight keeps the rows drawn
const histMonth = t => t.date.slice(0, 7);
/* the markup for list[i..] up to about `budget` entries; `next` is where the following chunk starts */
function histMonths(list, i, budget) {
  let h = "";
  const stop = i + budget;
  while (i < list.length && i < stop) {
    const m = histMonth(list[i]);
    let j = i;
    while (j < list.length && histMonth(list[j]) === m) j++;
    if (i === 0 || histMonth(list[i - 1]) !== m)
      h +=
        '<div class="hmon"><span>' +
        esc(capFirst(monthLabel(m, true))) +
        "</span><span>" +
        esc(histWords(list.slice(i, j), HF.kind).join(" · ")) +
        "</span></div>";
    let e = j;
    if (e > stop) {
      e = stop;
      while (e < j && list[e].date === list[e - 1].date) e++; // the day is whole
    }
    h += dayGroups(list.slice(i, e));
    i = e;
  }
  return { html: h, next: i };
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
  const end = $("#app .hmore");
  if (!end || V.screen !== "history") return histUnwatch();
  const r = histMonths(HLIST, +end.dataset.next, HIST_CHUNK);
  end.insertAdjacentHTML("beforebegin", "<div>" + r.html + "</div>");
  fitFigures(end.previousElementSibling);
  HSHOW.n = r.next;
  if (r.next >= HLIST.length) end.remove();
  else end.dataset.next = r.next;
  histWatch(); // still near the end? this says so again
}
/* History with nothing to list: its words and Clear all sit in the middle of the window, where a thumb reaches them
   (never above where the list would start) */
function histCenter(app) {
  const e = V.screen === "history" && app.querySelector(".empty");
  if (!e) return;
  e.style.marginTop = "";
  const b = e.getBoundingClientRect();
  e.style.marginTop = Math.max(0, Math.round(innerHeight / 2 - (b.top + scrollY) - b.height / 2)) + "px";
}
function historyView() {
  histDrop();
  const list = histList(HF, ""); // nothing skipped
  if (HSHOW.sig !== histSig()) HSHOW = { sig: histSig(), n: HIST_CHUNK };
  HLIST = list;
  /* only what's listed stays selected (midnight moved to the next month, an Undo took one away): Delete never takes an
     entry out of sight */
  if (V.sel) {
    const listed = new Set(list.map(t => t.id));
    V.sel = new Set([...V.sel].filter(id => listed.has(id)));
  }
  let h;
  if (V.sel) {
    const n = V.sel.size;
    h =
      '<header class="appbar"><button class="icon" data-act="sel-cancel" aria-label="' +
      TH("history.stopSel") +
      '">' +
      ic("close") +
      "</button><h1>" +
      TH("history.selected", { count: n }) +
      "</h1>" +
      '<button class="icon" data-act="sel-all" aria-label="' +
      TH("history.selAll") +
      '">' +
      ic("selectall") +
      "</button>" +
      '<button class="icon" data-act="sel-del" aria-label="' +
      TH("history.delSel") +
      '"' +
      (n ? "" : " disabled") +
      ">" +
      ic("delete") +
      "</button></header>";
  } else
    h =
      '<header class="appbar"><button class="icon" data-act="home" aria-label="' +
      TH("common.back") +
      '">' +
      ic("back") +
      "</button><h1>" +
      TH("common.history") +
      "</h1>" +
      searchBtn() +
      (list.length
        ? '<button class="icon" data-act="sel-start" aria-label="' +
          TH("history.select") +
          '">' +
          ic("checkbox") +
          "</button>"
        : "") +
      "</header>";
  const chips = histChips(),
    anySet = HP.period !== "all" || histCount() > 0;
  if (!V.sel) {
    /* Clear all sits after the chips; with none (only a period set) beside the Filters button; not at all when the
       list is empty (its message has one) */
    const clear = anySet && list.length;
    h += histBar(clear) + (chips ? '<div class="hchips">' + chips + "</div>" : "");
    /* no visible summary (the months carry their totals); a hidden status says the count after each change */
    h +=
      '<div class="vh" role="status">' +
      (list.length ? TH("history.count", { count: histRows(list).length }) : "") +
      "</div>";
  }
  if (!list.length)
    return (
      h +
      '<div class="empty">' +
      (anySet ? TH("history.noMatch") + '<div class="gap"></div>' + histClearBtn() : TH("history.none.all")) +
      "</div>"
    );
  const r = histMonths(list, 0, Math.max(HSHOW.n, HIST_CHUNK));
  return h + r.html + (r.next < list.length ? '<div class="hmore" data-next="' + r.next + '"></div>' : "");
}
