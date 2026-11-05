# History: all time, a period chip and a Filters sheet

Status: design agreed with the maintainer on 2026-11-05 from mocks on the real app (concept 3); this spec is for review
before the implementation plan. Search will build on it later: a search result can open History with its filter set.

## Why

History is where a person finds entries precisely: by account, by kind of money movement, by category, person or the
accounts a transfer went between, over any period. Today it shows one month at a time and filters by account only.
Search stays the way to find entries by their words; History becomes the way to find them by what they are.

## What it looks like

**At the top of History** (under the app bar with Back, Search and Select):

- A **period chip**, `All time ▾` by default. Its label opens the period dialog; once a period is set the chip shows it
  (`June 2026`) with an **✕** that goes back to all time and keeps the other filters. Label and ✕ are separate targets,
  each 48dp.
- A **Filters** button with the filter icon; once filters are set it reads `Filters · 3` and is filled.
- **Clear all**, a text button beside them, only while a period or a filter is set: it goes back to the default view
  (all time, no filters).
- Under that row, each set filter as a **full-size chip with ✕** (48dp, not compact: people tap these ✕ often):
  `Credit card ✕` `Transfers ✕` `From Everyday ✕`. Removing a filter also removes the ones that depend on it (✕ on
  Spent removes its category; ✕ on Transfers removes From/To).
- A **summary line**: the number of entries and their money in the words that fit what's shown (see Totals).

**The list**: every entry of the period and filters, newest first, grouped by **month headings** (month name and its
totals, in the same words as the summary line), then by day as today. The rows are today's entry rows.

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
4. A sticky foot: **Clear all** (clears the sheet's choices) and **Show N entries**, the count of what the choices
   give, live; at 0 it reads **No entries** and is disabled.

**Counts and dimming**: every option shows how many entries it would leave, given the period and the other choices
(not its own section's). An option at 0 is dimmed and can't be picked; a picked option is never dimmed. Category and
person lists only list what has entries. A dropdown (From, To) is a menu of accounts with their counts, opening upward
near the foot of the screen.

## Totals

The summary line and each month heading, per currency (several joined with "+"), in words:

| Shown | Words |
|---|---|
| All, Spent, Received | `$X spent · $Y received` (what applies) |
| Transfers | `$X moved` (in the sending account's currency) |
| Lent | `$X lent · $Y got back` |
| Borrowed | `$X borrowed · $Y paid back` |
| Balance fixes | `$X added · $Y taken off` |

Transfers, loans, fixes and fees never count as spent or received (as everywhere in Tally).

## Rules

- **What a kind contains**: Spent = expenses that aren't fees; Received = income; Transfers = transfers and their fees;
  Lent / Borrowed = a lending's or loan's draws and payments, and their payments' fees; Balance fixes = fixes. An
  account matches when it's the entry's account or a transfer's destination.
- **A fee** is listed with the kind of what it was charged on and counted in neither spent nor the totals above
  (its own `· $Z fees` when any).
- **Gone targets**: a filter whose account, category or person no longer exists (a backup restored) is dropped.
- **Nothing matches** (a period changed, the last matching entry deleted): "Nothing matches these filters" with
  **Clear all**.
- **Selection** (hold an entry, or Select): works on the filtered list; Select all selects what's listed. While
  selecting, the period and filter rows are hidden; the list stays filtered.
- **Leaving History** forgets its filters; entries opened from it and closed again keep them. Back from History goes
  Home as today.
- **Sideways swipes** no longer switch accounts in History (accounts are a filter now).

## Accessibility and text

- The period chip: "Choose a period" and "Show all time" for its two parts; each filter chip's ✕: "Remove filter:
  Cash"; counts read with each option; a dimmed option is `aria-disabled`; the summary line is a status region, so
  the new count is read out after Show.
- The sheet is a layer like the others (focus in, Back closes it, what's behind is hidden from screen readers).
  From 840px it is a centred dialog, as every sheet is there; held sideways it takes the full height.
- New texts, in all nine languages: Filters, Transactions, Between, From, To, Lent to, Borrowed from, Everyone, Any
  account, One side is {{account}}, Show {{count}} entries (plural), No entries, Clear all, All time, the kinds, the
  totals' words, Nothing matches these filters.
- Wraps, never cuts: long account and category names wrap inside their chips (fitWrapped), at every size and text
  size (`22-layout.js` gains History's states: default, filtered, the sheet for each kind).

## Not in this change

- Search opening History with a filter (its scope pages stay as they are for now).
- Choosing several categories or accounts at once.
- Saving filters across visits.

## Open points (defaults chosen in the review, to confirm)

1. **Stepping through periods without ‹ ›**: the History bar no longer has arrows. Default: a sideways swipe on the
   list steps the period (as Home's ring does) while one is set; on all time it does nothing.
2. **Closing the sheet without Show** (✕, Back, tapping outside): default: the choices are dropped, nothing changes.
3. **Clear all at the top** goes back to all time too (the default view in one tap); the sheet's Clear all clears only
   the sheet's choices. Default as written above.
4. **Release**: default: this goes into 1.4.4 as item 12, before the remaining polish items.
