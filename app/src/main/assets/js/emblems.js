/*
 * emblems.js — Emblems (a Material Symbols glyph from icons.js on a filled colour circle, emoji as a fallback), the colour
 * palette and custom colours, account types (built-in and the user's own) and the icon picker.
 */
"use strict";

/* default colours: validated with a colour-blind-safe check (OKLab ΔE) in ring order on the light and dark surfaces;
   the last six are extra choices for the user */
const PALETTE = [
  "#15a06f",
  "#c98500",
  "#0a91b8",
  "#7c9a0d",
  "#a646c9",
  "#e0578c",
  "#4b5fd6",
  "#e0504f",
  "#2a78d6",
  "#df5f2b",
  "#00897b",
  "#b0671f",
  "#5f7389",
  "#c2185b",
  "#689f38",
  "#6a3fb5",
  "#0288d1",
  "#a1887f",
];
const TYPE_ICON = {
  bank: "account_balance",
  wallet: "mobile",
  cash: "payments",
  card: "credit_card",
  savings: "savings",
};
const TYPE_COL = { bank: "#2a78d6", wallet: "#e0578c", cash: "#15a06f", card: "#4b5fd6", savings: "#c98500" };
/* white or near-black glyph, whichever reads better on the circle (lumOf: theme.js) */
const glyphOn = bg => {
  const L = lumOf(bg);
  return 1.05 / (L + 0.05) >= (L + 0.05) / (lumOf("#1b1b1f") + 0.05) ? "#ffffff" : "#1b1b1f";
};
function emblem(o, cls) {
  const c = (o && o.c) || "#7a8190",
    fg = glyphOn(c),
    p = o && o.i && ICONS[o.i];
  return (
    '<span class="' +
    (cls || "emb") +
    ' emb" style="background:' +
    c +
    ";--ec:" +
    c +
    ";color:" +
    fg +
    '">' +
    (p
      ? '<svg viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="' + p[0] + '"/></svg>'
      : '<span class="emo">' + esc((o && o.e) || "•") + "</span>") +
    "</span>"
  );
}
/* account types: the built-in five plus the user's own (S.types) */
const ctype = k => (S.types || []).find(t => t.id === k);
const typeName = k => (TYPES[k] ? T("type." + k) : (ctype(k) || {}).name || T("account.fallbackName"));
const typeIcon = k => TYPE_ICON[k] || (ctype(k) || {}).i || "account_balance_wallet";
const typeCol = k => TYPE_COL[k] || (ctype(k) || {}).c || "#5f7389";
const accEmb = a => ({ i: a.i || (a.e ? "" : typeIcon(a.type)), e: a.e, c: a.c || typeCol(a.type) });
const typeChip = (k, sel) =>
  '<button class="chip" data-act="f-type" data-v="' +
  esc(k) +
  '" data-ctype="1" aria-pressed="' +
  (sel === k) +
  '">' +
  emblem({ i: typeIcon(k), c: typeCol(k) }, "sm") +
  '<span class="chn" dir="auto">' +
  esc(typeName(k)) +
  "</span></button>";
/* colours: hex codes the user typed are remembered and offered in every picker */
function normHex(v) {
  let h = String(v || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h))
    h = h
      .split("")
      .map(c => c + c)
      .join("");
  return /^[0-9a-f]{6}$/.test(h) ? "#" + h : null;
}
/* a colour's name for screen readers: the palette's own, else from its hue and lightness ("Dark blue"), each a whole
   text of its own (color.*) */
const COL_NAMES = {
  "#15a06f": "green",
  "#c98500": "amber",
  "#0a91b8": "cyan",
  "#7c9a0d": "olive",
  "#a646c9": "purple",
  "#e0578c": "pink",
  "#4b5fd6": "indigo",
  "#e0504f": "red",
  "#2a78d6": "blue",
  "#df5f2b": "orange",
  "#00897b": "teal",
  "#b0671f": "brown",
  "#5f7389": "slateGrey",
  "#c2185b": "raspberry",
  "#689f38": "leafGreen",
  "#6a3fb5": "violet",
  "#0288d1": "skyBlue",
  "#a1887f": "taupe",
};
function colName(x) {
  if (COL_NAMES[x]) return T("color." + COL_NAMES[x]);
  const [r, g, b] = hexRgb(x).map(v => v / 255),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2,
    d = max - min;
  const shade = l < 0.3 ? "Dark" : l > 0.7 ? "Light" : "";
  if (d < 0.12) return T(l < 0.15 ? "color.black" : l > 0.9 ? "color.white" : "color.grey" + shade);
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const hue = [
    [15, "red"],
    [45, "orange"],
    [70, "yellow"],
    [160, "green"],
    [200, "teal"],
    [255, "blue"],
    [290, "purple"],
    [335, "pink"],
    [360, "red"],
  ].find(x2 => h < x2[0])[1];
  return T("color." + hue + shade);
}
const colDot = (x, sel) =>
  '<button class="dot" data-act="f-col" data-v="' +
  x +
  '" style="background-color:' +
  x +
  '" aria-pressed="' +
  (x === sel) +
  '" aria-label="' +
  esc(colName(x)) +
  '"></button>';
