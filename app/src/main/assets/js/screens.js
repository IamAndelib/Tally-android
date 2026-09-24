/*
 * screens.js — The screens: render() and Home, Assets, Liabilities, History and Settings, plus the entry rows they share.
 */
"use strict";

let FLIP = null;
function render() {
  const app = $("#app");
  RBC = null;
  if (V.screen !== "history") V.sel = null;
  if (V.screen === "accounts") V.screen = "assets";
  if (V.screen === "history") app.innerHTML = historyView();
  else if (V.screen === "assets") app.innerHTML = assetsView();
  else if (V.screen === "liabs") app.innerHTML = liabsView();
  else if (V.screen === "settings") app.innerHTML = settingsView();
  else app.innerHTML = homeView();
  const tabs = ["home", "assets", "liabs"].includes(V.screen) && activeAccounts().length > 0;
  document.body.classList.toggle("hasnav", tabs);
  $("#nav").innerHTML = tabs
    ? '<div class="in">' +
      [
        ["home", "Home", "home"],
        ["assets", "Assets", "wallet"],
        ["liabs", "Liabilities", "card"],
      ]
        .map(
          ([k, l, i]) =>
            '<button data-act="tab" data-v="' +
            k +
            '"' +
            (V.screen === k ? ' aria-current="page"' : "") +
            '><span class="ind">' +
            (FLIP === k ? ic(i).replace('class="ic"', 'class="ic flip"') : ic(i)) +
            "</span>" +
            l +
            "</button>"
        )
        .join("") +
      "</div>"
    : "";
  FLIP = null;
}
function subBar(title) {
  return (
    '<header class="appbar"><button class="icon" data-act="home" aria-label="Back">' +
    ic("back") +
    "</button><h1>" +
    esc(title) +
    "</h1></header>"
  );
}
function homeView() {
  const act = activeAccounts();
  if (!act.length) {
    return (
      '<header class="appbar"><h1>Tally</h1>' +
      topIcons() +
      "</header>" +
      '<div class="welcome"><div class="big">📒</div><h2>Start your notebook</h2><p>Add the places your money lives — bank, mobile wallet, cash — with what each has right now.</p><button class="btn" data-act="acc-form">' +
      ic("add") +
      "Add first account</button></div>"
    );
  }
  const b = balances(),
    cur = viewCur();
  let h =
    '<header class="appbar"><div class="pnav"><button class="icon" data-act="prev" aria-label="Previous">' +
    ic("left") +
    "</button>" +
    '<button class="plabel' +
    (periodLabel().length > 11 ? " long" : "") +
    '" data-act="period-open" aria-haspopup="dialog"><span>' +
    esc(periodLabel()) +
    "</span>" +
    ic("down") +
    "</button>" +
    '<button class="icon" data-act="next" aria-label="Next"' +
    (canNext() ? "" : " disabled") +
    ">" +
    ic("right") +
    "</button></div>" +
    topIcons() +
    "</header>";

  if (S.settings.lastCheck !== today()) h += checkCard(b, cur);
  else
    h +=
      '<div class="strip">' +
      act
        .map(
          a =>
            '<button class="acc" data-act="acc-open" data-v="' +
            a.id +
            '"><span class="n">' +
            emblem(accEmb(a), "sm") +
            esc(a.name) +
            '</span><span class="b">' +
            esc(money(b[a.id], a.currency)) +
            "</span></button>"
        )
        .join("") +
      '<button class="acc add" data-act="acc-form" aria-label="Add account">' +
      ic("add") +
      "</button></div>";

  const inCur = t => {
    const a = acc(t.account);
    return a && a.currency === cur;
  };
  const pt = periodTxns().filter(inCur);
  let spent = 0,
    got = 0;
  const by = {};
  pt.forEach(t => {
    if (t.type === "expense") {
      spent += t.amount;
      by[t.cat] = (by[t.cat] || 0) + t.amount;
    } else if (t.type === "income") got += t.amount;
  });
  spent = r2(spent);
  got = r2(got);
  h += ringHTML(outCats(), { mode: "home", by, spent, got, cur });

  const total = r2(act.filter(a => a.currency === cur).reduce((s, a) => s + b[a.id], 0));
  const n = periodTxns().length;
  if (!(V.period === "day" && V.anchor === today()))
    h +=
      '<div class="todayrow"><button class="todaychip" data-act="go-today" aria-label="Back to today">' +
      ic("reset") +
      "Today</button></div>";
  h +=
    '<button class="balbar" data-act="entries">' +
    ic("list") +
    '<span class="l">Balance' +
    (n ? " · " + n + " " + (n === 1 ? "entry" : "entries") : "") +
    "</span><b>" +
    esc(money(total, cur)) +
    "</b></button>";
  h +=
    '<div class="fabs"><button class="fab minus" data-act="add-out" aria-label="Add spending">' +
    ic("remove") +
    "</button>" +
    '<button class="fab xfer" data-act="tr-new" aria-label="Transfer between accounts">' +
    ic("swap") +
    "<span>Transfer</span></button>" +
    '<button class="fab plus" data-act="add-in" aria-label="Add money received">' +
    ic("add") +
    "</button></div>";
  h +=
    '<div class="loanbtns"><button class="fbtn loan" data-act="loan-new" data-v="borrow">' +
    emblem(LOAN_EMB.borrow) +
    'Loan</button><button class="fbtn lend" data-act="loan-new" data-v="lend">' +
    emblem(LOAN_EMB.lend) +
    "Lend</button></div>";
  return h;
}
function checkCard(b, cur) {
  const hr = new Date().getHours();
  const hello = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const y = addDays(today(), -1);
  const ySpent = r2(
    S.txns
      .filter(t => t.date === y && t.type === "expense" && acc(t.account) && acc(t.account).currency === cur)
      .reduce((s, t) => s + t.amount, 0)
  );
  return (
    '<section class="check"><h2>' +
    hello +
    "</h2><p>Do these still match what you have?" +
    (ySpent ? " Yesterday you spent " + esc(money(ySpent, cur)) + "." : "") +
    "</p>" +
    activeAccounts()
      .map(
        a =>
          '<button class="ckrow" data-act="acc-open" data-v="' +
          a.id +
          '">' +
          emblem(accEmb(a), "sm") +
          '<span class="nm">' +
          esc(a.name) +
          "</span><b>" +
          esc(money(b[a.id], a.currency)) +
          '</b><span class="fx">Fix</span></button>'
      )
      .join("") +
    '<button class="btn" data-act="check-ok">' +
    ic("check") +
    "All match</button></section>"
  );
}
/* History + Settings, always one tap away in the top bar */
const topIcons = () =>
  '<button class="icon" data-act="go" data-v="history" aria-label="History">' +
  ic("history") +
  '</button><button class="icon" data-act="go" data-v="settings" aria-label="Settings">' +
  ic("settings") +
  "</button>";
