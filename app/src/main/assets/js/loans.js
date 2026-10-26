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
/* a loan/lending is one or more "draws" (principal entries), each with its own amount, date and optional due date.
   Payments go to the draw due soonest first (draws without a due date last, oldest first): rem[id] is what is still
   out of each draw, nextDue the earliest due date still unpaid, dueAmt what is due by then (or by today) */
function loanInfo(l) {
  const mine = loanEntries(l.id),
    byDate = (x, y) => cmpDay(x.date, y.date) || (x.ts || 0) - (y.ts || 0);
  const draws = mine.filter(t => t.principal).sort(byDate);
  const pays = mine.filter(t => !t.principal);
  const newest = draws[draws.length - 1],
    a = acc(newest ? newest.account : l.account),
    cur = a ? a.currency : S.settings.cur,
    /* what's left, none when it shows as nothing (a third of a cent, after paying the $33.33 shown of $33.333) */
    owed = n => (shown(n, cur) > 0 ? rnd(n) : 0);
  const total = rnd(draws.reduce((s, t) => s + t.amount, 0)),
    paid = rnd(pays.reduce((s, t) => s + t.amount, 0)),
    left = owed(total - paid);
  const order = draws.slice().sort((x, y) => (x.due ? (y.due ? cmpDay(x.due, y.due) : -1) : y.due ? 1 : 0)),
    rem = {};
  draws.forEach(t => (rem[t.id] = t.amount));
  /* a payment goes to the draws made by its day, due soonest first: never to one lent or borrowed after it, whose
     due date would otherwise vanish; anything over is credit, for the draws that came later */
  const take = (by, n) => {
    for (const t of order) {
      if (n <= 0) break;
      if (by && t.date > by) continue;
      const x = Math.min(rem[t.id], n);
      rem[t.id] = rnd(rem[t.id] - x);
      n = rnd(n - x);
    }
    return n;
  };
  let credit = 0;
  pays
    .slice()
    .sort(byDate)
    .forEach(p => (credit = take(p.date, rnd(credit + p.amount))));
  take("", credit);
  draws.forEach(t => (rem[t.id] = owed(rem[t.id])));
  const owing = order.filter(t => rem[t.id] > 0),
    dueDraw = owing.find(t => t.due) || null,
    nextDue = dueDraw ? dueDraw.due : "",
    by = nextDue > today() ? nextDue : today(),
    dueAmt = rnd(owing.filter(t => t.due && t.due <= by).reduce((s, t) => s + rem[t.id], 0));
  const st =
    left <= 0
      ? "cleared"
      : l.status === "writeoff"
        ? "writeoff"
        : nextDue && nextDue < today()
          ? "overdue"
          : paid > 0
            ? "partly"
            : "active";
  return {
    draws,
    pays,
    total,
    paid,
    left,
    cur,
    rem,
    nextDue,
    dueDraw,
    dueAmt,
    st,
    open: st !== "cleared" && st !== "writeoff",
  };
}
/* "Payback day · 29 Sep", with the amount when only part of the tab is due then */
function dueHead(l, i) {
  if (!i.nextDue) return T("loan.noDueYet");
  return (
    T(l.kind === "lend" ? "loan.paybackHead" : "loan.returnHead", { date: dayLabel(i.nextDue) }) +
    (i.dueAmt < i.left ? " · " + money(i.dueAmt, i.cur) : "")
  );
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
   draws would come to less than was already paid back (the extra would silently drop out of it), or a payment would
   come before its first draw */
function loanBlock(ids) {
  ids = new Set(ids);
  const sum = list => rnd(list.reduce((s, t) => s + t.amount, 0));
  for (const l of S.loans) {
    const i = loanInfo(l),
      keep = i.draws.filter(t => !ids.has(t.id));
    if (!keep.length || keep.length === i.draws.length) continue;
    const pays = i.pays.filter(t => !ids.has(t.id)),
      first = pays.map(t => t.date).sort()[0];
    if (sum(pays) - sum(keep) > Math.max(0, i.paid - i.total) + 0.0005)
      return T("loan.blockPaid", { who: loanWho(l), amount: money(i.paid, i.cur) });
    if (first && first < keep[0].date) return T("loan.blockOrder", { who: loanWho(l), date: dayLabel(first) });
  }
  return "";
}
/* Delete on a row of the loan sheet (never the loan's only draw, nor one already paid back) */
function deleteLoanEntry(id) {
  const t = S.txns.find(x => x.id === id),
    l = t && t.type === "loan" && loan(t.loan);
  if (!l || (t.principal && loanInfo(l).draws.length <= 1)) return;
  const no = loanBlock([id]);
  if (no) {
    snack(no);
    return;
  }
  closeSheet();
  withUndo(T(t.principal ? "common.deleted" : "loan.payDeleted"), () => {
    S.txns = S.txns.filter(x => x.id !== id && x.feeOf !== id); // a payment's fee goes with it
    relinkLoan(l.id);
  });
}
function loanRow(l, i = loanInfo(l)) {
  const lend = l.kind === "lend";
  const a = acc(l.account),
    date = dayLabel(i.open ? i.nextDue : l.date);
  const sub =
    T(lend ? "loan.from" : "loan.into", { account: a ? a.name : "?" }) +
    " · " +
    (i.open
      ? i.nextDue
        ? i.dueAmt < i.left
          ? T("loan.dueAmount", { amount: money(i.dueAmt, i.cur), date })
          : T(lend ? "loan.paybackOn" : "loan.returnOn", { date })
        : T("loan.noDue")
      : T(lend ? "loan.lentOn" : "loan.borrowedOn", { date }));
  return (
    '<button class="tx' +
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
    esc(sub) +
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
/* people you already have an open loan/lending of the same kind + currency with (most recently drawn on first) */
function personCandidates(kind, cur, q) {
  const qq = curFold(q.trim()),
    seen = new Set(),
    out = [];
  S.loans.forEach(l => {
    if (l.kind !== kind || !l.person) return;
    const i = loanInfo(l);
    if (!i.open || i.cur !== cur) return;
    if (qq && !curFold(l.person).startsWith(qq)) return;
    const key = curFold(l.person);
    if (seen.has(key)) return;
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
    list = cur ? personCandidates(F.lk, cur, q || "") : [];
  el.hidden = !list.length;
  el.innerHTML = list
    .map(
      l =>
        '<button class="chip" data-act="f-person-pick" data-v="' +
        esc(l.id) +
        '"><span class="chn" dir="auto">' +
        esc(l.person) +
        "</span></button>"
    )
    .join("");
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
  const dueLbl = T(lend ? "loan.paybackDay" : "loan.returnBy");
  h +=
    '<div class="lbl">' + TH(lend ? "loan.fromAccount" : "loan.intoAccount") + "</div>" + accChips("f-acc", F.account);
  h +=
    '<div class="row" style="margin-top:4px"><div class="field"><span>' +
    TH("common.date") +
    "</span>" +
    dateField("f-date", entryDate(), { max: today(), now: true }) +
    "</div>" +
    '<div class="field"><span>' +
    esc(dueLbl) +
    "</span>" +
    dateField("f-due", "", { min: today(), opt: true, none: T("loan.pickDay"), label: dueLbl }) +
    "</div></div>";
  h +=
    '<label class="field"><span>' +
    TH("common.note") +
    '</span><input id="f-note" placeholder="' +
    TH("common.optional") +
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
  RBC = null;
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
          account: (acc(l.account) || {}).name || "?",
          date: dayLabel(l.date),
        })
      : TH(lend ? "loan.lendingsSince" : "loan.loansSince", { count: i.draws.length, date: dayLabel(l.date) });
  let h =
    '<div class="hero"><div class="t">' +
    heroLine +
    '</div><div class="v">' +
    esc(money(i.open || i.st === "writeoff" ? i.left : i.total, i.cur)) +
    "</div>" +
    '<div class="t">' +
    (i.open || i.st === "writeoff"
      ? TH(i.open ? "loan.leftOf" : "loan.ofTotal", { total: money(i.total, i.cur) }) + " · "
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
            min: today(),
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
      amtField("f-amt", i.cur, String(i.nextDue && i.nextDue <= today() ? i.dueAmt : i.left)) +
      '<div class="lbl">' +
      TH(lend ? "loan.payInto" : "loan.payFrom") +
      "</div>" +
      (payAccs.length
        ? accChips("f-acc", F.account, null, payAccs)
        : '<p class="hint">' + TH("loan.noPayAccount", { cur: i.cur }) + "</p>") +
      '<div style="margin-top:12px">' +
      dateField("f-date", today(), { min: i.draws.length ? i.draws[0].date : "", max: today(), now: true }) +
      "</div>" +
      feeField(false, "", T("fee.label", { cur: i.cur }), T("loan.addFee")) +
      '<div class="gap"></div><button class="btn" data-act="loan-pay">' +
      ic("check") +
      TH("loan.record") +
      "</button></div>";
  }
  const hist = S.txns.filter(t => t.type === "loan" && t.loan === l.id).sort(byNewest);
  h +=
    '<div class="sec">' +
    TH("common.history") +
    '</div><div class="list">' +
    hist
      .map(t => {
        const a = acc(t.account),
          f = t.feeId && S.txns.find(x => x.id === t.feeId);
        const r = runBal()[t.id] || {},
          canDel = !t.principal || i.draws.length > 1,
          name = a ? a.name : "?",
          more = (
            t.principal
              ? [
                  T(lend ? "loan.drawLent" : "loan.drawBorrowed", { account: name, date: dayLabel(t.date) }),
                  t.due && T("loan.dueOn", { date: dayLabel(t.due) }),
                  i.open &&
                    (i.rem[t.id] > 0 ? T("loan.leftAmt", { amount: money(i.rem[t.id], i.cur) }) : T("loan.paidOff")),
                  t.note,
                ]
              : [
                  dayLabel(t.date),
                  T(lend ? "loan.intoAcc" : "loan.fromAcc", { account: name }),
                  f && T("loan.feeAmt", { amount: money(f.amount, i.cur) }),
                  r.ls === "cleared"
                    ? T(lend ? "loan.clearedLend" : "loan.clearedBorrow")
                    : T("loan.leftAfter", { amount: money(r.left || 0, i.cur) }),
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
          esc(more) +
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
  const t = S.txns.find(x => x.id === txnId);
  if (!t) return;
  const i = loanInfo(l),
    lend = l.kind === "lend";
  F.editTxn = txnId;
  F.editAcc = t.account;
  const accs = activeAccounts().filter(a => a.currency === i.cur);
  let h = amtField("ed-amt", i.cur, String(t.amount));
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
      TH("loan.dueOptional") +
      "</span>" +
      dateField("ed-due", t.due || "", { min: t.date, opt: true, none: T("loan.noDue") }) +
      "</div>";
  h +=
    '<div class="gap"></div><button class="btn" data-act="loandraw-save">' +
    ic("check") +
    TH("common.save") +
    "</button>";
  openSheet2(T(t.principal ? (lend ? "loan.editLend" : "loan.editBorrow") : "loan.editPayment"), h);
}
function saveLoanDraw() {
  if (!F || !F.editTxn) return;
  const l = loan(F.id);
  if (!l) return;
  const amt = evalAmt(($("#ed-amt") || {}).value);
  if (!(amt > 0)) {
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
  const txnId = F.editTxn,
    t0 = S.txns.find(x => x.id === txnId);
  if (!t0) return;
  /* never (more) paid back than was lent/borrowed: the extra would silently drop out of the loan; and no payment
     before the first draw */
  const i = loanInfo(l),
    firstPay = i.pays.map(t => t.date).sort()[0];
  if (t0.principal && firstPay && firstPay < i.draws.map(t => (t.id === txnId ? date2 : t.date)).sort()[0]) {
    snack(T("loan.payBefore", { date: dayLabel(firstPay) }));
    return;
  }
  const total = rnd(i.total + (t0.principal ? amt - t0.amount : 0)),
    paid = rnd(i.paid + (t0.principal ? 0 : amt - t0.amount));
  if (paid - total > Math.max(0, i.paid - i.total) + 0.0005) {
    snack(
      t0.principal
        ? T("loan.alreadyPaid", { amount: money(i.paid, i.cur) })
        : T("loan.onlyLeft", { amount: money(rnd(i.left + t0.amount), i.cur) })
    );
    return;
  }
  const mutate = () => {
    const t = S.txns.find(x => x.id === txnId);
    if (!t) return;
    t.amount = amt;
    t.account = acc2;
    t.date = date2;
    if (setDue) t.due = due2;
    /* a payment's fee goes with it: same account, same day */
    const fee = t.feeId && S.txns.find(x => x.id === t.feeId);
    if (fee) {
      fee.account = acc2;
      fee.date = date2;
    }
    relinkLoan(l.id);
  };
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
  if (!(amt > 0)) {
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
    const gone = new Set(S.txns.filter(t => t.type === "loan" && t.loan === id).map(t => t.id));
    S.loans = S.loans.filter(l => l.id !== id);
    S.txns = S.txns.filter(t => !gone.has(t.id) && !gone.has(t.feeOf)); // the payments' fees go with them
  });
}
/* a payment on loan l, plus its fee when there is one: an expense linked both ways, like a transfer's (off the same
   account, shown with the payment, never spending). Fresh objects on every call, since a change runs twice (overdraw
   check, then for real). */
function payTxns(l, pid, ts, amount, account, date, fee) {
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
  if (!(fee > 0)) return [p];
  const f = {
    id: pid + "f",
    ts: ts + 1,
    type: "expense",
    amount: rnd(fee),
    account,
    cat: "fees",
    date,
    note: "",
  };
  f.feeOf = p.id;
  p.feeId = f.id;
  return [p, f];
}
/* the payment card's fee, if one was added: a number ≥ 0, or null (already said why) */
function readFee(v) {
  const text = F.showFee ? String(v.fee || "").trim() : "",
    fee = text ? evalAmt(text) : 0;
  if (fee == null || fee < 0) {
    snack(T(fee == null ? "fee.notNumber" : "loan.feeNegative"));
    return null;
  }
  return fee;
}
const plusFee = (fee, cur) => (fee > 0 ? " + " + T("loan.feeAmt", { amount: money(fee, cur) }) : "");
function payLoan() {
  const l = loan(F.id);
  if (!l) return;
  const i = loanInfo(l),
    v = readVals(),
    amt = evalAmt(v.amount),
    lend = l.kind === "lend";
  if (!(amt > 0)) {
    snack(T("common.enterAmount"));
    return;
  }
  if (!acc(F.account)) {
    snack(
      activeAccounts().some(a => a.currency === i.cur) ? T("common.pickAccount") : T("loan.noAccountIn", { cur: i.cur })
    );
    return;
  }
  const fee = readFee(v);
  if (fee == null) return;
  /* compared as shown: paying the $66.67 shown on a $66.667 tab clears it, with no "$0.00 more" */
  if (shown(amt, i.cur) > shown(i.left, i.cur)) {
    overpay(l, i, amt, F.account, v.date || today(), fee);
    return;
  }
  const id = l.id,
    account = F.account,
    date = v.date || today(),
    done = shown(amt, i.cur) >= shown(i.left, i.cur),
    pid = newId(),
    ts = Date.now();
  const mutate = () => {
    S.txns.push(...payTxns(l, pid, ts, amt, account, date, fee));
  };
  guardOverdraw(mutate, date, () => {
    closeSheet();
    withUndo(
      T(lend ? "loan.msg.gotBack" : "loan.msg.paidBack", { amount: money(amt, i.cur) }) +
        plusFee(fee, i.cur) +
        (done ? " · " + T("loan.msg.allCleared") : ""),
      mutate,
      { row: id }
    );
  });
}
/* someone paid back more than they owed (or you did): the payment clears this one, and the extra is either a loan the
   other way, or (they paid you more) income, on the income form so the category is the user's choice, or (you paid
   them more: a sending charge, interest) that payment's fee. Tally never files it under a category by itself. */
function overpay(l, i, amt, account, date, fee) {
  const lend = l.kind === "lend",
    who = loanWho(l),
    extra = rnd(amt - i.left),
    cur = i.cur,
    pid = newId(),
    nid = newId(),
    qid = newId(),
    ts = Date.now();
  /* the payment that clears this loan (with the extra as its fee, when that's the choice) */
  const clear = more => {
    if (i.left > 0) S.txns.push(...payTxns(l, pid, ts, i.left, account, date, rnd(fee + (more || 0))));
  };
  const book = (mutate, msg, row) =>
    guardOverdraw(mutate, date, () => {
      closeSheet();
      withUndo(msg, mutate, { row });
    });
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
  const asFee = () => book(() => clear(extra), T("loan.over.asFeeMsg", { amount: money(rnd(fee + extra), cur) }), l.id);
  const left = i.left > 0;
  const v = { who, amount: money(extra, cur) };
  askDialog(
    T(lend ? "loan.over.theyPaid" : "loan.over.youPaid", v),
    T("loan.over." + (lend ? "askLend" : "askBorrow") + (left ? "Or" : ""), v),
    T(lend ? "loan.over.asLoan" : "loan.over.asLend"),
    asLoan,
    left
      ? {
          alt: [T(lend ? "loan.over.asIncome" : "loan.over.asFee"), lend ? asIncome : asFee],
          cancel: T("common.goBack"),
        }
      : { cancel: T("common.goBack") }
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
    const mutate = () => {
      S.txns.push(...payTxns(l, pid, ts, i.left, account, today(), 0));
    };
    guardOverdraw(mutate, today(), () => {
      V.showCleared = true;
      withUndo(
        T(lend ? "loan.msg.gotBack" : "loan.msg.paidBack", { amount: money(i.left, i.cur) }) +
          " · " +
          T("loan.msg.allCleared"),
        mutate,
        { row: id }
      );
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
      T(lend ? "loan.msg.owesAgain" : "loan.msg.oweAgain", { who, amount: money(i.left, i.cur) }),
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
      S.txns = S.txns.filter(t => t.id !== last.id && t.feeOf !== last.id); // with its fee
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
