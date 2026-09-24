/*
 * loans.js — Loans (you borrowed) and lendings (you lent). A loan is one or more draws (principal entries, each with an
 * optional due date) minus payments; paid / left / status are always derived in loanInfo().
 */
"use strict";

const loan = id => S.loans.find(l => l.id === id);
/* paid so far, what is left and the status; everything is derived from the loan's entries */
/* a loan/lending is one or more "draws" (principal entries), each with its own amount, date and optional due date;
   payments reduce the shared pool (not attributed to a specific draw — see CLAUDE.md) */
function loanInfo(l) {
  const draws = S.txns
    .filter(t => t.type === "loan" && t.loan === l.id && t.principal)
    .sort((x, y) => x.date.localeCompare(y.date) || (x.ts || 0) - (y.ts || 0));
  const pays = S.txns.filter(t => t.type === "loan" && t.loan === l.id && !t.principal);
  const total = r2(draws.reduce((s, t) => s + t.amount, 0)),
    paid = r2(pays.reduce((s, t) => s + t.amount, 0)),
    left = r2(Math.max(0, total - paid));
  const newest = draws[draws.length - 1],
    a = acc(newest ? newest.account : l.account),
    cur = a ? a.currency : S.settings.cur;
  const nextDue =
    draws
      .map(t => t.due)
      .filter(Boolean)
      .sort()[0] || "";
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
  return { draws, pays, total, paid, left, cur, nextDue, st, open: st !== "cleared" && st !== "writeoff" };
}
function stLabel(l, st) {
  return {
    active: "Active",
    partly: "Partly paid",
    overdue: "Overdue",
    cleared: "Cleared",
    writeoff: l.kind === "lend" ? "Written off" : "Forgiven",
  }[st];
}
const loanWho = l => l.person || "Someone";
function loanRow(l, drag) {
  const i = loanInfo(l),
    lend = l.kind === "lend";
  const a = acc(l.account),
    src = (lend ? "From " : "Into ") + (a ? a.name : "?") + " · ";
  const sub =
    src +
    (i.open
      ? i.nextDue
        ? (lend ? "Payback " : "Return by ") + dayLabel(i.nextDue)
        : "No due date"
      : (lend ? "Lent " : "Borrowed ") + dayLabel(l.date));
  return (
    '<button class="tx' +
    (FX.row === l.id ? " flash" : "") +
    '" data-act="loan-open" data-v="' +
    l.id +
    '"' +
    (drag ? ' data-drag="loan:' + l.id + '"' : "") +
    ">" +
    emblem(LOAN_EMB[l.kind], "em") +
    '<span class="mid"><div class="d">' +
    esc(loanWho(l)) +
    '</div><div class="s">' +
    esc(sub) +
    "</div></span>" +
    '<span class="a">' +
    esc(money(i.open ? i.left : i.total, i.cur)) +
    '<small><span class="st ' +
    i.st +
    '">' +
    esc(stLabel(l, i.st)) +
    "</span></small></span></button>"
  );
}
/* people you already have an open loan/lending of the same kind + currency with (most recently drawn on first) */
function personCandidates(kind, cur, q) {
  const qq = q.trim().toLowerCase(),
    seen = new Set(),
    out = [];
  S.loans.forEach(l => {
    if (l.kind !== kind || !l.person) return;
    const i = loanInfo(l);
    if (!i.open || i.cur !== cur) return;
    if (qq && !l.person.toLowerCase().startsWith(qq)) return;
    const key = l.person.toLowerCase();
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
    .map(l => '<button class="chip" data-act="f-person-pick" data-v="' + esc(l.id) + '">' + esc(l.person) + "</button>")
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
    tot = r2(i.total + (add > 0 ? add : 0));
  el.hidden = false;
  el.textContent =
    "Adds to what you " +
    (lend ? "lent " : "borrowed from ") +
    l.person +
    " — now " +
    money(tot, i.cur) +
    (lend ? " owed" : " you owe") +
    ".";
}
function loanForm(kind) {
  if (!activeAccounts().length) {
    snack("Add an account first");
    accForm();
    return;
  }
  const lend = kind === "lend",
    last = S.settings.lastAcc,
    def = acc(last) && !acc(last).archived ? last : activeAccounts()[0].id;
  F = { kind: "loanf", lk: kind, account: def, merge: null };
  let h =
    '<label class="field" style="margin-top:0"><span>' +
    (lend ? "Lent to" : "Borrowed from") +
    '</span><input id="f-person" placeholder="Name" maxlength="40" autocomplete="off"></label>';
  h += '<div class="chips" id="f-person-sug" hidden></div>';
  h += amtField("f-amt", acc(def).currency, "");
  h += '<p class="hint" id="f-mergehint" hidden></p>';
  h += '<div class="lbl">' + (lend ? "From account" : "Into account") + "</div>" + accChips("f-acc", F.account);
  h +=
    '<div class="row" style="margin-top:4px"><div class="field"><span>Date</span>' +
    dateField("f-date", entryDate(), { max: today() }) +
    "</div>" +
    '<div class="field"><span>' +
    (lend ? "Payback day" : "Return by") +
    "</span>" +
    dateField("f-due", "", { min: today(), opt: true, none: "Pick a day", label: lend ? "Payback day" : "Return by" }) +
    "</div></div>";
  h += '<label class="field"><span>Note</span><input id="f-note" placeholder="Optional" maxlength="80"></label>';
  h +=
    '<div class="gap"></div><div class="gap"></div><button class="btn" data-act="loan-save">' +
    ic("check") +
    (lend ? "Save lending" : "Save loan") +
    "</button>";
  openSheet(lend ? "Lend money" : "Borrowed money", h);
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
    snack("That loan was deleted");
    return;
  }
  const i = loanInfo(l),
    lend = l.kind === "lend",
    pct = i.total ? Math.min(100, Math.round((i.paid / i.total) * 100)) : 0;
  F = {
    kind: "loan",
    id,
    account:
      acc(l.account) && !acc(l.account).archived
        ? l.account
        : (activeAccounts().find(a => a.currency === i.cur) || {}).id,
  };
  const heroLine =
    i.draws.length <= 1
      ? (lend ? "You lent from " : "You borrowed into ") +
        esc((acc(l.account) || {}).name || "?") +
        " · " +
        dayLabel(l.date)
      : esc(i.draws.length + (lend ? " lendings since " : " loans since ") + dayLabel(l.date));
  let h =
    '<div class="hero"><div class="t">' +
    heroLine +
    '</div><div class="v">' +
    esc(money(i.open ? i.left : i.total, i.cur)) +
    "</div>" +
    '<div class="t">' +
    (i.open ? "left of " + esc(money(i.total, i.cur)) + " · " : "") +
    '<span class="st ' +
    i.st +
    '">' +
    esc(stLabel(l, i.st)) +
    "</span></div></div>";
  h += '<div class="bar" aria-label="' + pct + '% paid"><span style="width:' + pct + '%"></span></div>';
  let dueDraw = null;
  if (i.open) {
    dueDraw = i.draws.find(t => t.due === i.nextDue) || i.draws[i.draws.length - 1] || null;
    F.dueDraw = dueDraw ? dueDraw.id : null;
    h +=
      '<div class="card"><h3 id="loan-due">' +
      esc(i.nextDue ? (lend ? "Payback day · " : "Return by · ") + dayLabel(i.nextDue) : "No due date yet") +
      "</h3>" +
      (dueDraw
        ? '<div style="margin-top:10px">' +
          dateField("f-due2", i.nextDue || "", {
            min: today(),
            opt: true,
            none: "Pick a day",
            label: "Change due date",
          }) +
          "</div>"
        : "") +
      "</div>";
    const payAccs = activeAccounts().filter(a => a.currency === i.cur);
    h +=
      '<div class="card"><h3>' +
      (lend ? "Got money back?" : "Paid some back?") +
      '</h3><p class="muted small" style="margin:0">Part of it is fine too.</p>' +
      amtField("f-amt", i.cur, String(i.left)) +
      '<div class="lbl">' +
      (lend ? "Into" : "From") +
      "</div>" +
      accChips("f-acc", F.account, null, payAccs) +
      '<div style="margin-top:12px">' +
      dateField("f-date", today(), { max: today() }) +
      "</div>" +
      '<div class="gap"></div><button class="btn" data-act="loan-pay">' +
      ic("check") +
      "Record payment</button></div>";
  }
  const hist = S.txns.filter(t => t.type === "loan" && t.loan === l.id).sort(byNewest);
  h +=
    '<div class="sec">History</div><div class="list">' +
    hist
      .map(t => {
        const a = acc(t.account);
        const r = runBal()[t.id] || {},
          canDel = !t.principal || i.draws.length > 1,
          more = t.principal
            ? (lend ? "Lent from " : "Borrowed into ") +
              (a ? a.name : "?") +
              " on " +
              dayLabel(t.date) +
              (t.due ? " · due " + dayLabel(t.due) : "")
            : dayLabel(t.date) +
              " · " +
              (lend ? "into " : "from ") +
              (a ? a.name : "?") +
              " · " +
              (r.ls === "cleared"
                ? lend
                  ? "this cleared the lending"
                  : "this cleared the loan"
                : money(r.left || 0, i.cur) + " left after this");
        return (
          '<div class="tx exp" data-act="row-exp">' +
          emblem(t.principal ? LOAN_EMB[l.kind] : { i: "paid", c: "#15a06f" }, "em") +
          '<span class="mid"><div class="d">' +
          esc(t.principal ? (lend ? "Lent" : "Borrowed") : lend ? "Got back" : "Paid back") +
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
          "</span>" +
          '<div class="more">' +
          esc(more) +
          '<div class="medit"><button class="btn text" data-act="loandraw-edit" data-v="' +
          t.id +
          '">' +
          ic("edit") +
          "Edit</button>" +
          (canDel
            ? '<button class="btn text dng" data-act="loanpay-del" data-v="' +
              t.id +
              '">' +
              ic("delete") +
              (t.principal ? "Delete this entry" : "Delete this payment") +
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
      'Reopen · undo last payment</button><div class="gap"></div>';
  if (i.st !== "cleared")
    h +=
      '<button class="btn tonal" data-act="loan-writeoff">' +
      (l.status === "writeoff" ? "Reopen" : lend ? "Write off the rest" : "Mark as forgiven") +
      '</button><div class="gap"></div>';
  h += '<button class="btn danger" data-act="loan-del">Delete ' + (lend ? "lending" : "loan") + "</button>";
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
  h += '<div class="lbl">Account</div>' + accChips("ed-acc", t.account, null, accs);
  h += '<div class="field"><span>Date</span>' + dateField("ed-date", t.date, { max: today() }) + "</div>";
  if (t.principal)
    h +=
      '<div class="field"><span>Due (optional)</span>' +
      dateField("ed-due", t.due || "", { min: t.date, opt: true, none: "No due date" }) +
      "</div>";
  h += '<div class="gap"></div><button class="btn" data-act="loandraw-save">' + ic("check") + "Save</button>";
  openSheet2(t.principal ? (lend ? "Edit lending" : "Edit loan") : "Edit payment", h);
}
function saveLoanDraw() {
  if (!F || !F.editTxn) return;
  const l = loan(F.id);
  if (!l) return;
  const amt = evalAmt(($("#ed-amt") || {}).value);
  if (!(amt > 0)) {
    snack("Enter an amount");
    return;
  }
  const acc2 = F.editAcc;
  if (!acc(acc2)) {
    snack("Pick an account");
    return;
  }
  const dateEl = $("#ed-date"),
    date2 = dateEl ? dateEl.dataset.v : "";
  if (!date2) {
    snack("Pick a date");
    return;
  }
  const dueEl = $("#ed-due"),
    setDue = !!dueEl,
    due2 = dueEl ? dueEl.dataset.v || "" : "";
  if (setDue && due2 && due2 < date2) {
    snack("That date is before the loan itself");
    return;
  }
  const txnId = F.editTxn;
  const mutate = () => {
    const t = S.txns.find(x => x.id === txnId);
    if (!t) return;
    t.amount = amt;
    t.account = acc2;
    t.date = date2;
    if (setDue) t.due = due2;
  };
  guardOverdraw(mutate, date2, () => {
    closeSheet2();
    closeSheet();
    withUndo("Saved", mutate, { row: l.id });
  });
}
function saveLoan() {
  const v = readVals(),
    person = $("#f-person").value.trim(),
    amt = evalAmt(v.amount),
    due = $("#f-due").dataset.v,
    lend = F.lk === "lend";
  if (!person) {
    snack(lend ? "Who did you lend to?" : "Who lent you the money?");
    return;
  }
  if (!(amt > 0)) {
    snack("Enter an amount");
    return;
  }
  if (!acc(F.account)) {
    snack("Pick an account");
    return;
  }
  if (!v.date) {
    snack("Pick a date");
    return;
  }
  if (due && due < v.date) {
    snack("That date is before the loan itself");
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
    else {
      const l2 = loan(l.id);
      if (l2) l2.account = account;
    }
    S.txns.push({
      id: pid,
      ts,
      type: "loan",
      dir: lend ? "out" : "in",
      loan: l.id,
      principal: true,
      amount: amt,
      account,
      date,
      due,
      note,
    });
  };
  guardOverdraw(mutate, date, () => {
    S.settings.lastAcc = account;
    closeSheet();
    withUndo((lend ? "Lent " : "Borrowed ") + money(amt, acct.currency) + (lend ? " to " : " from ") + person, mutate, {
      row: l.id,
    });
    askNotify();
  });
}
function writeOffLoan() {
  const l = loan(F.id);
  if (!l) return;
  const lend = l.kind === "lend",
    back = l.status === "writeoff";
  closeSheet();
  withUndo(back ? "Reopened" : lend ? "Written off" : "Marked as forgiven", () => {
    const x = loan(l.id);
    x.status = back ? "open" : "writeoff";
  });
}
function deleteLoan() {
  const id = F.id;
  closeSheet();
  withUndo("Deleted", () => {
    S.loans = S.loans.filter(l => l.id !== id);
    S.txns = S.txns.filter(t => !(t.type === "loan" && t.loan === id));
  });
}
function payLoan() {
  const l = loan(F.id);
  if (!l) return;
  const i = loanInfo(l),
    v = readVals(),
    amt = evalAmt(v.amount),
    lend = l.kind === "lend";
  if (!(amt > 0)) {
    snack("Enter an amount");
    return;
  }
  if (!acc(F.account)) {
    snack("Pick an account");
    return;
  }
  if (amt > i.left + 0.005) {
    overpay(l, i, amt, F.account, v.date || today());
    return;
  }
  const id = l.id,
    account = F.account,
    date = v.date || today(),
    done = r2(i.left - amt) <= 0,
    pid = newId(),
    ts = Date.now();
  const mutate = () => {
    S.txns.push({
      id: pid,
      ts,
      type: "loan",
      dir: lend ? "in" : "out",
      loan: id,
      amount: amt,
      account,
      date,
      note: "",
    });
  };
  guardOverdraw(mutate, date, () => {
    closeSheet();
    withUndo((lend ? "Got back " : "Paid back ") + money(amt, i.cur) + (done ? " · all cleared" : ""), mutate, {
      row: id,
    });
  });
}
/* someone paid back more than they owed (or you did): clear this one and track the extra as a loan the other way */
function overpay(l, i, amt, account, date) {
  const lend = l.kind === "lend",
    who = loanWho(l),
    extra = r2(amt - i.left),
    cur = i.cur,
    pid = newId(),
    nid = newId(),
    qid = newId(),
    ts = Date.now();
  askDialog(
    lend ? who + " paid " + money(extra, cur) + " more" : "You paid " + money(extra, cur) + " more",
    lend
      ? "Track the extra " + money(extra, cur) + " as a loan from " + who + " (you now owe it)?"
      : "Track the extra " + money(extra, cur) + " as a lending to " + who + " (they owe you)?",
    lend ? "Track as loan" : "Track as lending",
    () => {
      const mutate = () => {
        if (i.left > 0)
          S.txns.push({
            id: pid,
            ts,
            type: "loan",
            dir: lend ? "in" : "out",
            loan: l.id,
            amount: i.left,
            account,
            date,
            note: "",
          });
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
          ts: ts + 1,
          type: "loan",
          dir: lend ? "in" : "out",
          loan: nid,
          principal: true,
          amount: extra,
          account,
          date,
          note: "",
        });
      };
      guardOverdraw(mutate, date, () => {
        closeSheet();
        withUndo(
          lend
            ? who + "’s lending cleared · you owe " + who + " " + money(extra, cur)
            : "Loan cleared · " + who + " owes you " + money(extra, cur),
          mutate,
          { row: nid }
        );
      });
    },
    { cancel: "Go back" }
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
  const la = acc(l.account),
    account = la && !la.archived ? l.account : (activeAccounts().find(a => a.currency === i.cur) || {}).id,
    pid = newId(),
    ts = Date.now();
  const paid = () => {
    if (!account) {
      snack("No account in " + i.cur + " to record it");
      return;
    }
    const mutate = () => {
      S.txns.push({
        id: pid,
        ts,
        type: "loan",
        dir: lend ? "in" : "out",
        loan: id,
        amount: i.left,
        account,
        date: today(),
        note: "",
      });
    };
    guardOverdraw(mutate, today(), () => {
      V.showCleared = true;
      withUndo((lend ? "Got back " : "Paid back ") + money(i.left, i.cur) + " · all cleared", mutate, { row: id });
    });
  };
  const off = () => {
    V.showCleared = true;
    withUndo(
      lend ? "Written off" : "Marked as forgiven",
      () => {
        loan(id).status = "writeoff";
      },
      { row: id }
    );
  };
  askDialog(
    lend ? "Clear " + who + "’s lending?" : "Clear the loan from " + who + "?",
    (lend ? who + " still owes " : "You still owe " + who + " ") + money(i.left, i.cur) + ".",
    lend ? "Got it all back" : "Paid it all back",
    paid,
    { alt: [lend ? "Write it off" : "Mark as forgiven", off] }
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
      (lend ? who + " owes you " : "You owe " + who + " ") + money(i.left, i.cur) + " again",
      () => {
        loan(id).status = "open";
      },
      { row: id }
    );
    buzz(12);
    return;
  }
  if (i.st !== "cleared") return;
  const last = i.pays.slice().sort(byNewest)[0];
  if (!last) return;
  withUndo(
    (lend ? who + " owes you " : "You owe " + who + " ") + money(last.amount, i.cur) + " again",
    () => {
      S.txns = S.txns.filter(t => t.id !== last.id);
      loan(id).status = "open";
    },
    { row: id }
  );
  buzz(12);
}
/* the snooze: move the due date on from whichever is later, the old due date or today */
function extendLoan(l, days) {
  const i = loanInfo(l);
  const t = i.draws.find(d => d.due === i.nextDue) || i.draws[i.draws.length - 1];
  if (!t) return;
  t.due = addDays(t.due && t.due > today() ? t.due : today(), days);
}
