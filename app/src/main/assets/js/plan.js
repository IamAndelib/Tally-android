/*
 * plan.js — The Plan tab: what repeats (S.repeats) and what is due, from repeating items and loans alike (upcoming()),
 * the form that sets a repeating item up, and recording one: like a loan's dues, an occurrence's state is derived from
 * the entries written for it (txn.rep, txn.due) and its skipped dates, never stored. Tally never writes an entry by
 * itself: Record opens the usual form, filled in, and the user saves it.
 */
"use strict";

/* how far ahead Upcoming looks, in days */
const PLAN_DAYS = 14;
const UNIT_WORDS = { d: ["day", "days"], w: ["week", "weeks"], m: ["month", "months"], y: ["year", "years"] };
const UNIT_ONE = { d: "Daily", w: "Weekly", m: "Monthly", y: "Yearly" };
const TRANSFER_EMB = { i: "swap_horiz", c: "#5f7389" };
const rep = id => S.repeats.find(r => r.id === id);

/* occurrence k of r (0 = the first), worked out from the first date every time, never from the one before, so a 31st
   stays the 31st where a month has one (Jan 31, Feb 28, Mar 31) and a yearly Feb 29 is Feb 28 in other years */
function repDate(r, k) {
  const n = k * r.every;
  if (r.unit === "d") return addDays(r.first, n);
  if (r.unit === "w") return addDays(r.first, 7 * n);
  const m = shiftMonth(r.first.slice(0, 7), r.unit === "y" ? 12 * n : n),
    md = monthDays(m);
  return m + "-" + pad(r.last && r.unit === "m" ? md : Math.min(+r.first.slice(8), md));
}
/* what each series' occurrences look like today, worked out once per drawing of the screen (drawScreen clears it) */
let REPC = null;
function repInfo(r) {
  if (!REPC) {
    const done = new Map();
    S.txns.forEach(t => {
      if (!t.rep) return;
      if (!done.has(t.rep)) done.set(t.rep, new Set());
      done.get(t.rep).add(t.due);
    });
    REPC = { t: today(), done, m: new Map() };
  }
  if (REPC.m.has(r.id)) return REPC.m.get(r.id);
  const t = REPC.t,
    to = addDays(t, PLAN_DAYS),
    done = REPC.done.get(r.id) || new Set(),
    skip = new Set(r.skip),
    open = [], // due by today and not settled: oldest first, all of them (not just the latest)
    soon = []; // due in the next PLAN_DAYS days
  let next = "",
    ended = true;
  for (let k = 0; k < 5000; k++) {
    if (r.times && k >= r.times) break;
    const d = repDate(r, k);
    if (r.until && d > r.until) break;
    if ((r.from && d < r.from) || done.has(d) || skip.has(d)) continue;
    if (d <= t) open.push(d);
    else {
      ended = false;
      if (!next) next = d;
      if (d > to) break;
      soon.push(d);
    }
  }
  const off = r.off || !acc(r.account) || acc(r.account).archived || (r.type === "transfer" && !acc(r.to));
  const i = {
    open: off ? [] : open,
    soon: off ? [] : soon,
    next: open[0] || next,
    done: done.size,
    ended: ended && !open.length,
    off,
  };
  i.state = off
    ? "paused"
    : open.length && open[0] < t
      ? "overdue"
      : open.length
        ? "due"
        : i.ended
          ? "ended"
          : soon.length
            ? "soon"
            : "later";
  REPC.m.set(r.id, i);
  return i;
}
/* a series' name: its own, else its note, else its category or where the money goes */
function repName(r) {
  if (r.name) return r.name;
  if (r.note) return r.note;
  if (r.type === "transfer") return "To " + ((acc(r.to) || {}).name || "?");
  return (cat(r.cat) || {}).name || "Repeating";
}
const repEmb = r => (r.type === "transfer" ? TRANSFER_EMB : cat(r.cat) || TRANSFER_EMB);
const repCur = r => (acc(r.account) || {}).currency || S.settings.cur;
/* "Monthly", "Every 2 weeks", "Monthly · last day": a whole phrase, so it can be translated as one */
function freqText(r) {
  const base = r.every === 1 ? UNIT_ONE[r.unit] : "Every " + r.every + " " + UNIT_WORDS[r.unit][1];
  return base + (r.last && r.unit === "m" ? " · last day" : "");
}
/* the amount as a row shows it: money in with its plus */
function repAmt(r) {
  const cur = repCur(r);
  return r.type === "income" ? signed(r.amount, cur) : money(r.amount, cur);
}
/* when a due date is, in words */
function dueWhen(d) {
  const t = today();
  if (d === t) return "Due today";
  if (d === addDays(t, 1)) return "Due tomorrow";
  if (d < t) return "Overdue · " + shortDay(d);
  return "Due " + shortDay(d);
}

