# History: a pinned header and archived entries — implementation plan

> **For agentic workers:** use superpowers:subagent-driven-development; steps use checkbox (`- [ ]`) syntax.

**Goal:** History's header and the month in view stay while the entries scroll, and an entry can be archived (hidden
from History, nothing else changes) instead of "Delete, keep the balance".
**Spec:** `docs/specs/history-archive.md` (approved 2026-11-07); mock-ups in the scratchpad's `hist2/` (sticky,
archive, round2). Built after charges (`docs/plans/2026-11-07-charges.md`), in 1.5.0, on data version 8 (not yet
released, so the `archived` mark joins version 8; no new version number).

## Global Constraints

- **Data safety:** archiving changes no amount, account, date or balance; `migrate()` keeps `archived: true` only on
  entries, drops any other value, with a test; backups carry it; an older version ignores it (the entry shows again,
  balances unchanged).
- **Totals agree:** archived entries still count everywhere (History's headings, Home, Summary, widget, morning check,
  CSV); only History's lists, search and suggestions leave them out.
- An entry and its linked charge or extra (`feeOf` / `feeId`) are archived and shown again together.
- WebView 87: `position: sticky` is fine; no `:has()`, `:is()`, `color-mix()`, `structuredClone`.
- rem fonts, min-height, words wrap; every text via `T()` / `TH()` in all nine languages; 48 dp targets; TalkBack
  names for the new buttons; layers, focus and Back as CLAUDE.md says.
- Commits end with only `Co-Authored-By: Claude <noreply@anthropic.com>`.

### Task 1: The pinned header
**Files:** `js/history.js` (each month in its own section; chunks that continue a month go inside it), `css/app.css`
(the pinned block, the month heading's line, `scroll-padding-top`), `js/screens.js` if the app bar moves into the
block; tests: 41, 44, 22.
- [x] Failing checks: scrolled halfway through a month, the app bar, the period / Filters row and that month's heading
  are at the top of the window; at the next month the new heading takes its place; selecting pins only the bar and the
  dimmed Filters row (month headings scroll); search keeps the field and Filters pinned; sideways (`body.land`) pins
  the bar and a one-line month, the Filters row returning on scroll up; jumping to a row (edit, Undo, a search match)
  leaves it below the pinned block; TalkBack order unchanged.
- [x] Implement, suites, 22 (phones, sideways, tablets, two panes, large text), lint. Commit.

### Task 2: Archived entries: data and the delete question
**Files:** `js/state.js` (`archived` in `migrate()`; `archiveEntries(ids, on)`), `js/sheets.js` (`deleteAsk`: the
warning line and Delete / Archive instead / Cancel; "Keep the current balance" and `deleteEntries(ids, keep)`'s keep
path go), `js/history.js` / `js/search.js` (archived entries out of lists, search and suggestions), keys; tests: a new
suite 46 (data, migrate, totals unchanged, linked add-ons), 41.
- [ ] Failing checks: archiving a normal entry, a loan payback and two selected changes no balance, loan figure or total;
  the entry and its charge leave History and search; the snackbar "Archived" with Undo restores it; the warning lines
  ("Deleting changes the account balance." / "… and the loan." / "… balances."); v8 data with junk in `archived` is
  sanitised; a backup round-trips the mark.
- [ ] Implement, suites, lint. Commit.

### Task 3: The Archived screen
**Files:** `js/history.js` / `js/screens.js` (the icon left of search while anything is archived; the screen titled
"Archived" with History's rows and headings without totals; opened row: Show again and Delete; the empty state;
"Archive selected" beside "Delete selected"), `js/events.js`, keys; tests: 46, 24, 22.
- [ ] Failing checks: the icon appears with the first archived entry and goes with the last; "Show again" brings the
  entry back with "Back in History" and Undo; Delete there asks "Delete this entry?" with the warning, Delete and Cancel
  only; the empty state's two lines; Back returns to History; TalkBack "Archived entries", "Archive selected".
- [ ] Implement, suites, 22 for the new screen and states, lint. Commit.

### Task 4: Docs
README (History), CONTRIBUTING (data model: `archived`), `docs/design.md`, CHANGELOG, the spec's status, the release
plan's item 11 e ticked.
