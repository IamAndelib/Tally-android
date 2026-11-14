# History: all time, a period chip, a Filters sheet and simpler rows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** History opens on all time with a period chip and a Filters sheet (account, kind, then category / person /
transfer route), and every entry list uses simpler two-line rows that open in place to show figure boxes.

**Architecture:** A new `js/history.js` holds History's filter state (`HF`), the filter logic, the totals' words, the
History screen and its Filters sheet; `historyView()` and the account strip leave `screens.js`. `period.js` gains an
`"all"` period for History only. The entry row (`txLine`) and its opened part are rewritten in `screens.js`, so History,
Home's day list, the entries sheet and search all get them; fees stop being rows and appear inside their host's row.

**Tech Stack:** Classic scripts in one global scope (WebView 87+), CSS in `rem`, Playwright e2e suites in `tests/e2e`.

**Spec:** `docs/specs/history-filters.md` (approved 2026-11-05). Mocks: the conversation's boards E1–E4, G1–G4, H1–H2,
J1 (option B), K1–K3, PA3.

## Global Constraints

- WebView 87: no `:has()`, no `:is()`, no `structuredClone`; CSS that WebView 87 drops is a bug.
- Every font size in `rem`; boxes holding text use `min-height`, never `height`; words wrap, never cut or shrink
  (`22-layout.js` check 7).
- Every visible text through `T()` / `TH()` with keys in `l10n/web/en.json` and all eight other languages, then
  `python3 tools/gen_i18n.py`; never run Prettier on `js/i18n/`.
