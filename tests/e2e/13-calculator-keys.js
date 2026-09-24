const { chromium, appUrl, launchOptions, outDir } = require('./harness');
const OUT = outDir('13-calculator-keys');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'en-CA' });
  await ctx.addInitScript(() => {
    window.Android = { setReminders() {}, requestNotifications() {}, takeActions() { return '[]'; }, getColors() { return null; }, setBars() {}, saveFile() {} };
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const settle = () => page.waitForTimeout(150);

  await page.goto(appUrl);
  await page.evaluate(() => localStorage.setItem('tally:v1', JSON.stringify({ v: 6, settings: { cur: 'BDT' },
    accounts: [{ id: 'w', name: 'Wallet', type: 'cash', currency: 'BDT', opening: 5000 }], txns: [], loans: [], assets: [] })));
  await page.reload(); await settle();

  // ---- 1. minus button matches the other operators' colour (class "op", not "mut"/none)
  await page.click('#ring .cat'); await settle();
  await act('calc-toggle', 'f-amt'); await settle();
  const keyClasses = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.calc [data-act="calc-key"]')].map(b => [b.dataset.v, b.className])));
  ok(keyClasses['−'] === 'op', 'minus is classed "op" like the other operators, got "' + keyClasses['−'] + '"');
  const opColors = await page.evaluate(() => ['+', '×', '÷', '−'].map(v => getComputedStyle([...document.querySelectorAll('.calc [data-act="calc-key"]')].find(b => b.dataset.v === v)).color));
  ok(new Set(opColors).size === 1, 'all four operator keys (+ × ÷ −) render the exact same colour: ' + JSON.stringify(opColors));

  // ---- 2. backspace gets a red accent
  ok(keyClasses['⌫'] === 'del', 'backspace is classed "del", got "' + keyClasses['⌫'] + '"');
  const colorOf = v => page.evaluate(v => getComputedStyle([...document.querySelectorAll('.calc [data-act="calc-key"]')].find(b => b.dataset.v === v)).color, v);
  const delColor = await colorOf('⌫');
  const digitColor = await colorOf('7');
  ok(delColor !== digitColor, 'backspace colour differs from the neutral digit keys: del=' + delColor + ' digit=' + digitColor);
  ok(delColor !== opColors[0], 'backspace colour differs from the operator keys too: ' + delColor + ' vs ' + opColors[0]);
  await page.screenshot({ path: OUT + '/calc-colors.png' });

  // ---- 3. the OP-detection regex now recognises the actual minus glyph (−), so it replaces a trailing
  //         operator instead of stacking two when minus is involved
  for (const k of ['5', '−']) await page.click(`#calc-f-amt [data-act="calc-key"][data-v="${k}"]`);
  let expr = await page.inputValue('#f-amt');
  ok(expr === '5−', 'typed 5 then minus: "' + expr + '"');
  await page.click('#calc-f-amt [data-act="calc-key"][data-v="+"]');
  expr = await page.inputValue('#f-amt');
  ok(expr === '5+', 'tapping + right after − replaces it instead of stacking (5− -> 5+), got "' + expr + '"');
  // clear back to empty for the next checks
  for (let i = 0; i < 5; i++) await page.click('#calc-f-amt [data-act="calc-key"][data-v="⌫"]');

  // ---- 4. synthetic caret mirror shows while the calculator is open, and hides again once closed
  const midState = await page.evaluate(() => {
    const inp = document.getElementById('f-amt'), box = inp.closest('.amtbox'), mirror = document.getElementById('cm-f-amt');
    return { calcing: box.classList.contains('calcing'), mirrorHidden: mirror.hidden, mirrorHasBlink: !!mirror.querySelector('.blink'), inputColor: getComputedStyle(inp).color };
  });
  ok(midState.calcing, '.amtbox has the "calcing" class while the calculator is open');
  ok(!midState.mirrorHidden, 'the caret-mirror element is visible while the calculator is open');
  ok(midState.mirrorHasBlink, 'the mirror includes a blinking caret span');
  ok(midState.inputColor === 'rgba(0, 0, 0, 0)' || midState.inputColor === 'transparent', 'the real input\'s text is made transparent so only the mirror shows: ' + midState.inputColor);
  for (const k of ['1', '2']) await page.click(`#calc-f-amt [data-act="calc-key"][data-v="${k}"]`);
  const mirrorText = await page.evaluate(() => document.getElementById('cm-f-amt').textContent.trim());
  ok(mirrorText === '12', 'the mirror text tracks each keystroke live: "' + mirrorText + '"');
  await page.screenshot({ path: OUT + '/calc-caret-mirror.png' });

  await act('calc-toggle', 'f-amt'); await settle();
  const afterState = await page.evaluate(() => {
    const inp = document.getElementById('f-amt'), box = inp.closest('.amtbox'), mirror = document.getElementById('cm-f-amt');
    return { calcing: box.classList.contains('calcing'), mirrorHidden: mirror.hidden, inputColor: getComputedStyle(inp).color };
  });
  ok(!afterState.calcing, '.amtbox loses "calcing" once the calculator closes');
  ok(afterState.mirrorHidden, 'the mirror hides again once the calculator closes');
  ok(afterState.inputColor !== 'rgba(0, 0, 0, 0)' && afterState.inputColor !== 'transparent', 'the real input\'s text is visible again after closing: ' + afterState.inputColor);
  ok(await page.inputValue('#f-amt') === '12', 'the applied result (12) is in the field');
  await act('close');

  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
