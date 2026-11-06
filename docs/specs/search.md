# Search inside History

Status: approved design (concepts reviewed and decided by the maintainer, 2026-11-06). Built on
[History](history-filters.md). Replaces the separate Search page and its Week / Month / Year page.

## What it looks like

- **A search button** in the top bar of Home, Assets, Liabilities and History, left of History. Not on Settings or
  Summary.
- Tapping it opens **History in search mode**: the top bar becomes Back and a search field (focused, the keyboard up,
  placeholder "Search History"); under it History's own period chip and Filters button, then the filter chips, then
  what search finds.
- **It always starts clean**: all time, no filters, an empty field, wherever it was opened from. Opened from History,
  History's own filters and period are put back as they were when search mode closes.
- **Back** closes search mode and returns to the screen it was opened from (a tab, or History as it was). The field's ✕
  empties the field and keeps search mode open.
- **Nothing typed yet**: the recent searches (below). No hint line.

## What a word finds

Every typed word must be found in the entry (the same rule as today's search):

- it starts a word of the entry's payee, note, account (either side of a transfer), category name or loan person;
  capitals and accents ignored (`curFold`: Turkish İ / ı fold to i), scripts written without spaces matched anywhere;
- a number matches an amount: `45` means 45.00 to 45.99, `45.50` exactly that, read with the phone's separators
  (`evalAmt`, `NUMSEP`);
- a fee's words and amount find its transfer or payment (a fee is never a row of its own);
- the words narrow History's list together with the period and every filter.

## Suggestions

While the field has text, a short list of suggestions sits above the entries, at most three per group, in this order.
Each shows how many entries it would leave (rows, by History's fee rule, with the period, the filters and the other
words as they are). One that would leave none, or is already set, isn't shown.

| Group | Found by | Tapping it sets | Chip |
|---|---|---|---|
| Paid to | a payee of money spent | the payee, spending only | Paid to X ✕ |
| Received from | a payee of money received | the payee, income only | Received from X ✕ |
| Categories | the category's name on screen | the category | X ✕ |
| Accounts | the account's name | the account | ● X ✕ |
| People | a loan's or lending's person | the person | X ✕ |
| Kinds | the kind's name (Spent, Transfers, …) | the kind | X ✕ |
| Period | a month's name in the phone's language (full or short), or a four-digit year | that month (each year that has entries, newest first) or year | the period chip |
| Amount | a number; `>50`, `<50` give only that one | the amount itself, more than, or less than | `$50.00 to $50.99` ✕, `More than $50.00` ✕, `Less than $50.00` ✕ |

- Tapping a suggestion takes the words that found it out of the field; the rest stay, and the field keeps the focus.
- The amount is shown in the notebook's currency when every account has it, else as a plain number in the phone's
  format; it compares each entry's own amount (a transfer: the amount sent or received).
- A payee is one name whatever its capitals or accents (the newest spelling shown), as today.

## The list

- History's own rows, month headings with their totals, opened rows, selection and Undo, all as in History.
- **Marks**: the part of a title or second line a word matched has a soft yellow marker. A loan's or balance fix's
  note, hidden on the collapsed row, shows as a third line "Note: …" when a word matched it.
- **Nothing found**: "Nothing matches “cofee”" (or "Nothing matches these filters" when nothing is typed), then, when a
  word one typo away finds entries, a button "Search “coffee” · 19 entries" (never swapped in by itself), then Clear
  all. In the middle of the window, like History's. No hint line.
- TalkBack hears the count of entries once typing pauses (History's hidden status, announced at most once per pause).

## Chips and the Filters sheet

- The payee and amount filters are History filters: they show as chips, count in "Filters · N", are counted in the
  Filters sheet's numbers, and are cleared by Clear all. The sheet has no sections for them; they are set only from
  search.
- Clear all also empties the field.
- A payee or amount filter is dropped when search mode closes, with the words.

## Recent searches

- With the field empty: up to five recent searches, newest first, each with ✕ to forget it. Tapping one puts it in the
  field.
- A search is kept when it is used: a suggestion or an entry tapped, or search mode closed with at least two characters
  typed. The same words again move to the top (capitals and accents ignored).
- **On this phone only**: kept by the native shell in its own preferences file, left out of Android's backup and device
  transfer (`backup_rules.xml`, `data_extraction_rules.xml`), never in saved data, Tally's backups, the shell's saved
  copy, CSV, the widget, notifications or logs. "Erase everything" forgets them too.

## Retired

- The Search page (`V.screen === "search"`), its groups and its Week / Month / Year page with bars, averages and the
  change from the period before. Bars and comparisons stay in Summary.

## Rules

- Search never changes saved data.
- Fast on old phones: each entry's searchable words are folded once and kept until the next save; the list redraws
  after typing pauses briefly. With 10,000 entries a keystroke's redraw stays under 80 ms in headless Chromium.
- Totals follow History: a fee is inside its entry, transfers, loans and balance fixes never count as spending,
  currencies are never added together.

## Accessibility and text

- The field is labelled "Search History"; each suggestion reads as one line ("Paid to Corner Café, 19 entries"); a chip
  reads "Remove filter: Paid to Corner Café"; a recent search's ✕ reads "Forget: corner".
- Every text in the catalogue in all nine languages, plurals for counts.
- Layout checks (`22-layout.js`): search mode empty with recents, typing with suggestions, a suggestion picked, an
  amount, nothing found; normal and large text; phones, a phone held sideways, foldables and tablets.

## Not in this change

Joined suggestions ("coffee" in June 2026), biggest first, a search box inside the Filters sheet's lists, Search on
Summary.
