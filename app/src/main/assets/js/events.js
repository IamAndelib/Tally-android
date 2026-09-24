/*
 * events.js — Event wiring: one click dispatcher for every [data-act] element, plus input / change / key handlers, the page
 * lock while a layer is open, and resize / return-to-app handling.
 */
"use strict";

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
  if (el.tagName === "SELECT" || el.tagName === "INPUT") return;
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
    case "loanpay-del": {
      const id = v;
      closeSheet();
      withUndo("Payment deleted", () => {
        S.txns = S.txns.filter(x => x.id !== id);
      });
      break;
    }
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
      setPeriod({ period: PD.tab === "month" ? "month" : "day", anchor: today() });
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
        f();
      }
      break;
    case "check-ok":
      S.settings.lastCheck = today();
      commit();
      snack("Page started for today");
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
    case "row-exp":
      el.classList.toggle("open");
      break;
    case "tx-del": {
      const id = F.id;
      closeSheet();
      withUndo("Deleted", () => deleteEntries([id]));
      break;
    }
    case "tr-new":
      trSheet();
      break;
    case "tr-from-acc":
      trSheet(null, v);
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
    case "tr-fee":
      F.showFee = true;
      $("#fee-wrap").hidden = false;
      el.hidden = true;
      $("#f-fee").focus();
      trPreview();
      break;
    case "tr-save":
      saveTr();
      break;
    case "tr-del": {
      const id = F.id;
      closeSheet();
      withUndo("Deleted", () => deleteEntries([id]));
      break;
    }
    case "adj-del": {
      const id = F.id;
      closeSheet();
      withUndo("Fix deleted", () => deleteEntries([id]));
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
        snack("Type an emoji");
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
      timePicker();
      break;
    case "tm-pick":
      closePop();
      S.settings.remind.time = v;
      save();
      syncReminders();
      render();
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
      curPicker(S.settings.cur, c => {
        S.settings.cur = c;
        V.cur = null;
        commit();
      });
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
    case "hmon":
      if (+v < 0 || canNext(HP)) {
        shiftPeriod(+v, HP);
        if (V.sel) V.sel = new Set();
        render();
      }
      break;
    case "hacc":
      V.hAcc = v;
      if (V.sel) V.sel = new Set();
      render();
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
        n = ids.length;
      withUndo("Deleted " + n + " " + (n === 1 ? "entry" : "entries"), () => {
        deleteEntries(ids);
        V.sel = null;
      });
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
        snack("Up to 24 spending categories");
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
    case "backup":
      saveOut("tally-backup-" + today() + ".json", "application/json", JSON.stringify(S));
      break;
    case "wipe":
      wipeAll();
      break;
  }
});
document.addEventListener("input", ev => {
  const id = ev.target.id;
  if (F && F.kind === "tr" && ["f-amt", "f-toamt", "f-fee"].includes(id)) trPreview();
  else if (id === "f-actual") fixPreview();
  else if (id === "cur-q") curList(ev.target.value);
  else if (id === "ic-q") icList(ev.target.value);
  else if (id === "hx-in") hexPreview();
  else if (id === "f-person" && F && F.kind === "loanf") {
    F.merge = null;
    mergeHint();
    personSuggest(ev.target.value);
  } else if (id === "f-amt" && F && F.kind === "loanf") mergeHint();
});
document.addEventListener("change", ev => {
  if (ev.target.id === "restore-file") restoreFile(ev.target);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") goBack();
  else if (e.key === "Enter" && (e.target.id === "nt-name" || e.target.id === "hx-in")) {
    e.preventDefault();
    (e.target.id === "nt-name" ? addType : useHex)();
  } else if (e.key === "Enter" && e.target.id === "cur-q") {
    const b = $('#curlist [data-act="cur-pick"]');
    if (b) {
      e.preventDefault();
      b.click();
    }
  } else if (e.key === "Enter" && F && e.target.tagName === "INPUT") {
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
    const b = map[F.kind] && document.querySelector('[data-act="' + map[F.kind] + '"]');
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
  }).observe($(id), { childList: true })
);
/* the ring is laid out in px from the screen width: redo it when the width changes (not when the keyboard opens) */
let lastW = innerWidth;
addEventListener("resize", () => {
  if (innerWidth !== lastW) {
    lastW = innerWidth;
    if ((V.screen === "home" || V.screen === "settings") && !LP) render();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") catchUpToday();
});
