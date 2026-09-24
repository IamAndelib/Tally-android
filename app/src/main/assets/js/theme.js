/*
 * theme.js — Material 3 colours: the baseline scheme lives in css/colors.css; on Android 12+ the phone's wallpaper palette
 * (Android.getColors) is turned into the same role tokens and written into <style id="dyn">.
 */
"use strict";

const TONES = [100, 99, 95, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
let SYS = null;
function hexRgb(h) {
  h = String(h).replace("#", "");
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function rgbHex(c) {
  return "#" + c.map(v => pad(Math.round(v).toString(16))).join("");
}
function tone(pal, t) {
  for (let i = 0; i < TONES.length - 1; i++) {
    const hi = TONES[i],
      lo = TONES[i + 1];
    if (t <= hi && t >= lo) {
      const a = hexRgb(pal[i]),
        b = hexRgb(pal[i + 1]),
        f = hi === lo ? 0 : (hi - t) / (hi - lo);
      return rgbHex(a.map((v, k) => v + (b[k] - v) * f));
    }
  }
  return pal[0];
}
function roles(p, dark) {
  const a1 = t => tone(p.a1, t),
    a2 = t => tone(p.a2, t),
    a3 = t => tone(p.a3, t),
    n1 = t => tone(p.n1, t),
    n2 = t => tone(p.n2, t);
  return dark
    ? {
        primary: a1(80),
        "on-primary": a1(20),
        "primary-container": a1(30),
        "on-primary-container": a1(90),
        "secondary-container": a2(30),
        "on-secondary-container": a2(90),
        tertiary: a3(80),
        "tertiary-container": a3(30),
        "on-tertiary-container": a3(90),
        surface: n1(6),
        "surface-low": n1(10),
        "surface-container": n1(12),
        "surface-high": n1(17),
        "surface-highest": n1(22),
        "on-surface": n1(90),
        "on-surface-variant": n2(80),
        outline: n2(60),
        "outline-variant": n2(30),
      }
    : {
        primary: a1(40),
        "on-primary": a1(100),
        "primary-container": a1(90),
        "on-primary-container": a1(10),
        "secondary-container": a2(90),
        "on-secondary-container": a2(10),
        tertiary: a3(40),
        "tertiary-container": a3(90),
        "on-tertiary-container": a3(10),
        surface: n1(98),
        "surface-low": n1(96),
        "surface-container": n1(94),
        "surface-high": n1(92),
        "surface-highest": n1(90),
        "on-surface": n1(10),
        "on-surface-variant": n2(30),
        outline: n2(50),
        "outline-variant": n2(80),
      };
}
const cssVars = o =>
  Object.entries(o)
    .map(([k, v]) => "--" + k + ":" + v)
    .join(";");
function readSys() {
  try {
    if (window.Android && Android.getColors) {
      const j = Android.getColors();
      SYS = j ? JSON.parse(j) : null;
    }
  } catch (e) {
    SYS = null;
  }
}
function applyTheme() {
  const root = document.documentElement,
    pref = S.settings.theme || "system";
  let mode = pref === "system" ? (SYS && typeof SYS.dark === "boolean" ? (SYS.dark ? "dark" : "light") : "") : pref;
  if (mode) root.dataset.theme = mode;
  else delete root.dataset.theme;
  const pals =
    SYS && ["a1", "a2", "a3", "n1", "n2"].every(k => Array.isArray(SYS[k]) && SYS[k].length === TONES.length);
  $("#dyn").textContent = pals
    ? ":root{" +
      cssVars(roles(SYS, false)) +
      "}" +
      '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){' +
      cssVars(roles(SYS, true)) +
      "}}" +
      ':root[data-theme="dark"]{' +
      cssVars(roles(SYS, true)) +
      "}"
    : "";
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const bg = getComputedStyle(root).getPropertyValue("--surface").trim();
  try {
    if (window.Android && Android.setBars) Android.setBars(bg, dark);
  } catch (e) {}
}
/* the phone's light/dark mode or wallpaper palette changed (window.tallyTheme, from MainActivity) */
function onSystemTheme(p) {
  try {
    SYS = typeof p === "string" ? JSON.parse(p) : p;
  } catch (e) {
    SYS = null;
  }
  applyTheme();
}
