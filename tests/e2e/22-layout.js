// Layout across screen sizes and text sizes: every screen, sheet and dialog is opened with realistic data on a range
// of mainstream phones (small to large, 16:9 to 21:9), foldables and tablets (portrait and landscape) and a phone in
// landscape, at the normal and the largest supported text size. Each state is checked for anything that spills off
// the screen, text cut off without an ellipsis, controls overlapping each other, tap targets that are too small and
// sheets taller than the screen. Screenshots of every state go to tests/e2e/output/22-layout/ for review.
//
// LAYOUT_FULL=1 runs every size with every text scale (the default is a smaller matrix that still covers the edges);
// LAYOUT_ONLY=<device ids> runs only those sizes. Then the languages with the longest words (German, Russian) and
// Chinese run on the tightest sizes; LAYOUT_LANGS=<codes> picks others (en-XA: accented English a third longer).
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("22-layout");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};

/* CSS px sizes of mainstream devices */
const DEVICES = [
  { id: "small-16x9", w: 320, h: 640 }, // small phone, or a 360 px phone at the largest display size
  { id: "compact-16x9", w: 360, h: 640 },
  { id: "phone-20x9", w: 360, h: 800 },
  { id: "galaxy-s", w: 360, h: 780 }, // Galaxy S2x, the most sold Android phones
  { id: "galaxy-a", w: 384, h: 854 }, // Galaxy A and Ultra
  { id: "pixel", w: 393, h: 852 },
  { id: "large-phone", w: 412, h: 915 },
  { id: "max-phone", w: 430, h: 932 },
  { id: "small-landscape", w: 640, h: 360 }, // phones held sideways
  { id: "phone-landscape", w: 800, h: 360 },
  { id: "large-landscape", w: 932, h: 430 },
  { id: "foldable", w: 673, h: 841 },
  { id: "foldable-landscape", w: 841, h: 673 },
  { id: "tablet-portrait", w: 800, h: 1280 },
  { id: "tablet-landscape", w: 1280, h: 800 },
];
const SCALES = [1, 1.3];
const FULL = !!process.env.LAYOUT_FULL,
  ONLY = (process.env.LAYOUT_ONLY || "").split(",").filter(Boolean); // e.g. LAYOUT_ONLY=small-16x9,pixel
/* LAYOUT_SIZES=<w>x<h>,…: those window sizes instead (a sweep across the widths where the layout changes) */
const SIZES = (process.env.LAYOUT_SIZES || "")
  .split(",")
  .filter(Boolean)
  .map(x => {
    const [win, scr] = x.split("s"), // <w>x<h>s<screen w>x<screen h>: a window smaller than its screen (split screen)
      [w, h] = win.split("x").map(Number),
      [sw, sh] = (scr || win).split("x").map(Number);
    return { id: x, w, h, sw, sh };
  });
const matrix = (SIZES.length ? SIZES : DEVICES.filter(d => !ONLY.length || ONLY.includes(d.id))).flatMap(d =>
  SCALES.filter(
    s =>
      FULL ||
      s === 1 ||
      SIZES.length ||
      ["small-16x9", "phone-20x9", "phone-landscape", "large-landscape", "tablet-portrait"].includes(d.id)
  ).map(s => ({ ...d, s }))
);

/* other languages, on the sizes where room is tightest; the locale writes numbers and dates as that phone would */
const LANG_LOCALE = { de: "de-DE", ru: "ru-RU", "zh-Hans": "zh-CN", es: "es-ES", "pt-BR": "pt-BR", fr: "fr-FR" };
Object.assign(LANG_LOCALE, { id: "id-ID", tr: "tr-TR", "en-XA": "en-US" });
const LANGS = (process.env.LAYOUT_LANGS || "de,ru,zh-Hans").split(",").filter(Boolean);
const runs = matrix
  .map(d => ({ ...d, lang: "en" }))
  .concat(
    (ONLY.length || SIZES.length) && !process.env.LAYOUT_LANGS
      ? []
      : LANGS.flatMap(lang =>
          DEVICES.filter(d => ["small-16x9", "phone-landscape"].includes(d.id)).map(d => ({
            ...d,
            s: d.id === "small-16x9" ? 1.3 : 1,
            lang,
          }))
        )
  );
