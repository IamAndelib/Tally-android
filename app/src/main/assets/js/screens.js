/*
 * screens.js — The screens: render() and Home, Assets, Liabilities, History and Settings, plus the entry rows they share.
 */
"use strict";

let FLIP = null;
/* Window size classes (Material 3), the same widths as the @media rules in css/app.css: below 600px (phones) the
   bottom bar and one column; from 600px a side rail; from 840px Home, Assets and Liabilities in two panes. A phone
   held sideways gets the rail and two panes too, with the ring alone on the left (body.land) */
const RAIL_AT = 600,
  PANES_AT = 840;
/* a phone held sideways: a short, wide window on a landscape screen. The screen's shape decides, not the window's,
   so the keyboard of an upright phone (which shortens the window) never switches the layout */
const phoneLand = () =>
  innerWidth > innerHeight &&
  innerHeight < 500 &&
  screen.width > screen.height &&
  Math.min(screen.width, screen.height) < 600; // a tablet's keyboard can shorten the window as much: not a phone
const twoPane = () => document.body.classList.contains("hasnav") && (innerWidth >= PANES_AT || phoneLand());
/* two panes side by side on a wide screen (one centred column if the right one is empty), else one after the other */
const panes = (left, right, cls) =>
  !twoPane()
    ? left + right
    : '<div class="panes' +
      (right ? "" : " one") +
      (cls ? " " + cls : "") +
      '"><div class="pane">' +
      left +
      "</div>" +
      (right ? '<div class="pane">' + right + "</div>" : "") +
      "</div>";
/* the ring's width: its pane on a wide screen (measured on an empty pane pair), else the column */
let RINGW = 0;
/* the screen, drawn anew; the control that had the focus gets it back (keepFocus), and the same screen keeps the row
   that was in view where it was (rowAnchor) */
let drawnScreen = "";
function render() {
  const a = V.screen === drawnScreen && !FIND_BACK ? rowAnchor($("#app")) : null, // not around search's list (findBack)
    f = V.find ? findKeep() : null; // search mode: the caret in the field comes back too
  keepFocus($("#app"), drawScreen);
  drawnScreen = V.screen;
  if (f) findRestore(f);
  if (a) toAnchor(a, $("#app"));
}
/* The row in the middle of the view (an entry, an account) and where it is in it, {v, top}, so toAnchor() can put it back
   there once the list is drawn anew: a day's list off screen has only an estimated height (content-visibility, .dl),
   so the same scroll position would show other rows. scroller: the sheet's panel, else the page. */
function rowAnchor(box, scroller) {
  const r = scroller ? scroller.getBoundingClientRect() : { top: 0, height: innerHeight },
    y = Math.max(r.top, 0) + Math.min(r.height, innerHeight) / 2,
    lists = box.querySelectorAll(".dl"),
    below = e => e.getBoundingClientRect().bottom >= y;
  /* the day's list at that height first (found by halves, never laying out the lists off screen), then its row; by
     position, as the screen behind a sheet just closed can't be hit-tested (inert) */
  let lo = 0,
    hi = lists.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (below(lists[mid])) hi = mid;
    else lo = mid + 1;
  }
  const rows = [...(lists.length ? lists[lo] : box).querySelectorAll(".tx[data-v]")],
    row = rows.find(below) || rows[rows.length - 1];
  return row ? { v: row.dataset.v, top: row.getBoundingClientRect().top - r.top } : null;
}
function toAnchor(a, box, scroller) {
  /* once the box is drawn anew (another screen, or the next render, which keeps its own row), the row is let go */
  const drawn = box.firstElementChild;
  const fix = () => {
    if (box.firstElementChild !== drawn) return stop();
    const row = box.querySelector('.tx[data-v="' + CSS.escape(a.v) + '"]'),
      d = row ? row.getBoundingClientRect().top - (scroller ? scroller.getBoundingClientRect().top : 0) - a.top : 0;
    if (Math.abs(d) < 1) return;
    if (scroller) scroller.scrollTop += d;
    else scrollBy(0, d);
  };
  fix();
  /* lists coming into view get their real height over the next frames: the row stays put then too (a ResizeObserver
     runs before the frame is painted), for the few frames that takes, or until the person touches or scrolls */
  const ro = new ResizeObserver(fix),
    stop = () => {
      ro.disconnect();
      ["pointerdown", "wheel", "keydown"].forEach(t => removeEventListener(t, stop, true));
    };
  box.querySelectorAll(".dl").forEach(l => ro.observe(l));
  ["pointerdown", "wheel", "keydown"].forEach(t => addEventListener(t, stop, true));
  setTimeout(stop, 250);
}
function drawScreen() {
  const app = $("#app");
  RBC = LPC = null;
  if (V.screen !== drawnScreen || V.sel || (V.open && !entry(V.open))) V.open = ""; // an opened row: that screen, that entry
  if (!histLike()) {
    V.sel = null;
    /* leaving History forgets its filters, and ends search mode (its words and payee / amount with them); its Archived
       screen keeps them, for Back */
    if (V.find) findEnd();
    HF = histBlank();
    histUnwatch();
  }
  const tabs = ["home", "assets", "liabs"].includes(V.screen) && S.accounts.length > 0; // archived ones too
  const land = phoneLand();
  document.body.classList.toggle("hasnav", tabs);
  document.body.classList.toggle("land", land);
  document.body.classList.toggle("rail", innerWidth >= RAIL_AT || land);
  document.body.classList.toggle("wide", twoPane());
  RINGW = 0;
  if (twoPane() && V.screen === "home") {
    app.innerHTML =
      '<div class="panes' + (land ? " home" : "") + '"><div class="pane"></div><div class="pane"></div></div>';
    const pw = app.querySelector(".pane").clientWidth;
    /* sideways phone: the ring alone fills the height under the app bar. Tablet: short enough that the buttons below
       it stay on screen (screen height, not the window's: the keyboard of a sheet just saved must not shrink it) */
    RINGW = land
      ? Math.max(240, Math.min(pw, innerHeight - 12))
      : Math.max(300, Math.min(pw, ((screen && screen.availHeight) || innerHeight) - 400));
  }
  if (V.screen === "history") {
    app.innerHTML = historyView();
    histWatch();
  } else if (V.screen === "archive") {
    app.innerHTML = archiveView();
    histWatch();
  } else if (V.screen === "assets") app.innerHTML = assetsView();
  else if (V.screen === "liabs") app.innerHTML = liabsView();
  else if (V.screen === "settings") {
    app.innerHTML = settingsView();
    fitWeekSeg();
  } else app.innerHTML = homeView();
  fitFigures(app);
  histCenter(app);
  histPin();
  if (document.fonts.status === "loading")
    document.fonts.ready.then(() => {
      fitFigures(app);
      histCenter(app);
      histPinSet(); // the month headings' height in the web font
    });
  $("#nav").innerHTML = tabs
    ? '<div class="in">' +
      [
        ["home", "home"],
        ["assets", "wallet"],
        ["liabs", "card"],
      ]
        .map(
          ([k, i]) =>
            '<button data-act="tab" data-v="' +
            k +
            '"' +
            (V.screen === k ? ' aria-current="page"' : "") +
            '><span class="ind">' +
            (FLIP === k ? ic(i).replace('class="ic"', 'class="ic flip"') : ic(i)) +
            "</span>" +
            TH("nav." + k) +
            "</button>"
        )
        .join("") +
      "</div>"
    : "";
  FLIP = null;
}
function subBar(title) {
  return (
    '<header class="appbar"><button class="icon" data-act="home" aria-label="' +
    TH("common.back") +
    '">' +
    ic("back") +
    "</button><h1>" +
    esc(title) +
    "</h1></header>"
  );
}
function homeView() {
  const act = homeAccounts();
  /* every account archived: not a new notebook, so a way back to them */
  if (!act.length && S.accounts.length)
    return (
      tabBar("Tally") +
      '<div class="welcome"><div class="big">🗄️</div><h2>' +
      TH("home.allArchived") +
      "</h2><p>" +
      TH("home.allArchivedHint") +
      '</p><button class="btn tonal" data-act="show-arch">' +
      TH("home.showArchived") +
      "</button>" +
      '<div class="gap"></div><button class="btn" data-act="acc-form">' +
      ic("add") +
      TH("home.addAccount") +
      "</button></div>"
    );
  if (!act.length) {
    return (
      '<header class="appbar"><h1>Tally</h1>' +
      settingsBtn() +
      "</header>" + // a new notebook: only Settings is of use
      '<div class="welcome"><div class="big">📒</div><h2>' +
      TH("welcome.title") +
      "</h2><p>" +
      TH("welcome.body") +
      '</p><button class="fieldbtn" data-act="pick-maincur" aria-label="' +
      TH("common.labelValue", {
        label: T("common.currency"),
        value: S.settings.cur ? curLabel(S.settings.cur) : T("welcome.notChosen"),
      }) +
      '"><span>' +
      esc(S.settings.cur ? curLabel(S.settings.cur) : T("welcome.chooseCur")) +
      "</span>" +
      ic("down") +
      '</button><button class="btn" data-act="acc-form">' +
      ic("add") +
      TH("welcome.addFirst") +
      "</button></div>"
    );
  }
  const b = balances(),
    cur = viewCur();
  let h =
    '<header class="appbar"><div class="pnav"><button class="icon" data-act="prev" aria-label="' +
    TH("common.previous") +
    '">' +
    ic("left") +
    "</button>" +
    '<button class="plabel' +
    (periodLabel().length > 11 ? " long" : "") +
    '" data-act="period-open" aria-haspopup="dialog"><span>' +
    esc(periodLabel()) +
    "</span>" +
    ic("down") +
    "</button>" +
    '<button class="icon" data-act="next" aria-label="' +
    TH("common.next") +
    '"' +
    (canNext() ? "" : " disabled") +
    ">" +
    ic("right") +
    "</button></div>" +
    topIcons(true) +
    "</header>";

  const wide = twoPane();
  let side = "";
  if (checkDue()) side = checkCard(b, cur);
  else if (wide)
    side =
      '<div class="sec">' +
      TH("home.accounts") +
      "</div>" +
      zoneList("home", act.map(a => accRow(a, b)).join("")) +
      '<button class="btn text" data-act="acc-form" style="margin-top:4px">' +
      ic("add") +
      TH("account.add") +
      "</button>";
  else
    side =
      '<div class="strip">' +
      act
        .map(
          a =>
            '<button class="acc" data-act="acc-open" data-v="' +
            a.id +
            '"><span class="n">' +
            emblem(accEmb(a), "sm") +
            '<span dir="auto">' +
            esc(a.name) +
            '</span></span><span class="b">' +
            esc(money(b[a.id], a.currency)) +
            "</span></button>"
        )
        .join("") +
      '<button class="acc add" data-act="acc-form" aria-label="' +
      TH("account.add") +
      '">' +
      ic("add") +
      "</button></div>";
  /* one column: the balances (or the balance card) above the ring; two panes: beside it, with the period's entries */
  if (!wide) h += side;
  else {
    const list = periodTxns().sort(byNewest);
    side += '<div class="sec">' + esc(periodLabel()) + "</div>" + dayList(list);
  }
  const top = h;
  h = "";

  /* the period's spending by part (a category, or CHARGES) and what was received, by the counting rule */
  const [ps, pe] = range();
  let spent = 0;
  const by = {};
  spendItems(cur).forEach(x => {
    if (x.date < ps || x.date > pe) return;
    spent += x.amount;
    by[x.cat] = (by[x.cat] || 0) + x.amount;
  });
  spent = rnd(spent);
  const got = gotIn(cur, ps, pe);
  const ring = ringHTML(outCats(), { mode: "home", by, spent, got, cur });

  const n = histRows(periodTxns()).length; // a fee is part of its entry
  if (!atHomePeriod()) {
    const back = S.settings.home === "day" ? T("day.today") : T("settings.opens." + S.settings.home);
    h +=
      '<div class="todayrow"><button class="todaychip" data-act="go-today" aria-label="' +
      esc(S.settings.home === "day" ? T("home.backToday") : back) +
      '">' +
      ic("reset") +
      esc(back) +
      "</button></div>";
  }
  h += balBar(b, n);
  h +=
    '<div class="fabs"><button class="fab minus" data-act="add-out" aria-label="' +
    TH("home.addOut") +
    '">' +
    ic("remove") +
    "</button>" +
    '<button class="fab xfer" data-act="tr-new" aria-label="' +
    TH("home.transferLabel") +
    '">' +
    ic("swap") +
    "<span>" +
    TH("home.transfer") +
    "</span></button>" +
    '<button class="fab plus" data-act="add-in" aria-label="' +
    TH("home.addIn") +
    '">' +
    ic("add") +
    "</button></div>";
  h +=
    '<div class="loanbtns"><button class="fbtn loan" data-act="loan-new" data-v="borrow">' +
    emblem(LOAN_EMB.borrow) +
    TH("home.loan") +
    '</button><button class="fbtn lend" data-act="loan-new" data-v="lend">' +
    emblem(LOAN_EMB.lend) +
    TH("home.lend") +
    "</button></div>";
  /* one column: ring, then the buttons; tablet: ring and buttons | the rest; sideways phone: the ring, the full height
     of the screen | the app bar, buttons and the rest, the ring staying in view while the right side scrolls */
  if (!wide) return top + ring + h;
  return document.body.classList.contains("land") ? panes(ring, top + h + side, "home") : top + panes(ring + h, side);
}
/* the Home balance card: from the Balance check time on, while that reminder is on, until confirmed today; opened from
   its notification (checkAsked = that day), it shows whatever the time */
