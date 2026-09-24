/*
 * core.js — Shared building blocks: built-in categories and account types, the small inline SVG icons (P / ic), DOM and
 * date helpers, money formatting, the amount parser, and the snackbar / haptic feedback everything else uses.
 */
"use strict";

const CATS = [
  { id: "groceries", name: "Groceries", e: "🛒", c: "#15a06f", i: "shopping_cart", kind: "out" },
  { id: "food", name: "Eating out", e: "🍔", c: "#c98500", i: "restaurant", kind: "out" },
  { id: "transport", name: "Transport", e: "🚌", c: "#0a91b8", i: "directions_bus", kind: "out" },
  { id: "housing", name: "Rent", e: "🏠", c: "#7c9a0d", i: "home", kind: "out" },
  { id: "bills", name: "Bills", e: "📱", c: "#a646c9", i: "receipt_long", kind: "out" },
  { id: "shopping", name: "Shopping", e: "🛍️", c: "#e0578c", i: "shopping_bag", kind: "out" },
  { id: "education", name: "Study", e: "📚", c: "#4b5fd6", i: "school", kind: "out" },
  { id: "health", name: "Health", e: "💊", c: "#e0504f", i: "medication", kind: "out" },
  { id: "fun", name: "Fun", e: "🎬", c: "#2a78d6", i: "movie", kind: "out" },
  { id: "family", name: "Family", e: "🎁", c: "#df5f2b", i: "family_restroom", kind: "out" },
  { id: "fees", name: "Fees", e: "🏦", c: "#00897b", i: "account_balance", kind: "out" },
  { id: "other", name: "Other", e: "🧾", c: "#b0671f", i: "category", kind: "out" },
  { id: "income", name: "Income", e: "💰", c: "#15a06f", i: "payments", kind: "in" },
  { id: "gift", name: "Gift", e: "🎁", c: "#e0578c", i: "redeem", kind: "in" },
  { id: "otherin", name: "Other", e: "➕", c: "#5f7389", i: "add_circle", kind: "in" },
];
/* colours the built-in categories had before emblems (v<4), to upgrade only untouched ones */
const OLD_CAT_COLS = {
  groceries: "#2E9E6B",
  food: "#E08A2E",
  transport: "#3A7BD5",
  housing: "#8E5BD0",
  bills: "#D04E7C",
  shopping: "#C9A227",
  education: "#2BA3A3",
  health: "#D65A45",
  fun: "#6E7BE0",
  family: "#B8577E",
  fees: "#7A8190",
  other: "#9AA3B2",
  income: "#1D8A62",
  gift: "#B8577E",
  otherin: "#5E8A7A",
};
const OLD_DEFAULT_IDS = [
  "groceries",
  "food",
  "transport",
  "housing",
  "bills",
  "shopping",
  "education",
  "health",
  "fun",
  "fees",
  "family",
  "other",
  "income",
  "transfer",
];
const ICONS = window.TALLY_ICONS || {};
const TYPES = { bank: "Bank", wallet: "Mobile wallet", cash: "Cash", card: "Credit card", savings: "Savings" };
const P = {
  left: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
  right: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  swap: "M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z",
  swapv: "M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3 5 6.99h3V14h2V6.99h3L9 3z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  remove: "M19 13H5v-2h14v2z",
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  list: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
  down: "M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z",
  checked:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
  unchecked:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z",
  delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  checkbox:
    "M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
  selectall:
    "M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2zM7 17h10V7H7v10zm2-8h6v6H9V9z",
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  wallet:
    "M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
  card: "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z",
  event:
    "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
  schedule:
    "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
  history:
    "M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
  settings:
    "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  archive:
    "M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5 6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z",
  reset:
    "M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6 0 2.97-2.17 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93 0-4.42-3.58-8-8-8zm-6 8c0-1.65.67-3.15 1.76-4.24L6.34 7.34C4.9 8.79 4 10.79 4 13c0 4.08 3.05 7.44 7 7.93v-2.02c-2.83-.48-5-2.94-5-5.91z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
};
const ic = n => '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="' + P[n] + '"/></svg>';
const $ = s => document.querySelector(s);
const esc = s =>
  String(s ?? "").replace(
    /[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
const newId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => iso(new Date());
const parseISO = s => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const r2 = n => Math.round(n * 100) / 100;
function money(n, cur, short) {
  cur = cur || S.settings.cur;
  const o = { style: "currency", currency: cur, maximumFractionDigits: 2 };
  if (short) {
    o.currencyDisplay = "narrowSymbol";
    if (Math.abs(n) >= 1000) {
      o.maximumFractionDigits = 0;
      o.minimumFractionDigits = 0;
    }
  }
  try {
    return new Intl.NumberFormat(undefined, o).format(n);
  } catch (e) {
    return cur + " " + r2(n).toLocaleString();
  }
}
const signed = (n, cur) => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n), cur);
function shiftMonth(m, d) {
  let [y, mo] = m.split("-").map(Number);
  mo += d;
  while (mo < 1) {
    mo += 12;
    y--;
  }
  while (mo > 12) {
    mo -= 12;
    y++;
  }
  return y + "-" + pad(mo);
}
function monthLabel(m, always) {
  const [y, mo] = m.split("-").map(Number);
  const o = { month: "long" };
  if (always || y !== new Date().getFullYear()) o.year = "numeric";
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, o);
}
function dayLabel(d) {
  const x = parseISO(d);
  const o = { weekday: "short", day: "numeric", month: "short" };
  if (x.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
  return x.toLocaleDateString(undefined, o);
}
/* amount field: accepts "12.50", "12,50", and quick sums like "12+3.5" */
function evalAmt(v) {
  let s = String(v ?? "").replace(/\s+/g, "");
  if (!s) return null;
  if (/^[-+]?\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([-+](\d+\.?\d*|\.\d+))*$/.test(s)) return null;
  let tot = 0;
  s.replace(/([-+]?)(\d+\.?\d*|\.\d+)/g, (m, sg, n) => {
    tot += (sg === "-" ? -1 : 1) * parseFloat(n);
    return m;
  });
  return r2(tot);
}
let snackT = null,
  undoFn = null;
function snack(msg, undo) {
  undoFn = undo || null;
  $("#snack").innerHTML =
    '<div class="snack" role="status"><span>' +
    esc(msg) +
    "</span>" +
    (undo ? '<button data-act="undo">Undo</button>' : "") +
    "</div>";
  clearTimeout(snackT);
  snackT = setTimeout(
    () => {
      $("#snack").innerHTML = "";
      undoFn = null;
    },
    undo ? 5000 : 2600
  );
}
/* FX: one-shot feedback for the next render (FX.row flashes a row, FX.cat pops a ring tile, FX.center bumps the donut total) */
let FX = {};
/* short haptic tick (VIBRATE) */
const buzz = ms => {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
};
/* short label for date fields: Today / Yesterday / 22 Sep (year only if not this year) */
function shortDay(d) {
  const t = today();
  if (d === t) return "Today";
  if (d === addDays(t, -1)) return "Yesterday";
  if (d === addDays(t, 1)) return "Tomorrow";
  const x = parseISO(d),
    o = { day: "numeric", month: "short" };
  if (x.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
  return x.toLocaleDateString(undefined, o);
}
const byNewest = (a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0);
