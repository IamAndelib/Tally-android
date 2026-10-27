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
// Language: every page shows Tally's English texts unless a context asks for others with `uiLang` (the browser's
// languages, e.g. { uiLang: "de" } or { uiLang: ["nb", "de"] }); the context's `locale` still sets how numbers and
// dates are written, as on a phone whose language Tally isn't translated into. A text missing from the catalogue fails
// the suite.
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
/* the same wall-clock time on TALLY_TODAY (setFullYear keeps it across a daylight-saving change, where a difference of
   midnights would move it by an hour, onto the wrong day near midnight) */
const shift = (() => {
  const [y, m, d] = today.split("-").map(Number),
    now = new Date(),
    then = new Date(now.getTime());
  then.setFullYear(y, m - 1, d);
  return then.getTime() - now.getTime();
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

/* a missing text or value reported by js/i18n.js fails the suite, whatever its own checks said */
let i18nErrors = 0;
process.on("exit", () => {
  if (i18nErrors) process.exitCode = 1;
});

/* playwright's chromium, with the test clock and the texts' language in every browser context */
const chromium = {
  async launch(opts) {
    const browser = await playwright.chromium.launch(opts);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (o = {}) => {
      const { uiLang = "en", ...rest } = o;
      const ctx = await newContext(rest);
      await ctx.addInitScript(clockScript);
      await ctx.addInitScript(l => {
        Object.defineProperty(Navigator.prototype, "languages", { get: () => l, configurable: true });
        Object.defineProperty(Navigator.prototype, "language", { get: () => l[0], configurable: true });
      }, [].concat(uiLang));
      ctx.on("console", m => {
        if (m.type() === "error" && m.text().startsWith("i18n: ")) {
          i18nErrors++;
          console.log("FAIL " + m.text());
        }
      });
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
