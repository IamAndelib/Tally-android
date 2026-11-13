/*
 * summary.js — The spending summary opened by tapping the donut: one day's or one month's categories as a pie,
 * 8 weeks as rows or a year's months as bars, with a comparison to the period before; under it the parts (categories,
 * then Charges), each a row that opens in place to its newest entries and "Show all … in History".
 */
"use strict";

let SM = null;
/* a bar's label, the same in Weeks and Year: the whole amount grouped the phone's way, no currency sign (the title
   names the currency), and compact ("12.4K") only from five digits. TalkBack and the figure under the chart keep the
   exact amount. */
let BARNUM = null;
const compact = n => {
  n = Math.round(n) || 0; // never "-0"
  try {
    BARNUM = BARNUM || {
      whole: new Intl.NumberFormat(LOC.fmt, { maximumFractionDigits: 0 }),
      short: new Intl.NumberFormat(LOC.fmt, { notation: "compact", maximumSignificantDigits: 3 }),
    };
    return (Math.abs(n) >= 10000 ? BARNUM.short : BARNUM.whole).format(n);
  } catch (e) {
    return String(n);
  }
};
/* weeks start on the day chosen in Settings → Region */
const weekStart = d => addDays(d, -((parseISO(d).getDay() - S.settings.week + 7) % 7));
function summarySheet() {
  const [, e] = range(),
    t = today();
  /* open: the part whose row shows its entries (smToggle), one at a time; span: the days on screen (drawSm) */
  SM = { mode: { month: "m", year: "y" }[V.period] || "d", end: e > t ? t : e, sel: null, cur: viewCur(), open: null };
  openSheet(
    T("summary.title") + (currencies().length > 1 ? " · " + SM.cur : ""),
    '<div class="seg">' +
      ["d", "w", "m", "y"]
        .map(
          k =>
            '<button data-act="sm-mode" data-v="' +
            k +
            '" aria-pressed="' +
            (SM.mode === k) +
            '">' +
            TH("summary.mode." + k) +
            "</button>"
        )
        .join("") +
      '</div><div id="sm"></div>'
  );
  smRender();
}
/* the buckets on screen, oldest first, plus one before them (for "vs last ..."): Days and Months show one */
function smBuckets() {
  const t = today(),
    e = SM.end,
    out = [];
  if (SM.mode === "d")
    for (let i = 1; i >= 0; i--) {
      const d = addDays(e, -i);
      out.push({ s: d, e: d, full: dayName(d) });
    }
  else if (SM.mode === "w") {
    const w = weekStart(e);
    for (let i = 8; i >= 0; i--) {
      const s = addDays(w, -7 * i);
      out.push({
        s,
        e: addDays(s, 6),
        x: parseISO(s).toLocaleDateString(DATE_LOC, { day: "numeric", month: "short" }),
        full: T("summary.weekOf", {
          date: parseISO(s).toLocaleDateString(DATE_LOC, { day: "numeric", month: "short" }),
        }),
      });
    }
  } else {
    const m0 = e.slice(0, 7);
    for (let i = 6; i >= 0; i--) {
      const m = shiftMonth(m0, -i);
      out.push({
        s: m + "-01",
        e: monthEnd(m),
        x: capFirst(parseISO(m + "-01").toLocaleDateString(DATE_LOC, { month: "short" })),
        full: capFirst(monthLabel(m)),
      });
    }
  }
  const sp = spendItems(SM.cur);
  out.forEach(b => {
    b.list = sp.filter(x => x.date >= b.s && x.date <= b.e);
    b.v = rnd(b.list.reduce((q, x) => q + x.amount, 0));
    const last = b.e < t ? b.e : t;
    b.days = last < b.s ? 0 : daysBetween(b.s, last) + 1;
  });
  return out;
}
/* the parts of a set of spending (spendItems()) as [id, amount]: its categories, biggest first, then CHARGES (the
   charges outside purchases), whatever its size (docs/specs/charges.md, Summary) */
