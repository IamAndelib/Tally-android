# Search inside History

Status: built (concepts reviewed and decided by the maintainer, 2026-11-06). Built on
[History](history-filters.md). Replaces the separate Search page and its Week / Month / Year page.

## What it looks like

- **A search button** in the top bar of Home, Assets, Liabilities and History, left of History. Not on Settings or
  Summary.
- Tapping it opens **History in search mode**: the top bar becomes Back and a search field (focused, the keyboard up,
  placeholder "Search History"); under it History's own period chip and Filters button, then the filter chips, then
  what search finds.
- **It always starts clean**: all time, no filters, an empty field, wherever it was opened from. Opened from History,
  History's own filters and period are put back as they were when search mode closes.
- **The top bar's ←** leaves search mode at once and returns to the screen it was opened from (a tab, or History as it
  was: its filters, period, place in the list, opened row and drawn rows). **Android's Back** first undoes the last
  suggestion tapped, one tap per Back: its filter comes off and its words go back in the field where they were, the
  caret at the end; what was chosen or typed after it (the Filters sheet, typed words, other suggestions) stays. With
  no tap left it leaves like ←. Clear all and the field's ✕ forget the taps; a Filters sheet or a dialog that is open
  closes first. The field's ✕ empties the field and keeps search mode open.
- **However search mode is left** (Back, ←, a tab, a link in an opened row), History's period is put back: its own
  when search was opened from History, all time when it was opened from a tab.
- **Nothing typed yet**: the recent searches (below). No hint line.

## What a word finds

Every typed word must be found in the entry (the same rule as today's search):

- it starts a word of the entry's payee, note, account (either side of a transfer), category name or loan person;
  capitals, accents and width ignored (`curFold`: Turkish İ / ı fold to i, ß to ss, full-width letters and half-width
  katakana to the usual forms), and a typed word must start a word: in Chinese, Japanese, Korean and Thai (and Lao,
  Khmer, Myanmar), whose words are not separated by spaces, a word of two characters or more may match anywhere in the
  text, so compounds are found ("スタンド" finds "ガソリンスタンド"), while a single character must start a word, as
  `Intl.Segmenter` finds them in the phone's number and date locale (once per entry in the folded-text cache; Chrome
  87+, Tally's WebView floor; where it is missing, a single character matches anywhere too). Latin and other scripts
  with spaces: word starts only;
- a number matches an amount: `45` means 45.00 to 45.99, `45.50` exactly that, read with the phone's separators
  (`evalAmt`, `NUMSEP`);
- an add-on's words and amount find its entry (a charge or extra is never a row of its own);
- the words narrow History's list together with the period and every filter.

## Suggestions

While the field has text, a short list sits above the entries under one **Suggestions** heading (the entries follow
under an **Entries** heading), at most three per group, in the order below. Each row has its name as a title and a
second line with its group (named in the singular: Category, Account, Kind; a person reads "Lent to" or "Borrowed from",
or "Person" when they have both kinds) and how many entries it would leave: "Paid to · 19 entries" (rows, by History's
add-on rule, with the period, the filters and the other words as they are). One that would leave none, or is already set,
isn't shown. A name that is exactly the typed words comes first in its group, whatever its use, so the cut to three
never drops it. A month's or a kind's name matches from three letters (the whole name when it is shorter).

| Group | Found by | Tapping it sets | Chip |
|---|---|---|---|
| Paid to | a payee of money spent | the payee, spending only | Paid to X ✕ |
| Received from | a payee of money received | the payee, income only | Received from X ✕ |
| Category | the category's name on screen | the category | X ✕ |
| Account | the account's name | the account | ● X ✕ |
| Person | a loan's or lending's person ("Lent to", "Borrowed from", or "Person") | the person | X ✕ |
| Kind | the kind's name (Spent, Transfers, …); Charges and Extras also by other words (`history.kindWords`: "fee, fees, charge", "tip, tips, interest" in English), matched like the names | the kind | X ✕ |
| Period | a month's name (full or short), or a year | that month (each year with entries) or year | period chip |
| Amount | a number; `>50`, `<50` give only that one | the amount, more than, or less than | `$50.00 to $50.99` ✕, … |

- Tapping a suggestion takes the words that found it out of the field; the rest stay, and the field keeps the focus.
  One for a slot already set (a second payee, say) replaces it; a kind clears the category, person and sides that
  depended on it, as the Filters sheet does.
- The amount is shown in the notebook's currency when every account has it, else as a plain number in the phone's
  format; it compares the figure the entry's row shows (a transfer: the amount sent or received; a purchase: its price with
  its charge), in the list of a typed `>50` / `<50` as in the suggestion. A number alone also finds the figures in the
  opened row (docs/specs/charges.md, "Search").
