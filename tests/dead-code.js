#!/usr/bin/env node
// Finds what nothing uses: page code, click actions, bridge methods, page hooks, CSS classes, texts and Android
// resources. Offline and static (no browser): every script of index.html is parsed with espree (ESLint's own parser,
// installed with it), and the stylesheets, the catalogue, the Java code and the resource files are read as text. Each
// finding is reported as file:line; one listed in ALLOW (with its reason) is accepted. Exits 1 on any other. Part of
// npm run lint.
//
//   node dead-code.js            check the app
//   node dead-code.js --verbose  also list what ALLOW accepted
//
// What counts as "used" here is what can be shown without running the app; see each check's comment for what it
// can't see. It doesn't judge ids: several exist only for tests/e2e (#fee-btn, #pd-hint), which is fine.

const fs = require("fs");
const path = require("path");
const espree = require(require.resolve("espree", { paths: [path.dirname(require.resolve("eslint"))] }));

const ROOT = process.env.TALLY_ROOT || path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "app/src/main/assets");
const MAIN = path.join(ROOT, "app/src/main");
const JAVA = path.join(MAIN, "java/app/tally/expenses");
const read = f => fs.readFileSync(f, "utf8");
const lineAt = (s, i) => s.slice(0, i).split("\n").length;

/* findings that are fine, each with why; key "<check>:<name>" */
const ALLOW = {
  // e.g. "css-class:foo": "set by MainActivity on the WebView, not by the page",
};

const findings = [];
const report = (check, name, where, what) => findings.push({ check, name, where, what });

// ---- the page's scripts, as the page loads them
const html = read(path.join(ASSETS, "index.html"));
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => !f.startsWith("js/i18n/"));
const parsed = scripts.map(f => {
  const src = read(path.join(ASSETS, f));
  return {
    file: "app/src/main/assets/" + f,
    src,
    ast: espree.parse(src, { ecmaVersion: "latest", loc: true, range: true }),
  };
});
function walk(node, fn, parent = null) {
  fn(node, parent);
  for (const k of espree.VisitorKeys[node.type] || []) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && walk(c, fn, node));
    else if (v && typeof v.type === "string") walk(v, fn, node);
  }
}
/* every string the scripts hold: literals and template text, with where */
const strings = [];
for (const p of parsed)
  walk(p.ast, n => {
    if (n.type === "Literal" && typeof n.value === "string") strings.push({ v: n.value, p, n });
    else if (n.type === "TemplateElement") strings.push({ v: n.value.cooked || "", p, n });
  });
const at = (p, n) => p.file + ":" + n.loc.start.line;
const java = fs
  .readdirSync(JAVA)
  .filter(f => f.endsWith(".java"))
  .map(f => ({ file: "app/src/main/java/app/tally/expenses/" + f, src: read(path.join(JAVA, f)) }));
const javaAll = java.map(j => j.src).join("\n");

