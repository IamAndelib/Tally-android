# 1.5.0 pre-release review fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** fix what the five pre-release reviews (2026-11-13: data, daily-use flows, native shell, code health, release
readiness) found that should not ship in 1.5.0, trim what is safe to trim, and leave the rest for after the release.

**Spec:** CLAUDE.md (rules and the Quality bar), the feature specs in `docs/specs/`, and the findings quoted in each
task. No interface change needs a demo: every fix restores a rule the app already states (focus never falls to the page,
ring names whole or left out, one name per thing).

## Global Constraints

- CLAUDE.md applies in full (WebView 87, rem fonts, 48dp, TalkBack, nine catalogues, no network).
- No saved-data format change; money never changes.
- Each task adds tests that fail before and pass after (tests-only and docs-only items excepted); `npm run lint` and
  the touched suites green; the full `npm test` before the release PR.
- Commits end with only `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Review Focus

1. Focus after every removal lands on a visible, sensible control, also with TalkBack-style programmatic focus, and
   never on `<body>`.
2. Ring names: a long custom name at 12–16 categories, phone and tablet, normal and large text, German.
3. History with thousands of rows drawn: an edit, delete, archive or Undo keeps the scroll position and the row in view.

---

### Task 1: focus after removals (flows I1, M2)

Today the focus falls to `<body>` after: Select and leaving selection (`events.js:629-660`), Archive selected, Delete
selected, Delete from an opened row in History or the Archived screen (`sheets.js:1284-1325`), "Archive instead",
Unarchive (`events.js:669-674`), the snackbar's Undo, and "Saved · no longer in this list". `keepFocus()`/`refocus()`
(`layers.js:242-263`) only find the same button or a neighbour. Also: Back to Home's entries sheet focuses the sheet,
not the edited row (`sheets.js:433-450`, `BACKTO.open`).

- [ ] Targets: Select → the bar's button that ends selection; leaving selection → the Select button; archive or delete
  (one or many) → the next row in the list, else the previous one, else the Filters button (Archived screen: its
  first row, else its back button); Unarchive → as delete; Undo → the restored row (its `row-open` button), else as
  today; "no longer in this list" → the next row; Back to Home's entries sheet → the edited row.
- [ ] One helper, near `keepFocus`, used by all of these; never `<body>`.
- [ ] Tests (41-history / 46-archive, next to the chip-focus checks): each action, `document.activeElement` is the
  target and not `body`.

### Task 2: ring names whole or left out (flows I2)

`ring.js:61-73`: `names = room >= dfit - 1` checks only the height under the icon, never a name's width; `.rt .cn`
uses `text-overflow: ellipsis`, so a long custom name ("Travel and holidays", "Versicherungen") is cut with "…" at
12–16 categories, and on a tablet at 16 a name overlaps the next icon.

- [ ] Measure each name's width against the room it has before the next tile (the same distance `pitch` gives); if any
  name doesn't fit whole (it may wrap to the lines `rows` allows), leave the names out for the whole ring, as the
  height rule does. No ellipsis anywhere in the ring.
- [ ] Add a long custom category name to `22-layout.js`'s `sampleState()` so the layout suite covers it; add a direct
  check (12, 14, 16 categories × phone and tablet × 1 and 1.3 text): every shown name is whole and overlaps no icon.

### Task 3: History and the Year sheet stay quick with big notebooks (flows I3)

History redraws every row drawn so far on each change (`history.js` `histParts` / `HSHOW` only grows): after scrolling
back ~1.5 years (2,900 rows) a redraw takes ~250 ms on desktop, an edit ~290 ms. Home's Year entries sheet draws all
rows at once (1,728 rows: open 138 ms, a save from it 519 ms); the tablet's Year Home pane redraws them on every save.

- [ ] History: after a change, redraw only up to the chunk in view (`rowAnchor()` finds it) plus one chunk, keeping the
  scroll position and the row in view; the scroll watcher adds the rest as today. Pinned headings and month totals
  unchanged.
- [ ] Home's Year entries sheet and the tablet's Year pane: draw in History's chunks, adding more on scroll.
- [ ] Tests: after scrolling far and editing a row, the row stays in view and the drawn row count is bounded (not every
  row); a timing check only as a loose guard (e.g. under 4× a baseline measured in the same run), never a fixed ms.

### Task 4: small correctness fixes (release I1, data D1/D2, native M2)

- [ ] **Russian delete question** (`ru.json:521`, `sheets.js:1272`): Russian's "one" form covers 21, 31, 101, so
  "Delete this entry?" shows for 21 entries. Give exactly one entry its own key (e.g. `entries.delThis`, all nine
  languages) used when `count === 1`; the plural key keeps `{{count}}` in every form. Add a `32-i18n-static.js` check:
  a `_one` text without `{{count}}` only in languages whose "one" means exactly 1 (en, de, es, fr, pt-BR, tr, id/zh
  have no one).
- [ ] **Summary's opened Charges row for credit-covered charges** (`summary.js:150-167` `smPartRows`, `state.js:616-625`
  `spendItems`, `loanParts` 715-730): a payment's charge counted on a later draw (`at`) shows as the payment, dated the
  draw's day. Carry `at` into the items and group by `entry(x.at || x.of)`, so the row is the draw History lists.
  Repro: scratchpad review150/data/repro-credit.js.
- [ ] **Clean saved data** (`loans.js:686`, `:762`): editing a draw with no due day stores `due: ""`; a loan made from
  the Lend/Borrow form has no `ts`. Delete `due` when empty; give the new loan a `ts` as `overpay()` does.
- [ ] **Notification wording** (`res/values*/strings.xml`, 9 locales): `n_lent_on`/`n_borrowed_on` "· no payback day
  set" → "· no due date"; `n_payback_today`/`n_payback_was` use "due" wording; `pub_dues` "A loan or lending is due" →
  wording true for monthly reminders too (e.g. "A loan or lending reminder"). Keep placeholders; check the page's own
  words in each language (`l10n/web/*.json`, "due").
- [ ] Tests for each (the Russian check, the opened row's entry and date, the saved data after the two edits; the
  strings by suite 32 if it covers native strings, else a grep check).

### Task 5: safe trims, test races, docs (health, release minors)

- [ ] Dead CSS: `app.css` `.month .plabel` (~258-262), `.month` (~2370-2377), `.strip .chip` (~963-965).
- [ ] Dead JS: the unreachable empty-disc branch in `smPie` (`summary.js:~273`), the no-op `if (none) h += "";`
  (`~338`), unused `cmp` in `sugTokens` (`search.js:~599`).
- [ ] Always-pass asserts: `09:410`, `02:344`, `03:238`, `05:160`, `05:281`, `08:156`: assert what the message says.
- [ ] Test race: suites 41 (`open()` and 5 other sites) and 38 seed with `location.reload()` inside `evaluate`; seed,
  then `await page.reload()` (patched copies: scratchpad review150/health/patched/).
- [ ] CONTRIBUTING: the tree lists `history`; the table's `history.js` row (filters, kinds, Archived screen, selection,
  pinned headings incl. Settings'), `screens.js` row (screens, the shared rows `txLine`/`txOpenView`/`dayList`/
  `dayGroups`, the fitting helpers), `sheets.js` row (forms, the charge/extra card, name suggestions); `period.js` has
  year; the release attaches the `.aab`. `screens.js:2` header. `history.js:1-12` header rewrapped to 120.
- [ ] CHANGELOG [1.5.0]: delete the "instead of 'Paid in all'" line and the duplicate "ends with Edit and Delete only";
  the restore wording (a hand-picked file asks Cancel | Restore; Restore / Choose another file / Cancel is the auto
  backup's); the transfer charge on transfers and loan payments is renamed and now counts (not new); move the name
  chips line to the forms; add: a sheet closes only when the tap began outside it, Summary draws no chart when nothing
  is spent, Net worth and You owe list the notebook's currency first, and one line on what 1.4.4 keeps of a 1.5.0
  backup; add lines for Tasks 1–4 where users see them (Fixed: ring names, focus; Changed: History stays quick).
- [ ] README: Summary caption with Year (`:32`), Notifications row "loan reminders"; privacy policy the same word.
- [ ] Store descriptions (9 locales): the Look back paragraph keeps "date range".
- [ ] GLOSSARY: a purchase's charge counts in its own category, other charges in the Charges part.
- [ ] Specs' status lines: `41-year-view.md:18`, `history-filters.md:3, :195`, `design-round.md:3` → built in 1.5.0.
- [ ] decisions.md: "superseded by" pointers for 31→97, 61/76→80, 80→90/91, 11/65→89, 71→96 (check each pair first).
- [ ] roadmap: name sections instead of line numbers (`:24`).
- [ ] Release plan: tick item 11 (c dropped), number items uniquely, note the 1.5.0 → 1.4.4 restore check (browser,
  2026-11-13: balances kept, amounts on top dropped as the spec says).

## After the release (not in this plan)

Layout suite speed and sharding; test scaffolding in `harness.js`; fixed sleeps; theme.js tests; one spending-rule
helper for `dayGroups`; near-copies; file splits (`rows.js`, `addons.js`, `settings.js`); dead-code.js gaps; search's
first keystroke (106–148 ms at 5–10k entries); monthly reminders missed on their day, back-dated lends reminded at
once, and a JUnit test for `monthlyDate`; recent searches filling several slots; Undo for an asset's value; whether
Summary keeps an opened part open across tabs (maintainer to say).