- A payee is one name whatever its capitals or accents (the newest spelling shown), as today.

## The list

- History's own rows, month headings with their totals, opened rows, selection and Undo, all as in History.
- **Marks**: the part of a title or second line a word matched has a soft yellow marker. A loan's or balance fix's
  note, hidden on the collapsed row, shows as a third line "Note: …" when a word matched it.
- **Nothing found**: "Nothing matches “cofee”" (or "Nothing matches these filters" when nothing is typed), then, when a
  word a few typos away finds entries (one typo from five letters, two from nine; a letter changed, missing, extra or
  two neighbours swapped), a button "Search “coffee” · 19 entries" that puts that word in the place of the
  typed one (never swapped in by itself), then Clear all. In the middle of the window, like History's. No hint line.
  Only when nothing matched at all: under a suggestion (a period, or Charges for "fee") there is no such message.
- TalkBack hears the count of entries once typing pauses (History's hidden status, announced at most once per pause).

## Chips and the Filters sheet

- The payee and amount filters are History filters: they show as chips, count in "Filters · N", are counted in the
  Filters sheet's numbers, and are cleared by Clear all. The sheet has no sections for them; they are set only from
  search.
- Clear all, beside Filters in the bar, also empties the field. The Filters sheet's own Clear all clears only the
  sheet's choices (account, kind, category, person, transfer sides): the words, the payee and the amount stay, and Show
  keeps them.
- A person set from a suggestion has no kind, so its chip reads just the name; with a kind (from History) it reads
  "Lent to X" / "Borrowed from X".
- A payee or amount filter is dropped when search mode closes, with the words.

## Recent searches

- With the field empty: up to five recent searches, newest first, each with ✕ to forget it. Tapping one puts it in the
  field.
- A search is kept when it is used: a suggestion or an entry tapped, or search mode closed with at least two characters
  typed. The same words again move to the top (capitals and accents ignored).
- **On this phone only**: kept by the native shell (`Android.recentGet` / `recentSet`, at most five texts of at most 100
  characters, checked in Java; the page keeps them in memory where the shell lacks the methods) in its own preferences
  file, left out of Android's backup and device transfer (`backup_rules.xml`, `data_extraction_rules.xml`), never in
  saved data, Tally's backups, the shell's saved copy, CSV, the widget, notifications or logs. "Erase everything"
  forgets them too.

## Retired

- The Search page (`V.screen === "search"`), its groups and its Week / Month / Year page with bars, averages and the
  change from the period before. Bars and comparisons stay in Summary.

## Rules

- Search never changes saved data.
- Fast on old phones: each entry's searchable words are folded once and kept until the next save; the list redraws
  after typing pauses briefly. With 10,000 entries a keystroke's redraw stays under 80 ms in headless Chromium.
- Totals follow History: a charge or extra is inside its entry (as the figures its row shows), transfers, the money loans move and balance fixes never count as spending,
  currencies are never added together.

## Accessibility and text

- The field is labelled "Search History"; each suggestion reads as one line ("Paid to Corner Café, 19 entries"); a chip
  reads "Remove filter: Paid to Corner Café"; a recent search's ✕ reads "Forget: corner".
- Every text in the catalogue in all nine languages, plurals for counts.
- Layout checks (`22-layout.js`): search mode empty (with and without recents), typing with suggestions, a suggestion
  picked, an amount, nothing found (with and without the near-word button) and a row with the note that matched;
  normal and large text; phones, a phone held sideways, foldables and tablets; German, Russian and Chinese on the
  tightest sizes, the other languages on request.

## Not in this change

Joined suggestions ("coffee" in June 2026), biggest first, a search box inside the Filters sheet's lists, Search on
Summary.
