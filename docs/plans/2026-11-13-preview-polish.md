# 1.5.0 preview polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the six fixes the maintainer asked for after trying the 1.5.0 preview on a phone (2026-11-13), as approved
from the demos the same day.

**Architecture:** page code only (`app/src/main/assets`): CSS fixes, a focus change in search, two new History kinds
(Charges, Extras) shared by search and the Filters sheet, the Summary's Days tab drawn as one day's pie, and Summary rows
that open in place. No saved-data change.

**Tech Stack:** classic scripts in one global scope (WebView 87: no `:has()`, `:is()`, `color-mix()`), rem fonts,
texts through `T()`/`TH()` in nine catalogues (`l10n/web/*.json`, then `python3 tools/gen_i18n.py`), Playwright suites
in `tests/e2e`.

**Spec:** this plan, from the maintainer's feedback and the approved demos (scratchpad mock-ups, not in the
repository): 1 focus after Enter, 2 archive icon, 3 charge card **B (inset lines)**, 4 Charges and Extras kinds
(**build**), 5 Days tab **A (the day as a pie)**, 6 Summary rows open (**build**).

## Global Constraints

- CLAUDE.md applies in full: 48dp targets, labelled controls for TalkBack, nothing by colour alone, words wrap and are
  never cut or shrunk (only figures shrink), every visible text in all nine catalogues, `22-layout.js` covers new
  screens at normal and large text.
- No saved-data or backup format change; Charges, Extras and opened rows are derived, never stored. A History filter
  value that names a new kind must survive `migrate()` / old builds ignoring it (it lives in `HF`, not in saved data:
  check that).
- Every task adds tests that fail before and pass after; `npm run lint` and the touched suites green; the full
  `npm test` before the last push.
- Commits end with only `Co-Authored-By: Claude <noreply@anthropic.com>`. No model names, no session links.

## Review Focus

1. A purchase with a charge, a transfer with a transfer charge, a loan payment with a transfer charge, a borrow with
   charges paid and unpaid, a lend with an extra, a payback with a tip: each lands in the right new kind(s) and the
   headings' totals add up to what Home and Summary count.
2. Archived entries stay out of the new kinds' lists (unless search shows archived entries), as everywhere in History.
3. The Days pie with one category, with none (an empty day), and on today; ‹ › never past today.
4. An opened Summary row on a tab with a part whose entries span accounts in another currency: only the Summary's
   currency.
5. TalkBack: the opened row's state (expanded / collapsed), the focus after Enter in search.

---

### Task 1: three small fixes (items 1, 2, 3)

**Files:** `js/search.js` (`findSubmit`), `css/app.css` (`.chip.harch`, `.aocard`/`.aorow`), tests in the suites that
cover search (`46`), History's bar (`24`/`22`) and the charge card (the charges suite).

- [ ] **1. Focus after Enter in search.** `findSubmit()` moves the focus to the heading of what is shown ("Suggestions",
  else "Entries", else the first button as today when there is no heading), made focusable with `tabindex="-1"` and no
  visible outline. Nothing in the list is outlined after Enter; TalkBack reads the heading. Test: after Enter, the
  active element is the heading and no suggestion has focus.
- [ ] **2. Archive button centred.** `.chip > .ic:first-child { margin-inline-start: -8px }` must not apply to the
  icon-only `.chip.harch`. Test: the icon's centre is within 0.5px of the button's centre, horizontally and vertically.
- [ ] **3. Charge card, inset lines (demo B).** `.aocard` keeps its four 16px corners. Each row's line (1px outline,
  2px primary while focused or filled by the keypad) is inset 16px from both sides, and the last row's line sits inside
  the rounded shape with room below it (the preview line `.aoprev`, when shown, stays inside the card under it). Applies
  wherever the card appears (spending, transfer, lend, borrow, payback). Test: every row line's left and right edges are
  16px inside the card's, at 360px and in `body.land`.
- [ ] Commit: "Polish: no ring after Enter in search, archive icon centred, charge card lines inset".

### Task 2: Charges and Extras kinds (item 4)

**Files:** `js/history.js` (`HIST_KINDS`, `histKind`/`histMatch`, headings `histLines`), `js/search.js` (kind
suggestions, `SUG_KIND_EMB`, the empty message), the Filters sheet, `css/app.css` if needed, nine catalogues, tests (a
new section in the History/search suites, and `22-layout.js` for the Filters sheet with the two chips).

- [ ] **Which entries.** **Charges:** entries that carry a charge: a purchase with an added charge, a transfer or loan
  payment with a transfer charge, a lend with a transfer charge, a borrow with charges (listed even while its charges
  are unpaid; they add to the Charges totals only once they count as spending, by the rule already in
  docs/specs/charges.md). **Extras:** entries with an extra on top: a lend's extra, a payback's extra (tip), an
  extra received over what was lent. Use the existing derived data (`addOnOf`, `loanParts()`, `histCarries`); nothing
  is stored. An entry can be in both.
- [ ] **Filters.** The Filters sheet's kind choices gain **Charges** and **Extras** after the existing kinds, with
  counts like the others; picking one shows the chip "Charges" / "Extras" on the Filters line. Category, person and
  sides choices that make no sense with them are hidden as for the other kinds (follow how `kind` clears `cat`, `who`,
  `from`, `to`).
