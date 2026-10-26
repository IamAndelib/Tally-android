/*
 * sheets.js — Entry sheets: spending / income, transfer, balance fix, the account sheet and account / category / asset
 * forms, and the entries list.
 */
"use strict";

/* archiving an account that still holds money (or owes it) asks first: its balance leaves the totals */
function setArchived(id, on) {
  const a = acc(id);
  if (!a || a.archived === on) return;
  const go = () =>
    withUndo(
      T(on ? "account.archivedMsg" : "account.backMsg", { name: a.name }),
      () => {
        acc(id).archived = on;
      },
      { row: id }
    );
  const bal = balances()[id] || 0;
  if (!on || Math.abs(bal) < 0.0005) return go();
  askDialog(
    T("account.archiveQ", { name: a.name }),
    T(bal > 0 ? "account.archiveHas" : "account.archiveOwes", { amount: money(Math.abs(bal), a.currency) }),
    T("account.archive"),
    go
  );
  render(); // a dragged row goes back to its place until the answer
}
function assetForm(id) {
  if (!id && !S.settings.cur) return pickMainCur(() => assetForm());
  const x = id
    ? S.assets.find(a => a.id === id)
    : { name: "", e: "", i: "diamond", c: "#a646c9", value: "", currency: S.settings.cur };
  if (!x) return;
  F = { kind: "assetf", id, cur: x.currency, i: x.i || "", e: x.e || "", col: x.c || "#a646c9" };
  let h =
    emblemEditor({ i: F.i, e: F.e, c: F.col }) +
    '<label class="field"><span>' +
    TH("common.name") +
    '</span><input id="f-aname" value="' +
    esc(x.name) +
    '" maxlength="30" placeholder="' +
    TH("asset.example") +
    '"></label>';
  h +=
    '<div class="row"><div class="field"><span>' +
    TH("common.currency") +
    '</span><button class="fieldbtn" id="f-cur" data-act="pick-assetcur"><span>' +
    esc(x.currency) +
    "</span>" +
    ic("down") +
    "</button></div>" +
    '<label class="field"><span>' +
    TH("asset.worth") +
    '</span><input id="f-aval" inputmode="decimal" autocomplete="off" value="' +
    esc(x.value) +
    '" placeholder="0"></label></div>';
  h +=
    '<div class="gap"></div><div class="gap"></div><button class="btn" data-act="asset-save">' +
    TH(id ? "common.save" : "asset.add") +
    "</button>";
  if (id)
    h += '<div class="gap"></div><button class="btn danger" data-act="asset-del">' + TH("common.delete") + "</button>";
  openSheet(T(id ? "asset.edit" : "asset.new"), h);
}
function saveAsset() {
  const name = $("#f-aname").value.trim(),
    raw = $("#f-aval").value.trim(),
    val = raw ? evalAmt(raw) : 0;
  if (!name) {
    snack(T("common.nameIt"));
    return;
  }
  if (val == null) {
    snack(T("asset.notNumber"));
    return;
  }
  const data = { name, i: F.i, e: F.e, c: F.col, value: val, currency: F.cur };
  if (F.id)
    Object.assign(
      S.assets.find(x => x.id === F.id),
      data
    );
  else S.assets.push(Object.assign({ id: newId() }, data));
  closeSheet();
  commit();
}
function deleteAsset() {
  const id = F.id;
  closeSheet();
  withUndo(T("asset.deleted"), () => {
    S.assets = S.assets.filter(x => x.id !== id);
  });
}
/* account chips; addAct: a dashed "Add account" chip at the end */
const accChips = (act, sel, disabled, list, addAct) =>
  '<div class="chips">' +
  (list || activeAccounts())
    .map(
      a =>
        '<button class="chip lead" data-act="' +
        act +
        '" data-v="' +
        a.id +
        '" aria-pressed="' +
        (a.id === sel) +
        '"' +
        (a.id === disabled ? " disabled" : "") +
        ">" +
        chipEmb(accEmb(a)) +
        '<span class="chn" dir="auto">' +
        esc(a.name) +
        "</span></button>"
    )
    .join("") +
  (addAct
    ? '<button class="chip addnew" data-act="' + addAct + '">' + ic("add") + TH("account.add") + "</button>"
    : "") +
  "</div>";
function accChoices(...keep) {
  const l = activeAccounts();
  keep.forEach(id => {
    const k = acc(id);
    if (k && k.archived && !l.includes(k)) l.push(k);
  });
  return l;
}
/* the dashed "Add" tile ending a grid of categories (Settings, the entry form) */
const addTile = (act, v) =>
  '<button class="cat tile-add" data-act="' +
  act +
  '" data-v="' +
  esc(v) +
  '" aria-label="' +
  TH("category.add") +
  '"><span class="ci">' +
  ic("add") +
  '</span><span class="cn">' +
  TH("common.add") +
  "</span></button>";
