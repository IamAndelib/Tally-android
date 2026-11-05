// Search (#37): opened from Home (left of History) and History; Back returns there. As you type, matches are grouped
// (Paid to, Received from, Categories, Accounts, Loans and lendings, Entries), at most three of each, the most used
// first, each with its count and total; a group item opens all its entries by day with their total, and Back or its
// chip goes back to the groups. Case and accents don't matter, every word typed must start a word of the entry (in any
// of its texts), Chinese matches anywhere, a number matches amounts the phone's way ("45" is 45 to 45.99, "4.75" just
// that), and only when nothing matches are words one typo away shown, under a line saying so.
const { chromium, appUrl, launchOptions } = require("./harness");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (locale = "en-US") => {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale });
    await ctx.addInitScript(() => {
      window.Android = { getColors: () => null, setBars() {} };
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    await page.evaluate(() => {
      S = blank();
      S.settings.cur = "USD";
      S.settings.lastCheck = today();
      S.accounts.push(
        { id: "b", name: "Everyday", type: "bank", currency: "USD", opening: 5000, archived: false },
        { id: "c", name: "Cash", type: "cash", currency: "USD", opening: 300, archived: false }
      );
      let n = 0;
      const t = (days, type, amount, account, extra) =>
        S.txns.push({
          id: "t" + ++n,
          ts: n,
          date: addDays(today(), -days),
          type,
          amount,
          account,
          note: "",
          ...extra,
        });
      t(0, "expense", 36.8, "b", { cat: "groceries", payee: "Green Market" });
      t(1, "expense", 41.3, "b", { cat: "groceries", payee: "green market" });
      t(2, "expense", 12.5, "b", { cat: "groceries", payee: "Fresh Corner" });
      t(3, "expense", 4.75, "c", { cat: "food", payee: "Corner Café", note: "Coffee" });
      t(4, "expense", 45.2, "c", { cat: "shopping", payee: "Outdoor Store", note: "Rain jacket" });
      t(5, "expense", 9, "c", { cat: "food", payee: "茶餐厅", note: "午饭" });
      t(6, "income", 150, "c", { cat: "gift", payee: "Grandma" });
      t(7, "transfer", 200, "b", { to: "c" });
      S.loans.push({ id: "L1", kind: "lend", person: "Greta", account: "c", date: today(), note: "", status: "open" });
      t(1, "loan", 20, "c", { dir: "out", loan: "L1", principal: true });
      save();
      render();
    });
    return { ctx, page };
  };
  const { ctx, page } = await open();
  const typeIn = q =>
    page.evaluate(q => {
      $("#sr-q").value = q;
      searchInput(q);
    }, q);
  const groups = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#sr .sec")].map(s => ({
        title: s.textContent,
        rows: [...s.nextElementSibling.querySelectorAll(".tx")].map(r => r.querySelector(".d").textContent),
        subs: [...s.nextElementSibling.querySelectorAll(".tx .s")].map(r => r.textContent),
      }))
    );
  const g = (gs, title) => gs.find(x => x.title === title) || { rows: [], subs: [] };

  ok(
    !!(await page.$('#app .appbar [data-act="search-open"] + [data-act="go"][data-v="history"]')),
    "Home: Search left of History"
  );
  await page.click('[data-act="search-open"]');
  ok(
    (await page.evaluate(() => V.screen === "search" && document.activeElement === $("#sr-q"))) &&
      (await page.textContent("#sr")).includes("Find entries by note"),
    "Search opens with the box ready and a hint"
  );

  await typeIn("gr");
  let gs = await groups();
  ok(
    g(gs, "Paid to").rows.join() === "Green Market",
    "Paid to: one Green Market whatever its case: " + JSON.stringify(g(gs, "Paid to"))
  );
  ok(g(gs, "Paid to").subs[0] === "2 entries · $78.10 spent", "with its count and total: " + g(gs, "Paid to").subs[0]);
  ok(
    g(gs, "Received from").rows.join() === "Grandma" && g(gs, "Received from").subs[0].includes("$150.00 received"),
    "Received from: Grandma"
  );
  ok(
    g(gs, "Categories").rows.join() === "Groceries" && g(gs, "Categories").subs[0].startsWith("3 entries"),
    "Categories: Groceries, 3 entries"
  );
  ok(g(gs, "Loans and lendings").rows.join() === "Greta", "a person with a loan");
  ok(
    g(gs, "Entries").rows.length === 3 && !!(await page.$('#sr [data-act="sr-scope"][data-v="all:"]')),
    "three entries, then Show all"
  );

  /* a group item: all its entries with their total; Back returns to the groups */
  await page.click('#sr [data-act="sr-scope"][data-v^="out:"]');
  const sc = await page.evaluate(() => ({
    chip: $(".srscope").textContent,
    head: $("#sr .srsum").textContent,
    rows: document.querySelectorAll("#sr .tx").length,
  }));
  ok(
    sc.chip.includes("Green Market") &&
      sc.head.includes("2 entries · all time") &&
      sc.head.includes("$78.10 spent") &&
      sc.rows === 2,
    "Green Market: its entries and total: " + JSON.stringify(sc)
  );
  await page.evaluate(() => goBack());
  ok(await page.evaluate(() => !SR.scope && $("#sr-q").value === "gr"), "Back returns to the groups, the words kept");

  /* every word must start a word somewhere in the entry; accents and case don't matter */
  await typeIn("cafe COF");
  gs = await groups();
  ok(
    g(gs, "Entries").rows.join() === "Corner Café · Coffee" && !g(gs, "Paid to").rows.length,
    "cafe COF: the coffee at Corner Café only: " + JSON.stringify(gs)
  );
  await typeIn("rket"); // four letters: too short for a close match too
  ok(
    !(await groups()).length && (await page.textContent("#sr")).includes("Nothing matches"),
    "the middle of a word doesn't count"
  );
  await typeIn("午");
  ok(g(await groups(), "Entries").rows.length === 1, "Chinese matches anywhere in the text");

  /* amounts: a whole number is that amount and its cents, a decimal one just that */
  await typeIn("4.75");
  ok(g(await groups(), "Entries").rows.join() === "Corner Café · Coffee", "4.75 finds the 4.75 entry");
  await typeIn("45");
  ok(g(await groups(), "Entries").rows.join() === "Outdoor Store · Rain jacket", "45 finds 45.20, not 4.75");

  /* a typo: only when nothing matches, under a line saying so */
  await typeIn("grocries");
  gs = await groups();
  ok(
    (await page.textContent("#sr")).includes("No exact matches") && g(gs, "Categories").rows.join() === "Groceries",
    "grocries: Groceries, as a close match"
  );
  await typeIn("gro");
  ok(!(await page.textContent("#sr")).includes("No exact matches"), "no close matches while something matches");

  /* an entry opens from the results; Back leaves Search to where it was opened from */
  await typeIn("rain");
  await page.click('#sr .tx[data-act="tx-open"]');
  ok(!!(await page.$("#sheet .sheet, #sheet .p")), "an entry opens from the results");
  await page.evaluate(() => goBack());
  await page.evaluate(() => goBack());
  ok((await page.evaluate(() => V.screen)) === "home", "Back from Search returns to Home");
  await page.evaluate(() => {
    V.screen = "history";
    render();
  });
  ok(!!(await page.$('#app .appbar [data-act="search-open"]')), "History has Search too");
  await page.click('#app [data-act="search-open"]');
  await page.click('#app [data-act="sr-back"]');
  ok((await page.evaluate(() => V.screen)) === "history", "and Back returns to History");
  await ctx.close();

  /* a German phone: amounts typed the German way */
  {
    const { ctx: c2, page: p2 } = await open("de-DE");
    const r = await p2.evaluate(() => {
      openSearch();
      $("#sr-q").value = "4,75";
      searchInput("4,75");
      return [...document.querySelectorAll("#sr .tx .d")].map(d => d.textContent);
    });
    ok(r.join() === "Corner Café · Coffee", "German: 4,75 finds the 4.75 entry: " + r);
    await c2.close();
  }

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