let checkAsked = "";
function checkDue() {
  const r = S.settings.remind;
  if (S.settings.lastCheck === today()) return false;
  if (checkAsked === today()) return true;
  if (!r.check) return false;
  const d = new Date(),
    [h, m] = r.checkTime.split(":").map(Number);
  return d.getHours() * 60 + d.getMinutes() >= h * 60 + m;
}
function checkCard(b, cur) {
  const hr = new Date().getHours();
  const hello = T(hr < 12 ? "home.morning" : hr < 18 ? "home.afternoon" : "home.evening");
  const y = addDays(today(), -1);
  const ySpent = spentOn(y, cur);
  return (
    '<section class="check"><h2>' +
    esc(hello) +
    "</h2><p>" +
    TH("home.checkQ") +
    (ySpent ? " " + TH("home.checkYesterday", { amount: money(ySpent, cur) }) : "") +
    "</p>" +
    activeAccounts()
      .map(
        a =>
          '<button class="ckrow" data-act="acc-open" data-v="' +
          a.id +
          '"><span class="ckn">' +
          emblem(accEmb(a), "sm") +
          '<span class="nm" dir="auto">' +
          esc(a.name) +
          '</span></span><span class="ckv"><b>' +
          esc(money(b[a.id], a.currency)) +
          '</b><span class="fx">' +
          TH("home.fix") +
          "</span></span></button>"
      )
      .join("") +
    '<button class="btn" data-act="check-ok">' +
    ic("check") +
    TH("home.allMatch") +
    "</button></section>"
  );
}
/* Search (on every tab: Home, Assets, Liabilities), History + Settings, always one tap away in the top bar */
const searchBtn = () =>
  '<button class="icon" data-act="search-open" aria-label="' + TH("search.title") + '">' + ic("search") + "</button>";
const settingsBtn = () =>
  '<button class="icon" data-act="go" data-v="settings" aria-label="' +
  TH("settings.title") +
  '">' +
  ic("settings") +
  "</button>";
const topIcons = search =>
  (search ? searchBtn() : "") +
  '<button class="icon" data-act="go" data-v="history" aria-label="' +
  TH("common.history") +
  '">' +
  ic("history") +
  "</button>" +
  settingsBtn();
function tabBar(title, search) {
  return '<header class="appbar"><h1>' + esc(title) + "</h1>" + topIcons(search) + "</header>";
}
function perCur(add) {
  const m = {};
  add((c, v) => {
    m[c] = rnd((m[c] || 0) + v);
  });
  return m;
}
/* Text wraps rather than shrinks or loses letters (a label, a name, a tile, a tab); only a figure too wide for its
   place (a long balance at a large text size on a small phone) is set smaller, a tenth at a time down to 60%: the
   summary cards' totals (still too wide: they wrap), and a row's amount where the row can't hold it. Also, measured
   here (again once the font has loaded): a list narrower than 20rem is tight (its rows stack, .list.tight); Home's
   period loses its ‹ › where the date doesn't fit beside them; Lend and Borrow put their icon above the word when a
   word doesn't fit beside it; a name that wrapped gets a box as wide as its longest line (fitWrapped). */
