/*
 * loans.js — Loans (you borrowed) and lendings (you lent). A loan is one or more draws (principal entries, each with an
 * optional due date) minus payments; paid / left / status are always derived in loanInfo().
 */
"use strict";

const loan = id => S.loans.find(l => l.id === id);
/* each loan's entries (draws and payments), found in one pass over S.txns and kept while it stays the same list: an
   entry added or removed changes its length, a deletion makes a new list, and amounts are read from the entries live */
let LOANIX = null;
function loanEntries(id) {
  if (!LOANIX || LOANIX.list !== S.txns || LOANIX.n !== S.txns.length) {
    const m = new Map();
    S.txns.forEach(t => {
      if (t.type !== "loan") return;
      if (!m.has(t.loan)) m.set(t.loan, []);
      m.get(t.loan).push(t);
    });
    LOANIX = { list: S.txns, n: S.txns.length, m };
  }
  return LOANIX.m.get(id) || [];
}
/* paid so far, what is left and the status; everything is derived from the loan's entries */
/* a loan/lending is one or more "draws" (principal entries), each with its own amount, date and optional due date. A
   lend's transfer charge (a principal entry linked to its draw, feeOf ↔ feeId) is part of that draw, never a draw of
   its own. Each draw owes its money (its amount + that charge) and its amount on top (onTop: a lend's extra, a borrow's
   charges). Payments, oldest first, go to the draws made by their day, due soonest first (draws without a due date
   last, oldest first); within a draw to its amount, then its charge, then its amount on top, so the amount on top is
   the last money paid back on it. rem[id] is what is still out of each draw (money and top), nextDue the earliest due
   date still unpaid, dueAmt what is due by then (or by today); money / top and moneyLeft / topLeft the loan's, and
   topPaid[payment id] the amount on top each payment covered (income on a lending, spending on a loan: loanParts()),
   topOn the same by day, [payment, day, amount, draw]: the payment's day, or the draw's when credit from an earlier
   payment covers a later draw (nothing is earned or owed on top before the draw). unpaid is everything still owed.
   Written off or forgiven, left is the money still unpaid (the top still unpaid is let go), and a lending's
   feeLeft[draw id] its transfer charge still unpaid (spending, on the draw's day). A loan with no transfer
   charge and no onTop (every loan before data version 8) gives exactly what version 7 gave (tests/e2e/45-charges.js). */
function loanInfo(l) {
  const mine = loanEntries(l.id),
    fee = {}; // draw id -> its transfer charge
  mine.forEach(t => {
    const a = t.principal && !t.feeOf ? addOnOf(t) : null;
    if (a && a.type === "loan" && a.principal && a.loan === l.id) fee[t.id] = a;
  });
  const fees = new Set(Object.values(fee));
  const draws = mine.filter(t => t.principal && !fees.has(t)).sort(byOldest);
  const pays = mine.filter(t => !t.principal);
  const newest = draws[draws.length - 1],
    a = acc(newest ? newest.account : l.account),
    cur = a ? a.currency : S.settings.cur,
    /* what's left, none when it shows as nothing (a third of a cent, after paying the $33.33 shown of $33.333) */
    owed = n => (shown(n, cur) > 0 ? rnd(n) : 0);
  const mon = {},
    top = {};
  draws.forEach(t => {
    mon[t.id] = fee[t.id] ? rnd(t.amount + fee[t.id].amount) : t.amount;
    top[t.id] = t.onTop || 0;
  });
  const sum = m => draws.reduce((s, t) => s + m[t.id], 0),
    total = rnd(draws.reduce((s, t) => s + mon[t.id] + top[t.id], 0)),
    paid = rnd(pays.reduce((s, t) => s + t.amount, 0)),
    all = owed(total - paid);
  const order = draws.slice().sort((x, y) => (x.due ? (y.due ? cmpDay(x.due, y.due) : -1) : y.due ? 1 : 0)),
    mRem = { ...mon },
    tRem = { ...top },
    topPaid = {},
    topOn = [],
    from = []; // the money not yet shared out: [payment, amount], oldest first
  /* n of the money in `from`, oldest first; what covers draw t's amount on top (onTop) is counted on its payment, on
     the later of the payment's day and the draw's */
  const use = (n, t, onTop) => {
    while (n > 0 && from.length) {
      const f = from[0],
        x = Math.min(f[1], n);
      f[1] = rnd(f[1] - x);
      n = rnd(n - x);
      if (onTop && x > 0) {
        const p = f[0],
          day = p.date > t.date ? p.date : t.date,
          last = topOn[topOn.length - 1];
        topPaid[p.id] = rnd((topPaid[p.id] || 0) + x);
        if (last && last[0] === p && last[1] === day) last[2] = rnd(last[2] + x);
        else topOn.push([p, day, x, t]);
      }
      if (f[1] <= 0) from.shift();
    }
  };
  /* a payment goes to the draws made by its day, due soonest first: never to one lent or borrowed after it, whose
     due date would otherwise vanish; anything over is credit, for the draws that came later */
  const take = (by, n) => {
    for (const t of order) {
      if (n <= 0) break;
      if (by && t.date > by) continue;
      const x = Math.min(tRem[t.id] ? rnd(mRem[t.id] + tRem[t.id]) : mRem[t.id], n),
        xm = Math.min(mRem[t.id], x),
        xt = rnd(x - xm);
      mRem[t.id] = rnd(mRem[t.id] - xm);
      tRem[t.id] = rnd(tRem[t.id] - xt);
      use(xm, t, false);
      use(xt, t, true);
      n = rnd(n - x);
    }
    return n;
  };
  let credit = 0;
  pays
    .slice()
    .sort(byOldest)
    .forEach(p => {
      from.push([p, p.amount]);
      credit = take(p.date, rnd(credit + p.amount));
    });
  take("", credit);
  const rem = {};
  draws.forEach(t => (rem[t.id] = owed(mRem[t.id] + tRem[t.id])));
  const owing = order.filter(t => rem[t.id] > 0),
    dueDraw = owing.find(t => t.due) || null,
    nextDue = dueDraw ? dueDraw.due : "",
    by = nextDue > today() ? nextDue : today(),
    dueAmt = rnd(owing.filter(t => t.due && t.due <= by).reduce((s, t) => s + rem[t.id], 0));
  const st =
    all <= 0
      ? "cleared"
      : l.status === "writeoff"
        ? "writeoff"
        : nextDue && nextDue < today()
          ? "overdue"
          : paid > 0
            ? "partly"
            : "active";
  const moneyLeft = owed(sum(mRem)),
    feeLeft = {};
  if (st === "writeoff" && l.kind === "lend")
    draws.forEach(t => fee[t.id] && (feeLeft[t.id] = owed(Math.min(fee[t.id].amount, mRem[t.id]))));
  return {
    draws,
    pays,
    total,
    money: rnd(sum(mon)),
    top: rnd(sum(top)),
    paid,
    left: st === "writeoff" ? owed(total - paid - sum(tRem)) : all,
    unpaid: all,
    moneyLeft,
    topLeft: owed(sum(tRem)),
    topPaid,
    topOn,
    fee,
    feeLeft,
    owes: Object.fromEntries(draws.map(t => [t.id, rnd(mon[t.id] + top[t.id])])),
    cur,
    rem,
    nextDue,
    dueDraw,
    dueAmt,
    st,
    open: st !== "cleared" && st !== "writeoff",
  };
}
/* under the loan sheet's figure, the tab's own parts as chips (docs/specs/charges.md, "The loan sheet"): Lent or
   Borrowed, its transfer charges, its extras or charges on top, each only when it isn't 0; none for a loan without
   add-ons (every loan recorded before data version 8) */
