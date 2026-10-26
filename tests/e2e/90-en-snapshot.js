// English stays exactly as it was while the texts move into the translation catalogue (temporary, removed once the
// move is done): a tour of every screen, sheet and dialog records each visible text, accessible name, placeholder and
// field value, plus what the page hands the shell for notifications and the widget, and compares it with
// fixtures/en-snapshot.txt. SNAPSHOT_UPDATE=1 records it anew.
const fs = require("fs");
const path = require("path");
const { chromium, appUrl, launchOptions } = require("./harness");
const FILE = path.join(__dirname, "fixtures", "en-snapshot.txt");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};

/* runs in the page: the texts of every layer, in document order */
function dump() {
  const ATTRS = [
    "aria-label",
    "aria-description",
    "aria-valuetext",
    "aria-roledescription",
    "placeholder",
    "title",
    "alt",
  ];
  const out = [];
  const walk = n => {
    if (n.nodeType === 3) {
      if (n.textContent.trim()) out.push(JSON.stringify(n.textContent));
      return;
    }
    if (n.nodeType !== 1 || n.tagName === "svg" || n.tagName === "SCRIPT") return;
    for (const a of ATTRS) if (n.hasAttribute(a)) out.push("@" + a + "=" + JSON.stringify(n.getAttribute(a)));
    if ((n.tagName === "INPUT" || n.tagName === "TEXTAREA") && n.value) out.push("@value=" + JSON.stringify(n.value));
    n.childNodes.forEach(walk);
  };
  for (const id of ["app", "nav", "sheet", "sheet2", "pop", "snack"]) {
    const el = document.getElementById(id);
    if (el && el.innerHTML) {
      out.push("#" + id);
      walk(el);
    }
  }
  out.push("title " + JSON.stringify(document.title));
  return out.join("\n");
}

