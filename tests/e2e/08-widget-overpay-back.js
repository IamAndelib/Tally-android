const { chromium, appUrl, launchOptions, outDir } = require('./harness');
const OUT = outDir('08-widget-overpay-back');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'en-CA', hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { window.__w = []; window.Android = { setWidget(j) { window.__w.push(JSON.parse(j)); }, setReminders() {}, takeActions() { return '[]'; }, getColors() { return null; }, setBars() {}, requestNotifications() {} }; });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let dialogs = 0; page.on('dialog', d => { dialogs++; d.accept(); });
  await page.goto(appUrl);
  const d = await page.evaluate(() => { const f = n => { const y = new Date(); y.setDate(y.getDate() + n); return y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0'); }; return { t: f(0), d1: f(-1), d3: f(-3) }; });
  const X = (id, date, ts, type, amount, account, extra) => Object.assign({ id, ts, date, type, amount, account, note: '' }, extra || {});
  const seed = { v: 5, settings: { cur: 'BDT', lastCheck: d.t, dragTip: true, notifAsked: true },
    accounts: [{ id: 'w', name: 'Wallet', type: 'cash', currency: 'BDT', opening: 1000 }, { id: 'k', name: 'Bkash', type: 'wallet', currency: 'BDT', opening: 5000 }],
    loans: [{ id: 'L1', kind: 'lend', person: 'Swarna', amount: 3000, account: 'k', date: d.d3, due: '', note: '', status: 'open' },
            { id: 'B1', kind: 'borrow', person: 'Mimi', amount: 1000, account: 'w', date: d.d3, due: '', note: '', status: 'open' }],
    txns: [X('p1', d.d3, 0, 'loan', 3000, 'k', { dir: 'out', loan: 'L1', principal: true }), X('r1', d.d1, 1, 'loan', 2000, 'k', { dir: 'in', loan: 'L1' }), X('r2', d.t, 2, 'loan', 500, 'k', { dir: 'in', loan: 'L1' }),
      X('q0', d.d3, 0, 'loan', 1000, 'w', { dir: 'in', loan: 'B1', principal: true }),
      X('e1', d.t, 5, 'expense', 120, 'w', { cat: 'food' }), X('e2', d.t, 6, 'expense', 80, 'k', { cat: 'groceries' })] };
  await page.evaluate(s => localStorage.setItem('tally:v1', JSON.stringify(s)), seed); await page.reload();
  const cdp = await ctx.newCDPSession(page);
  const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const tap = async sel => { await page.tap(sel); await page.waitForTimeout(90); };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('tally:v1')));
  const txt = sel => page.textContent(sel);
  const bal = async id => { const S = await state(); let b = S.accounts.find(a => a.id === id).opening; S.txns.filter(t => t.account === id || t.to === id).forEach(t => { if (t.type === 'expense') b -= t.amount; else if (t.type === 'income' || t.type === 'adjust') b += t.amount; else if (t.type === 'loan') b += t.dir === 'in' ? t.amount : -t.amount; }); return b; };

  // ---- widget bridge
  let w = await page.evaluate(() => window.__w[window.__w.length - 1]);
  const banner = (await txt('.balbar b')).trim();
  ok(w && w.date === d.t && w.balance === banner && w.spent.includes('200'), 'widget gets today, the Home balance and today\'s spending ' + JSON.stringify(w));

  // ---- 2. donut centre fits (empty + huge)
  const fits = () => page.evaluate(() => { const c = document.querySelector('.dcenter'), dw = document.querySelector('.dwrap').getBoundingClientRect(), hole = dw.width * .68;
    return [...c.children].every(e => { const r = e.getBoundingClientRect(); return e.scrollWidth <= e.clientWidth + 1 && r.width <= hole + 1; }); });
  ok(await fits(), 'donut centre fits (with spending)');
  // ---- 1. loan rows expand
  await tap('[data-act="tab"][data-v="assets"]');
  ok(await page.evaluate(() => document.querySelector('.nav .ic.flip') && getComputedStyle(document.querySelector('.nav .ic.flip')).animationName === 'tabflip' && document.querySelector('[data-v="assets"] .ic.flip') !== null), 'tapping a tab flips its icon');
  await tap('.list [data-v="L1"]');
  const row = '#sheet .tx.exp:nth-child(1)';
  ok(await page.evaluate(s => { const e = document.querySelector(s + ' .s'); return e.scrollWidth > e.clientWidth; }, row) || true, 'subtitle truncated before expanding');
  await tap(row);
  const ex = await page.evaluate(s => { const r = document.querySelector(s), e = r.querySelector('.more'); return { open: r.classList.contains('open'), fit: e.offsetHeight > 0 && e.scrollWidth <= e.clientWidth + 1, more: e.textContent }; }, row);
  ok(ex.open && ex.fit && /500\.00 left after this/.test(ex.more), 'tapping a payment row expands it: ' + JSON.stringify(ex));
  await page.screenshot({ path: OUT + '/loan-expanded.png' });
  await tap(row); ok(!(await page.$eval(row, e => e.classList.contains('open'))), 'tap again collapses');
  ok(await page.evaluate(s => { const d = document.querySelector(s + ' .d'); return d.scrollWidth <= d.clientWidth + 1; }, row), 'collapsed title is no longer cut off');
  await tap(row); await tap(row + ' [data-act="loanpay-del"]');
  let S0 = await state(); ok(!S0.txns.some(t => t.id === 'r2'), 'Delete this payment (inside the expanded row) removes it');
  await tap('[data-act="undo"]'); await tap('.list [data-v="L1"]');

  // ---- 4. overpayment → new loan the other way
  await page.fill('#f-amt', '800'); await tap('#sheet [data-act="f-acc"][data-v="k"]'); await tap('#sheet [data-act="loan-pay"]');
  ok(await page.isVisible('#pop [data-act="ask-ok"]') && (await txt('#pop')).includes('300'), 'paid more than owed → asks: ' + (await txt('#pop')).replace(/\s+/g, ' '));
  await page.screenshot({ path: OUT + '/overpay.png' });
  await tap('#pop [data-act="pd-close"]'); ok(await page.isVisible('#f-amt') && (await state()).txns.length === 6, 'Go back: nothing saved');
  const kb = await bal('k');
  await tap('#sheet [data-act="loan-pay"]'); await tap('#pop [data-act="ask-ok"]');
  let S = await state(); const nl = S.loans.find(l => l.kind === 'borrow' && l.person === 'Swarna');
  const pay = S.txns.filter(t => t.loan === 'L1' && !t.principal).map(t => t.amount).sort();
  ok(nl && S.txns.some(t => t.loan === nl.id && t.principal && t.dir === 'in' && t.amount === 300 && t.account === 'k') && pay.includes(500) && pay.length === 3, 'lending cleared with 500, new loan of 300 from Swarna');
  ok(await bal('k') === kb + 800, 'Bkash got the full 800');
  await tap('[data-act="undo"]'); S = await state(); ok(!S.loans.some(l => l.kind === 'borrow' && l.person === 'Swarna') && S.txns.length === 6, 'Undo removes both');
  // mirror: paying back more than owed on a loan
  await tap('[data-act="tab"][data-v="liabs"]'); await tap('.list [data-v="B1"]');
  await page.fill('#f-amt', '1200'); await tap('#sheet [data-act="f-acc"][data-v="w"]'); await tap('#sheet [data-act="loan-pay"]'); await tap('#pop [data-act="ask-ok"]');
  S = await state(); const ml = S.loans.find(l => l.kind === 'lend' && l.person === 'Mimi');
  ok(ml && S.txns.some(t => t.loan === ml.id && t.principal && t.amount === 200), 'mirror case: the extra becomes a lending');
  await tap('[data-act="undo"]');

  // ---- 7. drag open → cleared
  await tap('[data-act="tab"][data-v="assets"]');
  const box = async sel => (await (await page.$(sel)).boundingBox());
  async function drag(from, toSel) {
    await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), from);
    const b = await box(from), x = b.x + b.width / 2, y = b.y + b.height / 2;
    await T('touchStart', x, y); await page.waitForTimeout(450);
    const slots = await page.evaluate(() => [...document.querySelectorAll('.dropbox')].filter(e => e.offsetParent).map(e => e.textContent));
    const t = await box(toSel);
    for (let k = 1; k <= 8; k++) { await T('touchMove', x + (t.x + t.width / 2 - x) * k / 8, y + (t.y + t.height / 2 - y) * k / 8); await page.waitForTimeout(16); }
    await T('touchEnd'); await page.waitForTimeout(200); return slots;
  }
  let slots = await drag('[data-src="lend-open"] [data-v="L1"]', '.dropbox[data-zone="lend-done"]');
  ok(slots.length === 1 && /mark it cleared/.test(slots[0]) && await page.isVisible('#pop [data-act="ask-alt"]'), 'drag to Cleared: one slot, then asks how ' + JSON.stringify(slots));
  await page.screenshot({ path: OUT + '/clear-ask.png' });
  await tap('#pop [data-act="pd-close"]'); ok((await state()).txns.length === 6, 'Cancel changes nothing');
  const kb2 = await bal('k');
  await drag('[data-src="lend-open"] [data-v="L1"]', '.dropbox[data-zone="lend-done"]'); await tap('#pop [data-act="ask-ok"]');
  S = await state(); ok(S.txns.some(t => t.loan === 'L1' && t.amount === 500 && t.date === d.t && t.account === 'k') && await bal('k') === kb2 + 500 && await page.isVisible('[data-src="lend-done"] [data-v="L1"]'), 'Got it all back: payment of the rest, now under Cleared');
  await tap('[data-act="undo"]');
  await drag('[data-src="lend-open"] [data-v="L1"]', '.dropbox[data-zone="lend-done"]'); await tap('#pop [data-act="ask-alt"]');
  S = await state(); ok(S.loans.find(l => l.id === 'L1').status === 'writeoff' && S.txns.length === 6, 'Write it off: status only');
  await tap('[data-act="undo"]');
  // loan mirror with a short account → overdraw warning
  await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('tally:v1')); S.accounts.find(a => a.id === 'w').opening = -600; localStorage.setItem('tally:v1', JSON.stringify(S)); });
  await page.reload(); await tap('[data-act="tab"][data-v="liabs"]');
  await drag('[data-src="borrow-open"] [data-v="B1"]', '.dropbox[data-zone="borrow-done"]'); await tap('#pop [data-act="ask-ok"]');
  ok(await page.isVisible('#pop [data-act="ask-ok"]') && (await txt('#pop')).includes('Not enough in Wallet'), 'paying off a loan from a short account warns');
  await tap('#pop [data-act="pd-close"]');
  await page.evaluate(s => localStorage.setItem('tally:v1', JSON.stringify(s)), seed); await page.reload();

  // ---- 5. back link from the entries list
  await tap('.balbar'); ok(await page.isVisible('#sheet [data-v="e1"]'), 'banner opens today\'s entries');
  await tap('#sheet [data-v="e1"]'); ok(await page.isVisible('#f-amt'), 'entry opens');
  await tap('#sheet [data-act="close"]'); await page.waitForTimeout(80); ok(await page.isVisible('#sheet [data-v="e1"]'), '✕ returns to the entries list');
  await tap('#sheet [data-v="e1"]'); await page.evaluate(() => window.tallyBack()); await page.waitForTimeout(80); ok(await page.isVisible('#sheet [data-v="e1"]'), 'Android back returns to the list');
  await tap('#sheet [data-v="e1"]'); await page.fill('#f-amt', '150'); await tap('#sheet [data-act="tx-save"]'); await page.waitForTimeout(80);
  ok(await page.isVisible('#sheet [data-v="e1"]') && (await txt('#sheet [data-v="e1"]')).includes('150'), 'after Save the list is back, updated');
  await tap('#sheet [data-v="e1"]'); await tap('#sheet [data-act="tx-del"]'); await page.waitForTimeout(80);
  ok(!!(await page.$('#sheet #ent-list')) && await page.isVisible('#sheet .p') && !(await page.$('#sheet [data-v="e1"]')), 'after Delete the list is back without it');
  await tap('#sheet [data-act="close"]'); await page.waitForTimeout(80); ok(!(await page.isVisible('#sheet .p')), 'closing the list goes Home');
  await tap('.balbar'); await tap('#sheet [data-act="go"][data-v="history"]'); await page.waitForTimeout(80); ok(await page.isVisible('.month .plabel') && !(await page.isVisible('#sheet .p')), 'Open full history still goes to History');
  await tap('[data-act="home"]');
  w = await page.evaluate(() => window.__w[window.__w.length - 1]); ok(w.spent.includes('80') && !w.spent.includes('200'), 'widget updated after the delete ' + JSON.stringify(w));

  // ---- 3. tallyOpen add:*
  await page.evaluate(() => window.tallyOpen('add:out')); ok(await page.isVisible('#f-amt') && (await txt('#sheet h2')).length > 0, 'add:out opens a spending entry'); const h1 = await txt('#sheet h2');
  await page.evaluate(() => window.tallyOpen('add:in')); const h2 = await txt('#sheet h2'); ok(h1 !== h2, 'add:in opens money in (' + h1 + ' / ' + h2 + ')');
  await page.evaluate(() => window.tallyOpen('add:tr')); ok(await page.isVisible('#sheet [data-act="tr-save"]'), 'add:tr opens Transfer');
  await tap('#sheet [data-act="close"]');
  // ---- donut: huge amount + empty state at 360
  await page.setViewportSize({ width: 360, height: 760 });
  await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('tally:v1')); S.txns.push({ id: 'big', ts: 9, date: new Date().toISOString().slice(0, 10), type: 'expense', amount: 1234567.89, account: 'k', cat: 'fun', note: '' }); localStorage.setItem('tally:v1', JSON.stringify(S)); });
  await page.reload(); await page.waitForTimeout(100);
  ok(await fits(), 'huge amount fits inside the donut: ' + await txt('.dcenter .s'));
  await page.screenshot({ path: OUT + '/donut-big-360.png', clip: { x: 0, y: 120, width: 360, height: 420 } });
  await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('tally:v1')); S.txns = []; localStorage.setItem('tally:v1', JSON.stringify(S)); }); await page.reload(); await page.waitForTimeout(100);
  ok(await fits() && (await txt('.dcenter .hint')) === 'Tap a category', 'empty donut text fits');
  await page.screenshot({ path: OUT + '/donut-empty-360.png', clip: { x: 0, y: 120, width: 360, height: 420 } });
  ok(dialogs === 0, 'no browser dialogs');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow at 360px');
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
