// Start-up loading and the safety nets around saved data:
//  - saved settings that reference the colour palette load (regression: a start-up ordering bug used to throw here,
//    which showed the welcome screen and let the next save overwrite the real data)
//  - saved data that can't be read is kept aside and offered as a file, never silently dropped
//  - editing a loan draw can't leave its due date before its own date
//  - Escape (desktop) closes the top layer like the Android back button
const { chromium, appUrl, launchOptions, outDir } = require('./harness');
const OUT = outDir('15-startup-and-storage');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysFromNow = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'en-CA' });
  await ctx.addInitScript(() => {
    window.__saved = [];
    window.Android = { setReminders() {}, requestNotifications() {}, takeActions() { return '[]'; }, getColors() { return null; }, setBars() {},
      saveFile(name, mime, text) { window.__saved.push({ name, mime, text }); }, getVersion() { return '1.0.0'; } };
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const settle = () => page.waitForTimeout(150);
  const seed = async o => { await page.evaluate(s => { localStorage.clear(); localStorage.setItem('tally:v1', s); }, typeof o === 'string' ? o : JSON.stringify(o)); await page.reload(); await settle(); };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('tally:v1')));
  const base = { v: 6, settings: { cur: 'BDT' }, accounts: [{ id: 'w', name: 'Wallet', type: 'cash', currency: 'BDT', opening: 5000 }], txns: [], loans: [], assets: [] };

  await page.goto(appUrl);

  // ---- 1. a hidden palette colour in settings no longer breaks loading
  await seed({ ...base, settings: { cur: 'BDT', hiddenCols: ['#15a06f'] } });
  ok(!(await page.$('.welcome')), 'data with settings.hiddenCols loads (no welcome screen)');
  ok((await page.textContent('#app')).includes('Wallet'), 'the saved account is shown');
  await act('check-ok').catch(() => {}); await settle();
  let S = await state();
  ok(S.accounts.length === 1 && JSON.stringify(S.settings.hiddenCols) === '["#15a06f"]', 'saving keeps the account and the hidden colour');

  // ---- 2. unreadable saved data is kept aside and offered as a file
  const broken = '{"v":6,"accounts":[{"id":"w","name":"Wal';
  await seed(broken);
  ok(!!(await page.$('.welcome')), 'unreadable data: the app still starts (welcome screen)');
  ok((await page.textContent('#pop')).includes("Couldn't open your saved data"), 'a dialog says the saved data could not be opened');
  const kept = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tally:v1:unreadable')).map(k => [k, localStorage.getItem(k)]));
  ok(kept.length === 1 && kept[0][1] === broken, 'the raw text is copied to ' + (kept[0] || [])[0]);
  await page.screenshot({ path: OUT + '/unreadable-dialog.png' });
  await page.click('#pop [data-act="ask-ok"]'); await settle();
  const saved = await page.evaluate(() => window.__saved);
  ok(saved.length === 1 && saved[0].text === broken && /^tally-unreadable-.*\.json$/.test(saved[0].name), 'Save file hands the raw text to Android.saveFile: ' + (saved[0] || {}).name);
  await page.reload(); await settle();
  const keptAgain = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tally:v1:unreadable')).length);
  ok(keptAgain === 1, 'opening the app again does not pile up copies of the same text');
  await page.click('#pop [data-act="pd-close"]');
  await settle();

  // ---- 3. editing a loan draw: due date can't fall before the draw's date
  const drawDate = daysFromNow(-10), due = daysFromNow(-5);
  await seed({ ...base, loans: [{ id: 'L', kind: 'lend', person: 'Rafi', account: 'w', date: drawDate, note: '', status: 'open' }],
    txns: [{ id: 'd1', ts: 1, type: 'loan', dir: 'out', loan: 'L', principal: true, amount: 1000, account: 'w', date: drawDate, due, note: '' }] });
  await act('tab', 'assets'); await settle();
  await act('loan-open', 'L'); await settle();
  await page.click('#sheet .tx.exp'); await settle();
  await act('loandraw-edit', 'd1'); await settle();
  await page.evaluate(d => { document.getElementById('ed-date').dataset.v = d; }, daysFromNow(-2));
  await page.click('#sheet2 [data-act="loandraw-save"]'); await settle();
  ok((await page.textContent('#snack')).includes('before the loan itself'), 'moving the date past the due date is refused');
  S = await state();
  ok(S.txns[0].date === drawDate && S.txns[0].due === due, 'the draw is unchanged');
  await page.evaluate(d => { document.getElementById('ed-due').dataset.v = d; }, daysFromNow(3));
  await page.click('#sheet2 [data-act="loandraw-save"]'); await settle();
  S = await state();
  ok(S.txns[0].date === daysFromNow(-2) && S.txns[0].due === daysFromNow(3), 'with a later due date the edit saves');

  // ---- 4. Escape closes the top layer
  await act('tab', 'home'); await settle();
  await page.click('#ring .cat'); await settle();
  ok(!!(await page.innerHTML('#sheet')), 'entry sheet open');
  await page.keyboard.press('Escape'); await settle();
  ok(!(await page.innerHTML('#sheet')), 'Escape closed it');

  // ---- 5. balance fix, CSV export, asset delete, a file that isn't a backup
  await seed({ ...base, assets: [{ id: 'g', name: 'Gold', i: 'diamond', c: '#a646c9', value: 900, currency: 'BDT' }],
    txns: [{ id: 't1', ts: 1, type: 'expense', amount: 250, account: 'w', cat: 'food', date: daysFromNow(-1), note: 'Tea, "strong"' }] });
  await act('acc-open', 'w'); await settle();
  ok((await page.getAttribute('#f-actual', 'placeholder')) === '4750', 'balance fix field suggests the current balance');
  ok(!!(await page.$('#sheet [data-act="calc-toggle"][data-v="f-actual"]')), 'balance fix field has the calculator toggle');
  await page.fill('#f-actual', '4700');
  await page.click('#sheet [data-act="fix-save"]'); await settle();
  S = await state();
  const fix = S.txns.find(t => t.type === 'adjust');
  ok(fix && fix.amount === -50 && fix.date === daysFromNow(0), 'Update balance records a −50 fix dated today');

  await page.evaluate(() => { window.__saved = []; });
  await act('go', 'settings'); await settle();
  await act('export'); await settle();
  const csv = await page.evaluate(() => window.__saved[0]);
  const lines = csv ? csv.text.split('\n') : [];
  ok(csv && csv.mime === 'text/csv' && lines[0] === 'date,type,amount,currency,account,to_account,to_amount,category,note', 'export writes a CSV with the header row');
  ok(lines.some(l => l.includes('expense,250,BDT,"Wallet"') && l.endsWith('"Tea, ""strong"""')), 'quotes inside notes are escaped: ' + lines[1]);

  await act('home'); await settle();
  await act('tab', 'assets'); await settle();
  await act('asset-edit', 'g'); await settle();
  await page.click('#sheet [data-act="asset-del"]'); await settle();
  S = await state();
  ok(S.assets.length === 0, 'asset deleted');

  await act('go', 'settings'); await settle();
  await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') }); await settle();
  ok((await page.textContent('#snack')).includes("isn't a Tally backup"), 'a JSON file that is not a backup is refused');
  S = await state();
  ok(S.accounts.length === 1 && S.txns.length === 2, 'nothing changed');

  ok(errors.length === 0, 'no page errors: ' + JSON.stringify(errors));
  await browser.close();
  process.exitCode = fails ? 1 : 0;
})();
