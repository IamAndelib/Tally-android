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
- 2026-11-03 · P2 · #37 account colour in History: a soft pill in the account's colour around the account name (a transfer gets one per account); the left edge and the tinted row were shown and not chosen · maintainer's pick from the demo; the name stays, so nothing is shown by colour alone
- 2026-11-03 · P2 · Reminder for a loan/lending with no payback day: its buttons are "Record payment" and "Set a due date" (no +1 day / +1 week) · maintainer's choice
- 2026-11-03 · P2 · Home for a year shows the ring and donut of the whole year, as for a day or a month; the Summary's Year tab has 12 monthly bars · maintainer's choice
- 2026-11-03 · P2 · "Home opens on" (Today / This month / This year) sits in Settings → Region, above the first day of the week · maintainer took the recommendation
- 2026-11-03 · P2 · Every list in Assets and Liabilities, and Home's balance chips, reorder by hold-and-drag; Home and Assets share one account order · maintainer's request
- 2026-11-03 · P2 · Deleting entries asks whether the balance changes or stays (kept: the account's opening balance absorbs the amount, no extra entry); wording without amounts · maintainer's request, wording to confirm
- 2026-11-03 · P2 · Search shows matches grouped by kind as you type (Paid to, Received from, Categories, Entries; each with a count and total), and a group opens all its entries with their total · maintainer's request, to confirm from the demo
- 2026-11-03 · P2 · Year picker: a grid of 12 years like the month grid, years without entries faded · maintainer's pick from the demo (grid or wheel)
- 2026-11-03 · P2 · Default colour for credit card accounts becomes purple, so cards no longer look like banks; an account's own chosen colour is untouched · maintainer's choice
- 2026-11-03 · P2 · Delete wording confirmed: "Delete this entry? Should its amount go back to the account, or the balance stay as it is?" · "Delete and update the balance" / "Delete, keep the balance" · maintainer
- 2026-11-03 · P2 · Grouped search confirmed (Paid to, Received from, Categories, Accounts, People, Entries) · maintainer
- 2026-11-03 · P2 · Summary Year chart: 12 monthly bars that swipe sideways (short month names, whole amounts on top, faded edges where more months are), opening centred on this month; the bars are for looking, not tapping · maintainer, from the demo
- 2026-11-04 · P3 · Summary Year chart: five months in view, this month at the right edge (replaces "centred") · maintainer, after trying round B on a phone
- 2026-11-04 · P3 · Summary Days tab: today's column is labelled "Today" instead of its weekday, so it can't be mistaken for the same weekday a week earlier; the picked day stays bold · maintainer's pick (A) of three concepts (label, dot, ring)
- 2026-11-05 · P2 · Home's balance chips keep an order of their own, separate from the accounts' order in Assets (and in pickers); dragging in one never moves the other · maintainer, after trying round C
- 2026-11-05 · P2 · A search result opens by Week | Month | Year | All (concept A), with up to six bars ending at the chosen period and none before its first entry, the total, the average per entry and the change from the period before; not B's three figures (redundant). It opens on this month, or on All when nothing of it is this month; no comparison with a period during which the notebook was started · maintainer's pick, defaults mine
- 2026-11-05 · P3 · A small phone held sideways: Home's bar keeps Search where it is upright and drops the ‹ › arrows (the ring's swipe and the period dialog still move the period) · maintainer's pick of two demos
- 2026-11-05 · P3 · A Home chip dragged over another ticks once per switch, not on every move, like the rows · maintainer, after trying round D