const LOAN_EMB = { borrow: { i: "handshake", c: "#6a3fb5" }, lend: { i: "volunteer_activism", c: "#0288d1" } };
/* search: every word must match the start of a word in the name or tags; whole-word matches rank first */
function iconSearch(q) {
  const words = q
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u) // a word in another script matches no (English) name, rather than none being typed
      .filter(Boolean),
    names = Object.keys(ICONS);
  if (!words.length) return names;
  const scored = [];
  names.forEach((n, idx) => {
    const toks = (n.replace(/_/g, " ") + " " + ICONS[n][1]).toLowerCase().split(/\s+/);
    let s = 0;
    for (const w of words) {
      let best = 0;
      for (const t of toks) {
        if (t === w) {
          best = 3;
          break;
        }
        if (t.startsWith(w)) best = Math.max(best, 1);
      }
      if (!best) return;
      s += best;
    }
    scored.push([s, idx, n]);
  });
  return scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(x => x[2]);
}
let ICPICK = null;
function iconPicker(cur, color, onPick) {
  openSheet2(
    T("icon.title"),
    '<div class="qbar"><input id="ic-q" type="search" placeholder="' +
      TH("icon.search") +
      '" autocomplete="off" aria-label="' +
      TH("icon.searchLabel") +
      '"></div>' +
      '<div id="iclist" class="icgrid"></div><div id="ic-emo-box" hidden><label class="field"><span>' +
      TH("icon.emoji") +
      '</span><input id="ic-emo" maxlength="8" style="width:110px;text-align:center;font-size:1.5rem"></label><div class="gap"></div><button class="btn" data-act="ic-emo-ok">' +
      TH("icon.useEmoji") +
      "</button></div>" +
      '<button class="btn text" data-act="ic-emoji" style="margin:8px auto 0;width:auto">' +
      TH("icon.emojiInstead") +
      "</button>"
  );
  ICPICK = { cur, color, onPick };
  icList("");
}
function icList(q) {
  const box = $("#iclist");
  if (!box || !ICPICK) return;
  const res = iconSearch(q);
  box.innerHTML = res.length
    ? res
        .map(
          n =>
            '<button class="icbtn" data-act="ic-pick" data-v="' +
            n +
            '" aria-pressed="' +
            (n === ICPICK.cur) +
            '" aria-label="' +
            esc(n.replace(/_/g, " ")) +
            '">' +
            emblem({ i: n, c: ICPICK.color }) +
            "</button>"
        )
        .join("")
    : '<div class="empty" style="grid-column:1/-1">' + TH("icon.none", { query: q }) + "</div>";
}
/* form part shared by category / account / asset editors: big preview (tap to change) + colour swatches */
function emblemEditor(o) {
  return (
    '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;margin:0 0 4px"><button class="cprevbtn" data-act="f-icon" aria-label="' +
    TH("icon.change") +
    '"><span id="f-cprev">' +
    emblem(o, "cprev") +
    '</span></button><button class="btn text" data-act="f-icon" style="width:auto;height:36px">' +
    ic("edit") +
    TH("icon.change") +
    "</button></div>" +
    '<div class="lbl">' +
    TH("color.label") +
    '</div><div class="dots" id="f-dots">' +
    dotList(String(o.c || "").toLowerCase())
      .map(x => colDot(x, String(o.c || "").toLowerCase()))
      .join("") +
    '<button class="dot addnew" data-act="col-new" aria-label="' +
    TH("color.add") +
    '">' +
    ic("add") +
    "</button></div>"
  );
}
const dotList = cur => {
  const hid = S.settings.hiddenCols || [];
  const l = PALETTE.filter(c => !hid.includes(c)).concat(
    (S.settings.customCols || []).filter(c => !PALETTE.includes(c))
  );
  if (/^#[0-9a-f]{6}$/.test(cur) && !l.includes(cur)) l.push(cur);
  return l;
};
const prevUpd = () => {
  const el = $("#f-cprev");
  if (el && F) el.innerHTML = emblem({ i: F.i, e: F.e, c: F.col }, "cprev");
};
function typeDialog() {
  miniDialog(
    T("type.new"),
    '<label class="field"><span>' +
      TH("common.name") +
      '</span><input id="nt-name" maxlength="20" placeholder="' +
      TH("type.example") +
      '" autocomplete="off"></label><p class="hint" id="nt-err"></p>',
    "nt-add",
    T("common.add")
  );
  setTimeout(() => {
    const el = $("#nt-name");
    if (el) el.focus();
  }, 60);
}
function pickType(v) {
  if (!F || F.kind !== "accf") return;
  F.type = v;
  setPressed("f-type", v);
  if (!F.iSet) {
    F.i = typeIcon(v);
    F.e = "";
  }
  if (!F.cSet) {
    F.col = typeCol(v);
    setPressed("f-col", F.col);
  }
  prevUpd();
}
function addType() {
  const el = $("#nt-name");
  if (!el) return;
  const name = el.value.trim().replace(/\s+/g, " ");
  if (!name) {
    $("#nt-err").textContent = T("common.nameIt");
    return;
  }
  const same = Object.keys(TYPES)
    .concat(S.types.map(t => t.id))
    .find(k => [typeName(k), TYPES[k]].some(n => n && n.toLowerCase() === name.toLowerCase())); // English too
  closePop();
  if (same) {
    if ((S.settings.hiddenTypes || []).includes(same)) {
      S.settings.hiddenTypes = S.settings.hiddenTypes.filter(k => k !== same);
      save();
    }
    if (!$('#sheet .chip[data-act="f-type"][data-v="' + same + '"]')) {
      const add = $("#sheet .chip.addnew");
      if (add) add.insertAdjacentHTML("beforebegin", typeChip(same, ""));
    }
    pickType(same);
    return;
  }
  const used = new Set(Object.values(TYPE_COL).concat(S.types.map(t => t.c)));
  const t = { id: "t" + newId(), name, i: "account_balance_wallet", c: PALETTE.find(c => !used.has(c)) || "#5f7389" };
  S.types.push(t);
  save();
  const add = $("#sheet .chip.addnew");
  if (add) add.insertAdjacentHTML("beforebegin", typeChip(t.id, ""));
  pickType(t.id);
}
/* hold a colour dot: it leaves every picker (things already in that colour keep it; typing its hex brings it back) */
function removeColour(c) {
  askDialog(T("color.remove.title"), T("color.remove.body"), T("common.remove"), () => {
    if (PALETTE.includes(c)) {
      S.settings.hiddenCols = (S.settings.hiddenCols || []).filter(x => x !== c).concat(c);
    } else S.settings.customCols = (S.settings.customCols || []).filter(x => x !== c);
    save();
    const d = $('#f-dots .dot[data-v="' + c + '"]');
    if (d && !(F && F.col === c)) d.remove();
    snack(T("color.removed"));
  });
}
function removeType(id) {
  const name = typeName(id),
    n = S.accounts.filter(a => a.type === id).length;
  if (!TYPES[id] && !ctype(id)) return;
  if (n) {
    snack(T("type.inUse", { name, count: n }));
    return;
  }
  askDialog(T("type.remove.title", { name }), T("type.remove.body"), T("common.remove"), () => {
    if (TYPES[id]) S.settings.hiddenTypes = (S.settings.hiddenTypes || []).filter(k => k !== id).concat(id);
    else S.types = S.types.filter(x => x.id !== id);
    save();
    const chip = $('#sheet .chip[data-act="f-type"][data-v="' + id + '"]');
    if (chip) chip.remove();
    if (F && F.kind === "accf" && F.type === id) pickType(firstType());
    snack(T("type.removed"));
  });
}
const visTypes = keep =>
  Object.keys(TYPES)
    .filter(k => !(S.settings.hiddenTypes || []).includes(k) || k === keep)
    .concat(S.types.map(t => t.id));
const firstType = () => visTypes()[0] || "bank";
function hexDialog() {
  if (!F) return;
  miniDialog(
    T("color.own"),
    '<div style="display:flex;align-items:center;gap:14px;margin-top:10px"><span id="hx-prev">' +
      emblem({ i: F.i, e: F.e, c: F.col }, "cprev") +
      "</span>" +
      '<label class="field" style="flex:1;margin:0"><span>' +
      TH("color.hex") +
      '</span><input id="hx-in" maxlength="7" placeholder="#1E88E5" autocomplete="off" autocapitalize="off" spellcheck="false" value="' +
      esc(F.col || "") +
      '"></label></div>' +
      '<p class="hint" id="hx-err"></p>',
    "hx-ok",
    T("color.use")
  );
  setTimeout(() => {
    const el = $("#hx-in");
    if (el) {
      el.focus();
      el.select();
    }
  }, 60);
}
function hexPreview() {
  const c = normHex($("#hx-in").value);
  if (c) $("#hx-prev").innerHTML = emblem({ i: F.i, e: F.e, c }, "cprev");
  $("#hx-err").textContent = "";
}
function useHex() {
  const c = normHex($("#hx-in") && $("#hx-in").value);
  if (!c) {
    $("#hx-err").textContent = T("color.hexHint", { example: "#1E88E5" });
    return;
  }
  closePop();
  if (!F) return;
  if (!PALETTE.includes(c)) {
    S.settings.customCols = [c].concat((S.settings.customCols || []).filter(x => x !== c)).slice(0, 6);
    save();
  } else if ((S.settings.hiddenCols || []).includes(c)) {
    S.settings.hiddenCols = S.settings.hiddenCols.filter(x => x !== c);
    save();
  }
  const dots = $("#f-dots");
  if (dots && !dots.querySelector('[data-v="' + c + '"]'))
    dots.querySelector(".addnew").insertAdjacentHTML("beforebegin", colDot(c, ""));
  F.col = c;
  F.cSet = true;
  setPressed("f-col", c);
  prevUpd();
}
