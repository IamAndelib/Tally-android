const { chromium, appUrl, launchOptions, outDir } = require('./harness');
const OUT = outDir('06-types-and-colours');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'en-CA', hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let dialogs = 0; page.on('dialog', d => { dialogs++; d.accept(); });
  await page.goto(appUrl);
  const t = await page.evaluate(() => { const x = new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); });
  await page.evaluate(t => localStorage.setItem('tally:v1', JSON.stringify({ v: 4, settings: { cur: 'CAD', lastCheck: t },
    accounts: [{ id: 'k', name: 'Bkash', type: 'wallet', currency: 'CAD', opening: 5000 }, { id: 'w', name: 'Wallet', type: 'cash', currency: 'CAD', opening: 200 }],
    txns: [{ id: 'e1', ts: 1, date: t, type: 'expense', amount: 12, account: 'w', cat: 'food', note: '' }] })), t);
  await page.reload();
  const cdp = await ctx.newCDPSession(page);
  const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const tap = async sel => { await page.tap(sel); await page.waitForTimeout(80); };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('tally:v1')));
  const box = async sel => (await (await page.$(sel)).boundingBox());

  // ---- 1. motion: calm
  const pressed = async sel => { const b = await box(sel); const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await T('touchStart', x, y); await page.waitForTimeout(120);
    const r = await page.evaluate(s => { const e = document.querySelector(s); return { tr: getComputedStyle(e).transform, layer: +getComputedStyle(e, '::before').opacity, rip: !!e.querySelector('.rip') }; }, sel);
    await T('touchMove', x, y + 30); await T('touchEnd'); await page.waitForTimeout(80); return r; };
  for (const sel of ['.fab.minus', '.balbar', '.fbtn.loan']) { const r = await pressed(sel); ok(r.tr === 'none' && !r.rip && r.layer > 0.05, sel + ': subtle state layer only while pressed ' + JSON.stringify(r)); }
  await tap('[data-act="tab"][data-v="assets"]');
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('app')).animationName === 'none'), 'no page animation on tab switch');
  { const r = await pressed('[data-src="acc"] .tx'); ok(r.tr === 'none', 'row: no scale while pressed'); }
  await tap('[data-act="tab"][data-v="home"]');

  // ---- 2. calendar taps (touch)
  let okDay = 0;
  for (let k = 0; k < 20; k++) {
    await tap('.pnav .plabel'); await page.waitForSelector('#pd');
    if (k === 0) await tap('#pd [data-act="pd-tab"][data-v="day"]');
    const days = await page.$$eval('#pd [data-act="pd-day"]:not(.other):not([disabled])', x => x.map(e => e.dataset.v));
    const want = days[k % Math.max(1, days.length - 1)];
    await tap(`#pd [data-act="pd-day"][data-v="${want}"]`);
    if (!(await page.$('#pd'))) okDay++; else await tap('#pd [data-act="pd-close"]');
  }
  ok(okDay === 20, 'Day taps register every time (' + okDay + '/20)');
  // Range: a tap that jitters 4px across the cell edge stays a tap
  await tap('.pnav .plabel'); await tap('#pd [data-act="pd-tab"][data-v="range"]');
  const rdays = await page.$$eval('#pd [data-act="pd-rday"]:not(.other):not([disabled])', x => x.map(e => e.dataset.v));
  const a = rdays[1], bday = rdays[Math.min(5, rdays.length - 1)];
  const ba = await box(`#pd [data-act="pd-rday"][data-v="${a}"]`);
  await T('touchStart', ba.x + ba.width - 2, ba.y + ba.height / 2); await T('touchMove', ba.x + ba.width + 2, ba.y + ba.height / 2); await T('touchEnd'); await page.waitForTimeout(150);
  ok((await page.textContent('#pd-hint')).includes('end day'), 'jittery tap starts the range (asks for the end day)');
  await tap(`#pd [data-act="pd-rday"][data-v="${bday}"]`);
  ok(!(await page.$('#pd')) && (await page.textContent('.pnav .plabel')).includes('–'), 'second tap picks the end: ' + await page.textContent('.pnav .plabel'));
  // a real drag still works
  await tap('.pnav .plabel'); await tap('#pd [data-act="pd-tab"][data-v="range"]');
  { const p1 = await box(`#pd [data-act="pd-rday"][data-v="${rdays[0]}"]`), p2 = await box(`#pd [data-act="pd-rday"][data-v="${rdays[Math.min(3, rdays.length - 1)]}"]`);
    const x1 = p1.x + p1.width / 2, y1 = p1.y + p1.height / 2, x2 = p2.x + p2.width / 2, y2 = p2.y + p2.height / 2;
    await T('touchStart', x1, y1); for (let k = 1; k <= 6; k++) { await T('touchMove', x1 + (x2 - x1) * k / 6, y1 + (y2 - y1) * k / 6); await page.waitForTimeout(16); } await T('touchEnd'); await page.waitForTimeout(150);
    ok(!(await page.$('#pd')) && (await page.textContent('.pnav .plabel')).includes('–'), 'dragging across days picks a range'); }
  await tap('[data-act="go-today"]');

  // ---- 3. custom account type
  await tap('[data-act="tab"][data-v="assets"]');
  await tap('[data-act="acc-form"]');
  ok(await page.isVisible('#sheet .chip.addnew'), 'Type chips end with "+ Add new"');
  await tap('#sheet [data-act="type-new"]'); await page.waitForTimeout(100);
  await page.fill('#nt-name', 'Crypto'); await page.screenshot({ path: OUT + '/type-dialog.png' }); await tap('[data-act="nt-add"]');
  const sel = await page.$eval('#sheet .chip[aria-pressed="true"][data-act="f-type"]', e => e.textContent);
  ok(sel.includes('Crypto'), 'new type is added and selected: ' + sel);
  await page.fill('#f-name', 'Binance'); await page.fill('#f-open', '300');
  await page.evaluate(() => document.querySelector('#sheet .chips#f-types').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: OUT + '/types.png' });
  await tap('#sheet [data-act="acc-save"]');
  let S = await state(); const cr = S.types.find(x => x.name === 'Crypto'), bn = S.accounts.find(x => x.name === 'Binance');
  ok(cr && bn && bn.type === cr.id && S.v === 6, 'account saved with the custom type (v6)');
  ok((await page.textContent(`[data-v="${bn.id}"]`)).includes('Crypto'), 'row shows the type name');
  await page.reload(); S = await state(); ok(S.types.some(x => x.id === cr.id) && S.accounts.find(x => x.id === bn.id).type === cr.id, 'type survives a reload (migrate)');
  // hold to remove: refused when used, allowed when not
  await tap('[data-act="acc-form"]');
  const hold = async sel => { const b = await box(sel); await T('touchStart', b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(650); await T('touchEnd'); await page.waitForTimeout(150); };
  await hold(`#sheet .chip[data-v="${cr.id}"]`);
  ok((await page.textContent('#snack')).includes('used by 1'), 'a used type cannot be removed: ' + await page.textContent('#snack'));
  await tap('#sheet [data-act="type-new"]'); await page.fill('#nt-name', 'Temp'); await tap('[data-act="nt-add"]');
  const tmp = (await state()).types.find(x => x.name === 'Temp');
  await hold(`#sheet .chip[data-v="${tmp.id}"]`);
  ok(await page.isVisible('#pop .dialog [data-act="ask-ok"]'), 'Material confirm dialog (not the browser one)');
  await page.screenshot({ path: OUT + '/remove-type.png' });
  await tap('#pop [data-act="ask-ok"]');
  S = await state(); ok(!S.types.some(x => x.id === tmp.id) && !(await page.$(`#sheet .chip[data-v="${tmp.id}"]`)) && dialogs === 0, 'an unused type is removed after confirming (no browser dialog)');
  await tap('#sheet [data-act="close"]');

  // ---- 4. custom hex colour
  await tap('[data-act="go"][data-v="settings"]');
  await tap('.ring.edit .tile[data-v="groceries"]');
  ok(await page.isVisible('#sheet .dot.addnew'), 'colour dots end with "+"');
  await tap('#sheet [data-act="col-new"]'); await page.fill('#hx-in', 'zzz'); await tap('[data-act="hx-ok"]');
  ok(await page.isVisible('#hx-in') && (await page.textContent('#hx-err')).includes('hex'), 'invalid code rejected');
  await page.fill('#hx-in', '#12a'); await page.waitForTimeout(50);
  ok((await page.$eval('#hx-prev .emb', e => e.style.background)).includes('17, 34, 170'), 'live preview in #1122aa');
  await page.screenshot({ path: OUT + '/hex-dialog.png' });
  await tap('[data-act="hx-ok"]');
  ok(await page.$eval('#sheet .dot[data-v="#1122aa"]', e => e.getAttribute('aria-pressed')) === 'true', 'custom dot added and selected');
  await page.evaluate(() => document.querySelector('#f-dots').scrollIntoView({ block: 'center' })); await page.screenshot({ path: OUT + '/dots.png' });
  await tap('#sheet [data-act="cat-save"]');
  S = await state(); ok(S.cats.find(c => c.id === 'groceries').c === '#1122aa' && S.settings.customCols[0] === '#1122aa', 'category saved with the custom colour; remembered');
  await tap('.ring.edit .tile[data-v="food"]');
  ok(!!(await page.$('#sheet .dot[data-v="#1122aa"]')), 'custom colour offered in the next picker');
  await tap('#sheet [data-act="close"]');
  // account form uses it too
  await tap('[data-act="home"]'); await tap('[data-act="tab"][data-v="assets"]'); await tap('[data-act="acc-form"]');
  ok(!!(await page.$('#sheet .dot[data-v="#1122aa"]')), 'account colour picker offers it too');
  await tap('#sheet [data-act="close"]');

  await page.setViewportSize({ width: 360, height: 760 });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow at 360px');
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
