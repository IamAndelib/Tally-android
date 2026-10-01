// Shared setup for the end-to-end suites.
//
// Every suite is a plain Node script that drives the web app in headless Chromium, with a
// stubbed `window.Android` bridge standing in for the native shell. Run them all with
// `npm test` from tests/ (see run.js), which serves the app and sets TALLY_URL.
//
// Environment:
//   TALLY_URL      page to open (default: http://localhost:8765/index.html)
//   CHROMIUM_PATH  Chromium binary to use instead of Playwright's own download
//   TALLY_TODAY    the date the suites run on (default 2026-06-17, a mid-month Wednesday), e.g. 2026-10-01 to
//                  check the first of a month
//
// Test clock: so results don't depend on the day they run, both the suites (Node) and every page see TALLY_TODAY as
// today, at the real time of day. Only the date moves; time still passes normally.

const fs = require("fs");
const path = require("path");
const playwright = require("playwright");

const appUrl = process.env.TALLY_URL || "http://localhost:8765/index.html";
const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

const today = process.env.TALLY_TODAY || "2026-06-17";
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("TALLY_TODAY must be YYYY-MM-DD, not " + today);
const shift = (() => {
  const [y, m, d] = today.split("-").map(Number),
    now = new Date();
  return new Date(y, m - 1, d).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
})();
/* the same Date, moved by `shift` ms whenever it means "now"; runs in Node and, as a string, in every page */
function shiftDate(ms) {
  const Real = Date;
  class TestDate extends Real {
    constructor(...a) {
      if (a.length) super(...a);
      else super(Real.now() + ms);
    }
    static now() {
      return Real.now() + ms;
    }
  }
  globalThis.Date = TestDate;
}
shiftDate(shift);
const clockScript = "(" + shiftDate.toString() + ")(" + shift + ")";

/* playwright's chromium, with the test clock in every browser context */
const chromium = {
  async launch(opts) {
    const browser = await playwright.chromium.launch(opts);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async o => {
      const ctx = await newContext(o);
      await ctx.addInitScript(clockScript);
      return ctx;
    };
    return browser;
  },
};

/** Screenshots land in tests/e2e/output/<suite>/ (git-ignored). */
function outDir(name) {
  const dir = path.join(__dirname, "output", name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { chromium, appUrl, launchOptions, outDir };
