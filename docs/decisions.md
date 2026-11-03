# Decisions

Product decisions and their reasons. Format: `- YYYY-MM-DD · P? · decision · why` (P0 security or data loss, P1 broken
core, P2 minor, P3 cosmetic).

- 2026-11-01 · P2 · 1.4.4 scope: #41 Year view (period, Summary tab, start-period setting), #37 account colour in History, #33 account reorder, global search, calculator grouping, reminders for loans without a due day, UI polish · maintainer's selection; plan in docs/plans/2026-11-01-release-1.4.4.md
- 2026-11-01 · P2 · Versions: the next update is 1.4.4 (versionCode 10404); 1.5.0 is the big update with budgeting / planning and security · maintainer's choice, as with 1.4.1–1.4.3 which also added features
- 2026-11-01 · P2 · Not in 1.4.4: per-account chart, category hold-total, recurring/future entries (#26), budget account (#24), CSV import (#36), split payments (#31) · maintainer's selection; recurring entries and budgets come in 1.5.0, the rest is undecided (docs/roadmap.md)
- 2026-11-01 · P2 · Calculator shows thousands grouping while typing (phone's separators) · maintainer's request
- 2026-11-01 · P2 · Loans/lendings without a due day get a monthly reminder on the day they were lent, both directions, until paid back; auto-picking tomorrow as due day dropped · today they never remind (bridge.js:65); maintainer's choice
- 2026-11-01 · P2 · Overpaying a loan/lending stays as on main: Tally asks; a lending's extra → new loan or income (user picks category), a loan's extra → new lending or that payment's fee, never spending; the account always gets the full amount · maintainer: this is the intended behaviour
- 2026-11-01 · P2 · Password-protected backups (#42) and app lock move to 1.5.0, together with budgeting / planning (recurring payments etc.) · maintainer: the security work is large and belongs with the planning feature; budgets are now in Tally's scope for that release
- 2026-11-01 · P1 · Backup password is off by default; users opt in from Settings · plain backups stay readable by older versions (data safety)
- 2026-11-01 · P1 · Protected backups: the app's own data is never encrypted or changed, only backup files; the file stays JSON with a marker so older versions refuse it safely; the app warns once that older versions can't open it · rollback on Android means uninstall + restore, so that is when a readable backup matters; maintainer: rollback is rare; the one-line warning is proposed, to confirm at the spec
- 2026-11-01 · P1 · When the Plan branch (claude/plan-wip) is rebased, its saved-data format must be renumbered past main's (main's v7 = payees, shipped in 1.4.2; plan-wip's v7 = repeats) · two meanings of one version number would mis-migrate users' data
- 2026-11-03 · P2 · During development, changes are checked with the tests and on an emulator; the maintainer tests by installing the test APK on a real device · maintainer's choice
- 2026-11-03 · P2 · Every interface or feature change is first shown as screenshots of a mock-up and discussed; code changes only after the maintainer agrees · maintainer: keeps the work organised, efficient and clean
