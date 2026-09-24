/*
 * calculator.js — The calculator that docks under any amount field: its key panel, a synthetic caret that can be moved by
 * tapping (the field is read-only while the calculator is open), and evaluation with × ÷ before + −.
 */
"use strict";

const CALC_ICON =
  '<svg viewBox="0 -960 960 960" class="ic" aria-hidden="true"><path fill="currentColor" d="' +
  (ICONS.calculate ? ICONS.calculate[0] : "") +
  '"/></svg>';
const calcBtn = id =>
  '<button type="button" class="icon calcbtn" data-act="calc-toggle" data-v="' +
  id +
  '" aria-label="Calculator" aria-expanded="false">' +
  CALC_ICON +
  "</button>";
const CALC_KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "⌫", "0", ".", "+"];
const calcPanelHtml = id =>
  '<div class="calc" id="calc-' +
  id +
  '" hidden>' +
  CALC_KEYS.map(
    k =>
      '<button type="button" class="' +
      (k === "⌫" ? "del" : /[+−×÷]/.test(k) ? "op" : "") +
      '" data-act="calc-key" data-v="' +
      esc(k) +
      '">' +
      esc(k) +
      "</button>"
  ).join("") +
  "</div>";
/* a field's amount box: currency label, the input, the calculator toggle, and its (hidden) panel.
   o: {curId} id for the currency label (so it can follow the chosen account), {label} for screen readers, {placeholder} */
function amtField(id, cur, val, o = {}) {
  return (
    '<div class="amtwrap"><span class="cur"' +
    (o.curId ? ' id="' + o.curId + '"' : "") +
    ">" +
    esc(cur) +
    '</span><span class="amtbox"><input id="' +
    id +
    '" inputmode="decimal" autocomplete="off" placeholder="' +
    esc(o.placeholder ?? "0") +
    '" value="' +
    esc(val || "") +
    '" aria-label="' +
    esc(o.label || "Amount") +
    '"><span class="caretmirror" id="cm-' +
    id +
    '" data-act="calc-pos" data-v="' +
    id +
    '" hidden aria-hidden="true"></span></span>' +
    calcBtn(id) +
    "</div>" +
    calcPanelHtml(id)
  );
}
/* left-to-right with standard × ÷ before + − precedence (no parentheses — this is a phone calculator, not a parser) */
function calcEval(expr) {
  const m = String(expr || "")
    .replace(/−/g, "-")
    .match(/\d+\.?\d*|\.\d+|[+\-×÷]/g);
  if (!m || !m.length) return null;
  let i = 0,
    sign = 1;
  if (m[i] === "-") {
    sign = -1;
    i++;
  } else if (m[i] === "+") {
    i++;
  }
  if (i >= m.length || !/^[\d.]/.test(m[i])) return null;
  let val = parseFloat(m[i]);
  if (isNaN(val)) return null;
  i++;
  const terms = [];
  while (i < m.length) {
    const op = m[i];
    if (op === "×" || op === "÷") {
      const n = parseFloat(m[i + 1]);
      if (isNaN(n)) return null;
      if (op === "÷") {
        if (!n) return null;
        val /= n;
      } else val *= n;
      i += 2;
    } else if (op === "+" || op === "-") {
      terms.push(sign * val);
      sign = op === "-" ? -1 : 1;
      val = parseFloat(m[i + 1]);
      if (isNaN(val)) return null;
      i += 2;
    } else return null;
  }
  terms.push(sign * val);
  const tot = terms.reduce((a, b) => a + b, 0);
  return isFinite(tot) ? r2(tot) : null;
}
let CALC = null;
/* the calculator's amount field is readOnly (so it can't show a native caret) — this mirrors its text with a
   blinking synthetic one on top while the calculator is open */
