/*
 * sheets.js — Entry sheets: spending / income, transfer, balance fix, the account sheet and account / category / asset
 * forms, and the entries list; the charge and extra card the forms share.
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
/* account chips; the picked one is tinted in its account's colour (.acchip); addAct: a dashed "Add account" chip at the end */
const accChips = (act, sel, disabled, list, addAct) =>
  '<div class="chips">' +
  (list || activeAccounts())
    .map(
      a =>
        '<button class="chip lead acchip" data-act="' +
        act +
        '" data-v="' +
        a.id +
        '" aria-pressed="' +
        (a.id === sel) +
        '"' +
        accVar(a) +
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
/* the categories of the entry form, the "Add" tile at the end */
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
        '<span class="cn" dir="auto">' +
        esc(catName(c)) +
        "</span></button>"
    )
    .join("") + addTile("f-cat-new", "");
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
  '">';
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
/* a name offered under a field (a payee, a person): a compact chip (as the Filters sheet's: 34px to see, 48px to tap
   through the row gap), the name that picks it and its own ✕ that takes it out of the suggestions (`kind`: "people" or
   "payees"; hideName) */
const nameChip = (kind, act, v, name) =>
  '<span class="nchip"><button class="nchip-pick" data-act="' +
  act +
  '" data-v="' +
  esc(v) +
  '"><span class="chn" dir="auto">' +
  esc(name) +
  '</span></button><button class="nchip-x" data-act="name-hide" data-v="' +
  kind +
  ":" +
  esc(name) +
  '" aria-label="' +
  esc(T("suggest.removeName", { name })) +
  '">' +
  ic("close") +
  "</button></span>";
/* the names taken out of the suggestions (folded), per kind */
const hiddenNames = kind => S.settings[kind === "people" ? "hiddenPeople" : "hiddenPayees"] || [];
/* a name's ✕: it leaves the suggestions (the entries keep it), with an Undo that leaves the form as it is */
function hideName(kind, name) {
  const key = kind === "people" ? "hiddenPeople" : "hiddenPayees",
    f = curFold(name).trim();
  if (!f || hiddenNames(kind).includes(f)) return;
  const redraw = () => {
    if (kind === "people") personSuggest(($("#f-person") || {}).value || "");
    else payeeSuggest(($("#f-payee") || {}).value || "");
  };
  S.settings[key] = [...hiddenNames(kind), f].slice(-200);
  save();
  redraw();
  const undo = () => {
    S.settings[key] = hiddenNames(kind).filter(x => x !== f);
    save();
    redraw();
    snack(T("common.undone"));
  };
  undo.keep = true; // the open form stays
  snack(T("suggest.removed", { name }), undo);
}
/* up to four earlier payees whose name or one of its words starts with what's typed (not one typed out in full) */
function payeeSuggest(q) {
  const el = $("#f-payee-sug"),
    qq = curFold(q.trim());
  if (!el || !F) return;
  const gone = hiddenNames("payees"),
    list = qq
      ? payeeIndex()
          .filter(
            p => p.key !== qq && !gone.includes(p.key) && (p.key.startsWith(qq) || p.words.some(w => w.startsWith(qq)))
          )
          .slice(0, 4)
      : [];
  el.hidden = !list.length;
  el.innerHTML = list.map(p => nameChip("payees", "f-payee-pick", p.name, p.name)).join("");
}
function pickPayee(name) {
  const el = $("#f-payee");
  if (el) {
    el.value = name;
    el.focus({ preventScroll: true });
  }
  $("#f-payee-sug").hidden = true;
}
/* draft: the form as it was before Add category / Add account (txQuickAdd), filled back in over everything else.
   Spent has "+ Add a charge" and its card under the account chips (docs/specs/charges.md, "The buttons"), open from
   the start for a purchase that has one; Received has none. */
