/*
 * summary.js — The spending summary opened by tapping the donut: 7 days, 8 weeks or one month's categories, with a comparison
 * to the period before.
 */
"use strict";

let SM = null;
/* a bar's short label in the phone's own way ("1.5K", "1,5 k", "١٫٥ ألف"), small amounts with their decimals */
let COMPACT = null;
const compact = n => {
  try {
    COMPACT = COMPACT || new Intl.NumberFormat(LOC.fmt, { notation: "compact", maximumSignificantDigits: 3 });
    return COMPACT.format(n);
  } catch (e) {
    return String(Math.round(n));
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
/* donut of a month by category: category colours, 2px gaps, total in the middle */
function smDonut(split, total) {
  const R = 40,
    C = 2 * Math.PI * R,
    gap = split.length > 1 ? 1.2 : 0;
  let off = 0,
    segs = "";
  split.forEach(([k, v]) => {
    const len = Math.max(0.5, (v / total) * C - gap);
    segs +=
      '<circle r="' +
      R +
      '" cx="50" cy="50" fill="none" stroke="' +
      cat(k).c +
      '" stroke-width="15" stroke-dasharray="' +
      len.toFixed(2) +
      " " +
      (C - len).toFixed(2) +
      '" stroke-dashoffset="' +
      (-off).toFixed(2) +
      '"><title>' +
      esc(catName(cat(k))) +
      "</title></circle>";
    off += (v / total) * C;
  });
  if (!split.length)
    segs = '<circle r="' + R + '" cx="50" cy="50" fill="none" stroke="var(--surface-highest)" stroke-width="15"/>';
  return (
    '<div class="smpie"><svg viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(-90 50 50)">' +
    segs +
    "</g></svg>" +
    '<div class="c"><b>' +
    esc(total ? compact(total) : "0") +
    "</b><span>" +
    TH("summary.spent") +
    "</span></div></div>"
  );
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
            esc(x.x) +
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
  else h += '<div class="smchart">' + smDonut(split, b.v) + "</div>";
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
    (cmp || avg ? '<div class="muted small">' + esc([avg, cmp].filter(Boolean).join(" · ")) + "</div>" : "") +
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
          (v ? esc(money(v, cur, "whole")) : "") +
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
