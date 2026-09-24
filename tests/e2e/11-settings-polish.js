const { chromium, appUrl, launchOptions, outDir } = require('./harness');
const OUT = outDir('11-settings-polish');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'en-CA' });
  await ctx.addInitScript(() => {
    window.Android = { setReminders() {}, requestNotifications() {}, takeActions() { return '[]'; }, getColors() { return null; }, setBars() {}, saveFile() {}, getVersion() { return '1.0.42'; } };
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const settle = () => page.waitForTimeout(150);

  // ---- fresh install, no data at all: go straight to Settings via a blank state
  await page.goto(appUrl);
  await page.evaluate(() => localStorage.removeItem('tally:v1'));
  await page.reload(); await settle();

  // ---- 1. calculator caption removed
  // seed one account so quick add / an amount field is reachable
  await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('tally:v1') || '{}'); });
  await page.evaluate(() => localStorage.setItem('tally:v1', JSON.stringify({ v: 6, settings: { cur: 'BDT' },
    accounts: [{ id: 'w', name: 'Wallet', type: 'cash', currency: 'BDT', opening: 1000 }], txns: [], loans: [], assets: [] })));
  await page.reload(); await settle();
  await page.click('#ring .cat'); await settle();
  await act('calc-toggle', 'f-amt'); await settle();
  const calcText = await page.textContent('#calc-f-amt');
  ok(!/Tap the calculator/i.test(calcText), 'calculator caption text removed: "' + calcText.trim() + '"');
  ok(!(await page.$('.calc .cap')), 'no .cap element inside the calculator panel');
  await act('calc-toggle', 'f-amt'); await act('close');

  // ---- 2. wipe button disabled on truly empty state, enabled with data, disabled again after wipe
  await page.evaluate(() => localStorage.setItem('tally:v1', JSON.stringify({ v: 6, settings: { cur: 'BDT' }, accounts: [], txns: [], loans: [], assets: [] })));
  await page.reload(); await settle();
  await act('go', 'settings'); await settle();
  ok(await page.isDisabled('[data-act="wipe"]'), 'Delete all data is disabled on a truly empty state');

  await act('home'); await settle();
  await page.evaluate(() => localStorage.setItem('tally:v1', JSON.stringify({ v: 6, settings: { cur: 'BDT' },
    accounts: [{ id: 'w', name: 'Wallet', type: 'cash', currency: 'BDT', opening: 1000 }], txns: [], loans: [], assets: [] })));
  await page.reload(); await settle();
  await act('go', 'settings'); await settle();
  ok(!(await page.isDisabled('[data-act="wipe"]')), 'Delete all data is enabled once an account exists');
  await page.screenshot({ path: OUT + '/settings-about.png' });

  await act('wipe'); await settle();
  await page.click('#pop [data-act="ask-ok"]'); await settle();
  ok(await page.isDisabled('[data-act="wipe"]'), 'Delete all data is disabled again right after wiping');
  await page.screenshot({ path: OUT + '/settings-wiped.png' });

  // ---- 3. About footer: version + links
  const about = await page.evaluate(() => {
    const links = [...document.querySelectorAll('.sec')].find(s => s.textContent.trim() === 'About');
    const p = links ? links.nextElementSibling : null;
    return p ? { text: p.textContent, hrefs: [...p.querySelectorAll('a')].map(a => a.getAttribute('href')) } : null;
  });
  ok(about && /Version 1\.0\.42/.test(about.text), 'About shows the stubbed version: ' + JSON.stringify(about && about.text));
  ok(about && about.hrefs.includes('https://github.com/IamAndelib') && about.hrefs.includes('https://github.com/IamAndelib/Tally-android'), 'About links to the GitHub profile and repo: ' + JSON.stringify(about && about.hrefs));

  // degrade gracefully without Android.getVersion (mutate in place, then re-render Settings without a reload,
  // since a full reload would re-run addInitScript and re-attach getVersion)
  await act('home'); await settle();
  await page.evaluate(() => { delete window.Android.getVersion; });
  await act('go', 'settings'); await settle();
  const about2 = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('.sec')].find(s => s.textContent.trim() === 'About');
    return sec ? sec.nextElementSibling.textContent : null;
  });
  ok(about2 && !/undefined/i.test(about2) && !/Version/.test(about2), 'About degrades quietly with no version when the bridge lacks getVersion: "' + about2 + '"');
  ok(errors.length === 0, 'no page errors after the missing-bridge-method case ' + JSON.stringify(errors));

  // ---- 4. circular press-state on appbar/pnav icons (equal width/height)
  const iconBoxes = await page.evaluate(() => {
    const appbar = document.querySelector('.appbar .icon');
    const pnav = document.querySelector('.pnav .icon');
    const r = el => el ? (({ width, height }) => ({ width, height }))(el.getBoundingClientRect()) : null;
    return { appbar: r(appbar), pnav: r(pnav) };
  });
  ok(iconBoxes.appbar && Math.abs(iconBoxes.appbar.width - iconBoxes.appbar.height) < 0.5, 'appbar icon button is square (circle, not oval): ' + JSON.stringify(iconBoxes.appbar));

  // the wipe test above left the state blank (no accounts) — Home shows the "Start your notebook"
  // welcome screen with no .pnav in that case, so reseed an account to reach the normal period-nav bar
  await page.evaluate(() => localStorage.setItem('tally:v1', JSON.stringify({ v: 6, settings: { cur: 'BDT' },
    accounts: [{ id: 'w', name: 'Wallet', type: 'cash', currency: 'BDT', opening: 1000 }], txns: [], loans: [], assets: [] })));
  await page.reload(); await settle();
  const pnavBox = await page.evaluate(() => { const el = document.querySelector('.pnav .icon'); const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; });
  ok(Math.abs(pnavBox.width - pnavBox.height) < 0.5, 'pnav (period nav) icon button is square (circle, not oval): ' + JSON.stringify(pnavBox));

  // ---- 5. History: day-header total lines up with row amounts
  await page.evaluate(() => { const x = new Date(); const f = n => { const y = new Date(x); y.setDate(y.getDate() + n); return y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0'); }; window.__d = f(0); });
  const d = await page.evaluate(() => window.__d);
  await page.evaluate(d => localStorage.setItem('tally:v1', JSON.stringify({ v: 6, settings: { cur: 'BDT' },
    accounts: [{ id: 'w', name: 'Wallet', type: 'cash', currency: 'BDT', opening: 1000 }],
    txns: [
      { id: 't1', ts: 1, date: d, type: 'expense', amount: 30, account: 'w', cat: 'transport', note: '' },
      { id: 't2', ts: 2, date: d, type: 'expense', amount: 375, account: 'w', cat: 'groceries', note: '' }
    ], loans: [], assets: [] })), d);
  await page.reload(); await settle();
  await act('go', 'history'); await settle();
  const align = await page.evaluate(() => {
    const day = document.querySelector('.day span:last-child');
    const amt = document.querySelector('.tx .a');
    return { dayRight: day.getBoundingClientRect().right, amtRight: amt.getBoundingClientRect().right };
  });
  ok(Math.abs(align.dayRight - align.amtRight) < 1.5, 'History: day-header total lines up with the row amounts below it: ' + JSON.stringify(align));
  await page.screenshot({ path: OUT + '/history-aligned.png' });

  ok(errors.length === 0, 'no page errors overall ' + JSON.stringify(errors));
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'no horizontal overflow at 393px');

  await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
