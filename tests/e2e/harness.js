// Shared setup for the end-to-end suites.
//
// Every suite is a plain Node script that drives the web app in headless Chromium, with a
// stubbed `window.Android` bridge standing in for the native shell. Run them all with
// `npm test` from tests/ (see run.js), which serves the app and sets TALLY_URL.
//
// Environment:
//   TALLY_URL      page to open (default: http://localhost:8765/index.html)
//   CHROMIUM_PATH  Chromium binary to use instead of Playwright's own download

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const appUrl = process.env.TALLY_URL || 'http://localhost:8765/index.html';
const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

/** Screenshots land in tests/e2e/output/<suite>/ (git-ignored). */
function outDir(name) {
  const dir = path.join(__dirname, 'output', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { chromium, appUrl, launchOptions, outDir };
