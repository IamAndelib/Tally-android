# Design round — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build parts A and B of the approved design round (History and search polish, dialogs, wording, Home, Summary,
forms, small marks) and fix the calculator/keyboard bug. Part C (charges) gets its own spec and plan after this.

**Architecture:** Changes stay inside the existing modules: `js/history.js`, `js/search.js` (A), `js/layers.js` and the
dialogs' callers (`bridge.js`, `backup.js`, `events.js`) for the dialog style, `js/screens.js` / `js/ring.js` (Home,
rows), `js/summary.js` (Summary), `js/sheets.js` / `js/loans.js` / `js/emblems.js` (forms), `js/calculator.js` (the
bug). One new shared dialog shape (`choiceDialog()`: stacked full-width buttons with roles keep / destroy / way out,
plus an optional confirm step) replaces the stacked text-button variant of `askDialog`.

**Tech Stack:** Classic scripts in one global scope (WebView 87+), CSS in `rem`, Playwright e2e suites in `tests/e2e`.

**Spec:** `docs/specs/design-round.md` (approved 2026-11-06). Its last section wins over the earlier ones.

## Global Constraints

- WebView 87: no `:has()`, `:is()`, `structuredClone`, `color-mix()`.
- Every font size in `rem`; boxes holding text use `min-height`; words wrap, never cut or shrink (`22-layout.js`).
- Every visible text through `T()` / `TH()`, keys in `l10n/web/en.json` and all eight other languages (each task
  translates its own new keys, matching each catalogue's words), then `python3 tools/gen_i18n.py`; never Prettier on
  `js/i18n/`.
- 48 dp targets; nothing by colour alone; WCAG AA contrast in light and dark.
- Don't reuse existing class names for new effects (the `.st` lesson).
- Saved data: only Task 2's hidden names add a field; it ships with a `migrate()` step and a test, and backups stay
  readable by older and newer versions.
- Every visible change matches the approved mock-ups; anything the spec doesn't settle is raised, not invented.
- Commits end with only `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Review Focus

1. Several currencies wherever totals appear (headings, balance bar, Summary).
2. Large text, 360 px, German / Russian (long words) and a phone held sideways for every changed screen.
3. Back and focus after every new dialog step (choice → confirm → Cancel closes all).
4. Calculator and Android keyboard never on screen together, from any field, in any form.
5. Removing a name from suggestions never changes an entry; Undo brings it back; restore of an older backup is fine.

---

### Task 1: The calculator and the keyboard
**Files:** `js/calculator.js`, `js/events.js` (`add-fee`), `js/sheets.js` / `js/loans.js` (the fee field), CSS; test
`tests/e2e/17-amount-grouping.js` or a new check in the calculator's suite (grep `calc-toggle`).
- [ ] Failing checks: with the calculator open on an amount, tapping "Add a fee" (transfer, loan payment) leaves no
  calculator open (`body.calcopen` off, keypad hidden) and the fee field focused; focusing any other input closes it;
  the fee field has its own calculator button that opens a keypad for the fee (and closes the amount's).
- [ ] Implement (a `focusin` rule: a field that isn't the calculator's closes it), the fee field's calculator.
- [ ] `node e2e/run.js` for the touched suites, 22 for the forms, lint. Commit.

### Task 2: Search and History small items (spec A1–A16)
**Files:** `js/history.js`, `js/search.js`, `js/screens.js`, `js/sheets.js`, `js/loans.js`, `js/state.js` (`migrate`:
`settings.hiddenNames`), `js/events.js`, CSS; tests 41, 42, 39/the loan suite, 26/migration suite.
- [ ] Each item test-first as in the spec (A1 the empty space while selecting; A2/A3 period suggestions; A4 from 2
  letters; A5 recents kept as used; A6 the snack; A7 "any"; A8 suggestions hidden; A9 Clear selection; A10 empty
  notebook; A11 decimals; A12 true minus via `money()`; A13 welcome bar; A14 reminder text; A15 Clear all under the
  chips; A16 compact name chips with ✕ and Undo, hidden names stored in `settings.hiddenNames` (case/accent-folded),
  carried in backups, migrated and tested).
- [ ] Suites 41 42 + touched, 22, lint. Commit.

### Task 3: History headings (spec B3)
**Files:** `js/history.js` (`histWords` → a stacked column), CSS; tests 41, 22, 90.
- [ ] Month and day: + received over − spent, one line per currency; Transfers: "Transferred …" and "Fees …" in words;
  lent/borrowed with the rows' signs; no fees line or icon otherwise; TalkBack keeps the sentence.
- [ ] Tests, 22 at large text, snapshot. Commit.

### Task 4: Dialogs (spec B1, B4, B6, B7)
**Files:** `js/layers.js` (`choiceDialog`), `js/bridge.js`, `js/backup.js`, `js/events.js` (wipe), CSS; tests 19
(backup), the wipe suite, 24.
- [ ] The shared shape and its confirm step; backup folder (Restore / Overwrite / Cancel + confirms, Cancel closes all);
  unreadable backup; restoring a file; Delete all data. Back closes the top step; focus returns.
- [ ] Tests, 22 states, lint. Commit.

### Task 5: Delete asks about the balance (spec B2)
**Files:** `js/sheets.js` (`rowDelete`, the entry sheet's Delete), `js/state.js` (`deleteEntries` with a keep-balance
mode: each affected account's opening balance absorbs the amount, no extra entry), tests (new checks in 41 and the
entries suite).
- [ ] "Delete and update the balance" (today's behaviour) / "Delete, keep the balance" / Cancel; transfers keep both
  accounts' balances; an entry with a fee carries its fee; loans: deleting a loan entry with keep-balance is refused or
  explained (raise it if the spec doesn't settle it); Undo restores exactly, including the opening balances.
- [ ] Tests for every kind, two currencies, Undo. Commit.

### Task 6: One name per thing (spec B8)
**Files:** `l10n/web/*.json`, the forms and rows that use the words, `js/i18n/*` generated; tests 32, 90 and suites that
read the texts.
- [ ] Every before → after in the spec, all nine languages; re-record 90 and check only these lines change. Commit.

### Task 7: Home, rows and the loan sheet (spec B9, B10, B11)
**Files:** `js/screens.js`, `js/ring.js`, `js/loans.js`, CSS; tests 04, 39, the loan suites, 22.
- [ ] Chip fade; balance bar stacked ("4 entries ›" | "Total in USD" over the figure; several currencies one line each);
  the account dot before every account name in rows and sheet lines; loan rows "● Everyday · Due Tue, Jun 30" with the
  status chip; the loan sheet saying each thing once with Active / Partly paid kept.
- [ ] Tests, 22. Commit.

### Task 8: Summary (spec B12)
**Files:** `js/summary.js`, `js/ring.js` (if the donut is shared), CSS; tests 07, 09, 38.
- [ ] Whole amounts in every tab (bars: "12.4K" only from five digits; exact amounts in TalkBack and under the chart);
  the Months tab's pie instead of the donut, total under the chart. Commit.

### Task 9: Forms and small marks (spec B13, B14)
**Files:** `js/sheets.js`, `js/loans.js`, `js/emblems.js`, `js/history.js` (Select icon), `js/icons.js` (checklist),
CSS; tests 36, 24, 22.
- [ ] One note style; Received uses Spent's category chip; Select icon = outlined checklist; net worth card without its
  line, the same container in both themes; a picked account tinted in its colour; the category form's emblem with a
  dark tint and a pen (the whole emblem is the button, "Change emblem" for TalkBack). Coffee and ⌫ unchanged. Commit.

### Task 10: Words, layout, docs, build
**Files:** `docs/design.md` (the design philosophy, approved; CONTRIBUTING's design section points to it), CHANGELOG,
README, CONTRIBUTING, `docs/decisions.md`, `docs/plans/2026-11-01-release-1.4.4.md`, store media.
- [ ] Every new key in nine languages checked; 22 in all nine languages; full `npm test`, lint; `npm run media`.
  Commit (the controller pushes and sends the test APK).