function loanChips(l, i) {
  const lend = l.kind === "lend",
    fees = rnd(Object.values(i.fee).reduce((s, f) => s + f.amount, 0));
  if (!(fees > 0) && !(i.top > 0)) return "";
  return partChips(
    [
      [lend ? "tx.lent" : "tx.borrowed", rnd(i.draws.reduce((s, t) => s + t.amount, 0))],
      ["tx.xcharge", fees],
      [lend ? "tx.extra" : "tx.charges", i.top],
    ].filter(p => p[1] > 0),
    i.cur
  );
}
/* "Due · $150.00": the amount only when part of the tab is due then (the date is in the field below) */
function dueHead(l, i) {
  if (!i.nextDue) return T("loan.noDueYet");
  return T("tx.due") + (i.dueAmt < i.left ? " · " + money(i.dueAmt, i.cur) : "");
}
function stLabel(l, st) {
  return T("loan.st." + (st === "writeoff" ? (l.kind === "lend" ? "writtenOff" : "forgiven") : st));
}
const loanWho = l => l.person || T("loan.someone");
/* where a payment goes by default: the loan's account, or (archived) the first active account in its currency */
const payAccount = (l, i) => {
  const a = acc(l.account);
  return a && !a.archived ? l.account : (activeAccounts().find(x => x.currency === i.cur) || {}).id;
};
/* after a draw is added, edited or deleted: the loan's account is its newest draw's, its date the oldest draw's */
function relinkLoan(id) {
  const l = loan(id),
    d = l ? loanInfo(l).draws : [];
  if (!d.length) return;
  l.account = d[d.length - 1].account;
  l.date = d[0].date;
}
/* why deleting these entries would break a loan, or "" (a loan losing every draw goes as a whole): its remaining
   draws (each with its transfer charge, unless that is deleted, and amount on top) would come to less than was already
   paid back (the extra would silently drop out of it), or a payment would come before its first draw */
function loanBlock(ids) {
  ids = new Set(ids);
  for (const l of S.loans) {
    const i = loanInfo(l),
      keep = i.draws.filter(t => !ids.has(t.id)),
      gone = t => !!i.fee[t.id] && ids.has(i.fee[t.id].id); // a kept draw's transfer charge taken off on its own
    if (!keep.length || (keep.length === i.draws.length && !keep.some(gone))) continue;
    const pays = i.pays.filter(t => !ids.has(t.id)),
      first = pays.map(t => t.date).sort()[0],
      owes = rnd(keep.reduce((s, t) => s + i.owes[t.id] - (gone(t) ? i.fee[t.id].amount : 0), 0));
    if (rnd(pays.reduce((s, t) => s + t.amount, 0)) - owes > Math.max(0, i.paid - i.total) + 0.0005)
      return T("loan.blockPaid", { who: loanWho(l), amount: money(i.paid, i.cur) });
    if (first && first < keep[0].date) return T("loan.blockOrder", { who: loanWho(l), date: dayLabel(first) });
  }
  return "";
}
/* Delete on a row of the loan sheet (never the loan's only draw, nor one already paid back) */
function deleteLoanEntry(id) {
  const t = entry(id),
    l = t && t.type === "loan" && loan(t.loan);
  if (!l || (t.principal && loanInfo(l).draws.length <= 1)) return;
  const no = loanBlock([id]);
  if (no) {
    snack(no);
    return;
  }
  closeSheet();
  withUndo(T(t.principal ? "common.deleted" : "loan.payDeleted"), () => {
    deleteEntries([id]); // a payment's fee goes with it
  });
}
/* "person | what's left", then "● Everyday · Due Tue, Jun 30 | status": the account's dot and name, when it's due (a loan
   that is over: when it was made), the status under the amount. How much of it is due is on the loan's own sheet. */