/* quick add / edit for spending and money in; add: the "Add" tile at the end */
const catBtns = (list, sel, add) =>
  list
    .map(
      c =>
        '<button class="cat" data-act="f-cat" data-v="' +
        esc(c.id) +
        '" aria-pressed="' +
        (c.id === sel) +
        '">' +
        emblem(c, "ci") +
        '<span class="cn" dir="auto">' +
        esc(catName(c)) +
        "</span></button>"
    )
    .join("") + (add ? addTile("f-cat-new", "") : "");
const catChipInner = k => emblem(k, "ci") + esc(catName(k)) + ic("down");
/* who was paid ("Paid to") or who paid ("Received from"), with earlier names offered under it as you type
   (payeeSuggest) */
const payeeField = (inc, v) =>
  '<input id="f-payee" maxlength="40" autocomplete="off" dir="auto" placeholder="' +
  TH(inc ? "entry.receivedFrom" : "entry.paidTo") +
  '" aria-label="' +
  TH(inc ? "entry.receivedFrom" : "entry.paidTo") +
  '" value="' +
  esc(v) +
  '"' +
  (inc ? ' class="payee-in"' : "") +
  ">";
const payeeSug = '<div class="chips" id="f-payee-sug" hidden></div>';
/* every payee written so far, once per name whatever its case or accents (curFold), in its newest spelling: names used
   on this kind of entry first, then newest first. Made at the first letter typed, kept while the form is open. */
function payeeIndex() {
  if (F.payees) return F.payees;
  const by = new Map(), // folded name → its payee
    folded = new Map(); // each spelling folded once (thousands of entries, a few hundred names)
  S.txns.forEach(t => {
    if (!t.payee || t.feeOf || (t.type !== "expense" && t.type !== "income")) return;
    const name = t.payee.trim();
    if (!folded.has(name)) folded.set(name, curFold(name));
    const key = folded.get(name);
    if (!by.has(key)) by.set(key, { key, words: curWords(key), date: "", ts: 0 });
    const p = by.get(key);
    if (t.type === F.type) p.same = true;
    if (cmpDay(t.date, p.date) > 0 || (t.date === p.date && (t.ts || 0) >= p.ts)) {
      p.name = name;
      p.date = t.date;
      p.ts = t.ts || 0;
    }
  });
  return (F.payees = [...by.values()].sort(
    (a, b) => (b.same ? 1 : 0) - (a.same ? 1 : 0) || cmpDay(b.date, a.date) || b.ts - a.ts
  ));
}
/* up to four earlier payees whose name or one of its words starts with what's typed (not one typed out in full) */
function payeeSuggest(q) {
  const el = $("#f-payee-sug"),
    qq = curFold(q.trim());
  if (!el || !F) return;
  const list = qq
    ? payeeIndex()
        .filter(p => p.key !== qq && (p.key.startsWith(qq) || p.words.some(w => w.startsWith(qq))))
        .slice(0, 4)
    : [];
  el.hidden = !list.length;
  el.innerHTML = list
    .map(
      p =>
        '<button class="chip" data-act="f-payee-pick" data-v="' +
        esc(p.name) +
        '"><span class="chn" dir="auto">' +
        esc(p.name) +
        "</span></button>"
    )
    .join("");
}
function pickPayee(name) {
  const el = $("#f-payee");
  if (el) {
    el.value = name;
    el.focus({ preventScroll: true });
  }
  $("#f-payee-sug").hidden = true;
}
/* pre (a new entry made for something else, e.g. an over-repaid lending's extra): {amount, cur, account, date, note,
   also: a change saved with it, msg: the start of its message, back: the loan to go back to} */