- [ ] **Headings.** With Charges picked, month and day headings show "Charges {{amount}}" (the charges counted as
  spending in that month/day, per currency as today); with Extras, "Extras {{amount}}" (the extras counted as income).
  The rows themselves are History's own rows (they already say "incl. $6.40 charge" / "+ $1.50 transfer charge").
- [ ] **Search.** The kind suggestions include the two kinds: matched by their names and by a short list of other
  words per language (English: Charges also "fee, fees, charge"; Extras also "tip, tips, interest"), one catalogue key
  each holding the comma-separated words, matched like the names (prefix, case and accents as today). The suggestion's
  emblem is a 40px grey circle (the Charges grey, `CHARGES_C`) with a receipt/fee icon from `icons.js` for Charges and
  a plus-coin or similar for Extras (pick from the existing set; no new artwork), not a bare dot.
- [ ] **The empty message.** "Nothing matches “…”" shows only when no suggestion and no entry matched (today it shows
  under a matching kind suggestion).
- [ ] **Texts (nine languages):** `history.kind.charges` "Charges", `history.kind.extras` "Extras" (use the words the
  app already uses for the Charges part and the Extra field in each language), the two word lists, and the headings
  "Charges {{amount}}", "Extras {{amount}}".
- [ ] Tests: each case in Review Focus 1 (kind membership and heading totals equal Summary's charges for the same
  period), search "fee" and "tip" offer them, "Nothing matches" hidden under a suggestion, the Filters sheet chips and
  counts, archived entries excluded.
- [ ] Commit: "History: Charges and Extras kinds in Filters and search".

### Task 3: the Days tab as one day's pie (item 5, demo A)

**Files:** `js/summary.js` (`smBuckets` for `d`, `drawSm`, `smNav`, `smOpen`), `css/app.css`, catalogues if a text
changes, tests (the Summary suites `07`/`09`, `22-layout.js`).

- [ ] Days shows one day: the header is the day ("Sat, Oct 17", `dayName`), ‹ › step one day (› stops at today), the
  pie (`smPie`) of that day's parts, the total and "vs the day before" under it, then **every** part listed with its
  share (as Months), Charges last, then "Open this day on Home". No bars on Days. A day with no spending shows the
  existing empty text for Days. Opening the Summary from Home's donut lands on the day Home shows.
- [ ] The Weeks, Months and Year tabs are unchanged.
- [ ] Tests: header, stepping, the › limit, the list holds every part, the empty day, the pie's slices match the
  parts; suite 22 at normal and large text.
- [ ] Commit: "Summary: the Days tab is one day's pie".

### Task 4: Summary rows open to show their entries (item 6)

**Files:** `js/summary.js` (`smRow`, the list, `drawSmYear`'s list), `js/events.js` for the action, `css/app.css`,
catalogues, tests.

- [ ] Every part's row on every tab (Days, Weeks, Months, Year) is a button with a chevron at its end
  (`aria-expanded`), labelled as today ("Groceries, $284.40, 15%"). A tap opens it in place (one open at a time is
  fine; a second tap closes it): that part's entries in the tab's period, in the Summary's currency, newest first,
  at most 5, each as a History-style two-line row: the entry's name (payee · note, as History), then the date (Days:
  the time added, `tx.addedAt`'s time) · the account dot and name, and on the right the amount it counts in this part
  (a purchase with a charge: its whole counted amount in its category; the Charges part: the charge). Rows here are
  read-only (no tap action).
- [ ] Under them, when the part has more than 5 entries, a text button "Show all {{count}} in History" (plural keys)
  that opens History with the period set to the tab's period (day, week as a date range, month, year) and the filter
  for that part: the category (kind Spent), or for the Charges part the Charges kind from Task 2.
- [ ] Opening and closing don't move the rest of the sheet's scroll position more than the opened content needs.
- [ ] Texts (nine languages): "Show all {{count}} in History" with plural forms.
- [ ] Tests: open/close and `aria-expanded`, the 5 newest and their amounts add up to at most the part's total, the
  Show all button's count and the History it opens (period and filter), the Charges part opens the Charges kind, the
  Year tab, suite 22 with a row open at large text.
- [ ] Commit: "Summary: rows open to show their entries".

### Task 5: docs, changelog, translations, media

- [ ] CHANGELOG 1.5.0 section: the Charges and Extras filters and search words; Summary rows open; the Days tab is a
  pie of one day (Changed); the three fixes under Fixed only if they fixed something released before (they did not:
  all three came with 1.5.0, so leave them out).
- [ ] README (Spending summary line, History), docs/design.md where Summary and History are described,
  CONTRIBUTING if it lists History's kinds, docs/decisions.md: one dated line each for demo 3 B, demo 4, demo 5 A,
  demo 6 (maintainer's picks, 2026-11-13).
- [ ] The release plan (docs/plans/2026-11-01-release-1.5.0.md): a line under item 14 noting the preview polish
  round and this plan.
- [ ] Store texts: the 10500.txt notes and full_description's LOOK BACK paragraph mention Summary as "by day, week,
  month or year" already; check nothing in them is now wrong.
- [ ] `npm run media` (Summary or History screenshots may change); full `npm run lint` and `npm test`.
- [ ] Commit: "Docs: the preview polish round".