function catSplit(list) {
  const m = {};
  list.forEach(x => (m[x.cat] = (m[x.cat] || 0) + x.amount));
  return Object.entries(m)
    .map(([k, v]) => [k, rnd(v)])
    .filter(([k, v]) => k !== CHARGES || v > 0)
    .sort((p, q) => (p[0] === CHARGES) - (q[0] === CHARGES) || q[1] - p[1]);
}
/* a part's name: a category's, or the word Charges (no category: no emblem, never renamed) */
const partName = k => (k === CHARGES ? T("summary.charges") : catName(cat(k)));
/* one line of Summary's list: the emblem (for Charges, a grey dot in its place), the name, its share on Days, Months
   and Year ("<1%"), a bar in the part's colour (sliceCol), the amount and a chevron. A button: a tap shows that part's
   entries under it (smToggle, smEntries), the chevron turned up. TalkBack hears the whole line as one sentence,
   "Charges, ৳158.00, less than 1%", and whether it is expanded. */
function smRow([k, v], total, share) {
  const name = partName(k),
    amount = money(v, SM.cur),
    p = (v / total) * 100,
    small = p < 1,
    pct = percent(small ? 1 : Math.round(p)),
    open = SM.open === k;
  return (
    '<button class="tx smx" data-act="sm-part" data-v="' +
    esc(k) +
    '" aria-expanded="' +
    open +
    '" aria-label="' +
    esc(
      share
        ? T("summary.sayShare", { name, amount, share: small ? T("summary.under", { pct }) : pct })
        : T("summary.say", { name, amount })
    ) +
    '"><span class="smi">' +
    (k === CHARGES ? '<i class="chdot" style="background:' + CHARGES_C + '"></i>' : emblem(cat(k), "em")) +
    '</span><span class="mid"><span class="d" dir="auto">' +
    esc(name) +
    (share ? ' <span class="muted small">' + esc((small ? "<" : "") + pct) + "</span>" : "") +
    '</span><span class="pbar"><span style="width:' +
    p.toFixed(1) +
    "%;background:" +
    sliceCol(k) +
    '"></span></span></span><span class="a">' +
    esc(amount) +
    "</span>" +
    ic("down").replace('class="ic"', 'class="ic chev"') +
    "</button>" +
    (open ? smEntries(k) : "")
  );
}
/* The entries behind part k on screen (SM.span), from the very items Summary adds up (spendItems()), one row per entry,
   newest first: a purchase with its charge as one row with both (its whole amount in its category); on Charges, the
   entry a charge was paid with (a transfer, a loan payment) with that charge, or the loan entry a charge is worked out on
   (loanParts()): a charge covered by credit, on the later draw it is dated on (at), as History lists it. Only the Summary's currency; an archived entry is not listed, as in History, though it counts. */
function smPartRows(k) {
  const [s, e] = SM.span,
    by = new Map();
  spendItems(SM.cur).forEach(x => {
    const t = x.cat === k && x.date >= s && x.date <= e && entry(x.at || x.of);
    if (!t) return;
    const r = histHost(t) || t,
      g = by.get(r.id) || { t: r, date: x.date, amount: 0 };
    g.amount += x.amount;
    if (x.date > g.date) g.date = x.date;
    by.set(r.id, g);
  });
  return [...by.values()]
    .filter(g => !g.t.archived)
    .map(g => ({ ...g, amount: rnd(g.amount) }))
    .sort((a, b) => cmpDay(b.date, a.date) || (b.t.ts || 0) - (a.t.ts || 0));
}
/* History's filters and period for part k on screen: the category on Spent, or the Charges kind (which also lists the
   purchases with a charge, counted here in their categories); the day, the week (a date range), the month or the year */
function smHist(k) {
  const [s, e] = SM.span,
    f = k === CHARGES ? { kind: "charges" } : { kind: "out", cat: k },
    p =
      SM.mode === "w"
        ? { period: "range", anchor: s, rs: s, re: e }
        : { period: { d: "day", m: "month", y: "year" }[SM.mode], anchor: s, rs: null, re: null };
  return [f, p];
}
/* what History lists for part k (smHist), counted as History counts its rows (histRows) */
function smHistCount(k) {
  const [f, p] = smHist(k),
    [s, e] = range(p),
    hf = { ...histBlank(), ...f };
  return histRows(S.txns.filter(t => t.date >= s && t.date <= e && histMatch(t, hf))).length;
}
/* An opened part (docs/specs/charges.md, Summary): its 5 newest entries, read-only, each as History's two lines without
   the category (the row above names it): what it was | the amount it counts here (no sign: it is all spending), then
   the day it counts on (Days: the time it was written down, with its date when that was another day) and the account; then, past 5, "Show all 8 in History".
   A part whose every entry is archived (they still count) says so in one line. */
