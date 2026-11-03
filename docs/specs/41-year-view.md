# #41 Year view: discovery notes

Issue: https://github.com/IamAndelib/Tally-android/issues/41 · clarified by the requester to the maintainer (2026-11-01).

What the user wants:
- A. **Year in the Summary** (donut → Summary; today: 7 days / 8 weeks / one month, `summary.js` `SM.mode` d/w/m):
  a year's spending per category, with the comparison to the year before.
- B. **Year as a period** for Home (and History), beside Day / Range / Month (`period.js:141`), so the balance bar shows a
  year's spent / received.
- C. **Choose Home's start period** (today always opens on Today: `period.js:16`). The requester wrote "month / week / year";
  Home has no Week period, so offer the periods Home has (Today / This month / This year once B exists).

Notes:
- C is a new saved setting: `migrate()` must sanitise it, with a test (CLAUDE.md: every format change ships with a
  migration and a test). Week start (`settings.week`) and locales already handled by period code.
- Scope fit: views only; nothing added to the one-tap entry path.
- Status: in 1.4.4 (maintainer, 2026-11-01) with #37 (account colour in History) and account reordering (#33, first part only).
