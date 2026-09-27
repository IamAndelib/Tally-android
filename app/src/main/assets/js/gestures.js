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
  smSw = null,
  hsw = null;
/* true while a dropped ring tile glides into its slot (no new drag until the page has redrawn) */
let ringSettling = false;
/* like a phone keyboard's backspace: after 400 ms held, delete every 70 ms, faster (35 ms) after about a second */
function startRepeat(key) {
  const L = (LP = { kind: "repeat", key, fired: 0 });
  const step = () => {
    if (LP !== L || L.stopped) return;
    if (!CALC || CALC.pos <= 0) return stopRepeat();
    calcKey("⌫");
    if (!L.fired++) buzz("long");
    L.t2 = setTimeout(step, L.fired > 12 ? 35 : 70);
  };
  L.t1 = setTimeout(step, 400);
}
/* stops the repeat but keeps LP until release, so the release's click can be swallowed */
function stopRepeat() {
  if (!LP || LP.kind !== "repeat") return;
  clearTimeout(LP.t1);
  clearTimeout(LP.t2);
  LP.stopped = true;
}
function pressStart(x, y, target) {
  swallowClick = false;
  const layer = !!($("#sheet").innerHTML || $("#pop").innerHTML);
  sw = !layer && target.closest("#ring") ? { x, y } : null;
  smSw = target.closest("#sm .smchart") ? { x, y } : null;
  /* History: a sideways swipe on the page (not on the chip strip, which scrolls) moves between account filters */
  hsw = !layer && V.screen === "history" && !V.sel && !target.closest(".strip") ? { x, y } : null;
  /* holding the calculator's ⌫ keeps deleting (a quick tap is still one delete, through the click) */
  const bs = CALC && target.closest('.calc [data-act="calc-key"][data-v="⌫"]');
  if (bs) {
    startRepeat(bs);
    return;
  }
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
  const tile = !ringSettling && target.closest(".cgrid .tile, .ring.edit .tile"),
    row = V.screen === "history" && !V.sel && target.closest('.tx[data-act="tx-open"]');
  const mv = (V.screen === "assets" || V.screen === "liabs") && target.closest(".tx[data-drag]");
  const hold = target.closest("#sheet .chip[data-ctype]") || target.closest('#f-dots .dot[data-act="f-col"]');
  if (hold) {
    LP = { x, y, cx: x, cy: y, el: hold, kind: "hold", active: false };
    LP.timer = setTimeout(() => {
      if (!LP) return;
      LP.active = true;
      swallowNextClick();
      buzz("long");
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
      buzz("long");
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
  if (LP.kind === "repeat") {
    const r = LP.key.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) stopRepeat(); // slid off the key
    return;
  }
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
        buzz("tick");
      } else if (canNext()) {
        shiftPeriod(1);
        render();
        buzz("tick");
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
      buzz("tick");
      swallowNextClick();
    }
  }
  smSw = null;
  /* History: finger left → the next account chip (All → DBBL → Bkash), right → back; stops at the ends */
  if (hsw && x != null && !(LP && LP.active) && V.screen === "history" && !V.sel) {
    const dx = x - hsw.x,
      dy = y - hsw.y,
      ids = histAccs(),
      i = ids.indexOf(V.hAcc || ""),
      j = i + (dx < 0 ? 1 : -1);
    if (ids.length > 2 && Math.abs(dx) > 60 && Math.abs(dy) < 50 && j >= 0 && j < ids.length) {
      setHistAcc(ids[j]);
      buzz("tick");
    }
  }
  hsw = null;
  if (LP && LP.kind === "repeat") {
    stopRepeat();
    if (LP.fired) swallowNextClick(); // the release shouldn't delete one more
    LP = null;
    return;
  }
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
  g.classList.remove("pressed");
  g.removeAttribute("data-act");
  Object.assign(g.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  document.body.appendChild(g);
  el.classList.add("placeholder");
  Object.assign(LP, {
    ghost: g,
    dx: LP.cx - r.left,
    dy: LP.cy - r.top,
    w: r.width,
    h: r.height,
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
  buzz("confirm");
  if (type === "acc") setArchived(id, L.to === "arch");
  else if (/-done$/.test(L.to)) clearLoan(id);
  else reopenLoan(id);
}
function dragMove(x, y) {
  const L = LP;
  L.ghost.style.left = x - L.dx + "px";
  L.ghost.style.top = y - L.dy + "px";
  /* near an edge the page scrolls along; for the ring only while part of it is still off-screen that way, so a ring
     that fits never creeps under the finger */
  const rb = L.ring && L.ring.getBoundingClientRect(),
    low = innerHeight - (document.body.classList.contains("hasnav") ? 150 : 70);
  if (y < 70 && (!rb || rb.top < 0)) scrollBy(0, -10);
  else if (y > low && (!rb || rb.bottom > low)) scrollBy(0, 10);
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
    ringDragTo(L, x, y);
    return;
  }
  const hit = document.elementFromPoint(x, y),
    t = hit && hit.closest(".tile");
  if (!t || t === L.el || t.parentNode !== L.grid) return;
  const tiles = [...L.grid.querySelectorAll(".tile")];
  if (tiles.indexOf(L.el) < tiles.indexOf(t)) t.after(L.el);
  else t.before(L.el);
  buzz("tick");
}
/* Settings ring: the lifted tile's slot follows the angle of its centre around the ring, so there is no dead zone
   between slots; it changes only once the tile is well into the next slot (no flicker on a border), and the tiles
   in between shift the shorter way round the circle, like beads on a string, never the long way across the top */
function ringDragTo(L, x, y) {
  const lay = RE.L,
    n = RE.order.length,
    rr = L.ring.getBoundingClientRect(),
    gx = x - L.dx + L.w / 2 - rr.left - lay.cx,
    gy = y - L.dy + L.h / 2 - rr.top - lay.cy;
  if (n < 2 || Math.hypot(gx, gy) < lay.u * 0.6) return; // over the middle of the donut: stay where it is
  const id = L.el.dataset.v,
    cur = RE.order.indexOf(id),
    circ = d => d - Math.round(d / n) * n, // signed distance around the ring, in slots
    f = ((Math.atan2(gy, gx) + TAU / 4) / TAU) * n + 0.5; // slot i sits at -90° + (i - 0.5)/n·360° (ringLayout)
  if (Math.abs(circ(f - cur)) < 0.65) return;
  const k = ((Math.round(f) % n) + n) % n,
    d = circ(k - cur),
    step = Math.sign(d);
  if (!step) return;
  for (let i = cur; i !== k; i = (i + step + n) % n) RE.order[i] = RE.order[(i + step + n) % n];
  RE.order[k] = id;
  L.ring.querySelectorAll(".tile").forEach(b => {
    const s = lay.slots[RE.order.indexOf(b.dataset.v)];
    b.style.left = s.x - lay.u / 2 + "px";
    b.style.top = s.y - lay.u / 2 + "px";
  });
  buzz("tick");
}
/* a new category order (ids of one kind, in order) into S.cats; hidden ones keep their place at the end */
function setCatOrder(kind, order) {
  const pick = k =>
    k === kind
      ? order
          .map(id => S.cats.find(c => c.id === id))
          .filter(Boolean)
          .concat(S.cats.filter(c => c.kind === k && c.hidden))
      : S.cats.filter(c => c.kind === k);
  S.cats = pick("out").concat(pick("in"));
}
function dragEnd() {
  const L = LP;
  if (L.ring) {
    /* saved at once; the lifted tile glides into its slot, then the page redraws */
    setCatOrder("out", RE.order.slice());
    save();
    const lay = RE.L,
      rr = L.ring.getBoundingClientRect(),
      s = lay.slots[RE.order.indexOf(L.el.dataset.v)];
    ringSettling = true;
    L.ghost.classList.add("settle");
    L.ghost.style.left = rr.left + s.x - lay.u / 2 + "px";
    L.ghost.style.top = rr.top + s.y - lay.u / 2 + "px";
    setTimeout(() => {
      ringSettling = false;
      L.ghost.remove();
      L.el.classList.remove("placeholder");
      commit();
    }, 200);
    return;
  }
  L.ghost.remove();
  L.el.classList.remove("placeholder");
  setCatOrder(
    L.grid.dataset.kind,
    [...L.grid.querySelectorAll(".tile")].map(b => b.dataset.v)
  );
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
  if (b.closest(".calc")) buzz("key"); // keypad keys click on touch-down, like the phone's keyboard
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
      hsw = null;
      if (LP) {
        clearTimeout(LP.timer);
        stopRepeat();
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
  if (e.target.closest(".tile,.tx,.dd,.chip,.dot,.calc,.amtwrap.calcing")) e.preventDefault();
});
