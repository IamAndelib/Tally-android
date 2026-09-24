/*
 * ring.js — Home's category ring: tiles evenly spaced on a circle around a donut of the period's spending, with leader
 * lines from each slice to its category. Also drawn as the Settings preview, where tiles can be dragged between
 * slots.
 */
"use strict";

/* Where n tiles go around the donut: evenly spaced on a circle that hugs the donut.
   More categories → smaller tiles, so the circle stays round and there is never an empty slot.
   Slots come back clockwise, starting just left of 12 o'clock. */
/* distance from a tile centre to the donut edge, in tile sizes (smaller = bigger donut); checked against every n and width */
const DONUT_GAP = 0.64;
const TAU = 2 * Math.PI;
function ringLayout(n, W) {
  /* biggest tile (92px down to 34px) whose n copies fit around a circle through their centres, 4% apart */
  let u = 92;
  while (u > 34 && (TAU * (W - u)) / 2 / n < u * 0.96) u--;
  const r = (W - u) / 2,
    H = W,
    slots = [];
  for (let i = 0; i < n; i++) {
    const th = -TAU / 4 + (n === 1 ? 0 : (i - 0.5) / n) * TAU;
    slots.push({ x: W / 2 + r * Math.cos(th), y: H / 2 + r * Math.sin(th) });
  }
  return { W, H, u, slots, cx: W / 2, cy: H / 2, D: Math.max(2 * (r - DONUT_GAP * u), 90) };
}
const circDist = (a, b) => {
  const x = (((a - b) % 1) + 1) % 1;
  return Math.min(x, 1 - x);
};
/* point of a slice [start,start+w) (fractions of the circle) nearest to angle a, kept a little inside the slice */
function nearestInSlice(a, start, w) {
  const e = Math.min(0.01, w / 2),
    rel = (((a - start) % 1) + 1) % 1;
  if (rel >= e && rel <= w - e) return a;
  return circDist(a, start + e) < circDist(a, start + w - e) ? start + e : start + w - e;
}
let RE = null; /* the Settings preview's layout + order while it is on screen */
function ringHTML(cats, o) {
  const home = o.mode === "home",
    W = Math.max(240, $("#app").clientWidth - 24),
    L = ringLayout(Math.max(cats.length, 1), W);
  const { u, D, cx, cy, H } = L,
    d = Math.round(u * (u < 70 ? 0.5 : 0.56)),
    f = Math.max(8, Math.min(11.5, u * 0.125));
  const pos = cats.map((c, i) => {
    const s = L.slots[i];
    return {
      c,
      x: s.x,
      top: s.y - u / 2,
      ix: s.x,
      iy: s.y - u / 2 + 4 + d / 2,
      ang: (((Math.atan2(s.y - cy, s.x - cx) / TAU + 0.25) % 1) + 1) % 1,
    };
  });
  const tile = p => {
    const v = home ? o.by[p.c.id] || 0 : 0;
    return (
      '<button class="cat rt' +
      (home ? "" : " tile") +
      '" style="left:' +
      (p.x - u / 2).toFixed(1) +
      "px;top:" +
      p.top.toFixed(1) +
      "px;width:" +
      u.toFixed(1) +
      "px;height:" +
      u.toFixed(1) +
      "px;--d:" +
      d +
      "px;--f:" +
      f.toFixed(1) +
      'px" data-act="' +
      (home ? "add-cat" : "cat-edit") +
      '" data-v="' +
      esc(p.c.id) +
      '"' +
      (home ? ' aria-label="Add ' + esc(p.c.name) + '"' : "") +
      ">" +
      emblem(p.c, "ci") +
      '<span class="cn">' +
      esc(p.c.name) +
      "</span>" +
      (home
        ? '<span class="cp" style="color:' +
          p.c.c +
          '">' +
          (v ? Math.max(1, Math.round((v / o.spent) * 100)) + "%" : "") +
          "</span>"
        : "") +
      "</button>"
    );
  };
  const R = 40,
    C = 2 * Math.PI * R,
    Rout = (D / 2) * 0.92; /* stroke outer edge: (40+6)/50 of the radius */
  let segs = "",
    lines = "",
    rot = -90;
  if (home && o.spent > 0) {
    /* slices follow the tiles clockwise (not size), so leader lines never cross */
    const posOf = id => pos.find(p => p.c.id === id);
    const ent = Object.entries(o.by)
      .filter(([, v]) => v > 0)
      .map(([id, v]) => ({ id, v, w: v / o.spent, p: posOf(id) }))
      .sort((a, b) => (a.p ? a.p.ang : 2) - (b.p ? b.p.ang : 2));
    let off = 0;
    ent.forEach(s => {
      s.start = off;
      off += s.w;
    });
    /* turn the whole donut so each slice sits as close as possible to its category, and never let two lines cross */
    const segCross = (p, q) => {
      const turn = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      return turn(p[0], p[1], q[0]) * turn(p[0], p[1], q[1]) < 0 && turn(q[0], q[1], p[0]) * turn(q[0], q[1], p[1]) < 0;
    };
    const linked = ent.filter(s => s.p);
    let phi = 0,
      bestCost = Infinity;
    for (let k = 0; k < 360; k++) {
      const ph = k / 360;
      let cost = 0;
      const leaders = linked.map(s => {
        const a = nearestInSlice(s.p.ang, s.start + ph, s.w),
          dd = circDist(a, s.p.ang),
          th = a * TAU - TAU / 4;
        cost += dd * dd;
        return [
          [cx + Rout * Math.cos(th), cy + Rout * Math.sin(th)],
          [s.p.ix, s.p.iy],
        ];
      });
      for (let i = 0; i < leaders.length; i++)
        for (let j = i + 1; j < leaders.length; j++) if (segCross(leaders[i], leaders[j])) cost += 10;
      if (cost < bestCost - 1e-12) {
        bestCost = cost;
        phi = ph;
      }
    }
    rot = phi * 360 - 90;
    const gap = ent.length > 1 ? 1.4 : 0;
    ent.forEach(s => {
      const len = s.w * C,
        l = Math.max(len - gap, 0.6);
      segs +=
        '<circle r="' +
        R +
        '" cx="50" cy="50" fill="none" stroke="' +
        cat(s.id).c +
        '" stroke-width="12" stroke-dasharray="' +
        l.toFixed(2) +
        " " +
        (C - l).toFixed(2) +
        '" stroke-dashoffset="' +
        (-s.start * C).toFixed(2) +
        '"/>';
      if (!s.p) return;
      const a = nearestInSlice(s.p.ang, s.start + phi, Math.max(s.w - gap / C, 0.001)),
        th = a * TAU - TAU / 4;
      const x1 = cx + Rout * Math.cos(th),
        y1 = cy + Rout * Math.sin(th),
        p = s.p;
      let x2, y2;
      const yb = p.top + u - 2;
      const kb = y1 > yb + 2 ? (yb - y1) / (p.iy - y1) : -1,
        xb = x1 + (p.ix - x1) * kb;
      if (kb > 0 && kb < 1 && Math.abs(xb - p.x) < u / 2 - 6) {
        x2 = xb;
        y2 = yb;
      } /* coming up from below: stop under the labels */
      else {
        const dx = p.ix - x1,
          dy = p.iy - y1,
          Ln = Math.hypot(dx, dy) || 1,
          rr = d / 2 + 3;
        x2 = p.ix - (dx / Ln) * rr;
        y2 = p.iy - (dy / Ln) * rr;
      }
      if (Math.hypot(x2 - x1, y2 - y1) < 4) return;
      const col = cat(s.id).c;
      lines +=
        '<line x1="' +
        x1.toFixed(1) +
        '" y1="' +
        y1.toFixed(1) +
        '" x2="' +
        x2.toFixed(1) +
        '" y2="' +
        y2.toFixed(1) +
        '" stroke="' +
        col +
        '" stroke-width="1.25" stroke-opacity=".85" stroke-linecap="round"/>' +
        '<circle cx="' +
        x1.toFixed(1) +
        '" cy="' +
        y1.toFixed(1) +
        '" r="2.2" fill="' +
        col +
        '"/>';
    });
  }
  const donut =
    '<svg viewBox="0 0 100 100" class="donut" aria-hidden="true"><circle r="34" cx="50" cy="50" style="fill:var(--surface)"/><g transform="rotate(' +
    rot.toFixed(2) +
    ' 50 50)"><circle r="' +
    R +
    '" cx="50" cy="50" fill="none" style="stroke:var(--surface-highest)" stroke-width="12"/>' +
    segs +
    "</g></svg>";
  const box =
    "left:" +
    (cx - D / 2).toFixed(1) +
    "px;top:" +
    (cy - D / 2).toFixed(1) +
    "px;width:" +
    D.toFixed(1) +
    "px;height:" +
    D.toFixed(1) +
    "px;--D:" +
    D.toFixed(1) +
    "px";
  /* amount font: as large as fits inside the hole (about 62% of the donut) */
  const fit = txt =>
    Math.max(11, Math.min(22, D * 0.11, (0.62 * D) / (Math.max(3, String(txt).length) * 0.6))).toFixed(1) + "px";
  let center;
  if (home) {
    const cs = currencies();
    center =
      '<button class="dwrap" data-act="summary" aria-label="Spending summary" style="' +
      box +
      '">' +
      donut +
      '<div class="dcenter">' +
      (o.got ? '<div class="g">+' + esc(money(o.got, o.cur, true)) + "</div>" : "") +
      '<div class="s' +
      (o.spent ? "" : " zero") +
      '" style="font-size:' +
      fit(money(o.spent, o.cur, true)) +
      '">' +
      esc(money(o.spent, o.cur, true)) +
      "</div>" +
      (!o.spent && !o.got ? '<div class="hint">Tap a category</div>' : "") +
      (cs.length > 1 ? '<span class="curbtn" data-act="cur-next" role="button">' + esc(o.cur) + " ⇄</span>" : "") +
      "</div></button>";
  } else {
    RE = { L, order: cats.map(c => c.id) };
    center =
      '<div class="dwrap" style="' +
      box +
      '">' +
      donut +
      '<div class="dcenter"><div class="hint">Spending</div></div></div>';
  }
  return (
    '<div class="ring' +
    (home ? "" : " edit") +
    '"' +
    (home ? ' id="ring"' : "") +
    ' style="height:' +
    H.toFixed(1) +
    'px">' +
    '<svg class="leaders" width="' +
    W.toFixed(1) +
    '" height="' +
    H.toFixed(1) +
    '" viewBox="0 0 ' +
    W.toFixed(1) +
    " " +
    H.toFixed(1) +
    '" aria-hidden="true">' +
    lines +
    "</svg>" +
    center +
    pos.map(tile).join("") +
    "</div>"
  );
}