/* draft: the form as it was before Add category / Add account (txQuickAdd), filled back in over everything else */
function txSheet(id, type, catId, pre, draft) {
  if (!id && !activeAccounts().length) {
    snack(T("account.addFirst"));
    accForm(null, () => txSheet(id, type, catId, pre));
    return;
  }
  const t = id ? S.txns.find(x => x.id === id) : null;
  if (id && !t) {
    snack(T("entry.gone"));
    return;
  }
  if (t && t.type === "transfer") {
    trSheet(id);
    return;
  }
  if (t && t.type === "adjust") {
    adjSheet(id);
    return;
  }
  if (t && t.type === "loan") {
    loanOpen(t.loan);
    return;
  }
  /* a fee opens what it was charged on: its transfer or its loan */
  if (t && t.feeOf && S.txns.some(x => x.id === t.feeOf)) {
    txSheet(t.feeOf);
    return;
  }
  type = t ? t.type : type;
  const inc = type === "income";
  const last = inc ? S.settings.lastAccIn : S.settings.lastAcc;
  const def = acc(last) && !acc(last).archived ? last : (activeAccounts()[0] || {}).id;
  const d = draft || null;
  F = {
    kind: "tx",
    id,
    type,
    cat: d ? d.cat : t ? t.cat : catId || (inc && !pre ? "income" : null),
    account: d ? d.account : t ? t.account : pre ? pre.account : def,
    pre,
  };
  if (pre && pre.back) BACKTO = { screen: V.screen, open: () => loanOpen(pre.back) };
  const k = F.cat ? cat(F.cat) : null,
    a = acc(F.account);
  let list = inc ? inCats() : outCats();
  if (k && !list.includes(k)) list = list.concat([k]);
  const payee = (d ? d.payee : t ? t.payee : pre ? pre.payee : "") || "";
  let h = "";
  if (inc) h += '<div class="catgrid">' + catBtns(list, F.cat, true) + "</div>" + payeeField(true, payee) + payeeSug;
  else
    h +=
      /* the picked category and who was paid, side by side (the box wraps below when the row is too narrow) */
      '<div class="row catrow" id="f-catrow"' +
      (k ? "" : " hidden") +
      '><button class="catchip" id="f-catchip" data-act="f-showcats" aria-expanded="false">' +
      (k ? catChipInner(k) : "") +
      "</button>" +
      payeeField(false, payee) +
      "</div>" +
      payeeSug +
      '<div class="lbl" id="f-catlbl" style="margin-top:0"' +
      (k ? " hidden" : "") +
      ">" +
      TH("entry.whatFor") +
      "</div>" +
      '<div class="catgrid" id="f-catgrid" style="margin-top:8px"' +
      (k ? " hidden" : "") +
      ">" +
      catBtns(list, F.cat, true) +
      "</div>";
  h += amtField("f-amt", a ? a.currency : "", t ? String(t.amount) : pre ? String(pre.amount) : "", {
    curId: "amt-cur",
  });
  h +=
    '<div class="lbl">' +
    TH(inc ? "entry.into" : "entry.paidFrom") +
    "</div>" +
    accChips(
      "f-acc",
      F.account,
      null,
      accChoices(F.account).filter(x => !pre || x.currency === pre.cur),
      pre ? null : "f-acc-new" // not where only one currency will do: a new account in another wouldn't show
    );
  h +=
    '<div class="row notedate"><input id="f-note" placeholder="' +
    TH("entry.notePh") +
    '" maxlength="80" value="' +
    esc(d ? d.note : t ? t.note : pre ? pre.note : "") +
    '" aria-label="' +
    TH("common.note") +
    '"><div class="nd-date">' +
    dateField("f-date", d ? (d.now ? entryDate() : d.date) : t ? t.date : pre ? pre.date : entryDate(), {
      max: today(),
      now: d ? d.now : !t,
    }) +
    "</div></div>";
  h +=
    '<div class="gap"></div><div class="gap"></div><button class="btn" data-act="tx-save">' +
    ic("check") +
    TH(id ? "common.saveChanges" : "common.save") +
    "</button>";
  if (id)
    h += '<div class="gap"></div><button class="btn danger" data-act="tx-del">' + TH("common.delete") + "</button>";
  openSheet(T(id ? (inc ? "entry.editIn" : "entry.editOut") : inc ? "entry.newIn" : "entry.newOut"), h);
  if (d) $("#f-amt").value = d.amt; // as it was shown (grouped the phone's way, or a sum like 12+3)
  if (!id && F.cat) focusAmt();
}
/* Add category / Add account from the entry form: the same form as in Settings, then back to the entry with all of it
   as it was and the new one picked; closed without saving, back to the entry as it was */
