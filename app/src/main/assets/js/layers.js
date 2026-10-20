/*
 * layers.js — The layers above a screen: the bottom sheet (#sheet), a second sheet for pickers (#sheet2), dialogs (#pop,
 * never the browser's confirm()), the date and time pickers and the currency picker. Sheets are built once and
 * then patched in place while open.
 */
"use strict";

/* a short window (a 16:9 phone, split screen): the day rows give up height, down to 36px, so the month and the
   dialog's buttons fit without scrolling (a phone held sideways sizes them in CSS: body.land .dd) */
function fitCal(el) {
  if (!el || document.body.classList.contains("land")) return;
  el.style.removeProperty("--row");
  const over = el.scrollHeight - el.clientHeight,
    n = el.querySelectorAll(".wk").length;
  if (over > 0 && n) el.style.setProperty("--row", Math.max(36, 48 - Math.ceil(over / n)) + "px");
}
/* month grid shared by the period dialog and the date picker */
function calGrid(m, o) {
  const t = today(),
    first = m + "-01";
  const w = S.settings.week,
    off = (parseISO(first).getDay() - w + 7) % 7,
    rows = Math.ceil((off + monthDays(m)) / 7);
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
    Array.from({ length: 7 }, (_, i) => "<span>" + esc(weekdayName(w + i, "narrow")) + "</span>").join("") +
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
        /* read out as the whole date, with today and the chosen day marked */
        '" aria-label="' +
        esc(
          parseISO(d).toLocaleDateString(DATE_LOC, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }) + (has.has(d) ? ", has entries" : "")
        ) +
        '"' +
        (d === t ? ' aria-current="date"' : "") +
        (o.sel && d === o.sel ? ' aria-pressed="true"' : "") +
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
/* o.no: the cancel button also does something (a two-step question: "No" moves on); Back / tapping outside only close */
function askDialog(title, text, okText, onOk, o) {
  o = o || {};
  ASK = onOk;
  ASK_ALT = o.alt ? o.alt[1] : o.no || null;
  $("#pop").innerHTML =
    '<div class="pop scrim" data-act="pop-bg"><div class="dialog" role="alertdialog" aria-modal="true" aria-label="' +
    esc(title) +
    '"' +
    (text ? ' aria-describedby="dlg-x"' : "") +
    '><h3 class="dlg-t">' +
    esc(title) +
    "</h3>" +
    (text ? '<p class="dlg-x" id="dlg-x">' + esc(text) + "</p>" : "") +
    (o.alt
      ? '<div class="dlg-act stack"><button class="btn text" data-act="ask-ok">' +
        esc(okText) +
        '</button><button class="btn text" data-act="ask-alt">' +
        esc(o.alt[0]) +
        '</button><button class="btn text" data-act="pd-close">' +
        esc(o.cancel || "Cancel") +
        "</button></div></div></div>"
      : '<div class="dlg-act"><button class="btn text" data-act="' +
        (o.no ? "ask-alt" : "pd-close") +
        '">' +
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
/* a date button; o.now: a new entry's "today", which moves to the new day at midnight until a date is picked
   (catchUpToday). Screen readers hear its label and the date. */
function dateField(id, val, o) {
  o = o || {};
  const shownAs = val ? shortDay(val) : o.none || "No date",
    label = o.label || "Date";
  return (
    '<button class="fieldbtn datefld" id="' +
    id +
    '" data-act="pick-date" data-v="' +
    esc(val || "") +
    '"' +
    (o.min ? ' data-min="' + o.min + '"' : "") +
    (o.max ? ' data-max="' + o.max + '"' : "") +
    (o.opt ? ' data-opt="1"' : "") +
    (o.now && val === today() ? ' data-now="1"' : "") +
    ' data-none="' +
    esc(o.none || "No date") +
    '" data-label="' +
    esc(label) +
    '" aria-label="' +
    esc(label + ": " + shownAs) +
    '"><span>' +
    esc(shownAs) +
    "</span>" +
    ic("event") +
    "</button>"
  );
}
/* Part of the page drawn anew (a screen, a calendar, a chart) keeps the keyboard's and screen reader's place: the
   control that had the focus gets it back, found again by its id or by what it does (data-act, data-v). */
function keepFocus(root, draw) {
  const a = document.activeElement,
    k = root && a && a !== root && root.contains(a) ? focusKey(a) : null;
  draw();
  const now = document.activeElement;
  if (k && !(now && now !== document.body && now.isConnected)) refocus(root, k);
}
const focusKey = el => ({ id: el.id, act: el.dataset && el.dataset.act, v: el.dataset && el.dataset.v });
function refocus(root, k) {
  const sel = k.id
      ? "#" + CSS.escape(k.id)
      : k.act
        ? '[data-act="' + CSS.escape(k.act) + '"]' + (k.v != null ? '[data-v="' + CSS.escape(k.v) + '"]' : "")
        : "",
    el = sel && root.querySelector(sel);
  if (el) el.focus({ preventScroll: true });
  return !!el;
}
function setDateField(el, v, keepNow) {
  const shownAs = v ? shortDay(v) : el.dataset.none;
  el.dataset.v = v || "";
  el.firstChild.textContent = shownAs;
  el.setAttribute("aria-label", el.dataset.label + ": " + shownAs);
  if (!keepNow) delete el.dataset.now;
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
  keepFocus($("#dp"), drawDp);
}
function drawDp() {
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
  fitCal(el);
}
function dpSet(v) {
  const id = DP.id,
    el = $("#" + id);
  closePop();
  if (!el) return;
  setDateField(el, v);
  if (id === "f-due2" && F && F.kind === "loan") {
    /* the loan card's day: every draw still owed that's due by then (or by the day it showed, if later) moves to it,
       as a reminder's +1 day does; without any due day, the draw it's about. The sheet is drawn again. */
    const l = loan(F.id);
    if (!l) return;
    const i = loanInfo(l),
      by = [i.nextDue > today() ? i.nextDue : today(), v].sort().pop(),
      due = i.draws.filter(t => i.rem[t.id] > 0 && t.due && t.due <= by),
      list = due.length ? due : S.txns.filter(x => x.id === F.dueDraw);
    if (!list.length) return;
    list.forEach(t => (t.due = v));
    commit();
    const p = $("#sheet .p"),
      top = p ? p.scrollTop : 0;
    loanOpen(l.id);
    if ($("#sheet .p")) $("#sheet .p").scrollTop = top;
  }
}
/* Settings → Region → Time format: "24" (the default) or "12" */
const is24h = () => S.settings.clock !== "12";
/* the phone's 12 / 24-hour setting (Android.is24h), else the locale's: only for saves from before the Time format
   setting, so they keep what they showed */
function phoneClock() {
  try {
    const h24 =
      window.Android && Android.is24h
        ? !!Android.is24h()
        : !/^h1[12]$/.test(new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle);
    return h24 ? "24" : "12";
  } catch (e) {
    return "24";
  }
}
const timeLabel = hm => {
  const [h, m] = hm.split(":").map(Number),
    h24 = is24h();
  return new Date(2024, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: h24 ? "2-digit" : "numeric",
    minute: "2-digit",
    hourCycle: h24 ? "h23" : "h12",
  });
};
/* The time picker: scroll wheels like the phone's own clock (hours : minutes, plus AM/PM with Settings → Region's
   12-hour time), the centre row bold, its neighbours faded. Each wheel is a scroll-snap list with one blank row above
   and below, so row i is centred at scrollTop = i·W_ROW. Hours and minutes wrap around: they are listed three times
   and quietly moved back to the middle copy once scrolling settles. Every row passed ticks (buzz). OK hands "HH:MM"
   to onPick. */
const W_ROW = 56;
let TP = null;
function timePicker(title, cur, onPick) {
  const [h, m] = cur.split(":").map(Number),
    h24 = is24h();
  const cols = [
    {
      id: "h",
      label: "Hour",
      vals: h24 ? [...Array(24).keys()] : [12, ...Array.from({ length: 11 }, (_, i) => i + 1)],
    },
    { id: "m", label: "Minute", vals: [...Array(60).keys()] },
  ];
  if (!h24) cols.push({ id: "ap", label: "AM or PM", vals: ["AM", "PM"] });
  cols.forEach(c => {
    c.loop = c.id !== "ap";
    c.copies = c.loop ? 3 : 1;
    const v = c.id === "h" ? (h24 ? h : h % 12 || 12) : c.id === "m" ? m : h < 12 ? "AM" : "PM";
    c.idx = (c.loop ? c.vals.length : 0) + c.vals.indexOf(v);
  });
  const txt = (c, v) => (c.id === "ap" ? v : c.id === "h" && !h24 ? String(v) : pad(v));
  TP = { cols, onPick, txt };
  const col = c => {
    let rows = "";
    for (let i = 0; i < c.vals.length * c.copies; i++)
      rows +=
        '<div class="witem' +
        (i === c.idx ? " sel" : "") +
        '" data-act="tp-row" aria-hidden="true" data-v="' +
        c.id +
        ":" +
        i +
        '">' +
        esc(txt(c, c.vals[i % c.vals.length])) +
        "</div>";
    return (
      '<div class="wcol' +
      (c.loop ? "" : " ap") +
      '" id="tp-' +
      c.id +
      /* a spin button for screen readers: ↑/↓ (or TalkBack's adjust) step it, the value is read out */
      '" tabindex="0" role="spinbutton" aria-label="' +
      c.label +
      '" ' +
      wheelAria(c) +
      '><div class="wpad"></div>' +
      rows +
      '<div class="wpad"></div></div>'
    );
  };
  $("#pop").innerHTML =
    '<div class="pop scrim" data-act="pop-bg"><div class="dialog tp" role="dialog" aria-modal="true" aria-label="' +
    esc(title) +
    '"><div class="dp-h"><div class="t">' +
    esc(title) +
    '</div></div><div class="wheel">' +
    col(cols[0]) +
    '<span class="wsep">:</span>' +
    cols.slice(1).map(col).join("") +
    '</div><div class="dlg-act"><button class="btn text" data-act="pd-close">Cancel</button>' +
    '<button class="btn text" data-act="tp-ok">OK</button></div></div></div>';
  cols.forEach(c => {
    const el = $("#tp-" + c.id);
    el.scrollTop = c.idx * W_ROW;
    el.addEventListener("scroll", () => wheelScrolled(c, el));
  });
}
/* the wheel's value for screen readers (its rows are hidden from them) */
function wheelAria(c) {
  const len = c.vals.length,
    v = c.vals[c.idx % len];
  return (
    'aria-valuemin="0" aria-valuemax="' +
    (len - 1) +
    '" aria-valuenow="' +
    (c.idx % len) +
    '" aria-valuetext="' +
    esc(TP.txt(c, v)) +
    '"'
  );
}
/* live: the row now in the middle is highlighted and ticks; once still, a wrapping wheel moves back to its middle copy */
function wheelScrolled(c, el) {
  const n = c.vals.length * c.copies,
    i = Math.max(0, Math.min(n - 1, Math.round(el.scrollTop / W_ROW)));
  if (i !== c.idx) {
    const rows = el.querySelectorAll(".witem");
    rows[c.idx].classList.remove("sel");
    rows[i].classList.add("sel");
    c.idx = i;
    el.setAttribute("aria-valuenow", i % c.vals.length);
    el.setAttribute("aria-valuetext", TP ? TP.txt(c, c.vals[i % c.vals.length]) : "");
    buzz("tick");
  }
  clearTimeout(c.t);
  c.t = setTimeout(() => {
    const len = c.vals.length;
    if (!c.loop || !TP || (c.idx >= len && c.idx < 2 * len)) return;
    const j = len + (c.idx % len),
      rows = el.querySelectorAll(".witem");
    rows[c.idx].classList.remove("sel");
    rows[j].classList.add("sel");
    el.scrollTop += (j - c.idx) * W_ROW;
    c.idx = j;
  }, 120);
}
/* a tap on a faded row, or ↑/↓ on a focused wheel: glide that row to the middle */
function wheelTo(id, i) {
  const c = TP && TP.cols.find(x => x.id === id),
    el = $("#tp-" + id);
  if (!c || !el) return;
  el.scrollTo({ top: Math.max(0, Math.min(c.vals.length * c.copies - 1, i)) * W_ROW, behavior: "smooth" });
}
function wheelRow(v) {
  const [id, i] = v.split(":");
  wheelTo(id, +i);
}
function wheelStep(id, d) {
  const c = TP && TP.cols.find(x => x.id === id);
  if (c) wheelTo(id, c.idx + d);
}
function timeOk() {
  if (!TP) return;
  const val = id => {
    const c = TP.cols.find(x => x.id === id),
      el = $("#tp-" + id);
    return c && c.vals[Math.round(el.scrollTop / W_ROW) % c.vals.length];
  };
  let h = val("h");
  const ap = val("ap"),
    m = val("m"),
    pick = TP.onPick;
  if (ap) h = (h % 12) + (ap === "PM" ? 12 : 0);
  closePop();
  pick(pad(h) + ":" + pad(m));
}
const closePop = () => {
  $("#pop").innerHTML = "";
  PD = null;
  TP = null;
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
  if (dayPending) {
    dayPending = false; // the day changed under the sheet: Home catches up now
    setTimeout(render, 0);
  }
  /* came from another sheet (the entries list, a loan): go back to it (after a save/delete has been applied), not to
     Home */
  if (BACKTO) {
    const b = BACKTO;
    BACKTO = null;
    setTimeout(() => {
      if (!$("#sheet").innerHTML && V.screen === b.screen) b.open();
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
  "USD",
  "EUR",
  "JPY",
  "GBP",
  "CNY",
  "INR",
  "CAD",
  "AUD",
  "CHF",
  "HKD",
  "SGD",
  "KRW",
  "BRL",
  "MXN",
  "ZAR",
  "AED",
  "SAR",
  "TRY",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RUB",
  "UAH",
  "IDR",
  "MYR",
  "THB",
  "PHP",
  "VND",
  "PKR",
  "BDT",
  "LKR",
  "NPR",
  "NGN",
  "EGP",
  "KES",
  "ARS",
  "CLP",
  "COP",
  "ILS",
  "QAR",
  "KWD",
];
let CURPICK = null,
  curDN,
  regDN,
  curRegions = null,
  curAll = null;
const curSyms = {};
/* the name in the phone's language, else Tally's English one (Android's web view has names for few currencies) */
function curName(c) {
  try {
    curDN = curDN || new Intl.DisplayNames(undefined, { type: "currency" });
    const n = curDN.of(c);
    if (n && n !== c) return n;
  } catch (e) {}
  return CUR_EN[c] || "";
}
function curSym(c) {
  if (c in curSyms) return curSyms[c];
  let s = "";
  try {
    const p = new Intl.NumberFormat(undefined, { style: "currency", currency: c, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find(x => x.type === "currency");
    if (p && p.value === c) s = LOCAL_SYM[c] || "";
    else if (p && canDraw(p.value)) s = p.value; // no symbol rather than a tofu box
  } catch (e) {}
  return (curSyms[c] = s);
}
/* the countries (ISO 3166 codes) that use currency c today: none for a retired one */
function curRegionsOf(c) {
  if (!curRegions) {
    curRegions = {};
    for (const r in REGIONS) REGIONS[r][1].split(" ").forEach(k => (curRegions[k] = curRegions[k] || []).push(r));
  }
  return curRegions[c] || [];
}
/* the countries that use currency c, each as its name in the phone's language (where the phone has one) and its
   English names, "|" between them */
function curCountries(c) {
  return curRegionsOf(c).map(r => {
    let n = "";
    try {
      regDN = regDN || new Intl.DisplayNames(undefined, { type: "region" });
      n = regDN.of(r);
    } catch (e) {}
    return (n && n !== r ? n + "|" : "") + REGIONS[r][0];
  });
}
const curLabel = c => {
  const n = curName(c);
  return n ? c + " · " + n : c;
};
function allCurs() {
  if (!curAll) {
    let l = Object.keys(CUR_EN); // what the phone lists (Chrome 99+), and Tally's own list for what it leaves out
    try {
      if (Intl.supportedValuesOf) l = [...new Set(Intl.supportedValuesOf("currency").concat(l))];
    } catch (e) {}
    const name = new Map(l.map(c => [c, curName(c) || c])),
      coll = new Intl.Collator();
    const rest = l.filter(c => !MAJOR.includes(c)).sort((a, b) => coll.compare(name.get(a), name.get(b)));
    curAll = MAJOR.concat(rest);
  }
  return curAll;
}
/* text as the search compares it: lower case, without accents, apostrophes or full-width forms, letters with a stroke
   spelled plainly and "&" as "and" ("Panameño" → "panameno", "Côte d’Ivoire" → "cote divoire", "ＵＳＤ" → "usd") */
const PLAIN = { ı: "i", ł: "l", đ: "d", ø: "o", æ: "ae", œ: "oe", ß: "ss", þ: "th" };
const curFold = t =>
  String(t)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f'‘’`´ʻʼ]/g, "")
    .replace(/[ıłđøæœßþ]/g, ch => PLAIN[ch])
    .replace(/&/g, " and ");
/* words, vowel signs and other combining marks included (Hindi, Thai) */
const curWords = t => t.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
/* each currency's search text, folded once: its code and sign, the words of its names, then those of each country
   using it (the euro: 39) */
const CURQ = new Map();
function curText(c) {
  let t = CURQ.get(c);
  if (!t) {
    const words = s => curWords(curFold(s));
    t = {
      sign: curFold(c + " " + curSym(c)),
      own: words([c, curSym(c), ...new Set([curName(c), CUR_EN[c] || ""])].join(" ")),
      lands: curCountries(c).map(words),
    };
    CURQ.set(c, t);
  }
  return t;
}
/* how well currency c answers the search q, best first (0: not at all):
   6 the code itself; 5.5 its code or sign holds the search ("B/.", "Q"); 5 every word typed starts a word of its code,
   sign or name (the phone's language or English); 4 the same in a country that uses it; 3 a typed word starts with a
   word of its name of 4 letters or more, so plurals and other endings match ("quetzales" finds the Guatemalan
   quetzal); 2 the same for a country. A retired currency (the kuna) ranks below the ones that replaced it. */
function curMatch(c, q) {
  q = curFold(q).trim();
  if (!q) return 6;
  const t = curText(c),
    qw = curWords(q),
    starts = w => qw.every(x => w.some(n => n.startsWith(x))),
    ends = w => qw.every(x => w.some(n => n.startsWith(x) || (n.length >= 4 && x.startsWith(n))));
  if (!qw.length) qw.push(q); // only punctuation: a sign, or nothing
  const s =
    q === curFold(c)
      ? 6
      : t.sign.includes(q)
        ? 5.5
        : starts(t.own)
          ? 5
          : t.lands.some(starts)
            ? 4
            : ends(t.own)
              ? 3
              : t.lands.some(ends)
                ? 2
                : 0;
  return s && s < 6 && !curRegionsOf(c).length ? s - 2.5 : s;
}
function curPicker(current, onPick, title) {
  openSheet2(
    title || "Currency",
    '<div class="qbar"><input id="cur-q" type="search" placeholder="Search name, code or country" autocomplete="off" aria-label="Search currency"></div><div id="curlist" data-cur="' +
      esc(current) +
      '"></div>'
  );
  CURPICK = onPick;
  curList("");
  // the first search builds every currency's search text: do it while the list is only being looked at
  if (window.requestIdleCallback) requestIdleCallback(() => allCurs().forEach(curText));
}
function curList(q) {
  const box = $("#curlist");
  if (!box) return;
  const cur = box.dataset.cur;
  const row = c =>
    '<button class="tx" data-act="cur-pick" data-v="' +
    esc(c) +
    '"><span class="code">' +
    esc(c) +
    '</span><span class="mid"><div class="d" dir="auto">' +
    esc(curName(c) || c) +
    '</div></span><span class="a muted">' +
    esc(curSym(c)) +
    "</span>" +
    (c === cur ? ic("check") : "") +
    "</button>";
  let h = "";
  const sec = (title, l) => {
    if (l.length)
      h += '<div class="day"><span>' + title + '</span></div><div class="list">' + l.map(row).join("") + "</div>";
  };
  const used = S.accounts.concat(S.assets).map(a => a.currency),
    inUse = [...new Set([cur, S.settings.cur].concat(used))].filter(Boolean),
    all = allCurs();
  if (q.trim()) {
    /* best match first (curMatch): "Panama" lists the balboa, then the US dollar; Enter picks the first */
    const rank = new Map([...new Set(inUse.concat(all))].map(c => [c, curMatch(c, q)]));
    sec(
      "Results",
      [...rank.keys()].filter(c => rank.get(c)).sort((a, b) => rank.get(b) - rank.get(a))
    );
  } else {
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
/* where closing the sheet goes back to, {screen, open} (see closeSheet) */
let BACKTO = null;