function fitFigures(root) {
  root
    .querySelectorAll(".sumcard .big[style], .tx .a[style], .rt .cn[style], .hcol[style], .balbar b[style]")
    .forEach(el => el.removeAttribute("style"));
  root.querySelectorAll(".tx.en.stacked").forEach(el => el.classList.remove("stacked")); // measured side by side again
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  /* a list under 20rem is tight; one already set in from the side (data-tight: Summary's opened part) at its own width */
  root
    .querySelectorAll(".list")
    .forEach(l => l.classList.toggle("tight", l.clientWidth > 0 && l.clientWidth < (+l.dataset.tight || 20) * rem));
  root.querySelectorAll(".pnav").forEach(p => {
    p.classList.remove("noarr");
    const l = p.querySelector(".plabel > span");
    if (l && l.scrollWidth > l.clientWidth + 1) p.classList.add("noarr");
  });
  root.querySelectorAll(".loanbtns").forEach(r => {
    r.classList.remove("stack");
    if ([...r.children].some(b => b.scrollWidth > b.clientWidth + 1)) r.classList.add("stack");
  });
  fitWrapped(root, ".acc .n > span:last-child, .chip .chn");
  /* tabs too wide for one row together (a sideways phone's narrow dialog, a large text size): two rows of two */
  root.querySelectorAll(".seg").forEach(g => {
    g.classList.remove("two");
    if (g.children.length === 4 && g.scrollWidth > g.clientWidth + 1) g.classList.add("two");
  });
  const shrink = (el, over) => {
    if (!over()) return;
    const f = parseFloat(getComputedStyle(el).fontSize);
    for (let k = 0.9; k > 0.55 && over(); k -= 0.1) el.style.fontSize = f * k + "px";
  };
  root.querySelectorAll(".sumcard .big").forEach(el => {
    const over = () => el.scrollWidth > el.clientWidth + 1;
    shrink(el, over);
    if (over()) el.style.overflowWrap = "anywhere";
  });
  /* a month's or day's figures (History's heading column): the whole column is set smaller, never cut */
  root.querySelectorAll(".hcol").forEach(el => shrink(el, () => el.scrollWidth > el.clientWidth + 1));
  /* Home's account chips fade at the edge the row still scrolls toward (not at its end, nor when it all fits) */
  root.querySelectorAll(".strip").forEach(el => {
    if (!el.fadeOn) {
      el.fadeOn = true;
      el.addEventListener("scroll", () => fadeStrip(el), { passive: true });
    }
    fadeStrip(el);
  });
  /* Home's balance bar: its figures (together, to stay in their column) a tenth smaller at a time down to 60%, never cut */
  root.querySelectorAll(".balbar .bt").forEach(el => {
    const bs = el.querySelectorAll("b"),
      f = parseFloat(getComputedStyle(bs[0]).fontSize);
    for (let k = 0.9; k > 0.55 && el.scrollWidth > el.clientWidth + 1; k -= 0.1)
      bs.forEach(x => (x.style.fontSize = f * k + "px"));
  });
  /* rows, given by their amounts: an entry's row in a list that isn't tight whose title the amount beside it cuts
     (clamped, measured side by side) stacks as a tight list's rows do (.stacked: the title whole, the amount under it);
     then a figure the row can't hold is set smaller. All read before any is changed. A day's list far off screen isn't
     laid out (content-visibility, .dl): its rows are fitted as they come near */
  const fitRows = as => {
    as.filter(el => {
      const row = el.closest(".tx.en"),
        d = row && !row.closest(".tight") && row.querySelector(".d");
      return d && d.scrollHeight > d.clientHeight + 1;
    }).forEach(el => el.closest(".tx").classList.add("stacked"));
    as.forEach(el => {
      const row = el.closest(".tx");
      shrink(el, () => row.scrollWidth > row.clientWidth + 1);
    });
  };
  if (root.fitIO) root.fitIO.disconnect();
  root.querySelectorAll("[data-far]").forEach(l => delete l.dataset.far); // a second pass: near now is fitted now
  const far = [...root.querySelectorAll(".dl")].filter(l => {
    const r = l.getBoundingClientRect();
    return r.top > innerHeight + 800 || r.bottom < -800;
  });
  if (far.length) {
    const io = (root.fitIO = new IntersectionObserver(
      es =>
        es.forEach(e => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          fitRows([...e.target.querySelectorAll(".tx .a")]);
        }),
      { root: root.querySelector(".p"), rootMargin: "800px 0px" } // a sheet scrolls its panel, the screen the page
    ));
    far.forEach(l => {
      l.dataset.far = "1";
      io.observe(l);
    });
  }
  fitRows([...root.querySelectorAll(".tx .a")].filter(el => !el.closest("[data-far]")));
  /* a name on Home's ring too wide for its tile: a little smaller, down to 9px, and only then its ellipsis (ring names
     are whole or left out: ringHTML) */
  root.querySelectorAll(".rt .cn").forEach(el => {
    for (
      let px = parseFloat(getComputedStyle(el).fontSize) - 0.5;
      px >= 9 && el.scrollWidth > el.clientWidth + 1;
      px -= 0.5
    )
      el.style.fontSize = px + "px";
  });
  fitChargeLabel(root); // after the names, which it must stay clear of
}
function fadeStrip(el) {
  el.classList.toggle(
    "fade",
    el.scrollWidth > el.clientWidth + 1 && Math.abs(el.scrollLeft) + el.clientWidth < el.scrollWidth - 2
  );
}
/* A box sizes a wrapped text to the room it had, not to the text: a chip whose name took two lines would keep empty
   space beside its shorter line. These get the width of their longest line instead. */
function fitWrapped(root, sel) {
  root.querySelectorAll(sel).forEach(el => {
    el.style.width = "";
    const r = document.createRange();
    r.selectNodeContents(el);
    const lines = new Map();
    for (const q of r.getClientRects()) {
      if (!q.width) continue;
      const k = Math.round(q.top / 4),
        l = lines.get(k);
      lines.set(k, l ? [Math.min(l[0], q.left), Math.max(l[1], q.right)] : [q.left, q.right]);
    }
    if (lines.size < 2) return;
    el.style.width = Math.ceil(Math.max(...[...lines.values()].map(l => l[1] - l[0]))) + 1 + "px";
  });
}
const curLines = m =>
  Object.keys(m).length
    ? Object.entries(m)
        .sort((a, b) => mainFirst(a[0], b[0]))
        .map(([c, v]) => '<div class="big">' + esc(money(v, c)) + "</div>")
        .join("")
    : '<div class="big">' + esc(money(0, S.settings.cur)) + "</div>";
function netWorth() {
  const b = balances();
  return perCur(add => {
    activeAccounts().forEach(a => add(a.currency, b[a.id]));
    S.assets.forEach(x => add(x.currency, x.value));
    S.loans.forEach(l => {
      const i = loanInfo(l);
      if (i.open) add(i.cur, l.kind === "lend" ? i.left : -i.left);
    });
  });
}
function accRow(a, b) {
  return (
    '<button class="tx stk' +
    (FX.row === a.id ? " flash" : "") +
    '" data-act="acc-open" data-v="' +
    a.id +
    '" data-drag="acc:' +
    a.id +
    '">' +
    emblem(accEmb(a), "em") +
    '<span class="mid"><div class="d" dir="auto">' +
    esc(a.name) +
    '</div><div class="s">' +
    esc(typeName(a.type) + " · " + a.currency) +
    '</div></span><span class="a">' +
    esc(money(b[a.id], a.currency)) +
    (a.archived ? '<small><span class="st">' + TH("account.archivedSt") + "</span></small>" : "") +
    "</span></button>"
  );
}
/* drag targets: a list with data-zone, or (when that list is empty or collapsed) a drop box that only shows while
   dragging; icon: its icon's markup */
const dropBox = (z, label, icon) =>
  '<div class="dropbox" data-zone="' + z + '">' + (icon || "") + esc(label) + "</div>";
const zoneList = (z, rows) => '<div class="list" data-src="' + z + '">' + rows + "</div>";
const dragTip = () =>
  S.settings.dragTip ? "" : '<p class="hint" style="margin:8px 4px 0">' + TH("assets.dragTip") + "</p>";