function txDraft() {
  if (CALC && CALC.id === "f-amt") calcClose("f-amt", calcToggleBtn("f-amt")); // its sum, worked out
  const val = s => ($(s) || {}).value || "",
    dt = $("#f-date");
  return {
    id: F.id,
    type: F.type,
    cat: F.cat,
    account: F.account,
    pre: F.pre,
    amt: val("#f-amt"),
    note: val("#f-note"),
    payee: val("#f-payee"),
    date: dt ? dt.dataset.v : "",
    now: !!(dt && dt.dataset.now),
    back: BACKTO,
  };
}
function txQuickAdd(what) {
  const inc = F.type === "income";
  if (what === "cat" && !inc && outCats().length >= 24) return snack(T("category.max", { count: 24 }));
  const dr = txDraft();
  let back = false; // once only: saved (then) or closed (BACKTO), never both
  const reopen = patch => {
    if (back) return;
    back = true;
    sheetSwap = true;
    txSheet(dr.id, dr.type, null, dr.pre, Object.assign({}, dr, patch));
    BACKTO = dr.back; // the entries list or loan this entry came from stays the way back
  };
  BACKTO = { screen: V.screen, open: () => reopen() }; // closed without saving: ✕, Back, a tap outside
  sheetSwap = true;
  if (what === "cat") catForm(null, inc ? "in" : "out", id => reopen({ cat: id }));
  else accForm(null, id => reopen({ account: id }));
}
/* an entry row tapped in a list; from the entries sheet, closing the entry goes back to that list */
function openEntry(id) {
  const scroll = ($("#sheet .p") || {}).scrollTop || 0;
  BACKTO = $("#sheet #ent-list")
    ? {
        screen: V.screen,
        open: () => {
          entriesSheet();
          const p = $("#sheet .p");
          if (p) p.scrollTop = scroll;
        },
      }
    : null;
  txSheet(id);
}
function pickCat(id) {
  F.cat = id;
  setPressed("f-cat", id);
  if (F.type === "income") return;
  const chip = $("#f-catchip");
  chip.innerHTML = catChipInner(cat(id));
  $("#f-catrow").hidden = false;
  chip.setAttribute("aria-expanded", "false");
  $("#f-catgrid").hidden = true;
  $("#f-catlbl").hidden = true;
  focusAmt();
}
/* account chips in the entry and loan forms; the amount's currency label follows the account */
function pickAccount(id) {
  F.account = id;
  setPressed("f-acc", id);
  const c = $("#amt-cur");
  if (c) c.textContent = acc(id).currency;
  if (F.kind !== "loanf") return;
  if (F.merge) {
    const ml = loan(F.merge);
    if (!ml || loanInfo(ml).cur !== acc(id).currency) F.merge = null;
  }
  personSuggest(($("#f-person") || {}).value || "");
  mergeHint();
}
function readVals() {
  const g = id => {
    const el = $("#" + id);
    return el ? (el.tagName === "INPUT" ? el.value : el.dataset.v) : undefined;
  };
  return {
    amount: g("f-amt"),
    note: g("f-note"),
    payee: g("f-payee"),
    date: g("f-date"),
    toAmount: g("f-toamt"),
    fee: g("f-fee"),
  };
}
/* the optional fee of a transfer or a loan payment: a field behind "Add a fee" (its label can be set later) */
const feeField = (open, value, label, add) =>
  '<label class="field" id="fee-wrap"' +
  (open ? "" : " hidden") +
  '><span id="fee-lbl">' +
  esc(label) +
  '</span><input id="f-fee" inputmode="decimal" autocomplete="off" placeholder="0" value="' +
  esc(value) +
  '"></label><button class="btn text" id="fee-btn" data-act="add-fee" style="width:auto;margin-top:6px;padding:0 12px"' +
  (open ? " hidden" : "") +
  ">" +
  ic("add") +
  esc(add) +
  "</button>";
