#!/usr/bin/env node
// Lints the app's scripts the way the page loads them: every <script src> of index.html, in order, sharing one
// global scope. So a name defined in one file and used in another is fine, but a typo or a leftover is not.
// Problems are reported as file:line. Exits 1 on any error.

const fs = require("fs");
const path = require("path");
const { ESLint } = require("eslint");
const globals = require("globals");

const ASSETS = path.resolve(__dirname, "../app/src/main/assets");
const html = fs.readFileSync(path.join(ASSETS, "index.html"), "utf8");
const files = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => f !== "js/icons.js");

// one text, plus where each file starts in it
let text = "";
const starts = [];
for (const f of files) {
  starts.push({ file: "app/src/main/assets/" + f, line: text.split("\n").length });
  text += fs.readFileSync(path.join(ASSETS, f), "utf8") + "\n";
}
const where = line => {
  let s = starts[0];
  for (const x of starts) if (x.line <= line) s = x;
  return s.file + ":" + (line - s.line + 1);
};

(async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "script",
        globals: { ...globals.browser, Android: "readonly" },
      },
      rules: {
        "no-undef": "error",
        "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
        "no-redeclare": "error",
        "no-shadow": "error",
        "no-dupe-keys": "error",
        "no-duplicate-case": "error",
        "no-unreachable": "error",
        "no-self-assign": "error",
        "no-self-compare": "error",
        "no-const-assign": "error",
        "no-func-assign": "error",
        "no-cond-assign": ["error", "except-parens"],
        "no-eval": "error",
        "no-implied-eval": "error",
        "no-new-func": "error",
      },
    },
  });
  const [result] = await eslint.lintText(text);
  for (const m of result.messages) console.log(`${where(m.line)}:${m.column}  ${m.message}  (${m.ruleId})`);
  const errors = result.messages.length;
  console.log(errors ? `\n${errors} problem(s)` : `lint: ${files.length} scripts, no problems`);
  process.exit(errors ? 1 : 0);
})();