const SM_SHOW = 5;
function smEntries(k) {
  const rows = smPartRows(k),
    when = g => {
      if (SM.mode !== "d" || !g.t.ts) return shortDay(g.date);
      const w = new Date(g.t.ts);
      /* written on another day than it counts on: that day and the time (History's "Added … at …") */
      return iso(w) === g.date
        ? clockTime(g.t.ts)
        : T("backup.when", {
            day: w.toLocaleDateString(DATE_LOC, { day: "numeric", month: "short" }),
            time: clockTime(g.t.ts),
          });
    };
  return (
    '<div class="smo"><div class="list" data-tight="13">' +
    rows
      .slice(0, SM_SHOW)
      .map(
        g =>
          '<div class="tx en" data-v="' +
          esc(g.t.id) +
          '"><span class="mid"><span class="d" dir="auto">' +
          txTitle(g.t) +
          '</span><span class="a">' +
          esc(money(g.amount, SM.cur)) +
          '</span><span class="s">' +
          esc(when(g)) +
          " \u00b7 " +
          accTag(acc(g.t.account)) +
          "</span></span></div>"
      )
      .join("") +
    "</div>" +
    (rows.length ? "" : '<p class="smnone muted small">' + TH("history.none.archived") + "</p>") +
    (rows.length > SM_SHOW
      ? '<button class="btn text" data-act="sm-all" data-v="' +
        esc(k) +
        '">' +
        TH("summary.showAll", { count: smHistCount(k) }) +
        "</button>"
      : "") +
    "</div>"
  );
}
/* a tap on part k's row: its entries show under it, or go; another part's close. The row tapped stays where it is on
   screen (the sheet scrolls by what closed above it), and keeps the focus. */
function smToggle(k) {
  const row = [...document.querySelectorAll("#sm .smx")].find(r => r.dataset.v === k);
  if (!row) return;
  const sc = row.closest(".p"),
    y = row.getBoundingClientRect().top;
  SM.open = SM.open === k ? null : k;
  document.querySelectorAll("#sm .smo").forEach(o => o.remove());
  document.querySelectorAll('#sm .smx[aria-expanded="true"]').forEach(r => r.setAttribute("aria-expanded", "false"));
  if (SM.open) {
    row.setAttribute("aria-expanded", "true");
    row.insertAdjacentHTML("afterend", smEntries(k));
    smFitOpen();
  }
  if (sc) sc.scrollTop += row.getBoundingClientRect().top - y;
}
/* "Show all" under part k: History with that part's filters and period */
function smAll(k) {
  const [f, p] = smHist(k);
  closeSheet();
  openHistory(f, p);
}
/* a day or a month by category as a pie: category colours, true to size (a tiny share stays tiny), a hairline between
   slices. The names, shares and amounts are in the list under it, so the drawing is hidden from screen readers. */
