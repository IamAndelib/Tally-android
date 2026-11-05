/*
 * period.js — What Home and History are looking at: the view state (V for Home, HP for History), period maths (day / range /
 * month / year) and the Day | Range | Month | Year dialog.
 */
"use strict";

function viewCur() {
  const cs = currencies();
  if (V.cur && cs.includes(V.cur)) return V.cur;
  if (cs.includes(S.settings.cur)) return S.settings.cur;
  return cs[0] || S.settings.cur;
}
const V = {
  showCleared: false,
  screen: "home",
  period: "day",
  anchor: today(),
  rs: null,
  re: null,
  cur: null,
  showArchived: false,
  sel: null,
};
/* Home (V) and History (HP) each have their own period: {period:"day"|"range"|"month"|"year", anchor, rs, re}; History
   alone also has "all" (all time, its default), which Home never takes. Only Home steps (‹ ›, swipes); History's
   period is picked in the dialog */
const HP = {};
const histAllTime = () => Object.assign(HP, { period: "all", anchor: today(), rs: null, re: null });
histAllTime();
function range(p = V) {
  const a = p.anchor;
  if (p.period === "all") return ["0000-01-01", "9999-12-31"];
  if (p.period === "day") return [a, a];
  if (p.period === "range") return [p.rs, p.re];
  if (p.period === "year") return [a.slice(0, 4) + "-01-01", a.slice(0, 4) + "-12-31"];
  const m = a.slice(0, 7);
  return [m + "-01", monthEnd(m)];
}
function periodLabel(p = V) {
  return capFirst(periodText(p));
}
function periodText(p) {
  const t = today(),
    [s, e] = range(p);
  if (p.period === "all") return T("history.allTime");
  if (p.period === "day") return dayName(p.anchor);
  if (p.period === "range") return s === e ? dayName(s) : rangeLabel(s, e);
  if (p.period === "year") return p.anchor.slice(0, 4);
  const m = p.anchor.slice(0, 7);
  if (p === HP || m.slice(0, 4) === t.slice(0, 4)) return monthLabel(m, p === HP);
  return parseISO(m + "-01").toLocaleDateString(DATE_LOC, { month: "short", year: "numeric" });
}
function shiftPeriod(n) {
  const p = V;
  if (p.period === "day") p.anchor = addDays(p.anchor, n);
  else if (p.period === "range") {
    const len = daysBetween(p.rs, p.re) + 1;
    p.rs = addDays(p.rs, n * len);
    p.re = addDays(p.re, n * len);
    if (p.re > today()) {
      p.re = today();
      p.rs = addDays(p.re, 1 - len);
    }
    return;
  } else if (p.period === "year") p.anchor = +p.anchor.slice(0, 4) + n + "-01-01";
  else p.anchor = shiftMonth(p.anchor.slice(0, 7), n) + "-01";
  if (p.anchor > today()) p.anchor = today();
}
const canNext = () => range(V)[1] < today();
/* what Home opens on (Settings → Region): today, this month or this year; its Today chip comes back to it */
function homePeriod() {
  V.period = S.settings.home;
  V.anchor = today();
}
const atHomePeriod = () => {
  const [s, e] = range(),
    t = today();
  return V.period === S.settings.home && s <= t && t <= e;
};
/* the date a new entry gets: the day being looked at (today when it is in view) */
function entryDate() {
  const t = today(),
    [s, e] = range(); // a day: both are that day
  return t >= s && t <= e ? t : e;
}
/* A new day, at midnight with the app open or on coming back to it. Home jumps to today (a range ending on the day
   that ended moves to end today), History leaves that day's month for this one, and an open form's dates move too:
   the latest day it allows, and a new entry's untouched "today". Widget and reminders follow; with a sheet open,
   Home redraws once it closes. */
let lastDay = today(),
  dayPending = false;
