/*
 * summary.js — The spending summary opened by tapping the donut: 7 days, 8 weeks or one month's categories, with a comparison
 * to the period before.
 */
"use strict";

let SM = null;
const compact = n => {
  n = Math.round(n);
  const a = Math.abs(n);
  if (a < 1000) return String(n);
  if (a < 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  if (a < 1e6) return Math.round(n / 1e3) + "k";
  return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
};
const weekStart = d => addDays(d, -((parseISO(d).getDay() + 6) % 7));
function summarySheet() {
  const [, e] = range(),
    t = today();
  SM = { mode: V.period === "month" ? "m" : "d", end: e > t ? t : e, sel: null, cur: viewCur() };
  openSheet(
    "Spending" + (currencies().length > 1 ? " · " + SM.cur : ""),
    '<div class="seg">' +
      [
        ["d", "Days"],
        ["w", "Weeks"],
        ["m", "Months"],
      ]
        .map(
          ([k, l]) =>
            '<button data-act="sm-mode" data-v="' + k + '" aria-pressed="' + (SM.mode === k) + '">' + l + "</button>"
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
        x: parseISO(d).toLocaleDateString(undefined, { weekday: "short" }),
        full: d === t ? "Today" : d === addDays(t, -1) ? "Yesterday" : dayLabel(d),
      });
    }
  else if (SM.mode === "w") {
    const w = weekStart(e);
    for (let i = 8; i >= 0; i--) {
      const s = addDays(w, -7 * i);
      out.push({
        s,
        e: addDays(s, 6),
        x: parseISO(s).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        full: "Week of " + parseISO(s).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      });
    }
  } else {
    const m0 = e.slice(0, 7);
    for (let i = 6; i >= 0; i--) {
      const m = shiftMonth(m0, -i),
        [y, mo] = m.split("-").map(Number);
      out.push({
        s: m + "-01",
        e: m + "-" + pad(new Date(y, mo, 0).getDate()),
        x: parseISO(m + "-01").toLocaleDateString(undefined, { month: "short" }),
        full: monthLabel(m),
      });
    }
  }
  const inCur = x => {
    const a = acc(x.account);
    return a && a.currency === SM.cur;
  };
  const sp = S.txns.filter(x => x.type === "expense" && inCur(x));
  out.forEach(b => {
    b.list = sp.filter(x => x.date >= b.s && x.date <= b.e);
    b.v = r2(b.list.reduce((q, x) => q + x.amount, 0));
    const last = b.e < t ? b.e : t;
    b.days = last < b.s ? 0 : Math.round((parseISO(last) - parseISO(b.s)) / 864e5) + 1;
  });
  return out;
}
/* "3–9 Aug", "31 Aug–6 Sep" */
function wkLabel(a, b) {
  const s = parseISO(a),
    e = parseISO(b),
    mo = x => x.toLocaleDateString(undefined, { month: "short" });
  return s.getDate() + (s.getMonth() !== e.getMonth() ? " " + mo(s) : "") + "–" + e.getDate() + " " + mo(e);
}
/* categories of a set of expenses, biggest first */
function catSplit(list) {
  const m = {};
  list.forEach(x => {
    m[x.cat] = (m[x.cat] || 0) + x.amount;
  });
  return Object.entries(m)
    .map(([k, v]) => [k, r2(v)])
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
      esc(cat(k).name) +
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
    "</b><span>spent</span></div></div>"
  );
}
function smRender() {
  const el = $("#sm");
  if (!el || !SM) return;
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
    '<div class="cal-h"><button class="icon" data-act="sm-nav" data-v="-1" aria-label="Earlier">' +
    ic("left") +
    "</button><b>" +
    esc(M ? monthLabel(b.s.slice(0, 7), true) : smSpan(bars)) +
    '</b><button class="icon" data-act="sm-nav" data-v="1" aria-label="Later"' +
    (later ? "" : " disabled") +
    ">" +
    ic("right") +
    "</button></div>";
  const split = catSplit(b.list);
  if (SM.mode === "d")
    h +=
      '<div class="smchart smc" role="list">' +
      bars
        .map((x, k) => {
          const pct = max ? (x.v / max) * 100 : 0,
            future = x.s > t;
          return (
            '<button class="smcol' +
            (k === i ? " on" : "") +
            '" role="listitem" data-act="sm-pick" data-v="' +
            k +
            '"' +
            (future ? " disabled" : "") +
            ' aria-label="' +
            esc(x.full + ": " + money(x.v, cur)) +
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
      '<div class="smchart smrows" role="list">' +
      bars
        .map((x, k) => {
          const pct = max ? (x.v / max) * 100 : 0;
          return (
            '<button class="smrow' +
            (k === i ? " on" : "") +
            '" role="listitem" data-act="sm-pick" data-v="' +
            k +
            '" aria-label="' +
            esc(x.full + ": " + money(x.v, cur)) +
            '">' +
            '<span class="x">' +
            esc(wkLabel(x.s, x.e)) +
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
  const unit = { d: "the day before", w: "last week", m: "last month" }[SM.mode];
  /* a week or month that isn't over yet is compared by its daily average, not its (still growing) total */
  const len = x => Math.round((parseISO(x.e) - parseISO(x.s)) / 864e5) + 1,
    part = SM.mode !== "d" && b.days < len(b);
  let cmp = "";
  if (prev && prev.v > 0 && b.days > 0) {
    const p = Math.round(part ? (b.v / b.days / (prev.v / len(prev)) - 1) * 100 : ((b.v - prev.v) / prev.v) * 100);
    cmp = p === 0 ? "Same as " + unit : (p > 0 ? "↑ " : "↓ ") + Math.abs(p) + "% vs " + unit;
  }
  const avg = SM.mode !== "d" && b.days > 0 && b.v ? "Avg " + money(r2(b.v / b.days), cur) + " a day" : "";
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
            '<span class="mid"><div class="d">' +
            esc(c.name) +
            (M ? ' <span class="muted small">' + (p < 1 ? "<1" : Math.round(p)) + "%</span>" : "") +
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
      '<div class="empty" style="padding:16px">Nothing spent ' +
      { d: "that day", w: "that week", m: "in " + monthLabel(b.s.slice(0, 7)) }[SM.mode] +
      ".</div>";
  h +=
    '<div class="gap"></div><button class="btn tonal" data-act="sm-open">Open ' +
    { d: "this day", w: "this week", m: "this month" }[SM.mode] +
    " on Home</button>";
  el.innerHTML = h;
}
/* "18 – 24 Sep", "3 Aug – 27 Sep", "Apr – Sep" (year added when it isn't this year) */
function smSpan(bars) {
  const s = parseISO(bars[0].s),
    e = parseISO(bars[bars.length - 1].e),
    y = new Date().getFullYear(),
    yr = e.getFullYear() !== y ? " " + e.getFullYear() : "";
  if (SM.mode === "m")
    return (
      s.toLocaleDateString(undefined, { month: "short" }) +
      " – " +
      e.toLocaleDateString(undefined, { month: "short" }) +
      yr
    );
  const mo = x => x.toLocaleDateString(undefined, { month: "short" });
  return s.getDate() + (s.getMonth() !== e.getMonth() ? " " + mo(s) : "") + " – " + e.getDate() + " " + mo(e) + yr;
}
function smNav(d) {
  const t = today();
  let e = SM.end;
  if (SM.mode === "d") e = addDays(e, 7 * d);
  else if (SM.mode === "w") e = addDays(e, 56 * d);
  else {
    const m = shiftMonth(e.slice(0, 7), d),
      [y, mo] = m.split("-").map(Number);
    e = m + "-" + pad(new Date(y, mo, 0).getDate());
  }
  SM.end = e > t ? t : e;
  SM.sel = null;
  smRender();
}
function smOpen() {
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