function assetsView() {
  const b = balances();
  let h = "";
  h += '<div class="sumcard soft"><div class="t">' + TH("assets.netWorth") + "</div>" + curLines(netWorth()) + "</div>";
  const accs = activeAccounts().filter(a => a.type !== "card"),
    arch = S.accounts.filter(a => a.archived);
  h +=
    '<div class="sec">' +
    TH("home.accounts") +
    "</div>" +
    (accs.length
      ? zoneList("acc", accs.map(a => accRow(a, b)).join(""))
      : '<div class="empty">' + TH("assets.noAccounts") + "</div>") +
    dropBox("acc", T("assets.dropShow"), icUnarchive()) +
    '<button class="btn text" data-act="acc-form" style="margin-top:4px">' +
    ic("add") +
    TH("account.add") +
    "</button>";
  if (arch.length)
    h +=
      '<button class="btn text" data-act="toggle-arch">' +
      TH(V.showArchived ? "assets.hideArchived" : "assets.showArchived", { count: arch.length }) +
      "</button>";
  h +=
    dropBox("arch", T("assets.dropArchive"), icArchive()) +
    (arch.length && V.showArchived ? zoneList("arch", arch.map(a => accRow(a, b)).join("")) + dragTip() : "");
  const left = h; // two panes: net worth and accounts | what you're owed and other assets
  h = loanSection("lend", T("assets.owedToYou"), T("assets.owedHint"), T("assets.lendBtn"));
  h +=
    '<div class="sec">' +
    TH("assets.other") +
    "</div>" +
    (S.assets.length
      ? '<div class="list" data-src="assets">' +
        S.assets
          .map(
            x =>
              '<button class="tx stk" data-act="asset-edit" data-v="' +
              x.id +
              '" data-drag="asset:' +
              x.id +
              '">' +
              emblem(x, "em") +
              '<span class="mid"><div class="d" dir="auto">' +
              esc(x.name) +
              '</div></span><span class="a">' +
              esc(money(x.value, x.currency)) +
              "</span></button>"
          )
          .join("") +
        "</div>"
      : '<p class="hint" style="margin:0 4px">' + TH("assets.otherHint") + "</p>") +
    '<button class="btn text" data-act="asset-edit" style="margin-top:4px">' +
    ic("add") +
    TH("asset.add") +
    "</button>";
  return tabBar(T("nav.assets"), true) + panes(left, h);
}
/* one kind of loan on Assets (lend) or Liabilities (borrow): the open ones (or a hint) and a button for a new one, then
   the cleared ones behind "Show cleared"; open and cleared are drop zones, to drag a loan between them */
function loanSection(kind, title, none, add) {
  const mine = S.loans.filter(l => l.kind === kind).map(l => [l, loanInfo(l)]),
    open = mine.filter(x => x[1].open),
    done = mine.filter(x => !x[1].open);
  let h =
    '<div class="sec">' +
    esc(title) +
    "</div>" +
    (open.length
      ? zoneList(kind + "-open", open.map(([l, i]) => loanRow(l, i)).join(""))
      : '<p class="hint" style="margin:0 4px">' + esc(none) + "</p>") +
    dropBox(kind + "-open", T("loans.dropActive"), ic("reset")) +
    '<button class="btn text" data-act="loan-new" data-v="' +
    kind +
    '" style="margin-top:4px">' +
    ic("add") +
    esc(add) +
    "</button>" +
    dropBox(kind + "-done", T("loans.dropCleared"), ic("check"));
  if (done.length) {
    h +=
      '<button class="btn text" data-act="toggle-cleared">' +
      TH(V.showCleared ? "loans.hideCleared" : "loans.showCleared", { count: done.length }) +
      "</button>";
    if (V.showCleared) h += zoneList(kind + "-done", done.map(([l, i]) => loanRow(l, i)).join("")) + dragTip();
  }
  return h;
}
function liabsView() {
  const b = balances();
  let h = "";
  const open = S.loans
    .filter(l => l.kind === "borrow")
    .map(loanInfo)
    .filter(i => i.open);
  const cards = activeAccounts().filter(a => a.type === "card");
  const owed = perCur(add => {
    open.forEach(i => add(i.cur, i.left));
    cards.forEach(a => {
      if (b[a.id] < 0) add(a.currency, -b[a.id]);
    });
  });
  h += '<div class="sumcard soft"><div class="t">' + TH("liabs.owe") + "</div>" + curLines(owed) + "</div>";
  h += loanSection("borrow", T("liabs.loans"), T("liabs.loansHint"), T("liabs.borrowBtn"));
  /* two panes: what you owe and the loans | credit cards */
  const right = cards.length
    ? '<div class="sec">' + TH("liabs.cards") + "</div>" + zoneList("cards", cards.map(a => accRow(a, b)).join(""))
    : "";
  return tabBar(T("nav.liabs"), true) + panes(h, right);
}
/* Home's balance bar: what a tap opens ("4 entries ›") on the left, the totals on the right: with one currency "Total in
   USD" over the figure, with several one "Total", then a line each (its code in one column, the figures right-aligned in
   the other): the notebook's currency first, the others by code. The ring's ⇄ only changes the ring. A screen reader
   gets one sentence. */
function balBar(b, n) {
  const cs = currencies().sort(mainFirst),
    say = cs.map(c => money(balanceIn(c, b), c)),
    one = cs.length < 2,
    cap = one ? T("home.totalIn", { cur: cs[0] }) : T("home.total"),
    entries = T("home.entries", { count: n }),
    line = (c, i) =>
      '<span class="bcl">' +
      (one ? "" : '<span class="bcc">' + (say[i].includes(c) ? "" : esc(c)) + "</span>") +
      "<b>" +
      esc(say[i]) +
      "</b></span>";
  return (
    '<button class="balbar" data-act="entries" aria-label="' +
    esc(T("home.barSay", { entries, total: T("common.labelValue", { label: cap, value: say.join(", ") }) })) +
    '"><span class="l" aria-hidden="true">' +
    esc(entries) +
    ic("right") +
    '</span><span class="bt' +
    (one ? " one" : "") +
    '" aria-hidden="true"><span class="bcap">' +
    esc(cap) +
    "</span>" +
    cs.map(line).join("") +
    "</span></button>"
  );
}
/* an account in an entry's row: a dot of its colour, then its name (#37); the name says which account, the colour only
   helps to spot it */
const accTag = a => (a ? '<bdi><span class="adot"' + accVar(a) + "></span>" + hl(a.name) + "</bdi>" : bdi("?"));
/* what an entry was, as its row's first line (HTML, words search matched marked): a purchase's or income's payee · note,
   else its category; a transfer's note, else "Transfer"; a loan's "Lent to Rafi"; a balance fix; a fee met on its own */
function txTitle(t) {
  if (t.type === "transfer") return t.note ? hl(t.note) : esc(T("transfer.title"));
  if (t.type === "adjust") return TH("fix.title");
  if (t.type === "loan") {
    const l = loan(t.loan),
      lend = l && l.kind === "lend";
    return TH("tx." + (t.principal ? (lend ? "lentTo" : "borrowedFrom") : lend ? "theyPaidBack" : "youPaidBack"), {
      who: { html: "<bdi>" + hl(l ? loanWho(l) : "?") + "</bdi>" },
    });
  }
  if (t.feeOf) {
    const host = entry(t.feeOf) || {};
    return t.note && !autoNote(t.note)
      ? hl(t.note)
      : esc(noteShown(t, host.type === "loan" && loan(host.loan) ? "loan.feeNote" : "transfer.feeNote"));
  }
  if (t.payee || t.note)
    return [t.payee, t.note]
      .filter(Boolean)
      .map(x => "<bdi>" + hl(x) + "</bdi>")
      .join(" \u00b7 ");
  return hl(catName(cat(t.cat)));
}
/* An entry's row: two lines. What it was | how much, the money that moved (a purchase: with its charge), with small
   lines under it naming what is inside it or on top of it (docs/specs/charges.md, "History rows": "incl. $150.00
   charge", "+ $10.00 transfer charge", "incl. $150.00 extra" in green; a transfer between currencies: what arrived),
   then its category when the title is a payee or a note (a note, for a loan) and its account with the dot of its
   colour; a transfer: From → To. No balance on the row: tapping it opens it in place (txOpenView), where the balances,
   the time it was written down and the actions are. An add-on has no row of its own (histRows). Every text wraps,
   nothing is cut but a very long title (two lines, three in a tight list). A tight list (fitFigures) gives the title
   the whole width, the amount the line below it, then the second line; so does a row whose title the amount beside it
   would cut (.stacked, fitFigures). Summary's opened rows (smEntries) show the same title and account. */
