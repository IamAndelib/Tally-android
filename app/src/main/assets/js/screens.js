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
/* the screen, drawn anew; the control that had the focus gets it back (keepFocus) */
function render() {
  keepFocus($("#app"), drawScreen);
}
function drawScreen() {
  const app = $("#app");
  RBC = null;
  if (V.screen !== "history") V.sel = null;
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
  if (V.screen === "history") app.innerHTML = historyView();
  else if (V.screen === "assets") app.innerHTML = assetsView();
  else if (V.screen === "liabs") app.innerHTML = liabsView();
  else if (V.screen === "settings") {
    app.innerHTML = settingsView();
    fitWeekSeg();
  } else app.innerHTML = homeView();
  fitFigures(app);
  if (document.fonts && document.fonts.status === "loading") document.fonts.ready.then(() => fitFigures(app));
  document.body.classList.toggle("hist", V.screen === "history"); // horizontal swipes switch accounts (gestures.js)
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
  const act = activeAccounts();
  /* every account archived: not a new notebook, so a way back to them */
  if (!act.length && S.accounts.length)
    return (
      '<header class="appbar"><h1>Tally</h1>' +
      topIcons() +
      "</header>" +
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
      topIcons() +
      "</header>" +
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
    topIcons() +
    "</header>";

  const wide = twoPane();
  let side = "";
  if (checkDue()) side = checkCard(b, cur);
  else if (wide)
    side =
      '<div class="sec">' +
      TH("home.accounts") +
      '</div><div class="list">' +
      act.map(a => accRow(a, b)).join("") +
      '</div><button class="btn text" data-act="acc-form" style="margin-top:4px">' +
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
    side +=
      '<div class="sec">' +
      esc(periodLabel()) +
      "</div>" +
      (list.length ? dayGroups(list) : '<div class="empty">' + TH("home.nothingYet") + "</div>");
  }
  const top = h;
  h = "";

  const pt = periodTxns().filter(t => inCur(t, cur));
  let spent = 0,
    got = 0;
  const by = {};
  pt.forEach(t => {
    if (isSpend(t)) {
      spent += t.amount;
      by[t.cat] = (by[t.cat] || 0) + t.amount;
    } else if (t.type === "income") got += t.amount;
  });
  spent = rnd(spent);
  got = rnd(got);
  const ring = ringHTML(outCats(), { mode: "home", by, spent, got, cur });

  const total = balanceIn(cur, b);
  const n = periodTxns().length;
  if (!(V.period === "day" && V.anchor === today()))
    h +=
      '<div class="todayrow"><button class="todaychip" data-act="go-today" aria-label="' +
      TH("home.backToday") +
      '">' +
      ic("reset") +
      TH("day.today") +
      "</button></div>";
  h +=
    '<button class="balbar" data-act="entries">' +
    ic("list") +
    '<span class="l">' +
    TH("home.balance") +
    (n ? " · " + TH("home.entries", { count: n }) : "") +
    "</span><b>" +
    esc(money(total, cur)) +
    "</b></button>";
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
/* History + Settings, always one tap away in the top bar */
const topIcons = () =>
  '<button class="icon" data-act="go" data-v="history" aria-label="' +
  TH("common.history") +
  '">' +
  ic("history") +
  '</button><button class="icon" data-act="go" data-v="settings" aria-label="' +
  TH("settings.title") +
  '">' +
  ic("settings") +
  "</button>";
function tabBar(title) {
  return '<header class="appbar"><h1>' + esc(title) + "</h1>" + topIcons() + "</header>";
}
function perCur(add) {
  const m = {};
  add((c, v) => {
    m[c] = rnd((m[c] || 0) + v);
  });
  return m;
}
/* a figure too wide for its place (a long balance at a large text size on a small phone) is set smaller, a tenth at a
   time down to 60%, rather than cut: the summary cards' totals, and a row's amount where the row can't hold it (its
   balance lines are sized in em, so they shrink with it). Still too wide, a total wraps. Measured again once the font
   has loaded. A button beside another whose label is one word too long for it (German, French at a large text size)
   is set smaller the same way, then breaks the word as a last resort. */
function fitFigures(root) {
  root
    .querySelectorAll(".sumcard .big[style], .tx .a[style], .row > .btn[style], .fbtn[style], .cat .cn[style]")
    .forEach(el => el.removeAttribute("style"));
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
  root.querySelectorAll(".tx .a").forEach(el => {
    const row = el.closest(".tx");
    shrink(el, () => row.scrollWidth > row.clientWidth + 1);
  });
  root.querySelectorAll(".row > .btn, .fbtn").forEach(el => {
    const over = () => el.scrollWidth > el.clientWidth + 1;
    shrink(el, over);
    if (over()) el.style.overflowWrap = "anywhere";
  });
  /* a category name too wide for its tile (a long word, large text): a little smaller, down to 10px (a ring's 9px, as
     in a full one), and only then its ellipsis */
  root.querySelectorAll(".cat .cn").forEach(el => {
    const min = el.closest(".rt") ? 9 : 10;
    for (
      let px = parseFloat(getComputedStyle(el).fontSize) - 0.5;
      px >= min && el.scrollWidth > el.clientWidth + 1;
      px -= 0.5
    )
      el.style.fontSize = px + "px";
  });
}
const curLines = m =>
  Object.keys(m).length
    ? Object.entries(m)
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
function accRow(a, b, drag) {
  return (
    '<button class="tx' +
    (FX.row === a.id ? " flash" : "") +
    '" data-act="acc-open" data-v="' +
    a.id +
    '"' +
    (drag ? ' data-drag="acc:' + a.id + '"' : "") +
    ">" +
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
/* drag targets: a list with data-zone, or (when that list is empty or collapsed) a drop box that only shows while dragging */
const dropBox = (z, label, icon) =>
  '<div class="dropbox" data-zone="' + z + '">' + (icon ? ic(icon) : "") + esc(label) + "</div>";
const zoneList = (z, rows) => '<div class="list" data-src="' + z + '">' + rows + "</div>";
const dragTip = () =>
  S.settings.dragTip ? "" : '<p class="hint" style="margin:8px 4px 0">' + TH("assets.dragTip") + "</p>";
function assetsView() {
  const b = balances();
  let h = "";
  h +=
    '<div class="sumcard"><div class="t">' +
    TH("assets.netWorth") +
    "</div>" +
    curLines(netWorth()) +
    '<div class="t small">' +
    TH("assets.netWorthHint") +
    "</div></div>";
  const accs = activeAccounts().filter(a => a.type !== "card"),
    arch = S.accounts.filter(a => a.archived);
  h +=
    '<div class="sec">' +
    TH("home.accounts") +
    "</div>" +
    (accs.length
      ? zoneList("acc", accs.map(a => accRow(a, b, true)).join(""))
      : '<div class="empty">' + TH("assets.noAccounts") + "</div>") +
    dropBox("acc", T("assets.dropShow"), "reset") +
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
    dropBox("arch", T("assets.dropArchive")) +
    (arch.length && V.showArchived ? zoneList("arch", arch.map(a => accRow(a, b, true)).join("")) + dragTip() : "");
  const left = h; // two panes: net worth and accounts | what you're owed and other assets
  h = loanSection("lend", T("assets.owedToYou"), T("assets.owedHint"), T("assets.lendBtn"));
  h +=
    '<div class="sec">' +
    TH("assets.other") +
    "</div>" +
    (S.assets.length
      ? '<div class="list">' +
        S.assets
          .map(
            x =>
              '<button class="tx" data-act="asset-edit" data-v="' +
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
  return tabBar(T("nav.assets")) + panes(left, h);
}
/* one kind of loan on Assets (lend) or Liabilities (borrow): the open ones (or a hint) and a button for a new one, then
   the cleared ones behind "Show cleared"; open and cleared are drop zones, to drag a loan between them */
function loanSection(kind, title, none, add) {
  const mine = S.loans.filter(l => l.kind === kind),
    open = mine.filter(l => loanInfo(l).open),
    done = mine.filter(l => !loanInfo(l).open);
  let h =
    '<div class="sec">' +
    esc(title) +
    "</div>" +
    (open.length
      ? zoneList(kind + "-open", open.map(l => loanRow(l)).join(""))
      : '<p class="hint" style="margin:0 4px">' + esc(none) + "</p>") +
    dropBox(kind + "-open", T("loans.dropActive"), "reset") +
    '<button class="btn text" data-act="loan-new" data-v="' +
    kind +
    '" style="margin-top:4px">' +
    ic("add") +
    esc(add) +
    "</button>" +
    dropBox(kind + "-done", T("loans.dropCleared"), "check");
  if (done.length) {
    h +=
      '<button class="btn text" data-act="toggle-cleared">' +
      TH(V.showCleared ? "loans.hideCleared" : "loans.showCleared", { count: done.length }) +
      "</button>";
    if (V.showCleared) h += zoneList(kind + "-done", done.map(l => loanRow(l)).join("")) + dragTip();
  }
  return h;
}
function liabsView() {
  const b = balances();
  let h = "";
  const open = S.loans.filter(l => l.kind === "borrow" && loanInfo(l).open);
  const cards = activeAccounts().filter(a => a.type === "card");
  const owed = perCur(add => {
    open.forEach(l => {
      const i = loanInfo(l);
      add(i.cur, i.left);
    });
    cards.forEach(a => {
      if (b[a.id] < 0) add(a.currency, -b[a.id]);
    });
  });
  h += '<div class="sumcard owe"><div class="t">' + TH("liabs.owe") + "</div>" + curLines(owed) + "</div>";
  h += loanSection("borrow", T("liabs.loans"), T("liabs.loansHint"), T("liabs.borrowBtn"));
  /* two panes: what you owe and the loans | credit cards */
  const right = cards.length
    ? '<div class="sec">' +
      TH("liabs.cards") +
      '</div><div class="list">' +
      cards.map(a => accRow(a, b)).join("") +
      "</div>"
    : "";
  return tabBar(T("nav.liabs")) + panes(h, right);
}
function txLine(t) {
  const a = acc(t.account),
    cur = a ? a.currency : S.settings.cur;
  let em,
    d,
    s,
    amt,
    cls = "";
  if (t.type === "transfer") {
    const to = acc(t.to);
    em = { i: "swap_horiz", c: "#5f7389" };
    cls = "xfer";
    d = esc(t.note || T("transfer.title"));
    s = bdi(a ? a.name : "?") + " → " + bdi(to ? to.name : "?");
    amt =
      esc(money(t.amount, cur)) +
      (t.toAmount != null && to && to.currency !== cur
        ? "<small>→ " + esc(money(t.toAmount, to.currency)) + "</small>"
        : "");
  } else if (t.type === "adjust") {
    em = { i: "balance", c: "#7a8190" };
    d = esc(noteShown(t, "fix.title"));
    s = TH("fix.title") + " · " + bdi(a ? a.name : "?");
    amt = esc(signed(t.amount, cur));
    cls = t.amount < 0 ? "spent" : "got";
  } else if (t.type === "loan") {
    const l = loan(t.loan),
      lend = l && l.kind === "lend",
      who = l ? loanWho(l) : "?";
    em = LOAN_EMB[lend ? "lend" : "borrow"];
    d = TH("tx." + (t.principal ? (lend ? "lentTo" : "borrowedFrom") : lend ? "theyPaidBack" : "youPaidBack"), {
      who: { html: bdi(who) },
    });
    s = TH(lend ? "tx.lending" : "tx.loan") + " · " + bdi(a ? a.name : "?") + (t.note ? " · " + bdi(t.note) : "");
    amt = esc(signed(t.dir === "in" ? t.amount : -t.amount, cur));
    cls = t.dir === "in" ? "got" : "spent";
  } else if (t.feeOf) {
    /* a fee: shown with the transfer or loan payment it was charged on, not as a category's spending */
    const host = entry(t.feeOf) || {},
      l = host.type === "loan" && loan(host.loan);
    cls = "xfer";
    amt = esc(signed(-t.amount, cur));
    if (l) {
      const lend = l.kind === "lend";
      em = LOAN_EMB[lend ? "lend" : "borrow"];
      d = esc(noteShown(t, "loan.feeNote"));
      s =
        bdi(a ? a.name : "?") +
        " · " +
        TH(lend ? "tx.feeGotBack" : "tx.feePaidBack", { who: { html: bdi(loanWho(l)) } });
    } else {
      const to = acc(host.to);
      em = { i: "swap_horiz", c: "#5f7389" };
      d = esc(noteShown(t, "transfer.feeNote"));
      s = bdi(a ? a.name : "?") + (to ? " → " + bdi(to.name) : "");
    }
  } else {
    const k = cat(t.cat),
      out = t.type === "expense";
    em = k;
    d = esc(t.note || catName(k));
    s = bdi(catName(k)) + " · " + bdi(a ? a.name : "?");
    amt = esc(signed(out ? -t.amount : t.amount, cur));
    cls = out ? "spent" : "got";
  }
  const selMode = !!V.sel && V.screen === "history",
    on = selMode && V.sel.has(t.id);
  return (
    '<button class="tx' +
    (on ? " on" : "") +
    (FX.row === t.id ? " flash" : "") +
    '" data-act="' +
    (selMode ? "sel-toggle" : "tx-open") +
    '" data-v="' +
    t.id +
    '"' +
    (selMode ? ' aria-pressed="' + on + '"' : "") +
    ">" +
    (selMode ? '<span class="em pick">' + ic(on ? "checked" : "unchecked") + "</span>" : emblem(em, "em")) +
    '<span class="mid"><div class="d" dir="auto">' +
    d +
    '</div><div class="s">' +
    loanPill(t) +
    s +
    '</div></span><span class="a ' +
    cls +
    '">' +
    amt +
    rbLines(t) +
    "</span></button>"
  );
}
/* the small grey balance line(s) under an amount: what the account held right after this entry */
function rbLines(t) {
  const r = runBal()[t.id];
  if (!r) return "";
  const a = acc(t.account);
  if (t.type === "transfer") {
    const to = acc(t.to);
    return (
      rbLine(a ? a.name : "?", money(r.a, a ? a.currency : ""), "↓") +
      (to && r.t != null ? rbLine(to.name, money(r.t, to.currency), "↑") : "")
    );
  }
  return a ? rbLine(a.name, money(r.a, a.currency)) : "";
}
/* on a narrow screen the account name gives way (ellipsis), never the balance; a transfer's arrow stays outside the
   name, on the app's side of it */
const rbLine = (name, bal, arrow) =>
  '<span class="rb' +
  (arrow ? ' ar">' + arrow : '">') +
  '<span class="rbn" dir="auto">' +
  esc(name) +
  "</span> " +
  esc(bal) +
  "</span>";
function loanPill(t) {
  const r = t.type === "loan" && runBal()[t.id];
  if (!r || !r.ls) return "";
  return '<span class="st ' + r.ls + '">' + TH(r.ls === "cleared" ? "loan.st.cleared" : "loan.st.partly") + "</span> ";
}
function dayGroups(list) {
  let h = "",
    cur = "";
  /* each day's spending per currency, in one pass (a year of History is thousands of rows) */
  const days = new Map();
  list.forEach(x => {
    if (!isSpend(x)) return;
    const c = (acc(x.account) || {}).currency,
      sp = days.get(x.date) || {};
    sp[c] = (sp[c] || 0) + x.amount;
    days.set(x.date, sp);
  });
  list.forEach(t => {
    if (t.date !== cur) {
      if (cur) h += "</div>";
      cur = t.date;
      const tot = Object.entries(days.get(cur) || {})
        .map(([c, v]) => signed(-v, c))
        .join(" · ");
      h +=
        '<div class="day"><span>' +
        esc(capFirst(dayLabel(t.date))) +
        "</span><span>" +
        esc(tot) +
        '</span></div><div class="list">';
    }
    h += txLine(t);
  });
  return cur ? h + "</div>" : h;
}
/* History's account filter ("" = All), from its chips or a sideways swipe; the chosen chip scrolls into view */
function setHistAcc(id) {
  V.hAcc = id || "";
  if (V.sel) V.sel = new Set();
  render();
  const chip = $('.strip [data-act="hacc"][aria-pressed="true"]');
  if (chip && chip.scrollIntoView) chip.scrollIntoView({ block: "nearest", inline: "nearest" });
}
/* the History filter chips in order: All, then the accounts shown */
const histAccs = () => [""].concat(S.accounts.filter(a => !a.archived || a.id === V.hAcc).map(a => a.id));
function historyList() {
  const [s, e] = range(HP);
  let list = S.txns.filter(t => t.date >= s && t.date <= e);
  if (V.hAcc) list = list.filter(t => t.account === V.hAcc || t.to === V.hAcc);
  return list.sort(byNewest);
}
function historyView() {
  if (V.hAcc && !acc(V.hAcc)) V.hAcc = ""; // its account was deleted, or a backup restored
  const list = historyList();
  let h;
  if (V.sel) {
    const n = V.sel.size;
    h =
      '<header class="appbar"><button class="icon" data-act="sel-cancel" aria-label="' +
      TH("history.stopSel") +
      '">' +
      ic("close") +
      "</button><h1>" +
      TH("history.selected", { count: n }) +
      "</h1>" +
      '<button class="icon" data-act="sel-all" aria-label="' +
      TH("history.selAll") +
      '">' +
      ic("selectall") +
      "</button>" +
      '<button class="icon" data-act="sel-del" aria-label="' +
      TH("history.delSel") +
      '"' +
      (n ? "" : " disabled") +
      ">" +
      ic("delete") +
      "</button></header>";
  } else
    h =
      '<header class="appbar"><button class="icon" data-act="home" aria-label="' +
      TH("common.back") +
      '">' +
      ic("back") +
      "</button><h1>" +
      TH("common.history") +
      "</h1>" +
      (list.length
        ? '<button class="icon" data-act="sel-start" aria-label="' +
          TH("history.select") +
          '">' +
          ic("checkbox") +
          "</button>"
        : "") +
      "</header>";
  h +=
    '<div class="month"><button class="icon" data-act="hmon" data-v="-1" aria-label="' +
    TH("common.previous") +
    '">' +
    ic("left") +
    '</button><button class="plabel" data-act="period-open" data-v="hist" aria-haspopup="dialog"><span>' +
    esc(periodLabel(HP)) +
    "</span>" +
    ic("down") +
    '</button><button class="icon" data-act="hmon" data-v="1" aria-label="' +
    TH("common.next") +
    '"' +
    (canNext(HP) ? "" : " disabled") +
    ">" +
    ic("right") +
    "</button></div>";
  const accs = S.accounts.filter(a => !a.archived || a.id === V.hAcc); // same order as histAccs()
  if (accs.length > 1)
    h +=
      '<div class="strip" style="margin-top:8px"><button class="chip" data-act="hacc" data-v="" aria-pressed="' +
      !V.hAcc +
      '">' +
      TH("history.all") +
      "</button>" +
      accs
        .map(
          a =>
            '<button class="chip" data-act="hacc" data-v="' +
            a.id +
            '" aria-pressed="' +
            (V.hAcc === a.id) +
            '"><span class="chn" dir="auto">' +
            esc(a.name) +
            "</span></button>"
        )
        .join("") +
      "</div>";
  if (!list.length) return h + '<div class="empty">' + TH("history.none." + HP.period) + "</div>";
  return h + dayGroups(list);
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
  return (
    h +
    '<button class="cat tile-add" data-act="cat-new" data-v="' +
    kind +
    '" aria-label="' +
    TH("category.add") +
    '"><span class="ci">' +
    ic("add") +
    '</span><span class="cn">' +
    TH("common.add") +
    "</span></button></div>"
  );
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
  const b = [...document.querySelectorAll('#app [data-act="week"]')];
  if (b.some(x => x.scrollWidth > x.clientWidth + 1))
    b.forEach(x => {
      x.setAttribute("aria-label", x.textContent);
      x.textContent = capFirst(weekdayName(+x.dataset.v, "short"));
    });
}
function settingsView() {
  let h = subBar(T("settings.title"));
  const th = S.settings.theme || "system";
  h +=
    '<div class="sec">' +
    TH("settings.theme") +
    '</div><div class="seg">' +
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
    '<div class="sec">' +
    TH("settings.feel") +
    '</div><div class="list"><div class="setrow"><span class="mid"><div>' +
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
    '<div class="sec">' +
    TH("settings.region") +
    '</div><div class="lbl set">' +
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
    '<div class="sec">' +
    TH("settings.reminders") +
    "</div>" +
    healthCard() +
    '<div class="list">' +
    remRow("nudge", "rem-daily", T("remind.nudge"), T("remind.nudgeHint"), r.daily, r.time) +
    remRow("check", "rem-check", T("remind.check"), T("remind.checkHint"), r.check, r.checkTime) +
    remRow("due", "rem-dues", T("remind.dues"), T("remind.duesHint"), r.dues, r.dueTime) +
    "</div>";
  h +=
    '<div class="sec">' +
    TH("settings.outCats") +
    '</div><p class="hint" style="margin:0 4px 8px">' +
    TH("settings.outCatsHint") +
    "</p>" +
    ringHTML(outCats(), { mode: "edit" }) +
    '<div class="gap"></div><button class="btn tonal" data-act="cat-new" data-v="out">' +
    ic("add") +
    TH("settings.addOutCat") +
    "</button>";
  h += '<div class="sec">' + TH("settings.inCats") + "</div>" + catGrid("in");
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
    '<div class="sec">' +
    TH("settings.data") +
    '</div><p class="muted small" style="margin:0 4px 12px">' +
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
    '<div class="sec center">' +
    TH("settings.about") +
    '</div><p class="muted small" style="margin:0 4px;text-align:center">Tally' +
    (ver ? " · " + TH("settings.version", { version: ver }) : "") +
    "<br>" +
    TH("settings.by", { name: { html: '<a href="https://github.com/IamAndelib">IamAndelib</a>' } }) +
    '<br><a href="https://github.com/IamAndelib/Tally-android">' +
    TH("settings.source") +
    "</a></p>";
  return h;
}
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
    (ICONS.warning
      ? '<svg viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="' +
        ICONS.warning[0] +
        '"/></svg>'
      : "") +
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
      ? '<div class="setrow"><span class="mid"><div>Tally backup.json</div><div class="s">' +
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