- Touch targets 48dp (compact sheet chips: 34px tall, the row gap makes up 48); nothing by colour alone.
- Transfers, loan movements, fixes and fees never count as spent or received.
- No change to saved data (no `migrate()` change): filters live in memory only.
- Commits end with only `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Review Focus

1. **Several currencies**: totals per currency joined with " + ", Left after in the account's own currency (Task 2,
   Task 5 tests).
2. **A filter pointing at something gone** after a restore (account, category, person): dropped, never an empty or
   crashing History (Task 2 test `histDrop`).
3. **Small phone, large text, German**: chips, figure boxes and Between wrap; no words cut (Task 6, `22-layout.js`).
4. **An entry edited or deleted while its row is open or while filtered**: the open row closes if it's gone, the list
   re-filters, a selection keeps only what's listed (Task 5 test).
5. **A fee whose host is gone** (old data): shown as its own row so its money never disappears (Task 5 test).

---

### Task 1: An "all" period for History

**Files:**
- Modify: `app/src/main/assets/js/period.js` (`HP`, `range`, `periodText`, `shiftPeriod`, `canNext`, `periodDialog`)
- Test: `tests/e2e/41-history.js` (new; header comment lists what the suite covers)

**Interfaces:**
- Produces: `HP.period === "all"`; `range(HP)` → `["0000-01-01", "9999-12-31"]`; `periodLabel(HP)` →
  `T("history.allTime")`; `histAllTime()` sets `HP` to `{ period: "all", anchor: today(), rs: null, re: null }`.

- [ ] **Step 1: Write the failing tests** in `41-history.js`: History opens with `HP.period === "all"` and lists an
  entry dated three years ago; `periodLabel(HP) === "All time"`; `periodDialog(HP)` from all time opens on the Month
  tab with no month `.sel` and this month marked `.now`; picking June sets `HP.period === "month"`; the dialog has
  `pd-today` and `pd-close` and no other action.
- [ ] **Step 2:** `cd tests && CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node e2e/run.js 41` →
  FAIL.
- [ ] **Step 3:** Implement as in Interfaces; `HP` starts as all; `canNext(HP)` is false on all; `shiftPeriod` does
  nothing on all; `catchUpToday` leaves all alone. Home (`V`) never takes `"all"`.
- [ ] **Step 4:** Run 41 and 03, 38 → PASS.
- [ ] **Step 5:** Commit "History: an all-time period".

### Task 2: History's filter logic and totals (`js/history.js`)

**Files:**
- Create: `app/src/main/assets/js/history.js` (header comment), add to `index.html` after `screens.js`
- Modify: `CONTRIBUTING.md` file list
- Test: `tests/e2e/41-history.js`

**Interfaces:**
- Produces:
  - `let HF = { acc: "", kind: "", cat: "", who: "", from: "", to: "" }`
  - `HIST_KINDS`: `[["out", isSpend], ["in", t => t.type === "income"], ["xfer", …], ["lend", …], ["borrow", …],
    ["fix", t => t.type === "adjust"]]`; a fee (`feeOf`) belongs to its host's kind; labels `history.kind.<key>`.
  - `histKind(t) → "out"|"in"|"xfer"|"lend"|"borrow"|"fix"`
  - `histMatch(t, f = HF, skip = "") → boolean` (`skip`: `"acc"`, `"kind"` or `"sub"` ignores that filter, for counts);
    account: `t.account === f.acc || t.to === f.acc`; sub: `cat`, `who` (`loanWho(loan(t.loan))`), `from`/`to`
  - `histList(f = HF, skip) → entries` in `range(HP)`, newest first, fees included
  - `histRows(list) → list` without fees whose host exists
  - `histWords(list, kind) → string[]` per spec Totals, per currency joined " + ", fees as `· $Z fees`
  - `histDrop()` clears any filter whose account, category or person no longer exists
  - `histClear()` → `HF` empty and `histAllTime()`
  - `openHistory(f = {})` → `HF = {…empty, …f}`, `histAllTime()`, `V.screen = "history"`, `V.open = ""`, render

- [ ] **Step 1: Write failing tests** (page.evaluate on a seeded notebook with a fee'd transfer, a fee'd loan
  payment, a EUR income, an adjust): `histList({kind:"xfer"})` includes the transfer and its fee;
  `histRows(...)` drops the fee; `histWords(list,"xfer")` → `["$200.00 moved", "$2.00 fees"]`;
  `histWords(received)` → `["€80.00 + $150.00 received"]`; lend → `"$50.00 lent"`, `"$0.00 got back"` omitted when 0;
  `histMatch` with `acc:"k"` matches a transfer into k; `from:"b",acc:"k"` matches only b→k; `histDrop()` after
  deleting account c clears `HF.acc === "c"`; an orphan fee (host deleted) stays in `histRows`.
- [ ] **Step 2:** run 41 → FAIL.
- [ ] **Step 3:** Implement the Interfaces; `money()` for amounts; totals words from `search.spent`,
  `search.received` and new keys `history.words.{moved,lent,gotBack,borrowed,paidBack,added,takenOff,fees}`
  (`{{amount}} moved` …), English only for now (Task 6 translates).
- [ ] **Step 4:** run 41, `npm run lint` → PASS.
- [ ] **Step 5:** Commit "History: filter logic and totals".

### Task 3: The History screen: period chip, Filters button, chips, month headings

**Files:**
- Modify: `js/history.js` (`historyView`, `histHeader`, `histMonths`), `js/screens.js` (remove `historyView`,
  `setHistAcc`, `histAccs`, the account strip), `js/events.js` (`hp-open`, `hp-all`, `hf-open`, `hf-del`,
  `hf-clear`; `hist-acc` and Home's History button call `openHistory`; remove `hacc`, `hmon`), `js/gestures.js`
  (remove History's sideways swipe), `css/app.css`
- Test: `tests/e2e/41-history.js`; update `03-periods.js`, `18-stability.js`, `28-hunt-fixes.js` (their History
  account-chip checks become filter checks)

**Interfaces:**
- Consumes: Task 2.
- Produces: markup — `.hbar` holding the period chip (`[data-act="hp-open"]` label, `[data-act="hp-all"]` ✕ only
  when not all), `[data-act="hf-open"]` Filters (`Filters · N` when set), `[data-act="hf-clear"]` Clear all (only
  when something is set and the list isn't empty); `.hchips` with one full-size chip per set filter
  (`[data-act="hf-del"][data-v="acc|kind|sub"]`, account chips with `.adot` and the tint); `.hfsum[role=status]`;
  `.hmon` month headings (name + `histWords` for that month) before each month's first day.

- [ ] **Step 1: Write failing tests:** opening from Home → all time, no chips, `Filters` unfilled, no Clear all;
  "Open in History" on an account's sheet → `HF.acc` set, chip shown; `hp-all` ✕ returns to all and keeps `HF.acc`;
  `hf-del` on kind clears kind and its `cat`; Clear all → default view; a period with no matches shows "Nothing
  matches these filters" with one Clear all (the bar's is hidden); month headings show "June 2026" and that month's
  words; a sideways swipe on History changes nothing; selection mode hides `.hbar` and `.hchips` and Select all
  selects only listed rows; leaving History and coming back from Home resets `HF`; the chip's parts are labelled
  "Choose a period" and "Show all time", each filter chip's ✕ "Remove filter: Cash", `.hfsum` is `role=status`.
- [ ] **Step 2:** run 41 → FAIL.
- [ ] **Step 3:** Implement; the account tint is `rgb(var(--acr) / 0.24)` light, `0.38` dark (restore the old
  `--pill-a` token in `colors.css` as `--tint-a`), text in `--on-surface`.
- [ ] **Step 4:** run 41, 03, 18, 28, 39, 40 → PASS; `npm run lint`.
- [ ] **Step 5:** Commit "History: the period chip, filters as chips, month headings".

### Task 4: The Filters sheet

**Files:**
- Modify: `js/history.js` (`filtersSheet`, `hfDraftView`, `hfMenu`), `js/events.js` (`hfs-acc`, `hfs-kind`,
  `hfs-sub`, `hfs-from`, `hfs-to`, `hfs-swap`, `hfs-show`, `hfs-clear`), `css/app.css`
- Test: `tests/e2e/41-history.js`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: `filtersSheet()` opens a sheet on a draft copy `HFD`; Show sets `HF = HFD`, closes, renders; ✕, Back or
  outside drop `HFD`. Sections `.sec`: Account, Transactions, then Category / Lent to / Borrowed from / Between.
  Compact chips `.hfc` (34px, row gap 14px). Account chips: `.adot`, picked one tinted. `[data-act="hfs-show"]` reads
  `Show {{count}} entries` (plural) or `No entries` (disabled).

- [ ] **Step 1: Write failing tests:** from the default view the sheet lists every account, Transactions with counts
  (Spent 83 …); a kind never tracked isn't there (a notebook without loans: no Lent, no Borrowed); picking Cash dims
  kinds at 0 and the picked one is never dimmed; Spent shows its categories most used first; Lent shows "Lent to"
  with Everyone and each person (one with a settled tab too); Transfers with no account: From ▾ ⇄ To ▾, swap swaps;
  with Credit card picked: both "any account", hint "One side is Credit card", 3 entries; From Everyday locks To as
  Credit card (2 entries); the From menu doesn't list Credit card and dims accounts at 0; closing with ✕ after
  changes leaves `HF` as it was; Show applies; the sheet's Clear all clears only `HFD`; a dimmed option has
  `aria-disabled="true"` and ignores taps; the sheet takes the focus and Back closes it.
- [ ] **Step 2:** run 41 → FAIL.
- [ ] **Step 3:** Implement; the menu is a `#pop` layer (`layerFocus`), opening upward when it wouldn't fit below.
- [ ] **Step 4:** run 41 → PASS; `npm run lint`.
- [ ] **Step 5:** Commit "History: the Filters sheet".

