/*
 * summary.js — The spending summary opened by tapping the donut: 7 days, 8 weeks or one month's categories, with a comparison
 * to the period before.
 */
"use strict";

let SM = null;
/* a bar's label, the same in every tab: the whole amount grouped the phone's way, no currency sign (the title names the
   currency), and compact ("12.4K") only from five digits. TalkBack and the figure under the chart keep the exact amount. */
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
  SM = { mode: { month: "m", year: "y" }[V.period] || "d", end: e > t ? t : e, sel: null, cur: viewCur() };
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
/* the buckets on screen, oldest first, plus one before them (for "vs last ...") */
function smBuckets() {
  const t = today(),
    e = SM.end,
    out = [];
  if (SM.mode === "d")
    for (let i = 7; i >= 0; i--) {
      const d = addDays(e, -i);
      out.push({
        s: d,
        e: d,
        x: capFirst(parseISO(d).toLocaleDateString(DATE_LOC, { weekday: "short" })),
        full: dayName(d),
      });
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
  const sp = S.txns.filter(x => isSpend(x) && inCur(x, SM.cur));
  out.forEach(b => {
    b.list = sp.filter(x => x.date >= b.s && x.date <= b.e);
    b.v = rnd(b.list.reduce((q, x) => q + x.amount, 0));
    const last = b.e < t ? b.e : t;
    b.days = last < b.s ? 0 : daysBetween(b.s, last) + 1;
  });
  return out;
}
/* categories of a set of expenses, biggest first */
function catSplit(list) {
  const m = {};
  list.forEach(x => {
    m[x.cat] = (m[x.cat] || 0) + x.amount;
  });
  return Object.entries(m)
    .map(([k, v]) => [k, rnd(v)])
    .sort((p, q) => q[1] - p[1]);
}
/* a month by category as a pie: category colours, true to size (a tiny share stays tiny), a hairline between slices.
   The names, shares and amounts are in the list under it, so the drawing is hidden from screen readers. */
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
      cat(split[0][0]).c +
      '"><title>' +
      esc(catName(cat(split[0][0]))) +
      "</title></circle>";
  else if (!split.length) segs = '<circle cx="50" cy="50" r="' + RP + '" fill="var(--surface-highest)"/>';
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
        cat(k).c +
        '" stroke="var(--surface-high, var(--surface))" stroke-width="0.6" stroke-linejoin="round"><title>' +
        esc(catName(cat(k))) +
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
  const all = smBuckets(),
    bars = all.slice(1),
    n = bars.length,
    t = today(),
    M = SM.mode === "m";
  if (M || SM.sel == null || SM.sel >= n) SM.sel = n - 1;
  const max = Math.max(...bars.map(b => b.v), 0),
    i = SM.sel,
    b = bars[i],
    prev = all[i],
    cur = SM.cur;
  const later = bars[n - 1].e < t;
  let h =
    '<div class="cal-h"><button class="icon" data-act="sm-nav" data-v="-1" aria-label="' +
    TH("summary.earlier") +
    '">' +
    ic("left") +
    "</button><b>" +
    esc(capFirst(M ? monthLabel(b.s.slice(0, 7), true) : smSpan(bars))) +
    '</b><button class="icon" data-act="sm-nav" data-v="1" aria-label="' +
    TH("summary.later") +
    '"' +
    (later ? "" : " disabled") +
    ">" +
    ic("right") +
    "</button></div>";
  const split = catSplit(b.list);
  if (SM.mode === "d")
    h +=
      '<div class="smchart smc">' +
      bars
        .map((x, k) => {
          const pct = max ? (x.v / max) * 100 : 0,
            future = x.s > t;
          return (
            '<button class="smcol' +
            (k === i ? " on" : "") +
            '" aria-pressed="' +
            (k === i) +
            '" data-act="sm-pick" data-v="' +
            k +
            '"' +
            (future ? " disabled" : "") +
            ' aria-label="' +
            TH("common.labelValue", { label: x.full, value: money(x.v, cur) }) +
            '">' +
            '<span class="v">' +
            (x.v ? esc(compact(x.v)) : "") +
            '</span><span class="bw"><span class="b" style="height:' +
            (x.v ? Math.max(2, pct) : 0).toFixed(1) +
            '%"></span></span><span class="x">' +
            esc(x.s === t ? T("summary.todayCol") : x.x) + // today can't pass for the same weekday a week back
            "</span></button>"
          );
        })
        .join("") +
      "</div>";
  else if (SM.mode === "w")
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
  else h += '<div class="smchart">' + smPie(split, b.v) + "</div>";
  /* details for the chosen bar */
  /* a week or month that isn't over yet is compared by its daily average, not its (still growing) total */
  const len = x => daysBetween(x.s, x.e) + 1,
    part = SM.mode !== "d" && b.days < len(b);
  let cmp = "";
  if (prev && prev.v > 0 && b.days > 0) {
    const p = Math.round(part ? (b.v / b.days / (prev.v / len(prev)) - 1) * 100 : ((b.v - prev.v) / prev.v) * 100);
    cmp = T("summary." + (p === 0 ? "same" : p > 0 ? "up" : "down") + "." + SM.mode, { pct: percent(Math.abs(p)) });
  }
  const avg = SM.mode !== "d" && b.days > 0 && b.v ? T("summary.avg", { amount: money(rnd(b.v / b.days), cur) }) : "";
  const top = M ? split : split.slice(0, 3);
  h +=
    '<div class="smd">' +
    (M ? "" : '<div class="muted small">' + esc(b.full) + "</div>") +
    '<div class="big spent">' +
    esc(money(b.v, cur)) +
    "</div>" +
    [avg, cmp] // each on its own line, so a phrase is never split between two
      .filter(Boolean)
      .map(x => '<div class="muted small">' + esc(x) + "</div>")
      .join("") +
    "</div>";
  if (top.length)
    h +=
      '<div class="list smtop">' +
      top
        .map(([k, v]) => {
          const c = cat(k),
            p = (v / b.v) * 100;
          return (
            '<div class="tx">' +
            emblem(c, "em") +
            '<span class="mid"><div class="d" dir="auto">' +
            esc(catName(c)) +
            (M
              ? ' <span class="muted small">' + esc(p < 1 ? "<" + percent(1) : percent(Math.round(p))) + "</span>"
              : "") +
            '</div><span class="pbar"><span style="width:' +
            p.toFixed(1) +
            "%;background:" +
            c.c +
            '"></span></span></span><span class="a">' +
            esc(money(v, cur)) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>";
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
  /* a label wider than its day's column (Today at a large text size): smaller, not below 10px (summary.todayCol is
     short where the word is long, like the weekdays beside it) */
  el.querySelectorAll(".smcol .x").forEach(x => {
    for (
      let px = parseFloat(getComputedStyle(x).fontSize) - 0.5;
      px >= 10 && x.offsetWidth > x.parentNode.clientWidth;
      px -= 0.5
    )
      x.style.fontSize = px + "px";
  });
}
/* the Year tab: a year's 12 months as bars that swipe sideways (opening on this month), the year's spending against the
   year before (this year: against the same days of last year), and its categories. The bars are for looking only. */
function drawSmYear(el) {
  const t = today(),
    y = +SM.end.slice(0, 4),
    cur = SM.cur,
    part = y === +t.slice(0, 4),
    sp = S.txns.filter(x => isSpend(x) && inCur(x, cur)),
    sum = list => rnd(list.reduce((q, x) => q + x.amount, 0)),
    months = Array.from({ length: 12 }, (_, i) => y + "-" + pad(i + 1)),
    vals = months.map(m => sum(sp.filter(x => x.date.startsWith(m)))),
    max = Math.max(...vals, 0),
    list = sp.filter(x => x.date.startsWith(y + "-")),
    tot = sum(list),
    was = sum(sp.filter(x => x.date >= y - 1 + "-01-01" && x.date <= y - 1 + (part ? t.slice(4) : "-12-31")));
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
    '<div class="smchart smy" id="smy">' +
    months
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
      .join("") +
    "</div>" +
    '<div class="smd"><div class="muted small">' +
    esc(part ? T("summary.soFar", { year: y }) : String(y)) +
    '</div><div class="big spent">' +
    esc(money(tot, cur)) +
    "</div>" +
    (cmp ? '<div class="muted small">' + esc(cmp) + "</div>" : "") +
    "</div>";
  const split = catSplit(list);
  h += split.length
    ? '<div class="list smtop">' +
      split
        .map(([k, v]) => {
          const c = cat(k),
            p = (v / tot) * 100;
          return (
            '<div class="tx">' +
            emblem(c, "em") +
            '<span class="mid"><div class="d" dir="auto">' +
            esc(catName(c)) +
            ' <span class="muted small">' +
            esc(p < 1 ? "<" + percent(1) : percent(Math.round(p))) +
            '</span></div><span class="pbar"><span style="width:' +
            p.toFixed(1) +
            "%;background:" +
            c.c +
            '"></span></span></span><span class="a">' +
            esc(money(v, cur)) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>"
    : '<div class="empty" style="padding:16px">' + TH("summary.none.y", { year: y }) + "</div>";
  h += '<div class="gap"></div><button class="btn tonal" data-act="sm-open">' + TH("summary.open.y") + "</button>";
  el.innerHTML = h;
  /* this month at the right edge (a past year: December); an edge fades while months that have been are past it, so
     this year's months still to come don't fade this one */
  const ch = $("#smy"),
    cols = [...ch.querySelectorAll(".smcol")],
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
/* "18 – 24 Sep", "3 Aug – 27 Sep", "Apr – Sep" (year added when it isn't this year) */
const smSpan = bars => rangeLabel(bars[0].s, bars[bars.length - 1].e, SM.mode === "m");
function smNav(d) {
  const t = today();
  let e = SM.end;
  if (SM.mode === "d") e = addDays(e, 7 * d);
  else if (SM.mode === "w") e = addDays(e, 56 * d);
  else if (SM.mode === "y") e = +e.slice(0, 4) + d + "-12-31";
  else e = monthEnd(shiftMonth(e.slice(0, 7), d));
  SM.end = e > t ? t : e;
  SM.sel = null;
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
