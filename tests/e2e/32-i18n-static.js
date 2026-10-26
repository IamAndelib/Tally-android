// Translations, checked without a browser: every catalogue has the same texts as English with the same {{values}} and
// the plural forms its language needs; every text the code asks for exists; the generated catalogue scripts are up to
// date; Android's string files match each other; and the one list of languages is the same everywhere it appears
// (catalogues, index.html, Android's folders and language list, the build's language filter, the store listings).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
const ROOT = path.resolve(__dirname, "../..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = f => fs.existsSync(path.join(ROOT, f));
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/* each catalogue code → its Android resource folder and its store-listing folder */
const ANDROID = {
  en: "values",
  es: "values-es",
  "pt-BR": "values-pt",
  fr: "values-fr",
  de: "values-de",
  ru: "values-ru",
  "zh-Hans": "values-b+zh+Hans",
  id: "values-in",
  tr: "values-tr",
};
const STORE = {
  en: "en-US",
  es: "es-ES",
  "pt-BR": "pt-BR",
  fr: "fr-FR",
  de: "de-DE",
  ru: "ru-RU",
  "zh-Hans": "zh-CN",
  id: "id",
  tr: "tr-TR",
};

const flat = (o, pre = "") =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v, pre + k + ".") : [[pre + k, v]]));
const codes = fs
  .readdirSync(path.join(ROOT, "l10n/web"))
  .filter(f => f.endsWith(".json"))
  .map(f => f.slice(0, -5))
  .sort();
const cats = Object.fromEntries(
  codes.map(c => [c, Object.fromEntries(flat(JSON.parse(read("l10n/web/" + c + ".json"))))])
);
const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = k => k.replace(PLURAL, "");
const vars = s =>
  [...new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))]
    .filter(v => v !== "count")
    .sort()
    .join(",");