function loanRow(l, i = loanInfo(l)) {
  const lend = l.kind === "lend",
    date = dayLabel(i.open ? i.nextDue : l.date),
    when = i.open
      ? i.nextDue
        ? T("loan.rowDue", { date })
        : T("loan.noDue")
      : T(lend ? "loan.lentOn" : "loan.borrowedOn", { date }),
    sub = accTag(acc(l.account)) + " · " + esc(when);
  return (
    '<button class="tx stk' +
    (FX.row === l.id ? " flash" : "") +
    '" data-act="loan-open" data-v="' +
    l.id +
    '" data-drag="loan:' +
    l.id +
    '">' +
    emblem(LOAN_EMB[l.kind], "em") +
    '<span class="mid"><div class="d" dir="auto">' +
    esc(loanWho(l)) +
    '</div><div class="s">' +
    sub +
    "</div></span>" +
    '<span class="a">' +
    esc(money(i.open || i.st === "writeoff" ? i.left : i.total, i.cur)) + // written off: what was let go
    '<small><span class="st ' +
    i.st +
    '">' +
    esc(stLabel(l, i.st)) +
    "</span></small></span></button>"
  );
}
/* people you already have an open loan/lending of the same kind + currency with (most recently drawn on first); with
   `chips`, the ones the user took out of the suggestions are left out (typing a hidden name still merges) */
