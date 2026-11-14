# Design round: History and search polish, dialogs, wording, Home, Summary, forms, charges

Status: built in 1.5.0; approved by the maintainer on 2026-11-06 after three rounds of mock-ups. The section "Changes after the
confirmation page" at the end wins over anything above it. Fees and interest become **charges** (see that section and
part C); charges are built after parts A and B, with their own data-format update.

Every item was shown to the maintainer as mock-ups drawn on the real app and approved on 2026-11-06 ("we can start
building"). "NEW DEMO" marks items whose final form was drawn in that last set.

## A. This round (search and History, small)
1. Leaving selection keeps the top bar: keep the period/Filters row's space while selecting (nothing jumps).
2. "may 2025" → one Period suggestion first ("May 2025 · Period · N entries"); no "Nothing matches" under a Period
   suggestion.
3. "jun 14" → "Sun, Jun 14, 2026 · Period · N entries".
4. Suggestions start from 2 typed letters.
5. Recent searches keep what was used (a tapped suggestion is kept as its filter, with a 24 px emblem in the clock's
   place; searches that found nothing and fragments under 3 letters aren't kept). Rows with ✕ as drawn in
   the approved mock-up.
6. An entry edited out of the filters: snack "Saved · no longer in this list" with Undo.
7. Filters sheet: "From any account ▾" / "To any account ▾" (a lower-case "any"; today it reads "From Any account").
8. Suggestions hidden while selecting.
9. Everything selected → the button becomes "Clear selection".
10. Empty notebook's History: no period chip or Filters until the first entry; Search stays in the bar.
11. Amounts prefilled with the currency's decimals ("4,167.50").
12. Negative balances with the true minus "−".
13. Welcome screen: only Settings in its bar.
14. Settings' reminder line: "On the due day, or monthly when there is none".
16. NEW DEMO: **name suggestion chips** (the people under "Lent to" / "Borrowed from" in Lend / Borrow, and the
    payees under "Paid to" / "Received from" in Spent / Money in): **compact** (the Filters sheet's compact chip size, 48 dp
    to tap), **each with its own ✕**; ✕ takes that name out of the suggestions (entries keep it) and shows an **Undo**
    snackbar ("Removed “Mahin” from suggestions · Undo").
15. NEW DEMO: **Clear all below the chips** when filters are set (today it sits in the bar beside Filters); with only a
    period set and no chips, where it goes (propose: under the bar, same place).

## B. Demo round
1. Backup folder dialog as decided (Restore green / Overwrite red / Cancel outlined; confirms "This phone's data will be
   replaced by the backup's." and "This backup's data will be lost, replaced by this phone's."; Cancel closes all).
2. Delete an entry: "Delete and update the balance" red filled, "Delete, keep the balance" outlined red, Cancel outlined.
3. History headings, stacked column on the right (NEW DEMO for the parts below):
   - Month: + received (green) over − spent (red); each currency its own line; **no fees line and no fees icon** (fees
     are inside spent).
   - **Day: the same stacked column: + income (green) over − spending (red)**; no fees chip on a day (the row already
     says "+ $2.50 fee").
   - Transfers filter: **"Transferred $1,830.00"** and **"Fees $2.50"**, in words (no icons), on month and day.
   - Lent / borrowed filters: the rows' signs (lent −, got back +; borrowed +, paid back −).
4. Unreadable backup: Choose another folder (filled) / Overwrite (red, asks again) / Cancel.
5. Paying back more than owed: the likely answer filled, the other tonal, Go back outlined; the loan's fee choice is
   "Track as interest" (C7).
6. Restoring a file: Restore (green) / Choose another file (tonal) / Cancel.
7. Delete all data: Save backup / Delete without a backup / Cancel, then the final Cancel | Delete (kept).
8. One name per thing, including "Account" on Spent, "Received
   categories" in Settings, "At the start of today: $4,182.50", shorter helper texts, one note style.
9. Home: the chip row fades at its edge. NEW DEMO: the **balance bar stacked** ("4 entries ›" on the left; on the right
   "Total in USD" over the figure), and how it looks with **two or three currencies** (one stacked figure per
   currency, each with its code; propose how they line up).
10. Loan sheet: the cleaner version (each thing said once) **but keep the Active / Partly paid chips** (on the sheet and
    in Assets/Liabilities; badges are not reduced to exceptions).
11. NEW DEMO: **the account's colour dot before every account name in entries and rows** — Assets and Liabilities loan
    rows ("Into ● Everyday · Due Tue, Jun 30 · $150.00" today is too texty: organise it at a glance, keep small rows
    uncluttered since they can be opened), and everywhere else an account is named in a row or sheet line.
12. Summary: whole amounts in every tab (A). NEW DEMO: the Months tab with a **pie chart** instead of the donut (the
    empty middle looked like a void); the total under the chart as on the other tabs.
13. Forms: the fee as a compact row (C's wording, no "not counted"), one note style, Received uses the same category
    chip as Spent.
14. Small marks: coffee button **unchanged**; calculator ⌫ **unchanged**; History's Select icon = outlined checklist;
    the net worth card without its explaining line, the same soft container in both themes; a picked account in a form
    is tinted in its own colour like Filters (B). NEW DEMO: the **category form unchanged except the emblem**: a
    transparent dark tint over the emblem with a pen (edit) icon on it, replacing the "Change emblem" text; the whole
    emblem is the button (TalkBack "Change emblem").

## C. Fees and interest inside their entry
- A fee or interest is part of the entry it came with and counts as spending (interest received counts as income); the
  transfer or loan movement itself never counts. All past fees count.
- Home's donut and Summary: one fixed grey **Fees** part (fees + interest paid), not a tile; legend "● Fees ৳10.00" in
  the donut's hole on Home (A); in Summary the Fees line at the end of the list is the legend (A).
- New notebooks start without the built-in "Fees" category tile; existing notebooks keep theirs as an ordinary category.
- History: fees are inside "spent" (no fees line, no icon; see B3). NEW DEMO: **how a fee shows inside each kind of
  entry's row**, no icon: a transfer ("+ $2.50 fee" under the amount, as today), money received with a fee (the
  income amount with "− ৳150.00 fee" or "৳9,850.00 reached" under it — propose the clearest), a purchase with tax
  ("incl. ৳150.00 tax"), a loan payment with interest ("+ ৳200.00 interest"), a lending payment with interest received
  (green "+ ৳150.00 interest"), a lend with a fee; collapsed and opened.
- Forms: transfer "Fee" row + preview "Bkash −৳1,010.00 · Bank +৳1,000.00"; loan/lending payment "Add a fee" and "Add
  interest"; Money received "Add a fee" ("Reaches Bkash ৳9,850.00"); Lend/Borrow "Add a fee"; Spending "Add tax or
  charge", the tax counted in the purchase's own category.
- Paid more than owed: "Track as lending" / "Track as interest" (loan); "Track as interest" / "Track as loan" (lending).

## Changes after the confirmation page (maintainer, 2026-11-06) — these win over anything above
- **One word: "charge"** for fees, interest and tax everywhere: "Add a charge" on every form (transfer, loan/lending
  payment, money received, lend/borrow, spending); rows "+ ৳10.00 charge"; the grey part and its legend "● Charges".
  A loan/lending payment has one "Add a charge" (no separate "Add interest"): a charge you pay is spending; a charge you
  receive on top of a lending's payment is income.
- A purchase's charge (VAT, service charge) counts in the purchase's own category (Eating out shows ৳1,150); the grey
  Charges part holds the other charges (transfers, payments, received, lend/borrow).
- **The charge field gets the calculator**, like every amount field.
- **Bug (major):** with the calculator open, tapping "Add a fee" focuses the fee field and Android's keyboard opens
  under the calculator keypad, both on screen. Fix: opening any other field (or Add a charge) closes the calculator;
  the charge field opens its own calculator when asked.
- Paid more than owed: lending (they paid more) → **Track as income** (filled) / Track as loan / Go back; loan (you paid
  more) → **Track as charge** (filled) / Track as lending / Go back. (Some people don't take or pay interest; "income"
  and "charge" fit everyone.)

## Changes after the build started (maintainer, 2026-11-06)
- **A1 instead:** while selecting, the period / Filters row stays where it is, dimmed and not tappable (no empty
  space, nothing moves; the selection's filters stay in view).
- **A15 instead:** the filter chips continue on the same line right after the Filters button, wrapping only when the
  line is full, with Clear all as the last item (no line of its own).
- **Recent searches get a "Clear all"** at the end of their heading (a text button on the heading's line); it empties the
  list and shows an Undo snackbar ("Recent searches cleared · Undo"). Mock-up sent; build with Task 2's follow-up.
- **The charge row is a tonal card** (chosen from four concepts): a soft surface-container card holding a small
  "Charge" label over a medium figure with its currency code, a round tonal calculator button (48 dp) and ✕ at the
  right; under a thin line inside the same card, the preview ("● Bkash −৳1,010.00 · ● Bank +৳1,000.00"). With the
  keypad open on the charge, the card's line and label take the accent colour and the keypad's bar names the field
  ("Charge"); the field the keypad isn't filling looks idle. Built with the charges.
- **No "Open lending" / "Open loan" in an opened row:** Edit already opens the loan's sheet, so the row ends with Edit
  and Delete only.