/* a notebook with something on every screen; dates relative to the test day */
function sampleState(t) {
  const ago = n => {
    const d = new Date(t + "T12:00:00");
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const tx = [];
  let n = 0;
  const add = (date, type, amount, account, extra) =>
    tx.push(
      Object.assign(
        { id: "t" + ++n, ts: Date.parse(date + "T10:00:00") + n * 60000, date, type, amount, account, note: "" },
        extra
      )
    );
  const spend = [
    ["groceries", 46.2],
    ["food", 18.5],
    ["transport", 3.25],
    ["bills", 120],
    ["shopping", 59.99],
    ["fun", 24],
    ["health", 12.4],
  ];
  for (let d = 0; d < 70; d++)
    spend.forEach(([cat, a], i) => (d + i) % 3 === 0 && add(ago(d), "expense", a, i % 2 ? "c" : "b", { cat }));
  add(ago(1), "income", 2450, "b", { cat: "income", note: "Salary" });
  add(ago(2), "transfer", 200, "b", { to: "c", feeId: "t" + (n + 2) });
  add(ago(2), "expense", 1.5, "b", { cat: "fees", feeOf: "t" + n });
  add(ago(4), "adjust", -12.5, "c", { note: "Balance fix" });
  add(ago(5), "loan", 300, "c", { dir: "out", loan: "L1", principal: true, due: ago(1) });
  add(ago(3), "loan", 1000, "c", { dir: "out", loan: "L1", principal: true, due: ago(-5) });
  add(ago(2), "loan", 100, "c", { dir: "in", loan: "L1" });
  add(ago(8), "loan", 2500, "s", { dir: "in", loan: "L2", principal: true, due: ago(-20) });
  return {
    v: 6,
    settings: {
      cur: "USD",
      week: 1,
      clock: "24",
      lastCheck: t,
      remind: { daily: true, time: "21:00", dues: true, dueTime: "09:00", check: true, checkTime: "08:00" },
      backup: { on: true, time: "23:00" },
      savedBackup: 1,
    },
    accounts: [
      { id: "b", name: "Everyday account", type: "bank", currency: "USD", opening: 3200 },
      { id: "c", name: "Cash", type: "cash", currency: "USD", opening: 240 },
      { id: "k", name: "Credit card", type: "card", currency: "USD", opening: -350 },
      { id: "s", name: "Savings abroad", type: "savings", currency: "EUR", opening: 12000 },
      { id: "o", name: "Old wallet", type: "cash", currency: "USD", opening: 0, archived: true },
    ],
    types: [{ id: "crypto", name: "Crypto" }],
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
      { id: "L2", kind: "borrow", person: "Sam", account: "s", date: ago(8), note: "Car", status: "open" },
      { id: "L3", kind: "lend", person: "", account: "b", date: ago(30), note: "", status: "open" },
    ],
    assets: [{ id: "a1", name: "Laptop", i: "laptop", c: "#5b6cff", value: 1400, currency: "USD" }],
  };
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  // the test day at noon, so no text depends on the time of day the suite runs
  await ctx.addInitScript(() => {
    const D = Date,
      d = new D(),
      noon = new D(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).getTime(),
      ms = noon - D.now();
    class NoonDate extends D {
      constructor(...a) {
        if (a.length) super(...a);
        else super(D.now() + ms);
      }
      static now() {
        return D.now() + ms;
      }
    }
    globalThis.Date = NoonDate;
    window.__native = {};
    const keep = k => j => (window.__native[k] = j);
    window.Android = {
      getColors: () => null,
      setBars() {},
      setReminders: keep("reminders"),
      setWidget: keep("widget"),
      setBackup: keep("backup"),
      setBackupData() {},
      takeActions: () => "[]",
      requestNotifications() {},
      saveFile() {},
      keepState() {},
      fontScale: () => 1,
      is24h: () => true,
      getVersion: () => "1.4.1",
      permsIntro: () => window.__perms === true,
      reminderHealth: () => JSON.stringify({ notif: false, battery: false, exact: false }),
      backupStatus: () =>
        JSON.stringify(
          window.__bs || { folder: "Phone storage › Documents", usable: true, last: new Date().setHours(9, 30, 0, 0) }
        ),
      openSetting() {},
      haptic() {},
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  const parts = [];
  const shot = async (label, open) => {
    await page.evaluate(() => {
      closeSheet();
      $("#pop").innerHTML = "";
      $("#snack").innerHTML = "";
      V.screen = "home";
      render();
    });
    if (open) await open();
    await page.waitForTimeout(60);
    parts.push("=== " + label + "\n" + (await page.evaluate(dump)));
  };
  const ev = (f, a) => () => page.evaluate(f, a);
  const click = sel => () => page.click(sel);

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await shot("welcome");
  await shot("welcome-currency", click('[data-act="pick-maincur"]'));
  const t = await page.evaluate(() => today());
  await page.evaluate(st => localStorage.setItem("tally:v1", JSON.stringify(st)), sampleState(t));
  await page.reload();
  await page.waitForTimeout(100);

  await shot("home");
  await shot(
    "home-check",
    ev(() => {
      S.settings.lastCheck = "";
      S.settings.remind.checkTime = "00:00";
      render();
    })
  );
  await page.evaluate(() => {
    S.settings.lastCheck = today();
    save();
  });
  await shot(
    "home-archived",
    ev(() => {
      S.accounts.forEach(a => (a.archived = true));
      render();
    })
  );
  await page.evaluate(() => S.accounts.forEach(a => (a.archived = a.id === "o")));
  for (const p of ["range", "month"])
    await shot(
      "home-" + p,
      ev(p => {
        V.period = p;
        V.anchor = today();
        V.rs = addDays(today(), -6);
        V.re = today();
        render();
      }, p)
    );
  await page.evaluate(() => {
    V.period = "day";
    V.anchor = today();
  });
  await shot(
    "home-yesterday",
    ev(() => ((V.anchor = addDays(today(), -1)), render()))
  );
  await page.evaluate(() => (V.anchor = today()));
  for (const s of ["assets", "liabs", "history", "settings"])
    await shot(
      s,
      ev(s => {
        V.screen = s;
        render();
      }, s)
    );
  await shot(
    "assets-all",
    ev(() => {
      V.showArchived = true;
      V.showCleared = true;
      V.screen = "assets";
      render();
    })
  );
  await page.evaluate(() => {
    V.showArchived = false;
    V.showCleared = false;
  });
  await shot(
    "history-select",
    ev(() => {
      V.screen = "history";
      render();
      V.sel = new Set(["t1", "t2"]);
      render();
    })
  );
  await page.evaluate(() => (V.sel = null));
  await shot(
    "settings-backup-error",
    ev(() => {
      window.__bs = { folder: "SD card", usable: true, last: 0, error: "Couldn't write to the folder" };
      V.screen = "settings";
      render();
    })
  );
  await shot(
    "settings-backup-lost",
    ev(() => {
      window.__bs = { folder: "", usable: false, last: 0 };
      V.screen = "settings";
      render();
    })
  );
  await shot(
    "settings-backup-off",
    ev(() => {
      window.__bs = null;
      S.settings.backup.on = false;
      S.settings.clock = "12";
      S.settings.week = 0;
      V.screen = "settings";
      render();
    })
  );
  await page.evaluate(() => {
    S.settings.backup.on = true;
    S.settings.clock = "24";
    S.settings.week = 1;
    save();
  });

  // sheets
  await shot(
    "spend",
    ev(() => txSheet(null, "expense", "groceries"))
  );
  await shot("spend-calc", async () => {
    await page.evaluate(() => txSheet(null, "expense", "groceries"));
    await page.click('#sheet [data-act="calc-toggle"]');
  });
  await shot(
    "income",
    ev(() => txSheet(null, "income", "income"))
  );
  await shot(
    "entry-edit",
    ev(() => txSheet("t1"))
  );
  await shot(
    "entry-fee",
    ev(() => txSheet(S.txns.find(x => x.feeOf).id))
  );
  await shot(
    "transfer",
    ev(() => trSheet())
  );
  await shot(
    "transfer-edit",
    ev(() => trSheet(S.txns.find(x => x.type === "transfer").id))
  );
  await shot("transfer-fee", async () => {
    await page.evaluate(() => trSheet());
    await page.click('#sheet [data-act="add-fee"]');
  });
  await shot(
    "adjust",
    ev(() => adjSheet(S.txns.find(x => x.type === "adjust").id))
  );
  await shot(
    "account",
    ev(() => accOpen("b"))
  );
  await shot(
    "account-savings",
    ev(() => accOpen("s"))
  );
  await shot(
    "account-form",
    ev(() => accForm("b"))
  );
  await shot(
    "account-new",
    ev(() => accForm())
  );
  await shot(
    "type-new",
    ev(() => (accForm(), typeDialog()))
  );
  await shot(
    "lend-form",
    ev(() => loanForm("lend"))
  );
  await shot(
    "borrow-form",
    ev(() => loanForm("borrow"))
  );
  await shot(
    "loan",
    ev(() => loanOpen("L1"))
  );
  await shot(
    "loan-pay",
    ev(() => loanOpen("L1", true))
  );
  await shot(
    "borrowed",
    ev(() => loanOpen("L2"))
  );
  await shot(
    "loan-noname",
    ev(() => loanOpen("L3"))
  );
  await shot("loan-fee", async () => {
    await page.evaluate(() => loanOpen("L1"));
    await page.click('#sheet [data-act="add-fee"]');
  });
  await shot(
    "draw-edit",
    ev(() => {
      loanOpen("L1");
      loanDrawEdit(S.txns.find(x => x.loan === "L1" && x.principal).id);
    })
  );
  for (const m of ["d", "w", "m"])
    await shot("summary-" + m, async () => {
      await page.evaluate(() => summarySheet());
      await page.click('#sheet [data-act="sm-mode"][data-v="' + m + '"]');
    });
  await shot(
    "entries",
    ev(() => entriesSheet())
  );
  await shot(
    "period",
    ev(() => periodDialog(V))
  );
  for (const tab of ["range", "month"])
    await shot("period-" + tab, async () => {
      await page.evaluate(() => periodDialog(V));
      await page.click('#pd [data-act="pd-tab"][data-v="' + tab + '"]');
    });
  await shot("date", async () => {
    await page.evaluate(() => txSheet(null, "expense", "groceries"));
    await page.click('#sheet [data-act="date-open"], #sheet .fieldbtn.date').catch(() => {});
  });
  await shot(
    "time",
    ev(() => timePicker("Evening nudge", "21:00", () => {}))
  );
  await shot(
    "time-12h",
    ev(() => {
      S.settings.clock = "12";
      timePicker("Evening nudge", "21:00", () => {});
    })
  );
  await page.evaluate(() => (S.settings.clock = "24"));
  await shot(
    "currency",
    ev(() => curPicker("USD", () => {}))
  );
  await shot("currency-none", async () => {
    await page.evaluate(() => curPicker("USD", () => {}));
    await page.fill("#cur-q", "zzz");
  });
  await shot(
    "icons",
    ev(() => iconPicker("star", "#5b6cff", () => {}))
  );
  await shot("icons-none", async () => {
    await page.evaluate(() => iconPicker("star", "#5b6cff", () => {}));
    await page.fill("#sheet2 input, #pop input", "zzzz").catch(() => {});
  });
  await shot(
    "category-form",
    ev(() => catForm("groceries", "out"))
  );
  await shot(
    "category-new",
    ev(() => catForm(null, "in"))
  );
  await shot(
    "colour-own",
    ev(() => (catForm("groceries", "out"), hexDialog()))
  );
  await shot(
    "asset-form",
    ev(() => assetForm("a1"))
  );
  await shot(
    "asset-new",
    ev(() => assetForm())
  );
  // dialogs
  await shot(
    "perms",
    ev(() => ((window.__perms = true), permsIntro()))
  );
  await shot(
    "wipe",
    ev(() => wipeAll())
  );
  await shot(
    "wipe-confirm",
    ev(() => wipeConfirm())
  );
  await shot(
    "nudge",
    ev(() => {
      S.settings.backup.on = false;
      S.settings.backupAsk = "";
      backupNudge();
    })
  );
  await shot(
    "nudge-lost",
    ev(() => {
      window.__bs = { folder: "", usable: false, last: 0 };
      S.settings.backup.on = true;
      S.settings.backupAsk = "";
      backupNudge();
    })
  );
  await page.evaluate(() => (window.__bs = null));
  await shot(
    "snack",
    ev(() => snack("All data deleted"))
  );

  // what the shell gets: notification texts and the widget's numbers
  await page.evaluate(() => {
    lastWidget = "";
    syncWidget();
    syncReminders();
  });
  parts.push("=== native\n" + JSON.stringify(await page.evaluate(() => window.__native), null, 1));

  const text = parts.join("\n") + "\n";
  if (process.env.SNAPSHOT_UPDATE) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, text);
    console.log("recorded " + FILE);
  } else {
    const want = fs.readFileSync(FILE, "utf8");
    if (text !== want) {
      const a = want.split("\n"),
        b = text.split("\n");
      const i = a.findIndex((l, k) => l !== b[k]);
      let label = "";
      for (let k = i; k >= 0; k--)
        if (a[k].startsWith("=== ")) {
          label = a[k];
          break;
        }
      console.log("first difference at line " + (i + 1) + " (" + label + "):\n  was: " + a[i] + "\n  now: " + b[i]);
    }
    ok(text === want, "English is unchanged on " + parts.length + " screens, sheets and dialogs");
  }
  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
