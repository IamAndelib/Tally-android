/*
 * i18n.js — Tally's words in the phone's language: which language its texts use and which locale formats numbers and
 * dates (LOC), and the lookup of a text in the catalogues (js/i18n/<code>.js, made from l10n/web/<code>.json by
 * tools/gen_i18n.py): T() for plain text, TH() for HTML, plurals by each language's own rules.
 */
"use strict";

/* ui: the language of Tally's words, one with a catalogue; fmt: the locale numbers, dates and times are written in
   (undefined: the web view's own). On Android both come from the shell (Lang.java): ui is the translation Android picked
   for the app, fmt the per-app language or the phone's first language. Kept apart, so a phone in a language Tally isn't
   translated into still writes numbers its own way. */
const LOC = (() => {
  const has = l => Object.prototype.hasOwnProperty.call(window.I18N || {}, l);
  let ui = "",
    fmt;
  try {
    const o = JSON.parse(Android.getLocale());
    ui = String(o.ui || "");
    fmt = Intl.getCanonicalLocales(o.fmt)[0];
  } catch (e) {}
  if (!ui) {
    /* a browser: the first of its languages with a catalogue, by language and script (es-MX → es, pt-PT → pt-BR,
       zh-CN → zh-Hans, but not zh-TW, written in the other script) */
    const key = l => {
      try {
        const m = new Intl.Locale(l).maximize();
        return m.language + "-" + m.script;
      } catch (e) {
        return String(l).toLowerCase();
      }
    };
    const langs = Object.keys(window.I18N || {});
    for (const l of navigator.languages || [navigator.language]) {
      ui = langs.find(c => c.toLowerCase() === String(l).toLowerCase()) || langs.find(c => key(c) === key(l)) || "";
      if (ui) break;
    }
  }
  return { ui: has(ui) ? ui : "en", fmt };
})();
document.documentElement.lang = LOC.ui;

/* the catalogues as {key: text}, each parsed the first time it's needed (only the active language and English) */
const I18N_CAT = {};
const i18nCat = l => I18N_CAT[l] || (I18N_CAT[l] = JSON.parse((window.I18N || {})[l] || "{}"));
const i18nGet = k => {
  const a = i18nCat(LOC.ui)[k];
  return a != null ? a : i18nCat("en")[k];
};
let PLURALS = null,
  COUNT_NF = null;
/* the text for key, with each {{name}} filled in from vars; with a numeric vars.count and plural forms, the one the
   language needs (key_one, key_few, key_other, …). A missing key shows as itself and is reported. */
function i18nText(key, vars, html) {
  let k = key;
  if (vars && typeof vars.count === "number" && i18nGet(key + "_other") != null) {
    PLURALS = PLURALS || new Intl.PluralRules(LOC.ui);
    k = key + "_" + PLURALS.select(vars.count);
    if (i18nGet(k) == null) k = key + "_other";
  }
  const s = i18nGet(k);
  if (s == null) {
    console.error("i18n: missing " + k);
    return html ? esc(key) : key;
  }
  return (html ? esc(s) : s).replace(/\{\{(\w+)\}\}/g, (m, n) => {
    let v = vars ? vars[n] : undefined;
    if (v == null) {
      console.error("i18n: " + k + " needs {{" + n + "}}");
      return "";
    }
    if (n === "count" && typeof v === "number") {
      COUNT_NF = COUNT_NF || new Intl.NumberFormat(LOC.fmt);
      v = COUNT_NF.format(v);
    }
    return html ? (v.html != null ? v.html : esc(v)) : String(v);
  });
}
/* a text as plain text: for textContent, snack(), askDialog() and what goes to the shell */
const T = (key, vars) => i18nText(key, vars, false);
/* a text as HTML: the text and each value escaped, except values given as {html: …} (a name in bdi(), an icon) */
const TH = (key, vars) => i18nText(key, vars, true);
/* plain-text sentences one after another: a space between them, none after a full-width stop (Chinese 。！？) */
const sentences = (...a) =>
  a
    .filter(Boolean)
    .join(" ")
    .replace(/([。！？]) /g, "$1");
