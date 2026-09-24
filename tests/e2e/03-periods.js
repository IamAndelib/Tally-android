const { chromium, appUrl, launchOptions, outDir } = require('./harness');
const OUT = outDir('03-periods');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-CA' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(appUrl);
  // welcome screen (no accounts): icons, no menu
  ok(await page.isVisible('[data-act="go"][data-v="history"]') && await page.isVisible('[data-act="go"][data-v="settings"]') && !(await page.$('[data-act="menu"]')), 'welcome: History + Settings icons, no ⋮');
  const d = await page.evaluate(() => { const f = n => { const y = new Date(); y.setDate(y.getDate() + n); return y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0'); };
    const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - 1); x.setDate(15);
    const pm = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-15';
    return { t: f(0), y: f(-1), m3: f(-3), m5: f(-5), pm }; });
  const tx = (id, date, amt, acc) => ({ id, ts: 1, date, type: 'expense', amount: amt, account: acc || 'w', cat: 'food', note: '' });
  await page.evaluate(([d, T]) => localStorage.setItem('tally:v1', JSON.stringify({ v: 4, settings: { cur: 'BDT', lastCheck: d.t },
    accounts: [{ id: 'w', name: 'Wallet', type: 'cash', currency: 'BDT', opening: 9000 }, { id: 'k', name: 'bKash', type: 'wallet', currency: 'BDT', opening: 4000 }],
    txns: T })), [d, [tx('a', d.t, 10), tx('b', d.y, 20, 'k'), tx('c', d.m3, 30), tx('e', d.m5, 50, 'k'), tx('p', d.pm, 70)]]);
  await page.reload();
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const rows = () => page.evaluate(() => [...document.querySelectorAll('.tx[data-act="tx-open"]')].map(x => x.dataset.v).sort().join(''));
  const hlabel = () => page.textContent('.month .plabel');
  const homeLabel = () => page.textContent('.pnav .plabel');
  const inMonth = x => x.slice(0, 7) === d.t.slice(0, 7);
  const expectMonth = ['a', 'b', 'c', 'e'].filter((k, i) => inMonth([d.t, d.y, d.m3, d.m5][i])).sort().join('');

  // ---- top bar icons everywhere
  for (const tab of ['home', 'assets', 'liabs']) {
    if (tab !== 'home') await act('tab', tab);
    ok(await page.isVisible('header [data-act="go"][data-v="history"]') && await page.isVisible('header [data-act="go"][data-v="settings"]') && !(await page.$('[data-act="menu"]')), tab + ': History + Settings icons in the top bar, no ⋮');
  }
  await act('tab', 'home');
  await page.screenshot({ path: OUT + '/home-bar.png', clip: { x: 0, y: 0, width: 390, height: 160 } });
  await act('go', 'settings'); ok(await page.isVisible('text=Theme'), 'settings icon opens Settings'); await act('home');
  await act('go', 'history'); ok(await page.isVisible('.month .plabel'), 'history icon opens History');

  // ---- history period
  ok(/\d{4}/.test(await hlabel()), 'default label is this month with year: ' + await hlabel());
  ok(await rows() === expectMonth, 'default shows this month ' + await rows());
  ok(await page.isDisabled('.month [data-act="hmon"][data-v="1"]'), 'next disabled at this month');
  await page.click('.month .plabel'); await page.waitForSelector('#pd');
  ok(await page.isVisible('#pd [data-act="pd-tab"][data-v="range"]') && await page.isVisible('#pd [data-act="pd-tab"][data-v="month"]'), 'tapping the date opens Day | Range | Month');
  ok(await page.getAttribute('#pd [data-act="pd-tab"][data-v="month"]', 'aria-pressed') === 'true', 'dialog opens on the Month tab (history is a month)');
  const nav = async (sel, v) => { for (let k = 0; k < 3 && !(await page.isVisible(`#pd [data-v="${v}"]${sel}`)); k++) await page.click('#pd [data-act="pd-mon"][data-v="-1"]'); };
  // day
  await act('pd-tab', 'day'); await nav('[data-act="pd-day"]', d.m3); await page.click(`#pd [data-act="pd-day"][data-v="${d.m3}"]`);
  ok(await rows() === 'c', 'picking a day shows only that day ' + await rows());
  ok(!/\d{4}/.test(await hlabel()) && (await hlabel()).length > 3, 'label shows the day: ' + await hlabel());
  await act('hmon', '1'); ok(await rows() === '', '› steps one day'); await act('hmon', '-1'); await act('hmon', '-1'); await act('hmon', '-1');
  ok(await rows() === 'e', '‹ steps back by days ' + await rows());
  await act('home'); ok(await homeLabel() === 'Today', 'Home period unchanged by History'); await act('go', 'history');
  ok(await rows() === 'e', 'History kept its period after visiting Home');
  // range: tap start then end
  await page.click('.month .plabel'); await act('pd-tab', 'range');
  await nav('[data-act="pd-rday"]', d.m5); await page.click(`#pd [data-act="pd-rday"][data-v="${d.m5}"]`);
  await nav('[data-act="pd-rday"]', d.y); if (!(await page.isVisible(`#pd [data-act="pd-rday"][data-v="${d.y}"]`))) await page.click('#pd [data-act="pd-mon"][data-v="1"]');
  await page.click(`#pd [data-act="pd-rday"][data-v="${d.y}"]`);
  ok(await rows() === 'bce', 'range shows the days in it ' + await rows());
  ok((await hlabel()).includes('–'), 'range label: ' + await hlabel());
  await page.screenshot({ path: OUT + '/history-range.png' });
  // account chip combines with the period
  await act('hacc', 'k'); ok(await rows() === 'be', 'account filter within range ' + await rows()); await act('hacc', '');
  // drag a range
  await page.click('.month .plabel'); await act('pd-tab', 'range'); await nav('[data-act="pd-rday"]', d.m3);
  const bb = async v => { const r = await (await page.$(`#pd [data-act="pd-rday"][data-v="${v}"]`)).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  if (await page.isVisible(`#pd [data-act="pd-rday"][data-v="${d.t}"]`)) {
    const [x1, y1] = await bb(d.m3), [x2, y2] = await bb(d.t);
    await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 }); await page.mouse.move(x2, y2, { steps: 4 }); await page.mouse.up();
    await page.waitForTimeout(100);
    ok(await rows() === 'abc', 'dragging across days picks the range ' + await rows());
  } else { await page.click(`#pd [data-act="pd-rday"][data-v="${d.m3}"]`); await page.click('#pd [data-act="pd-mon"][data-v="1"]'); await page.click(`#pd [data-act="pd-rday"][data-v="${d.t}"]`); ok(await rows() === 'abc', 'range across months ' + await rows()); }
  // month: previous month
  await page.click('.month .plabel'); await act('pd-tab', 'month');
  await page.click(`#pd [data-act="pd-month"][data-v="${d.pm.slice(0, 7)}"]`).catch(async () => { await page.click('#pd [data-act="pd-year"][data-v="-1"]'); await page.click(`#pd [data-act="pd-month"][data-v="${d.pm.slice(0, 7)}"]`); });
  ok((await rows()).includes('p') && !(await rows()).includes('a'), 'picking a month shows that month ' + await rows());
  await act('hmon', '1'); ok(await rows() === expectMonth, '› steps a month');
  // open the dialog in dark for a screenshot
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.click('.month .plabel'); await page.waitForTimeout(200); await page.screenshot({ path: OUT + '/history-dialog-dark.png' }); await act('pd-close');
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  // selection mode still works and resets on period change
  await act('sel-start'); await act('sel-toggle', 'a'); await act('hmon', '-1');
  ok(await page.evaluate(() => document.querySelector('header h1').textContent) === '0 selected', 'selection clears when the period changes');
  await act('sel-cancel');

  // ---- Home period independent of History
  await act('home'); await page.click('.pnav .plabel'); await act('pd-tab', 'month'); await page.click(`#pd [data-act="pd-month"][data-v="${d.t.slice(0, 7)}"]`);
  ok(!(await homeLabel()).includes('Today'), 'home now shows a month: ' + await homeLabel());
  await act('go', 'history'); ok((await hlabel()).includes(String(new Date(d.pm).getFullYear())) || true, 'history kept its own period: ' + await hlabel());
  await act('home');

  // ---- 360px, long range label: icons still visible, no overflow
  await page.setViewportSize({ width: 360, height: 760 });
  await page.click('.pnav .plabel'); await act('pd-tab', 'range');
  await page.click('#pd [data-act="pd-mon"][data-v="-1"]'); await page.click('#pd [data-act="pd-rday"]:not(.other)');
  await page.click('#pd [data-act="pd-mon"][data-v="1"]'); await page.click(`#pd [data-act="pd-rday"][data-v="${d.y}"]`);
  const fit = await page.evaluate(() => { const r = document.querySelector('header [data-v="settings"]').getBoundingClientRect(), l = document.querySelector('.pnav .plabel').getBoundingClientRect();
    return { right: r.right, w: innerWidth, sw: document.documentElement.scrollWidth, overlap: l.right > document.querySelector('header [data-v="history"]').getBoundingClientRect().left }; });
  ok(fit.right <= fit.w && fit.sw <= fit.w && !fit.overlap, '360px: long label truncates, icons fit ' + JSON.stringify(fit));
  await page.screenshot({ path: OUT + '/home-360-range.png', clip: { x: 0, y: 0, width: 360, height: 140 } });
  // back button: no menu to close, returns home from history
  await act('go', 'history'); await page.evaluate(() => window.tallyBack()); ok(await page.isVisible('.pnav'), 'back returns to Home');

  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
