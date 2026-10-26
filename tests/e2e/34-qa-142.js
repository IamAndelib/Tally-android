// Fixes from the 1.4.2 review, each failing before its fix:
//  - a loan payment counts against the draws made by its day, so a later draw keeps its due date and reminder
//  - a backup file with a byte-order mark restores; Undo of a restore made while the saved data couldn't be read
//    leaves auto backup on; a full localStorage with the shell's copy raises no alarm
//  - picking the auto backup's folder again keeps auto backup on; a damaged file in a picked folder offers Replace;
//    while the saved data can't be read, Restore offers the auto backup and a restore never switches it off
//  - while the saved data can't be read, a setting changed doesn't store the blank stand-in over it (the next start
//    asks again); a full localStorage with the shell's copy failing too says so
//  - a name typed in another case (Turkish İrem / IREM, Işık / IŞIK) adds to that person's open tab; Chinese sentences
//    run on without a space after 。
//  - notes Tally writes itself (balance fix, fees) show in today's language and aren't stored; a day inside a
//    sentence is a date, never a capitalised "Yesterday"; standalone date headings start with a capital
//  - the first account doesn't bring the balance check at once; a transfer, entry or loan that needed an account
//    goes on once it's added; the currency picker offers the phone's own country's currency first
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (o = {}, android) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: "en-US", ...o });
    await ctx.addInitScript(a => {
      window.__native = { backup: [] };
      if (a)
        window.Android = {
          getColors: () => null,
          setBars() {},
          setReminders: j => (window.__native.reminders = j),
          setBackup: j => window.__native.backup.push(j),
          setBackupData() {},
          keepState: () => {
            window.__native.kept = (window.__native.kept || 0) + 1;
            return !window.__native.keepFails;
          },
          pickBackupFolder() {},
          backupStatus: () => JSON.stringify(window.__native.status || { folder: "x", usable: true, last: 1 }),
          readAutoBackup: id => {
            window.__native.readAuto = (window.__native.readAuto || 0) + 1;
            setTimeout(() => onAutoBackup(window.__native.auto || { none: true }, id));
          },
          pickRestoreFile: () => (window.__native.picked = true),
        };
    }, !!android);
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    return { ctx, page };
  };
  const seed = (page, extra) =>
    page.evaluate(x => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1000, archived: false });
      Object.assign(S, x || {});
      save();
      render();
    }, extra);

  // ---- loans: a payment never pays a draw made after it
  {
    const { ctx, page } = await open({}, true);
    await seed(page);
    const r = await page.evaluate(() => {
      const d = n => addDays(today(), n);
      S.loans.push({ id: "L", kind: "lend", person: "Sam", account: "a", date: d(-40), note: "", status: "open" });
      S.txns.push(
        {
          id: "d1",
          ts: 1,
          type: "loan",
          dir: "out",
          loan: "L",
          principal: true,
          amount: 100,
          account: "a",
          date: d(-40),
        },
        { id: "p1", ts: 2, type: "loan", dir: "in", loan: "L", amount: 60, account: "a", date: d(-20) },
        {
          id: "d2",
          ts: 3,
          type: "loan",
          dir: "out",
          loan: "L",
          principal: true,
          amount: 50,
          account: "a",
          date: d(0),
          due: d(10),
        }
      );
      commit();
      const i = loanInfo(loan("L"));
      return {
        rem: i.rem,
        next: i.nextDue,
        due: i.dueAmt,
        left: i.left,
        dues: JSON.parse(window.__native.reminders).dues,
      };
    });
    ok(
      r.rem.d1 === 40 && r.rem.d2 === 50 && r.left === 90,
      "the payment went to the draw before it: " + JSON.stringify(r.rem)
    );
    ok(r.next > "" && r.due === 50 && r.dues.length === 1, "the later draw keeps its due date and reminder");
    // a later payment: the draw due soonest first
    const c = await page.evaluate(() => {
      const d = n => addDays(today(), n);
      S.txns.push({ id: "p2", ts: 4, type: "loan", dir: "in", loan: "L", amount: 70, account: "a", date: d(0) });
      const i = loanInfo(loan("L"));
      return [i.rem.d1, i.rem.d2, i.left];
    });
    ok(c.join() === "20,0,20", "a later payment goes to the draw due soonest: " + c);
    await ctx.close();
  }

  // ---- restore and saving
  {
    const { ctx, page } = await open({}, true);
    await seed(page);
    const json = await page.evaluate(() => JSON.stringify(S));
    await page.evaluate(t => onRestorePicked("﻿" + t, null), json);
    ok(await page.$("#pop [data-act=ask-ok]"), "a backup with a byte-order mark asks to restore");
    await page.evaluate(() => closePop());
    // Undo of a restore made while the saved data couldn't be read: back to that state, auto backup left alone
    const r = await page.evaluate(t => {
      unreadable = "{broken";
      S = blank();
      window.__native.backup = [];
      restoreText(t);
      $("#pop [data-act=ask-ok]").click();
      const after = window.__native.backup.slice();
      undoFn();
      return { after, undo: window.__native.backup.slice(after.length), unreadable };
    }, json);
    ok(r.unreadable === "{broken", "Undo goes back to the unreadable state");
    ok(!r.undo.some(j => JSON.parse(j).on === false), "Undo doesn't turn auto backup off: " + JSON.stringify(r.undo));
    // localStorage full while the shell keeps a copy: no "couldn't save" dialog
    const d = await page.evaluate(() => {
      unreadable = null;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new Error("QuotaExceededError");
      };
      save();
      Storage.prototype.setItem = set;
      return new Promise(res => setTimeout(() => res(!!$("#pop").innerHTML), 50));
    });
    ok(!d, "a full localStorage with the shell's copy shows no dialog");
    await ctx.close();
  }

  // ---- saved data that can't be read stays found until something is added
  {
    const { ctx, page } = await open();
    await page.evaluate(() => localStorage.setItem(LS, "{broken"));
    const start = async () => {
      await page.reload();
      return page.evaluate(() => ({ unreadable, dialog: $("#pop h3") ? $("#pop h3").textContent : "" }));
    };
    let r = await start();
    ok(
      r.unreadable === "{broken" && r.dialog === "Couldn't open your saved data",
      "start-up says the data can't be read"
    );
    await page.evaluate(() => {
      closePop();
      S.settings.theme = "dark";
      save();
    });
    r = await start();
    ok(r.unreadable === "{broken" && r.dialog, "after a setting changed, the next start still says so: " + r.dialog);
    await page.evaluate(() => {
      closePop();
      S.settings.cur = "USD";
      S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 0, archived: false });
      save();
    });
    r = await start();
    ok(!r.unreadable && !r.dialog, "once an account is added, that's a new notebook");
    await ctx.close();
  }
  {
    const { ctx, page } = await open({}, true);
    await seed(page);
    const d = await page.evaluate(() => {
      window.__native.keepFails = true;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new Error("QuotaExceededError");
      };
      save();
      Storage.prototype.setItem = set;
      return new Promise(res => setTimeout(() => res($("#pop h3") ? $("#pop h3").textContent : ""), 50));
    });
    ok(d === "Couldn't save on this phone", "a full localStorage with the shell's copy failing too says so: " + d);
    await ctx.close();
  }

  // ---- the auto backup's folder
  {
    const { ctx, page } = await open({}, true);
    await seed(page);
    const wait = () => page.waitForTimeout(50);
    // auto backup on and written; the same folder picked again (Change): still on, nothing asked
    await page.evaluate(() => {
      S.settings.backup.on = true;
      window.__native.status = { on: true, folder: "x", usable: true, last: 5 };
      window.__native.auto = { text: JSON.stringify(S), when: 5 };
      window.__native.backup = [];
      onFolderPicked("");
    });
    await wait();
    const a = await page.evaluate(() => ({
      on: S.settings.backup.on,
      dialog: $("#pop").textContent,
      off: window.__native.backup.some(j => JSON.parse(j).on === false),
    }));
    ok(a.on && !a.off && !a.dialog, "picking the same folder again keeps auto backup on: " + JSON.stringify(a));
    // a new folder with a damaged backup: the "can't read" question, with Replace it
    const b = await page.evaluate(async () => {
      closePop();
      window.__native.status = { on: true, folder: "y", usable: true, last: 0 };
      window.__native.auto = { text: '{"v":6,"accounts":[{"id":"a"', when: 0 };
      onFolderPicked("");
      await new Promise(r => setTimeout(r, 50));
      const t = $("#pop h3").textContent;
      $("#pop [data-act=ask-ok]").click();
      return { t, on: S.settings.backup.on };
    });
    ok(
      b.t === "Couldn't read this folder's backup" && b.on,
      "a damaged backup offers Replace it: " + JSON.stringify(b)
    );
    // the saved data can't be read, the shell still backs up: Restore reads the auto backup first, and restoring an
    // older file made before auto backup was on doesn't switch it off
    const c = await page.evaluate(async () => {
      closePop();
      const file = JSON.parse(JSON.stringify(S));
      file.settings.backup.on = false;
      S = blank();
      unreadable = "{broken";
      window.__native.status = { on: true, folder: "x", usable: true, last: 5 };
      window.__native.auto = { error: "read" };
      window.__native.readAuto = 0;
      window.__native.picked = false;
      restoreStart();
      await new Promise(r => setTimeout(r, 50));
      const read = window.__native.readAuto,
        picked = window.__native.picked;
      window.__native.backup = [];
      restoreText(JSON.stringify(file));
      $("#pop [data-act=ask-ok]").click();
      return { read, picked, sent: window.__native.backup.map(j => JSON.parse(j).on), on: S.settings.backup.on };
    });
    ok(c.read === 1 && c.picked, "while the saved data can't be read, Restore tries the auto backup first");
    ok(c.on && !c.sent.includes(false), "restoring then keeps auto backup on: " + JSON.stringify(c));
    await ctx.close();
  }

  // ---- notes Tally writes, days in sentences, headings
  {
    const { ctx, page } = await open({ uiLang: "de", locale: "de-DE" });
    await seed(page);
    const r = await page.evaluate(() => {
      S.txns.push({ id: "f", ts: 1, type: "adjust", amount: -5, account: "a", date: today(), note: "Balance fix" });
      F = { kind: "acc", id: "a" };
      document.body.insertAdjacentHTML("beforeend", '<input id="f-actual" value="900">');
      saveFix();
      $("#f-actual").remove();
      const fresh = S.txns.find(t => t.type === "adjust" && t.id !== "f");
      V.screen = "history";
      render();
      return {
        stored: fresh && fresh.note,
        rows: [...document.querySelectorAll("#app .tx .d")].map(e => e.textContent),
      };
    });
    ok(r.stored === "", "a new balance fix stores no note");
    ok(r.rows.length === 2 && r.rows.every(t => t === "Korrektur"), "fixes show in German, old and new: " + r.rows);
    await ctx.close();
  }
  {
    const { ctx, page } = await open();
    await seed(page);
    const t = await page.evaluate(() => {
      S.accounts[0].opening = 0;
      S.txns.push({ id: "i", ts: 1, type: "income", amount: 10, account: "a", cat: "income", date: today() });
      guardOverdraw(
        () =>
          S.txns.push({
            id: "x",
            ts: 1,
            type: "expense",
            amount: 5,
            account: "a",
            cat: "food",
            date: addDays(today(), -1),
          }),
        addDays(today(), -1),
        () => {}
      );
      return $("#pop").textContent;
    });
    ok(
      /at the end of [A-Z][a-z]{2}, /.test(t) && !/Yesterday/.test(t),
      "the day in the overdraw question is a date: " + t
    );
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ uiLang: "ru", locale: "ru-RU" });
    await seed(page);
    const h = await page.evaluate(() => {
      V.screen = "history";
      render();
      return $("#app .month .plabel span").textContent;
    });
    ok(/^[А-ЯЁ]/.test(h), "a Russian month heading starts with a capital: " + h);
    await ctx.close();
  }

  // ---- names in any case, sentences in Chinese
  {
    const { ctx, page } = await open({ uiLang: "tr", locale: "tr-TR" });
    await seed(page);
    await page.evaluate(() => {
      for (const [id, who] of [
        ["L1", "İrem"],
        ["L2", "Işık"],
      ]) {
        S.loans.push({ id, kind: "lend", person: who, account: "a", date: today(), note: "", status: "open" });
        S.txns.push({
          id: "d" + id,
          ts: 1,
          type: "loan",
          dir: "out",
          loan: id,
          principal: true,
          amount: 10,
          account: "a",
          date: today(),
        });
      }
      commit();
      loanForm("lend");
    });
    const merged = [];
    for (const n of ["irem", "IREM", "ışık", "IŞIK"]) {
      await page.fill("#f-person", n);
      merged.push(await page.evaluate(() => F.merge));
    }
    ok(merged.join() === "L1,L1,L2,L2", "a name in another case adds to that tab: " + merged);
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ uiLang: "zh-Hans", locale: "zh-CN" });
    const t = await page.evaluate(() => [sentences("一。", "", "二！", "三"), sentences("One.", false, "Two.")]);
    ok(t[0] === "一。二！三" && t[1] === "One. Two.", "sentences: no space after 。, one after a full stop: " + t);
    await ctx.close();
  }

  // ---- first steps
  {
    const { ctx, page } = await open();
    const r = await page.evaluate(() => {
      localStorage.clear();
      S = blank();
      S.settings.cur = "USD";
      S.settings.remind.checkTime = "00:00";
      render();
      trSheet(); // needs two accounts: the account form, then the transfer
      const steps = [$("#sheet h2").textContent];
      $("#f-name").value = "Bank";
      saveAccount();
      const check = !!$("#app .check");
      steps.push($("#sheet h2") ? $("#sheet h2").textContent : "");
      return { steps, check };
    });
    ok(!r.check, "the first account doesn't bring the balance check");
    ok(
      r.steps[0] === "New account" && r.steps[1] === "New account",
      "one account isn't enough to transfer: " + r.steps
    );
    const t = await page.evaluate(() => {
      $("#f-name").value = "Cash";
      saveAccount();
      return $("#sheet h2") ? $("#sheet h2").textContent : "";
    });
    ok(t === "Transfer", "with the second account added, the transfer opens: " + t);
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ locale: "id-ID" });
    const l = await page.evaluate(() => {
      curPicker("", () => {});
      return [...document.querySelectorAll('#curlist [data-act="cur-pick"]')].slice(0, 2).map(b => b.dataset.v);
    });
    ok(l[0] === "IDR", "an Indonesian phone is offered the rupiah first: " + l);
    await ctx.close();
  }

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