function personCandidates(kind, cur, q, chips) {
  const qq = curFold(q.trim()),
    seen = new Set(),
    out = [];
  S.loans.forEach(l => {
    if (l.kind !== kind || !l.person) return;
    const i = loanInfo(l);
    if (!i.open || i.cur !== cur) return;
    if (qq && !curFold(l.person).startsWith(qq)) return;
    const key = curFold(l.person);
    if (seen.has(key) || (chips && hiddenNames("people").includes(key))) return;
    seen.add(key);
    out.push({ l, ts: i.draws.length ? i.draws[i.draws.length - 1].ts || 0 : 0 });
  });
  return out
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6)
    .map(x => x.l);
}
function personSuggest(q) {
  if (!F || F.kind !== "loanf") return;
  const el = $("#f-person-sug");
  if (!el) return;
  const cur = (acc(F.account) || {}).currency,
    list = cur ? personCandidates(F.lk, cur, q || "", true) : [];
  el.hidden = !list.length;
  el.innerHTML = list.map(l => nameChip("people", "f-person-pick", l.id, l.person)).join("");
}
/* one-line feedback once a suggestion is picked: what the tab will total once this amount is added */
function mergeHint() {
  const el = $("#f-mergehint");
  if (!el || !F) return;
  const l = F.merge && loan(F.merge);
  if (!l) {
    el.hidden = true;
    return;
  }
  const i = loanInfo(l),
    lend = l.kind === "lend",
    add = evalAmt(($("#f-amt") || {}).value || "") || 0,
    tot = rnd(i.left + (add > 0 ? add : 0)); // what will be owed: what is still owed now, plus this
  el.hidden = false;
  el.textContent = T(lend ? "loan.mergeLend" : "loan.mergeBorrow", { who: l.person, amount: money(tot, i.cur) });
}
function loanForm(kind) {
  if (!activeAccounts().length) {
    snack(T("account.addFirst"));
    accForm(null, () => loanForm(kind));
    return;
  }
  const lend = kind === "lend",
    last = S.settings.lastAcc,
    def = acc(last) && !acc(last).archived ? last : activeAccounts()[0].id;
  F = { kind: "loanf", lk: kind, account: def, merge: null };
  let h =
    '<label class="field" style="margin-top:0"><span>' +
    TH(lend ? "loan.lentTo" : "loan.borrowedFrom") +
    '</span><input id="f-person" placeholder="' +
    TH("common.name") +
    '" maxlength="40" autocomplete="off"></label>';
  h += '<div class="chips" id="f-person-sug" hidden></div>';
  h += amtField("f-amt", acc(def).currency, "", { curId: "amt-cur" });
  h += '<p class="hint" id="f-mergehint" hidden></p>';
  const dueLbl = T("tx.due");
  h += '<div class="lbl">' + TH("common.account") + "</div>" + accChips("f-acc", F.account);
  h +=
    '<div class="row" style="margin-top:4px"><div class="field"><span>' +
    TH("common.date") +
    "</span>" +
    dateField("f-date", entryDate(), { max: today(), now: true }) +
    "</div>" +
    '<div class="field"><span>' +
    esc(dueLbl) +
    "</span>" +
    dateField("f-due", "", { min: "today", opt: true, none: T("loan.pickDay"), label: dueLbl }) +
    "</div></div>";
  h +=
    '<label class="field"><input id="f-note" placeholder="' +
    TH("entry.notePh") +
    '" aria-label="' +
    TH("common.note") +
    '" maxlength="80"></label>';
  h +=
    '<div class="gap"></div><div class="gap"></div><button class="btn" data-act="loan-save">' +
    ic("check") +
    TH(lend ? "loan.saveLend" : "loan.saveBorrow") +
    "</button>";
  openSheet(T(lend ? "loan.newLend" : "loan.newBorrow"), h);
  personSuggest("");
  setTimeout(() => {
    const el = $("#f-person");
    if (el) el.focus();
  }, 60);
}
function loanOpen(id, focusPay) {
  RBC = LPC = null;
  const l = loan(id);
  if (!l) {
    snack(T("loan.gone"));
    return;
  }
  const i = loanInfo(l),
    lend = l.kind === "lend",
    pct = i.total ? Math.min(100, Math.round((i.paid / i.total) * 100)) : 0;
  F = {
    kind: "loan",
    id,
    account: payAccount(l, i),
  };
  const heroLine =
    i.draws.length <= 1
      ? TH(lend ? "loan.youLent" : "loan.youBorrowed", {
          account: { html: accTag(acc(l.account)) },
          date: dayLabel(l.date),
        })
      : TH(lend ? "loan.lendingsSince" : "loan.loansSince", { count: i.draws.length, date: dayLabel(l.date) });
  let h =
    '<div class="hero"><div class="t">' +
    heroLine +
    '</div><div class="v">' +
    esc(money(i.open || i.st === "writeoff" ? i.left : i.total, i.cur)) +
    "</div>" +
    loanChips(l, i) +
    '<div class="t">' +
    (i.open || i.st === "writeoff"
      ? i.left === i.total
        ? "" // nothing paid back yet: "left of $X" would repeat the figure above it
        : TH(i.open ? "loan.leftOf" : "loan.ofTotal", { total: money(i.total, i.cur) }) + " · "
      : "") +
    '<span class="st ' +
    i.st +
    '">' +
    esc(stLabel(l, i.st)) +
    "</span></div></div>";
  h +=
    '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
    pct +
    '" aria-label="' +
    TH("loan.paidBar") +
    '"><span style="width:' +
    pct +
    '%"></span></div>';
  if (i.open) {
    // the draw whose due date the card changes: the one due next, else the newest still (or ever) out
    const dueDraw = i.dueDraw || i.draws.filter(t => i.rem[t.id] > 0).pop() || i.draws[i.draws.length - 1] || null;
    F.dueDraw = dueDraw ? dueDraw.id : null;
    h +=
      '<div class="card"><h3 id="loan-due">' +
      esc(dueHead(l, i)) +
      "</h3>" +
      (dueDraw
        ? '<div style="margin-top:10px">' +
          dateField("f-due2", i.nextDue || "", {
            min: "today",
            opt: true,
            none: T("loan.pickDay"),
            label: T("loan.changeDue"),
          }) +
          "</div>"
        : "") +
      "</div>";
    const payAccs = activeAccounts().filter(a => a.currency === i.cur);
    h +=
      '<div class="card"><h3>' +
      TH(lend ? "loan.gotBackQ" : "loan.paidBackQ") +
      '</h3><p class="muted small" style="margin:0">' +
      TH("loan.partOk") +
      "</p>" +
      amtField("f-amt", i.cur, amtPre(i.nextDue && i.nextDue <= today() ? i.dueAmt : i.left, i.cur)) +
      '<div class="lbl">' +
      TH("common.account") +
      "</div>" +
      (payAccs.length
        ? accChips("f-acc", F.account, null, payAccs)
        : '<p class="hint">' + TH("loan.noPayAccount", { cur: i.cur }) + "</p>") +
      '<div style="margin-top:12px">' +
      dateField("f-date", today(), { min: i.draws.length ? i.draws[0].date : "", max: today(), now: true }) +
      "</div>" +
      addOnLine() +
      loanAddOnCard(l, null, i.cur, "f") +
      '<div class="gap"></div><button class="btn" data-act="loan-pay">' +
      ic("check") +
      TH("loan.record") +
      "</button></div>";
  }
  /* a lend's transfer charge is part of its draw: on the draw's line, never a line of its own */
  const hist = S.txns.filter(t => t.type === "loan" && t.loan === l.id && !isAddOn(t)).sort(byNewest);
  h +=
    '<div class="sec">' +
    TH("common.history") +
    '</div><div class="list">' +
    hist
      .map(t => {
        const a = acc(t.account),
          f = t.feeId && entry(t.feeId);
        const r = runBal()[t.id] || {},
          canDel = !t.principal || i.draws.length > 1,
          name = { html: accTag(a) },
          amt = n => ({ amount: money(n, i.cur) }),
          top = t.principal ? 0 : topPaidOf(t.id),
          /* what a line adds (docs/specs/charges.md, "The loan sheet"): a draw's transfer charge and what it owes on
             top; what a payment carries (its transfer charge, a tip, an older paid fee) or covered on top */
          more = (
            t.principal
              ? [
                  TH(lend ? "loan.drawLent" : "loan.drawBorrowed", { account: name, date: dayLabel(t.date) }),
                  f && f.type === "loan" && TH("loan.xchargeAmt", amt(f.amount)),
                  t.onTop > 0 && TH(lend ? "loan.extraAmt" : "loan.chargesAmt", amt(t.onTop)),
                  t.due && TH("loan.dueOn", { date: dayLabel(t.due) }),
                  i.open &&
                    (i.rem[t.id] > 0 ? TH("loan.leftAmt", { amount: money(i.rem[t.id], i.cur) }) : TH("loan.paidOff")),
                  t.note && esc(t.note),
                ]
              : [
                  esc(dayLabel(t.date)),
                  TH(lend ? "loan.intoAcc" : "loan.fromAcc", { account: name }),
                  f && f.type === "expense" && TH(lend ? "loan.chargeAmt" : "loan.xchargeAmt", amt(f.amount)),
                  top > 0 && TH(lend ? "loan.extraIncl" : "loan.chargesIncl", amt(top)),
                  f && f.type === "income" && TH("loan.tipAmt", amt(f.amount)),
                  r.ls === "cleared"
                    ? TH(lend ? "loan.clearedLend" : "loan.clearedBorrow")
                    : TH("loan.leftAfter", { amount: money(r.left || 0, i.cur) }),
                ]
          )
            .filter(Boolean)
            .join(" · ");
        return (
          /* the row's head is the button that opens its details (they hold buttons of their own) */
          '<div class="tx exp"><button class="txh" data-act="row-exp" aria-expanded="false">' +
          emblem(t.principal ? LOAN_EMB[l.kind] : { i: "paid", c: "#15a06f" }, "em") +
          '<span class="mid"><div class="d" dir="auto">' +
          TH("loan.row." + (t.principal ? (lend ? "lent" : "borrowed") : lend ? "gotBack" : "paidBack")) +
          "</div>" +
          (t.principal ? "" : '<div class="s">' + loanPill(t) + "</div>") +
          "</span>" +
          '<span class="a ' +
          (t.dir === "in" ? "got" : "spent") +
          '">' +
          esc(money(t.amount, i.cur)) +
          "</span>" +
          '<span class="chev">' +
          ic("down") +
          "</span></button>" +
          '<div class="more">' +
          more +
          '<div class="medit"><button class="btn text" data-act="loandraw-edit" data-v="' +
          t.id +
          '">' +
          ic("edit") +
          TH("common.edit") +
          "</button>" +
          (canDel
            ? '<button class="btn text dng" data-act="loanpay-del" data-v="' +
              t.id +
              '">' +
              ic("delete") +
              TH(t.principal ? "loan.delEntry" : "loan.delPayment") +
              "</button>"
            : "") +
          "</div></div></div>"
        );
      })
      .join("") +
    "</div>";
  if (l.note) h += '<p class="muted small" style="margin:12px 4px 0">' + esc(l.note) + "</p>";
  h += '<div class="gap"></div><div class="gap"></div>';
  if (i.st === "cleared" && i.pays.length)
    h +=
      '<button class="btn tonal" data-act="loan-reopen">' +
      ic("reset") +
      TH("loan.reopenUndo") +
      '</button><div class="gap"></div>';
  if (i.st !== "cleared")
    h +=
      '<button class="btn tonal" data-act="loan-writeoff">' +
      TH(l.status === "writeoff" ? "loan.reopen" : lend ? "loan.writeOffRest" : "loan.forgive") +
      '</button><div class="gap"></div>';
  h += '<button class="btn danger" data-act="loan-del">' + TH(lend ? "loan.delLend" : "loan.delBorrow") + "</button>";
  openSheet(loanWho(l), h);
  loanPreviews();
  if (focusPay)
    setTimeout(() => {
      const el = $("#f-amt");
      if (el) {
        el.focus();
        el.select();
      }
    }, 60);
}
function loanDrawEdit(txnId) {
  if (!F || F.kind !== "loan") return;
  const l = loan(F.id);
  if (!l) return;
  const t = entry(txnId);
  if (!t) return;
  const i = loanInfo(l),
    lend = l.kind === "lend";
  F.editTxn = txnId;
  F.editAcc = t.account;
  const accs = activeAccounts().filter(a => a.currency === i.cur);
  let h = amtField("ed-amt", i.cur, amtPre(t.amount, i.cur));
  h += '<div class="lbl">' + TH("common.account") + "</div>" + accChips("ed-acc", t.account, null, accs);
  /* a payment can't be older than the first draw */
  const first = !t.principal && i.draws.length ? i.draws[0].date : "";
  h +=
    '<div class="field"><span>' +
    TH("common.date") +
    "</span>" +
    dateField("ed-date", t.date, { min: first, max: today() }) +
    "</div>";
  if (t.principal)
    h +=
      '<div class="field"><span>' +
      TH("tx.due") +
      "</span>" +
      dateField("ed-due", t.due || "", { min: t.date, opt: true, none: T("loan.noDue") }) +
      "</div>";
  /* the form's buttons and cards, open for the add-ons it has (docs/specs/charges.md, "The loan sheet") */
  h += addOnLine() + loanAddOnCard(l, t, i.cur, "ed");
  h +=
    '<div class="gap"></div><button class="btn" data-act="loandraw-save">' +
    ic("check") +
    TH("common.save") +
    "</button>";
  openSheet2(T(t.principal ? (lend ? "loan.editLend" : "loan.editBorrow") : "loan.editPayment"), h);
  loanPreviews();
}
function saveLoanDraw() {
  if (!F || !F.editTxn) return;
  const l = loan(F.id);
  if (!l) return;
  const i = loanInfo(l),
    lend = l.kind === "lend";
  const amt = evalAmt(($("#ed-amt") || {}).value);
  if (!(shown(amt, i.cur) > 0)) {
    snack(T("common.enterAmount"));
    return;
  }
  const acc2 = F.editAcc;
  if (!acc(acc2)) {
    snack(T("common.pickAccount"));
    return;
  }
  const dateEl = $("#ed-date"),
    date2 = dateEl ? dateEl.dataset.v : "";
  if (!date2) {
    snack(T("common.pickDate"));
    return;
  }
  const dueEl = $("#ed-due"),
    setDue = !!dueEl,
    due2 = dueEl ? dueEl.dataset.v || "" : "";
  if (setDue && due2 && due2 < date2) {
    snack(T("loan.dueBefore"));
    return;
  }
  const ao = addOnAmounts($("#sheet2 .p"), i.cur);
  if (!ao) return;
  const txnId = F.editTxn,
    t0 = entry(txnId);
  if (!t0) return;
  /* no payment before the first draw */
  const firstPay = i.pays.map(t => t.date).sort()[0];
  if (t0.principal && firstPay && firstPay < i.draws.map(t => (t.id === txnId ? date2 : t.date)).sort()[0]) {
    snack(T("loan.payBefore", { date: dayLabel(firstPay) }));
    return;
  }
  /* the entry, then its add-ons as its form has them: a draw's transfer charge (a lend's) and what it owes on top; a
     payment's transfer charge (a loan's), or a lending payment's tip (and an older paid fee, while it keeps one). Its
     add-on goes with it: same account, same day. False when an add-on is refused. */
  const mutate = () => {
    const t = entry(txnId);
    if (!t) return false;
    t.amount = amt;
    t.account = acc2;
    t.date = date2;
    if (setDue) t.due = due2;
    const ok = t.principal
      ? lend
        ? setAddOn(t, "charge", ao.xcharge || 0) && setAddOn(t, "top", ao.extra || 0)
        : setAddOn(t, "top", ao.charges || 0)
      : lend
        ? setAddOn(t, "charge", ao.charge || 0) && setAddOn(t, "extra", ao.extra || 0)
        : setAddOn(t, "charge", ao.xcharge || 0);
    relinkLoan(l.id);
    return ok;
  };
  /* never more paid back than is owed, the amounts on top counted: the rest would silently drop out of the loan */
  let after = null;
  const ok = tryChange(() => {
    if (mutate() === false) return false;
    after = loanInfo(loan(l.id));
  });
  if (!ok) {
    snack(T(t0.principal || !lend ? "charge.notNumber" : "extra.notNumber"));
    return;
  }
  if (after.paid - after.total > Math.max(0, i.paid - i.total) + 0.0005) {
    snack(
      t0.principal
        ? T("loan.alreadyPaid", { amount: money(i.paid, i.cur) })
        : T("loan.onlyLeft", { amount: money(rnd(i.unpaid + t0.amount), i.cur) })
    );
    return;
  }
  guardOverdraw(mutate, date2, () => {
    closeSheet2();
    closeSheet();
    withUndo(T("common.saved"), mutate, { row: l.id });
  });
}
function saveLoan() {
  const v = readVals(),
    person = $("#f-person").value.trim(),
    amt = evalAmt(v.amount),
    due = $("#f-due").dataset.v,
    lend = F.lk === "lend";
  if (!person) {
    snack(T(lend ? "loan.whoLend" : "loan.whoBorrow"));
    return;
  }
  if (!(shown(amt, (acc(F.account) || {}).currency) > 0)) {
    snack(T("common.enterAmount"));
    return;
  }
  if (!acc(F.account)) {
    snack(T("common.pickAccount"));
    return;
  }
  if (!v.date) {
    snack(T("common.pickDate"));
    return;
  }
  if (due && due < v.date) {
    snack(T("loan.dueBefore"));
    return;
  }
  const account = F.account,
    acct = acc(account),
    date = v.date,
    note = (v.note || "").trim();
  let merge = null;
  if (F.merge) {
    const ml = loan(F.merge);
    if (ml && ml.kind === F.lk && loanInfo(ml).open && loanInfo(ml).cur === acct.currency) merge = ml;
  }
  const pid = newId(),
    ts = Date.now(),
    l = merge || { id: newId(), kind: F.lk, person, account, date, note, status: "open" };
  const mutate = () => {
    if (!merge) S.loans.push(Object.assign({}, l));
    const t = {
      id: pid,
      ts,
      type: "loan",
      dir: lend ? "out" : "in",
      loan: l.id,
      principal: true,
      amount: amt,
      account,
      date,
    };
    if (due) t.due = due;
    t.note = note;
    S.txns.push(t);
    if (merge) relinkLoan(l.id);
  };
  guardOverdraw(mutate, date, () => {
    S.settings.lastAcc = account;
    closeSheet();
    withUndo(
      T(lend ? "loan.msg.lent" : "loan.msg.borrowed", { amount: money(amt, acct.currency), who: person }),
      mutate,
      {
        row: l.id,
      }
    );
    askNotify();
  });
}
function writeOffLoan() {
  const l = loan(F.id);
  if (!l) return;
  const lend = l.kind === "lend",
    back = l.status === "writeoff";
  closeSheet();
  withUndo(T(back ? "loan.msg.reopened" : lend ? "loan.msg.writtenOff" : "loan.msg.forgiven"), () => {
    const x = loan(l.id);
    x.status = back ? "open" : "writeoff";
  });
}
function deleteLoan() {
  const id = F.id;
  closeSheet();
  withUndo(T("common.deleted"), () => {
    deleteEntries(S.txns.filter(t => t.type === "loan" && t.loan === id).map(t => t.id)); // with the payments' fees
    S.loans = S.loans.filter(l => l.id !== id); // even one left without a draw (a hand-made backup)
  });
}
/* Records a payment on loan l with its add-on (add: a loan's transfer charge, a lending's extra, a tip on top), as an
   entry linked both ways through setAddOn(): off or into the same account, on the same day. Fresh objects on every
   call, since a change runs more than once (tried, the overdraw check, then for real). False when the add-on is
   refused (the change is then not saved). */