function txLine(t) {
  const a = acc(t.account),
    cur = a ? a.currency : S.settings.cur,
    f = addOnOf(t),
    d = txTitle(t);
  let em,
    amt,
    cls = "",
    sub = accTag(a),
    small = "";
  if (t.type === "transfer") {
    const to = acc(t.to);
    em = XFER_EMB;
    cls = "xfer";
    amt = esc(money(t.amount, cur));
    sub += ' <span class="ar">\u2192</span> ' + accTag(to);
    if (t.toAmount != null && to && to.currency !== cur)
      small += "<small>\u2192 " + esc(money(t.toAmount, to.currency)) + "</small>";
  } else if (t.type === "adjust") {
    em = { i: "balance", c: "#7a8190" };
    amt = esc(signed(t.amount, cur));
    cls = t.amount < 0 ? "spent" : "got";
  } else if (t.type === "loan") {
    const lend = (loan(t.loan) || {}).kind === "lend";
    em = LOAN_EMB[lend ? "lend" : "borrow"];
    amt = esc(signed(t.dir === "in" ? t.amount : -t.amount, cur));
    cls = t.dir === "in" ? "got" : "spent";
  } else if (t.feeOf) {
    /* a fee whose transfer or payment is gone (or one met outside History): its own row, never a category's spending */
    const host = entry(t.feeOf) || {},
      l = host.type === "loan" && loan(host.loan);
    cls = "xfer";
    amt = esc(signed(-t.amount, cur));
    em = l ? LOAN_EMB[l.kind === "lend" ? "lend" : "borrow"] : XFER_EMB;
  } else {
    const k = cat(t.cat),
      out = t.type === "expense";
    em = k;
    if (t.payee || t.note) sub = "<bdi>" + hl(catName(k)) + "</bdi> \u00b7 " + sub;
    const sum = out && f && f.type === "expense" ? rnd(t.amount + f.amount) : t.amount; // a purchase with its charge
    amt = esc(signed(out ? -sum : sum, cur));
    cls = out ? "spent" : "got";
  }
  /* what is inside the amount (charges or an extra a payment covered, a purchase's charge), then what is on top of it */
  const top = t.type === "loan" && !t.principal ? topPaidOf(t.id) : 0,
    lendL = t.type === "loan" && (loan(t.loan) || {}).kind === "lend",
    line = (key, amount, extra) => "<small" + (extra ? ' class="xtra"' : "") + ">" + TH(key, { amount }) + "</small>";
  if (top > 0) small += line(lendL ? "tx.extraIncl" : "tx.chargesIncl", money(top, cur), lendL);
  if (f) {
    const fm = money(f.amount, (acc(f.account) || a || {}).currency || cur);
    if (f.type === "income") small += line("tx.extraOn", fm, true);
    else if (t.type === "expense") small += line("tx.chargeIncl", fm);
    else if (t.type === "loan" && t.dir === "in")
      small += line("tx.chargeOff", fm); // a lending payment's older fee
    else small += line("tx.xchargeOn", fm);
  }
  const marked = HARCH && t.archived, // an archived entry that search lists (Settings → History)
    selMode = !!V.sel && V.screen === "history",
    noSel = selMode && marked, // never selected (selRows): in sight, but a tap does nothing
    on = selMode && V.sel.has(t.id),
    isOpen = !selMode && V.open === t.id;
  /* search mode: a loan's or balance fix's note is not on its row; when a word matched it, it is a third line */
  let noteLine = "";
  if (HLW && t.note && (t.type === "loan" || t.type === "adjust")) {
    const n = hl(t.note);
    if (n.includes("<mark"))
      noteLine = '<span class="hnote">' + TH("search.noteLine", { note: { html: "<bdi>" + n + "</bdi>" } }) + "</span>";
  }
  const hw = HLW; // the opened part shows no marks
  HLW = null;
  const opened = isOpen ? txOpenView(t) : "";
  HLW = hw;
  /* an archived entry that search lists (Settings → History): its second line starts with the archive box and the word
     "Archived", so it is said, not only seen (docs/specs/history-archive.md, C) */
  if (marked) sub = '<span class="tarch">' + icArchive() + TH("archive.mark") + "</span> \u00b7 " + sub;
  return (
    '<button class="tx en' +
    (on ? " on" : "") +
    (marked ? " txarch" : "") +
    (noSel ? " unsel" : "") +
    (FX.row === t.id ? " flash" : "") +
    '"' +
    (noSel ? "" : ' data-act="' + (selMode ? "sel-toggle" : "row-open") + '"') +
    ' data-v="' +
    t.id +
    '"' +
    (noSel ? ' aria-disabled="true"' : selMode ? ' aria-pressed="' + on + '"' : ' aria-expanded="' + isOpen + '"') +
    ">" +
    (selMode && !noSel ? '<span class="em pick">' + ic(on ? "checked" : "unchecked") + "</span>" : emblem(em, "em")) +
    '<span class="mid"><span class="d" dir="auto">' +
    d +
    '</span><span class="a ' +
    cls +
    '">' +
    amt +
    small +
    '</span><span class="s">' +
    sub +
    "</span>" +
    noteLine +
    "</span></button>" +
    opened
  );
}
/* a loan's parts as chips (lend-refine), [[label key, amount]]: each a small outlined box, its label over its figure */
const partChips = (parts, cur) =>
  '<div class="lparts">' +
  parts
    .map(
      ([k, v]) =>
        '<div class="lpart"><span class="lpc">' +
        TH(k) +
        '</span><span class="lpv">' +
        esc(money(v, cur)) +
        "</span></div>"
    )
    .join("") +
  "</div>";
/* What an opened row adds to what the row shows: when it was written down, the balance it left (after its add-on), what a
   transfer or a loan adds, and the actions. A box is a small label over a bold figure; an account is named only to tell
   two balances apart. Never a total beside one of its parts (docs/specs/charges.md, "History rows"): the first box may
   repeat the row's figure, so the boxes read "this, plus that" ("Sent | Transfer charge"); a part a payment covered
   (an extra, charges) is a box of its own with what it counted as. A loan's box says what is owed, with a draw's own
   parts as chips inside it (lend-refine) or, on a payment while both are left, what is left of the money and on top.
   Built on demand: the tap that opens a row puts it after the row (rowToggle). */
