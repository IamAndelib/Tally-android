/*
 * history.js — History's filters and totals (no screen here): what filters History has (`HF`: account, kind, then a
 * category, a person or a transfer's two sides), which entries they leave (`histList()`, `histMatch()`), which of those
 * are rows (`histRows()`: a fee is shown inside what it was charged on, never as a row), the totals in words
 * (`histWords()`), and going back to the default view (`histClear()`, `histDrop()`, `openHistory()`). A fee follows its
 * entry everywhere: it has that entry's kind and matches whatever that entry matches.
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