### Task 5: Simpler rows that open in place

**Files:**
- Modify: `js/screens.js` (`txLine`, new `txOpenView`, `dayGroups` skips fees with a host), `js/events.js`
  (`row-open` toggles `V.open`; Edit button keeps `tx-open`; `tx-lend` opens the loan), `js/gestures.js` (hold to
  select targets `.tx[data-act="row-open"]`), `css/app.css` (drop the old `.tx.en` three-line rules)
- Test: `tests/e2e/41-history.js`; update `01-core-flows.js:329`, `03-periods.js:72`, `18-stability.js:346`,
  `40-search.js:254` (click the row, then `[data-act="tx-open"]`), `07`, `26`, `39` (rows' new markup), and re-record
  `90-en-snapshot`

**Interfaces:**
- Produces: a row `.tx.en[data-act="row-open"][data-v][aria-expanded]` (selection mode: `sel-toggle` as today) with
  `.d` (title), `.s` (category · ● account, or ● from → ● to), `.a` (amount; `<small>` `+ $2.00 fee` or `→ €600.00`).
  `V.open` = the open entry's id (one at a time; cleared when the entry is gone or the screen changes). The opened
  part `.txo`: `.added` (clock, `Added at 6:14 PM` / `Added Jun 16 at 9:03 AM`), `.frow` of `.fbox` (label `.bcap`,
  figure `.bval`, `.bin` "in ● account"), a loan's `.lbox` (who owes, bar, "$250.00 of $600.00 paid"), centred
  `.acts` (Edit `tx-open`, Delete `tx-del`, then Open lending / Open loan).

- [ ] **Step 1: Write failing tests:** a fee'd transfer is one row with `+ $2.00 fee`, the fee has no row; tapping a
  row opens it (`aria-expanded="true"`), tapping another closes the first; an opened purchase shows "Left after",
  `$113.15`, "in Cash" and "Added at"; an entry with `ts` two days after its date reads "Added Jun 16 at"; an opened
  transfer shows two Left after boxes and "Paid in all $202.00", no rate line; an opened loan payment shows "You owe
  Maya $350.00" and "$250.00 of $600.00 paid", buttons in the order Edit, Delete, Open loan; Edit opens the entry
  form; deleting the open entry (Undo off) leaves no `.txo`; an orphan fee is its own row; the same rows appear in
  Home's day list and search results.
- [ ] **Step 2:** run 41 → FAIL.
- [ ] **Step 3:** Implement per spec "Entry rows"; "Left after" is the running balance after the entry and its fee
  (`runBal()[fee.id]` when a fee exists); time per `settings.clock`; the later day as `day numeric, month short`.
- [ ] **Step 4:** run 41, 01, 03, 07, 18, 26, 28, 39, 40 → PASS; re-record 90 (`SNAPSHOT_UPDATE=1`) and check the diff
  only moves row text; `npm run lint`.
- [ ] **Step 5:** Commit "Rows: two lines, fees inside, opened in place".

### Task 6: Words in nine languages, layout, docs, build

**Files:**
- Modify: `l10n/web/*.json` (9), `js/i18n/*.js` (generated), `tests/e2e/22-layout.js` (states: History default,
  filtered with chips, the sheet for Spent, Lent, Transfers with an account, an opened transfer and loan row),
  `CHANGELOG.md`, `README.md`, `docs/plans/2026-11-01-release-1.5.0.md` (item 12), `docs/decisions.md`, store media
- Test: `22-layout.js`, `32-i18n-static.js`, full suite

- [ ] **Step 1:** Add every new key's translation (de, es, fr, id, pt-BR, ru, tr, zh-Hans) with plurals for counts;
  `python3 tools/gen_i18n.py`.
- [ ] **Step 2:** Add the layout states; run `LAYOUT_LANGS=en,es,pt-BR,fr,de,ru,zh-Hans,id,tr node e2e/run.js 22` →
  fix anything cut, overlapping or untappable until PASS.
- [ ] **Step 3:** Full `npm test` (40+1 suites) and `npm run lint` → all PASS.
- [ ] **Step 4:** Docs: changelog lines (History all time and filters; simpler rows; fees inside their transfer),
  README History paragraph, plan item 12 ticked, decisions entries; `npm run media`.
- [ ] **Step 5:** Commit, push, wait for `origin/builds`, send the test APK.
