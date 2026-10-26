/*
 * events.js — Event wiring: one click dispatcher for every [data-act] element, plus input / change / key handlers, the page
 * lock while a layer is open, and resize / return-to-app handling.
 */
"use strict";

/* A second tap right where a tap just closed a sheet or dialog (a double tap on Save) would land on whatever was
   underneath it: such a tap is dropped. Keyboard and script clicks (detail 0) always go through. */
let ghostTap = null;
const layersUp = () => ["#sheet", "#sheet2", "#pop"].filter(id => $(id).innerHTML).length;
document.addEventListener(
  "click",
  ev => {
    if (!ev.detail) return;
    const g = ghostTap;
    ghostTap = null;
    if (g && ev.timeStamp - g.t < 300 && Math.abs(ev.clientX - g.x) < 24 && Math.abs(ev.clientY - g.y) < 24) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      return;
    }
    tapLayers = layersUp();
  },
  true
);
let tapLayers = 0;
document.addEventListener("click", ev => {
  if (swallowClick) {
    swallowClick = false;
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act,
    v = el.dataset.v;
  if (act === "sheet-bg") {
    if (ev.target === el) closeSheet();
    return;
  }
  if (act === "sheet2-bg") {
    if (ev.target === el) closeSheet2();
    return;
  }
  if (act === "pop-bg") {
    if (ev.target === el) closePop();
    return;
  }
  /* every tap clicks (the keypad's buttons already did, on touch-down; a time wheel ticks as its rows pass) */
  if (!el.closest(".calc, .wheel")) buzz("tap");
  switch (act) {
    case "home":
      V.screen = "home";
      render();
      scrollTo(0, 0);
      break;
    case "go":
      closeSheet();
      V.screen = v;
      render();
      scrollTo(0, 0);
      break;
    case "tab":
      V.screen = v;
      FLIP = v;
      render();
      scrollTo(0, 0);
      break;
    case "toggle-cleared":
      V.showCleared = !V.showCleared;
      render();
      break;
    case "loan-new":
      loanForm(v);
      break;
    case "loan-save":
      saveLoan();
      break;
    case "loan-open":
      loanOpen(v);
      break;
    case "loan-pay":
      payLoan();
      break;
    case "loandraw-edit":
      loanDrawEdit(v);
      break;
    case "loandraw-save":
      saveLoanDraw();
      break;
    case "ed-acc":
      F.editAcc = v;
      setPressed("ed-acc", v);
      break;
    case "loanpay-del":
      deleteLoanEntry(v);
      break;
    case "loan-writeoff":
      writeOffLoan();
      break;
    case "loan-del":
      deleteLoan();
      break;
    case "asset-edit":
      assetForm(v);
      break;
    case "pick-assetcur":
      curPicker(F.cur, c => {
        if (F && F.kind === "assetf") {
          F.cur = c;
          $("#f-cur span").textContent = c;
        }
      });
      break;
    case "asset-save":
      saveAsset();
      break;
    case "asset-del":
      deleteAsset();
      break;
    case "rem-daily":
      toggleReminder("daily");
      break;
    case "rem-dues":
      toggleReminder("dues");
      break;
    case "rem-check":
      toggleReminder("check");
      break;
    case "rem-fix":
      fixReminders(v);
      break;
    case "bk-auto":
      toggleAutoBackup();
      break;
    case "bk-folder":
      pickBackupFolder();
      break;
    case "bk-now":
      backupNow();
      break;
    case "restore":
      restoreStart();
      break;
    case "haptics":
      toggleHaptics();
      break;
    case "donut-mode":
      cycleDonut();
      break;
    case "period-open":
      periodDialog(v === "hist" ? HP : V);
      break;
    case "pd-tab":
      PD.tab = v;
      PD.pick = null;
      pdRender();
      break;
    case "pd-mon":
      PD.month = shiftMonth(PD.month, +v);
      pdRender();
      break;
    case "pd-year":
      PD.year += +v;
      pdRender();
      break;
    case "pd-day":
      setPeriod({ period: "day", anchor: v });
      break;
    case "pd-rday":
      if (!PD.pick) {
        PD.pick = v;
        pdRender();
      } else applyRange(PD.pick, v);
      break;
    case "pd-month":
      setPeriod({ period: "month", anchor: v + "-01" });
      break;
    case "pd-today":
      setPeriod({ period: "day", anchor: today() }); // always today's figures, whichever tab is open
      break;
    case "pd-close":
      closePop();
      break;
    case "ask-ok": {
      const f = ASK;
      closePop();
      if (f) f();
      break;
    }
    case "ask-alt": {
      const f = ASK_ALT;
      closePop();
      if (f) f();
      break;
    }
    case "go-today":
      V.period = "day";
      V.anchor = today();
      render();
      break;
    case "prev":
      shiftPeriod(-1);
      render();
      break;
    case "next":
      if (canNext()) {
        shiftPeriod(1);
        render();
      }
      break;
    case "cur-next": {
      const cs = currencies();
      V.cur = cs[(cs.indexOf(viewCur()) + 1) % cs.length];
      render();
      break;
    }
    case "close":
      closeSheet();
      break;
    case "close2":
      closeSheet2();
      break;
    case "undo":
      if (undoFn) {
        const f = undoFn;
        undoFn = null;
        /* what an open layer shows may be what Undo takes away: back to the screen first */
        closePop();
        BACKTO = null;
        closeSheet();
        f();
      }
      break;
    case "check-ok":
      S.settings.lastCheck = today();
      commit();
      snack(T("home.checked"));
      break;
    case "entries":
      entriesSheet();
      break;
    case "summary":
      summarySheet();
      break;
    case "sm-mode":
      SM.mode = v;
      SM.sel = null;
      setPressed("sm-mode", v);
      smRender();
      break;
    case "sm-nav":
      smNav(+v);
      break;
    case "sm-pick":
      SM.sel = +v;
      smRender();
      break;
    case "sm-open":
      smOpen();
      break;
    case "add-out":
      txSheet(null, "expense");
      break;
    case "add-in":
      txSheet(null, "income");
      break;
    case "add-cat":
      txSheet(null, "expense", v);
      break;
    case "tx-open":
      openEntry(v);
      break;
    case "f-showcats": {
      const g = $("#f-catgrid");
      g.hidden = !g.hidden;
      el.setAttribute("aria-expanded", String(!g.hidden));
      break;
    }
    case "f-cat":
      pickCat(v);
      break;
    case "f-acc":
      pickAccount(v);
      break;
    case "tx-save":
      saveTx();
      break;
    case "row-exp": {
      const row = el.closest(".tx");
      row.classList.toggle("open");
      el.setAttribute("aria-expanded", row.classList.contains("open"));
      break;
    }
    case "tx-del":
    case "tr-del": {
      const id = F.id;
      closeSheet();
      withUndo(T("common.deleted"), () => deleteEntries([id]));
      break;
    }
    case "tr-new":
      trSheet();
      break;
    case "tr-from":
      trPickFrom(v);
      break;
    case "tr-to":
      F.to = v;
      trSync();
      break;
    case "tr-swap": {
      const x = F.from;
      F.from = F.to;
      F.to = x;
      $("#f-toamt").value = "";
      trSync();
      break;
    }
    case "add-fee":
      F.showFee = true;
      $("#fee-wrap").hidden = false;
      el.hidden = true;
      $("#f-fee").focus();
      if (F.kind === "tr") trPreview();
      break;
    case "tr-save":
      saveTr();
      break;
    case "adj-del": {
      const id = F.id;
      closeSheet();
      withUndo(T("fix.deleted"), () => deleteEntries([id]));
      break;
    }
    case "acc-open":
      accOpen(v);
      break;
    case "fix-save":
      saveFix();
      break;
    case "hist-acc":
      closeSheet();
      V.hAcc = v;
      Object.assign(HP, { period: "month", anchor: today() });
      V.screen = "history";
      render();
      scrollTo(0, 0);
      break;
    case "acc-form":
      accForm(v);
      break;
    case "f-type":
      pickType(v);
      break;
    case "type-new":
      typeDialog();
      break;
    case "nt-add":
      addType();
      break;
    case "col-new":
      hexDialog();
      break;
    case "hx-ok":
      useHex();
      break;
    case "f-icon":
      iconPicker(F.i, F.col, r => {
        if (r.i) {
          F.i = r.i;
          F.e = "";
        } else {
          F.i = "";
          F.e = r.e;
        }
        F.iSet = true;
        prevUpd();
      });
      break;
    case "ic-pick": {
      const f = ICPICK && ICPICK.onPick;
      closeSheet2();
      if (f) f({ i: v });
      break;
    }
    case "ic-emoji":
      $("#ic-emo-box").hidden = false;
      el.hidden = true;
      $("#ic-emo").focus();
      break;
    case "ic-emo-ok": {
      const e = $("#ic-emo").value.trim();
      if (!e) {
        snack(T("icon.emoji"));
        return;
      }
      const f = ICPICK && ICPICK.onPick;
      closeSheet2();
      if (f) f({ e });
      break;
    }
    case "pick-date":
      datePicker(el);
      break;
    case "dp-mon":
      DP.month = shiftMonth(DP.month, +v);
      dpRender();
      break;
    case "dp-day":
    case "dp-set":
      dpSet(v);
      break;
    case "pick-time":
      pickTime(v);
      break;
    case "tp-row":
      wheelRow(v);
      break;
    case "tp-ok":
      timeOk();
      break;
    case "pick-acccur":
      curPicker(F.cur, c => {
        if (F && F.kind === "accf") {
          F.cur = c;
          $("#f-cur span").textContent = c;
        }
      });
      break;
    case "pick-maincur":
      pickMainCur();
      break;
    case "week":
      S.settings.week = +v;
      commit();
      break;
    case "clock":
      S.settings.clock = v === "12" ? "12" : "24";
      commit();
      break;
    case "cur-pick": {
      const f = CURPICK;
      closeSheet2();
      if (f) f(v);
      break;
    }
    case "acc-save":
      saveAccount();
      break;
    case "acc-arch": {
      const a = acc(F.id);
      closeSheet();
      if (a) setArchived(a.id, !a.archived);
      break;
    }
    case "acc-unarch": {
      const id = F.id;
      closeSheet();
      setArchived(id, false);
      break;
    }
    case "loan-reopen": {
      const id = F.id;
      closeSheet();
      reopenLoan(id);
      break;
    }
    case "acc-del":
      deleteAccount();
      break;
    case "toggle-arch":
      V.showArchived = !V.showArchived;
      render();
      break;
    case "show-arch": // Home with every account archived
      V.screen = "assets";
      V.showArchived = true;
      render();
      break;
    case "hmon":
      if (+v < 0 || canNext(HP)) {
        shiftPeriod(+v, HP);
        if (V.sel) V.sel = new Set();
        render();
      }
      break;
    case "hacc":
      setHistAcc(v);
      break;
    case "sel-start":
      V.sel = new Set();
      render();
      break;
    case "sel-cancel":
      V.sel = null;
      render();
      break;
    case "sel-toggle":
      if (V.sel.has(v)) V.sel.delete(v);
      else V.sel.add(v);
      if (!V.sel.size) V.sel = null;
      render();
      break;
    case "sel-all": {
      const ids = historyList().map(t => t.id);
      V.sel = ids.every(id => V.sel.has(id)) ? new Set() : new Set(ids);
      render();
      break;
    }
    case "sel-del": {
      if (!V.sel || !V.sel.size) return;
      const ids = [...V.sel],
        no = loanBlock(ids);
      if (no) {
        snack(no);
        return;
      }
      let n = 0; // what actually went: a transfer's fee and a deleted loan's payments go with it
      withUndo(
        () => T("history.deleted", { count: n }),
        () => {
          n = S.txns.length;
          deleteEntries(ids);
          n -= S.txns.length;
          V.sel = null;
        }
      );
      break;
    }
    case "theme":
      S.settings.theme = v;
      save();
      applyTheme();
      render();
      break;
    case "cat-edit":
      catForm(v);
      break;
    case "cat-new":
      if (v === "out" && outCats().length >= 24) {
        snack(T("category.max", { count: 24 }));
        return;
      }
      catForm(null, v);
      break;
    case "cat-back":
      restoreCat(v);
      break;
    case "f-col":
      F.col = v;
      F.cSet = true;
      setPressed("f-col", v);
      prevUpd();
      break;
    case "calc-toggle":
      calcToggle(v, el);
      break;
    case "calc-pos":
      calcTapCaret(v, el, ev.clientX, ev.clientY);
      break;
    case "calc-kbd":
      calcToKeyboard(v);
      break;
    case "calc-key":
      calcKey(v);
      break;
    case "f-person-pick": {
      const el2 = $("#f-person");
      if (el2) el2.value = (loan(v) || {}).person || "";
      F.merge = v;
      $("#f-person-sug").hidden = true;
      mergeHint();
      break;
    }
    case "cat-save":
      saveCat();
      break;
    case "cat-del":
      removeCat();
      break;
    case "export":
      exportCsv();
      break;
    case "kept-save": {
      /* one file at a time (the shell saves one at a time): the oldest copy first, gone once saved (the next one is
         offered then) */
      const k = keptKeys().sort()[0];
      saveOut("tally-unreadable-" + today() + ".json", "application/json", localStorage.getItem(k), () => {
        try {
          localStorage.removeItem(k);
        } catch (e) {}
        render();
      });
      break;
    }
    case "lang-open":
      fixReminders("lang"); // Android's language setting for Tally
      break;
    case "kept-del":
      askDialog(
        T("data.kept.deleteQ"),
        T("data.kept.deleteBody"),
        T("common.delete"),
        () => {
          keptKeys().forEach(k => localStorage.removeItem(k));
          render();
        },
        { danger: true }
      );
      break;
    case "backup":
      saveBackup();
      break;
    case "wipe":
      wipeAll();
      break;
  }
});
/* after the tap has been handled (this listener comes after the one above): did it close a layer? */
document.addEventListener("click", ev => {
  if (ev.detail && layersUp() < tapLayers) ghostTap = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp };
  tapLayers = 0;
});
document.addEventListener("input", ev => {
  const id = ev.target.id;
  if (ev.target.matches('input[inputmode="decimal"]') && !ev.target.readOnly) formatAmountInput(ev.target, ev);
  if (F && F.kind === "tr" && ["f-amt", "f-toamt", "f-fee"].includes(id)) trPreview();
  else if (id === "f-actual") fixPreview();
  else if (id === "cur-q") curList(ev.target.value);
  else if (id === "ic-q") icList(ev.target.value);
  else if (id === "hx-in") hexPreview();
  else if (id === "f-person" && F && F.kind === "loanf") {
    /* a name typed out in full that has an open tab (same kind and currency) adds to it, as picking it would: the
       hint says so, and changing the name undoes it */
    const name = ev.target.value.trim().toLowerCase(),
      cur = (acc(F.account) || {}).currency,
      same = name && cur ? personCandidates(F.lk, cur, name).find(l => l.person.toLowerCase() === name) : null;
    F.merge = same ? same.id : null;
    mergeHint();
    personSuggest(ev.target.value);
  } else if (id === "f-amt" && F && F.kind === "loanf") mergeHint();
});
document.addEventListener("change", ev => {
  if (ev.target.id === "restore-file") restoreFile(ev.target);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") goBack();
  else if (e.target.id === "f-hlevel" && /^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(e.key)) {
    e.preventDefault();
    const n = S.settings.hapticLevel || 3;
    setHapticLevel(e.key === "Home" ? 1 : e.key === "End" ? 5 : n + (/Right|Up/.test(e.key) ? 1 : -1));
  } else if (e.target.classList && e.target.classList.contains("wcol") && /^Arrow(Up|Down)$/.test(e.key)) {
    e.preventDefault();
    wheelStep(e.target.id.slice(3), e.key === "ArrowUp" ? -1 : 1);
  } else if (e.key === "Enter" && (e.target.id === "nt-name" || e.target.id === "hx-in")) {
    e.preventDefault();
    (e.target.id === "nt-name" ? addType : useHex)();
  } else if (e.key === "Enter" && e.target.id === "cur-q") {
    const b = $('#curlist [data-act="cur-pick"]');
    if (b) {
      e.preventDefault();
      b.click();
    }
  } else if (e.key === "Enter" && e.target.id === "ic-emo") {
    e.preventDefault();
    $('#sheet2 [data-act="ic-emo-ok"]').click();
  } else if (e.key === "Enter" && F && e.target.tagName === "INPUT") {
    /* Enter saves the layer the field is in: in the second sheet (editing a loan entry, an emblem search) it never
       saves, or records a payment on, the sheet underneath */
    const two = !!e.target.closest("#sheet2");
    const map = {
      tx: "tx-save",
      tr: "tr-save",
      acc: "fix-save",
      accf: "acc-save",
      catf: "cat-save",
      loanf: "loan-save",
      loan: "loan-pay",
      assetf: "asset-save",
    };
    const act = two ? (F.kind === "loan" ? "loandraw-save" : "") : map[F.kind],
      b = act && $((two ? "#sheet2" : "#sheet") + ' [data-act="' + act + '"]');
    if (b) {
      e.preventDefault();
      b.click();
    }
  }
});
/* while a sheet or dialog is up, the page behind it doesn't scroll */
["#sheet", "#sheet2", "#pop"].forEach(id =>
  new MutationObserver(() => {
    const on = !!($("#sheet").innerHTML || $("#sheet2").innerHTML || $("#pop").innerHTML);
    document.documentElement.classList.toggle("lock", on);
    document.body.classList.toggle("lock", on);
    if (!document.querySelector(".calc:not([hidden])")) document.body.classList.remove("calcopen"); // its sheet went
    layerFocus();
  }).observe($(id), { childList: true })
);
/* Screen readers and keyboards stay in the top layer: what lies behind it is hidden from them (aria-hidden, and inert
   where the WebView knows it), focus moves into a layer as it opens and back to where it was when it closes */
