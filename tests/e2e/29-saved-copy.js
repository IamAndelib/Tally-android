// The shell's own copy of every save (Android.keepState / keptState, SavedCopy.java). WebView writes localStorage to
// disk a few seconds late, so an entry saved just before the phone ends Tally (swiped away from Recents) could be
// missing after a restart; start-up takes whichever copy has the higher save number:
//  - every save goes to the shell with its number, and the number is stored with the data
//  - a save the WebView lost comes back from the shell's copy, and numbering carries on from it
//  - the WebView's copy wins when it is as new or newer
//  - a copy that can't be read never hides one that can (either way round, or an empty one, or localStorage blocked);
//    it is kept aside once and offered, like unreadable saved data; with none readable, start-up says so
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
outDir("29-saved-copy");
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
    locale: "en-US",
  });
  /* the shell's file lives in sessionStorage here: it survives a reload, and the tests can lose localStorage's part */
  await ctx.addInitScript(() => {
    window.__keeps = [];
    window.Android = {
      setWidget() {},
      setReminders() {},
      takeActions() {
        return "[]";
      },
      getColors() {
        return null;
      },
      setBars() {},
      requestNotifications() {},
      keepState(seq, json) {
        window.__keeps.push(seq);
        sessionStorage.setItem("kept", seq + "\n" + json);
      },
      keptState() {
        return sessionStorage.getItem("kept") || "";
      },
    };
    /* localStorage blocked (a test sets "blockLS"): reading it throws, as on a phone whose WebView storage is broken */
    if (sessionStorage.getItem("blockLS")) {
      const get = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k) {
        if (this === localStorage) throw new Error("blocked");
        return get.call(this, k);
      };
    }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(appUrl);
  const settle = (ms = 150) => page.waitForTimeout(ms);
  const t = await page.evaluate(() => today());
  const base = {
    v: 6,
    settings: { cur: "USD", clock: "24", lastCheck: t, dragTip: true },
    accounts: [{ id: "a", name: "Bank", type: "bank", currency: "USD", opening: 1000 }],
    txns: [],
    loans: [],
    assets: [],
  };
  const reload = async () => {
    await page.reload();
    await settle();
  };
  const local = () =>
    page.evaluate(() => ({ seq: localStorage.getItem("tally:v1:seq"), data: localStorage.getItem("tally:v1") }));
  const kept = () => page.evaluate(() => sessionStorage.getItem("kept") || "");
  const ids = () => page.evaluate(() => S.txns.map(x => x.id).join(","));

  await page.evaluate(o => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("tally:v1", JSON.stringify(o));
  }, base);
  await reload();
  ok((await kept()) === "", "nothing is copied to the shell before the first save");

  // ---- every save goes to the shell, numbered
  const before = (await local()).data;
  await page.evaluate(t => {
    S.txns.push({
      id: "e1",
      ts: Date.now(),
      date: t,
      type: "expense",
      amount: 12,
      account: "a",
      cat: "food",
      note: "",
    });
    commit();
  }, t);
  await settle();
  let L = await local(),
    K = await kept();
  ok(L.seq === "1" && K.startsWith("1\n"), "the first save is number 1 here and in the shell (" + L.seq + ")");
  ok(K.slice(2) === L.data, "the shell's copy is exactly the saved data");

  // ---- the WebView loses that save (Tally ended before it reached the disk): the shell's copy brings it back
  await page.evaluate(b => {
    localStorage.setItem("tally:v1", b);
    localStorage.removeItem("tally:v1:seq");
  }, before);
  await reload();
  ok((await ids()) === "e1", "an entry the WebView lost comes back from the shell's copy");
  ok(
    (await page.textContent("#app")).includes("988"),
    "Home shows the balance with it (" + (await page.evaluate(() => money(balances().a, "USD"))) + ")"
  );
  await page.evaluate(t => {
    S.txns.push({ id: "e2", ts: Date.now(), date: t, type: "expense", amount: 3, account: "a", cat: "food", note: "" });
    commit();
  }, t);
  await settle();
  L = await local();
  K = await kept();
  ok(L.seq === "2" && K.startsWith("2\n"), "numbering carries on from the shell's copy (" + L.seq + ")");
  ok(JSON.parse(L.data).txns.length === 2, "and the WebView has both entries again");

  // ---- the WebView's copy wins when it is newer, or as new
  await page.evaluate(() => {
    const o = JSON.parse(localStorage.getItem("tally:v1"));
    o.accounts[0].name = "Older";
    sessionStorage.setItem("kept", "1\n" + JSON.stringify(o));
  });
  await reload();
  ok(
    (await page.evaluate(() => S.accounts[0].name)) === "Bank",
    "an older shell copy is ignored (" + (await page.evaluate(() => S.accounts[0].name)) + ")"
  );
  await page.evaluate(() => {
    const o = JSON.parse(localStorage.getItem("tally:v1"));
    o.accounts[0].name = "Same number";
    sessionStorage.setItem("kept", localStorage.getItem("tally:v1:seq") + "\n" + JSON.stringify(o));
  });
  await reload();
  ok((await page.evaluate(() => S.accounts[0].name)) === "Bank", "on a tie the WebView's copy is used");

  // ---- a copy that can't be read never hides one that can, and is kept aside (once) to save as a file
  const pop = async () => (await page.textContent("#pop")) || "",
    name = () => page.evaluate(() => S.accounts[0] && S.accounts[0].name),
    keptHas = x => page.evaluate(x => keptKeys().some(k => localStorage.getItem(k) === x), x);
  await page.evaluate(() => sessionStorage.setItem("kept", "99\n{not json"));
  await reload();
  ok(
    (await name()) === "Bank" && !(await pop()).includes("Couldn't open"),
    "a newer shell copy that can't be read: the WebView's readable one opens"
  );
  ok(await keptHas("{not json"), "and the unreadable copy is kept aside to save as a file");
  await reload();
  ok((await page.evaluate(() => keptKeys().length)) === 1, "kept once, however many starts");
  await page.evaluate(() => commit());
  await settle();
  ok((await kept()).startsWith("100\n"), "numbering carries on past the unreadable copy's number");
  await page.evaluate(() => {
    const good = localStorage.getItem("tally:v1");
    sessionStorage.setItem("kept", localStorage.getItem("tally:v1:seq") + "\n" + good);
    localStorage.setItem("tally:v1", "{cut short");
    keptKeys().forEach(k => localStorage.removeItem(k));
  });
  await reload();
  ok(
    (await name()) === "Bank" && !(await pop()).includes("Couldn't open") && (await keptHas("{cut short")),
    "a tie where the WebView's copy can't be read: the shell's opens, the other is kept aside"
  );
  await page.evaluate(() => commit()); // the WebView's copy readable again
  await settle();
  await page.evaluate(() => sessionStorage.setItem("kept", "500\n"));
  await reload();
  ok((await name()) === "Bank", "an empty newer copy doesn't blank the notebook");
  await page.evaluate(() => {
    const good = localStorage.getItem("tally:v1");
    sessionStorage.setItem("kept", "700\n" + good);
    sessionStorage.setItem("blockLS", "1");
  });
  await reload();
  ok((await name()) === "Bank", "localStorage blocked: the shell's copy still opens");
  await page.evaluate(() => {
    sessionStorage.removeItem("blockLS");
    keptKeys().forEach(k => localStorage.removeItem(k));
    localStorage.setItem("tally:v1", "{a");
    sessionStorage.setItem("kept", "800\n{b");
  });
  await reload();
  ok(
    (await pop()).includes("Couldn't open your saved data") && (await keptHas("{a")) && (await keptHas("{b")),
    "no copy readable: start-up says so, and both are kept aside"
  );
  await page.evaluate(() => closePop());
  await page.evaluate(() => sessionStorage.setItem("kept", "1e400\n{}"));
  ok((await page.evaluate(() => shellCopy().seq)) === 0, "a save number past what the shell can carry counts as none");

  // ---- no shell (a browser): saving and loading work as before
  const plain = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "en-US" });
  const p2 = await plain.newPage();
  p2.on("pageerror", e => errors.push(e.message));
  await p2.goto(appUrl);
  await p2.evaluate(o => {
    localStorage.clear();
    localStorage.setItem("tally:v1", JSON.stringify(o));
  }, base);
  await p2.reload();
  await p2.waitForTimeout(150);
  await p2.evaluate(t => {
    S.txns.push({ id: "b1", ts: Date.now(), date: t, type: "expense", amount: 5, account: "a", cat: "food", note: "" });
    commit();
  }, t);
  await p2.reload();
  await p2.waitForTimeout(150);
  ok((await p2.evaluate(() => S.txns.map(x => x.id).join(","))) === "b1", "without a shell, saves load as before");
  await plain.close();

  ok(errors.length === 0, "no page errors " + JSON.stringify(errors));
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASS");
  process.exit(fails ? 1 : 0);
})();