function smPie(split, total) {
  const RP = 48,
    pt = a => (50 + RP * Math.cos(a)).toFixed(2) + " " + (50 + RP * Math.sin(a)).toFixed(2);
  let at = -Math.PI / 2,
    segs = "";
  if (split.length === 1)
    segs =
      '<circle cx="50" cy="50" r="' +
      RP +
      '" fill="' +
      sliceCol(split[0][0]) +
      '"><title>' +
      esc(partName(split[0][0])) +
      "</title></circle>";
  else
    split.forEach(([k, v]) => {
      const a1 = at + (v / total) * 2 * Math.PI;
      segs +=
        '<path d="M50 50L' +
        pt(at) +
        "A" +
        RP +
        " " +
        RP +
        " 0 " +
        (a1 - at > Math.PI ? 1 : 0) +
        " 1 " +
        pt(a1) +
        'Z" fill="' +
        sliceCol(k) +
        '" stroke="var(--surface-high, var(--surface))" stroke-width="0.6" stroke-linejoin="round"><title>' +
        esc(partName(k)) +
        "</title></path>";
      at = a1;
    });
  return '<div class="smpie"><svg viewBox="0 0 100 100" aria-hidden="true">' + segs + "</svg></div>";
}
function smRender() {
  keepFocus($("#sm"), drawSm);
}
function drawSm() {
  const el = $("#sm");
  if (!el || !SM) return;
  if (SM.mode === "y") {
    drawSmYear(el);
    return;
  }
  /* Days and Months show one period (ONE): a pie, then every part with its share; Weeks, 8 rows to pick from */
  const all = smBuckets(),
    bars = all.slice(1),
    n = bars.length,
    t = today(),
    M = SM.mode === "m",
    ONE = M || SM.mode === "d";
  if (ONE || SM.sel == null || SM.sel >= n) SM.sel = n - 1;
  const max = Math.max(...bars.map(b => b.v), 0),
    i = SM.sel,
    b = bars[i],
    prev = all[i],
    cur = SM.cur;
  SM.span = [b.s, b.e];
  const later = bars[n - 1].e < t;
  let h =
    '<div class="cal-h"><button class="icon" data-act="sm-nav" data-v="-1" aria-label="' +
    TH("summary.earlier") +
    '">' +
    ic("left") +
    "</button><b>" +
    esc(capFirst(M ? monthLabel(b.s.slice(0, 7), true) : ONE ? b.full : smSpan(bars))) +
    '</b><button class="icon" data-act="sm-nav" data-v="1" aria-label="' +
    TH("summary.later") +
    '"' +
    (later ? "" : " disabled") +
    ">" +
    ic("right") +
    "</button></div>";
  const split = catSplit(b.list),
    /* nothing spent in all that the chart shows: no chart (the total, the message and the button say it) */
    none = ONE ? !b.v : !max;
  if (!none && SM.mode === "w")
    h +=
      '<div class="smchart smrows">' +
      bars
        .map((x, k) => {
          const pct = max ? (x.v / max) * 100 : 0;
          return (
            '<button class="smrow' +
            (k === i ? " on" : "") +
            '" aria-pressed="' +
            (k === i) +
            '" data-act="sm-pick" data-v="' +
            k +
            '" aria-label="' +
            TH("common.labelValue", { label: x.full, value: money(x.v, cur) }) +
            '">' +
            '<span class="x">' +
            esc(rangeLabel(x.s, x.e)) +
            '</span><span class="tr"><span class="b" style="width:' +
            (x.v ? Math.max(2, pct) : 0).toFixed(1) +
            '%"></span></span><span class="v">' +
            (x.v ? esc(compact(x.v)) : "–") +
            "</span></button>"
          );
        })
        .join("") +
      "</div>";
  else if (!none) h += '<div class="smchart">' + smPie(split, b.v) + "</div>";
  /* details for the chosen day, week or month */
  /* a week or month that isn't over yet is compared by its daily average, not its (still growing) total */
  const len = x => daysBetween(x.s, x.e) + 1,
    part = SM.mode !== "d" && b.days < len(b);
  let cmp = "";
  if (prev && prev.v > 0 && b.days > 0) {
    const p = Math.round(part ? (b.v / b.days / (prev.v / len(prev)) - 1) * 100 : ((b.v - prev.v) / prev.v) * 100);
    cmp = T("summary." + (p === 0 ? "same" : p > 0 ? "up" : "down") + "." + SM.mode, { pct: percent(Math.abs(p)) });
  }
  const avg = SM.mode !== "d" && b.days > 0 && b.v ? T("summary.avg", { amount: money(rnd(b.v / b.days), cur) }) : "";
  /* Weeks: the three top categories, then Charges; Days and Months: all of them, then Charges */
  const top = ONE
    ? split
    : split
        .filter(p => p[0] !== CHARGES)
        .slice(0, 3)
        .concat(split.filter(p => p[0] === CHARGES));
  h +=
    '<div class="smd">' +
    (ONE ? "" : '<div class="muted small">' + esc(b.full) + "</div>") +
    '<div class="big spent">' +
    esc(money(b.v, cur)) +
    "</div>" +
    [avg, cmp] // each on its own line, so a phrase is never split between two
      .filter(Boolean)
      .map(x => '<div class="muted small">' + esc(x) + "</div>")
      .join("") +
    "</div>";
  if (top.length) h += '<div class="list smtop">' + top.map(x => smRow(x, b.v, ONE)).join("") + "</div>";
  else
    h +=
      '<div class="empty" style="padding:16px">' +
      TH("summary.none." + SM.mode, { month: monthLabel(b.s.slice(0, 7)) }) +
      "</div>";
  h +=
    '<div class="gap"></div><button class="btn tonal" data-act="sm-open">' +
    TH("summary.open." + SM.mode) +
    "</button>";
  el.innerHTML = h;
  fitSmRows();
  smFitOpen(el);
}
/* an opened part's entries: under 13rem (a small phone, a large text size) its rows stack as a tight list's, a figure
   too wide is set smaller (fitFigures). Again on resize and when the font has loaded. */