function catchUpToday() {
  const t = today(),
    was = lastDay;
  if (t === was) return;
  lastDay = t;
  if (V.period !== "range") V.anchor = t;
  else if (V.re === was) {
    V.rs = addDays(V.rs, daysBetween(was, t));
    V.re = t;
  }
  /* History likewise (all time stays): its year, its month, its day, or a range that ended today */
  if (HP.period === "year" && HP.anchor.slice(0, 4) === was.slice(0, 4)) HP.anchor = t;
  else if (HP.period === "month" && HP.anchor.slice(0, 7) === was.slice(0, 7)) HP.anchor = t;
  else if (HP.period === "day" && HP.anchor === was) HP.anchor = t;
  else if (HP.period === "range" && HP.re === was) {
    HP.rs = addDays(HP.rs, daysBetween(was, t));
    HP.re = t;
  }
  document.querySelectorAll(".datefld").forEach(el => {
    if (el.dataset.max === was) el.dataset.max = t;
    if (el.dataset.minToday) el.dataset.min = t;
    if (el.dataset.now) setDateField(el, t, true);
  });
  /* an open date or period picker: today's ring, its Today button and the first and latest days it allows */
  if (DP && $("#dp")) {
    if (DP.max === was) DP.max = t;
    if (DP.minToday) DP.min = t;
    dpRender();
  }
  if (PD && $("#pd")) pdRender();
  syncWidget();
  syncReminders();
  if ($("#sheet").innerHTML) dayPending = true;
  else render();
}
/* at each local midnight (a second past it) while Tally is open */
function armMidnight() {
  const d = new Date();
  d.setHours(24, 0, 1, 0);
  setTimeout(() => {
    catchUpToday();
    armMidnight();
  }, d - Date.now());
}
function periodTxns() {
  const [s, e] = range();
  return S.txns.filter(t => t.date >= s && t.date <= e);
}
/* period picker: Day / Range / Month / Year. yEnd: the last of the 12 years the Year tab shows (this year's page first) */
let PD = null;
function periodDialog(p) {
  const ref = p.period === "range" ? p.re : p.anchor,
    now = +today().slice(0, 4);
  PD = { p, tab: p.period === "all" ? "month" : p.period, month: ref.slice(0, 7), year: +ref.slice(0, 4), pick: null };
  PD.yEnd = now - Math.floor(Math.max(0, now - PD.year) / 12) * 12;
  $("#pop").innerHTML =
    '<div class="pop scrim" data-act="pop-bg"><div class="dialog" id="pd" role="dialog" aria-modal="true" aria-label="' +
    TH("period.title") +
    '"></div></div>';
  pdRender();
}
function pdRender() {
  keepFocus($("#pd"), drawPd);
}
function drawPd() {
  const el = $("#pd");
  if (!el) return;
  const t = today(),
    tm = t.slice(0, 7);
  let h =
    '<div class="seg">' +
    ["day", "range", "month", "year"]
      .map(
        k =>
          '<button data-act="pd-tab" data-v="' +
          k +
          '" aria-pressed="' +
          (PD.tab === k) +
          '">' +
          TH("period." + k) +
          "</button>"
      )
      .join("") +
    "</div>";
  if (PD.tab === "month") {
    h +=
      '<div class="cal-h"><button class="icon" data-act="pd-year" data-v="-1" aria-label="' +
      TH("period.prevYear") +
      '">' +
      ic("left") +
      "</button><b>" +
      PD.year +
      '</b><button class="icon" data-act="pd-year" data-v="1" aria-label="' +
      TH("period.nextYear") +
      '"' +
      (PD.year >= +t.slice(0, 4) ? " disabled" : "") +
      ">" +
      ic("right") +
      "</button></div>";
    h +=
      '<div class="mgrid">' +
      Array.from({ length: 12 }, (_, i) => {
        const m = PD.year + "-" + pad(i + 1);
        const cls = [PD.p.period === "month" && PD.p.anchor.slice(0, 7) === m ? "sel" : "", m === tm ? "now" : ""]
          .join(" ")
          .trim();
        return (
          '<button class="' +
          cls +
          '" data-act="pd-month" data-v="' +
          m +
          '"' +
          (m > tm ? " disabled" : "") +
          ">" +
          esc(capFirst(new Date(PD.year, i, 1).toLocaleDateString(DATE_LOC, { month: "short" }))) +
          "</button>"
        );
      }).join("") +
      "</div>";
  } else if (PD.tab === "year") {
    /* 12 years like the month grid: this one ringed, the one shown picked, years with nothing written down faded */
    const now = +t.slice(0, 4),
      used = new Set(S.txns.map(x => +x.date.slice(0, 4)));
    h +=
      '<div class="cal-h"><button class="icon" data-act="pd-years" data-v="-12" aria-label="' +
      TH("period.earlierYears") +
      '">' +
      ic("left") +
      "</button><b>" +
      (PD.yEnd - 11) +
      " – " +
      PD.yEnd +
      '</b><button class="icon" data-act="pd-years" data-v="12" aria-label="' +
      TH("period.laterYears") +
      '"' +
      (PD.yEnd >= now ? " disabled" : "") +
      ">" +
      ic("right") +
      "</button></div>" +
      '<div class="mgrid">' +
      Array.from({ length: 12 }, (_, i) => {
        const y = PD.yEnd - 11 + i,
          cls = [
            PD.p.period === "year" && +PD.p.anchor.slice(0, 4) === y ? "sel" : "",
            y === now ? "now" : "",
            used.has(y) ? "" : "dim",
          ]
            .join(" ")
            .trim();
        return (
          '<button class="' +
          cls +
          '" data-act="pd-yr" data-v="' +
          y +
          '"' +
          (y > now ? " disabled" : "") +
          ">" +
          y +
          "</button>"
        );
      }).join("") +
      "</div>";
  } else
    h +=
      calendar() +
      (PD.tab === "range"
        ? '<p class="hint" id="pd-hint" style="text-align:center">' +
          (PD.pick ? TH("period.rangeEnd") : TH("period.rangeHint")) +
          "</p>"
        : "");
  h +=
    '<div class="dlg-act"><button class="btn text" data-act="pd-today">' +
    TH("day.today") +
    '</button><button class="btn text" data-act="pd-close">' +
    TH("common.cancel") +
    "</button></div>";
  el.innerHTML = h;
  el.classList.toggle("rg", PD.tab === "range"); // dragging across days: the calendar doesn't scroll
  fitCal(el);
  fitFigures(el); // its four tabs on a small phone at a large text size
}
function calendar() {
  const rg = PD.tab === "range",
    p = PD.p;
  return calGrid(PD.month, {
    act: rg ? "pd-rday" : "pd-day",
    monAct: "pd-mon",
    max: today(),
    sel: !rg && p.period === "day" ? p.anchor : null,
    hs: rg ? PD.pick || (p.period === "range" ? p.rs : null) : null,
    he: rg ? PD.pick || (p.period === "range" ? p.re : null) : null,
  });
}
/* live range highlight while dragging, without rebuilding the dialog */
function pdPaint(s, e) {
  $("#pd")
    .querySelectorAll(".dd")
    .forEach(b => {
      const d = b.dataset.v;
      b.classList.toggle("rs", d === s);
      b.classList.toggle("re", d === e);
      b.classList.toggle("in", d > s && d < e);
    });
}
/* apply a choice from the dialog to the period it was opened for */
function setPeriod(o) {
  const p = PD.p;
  Object.assign(p, o);
  closePop();
  if (V.sel) V.sel = new Set();
  render();
}
function applyRange(a, b) {
  let s = a < b ? a : b,
    e = a < b ? b : a;
  const t = today();
  if (e > t) e = t;
  if (s > e) s = e;
  setPeriod({ period: "range", rs: s, re: e });
}
