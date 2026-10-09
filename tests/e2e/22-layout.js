// Layout across screen sizes and text sizes: every screen, sheet and dialog is opened with realistic data on a range
// of mainstream phones (small to large, 16:9 to 21:9), foldables and tablets (portrait and landscape) and a phone in
// landscape, at the normal and the largest supported text size. Each state is checked for anything that spills off
// the screen, text cut off without an ellipsis, controls overlapping each other, tap targets that are too small and
// sheets taller than the screen. Screenshots of every state go to tests/e2e/output/22-layout/ for review.
//
// LAYOUT_FULL=1 runs every size with every text scale (the default is a smaller matrix that still covers the edges);
// LAYOUT_ONLY=<device ids> runs only those sizes.
const { chromium, appUrl, launchOptions, outDir } = require("./harness");
const OUT = outDir("22-layout");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};

/* CSS px sizes of mainstream devices */
const DEVICES = [
  { id: "small-16x9", w: 320, h: 640 }, // small phone, or a 360 px phone at the largest display size
  { id: "compact-16x9", w: 360, h: 640 },
  { id: "phone-20x9", w: 360, h: 800 },
  { id: "pixel", w: 393, h: 852 },
  { id: "large-phone", w: 412, h: 915 },
  { id: "max-phone", w: 430, h: 932 },
  { id: "small-landscape", w: 640, h: 360 }, // phones held sideways
  { id: "phone-landscape", w: 800, h: 360 },
  { id: "large-landscape", w: 932, h: 430 },
  { id: "foldable", w: 673, h: 841 },
  { id: "foldable-landscape", w: 841, h: 673 },
  { id: "tablet-portrait", w: 800, h: 1280 },
  { id: "tablet-landscape", w: 1280, h: 800 },
];
const SCALES = [1, 1.3];
const FULL = !!process.env.LAYOUT_FULL,
  ONLY = (process.env.LAYOUT_ONLY || "").split(",").filter(Boolean); // e.g. LAYOUT_ONLY=small-16x9,pixel
const matrix = DEVICES.filter(d => !ONLY.length || ONLY.includes(d.id)).flatMap(d =>
  SCALES.filter(
    s =>
      FULL ||
      s === 1 ||
      ["small-16x9", "phone-20x9", "phone-landscape", "large-landscape", "tablet-portrait"].includes(d.id)
  ).map(s => ({ ...d, s }))
);