/* transfer between own accounts, with optional fee */
function trSheet(id) {
  const act = activeAccounts();
  if (!id && act.length < 2) {
    snack(T("transfer.needTwo"));
    accForm(null, () => trSheet());
    return;
  }
  const t = id ? S.txns.find(x => x.id === id) : null;
  const fee = t && t.feeId ? S.txns.find(x => x.id === t.feeId) : null;
  const f = t ? t.account : (act[0] || {}).id;
  const to = t ? t.to : (act.find(a => a.id !== f) || {}).id;
  F = { kind: "tr", id, from: f, to, showFee: !!fee };
  const list = accChoices(f, to);
  let h =
    '<div class="lbl" style="margin-top:4px">' +
    TH("transfer.from") +
    "</div>" +
    accChips("tr-from", F.from, null, list);
  h +=
    '<div style="display:flex;justify-content:center;margin:4px 0 -8px"><button class="icon" data-act="tr-swap" aria-label="' +
    TH("transfer.swap") +
    '">' +
    ic("swapv") +
    "</button></div>";
  h += '<div class="lbl">' + TH("transfer.to") + "</div>" + accChips("tr-to", F.to, F.from, list);
  h += amtField("f-amt", "", t ? String(t.amount) : "", { curId: "tr-cur", label: T("transfer.sent") });
  h +=
    '<label class="field" id="recv-wrap" hidden><span id="recv-lbl"></span><input id="f-toamt" inputmode="decimal" autocomplete="off" placeholder="0" value="' +
    esc(t && t.toAmount != null ? String(t.toAmount) : "") +
    '"></label>';
  h += feeField(F.showFee, fee ? String(fee.amount) : "", "", T("transfer.addFee"));
  h += '<div class="preview" id="tr-prev"></div>';
  h +=
    '<div class="row notedate"><input id="f-note" placeholder="' +
    TH("entry.notePh") +
    '" maxlength="80" value="' +
    esc(t ? t.note : "") +
    '" aria-label="' +
    TH("common.note") +
    '"><div class="nd-date">' +
    dateField("f-date", t ? t.date : entryDate(), { max: today(), now: !t }) +
    "</div></div>";
  h +=
    '<div class="gap"></div><div class="gap"></div><button class="btn" data-act="tr-save">' +
    ic("check") +
    TH(id ? "common.saveChanges" : "transfer.ok") +
    "</button>";
  if (id)
    h += '<div class="gap"></div><button class="btn danger" data-act="tr-del">' + TH("common.delete") + "</button>";
  openSheet(T(id ? "transfer.edit" : "transfer.title"), h);
  trSync();
  if (!id) focusAmt();
}
/* reflect From/To in the open transfer sheet: chips, currencies, received-amount field, preview */
function trPickFrom(id) {
  F.from = id;
  if (F.to === id)
    F.to = [...$("#sheet").querySelectorAll('[data-act="tr-to"]')].map(b => b.dataset.v).find(x => x !== id);
  trSync();
}
function trSync() {
  const fa = acc(F.from),
    ta = acc(F.to),
    diff = !!(fa && ta && fa.currency !== ta.currency);
  setPressed("tr-from", F.from);
  $("#sheet")
    .querySelectorAll('[data-act="tr-to"]')
    .forEach(b => {
      b.setAttribute("aria-pressed", b.dataset.v === F.to);
      b.disabled = b.dataset.v === F.from;
    });
  $("#tr-cur").textContent = fa ? fa.currency : "";
  $("#recv-wrap").hidden = !diff;
  if (diff) $("#recv-lbl").textContent = T("transfer.arrived", { account: ta.name, cur: ta.currency });
  $("#fee-lbl").textContent = T("fee.label", { cur: fa ? fa.currency : "" });
  trPreview();
}
function trPreview() {
  const el = $("#tr-prev");
  if (!el) return;
  const fa = acc(F.from),
    ta = acc(F.to);
  if (!fa || !ta) {
    el.textContent = "";
    return;
  }
  const v = readVals(),
    amt = evalAmt(v.amount),
    fee = F.showFee ? evalAmt(v.fee) : 0;
  if (!amt || amt <= 0) {
    el.textContent = "";
    return;
  }
  const diff = fa.currency !== ta.currency,
    got = diff ? evalAmt(v.toAmount) : amt;
  let s =
    fa.name +
    " " +
    signed(-(amt + (fee > 0 ? fee : 0)), fa.currency) +
    "  →  " +
    ta.name +
    " " +
    (got > 0 ? signed(got, ta.currency) : "+ ?");
  if (fee > 0) s += "  " + T("transfer.inclFee", { amount: money(fee, fa.currency) });
  el.textContent = s;
}
/* view / delete a balance fix */
function adjSheet(id) {
  const t = S.txns.find(x => x.id === id);
  if (!t) return;
  const a = acc(t.account);
  F = { kind: "adj", id };
  openSheet(
    T("fix.title"),
    '<div class="hero"><div class="t">' +
      esc((a ? a.name : "?") + " · " + dayLabel(t.date)) +
      '</div><div class="v">' +
      esc(signed(t.amount, a ? a.currency : "")) +
      "</div></div>" +
      '<p class="muted small" style="text-align:center">' +
      TH("fix.about") +
      "</p>" +
      '<button class="btn danger" data-act="adj-del">' +
      TH("fix.delete") +
      "</button>"
  );
}
/* account: live balance, set actual balance, transfer, edit */
function accOpen(id) {
  const a = acc(id);
  if (!a) return;
  const bal = balances()[id],
    start = balances(today())[id];
  F = { kind: "acc", id };
  let h =
    '<div class="hero">' +
    emblem(accEmb(a), "cprev") +
    '<div class="t">' +
    esc(typeName(a.type)) +
    " · " +
    esc(a.currency) +
    (a.archived ? " · " + TH("account.archivedTag") : "") +
    '</div><div class="v">' +
    esc(money(bal, a.currency)) +
    "</div>" +
    (start !== bal
      ? '<div class="t">' + TH("account.startedWith", { amount: money(start, a.currency) }) + "</div>"
      : "") +
    "</div>";
  h +=
    '<div class="card"><h3>' +
    TH("account.mismatch") +
    '</h3><p class="muted small" style="margin:0">' +
    TH("account.mismatchHint") +
    "</p>" +
    amtField("f-actual", a.currency, "", { label: T("account.actual"), placeholder: groupDigits(rnd(bal)) }) +
    '<div class="preview" id="fix-prev"></div><div class="gap"></div><button class="btn" data-act="fix-save">' +
    TH("account.update") +
    "</button></div>";
  h +=
    '<div class="gap"></div><div class="row">' +
    (a.archived
      ? '<button class="btn tonal" data-act="acc-unarch">' + ic("reset") + TH("account.unarchive") + "</button>"
      : '<button class="btn tonal" data-act="acc-arch">' + ic("archive") + TH("account.archive") + "</button>") +
    '<button class="btn tonal" data-act="hist-acc" data-v="' +
    a.id +
    '">' +
    ic("list") +
    TH("common.history") +
    "</button></div>";
  h +=
    '<div class="gap"></div><button class="btn text" data-act="acc-form" data-v="' +
    a.id +
    '">' +
    ic("edit") +
    TH("account.edit") +
    "</button>";
  openSheet(a.name, h);
}
/* "Set actual balance": records the difference as a balance fix dated today */
function saveFix() {
  const a = acc(F.id),
    val = evalAmt($("#f-actual").value);
  if (val == null) {
    snack(T("account.typeNow"));
    return;
  }
  const d = rnd(val - balances()[F.id]);
  if (shown(d, a.currency) === 0) {
    snack(T("account.matches"));
    return;
  }
  const id = F.id,
    xid = newId(),
    ts = Date.now(),
    mutate = () => {
      S.txns.push({ id: xid, ts, type: "adjust", amount: d, account: id, date: today(), note: "" });
    };
  guardOverdraw(mutate, today(), () => {
    closeSheet();
    withUndo(T("account.setTo", { name: a.name, amount: money(val, a.currency) }), mutate, { row: id });
  });
}
function fixPreview() {
  const el = $("#fix-prev");
  if (!el || !F || F.kind !== "acc") return;
  const a = acc(F.id),
    v = evalAmt($("#f-actual").value);
  if (v == null) {
    el.textContent = "";
    return;
  }
  const d = rnd(v - balances()[F.id]);
  el.textContent =
    shown(d, a.currency) === 0
      ? T("account.matchesFull")
      : T(d > 0 ? "account.fixAdds" : "account.fixRemoves", { amount: money(Math.abs(d), a.currency) });
}
/* the main currency: from Settings and the welcome card, and asked first when a new notebook's first account or
   asset is added before one was chosen */
