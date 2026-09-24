/*
 * sheets.js — Entry sheets: spending / income, transfer, balance fix, the account sheet and account / category / asset
 * forms, and the entries list.
 */
"use strict";

function setArchived(id, on) {
  const a = acc(id);
  if (!a || a.archived === on) return;
  withUndo(
    on ? a.name + " archived" : a.name + " is back",
    () => {
      acc(id).archived = on;
    },
    { row: id }
  );
}
function assetForm(id) {
  const x = id
    ? S.assets.find(a => a.id === id)
    : { name: "", e: "", i: "diamond", c: "#a646c9", value: "", currency: S.settings.cur };
  if (!x) return;
  F = { kind: "assetf", id, cur: x.currency, i: x.i || "", e: x.e || "", col: x.c || "#a646c9" };
  let h =
    emblemEditor({ i: F.i, e: F.e, c: F.col }) +
    '<label class="field"><span>Name</span><input id="f-aname" value="' +
    esc(x.name) +
    '" maxlength="30" placeholder="e.g. Gold ring"></label>';
  h +=
    '<div class="row"><div class="field"><span>Currency</span><button class="fieldbtn" id="f-cur" data-act="pick-assetcur"><span>' +
    esc(x.currency) +
    "</span>" +
    ic("down") +
    "</button></div>" +
    '<label class="field"><span>Worth about</span><input id="f-aval" inputmode="decimal" autocomplete="off" value="' +
    esc(x.value) +
    '" placeholder="0"></label></div>';
  h +=
    '<div class="gap"></div><div class="gap"></div><button class="btn" data-act="asset-save">' +
    (id ? "Save" : "Add asset") +
    "</button>";
  if (id) h += '<div class="gap"></div><button class="btn danger" data-act="asset-del">Delete</button>';
  openSheet(id ? "Edit asset" : "New asset", h);
}
function saveAsset() {
  const name = $("#f-aname").value.trim(),
    raw = $("#f-aval").value.trim(),
    val = raw ? evalAmt(raw) : 0;
  if (!name) {
    snack("Give it a name");
    return;
  }
  if (val == null) {
    snack("That value isn't a number");
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
  S.assets = S.assets.filter(x => x.id !== id);
  commit();
  snack("Asset deleted");
}
const accChips = (act, sel, disabled, list) =>
  '<div class="chips">' +
  (list || activeAccounts())
    .map(
      a =>
        '<button class="chip" data-act="' +
        act +
        '" data-v="' +
        a.id +
        '" aria-pressed="' +
        (a.id === sel) +
        '"' +
        (a.id === disabled ? " disabled" : "") +
        ">" +
        emblem(accEmb(a), "sm") +
        esc(a.name) +
        "</button>"
    )
    .join("") +
  "</div>";
function accChoices(...keep) {
  const l = activeAccounts();
  keep.forEach(id => {
    const k = acc(id);
    if (k && k.archived && !l.includes(k)) l.push(k);
  });
  return l;
}
/* quick add / edit for spending and money in */
const catBtns = (list, sel) =>
  list
    .map(
      c =>
        '<button class="cat" data-act="f-cat" data-v="' +
        esc(c.id) +
        '" aria-pressed="' +
        (c.id === sel) +
        '">' +
        emblem(c, "ci") +
        '<span class="cn">' +
        esc(c.name) +
        "</span></button>"
    )
    .join("");
const catChipInner = k => emblem(k, "ci") + esc(k.name) + ic("down");
function txSheet(id, type, catId) {
  if (!id && !activeAccounts().length) {
    snack("Add an account first");
    accForm();
    return;
  }
  const t = id ? S.txns.find(x => x.id === id) : null;
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
  if (t && t.feeOf && S.txns.some(x => x.id === t.feeOf)) {
    trSheet(t.feeOf);
    return;
  }
  type = t ? t.type : type;
  const inc = type === "income";
  const last = inc ? S.settings.lastAccIn : S.settings.lastAcc;
  const def = acc(last) && !acc(last).archived ? last : (activeAccounts()[0] || {}).id;
  F = { kind: "tx", id, type, cat: t ? t.cat : catId || (inc ? "income" : null), account: t ? t.account : def };
  const k = F.cat ? cat(F.cat) : null,
    a = acc(F.account);
  let list = inc ? inCats() : outCats();
  if (k && !list.includes(k)) list = list.concat([k]);
  let h = "";
  if (inc) h += '<div class="catgrid">' + catBtns(list, F.cat) + "</div>";
  else
    h +=
      '<button class="catchip" id="f-catchip" data-act="f-showcats" aria-expanded="false"' +
      (k ? "" : " hidden") +
      ">" +
      (k ? catChipInner(k) : "") +
      "</button>" +
      '<div class="lbl" id="f-catlbl" style="margin-top:0"' +
      (k ? " hidden" : "") +
      ">What was it for?</div>" +
      '<div class="catgrid" id="f-catgrid" style="margin-top:8px"' +
      (k ? " hidden" : "") +
      ">" +
      catBtns(list, F.cat) +
      "</div>";
  h += amtField("f-amt", a ? a.currency : "", t ? String(t.amount) : "", { curId: "amt-cur" });
  h +=
    '<div class="lbl">' +
    (inc ? "Into" : "Paid from") +
    "</div>" +
    accChips("f-acc", F.account, null, accChoices(F.account));
  h +=
    '<div class="row" style="margin-top:12px"><input id="f-note" placeholder="Note (optional)" maxlength="80" value="' +
    esc(t ? t.note : "") +
    '" aria-label="Note"><div style="flex:0 0 150px">' +
    dateField("f-date", t ? t.date : entryDate(), { max: today() }) +
    "</div></div>";
  h +=
    '<div class="gap"></div><div class="gap"></div><button class="btn" data-act="tx-save">' +
    ic("check") +
    (id ? "Save changes" : "Save") +
    "</button>";
  if (id) h += '<div class="gap"></div><button class="btn danger" data-act="tx-del">Delete</button>';
  openSheet(id ? (inc ? "Edit money in" : "Edit spending") : inc ? "Money in" : "Spent", h);
  if (!id && F.cat) focusAmt();
}
/* an entry row tapped in a list; from the entries sheet, closing the entry goes back to that list */
function openEntry(id) {
  BACKTO = $("#sheet #ent-list") ? { screen: V.screen, scroll: ($("#sheet .p") || {}).scrollTop || 0 } : null;
  txSheet(id);
}
function pickCat(id) {
  F.cat = id;
  setPressed("f-cat", id);
  if (F.type === "income") return;
  const chip = $("#f-catchip");
  chip.innerHTML = catChipInner(cat(id));
  chip.hidden = false;
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
  return { amount: g("f-amt"), note: g("f-note"), date: g("f-date"), toAmount: g("f-toamt"), fee: g("f-fee") };
}
/* transfer between own accounts, with optional fee */
function trSheet(id, from) {
  const act = activeAccounts();
  if (!id && act.length < 2) {
    snack("Add a second account to transfer");
    accForm();
    return;
  }
  const t = id ? S.txns.find(x => x.id === id) : null;
  const fee = t && t.feeId ? S.txns.find(x => x.id === t.feeId) : null;
  const f = t ? t.account : from || (act[0] || {}).id;
  const to = t ? t.to : (act.find(a => a.id !== f) || {}).id;
  F = { kind: "tr", id, from: f, to, showFee: !!fee };
  const list = accChoices(f, to);
  let h = '<div class="lbl" style="margin-top:4px">From</div>' + accChips("tr-from", F.from, null, list);
  h +=
    '<div style="display:flex;justify-content:center;margin:4px 0 -8px"><button class="icon" data-act="tr-swap" aria-label="Swap from and to">' +
    ic("swapv") +
    "</button></div>";
  h += '<div class="lbl">To</div>' + accChips("tr-to", F.to, F.from, list);
  h += amtField("f-amt", "", t ? String(t.amount) : "", { curId: "tr-cur", label: "Amount sent" });
  h +=
    '<label class="field" id="recv-wrap" hidden><span id="recv-lbl"></span><input id="f-toamt" inputmode="decimal" autocomplete="off" placeholder="0" value="' +
    esc(t && t.toAmount != null ? String(t.toAmount) : "") +
    '"></label>';
  h +=
    '<label class="field" id="fee-wrap"' +
    (F.showFee ? "" : " hidden") +
    '><span id="fee-lbl"></span><input id="f-fee" inputmode="decimal" autocomplete="off" placeholder="0" value="' +
    esc(fee ? String(fee.amount) : "") +
    '"></label>';
  h +=
    '<button class="btn text" id="fee-btn" data-act="tr-fee" style="width:auto;margin-top:6px;padding:0 12px"' +
    (F.showFee ? " hidden" : "") +
    ">" +
    ic("add") +
    "Add a fee (ATM, cash-out)</button>";
  h += '<div class="preview" id="tr-prev"></div>';
  h +=
    '<div class="row" style="margin-top:12px"><input id="f-note" placeholder="Note (optional)" maxlength="80" value="' +
    esc(t ? t.note : "") +
    '" aria-label="Note"><div style="flex:0 0 150px">' +
    dateField("f-date", t ? t.date : entryDate(), { max: today() }) +
    "</div></div>";
  h +=
    '<div class="gap"></div><div class="gap"></div><button class="btn" data-act="tr-save">' +
    ic("check") +
    (id ? "Save changes" : "Transfer") +
    "</button>";
  if (id) h += '<div class="gap"></div><button class="btn danger" data-act="tr-del">Delete</button>';
  openSheet(id ? "Edit transfer" : "Transfer", h);
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
  if (diff) $("#recv-lbl").textContent = "Amount that arrived in " + ta.name + " (" + ta.currency + ")";
  $("#fee-lbl").textContent = "Fee charged (" + (fa ? fa.currency : "") + ") · counted as spending";
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
    " −" +
    money(amt + (fee > 0 ? fee : 0), fa.currency) +
    "  →  " +
    ta.name +
    " " +
    (got > 0 ? "+" + money(got, ta.currency) : "+ ?");
  if (fee > 0) s += "  (incl. " + money(fee, fa.currency) + " fee)";
  el.textContent = s;
}
/* view / delete a balance fix */
function adjSheet(id) {
  const t = S.txns.find(x => x.id === id);
  if (!t) return;
  const a = acc(t.account);
  F = { kind: "adj", id };
  openSheet(
    "Balance fix",
    '<div class="hero"><div class="t">' +
      esc((a ? a.name : "?") + " · " + dayLabel(t.date)) +
      '</div><div class="v">' +
      esc(signed(t.amount, a ? a.currency : "")) +
      "</div></div>" +
      '<p class="muted small" style="text-align:center">A correction so Tally matches what you really had. It isn’t counted as spending or income.</p>' +
      '<button class="btn danger" data-act="adj-del">Delete this fix</button>'
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
    (a.archived ? " · archived" : "") +
    '</div><div class="v">' +
    esc(money(bal, a.currency)) +
    "</div>" +
    (start !== bal ? '<div class="t">Started today with ' + esc(money(start, a.currency)) + "</div>" : "") +
    "</div>";
  h +=
    '<div class="card"><h3>Doesn’t match?</h3><p class="muted small" style="margin:0">Type what you really have now. Tally records the difference as a balance fix.</p>' +
    amtField("f-actual", a.currency, "", { label: "Actual balance", placeholder: r2(bal) }) +
    '<div class="preview" id="fix-prev"></div><div class="gap"></div><button class="btn" data-act="fix-save">Update balance</button></div>';
  h +=
    '<div class="gap"></div><div class="row">' +
    (a.archived
      ? '<button class="btn tonal" data-act="acc-unarch">' + ic("reset") + "Show again</button>"
      : '<button class="btn tonal" data-act="acc-arch">' + ic("archive") + "Archive</button>") +
    '<button class="btn tonal" data-act="hist-acc" data-v="' +
    a.id +
    '">' +
    ic("list") +
    "History</button></div>";
  h +=
    '<div class="gap"></div><button class="btn text" data-act="acc-form" data-v="' +
    a.id +
    '">' +
    ic("edit") +
    "Edit account</button>";
  openSheet(a.name, h);
}
/* "Set actual balance": records the difference as a balance fix dated today */
function saveFix() {
  const a = acc(F.id),
    val = evalAmt($("#f-actual").value);
  if (val == null) {
    snack("Type what you have now");
    return;
  }
  const d = r2(val - balances()[F.id]);
  if (d === 0) {
    snack("Already matches");
    return;
  }
  const id = F.id,
    xid = newId(),
    ts = Date.now(),
    mutate = () => {
      S.txns.push({ id: xid, ts, type: "adjust", amount: d, account: id, date: today(), note: "Balance fix" });
    };
  guardOverdraw(mutate, today(), () => {
    closeSheet();
    withUndo(a.name + " set to " + money(val, a.currency), mutate, { row: id });
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
  const d = r2(v - balances()[F.id]);
  el.textContent =
    d === 0
      ? "Already matches."
      : (d > 0 ? "Adds " : "Removes ") + money(Math.abs(d), a.currency) + " as a balance fix.";
}
function accForm(id) {
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
  };
  if (!F.i && !F.e) F.i = typeIcon(a.type);
  let h =
    emblemEditor({ i: F.i, e: F.e, c: F.col }) +
    '<label class="field"><span>Name</span><input id="f-name" value="' +
    esc(a.name) +
    '" placeholder="e.g. RBC Chequing, bKash, Wallet" maxlength="30"></label>';
  h +=
    '<div class="lbl">Type</div><div class="chips" id="f-types">' +
    visTypes(a.type)
      .map(k => typeChip(k, a.type))
      .join("") +
    '<button class="chip addnew" data-act="type-new">' +
    ic("add") +
    "Add new</button></div>";
  h +=
    '<div class="row"><div class="field"><span>Currency</span><button class="fieldbtn" id="f-cur" data-act="pick-acccur"' +
    (used ? " disabled" : "") +
    "><span>" +
    esc(a.currency) +
    "</span>" +
    ic("down") +
    "</button></div>" +
    '<label class="field"><span>' +
    (id ? "Starting balance" : "Balance right now") +
    '</span><input id="f-open" inputmode="decimal" autocomplete="off" value="' +
    esc(a.opening === "" ? "" : a.opening) +
    '" placeholder="0.00"></label></div>';
  h +=
    '<p class="hint">' +
    (id
      ? "What it held before your first entry here. To correct today’s balance, use “Doesn’t match?” instead."
      : "Credit card? Enter what you owe as a negative number.") +
    (used ? " Currency is locked because this account has entries." : "") +
    "</p>";
  h += '<div class="gap"></div><button class="btn" data-act="acc-save">' + (id ? "Save" : "Add account") + "</button>";
  if (id) {
    if (!used) h += '<div class="gap"></div><button class="btn danger" data-act="acc-del">Delete account</button>';
  }
  openSheet(id ? "Edit account" : "New account", h);
}
function saveAccount() {
  const name = $("#f-name").value.trim();
  if (!name) {
    snack("Give the account a name");
    return;
  }
  const raw = $("#f-open").value.trim(),
    o = raw ? evalAmt(raw) : 0;
  if (o == null) {
    snack("That balance isn't a number");
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
    was = F.id;
  const go = () => {
    if (was) Object.assign(acc(was), data);
    else S.accounts.push(Object.assign({ id: newId(), archived: false }, data));
    closeSheet();
    commit();
    snack(was ? "Account saved" : name + " added");
  };
  if (o < 0 && data.type !== "card" && !(was && acc(was).opening === o))
    askDialog(
      "Start below zero?",
      "Only credit cards usually go below zero. Save " + name + " at " + signed(o, data.currency) + "?",
      "Save anyway",
      go,
      { cancel: "Go back" }
    );
  else go();
}
/* only accounts without entries can be deleted (deleting would change other balances through transfers); the rest are archived */
function deleteAccount() {
  const id = F.id;
  if (S.txns.some(t => t.account === id || t.to === id)) return;
  askDialog(
    "Delete this account?",
    "It has no entries, so nothing else changes.",
    "Delete",
    () => {
      S.accounts = S.accounts.filter(a => a.id !== id);
      closeSheet();
      commit();
      snack("Account deleted");
    },
    { danger: true }
  );
}
function catForm(id, kind) {
  const used = new Set(S.cats.map(x => String(x.c).toLowerCase())),
    free = PALETTE.find(x => !used.has(x)) || PALETTE[S.cats.length % PALETTE.length];
  const c = id
    ? S.cats.find(x => x.id === id)
    : { name: "", e: "🏷️", i: "label", c: free, kind: kind === "in" ? "in" : "out" };
  if (!c) return;
  F = { kind: "catf", id, ck: c.kind, col: c.c, i: c.i || "", e: c.e };
  let h = emblemEditor(c);
  h +=
    '<label class="field"><span>Name</span><input id="f-cname" value="' +
    esc(c.name) +
    '" maxlength="16" placeholder="e.g. Coffee"></label>';
  h +=
    '<div class="gap"></div><div class="gap"></div><button class="btn" data-act="cat-save">' +
    (id ? "Save" : "Add category") +
    "</button>";
  if (id)
    h +=
      '<div class="gap"></div><button class="btn danger" data-act="cat-del">' +
      (c.hidden ? "Bring back" : "Remove") +
      "</button>";
  openSheet(id ? "Edit category" : c.kind === "in" ? "New money-in category" : "New spending category", h);
}
function saveCat() {
  const name = $("#f-cname").value.trim(),
    e = F.e || "🏷️",
    i = F.i;
  if (!name) {
    snack("Give it a name");
    return;
  }
  if (F.id)
    Object.assign(
      S.cats.find(c => c.id === F.id),
      { name, e, i, c: F.col }
    );
  else {
    const c = { id: "c" + newId(), name, e, i, c: F.col, kind: F.ck };
    const lastVis = S.cats.map(x => x.kind === F.ck && !x.hidden).lastIndexOf(true);
    S.cats.splice(lastVis + 1, 0, c);
  }
  closeSheet();
  commit();
}
/* built-in categories and ones with entries are hidden (old entries keep their emblem); unused custom ones are deleted */
function removeCat() {
  const c = S.cats.find(x => x.id === F.id);
  if (!c) return;
  if (c.hidden) {
    c.hidden = false;
    closeSheet();
    commit();
    snack(c.name + " is back");
    return;
  }
  if (S.cats.filter(x => x.kind === c.kind && !x.hidden).length <= 1) {
    snack("Keep at least one category");
    return;
  }
  if (CATS.some(d => d.id === c.id) || S.txns.some(t => t.cat === c.id)) c.hidden = true;
  else S.cats = S.cats.filter(x => x !== c);
  closeSheet();
  commit();
  snack(c.name + " removed");
}
/* a hidden category's "bring back" chip in Settings */
function restoreCat(id) {
  const c = S.cats.find(x => x.id === id);
  if (!c) return;
  if (c.kind === "out" && outCats().length >= 24) {
    snack("Up to 24 spending categories");
    return;
  }
  c.hidden = false;
  commit();
  snack(c.name + " is back");
}
function entriesSheet() {
  RBC = null;
  const list = periodTxns().sort(byNewest);
  openSheet(
    periodLabel(),
    '<div id="ent-list"></div>' +
      (list.length ? dayGroups(list) : '<div class="empty">Nothing written down yet.</div>') +
      '<div class="gap"></div><button class="btn text" data-act="go" data-v="history">Open full history</button>'
  );
}
function saveTx() {
  const v = readVals(),
    amt = evalAmt(v.amount);
  if (!F.cat) {
    snack("Pick a category");
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
  const t = { type: F.type, amount: amt, account: F.account, cat: F.cat, date: v.date, note: (v.note || "").trim() };
  if (F.type === "income") S.settings.lastAccIn = F.account;
  else S.settings.lastAcc = F.account;
  const id = F.id,
    nid = newId(),
    ts = Date.now();
  const mutate = id
    ? () => {
        const old = S.txns.find(x => x.id === id);
        Object.assign(old, t);
      }
    : () => {
        S.txns.push(Object.assign({ id: nid, ts }, t));
      };
  guardOverdraw(mutate, t.date, () => {
    closeSheet();
    buzz(10);
    withUndo(
      id ? "Saved" : (t.type === "income" ? "+" : "−") + money(amt, acc(t.account).currency) + " · " + cat(t.cat).name,
      mutate,
      { row: id || nid, cat: t.cat, center: true }
    );
  });
}
function saveTr() {
  const v = readVals(),
    fa = acc(F.from),
    ta = acc(F.to);
  if (!fa || !ta) {
    snack("Pick both accounts");
    return;
  }
  if (F.from === F.to) {
    snack("Pick two different accounts");
    return;
  }
  const amt = evalAmt(v.amount);
  if (!(amt > 0)) {
    snack("Enter the amount sent");
    return;
  }
  const diff = fa.currency !== ta.currency;
  let got = null;
  if (diff) {
    got = evalAmt(v.toAmount);
    if (!(got > 0)) {
      snack("Enter how much arrived in " + ta.currency);
      return;
    }
  }
  const fee = F.showFee ? evalAmt(v.fee) || 0 : 0;
  if (fee < 0) {
    snack("Fee can't be negative");
    return;
  }
  if (!v.date) {
    snack("Pick a date");
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
      const f = oldFee || { id: fid, ts };
      if (!oldFee) S.txns.push(f);
      Object.assign(f, {
        type: "expense",
        amount: r2(fee),
        account: from,
        cat: "fees",
        date,
        note: "Transfer fee",
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
    withUndo(id ? "Saved" : "Transferred " + money(amt, fa.currency) + " to " + ta.name, mutate, { row: id || nid });
  });
}