function tabBar(title) {
  return '<header class="appbar"><h1>' + esc(title) + "</h1>" + topIcons() + "</header>";
}
function perCur(add) {
  const m = {};
  add((c, v) => {
    m[c] = r2((m[c] || 0) + v);
  });
  return m;
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
    '<span class="mid"><div class="d">' +
    esc(a.name) +
    '</div><div class="s">' +
    esc(typeName(a.type) + " · " + a.currency) +
    '</div></span><span class="a">' +
    esc(money(b[a.id], a.currency)) +
    (a.archived ? '<small><span class="st">Archived</span></small>' : "") +
    "</span></button>"
  );
}
/* drag targets: a list with data-zone, or (when that list is empty or collapsed) a drop box that only shows while dragging */
const dropBox = (z, label, icon) =>
  '<div class="dropbox" data-zone="' + z + '">' + (icon ? ic(icon) : "") + esc(label) + "</div>";
const zoneList = (z, rows) => '<div class="list" data-src="' + z + '">' + rows + "</div>";
const dragTip = () =>
  S.settings.dragTip
    ? ""
    : '<p class="hint" style="margin:8px 4px 0">Tip: hold a row and drag it up to the empty slot to bring it back.</p>';
function assetsView() {
  const b = balances();
  let h = tabBar("Assets");
  h +=
    '<div class="sumcard"><div class="t">Net worth</div>' +
    curLines(netWorth()) +
    '<div class="t small">What you have and are owed, minus what you owe</div></div>';
  const accs = activeAccounts().filter(a => a.type !== "card"),
    arch = S.accounts.filter(a => a.archived);
  h +=
    '<div class="sec">Accounts</div>' +
    (accs.length
      ? zoneList("acc", accs.map(a => accRow(a, b, true)).join(""))
      : '<div class="empty">No accounts yet</div>') +
    dropBox("acc", "Drop here to show it again", "reset") +
    '<button class="btn text" data-act="acc-form" style="margin-top:4px">' +
    ic("add") +
    "Add account</button>";
  if (arch.length)
    h +=
      '<button class="btn text" data-act="toggle-arch">' +
      (V.showArchived ? "Hide" : "Show") +
      " archived (" +
      arch.length +
      ")</button>";
  h +=
    dropBox("arch", "Drop here to archive") +
    (arch.length && V.showArchived ? zoneList("arch", arch.map(a => accRow(a, b, true)).join("")) + dragTip() : "");
  const lends = S.loans.filter(l => l.kind === "lend"),
    open = lends.filter(l => loanInfo(l).open),
    done = lends.filter(l => !loanInfo(l).open);
  h +=
    '<div class="sec">Owed to you</div>' +
    (open.length
      ? zoneList("lend-open", open.map(l => loanRow(l, true)).join(""))
      : '<p class="hint" style="margin:0 4px">Money you lend shows here until it comes back.</p>') +
    dropBox("lend-open", "Drop here to make it active again", "reset") +
    '<button class="btn text" data-act="loan-new" data-v="lend" style="margin-top:4px">' +
    ic("add") +
    "Lend money</button>";
  h += dropBox("lend-done", "Drop here to mark it cleared", "check");
  if (done.length) {
    h +=
      '<button class="btn text" data-act="toggle-cleared">' +
      (V.showCleared ? "Hide" : "Show") +
      " cleared (" +
      done.length +
      ")</button>";
    if (V.showCleared) h += zoneList("lend-done", done.map(l => loanRow(l, true)).join("")) + dragTip();
  }
  h +=
    '<div class="sec">Other assets</div>' +
    (S.assets.length
      ? '<div class="list">' +
        S.assets
          .map(
            x =>
              '<button class="tx" data-act="asset-edit" data-v="' +
              x.id +
              '">' +
              emblem(x, "em") +
              '<span class="mid"><div class="d">' +
              esc(x.name) +
              '</div></span><span class="a">' +
              esc(money(x.value, x.currency)) +
              "</span></button>"
          )
          .join("") +
        "</div>"
      : '<p class="hint" style="margin:0 4px">Things you own that aren’t accounts, like gold or a laptop.</p>') +
    '<button class="btn text" data-act="asset-edit" style="margin-top:4px">' +
    ic("add") +
    "Add asset</button>";
  return h;
}
function liabsView() {
  const b = balances();
  let h = tabBar("Liabilities");
  const borrows = S.loans.filter(l => l.kind === "borrow"),
    open = borrows.filter(l => loanInfo(l).open),
    done = borrows.filter(l => !loanInfo(l).open);
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
  h += '<div class="sumcard owe"><div class="t">You owe</div>' + curLines(owed) + "</div>";
  h +=
    '<div class="sec">Loans</div>' +
    (open.length
      ? zoneList("borrow-open", open.map(l => loanRow(l, true)).join(""))
      : '<p class="hint" style="margin:0 4px">Money you borrow shows here until it’s paid back.</p>') +
    dropBox("borrow-open", "Drop here to make it active again", "reset") +
    '<button class="btn text" data-act="loan-new" data-v="borrow" style="margin-top:4px">' +
    ic("add") +
    "Record a loan</button>";
  h += dropBox("borrow-done", "Drop here to mark it cleared", "check");
  if (done.length) {
    h +=
      '<button class="btn text" data-act="toggle-cleared">' +
      (V.showCleared ? "Hide" : "Show") +
      " cleared (" +
      done.length +
      ")</button>";
    if (V.showCleared) h += zoneList("borrow-done", done.map(l => loanRow(l, true)).join("")) + dragTip();
  }
  if (cards.length)
    h += '<div class="sec">Credit cards</div><div class="list">' + cards.map(a => accRow(a, b)).join("") + "</div>";
  return h;
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
    d = t.note || "Transfer";
    s = (a ? a.name : "?") + " → " + (to ? to.name : "?");
    amt =
      esc(money(t.amount, cur)) +
      (t.toAmount != null && to && to.currency !== cur
        ? "<small>→ " + esc(money(t.toAmount, to.currency)) + "</small>"
        : "");
  } else if (t.type === "adjust") {
    em = { i: "balance", c: "#7a8190" };
    d = t.note || "Balance fix";
    s = "Balance fix · " + (a ? a.name : "?");
    amt = esc(signed(t.amount, cur));
    cls = t.amount < 0 ? "spent" : "got";
  } else if (t.type === "loan") {
    const l = loan(t.loan),
      lend = l && l.kind === "lend",
      who = l ? loanWho(l) : "?";
    em = LOAN_EMB[lend ? "lend" : "borrow"];
    d = t.principal ? (lend ? "Lent to " : "Borrowed from ") + who : lend ? who + " paid back" : "Paid back " + who;
    s = (lend ? "Lending" : "Loan") + " · " + (a ? a.name : "?");
    amt = esc(signed(t.dir === "in" ? t.amount : -t.amount, cur));
    cls = t.dir === "in" ? "got" : "spent";
  } else {
    const k = cat(t.cat),
      out = t.type === "expense";
    em = k;
    d = t.note || k.name;
    s = k.name + " · " + (a ? a.name : "?");
    amt = (out ? "−" : "+") + esc(money(t.amount, cur));
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
    '<span class="mid"><div class="d">' +
    esc(d) +
    '</div><div class="s">' +
    loanPill(t) +
    esc(s) +
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
      '<span class="rb">↓ ' +
      esc((a ? a.name : "?") + " " + money(r.a, a ? a.currency : "")) +
      "</span>" +
      (to && r.t != null ? '<span class="rb">↑ ' + esc(to.name + " " + money(r.t, to.currency)) + "</span>" : "")
    );
  }
  return a ? '<span class="rb">' + esc(a.name + " " + money(r.a, a.currency)) + "</span>" : "";
}
function loanPill(t) {
  const r = t.type === "loan" && runBal()[t.id];
  if (!r || !r.ls) return "";
  return '<span class="st ' + r.ls + '">' + (r.ls === "cleared" ? "Cleared" : "Partly paid") + "</span> ";
}
function dayGroups(list) {
  let h = "",
    cur = "";
  list.forEach(t => {
    if (t.date !== cur) {
      if (cur) h += "</div>";
      cur = t.date;
      const sp = {};
      list.forEach(x => {
        if (x.date === cur && x.type === "expense") {
          const c = (acc(x.account) || {}).currency;
          sp[c] = (sp[c] || 0) + x.amount;
        }
      });
      const tot = Object.entries(sp)
        .map(([c, v]) => "−" + money(r2(v), c))
        .join(" · ");
      h +=
        '<div class="day"><span>' +
        esc(dayLabel(t.date)) +
        "</span><span>" +
        esc(tot) +
        '</span></div><div class="list">';
    }
    h += txLine(t);
  });
  return cur ? h + "</div>" : h;
}
function historyList() {
  const [s, e] = range(HP);
  let list = S.txns.filter(t => t.date >= s && t.date <= e);
  if (V.hAcc) list = list.filter(t => t.account === V.hAcc || t.to === V.hAcc);
  return list.sort(byNewest);
}
function historyView() {
  const list = historyList();
  let h;
  if (V.sel) {
    const n = V.sel.size;
    h =
      '<header class="appbar"><button class="icon" data-act="sel-cancel" aria-label="Stop selecting">' +
      ic("close") +
      "</button><h1>" +
      n +
      " selected</h1>" +
      '<button class="icon" data-act="sel-all" aria-label="Select all">' +
      ic("selectall") +
      "</button>" +
      '<button class="icon" data-act="sel-del" aria-label="Delete selected"' +
      (n ? "" : " disabled") +
      ">" +
      ic("delete") +
      "</button></header>";
  } else
    h =
      '<header class="appbar"><button class="icon" data-act="home" aria-label="Back">' +
      ic("back") +
      "</button><h1>History</h1>" +
      (list.length
        ? '<button class="icon" data-act="sel-start" aria-label="Select entries">' + ic("checkbox") + "</button>"
        : "") +
      "</header>";
  h +=
    '<div class="month"><button class="icon" data-act="hmon" data-v="-1" aria-label="Previous">' +
    ic("left") +
    '</button><button class="plabel" data-act="period-open" data-v="hist" aria-haspopup="dialog"><span>' +
    esc(periodLabel(HP)) +
    "</span>" +
    ic("down") +
    '</button><button class="icon" data-act="hmon" data-v="1" aria-label="Next"' +
    (canNext(HP) ? "" : " disabled") +
    ">" +
    ic("right") +
    "</button></div>";
  const accs = S.accounts.filter(a => !a.archived || a.id === V.hAcc);
  if (accs.length > 1)
    h +=
      '<div class="strip" style="margin-top:8px"><button class="chip" data-act="hacc" data-v="" aria-pressed="' +
      !V.hAcc +
      '">All</button>' +
      accs
        .map(
          a =>
            '<button class="chip" data-act="hacc" data-v="' +
            a.id +
            '" aria-pressed="' +
            (V.hAcc === a.id) +
            '">' +
            esc(a.name) +
            "</button>"
        )
        .join("") +
      "</div>";
  if (!list.length)
    return (
      h +
      '<div class="empty">Nothing written down ' +
      (HP.period === "day" ? "that day" : HP.period === "month" ? "that month" : "in those days") +
      ".</div>"
    );
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
        '<span class="cn">' +
        esc(c.name) +
        "</span></button>";
    });
  return (
    h +
    '<button class="cat tile-add" data-act="cat-new" data-v="' +
    kind +
    '" aria-label="Add category"><span class="ci">' +
    ic("add") +
    '</span><span class="cn">Add</span></button></div>'
  );
}
function settingsView() {
  let h = subBar("Settings");
  const th = S.settings.theme || "system";
  h +=
    '<div class="sec">Theme</div><div class="seg">' +
    [
      ["system", "Phone"],
      ["light", "Light"],
      ["dark", "Dark"],
    ]
      .map(
        ([k, l]) => '<button data-act="theme" data-v="' + k + '" aria-pressed="' + (th === k) + '">' + l + "</button>"
      )
      .join("") +
    "</div>";
  h +=
    '<div class="sec">Main currency</div><button class="fieldbtn" data-act="pick-maincur"><span>' +
    esc(curLabel(S.settings.cur)) +
    "</span>" +
    ic("down") +
    "</button>";
  const r = S.settings.remind || {};
  h +=
    '<div class="sec">Reminders</div><div class="list">' +
    '<div class="setrow"><span class="mid"><div>Evening nudge</div><div class="s">If nothing was written that day</div></span><button class="fieldbtn" id="f-rtime" data-act="pick-time" style="width:auto;height:44px;gap:6px"' +
    (r.daily === false ? " disabled" : "") +
    "><span>" +
    esc(timeLabel(r.time || "21:00")) +
    "</span>" +
    ic("schedule") +
    "</button>" +
    '<button class="sw" role="switch" data-act="rem-daily" aria-checked="' +
    (r.daily !== false) +
    '" aria-label="Evening nudge"></button></div>' +
    '<div class="setrow"><span class="mid"><div>Loan & lending due days</div><div class="s">Morning of the day, with +1 day / +1 week</div></span>' +
    '<button class="sw" role="switch" data-act="rem-dues" aria-checked="' +
    (r.dues !== false) +
    '" aria-label="Due day reminders"></button></div></div>';
  h +=
    '<div class="sec">Spending categories</div><p class="hint" style="margin:0 4px 8px">Laid out exactly like your home screen. Tap to edit, hold and drag to move.</p>' +
    ringHTML(outCats(), { mode: "edit" }) +
    '<div class="gap"></div><button class="btn tonal" data-act="cat-new" data-v="out">' +
    ic("add") +
    "Add spending category</button>";
  h += '<div class="sec">Money-in categories</div>' + catGrid("in");
  const hid = S.cats.filter(c => c.hidden);
  if (hid.length)
    h +=
      '<p class="hint" style="margin:14px 4px 8px">Removed · tap to bring back</p><div class="chips">' +
      hid
        .map(
          c =>
            '<button class="chip" data-act="cat-back" data-v="' +
            esc(c.id) +
            '">' +
            emblem(c, "sm") +
            esc(c.name) +
            "</button>"
        )
        .join("") +
      "</div>";
  const noData = !S.accounts.length && !S.txns.length && !S.loans.length && !S.assets.length;
  h +=
    '<div class="sec">Your data</div><p class="muted small" style="margin:0 4px 12px">Everything stays on this phone. Uninstalling deletes it, so save a backup now and then.</p>' +
    '<button class="btn tonal" data-act="backup">Save backup</button><div class="gap"></div>' +
    '<label class="btn tonal" style="position:relative">Restore from backup<input type="file" id="restore-file" accept=".json,application/json" class="vh"></label><div class="gap"></div>' +
    '<button class="btn tonal" data-act="export">Export entries (CSV)</button><div class="gap"></div>' +
    '<button class="btn danger" data-act="wipe"' +
    (noData ? " disabled" : "") +
    ">Delete all data</button>";
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
    '<div class="sec">About</div><p class="muted small" style="margin:0 4px;text-align:center">Tally' +
    (ver ? " · Version " + esc(ver) : "") +
    '<br>By <a href="https://github.com/IamAndelib">IamAndelib</a>' +
    '<br><a href="https://github.com/IamAndelib/Tally-android">Source on GitHub</a></p>';
  return h;
}
