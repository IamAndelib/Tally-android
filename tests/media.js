#!/usr/bin/env node
// Remakes the store and README images from the app itself, with a made-up notebook (demo()), so they always show the
// current interface:
//   fastlane/metadata/android/en-US/images/phoneScreenshots/*.png   800×1600, the README shows them too
//   fastlane/metadata/android/en-US/images/featureGraphic.png      1024×500
//   docs/social-preview.png                                         1280×640, uploaded by hand in the repository's
//                                                                   Settings → General → Social preview
// Run from tests/: `npm run media`. The day is the suites' fixed one (TALLY_TODAY, harness.js).

const fs = require("fs");
const path = require("path");
const { chromium, launchOptions } = require("./e2e/harness");
const { serve } = require("./e2e/serve");

const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "fastlane/metadata/android/en-US/images/phoneScreenshots");
const GRAPHIC = path.join(ROOT, "fastlane/metadata/android/en-US/images/featureGraphic.png");
const SOCIAL = path.join(ROOT, "docs/social-preview.png");
const OUT = process.env.MEDIA_OUT; // a folder to write them all to instead, to look before replacing

const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const ago = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

/* the notebook in the pictures: a few accounts (one abroad, in euros), two months of everyday entries with payees, a
   loan and a lending, two other assets */
function demo() {
  const txns = [];
  let ts = 1;
  const add = (days, type, amount, account, extra = {}) =>
    txns.push({
      id: "t" + ts,
      ts: Date.now() - days * 864e5 + ts++ * 1000,
      date: ago(days),
      type,
      amount,
      account,
      note: "",
      ...extra,
    });
  const spend = (days, amount, account, cat, payee, note = "") =>
    add(days, "expense", amount, account, { cat, payee, note });
  // today
  spend(0, 36.8, "k", "groceries", "Green Market");
  spend(0, 15, "b", "education", "City Bookshop", "Course book");
  spend(0, 4.75, "c", "food", "Corner Café", "Coffee");
  spend(0, 3.25, "c", "transport", "", "Bus");
  // the weeks before
  const week = [
    [1, 41.3, "k", "groceries", "Green Market"],
    [1, 9.75, "c", "food", "Noodle Bar", "Lunch"],
    [2, 29.99, "k", "shopping", "Outdoor Store", "Rain jacket"],
    [2, 3.25, "c", "transport", "", "Bus"],
    [3, 62.4, "b", "bills", "City Power", "Electricity"],
    [3, 12.5, "c", "fun", "Riverside Cinema"],
    [4, 23.1, "k", "groceries", "Fresh Corner"],
    [4, 18, "b", "health", "Sunrise Pharmacy"],
    [5, 4.75, "c", "food", "Corner Café", "Coffee"],
    [6, 54.2, "k", "groceries", "Green Market"],
    [6, 35, "b", "family", "", "Birthday present"],
    [8, 1200, "b", "housing", "Oak Street Rentals", "June rent"],
  ];
  week.forEach(w => spend(...w));
  for (let d = 9; d < 60; d++) {
    if (d % 2) spend(d, 18 + ((d * 7) % 31), "k", "groceries", d % 4 === 1 ? "Green Market" : "Fresh Corner");
    if (d % 3 === 0) spend(d, 4.75 + (d % 5), "c", "food", "Corner Café", "Coffee");
    if (d % 4 === 0) spend(d, 3.25, "c", "transport", "", "Bus");
    if (d % 9 === 0) spend(d, 20 + (d % 13) * 3, "k", "shopping", "Outdoor Store");
    if (d % 11 === 0) spend(d, 14 + (d % 7), "c", "fun", "Riverside Cinema");
  }
  spend(38, 1200, "b", "housing", "Oak Street Rentals", "May rent");
  add(16, "income", 3250, "b", { cat: "income", payee: "Northwind Ltd", note: "June salary" });
  add(47, "income", 3250, "b", { cat: "income", payee: "Northwind Ltd", note: "May salary" });
  add(10, "income", 150, "c", { cat: "gift", payee: "Grandma" });
  add(7, "transfer", 200, "b", { to: "c" });
  add(15, "transfer", 980, "b", { to: "k", note: "Card bill" });
  add(44, "transfer", 860, "b", { to: "k", note: "Card bill" });
  add(12, "transfer", 650, "k", { to: "s", toAmount: 600 });
  // Maya lent 600 in two draws, 250 paid back; Sam borrowed 50 cash
  add(20, "loan", 400, "b", { dir: "in", loan: "L1", principal: true, due: ago(-13) });
  add(9, "loan", 200, "b", { dir: "in", loan: "L1", principal: true, due: ago(-44) });
  add(3, "loan", 250, "b", { dir: "out", loan: "L1" });
  add(5, "loan", 50, "c", { dir: "out", loan: "L2", principal: true, due: ago(-11) });
  return {
    v: 7,
    settings: {
      cur: "USD",
      week: 1,
      clock: "12",
      theme: "system",
      haptics: true,
      hapticLevel: 3,
      donut: "both",
      remind: { daily: true, time: "21:00", dues: true, dueTime: "09:00", check: true, checkTime: "08:00" },
      backup: { on: false, time: "23:00" },
      lastCheck: ago(0),
      dragTip: true,
    },
    accounts: [
      { id: "b", name: "Everyday", type: "bank", currency: "USD", opening: 1890.4, archived: false },
      { id: "c", name: "Cash", type: "cash", currency: "USD", opening: 96.5, archived: false },
      { id: "k", name: "Credit card", type: "card", currency: "USD", opening: -120.6, archived: false },
      { id: "s", name: "Savings", type: "savings", currency: "EUR", opening: 4200, archived: false },
    ],
    types: [],
    txns,
    loans: [
      { id: "L1", kind: "borrow", person: "Maya", account: "b", date: ago(20), note: "", status: "open" },
      { id: "L2", kind: "lend", person: "Sam", account: "c", date: ago(5), note: "", status: "open" },
    ],
    assets: [
      { id: "a1", name: "Laptop", i: "laptop", c: "#4b5fd6", value: 1100, currency: "USD" },
      { id: "a2", name: "Bike", i: "pedal_bike", c: "#15a06f", value: 450, currency: "USD" },
    ],
  };
}