function txOpenView(t) {
  const a = acc(t.account),
    cur = a ? a.currency : S.settings.cur,
    RB = runBal(),
    r = RB[t.id] || {},
    f = addOnOf(t),
    fc = f ? (acc(f.account) || a || {}).currency || cur : cur,
    after = (f && RB[f.id]) || r, // the balance after the entry and its add-on
    M = (v, c) => esc(money(v, c));
  const box = (cap, val, extra, cls) =>
    '<div class="fbox"><div class="bcap">' +
    cap +
    '</div><div class="bval' +
    (cls ? " " + cls : "") +
    '">' +
    val +
    "</div>" +
    (extra || "") +
    "</div>";
  const note = key => '<div class="bin">' + TH(key) + "</div>";
  const bal = (x, v) =>
    x && v != null
      ? box(
          TH("tx.leftAfter"),
          M(v, x.currency),
          '<div class="bin">' + TH("tx.inAcc", { account: { html: accTag(x) } }) + "</div>"
        )
      : "";
  const row = boxes => (boxes ? '<div class="frow">' + boxes + "</div>" : "");
  let h = "";
  if (t.ts) {
    const w = new Date(t.ts),
      time = "<b>" + esc(clockTime(t.ts)) + "</b>";
    h +=
      '<div class="added">' +
      ic("schedule") +
      "<span>" +
      (iso(w) !== t.date
        ? TH("tx.addedOn", {
            date: { html: "<b>" + esc(w.toLocaleDateString(DATE_LOC, { day: "numeric", month: "short" })) + "</b>" },
            time: { html: time },
          })
        : TH("tx.addedAt", { time: { html: time } })) +
      "</span></div>";
  }
  /* a loan's or fix's note lives here only; an expense's, income's and transfer's is their title */
  if (t.note && !autoNote(t.note) && (t.type === "loan" || t.type === "adjust"))
    h += '<div class="onote" dir="auto">' + bdi(t.note) + "</div>";
  if (t.type === "transfer") {
    const to = acc(t.to);
    h += row(f ? box(TH("tx.sent"), M(t.amount, cur)) + box(TH("tx.xcharge"), M(f.amount, fc)) : "");
    h += row(bal(a, after.a) + bal(to, r.t));
  } else if (t.type === "loan" && loan(t.loan)) {
    const l = loan(t.loan),
      i = loanInfo(l),
      lend = l.kind === "lend",
      who = { html: bdi(loanWho(l)) },
      /* what is still owed; written off or forgiven, the money still unpaid (what is unpaid on top is let go) */
      owed = i.st === "writeoff" ? i.left : i.unpaid,
      paid = Math.max(0, rnd(i.total - i.unpaid)),
      pct = i.total ? Math.min(100, Math.round((paid / i.total) * 100)) : 0;
    let inBox = "",
      boxes = [];
    if (t.principal) {
      /* the draw's own parts, when it has more than its amount: Lent or Borrowed, a lend's transfer charge, the extra
         or charges on top */
      const parts = [[lend ? "tx.lent" : "tx.borrowed", t.amount]];
      if (f && f.type === "loan") parts.push(["tx.xcharge", f.amount]);
      if (t.onTop) parts.push([lend ? "tx.extra" : "tx.charges", t.onTop]);
      if (parts.length > 1) inBox = partChips(parts, cur);
      if (t.due && i.rem[t.id] > 0) boxes.push(box(TH("tx.due"), esc(shortDay(t.due))));
    } else {
      if (i.open && i.moneyLeft > 0 && i.topLeft > 0)
        inBox =
          '<div class="lfoot">' +
          TH(lend ? "tx.leftExtra" : "tx.leftCharges", {
            money: money(i.moneyLeft, i.cur),
            [lend ? "extra" : "charges"]: money(i.topLeft, i.cur),
          }) +
          "</div>";
      const top = topPaidOf(t.id),
        tip = f && f.type === "income" ? f.amount : 0;
      /* what the payment covered on top (with a tip, one Extra box with their sum), then its charge; the amount itself
         only beside what is on top of it, never beside a part of it */
      if (rnd(top + tip) > 0)
        boxes.push(
          lend
            ? box(TH("tx.extra"), esc(signed(rnd(top + tip), cur)), note("tx.asIncome"), "got")
            : box(TH("tx.charges"), M(top, cur), note("tx.asSpending"))
        );
      if (f && f.type === "expense") boxes.push(box(TH(lend ? "tx.charge" : "tx.xcharge"), M(f.amount, fc)));
      if (boxes.length && !top) boxes.unshift(box(TH(lend ? "tx.gotBack" : "tx.paidBack"), M(t.amount, cur)));
    }
    h +=
      '<div class="lbox"><div class="lhead"><span>' +
      (owed > 0
        ? TH(lend ? "tx.owesYou" : "tx.youOwe", { who })
        : i.st === "writeoff" // nothing of the money left, only what was on top: let go, never "owes" or "Cleared"
          ? TH(lend ? "loan.st.writtenOff" : "loan.st.forgiven")
          : TH("tx.cleared")) +
      "</span>" +
      (owed > 0 ? "<b>" + M(owed, i.cur) + "</b>" : "") +
      '</div><div class="ltrack" aria-hidden="true"><span style="width:' +
      pct +
      '%"></span></div><div class="lfoot">' +
      TH(lend ? "tx.backOf" : "tx.paidOf", { paid: money(paid, i.cur), total: money(i.total, i.cur) }) +
      "</div>" +
      inBox +
      "</div>";
    h += boxes.length > 1 ? row(boxes.join("")) + row(bal(a, after.a)) : row(boxes.join("") + bal(a, after.a));
  } else if (t.type === "adjust") {
    if (after.a != null) h += row(box(TH("tx.was"), M(after.a - t.amount, cur)) + box(TH("tx.now"), M(after.a, cur)));
  } else if (t.type === "expense" && f) h += row(box(TH("tx.charge"), M(f.amount, fc)) + bal(a, after.a));
  else h += row(bal(a, after.a));
  return (
    '<div class="txo" data-v="' +
    t.id +
    '">' +
    h +
    /* an archived entry (the Archived screen, or search) is unarchived or deleted, not edited */
    '<div class="acts"><button class="btn tonal" data-act="' +
    (t.archived ? "unarchive" : "tx-open") +
    '" data-v="' +
    t.id +
    '">' +
    (t.archived ? icUnarchive() + TH("archive.unarchive") : ic("edit") + TH("common.edit")) +
    '</button><button class="btn text dng" data-act="tx-del" data-v="' +
    t.id +
    '">' +
    ic("delete") +
    TH("common.delete") +
    "</button></div></div>"
  );
}
/* the rows opened in a list, closed (not V.open: the caller says which one stays) */
function rowsClose(scope) {
  scope.querySelectorAll(".txo").forEach(x => x.remove());
  scope.querySelectorAll('.tx[aria-expanded="true"]').forEach(x => x.setAttribute("aria-expanded", "false"));
}
/* a tap on a row: it opens in place (the one open before closes), or closes. Only that row's part is added or removed,
   not the whole (long) list drawn anew. One row is open at a time, in the list that was tapped (the page or
   the entries sheet, never the page behind a sheet): a list in a sheet starts with none open and the page's row behind
   it is closed (entriesSheet), and closing that sheet leaves none open (closeSheet). */
function rowToggle(row, id) {
  const was = V.open === id;
  rowsClose(row.closest("#sheet, #app") || document);
  V.open = was ? "" : id;
  const t = entry(id);
  if (was || !t) return;
  row.setAttribute("aria-expanded", "true");
  row.insertAdjacentHTML("afterend", txOpenView(t));
  const o = row.nextElementSibling;
  if (o && o.scrollIntoView) o.scrollIntoView({ block: "nearest" });
}
function loanPill(t) {
  const r = t.type === "loan" && runBal()[t.id];
  if (!r || !r.ls) return "";
  return '<span class="st ' + r.ls + '">' + TH(r.ls === "cleared" ? "loan.st.cleared" : "loan.st.partly") + "</span> ";
}
/* a period's rows by day (Home's two panes, the entries sheet), or why there are none: nothing written down, or every
   entry archived (archived entries count in the day totals, never as rows) */
const dayList = list =>
  histRows(list).length
    ? dayGroups(list)
    : '<div class="empty">' + TH(list.some(t => t.archived) ? "history.none.archived" : "home.nothingYet") + "</div>";
/* the rows of a list by day, under day headings: History's (hist), each with its words; the Archived screen's (hist
   "arch"), the archived entries' rows under headings without totals; elsewhere, each day's spending */