/* Everything due, from every source, in one shape: overdue first, then the next PLAN_DAYS days. A series with several
   open occurrences is one row; Record settles the oldest. */
function upcoming() {
  const t = today(),
    to = addDays(t, PLAN_DAYS),
    rows = [];
  S.repeats.forEach(r => {
    const i = repInfo(r),
      dates = i.open.concat(i.soon);
    if (dates.length) rows.push({ key: "r:" + r.id, kind: "repeat", r, date: dates[0], open: i.open.length });
  });
  S.loans.forEach(l => {
    const i = loanInfo(l);
    if (i.open && i.nextDue && i.nextDue <= to)
      rows.push({ key: "l:" + l.id, kind: "loan", l, i, date: i.nextDue, open: i.nextDue <= t ? 1 : 0 });
  });
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}
const dueTitle = x => (x.kind === "repeat" ? repName(x.r) : loanWho(x.l));
/* the row's second line, after its "Overdue" pill when it is: how many, or when */
function dueSub(x) {
  const t = today();
  if (x.open > 1) return x.open + " due";
  if (x.kind === "loan")
    return (
      (x.l.kind === "lend" ? "Pays you back " : "You pay back ") +
      (x.date === t ? "today" : x.date === addDays(t, 1) ? "tomorrow" : shortDay(x.date))
    );
  return x.date < t ? shortDay(x.date) : dueWhen(x.date);
}
function dueAmount(x) {
  if (x.kind === "loan") return money(x.i.dueAmt || x.i.left, x.i.cur);
  return repAmt(x.r); // one occurrence's, also when several are due (the row says how many)
}