// ---- 1. the catalogues
ok(codes.includes("en"), "English is the source catalogue");
for (const c of codes) ok(!!ANDROID[c] && !!STORE[c], c + ": a known language code");
const en = cats.en;
for (const c of codes) {
  const cat = cats[c],
    rules = new Intl.PluralRules(c).resolvedOptions().pluralCategories;
  const want = new Set(Object.keys(en).map(base)),
    got = new Set(Object.keys(cat).map(base));
  const missing = [...want].filter(k => !got.has(k)),
    extra = [...got].filter(k => !want.has(k));
  ok(!missing.length, c + ": every text translated" + (missing.length ? ": " + missing.slice(0, 10) : ""));
  ok(!extra.length, c + ": no text English doesn't have" + (extra.length ? ": " + extra.slice(0, 10) : ""));
  const bad = [];
  for (const [k, v] of Object.entries(cat)) {
    if (typeof v !== "string" || !v.trim()) bad.push(k + " is empty");
    else if (/[<>]|&\w+;|&#/.test(v)) bad.push(k + " has markup");
    const e = en[k] != null ? en[k] : en[base(k) + "_other"];
    if (e != null && vars(v) !== vars(e)) bad.push(k + " values " + vars(v) + " ≠ " + vars(e));
    if (PLURAL.test(k) && !/\{\{count\}\}/.test(v) && rules.length > 1 && !k.endsWith("_one") && !k.endsWith("_zero"))
      bad.push(k + " lacks {{count}}");
  }
  // plural keys: every form the language uses, and none it doesn't
  for (const k of new Set(
    Object.keys(cat)
      .filter(x => PLURAL.test(x))
      .map(base)
  )) {
    const forms = Object.keys(cat)
      .filter(x => base(x) === k && PLURAL.test(x))
      .map(x => x.match(PLURAL)[1]);
    for (const r of rules) if (!forms.includes(r)) bad.push(k + "_" + r + " missing");
    for (const f of forms) if (!rules.includes(f)) bad.push(k + "_" + f + " isn't a " + c + " plural form");
  }
  ok(!bad.length, c + ": texts well formed" + (bad.length ? ":\n  " + bad.slice(0, 20).join("\n  ") : ""));
}

// ---- 2. every text the code asks for exists in English (T("…") / TH("…") with a literal key)
const JS = path.join(ROOT, "app/src/main/assets/js");
const src = fs
  .readdirSync(JS)
  .filter(f => f.endsWith(".js"))
  .map(f => fs.readFileSync(path.join(JS, f), "utf8"))
  .join("\n");
const asked = [...src.matchAll(/\bTH?\(\s*"([\w.]*\w)"(?!\s*\+)/g)].map(m => m[1]);
const enBase = new Set(Object.keys(en).map(base));
const unknown = [...new Set(asked.filter(k => !(k in en) && !enBase.has(k)))];
ok(!unknown.length, "every text the code asks for is in English" + (unknown.length ? ": " + unknown : ""));
// keys built from a prefix ("cat." + id) aren't seen above; the rest should all be used
const PREFIXES = [...new Set([...src.matchAll(/\bTH?\(\s*"([\w.]+\.)"\s*\+/g)].map(m => m[1]))];
const unused = [...enBase].filter(k => !asked.includes(k) && !PREFIXES.some(p => k.startsWith(p)));
if (unused.length) console.log("note: texts no code asks for by name: " + unused.join(", "));

// ---- 3. the generated catalogue scripts match the catalogues
let gen = "";
try {
  gen = execFileSync("python3", [path.join(ROOT, "tools/gen_i18n.py"), "--check"], { encoding: "utf8" });
} catch (e) {
  gen = String(e.stdout) + String(e.stderr);
}
ok(/up to date/.test(gen), "js/i18n/ is up to date: " + gen.trim());

// ---- 4. one list of languages everywhere
const html = read("app/src/main/assets/index.html");
const tags = [...html.matchAll(/<script src="js\/i18n\/([\w-]+)\.js"/g)].map(m => m[1]);
ok(same(tags, codes), "index.html loads every catalogue: " + tags);
ok(
  html.indexOf('src="js/i18n/') < html.indexOf('src="js/i18n.js"') &&
    html.indexOf('src="js/i18n.js"') < html.indexOf('src="js/core.js"'),
  "index.html: the catalogues, then i18n.js, then the app"
);
const RES = "app/src/main/res/";
const folders = fs.readdirSync(path.join(ROOT, RES)).filter(f => fs.existsSync(path.join(ROOT, RES, f, "lang.xml")));
ok(
  same(
    folders,
    codes.map(c => ANDROID[c])
  ),
  "a lang.xml in each language's folder: " + folders
);
for (const c of codes) {
  const f = RES + ANDROID[c] + "/lang.xml";
  ok(
    exists(f) && new RegExp('<string name="lang" translatable="false">' + c + "</string>").test(read(f)),
    f + " names " + c
  );
}
const gradle = read("app/build.gradle");
const rc = (gradle.match(/resourceConfigurations\s*\+=\s*\[([^\]]*)\]/) || [, ""])[1]
  .split(",")
  .map(s => s.trim().replace(/^['"]|['"]$/g, ""))
  .filter(Boolean);
ok(
  same(
    rc,
    codes.map(c => ANDROID[c].replace(/^values-?/, "") || "en")
  ),
  "build.gradle keeps only these languages: " + rc
);
const lc = exists(RES + "xml/locales_config.xml") ? read(RES + "xml/locales_config.xml") : "";
const listed = [...lc.matchAll(/<locale android:name="([^"]+)"/g)].map(m => m[1]);
ok(same(listed, codes), "Android's language list (locales_config.xml): " + listed);
ok(
  /android:localeConfig="@xml\/locales_config"/.test(read("app/src/main/AndroidManifest.xml")),
  "the manifest names it"
);
const store = fs.readdirSync(path.join(ROOT, "fastlane/metadata/android"));
for (const c of codes) ok(store.includes(STORE[c]), "a store listing in " + STORE[c]);

// ---- 5. Android's string files: the same names and %1$s values as English, apostrophes escaped
const strings = f => {
  const x = read(f),
    o = {};
  for (const m of x.matchAll(/<(string|plurals) name="(\w+)"([^>]*)>([\s\S]*?)<\/\1>/g))
    o[m[2]] = { attrs: m[3], body: m[4] };
  return o;
};
const enS = strings(RES + "values/strings.xml");
for (const c of codes.filter(x => x !== "en")) {
  const f = RES + ANDROID[c] + "/strings.xml";
  if (!exists(f)) {
    ok(false, f + " exists");
    continue;
  }
  const s = strings(f),
    bad = [];
  const want = Object.keys(enS).filter(k => !/translatable="false"/.test(enS[k].attrs));
  for (const k of want) if (!s[k]) bad.push(k + " missing");
  for (const k of Object.keys(s)) if (!want.includes(k)) bad.push(k + " not in English (or not translatable)");
  const args = b => [...new Set(b.match(/%\d\$[sd]/g) || [])].sort().join();
  for (const k of want) if (s[k] && args(s[k].body) !== args(enS[k].body)) bad.push(k + " values differ");
  for (const k of Object.keys(s)) if (/(^|[^\\])'/.test(s[k].body)) bad.push(k + " has an unescaped '");
  ok(!bad.length, f + " matches English" + (bad.length ? ":\n  " + bad.join("\n  ") : ""));
}
const javaDir = path.join(ROOT, "app/src/main/java/app/tally/expenses");
const java = fs
  .readdirSync(javaDir)
  .map(f => fs.readFileSync(path.join(javaDir, f), "utf8"))
  .join("\n");
const allS = new Set(
  [
    ...read(RES + "values/strings.xml").matchAll(/name="(\w+)"/g),
    ...read(RES + "values/lang.xml").matchAll(/name="(\w+)"/g),
  ].map(m => m[1])
);
const usedS = [...new Set([...java.matchAll(/R\.string\.(\w+)/g)].map(m => m[1]))];
const noS = usedS.filter(k => !allS.has(k));
ok(!noS.length, "every R.string the Java code uses exists" + (noS.length ? ": " + noS : ""));

console.log(fails ? fails + " FAILED" : "ALL PASSED");
process.exitCode = fails ? 1 : 0;
