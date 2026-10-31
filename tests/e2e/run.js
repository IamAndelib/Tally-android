#!/usr/bin/env node
// Runs every end-to-end suite (or the ones named on the command line) against the app,
// served from app/src/main/assets by a throwaway static server. Exits 1 if any suite fails.
//
//   node e2e/run.js                 all suites
//   node e2e/run.js 13 14           only suites whose file name starts with 13 or 14

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { serve } = require("./serve");

function runSuite(file, url) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [file], {
      env: { ...process.env, TALLY_URL: url },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", d => (out += d));
    child.stderr.on("data", d => (out += d));
    child.on("close", code => resolve({ code, out }));
  });
}

(async () => {
  const filters = process.argv.slice(2);
  const suites = fs
    .readdirSync(__dirname)
    .filter(f => /^\d\d-.+\.js$/.test(f))
    .filter(f => !filters.length || filters.some(p => f.startsWith(p)))
    .sort();

  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  let failed = 0;

  for (const suite of suites) {
    const { code, out } = await runSuite(path.join(__dirname, suite), url);
    const passed = code === 0;
    if (!passed) failed++;
    const checks = (out.match(/^PASS /gm) || []).length;
    console.log(`${passed ? "ok  " : "FAIL"}  ${suite}  (${checks} checks)`);
    if (!passed || process.env.VERBOSE) {
      process.stdout.write(out.replace(/^/gm, "      "));
    }
  }

  server.close();
  console.log(`\n${suites.length - failed}/${suites.length} suites passed`);
  process.exit(failed ? 1 : 0);
})();
