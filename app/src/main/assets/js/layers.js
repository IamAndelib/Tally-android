/*
 * layers.js — The layers above a screen: the bottom sheet (#sheet), a second sheet for pickers (#sheet2), dialogs (#pop,
 * never the browser's confirm()), the date and time pickers and the currency picker. Sheets are built once and
 * then patched in place while open.
 */
"use strict";

/* month grid shared by the period dialog and the date picker */
function calGrid(m, o) {
  const t = today(),
    [y, mo] = m.split("-").map(Number),
    first = m + "-01";
  const off = (parseISO(first).getDay() + 6) % 7,
    rows = Math.ceil((off + new Date(y, mo, 0).getDate()) / 7);
  const has = new Set(S.txns.map(x => x.date)),
    minM = o.min ? o.min.slice(0, 7) : "",
    maxM = o.max ? o.max.slice(0, 7) : "";
  let h =
    '<div class="cal-h"><button class="icon" data-act="' +
    o.monAct +
    '" data-v="-1" aria-label="Previous month"' +
    (minM && m <= minM ? " disabled" : "") +
    ">" +
    ic("left") +
    "</button><b>" +
    esc(monthLabel(m, true)) +
    '</b><button class="icon" data-act="' +
    o.monAct +
    '" data-v="1" aria-label="Next month"' +
    (maxM && m >= maxM ? " disabled" : "") +
    ">" +
    ic("right") +
    "</button></div>";
  h +=
    '<div class="cal"><div class="cal-wd">' +
    Array.from(
      { length: 7 },
      (_, i) =>
        "<span>" +
        esc(parseISO(addDays("2024-01-01", i)).toLocaleDateString(undefined, { weekday: "narrow" })) +
        "</span>"
    ).join("") +
    "</div>";
  let d = addDays(first, -off);
  for (let r = 0; r < rows; r++) {
    h += '<div class="wk">';
    for (let i = 0; i < 7; i++) {
      const cls = ["dd"];
      if (d.slice(0, 7) !== m) cls.push("other");
      if (d === t) cls.push("now");
      if (o.sel && d === o.sel) cls.push("sel");
      if (o.hs && d >= o.hs && d <= o.he) {
        if (d === o.hs) cls.push("rs");
        if (d === o.he) cls.push("re");
        if (d > o.hs && d < o.he) cls.push("in");
      }
      const off2 = (o.max && d > o.max) || (o.min && d < o.min);
      h +=
        '<button class="' +
        cls.join(" ") +
        '" data-act="' +
        o.act +
        '" data-v="' +
        d +
        '"' +
        (off2 ? " disabled" : "") +
        ">" +
        parseISO(d).getDate() +
        (has.has(d) ? '<i class="dt"></i>' : "") +
        "</button>";
      d = addDays(d, 1);
    }
    h += "</div>";
  }
  return h + "</div>";
}
let ASK = null,
  ASK_ALT = null;