function addPayment(l, pid, ts, amount, account, date, add) {
  const p = {
    id: pid,
    ts,
    type: "loan",
    dir: l.kind === "lend" ? "in" : "out",
    loan: l.id,
    amount,
    account,
    date,
    note: "",
  };
  S.txns.push(p);
  return !(add > 0) || setAddOn(p, l.kind === "lend" ? "extra" : "charge", rnd(add));
}
/* what a payment of amt on day `date` would cover of loan l's amounts on top (a lending's extra, a loan's charges), by
   the share-out loanInfo() makes; replacing payment id when that one is being edited */
function payCovers(l, amt, date, id) {
  const keep = S.txns,
    p = id
      ? { ...entry(id), amount: amt, date }
      : { id: "?", ts: Date.now(), type: "loan", dir: l.kind === "lend" ? "in" : "out", loan: l.id, amount: amt, date };
  S.txns = keep.filter(t => t.id !== id).concat(p);
  try {
    return loanInfo(l).topPaid[p.id] || 0;
  } finally {
    S.txns = keep;
  }
}
/* The message after a payment of amt (docs/specs/charges.md, "Saving"): with what it covered on top (top) and its add-on
   (add: a transfer charge, or a tip, which adds to the extra's figure), and " · all cleared" when it clears the loan */