/* each picture: a file name, the theme, and what to do on the page before the shot */
const SCREENS = [
  ["1-home", "light", () => {}],
  [
    "2-add",
    "light",
    () => {
      txSheet(null, "expense", "groceries");
      $("#f-amt").value = groupDigits("12.40") + "+" + groupDigits("6.25");
      $("#f-amt").dispatchEvent(new Event("input", { bubbles: true }));
      $("#f-payee").value = "Green Market";
      $("#f-note").value = "Fruit and bread";
    },
  ],
  [
    "3-history",
    "light",
    () => {
      V.screen = "history";
      render();
    },
  ],
  ["4-summary", "light", () => summarySheet()],
  [
    "5-assets",
    "light",
    () => {
      V.screen = "assets";
      render();
    },
  ],
  ["6-loan", "light", () => loanOpen("L1")],
  ["7-home-dark", "dark", () => {}],
  [
    "8-income-dark",
    "dark",
    () => {
      txSheet(null, "income", "income");
      $("#f-amt").value = groupDigits("3250");
      $("#f-amt").dispatchEvent(new Event("input", { bubbles: true }));
      $("#f-payee").value = "Northwind Ltd";
      $("#f-note").value = "Bonus";
    },
  ],
];

/* the feature graphic and the social preview: the logo, the name and the line from the store listing, beside two of
   the screenshots in phone frames (cut off by the bottom edge) */
function banner(w, h, base, shots, more) {
  const img = f => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
  const k = h / 500, // laid out for 500 px high
    logo = fs.readFileSync(path.join(ROOT, "docs/logo.svg"), "utf8");
  const phone = (f, x, y) =>
    `<div class="ph" style="left:${x * k}px;top:${y * k}px"><img src="${img(f)}" alt=""></div>`;
  return `<!doctype html><meta charset="utf-8"><style>
  @font-face{font-family:Onest;src:url(${base}fonts/onest-latin.woff2) format("woff2");font-weight:100 900}
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
  body{background:linear-gradient(135deg,#f7f7ff 0%,#e9ebff 100%);font-family:Onest,sans-serif;color:#1b1b21;position:relative}
  .txt{position:absolute;left:${64 * k}px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}
  .txt svg{width:${92 * k}px;height:${92 * k}px}
  h1{margin:${8 * k}px 0 ${10 * k}px;font-size:${112 * k}px;line-height:1;font-weight:700;color:#2f45c9;letter-spacing:-.02em}
  p{margin:0;font-size:${29 * k}px;line-height:1.3;color:#45464f}
  p.more{margin-top:${18 * k}px;font-size:${21 * k}px;color:#5d5e67}
  .ph{position:absolute;width:${214 * k}px;height:${428 * k}px;padding:${7 * k}px;border-radius:${34 * k}px;background:#1b1b21;
    box-shadow:0 ${18 * k}px ${48 * k}px rgba(30,40,110,.28)}
  .ph img{display:block;width:100%;height:100%;border-radius:${27 * k}px}
  </style><div class="txt">${logo}<h1>Tally</h1><p>A pocket notebook for your money.<br>One tap per expense.</p>${
    more ? `<p class="more">${more}</p>` : ""
  }</div>${phone(shots[1], w / k - 470, 92)}${phone(shots[0], w / k - 264, 44)}`;
}

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const dir = OUT ? path.resolve(OUT) : SHOTS;
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  const state = JSON.stringify(demo());
  for (const [name, scheme, setup] of SCREENS) {
    const ctx = await browser.newContext({
      viewport: { width: 400, height: 800 },
      deviceScaleFactor: 2,
      locale: "en-US",
      colorScheme: scheme,
    });
    await ctx.addInitScript(s => {
      if (!localStorage.getItem("tally:v1")) localStorage.setItem("tally:v1", s);
    }, state);
    const page = await ctx.newPage();
    page.on("pageerror", e => {
      throw e;
    });
    await page.goto(url);
    await page.evaluate(setup);
    await page.waitForTimeout(600); // sheets slide in
    await page.screenshot({ path: path.join(dir, name + ".png") });
    await ctx.close();
    console.log(name);
  }
  const shots = ["1-home", "2-add"].map(n => path.join(dir, n + ".png"));
  for (const [file, w, h, more] of [
    [GRAPHIC, 1024, 500],
    [SOCIAL, 1280, 640, "Android · offline · no account · open source"],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(banner(w, h, url.replace("index.html", ""), shots, more));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: OUT ? path.join(dir, path.basename(file)) : file });
    await page.close();
    console.log(path.basename(file));
  }
  await browser.close();
  server.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
