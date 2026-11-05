/*
 * history.js — History's filters and totals (no screen here): what filters History has (`HF`: account, kind, then a
 * category, a person or a transfer's two sides), which entries they leave (`histList()`, `histMatch()`), which of those
 * are rows (`histRows()`: a fee is shown inside what it was charged on, never as a row), the totals in words
 * (`histWords()`), and going back to the default view (`histClear()`, `histDrop()`, `openHistory()`); and the screen
 * itself (`historyView()`: period chip, Filters button, one chip per set filter, summary line, month headings). A fee
 * follows its entry everywhere: it has that entry's kind and matches whatever that entry matches.
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
const histHost = t => (t.feeOf ? S.txns.find(x => x.id === t.feeOf) : null);
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
function histList(f = HF, skip) {
  const [s, e] = range(HP);
  return S.txns.filter(t => t.date >= s && t.date <= e && histMatch(t, f, skip)).sort(byNewest);
}
function histRows(list) {
  const ids = new Set(S.txns.map(t => t.id));
  return list.filter(t => !(t.feeOf && ids.has(t.feeOf)));
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
}
function histClear() {
  HF = histBlank();
  histAllTime();
}
/* History with the given filters (an account's "Open in History"), on all time */
function openHistory(f = {}) {
  HF = { ...histBlank(), ...f };
  histAllTime();
  V.screen = "history";
  V.open = "";
  render();
}

const histCount = () => ["acc", "kind", "cat", "who", "from", "to"].filter(k => HF[k]).length;
/* Task 4 builds the Filters sheet here */
function filtersSheet() {}
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
        '<span class="chn" dir="auto"><span class="adot" style="--acr:' +
          hexRgb(accEmb(a).c).join(" ") +
          '"></span>' +
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
    if (!HF[k] || !acc(HF[k])) return;
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
const histClearBtn = () =>
  '<button class="btn text hclear" data-act="hf-clear">' + TH("history.clearAll") + "</button>";
/* the entries, month by month: a heading with the month's words, then its days (dayGroups) */
function histMonths(list) {
  let h = "",
    i = 0;
  while (i < list.length) {
    const m = list[i].date.slice(0, 7);
    let j = i;
    while (j < list.length && list[j].date.slice(0, 7) === m) j++;
    const part = list.slice(i, j);
    h +=
      '<div class="hmon"><span>' +
      esc(capFirst(monthLabel(m, true))) +
      "</span><span>" +
      esc(histWords(part, HF.kind).join(" · ")) +
      "</span></div>" +
      dayGroups(part);
    i = j;
  }
  return h;
}
function historyView() {
  histDrop();
  const list = histList(HF, ""); // nothing skipped
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
    h +=
      histBar(clear && !chips) +
      (chips ? '<div class="hchips">' + chips + (clear ? histClearBtn() : "") + "</div>" : "");
    h +=
      '<div class="hfsum" role="status">' +
      (list.length
        ? "<b>" +
          TH("history.count", { count: histRows(list).length }) +
          "</b>" +
          histWords(list, HF.kind)
            .map(w => " · " + esc(w))
            .join("")
        : "") +
      "</div>";
  }
  if (!list.length)
    return (
      h +
      '<div class="empty">' +
      (anySet ? TH("history.noMatch") + '<div class="gap"></div>' + histClearBtn() : TH("history.none.all")) +
      "</div>"
    );
  return h + histMonths(list);
}