function askDialog(title, text, okText, onOk, o) {
  o = o || {};
  ASK = onOk;
  ASK_ALT = o.alt ? o.alt[1] : null;
  $("#pop").innerHTML =
    '<div class="pop scrim" data-act="pop-bg"><div class="dialog" role="alertdialog" aria-modal="true" aria-label="' +
    esc(title) +
    '"><h3 class="dlg-t">' +
    esc(title) +
    "</h3>" +
    (text ? '<p class="dlg-x">' + esc(text) + "</p>" : "") +
    (o.alt
      ? '<div class="dlg-act stack"><button class="btn text" data-act="ask-ok">' +
        esc(okText) +
        '</button><button class="btn text" data-act="ask-alt">' +
        esc(o.alt[0]) +
        '</button><button class="btn text" data-act="pd-close">' +
        esc(o.cancel || "Cancel") +
        "</button></div></div></div>"
      : '<div class="dlg-act"><button class="btn text" data-act="pd-close">' +
        esc(o.cancel || "Cancel") +
        "</button>" +
        '<button class="btn text' +
        (o.danger ? " dng" : "") +
        '" data-act="ask-ok">' +
        esc(okText) +
        "</button></div></div></div>");
}
const miniDialog = (label, body, okAct, okText) => {
  $("#pop").innerHTML =
    '<div class="pop scrim" data-act="pop-bg"><div class="dialog" role="dialog" aria-modal="true" aria-label="' +
    esc(label) +
    '"><div class="dp-h"><div class="t">' +
    esc(label) +
    "</div></div>" +
    body +
    '<div class="dlg-act"><button class="btn text" data-act="pd-close">Cancel</button><button class="btn text" data-act="' +
    okAct +
    '">' +
    esc(okText) +
    "</button></div></div></div>";
};
function dateField(id, val, o) {
  o = o || {};
  return (
    '<button class="fieldbtn datefld" id="' +
    id +
    '" data-act="pick-date" data-v="' +
    esc(val || "") +
    '"' +
    (o.min ? ' data-min="' + o.min + '"' : "") +
    (o.max ? ' data-max="' + o.max + '"' : "") +
    (o.opt ? ' data-opt="1"' : "") +
    ' data-none="' +
    esc(o.none || "No date") +
    '" aria-label="' +
    esc(o.label || "Date") +
    '"' +
    (o.style ? ' style="' + o.style + '"' : "") +
    "><span>" +
    esc(val ? shortDay(val) : o.none || "No date") +
    "</span>" +
    ic("event") +
    "</button>"
  );
}
function setDateField(el, v) {
  el.dataset.v = v || "";
  el.firstChild.textContent = v ? shortDay(v) : el.dataset.none;
}
let DP = null;
function datePicker(el) {
  const v = el.dataset.v,
    mx = el.dataset.max || "",
    mn = el.dataset.min || "";
  let ref = v || today();
  if (mx && ref > mx) ref = mx;
  if (mn && ref < mn) ref = mn;
  DP = { id: el.id, month: ref.slice(0, 7), sel: v, min: mn, max: mx, opt: !!el.dataset.opt };
  $("#pop").innerHTML =
    '<div class="pop scrim" data-act="pop-bg"><div class="dialog" id="dp" role="dialog" aria-modal="true" aria-label="Pick a date"></div></div>';
  dpRender();
}
function dpRender() {
  const el = $("#dp");
  if (!el || !DP) return;
  const t = today(),
    tOk = !((DP.max && t > DP.max) || (DP.min && t < DP.min));
  el.innerHTML =
    '<div class="dp-h"><div class="t">Pick a date</div><div class="big">' +
    esc(DP.sel ? dayLabel(DP.sel) : "No date") +
    "</div></div>" +
    calGrid(DP.month, { act: "dp-day", monAct: "dp-mon", sel: DP.sel, min: DP.min, max: DP.max }) +
    '<div class="dlg-act">' +
    (DP.opt && DP.sel
      ? '<button class="btn text" data-act="dp-set" data-v="">Clear</button>'
      : '<button class="btn text" data-act="dp-set" data-v="' +
        t +
        '"' +
        (tOk ? "" : " disabled") +
        ">Today</button>") +
    '<button class="btn text" data-act="pd-close">Cancel</button></div>';
}
function dpSet(v) {
  const id = DP.id,
    el = $("#" + id);
  closePop();
  if (!el) return;
  setDateField(el, v);
  if (id === "f-due2" && F && F.kind === "loan") {
    const l = loan(F.id);
    if (!l) return;
    const t = S.txns.find(x => x.id === F.dueDraw);
    if (!t) return;
    t.due = v;
    commit();
    const i = loanInfo(l);
    $("#loan-due").textContent = i.nextDue
      ? (l.kind === "lend" ? "Payback day · " : "Return by · ") + dayLabel(i.nextDue)
      : "No due date yet";
  }
}
const timeLabel = hm => {
  const [h, m] = hm.split(":").map(Number);
  return new Date(2024, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};
function timePicker() {
  const cur = (S.settings.remind || {}).time || "21:00",
    times = [];
  for (let h = 16; h < 24; h++) for (const m of ["00", "30"]) times.push(pad(h) + ":" + m);
  $("#pop").innerHTML =
    '<div class="pop scrim" data-act="pop-bg"><div class="dialog" role="dialog" aria-modal="true" aria-label="Nudge time"><div class="dp-h"><div class="t">Evening nudge at</div><div class="big">' +
    esc(timeLabel(cur)) +
    '</div></div><div class="mgrid tgrid">' +
    times
      .map(
        x =>
          '<button class="' +
          (x === cur ? "sel" : "") +
          '" data-act="tm-pick" data-v="' +
          x +
          '">' +
          esc(timeLabel(x)) +
          "</button>"
      )
      .join("") +
    '</div><div class="dlg-act"><span></span><button class="btn text" data-act="pd-close">Cancel</button></div></div></div>';
}
const closePop = () => {
  $("#pop").innerHTML = "";
  PD = null;
  DP = null;
  ASK = null;
  ASK_ALT = null;
};
function openSheet(title, body) {
  $("#sheet").innerHTML =
    '<div class="sheet" data-act="sheet-bg"><div class="p" role="dialog" aria-modal="true" aria-label="' +
    esc(title) +
    '"><div class="handle"></div><div class="h"><h2>' +
    esc(title) +
    '</h2><button class="icon" data-act="close" aria-label="Close">' +
    ic("close") +
    "</button></div>" +
    body +
    "</div></div>";
  groupAmountInputs($("#sheet"));
}
/* amounts already in a new sheet (editing an entry, a loan's balance) show grouped like typed ones */
function groupAmountInputs(root) {
  root.querySelectorAll('input[inputmode="decimal"]').forEach(i => (i.value = groupDigits(i.value)));
}
function closeSheet() {
  closeSheet2();
  $("#sheet").innerHTML = "";
  F = null;
  /* came from the entries list: go back to it (after a save/delete has been applied), not to Home */
  if (BACKTO) {
    const b = BACKTO;
    BACKTO = null;
    setTimeout(() => {
      if ($("#sheet").innerHTML || V.screen !== b.screen) return;
      entriesSheet();
      const p = $("#sheet .p");
      if (p) p.scrollTop = b.scroll;
    }, 0);
  }
}
/* second layer, for pickers opened from inside a sheet */
function openSheet2(title, body) {
  $("#sheet2").innerHTML =
    '<div class="sheet s2" data-act="sheet2-bg"><div class="p" role="dialog" aria-modal="true" aria-label="' +
    esc(title) +
    '"><div class="handle"></div><div class="h"><h2>' +
    esc(title) +
    '</h2><button class="icon" data-act="close2" aria-label="Close">' +
    ic("close") +
    "</button></div>" +
    body +
    "</div></div>";
  groupAmountInputs($("#sheet2"));
}
function closeSheet2() {
  $("#sheet2").innerHTML = "";
  CURPICK = null;
  ICPICK = null;
  if (F) {
    F.editTxn = null;
    F.editAcc = null;
  }
}
const focusAmt = () =>
  setTimeout(() => {
    const el = $("#f-amt");
    if (el) el.focus();
  }, 60);
/* update toggle buttons inside the open sheet without rebuilding it */
function setPressed(act, v) {
  $("#sheet")
    .querySelectorAll('[data-act="' + act + '"]')
    .forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v));
}
let F = null;
/* currency picker */
const MAJOR = [
  "CAD",
  "USD",
  "EUR",
  "GBP",
  "BDT",
  "INR",
  "PKR",
  "AUD",
  "NZD",
  "JPY",
  "CNY",
  "HKD",
  "SGD",
  "MYR",
  "THB",
  "IDR",
  "PHP",
  "KRW",
  "AED",
  "SAR",
  "QAR",
  "KWD",
  "TRY",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RUB",
  "UAH",
  "ZAR",
  "NGN",
  "EGP",
  "KES",
  "BRL",
  "MXN",
  "ARS",
  "CLP",
  "COP",
  "LKR",
  "NPR",
  "VND",
  "ILS",
];
let CURPICK = null,
  curDN,
  curAll = null;