function smFitOpen(el = $("#sm")) {
  const o = el && el.querySelector(".smo");
  if (!o) return;
  fitFigures(o);
  if (document.fonts && document.fonts.status === "loading") document.fonts.ready.then(() => smFitOpen());
}
/* The Weeks rows share one pair of columns, so every track starts and ends at the same place and equal amounts draw
   equal bars (subgrid is not in WebView 87): the widest label and figure, measured, go to the rows as --smx / --smv.
   A label wider than half the row wraps, in every row alike. Run again on resize and when the font has loaded. */
function fitSmRows() {
  const g = document.querySelector("#sm .smrows");
  if (!g) return;
  g.classList.add("meas");
  g.style.removeProperty("--smx");
  g.style.removeProperty("--smv");
  const w = sel => Math.max(0, ...[...g.querySelectorAll(sel)].map(e => e.getBoundingClientRect().width)),
    first = g.querySelector(".smrow"),
    cs = first && getComputedStyle(first),
    room = first
      ? first.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight) -
        2 * parseFloat(cs.columnGap || 10)
      : 0,
    v = Math.ceil(w(".v")),
    x = Math.ceil(Math.min(w(".x") + 1, room * 0.5));
  g.classList.remove("meas");
  if (room > 0) {
    g.style.setProperty("--smx", x + "px");
    g.style.setProperty("--smv", v + "px");
  }
  if (document.fonts && document.fonts.status === "loading" && !g.dataset.fw) {
    g.dataset.fw = "1";
    document.fonts.ready.then(fitSmRows);
  }
}
/* the Year tab: a year's 12 months as bars that swipe sideways (opening on this month), the year's spending against the
   year before (this year: against the same days of last year), and its categories. The bars are for looking only. */
