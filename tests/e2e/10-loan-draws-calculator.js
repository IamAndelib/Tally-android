const { chromium, appUrl, launchOptions, outDir } = require('./harness');
const OUT = outDir('10-loan-draws-calculator');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, locale: 'en-CA' });
  await ctx.addInitScript(() => {
    window.__q = JSON.parse(sessionStorage.getItem('q') || '[]');
    window.Android = { setReminders(j) { window.__rem = JSON.parse(j); }, requestNotifications() {},
      takeActions() { const q = window.__q; window.__q = []; sessionStorage.setItem('q', '[]'); return JSON.stringify(q); },
      getColors() { return null; }, setBars() {}, saveFile() {} };
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(appUrl);
  const d = await page.evaluate(() => { const x = new Date(); const f = n => { const y = new Date(x); y.setDate(y.getDate() + n); return y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0'); }; return { t: f(0), m2: f(-2), p5: f(5), p10: f(10), p13: f(13) }; });
  await page.evaluate(d => localStorage.setItem('tally:v1', JSON.stringify({ v: 2, settings: { cur: 'BDT', lastCheck: d.t },
    accounts: [
      { id: 'w', name: 'Wallet', type: 'cash', currency: 'BDT', opening: 10000 },
      { id: 'k', name: 'bKash', type: 'wallet', currency: 'BDT', opening: 10000 },
      { id: 'usd', name: 'Foreign', type: 'bank', currency: 'USD', opening: 1000 },
    ], txns: [] })), d);
  await page.reload();

  const act = (a, v) => page.click(v === undefined ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const sact = (a, v) => page.click(`#sheet [data-act="${a}"]` + (v === undefined ? '' : `[data-v="${v}"]`));
  const s2act = (a, v) => page.click(`#sheet2 [data-act="${a}"]` + (v === undefined ? '' : `[data-v="${v}"]`));
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('tally:v1')));
  const bal = () => page.evaluate(() => { const S = JSON.parse(localStorage.getItem('tally:v1')), b = {};
    S.accounts.forEach(a => b[a.id] = a.opening);
    S.txns.forEach(t => { if (t.type === 'expense') b[t.account] -= t.amount; else if (t.type === 'income' || t.type === 'adjust') b[t.account] += t.amount;
      else if (t.type === 'loan') b[t.account] += t.dir === 'in' ? t.amount : -t.amount; else if (t.type === 'transfer') { b[t.account] -= t.amount; b[t.to] += t.toAmount ?? t.amount; } });
    return b; });
  const settle = () => page.waitForTimeout(150);
  async function pickDate(id, v) {
    await page.click('#' + id); await page.waitForSelector('#dp');
    for (let k = 0; k < 24 && !(await page.isVisible(`#dp [data-act="dp-day"][data-v="${v}"]`)); k++) {
      const cur = await page.evaluate(() => document.querySelector('#dp [data-act="dp-day"]:not(.other)').dataset.v.slice(0, 7));
      await page.click(`#dp [data-act="dp-mon"][data-v="${v.slice(0, 7) > cur ? 1 : -1}"]`);
    }
    await page.click(`#dp [data-act="dp-day"][data-v="${v}"]`);
  }
  const addDays = (iso, n) => { const [y, m, dd] = iso.split('-').map(Number), x = new Date(y, m - 1, dd + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };

  // ---- 1. date sync: Loan/Lend follows Home's viewed day, like quick add/transfer
  await act('prev'); await act('prev'); await settle(); // Home now on d.m2
  await act('loan-new', 'borrow'); await settle();
  ok(await page.evaluate(() => document.getElementById('f-date').dataset.v) === d.m2, 'loan form date follows Home\'s viewed day, not today');
  await act('close');
  await act('next'); await act('next'); await settle(); // back to today

  // ---- 2. suggested people + merge: lend 3000 to Swarna due in 5 days
  await act('loan-new', 'lend'); await settle();
  await page.fill('#f-person', 'Swarna'); await page.fill('#f-amt', '3000'); await pickDate('f-due', d.p5);
  await sact('loan-save'); await settle();
  let S = await state();
  let L = S.loans.find(l => l.kind === 'lend' && l.person === 'Swarna');
  ok(L, 'first lending to Swarna saved');
  let draws = S.txns.filter(t => t.loan === L.id && t.principal);
  ok(draws.length === 1 && draws[0].amount === 3000 && draws[0].due === d.p5, 'single draw, 3000, due in 5 days');

  // a differently-kinded loan for the same name should not pollute suggestions
  await act('loan-new', 'borrow'); await settle();
  await page.fill('#f-person', 'Swarna'); await page.fill('#f-amt', '500');
  await sact('loan-save'); await settle();
  S = await state();
  const borrowSwarna = S.loans.find(l => l.kind === 'borrow' && l.person === 'Swarna');
  ok(borrowSwarna, 'a borrow from Swarna also exists (different kind, for the negative suggestion test)');

  // second lending: typing "Sw" should suggest the open LEND to Swarna, not the borrow
  await act('loan-new', 'lend'); await settle();
  await page.fill('#f-person', 'Sw'); await settle();
  let chips = await page.evaluate(() => [...document.querySelectorAll('#f-person-sug [data-act="f-person-pick"]')].map(b => ({ v: b.dataset.v, t: b.textContent })));
  ok(chips.length === 1 && chips[0].t === 'Swarna' && chips[0].v === L.id, 'suggestion chip is the open LEND to Swarna only, not the borrow ' + JSON.stringify(chips));
  const gapBoxes = await page.evaluate(() => ({ name: document.getElementById('f-person').getBoundingClientRect(), sug: document.getElementById('f-person-sug').getBoundingClientRect() }));
  ok(gapBoxes.sug.top - gapBoxes.name.bottom >= 8, 'suggestion chips have a visible gap below the name field: ' + (gapBoxes.sug.top - gapBoxes.name.bottom).toFixed(1) + 'px');

  // currency mismatch: switching to the USD account should drop the suggestion
  await sact('f-acc', 'usd'); await settle();
  ok(await page.isHidden('#f-person-sug'), 'suggestion hidden once a currency-mismatched account is picked');
  await sact('f-acc', 'w'); await settle(); // back to a BDT account
  ok(await page.isVisible('#f-person-sug'), 'suggestion reappears back on a matching-currency account');

  // tap the chip to merge, lend 1000 more, due in 10 days
  await act('f-person-pick', L.id); await settle();
  ok((await page.inputValue('#f-person')) === 'Swarna', 'chip fills the name field');
  await page.fill('#f-amt', '1000');
  const hint = (await page.textContent('#f-mergehint')).trim();
  ok(hint.includes('4,000'), 'merge hint shows projected total 4,000: ' + hint);
  await pickDate('f-due', d.p10);
  await sact('loan-save'); await settle();

  S = await state();
  const lends = S.loans.filter(l => l.kind === 'lend' && l.person === 'Swarna');
  ok(lends.length === 1, 'still one Swarna lending record after merge, not two');
  L = lends[0];
  draws = S.txns.filter(t => t.loan === L.id && t.principal).sort((a, b) => a.amount - b.amount);
  ok(draws.length === 2, 'two draws on the merged tab');
  const total = draws.reduce((s, t) => s + t.amount, 0);
  ok(total === 4000, 'merged total is 4000, got ' + total);
  ok(draws[0].amount === 1000 && draws[0].due === d.p10 && draws[1].amount === 3000 && draws[1].due === d.p5, 'each draw kept its own amount and due date');

  // ---- 3. loan sheet: multi-draw hero, per-draw due shown, nearer due on the card
  await act('tab', 'assets'); await settle();
  await act('loan-open', L.id); await settle();
  const hero = (await page.textContent('#sheet .hero .t')).trim();
  ok(/^2 lendings since/.test(hero), 'hero line says "2 lendings since ..." for a multi-draw tab: ' + hero);
  ok((await page.textContent('#sheet .hero .v')).includes('4,000'), 'hero amount shows the combined total');
  ok(await page.evaluate(() => document.getElementById('f-due2').dataset.v) === d.p5, 'due-date card shows the nearer of the two dues (5 days out)');
  ok(!(await page.isVisible('[data-act="loan-ext"]')), 'no +1 day/week chips anywhere in the loan sheet');

  // expand both draws, each shows its own due date
  const rows = await page.$$('#sheet .tx.exp');
  ok(rows.length === 2, 'two history rows for the two draws');
  for (const row of rows) { await row.click(); await settle(); }
  const mores = await page.evaluate(() => [...document.querySelectorAll('#sheet .tx.exp .more')].map(e => e.textContent));
  ok(mores.filter(m => /due/.test(m)).length === 2, 'both expanded draw rows show their own due date: ' + JSON.stringify(mores));

  // ---- 4. per-draw due extended natively only moves the nearer draw
  await page.evaluate(id => sessionStorage.setItem('q', JSON.stringify([{ type: 'extend', id, days: 3 }])), L.id);
  await page.reload(); await settle();
  S = await state();
  draws = S.txns.filter(t => t.loan === L.id && t.principal);
  const d5draw = draws.find(t => t.amount === 3000), d10draw = draws.find(t => t.amount === 1000);
  ok(d5draw.due === addDays(d.p5, 3), 'native +3 days moved the nearer draw\'s due to ' + d5draw.due);
  ok(d10draw.due === d.p10, 'the other draw\'s due is untouched: ' + d10draw.due);

  // ---- 5. editing a draw (amount/account/date/due)
  await act('tab', 'assets'); await settle();
  await act('loan-open', L.id); await settle();
  const draw3kId = d5draw.id;
  await page.click(`#sheet [data-act="row-exp"]:has([data-v="${draw3kId}"])`).catch(() => {});
  // find and expand the row containing this draw's Edit button, then open the edit sheet
  await page.click(`[data-act="loandraw-edit"][data-v="${draw3kId}"]`);
  await settle();
  ok(await page.isVisible('#sheet2 [data-act="loandraw-save"]'), 'edit sheet (sheet2) opened for the draw');
  await page.fill('#ed-amt', '3500');
  await s2act('ed-acc', 'k');
  await settle();
  await s2act('loandraw-save'); await settle();
  S = await state();
  const editedDraw = S.txns.find(t => t.id === draw3kId);
  ok(editedDraw.amount === 3500 && editedDraw.account === 'k', 'draw edited: amount 3500, moved to bKash');
  draws = S.txns.filter(t => t.loan === L.id && t.principal);
  ok(draws.reduce((s, t) => s + t.amount, 0) === 4500, 'loan total now 4500 after the edit');
  // undo restores it
  await act('undo'); await settle();
  S = await state();
  const undone = S.txns.find(t => t.id === draw3kId);
  ok(undone.amount === 3000 && undone.account === 'w', 'undo restored the draw\'s original amount and account');

  // ---- 6. Delete is absent on a principal row when it is the loan's only remaining draw
  await act('tab', 'liabs'); await settle();
  await act('loan-open', borrowSwarna.id); await settle();
  await page.click('#sheet .tx.exp'); await settle();
  const soleDrawButtons = await page.evaluate(() => { const m = document.querySelector('#sheet .tx.exp .more'); return { edit: !!m.querySelector('[data-act="loandraw-edit"]'), del: !!m.querySelector('[data-act="loanpay-del"]') }; });
  ok(soleDrawButtons.edit && !soleDrawButtons.del, 'sole remaining draw: Edit present, Delete absent ' + JSON.stringify(soleDrawButtons));
  await act('close');

  // ---- 7. calculator
  await act('tab', 'home'); await settle();
  await page.click('#ring .cat'); await settle();
  ok(await page.isVisible('[data-act="calc-toggle"][data-v="f-amt"]'), 'calculator toggle present on the quick-add amount field');
  await act('calc-toggle', 'f-amt'); await settle();
  ok(await page.isVisible('#calc-f-amt'), 'calculator panel opens');
  const calcBox = await page.evaluate(() => document.getElementById('calc-f-amt').getBoundingClientRect());
  const vh = await page.evaluate(() => innerHeight);
  ok(Math.abs(calcBox.bottom - vh) < 2, 'calculator docks flush to the bottom of the viewport, like a keyboard: bottom=' + calcBox.bottom + ' viewport=' + vh);
  const amtBox = await page.evaluate(() => document.getElementById('f-amt').getBoundingClientRect());
  ok(amtBox.top >= 0 && amtBox.bottom <= calcBox.top + 1, 'the amount field stays visible above the docked calculator');
  for (const k of ['1', '2', '0', '×', '3', '+', '4', '5']) await page.click(`#calc-f-amt [data-act="calc-key"][data-v="${k === '×' ? '×' : k}"]`);
  await act('calc-toggle', 'f-amt');
  ok(await page.inputValue('#f-amt') === '405', 'calculator computed 120×3+45 = 405, got ' + (await page.inputValue('#f-amt')));
  ok(await page.isHidden('#calc-f-amt'), 'panel closes after applying the result');
  await sact('tx-save'); await settle();
  S = await state();
  ok(S.txns.some(t => t.type === 'expense' && t.amount === 405), 'expense of 405 (from the calculator) saved');

  // divide by zero: leaves the field as-is (the live expression text), no crash
  await page.click('#ring .cat'); await settle();
  await act('calc-toggle', 'f-amt');
  for (const k of ['5', '÷', '0']) await page.click(`#calc-f-amt [data-act="calc-key"][data-v="${k}"]`);
  await act('calc-toggle', 'f-amt');
  ok((await page.inputValue('#f-amt')) === '5÷0', 'divide-by-zero: field left unchanged (no crash, no silent NaN): ' + (await page.inputValue('#f-amt')));
  ok(errors.length === 0, 'no page error from the divide-by-zero case');
  await act('close');

  // calculator scoped to amount-style fields: present on transfer / loan / payment / edit-draw / balance-fix; absent on transfer's received/fee and asset value
  await act('tr-new'); await settle();
  ok(await page.isVisible('[data-act="calc-toggle"][data-v="f-amt"]'), 'calculator on transfer\'s main amount');
  ok(!(await page.$('[data-act="calc-toggle"][data-v="f-toamt"]')), 'no calculator on transfer\'s received amount (scope-trimmed)');
  ok(!(await page.$('[data-act="calc-toggle"][data-v="f-fee"]')), 'no calculator on transfer\'s fee (scope-trimmed)');
  await act('close');

  await act('loan-new', 'lend'); await settle();
  ok(await page.isVisible('[data-act="calc-toggle"][data-v="f-amt"]'), 'calculator on the loan/lend create form');
  await act('close');

  await act('tab', 'assets'); await settle();
  await act('loan-open', L.id); await settle();
  ok(await page.isVisible('[data-act="calc-toggle"][data-v="f-amt"]'), 'calculator on the loan payment field');
  // this field sits well down a tall, scrollable sheet — confirm the calculator still docks to the
  // screen's bottom (not inline) and the field stays visible above it, not just on a short quick-add sheet
  await act('calc-toggle', 'f-amt'); await settle();
  const calcBox2 = await page.evaluate(() => document.getElementById('calc-f-amt').getBoundingClientRect());
  const vh2 = await page.evaluate(() => innerHeight);
  ok(Math.abs(calcBox2.bottom - vh2) < 2, 'calculator on a long sheet still docks flush to the bottom: bottom=' + calcBox2.bottom + ' viewport=' + vh2);
  const amtBox2 = await page.evaluate(() => document.getElementById('f-amt').getBoundingClientRect());
  ok(amtBox2.top >= 0 && amtBox2.bottom <= calcBox2.top + 1, 'the payment field, deep in the sheet, still scrolls into view above the calculator');
  await act('calc-toggle', 'f-amt'); await settle();
  await act('close');

  await act('asset-edit'); await settle();
  ok(!(await page.$('[data-act="calc-toggle"][data-v="f-aval"]')), 'no calculator on asset value (scope-trimmed)');
  await act('close');

  await act('acc-open', 'w'); await settle();
  ok(await page.isVisible('[data-act="calc-toggle"][data-v="f-actual"]'), 'calculator on the "Doesn\'t match?" actual-balance field');
  await act('close');

  await page.screenshot({ path: OUT + '/merge-form.png' });

  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'no horizontal overflow at 360px');
  await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
