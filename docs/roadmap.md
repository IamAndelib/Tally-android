# Tally roadmap

- **1.4.4** · the calculator closes when another field takes the focus (a fix release, 2026-11-06)
- **1.5.0** · fixes, Year view, search, account colours and order, History's filters, all time and archive, charges
  and extras (data version 8), Summary's day pie and opened rows, polish (released 2026-11-14) ·
  docs/plans/2026-11-01-release-1.5.0.md, docs/plans/2026-11-13-release-review-fixes.md
- **1.5.1** · Received opens on its categories as Spent does; the transfer's swap icon centred (2026-11-14)
- **1.5.2**, a point release from what the 1.5.0 reviews found (fixes and under the hood; no new screens) · exit:
  maintainer-tested on a phone
  - Reminders: a monthly reminder missed on its day (phone off, a battery saver) shows on the next open instead of a
    month later; a lend entered with an earlier date isn't reminded a minute after; a JUnit test for `monthlyDate`.
  - Notification wording the same in every language (French, Turkish and Chinese still mix the old "payback" word
    into a few lines; `n_payback_*` and `n_due_*` say the same and can be one pair); the native-speaker check of the
    1.5.0 texts.
  - Speed with big notebooks: History draws only what is in view, so an edit far down stops redrawing every row
    above it (~250 ms at 2,900 rows); search's first keystroke under 80 ms at 5–10k entries.
  - Small things: one search fills one recent-search slot, not several; Undo for an asset's new value; deleting the
    row in view deep in Home's Year list keeps the place as History does.
  - Under the hood: type checking as a guardrail (maintainer, 2026-11-13: option 1 of the assessment): TypeScript's
    checker over the existing JavaScript (`checkJs`, `tsc --noEmit` in lint and CI), one declaration file for the
    shared globals, the saved data and the `Android` bridge, and JSDoc where the checker needs it. No `.ts` files, no
    build step, no change to what runs: the F-Droid recipe and reproducible builds stay as they are. Start: 232
    problems in the default mode, about 2,800 in strict (2026-11-13); default mode first, strict file by file later.
    Its own plan.
  - Under the hood, code and tests: one spending-rule helper for `dayGroups`; near-copies merged; file splits
    (`rows.js`, `addons.js`, `settings.js`); the layout suite faster (screenshots only for problems, no fixed
    sleeps, sharded); shared test scaffolding in `harness.js`; `theme.js` (wallpaper colours) tested; the gaps in
    `tests/dead-code.js` closed.
- **1.6.0**, budgeting and security (later) · exit: maintainer-tested on a phone
  - Budgeting / planning: the Plan tab with repeating items and what's due, work in progress on
    `claude/plan-wip` (2 commits on top of 1.4.1; its Tally Dev APK: a985307, 2026-10-26). Covers #26 recurring and
    future-dated entries, #24 budget account, and #44 money owed for a bill or a service (no loan behind it), with or
    without a due day.
  - Unmerged and probably related: `claude/clever-shannon-1and6w`, credit card bills and extra loan repayments as
    income or spending (1 commit, 846 lines, 2026-10-09). Maintainer to decide whether it joins 1.6.0. Its "extra loan
    repayments" part is superseded: main already handles extras as intended (docs/decisions.md); take only the
    credit card bills, if anything.
  - Security: password-protected backups (#42, notes: docs/specs/42-protected-backups.md) and
    app lock (fingerprint / screen lock).
  - **Format clash (P1 when merging):** plan-wip uses saved-data format v7 for `repeats`, but main already shipped
    v7 for payees (1.4.2+). Rebasing must renumber the Plan format (v9 or later (main's v8 = charges, 1.5.0)) and migrate
    from main's v7, with a test restoring a real 1.4.3 backup.
  - Needs: the "Budgets and statement import are left out on purpose" lines in CONTRIBUTING.md (Design principles) and
    CLAUDE.md (Scope) updated in that release.
- **Asked for, not decided yet** (from the issues):
  - #33: a chart per account, and holding a category to see its total (1.5.0 did the reordering; Summary's rows now
    open to their entries).
  - #41: a custom first day of the month (payday) and a "last 30 days" period (1.5.0 did the Year and "Home opens
    on").
  - #47: holding a category on Home to open its History (1.5.0 did search and the category filter).
  - #36 CSV import · #31 spending from two accounts at once (likely not planned).
  - #49 a web server to use Tally from a laptop: not as asked, because Tally has no internet permission and promises
    none; a larger-screen or desktop way in, without a network, could be looked at.