/* the Plan tab: Upcoming | Repeating (side by side from 840px) */
function planView() {
  const rows = upcoming();
  let up = '<div class="sec">Upcoming</div>';
  up += rows.length
    ? '<div class="list">' + rows.map(dueRow).join("") + "</div>"
    : '<p class="hint" style="margin:0 4px">Nothing due in the next two weeks.</p>';
  const list = S.repeats.slice().sort((a, b) => {
    const x = repInfo(a),
      y = repInfo(b),
      rank = i => (i.off ? 1 : i.ended ? 2 : 0);
    return rank(x) - rank(y) || (x.next || "9").localeCompare(y.next || "9") || repName(a).localeCompare(repName(b));
  });
  let rp = '<div class="sec">Repeating</div>';
  rp += list.length
    ? '<div class="list">' + list.map(repRow).join("") + "</div>"
    : '<p class="hint" style="margin:0 4px">Rent, subscriptions, a salary, a monthly move to savings: add what repeats ' +
      "and Tally shows it here when it’s due. You record it with one tap.</p>";
  rp += '<button class="btn text" data-act="rep-new" style="margin-top:4px">' + ic("add") + "Add repeating</button>";
  return tabBar("Plan") + panes(up, rp);
}
/* an Upcoming row: the row opens what's due (Record, Skip, Edit), its Record button opens the form straight away */
function dueRow(x) {
  const late = x.date < today(),
    title = dueTitle(x),
    emb = x.kind === "repeat" ? repEmb(x.r) : LOAN_EMB[x.l.kind];
  return (
    '<div class="duerow' +
    (FX.row === x.key ? " flash" : "") +
    '"><button class="tx" data-act="due-open" data-v="' +
    esc(x.key) +
    '">' +
    emblem(emb, "em") +
    '<span class="mid"><div class="d" dir="auto">' +
    esc(title) +
    '</div><div class="s">' +
    (late ? '<span class="st overdue">Overdue</span> ' : "") +
    esc(dueSub(x)) +
    '</div></span><span class="a' +
    (x.kind === "repeat" && x.r.type === "income" ? " got" : "") +
    '">' +
    esc(dueAmount(x)) +
    '</span></button><button class="icon rec" data-act="due-rec" data-v="' +
    esc(x.key) +
    '" aria-label="' +
    esc((x.kind === "loan" ? "Record payment: " : "Record: ") + title) +
    '" title="Record">' +
    ic("check") +
    "</button></div>"
  );
}
/* a Repeating row: how often, and what's next */
function repRow(r) {
  const i = repInfo(r);
  const s =
    freqText(r) +
    " · " +
    (i.off ? "Paused" : i.ended ? "Ended" : i.open.length ? dueWhen(i.open[0]) : "Next " + shortDay(i.next));
  return (
    '<button class="tx' +
    (FX.row === r.id ? " flash" : "") +
    (i.off || i.ended ? " dim" : "") +
    '" data-act="rep-edit" data-v="' +
    r.id +
    '">' +
    emblem(repEmb(r), "em") +
    '<span class="mid"><div class="d" dir="auto">' +
    esc(repName(r)) +
    '</div><div class="s">' +
    esc(s) +
    '</div></span><span class="a' +
    (r.type === "income" ? " got" : "") +
    '">' +
    esc(repAmt(r)) +
    "</span></button>"
  );
}
/* the one line Home shows while something is due today or tomorrow (nothing otherwise) */
function planLine() {
  const t1 = addDays(today(), 1),
    soon = upcoming().filter(x => x.date <= t1);
  if (!soon.length) return "";
  const x = soon[0],
    late = soon.filter(y => y.date < today()).length,
    text =
      soon.length > 1
        ? soon.length + " due" + (late ? " · " + late + " overdue" : "")
        : dueTitle(x) + " · " + (x.date < today() ? "overdue" : shortDay(x.date).toLowerCase()) + " · " + dueAmount(x);
  return (
    '<button class="planline" data-act="tab" data-v="plan" aria-label="' +
    esc(text + ". Open Plan") +
    '">' +
    ic("event") +
    '<span dir="auto">' +
    esc(text) +
    "</span>" +
    ic("right") +
    "</button>"
  );
}

/* what's due, opened: Record (the oldest open one), Skip it, or edit the series */
function dueOpen(key) {
  const [k, id] = key.split(":");
  if (k === "l") return loanOpen(id);
  const r = rep(id),
    i = r && repInfo(r),
    d = i && (i.open[0] || i.soon[0]);
  if (!d) return;
  const more = i.open.length > 1 ? " · " + i.open.length + " due, the oldest first" : "";
  openSheet(
    repName(r),
    '<p class="muted" style="margin:0 4px 12px">' +
      esc(dueWhen(d) + more) +
      " · " +
      esc(repAmt(r)) +
      "</p>" +
      '<button class="btn" data-act="due-rec" data-v="' +
      esc(key) +
      '">' +
      ic("check") +
      (r.type === "income" ? "Record money in" : r.type === "transfer" ? "Record transfer" : "Record payment") +
      '</button><div class="gap"></div><button class="btn tonal" data-act="due-skip" data-v="' +
      esc(key) +
      '">Skip this one</button><div class="gap"></div><button class="btn text" data-act="rep-edit" data-v="' +
      r.id +
      '">' +
      ic("edit") +
      "Edit repeating</button>"
  );
}
/* Record: the usual form, filled in from the series and dated on the day it was due (today, when paid early); the
   entry saved there is linked to that occurrence */