/* accented English a third longer, to find text that's cut or doesn't wrap (Android's own en-XA idea) */
function pseudo() {
  const flat = (o, p = "") =>
    Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v, p + k + ".") : [[p + k, v]]));
  const A = [..."àƀçđéƒĝĥîĵķļɱñöþǫŕšţûṽŵẋýžÀßÇĐÉƑĜĤÎĴĶĻṀÑÖÞǪŔŠŢÛṼŴẊÝŽ"],
    L = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const tr = t =>
    t
      .split(/(\{\{\w+\}\})/)
      .map((q, i) => (i % 2 ? q : [...q].map(c => (L.includes(c) ? A[L.indexOf(c)] : c)).join("")))
      .join("") + " ·".repeat(Math.ceil(t.length / 6));
  const en = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../../l10n/web/en.json"), "utf8"));
  return JSON.stringify(Object.fromEntries(flat(en).map(([k, v]) => [k, tr(v)])));
}
/* a notebook as a real user might have it: several accounts and currencies, a day of spending, loans, an asset */
function sampleState(t, nCats) {
  const ago = n => {
    const d = new Date(t + "T12:00:00");
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const ahead = n => ago(-n);
  const tx = [];
  let n = 0;
  const add = (date, type, amount, account, extra) =>
    tx.push(Object.assign({ id: "t" + ++n, ts: 1000 + n, date, type, amount, account, note: "" }, extra));
  const spend = [
    ["groceries", 46.2],
    ["food", 18.5],
    ["transport", 3.25],
    ["bills", 120],
    ["shopping", 59.99],
    ["fun", 24],
    ["health", 12.4],
  ];
  for (let d = 0; d < 40; d++)
    spend.forEach(([cat, a], i) => (d + i) % 3 === 0 && add(ago(d), "expense", a, i % 2 ? "c" : "b", { cat }));
  add(ago(1), "income", 2450, "b", { cat: "income" });
  add(ago(2), "transfer", 200, "b", { to: "c" });
  /* today's transfer with a charge: Home's ring shows its grey part and the Charges label (docs/specs/charges.md) */
  add(ago(0), "transfer", 80, "b", { to: "k", feeId: "t" + (n + 2) });
  add(ago(0), "expense", 1.5, "b", { cat: "other", feeOf: "t" + n });
  add(ago(5), "loan", 300, "c", {
    dir: "out",
    loan: "L1",
    principal: true,
    due: ago(1),
    note: "Lent for the trip, back by Friday if the pay arrives in time",
  });
  add(ago(4), "adjust", -12.5, "c", { note: "Counted the drawer again and found the coins from the jar missing" });
  add(ago(3), "loan", 1000, "c", { dir: "out", loan: "L1", principal: true, due: ahead(5) });
  add(ago(8), "loan", 2500, "s", { dir: "in", loan: "L2", principal: true, due: ahead(20) });
  const cats = [];
  for (let i = 0; i < nCats - 12; i++)
    cats.push({
      id: "x" + i,
      name: [
        "Coffee",
        "Pets",
        "Gifts",
        "Gym",
        "Books",
        "Phone",
        "Internet",
        "Kids",
        "Taxes",
        "Repairs",
        "Travel",
        "Charity",
      ][i],
      i: "star",
      c: "#5b6cff",
      kind: "out",
    });
  return {
    v: 6,
    settings: { cur: "USD", week: 1, clock: "24", lastCheck: t },
    accounts: [
      { id: "b", name: "Everyday account", type: "bank", currency: "USD", opening: 3200 },
      { id: "c", name: "Cash", type: "cash", currency: "USD", opening: 240 },
      { id: "k", name: "Credit card", type: "card", currency: "USD", opening: -350 },
      { id: "s", name: "Savings abroad", type: "savings", currency: "EUR", opening: 12000 },
    ],
    cats: nCats > 12 ? undefined : undefined,
    extraCats: cats,
    txns: tx,
    loans: [
      {
        id: "L1",
        kind: "lend",
        person: "Alexandra Johnson-Smith",
        account: "c",
        date: ago(5),
        note: "",
        status: "open",
      },
      { id: "L2", kind: "borrow", person: "Sam", account: "s", date: ago(8), note: "", status: "open" },
    ],
    assets: [{ id: "a1", name: "Laptop", i: "laptop", c: "#5b6cff", value: 1400, currency: "USD" }],
  };
}

/* runs in the page: problems with the layer on top (dialog, sheet2, sheet or the screen) */
function inspect() {
  const vw = innerWidth,
    vh = innerHeight,
    out = [];
  const layer =
    [...document.querySelectorAll("#pop > *, #sheet2 > *, #sheet > *")]
      .filter(e => e.offsetParent || e.getClientRects().length)
      .pop() || document.getElementById("app");
  const vis = e => {
    const s = getComputedStyle(e);
    if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = e =>
    (e.id
      ? "#" + e.id
      : e.tagName.toLowerCase() +
        (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : "")) +
    (e.dataset && e.dataset.act ? "[" + e.dataset.act + (e.dataset.v ? "=" + e.dataset.v : "") + "]" : "");
  // 1. the page never scrolls sideways
  if (document.documentElement.scrollWidth > vw + 1)
    out.push("page scrolls sideways: " + document.documentElement.scrollWidth + " > " + vw);
  // 2. text cut off: a text element wider/taller than its box, without an ellipsis, in a box that hides overflow
  const all = [...layer.querySelectorAll("*")].filter(vis);
  for (const e of all) {
    const s = getComputedStyle(e);
    const own = [...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim());
    if (!own) continue;
    const scrolls = /auto|scroll/.test(s.overflowX);
    if (
      e.scrollWidth > e.clientWidth + 1 &&
      s.overflowX !== "visible" &&
      !scrolls &&
      s.textOverflow !== "ellipsis" &&
      e.clientWidth > 0
    )
      out.push(
        "text cut off (width) " +
          name(e) +
          " '" +
          e.textContent.trim().slice(0, 30) +
          "' " +
          e.scrollWidth +
          ">" +
          e.clientWidth
      );
    if (
      e.scrollHeight > e.clientHeight + 2 &&
      s.overflowY === "hidden" &&
      !/-webkit-box/.test(s.display) &&
      /* lines clamped on purpose end in "…" (newer Chrome computes their -webkit-box as flow-root): an entry's title
         (.tx.en .d, two lines; .list.tight .tx.en .d and .tx.en.stacked .d, three) and a tile's name (.cat .cn, two) */
      !(s.webkitLineClamp && s.webkitLineClamp !== "none") &&
      e.clientHeight > 0 &&
      s.whiteSpace !== "nowrap"
    )
      out.push(
        "text cut off (height) " +
          name(e) +
          " '" +
          e.textContent.trim().slice(0, 30) +
          "' " +
          e.scrollHeight +
          ">" +
          e.clientHeight
      );
    // text past the screen edge (not inside something that scrolls sideways), as far as no box around it clips it
    const r = document.createRange();
    r.selectNodeContents(e);
    const b = s.overflowX === "visible" ? r.getBoundingClientRect() : e.getBoundingClientRect(); // clipped: its box
    let sc = e.parentElement,
      inScroller = false,
      left = b.left,
      right = b.right;
    while (sc && sc !== document.body) {
      const o = getComputedStyle(sc).overflowX;
      if (/auto|scroll/.test(o)) inScroller = true;
      else if (o !== "visible") {
        const c = sc.getBoundingClientRect();
        left = Math.max(left, c.left);
        right = Math.min(right, c.right);
      }
      sc = sc.parentElement;
    }
    if (!inScroller && (right > vw + 1 || left < -1))
      out.push("text off screen " + name(e) + " '" + e.textContent.trim().slice(0, 30) + "'");
  }
  // 7. text too small to read (the smallest size per state is reported once)
  let tiny = null;
  for (const e of all) {
    if (![...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())) continue;
    const px = parseFloat(getComputedStyle(e).fontSize);
    if (px < (e.matches(".rt .cn, .rt .cp, .rchg *") ? 9 : 10) && (!tiny || px < tiny[0])) tiny = [px, e]; // ring names: see ringHTML
  }
  if (tiny)
    out.push(
      "text too small " +
        tiny[0].toFixed(1) +
        "px " +
        name(tiny[1]) +
        " '" +
        tiny[1].textContent.trim().slice(0, 20) +
        "'"
    );
  // 9. a category name cut to an ellipsis (fitFigures makes it a little smaller first); a full ring (more than 16, at
  //    9px) may cut, as a launcher does
  for (const e of layer.querySelectorAll(".cat .cn")) {
    const ring = e.closest(".ring");
    if (ring && ring.querySelectorAll(".rt").length > 16) continue;
    if (vis(e) && e.scrollWidth > e.clientWidth + 1) out.push("name cut " + name(e) + " '" + e.textContent + "'");
  }
  // 2b. Home's balance bar: every figure and code lies wholly inside the bar, the codes in one column, the figures
  //     right-aligned in the other; a row of chips that scrolls fades at its edge
  for (const bar of layer.querySelectorAll(".balbar")) {
    if (!vis(bar)) continue;
    const bt = bar.querySelector(".bt"),
      br = bar.getBoundingClientRect();
    if (bt.scrollWidth > bt.clientWidth + 1) out.push("balance bar figures wider than their box");
    for (const e of bar.querySelectorAll("b, .bcc, .bcap, .l")) {
      const r = e.getBoundingClientRect();
      if (r.left < br.left - 0.5 || r.right > br.right + 0.5)
        out.push("balance bar text outside the bar: " + e.textContent);
    }
    const fig = [...bar.querySelectorAll("b")].map(e => Math.round(e.getBoundingClientRect().right));
    if (new Set(fig).size > 1) out.push("balance bar figures not right-aligned " + fig);
    const lr = bar.querySelector(".l").getBoundingClientRect();
    for (const e of bt.children) {
      const r = e.getBoundingClientRect();
      if (r.width && r.top < lr.bottom - 1 && r.left < lr.right - 1) out.push("balance bar block overlaps its label");
    }
  }
  for (const st of layer.querySelectorAll(".strip"))
    if (
      vis(st) &&
      st.scrollWidth > st.clientWidth + 1 &&
      st.scrollLeft + st.clientWidth < st.scrollWidth - 2 &&
      !st.classList.contains("fade")
    )
      out.push("the scrolling chip row does not fade");
  // 3. controls overlapping, 4. tap targets too small
  const ctl = all.filter(
    e =>
      e.matches("button, input, select, textarea, a[href], [role=switch]") &&
      !e.closest(".ring, .wheel, .cal, .mslider, .smchart, .sm, .strip")
  );
  const rects = ctl
    .map(e => [e, e.getBoundingClientRect()])
    .filter(([, r]) => r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw);
  for (let i = 0; i < rects.length; i++) {
    const [a, ra] = rects[i];
    if (ra.width < 32 || ra.height < 32) {
      if (!a.matches("input[type=search], .x, .chip, a"))
        out.push("small target " + name(a) + " " + Math.round(ra.width) + "x" + Math.round(ra.height));
    }
    for (let j = i + 1; j < rects.length; j++) {
      const [b, rb] = rects[j];
      if (a.contains(b) || b.contains(a)) continue;
      // the calculator keypad slides over the form on purpose (the form scrolls above it)
      if (!!a.closest(".calc") !== !!b.closest(".calc")) continue;
      // and the Filters sheet's sticky foot over the chips that scroll up behind it
      if (!!a.closest(".hfs-foot") !== !!b.closest(".hfs-foot")) continue;
      // so do the period arrows over the label's padding (on top of it, each keeping its 48px)
      if (a.closest(".pnav") && b.closest(".pnav")) continue;
      const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left),
        y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (x > 2 && y > 2) out.push("overlap " + name(a) + " / " + name(b));
    }
  }
  // 11. every control in view can be tapped: nothing lies on top of its middle (a bar, a scrim, another layer). One
  //     only partly in view (under the bottom bar, past its panel's edge, behind the keypad) is reached by scrolling.
  const nav = layer.id === "app" && document.querySelector("#nav"),
    navTop = nav && nav.getClientRects().length ? nav.getBoundingClientRect().top : vh;
  for (const [e, r] of rects) {
    if (e.disabled || e.closest(".calc")) continue;
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    if (cx < 0 || cx > vw || cy < 0 || cy > Math.min(vh, navTop)) continue;
    let sc = e.parentElement,
      clipped = false;
    while (sc && sc !== document.body) {
      if (/auto|scroll|hidden/.test(getComputedStyle(sc).overflowY)) {
        const c = sc.getBoundingClientRect();
        if (cy < c.top || cy > c.bottom || cx < c.left || cx > c.right) clipped = true;
      }
      sc = sc.parentElement;
    }
    const pad = [...document.querySelectorAll(".calc")].find(vis); // the open one (a form with a card has several)
    if (pad && cy > pad.getBoundingClientRect().top) clipped = true;
    const foot = document.querySelector(".hfs-foot");
    if (foot && vis(foot) && !e.closest(".hfs-foot") && cy > foot.getBoundingClientRect().top) clipped = true;
    if (clipped) continue;
    const hit = document.elementFromPoint(cx, cy);
    // (the calculator's caret mirror lies over the amount on purpose: a tap there places the caret)
    // (under the bottom bar: reached by scrolling)
    if (hit && hit.closest("#nav")) continue;
    if (hit && hit !== e && !e.contains(hit) && !(hit.dataset && hit.dataset.act === "calc-pos"))
      out.push("can't be tapped " + name(e) + " (under " + name(hit) + ")");
  }
  // 5. ring icons and labels never overlap each other (only checked on the screen itself)
  const tiles =
    layer.id !== "app"
      ? []
      : [...document.querySelectorAll("#app .ring .cat .ci, #app .ring .cat .cn, #app .ring .cat .cp")]
          .filter(e => (vis(e) && e.textContent.trim() !== "") || e.classList.contains("ci"))
          .map(e => {
            const r = document.createRange();
            r.selectNodeContents(e);
            /* a label's visible part: its text, cut to its own box (long names end in an ellipsis) */
            const b = e.getBoundingClientRect(),
              tr = r.getBoundingClientRect();
            return [
              e,
              e.classList.contains("ci")
                ? b
                : {
                    left: Math.max(b.left, tr.left),
                    right: Math.min(b.right, tr.right),
                    top: tr.top,
                    bottom: tr.bottom,
                  },
            ];
          });
  for (let i = 0; i < tiles.length; i++)
    for (let j = i + 1; j < tiles.length; j++) {
      const [ea, a] = tiles[i],
        [eb, b] = tiles[j];
      if (ea.closest(".cat") === eb.closest(".cat")) continue;
      if (
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
      )
        out.push(
          "ring overlap " +
            ea.closest(".cat").dataset.v +
            "." +
            ea.className.split(" ")[0] +
            " / " +
            eb.closest(".cat").dataset.v +
            "." +
            eb.className.split(" ")[0]
        );
    }
  // 12. Home's Charges label: wholly in view, outside the donut, clear of every tile's icon, name and %; in the ring's
  //     top right corner, or, where a tile reaches into it, on a line of its own above the ring; 6px under the chips
  const chl = layer.id === "app" && document.querySelector("#ring .rchg"),
    ring0 = document.getElementById("ring");
  if (chl && vis(chl)) {
    const L = chl.getBoundingClientRect(),
      rg = ring0.getBoundingClientRect(),
      dw = ring0.querySelector(".dwrap").getBoundingClientRect(),
      st = document.querySelector("#app .strip");
    if (L.left < 0 || L.right > vw || (document.body.classList.contains("land") && scrollY === 0 && L.top < 0))
      out.push("Charges label off screen");
    const cx = dw.left + dw.width / 2,
      cy = dw.top + dw.height / 2;
    if (
      Math.hypot(Math.max(L.left, Math.min(cx, L.right)) - cx, Math.max(L.top, Math.min(cy, L.bottom)) - cy) <
      dw.width / 2
    )
      out.push("Charges label on the donut");
    for (const [e, b] of tiles)
      if (
        Math.min(b.right, L.right) > Math.max(b.left, L.left) &&
        Math.min(b.bottom, L.bottom) > Math.max(b.top, L.top)
      )
        out.push("Charges label over " + e.closest(".cat").dataset.v + "." + e.className.split(" ")[0]);
    if (Math.abs(rg.right - L.right - 2) > 0.6)
      out.push("Charges label not at the ring's right " + (rg.right - L.right));
    if (chl.classList.contains("up") ? L.bottom > rg.top + 0.5 : Math.abs(L.top - rg.top - 2) > 0.6)
      out.push("Charges label out of its place " + Math.round(L.top - rg.top));
    if (st && Math.abs(L.top - st.getBoundingClientRect().bottom - 6) > 0.6)
      out.push("Charges label not 6px under the chips " + (L.top - st.getBoundingClientRect().bottom));
  }
  if (chl && !vis(chl)) out.push("Charges label left out"); // the grey slice is never shown by its colour alone
  // 8. the amount being typed is never under the calculator keypad, nor scrolled out of its form (a card's field: its
  // row down to the card's bottom, the preview too, where they fit; a row above it may scroll away. Where they don't
  // (two rows at 320 px, 1.3×, the keypad on the first), the row being filled stays whole and the preview goes under)
  const pad = [...document.querySelectorAll(".calc")].find(vis),
    aoRow = document.querySelector(".aorow.calcing"),
    amt = document.querySelector(".amtwrap.calcing") || aoRow;
  if (pad && amt) {
    const card = aoRow && aoRow.closest(".aocard"),
      r = amt.getBoundingClientRect(),
      k = pad.getBoundingClientRect(),
      sc = amt.closest(".p"),
      cb = card ? card.getBoundingClientRect().bottom : r.bottom,
      fits = cb - r.top <= k.top - (sc ? sc.getBoundingClientRect().top : 0) - 8,
      a = card && fits ? { left: r.left, right: r.right, top: r.top, bottom: cb } : r;
    const under =
      Math.min(a.right, k.right) - Math.max(a.left, k.left) > 2 &&
      Math.min(a.bottom, k.bottom) - Math.max(a.top, k.top) > 2;
    if (under || a.top < 0 || a.bottom > vh + 1 || (sc && a.top < sc.getBoundingClientRect().top - 1))
      out.push("amount hidden by the keypad");
  }
  // 9. a phone held sideways: the Home ring is wholly in view
  const ring = document.getElementById("ring");
  if (document.body.classList.contains("land") && ring && layer.id === "app" && scrollY === 0) {
    const r = ring.getBoundingClientRect();
    if (r.top < -1 || r.bottom > vh + 1)
      out.push("ring not wholly in view sideways " + Math.round(r.top) + ".." + Math.round(r.bottom));
    // and centred in the height: the room above and below it about equal
    if (Math.abs(r.top - (vh - r.bottom)) > 8)
      out.push("ring off centre sideways: " + Math.round(r.top) + " above, " + Math.round(vh - r.bottom) + " below");
  }
  // 10. Home's period label shows "Today" whole at the normal text size, even on a phone held sideways
  const pl = layer.id === "app" && document.querySelector(".pnav .plabel > span");
  if (pl && window.__fontScale === 1 && pl.textContent === "Today" && pl.scrollWidth > pl.clientWidth + 1)
    out.push("period label cut: " + pl.scrollWidth + ">" + pl.clientWidth);
  // 7. words wrap rather than being cut ("…") or set smaller: rows, chips, tiles, fields, tabs and buttons (figures may
  //    shrink, Home's ring keeps its names whole or leaves them out, and a very long entry title ends in "…" after
  //    its lines)
  for (const e of layer.querySelectorAll(
    ".tx:not(.en) .d, .tx .s, .tx .an, .chip .chn, .cat:not(.rt) .cn, .fieldbtn > span, .seg > button, .fbtn, .row > .btn, .acc .n > span"
  )) {
    if (!vis(e) || e.closest("[aria-hidden=true]")) continue;
    const t = "'" + e.textContent.trim().slice(0, 30) + "'";
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible")
      out.push("words cut " + name(e) + " " + t);
    else if (/-webkit-box/.test(getComputedStyle(e).display) && e.scrollHeight > e.clientHeight + 2)
      out.push("lines cut " + name(e) + " " + t);
    if (e.style.fontSize) out.push("words set smaller " + name(e) + " " + t);
  }
  // 6. a sheet or dialog fits the screen (its content scrolls inside)
  const box = layer.querySelector(".p, .dlg, [role=dialog]");
  if (box && box !== layer) {
    const r = box.getBoundingClientRect();
    if (r.height > vh + 1 || r.top < -1) out.push("layer taller than the screen " + Math.round(r.height) + " > " + vh);
    if (r.width > vw + 1) out.push("layer wider than the screen");
  }
  return [...new Set(out)];
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const summary = {},
    chgSeen = {}; // where Home's Charges label went: in its corner, or up on its own line (sideways: "cut", the ring smaller)
  for (const dev of runs) {
    const ctx = await browser.newContext({
      uiLang: dev.lang,
      viewport: { width: dev.w, height: dev.h },
      screen: { width: dev.sw || dev.w, height: dev.sh || dev.h }, // its shape tells a phone held sideways (phoneLand)
      deviceScaleFactor: 1,
      isMobile: true,
      reducedMotion: "reduce", // sheets and dialogs appear at once, so each state is measured settled
      hasTouch: true,
      locale: LANG_LOCALE[dev.lang] || "en-US",
    });
    if (dev.lang === "en-XA") await ctx.addInitScript(c => (window.I18N = { "en-XA": c }), pseudo());
    await ctx.addInitScript(s => {
      window.Android = {
        getColors: () => null,
        setBars() {},
        setReminders() {},
        takeActions: () => "[]",
        requestNotifications() {},
        saveFile() {},
        fontScale: () => s,
      };
      window.__fontScale = s;
    }, dev.s);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    const tag = dev.id + "@" + dev.s + (dev.lang === "en" ? "" : "-" + dev.lang);
    const states = [];
    const shot = async (label, open) => {
      await page.evaluate(() => {
        closeSheet();
        $("#pop").innerHTML = "";
        if (V.find) {
          V.find = false; // search mode left without keeping its words
          histClear();
        }
        V.screen = "home";
        render();
        scrollTo(0, 0);
      });
      if (open) await open();
      await page.waitForTimeout(80);
      const probs = await page.evaluate(inspect);
      await page.screenshot({ path: OUT + "/" + tag + "-" + label + ".png" });
      states.push(label);
      if (probs.length) summary[tag + " " + label] = probs;
    };
    const seed = async nCats => {
      const t = await page.evaluate(() => today());
      const st = sampleState(t, nCats);
      await page.evaluate(st => {
        const extra = st.extraCats;
        delete st.extraCats;
        localStorage.setItem("tally:v1", JSON.stringify(st));
        localStorage.setItem("extra", JSON.stringify(extra));
      }, st);
      await page.reload();
      await page.evaluate(() => {
        const extra = JSON.parse(localStorage.getItem("extra") || "[]");
        extra.forEach(c => S.cats.splice(S.cats.filter(x => x.kind === "out").length, 0, c));
        save();
        render();
      });
    };
    // welcome
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await shot("welcome");
    await seed(12);
    const ev = f => () => page.evaluate(f);
    await shot("home", null);
    if (!(await page.evaluate(() => !!document.querySelector("#ring .rchg"))))
      summary[tag + " home"] = ["no Charges label on Home"];
    /* a few big tiles: the one right of 12 o'clock can reach into the label's corner (then it takes its own line) */
    const charges = async label => {
      const c = await page.evaluate(() => {
        const l = document.querySelector("#ring .rchg");
        if (!l) return "none";
        return l.classList.contains("up") ? (document.getElementById("ring").dataset.cut ? "cut" : "up") : "corner";
      });
      chgSeen[c] = (chgSeen[c] || []).concat(tag + " " + label);
    };
    const shown = await page.evaluate(() => S.cats.map(c => c.hidden));
    for (const k of [4, 5, 6, 7]) {
      await shot("home-" + k, () =>
        page.evaluate(k => {
          S.cats.filter(c => c.kind === "out").forEach((c, i) => (c.hidden = i >= k));
          render();
        }, k)
      );
      await charges("home-" + k);
    }
    await page.evaluate(shown => {
      S.cats.forEach((c, i) => (c.hidden = shown[i]));
      save();
      render();
    }, shown);
    await shot(
      "home-check",
      ev(() => {
        S.settings.lastCheck = "";
        S.settings.remind.check = true;
        S.settings.remind.checkTime = "00:00";
        render();
      })
    );
    await page.evaluate(() => {
      S.settings.lastCheck = today();
      save();
    });
    /* B9: three currencies stack down the bar; B10 / B11: loan rows with dots, the loan sheets, a balance fix */
    await shot(
      "home-3cur",
      ev(() => {
        S.accounts.push({ id: "g", name: "Pound account", type: "bank", currency: "GBP", opening: 380 });
        render();
      })
    );
    await shot(
      "loan-paid",
      ev(() => {
        S.txns.push({
          id: "p1",
          ts: 9000,
          date: today(),
          type: "loan",
          dir: "in",
          loan: "L1",
          amount: 400,
          account: "c",
        });
        loanOpen("L1");
        document.querySelectorAll("#sheet .tx.exp .txh").forEach(b => b.click());
      })
    );
    await page.evaluate(() => {
      S.txns = S.txns.filter(t => t.id !== "p1");
      S.accounts = S.accounts.filter(a => a.id !== "g");
      save();
    });
    await shot(
      "loan-unpaid",
      ev(() => loanOpen("L2"))
    );
    await shot(
      "balance-fix",
      ev(() => adjSheet(S.txns.find(t => t.type === "adjust").id))
    );
    await shot(
      "assets",
      ev(() => {
        V.screen = "assets";
        render();
      })
    );
    await shot(
      "liabilities",
      ev(() => {
        V.screen = "liabs";
        render();
      })
    );
    await shot(
      "history",
      ev(() => {
        V.screen = "history";
        render();
      })
    );
    /* History filtered (chips), and the Filters sheet for Spent, Lent and Transfers with an account */
    await shot(
      "history-filtered",
      ev(() => {
        openHistory({ kind: "out", acc: "b", cat: "groceries" });
      })
    );
    /* the heading columns in words (Transfers) and with the rows' signs (Lent) */
    await shot(
      "history-transfers",
      ev(() => openHistory({ kind: "xfer" }))
    );
    await shot(
      "history-lent",
      ev(() => openHistory({ kind: "lend" }))
    );
    const sheetFor = f => () =>
      page.evaluate(f => {
        V.screen = "history";
        render();
        filtersSheet();
        HFD = histNorm({ ...histBlank(), ...f });
        hfsDraw();
      }, f);
    await shot("history-filters-spent", sheetFor({ kind: "out" }));
    await shot("history-filters-lent", sheetFor({ kind: "lend" }));
    await shot("history-filters-transfers", sheetFor({ kind: "xfer", from: "b" }));
    await page.evaluate(() => histClear());
    /* a loan's and a balance fix's note show in the opened row */
    const openNote = (label, test) =>
      shot(label, () =>
        page.evaluate(test => {
          histClear();
          V.screen = "history";
          render();
          const t = S.txns.find(x => x.note && x.type === test);
          V.open = t.id;
          render();
          const o = document.querySelector(".txo");
          if (o) o.scrollIntoView({ block: "center" });
        }, test)
      );
    await openNote("history-open-loan-note", "loan");
    await openNote("history-open-fix-note", "adjust");
    /* an opened row: a transfer with its fee (two balance boxes), a loan payment (the bar box) */
    const opened = () =>
      ev(() => {
        V.screen = "history";
        render();
        const t = S.txns.find(x => x.type === "transfer");
        V.open = t.id;
        render();
        const o = document.querySelector(".txo");
        if (o) o.scrollIntoView({ block: "center" });
      });
    await shot("history-open-transfer", opened());
    await shot(
      "history-open-loan",
      ev(() => {
        V.screen = "history";
        render();
        const t = S.txns.find(x => x.type === "loan" && !x.principal) || S.txns.find(x => x.type === "loan");
        V.open = t ? t.id : "";
        render();
        const o = document.querySelector(".txo");
        if (o) o.scrollIntoView({ block: "center" });
      })
    );
    /* charges and extras (docs/specs/charges.md, "History rows"): a lend with a transfer charge and an extra (its chips
       in the loan's box), its part payback (the quiet line), a payback with a tip, a purchase with its charge, a loan
       payment covering its charges with a transfer charge; then the Lent and Borrowed headings with their words */
    await page.evaluate(() => {
      const d = today(),
        e = (id, type, amount, account, more) =>
          S.txns.push({ id, ts: 9000 + S.txns.length, date: d, type, amount, account, note: "", ...more });
      S.loans.push({
        id: "L9",
        kind: "lend",
        person: "Maximiliane Hoffmann-Lindqvist",
        account: "c",
        date: d,
        note: "",
        status: "open",
      });
      e("c9d", "loan", 1000, "c", { dir: "out", loan: "L9", principal: true, onTop: 150, feeId: "c9c" });
      e("c9c", "loan", 100, "c", { dir: "out", loan: "L9", principal: true, feeOf: "c9d" });
      e("c9p", "loan", 500, "c", { dir: "in", loan: "L9" });
      e("c9e", "expense", 1000, "b", { cat: "food", payee: "Restaurant am Marktplatz", feeId: "c9x" });
      e("c9x", "expense", 150, "b", { cat: "food", feeOf: "c9e" });
      e("c9t", "loan", 300, "c", { dir: "in", loan: "L1", feeId: "c9tt" });
      e("c9tt", "income", 25, "c", { cat: "otherin", feeOf: "c9t" });
      S.txns.find(t => t.loan === "L2" && t.principal).onTop = 100;
      e("c9b", "loan", 2600, "s", { dir: "out", loan: "L2", feeId: "c9bc" });
      e("c9bc", "expense", 5, "s", { cat: "fees", feeOf: "c9b" });
      save();
    });
    /* each row opened at the top of History, filtered to its loan or category so that it is in view unscrolled */
    const openRow = (id, f) => () =>
      page.evaluate(
        ([id, f]) => {
          openHistory(f);
          V.open = id;
          render();
        },
        [id, f]
      );
    const maxi = { who: "Maximiliane Hoffmann-Lindqvist" };
    for (const [label, id, f] of [
      ["history-open-lend-chips", "c9d", maxi],
      ["history-open-part-payback", "c9p", maxi],
      ["history-open-tip", "c9t", { who: "Alexandra Johnson-Smith" }],
      ["history-open-purchase-charge", "c9e", { cat: "food" }],
      ["history-open-loan-charges", "c9b", { who: "Sam" }],
    ])
      await shot(label, openRow(id, f));
    await shot(
      "history-lent-extras",
      ev(() => openHistory({ kind: "lend" }))
    );
    await shot(
      "history-borrowed-charges",
      ev(() => openHistory({ kind: "borrow" }))
    );
    await page.evaluate(() => {
      S.txns = S.txns.filter(t => !/^c9/.test(t.id));
      S.loans = S.loans.filter(l => l.id !== "L9");
      delete S.txns.find(t => t.loan === "L2" && t.principal).onTop;
      histClear();
      save();
    });
    await shot(
      "settings",
      ev(() => {
        V.screen = "settings";
        render();
      })
    );
    await shot(
      "settings-end",
      ev(() => {
        V.screen = "settings";
        render();
        scrollTo(0, document.body.scrollHeight);
      })
    );
    await shot(
      "spend",
      ev(() => txSheet(null, "expense", "groceries"))
    );
    await shot(
      "spend-payee",
      ev(() => {
        txSheet(null, "expense", "groceries");
        $("#f-payee").value = "Supermercado Hipermaxi Central"; // long: the box keeps its room, the text scrolls
        $("#f-payee-sug").innerHTML = '<button class="chip"><span class="chn">Supermercado Hipermaxi</span></button>';
        $("#f-payee-sug").hidden = false;
      })
    );
    await shot(
      "spend-cats",
      ev(() => {
        txSheet(null, "expense");
        $("#sheet .p").scrollTop = 0;
      })
    );
    await shot(
      "income",
      ev(() => txSheet(null, "income"))
    );
    // design round, task 9: Received's category chip with its grid open, a picked account's tint, the emblem's pen
    await shot("income-cats", async () => {
      await page.evaluate(() => txSheet(null, "income"));
      await page.click("#f-catchip");
    });
    await shot(
      "spend-account-picked",
      ev(() => {
        txSheet(null, "expense", "groceries");
        pickAccount(S.accounts[S.accounts.length - 1].id);
        $("#sheet .p").scrollTop = 1e5;
      })
    );
    await shot(
      "lend-note",
      ev(() => {
        loanForm("lend");
        $("#sheet .p").scrollTop = 1e5;
      })
    );
    await shot("quick-add", async () => {
      await page.evaluate(() => {
        txSheet(null, "expense", "groceries");
        txQuickAdd("cat");
      });
    });
    await shot("spend-calc", async () => {
      await page.evaluate(() => txSheet(null, "expense", "groceries"));
      await page.click('#sheet [data-act="calc-toggle"]');
    });
    await shot(
      "transfer",
      ev(() => trSheet())
    );
    /* the stacked-button dialogs (choiceDialog) and their second steps */
    const folderAsk = async text => {
      await page.evaluate(t => {
        window.__readAuto = readAutoBackup;
        readAutoBackup = cb => cb({ text: t || JSON.stringify(S) });
        folderCheck();
        readAutoBackup = window.__readAuto;
      }, text);
    };
    await shot("choice-folder", () => folderAsk());
    await shot("choice-folder-restore", async () => {
      await folderAsk();
      await page.click("#pop .cd-keep");
    });
    await shot("choice-folder-overwrite", async () => {
      await folderAsk();
      await page.click("#pop .cd-destroy");
    });
    await shot("choice-unreadable", () => folderAsk('{"v":6,"accounts":['));
    await shot("choice-unreadable-overwrite", async () => {
      await folderAsk('{"v":6,"accounts":[');
      await page.click("#pop .cd-destroy");
    });
    await shot(
      "choice-restore-file",
      ev(() => restoreText(JSON.stringify(S), { when: Date.now() }))
    );
    await shot(
      "choice-restore-picked",
      ev(() => restoreText(JSON.stringify(S)))
    );
    await shot(
      "choice-wipe",
      ev(() => wipeAll())
    );
    await shot("choice-wipe-final", async () => {
      await page.evaluate(() => wipeAll());
      await page.click("#pop .cd-destroy");
    });
    /* Delete asks whether the balance changes or stays: one entry, a selection, and a loan entry (no keep) */
    await shot(
      "choice-delete",
      ev(() => deleteAsk([S.txns.find(t => t.type === "expense" && !t.feeOf).id], () => {}))
    );
    await shot(
      "choice-delete-several",
      ev(() =>
        deleteAsk(
          S.txns
            .filter(t => t.type === "expense" && !t.feeOf)
            .map(t => t.id)
            .slice(0, 3),
          () => {}
        )
      )
    );
    await shot(
      "choice-delete-loan",
      ev(() => deleteAsk([S.txns.find(t => t.type === "loan").id], () => {}))
    );
    /* the transfer charge's card: open and filled, the keypad on it (its bar named, a result after the name), and the
       keypad on the amount while it is open (the card idle) */
    const card = async keys => {
      await page.evaluate(() => trSheet());
      await page.waitForTimeout(100); // the form focuses its amount 60ms after it opens (focusAmt)
      await page.evaluate(() => {
        $("#f-amt").value = groupDigits("1000"); // the phone's separators
        $('#sheet [data-act="addon-add"][data-v="xcharge"]').click();
        $("#f-charge").value = "10";
        trPreview();
        document.activeElement.blur();
      });
      /* (the keys through the page: a keypad still sliding up can't be clicked in this run's frames) */
      for (const [id, ks] of keys)
        await page.evaluate(
          ([id, ks]) => {
            calcToggle(id, calcToggleBtn(id));
            ks.forEach(calcKey);
          },
          [id, ks]
        );
      const bad = await page.evaluate(
        want => {
          const out = [],
            c = $("#sheet .aocard"),
            res = CALC && $("#cr-" + CALC.id);
          if (want && (!CALC || CALC.id !== want)) out.push("the keypad isn't open on " + want);
          if (!c || !c.offsetParent || !c.querySelector(".aoprev").textContent) out.push("no card with its preview");
          if ($("#sheet .aoline").textContent) out.push("the preview shown twice");
          if (res && (!res.querySelector(".calcname") || (CALC.expr.length > 2 && !res.querySelector(".calceq"))))
            out.push("the keypad's bar doesn't name its field and result: " + res.textContent);
          return out;
        },
        (keys[keys.length - 1] || [])[0]
      );
      if (bad.length) throw new Error("transfer charge card: " + bad.join("; "));
    };
    await shot("transfer-charge", () => card([]));
    await shot("transfer-charge-keypad", () => card([["f-charge", ["+", "5"]]]));
    await shot("transfer-charge-amount", () => card([["f-amt", ["+", "2", "5", "0"]]]));
    await shot(
      "account",
      ev(() => accOpen("b"))
    );
    await shot(
      "account-form",
      ev(() => accForm("b"))
    );
    await shot(
      "lend-form",
      ev(() => loanForm("lend"))
    );
    /* the lend and borrow forms with their cards (docs/specs/charges.md, "The card"): Lend's one card of two rows with
       one preview at its bottom (and the keypad on its extra), one row with the other's button back under it, and
       Borrow's charges; each with a long name, so the preview wraps */
    /* cut: the keypad opens on the extra first, the form is scrolled until the first row's top is that far above the
       form's top, then the keypad moves to `keypad` (as a tap on that row's calculator would) */
    const loanFormLook = (kind, kinds, keypad, cut) => async () => {
      await page.evaluate(kind => loanForm(kind), kind);
      await page.waitForTimeout(100); // the form focuses the name 60ms after it opens, which would close a keypad
      await page.evaluate(
        ([kinds, keypad, cut]) => {
          $("#f-person").value = "Maximiliane Hoffmann-Lindqvist";
          $("#f-amt").value = groupDigits("1000");
          kinds.forEach((k, i) => {
            $('#sheet [data-act="addon-add"][data-v="' + k + '"]').click();
            $(k === "extra" ? "#f-extra" : "#f-charge").value = i ? "150" : "100";
          });
          formPreview();
          if (document.activeElement) document.activeElement.blur();
          if (keypad && !cut) {
            calcToggle(keypad, calcToggleBtn(keypad));
            ["+", "5"].forEach(calcKey);
          }
        },
        [kinds, keypad, cut]
      );
      if (cut) {
        await page.evaluate(() => calcToggle("f-extra", calcToggleBtn("f-extra")));
        await page.waitForTimeout(80);
        await page.evaluate(cut => {
          const p = $("#sheet .p"),
            row = $("#sheet .aorow");
          p.scrollTop += row.getBoundingClientRect().top - p.getBoundingClientRect().top + cut;
        }, cut);
        await page.evaluate(keypad => {
          calcToggle(keypad, calcToggleBtn(keypad));
          ["+", "5"].forEach(calcKey);
        }, keypad);
      }
      const bad = await page.evaluate(
        ([n, keypad]) => {
          const out = [],
            card = $("#sheet .aocard"),
            prev = card.querySelector(".aoprev"),
            res = CALC && $("#cr-" + CALC.id);
          if (card.hidden || card.querySelectorAll(".aorow:not([hidden])").length !== n)
            out.push("no card with " + n + " rows");
          if (!prev.textContent || card.lastElementChild !== prev) out.push("no preview at the card's bottom");
          if ($("#sheet .aoline").textContent) out.push("the preview shown twice");
          if (
            keypad &&
            (!res || CALC.id !== keypad || !res.querySelector(".calcname") || !res.querySelector(".calceq"))
          )
            out.push("the keypad's bar doesn't name its field and result");
          return out;
        },
        [kinds.length, keypad]
      );
      if (bad.length) throw new Error(kind + " form: " + bad.join("; "));
    };
    await shot("lend-form-both", loanFormLook("lend", ["xcharge", "extra"]));
    await shot("lend-form-both-keypad", loanFormLook("lend", ["xcharge", "extra"], "f-extra"));
    await shot("lend-form-both-keypad-charge", loanFormLook("lend", ["xcharge", "extra"], "f-charge"));
    await shot("lend-form-both-keypad-back", loanFormLook("lend", ["xcharge", "extra"], "f-charge", 20));
    await shot("lend-form-extra", loanFormLook("lend", ["extra"]));
    await shot("borrow-form-charges", loanFormLook("borrow", ["charges"]));
    await shot(
      "loan",
      ev(() => loanOpen("L1"))
    );
    await shot("loan-fee", async () => {
      await page.evaluate(() => loanOpen("L1"));
      await page.click('#sheet [data-act="addon-add"]');
    });
    /* the loan sheet with add-ons (docs/specs/charges.md, "The loan sheet"): the chips under its figure and its history
       lines; the payment card with a tip (the preview in its card) and a loan's payment covering its charges with a
       transfer charge; the Edit of a lend's draw (one card, two rows) and of a payment with its tip */
    const loanLook = (id, step, want) => async () => {
      await page.evaluate(
        ([id, step]) => {
          /* a lending with a transfer charge and an extra, part paid back with a tip on top, and a loan with charges on
             top (made here: the History rows' loans above don't last until now) */
          if (!loan("L7")) {
            const d = today(),
              e = (id, type, amount, account, more) =>
                S.txns.push({ id, ts: 9900 + S.txns.length, date: d, type, amount, account, note: "", ...more });
            S.loans.push(
              { id: "L7", kind: "lend", person: "Maximiliane Hoffmann-Lindqvist", account: "c", date: d, note: "" },
              { id: "L8", kind: "borrow", person: "Maya", account: "b", date: d, note: "" }
            );
            S.loans.slice(-2).forEach(l => (l.status = "open"));
            e("c7d", "loan", 1000, "c", { dir: "out", loan: "L7", principal: true, onTop: 150, feeId: "c7c" });
            e("c7c", "loan", 100, "c", { dir: "out", loan: "L7", principal: true, feeOf: "c7d" });
            e("c7p", "loan", 500, "c", { dir: "in", loan: "L7", feeId: "c7t" });
            e("c7t", "income", 25, "c", { cat: "otherin", feeOf: "c7p" });
            e("c8d", "loan", 1000, "b", { dir: "in", loan: "L8", principal: true, onTop: 100 });
            save();
          }
          loanOpen(id);
          if (step === "tip" || step === "charge") {
            $('#sheet [data-act="addon-add"][data-v="' + (step === "tip" ? "extra" : "xcharge") + '"]').click();
            $(step === "tip" ? "#f-extra" : "#f-charge").value = step === "tip" ? "25" : "5";
          } else if (step) loanDrawEdit(step);
          formPreview();
          if (document.activeElement) document.activeElement.blur();
        },
        [id, step]
      );
      const bad = await page.evaluate(want => {
        const out = [],
          top = $("#sheet2 .p") || $("#sheet .p"),
          card = top.querySelector(".aocard:not([hidden])"),
          line = top.querySelector(".aoline");
        if (want.chips && $("#sheet .hero .lparts").children.length !== want.chips)
          out.push("not " + want.chips + " chips");
        if (want.rows && (!card || card.querySelectorAll(".aorow:not([hidden])").length !== want.rows))
          out.push("no card with " + want.rows + " rows");
        if (want.prev && !(card ? card.querySelector(".aoprev").textContent : line && line.textContent))
          out.push("no preview");
        if (card && line && line.textContent) out.push("the preview shown twice");
        return out;
      }, want);
      if (bad.length) throw new Error("loan sheet " + id + ": " + bad.join("; "));
    };
    await shot("loan-chips", loanLook("L7", "", { chips: 3, prev: true }));
    await shot("loan-pay-tip", loanLook("L7", "tip", { chips: 3, rows: 1, prev: true }));
    await shot("loan-pay-charges", loanLook("L8", "charge", { chips: 2, rows: 1, prev: true }));
    await shot("loan-edit-draw", loanLook("L7", "c7d", { rows: 2, prev: true }));
    await shot("loan-edit-tip", loanLook("L7", "c7p", { rows: 1, prev: true }));
    await shot(
      "summary",
      ev(() => summarySheet())
    );
    await shot("summary-weeks", async () => {
      await page.evaluate(() => summarySheet());
      await page.click('#sheet [data-act="sm-mode"][data-v="w"]');
    });
    await shot("summary-months", async () => {
      await page.evaluate(() => summarySheet());
      await page.click('#sheet [data-act="sm-mode"][data-v="m"]');
      /* the Months pie: a whole disc (no hole, no hub), square, inside the window and the sheet, above the total */
      const pie = await page.evaluate(() => {
        const p = document.querySelector("#sm .smpie"),
          r = p && p.getBoundingClientRect(),
          sh = document.querySelector("#sheet").getBoundingClientRect(),
          big = document.querySelector("#sm .smd .big");
        if (!r) return ["no pie"];
        const out = [];
        if (Math.abs(r.width - r.height) > 1) out.push("pie not square " + r.width + "x" + r.height);
        if (r.left < sh.left - 1 || r.right > sh.right + 1 || r.right > innerWidth + 1)
          out.push("pie outside the sheet");
        if (p.querySelector(".c, circle[stroke]")) out.push("pie has a hub or ring stroke");
        if (!big || big.getBoundingClientRect().top < r.bottom - 1) out.push("total not under the pie");
        /* today's transfer charge: the list ends with the Charges line (a grey dot in the emblem's place, inside its
           row), and the pie with the grey slice */
        const last = document.querySelector("#sm .smtop .tx:last-child"),
          dot = last && last.querySelector(".smi .chdot"),
          paths = p.querySelectorAll("path");
        if (!dot) out.push("no Charges line at the end of the list");
        else {
          const d = dot.getBoundingClientRect(),
            l = last.getBoundingClientRect();
          if (d.left < l.left || d.right > l.right || d.top < l.top || d.bottom > l.bottom)
            out.push("the Charges dot outside its row");
        }
        if (!paths.length || paths[paths.length - 1].getAttribute("fill") !== "#7a8190")
          out.push("the pie doesn't end grey");
        return out;
      });
      if (pie.length) summary[tag + " summary-months pie"] = pie;
    });
    await shot("search", async () => {
      await page.evaluate(() => {
        openFind();
        $("#find-q").value = "a";
        findInput("a");
        findDraw();
      });
    });
    await shot("summary-year", async () => {
      await page.evaluate(() => summarySheet());
      await page.click('#sheet [data-act="sm-mode"][data-v="y"]');
    });
    await shot(
      "entries",
      ev(() => entriesSheet())
    );
    await shot(
      "period",
      ev(() => periodDialog(V))
    );
    await shot("date", async () => {
      await page.evaluate(() => txSheet(null, "expense", "groceries"));
      await page.click('#sheet [data-act="date-open"], #sheet .fieldbtn.date').catch(() => {});
    });
    await shot(
      "time",
      ev(() => timePicker("Evening nudge", "21:00", () => {}))
    );
    await shot(
      "currency",
      ev(() => curPicker("USD", () => {}))
    );
    await shot(
      "icons",
      ev(() => iconPicker("star", "#5b6cff", () => {}))
    );
    await shot(
      "ask",
      ev(() =>
        askDialog("Delete all data?", "Every account and entry on this phone. This can't be undone.", "Yes", () => {}, {
          danger: true,
        })
      )
    );
    await shot("loan-fee", async () => {
      await page.evaluate(() => loanOpen("L1"));
      await page.click('#sheet [data-act="addon-add"]');
    });
    await shot(
      "draw-edit",
      ev(() => {
        loanOpen("L1");
        loanDrawEdit(S.txns.find(x => x.loan === "L1" && x.principal).id);
      })
    );
    await shot(
      "category-form",
      ev(() => catForm("groceries", "out"))
    );
    await shot(
      "asset-form",
      ev(() => assetForm("a1"))
    );
    await shot(
      "assets-all",
      ev(() => {
        S.accounts[1].archived = true;
        V.showArchived = true;
        V.showCleared = true;
        V.screen = "assets";
        render();
      })
    );
    await page.evaluate(() => {
      S.accounts[1].archived = false;
      V.showArchived = false;
      V.showCleared = false;
    });
    await shot(
      "history-select",
      ev(() => {
        V.screen = "history";
        render();
        V.sel = new Set();
        render();
      })
    );
    /* selecting in a filtered History: the same row and chips, dimmed */
    await shot(
      "history-select-filtered",
      ev(() => {
        openHistory({ kind: "out", acc: "b", cat: "groceries" });
        V.sel = new Set();
        render();
      })
    );
    for (const tab of ["range", "month"])
      await shot("period-" + tab, async () => {
        await page.evaluate(() => periodDialog(V));
        await page.click('#pd [data-act="pd-tab"][data-v="' + tab + '"]');
      });
    /* search mode (History with a field): empty with recent searches, typing with suggestions, a suggestion picked, an
       amount, nothing found (with and without the near-word button) and a row whose note matched */
    await page.evaluate(() => {
      const pays = ["Corner Café", "Green Market", "Coffee Bar", "Fresh Corner"];
      S.txns.filter(x => x.type === "expense").forEach((x, i) => (x.payee = pays[i % pays.length]));
      const out = S.txns.filter(x => x.type === "expense");
      out[0].amount = 50;
      out[3].amount = 50.75;
      save();
    });
    /* each state asserts what it shows, so a broken one fails instead of shooting another state under its name */
    const FIND_SHOWS = {
      recent: () => document.querySelectorAll("#hbody .rec").length > 0,
      empty: () => !document.querySelector("#hbody .rec") && !document.querySelector("#hbody .sug"),
      typing: () => document.querySelectorAll("#hbody .sug").length > 0,
      picked: () => /^out:/.test(HF.pay) && !!document.querySelector("#app .hchips .hchip") && HF.q === "",
      amount: () =>
        [...document.querySelectorAll("#hbody .sug .s")].some(x => x.textContent.startsWith(T("search.group.amount"))),
      near: () => !!document.querySelector('#hbody [data-act="find-fix"]'),
      nothing: () =>
        !!document.querySelector("#hbody .empty") && !document.querySelector('#hbody [data-act="find-fix"]'),
      note: () => !!document.querySelector("#hbody .hnote mark.hl"),
    };
    const findOpen = (typed, then, shows) => async () => {
      await page.evaluate(
        ([typed, then]) => {
          histClear();
          openFind();
          const inp = $("#find-q");
          if (typed) {
            inp.value = typed;
            findInput(typed);
            findDraw();
          }
          if (then === "pay") findPick(SUGS.findIndex(x => /^out:/.test(x.r.f.pay || "")));
        },
        [typed, then]
      );
      if (!(await page.evaluate("(" + FIND_SHOWS[shows].toString() + ")()")))
        throw new Error("search state '" + shows + "' does not show what it should");
    };
    await page.evaluate(() =>
      recentSave(["corner café", "coins", "50", "a rather long search of several words", "gift"])
    );
    await shot("search-empty-recent", findOpen("", "", "recent"));
    await shot("search-typing", findOpen("corner", "", "typing"));
    await shot("search-picked", findOpen("corner", "pay", "picked"));
    await shot("search-amount", findOpen("50", "", "amount"));
    await shot("search-nothing-near", findOpen("cofee", "", "near"));
    await shot("search-nothing", findOpen("qzxv", "", "nothing"));
    await shot("search-note", findOpen("coins", "", "note"));
    await page.evaluate(() => recentSave([]));
    await shot("search-empty", findOpen("", "", "empty"));
    await seed(15);
    await shot("home-15", null);
    await charges("home-15");
    await seed(24);
    await shot("home-24", null);
    await shot(
      "settings-24",
      ev(() => {
        V.screen = "settings";
        render();
        scrollTo(0, 600);
      })
    );
    if (errors.length) summary[tag + " errors"] = errors;
    console.log(tag + ": " + states.length + " states");
    await ctx.close();
  }
  /* History's rows on phones 320–393 px wide, at both text sizes, in English, German and Russian (docs/decisions.md,
     2026-11-07): a row whose title the amount beside it would cut stacks (.stacked) and shows its whole title; a row
     left side by side has its whole title too; nothing else on the screen breaks */
  const rowSeen = {};
  if (!ONLY.length && !SIZES.length)
    for (const lang of ["en", "de", "ru"]) {
      const ctx = await browser.newContext({
        uiLang: lang,
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 1,
        isMobile: true,
        reducedMotion: "reduce",
        hasTouch: true,
        locale: LANG_LOCALE[lang] || "en-US",
      });
      await ctx.addInitScript(() => {
        window.__fontScale = 1;
        window.Android = {
          getColors: () => null,
          setBars() {},
          setReminders() {},
          takeActions: () => "[]",
          requestNotifications() {},
          saveFile() {},
          fontScale: () => window.__fontScale,
        };
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(appUrl);
      const t = await page.evaluate(() => today());
      await page.evaluate(
        st => {
          delete st.extraCats;
          localStorage.setItem("tally:v1", JSON.stringify(st));
        },
        sampleState(t, 12)
      );
      await page.reload();
      await page.evaluate(() => {
        const d = today(),
          e = (id, type, amount, account, more) =>
            S.txns.push({ id, ts: 9000 + S.txns.length, date: d, type, amount, account, note: "", ...more });
        S.loans.push({
          id: "L9",
          kind: "lend",
          person: "Maximiliane Hoffmann-Lindqvist",
          account: "c",
          date: d,
          note: "",
          status: "open",
        });
        e("c9d", "loan", 1000, "c", { dir: "out", loan: "L9", principal: true, onTop: 150, feeId: "c9c" });
        e("c9c", "loan", 100, "c", { dir: "out", loan: "L9", principal: true, feeOf: "c9d" });
        e("c9e", "expense", 1000, "b", { cat: "food", payee: "Restaurant am Marktplatz", feeId: "c9x" });
        e("c9x", "expense", 150, "b", { cat: "food", feeOf: "c9e" });
        e("c9t", "loan", 300, "c", { dir: "in", loan: "L1", feeId: "c9tt" });
        e("c9tt", "income", 25, "c", { cat: "otherin", feeOf: "c9t" });
        e("c9b", "loan", 2600, "s", { dir: "out", loan: "L2", feeId: "c9bc" });
        e("c9bc", "expense", 5, "s", { cat: "fees", feeOf: "c9b" });
        save();
      });
      await page.evaluate(() => document.fonts.ready);
      for (const w of [320, 360, 384, 393])
        for (const s of SCALES)
          for (const [view, f] of [
            ["all", {}],
            ["lent", { kind: "lend" }],
          ]) {
            await page.setViewportSize({ width: w, height: 800 });
            const tag = "rows-" + w + "@" + s + (lang === "en" ? "" : "-" + lang) + "-" + view;
            const r = await page.evaluate(
              ([s, f]) => {
                window.__fontScale = s;
                applyTextScale();
                closeSheet();
                openHistory(f);
                scrollTo(0, 0);
                const near = [...document.querySelectorAll("#app .tx.en")].filter(
                  e => e.getBoundingClientRect().top < innerHeight
                );
                const cut = e => {
                  const d = e.querySelector(".d");
                  return d.scrollHeight > d.clientHeight + 1;
                };
                return {
                  tight: !!document.querySelector("#app .list.tight"),
                  stacked: near.filter(e => e.classList.contains("stacked")).map(e => e.dataset.v),
                  cut: near.filter(cut).map(e => e.dataset.v + (e.classList.contains("stacked") ? " (stacked)" : "")),
                };
              },
              [s, f]
            );
            await page.waitForTimeout(80);
            const probs = await page.evaluate(inspect);
            await page.screenshot({ path: OUT + "/" + tag + ".png" });
            if (probs.length) summary[tag] = probs;
            if (r.cut.length) summary[tag] = (summary[tag] || []).concat("titles cut: " + r.cut.join(", "));
            if (r.tight && r.stacked.length) summary[tag] = (summary[tag] || []).concat("stacked in a tight list");
            rowSeen[tag] = r.stacked;
          }
      if (errors.length) summary["rows-" + lang + " errors"] = errors;
      await ctx.close();
    }
  if (Object.keys(rowSeen).length)
    ok(
      ["", "-de", "-ru"].every(l => (rowSeen["rows-393@1" + l + "-lent"] || []).includes("c9d")),
      "at 393 px and 1×, Maximiliane's row stacks in every language " +
        JSON.stringify(Object.fromEntries(Object.entries(rowSeen).filter(([, v]) => v.length)))
    );

  /* an upright phone with its keyboard open (a short window on a tall screen) keeps the upright layout */
  {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 330 },
      screen: { width: 360, height: 800 },
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(appUrl);
    const t = await page.evaluate(() => today());
    await page.evaluate(
      st => localStorage.setItem("tally:v1", JSON.stringify(st)),
      Object.assign(sampleState(t, 12), { extraCats: undefined })
    );
    await page.reload();
    const cls = await page.evaluate(() => [
      document.body.classList.contains("land"),
      document.body.classList.contains("rail"),
    ]);
    ok(!cls[0] && !cls[1], "an upright phone with the keyboard open stays upright: " + JSON.stringify(cls));
    await ctx.close();
  }
  console.log(
    "Charges label: " + JSON.stringify(Object.fromEntries(Object.entries(chgSeen).map(([k, v]) => [k, v.length])))
  );
  if (!ONLY.length && !SIZES.length) {
    ok(
      (chgSeen.up || []).some(x => x.startsWith("small-16x9@1.3")) &&
        (chgSeen.cut || []).some(x => x.startsWith("phone-landscape@1.3")) &&
        (chgSeen.corner || []).length > 0 &&
        !chgSeen.none,
      "the Charges label takes its own line where a tile reaches into its corner (sideways, with the ring a little " +
        "smaller where the room above it is short), and keeps its corner elsewhere " +
        JSON.stringify([chgSeen.up, chgSeen.cut])
    );
  }
  const keys = Object.keys(summary);
  for (const k of keys) console.log("  " + k + "\n    - " + summary[k].join("\n    - "));
  ok(keys.length === 0, "no layout problems in " + runs.length + " sizes and languages");
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