// ---- 1. top-level functions, constants and variables no running code can reach.
// A graph from the code that runs while the page loads (and the handlers it installs) to each declaration, through
// the references inside each declaration's functions. ESLint's no-unused-vars only sees names with no reference at
// all; this also finds a group that only refers to itself (a() calls b(), b() calls a(), nothing calls either).
// Can't see: a name reached through window[...] or a string (the scripts have none: lint forbids eval).
{
  const decls = new Map();
  const declNames = (id, out = []) => {
    walk(id, n => n.type === "Identifier" && out.push(n.name));
    return out;
  };
  for (const p of parsed)
    for (const s of p.ast.body) {
      if (s.type === "FunctionDeclaration") decls.set(s.id.name, { p, n: s, inner: [s] });
      if (s.type === "VariableDeclaration")
        for (const d of s.declarations) {
          const fns = [];
          if (d.init) walk(d.init, n => /Function/.test(n.type) && fns.push(n));
          for (const name of declNames(d.id)) decls.set(name, { p, n: d, inner: fns });
        }
    }
  const edges = new Map([["<load>", new Set()]]);
  for (const p of parsed) {
    /* which declaration owns a position: inside one of its functions, else the load-time code */
    const owners = [];
    for (const [name, d] of decls) if (d.p === p) d.inner.forEach(f => owners.push([f.range[0], f.range[1], name]));
    const ownerOf = i => {
      let best = null;
      for (const o of owners) if (i >= o[0] && i < o[1] && (!best || o[0] >= best[0])) best = o;
      return best ? best[2] : "<load>";
    };
    walk(p.ast, (n, parent) => {
      if (n.type !== "Identifier" || !decls.has(n.name)) return;
      if (parent && parent.type === "MemberExpression" && parent.property === n && !parent.computed) return;
      if (parent && parent.type === "Property" && parent.key === n && !parent.computed && !parent.shorthand) return;
      if (parent && (parent.type === "VariableDeclarator" || parent.type === "FunctionDeclaration") && parent.id === n)
        return;
      const o = ownerOf(n.range[0]);
      if (o === n.name) return;
      if (!edges.has(o)) edges.set(o, new Set());
      edges.get(o).add(n.name);
    });
  }
  const seen = new Set(["<load>"]),
    todo = ["<load>"];
  while (todo.length) for (const n of edges.get(todo.shift()) || []) if (!seen.has(n)) seen.add(n) && todo.push(n);
  for (const [name, d] of decls)
    if (!seen.has(name)) report("js", name, at(d.p, d.n), "declared, but no running code reaches it");
}

// ---- 2. click actions: every case of the dispatcher in events.js has an element that can carry it, and every
// data-act written into markup has a case. An action name built at run time ("rem-" + k) counts when its whole name
// is a string somewhere (the scripts write each one out).
{
  const ev = parsed.find(p => p.file.endsWith("js/events.js"));
  const handled = new Map();
  walk(ev.ast, n => {
    if (n.type === "SwitchCase" && n.test && n.test.type === "Literal") handled.set(n.test.value, n);
    if (n.type === "BinaryExpression" && n.operator === "===" && n.left.type === "Identifier" && n.left.name === "act")
      handled.set(n.right.value, n);
  });
  const caseNodes = new Set([...handled.values()].map(n => n.test || n.right));
  for (const [act, n] of handled) {
    const made = strings.some(s => !caseNodes.has(s.n) && (s.v === act || s.v.includes('data-act="' + act + '"')));
    if (!made) report("act", act, at(ev, n), "handled in events.js, but no element carries it");
  }
  for (const s of strings)
    for (const m of s.v.matchAll(/data-act="([\w-]+)"/g))
      if (!handled.has(m[1])) report("act", m[1], at(s.p, s.n), "written into markup, but events.js doesn't handle it");
}

