# History: a pinned header, and archiving entries

Approved by the maintainer on 2026-11-07 from the mock-ups (real app, light and dark, phone and sideways). Built in
1.4.5 after charges (`docs/plans/2026-11-07-charges.md`), on data version 8, which is not released yet.

## A · The header stays while the entries scroll

1. While History scrolls, three things stay at the top: the app bar (← History, search, select), the period / Filters
   row, and the heading of the month in view, with its "+" and "−" figures. Only the entries move under them.
2. When the list reaches the next month, that month's heading pushes the old one up and takes its place. Day headings
   scroll as today. A thin line (`--outline-variant`) under the pinned month heading separates it from the entries.
3. Search keeps the same pinned block, with the search field in place of the app bar.
4. **Selecting:** only the bar ("1 selected" with its actions) and the dimmed Filters row stay; the month headings are
   not pinned and scroll with the entries, since their totals are not about the selection.
5. **A phone held sideways** (`body.land`): the app bar and the month heading stay, the month on one line (its "+" and
   "−" figures side by side); the Filters row scrolls away with the entries and comes back as soon as the list
   scrolls up.
6. Built with `position: sticky` (WebView 87 has it). Each month is wrapped in its own section, so the next heading
   can push the old one; History's chunked drawing adds a chunk that continues a month inside that month's section.
   Anything that scrolls to a row (an edited entry, Undo, a search match) leaves room for the pinned block
   (`scroll-padding-top`). TalkBack reads the page in the same order; the month heading keeps its heading role.

## B · Archive an entry instead of deleting it

1. **Archiving hides an entry from History and changes nothing else:** every balance, loan, total and chart stays as
   it is. Every kind of entry can be archived, loan paybacks included.
2. **The delete question:** "Delete this entry?" / "Delete these 2 entries?" (plural keys), with a line that warns
   about Delete only, then Delete (filled red), Archive instead (tonal), Cancel (outlined):
   - an entry: "Deleting changes the account balance."
   - a loan or lending entry: "Deleting changes the account balance and the loan."
   - several: "Deleting changes the account balances."
   "Change the account balance" and "Keep the current balance" go: archiving replaces keeping the balance, and
   nothing moves into an account's opening balance any more. Deleting from the loan's own page stays as it is.
3. **After archiving:** the row leaves the list and the message reads "Archived", with Undo.
4. **History's bar** gets an outlined archive-box icon, left of search, only while at least one entry is archived
   (TalkBack: "Archived entries"). Archived entries are reached only from there.
5. **The Archived screen:** titled "Archived"; History's rows with their month and day headings, without totals. An
   opened row offers "Show again" (the word an archived account uses) and Delete; "Show again" gives "Back in
   History" with Undo. Delete there asks "Delete this entry?" with the same warning line, Delete and Cancel (no
   Archive instead). Empty: "Nothing archived." and "Entries you archive wait here, with every balance as it is."
6. **Selecting** in History adds "Archive selected" (the archive icon) beside "Delete selected".
7. **Archived entries still count** in History's month and day totals, Home's donut and balance bar, Summary and
   every balance. Search does not find them. CSV export keeps them (they happened).
8. **Data:** a stored mark on the entry, `archived: true`, kept and sanitised by `migrate()` with a test; backups carry
   it. An older version ignores the mark and shows the entry again with every balance unchanged, which is safe. An
   archived entry's linked charge or extra is archived and shown again with it.