function dayGroups(list, hist) {
  const arch = hist === "arch",
    whole = new Map(); // History's day words count the fees too (histLines)
  if (hist) list.forEach(x => whole.set(x.date, (whole.get(x.date) || []).concat(x)));
  /* elsewhere (Home, the entries sheet: the whole period), each day's spending per currency by the counting rule, the
     charges inside the rows and the worked-out parts included, in one pass (a year is thousands of rows) */
  const days = new Map(),
    rows = new Map(),
    spend = (d, c, v) => {
      const sp = days.get(d) || {};
      sp[c] = (sp[c] || 0) + v;
      days.set(d, sp);
    };
  if (!hist) {
    list.forEach(x => isSpend(x) && spend(x.date, (acc(x.account) || {}).currency, x.amount));
    loanParts().forEach(p => p.as === "spend" && spend(p.date, p.cur, p.amount));
  }
  list = arch ? archRows(list) : hist ? listRows(list) : histRows(list); // a fee is shown inside what it was charged on
  let h = "",
    cur = "";
  list.forEach(x => rows.set(x.date, (rows.get(x.date) || 0) + 1));
  list.forEach(t => {
    if (t.date !== cur) {
      if (cur) h += "</div>";
      cur = t.date;
      const tot = Object.entries(days.get(cur) || {})
        .filter(e => rnd(e[1]))
        .sort((a, b) => mainFirst(a[0], b[0]))
        .map(([c, v]) => signed(-rnd(v), c))
        .join(" · ");
      const title = capFirst(dayLabel(t.date)),
        lines = hist && !arch ? histLines(whole.get(cur) || [], HF.kind, [cur, cur]) : [];
      h +=
        (hist
          ? '<div class="day dayh" role="heading" aria-level="3" aria-label="' +
            esc(histHeadSay(title, lines)) +
            '"><span aria-hidden="true">' +
            esc(title) +
            "</span>" +
            histColumn(lines)
          : '<div class="day"><span>' + esc(title) + "</span><span>" + esc(tot) + "</span>") +
        '</div><div class="list dl" style="contain-intrinsic-size:0 ' +
        rows.get(cur) * 5 + // an estimate (a row of two or three lines), in rem: it grows with the text size
        'rem">';
    }
    h += txLine(t);
  });
  return cur ? h + "</div>" : h;
}
/* a row ticked or unticked in History's selection: that row and the count change, not the whole (long) list */
function selSync(b) {
  const on = V.sel.has(b.dataset.v),
    n = V.sel.size;
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", on);
  b.querySelector(".em.pick").innerHTML = ic(on ? "checked" : "unchecked");
  $("#app .appbar h1").outerHTML = selTitle(n);
  $('#app [data-act="sel-del"]').disabled = $('#app [data-act="sel-arch"]').disabled = !n;
  const all = $('#app [data-act="sel-all"]'),
    every = histAllSelected();
  all.setAttribute("aria-label", T(every ? "history.clearSel" : "history.selAll"));
  all.innerHTML = every ? icDeselect() : ic("selectall");
}
function catGrid(kind) {
  let h = '<div class="cgrid" data-kind="' + kind + '">';
  S.cats
    .filter(c => c.kind === kind && !c.hidden)
    .forEach(c => {
      h +=
        '<button class="cat tile" data-act="cat-edit" data-v="' +
        esc(c.id) +
        '">' +
        emblem(c, "ci") +
        '<span class="cn" dir="auto">' +
        esc(catName(c)) +
        "</span></button>";
    });
  return h + addTile("cat-new", kind) + "</div>";
}
/* the vibration-strength slider (Material 3 discrete slider): 5 stops, a bar handle that reaches both ends, the
   active track left of it and the inactive one right, stop dots on both; dragged in gestures.js */
function sliderHtml(n, off) {
  let dots = "";
  for (let i = 0; i < 5; i++)
    dots += '<span class="ms-dot' + (i < n - 1 ? " on" : i === n - 1 ? " cur" : "") + '" style="--i:' + i + '"></span>';
  return (
    '<div class="mslider' +
    (off ? " off" : "") +
    '" id="f-hlevel" role="slider" tabindex="' +
    (off ? "-1" : "0") +
    '" aria-label="' +
    TH("settings.strengthLabel") +
    '" aria-valuemin="1" aria-valuemax="5" aria-valuenow="' +
    n +
    '"' +
    (off ? ' aria-disabled="true"' : "") +
    ' style="--f:' +
    (n - 1) / 4 +
    '"><span class="ms-act"></span><span class="ms-in"></span>' +
    dots +
    '<span class="ms-thumb"></span></div>'
  );
}
/* moves the slider to stop n in place (no re-render): handle, tracks and which dots sit on the active track */
function sliderShow(el, n) {
  el.style.setProperty("--f", (n - 1) / 4);
  el.setAttribute("aria-valuenow", n);
  el.querySelectorAll(".ms-dot").forEach((d, i) => {
    d.classList.toggle("on", i < n - 1);
    d.classList.toggle("cur", i === n - 1);
  });
}
/* Settings → First day of week: the days' long names where they fit, else the short ones (the long one still read out) */
function fitWeekSeg() {
  const b = [...document.querySelectorAll('#app [data-act="week"]')],
    seg = b.length && b[0].parentElement; // each tab is as wide as its word: the three together may not fit
  if (seg && (seg.scrollWidth > seg.clientWidth + 1 || b.some(x => x.scrollWidth > x.clientWidth + 1)))
    b.forEach(x => {
      x.setAttribute("aria-label", x.textContent);
      x.textContent = capFirst(weekdayName(+x.dataset.v, "short"));
    });
}
function settingsView() {
  /* each section in a block of its own (.ssec), its heading first: the heading stays under the bar while its section
     scrolls, until the next one pushes it up (histPin; docs/specs/history-archive.md, D) */
  let h = "",
    open = false;
  const sec = (t, cls) => {
    const s =
      (open ? "</div>" : "") + '<div class="ssec"><div class="sec' + (cls ? " " + cls : "") + '">' + t + "</div>";
    open = true;
    return s;
  };
  const th = S.settings.theme || "system";
  h +=
    sec(TH("settings.theme")) +
    '<div class="seg">' +
    ["system", "light", "dark"]
      .map(
        k =>
          '<button data-act="theme" data-v="' +
          k +
          '" aria-pressed="' +
          (th === k) +
          '">' +
          TH("settings.themes." + k) +
          "</button>"
      )
      .join("") +
    "</div>";
  h +=
    sec(TH("settings.feel")) +
    '<div class="list"><div class="setrow"><span class="mid"><div>' +
    TH("settings.vibration") +
    '</div><div class="s">' +
    TH("settings.vibrationHint") +
    "</div></span>" +
    '<button class="sw" role="switch" data-act="haptics" aria-checked="' +
    (S.settings.haptics !== false) +
    '" aria-label="' +
    TH("settings.vibration") +
    '"></button></div>' +
    '<div class="setrow hlevel' +
    (S.settings.haptics === false ? " off" : "") +
    '"><span class="mid"><div>' +
    TH("settings.strength") +
    "</div>" +
    sliderHtml(S.settings.hapticLevel || 3, S.settings.haptics === false) +
    '<div class="s hends"><span>' +
    TH("settings.light") +
    "</span><span>" +
    TH("settings.strong") +
    "</span></div></span></div></div>";
  const seg = (act, cur, opts) =>
    '<div class="seg">' +
    opts
      .map(
        ([k, l]) =>
          '<button data-act="' + act + '" data-v="' + k + '" aria-pressed="' + (cur === k) + '">' + esc(l) + "</button>"
      )
      .join("") +
    "</div>";
  h +=
    sec(TH("settings.region")) +
    '<div class="lbl set">' +
    TH("settings.mainCur") +
    '</div><button class="fieldbtn" data-act="pick-maincur" aria-label="' +
    TH("common.labelValue", {
      label: T("settings.mainCur"),
      value: S.settings.cur ? curLabel(S.settings.cur) : T("welcome.notChosen"),
    }) +
    '"><span>' +
    esc(S.settings.cur ? curLabel(S.settings.cur) : T("settings.choose")) +
    "</span>" +
    ic("down") +
    '</button><div class="lbl set">' +
    TH("settings.opensOn") +
    "</div>" +
    seg(
      "home-opens",
      S.settings.home,
      ["day", "month", "year"].map(k => [k, T("settings.opens." + k)])
    ) +
    '<div class="lbl set">' +
    TH("settings.week") +
    "</div>" +
    seg(
      "week",
      String(S.settings.week),
      [1, 0, 6].map(d => [String(d), capFirst(weekdayName(d, "long"))])
    ) +
    '<div class="lbl set">' +
    TH("settings.clock") +
    "</div>" +
    seg("clock", S.settings.clock, [
      ["24", T("settings.h24")],
      ["12", T("settings.h12")],
    ]) +
    langRow();
  const r = S.settings.remind,
    remRow = (k, act, title, sub, on, time) =>
      '<div class="setrow"><span class="mid"><div>' +
      esc(title) +
      '</div><div class="s">' +
      esc(sub) +
      '</div></span><button class="fieldbtn tbtn" data-act="pick-time" data-v="' +
      k +
      '"' +
      (on ? "" : " disabled") +
      "><span>" +
      esc(timeLabel(time)) +
      "</span>" +
      ic("schedule") +
      '</button><button class="sw" role="switch" data-act="' +
      act +
      '" aria-checked="' +
      on +
      '" aria-label="' +
      esc(title) +
      '"></button></div>';
  h +=
    sec(TH("settings.reminders")) +
    healthCard() +
    '<div class="list">' +
    remRow("nudge", "rem-daily", T("remind.nudge"), T("remind.nudgeHint"), r.daily, r.time) +
    remRow("check", "rem-check", T("remind.check"), T("remind.checkHint"), r.check, r.checkTime) +
    remRow("due", "rem-dues", T("remind.dues"), T("remind.duesHint"), r.dues, r.dueTime) +
    "</div>";
  /* whether search finds archived entries too (docs/specs/history-archive.md, C) */
  h +=
    sec(TH("common.history")) +
    '<div class="list"><div class="setrow"><span class="mid"><div>' +
    TH("settings.searchArch") +
    '</div><div class="s">' +
    TH("settings.searchArchHint") +
    "</div></span>" +
    '<button class="sw" role="switch" data-act="search-arch" aria-checked="' +
    (S.settings.searchArch === true) +
    '" aria-label="' +
    TH("settings.searchArch") +
    '"></button></div></div>';
  h +=
    sec(TH("settings.outCats")) +
    '<p class="hint" style="margin:0 4px 8px">' +
    TH("settings.outCatsHint") +
    "</p>" +
    ringHTML(outCats(), { mode: "edit" }) +
    '<div class="gap"></div><button class="btn tonal" data-act="cat-new" data-v="out">' +
    ic("add") +
    TH("settings.addOutCat") +
    "</button>";
  h += sec(TH("settings.inCats")) + catGrid("in");
  const hid = S.cats.filter(c => c.hidden);
  if (hid.length)
    h +=
      '<p class="hint" style="margin:14px 4px 8px">' +
      TH("settings.removedCats") +
      '</p><div class="chips">' +
      hid
        .map(
          c =>
            '<button class="chip" data-act="cat-back" data-v="' +
            esc(c.id) +
            '">' +
            emblem(c, "sm") +
            '<span class="chn" dir="auto">' +
            esc(catName(c)) +
            "</span></button>"
        )
        .join("") +
      "</div>";
  const noData = !S.accounts.length && !S.txns.length && !S.loans.length && !S.assets.length;
  /* with auto backup on, Back up now replaces Save backup */
  const autoOn = canBackup() && S.settings.backup.on;
  h +=
    sec(TH("settings.data")) +
    '<p class="muted small" style="margin:0 4px 12px">' +
    TH(autoOn ? "settings.dataAuto" : "settings.dataLocal") +
    "</p>" +
    autoBackupHtml() +
    (keptKeys().length
      ? '<div class="card"><h3>' +
        TH("data.kept.title") +
        '</h3><p class="muted small" style="margin:0">' +
        TH("data.kept.body") +
        "</p>" +
        '<div class="gap"></div><div class="row"><button class="btn tonal" data-act="kept-save">' +
        TH("common.saveFile") +
        "</button>" +
        '<button class="btn tonal" data-act="kept-del">' +
        TH("data.kept.delete") +
        '</button></div></div><div class="gap"></div>'
      : "") +
    (autoOn
      ? ""
      : '<button class="btn tonal" data-act="backup">' + TH("backup.save") + '</button><div class="gap"></div>') +
    (canRestore()
      ? '<button class="btn tonal" data-act="restore">' + TH("restore.btn") + "</button>"
      : '<label class="btn tonal" style="position:relative">' +
        TH("restore.btn") +
        '<input type="file" id="restore-file" accept=".json,application/json" class="vh"></label>') +
    '<div class="gap"></div>' +
    '<button class="btn tonal" data-act="export">' +
    TH("settings.export") +
    '</button><div class="gap"></div>' +
    '<button class="btn danger" data-act="wipe"' +
    (noData ? " disabled" : "") +
    ">" +
    TH("settings.wipe") +
    "</button>";
  const ver =
    window.Android && Android.getVersion
      ? (() => {
          try {
            return Android.getVersion();
          } catch (e) {
            return "";
          }
        })()
      : "";
  h +=
    sec(TH("settings.about"), "center") +
    '<a class="btn kofi" href="' +
    DONATE_URL +
    '"><svg viewBox="0 -960 960 960" class="ic" aria-hidden="true"><path d="' +
    ICONS.local_cafe[0] +
    '"/></svg>' +
    TH("settings.support") +
    '</a><div class="gap"></div><p class="muted small" style="margin:0 4px;text-align:center">Tally' +
    (ver ? " · " + TH("settings.version", { version: ver }) : "") +
    "<br>" +
    TH("settings.by", { name: { html: '<a href="https://github.com/IamAndelib">IamAndelib</a>' } }) +
    '<br><a href="https://github.com/IamAndelib/Tally-android">' +
    TH("settings.source") +
    "</a></p>";
  return '<div class="hpin">' + subBar(T("settings.title")) + "</div>" + h + "</div>";
}
/* where "Buy me a coffee" (Settings → About) leads: Tally's Ko-fi page, opened in the browser (MainActivity sends web
   links there), so Tally itself stays offline; the repository's Sponsor button (.github/FUNDING.yml) leads there too */
