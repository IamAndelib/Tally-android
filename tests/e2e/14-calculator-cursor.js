const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("14-calculator-cursor");
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
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const settle = () => page.waitForTimeout(120);
  const type = async keys => {
    for (const k of keys) await page.click(`.calc [data-act="calc-key"][data-v="${k}"]`);
  };

  // clicks at the exact pixel of a character offset within the mirror's text, via Range.getClientRects —
  // exercises the real caretRangeFromPoint code path, not just the underlying JS function directly
  async function tapAtOffset(id, offset) {
    const rect = await page.evaluate(
      ({ id, offset }) => {
        const mirror = document.getElementById("cm-" + id);
        let acc = 0,
          node = null,
          localOffset = 0;
        for (const n of mirror.childNodes) {
          if (n.nodeType === 3) {
            if (offset <= acc + n.textContent.length) {
              node = n;
              localOffset = offset - acc;
              break;
            }
            acc += n.textContent.length;
          }
        }
        if (!node) {
          const last = [...mirror.childNodes].reverse().find(n => n.nodeType === 3);
          node = last || mirror.firstChild;
          localOffset = node && node.textContent ? node.textContent.length : 0;
        }
        const range = document.createRange();
        range.setStart(node, localOffset);
        range.setEnd(node, localOffset);
        const r = range.getClientRects()[0] || range.getBoundingClientRect();
        return { x: r.left, y: r.top + r.height / 2 };
      },
      { id, offset }
    );
    await page.mouse.click(rect.x, rect.y);
  }
  // moves the cursor to the very end, then backspaces until the field is empty — safe regardless of where
  // the cursor was left by a previous scenario (backspace only deletes what's *before* the cursor, correctly)
  async function clearAll(id) {
    const len = (await page.inputValue("#" + id)).length;
    await tapAtOffset(id, len);
    for (let i = 0; i < 20 && (await page.inputValue("#" + id)) !== ""; i++)
      await page.click(`.calc [data-act="calc-key"][data-v="⌫"]`);
  }
  await page.goto(appUrl);
  await page.evaluate(() =>
    localStorage.setItem(
      "tally:v1",
      JSON.stringify({
        v: 6,
        settings: { cur: "BDT" },
        accounts: [{ id: "w", name: "Wallet", type: "cash", currency: "BDT", opening: 5000 }],
        txns: [],
        loans: [],
        assets: [],
      })
    )
  );
  await page.reload();
  await settle();

  // ---- 1. tap within the value repositions the caret, and subsequent typing inserts there (not at the end)
  await page.click("#ring .cat");
  await settle();
  await act("calc-toggle", "f-amt");
  await settle();
  await type(["1", "2", "0", "3", "4", "5"]);
  ok((await page.inputValue("#f-amt")) === "120345", "typed 120345: " + (await page.inputValue("#f-amt")));
  await tapAtOffset("f-amt", 3); // between "120" and "345"
  await type(["9"]);
  ok(
    (await page.inputValue("#f-amt")) === "1209345",
    "tapping mid-value then typing 9 inserts there, not at the end: " + (await page.inputValue("#f-amt"))
  );

  // ---- 2. backspace at a repositioned cursor removes the char just before it, not the last char overall
  await type(["⌫"]);
  ok(
    (await page.inputValue("#f-amt")) === "120345",
    "backspace after the mid-insert removes that inserted digit, restoring 120345: " + (await page.inputValue("#f-amt"))
  );
  await tapAtOffset("f-amt", 3);
  await type(["⌫"]);
  ok(
    (await page.inputValue("#f-amt")) === "12345",
    'backspace with the cursor mid-string removes the char before it (the "0"), not the last char: ' +
      (await page.inputValue("#f-amt"))
  );

  // ---- 3. an operator inserted mid-string splits the expression there instead of appending
  await clearAll("f-amt");
  ok((await page.inputValue("#f-amt")) === "", "cleared back to empty");
  await type(["1", "2", "3", "4", "5"]);
  await tapAtOffset("f-amt", 3); // between "123" and "45"
  await type(["+"]);
  ok(
    (await page.inputValue("#f-amt")) === "123+45",
    "operator typed mid-string splits the expression there: " + (await page.inputValue("#f-amt"))
  );
  // tapping right after the operator and typing another operator still replaces it (not stacks), same as at the end
  await tapAtOffset("f-amt", 4);
  await type(["×"]);
  ok(
    (await page.inputValue("#f-amt")) === "123×45",
    "a second operator typed right after the first replaces it, mid-string too: " + (await page.inputValue("#f-amt"))
  );

  // ---- 4. decimal point still respects the number segment under the (possibly repositioned) cursor
  await clearAll("f-amt");
  await type(["1", ".", "2", "+", "3"]);
  ok((await page.inputValue("#f-amt")) === "1.2+3", "built 1.2+3: " + (await page.inputValue("#f-amt")));
  await tapAtOffset("f-amt", 1); // inside "1.2", right after the "1" — that segment already has a dot
  await type(["."]);
  ok(
    (await page.inputValue("#f-amt")) === "1.2+3",
    'a second "." inside a segment that already has one is ignored: ' + (await page.inputValue("#f-amt"))
  );
  await tapAtOffset("f-amt", 5); // end, inside "3" — a different number segment, no dot yet
  await type(["."]);
  ok(
    (await page.inputValue("#f-amt")) === "1.2+3.",
    'a "." in a different, dot-free segment is still allowed: ' + (await page.inputValue("#f-amt"))
  );

  // ---- 5. tapping past the end of the text still places the cursor at the end (append keeps working)
  await clearAll("f-amt");
  await type(["7", "7"]);
  const box = await page.evaluate(() => document.getElementById("cm-f-amt").getBoundingClientRect());
  await page.mouse.click(box.right - 2, box.top + box.height / 2);
  await type(["8"]);
  ok(
    (await page.inputValue("#f-amt")) === "778",
    "tapping past the end still appends at the end: " + (await page.inputValue("#f-amt"))
  );

  await page.screenshot({ path: OUT + "/calc-cursor.png" });
  await act("calc-toggle", "f-amt");
  await settle();
  ok(
    (await page.inputValue("#f-amt")) === "778",
    "closing evaluates the final expression correctly: " + (await page.inputValue("#f-amt"))
  );
  await act("close");

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