function calcMirrorSync(id) {
  const mirror = $("#cm-" + id);
  if (!mirror) return;
  if (!CALC) {
    mirror.innerHTML = "";
    return;
  }
  const p = Math.max(0, Math.min(CALC.expr.length, CALC.pos));
  mirror.innerHTML = esc(CALC.expr.slice(0, p)) + '<span class="blink"></span>' + esc(CALC.expr.slice(p));
}
/* maps a tap's screen point to a character offset in CALC.expr, via the mirror's own text nodes */
function calcPosFromPoint(mirror, x, y) {
  if (!document.caretRangeFromPoint) return null;
  const r = document.caretRangeFromPoint(x, y);
  if (!r || !mirror.contains(r.startContainer)) return null;
  let pos = 0;
  for (const n of mirror.childNodes) {
    if (n === r.startContainer) return pos + r.startOffset;
    pos += n.nodeType === 3 ? n.textContent.length : 0;
  }
  return CALC ? CALC.expr.length : 0;
}
function calcOpen(id, btn) {
  document.querySelectorAll(".calc:not([hidden])").forEach(p => (p.hidden = true));
  document
    .querySelectorAll('[data-act="calc-toggle"][aria-expanded="true"]')
    .forEach(b => b.setAttribute("aria-expanded", "false"));
  const inp = $("#" + id),
    start = inp ? inp.value.replace(/[^0-9.+\-×÷−]/g, "") : "";
  CALC = { id, expr: start, pos: start.length };
  if (inp) {
    inp.readOnly = true;
    inp.setAttribute("inputmode", "none");
    inp.focus({ preventScroll: true });
    const box = inp.closest(".amtbox");
    if (box) box.classList.add("calcing");
  }
  const mirror = $("#cm-" + id);
  if (mirror) mirror.hidden = false;
  calcMirrorSync(id);
  const panel = $("#calc-" + id);
  if (panel) panel.hidden = false;
  if (btn) btn.setAttribute("aria-expanded", "true");
  if (inp) setTimeout(() => inp.scrollIntoView({ block: "center", behavior: "auto" }), 0);
}
function calcClose(id, btn, use) {
  const inp = $("#" + id);
  if (use && CALC && CALC.id === id && CALC.expr) {
    const val = calcEval(CALC.expr);
    if (val != null && inp) inp.value = String(val);
  }
  if (inp) {
    inp.readOnly = false;
    inp.setAttribute("inputmode", "decimal");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    const box = inp.closest(".amtbox");
    if (box) box.classList.remove("calcing");
  }
  const mirror = $("#cm-" + id);
  if (mirror) {
    mirror.hidden = true;
    mirror.innerHTML = "";
  }
  const panel = $("#calc-" + id);
  if (panel) panel.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
  if (CALC && CALC.id === id) CALC = null;
}
/* the field's calculator icon: opens the calculator, or evaluates, uses the result and closes it */
function calcToggle(id, btn) {
  const panel = $("#calc-" + id);
  if (!panel) return;
  if (panel.hidden) calcOpen(id, btn);
  else calcClose(id, btn, true);
}
/* a tap on the field while the calculator is open moves the caret there */
function calcTapCaret(id, mirror, x, y) {
  if (!CALC || CALC.id !== id) return;
  const pos = calcPosFromPoint(mirror, x, y);
  if (pos != null) {
    CALC.pos = pos;
    calcMirrorSync(id);
  }
}
/* one calculator key, applied at the caret: ⌫ deletes before it, an operator right after another replaces it,
   a number gets at most one ".", a leading operator can only be − */
function calcKey(k) {
  if (!CALC) return;
  const before = CALC.expr.slice(0, CALC.pos),
    after = CALC.expr.slice(CALC.pos),
    OP = /[+−×÷]/;
  if (k === "⌫") {
    if (!before) return;
    CALC.expr = before.slice(0, -1) + after;
    CALC.pos--;
  } else if (OP.test(k)) {
    if (!before && k !== "−") return;
    if (before && OP.test(before.slice(-1))) CALC.expr = before.slice(0, -1) + k + after;
    else {
      CALC.expr = before + k + after;
      CALC.pos++;
    }
  } else if (k === ".") {
    const num = (before.match(/[0-9.]*$/) || [""])[0] + (after.match(/^[0-9.]*/) || [""])[0];
    if (num.includes(".")) return;
    CALC.expr = before + "." + after;
    CALC.pos++;
  } else {
    CALC.expr = before + k + after;
    CALC.pos++;
  }
  const inp = $("#" + CALC.id);
  if (inp) {
    inp.value = CALC.expr;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }
  calcMirrorSync(CALC.id);
}