/* a notebook as a real user might have it: several accounts and currencies, a day of spending, loans, an asset */
function sampleState(t, nCats) {
  const ago = n => {
    const d = new Date(t + "T12:00:00");
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const ahead = n => ago(-n);
  const tx = [];
  let n = 0;
  const add = (date, type, amount, account, extra) =>
    tx.push(Object.assign({ id: "t" + ++n, ts: 1000 + n, date, type, amount, account, note: "" }, extra));
  const spend = [
    ["groceries", 46.2],
    ["food", 18.5],
    ["transport", 3.25],
    ["bills", 120],
    ["shopping", 59.99],
    ["fun", 24],
    ["health", 12.4],
  ];
  for (let d = 0; d < 40; d++)
    spend.forEach(([cat, a], i) => (d + i) % 3 === 0 && add(ago(d), "expense", a, i % 2 ? "c" : "b", { cat }));
  add(ago(1), "income", 2450, "b", { cat: "income" });
  add(ago(2), "transfer", 200, "b", { to: "c" });
  add(ago(5), "loan", 300, "c", { dir: "out", loan: "L1", principal: true, due: ago(1) });
  add(ago(3), "loan", 1000, "c", { dir: "out", loan: "L1", principal: true, due: ahead(5) });
  add(ago(8), "loan", 2500, "s", { dir: "in", loan: "L2", principal: true, due: ahead(20) });
  const cats = [];
  for (let i = 0; i < nCats - 12; i++)
    cats.push({
      id: "x" + i,
      name: [
        "Coffee",
        "Pets",
        "Gifts",
        "Gym",
        "Books",
        "Phone",
        "Internet",
        "Kids",
        "Taxes",
        "Repairs",
        "Travel",
        "Charity",
      ][i],
      i: "star",
      c: "#5b6cff",
      kind: "out",
    });
  return {
    v: 6,
    settings: { cur: "USD", week: 1, clock: "24", lastCheck: t },
    accounts: [
      { id: "b", name: "Everyday account", type: "bank", currency: "USD", opening: 3200 },
      { id: "c", name: "Cash", type: "cash", currency: "USD", opening: 240 },
      {
        id: "k",
        name: "Credit card",
        type: "card",
        currency: "USD",
        opening: -350,
        limit: 2000,
        stmtDay: 5,
        dueDay: 25,
      },
      { id: "s", name: "Savings abroad", type: "savings", currency: "EUR", opening: 12000 },
    ],
    cats: nCats > 12 ? undefined : undefined,
    extraCats: cats,
    txns: tx,
    loans: [
      {
        id: "L1",
        kind: "lend",
        person: "Alexandra Johnson-Smith",
        account: "c",
        date: ago(5),
        note: "",
        status: "open",
      },
      { id: "L2", kind: "borrow", person: "Sam", account: "s", date: ago(8), note: "", status: "open" },
    ],
    assets: [{ id: "a1", name: "Laptop", i: "laptop", c: "#5b6cff", value: 1400, currency: "USD" }],
  };
}

/* runs in the page: problems with the layer on top (dialog, sheet2, sheet or the screen) */
function inspect() {
  const vw = innerWidth,
    vh = innerHeight,
    out = [];
  const layer =
    [...document.querySelectorAll("#pop > *, #sheet2 > *, #sheet > *")]
      .filter(e => e.offsetParent || e.getClientRects().length)
      .pop() || document.getElementById("app");
  const vis = e => {
    const s = getComputedStyle(e);
    if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = e =>
    (e.id
      ? "#" + e.id
      : e.tagName.toLowerCase() +
        (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : "")) +
    (e.dataset && e.dataset.act ? "[" + e.dataset.act + (e.dataset.v ? "=" + e.dataset.v : "") + "]" : "");
  // 1. the page never scrolls sideways
  if (document.documentElement.scrollWidth > vw + 1)
    out.push("page scrolls sideways: " + document.documentElement.scrollWidth + " > " + vw);
  // 2. text cut off: a text element wider/taller than its box, without an ellipsis, in a box that hides overflow
  const all = [...layer.querySelectorAll("*")].filter(vis);
  for (const e of all) {
    const s = getComputedStyle(e);
    const own = [...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim());
    if (!own) continue;
    const scrolls = /auto|scroll/.test(s.overflowX);
    if (
      e.scrollWidth > e.clientWidth + 1 &&
      s.overflowX !== "visible" &&
      !scrolls &&
      s.textOverflow !== "ellipsis" &&
      e.clientWidth > 0
    )
      out.push(
        "text cut off (width) " +
          name(e) +
          " '" +
          e.textContent.trim().slice(0, 30) +
          "' " +
          e.scrollWidth +
          ">" +
          e.clientWidth
      );
    if (
      e.scrollHeight > e.clientHeight + 2 &&
      s.overflowY === "hidden" &&
      !/-webkit-box/.test(s.display) &&
      e.clientHeight > 0 &&
      s.whiteSpace !== "nowrap"
    )
      out.push(
        "text cut off (height) " +
          name(e) +
          " '" +
          e.textContent.trim().slice(0, 30) +
          "' " +
          e.scrollHeight +
          ">" +
          e.clientHeight
      );
    // text past the screen edge (not inside something that scrolls sideways)
    const r = document.createRange();
    r.selectNodeContents(e);
    const b = s.overflowX === "visible" ? r.getBoundingClientRect() : e.getBoundingClientRect(); // clipped: its box
    let sc = e.parentElement,
      inScroller = false;
    while (sc && sc !== document.body) {
      if (/auto|scroll/.test(getComputedStyle(sc).overflowX)) inScroller = true;
      sc = sc.parentElement;
    }
    if (!inScroller && (b.right > vw + 1 || b.left < -1))
      out.push("text off screen " + name(e) + " '" + e.textContent.trim().slice(0, 30) + "'");
  }
  // 7. text too small to read (the smallest size per state is reported once)
  let tiny = null;
  for (const e of all) {
    if (![...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())) continue;
    const px = parseFloat(getComputedStyle(e).fontSize);
    if (px < (e.matches(".rt .cn, .rt .cp") ? 9 : 10) && (!tiny || px < tiny[0])) tiny = [px, e]; // ring names: see ringHTML
  }
  if (tiny)
    out.push(
      "text too small " +
        tiny[0].toFixed(1) +
        "px " +
        name(tiny[1]) +
        " '" +
        tiny[1].textContent.trim().slice(0, 20) +
        "'"
    );
  // 3. controls overlapping, 4. tap targets too small
  const ctl = all.filter(
    e =>
      e.matches("button, input, select, textarea, a[href], [role=switch]") &&
      !e.closest(".ring, .wheel, .cal, .mslider, .smchart, .sm, .strip")
  );
  const rects = ctl
    .map(e => [e, e.getBoundingClientRect()])
    .filter(([, r]) => r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw);
  for (let i = 0; i < rects.length; i++) {
    const [a, ra] = rects[i];
    if (ra.width < 32 || ra.height < 32) {
      if (!a.matches("input[type=search], .x, .chip, a"))
        out.push("small target " + name(a) + " " + Math.round(ra.width) + "x" + Math.round(ra.height));
    }
    for (let j = i + 1; j < rects.length; j++) {
      const [b, rb] = rects[j];
      if (a.contains(b) || b.contains(a)) continue;
      // the calculator keypad slides over the form on purpose (the form scrolls above it)
      if (!!a.closest(".calc") !== !!b.closest(".calc")) continue;
      const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left),
        y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (x > 2 && y > 2) out.push("overlap " + name(a) + " / " + name(b));
    }
  }
  // 5. ring icons and labels never overlap each other (only checked on the screen itself)
  const tiles =
    layer.id !== "app"
      ? []
      : [...document.querySelectorAll("#app .ring .cat .ci, #app .ring .cat .cn, #app .ring .cat .cp")]
          .filter(e => (vis(e) && e.textContent.trim() !== "") || e.classList.contains("ci"))
          .map(e => {
            const r = document.createRange();
            r.selectNodeContents(e);
            /* a label's visible part: its text, cut to its own box (long names end in an ellipsis) */
            const b = e.getBoundingClientRect(),
              tr = r.getBoundingClientRect();
            return [
              e,
              e.classList.contains("ci")
                ? b
                : {
                    left: Math.max(b.left, tr.left),
                    right: Math.min(b.right, tr.right),
                    top: tr.top,
                    bottom: tr.bottom,
                  },
            ];
          });
  for (let i = 0; i < tiles.length; i++)
    for (let j = i + 1; j < tiles.length; j++) {
      const [ea, a] = tiles[i],
        [eb, b] = tiles[j];
      if (ea.closest(".cat") === eb.closest(".cat")) continue;
      if (
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
      )
        out.push(
          "ring overlap " +
            ea.closest(".cat").dataset.v +
            "." +
            ea.className.split(" ")[0] +
            " / " +
            eb.closest(".cat").dataset.v +
            "." +
            eb.className.split(" ")[0]
        );
    }
  // 8. the amount being typed is never under the calculator keypad
  const pad = [...document.querySelectorAll(".calc")].find(vis),
    amt = document.querySelector(".amtwrap.calcing");
  if (pad && amt) {
    const a = amt.getBoundingClientRect(),
      k = pad.getBoundingClientRect();
    const under =
      Math.min(a.right, k.right) - Math.max(a.left, k.left) > 2 &&
      Math.min(a.bottom, k.bottom) - Math.max(a.top, k.top) > 2;
    if (under || a.top < 0 || a.bottom > vh + 1) out.push("amount hidden by the keypad");
  }
  // 9. a phone held sideways: the Home ring is wholly in view
  const ring = document.getElementById("ring");
  if (document.body.classList.contains("land") && ring && layer.id === "app" && scrollY === 0) {
    const r = ring.getBoundingClientRect();
    if (r.top < -1 || r.bottom > vh + 1)
      out.push("ring not wholly in view sideways " + Math.round(r.top) + ".." + Math.round(r.bottom));
    // and centred in the height: the room above and below it about equal
    if (Math.abs(r.top - (vh - r.bottom)) > 8)
      out.push("ring off centre sideways: " + Math.round(r.top) + " above, " + Math.round(vh - r.bottom) + " below");
  }
  // 6. a sheet or dialog fits the screen (its content scrolls inside)
  const box = layer.querySelector(".p, .dlg, [role=dialog]");
  if (box && box !== layer) {
    const r = box.getBoundingClientRect();
    if (r.height > vh + 1 || r.top < -1) out.push("layer taller than the screen " + Math.round(r.height) + " > " + vh);
    if (r.width > vw + 1) out.push("layer wider than the screen");
  }
  return [...new Set(out)];
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const summary = {};
  for (const dev of matrix) {
    const ctx = await browser.newContext({
      viewport: { width: dev.w, height: dev.h },
      screen: { width: dev.w, height: dev.h }, // the screen's shape tells a phone held sideways (phoneLand)
      deviceScaleFactor: 1,
      isMobile: true,
      reducedMotion: "reduce", // sheets and dialogs appear at once, so each state is measured settled
      hasTouch: true,
      locale: "en-US",
    });
    await ctx.addInitScript(s => {
      window.Android = {
        getColors: () => null,
        setBars() {},
        setReminders() {},
        takeActions: () => "[]",
        requestNotifications() {},
        saveFile() {},
        fontScale: () => s,
      };
      window.__fontScale = s;
    }, dev.s);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(appUrl);
    const tag = dev.id + "@" + dev.s;
    const states = [];
    const shot = async (label, open) => {
      await page.evaluate(() => {
        closeSheet();
        $("#pop").innerHTML = "";
        V.screen = "home";
        render();
        scrollTo(0, 0);
      });
      if (open) await open();
      await page.waitForTimeout(80);
      const probs = await page.evaluate(inspect);
      await page.screenshot({ path: OUT + "/" + tag + "-" + label + ".png" });
      states.push(label);
      if (probs.length) summary[tag + " " + label] = probs;
    };
    const seed = async nCats => {
      const t = await page.evaluate(() => today());
      const st = sampleState(t, nCats);
      await page.evaluate(st => {
        const extra = st.extraCats;
        delete st.extraCats;
        localStorage.setItem("tally:v1", JSON.stringify(st));
        localStorage.setItem("extra", JSON.stringify(extra));
      }, st);
      await page.reload();
      await page.evaluate(() => {
        const extra = JSON.parse(localStorage.getItem("extra") || "[]");
        extra.forEach(c => S.cats.splice(S.cats.filter(x => x.kind === "out").length, 0, c));
        save();
        render();
      });
    };
    // welcome
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await shot("welcome");
    await seed(12);
    const ev = f => () => page.evaluate(f);
    await shot("home", null);
    await shot(
      "home-check",
      ev(() => {
        S.settings.lastCheck = "";
        S.settings.remind.check = true;
        S.settings.remind.checkTime = "00:00";
        render();
      })
    );
    await page.evaluate(() => {
      S.settings.lastCheck = today();
      save();
    });
    await shot(
      "assets",
      ev(() => {
        V.screen = "assets";
        render();
      })
    );
    await shot(
      "liabilities",
      ev(() => {
        V.screen = "liabs";
        render();
      })
    );
    await shot(
      "history",
      ev(() => {
        V.screen = "history";
        render();
      })
    );
    await shot(
      "settings",
      ev(() => {
        V.screen = "settings";
        render();
      })
    );
    await shot(
      "settings-end",
      ev(() => {
        V.screen = "settings";
        render();
        scrollTo(0, document.body.scrollHeight);
      })
    );
    await shot(
      "spend",
      ev(() => txSheet(null, "expense", "groceries"))
    );
    await shot("spend-calc", async () => {
      await page.evaluate(() => txSheet(null, "expense", "groceries"));
      await page.click('#sheet [data-act="calc-toggle"]');
    });
    await shot(
      "transfer",
      ev(() => trSheet())
    );
    await shot(
      "account",
      ev(() => accOpen("b"))
    );
    await shot(
      "account-form",
      ev(() => accForm("b"))
    );
    await shot(
      "card",
      ev(() => accOpen("k"))
    );
    await shot(
      "card-form",
      ev(() => accForm("k"))
    );
    await shot(
      "lend-form",
      ev(() => loanForm("lend"))
    );
    await shot(
      "loan",
      ev(() => loanOpen("L1"))
    );
    await shot(
      "summary",
      ev(() => summarySheet())
    );
    await shot("summary-weeks", async () => {
      await page.evaluate(() => summarySheet());
      await page.click('#sheet [data-act="sm-mode"][data-v="w"]');
    });
    await shot("summary-months", async () => {
      await page.evaluate(() => summarySheet());
      await page.click('#sheet [data-act="sm-mode"][data-v="m"]');
    });
    await shot(
      "entries",
      ev(() => entriesSheet())
    );
    await shot(
      "period",
      ev(() => periodDialog(V))
    );
    await shot("date", async () => {
      await page.evaluate(() => txSheet(null, "expense", "groceries"));
      await page.click('#sheet [data-act="date-open"], #sheet .fieldbtn.date').catch(() => {});
    });
    await shot(
      "time",
      ev(() => timePicker("Evening nudge", "21:00", () => {}))
    );
    await shot(
      "currency",
      ev(() => curPicker("USD", () => {}))
    );
    await shot(
      "icons",
      ev(() => iconPicker("star", "#5b6cff", () => {}))
    );
    await shot(
      "ask",
      ev(() =>
        askDialog("Delete all data?", "Every account and entry on this phone. This can't be undone.", "Yes", () => {}, {
          danger: true,
        })
      )
    );
    await shot("transfer-fee", async () => {
      await page.evaluate(() => trSheet());
      await page.click('#sheet [data-act="tr-fee"]');
    });
    await shot(
      "draw-edit",
      ev(() => {
        loanOpen("L1");
        loanDrawEdit(S.txns.find(x => x.loan === "L1" && x.principal).id);
      })
    );
    await shot(
      "category-form",
      ev(() => catForm("groceries", "out"))
    );
    await shot(
      "asset-form",
      ev(() => assetForm("a1"))
    );
    await shot(
      "assets-all",
      ev(() => {
        S.accounts[1].archived = true;
        V.showArchived = true;
        V.showCleared = true;
        V.screen = "assets";
        render();
      })
    );
    await page.evaluate(() => {
      S.accounts[1].archived = false;
      V.showArchived = false;
      V.showCleared = false;
    });
    await shot(
      "history-select",
      ev(() => {
        V.screen = "history";
        render();
        V.sel = new Set();
        render();
      })
    );
    for (const tab of ["range", "month"])
      await shot("period-" + tab, async () => {
        await page.evaluate(() => periodDialog(V));
        await page.click('#pd [data-act="pd-tab"][data-v="' + tab + '"]');
      });
    await seed(24);
    await shot("home-24", null);
    await shot(
      "settings-24",
      ev(() => {
        V.screen = "settings";
        render();
        scrollTo(0, 600);
      })
    );
    if (errors.length) summary[tag + " errors"] = errors;
    console.log(tag + ": " + states.length + " states");
    await ctx.close();
  }
  /* an upright phone with its keyboard open (a short window on a tall screen) keeps the upright layout */
  {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 330 },
      screen: { width: 360, height: 800 },
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(appUrl);
    const t = await page.evaluate(() => today());
    await page.evaluate(
      st => localStorage.setItem("tally:v1", JSON.stringify(st)),
      Object.assign(sampleState(t, 12), { extraCats: undefined })
    );
    await page.reload();
    const cls = await page.evaluate(() => [
      document.body.classList.contains("land"),
      document.body.classList.contains("rail"),
    ]);
    ok(!cls[0] && !cls[1], "an upright phone with the keyboard open stays upright: " + JSON.stringify(cls));
    await ctx.close();
  }
  const keys = Object.keys(summary);
  for (const k of keys) console.log("  " + k + "\n    - " + summary[k].join("\n    - "));
  ok(keys.length === 0, "no layout problems in " + matrix.length + " sizes");
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e => {
  console.error(e);
  process.exit(1);
});