const LAYERS = ["#app", "#nav", "#sheet", "#sheet2", "#pop"],
  focusBack = {};
function layerFocus() {
  let top = -1,
    back = null;
  LAYERS.forEach((id, i) => {
    const el = $(id),
      on = i > 1 && !!el.innerHTML;
    if (on) top = i;
    if (on && !el.dataset.up) {
      el.dataset.up = "1";
      const a = document.activeElement;
      focusBack[id] = a && a !== document.body ? { el: a, k: focusKey(a) } : null;
      /* a layer opened later covers the message bar: its Undo goes with it, so a tap meant for the layer can't undo
         the last change (a layer opened by that same change, like the list a saved entry came from, keeps it) */
      if (undoFn && Date.now() - SNACK_AT > 300) hideSnack();
    } else if (!on && el.dataset.up) {
      delete el.dataset.up;
      back = focusBack[id] || back;
      focusBack[id] = null;
    }
  });
  LAYERS.forEach((id, i) => {
    const el = $(id),
      below = i < top;
    if (below) el.setAttribute("aria-hidden", "true");
    else el.removeAttribute("aria-hidden");
    el.inert = below;
  });
  /* once what lay behind is reachable again: back to where the focus was before the closed layer opened */
  /* (or to the control that replaced it: saving redraws the screen) */
  if (back && back.el.isConnected) back.el.focus({ preventScroll: true });
  else if (back) refocus(document, back.k);
  if (top < 0) return;
  const t = $(LAYERS[top]);
  if (t.contains(document.activeElement)) return;
  const d = t.querySelector('[role="dialog"], [role="alertdialog"]');
  if (d) {
    d.tabIndex = -1;
    d.focus({ preventScroll: true });
  }
}
/* the ring is laid out in px from the window: redo it when the width changes (not when an upright phone's keyboard
   opens), any screen when the layout changes (rail, two panes, a phone turned sideways), and on a sideways phone when
   the height comes back (a sheet's keyboard closed) */
let lastW = innerWidth,
  lastH = innerHeight;
const sizeClass = () => (phoneLand() ? 3 : innerWidth >= PANES_AT ? 2 : innerWidth >= RAIL_AT ? 1 : 0);
let lastC = sizeClass();
addEventListener("resize", () => {
  const c = sizeClass(),
    w = innerWidth !== lastW,
    hh = innerHeight !== lastH,
    crossed = c !== lastC;
  lastW = innerWidth;
  lastH = innerHeight;
  lastC = c;
  if (LP) return;
  if (crossed || (w && (V.screen === "home" || V.screen === "settings"))) render();
  else if (hh && c === 3 && V.screen === "home" && !$("#sheet").innerHTML) render();
  fitCal($("#dp") || $("#pd"));
  /* turned with the keypad open: it moved (below the form ↔ beside it), so the field is brought back into view */
  if (CALC && CALC.inp && CALC.inp.isConnected)
    setTimeout(() => {
      if (CALC && CALC.inp.isConnected) calcKeepFieldVisible(CALC.inp, $("#calc-" + CALC.id));
    }, 0);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") catchUpToday();
});
