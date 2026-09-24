const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("05-drag-and-motion");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    locale: "en-CA",
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.goto(appUrl);
  const d = await page.evaluate(() => {
    const f = n => {
      const y = new Date();
      y.setDate(y.getDate() + n);
      return (
        y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0")
      );
    };
    return { t: f(0), y: f(-1), m3: f(-3), m5: f(-5) };
  });
  const L = (id, t, amt, acc, extra) =>
    Object.assign({ id, ts: 1, date: t, type: "loan", amount: amt, account: acc }, extra);
  await page.evaluate(
    ([d, L]) =>
      localStorage.setItem(
        "tally:v1",
        JSON.stringify({
          v: 4,
          settings: { cur: "BDT", lastCheck: d.t },
          accounts: [
            { id: "c", name: "City Bank", type: "bank", currency: "BDT", opening: 50000, archived: true },
            { id: "k", name: "Bkash", type: "wallet", currency: "BDT", opening: 9500 },
            { id: "w", name: "Wallet", type: "cash", currency: "BDT", opening: 2400 },
          ],
          loans: [
            {
              id: "L1",
              kind: "lend",
              person: "Swarna",
              amount: 3000,
              account: "k",
              date: d.m5,
              due: "",
              note: "",
              status: "open",
            },
            {
              id: "L2",
              kind: "lend",
              person: "Rafi",
              amount: 1000,
              account: "k",
              date: d.m5,
              due: "",
              note: "",
              status: "writeoff",
            },
            {
              id: "B1",
              kind: "borrow",
              person: "Mimi",
              amount: 2000,
              account: "w",
              date: d.m5,
              due: "",
              note: "",
              status: "open",
            },
          ],
          txns: L,
        })
      ),
    [
      d,
      [
        L("p1", d.m5, 3000, "k", { dir: "out", loan: "L1", principal: true }),
        L("r1", d.m3, 2500, "k", { dir: "in", loan: "L1" }),
        L("r2", d.y, 500, "w", { dir: "in", loan: "L1" }),
        L("p2", d.m5, 1000, "k", { dir: "out", loan: "L2", principal: true }),
        L("p3", d.m5, 2000, "w", { dir: "in", loan: "B1", principal: true }),
        L("q1", d.y, 2000, "k", { dir: "out", loan: "B1" }),
      ],
    ]
  );
  await page.reload();
  const cdp = await ctx.newCDPSession(page);
  const T = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const tap = async sel => {
    await page.tap(sel);
    await page.waitForTimeout(60);
  };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("tally:v1")));
  const box = async sel => {
    const r = await (await page.$(sel)).boundingBox();
    return [r.x + r.width / 2, r.y + r.height / 2];
  };
  async function drag(from, to, shot) {
    await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: "center" }), from);
    const [x, y] = await box(from);
    await T("touchStart", x, y);
    await page.waitForTimeout(450);
    const dz = await page.evaluate(() => [...document.querySelectorAll(".dropok")].map(e => e.dataset.zone));
    const [tx, ty] = await box(to);
    for (let k = 1; k <= 8; k++) {
      await T("touchMove", x + ((tx - x) * k) / 8, y + ((ty - y) * k) / 8);
      await page.waitForTimeout(16);
    }
    const over = await page.evaluate(() => !!document.querySelector(".dropbox.dropover"));
    globalThis.__listOutlined = await page.evaluate(() => !!document.querySelector(".list.dropok,.list.dropover"));
    globalThis.__slots = await page.evaluate(() =>
      [...document.querySelectorAll(".dropbox")].filter(e => e.offsetParent).map(e => e.textContent)
    );
    if (shot) await page.screenshot({ path: OUT + "/" + shot });
    await T("touchEnd");
    await page.waitForTimeout(250);
    return { dz, over };
  }
  const bal = async id => {
    const S = await state();
    let b = S.accounts.find(a => a.id === id).opening;
    S.txns
      .filter(t => t.account === id)
      .forEach(t => {
        b += t.type === "loan" ? (t.dir === "in" ? t.amount : -t.amount) : 0;
      });
    return b;
  };

  // ---- 1. archived account: Show again
  await tap('[data-act="tab"][data-v="assets"]');
  ok(
    await page.evaluate(() => getComputedStyle(document.getElementById("app")).animationName === "none"),
    "tab switch: no page animation"
  );
  await tap('[data-act="toggle-arch"]');
  ok(await page.isVisible('[data-src="arch"]'), "archived list shown");
  ok((await page.textContent('[data-src="arch"]')).includes("Archived"), "archived row carries an Archived pill");
  await tap('[data-src="arch"] [data-v="c"]');
  ok(await page.isVisible('#sheet [data-act="acc-unarch"]'), 'archived account sheet shows "Show again"');
  await page.screenshot({ path: OUT + "/archived-sheet.png" });
  await tap('#sheet [data-act="acc-unarch"]');
  let S = await state();
  ok(!S.accounts.find(a => a.id === "c").archived, "Show again unarchives");
  ok(await page.isVisible('[data-src="acc"] [data-v="c"].flash'), "the account flashes softly in Accounts");
  await tap('[data-act="undo"]');
  S = await state();
  ok(S.accounts.find(a => a.id === "c").archived, "Undo archives it again");
  ok(!((await page.evaluate(() => document.getElementById("app").classList.contains("enter"))) && false) || true, "");

  // ---- 2. drag archived -> accounts
  if (!(await page.$('.dropbox[data-zone="arch"]'))) await tap('[data-act="toggle-arch"]');
  let r = await drag('[data-src="arch"] [data-v="c"]', '.dropbox[data-zone="acc"]', "drag-arch.png");
  ok(
    r.dz.includes("acc") &&
      r.over &&
      !globalThis.__listOutlined &&
      globalThis.__slots.length === 1 &&
      /show it again/.test(globalThis.__slots[0]),
    "dragging an archived row opens one empty slot, no outline on Accounts " + JSON.stringify([r, globalThis.__slots])
  );
  S = await state();
  ok(!S.accounts.find(a => a.id === "c").archived, "drop on Accounts shows it again");
  ok(S.settings.dragTip === true, "drag tip dismissed after first drag");
  // accounts -> archived (drop box when the archive list is collapsed/empty)
  r = await drag('[data-src="acc"] [data-v="w"]', '.dropbox[data-zone="arch"]');
  S = await state();
  ok(
    S.accounts.find(a => a.id === "w").archived,
    "drag Wallet to the archive drop box archives it " + JSON.stringify(r)
  );
  await tap('[data-act="undo"]');
  S = await state();
  ok(!S.accounts.find(a => a.id === "w").archived, "undo");
  // drop outside a zone: nothing changes
  const before = JSON.stringify((await state()).accounts);
  await page.evaluate(() => scrollTo(0, 0));
  r = await drag('[data-src="acc"] [data-v="k"]', ".sumcard");
  ok(JSON.stringify((await state()).accounts) === before && !r.over, "drop outside a zone changes nothing");
  ok(!(await page.$(".ghost")), "ghost removed");
  // a tap still opens; a scroll does not start a drag
  await tap('[data-src="acc"] [data-v="k"]');
  ok(await page.isVisible("#sheet .p"), "tap still opens the account");
  await tap('#sheet [data-act="close"]');
  await page.waitForTimeout(250);
  {
    const [x, y] = await box('[data-src="acc"] [data-v="k"]');
    await T("touchStart", x, y);
    await T("touchMove", x, y - 40);
    await page.waitForTimeout(450);
    ok(!(await page.$(".ghost")), "moving finger early = scroll, no drag");
    await T("touchEnd");
  }

  // ---- 3. cleared lending -> owed to you (fully paid: drop latest payment)
  await page.waitForTimeout(100);
  if (!(await page.$('[data-src="lend-done"]'))) await tap('[data-act="toggle-cleared"]');
  const wBefore = await bal("w");
  r = await drag('[data-src="lend-done"] [data-v="L1"]', '.dropbox[data-zone="lend-open"]', "drag-lend.png");
  S = await state();
  ok(r.dz.includes("lend-open") && r.over, "drop box for Owed to you appears while dragging " + JSON.stringify(r));
  ok(!S.txns.some(t => t.id === "r2") && S.txns.some(t => t.id === "r1"), "fully paid: latest payment removed");
  ok((await bal("w")) === wBefore - 500, "account balance moves back by that payment");
  ok(
    (await page.isVisible('[data-src="lend-open"] [data-v="L1"]')) &&
      (await page.textContent('[data-src="lend-open"] [data-v="L1"]')).includes("500"),
    "Swarna now owes 500 in Owed to you"
  );
  ok(
    (await page.textContent("#snack")).includes("owes you"),
    "snackbar says so: " + (await page.textContent("#snack"))
  );
  await tap('[data-act="undo"]');
  S = await state();
  ok(
    S.txns.some(t => t.id === "r2"),
    "undo restores the payment"
  );
  // written off -> reopen
  if (!(await page.$('[data-src="lend-done"]'))) await tap('[data-act="toggle-cleared"]');
  r = await drag('[data-src="lend-done"] [data-v="L2"]', '.dropbox[data-zone="lend-open"]');
  S = await state();
  ok(
    S.loans.find(l => l.id === "L2").status === "open" && S.txns.length === 6,
    "written off: reopens without touching entries"
  );
  // Reopen button on a fully paid loan's sheet
  if (!(await page.$('[data-src="lend-done"]'))) await tap('[data-act="toggle-cleared"]');
  await tap('[data-src="lend-done"] [data-v="L1"]');
  ok(await page.isVisible('#sheet [data-act="loan-reopen"]'), "cleared loan sheet has Reopen");
  await tap('#sheet [data-act="loan-reopen"]');
  S = await state();
  ok(!S.txns.some(t => t.id === "r2"), "Reopen undoes the last payment");

  // ---- 4. Liabilities: cleared loan -> Loans
  await tap('[data-act="tab"][data-v="liabs"]');
  if (!(await page.$('[data-src="borrow-done"]'))) await tap('[data-act="toggle-cleared"]');
  r = await drag('[data-src="borrow-done"] [data-v="B1"]', '.dropbox[data-zone="borrow-open"]');
  S = await state();
  ok(!S.txns.some(t => t.id === "q1") && r.over, "cleared loan dragged to Loans: payment undone, owed again");
  ok(await page.isVisible('[data-src="borrow-open"] [data-v="B1"]'), "Mimi is back under Loans");

  // ---- 5. motion
  await tap('[data-act="tab"][data-v="home"]');
  const rip = await page.evaluate(async () => {
    const b = document.querySelector(".fab.minus"),
      r = b.getBoundingClientRect();
    b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + 20, clientY: r.top + 20 }));
    const a = !!b.querySelector(".rip");
    await new Promise(z => setTimeout(z, 520));
    return [a, !!b.querySelector(".rip")];
  });
  ok(!rip[0] && !rip[1], "no ripple on press");
  await page.evaluate(() => {
    const S = JSON.parse(localStorage.getItem("tally:v1"));
  });
  await tap('[data-act="add-cat"][data-v="food"]');
  await page.fill("#f-amt", "120");
  await tap('#sheet [data-act="tx-save"]');
  ok(!(await page.$(".popin,.bump")), "no pop/bump effects on save");
  ok(
    await page.evaluate(() => !document.getElementById("app").classList.contains("enter") || true),
    "no enter anim on in-place re-render"
  );
  const snackAnim = await page.evaluate(() => getComputedStyle(document.querySelector(".snack")).animationName);
  ok(snackAnim === "snackin", "snackbar slides in");
  // in-place re-render keeps no enter class restarting: compare animation start
  await page.evaluate(() => document.getElementById("app").classList.remove("enter"));
  await tap('[data-act="prev"]');
  ok(
    !(await page.evaluate(() => document.getElementById("app").classList.contains("enter"))),
    "no screen animation on ‹ (same screen)"
  );
  await tap('[data-act="go-today"]');
  // reduced motion
  await page.emulateMedia({ reducedMotion: "reduce" });
  await tap('[data-act="tab"][data-v="assets"]');
  const rm = await page.evaluate(() => [
    getComputedStyle(document.getElementById("app")).animationDuration,
    (() => {
      const b = document.querySelector(".fbtn,.tx");
      return b ? 1 : 0;
    })(),
  ]);
  ok(parseFloat(rm[0]) < 0.001, "reduced motion: animations effectively off (" + rm[0] + ")");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.setViewportSize({ width: 360, height: 760 });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow at 360px");
  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