// ---- 3. the bridge: every @JavascriptInterface method is called by the page, and every Android.x the page calls is one
{
  const ma = java.find(j => j.file.endsWith("MainActivity.java"));
  const methods = new Map();
  for (const m of ma.src.matchAll(/@JavascriptInterface\s+public\s+[\w<>[\]]+\s+(\w+)\s*\(/g))
    methods.set(m[1], ma.file + ":" + lineAt(ma.src, m.index + m[0].length));
  const called = new Map();
  for (const p of parsed)
    walk(p.ast, n => {
      if (n.type === "MemberExpression" && !n.computed && n.object.type === "Identifier" && n.object.name === "Android")
        called.set(n.property.name, at(p, n));
    });
  for (const [m, w] of methods) if (!called.has(m)) report("bridge", m, w, "a bridge method the page never calls");
  for (const [m, w] of called)
    if (!methods.has(m)) report("bridge", m, w, "the page calls Android." + m + ", which the shell doesn't have");
}

// ---- 4. page hooks: every window.tally* that js/main.js installs is called by the shell, and the other way round
{
  const installed = new Map();
  const mainJs = parsed.find(p => p.file.endsWith("js/main.js"));
  walk(mainJs.ast, n => {
    if (n.type === "Property" && n.key.type === "Identifier" && /^tally[A-Z]/.test(n.key.name))
      installed.set(n.key.name, at(mainJs, n));
  });
  const calls = new Map();
  for (const j of java)
    for (const m of j.src.matchAll(/window\.(tally[A-Z]\w*)/g)) calls.set(m[1], j.file + ":" + lineAt(j.src, m.index));
  for (const [h, w] of installed)
    if (!calls.has(h)) report("hook", h, w, "installed for the shell, which never calls it");
  for (const [h, w] of calls)
    if (!installed.has(h)) report("hook", h, w, "the shell calls it, but js/main.js doesn't install it");
}

// ---- 5. CSS: every class and id a selector names is written somewhere (index.html, or a word of a script string:
// "chip lead", " on", (cls || "emb")), and every class written into markup (class="…") has a rule or a script that
// looks for it (a selector string, classList). Can't see: a class built from pieces that never appear whole ("c" + 1).
{
  const words = new Set();
  for (const s of strings) s.v.split(/[^\w-]+/).forEach(w => w && words.add(w));
  html.split(/[^\w-]+/).forEach(w => w && words.add(w));
  const ruleNames = { cls: new Map(), id: new Map() };
  for (const f of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) {
    const file = "app/src/main/assets/" + f[1];
    const css = read(path.join(ROOT, file)).replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, " "));
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      const sel = m[1].trim();
      if (sel.startsWith("@") || /^(from|to|[\d.]+%)$/.test(sel)) continue;
      const bare = sel.replace(/\[[^\]]*\]/g, "").replace(/url\([^)]*\)/g, "");
      for (const x of bare.matchAll(/([.#])(-?[_a-zA-Z][\w-]*)/g)) {
        const map = x[1] === "." ? ruleNames.cls : ruleNames.id;
        if (!map.has(x[2])) map.set(x[2], file + ":" + lineAt(css, m.index + m[0].indexOf(m[1].trimStart())));
      }
    }
  }
  for (const [c, w] of ruleNames.cls) if (!words.has(c)) report("css-class", c, w, "a rule for a class nothing writes");
  for (const [c, w] of ruleNames.id) if (!words.has(c)) report("css-id", c, w, "a rule for an id nothing writes");
  const lookedFor = new Set();
  for (const s of strings) for (const m of s.v.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) lookedFor.add(m[1]);
  for (const p of parsed)
    walk(p.ast, n => {
      if (
        n.type === "CallExpression" &&
        n.callee.type === "MemberExpression" &&
        n.callee.object.type === "MemberExpression"
      )
        if (n.callee.object.property.name === "classList")
          n.arguments.forEach(a => a.type === "Literal" && typeof a.value === "string" && lookedFor.add(a.value));
    });
  for (const s of strings)
    for (const m of s.v.matchAll(/class="([^"]*)/g))
      for (const c of m[1].split(/\s+/))
        if (/^[\w-]+$/.test(c) && !ruleNames.cls.has(c) && !lookedFor.has(c))
          report("markup-class", c, at(s.p, s.n), "a class with no rule, which no script looks for");
}

