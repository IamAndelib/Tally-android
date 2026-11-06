// Search inside History, part 1: the words, a payee and an amount as History filters (histMatch), their chips,
// "Filters · N", Clear all and the folded-text cache.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
  await ctx.addInitScript(() => {
    window.Android = { getColors: () => null, setBars() {} };
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  await page.evaluate(() => {
    const d = today(),
      e = (id, type, amount, extra) => ({ id, ts: +id.slice(1), date: d, type, amount, account: "a", ...extra });
    S = blank();
    S.settings.cur = "USD";
    S.settings.lastCheck = d;
    S.accounts.push({ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 50000, archived: false });
    S.accounts.push({ id: "b", name: "Cash", type: "cash", currency: "USD", opening: 1000, archived: false });
    S.txns.push(e("t1", "expense", 4.75, { payee: "Corner Café", cat: "food" }));
    S.txns.push(e("t2", "expense", 50, { payee: "corner cafe", cat: "food" }));
    S.txns.push(e("t3", "expense", 50.99, { payee: "Fresh Corner", cat: "food" }));
    S.txns.push(e("t4", "expense", 51, { payee: "Bakery", cat: "food" }));
    S.txns.push(e("t5", "income", 120, { payee: "Corner Café", cat: "salary" }));
    S.txns.push(e("t6", "transfer", 30, { to: "b", toAmount: 70, note: "to wallet" }));
    S.txns.push(e("t7", "expense", 2, { feeOf: "t6", note: "charges" }));
    S.txns[5].feeId = "t7";
    S.txns.push(e("t8", "expense", 49.99, { payee: "Kiosk", cat: "food" }));
    save();
    window.ids = (f, skip) =>
      S.txns
        .filter(t => histMatch(t, { ...histBlank(), ...f }, skip))
        .map(t => t.id)
        .sort();
  });
  const ids = (f, skip) => page.evaluate(([f, s]) => ids(f, s), [f, skip]);
  const eq = async (f, want, msg) => {
    const got = await ids(f);
    ok(JSON.stringify(got) === JSON.stringify(want), msg + ": " + got);
  };

  const blank = await page.evaluate(() => histBlank());
  ok(blank.q === "" && blank.pay === "" && blank.amt === "", "histBlank has q, pay and amt: " + JSON.stringify(blank));

  await eq({ q: "corner" }, ["t1", "t2", "t3", "t5"], "words keep Corner Café and Fresh Corner (both kinds)");
  await eq({ q: "CAFÉ" }, ["t1", "t2", "t5"], "capitals and accents ignored");
  await eq({ q: "4.75" }, ["t1"], "a number finds its amount");
  await eq({ q: "charges" }, ["t6", "t7"], "a word only a fee has finds the transfer (and the fee follows it)");
  await eq({ q: "wallet charges" }, ["t6", "t7"], "words from the transfer and its fee together");
  await eq({ q: "zzz" }, [], "nothing found");
  await eq({ q: "corner", kind: "in" }, ["t5"], "words narrow together with the other filters");
  await eq({ pay: "out:corner cafe" }, ["t1", "t2"], "payee, spending only, whatever capitals and accents");
  await eq({ pay: "in:corner cafe" }, ["t5"], "payee, income only");
  await eq({ pay: "out:bakery" }, ["t4"], "another payee");
  await eq(
    { amt: "gt:50" },
    ["t3", "t4", "t5", "t6", "t7"],
    "more than 50 (the transfer's 70 counts, its fee follows)"
  );
  await eq({ amt: "lt:50" }, ["t1", "t6", "t7", "t8"], "less than 50 (the transfer's 30, its fee follows)");
  await eq({ amt: "eq:50:51" }, ["t2", "t3"], "50.00 to 50.99");
  await eq({ amt: "eq:70:71" }, ["t6", "t7"], "a transfer matches on the amount it received too");
  await eq({ amt: "eq:4.75:4.755" }, ["t1"], "an exact amount");
  await eq({ q: "corner", pay: "out:corner cafe", amt: "gt:10" }, ["t2"], "all three together");

  // the folded cache: one fold per entry until the next save
  const c = await page.evaluate(() => {
    const t = S.txns[0],
      a = srFolded(t),
      b = srFolded(t);
    const same = a === b;
    S.txns[0].payee = "Changed";
    const stale = srFolded(t) === a && srFolded(t).includes("corner cafe");
    save();
    const fresh = srFolded(t).includes("changed");
    S.txns[0].payee = "Corner Café";
    save();
    return { same, stale, fresh, has: srFolded(S.txns[1]).includes("corner cafe") };
  });
  ok(c.same && c.stale, "srFolded is kept until the next save: " + JSON.stringify(c));
  ok(c.fresh && c.has, "srFolded is rebuilt after save()");

  // chips and the count
  await page.evaluate(() => {
    V.screen = "history";
    HF = { ...histBlank(), pay: "out:corner cafe", amt: "eq:50:51", q: "corner" };
    render();
  });
  const chips = () =>
    page.evaluate(() => ({
      chips: [...document.querySelectorAll("#app .hchips .hchip")].map(b => b.textContent.trim()),
      label: document.querySelector("#app .hfbtn").textContent.trim(),
      aria: [...document.querySelectorAll("#app .hchips .hchip")].map(b => b.getAttribute("aria-label")),
      count: histCount(),
    }));
  let r = await chips();
  ok(r.chips.includes("Paid to corner cafe"), "pay chip with the newest spelling: " + r.chips);
  ok(r.chips.includes("$50.00 to $50.99"), "amount chip: " + r.chips);
  ok(r.chips.length === 2, "the words are not a chip: " + r.chips);
  ok(r.count === 2 && r.label === "Filters · 2", "Filters · 2 (words not counted): " + r.label);
  ok(r.aria.includes("Remove filter: Paid to corner cafe"), "chip aria-label: " + r.aria);
  const labels = await page.evaluate(() => [
    srAmtLabel("gt:50"),
    srAmtLabel("lt:50"),
    srAmtLabel("eq:4.75:4.755"),
    ((HF.pay = "in:corner cafe"), histChips()),
  ]);
  ok(labels[0] === "More than $50.00" && labels[1] === "Less than $50.00", "gt/lt labels: " + labels);
  ok(labels[2] === "$4.75", "exact amount label: " + labels[2]);
  ok(/Received from Corner Café/.test(labels[3]), "income payee chip");
  // removing a chip
  await page.evaluate(() => {
    HF = { ...histBlank(), pay: "out:corner cafe", amt: "gt:50", q: "x" };
    render();
  });
  await page.click('#app .hchip[data-v="pay"]');
  r = await page.evaluate(() => ({ pay: HF.pay, amt: HF.amt, q: HF.q }));
  ok(r.pay === "" && r.amt === "gt:50" && r.q === "x", "the pay chip's x clears only the payee: " + JSON.stringify(r));
  await page.click('#app .hchip[data-v="amt"]');
  r = await page.evaluate(() => ({ amt: HF.amt, q: HF.q }));
  ok(r.amt === "" && r.q === "x", "the amount chip's x clears only the amount");
  // Clear all
  await page.evaluate(() => {
    HF = { ...histBlank(), pay: "out:bakery", amt: "lt:3", q: "x" };
    histClear();
  });
  r = await page.evaluate(() => ({ ...HF }));
  ok(!r.q && !r.pay && !r.amt, "Clear all empties q, pay and amt");
  // a payee that no longer exists
  await page.evaluate(() => {
    HF = { ...histBlank(), pay: "out:gone shop", q: "kiosk" };
    histDrop();
  });
  r = await page.evaluate(() => ({ ...HF }));
  ok(r.pay === "" && r.q === "kiosk", "histDrop drops a payee that no longer exists, keeps the words");
  await page.evaluate(() => {
    HF = { ...histBlank(), pay: "out:kiosk" };
    histDrop();
  });
  ok((await page.evaluate(() => HF.pay)) === "out:kiosk", "histDrop keeps a payee that exists");
  await page.evaluate(() => {
    HF = { ...histBlank(), pay: "in:kiosk" };
    histDrop();
  });
  ok((await page.evaluate(() => HF.pay)) === "", "...but not as income when it was only spent at");

  // mixed currencies: the amount is a plain number
  await page.evaluate(() => {
    S.accounts.push({ id: "c", name: "Euro", type: "bank", currency: "EUR", opening: 0, archived: false });
  });
  const mixed = await page.evaluate(() => [srAmtLabel("gt:50"), srAmtLabel("eq:50:51")]);
  ok(mixed[0] === "More than 50.00" && mixed[1] === "50.00 to 50.99", "several currencies: plain numbers: " + mixed);

  ok(errors.length === 0, "no page errors: " + errors.join("; "));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
