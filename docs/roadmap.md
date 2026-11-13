# Tally roadmap

- **1.4.4** · the calculator closes when another field takes the focus (a fix release, 2026-11-06)
- **1.5.0** · fixes, Year view, search, account colours and order, History's filters and archive, charges (data version
  8), polish · docs/plans/2026-11-01-release-1.5.0.md
- **Next, after 1.5.0** · type checking as a guardrail (maintainer, 2026-11-13: option 1 of the assessment): TypeScript's
  checker over the existing JavaScript (`checkJs`, `tsc --noEmit` in lint and CI), one declaration file for the shared
  globals, the saved data and the `Android` bridge, and JSDoc where the checker needs it. No `.ts` files, no build step,
  no change to what runs: the F-Droid recipe and reproducible builds stay as they are. Start: 232 problems in the
  default mode, about 2,800 in strict (2026-11-13); default mode first, strict file by file later. Its own plan.
- **Also after 1.5.0** (not planned yet): History: an edit far down redraws every row above it (~250 ms at 2,900
  rows); draw only what's in view · layout suite speed and sharding · test scaffolding in `harness.js` · fixed sleeps
  · theme.js tests · one spending-rule helper for `dayGroups` · near-copies · file splits (`rows.js`, `addons.js`,
  `settings.js`) · dead-code.js gaps · search's first keystroke (106–148 ms at 5–10k entries) · monthly reminders
  missed on their day, back-dated lends reminded at once, and a JUnit test for `monthlyDate` · recent searches
  filling several slots · Undo for an asset's value.
- **1.6.0**, budgeting and security (later) · exit: maintainer-tested on a phone
  - Budgeting / planning: the Plan tab with repeating items and what's due, work in progress on
    `claude/plan-wip` (2 commits on top of 1.4.1; its Tally Dev APK: a985307, 2026-10-26). Covers #26 recurring and
    future-dated entries, #24 budget account.
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
- **Undecided:** #36 CSV import · #33 chart per account, hold-a-category total · #31 split payments (likely not planned)
