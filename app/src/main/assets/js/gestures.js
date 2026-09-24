/*
 * gestures.js — Touch and mouse: the pressed look, swipes on the ring and the summary chart, long-press to select History
 * rows, hold-and-drag of category tiles and of rows between sections, and drag-to-pick a calendar range.
 */
"use strict";

/* a long-press or drag may end with a click from the same gesture; swallow it (reset by the next press, or after 1s) */
let swallowClick = false,
  swallowT = 0;
function swallowNextClick() {
  swallowClick = true;
  clearTimeout(swallowT);
  swallowT = setTimeout(() => {
    swallowClick = false;
  }, 1000);
}
let sw = null,
  LP = null,
  smSw = null;
function pressStart(x, y, target) {
  swallowClick = false;
  const layer = !!($("#sheet").innerHTML || $("#pop").innerHTML);
  sw = !layer && target.closest("#ring") ? { x, y } : null;
  smSw = target.closest("#sm .smchart") ? { x, y } : null;
  /* a press on the calculator's caret grabs it (elsewhere on the display, a swipe scrolls and a tap places it) */
  const mirror = CALC && target.closest(".caretmirror");
  const caret = mirror && mirror.querySelector(".blink");
  if (caret) {
    const r = caret.getBoundingClientRect();
    if (Math.abs(x - (r.left + r.width / 2)) <= 28) {
      LP = { kind: "caret", mirror, x, y, moved: false };
      return;
    }
  }
  const rc = PD && PD.tab === "range" && target.closest("#pd .dd");
  if (rc) {
    LP = rc.disabled ? null : { kind: "range", x, y, from: rc.dataset.v, cur: rc.dataset.v, moved: false };
    return;
  }
  const tile = target.closest(".cgrid .tile, .ring.edit .tile"),
    row = V.screen === "history" && !V.sel && target.closest('.tx[data-act="tx-open"]');
  const mv = (V.screen === "assets" || V.screen === "liabs") && target.closest(".tx[data-drag]");
  const hold = target.closest("#sheet .chip[data-ctype]") || target.closest('#f-dots .dot[data-act="f-col"]');
  if (hold) {
    LP = { x, y, cx: x, cy: y, el: hold, kind: "hold", active: false };
    LP.timer = setTimeout(() => {
      if (!LP) return;
      LP.active = true;
      swallowNextClick();
      buzz(12);
      const el = LP.el;
      LP = null;
      pressOff(true);
      if (el.classList.contains("dot")) removeColour(el.dataset.v);
      else removeType(el.dataset.v);
    }, 500);
    return;
  }
  if (!tile && !row && !mv) {
    LP = null;
    return;
  }
  LP = { x, y, cx: x, cy: y, el: tile || row || mv, kind: tile ? "drag" : row ? "sel" : "move", active: false };
  LP.timer = setTimeout(
    () => {
      if (!LP) return;
      LP.active = true;
      swallowNextClick();
      try {
        if (navigator.vibrate) navigator.vibrate(12);
      } catch (e) {}
      if (LP.kind === "sel") {
        V.sel = new Set([LP.el.dataset.v]);
        render();
        LP = null;
      } else dragBegin();
    },
    tile || mv ? 350 : 450
  );
}
function pressMove(x, y, ev) {
  if (!LP) return;
  if (LP.kind === "caret") {
    if (ev.cancelable) ev.preventDefault();
    if (!LP.moved && Math.abs(x - LP.x) < 4) return;
    LP.moved = true;
    calcDragCaret(LP.mirror, x);
    return;
  }
  if (LP.kind === "range") {
    if (ev.cancelable) ev.preventDefault();
    const hit = document.elementFromPoint(x, y),
      c = hit && hit.closest("#pd .dd");
    if (!LP.moved && Math.hypot(x - LP.x, y - LP.y) < 12) return; /* not a drag yet: finger jitter on a tap */
    if (c && !c.disabled && c.dataset.v !== LP.cur) {
      LP.cur = c.dataset.v;
      LP.moved = true;
      pdPaint(LP.from < LP.cur ? LP.from : LP.cur, LP.from < LP.cur ? LP.cur : LP.from);
    }
    return;
  }
  LP.cx = x;
  LP.cy = y;
  if (!LP.active) {
    if (Math.hypot(x - LP.x, y - LP.y) > 10) {
      clearTimeout(LP.timer);
      LP = null;
    }
    return;
  }
  if (ev.cancelable) ev.preventDefault();
  dragMove(x, y);
}
function pressEnd(x, y) {
  if (sw && x != null) {
    const dx = x - sw.x,
      dy = y - sw.y;
    if (
      !(LP && LP.active) &&
      Math.abs(dx) > 60 &&
      Math.abs(dy) < 50 &&
      V.screen === "home" &&
      !$("#sheet").innerHTML &&
      !$("#pop").innerHTML
    ) {
      if (dx > 0) {
        shiftPeriod(-1);
        render();
      } else if (canNext()) {
        shiftPeriod(1);
        render();
      }
    }
  }
  sw = null;
  /* swipe the summary chart: earlier / later, like the ‹ › above it */
  if (smSw && x != null && SM) {
    const dx = x - smSw.x,
      dy = y - smSw.y;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) {
      const nb = $('#sm [data-act="sm-nav"][data-v="1"]');
      if (dx > 0) smNav(-1);
      else if (nb && !nb.disabled) smNav(1);
      swallowNextClick();
    }
  }
  smSw = null;
  if (LP && LP.kind === "caret") {
    if (LP.moved) swallowNextClick();
    LP = null;
    return;
  }
  if (LP && LP.kind === "range") {
    const L = LP;
    LP = null;
    if (L.moved) {
      swallowNextClick();
      if (L.cur !== L.from) applyRange(L.from, L.cur);
      else pdRender();
    }
    return;
  }
  if (LP) {
    clearTimeout(LP.timer);
    if (LP.active && LP.kind === "drag") dragEnd();
    else if (LP.active && LP.kind === "move") rowDrop();
    LP = null;
  }
}
function dragBegin() {
  const el = LP.el,
    r = el.getBoundingClientRect(),
    g = el.cloneNode(true);
  g.classList.add("ghost");
  g.removeAttribute("data-act");
  Object.assign(g.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  document.body.appendChild(g);
  el.classList.add("placeholder");
  Object.assign(LP, {
    ghost: g,
    dx: LP.cx - r.left,
    dy: LP.cy - r.top,
    grid: el.closest(".cgrid"),
    ring: el.closest(".ring.edit"),
  });
  if (LP.kind === "move") {
    g.classList.add("gh-row");
    LP.to = ZONE_TO[el.closest("[data-src]").dataset.src];
    document.querySelectorAll('.dropbox[data-zone="' + LP.to + '"]').forEach(z => z.classList.add("dropok"));
  }
}
/* where a row may be dropped (source list data-src -> slot data-zone): archived <-> accounts, cleared -> open (clearing stays explicit) */
const ZONE_TO = {
  acc: "arch",
  arch: "acc",
  "lend-done": "lend-open",
  "borrow-done": "borrow-open",
  "lend-open": "lend-done",
  "borrow-open": "borrow-done",
};
function rowDrop() {
  const L = LP,
    ok = !!L.over;
  document.querySelectorAll(".dropok,.dropover").forEach(z => z.classList.remove("dropok", "dropover"));
  L.el.classList.remove("placeholder");
  L.ghost.remove();
  if (!ok) return; /* dropped elsewhere: nothing changes */
  const [type, id] = L.el.dataset.drag.split(":");
  S.settings.dragTip = true;
  buzz(12);
  if (type === "acc") setArchived(id, L.to === "arch");
  else if (/-done$/.test(L.to)) clearLoan(id);
  else reopenLoan(id);
}
function dragMove(x, y) {
  const L = LP;
  L.ghost.style.left = x - L.dx + "px";
  L.ghost.style.top = y - L.dy + "px";
  if (y < 70) scrollBy(0, -10);
  else if (y > innerHeight - (document.body.classList.contains("hasnav") ? 150 : 70)) scrollBy(0, 10);
  if (L.kind === "move") {
    const hit = document.elementFromPoint(x, y),
      z = hit && hit.closest(".dropbox"),
      ok = !!z && z.dataset.zone === L.to;
    if (ok !== !!L.over || (ok && L.overEl !== z)) {
      document.querySelectorAll(".dropover").forEach(e => e.classList.remove("dropover"));
      if (ok) z.classList.add("dropover");
    }
    L.over = ok;
    L.overEl = ok ? z : null;
    return;
  }
  if (L.ring) {
    /* move to the nearest slot of the home-screen layout; other tiles slide over */
    const rr = L.ring.getBoundingClientRect(),
      px = x - rr.left,
      py = y - rr.top,
      id = L.el.dataset.v;
    let k = -1,
      bd = Infinity;
    RE.L.slots.forEach((s, i) => {
      if (i >= RE.order.length) return;
      const dd = Math.hypot(s.x - px, s.y - py);
      if (dd < bd) {
        bd = dd;
        k = i;
      }
    });
    const cur = RE.order.indexOf(id);
    if (k < 0 || bd > RE.L.u * 0.75 || k === cur) return;
    RE.order.splice(cur, 1);
    RE.order.splice(k, 0, id);
    L.ring.querySelectorAll(".tile").forEach(b => {
      const s = RE.L.slots[RE.order.indexOf(b.dataset.v)];
      b.style.left = s.x - RE.L.u / 2 + "px";
      b.style.top = s.y - RE.L.u / 2 + "px";
    });
    return;
  }
  const hit = document.elementFromPoint(x, y),
    t = hit && hit.closest(".tile");
  if (!t || t === L.el || t.parentNode !== L.grid) return;
  const tiles = [...L.grid.querySelectorAll(".tile")];
  if (tiles.indexOf(L.el) < tiles.indexOf(t)) t.after(L.el);
  else t.before(L.el);
}
function dragEnd() {
  const L = LP;
  L.ghost.remove();
  L.el.classList.remove("placeholder");
  const kind = L.ring ? "out" : L.grid.dataset.kind,
    order = L.ring ? RE.order.slice() : [...L.grid.querySelectorAll(".tile")].map(b => b.dataset.v);
  const pick = k =>
    k === kind
      ? order
          .map(id => S.cats.find(c => c.id === id))
          .filter(Boolean)
          .concat(S.cats.filter(c => c.kind === k && c.hidden))
      : S.cats.filter(c => c.kind === k);
  S.cats = pick("out").concat(pick("in"));
  commit();
}
let lastTouch = 0;
const fromTouch = () => Date.now() - lastTouch < 800;
/* pressed look: on at touch-down, off at release (kept ~90ms so a quick tap is still seen), off at once if the finger scrolls */
let PRESS = null,
  pressAt = 0,
  pressXY = null;
function pressOn(t, x, y) {
  pressOff(true);
  const b = t && t.closest && t.closest("button");
  if (!b || b.disabled) return;
  PRESS = b;
  pressAt = Date.now();
  pressXY = [x, y];
  b.classList.add("pressed");
}
function pressOff(now) {
  const b = PRESS;
  if (!b) return;
  PRESS = null;
  const w = now ? 0 : Math.max(0, 90 - (Date.now() - pressAt));
  if (w) setTimeout(() => b.classList.remove("pressed"), w);
  else b.classList.remove("pressed");
}
const pressMoved = (x, y) => {
  if (PRESS && pressXY && Math.hypot(x - pressXY[0], y - pressXY[1]) > 10) pressOff(true);
};
document.addEventListener(
  "touchstart",
  e => {
    lastTouch = Date.now();
    if (e.touches.length === 1) pressOn(e.target, e.touches[0].clientX, e.touches[0].clientY);
    else pressOff(true);
    if (e.touches.length === 1) pressStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
    else {
      sw = null;
      if (LP) {
        clearTimeout(LP.timer);
        LP = null;
      }
    }
  },
  { passive: true }
);
document.addEventListener(
  "touchmove",
  e => {
    const t = e.touches[0];
    if (t) pressMoved(t.clientX, t.clientY);
    if (t) pressMove(t.clientX, t.clientY, e);
  },
  { passive: false }
);
document.addEventListener(
  "touchend",
  e => {
    lastTouch = Date.now();
    pressOff();
    const t = e.changedTouches[0];
    pressEnd(t ? t.clientX : null, t ? t.clientY : null);
  },
  { passive: true }
);
document.addEventListener(
  "touchcancel",
  () => {
    pressOff(true);
    pressEnd(null, null);
  },
  { passive: true }
);
document.addEventListener("mousedown", e => {
  if (e.button === 0 && !fromTouch()) pressOn(e.target, e.clientX, e.clientY);
  if (e.button === 0 && !fromTouch()) pressStart(e.clientX, e.clientY, e.target);
});
document.addEventListener("mousemove", e => {
  if (LP && !fromTouch()) pressMove(e.clientX, e.clientY, e);
});
document.addEventListener("mouseup", () => {
  if (!fromTouch()) {
    pressOff();
    pressEnd(null, null);
  }
});
document.addEventListener("contextmenu", e => {
  if (e.target.closest(".tile,.tx,.dd,.chip,.dot")) e.preventDefault();
});