function drawSmYear(el) {
  const t = today(),
    y = +SM.end.slice(0, 4),
    cur = SM.cur,
    part = y === +t.slice(0, 4),
    sp = spendItems(cur),
    sum = list => rnd(list.reduce((q, x) => q + x.amount, 0)),
    months = Array.from({ length: 12 }, (_, i) => y + "-" + pad(i + 1)),
    vals = months.map(m => sum(sp.filter(x => x.date.startsWith(m)))),
    max = Math.max(...vals, 0),
    list = sp.filter(x => x.date.startsWith(y + "-")),
    tot = sum(list),
    was = sum(sp.filter(x => x.date >= y - 1 + "-01-01" && x.date <= y - 1 + (part ? t.slice(4) : "-12-31")));
  SM.span = [y + "-01-01", y + "-12-31"];
  let cmp = "";
  if (was > 0 && tot > 0) {
    const p = Math.round(((tot - was) / was) * 100);
    cmp = T("summary." + (p === 0 ? "same" : p > 0 ? "up" : "down") + "." + (part ? "yp" : "y"), {
      pct: percent(Math.abs(p)),
      year: y - 1,
    });
  }
  let h =
    '<div class="cal-h"><button class="icon" data-act="sm-nav" data-v="-1" aria-label="' +
    TH("summary.earlier") +
    '">' +
    ic("left") +
    "</button><b>" +
    y +
    '</b><button class="icon" data-act="sm-nav" data-v="1" aria-label="' +
    TH("summary.later") +
    '"' +
    (part ? " disabled" : "") +
    ">" +
    ic("right") +
    "</button></div>" +
    (max ? '<div class="smchart smy" id="smy">' : "") +
    (max
      ? months
          .map((m, k) => {
            const v = vals[k],
              label = capFirst(parseISO(m + "-01").toLocaleDateString(DATE_LOC, { month: "short" }));
            return (
              '<div class="smcol' +
              (m === t.slice(0, 7) ? " on" : "") +
              '" role="img" aria-label="' +
              TH("common.labelValue", { label: capFirst(monthLabel(m)), value: money(v, cur) }) +
              '"><span class="v">' +
              (v ? esc(compact(v)) : "") +
              '</span><span class="bw"><span class="b" style="height:' +
              (v ? Math.max(2, (v / max) * 100) : 0).toFixed(1) +
              '%"></span></span><span class="x">' +
              esc(label) +
              "</span></div>"
            );
          })
          .join("") + "</div>"
      : "") +
    '<div class="smd"><div class="muted small">' +
    esc(part ? T("summary.soFar", { year: y }) : String(y)) +
    '</div><div class="big spent">' +
    esc(money(tot, cur)) +
    "</div>" +
    (cmp ? '<div class="muted small">' + esc(cmp) + "</div>" : "") +
    "</div>";
  const split = catSplit(list);
  h += split.length
    ? '<div class="list smtop">' + split.map(x => smRow(x, tot, true)).join("") + "</div>"
    : '<div class="empty" style="padding:16px">' + TH("summary.none.y", { year: y }) + "</div>";
  h += '<div class="gap"></div><button class="btn tonal" data-act="sm-open">' + TH("summary.open.y") + "</button>";
  el.innerHTML = h;
  smFitOpen(el);
  /* this month at the right edge (a past year: December); an edge fades while months that have been are past it, so
     this year's months still to come don't fade this one */
  const ch = $("#smy");
  if (!ch) return;
  const cols = [...ch.querySelectorAll(".smcol")],
    on = ch.querySelector(".on"),
    last = on ? cols.indexOf(on) : 11,
    fade = () => {
      const r = ch.getBoundingClientRect();
      ch.classList.toggle("fl", ch.scrollLeft > 2);
      ch.classList.toggle(
        "fr",
        cols.some((c, k) => k <= last && c.getBoundingClientRect().left >= r.right - 2)
      );
    };
  ch.scrollLeft = cols[last].offsetLeft + cols[last].offsetWidth - ch.clientWidth;
  fade();
  ch.addEventListener("scroll", fade, { passive: true });
}
/* the weeks on screen: "3 Aug – 27 Sep" (year added when it isn't this year) */
const smSpan = bars => rangeLabel(bars[0].s, bars[bars.length - 1].e);
function smNav(d) {
  const t = today();
  let e = SM.end;
  if (SM.mode === "d") e = addDays(e, d);
  else if (SM.mode === "w") e = addDays(e, 56 * d);
  else if (SM.mode === "y") e = +e.slice(0, 4) + d + "-12-31";
  else e = monthEnd(shiftMonth(e.slice(0, 7), d));
  SM.end = e > t ? t : e;
  SM.sel = null;
  SM.open = null; // other days: an opened row closes (also on a swipe)
  smRender();
}
function smOpen() {
  if (SM.mode === "y") {
    V.period = "year";
    V.anchor = SM.end.slice(0, 4) + "-01-01";
    closeSheet();
    render();
    return;
  }
  const b = smBuckets().slice(1)[SM.sel],
    t = today();
  if (!b) return;
  if (SM.mode === "d") {
    V.period = "day";
    V.anchor = b.s;
  } else if (SM.mode === "w") {
    V.period = "range";
    V.rs = b.s;
    V.re = b.e > t ? t : b.e;
  } else {
    V.period = "month";
    V.anchor = b.s;
  }
  closeSheet();
  render();
}