const curSyms = {};
function curName(c) {
  try {
    curDN = curDN || new Intl.DisplayNames(undefined, { type: "currency" });
    const n = curDN.of(c);
    return n && n !== c ? n : "";
  } catch (e) {
    return "";
  }
}
function curSym(c) {
  if (c in curSyms) return curSyms[c];
  let s = "";
  try {
    const p = new Intl.NumberFormat(undefined, { style: "currency", currency: c, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find(x => x.type === "currency");
    if (p && p.value !== c) s = p.value;
  } catch (e) {}
  return (curSyms[c] = s);
}
const curLabel = c => {
  const n = curName(c);
  return n ? c + " · " + n : c;
};
function allCurs() {
  if (!curAll) {
    let l = [];
    try {
      if (Intl.supportedValuesOf) l = Intl.supportedValuesOf("currency");
    } catch (e) {}
    const rest = l.filter(c => !MAJOR.includes(c)).sort((a, b) => (curName(a) || a).localeCompare(curName(b) || b));
    curAll = MAJOR.concat(rest);
  }
  return curAll;
}
function curPicker(current, onPick) {
  openSheet2(
    "Currency",
    '<div class="qbar"><input id="cur-q" type="search" placeholder="Search name or code" autocomplete="off" aria-label="Search currency"></div><div id="curlist" data-cur="' +
      esc(current) +
      '"></div>'
  );
  CURPICK = onPick;
  curList("");
}
function curList(q) {
  const box = $("#curlist");
  if (!box) return;
  const cur = box.dataset.cur;
  q = q.trim().toLowerCase();
  const match = c => !q || c.toLowerCase().includes(q) || curName(c).toLowerCase().includes(q);
  const row = c =>
    '<button class="tx" data-act="cur-pick" data-v="' +
    c +
    '"><span class="code">' +
    c +
    '</span><span class="mid"><div class="d">' +
    esc(curName(c) || c) +
    '</div></span><span class="a muted">' +
    esc(curSym(c)) +
    "</span>" +
    (c === cur ? ic("check") : "") +
    "</button>";
  let h = "";
  const sec = (title, l) => {
    l = l.filter(match);
    if (l.length)
      h += '<div class="day"><span>' + title + '</span></div><div class="list">' + l.map(row).join("") + "</div>";
  };
  const inUse = [...new Set([cur, S.settings.cur].concat(S.accounts.map(a => a.currency)))].filter(Boolean),
    all = allCurs();
  if (q) sec("Results", [...new Set(inUse.concat(all))]);
  else {
    sec("In use", inUse);
    sec(
      "Popular",
      MAJOR.filter(c => !inUse.includes(c))
    );
    sec(
      "All currencies",
      all.filter(c => !MAJOR.includes(c) && !inUse.includes(c))
    );
  }
  box.innerHTML = h || '<div class="empty">No currency found</div>';
}
let BACKTO = null;