function payMsg(l, cur, amt, top, add, done) {
  const M = n => money(n, cur);
  let m;
  if (l.kind === "lend")
    m =
      add > 0 && top > 0
        ? T("loan.msg.gotBackIncl", { amount: M(rnd(amt + add)), extra: M(rnd(top + add)) })
        : add > 0
          ? T("loan.msg.gotBackTip", { amount: M(amt), extra: M(add) })
          : top > 0
            ? T("loan.msg.gotBackIncl", { amount: M(amt), extra: M(top) })
            : T("loan.msg.gotBack", { amount: M(amt) });
  else
    m =
      add > 0 && top > 0
        ? T("loan.msg.paidBackInclX", { amount: M(amt), charges: M(top), charge: M(add) })
        : add > 0
          ? T("loan.msg.paidBackX", { amount: M(amt), charge: M(add) })
          : top > 0
            ? T("loan.msg.paidBackIncl", { amount: M(amt), charges: M(top) })
            : T("loan.msg.paidBack", { amount: M(amt) });
  return m + (done ? " · " + T("loan.msg.allCleared") : "");
}
/* The card's kinds on a loan's forms (docs/specs/charges.md, "Which form offers what"), for a new payment on loan l (t
   null) or entry t being edited: a loan's payment "+ Transfer charge"; a lending's payment "+ Add an extra" (a tip),
   or while it keeps one, the Charge card of a paid fee an older version recorded ("+ Add an extra" once it is
   removed); a lend's draw "+ Transfer charge" and "+ Add an extra" (owed on top); a borrow's draw "+ Add charges". */