// ---- 6. texts: every key of l10n/web/en.json can be asked for. T()/TH() arguments are read as the set of strings they
// can be: a literal, a ? b : c, a || b, and "prefix." + x, which stands for every key under that prefix whose last part
// is a value the code writes out (a string or a property name: "cash" in TYPES) or the shell sends (its error codes).
// A key passed along before reaching T() (noteShown(t, "loan.feeNote")) counts when it appears whole as a string.
{
  const flat = (o, pre = "") =>
    Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v, pre + k + ".") : [[pre + k, v]]));
  const enFile = "l10n/web/en.json";
  const en = read(path.join(ROOT, enFile));
  const keys = [...new Set(flat(JSON.parse(en)).map(([k]) => k.replace(/_(zero|one|two|few|many|other)$/, "")))];
  const ev = n => {
    if (!n) return ["*"];
    if (n.type === "Literal" && typeof n.value === "string") return [n.value];
    if (n.type === "ConditionalExpression") return [...ev(n.consequent), ...ev(n.alternate)];
    if (n.type === "LogicalExpression") return [...ev(n.left), ...ev(n.right)];
    if (n.type === "BinaryExpression" && n.operator === "+") {
      const a = ev(n.left),
        b = ev(n.right);
      return a.flatMap(x => b.map(y => x + y));
    }
    if (n.type === "TemplateLiteral") {
      let r = [""];
      n.quasis.forEach((q, i) => {
        r = r.map(x => x + q.value.cooked);
        if (i < n.expressions.length) {
          const e = ev(n.expressions[i]);
          r = r.flatMap(x => e.map(y => x + y));
        }
      });
      return r;
    }
    return ["*"];
  };
  const asked = [];
  for (const p of parsed)
    walk(p.ast, n => {
      if (n.type === "CallExpression" && n.callee.type === "Identifier" && /^(T|TH)$/.test(n.callee.name))
        for (const k of ev(n.arguments[0])) asked.push(k);
    });
  const exact = new Set(asked.filter(k => !k.includes("*")));
  const patterns = asked
    .filter(k => k.includes("*") && k !== "*")
    .map(
      k =>
        new RegExp(
          "^" +
            k
              .split("*")
              .map(s => s.replace(/\./g, "\\."))
              .join("([\\w.]+)") +
            "$"
        )
    );
  const whole = new Set(strings.map(s => s.v));
  /* a built key's variable part must be a value the code (or the shell, for its error codes) writes out: the word
     itself, or two words joined ("grey" + "Dark") */
  const values = new Set([...whole, ...[...javaAll.matchAll(/"(\w+)"/g)].map(m => m[1])]);
  for (const p of parsed)
    walk(p.ast, n => n.type === "Property" && n.key.type === "Identifier" && values.add(n.key.name));
  const isValue = v =>
    values.has(v) || [...v].some((_, i) => i > 0 && values.has(v.slice(0, i)) && values.has(v.slice(i)));
  const where = k => enFile + ":" + lineAt(en, en.indexOf('"' + k.split(".").pop() + '"'));
  for (const k of keys) {
    if (exact.has(k) || whole.has(k)) continue;
    const ms = patterns.map(re => k.match(re)).filter(Boolean);
    if (!ms.length) report("text", k, where(k), "a text no code asks for");
    else if (!ms.some(m => m.slice(1).every(isValue)))
      report(
        "text",
        k,
        where(k),
        "a text under a built key (" + k.split(".")[0] + ".…) whose last part the code never writes"
      );
  }
}

// ---- 7. Android resources: every value in res/values and every file resource is named by the Java code (R.x.y),
// a resource or the manifest (@x/y). An id (@+id/x) counts when the Java code names it.
{
  const files = [];
  const walkDir = d =>
    fs
      .readdirSync(d, { withFileTypes: true })
      .forEach(e => (e.isDirectory() ? walkDir(path.join(d, e.name)) : files.push(path.join(d, e.name))));
  walkDir(path.join(MAIN, "res"));
  const xml = files.filter(f => f.endsWith(".xml")).map(f => ({ f, src: read(f) }));
  const refs = new Set();
  const texts = [
    javaAll,
    read(path.join(MAIN, "AndroidManifest.xml")),
    read(path.join(ROOT, "app/build.gradle")),
  ].concat(xml.map(x => x.src));
  for (const t of texts) {
    for (const m of t.matchAll(/\bR\.(\w+)\.(\w+)/g)) refs.add(m[1] + "/" + m[2]);
    for (const m of t.matchAll(/@(\w+)\/([\w.]+)/g)) if (m[1] !== "android") refs.add(m[1] + "/" + m[2]);
    for (const m of t.matchAll(/parent="(?:@style\/)?([\w.]+)"/g)) refs.add("style/" + m[1]);
  }
  const rel = f => path.relative(ROOT, f);
  for (const x of xml) {
    const dir = path.basename(path.dirname(x.f));
    if (dir === "values") {
      for (const m of x.src.matchAll(/<(string|plurals|bool|color|dimen|style|integer)\s+name="([\w.]+)"/g))
        if (!refs.has(m[1] + "/" + m[2]) && !(m[1] === "string" && m[2] === "lang"))
          report("res", m[1] + "/" + m[2], rel(x.f) + ":" + lineAt(x.src, m.index), "a resource nothing names");
    } else if (!dir.startsWith("values")) {
      const type = dir.split("-")[0],
        name = path.basename(x.f, ".xml");
      if (!refs.has(type + "/" + name)) report("res", type + "/" + name, rel(x.f) + ":1", "a resource nothing names");
    }
    for (const m of x.src.matchAll(/@\+id\/(\w+)/g))
      if (
        !new RegExp("R\\.id\\." + m[1] + "\\b").test(javaAll) &&
        !new RegExp("@id/" + m[1] + "\\b").test(texts.join("\n"))
      )
        report("res", "id/" + m[1], rel(x.f) + ":" + lineAt(x.src, m.index), "an id the code never uses");
  }
}

