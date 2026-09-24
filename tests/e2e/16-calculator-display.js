// Round 20 calculator polish: a more visible calculator button, a display that scrolls with the caret, a caret that can
// be held and dragged, bigger operator keys, and a keypad top bar with the live result and a switch to the keyboard.
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("16-calculator-display");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const dark of [false, true]) {
    const ctx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 2,
      locale: "en-CA",
      colorScheme: dark ? "dark" : "light",
    });
    await ctx.addInitScript(() => {
      window.Android = {
        setReminders() {},
        requestNotifications() {},
        takeActions() {
          return "[]";
        },
        getColors() {
          return null;
        },
        setBars() {},
        saveFile() {},
      };
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const settle = () => page.waitForTimeout(150);
    const key = k => page.click(`.calc [data-act="calc-key"][data-v="${k}"]`);
    const type = async s => {
      for (const k of s) await key(k);
    };
    const pos = () => page.evaluate(() => (CALC ? CALC.pos : null));
    const tag = dark ? " (dark)" : "";

    await page.goto(appUrl);
    await page.evaluate(() =>
      localStorage.setItem(
        "tally:v1",
        JSON.stringify({
          v: 6,
          settings: { cur: "BDT" },
          accounts: [{ id: "w", name: "Wallet", type: "cash", currency: "BDT", opening: 50000 }],
          txns: [],
          loans: [],
          assets: [],
        })
      )
    );
    await page.reload();
    await settle();
    await page.click("#ring .cat");
    await settle();

    // ---- 1. the calculator button is bigger and coloured
    const btn = await page.evaluate(() => {
      const b = document.querySelector('[data-act="calc-toggle"][data-v="f-amt"]'),
        r = b.getBoundingClientRect(),
        cs = getComputedStyle(b);
      return { w: r.width, h: r.height, bg: cs.backgroundColor };
    });
    ok(btn.w >= 44 && btn.h >= 44, "calculator button is at least 44px: " + btn.w + "x" + btn.h + tag);
    ok(btn.bg !== "rgba(0, 0, 0, 0)", "calculator button has a tonal background: " + btn.bg + tag);
    await page.screenshot({ path: OUT + "/closed" + (dark ? "-dark" : "") + ".png" });

    await page.click('[data-act="calc-toggle"][data-v="f-amt"]');
    await settle();

    // ---- 2. keypad: bigger operators, top bar with result + keyboard button, own button off the amount line
    const sizes = await page.evaluate(() => ({
      op: parseFloat(getComputedStyle(document.querySelector('.calc [data-v="+"]')).fontSize),
      digit: parseFloat(getComputedStyle(document.querySelector('.calc [data-v="7"]')).fontSize),
      keyH: document.querySelector('.calc [data-v="7"]').getBoundingClientRect().height,
    }));
    ok(sizes.op > sizes.digit * 1.3, "operator keys are clearly larger than digits: " + JSON.stringify(sizes) + tag);
    ok(sizes.keyH >= 55, "keys keep their height: " + sizes.keyH + tag);
    ok(
      await page.isHidden('[data-act="calc-toggle"][data-v="f-amt"]'),
      "the calculator button leaves the amount line" + tag
    );
    ok(await page.isVisible('#calc-f-amt [data-act="calc-kbd"]'), "the keypad has a keyboard button" + tag);

    await type(["6", "5", "0", "+", "5", "8", "9", "3", "+", "6", "5", "3"]);
    ok(
      (await page.textContent("#cr-f-amt")) === "= 7,196",
      "live result: " + (await page.textContent("#cr-f-amt")) + tag
    );

    // ---- 3. a long expression scrolls; the caret stays in view
    await type(["×", "1", "2", "3", "4", "5", "6", "+", "9", "8", "7", "6", "5"]);
    const view = () =>
      page.evaluate(() => {
        const m = document.getElementById("cm-f-amt"),
          c = m.querySelector(".blink"),
          mr = m.getBoundingClientRect(),
          cr = c.getBoundingClientRect();
        return {
          sw: m.scrollWidth,
          cw: m.clientWidth,
          sl: m.scrollLeft,
          cl: cr.left,
          cr: cr.right,
          ml: mr.left,
          mr: mr.right,
        };
      });
    let v = await view();
    ok(
      v.sw > v.cw && v.sl > 0,
      "the display scrolls once the expression is wider than the field: " + JSON.stringify(v) + tag
    );
    ok(v.cr <= v.mr && v.cl >= v.ml, "the caret at the end stays visible" + tag);
    await page.screenshot({ path: OUT + "/long" + (dark ? "-dark" : "") + ".png" });

    // tap at the very start after scrolling back: caret goes there and stays visible
    await page.evaluate(() => (document.getElementById("cm-f-amt").scrollLeft = 0));
    const first = await page.evaluate(() => {
      const m = document.getElementById("cm-f-amt"),
        n = m.firstChild,
        r = document.createRange();
      r.setStart(n, 1);
      r.setEnd(n, 1);
      const rr = r.getClientRects()[0];
      return { x: rr.left, y: rr.top + rr.height / 2 };
    });
    await page.mouse.click(first.x, first.y);
    await settle();
    ok((await pos()) === 1, "tapping after the first digit puts the caret there: " + (await pos()) + tag);
    v = await view();
    ok(v.cl >= v.ml && v.cr <= v.mr, "and the caret is on screen" + tag);

    // ---- 4. hold and drag the caret
    const valueBefore = await page.inputValue("#f-amt");
    const c = await page.evaluate(() => {
      const r = document.querySelector("#cm-f-amt .blink").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let dx = 10; dx <= 150; dx += 10) await page.mouse.move(c.x + dx, c.y);
    await page.mouse.up();
    await settle();
    const dragged = await pos();
    ok(dragged > 3, "dragging the caret to the right moves it: pos " + dragged + tag);
    ok((await page.inputValue("#f-amt")) === valueBefore, "dragging doesn't change the expression" + tag);

    // dragging to the right edge keeps scrolling the display and moving the caret
    const edge = await page.evaluate(() => {
      const m = document.getElementById("cm-f-amt"),
        r = m.getBoundingClientRect(),
        c2 = m.querySelector(".blink").getBoundingClientRect();
      return { x: c2.left + 1, y: r.top + r.height / 2, right: r.right };
    });
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();
    await page.mouse.move(edge.right - 20, edge.y, { steps: 5 });
    for (let i = 0; i < 40; i++) await page.mouse.move(edge.right - 10 + (i % 2), edge.y);
    await page.mouse.up();
    await settle();
    const len = valueBefore.length;
    ok(
      (await pos()) === len,
      "holding at the right edge scrolls to the end: pos " + (await pos()) + " of " + len + tag
    );

    // ---- 5. keyboard button: applies the result, closes the calculator, opens the system keyboard
    await page.click('#calc-f-amt [data-act="calc-kbd"]');
    await settle();
    const after = await page.evaluate(() => {
      const i = document.getElementById("f-amt");
      return {
        value: i.value,
        focused: document.activeElement === i,
        readOnly: i.readOnly,
        mode: i.getAttribute("inputmode"),
        panel: document.getElementById("calc-f-amt").hidden,
        pad: i.closest(".p").style.paddingBottom,
        btn: getComputedStyle(document.querySelector('[data-act="calc-toggle"][data-v="f-amt"]')).display,
      };
    });
    ok(after.value === String(650 + 5893 + 653 * 123456 + 98765), "the result is applied: " + after.value + tag);
    ok(
      after.panel && after.focused && !after.readOnly && after.mode === "decimal",
      "keyboard mode: " + JSON.stringify(after) + tag
    );
    ok(after.pad === "" && after.btn !== "none", "the sheet and the calculator button are back to normal" + tag);

    ok(errors.length === 0, "no page errors: " + JSON.stringify(errors) + tag);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = fails ? 1 : 0;
})();