function loanAddOnCard(l, t, cur, pre) {
  const lend = l.kind === "lend",
    a = t ? addOnOf(t) : null,
    row = (kind, n, more) => ({ kind, open: n > 0, value: n > 0 ? amtPre(n, cur) : "", ...more });
  if (t && t.principal)
    return addOnCard(
      lend ? [row("xcharge", a ? a.amount : 0), row("extra", t.onTop)] : [row("charges", t.onTop)],
      cur,
      { pre }
    );
  if (!lend) return addOnCard([row("xcharge", a ? a.amount : 0)], cur, { pre });
  const fee = a && a.type === "expense" ? a : null,
    tip = a && a.type === "income" ? a : null;
  return addOnCard(
    (fee ? [row("charge", fee.amount, { once: true })] : []).concat(row("extra", tip ? tip.amount : 0)),
    cur,
    { pre, one: true }
  );
}
/* The previews on the loan sheet's card and on its Edit (docs/specs/charges.md, "Previews"), each one line with the
   figures in bold: a payment's only when it carries an add-on or covers part of an amount on top ("● Bank −৳5,200.00 ·
   loan ৳5,000.00 + transfer charge ৳200.00", "● Bkash +৳1,250.00 · lending ৳1,100.00 + extra ৳150.00"); a draw's as
   its form's ("● Bkash −৳1,100.00 · Rafi owes ৳1,250.00"). Empty until the amount is a number; a card that isn't yet
   one adds nothing. */
function loanPreviews() {
  const l = F && F.kind === "loan" && loan(F.id);
  if (!l) return;
  const one = $("#sheet .p"),
    two = $("#sheet2 .p"),
    t = F.editTxn && entry(F.editTxn);
  if (one && one.querySelector("#f-amt")) addOnPreview(one, loanPreview(l, one, "f", F.account, null));
  if (two && t && two.querySelector("#ed-amt")) addOnPreview(two, loanPreview(l, two, "ed", F.editAcc, t));
}
function loanPreview(l, sc, pre, accId, t) {
  const a = acc(accId),
    amt = evalAmt(sc.querySelector("#" + pre + "-amt").value);
  if (!a || !(amt > 0)) return "";
  const ao = {},
    lend = l.kind === "lend",
    cur = a.currency,
    b = x => "<b>" + esc(x) + "</b>",
    M = n => ({ html: b(money(n, cur)) }),
    line = (n, part) => accTag(a) + " " + b(signed(n, cur)) + " · " + part;
  Object.entries(addOnTexts(sc)).forEach(([k, v]) => {
    const n = evalAmt(v);
    ao[k] = n > 0 ? n : 0;
  });
  if (t && t.principal) {
    const x = (lend && ao.xcharge) || 0,
      owes = rnd(amt + x + (lend ? ao.extra || 0 : ao.charges || 0)),
      who = loanWho(l);
    return lend
      ? line(-(amt + x), TH("prev.owes", { who, amount: M(owes) }))
      : line(amt, TH("prev.youOweWho", { who, amount: M(owes) }));
  }
  const d = sc.querySelector("#" + pre + "-date"),
    top = payCovers(l, amt, (d && d.dataset.v) || today(), t ? t.id : null);
  if (lend) {
    const fee = ao.charge || 0,
      tip = ao.extra || 0;
    if (fee > 0) return line(amt - fee, TH("prev.lendOff", { amount: M(amt), charge: M(fee) }));
    return top + tip > 0
      ? line(amt + tip, TH("prev.lendExtra", { amount: M(rnd(amt - top)), extra: M(rnd(top + tip)) }))
      : "";
  }
  const x = ao.xcharge || 0;
  if (!(top > 0) && !(x > 0)) return "";
  return line(
    -(amt + x),
    top > 0 && x > 0
      ? TH("prev.loanChargesX", { amount: M(rnd(amt - top)), charges: M(top), charge: M(x) })
      : top > 0
        ? TH("prev.loanCharges", { amount: M(rnd(amt - top)), charges: M(top) })
        : TH("prev.loanX", { amount: M(amt), charge: M(x) })
  );
}
function payLoan() {
  const l = loan(F.id);
  if (!l) return;
  const i = loanInfo(l),
    v = readVals(),
    amt = evalAmt(v.amount),
    lend = l.kind === "lend";
  if (!(shown(amt, i.cur) > 0)) {
    snack(T("common.enterAmount"));
    return;
  }
  if (!acc(F.account)) {
    snack(
      activeAccounts().some(a => a.currency === i.cur) ? T("common.pickAccount") : T("loan.noAccountIn", { cur: i.cur })
    );
    return;
  }
  /* the card: a loan's transfer charge, or a lending's extra (a tip on top) */
  const ao = addOnAmounts($("#sheet .p"), i.cur);
  if (!ao) return;
  const add = (lend ? ao.extra : ao.xcharge) || 0;
  /* compared as shown: paying the $66.67 shown on a $66.667 tab clears it, with no "$0.00 more" */
  if (shown(amt, i.cur) > shown(i.left, i.cur)) {
    overpay(l, i, amt, F.account, v.date || today(), add);
    return;
  }
  const id = l.id,
    account = F.account,
    date = v.date || today(),
    done = shown(amt, i.cur) >= shown(i.left, i.cur),
    pid = newId(),
    ts = Date.now();
  const mutate = () => addPayment(l, pid, ts, amt, account, date, add);
  if (!tryChange(mutate)) {
    snack(T(lend ? "extra.notNumber" : "charge.notNumber")); // never saved without the add-on it was given
    return;
  }
  saveChecked(mutate, date, payMsg(l, i.cur, amt, payCovers(l, amt, date, null), add, done), { row: id });
}
/* someone paid back more than they owed (or you did): the payment clears this one, and the extra is either a loan the
   other way, or (they paid you more) income, on the income form so the category is the user's choice, or (you paid
   them more: a sending charge, interest) that payment's fee. Tally never files it under a category by itself. */
