# History: all time, a period chip and a Filters sheet

Status: approved by the maintainer on 2026-11-05 from mocks on the real app. Search is now a mode of History ([search.md](search.md)) and adds three filters to it: words, payee and amount.

## Why

History is where a person finds entries precisely: by account, by kind of money movement, by category, person or the
accounts a transfer went between, over any period. Today it shows one month at a time and filters by account only.
History is the way to find entries by what they are, and its search mode by their words, a payee or an amount.

## What it looks like

**At the top of History** (under the app bar with Back, Search and Select):

- A **period chip**, `All time ▾` by default. Its label opens the period dialog (its accessible name is "Choose a
  period: {{period}}", the label in the name); once a period is set the chip shows it (`June 2026`) with an **✕** that
  goes back to all time and keeps the other filters. Label and ✕ are separate targets, each 48dp.
- A **Filters** button with the filter icon; once filters are set it reads `Filters · 3` and is filled.
- **Clear all**, a text button beside them, only while a period or a filter is set: it goes back to the default view
  (all time, no filters).
- Under that row, each set filter as a **full-size chip with ✕** (48dp, not compact: people tap these ✕ often):
  `Credit card ✕` `Transfers ✕` `From Everyday ✕` (the side that is the account itself, implied by the other, has no chip
  and isn't counted in "Filters · N"). Removing a filter also removes the ones that depend on it (✕ on
  Spent removes its category; ✕ on Transfers removes From/To).
- **No visible summary line** (maintainer's ruling): a visually hidden status region in its place says only the
  entry count ("12 entries", nothing when the list is empty), so TalkBack hears the new count after a change. The money
  in words is on the month headings.

**The list**: every entry of the period and filters, newest first, grouped by **month headings** (month name and its
totals, see Totals), then by day as today.

## Entry rows

Simpler rows, the same in History, Home's day list and search results:

- **Two lines.** Line 1: what it was (payee and note, or the category, or "Lent to Sam", "Transfer") and the amount.
  Line 2: the category (when the title isn't it) and the account with its colour dot (`Groceries · ● Credit card`);
  a transfer: `● Everyday → ● Cash`. No running balance on the row.
- **An add-on joins its entry**: under the amount, `+ $2.00 transfer charge`, `incl. $2.00 charge` or `+ $5.00 extra`;
  a cross-currency transfer `→ €600.00`. It has no row of its own anywhere entries are listed (it stays its own entry
  in the data, linked by `feeOf`). Every row and box is in docs/specs/charges.md ("History rows").
- **Tap opens the row in place** (one open at a time; tap again closes; `aria-expanded`). Editing is the Edit button
  inside. In selection mode a tap selects, as today.

**The opened row** adds only what the row can't show (each fact in one place; an account name only to tell two
balances apart):

1. **When added**: a clock icon, "Added at **6:14 PM**", at the normal text size; when written down on a later day
   than its date, "Added **Jun 16** at **9:03 AM**" (the date itself, never "Yesterday"). Time per Settings' clock.
2. **Figure boxes** (soft boxes, a small label over a bold figure, a little room inside):
   - every entry: **Left after** · the balance · `in ● Everyday` (after the entry and its add-on);
   - a transfer: one such box for each account, and the amount sent beside its **Transfer charge** when there is one;
   - a loan or lending entry: first a bar box, `You owe Maya $350.00` / `Sam owes you $50.00` (or **Cleared**), a bar
     of what's paid back and `$250.00 of $600.00 paid`; then the parts of the payment (what was paid or got back, beside its charge or extra),
     **Due** for a draw with a due date still owed, and the Left after box;
   - a balance fix: **Was** and **Now**.
   A loan's or balance fix's **note** is not on the collapsed row (its line 2 is the account); the opened row shows it
   as a quiet line under "Added at", wrapping. Expenses and income keep payee · note as their title, transfers their
   note.
   No exchange rate (the row already shows both amounts).
3. **Actions, centred**: Edit (tonal) and Delete (danger). On a loan or lending entry, Edit opens the loan's own sheet,
   so there is no separate Open lending / Open loan button (removed 2026-11-06).

**The default view**: all time, no filters. History opens on it from Home (the History button, "Open full history").
Opened from an account ("Open in History" on its sheet) it starts on all time with that account set.

## The period dialog

The dialog Home uses: Day, Range, Month, Year, with **Today** and **Cancel** at its foot. Opened from all time, nothing
is picked yet: the Month tab shows this year with only today's month marked (outlined, not filled). Today sets the day
today, as on Home. There is no All time tab or button: the chip's ✕ is the way back.

## The Filters sheet

A sheet titled **Filters**, chips inside it **compact** (34dp to see, 48dp to tap through the gap between rows; a chip
goes to the next line only when the line can't hold it). Sections, in order:

1. **Account**: All, then every account (archived ones only if they have entries, marked "archived"). Each account chip
   has a **dot of the account's colour** before its name; a picked account chip is **tinted in the account's colour**
   (the tint the account pills had: 0.24 light, 0.38 dark, text in the normal colour, WCAG AA on every palette colour).
2. **Transactions**: All, Spent, Received, Transfers, Lent, Borrowed, Balance fixes. A kind the notebook has never had
   is not shown at all (never tracked a loan: no Lent or Borrowed).
3. What the picked kind needs:
   - **Spent** → **Category**: the spending categories that have entries in the current choice, most used first, each
     with its emblem.
   - **Received** → **Category**: the income categories likewise.
   - **Lent** → **Lent to**: Everyone, then each person with a lending tab (open or settled, whether or not their name
     is still offered as a suggestion). **Borrowed** → **Borrowed from** likewise.
   - **Transfers** → **Between**: dropdown chips `From any account ▾` ⇄ `To any account ▾` (the swap between them).
     With an account picked in Account: both start as "any account", with "One side is Credit card" under them, and
     list every transfer in and out of it; choosing From fills To with the picked account, locked (no ▾), and the
     other way round; ⇄ flips the two; the dropdowns never list the picked account.
   - **Balance fixes**, **All** → nothing more.
   A picked chip shows its ✓ first (`✓ ● Cash`, `✓ Spent 40`, `✓ From ● Everyday ▾`), taking some of its leading
   padding so it doesn't jump to the next line; chips elsewhere in the app keep the ✓ after the name.
4. A sticky foot: **Clear all** (clears the sheet's choices) and **Show N entries**, the count of what the choices
   give, live; at 0 it reads **No entries** and is disabled.

**Counts and dimming**: every option shows how many entries it would leave, given the period and the other choices
(not its own section's). An option at 0 is dimmed and can't be picked; a picked option is never dimmed. Category and
person lists only list what has entries. A dropdown (From, To) is a menu of accounts with their counts, opening upward
near the foot of the screen.

## Totals

Each month heading, per currency (several joined with "+"), in words:

| Shown | Words |
|---|---|
| All, Spent, Received | `$X spent · $Y received` (what applies) |
| Transfers | `$X moved` (in the sending account's currency) |
| Lent | `$X lent · $Y got back` |
| Borrowed | `$X borrowed · $Y paid back` |
| Balance fixes | `$X added · $Y taken off` |

Transfers, the money loans move and fixes never count as spent or received. A charge is inside Spent, an extra inside
Received (as everywhere in Tally, docs/specs/charges.md "Counting").

## Rules

- **What a kind contains**: Spent = expenses (a purchase with its charge) plus the entries that carry spending inside
  them (a transfer or loan payment with a charge, a written-off lend's draw); only that spending counts in its heading.
  Received = income, and the lending payments that carry an extra (only the extra counts). Transfers = transfers and
  their charges; Lent / Borrowed = a lending's or loan's draws and payments with their add-ons; Balance fixes = fixes.
  An account matches when it's the entry's account or a transfer's destination. A transfer's charge is the From
  account's alone: filtered to the To account, the transfer is listed (under Transfers too) but its charge is not
  counted, and it is not listed under Spent.
- **An add-on** belongs to the kind of its entry and is shown inside that entry's row (not as a row). The Transfers
  filter says `Transferred $X` and `Charges $Z`, the Lent filter `Extras $Z` (a Charges line for a written-off
  lend's transfer charge), the Borrowed filter `Charges $Z`, each only when not 0. A purchase's charge follows its
  category. So does a tip (an extra received on a payback): it follows its payment, so a category filter on Received
  matches the payment's own category, not the tip's.
- **Gone targets**: a filter whose account, category or person no longer exists (a backup restored) is dropped.
- **Nothing matches** (a period changed, the last matching entry deleted): "Nothing matches these filters" with
  **Clear all** under it, both in the middle of the window, within the thumb's reach; the Clear all beside the
  Filters button is left out then (one is enough). "Nothing written down yet" sits there too.
- **Selection** (hold an entry, or Select): works on the filtered list; Select all selects what's listed. While
  selecting, the period and filter rows are hidden; the list stays filtered.
- **Leaving History** forgets its filters; entries opened from it and closed again keep them. Back from History goes
  Home as today. The one exception is Search: History → Search → Back keeps both the filters and the period, so the
  screen comes back as it was left. Leaving any other way resets as above.
- **Long lists** are drawn in chunks (the first 300 entries, then more as the end comes within a few screens); months
  still show the totals of the whole month, and Select all and the hidden count read from the data, not from what is
  drawn. Nothing changes in how it looks.
- **Sideways swipes** do nothing in History: they no longer switch accounts (accounts are a filter now), and they
  don't step the period either (maintainer: no swipe). Another month is picked in the period dialog.

## Words, payee and amount (added with search)

Three more filters, set only from search mode ([search.md](search.md)); the Filters sheet has no section for them.

- **Words** (`HF.q`): every typed word must start a word of the entry's payee, note, account, category or person (a
  number matches an amount); the same list the other filters narrow.
- **Payee** (`HF.pay`): one payee whatever its capitals or accents, as money spent there ("Paid to X") or money received
  from them ("Received from X"). A payee that no longer exists is dropped like any gone target.
- **Amount** (`HF.amt`): the amount itself (`50` means 50.00 to 50.99), more than, or less than; each entry's own amount
  (a transfer: the amount sent or received).
- They show as chips with ✕, count in "Filters · N" and in the Filters sheet's numbers, and **Clear all** removes them.
  They are dropped when search mode closes.

## Accessibility and text

- The period chip: "Choose a period" and "Show all time" for its two parts; each filter chip's ✕: "Remove filter:
  Cash"; counts read with each option; a dimmed option is `aria-disabled`; the hidden status region (not shown on
  screen) reads out the new count after Show or a removed chip. Search's counts use the same row rule as History: an
  add-on is folded into its entry and not counted.
- The sheet is a layer like the others (focus in, Back closes it, what's behind is hidden from screen readers).
  From 840px it is a centred dialog, as every sheet is there; held sideways it takes the full height.
- New texts, in all nine languages: Filters, Transactions, Between, From, To, Lent to, Borrowed from, Everyone, Any
  account, One side is {{account}}, Show {{count}} entries (plural), No entries, Clear all, All time, the kinds, the
  totals' words, Nothing matches these filters.
- Wraps, never cuts: long account and category names wrap inside their chips (fitWrapped), at every size and text
  size (`22-layout.js` gains History's states: default, filtered, the sheet for each kind).

## Not in this change

- Choosing several categories or accounts at once.
- Saving filters across visits.

## Decided in the review (2026-11-05)

- No swipe in History; another period is picked in the dialog.
- Closing the sheet without Show (✕, Back, outside) drops its choices; nothing changes.
- Clear all at the top goes back to the default view (all time, no filters); the sheet's Clear all clears only the
  sheet's choices.
- Ships in 1.4.4 as item 12, before the remaining polish items.