function dueRecord(key) {
  const [k, id] = key.split(":");
  if (k === "l") return loanOpen(id, true);
  const r = rep(id),
    i = r && repInfo(r),
    due = i && (i.open[0] || i.soon[0]);
  if (!due) return;
  const t = today(),
    pre = {
      amount: r.amount,
      account: r.account,
      date: due < t ? due : t,
      note: r.note,
      link: { rep: r.id, due },
    };
  if (r.type === "transfer") trSheet(null, Object.assign(pre, { to: r.to, toAmount: r.toAmount }));
  else txSheet(null, r.type, r.cat, pre);
}
function dueSkip(key) {
  const r = rep(key.split(":")[1]),
    i = r && repInfo(r),
    due = i && (i.open[0] || i.soon[0]);
  if (!due) return;
  closeSheet();
  withUndo("Skipped " + repName(r) + " · " + shortDay(due), () => r.skip.push(due), { row: "r:" + r.id });
}

/* the repeating form: new (from Plan) or editing one. F.rep holds what isn't read from the fields */
function repSheet(id, keep) {
  const r = id ? rep(id) : null;
  if (id && !r) return snack("That was deleted");
  if (!id && !activeAccounts().length) {
    snack("Add an account first");
    return accForm();
  }
  const i = r ? repInfo(r) : null,
    act = activeAccounts(),
    old = keep || {};
  const type = old.type || (r ? r.type : "expense"),
    lastAcc = acc(S.settings.lastAcc) && !acc(S.settings.lastAcc).archived ? S.settings.lastAcc : act[0].id;
  F = {
    kind: "rep",
    id,
    type,
    cat: old.cat !== undefined ? old.cat : r && r.type === type ? r.cat || null : null,
    account: old.account || (r ? r.account : lastAcc),
    to: old.to || (r && r.to) || (act.find(a => a.id !== (old.account || (r ? r.account : lastAcc))) || {}).id,
    unit: old.unit || (r ? r.unit : "m"),
    last: old.last !== undefined ? old.last : !!(r && r.last),
    end: old.end || (r ? (r.until ? "date" : r.times ? "times" : "never") : "never"),
    more: old.more !== undefined ? old.more : !!(r && (r.every > 1 || r.last || r.until || r.times || r.name)),
  };
  const a = acc(F.account);
  let h = "";
  if (!r)
    h +=
      '<div class="seg" role="group" aria-label="Kind">' +
      [
        ["expense", "Spending"],
        ["income", "Money in"],
        ["transfer", "Transfer"],
      ]
        .map(
          ([k, l]) =>
            '<button data-act="rp-type" data-v="' + k + '" aria-pressed="' + (type === k) + '">' + l + "</button>"
        )
        .join("") +
      '</div><div class="gap"></div>';
  if (type === "transfer") {
    const list = accChoices(F.account, F.to);
    h +=
      '<div class="lbl" style="margin-top:4px">From</div>' +
      accChips("rp-from", F.account, null, list) +
      '<div class="lbl">To</div>' +
      accChips("rp-to", F.to, F.account, list);
  } else {
    const inc = type === "income",
      k = F.cat ? cat(F.cat) : null;
    let list = inc ? inCats() : outCats();
    if (k && !list.includes(k)) list = list.concat([k]);
    h += inc
      ? '<div class="catgrid">' + catBtns(list, F.cat) + "</div>"
      : '<button class="catchip" id="f-catchip" data-act="f-showcats" aria-expanded="false"' +
        (k ? "" : " hidden") +
        ">" +
        (k ? catChipInner(k) : "") +
        '</button><div class="lbl" id="f-catlbl" style="margin-top:0"' +
        (k ? " hidden" : "") +
        '>What is it for?</div><div class="catgrid" id="f-catgrid" style="margin-top:8px"' +
        (k ? " hidden" : "") +
        ">" +
        catBtns(list, F.cat) +
        "</div>";
  }
  h += amtField("f-amt", a ? a.currency : "", old.amount != null ? old.amount : r ? String(r.amount) : "", {
    curId: "amt-cur",
  });
  if (type === "transfer")
    h +=
      '<label class="field" id="recv-wrap"' +
      (acc(F.to) && a && acc(F.to).currency !== a.currency ? "" : " hidden") +
      '><span id="recv-lbl">Amount received' +
      (acc(F.to) ? " (" + esc(acc(F.to).currency) + ")" : "") +
      '</span><input id="f-toamt" inputmode="decimal" autocomplete="off" placeholder="0" value="' +
      esc(old.toAmount != null ? old.toAmount : r && r.toAmount != null ? String(r.toAmount) : "") +
      '"></label>';
  else
    h +=
      '<div class="lbl">' +
      (type === "income" ? "Into" : "Paid from") +
      "</div>" +
      accChips("f-acc", F.account, null, accChoices(F.account));
  h +=
    '<label class="field"><span>Note (optional)</span><input id="f-note" maxlength="80" value="' +
    esc(old.note != null ? old.note : r ? r.note : "") +
    '"></label>';
  h +=
    '<div class="lbl">Repeats</div><div class="seg" role="group" aria-label="Repeats">' +
    ["d", "w", "m", "y"]
      .map(
        u =>
          '<button data-act="rp-unit" data-v="' +
          u +
          '" aria-pressed="' +
          (F.unit === u) +
          '">' +
          UNIT_ONE[u] +
          "</button>"
      )
      .join("") +
    "</div>";
  const first = old.first || (r ? i.next || r.first : today());
  h +=
    '<div class="lbl">' +
    (r ? "Next due" : "First due") +
    '</div><div class="row">' +
    dateField("rp-date", first, { label: r ? "Next due" : "First due", min: r ? undefined : addDays(today(), -366) }) +
    "</div>";
  h +=
    '<button class="btn text" data-act="rp-more" aria-expanded="' +
    F.more +
    '" style="margin-top:4px">' +
    ic("down") +
    "More options</button>" +
    '<div id="rp-morebox"' +
    (F.more ? "" : " hidden") +
    ">" +
    '<label class="field"><span>Repeat every</span><input id="rp-every" inputmode="numeric" maxlength="2" value="' +
    esc(old.every != null ? old.every : r ? String(r.every) : "1") +
    '" aria-label="Repeat every (number of days, weeks, months or years)"></label>' +
    '<div class="setrow" id="rp-lastrow"' +
    (F.unit === "m" ? "" : " hidden") +
    '><span class="mid"><div>Last day of the month</div><div class="s">For pay or bills on the month’s last day</div>' +
    '</span><button class="sw" role="switch" data-act="rp-last" aria-checked="' +
    F.last +
    '" aria-label="Last day of the month"></button></div>' +
    '<div class="lbl">Ends</div><div class="seg" role="group" aria-label="Ends">' +
    [
      ["never", "Never"],
      ["date", "On a date"],
      ["times", "After"],
    ]
      .map(
        ([k, l]) =>
          '<button data-act="rp-end" data-v="' + k + '" aria-pressed="' + (F.end === k) + '">' + l + "</button>"
      )
      .join("") +
    '</div><div class="row" id="rp-untilrow"' +
    (F.end === "date" ? "" : " hidden") +
    ">" +
    dateField("rp-until", old.until || (r && r.until) || addDays(first, 365), { label: "Last date" }) +
    '</div><label class="field" id="rp-timesrow"' +
    (F.end === "times" ? "" : " hidden") +
    '><span>Times in all</span><input id="rp-times" inputmode="numeric" maxlength="4" value="' +
    esc(old.times != null ? old.times : r && r.times ? String(r.times) : "12") +
    '"></label>' +
    '<label class="field"><span>Name (optional)</span><input id="rp-name" maxlength="40" placeholder="' +
    esc(r ? repName(Object.assign({}, r, { name: "" })) : "Shown in Plan") +
    '" value="' +
    esc(old.name != null ? old.name : r ? r.name : "") +
    '"></label></div>';
  h +=
    '<div class="gap"></div><button class="btn" data-act="rp-save">' +
    ic("check") +
    (r ? "Save changes" : "Save") +
    "</button>";
  if (r) {
    h +=
      '<div class="gap"></div><div class="row">' +
      '<button class="btn tonal" data-act="rp-pause">' +
      (r.off ? "Resume" : "Pause") +
      "</button>" +
      (i.ended ? "" : '<button class="btn tonal" data-act="rp-endnow">End</button>') +
      '</div><div class="gap"></div><button class="btn danger" data-act="rp-del">Delete</button>';
    if (i.done)
      h +=
        '<p class="hint" style="margin:8px 4px 0">' +
        i.done +
        (i.done === 1 ? " entry was" : " entries were") +
        " written for it; they stay in History whatever happens to it.</p>";
  }
  openSheet(r ? "Edit repeating" : "Repeating", h);
}
/* what's typed so far, so switching the kind or a section keeps it */
function repKeep() {
  const v = readVals(),
    g = id => ($("#" + id) || {}).value,
    d = id => ($("#" + id) || { dataset: {} }).dataset.v;
  return Object.assign({}, F, {
    amount: v.amount,
    note: v.note,
    toAmount: v.toAmount,
    every: g("rp-every"),
    times: g("rp-times"),
    name: g("rp-name"),
    first: d("rp-date"),
    until: d("rp-until"),
  });
}
function repType(type) {
  if (F.type === type) return;
  if (type === "transfer" && activeAccounts().length < 2) {
    setPressed("rp-type", F.type);
    return snack("Add a second account to transfer");
  }
  const k = repKeep();
  k.type = type;
  k.cat = null;
  repSheet(null, k);
}
function repPickFrom(id) {
  F.account = id;
  if (F.to === id) F.to = (activeAccounts().find(a => a.id !== id) || {}).id;
  repSheet(F.id, Object.assign(repKeep(), { account: id, to: F.to }));
}
function repPickTo(id) {
  repSheet(F.id, Object.assign(repKeep(), { to: id }));
}
function repUnit(u) {
  F.unit = u;
  setPressed("rp-unit", u);
  const row = $("#rp-lastrow");
  if (row) row.hidden = u !== "m";
}
function repEnd(k) {
  F.end = k;
  setPressed("rp-end", k);
  $("#rp-untilrow").hidden = k !== "date";
  $("#rp-timesrow").hidden = k !== "times";
}
function repMore(el) {
  F.more = !F.more;
  $("#rp-morebox").hidden = !F.more;
  el.setAttribute("aria-expanded", String(F.more));
}
function repLast(el) {
  F.last = !F.last;
  el.setAttribute("aria-checked", String(F.last));
}
function saveRep() {
  const v = repKeep(),
    amt = evalAmt(v.amount),
    every = +v.every,
    a = acc(F.account);
  if (F.type !== "transfer" && !F.cat) return snack("Pick a category");
  if (!(amt > 0)) return snack("Enter an amount");
  if (!a) return snack("Pick an account");
  if (F.type === "transfer" && (!acc(F.to) || F.to === F.account)) return snack("Pick two different accounts");
  if (!Number.isInteger(every) || every < 1 || every > 99) return snack("Repeat every: a number from 1 to 99");
  if (!v.first) return snack("Pick when it's due");
  let got = null;
  if (F.type === "transfer" && acc(F.to).currency !== a.currency) {
    got = evalAmt(v.toAmount);
    if (!(got > 0)) return snack("Enter how much arrives in " + acc(F.to).currency);
  }
  const times = F.end === "times" ? +v.times : null;
  if (F.end === "times" && !(Number.isInteger(times) && times >= 1 && times <= 9999))
    return snack("Times in all: a number from 1 to 9999");
  if (F.end === "date" && !(v.until >= v.first)) return snack("The last date can't be before the first");
  const id = F.id,
    old = id ? rep(id) : null,
    fields = {
      type: F.type,
      account: F.account,
      amount: amt,
      note: (v.note || "").trim(),
      name: (v.name || "").trim(),
      every,
      unit: F.unit,
      last: F.unit === "m" && F.last,
    };
  if (F.type === "transfer") {
    fields.to = F.to;
    if (got) fields.toAmount = got;
  } else fields.cat = F.cat;
  const nid = newId(),
    end = F.end;
  closeSheet();
  withUndo(
    old ? "Saved" : repName(Object.assign({}, fields)) + " · " + freqText(fields),
    () => {
      const r = old || { id: nid, ts: Date.now(), skip: [], off: false };
      /* a new schedule, or a new next date, starts again from there; entries already written keep their link */
      const i = old ? repInfo(old) : null,
        moved =
          !old ||
          old.unit !== fields.unit ||
          old.every !== fields.every ||
          old.last !== fields.last ||
          v.first !== (i.next || old.first);
      ["to", "toAmount", "cat", "until", "times"].forEach(k => delete r[k]);
      Object.assign(r, fields);
      if (moved) {
        r.first = v.first;
        delete r.from;
      }
      if (end === "date") r.until = v.until;
      if (end === "times") r.times = moved && old ? Math.max(1, times - (i.done || 0)) : times;
      if (!old) S.repeats.push(r);
    },
    { row: id || nid }
  );
}
/* Pause stops it showing as due; Resume starts again from today (what fell due while paused isn't owed) */
function repPause() {
  const r = rep(F.id);
  if (!r) return;
  closeSheet();
  withUndo(
    (r.off ? "Resumed " : "Paused ") + repName(r),
    () => {
      if (r.off) r.from = today();
      r.off = !r.off;
    },
    { row: r.id }
  );
}
/* End: nothing more after today (what's already due stays until recorded or skipped) */
function repEndNow() {
  const r = rep(F.id);
  if (!r) return;
  closeSheet();
  withUndo(
    "Ended " + repName(r),
    () => {
      r.until = today();
      delete r.times;
    },
    { row: r.id }
  );
}
function repDelete() {
  const r = rep(F.id);
  if (!r) return;
  askDialog(
    "Delete " + repName(r) + "?",
    "It stops showing in Plan. Entries already written for it stay in History.",
    "Delete",
    () => {
      closeSheet();
      withUndo("Deleted " + repName(r), () => {
        S.repeats = S.repeats.filter(x => x !== r);
        S.txns.forEach(t => {
          if (t.rep === r.id) {
            delete t.rep;
            delete t.due;
          }
        });
      });
    },
    { danger: true }
  );
}
/* in a new entry's form: "Repeats" makes it the first of a series, saved with it */
const repToggle = () =>
  '<div class="reprow"><button class="btn text" id="f-rep" data-act="f-rep" aria-expanded="false">' +
  ic("event") +
  'Repeat</button><div class="seg" id="f-repunits" role="group" aria-label="Repeats" hidden>' +
  ["w", "m", "y"]
    .map(
      u =>
        '<button data-act="f-repunit" data-v="' +
        u +
        '" aria-pressed="' +
        (u === "m") +
        '">' +
        UNIT_ONE[u] +
        "</button>"
    )
    .join("") +
  "</div></div>";
function repToggleTap(el) {
  F.rep = F.rep ? null : { unit: "m" };
  el.setAttribute("aria-expanded", String(!!F.rep));
  el.classList.toggle("on", !!F.rep);
  $("#f-repunits").hidden = !F.rep;
  if (F.rep) setPressed("f-repunit", "m");
}
function repToggleUnit(u) {
  if (!F.rep) return;
  F.rep.unit = u;
  setPressed("f-repunit", u);
}
/* the series a new entry starts (its first occurrence is that entry); null when the form's Repeat is off */
function repFromEntry(t) {
  if (!F || !F.rep || F.id) return null;
  const r = {
    id: newId(),
    ts: Date.now(),
    type: t.type,
    account: t.account,
    amount: t.amount,
    note: t.note,
    name: "",
    every: 1,
    unit: F.rep.unit,
    first: t.date,
    last: false,
    skip: [],
    off: false,
  };
  if (t.type === "transfer") {
    r.to = t.to;
    if (t.toAmount != null) r.toAmount = t.toAmount;
  } else r.cat = t.cat;
  return r;
}