function txSheet(id, type, catId, draft) {
  if (!id && !activeAccounts().length) {
    snack(T("account.addFirst"));
    accForm(null, () => txSheet(id, type, catId));
    return;
  }
  const t = id ? entry(id) : null;
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
  const d = draft;
  F = {
    kind: "tx",
    id,
    type,
    cat: d ? d.cat : t ? t.cat : catId || (inc ? "income" : null),
    account: d ? d.account : t ? t.account : def,
  };
  const k = F.cat ? cat(F.cat) : null,
    a = acc(F.account),
    fee = inc ? null : addOnOf(t);
  let list = inc ? inCats() : outCats();
  if (k && !list.includes(k)) list = list.concat([k]);
  const payee = (d ? d.payee : t ? t.payee : "") || "";
  let h = "";
  h +=
    /* the picked category and who was paid, side by side (the box wraps below when the row is too narrow) */
    '<div class="row catrow" id="f-catrow"' +
    (k ? "" : " hidden") +
    '><button class="catchip" id="f-catchip" data-act="f-showcats" aria-expanded="false">' +
    (k ? catChipInner(k) : "") +
    "</button>" +
    payeeField(inc, payee) +
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
    catBtns(list, F.cat) +
    "</div>";
  h += amtField("f-amt", a ? a.currency : "", t ? amtPre(t.amount, a && a.currency) : "", { curId: "amt-cur" });
  h +=
    '<div class="lbl">' +
    TH("common.account") +
    "</div>" +
    accChips("f-acc", F.account, null, accChoices(F.account), "f-acc-new");
  /* the purchase's charge (the preview is in its card only: none while nothing is added) */
  if (!inc)
    h += addOnCard(
      [
        {
          kind: "charge",
          open: d ? d.charge != null : !!fee,
          value: d ? d.charge || "" : fee ? amtPre(fee.amount, (acc(fee.account) || {}).currency) : "",
        },
      ],
      a ? a.currency : ""
    );
  h +=
    '<div class="row notedate"><input id="f-note" placeholder="' +
    TH("entry.notePh") +
    '" maxlength="80" value="' +
    esc(d ? d.note : t ? t.note : "") +
    '" aria-label="' +
    TH("common.note") +
    '"><div class="nd-date">' +
    dateField("f-date", d ? (d.now ? entryDate() : d.date) : t ? t.date : entryDate(), {
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
  txPreview();
  if (!id && F.cat) focusAmt();
}
/* Spent's preview, at the bottom of its charge's card, the figures in bold: "● Credit card −৳1,150.00 · ৳1,000.00 +
   charge ৳150.00"; none until the amount and the charge are figures a save keeps (keptAmt()) */
function txPreview() {
  const sc = $("#sheet .p");
  if (!sc || !F || F.kind !== "tx" || F.type === "income") return;
  const a = acc(F.account),
    cur = a ? a.currency : "";
  addOnCur(sc, cur);
  const amt = keptAmt(evalAmt(readVals().amount), cur),
    fee = addOnKept(sc, cur).charge || 0;
  if (!a || !(amt > 0) || !(fee > 0)) return addOnPreview(sc, "");
  const b = x => "<b>" + esc(x) + "</b>";
  addOnPreview(
    sc,
    accTag(a) +
      " " +
      b(signed(-rnd(amt + fee), cur)) +
      " · " +
      TH("prev.spend", { amount: { html: b(money(amt, cur)) }, charge: { html: b(money(fee, cur)) } })
  );
}
/* Add category / Add account from the entry form: the same form as in Settings, then back to the entry with all of it
   as it was and the new one picked; closed without saving, back to the entry as it was */
function txDraft() {
  if (CALC && (CALC.id === "f-amt" || CALC.id === "f-charge")) calcClose(CALC.id, calcToggleBtn(CALC.id)); // its sum
  const val = s => ($(s) || {}).value || "",
    dt = $("#f-date"),
    sc = $("#sheet .p");
  return {
    id: F.id,
    type: F.type,
    cat: F.cat,
    account: F.account,
    amt: val("#f-amt"),
    note: val("#f-note"),
    payee: val("#f-payee"),
    charge: sc ? addOnTexts(sc).charge : undefined, // as typed while its card is open, else none
    date: dt ? dt.dataset.v : "",
    now: !!(dt && dt.dataset.now),
    back: BACKTO,
  };
}
function txQuickAdd(what) {
  const inc = F.type === "income";
  if (what === "cat" && catsFull(inc ? "in" : "out")) return;
  const dr = txDraft();
  let back = false; // once only: saved (then) or closed (BACKTO), never both
  const reopen = patch => {
    if (back) return;
    back = true;
    sheetSwap = true;
    txSheet(dr.id, dr.type, null, Object.assign({}, dr, patch));
    BACKTO = dr.back; // the entries list this entry came from stays the way back
  };
  BACKTO = { screen: V.screen, open: () => reopen() }; // closed without saving: ✕, Back, a tap outside
  sheetSwap = true;
  if (what === "cat") catForm(null, inc ? "in" : "out", id => reopen({ cat: id }));
  else accForm(null, id => reopen({ account: id }));
}
/* an entry row tapped in a list; from the entries sheet, closing the entry goes back to that list, the focus on its row
   (on the next one, once it is deleted) */
function openEntry(id) {
  const p0 = $("#sheet .p"),
    scroll = (p0 || {}).scrollTop || 0,
    a = p0 && rowAnchor(p0, p0),
    was = dayDrawn("#sheet"),
    list = $("#sheet #ent-list"),
    to = list && rowsAround([id]);
  BACKTO = list
    ? {
        screen: V.screen,
        open: () => {
          entriesSheet([a && a.v, id], was);
          const p = $("#sheet .p");
          if (!p) return;
          p.scrollTop = scroll;
          if (a) toAnchor(a, p, p); // the row it was opened from, where it was
          landFocus(to);
        },
      }
    : null;
  txSheet(id);
}
function pickCat(id) {
  F.cat = id;
  setPressed("f-cat", id);
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
  if (F.kind === "loanf") {
    if (F.merge) {
      const ml = loan(F.merge);
      if (!ml || loanInfo(ml).cur !== acc(id).currency) F.merge = null;
    }
    personSuggest(($("#f-person") || {}).value || "");
  }
  formPreview(); // a lend's or borrow's with its hint, Spent's with the card's code
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
  };
}
/* Charges and extras (docs/specs/charges.md → The buttons, The card, Previews): each kind's words and the field it
   fills ("f-" + f: "f-charge", "f-extra") */
const ADDON = {
  xcharge: {
    f: "charge",
    add: "xcharge.label",
    label: "xcharge.label",
    calc: "xcharge.calc",
    remove: "xcharge.remove",
  },
  charge: { f: "charge", add: "charge.add", label: "charge.label", calc: "charge.calc", remove: "charge.remove" },
  charges: { f: "charge", add: "charges.add", label: "charges.label", calc: "charges.calc", remove: "charges.remove" },
  extra: { f: "extra", add: "extra.add", label: "extra.label", calc: "extra.calc", remove: "extra.remove" },
};
/* the card's name for TalkBack: its one field's, or both ("Transfer charge and extra") */
const addOnName = kinds => (kinds.length > 1 ? T("addOn.both") : kinds.length ? T(ADDON[kinds[0]].label) : "");
/* where a form's preview sits while no card is open: a line under the last field that changes it */
const addOnLine = () => '<div class="aoline"></div>';
/* The tonal card with one or two rows ({kind, value, open, once}): each a small label over a medium figure with the
   currency code before it (cur, the account's; addOnCur() follows the account), its calculator and ✕ at the end and a
   thin line under it, then the preview; under the card, the "+" button of each row that is closed (each comes back
   with ✕, but a row marked once: an older paid fee, which no form adds any more); then the rows' keypads. A form
   opened for an entry that has its add-on opens with the row open. o: {pre} the fields' id prefix ("f": "f-charge";
   "ed" in a second sheet, whose ids must differ from the sheet under it), {one} an entry takes one add-on: while a
   row is open, no other row's button shows. */
function addOnCard(rows, cur, o = {}) {
  let card = "",
    adds = "",
    pads = "";
  rows.forEach(r => {
    const k = ADDON[r.kind],
      id = (o.pre || "f") + "-" + k.f,
      lid = "aol-" + id;
    card +=
      '<div class="aorow" data-k="' +
      r.kind +
      '"' +
      (r.open ? "" : " hidden") +
      '><div class="aof"><span class="aol" id="' +
      lid +
      '">' +
      TH(k.label) +
      '</span><div class="aov"><span class="aocur">' +
      esc(cur) +
      '</span><span class="amtbox"><input id="' +
      id +
      '" inputmode="decimal" autocomplete="off" placeholder="0" value="' +
      esc(r.value || "") +
      '" aria-labelledby="' +
      lid +
      '"><span class="caretmirror" id="cm-' +
      id +
      '" data-act="calc-pos" data-v="' +
      id +
      '" hidden aria-hidden="true"></span></span></div></div>' +
      calcBtn(id, T(k.calc), "aocalc") +
      '<button type="button" class="icon aox" data-act="addon-remove" data-v="' +
      r.kind +
      '" aria-label="' +
      TH(k.remove) +
      '">' +
      ic("close") +
      "</button></div>";
    adds +=
      '<button type="button" class="btn text aoadd" data-act="addon-add" data-v="' +
      r.kind +
      '"' +
      (r.once ? " data-once" : "") +
      (r.open || r.once || (o.one && rows.some(x => x.open)) ? " hidden" : "") +
      ">" +
      ic("add") +
      '<span class="aoat">' +
      TH(k.add) +
      "</span></button>";
    pads += calcPanelHtml(id);
  });
  const open = rows.filter(r => r.open).map(r => r.kind);
  return (
    '<div class="aocard" role="group"' +
    (o.one ? " data-one" : "") +
    (open.length ? ' aria-label="' + esc(addOnName(open)) + '"' : " hidden") +
    ">" +
    card +
    '<div class="aoprev"></div></div><div class="aoadds"' +
    (rows.every(r => r.open || r.once || (o.one && open.length)) ? " hidden" : "") +
    ">" +
    adds +
    "</div>" +
    pads
  );
}
/* in the form sc (its sheet): the row of a kind, and what is typed in each open row ({xcharge: "10"}) */
const addOnRow = (sc, kind) => sc.querySelector('.aorow[data-k="' + kind + '"]');
const addOnTexts = sc =>
  Object.fromEntries(
    [...sc.querySelectorAll(".aocard:not([hidden]) .aorow:not([hidden])")].map(r => [
      r.dataset.k,
      r.querySelector("input").value.trim(),
    ])
  );
/* what the open rows of the card in sc hold, {xcharge: 10}: each a number ≥ 0 (0 when empty or shown as 0 in cur, which
   saves as nothing), or null when one can't be read or is below 0 (said why: the charge's words for a transfer charge,
   a charge and charges, the extra's for an extra) */
function addOnAmounts(sc, cur) {
  const out = {},
    texts = addOnTexts(sc);
  for (const k in texts) {
    const n = texts[k] ? evalAmt(texts[k]) : 0,
      ex = k === "extra";
    if (n == null || n < 0) {
      snack(n == null ? T(ex ? "extra.notNumber" : "charge.notNumber") : T(ex ? "extra.negative" : "charge.negative"));
      return null;
    }
    out[k] = keptAmt(n, cur);
  }
  return out;
}
/* What a save keeps of amount n in currency cur: n, or 0 when it isn't a number or shows as 0 or less there (the forms'
   check, shown(n, cur) > 0: ¥0.4 saves as nothing), so a preview never counts what won't be saved */
const keptAmt = (n, cur) => (n != null && shown(n, cur) > 0 ? n : 0);
/* what each open row of the card in sc adds to its form's preview, {xcharge: 10}: what saving it keeps
   (addOnAmounts()), 0 for a row that is empty, not yet a number, below 0 or shown as 0 in cur */
const addOnKept = (sc, cur) =>
  Object.fromEntries(Object.entries(addOnTexts(sc)).map(([k, v]) => [k, keptAmt(evalAmt(v), cur)]));
/* the currency code before every figure in the card follows the account */
const addOnCur = (sc, cur) => sc.querySelectorAll(".aocard .aocur").forEach(e => (e.textContent = cur));
/* opens or closes one row: the card shows while a row is open, a closed row's button comes back under it (never a row
   marked once; none while a row is open, on a card for one add-on) */
function addOnShow(sc, kind, on) {
  const row = addOnRow(sc, kind),
    card = row.closest(".aocard"),
    adds = sc.querySelector(".aoadds");
  row.hidden = !on;
  const open = [...card.querySelectorAll(".aorow")].filter(r => !r.hidden).map(r => r.dataset.k);
  [...adds.children].forEach(
    b =>
      (b.hidden =
        open.includes(b.dataset.v) || b.hasAttribute("data-once") || (card.hasAttribute("data-one") && open.length > 0))
  );
  card.hidden = !open.length;
  if (open.length) card.setAttribute("aria-label", addOnName(open));
  else card.removeAttribute("aria-label");
  adds.hidden = ![...adds.children].some(b => !b.hidden);
  formPreview();
}
/* "+ Transfer charge" and the others: the row opens in the button's place with its field focused (Android's keyboard,
   so the keypad closes first: never both on screen) */
function addOnAdd(sc, kind) {
  if (CALC) calcClose(CALC.id, calcToggleBtn(CALC.id));
  addOnShow(sc, kind, true);
  addOnRow(sc, kind).querySelector("input").focus();
}
/* ✕: the row empties and closes, its button comes back with the focus; a keypad open on the row closes, one open on
   another field names it again or goes back to today's bar */
function addOnRemove(sc, kind) {
  const inp = addOnRow(sc, kind).querySelector("input");
  if (CALC && CALC.inp === inp) calcClose(CALC.id, calcToggleBtn(CALC.id));
  inp.value = "";
  addOnShow(sc, kind, false);
  const back =
    sc.querySelector('.aoadd[data-v="' + kind + '"]:not([hidden])') || sc.querySelector(".aoadd:not([hidden])");
  if (back) back.focus();
  if (CALC) calcMirrorSync(CALC.id);
  calcLooks();
}
/* the form's preview (html), under its last field until a card opens, then at the bottom of the card: never twice */
function addOnPreview(sc, html) {
  const card = sc.querySelector(".aocard"),
    inCard = !!card && !card.hidden,
    line = sc.querySelector(".aoline"),
    prev = card && card.querySelector(".aoprev");
  if (line) line.innerHTML = inCard ? "" : html;
  if (prev) prev.innerHTML = inCard ? html : "";
}
/* the open form's preview, worked out again */
function formPreview() {
  if (F && F.kind === "tr") trPreview();
  else if (F && F.kind === "loan") loanPreviews();
  else if (F && F.kind === "loanf") loanFormPreview();
  else if (F && F.kind === "tx") txPreview();
}
/* transfer between own accounts, with optional fee */
function trSheet(id) {
  const act = activeAccounts();
  if (!id && act.length < 2) {
    snack(T("transfer.needTwo"));
    accForm(null, () => trSheet());
    return;
  }
  const t = id ? entry(id) : null;
  const fee = addOnOf(t);
  const f = t ? t.account : (act[0] || {}).id;
  const to = t ? t.to : (act.find(a => a.id !== f) || {}).id;
  F = { kind: "tr", id, from: f, to };
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
  h += amtField("f-amt", "", t ? amtPre(t.amount, (acc(t.account) || {}).currency) : "", {
    curId: "tr-cur",
    label: T("transfer.sent"),
  });
  h +=
    '<label class="field" id="recv-wrap" hidden><span id="recv-lbl"></span><input id="f-toamt" inputmode="decimal" autocomplete="off" placeholder="0" value="' +
    esc(t && t.toAmount != null ? amtPre(t.toAmount, (acc(t.to) || {}).currency) : "") +
    '"></label>';
  /* the preview under the amount (and what arrived), then "+ Transfer charge" and its card, which takes the preview */
  h += addOnLine();
  h += addOnCard(
    [{ kind: "xcharge", open: !!fee, value: fee ? amtPre(fee.amount, (acc(fee.account) || {}).currency) : "" }],
    ""
  );
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
  if (diff) $("#recv-lbl").innerHTML = TH("transfer.arrived", { account: { html: accTag(ta) }, cur: ta.currency });
  addOnCur($("#sheet"), fa ? fa.currency : "");
  trPreview();
}
/* "● Bkash −৳1,010.00 · ● Bank +৳1,000.00": what leaves From (the transfer charge counted) and what arrives in To
   ("+ ?" until it is typed, between two currencies); empty until the amount is a number */
function trPreview() {
  const sc = $("#sheet"),
    fa = acc(F.from),
    ta = acc(F.to),
    v = readVals(),
    amt = fa ? keptAmt(evalAmt(v.amount), fa.currency) : 0;
  if (!fa || !ta || !(amt > 0)) return addOnPreview(sc, "");
  const fee = addOnKept(sc, fa.currency).xcharge || 0,
    got = fa.currency !== ta.currency ? keptAmt(evalAmt(v.toAmount), ta.currency) : amt,
    b = x => "<b>" + esc(x) + "</b>";
  addOnPreview(
    sc,
    accTag(fa) +
      " " +
      b(signed(-rnd(amt + fee), fa.currency)) +
      " · " +
      accTag(ta) +
      " " +
      b(got > 0 ? signed(got, ta.currency) : "+ ?")
  );
}
/* view / delete a balance fix */
function adjSheet(id) {
  const t = entry(id);
  if (!t) return;
  const a = acc(t.account);
  F = { kind: "adj", id };
  openSheet(
    T("fix.title"),
    '<div class="hero"><div class="t">' +
      accTag(a) +
      " · " +
      esc(dayLabel(t.date)) +
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
    amtField("f-actual", a.currency, "", {
      label: T("account.actual"),
      placeholder: groupDigits(amtPre(bal, a.currency)),
    }) +
    '<div class="preview" id="fix-prev"></div><div class="gap"></div><button class="btn" data-act="fix-save">' +
    TH("account.update") +
    "</button></div>";
  h +=
    '<div class="gap"></div><div class="row">' +
    (a.archived
      ? '<button class="btn tonal" data-act="acc-unarch">' + icUnarchive() + TH("archive.unarchive") + "</button>"
      : '<button class="btn tonal" data-act="acc-arch">' + icArchive() + TH("account.archive") + "</button>") +
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
  saveChecked(mutate, today(), T("account.setTo", { name: a.name, amount: money(val, a.currency) }), { row: id });
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
    (used ? ' aria-label="' + TH("account.curLockedAria", { currency: a.currency }) + '" disabled' : "") +
    "><span>" +
    esc(a.currency) +
    "</span>" +
    (used ? ic("lock") : ic("down")) +
    "</button></div>" +
    '<label class="field"><span>' +
    TH(id ? "account.opening" : "account.balanceNow") +
    '</span><input id="f-open" inputmode="decimal" autocomplete="off" value="' +
    esc(a.opening === "" ? "" : a.opening) +
    '" placeholder="0"></label></div>';
  h += '<p class="hint">' + TH(id ? "account.openingHint" : "account.cardHint") + "</p>";
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
    h += '<div class="gap"></div><button class="btn danger" data-act="cat-del">' + TH("common.remove") + "</button>";
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
  if (catsFull(c.kind)) return;
  c.hidden = false;
  commit();
  snack(T("category.back", { name: catName(c) }));
}
/* the period's entries in a sheet; coming back to it (at: the ids of the row that was in view and the row to focus;
   was: how many entries it had drawn), its rows are drawn through those (drawTo), the rest as the end comes near */
function entriesSheet(at, was) {
  RBC = LPC = null;
  V.open = "";
  rowsClose($("#app")); // one open row at a time: not the page's behind this list
  const list = periodTxns().sort(byNewest);
  openSheet(
    periodLabel(),
    '<div id="ent-list"></div>' +
      dayList(list, "#sheet", drawTo(list, at, was)) +
      '<div class="gap"></div><button class="btn text" data-act="go" data-v="history">' +
      TH("entries.fullHistory") +
      "</button>"
  );
  dayWatch("#sheet");
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
  /* a purchase's charge: an empty card, or one that shows as 0, saves none (and an edit's goes) */
  const inc = F.type === "income",
    ao = inc ? {} : addOnAmounts($("#sheet .p"), acc(F.account).currency);
  if (!ao) return;
  const fee = ao.charge || 0;
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
    payee = (v.payee || "").trim(); // the box takes 40 characters; a longer one (an old backup) stays as written
  if (payee) t.payee = payee;
  const id = F.id,
    nid = newId(),
    ts = Date.now();
  /* the entry, then a purchase's charge (its account, day and category; false when it is refused) */
  const mutate = id
    ? () => {
        const old = entry(id);
        Object.assign(old, t);
        if (!payee) delete old.payee; // cleared
        return inc || setAddOn(old, "charge", fee);
      }
    : () => {
        const n = Object.assign({ id: nid, ts }, t);
        S.txns.push(n);
        return inc || setAddOn(n, "charge", fee);
      };
  if (!inc && !tryChange(mutate)) {
    snack(T("charge.notNumber")); // never saved without the charge it was given
    return;
  }
  guardOverdraw(mutate, t.date, () => {
    // the account to offer next time, once saved (not when Go back answers the overdraw question)
    if (t.type === "income") S.settings.lastAccIn = t.account;
    else S.settings.lastAcc = t.account;
    closeSheet();
    buzz("confirm");
    withUndo(
      id
        ? T("common.saved")
        : signed(inc ? amt : -rnd(amt + fee), acc(t.account).currency) + // the total, as the row shows it
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
  /* the transfer charge: an empty card, or one that shows as 0, saves none */
  const ao = addOnAmounts($("#sheet"), fa.currency);
  if (!ao) return;
  const fee = ao.xcharge || 0;
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
    ts = Date.now();
  const mutate = () => {
    let t = id ? entry(id) : null;
    if (!t) {
      t = { id: nid, ts };
      S.txns.push(t);
    }
    Object.assign(t, { type: "transfer", amount: amt, account: from, to, date, note });
    if (diff) t.toAmount = got;
    else delete t.toAmount;
    return setAddOn(t, "charge", fee); // its transfer charge: from From, on its day, just after it; none when 0
  };
  if (!tryChange(mutate)) {
    snack(T("charge.notNumber")); // never saved without the charge it was given
    return;
  }
  saveChecked(
    mutate,
    date,
    id ? T("common.saved") : T("transfer.done", { amount: money(amt, fa.currency), account: ta.name }),
    { row: id || nid }
  );
}
/* Deleting asks first, once for a whole selection (ids: History's rows, so its count is theirs; an add-on goes with its
   entry): the title, one line warning what Delete changes (an account's balance, and the loan for a loan or lending
   entry), then Delete (go(false)), Archive instead (go(true): the entries leave History and nothing else changes,
   archiveEntries()) and Cancel. o.archive false leaves Archive instead out (for entries already archived).
   Cancel and Back change nothing; the focus goes back to the Delete that asked. */
function deleteAsk(ids, go, o = {}) {
  const count = ids.length,
    t = count === 1 && entry(ids[0]),
    lend = t && t.type === "loan" && (loan(t.loan) || {}).kind === "lend",
    warn =
      count > 1
        ? "entries.warnMany"
        : lend
          ? "entries.warnLend"
          : t && t.type === "loan"
            ? "entries.warnBorrow"
            : "entries.warnOne";
  choiceDialog(
    count === 1 ? T("entries.delThis") : T("entries.delTitle", { count }),
    T(warn),
    [
      { role: "destroy", label: T("common.delete"), run: () => go(false) },
      o.archive !== false && { role: "alt", label: T("entries.archiveInstead"), run: () => go(true) },
      { role: "out", label: T("common.cancel") },
    ].filter(Boolean)
  );
}
/* Delete in an opened row: the entry goes with its fee (and a loan's only draw takes its loan), with an Undo, as in
   History's selection, unless loanBlock() refuses it (Archive instead is always offered, but not for an entry already
   archived: the Archived screen); the entries sheet is drawn again where it was */
function rowDelete(id) {
  const t = entry(id);
  if (!t) return;
  /* the entries sheet drawn again, where it was scrolled to: after the delete, and after its Undo, which closes the
     layers first (events.js), so it opens the sheet again only if it was open when Undo was tapped (not when it was
     closed meanwhile) and the screen is the same */
  const p = $("#sheet #ent-list") && $("#sheet .p"),
    scroll = p ? p.scrollTop : 0,
    a = p && rowAnchor(p, p),
    was = dayDrawn("#sheet"),
    screen = V.screen,
    redraw = (undone, listed) => {
      if (!p || (undone && (!listed || V.screen !== screen || $("#sheet").innerHTML))) return;
      entriesSheet([a && a.v, id], was);
      const q = $("#sheet .p");
      if (q) q.scrollTop = scroll;
    };
  deleteAsk(
    [id],
    arch => {
      const no = !arch && loanBlock([id]); // archiving never changes a loan: only Delete can be refused
      if (no) {
        snack(no);
        return;
      }
      /* the rows that went (an add-on is inside its entry), archived or not: more than this one when a loan's
         payments go too */
      let n = 0;
      const to = rowsAround([id]);
      withUndo(
        () => (arch ? T("entries.archived") : n > 1 ? T("history.deleted", { count: n }) : T("common.deleted")),
        () => {
          n = entryRows(S.txns).length;
          if (arch) archiveEntries([id], true);
          else deleteEntries([id]);
          n -= entryRows(S.txns).length;
          V.open = "";
        },
        null,
        listed => redraw(true, listed)
      );
      redraw();
      landFocus(to);
    },
    { archive: !t.archived }
  );
}