// ---- 8. parameters: a top-level function's parameter that every call passes the same literal (true, "x") or that
// no call passes, so a branch on it can never go the other way. Functions also used as values (callbacks, hooks)
// are skipped: their callers can't be seen.
{
  const fns = new Map();
  for (const p of parsed)
    for (const s of p.ast.body) {
      const add = (name, fn) => fns.set(name, { p, fn, calls: [], value: false });
      if (s.type === "FunctionDeclaration") add(s.id.name, s);
      if (s.type === "VariableDeclaration")
        for (const d of s.declarations)
          if (d.init && /Function/.test(d.init.type) && d.id.type === "Identifier") add(d.id.name, d.init);
    }
  for (const p of parsed)
    walk(p.ast, (n, parent) => {
      if (n.type !== "Identifier" || !fns.has(n.name)) return;
      if (parent && parent.type === "MemberExpression" && parent.property === n && !parent.computed) return;
      if (parent && parent.type === "Property" && parent.key === n && !parent.shorthand) return;
      if (parent && (parent.type === "FunctionDeclaration" || parent.type === "VariableDeclarator") && parent.id === n)
        return;
      const f = fns.get(n.name);
      if (parent && parent.type === "CallExpression" && parent.callee === n) f.calls.push(parent.arguments);
      else f.value = true;
    });
  const lit = a => (a && a.type === "Literal" ? a.raw : null);
  for (const [name, f] of fns) {
    if (f.value || !f.calls.length || f.calls.some(c => c.some(a => a.type === "SpreadElement"))) continue;
    f.fn.params.forEach((prm, i) => {
      if (prm.type === "RestElement") return;
      const pname =
        prm.type === "Identifier" ? prm.name : prm.type === "AssignmentPattern" ? prm.left.name : "#" + (i + 1);
      const vals = new Set(f.calls.map(c => (c.length > i ? lit(c[i]) : "(none)")));
      if (vals.size === 1 && (f.calls.length > 1 || vals.has("(none)")) && !vals.has(null))
        report("param", name + "(" + pname + ")", at(f.p, prm), "every call passes " + [...vals][0]);
    });
  }
}

// ---- the result
const verbose = process.argv.includes("--verbose");
let bad = 0;
for (const x of findings) {
  const why = ALLOW[x.check + ":" + x.name];
  if (why) {
    if (verbose) console.log(`ok   ${x.where}  ${x.check} ${x.name}: ${why}`);
    continue;
  }
  bad++;
  console.log(`${x.where}  ${x.check} ${x.name}: ${x.what}`);
}
const stale = Object.keys(ALLOW).filter(k => !findings.some(x => x.check + ":" + x.name === k));
for (const k of stale) {
  bad++;
  console.log(`tests/dead-code.js  ALLOW has ${k}, which is no longer found: take it out`);
}
console.log(bad ? `\n${bad} unused thing(s)` : `dead code: ${parsed.length} scripts, nothing unused`);
process.exit(bad ? 1 : 0);