const DONATE_URL = "https://ko-fi.com/iamandelib";
/* Settings → Region → Language, where Android has a language setting for each app (13+): the language Tally shows,
   and the way to Android's screen to change it. Elsewhere Tally simply follows the phone's language. */
function langRow() {
  let on = false;
  try {
    on = !!(window.Android && Android.appLanguage && Android.appLanguage());
  } catch (e) {}
  if (!on) return "";
  return (
    '<div class="lbl set">' +
    TH("settings.language") +
    '</div><button class="fieldbtn" data-act="lang-open" aria-label="' +
    TH("common.labelValue", { label: T("settings.language"), value: T("lang.name") }) +
    '"><span>' +
    TH("lang.name") +
    "</span>" +
    ic("right") +
    "</button>"
  );
}
/* Settings → Reminders: the permissions Android was denied, one row each with Allow (only while a reminder or the
   daily backup is on). A row goes as soon as its permission is allowed (tallyPerms / resume re-render). */
function healthCard() {
  const r = S.settings.remind,
    hh = (r.daily || r.check || r.dues || S.settings.backup.on) && reminderHealth();
  if (!hh) return "";
  const rows = permRows(hh).filter(([k]) => hh[k] === false);
  if (!rows.length) return "";
  return (
    '<section class="rhealth list"><div class="rh-head">' +
    '<svg viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="' +
    ICONS.warning[0] +
    '"/></svg>' +
    "<b>" +
    TH("perms.title") +
    "</b></div>" +
    rows.map(p => permRow(p, false)).join("") +
    "</section>"
  );
}
/* when the last automatic backup was written: "Today, 23:00" or "Mon 3 Aug, 23:00" */
function backupWhen(ms, inSentence) {
  const d = new Date(ms),
    day = iso(d);
  return T("backup.when", {
    day: inSentence ? dayLabel(day) : dayName(day), // inside a sentence a date, not a capitalised "Today"
    time: timeLabel(pad(d.getHours()) + ":" + pad(d.getMinutes())),
  });
}
/* Settings → Your data: the daily automatic backup into one file in a folder the user picked (Android only) */
function autoBackupHtml() {
  const bs = backupStatus();
  if (!bs) return "";
  const b = S.settings.backup,
    lost = b.on && !bs.usable, // on, but its folder isn't reachable (a new phone, a reinstall)
    sub = !b.on
      ? TH("backup.offHint")
      : lost
        ? TH("backup.lost")
        : bs.error
          ? esc(nativeErr(bs.error))
          : bs.last
            ? TH("backup.last", { when: backupWhen(bs.last) })
            : TH("backup.first", { time: timeLabel(b.time) });
  return (
    '<div class="list" id="bk"><div class="setrow"><span class="mid"><div>' +
    TH("backup.auto") +
    '</div><div class="s' +
    (b.on && (bs.error || lost) ? " err" : "") +
    '">' +
    sub +
    "</div></span>" +
    (b.on
      ? '<button class="fieldbtn tbtn" data-act="pick-time" data-v="backup"><span>' +
        esc(timeLabel(b.time)) +
        "</span>" +
        ic("schedule") +
        "</button>"
      : "") +
    '<button class="sw" role="switch" data-act="bk-auto" aria-checked="' +
    b.on +
    '" aria-label="' +
    TH("backup.auto") +
    '"></button></div>' +
    (b.on
      ? '<div class="setrow"><span class="mid"><div>' +
        BACKUP_FILE +
        '</div><div class="s">' +
        esc(bs.folder || T("backup.noFolder")) +
        '</div></span><button class="btn text" data-act="bk-folder">' +
        TH("common.change") +
        "</button></div>" +
        '<div class="setrow"><button class="btn text" data-act="bk-now">' +
        TH("backup.now") +
        "</button></div>"
      : "") +
    '</div><div class="gap"></div>'
  );
}