function pickMainCur(next) {
  curPicker(
    S.settings.cur,
    c => {
      S.settings.cur = c;
      V.cur = null;
      commit();
      if (next) next();
    },
    T(S.settings.cur ? "settings.mainCur" : "welcome.yourCur")
  );
}
/* then: what to go on with once a new account is saved (the entry, transfer or loan that needed it) */
function accForm(id, then) {
  if (!id && !S.settings.cur) return pickMainCur(() => accForm(id, then));
  const a = id ? acc(id) : { name: "", type: firstType(), currency: S.settings.cur, opening: "" };
  const used = id && S.txns.some(t => t.account === id || t.to === id);
  F = {
    kind: "accf",
    id,
    type: a.type,
    cur: a.currency,
    i: a.i || "",
    e: a.e || "",
    col: a.c || typeCol(a.type),
    iSet: !!(a.i || a.e),
    cSet: !!a.c,
    then,
  };
  if (!F.i && !F.e) F.i = typeIcon(a.type);
  let h =
    emblemEditor({ i: F.i, e: F.e, c: F.col }) +
    '<label class="field"><span>' +
    TH("common.name") +
    '</span><input id="f-name" value="' +
    esc(a.name) +
    '" placeholder="' +
    TH("account.example") +
    '" maxlength="30"></label>';
  h +=
    '<div class="lbl">' +
    TH("account.type") +
    '</div><div class="chips" id="f-types">' +
    visTypes(a.type)
      .map(k => typeChip(k, a.type))
      .join("") +
    '<button class="chip addnew" data-act="type-new">' +
    ic("add") +
    TH("type.addNew") +
    "</button></div>";
  h +=
    '<div class="row"><div class="field"><span>' +
    TH("common.currency") +
    '</span><button class="fieldbtn" id="f-cur" data-act="pick-acccur"' +
    (used ? " disabled" : "") +
    "><span>" +
    esc(a.currency) +
    "</span>" +
    ic("down") +
    "</button></div>" +
    '<label class="field"><span>' +
    TH(id ? "account.opening" : "account.balanceNow") +
    '</span><input id="f-open" inputmode="decimal" autocomplete="off" value="' +
    esc(a.opening === "" ? "" : a.opening) +
    '" placeholder="0"></label></div>';
  h +=
    '<p class="hint">' +
    TH(id ? "account.openingHint" : "account.cardHint") +
    (used ? " " + TH("account.curLocked") : "") +
    "</p>";
  h +=
    '<div class="gap"></div><button class="btn" data-act="acc-save">' +
    TH(id ? "common.save" : "account.add") +
    "</button>";
  if (id) {
    if (!used)
      h += '<div class="gap"></div><button class="btn danger" data-act="acc-del">' + TH("account.delete") + "</button>";
  }
  openSheet(T(id ? "account.edit" : "account.new"), h);
}
function saveAccount() {
  const name = $("#f-name").value.trim();
  if (!name) {
    snack(T("account.nameIt"));
    return;
  }
  const raw = $("#f-open").value.trim(),
    o = raw ? evalAmt(raw) : 0;
  if (o == null) {
    snack(T("account.notNumber"));
    return;
  }
  const data = {
      name,
      type: F.type,
      currency: F.cur,
      opening: o,
      i: F.iSet ? F.i : "",
      e: F.iSet ? F.e : "",
      c: F.cSet ? F.col : "",
    },
    was = F.id,
    then = F.then;
  const go = () => {
    const first = !activeAccounts().length;
    const nid = newId();
    if (was) Object.assign(acc(was), data);
    else S.accounts.push(Object.assign({ id: nid, archived: false }, data));
    if (first) S.settings.lastCheck = today(); // its balance was just typed: no "do they still match?" today
    closeSheet();
    commit();
    if (first) scrollTo(0, 0); // the welcome page was scrolled: Home starts at its top
    snack(was ? T("account.saved") : T("account.added", { name }));
    if (!was && then) then(nid);
  };
  if (o < 0 && data.type !== "card" && !(was && acc(was).opening === o))
    askDialog(
      T("account.belowZero"),
      T("account.belowZeroQ", { name, amount: signed(o, data.currency) }),
      T("common.saveAnyway"),
      go,
      { cancel: T("common.goBack") }
    );
  else go();
}
/* only accounts without entries can be deleted (deleting would change other balances through transfers); the rest are archived */
function deleteAccount() {
  const id = F.id;
  if (S.txns.some(t => t.account === id || t.to === id)) return;
  askDialog(
    T("account.deleteQ"),
    T("account.deleteBody"),
    T("common.delete"),
    () => {
      S.accounts = S.accounts.filter(a => a.id !== id);
      closeSheet();
      commit();
      snack(T("account.deleted"));
    },
    { danger: true }
  );
}
/* then: after a new one is saved, gets its id (the entry form's Add, txQuickAdd) */
function catForm(id, kind, then) {
  const used = new Set(S.cats.map(x => String(x.c).toLowerCase())),
    free = PALETTE.find(x => !used.has(x)) || PALETTE[S.cats.length % PALETTE.length];
  const c = id
    ? S.cats.find(x => x.id === id)
    : { name: "", e: "🏷️", i: "label", c: free, kind: kind === "in" ? "in" : "out" };
  if (!c) return;
  F = { kind: "catf", id, ck: c.kind, col: c.c, i: c.i || "", e: c.e, then };
  let h = emblemEditor(c);
  h +=
    '<label class="field"><span>' +
    TH("common.name") +
    '</span><input id="f-cname" value="' +
    esc(catName(c)) +
    '" maxlength="16" placeholder="' +
    TH(c.kind === "in" ? "category.exampleIn" : "category.exampleOut") +
    '"></label>';
  h +=
    '<div class="gap"></div><div class="gap"></div><button class="btn" data-act="cat-save">' +
    TH(id ? "common.save" : "category.add") +
    "</button>";
  if (id)
    h +=
      '<div class="gap"></div><button class="btn danger" data-act="cat-del">' +
      TH(c.hidden ? "category.bringBack" : "common.remove") +
      "</button>";
  openSheet(T(id ? "category.edit" : c.kind === "in" ? "category.newIn" : "category.newOut"), h);
}
function saveCat() {
  const name = $("#f-cname").value.trim(),
    e = F.e || "🏷️",
    i = F.i,
    then = F.then; // read before closeSheet() clears F
  let added = null;
  if (!name) {
    snack(T("common.nameIt"));
    return;
  }
  if (F.id) {
    const c = S.cats.find(x => x.id === F.id),
      d = CATS.find(x => x.id === F.id);
    /* a built-in name left as shown keeps its English default, so it goes on following Tally's language */
    const keep = d && c.name === d.name && name === catName(c);
    Object.assign(c, { name: keep ? c.name : name, e, i, c: F.col });
  } else {
    const c = { id: "c" + newId(), name, e, i, c: F.col, kind: F.ck };
    const lastVis = S.cats.map(x => x.kind === F.ck && !x.hidden).lastIndexOf(true);
    S.cats.splice(lastVis + 1, 0, c);
    added = c.id;
  }
  closeSheet();
  commit();
  if (added && then) then(added);
}
/* built-in categories and ones with entries are hidden (old entries keep their emblem); unused custom ones are deleted */
function removeCat() {
  const c = S.cats.find(x => x.id === F.id);
  if (!c) return;
  if (c.hidden) {
    c.hidden = false;
    closeSheet();
    commit();
    snack(T("category.back", { name: catName(c) }));
    return;
  }
  if (S.cats.filter(x => x.kind === c.kind && !x.hidden).length <= 1) {
    snack(T("category.keepOne"));
    return;
  }
  if (CATS.some(d => d.id === c.id) || S.txns.some(t => t.cat === c.id)) c.hidden = true;
  else S.cats = S.cats.filter(x => x !== c);
  closeSheet();
  commit();
  snack(T("category.removed", { name: catName(c) }));
}
/* a hidden category's "bring back" chip in Settings */
function restoreCat(id) {
  const c = S.cats.find(x => x.id === id);
  if (!c) return;
  if (c.kind === "out" && outCats().length >= 24) {
    snack(T("category.max", { count: 24 }));
    return;
  }
  c.hidden = false;
  commit();
  snack(T("category.back", { name: catName(c) }));
}
function entriesSheet() {
  RBC = null;
  const list = periodTxns().sort(byNewest);
  openSheet(
    periodLabel(),
    '<div id="ent-list"></div>' +
      (list.length ? dayGroups(list) : '<div class="empty">' + TH("home.nothingYet") + "</div>") +
      '<div class="gap"></div><button class="btn text" data-act="go" data-v="history">' +
      TH("entries.fullHistory") +
      "</button>"
  );
}
function saveTx() {
  const v = readVals(),
    amt = evalAmt(v.amount);
  if (!F.cat) {
    snack(T("entry.pickCat"));
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
  if (F.id && !S.txns.some(x => x.id === F.id)) {
    closeSheet();
    snack(T("entry.gone"));
    return;
  }
  const t = { type: F.type, amount: amt, account: F.account, cat: F.cat, date: v.date, note: (v.note || "").trim() },
    payee = (v.payee || "").trim().slice(0, 40);
  if (payee) t.payee = payee;
  const id = F.id,
    pre = F.pre || {},
    nid = newId(),
    ts = Date.now();
  const mutate = id
    ? () => {
        const old = S.txns.find(x => x.id === id);
        Object.assign(old, t);
        if (!payee) delete old.payee; // cleared
      }
    : () => {
        if (pre.also) pre.also();
        S.txns.push(Object.assign({ id: nid, ts }, t));
      };
  guardOverdraw(mutate, t.date, () => {
    if (pre.back) BACKTO = null; // saved: it ends here, like a payment (back to the loan is for closing it unsaved)
    // the account to offer next time, once saved (not when Go back answers the overdraw question)
    if (t.type === "income") S.settings.lastAccIn = t.account;
    else S.settings.lastAcc = t.account;
    closeSheet();
    buzz("confirm");
    withUndo(
      id
        ? T("common.saved")
        : (pre.msg || "") +
            signed(t.type === "income" ? amt : -amt, acc(t.account).currency) +
            " · " +
            catName(cat(t.cat)),
      mutate,
      { row: id || nid, cat: t.cat }
    );
  });
}
function saveTr() {
  const v = readVals(),
    fa = acc(F.from),
    ta = acc(F.to);
  if (!fa || !ta) {
    snack(T("transfer.pickBoth"));
    return;
  }
  if (F.from === F.to) {
    snack(T("transfer.pickTwo"));
    return;
  }
  const amt = evalAmt(v.amount);
  if (!(shown(amt, fa.currency) > 0)) {
    snack(T("transfer.enterSent"));
    return;
  }
  const diff = fa.currency !== ta.currency;
  let got = null;
  if (diff) {
    got = evalAmt(v.toAmount);
    if (!(shown(got, ta.currency) > 0)) {
      snack(T("transfer.enterArrived", { cur: ta.currency }));
      return;
    }
  }
  const feeText = F.showFee ? String(v.fee || "").trim() : "",
    fee = feeText ? evalAmt(feeText) : 0;
  if (fee == null) {
    snack(T("fee.notNumber"));
    return;
  }
  if (fee < 0) {
    snack(T("transfer.feeNegative"));
    return;
  }
  if (!v.date) {
    snack(T("common.pickDate"));
    return;
  }
  const id = F.id,
    from = F.from,
    to = F.to,
    date = v.date,
    note = (v.note || "").trim(),
    nid = newId(),
    fid = newId(),
    ts = Date.now();
  const mutate = () => {
    let t = id ? S.txns.find(x => x.id === id) : null;
    if (!t) {
      t = { id: nid, ts };
      S.txns.push(t);
    }
    const oldFee = t.feeId ? S.txns.find(x => x.id === t.feeId) : null;
    Object.assign(t, { type: "transfer", amount: amt, account: from, to, date, note });
    if (diff) t.toAmount = got;
    else delete t.toAmount;
    if (fee > 0) {
      const f = oldFee || { id: fid, ts: (t.ts || ts) + 1 }; // just after its transfer, as balances see them
      if (!oldFee) S.txns.push(f);
      Object.assign(f, {
        type: "expense",
        amount: rnd(fee),
        account: from,
        cat: "fees",
        date,
        note: "",
        feeOf: t.id,
      });
      t.feeId = f.id;
    } else {
      if (oldFee) S.txns = S.txns.filter(x => x !== oldFee);
      delete t.feeId;
    }
  };
  guardOverdraw(mutate, date, () => {
    closeSheet();
    withUndo(
      id ? T("common.saved") : T("transfer.done", { amount: money(amt, fa.currency), account: ta.name }),
      mutate,
      {
        row: id || nid,
      }
    );
  });
}