function overpay(l, i, amt, account, date, add) {
  const lend = l.kind === "lend",
    who = loanWho(l),
    extra = rnd(amt - i.left),
    cur = i.cur,
    pid = newId(),
    nid = newId(),
    qid = newId(),
    ts = Date.now();
  /* the payment that clears this loan, with its add-on (and the extra as its charge, when that's the choice) */
  const clear = more => {
    if (i.left > 0) addPayment(l, pid, ts, i.left, account, date, rnd(add + (more || 0)));
  };
  const book = (mutate, msg, row) => saveChecked(mutate, date, msg, { row });
  const asLoan = () =>
    book(
      () => {
        clear();
        S.loans.push({
          id: nid,
          ts,
          kind: lend ? "borrow" : "lend",
          person: l.person,
          account,
          date,
          note: "",
          status: "open",
        });
        S.txns.push({
          id: qid,
          ts: ts + 2,
          type: "loan",
          dir: lend ? "in" : "out",
          loan: nid,
          principal: true,
          amount: extra,
          account,
          date,
          note: "",
        });
      },
      T(lend ? "loan.over.lendToLoan" : "loan.over.loanToLend", { who, amount: money(extra, cur) }),
      nid
    );
  const asIncome = () =>
    txSheet(null, "income", null, {
      amount: extra,
      cur,
      account,
      date,
      note: T("loan.over.extraNote", { who }),
      also: clear,
      msg: T("loan.over.lendCleared", { who }) + " · ",
      back: l.id,
    });
  const asFee = () => book(() => clear(extra), T("loan.over.asFeeMsg", { amount: money(rnd(add + extra), cur) }), l.id);
  const v = { who, amount: money(extra, cur) };
  askDialog(
    T(lend ? "loan.over.theyPaid" : "loan.over.youPaid", v),
    T(lend ? "loan.over.askLendOr" : "loan.over.askBorrowOr", v),
    T(lend ? "loan.over.asLoan" : "loan.over.asLend"),
    asLoan,
    { alt: [T(lend ? "loan.over.asIncome" : "loan.over.asFee"), lend ? asIncome : asFee], cancel: T("common.goBack") }
  );
}
/* dropped on Cleared: ask how it was cleared, because one way moves money */
function clearLoan(id) {
  const l = loan(id);
  if (!l) return;
  const i = loanInfo(l),
    lend = l.kind === "lend",
    who = loanWho(l);
  if (!i.open) return;
  const account = payAccount(l, i),
    pid = newId(),
    ts = Date.now();
  const paid = () => {
    if (!account) {
      snack(T("loan.noAccountRecord", { cur: i.cur }));
      return;
    }
    /* everything left, the amounts on top included, with a payment's message */
    const mutate = () => {
      addPayment(l, pid, ts, i.left, account, today(), 0);
    };
    guardOverdraw(mutate, today(), () => {
      V.showCleared = true;
      withUndo(payMsg(l, i.cur, i.left, payCovers(l, i.left, today(), null), 0, true), mutate, { row: id });
    });
  };
  const off = () => {
    V.showCleared = true;
    withUndo(
      T(lend ? "loan.msg.writtenOff" : "loan.msg.forgiven"),
      () => {
        loan(id).status = "writeoff";
      },
      { row: id }
    );
  };
  /* with no account in the loan's currency, a payment can't be recorded: only writing it off is offered */
  const v = { who, amount: money(i.left, i.cur), account: account ? acc(account).name : "", cur: i.cur },
    offText = T(lend ? "loan.clear.writeOff" : "loan.clear.forgive");
  askDialog(
    T(lend ? "loan.clear.titleLend" : "loan.clear.titleBorrow", v),
    sentences(
      T(lend ? "loan.clear.owesYou" : "loan.clear.youOwe", v),
      T(account ? (lend ? "loan.clear.into" : "loan.clear.from") : "loan.clear.noAccount", v)
    ),
    account ? T(lend ? "loan.clear.gotAll" : "loan.clear.paidAll") : offText,
    account ? paid : off,
    account ? { alt: [offText, off] } : undefined
  );
}
/* back to open: a written-off one just reopens; a fully paid one drops its latest payment (the user's choice) */
function reopenLoan(id) {
  const l = loan(id);
  if (!l) return;
  const i = loanInfo(l),
    lend = l.kind === "lend",
    who = loanWho(l);
  if (i.st === "writeoff") {
    withUndo(
      T(lend ? "loan.msg.owesAgain" : "loan.msg.oweAgain", { who, amount: money(i.unpaid, i.cur) }), // the top too
      () => {
        loan(id).status = "open";
      },
      { row: id }
    );
    buzz("confirm");
    return;
  }
  if (i.st !== "cleared") return;
  const last = i.pays.slice().sort(byNewest)[0];
  if (!last) return;
  withUndo(
    T(lend ? "loan.msg.owesAgain" : "loan.msg.oweAgain", { who, amount: money(last.amount, i.cur) }),
    () => {
      deleteEntries([last.id]); // with its fee
      loan(id).status = "open";
    },
    { row: id }
  );
  buzz("confirm");
}
/* the snooze, +1 day / +1 week on a due reminder, tapped on day `on` (default today): every unpaid draw due by then,
   else the next one, moves on from whichever is later, its due date or that day */
function extendLoan(l, days, on) {
  on = on || today();
  const i = loanInfo(l),
    due = i.draws.filter(t => i.rem[t.id] > 0 && t.due && t.due <= on), // what the reminder was about
    list = due.length ? due : [i.dueDraw || i.draws[i.draws.length - 1]];
  list.forEach(t => {
    if (t) t.due = addDays(t.due && t.due > on ? t.due : on, days);
  });
}
