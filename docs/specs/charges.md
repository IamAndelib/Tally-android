# Charges and extras: fees, interest and tax inside their entry

Status: approved 2026-11-07. The model and the looks come from the design round
([design-round.md](design-round.md): part C, "Changes after the confirmation page", which wins over part C, and the
tonal card in "Changes after the build started"; images C-transfer, C-rows, C-home, C-summary, C-forms, C-overpaid and
the tonal card B). The maintainer then settled every open point on 2026-11-07 in two more rounds of mock-ups: round 2
(D9-home, D6-transfer, D2-extras, D11-words) and round 3 for lends and borrows (lend-form, borrow-form, lend-after,
lend-payback, lend-refine). Their wording is approved; where they differ, round 3 wins, then round 2. The decisions are
listed at the end and folded into every section.

## The model

### Words

- A **charge** is money you pay with an entry: a fee, interest, a tax, a service charge, a processing fee.
- A **transfer charge** is the charge a bank or wallet takes for moving money: on a transfer, on paying back a loan,
  and on a lend.
- **Charges** (plural, one total) are what a borrow costs on top of the amount: a fee and any interest together.
- An **extra** is money you get on top of what you lent: interest agreed when you lend, or a tip on top of a payback.

### Which form offers what

| Form | Offers | Card |
|---|---|---|
| Transfer | + Transfer charge | Transfer charge |
| Paying back a loan ("Paid some back?") | + Transfer charge | Transfer charge |
| Being paid back a lending ("Got money back?") | + Add an extra (an unplanned tip) | Extra |
| Lend money | + Transfer charge, + Add an extra | Transfer charge, Extra (one card when both) |
| Borrow money | + Add charges | Charges |
| Spent | + Add a charge | Charge |
| Received | nothing: you write down what arrived | — |

### What each one does

| Entry | Main amount | Add-on | The account sees | What is owed | Counts as |
|---|---|---|---|---|---|
| Transfer | what was sent | transfer charge | From −(amount + charge); To +amount (or what arrived) | — | spending, Charges |
| Paying back a loan | what goes off the loan | transfer charge | −(amount + charge) | − amount | spending, Charges |
| Spending | the price | charge | −(amount + charge) | — | spending, the purchase's category |
| Lend | what was lent | transfer charge | −(amount + charge) | + amount + charge | not spending: lent money, owed back |
| Lend | what was lent | extra (interest) | nothing now | + extra | income, from the last money paid back |
| Borrow | what was borrowed | charges (fee + interest, one total) | +amount | + amount + charges | spending, from the last money you pay back |
| Being paid back a lending | what came in | extra (a tip on top) | +(amount + extra) | − amount | income (received) |
| Received | what arrived | none | +amount | — | income, as today |

- **A purchase's charge** (VAT, a service charge) counts in **the purchase's own category**: a ৳1,000.00 dinner with a
  ৳150.00 charge makes Eating out ৳1,150.00.
- **Every other charge that counts as spending** counts in one fixed grey part called **Charges**, which is not a
  category: no tile, can't be renamed, hidden or picked, always the same grey (`#7a8190`, the colour fees had before
  1.3.2 and the balance fix's emblem colour).
- **The movement itself never counts.** A transfer, the money a loan or lending moves (draws and payments) and a
  balance fix are never spending or income, as before; a day with only paybacks has no received total, by design.
- **All past fees count.** Every fee already recorded on a transfer or a loan or lending payment is a charge from this
  version on and counts as spending in Charges. No amount or balance changes; the totals of past days and months go up
  by the fees already recorded. The changelog says so.
- **Existing lendings and loans stay as they are.** No earlier version could record a charge or an extra on a lend or
  a borrow, so nothing is added to what anyone owes; a lending payment's older paid fee stays spending. The new
  behaviour applies to lends and borrows recorded from this version on.

### Lends and borrows: what is owed, and when it counts

What is owed is always worked out by `loanInfo()` from the entries; nothing about it is stored on the loan.

- **A draw owes** its **money** (its amount, plus a lend's transfer charge) and its **amount on top** (a lend's extra,
  or a borrow's charges). A loan owes the sum of its draws.
  - Lend ৳1,000.00 with a ৳100.00 transfer charge and a ৳150.00 extra: Bkash −৳1,100.00, Rafi owes ৳1,250.00.
  - Borrow ৳1,000.00 with ৳100.00 of charges: Bank +৳1,000.00, you owe Rafi ৳1,100.00.
- **Payments are shared out as today, then within each draw.** Oldest payment first, each goes to the draws made by its
  day, due soonest first (draws without a due day last, oldest first), and anything over is credit for later draws, as
  today. Within a draw a payment covers, in this order, the amount, then the transfer charge, then the amount on top.
  So the amount on top is always the last money paid back on its draw.
- **The amount on top counts when it is paid back,** on that payment's day, in the payment's currency:
  - on a lending, the part of a payment that covers an extra is **income** (received);
  - on a loan, the part of a payment that covers charges is **spending**, in Charges.
  A payback of ৳1,250.00 on Rafi's lending counts ৳150.00 as income; a payback of ৳500.00 counts none (৳600.00 of the
  money is still to come, then the ৳150.00 extra).
- **A lend's transfer charge is lent money,** owed back like the amount; it is never spending while the lending is
  open or paid back.
- **Writing off a lending:** the transfer charge still unpaid becomes spending, in Charges, on its draw's day (where its
  row is); the extra still unpaid disappears. "What was let go" is the unpaid money only.
- **Forgiving a loan:** the charges still unpaid disappear; "what was let go" is the unpaid money only.
- Reopening a written-off or forgiven loan undoes both, since both are worked out, never stored.
- **Due amounts** (the due card, reminders, the payment card's prefilled amount) include the amount on top: Rafi's card
  is prefilled with ৳1,250.00.
- **Net worth** counts the whole amount owed, the extra and the charges included, from the day of the lend or borrow
  (Assets' "Owed to you" and Liabilities' "You owe" show the same figures).

## Counting

The rule, in code terms:

- `isSpend(t)` becomes `t.type === "expense"`: every expense, charges included.
- `spendCat(t)` gives the part an expense counts in: a charge (`t.feeOf`) on a purchase counts in the purchase's
  category; any other charge in `CHARGES`, a key that can never be a category id (category ids are `[A-Za-z0-9-]` only,
  through `sid()`, so `"_charges"` is safe); a plain expense in its own `cat`.
- A tip on top of a payback is an `income` entry, so it counts as received wherever income does.
- **Worked-out parts** (no entry of their own), from `loanInfo()` for every loan, gathered once per render by
  `loanParts()`: `{of: entry id, date, cur, amount, as: "income" | "spend"}` for an extra paid back (income, on the
  payment), charges paid back (spending in Charges, on the payment) and a written-off lend's unpaid transfer charge
  (spending in Charges, on the draw).
- Every total adds the entries and the worked-out parts of its period and currency, with no exception:
  - `spentOn()` (the widget's "spent today" and Home's morning check, "Yesterday you spent …");
  - Home: the ring's slices and percentages, the spent and received figures in the hole, and the day totals in the
    two-pane list and the entries sheet (`dayGroups()` without History adds up only rows today, so it must count
    what is inside them);
  - History's headings (`histLines()`): charges and worked-out spending inside "spent", extras inside "received";
  - Summary (spending only): every tab's bars, totals, comparisons, averages, category list and pie;
  - search: the headings and counts follow History.
- Extras are never on Home's donut or in Summary, which show spending only; Home's received figure (the "+" in the
  hole) counts them, as History does.

Totals then agree everywhere: Home's figures = Summary's = History's default heading = the widget, for the same period
and currency.

## Saved data: version 8

### How each is stored

The rule: **whatever moves money now is an entry; what only changes what is owed is a field on the draw.** Every
version of Tally adds up balances from entries alone, so an older version that drops a field it doesn't know can lose
an amount on top from what is owed, but never a balance.

1. **A charge you pay now** (a transfer's or a loan payment's transfer charge, a purchase's charge) is its own
   `expense` entry, linked both ways to its entry, as fees are today: `feeOf` on the charge, `feeId` on the entry.
   `{type: "expense", amount, account, date, cat, note: "", feeOf}`, `ts` = its entry's `ts` + 1.
2. **A tip on top of a payback** is its own `income` entry linked the same way to the lending's payment:
   `{type: "income", amount, account, date, cat: "otherin", note: "", feeOf}`.
3. **A lend's transfer charge** is its own **loan** entry linked the same way to its draw: `{type: "loan", dir: "out",
   loan, principal: true, amount, account, date, note: "", feeOf}` (no `due`). Being a loan entry, it moves the money
   out of the account and is owed back, in every version; being linked, it is part of its draw and never a row or a draw
   of its own.
4. **What a draw owes on top** (a lend's extra, a borrow's charges) is a field on the draw entry, `onTop` (a number
   above 0, kept to 3 decimals like any amount; absent when there is none). It moves no money.

- A linked add-on's `account` and `date` are its entry's (a transfer's From account); every edit of the entry moves
  them with it, in the same change. An entry carries at most one linked add-on (`feeId`) and at most one `onTop`.
- The `cat` of an `expense` add-on is only for older versions and the CSV export: a purchase's charge carries the
  purchase's category, kept equal to it whenever the purchase is saved; any other charge `"fees"`, as today.
- **Never stored, always worked out by `loanInfo()`:** what each draw and the loan owe, how payments are shared out,
  the parts that count as income or spending and on which day, what a write-off or forgiveness lets go.

**Allowed links** (`migrate()` keeps only these):
- an `expense` charge: on a transfer, on a loan payment out (paying back a loan), on an older loan payment in (a
  lending payment's paid fee), or on an expense that is not itself a charge;
- an `income` extra: only on a loan payment in (`type: "loan"`, not `principal`, `dir: "in"`);
- a `loan` transfer charge: only on a lend's draw (`principal`, `dir: "out"`, a loan of kind "lend"), when the charge
  itself is `principal`, `dir: "out"` and of the same loan;
- `onTop`: only on a draw (`principal`).

**Why not fields for everything** (`charge: 100` on the transfer): a field moving money would be dropped by an older
Tally, which rebuilds entries from the fields it knows, so every balance with a charge would be wrong there. **Why not
entries for everything:** an amount on top moves no money, and no kind of entry can hold money that doesn't move; a
field is exactly as safe there, because no balance depends on it.

### `loanInfo()` in version 8

Today it returns `draws, pays, total, paid, left, cur, rem, nextDue, dueDraw, dueAmt, st, open`. In version 8:

- `draws` are the draws without `feeOf` (a lend's transfer charge is part of its draw, never a draw of its own);
- each draw's **money** = its amount + its linked transfer charge's amount, its **top** = `onTop || 0`, its owed =
  money + top; `total` = the sum of the draws' owed;
- the allocation shares each payment out as described in the model and records, for each draw, the money and the top
  still unpaid (`rem` stays the sum of both, so due amounts and statuses work as today), and for each payment the top
  it covered (`topPaid[payment id]`);
- new results: `money`, `top`, `moneyLeft`, `topLeft` (for the quiet line on a part payback), `topPaid`, and for a
  written-off lending the transfer charge still unpaid on each draw (the smaller of its charge and its money still
  unpaid, since the charge is the last money paid back on its draw);
- for a written-off or forgiven loan, `left` is the money still unpaid (the top still unpaid is let go).

A lending or loan with no transfer charge and no `onTop` (every loan before version 8) gives exactly today's results.

### `migrate()` to version 8

`blank().v` becomes 8. The step never changes an amount, an account, a date or a balance.

1. **Links.** `feeId` is read on every kind that may carry an add-on (today only on transfers and loan payments; draws
   and expenses are added), and `feeOf` on an expense or income as today and now on a loan entry. A link is kept only
   when both ends point at each other and the pair is allowed above; any other link is dropped from both ends. The
   former add-on then stands as what it is: an expense or income in its stored category, as an unlinked fee does today
   (so a charge on money received or on a draw, which no released version wrote, becomes a plain expense), or a
   loan entry that is an ordinary draw of its loan (what is owed and the balance stay the same).
2. **`onTop`** is read on a draw when it is a number above 0 within the amount limit (`okNum`, `amtOk`), kept to 3
   decimals; anything else is dropped (no balance depends on it).
3. **A purchase's charge** takes its purchase's category (`cat`), which moves nothing.
4. **The built-in Fees category.** `"fees"` stays in `CATS` with a `retired: true` mark, so `catName()` still says it
   in Tally's language and Remove hides it (as for any built-in) rather than deleting it. Then:
   - a save older than version 8 gets it back when it is missing, as every older version did (a 1.0 save, which had
     no list of categories, keeps its Fees entries in Fees);
   - from version 8 on, it is never added back: a new notebook (`blank()`, also after Delete all data) starts without
     it, and a notebook that has it keeps it, its name, colour, place on the ring and entries as they are (plain
     expenses in it count there, never charges).
5. Nothing else changes: past fees on transfers and payments are already charges in this shape; a lending payment's
   paid fee stays a paid charge; existing loans have no transfer charge and no `onTop`.

### What older versions do with version 8 data

Restoring a v8 backup in an older Tally shows its existing line "It was made by a newer version of Tally: update Tally
first so nothing is left out." Then, in 1.4.2–1.4.4 (data v7):

- **Every balance is right**: every add-on that moves money is an ordinary entry there.
- A charge on a transfer or a loan payment keeps its link and shows as "+ $2.00 fee", not counted as spending (that
  version's rule). A purchase's charge loses its link and counts as spending in the purchase's category.
- A lend's transfer charge loses its link and is a second draw of the lending ("Lent to Rafi ৳100.00"): what is owed
  and the balance are right.
- `onTop` is dropped: Rafi owes ৳1,100.00 instead of ৳1,250.00, you owe Rafi ৳1,000.00 instead of ৳1,100.00. A full
  payback then reads as more than was owed and clears the loan; balances stay right, and the extra or charges are not
  counted as income or spending there.
- A tip on top of a payback keeps its link (v7 keeps `feeOf` on an income linked to a payment), counts as received, and
  is labelled "fee" on the row.

Versions before 1.4.2 also read each add-on that moves money as an entry of their own, so balances stay right there
too. A file saved again by an older version comes back to version 8 as that version left it: without the `onTop`
amounts it dropped; a purchase's charge as a plain expense in the purchase's category; a lend's transfer charge as a
second draw of its lending; and with the built-in Fees category back (that version adds it, and so does `migrate()`
for a save older than 8). Every balance, and what is owed apart from the dropped amounts on top, is still right; a
charge on a transfer or a loan payment and a tip keep their links.

### The other branch

`docs/decisions.md` (2026-11-01) reserves the next number for main's own changes: the Plan branch
(`claude/plan-wip`), whose data is numbered 7 for its repeats, must be renumbered to 9 when it is rebased.

## Screens and words

Figures are in taka, as in the images; every amount is written by `money()` in the account's currency, and every
account name has its colour dot before it (`accTag()`).

### The buttons

A text button with a + icon. Tapping it opens its card in its place, focuses its field (Android's keyboard, as for any
field) and closes the calculator if it was open (1.4.4). A button goes once its card is open, and ✕ brings it back.

| Form | Buttons | Where |
|---|---|---|
| Transfer | + Transfer charge | under the amount (and the "arrived" field between two currencies), above note and date |
| Paying back a loan (the loan sheet's card) | + Transfer charge | under the date, above Record payment |
| Being paid back a lending (the loan sheet's card) | + Add an extra | under the date, above Record payment |
| Editing a payment or a draw (the loan sheet's Edit) | as its form has them | under the date (and Due, for a draw), above Save |
| Lend money | + Transfer charge and + Add an extra, side by side (wrapping onto two lines when they don't fit) | under the account chips, above Date and Due |
| Borrow money | + Add charges | under the account chips, above Date and Due |
| Spent | + Add a charge | under the account chips, above note and date |
| Received | none | — |

On a form opened for an entry that has an add-on, its card is open from the start. The old labels go: "Add a fee
(ATM, cash‑out)", "Add a fee (sending, cash‑out)", "Fee charged (USD) · not counted as spending" and "(incl. $2.00
fee)".

### The card

As in the tonal card image (charge/B.png); the extra and charges cards mirror it (D2-extras, lend-form, borrow-form):

- A soft surface-container card, full width, holding:
  - a small label: **Transfer charge**, **Charge**, **Charges** or **Extra**;
  - under it a medium figure, the currency code before it ("BDT 100"), the same way the amount field shows it; the
    code follows the account picked (From, for a transfer), as the amount's does;
  - at the right a round tonal calculator button (48 dp) and **✕** (48 dp);
  - a thin line, and under it the **preview** (below).
- **Lend with both:** one card with two rows, Transfer charge then Extra, each with its own label, figure, calculator
  and ✕, a thin line between them, then the one preview at the bottom (lend-refine). ✕ on one row leaves a one-row
  card, and that row's button comes back under it.
- **The keypad on a card:** the calculator button opens the keypad for that field (and closes the amount's). While it
  fills the field, the card's line and that row's label take the accent colour with the caret in the figure, the
  keypad's bar names the field (**Transfer charge**, **Charge**, **Charges** or **Extra**), and the main amount looks
  idle (a thin grey line, grey figures). The form scrolls so the preview stays in view above the keypad.
- **The keypad on the main amount, while a card is open:** the bar names that field (**Amount sent** on a transfer,
  **Amount** elsewhere) and the card looks idle. A form with no card open keeps today's keypad.
- **The bar's live result** ("= 15") sits right after the field's name, and the keyboard button stays at the right
  end; when the name and the result don't fit on one line, the result wraps under the name, never cut. The preview
  counts the result.
- The keypad and Android's keyboard are never on screen together (1.4.4); tapping any other field closes the keypad.
- TalkBack: a card is a group named after its field ("Transfer charge", "Charge", "Charges", "Extra"; the lend's
  two-row card "Transfer charge and extra"); each field has its label's name; the calculator buttons are "Calculator
  for the transfer charge", "Calculator for the charge", "Calculator for the charges", "Calculator for the extra"
  (today every calculator is "Calculator"); ✕ is "Remove the transfer charge", "Remove the charge", "Remove the
  charges", "Remove the extra". The preview is plain text read in order.

### Previews

One line, the figures in bold, each account with its dot. **It sits under the last field that changes it until a card
opens, then at the bottom of the card** (never twice):

| Form | Without a card, under | Preview |
|---|---|---|
| Transfer | the amount | ● Bkash −৳1,000.00 · ● Bank +৳1,000.00 (no "→" any more) |
| Transfer with a charge | (in the card) | ● Bkash −৳1,010.00 · ● Bank +৳1,000.00 |
| Transfer between two currencies | the arrived field | ● Bank −$102.00 · ● Euro account +€92.00 ("+ ?" until what arrived is typed) |
| Lend | the account chips | ● Bkash −৳1,000.00 · Rafi owes ৳1,000.00 |
| Lend with a transfer charge | (in the card) | ● Bkash −৳1,100.00 · Rafi owes ৳1,100.00 |
| Lend with both | (in the card) | ● Bkash −৳1,100.00 · Rafi owes ৳1,250.00 |
| Borrow | the account chips | ● Bank +৳1,000.00 · you owe Rafi ৳1,000.00 |
| Borrow with charges | (in the card) | ● Bank +৳1,000.00 · you owe Rafi ৳1,100.00 |
| Paying back a loan with a transfer charge | (in the card) | ● Bank −৳5,200.00 · loan ৳5,000.00 + transfer charge ৳200.00 |
| Paying back a loan, covering its charges | the date | ● Bank −৳1,100.00 · loan ৳1,000.00 + charges ৳100.00 |
| Being paid back, covering the extra | the date | ● Bkash +৳1,250.00 · lending ৳1,100.00 + extra ৳150.00 |
| Being paid back with a tip on top | (in the card) | ● Bkash +৳3,150.00 · lending ৳3,000.00 + extra ৳150.00 |
| A lending payment's older paid fee (its edit) | (in the card) | ● Cash +৳2,990.00 · lending ৳3,000.00 − charge ৳10.00 |
| Spent with a charge | (in the card) | ● Credit card −৳1,150.00 · ৳1,000.00 + charge ৳150.00 |

- "Someone owes …" / "you owe …" until a name is typed.
- On the payment card, a line under the date shows only when the payment would cover part of an extra or of charges
  (the amounts are the share-out `loanInfo()` would make); a tip on top adds to the extra's figure ("+ extra ৳300.00"
  when ৳150.00 is planned and ৳150.00 is a tip); a transfer charge adds its own "+ transfer charge ৳20.00".
- Spent and the payment cards have no preview when nothing is added or covered; Received has none.
- A preview is empty until the amount is a number; a card that is empty or not yet a number adds nothing.

### Saving

- An empty card, or one that shows as 0 in the currency, saves as nothing (an existing add-on is removed).
- "That charge isn't a number" / "That extra isn't a number" when a field can't be read (the transfer charge and the
  charges use the charge's words); "A charge can't be negative" / "An extra can't be negative" below 0.
- A borrow's charges may be any amount (they are owed on top, they don't come off what arrives).
- The low-balance question (`guardOverdraw`) counts the transfer charge, as it does a transfer's fee today.
- Editing a payment can't leave more paid back than is owed, now counting the amounts on top (`loan.onlyLeft`).
- Messages after saving:
  - a transfer: unchanged, "Transferred ৳1,000.00 to Bank";
  - paying back a loan: "Paid back ৳5,000.00 + ৳200.00 transfer charge"; covering charges: "Paid back ৳1,100.00, incl.
    ৳100.00 charges";
  - being paid back: covering the extra, "Got back ৳1,250.00, incl. ৳150.00 extra"; with a tip, "Got back ৳3,000.00 +
    ৳150.00 extra"; either with " · all cleared" when it clears the lending, as today;
  - a lend with a transfer charge or an extra: "Lent ৳1,000.00 to Rafi · Rafi owes ৳1,250.00" (without either, as
    today: "Lent ৳1,000.00 to Rafi");
  - a borrow with charges: "Borrowed ৳1,000.00 from Rafi · you owe ৳1,100.00" (without, as today);
  - spending: the total, as the row shows it: "−৳1,150.00 · Eating out".
- Editing an entry moves its linked add-on's account and date with it, and a purchase's charge's category with the
  purchase's. Deleting an entry deletes its linked add-on (with either answer of the Delete question; keeping the
  balance moves both into the opening balance); a draw's `onTop` goes with the draw. Undo brings everything back.

### History rows

Each row shows the money that moved; the small line under the amount names what is inside it or on top of it. No icon
and no dot on the small line. The amount and its small line make the row's right column wider, so a row whose title
would then be cut stacks as a tight list's rows do: the title whole, then the amount and its small line under it
(decision of 2026-11-07, `.stacked` in `fitFigures()`).

| Entry | Row, collapsed (amount, then the small line under it) |
|---|---|
| Transfer | ৳1,000.00 / + ৳10.00 transfer charge |
| Spending | −৳1,150.00 / incl. ৳150.00 charge (the row shows the total) |
| Paid back a loan | −৳5,000.00 / + ৳200.00 transfer charge |
| Paid back a loan, covering its charges | −৳1,100.00 / incl. ৳100.00 charges |
| Lent | −৳1,000.00 / + ৳100.00 transfer charge (the extra moves no money, so it is not on the row) |
| Borrowed | +৳1,000.00 (the charges move no money: no small line) |
| A lending paid back, covering its extra | +৳1,250.00 / incl. ৳150.00 extra, in green |
| A lending paid back with a tip on top | +৳3,000.00 / + ৳150.00 extra, in green |
| A lending paid back in part, before the extra | +৳500.00 (no small line) |
| A lending paid back, older paid fee | +৳3,000.00 / − ৳10.00 charge |

Opened: **never a total beside one of its parts** ("Paid in all" and "Reached you" go everywhere). The first box may
repeat the row's own figure, so the boxes read "this, plus that". Then "Left after" (the balance after the entry and
its add-on), as today.

| Entry | Opened |
|---|---|
| Transfer | Sent ৳1,000.00 · Transfer charge ৳10.00; then both Left after |
| Spending | Charge ৳150.00 · Left after |
| Paid back a loan | the loan's box; Paid back ৳5,000.00 · Transfer charge ৳200.00; Left after |
| Paid back a loan, covering its charges | the loan's box; Charges ৳100.00 with "counted as spending" under it; Left after |
| Lent | the loan's box ("Rafi owes you ৳1,250.00", its bar, "৳0.00 of ৳1,250.00 back") with three chips inside it: Lent ৳1,000.00 · Transfer charge ৳100.00 · Extra ৳150.00; then Left after ৳33,100.00 in ● Bkash |
| Borrowed | the loan's box with two chips inside it: Borrowed ৳1,000.00 · Charges ৳100.00; then Left after |
| A lending paid back, covering its extra | the loan's box; Extra +৳150.00 (green) with "counted as income" under it; Left after |
| A lending paid back in part | the loan's box ("Rafi owes you ৳750.00", "৳500.00 of ৳1,250.00 back") and under its bar one quiet line, "Left: ৳600.00 of the money, then the ৳150.00 extra"; Left after |
| A lending paid back with a tip on top | the loan's box; Got back ৳3,000.00 · Extra +৳150.00 (green) with "counted as income" under it; Left after |
| A lending paid back, older paid fee | the loan's box; Got back ৳3,000.00 · Charge ৳10.00; Left after |

- A chip is a small outlined box, a label over a bold figure; the chips wrap (at 360 px with 1.3× text "Extra" goes to
  a second line). A chip is shown only when its amount isn't 0. The lend's chips show the draw's own parts.
- The quiet line on a part payback of a loan reads the same way with charges: "Left: ৳600.00 of the money, then the
  ৳100.00 charges".
- A payment that covers both an extra and has a tip shows one Extra box with their sum.

### History headings and filters

- **Default view:** month and day headings, "+" received over "−" spent: charges and worked-out spending inside spent,
  extras (covered or tipped) inside received. Loan movements stay out of both, so a day with only paybacks has no total.
- **Lent filter:** "+" what came back (paybacks with their extras), "−" what was lent (the money: amounts and transfer
  charges), and **"Extras ৳150.00"** in words, the extras counted as income in that period: "+৳1,250.00 / −৳1,100.00 /
  Extras ৳150.00". A written-off lending's transfer charge or an older paid fee adds a "Charges ৳100.00" line.
- **Borrowed filter:** "+" what was borrowed, "−" what was paid back (with the charges it covered), and "Charges
  ৳120.00" in words (charges paid back plus transfer charges on payments).
- **Transfers filter:** "Transferred ৳1,830.00" and **"Charges ৳2.50"** (today "Fees ৳2.50").
- Words lines are always in the plural (they are totals) and only when their amount isn't 0.
- **Spent filter:** it also lists the entries that carry spending inside them (transfers and loan payments with a
  transfer charge, loan payments covering charges, a written-off lend's draw), and only that spending counts in its
  heading, so Spent's total is the same as Home's, Summary's and the default heading's. Their rows look as anywhere
  else.
- **Received filter:** it also lists the lending payments that carry an extra (covered or tipped), and only the extra
  counts in its heading.
- **Category filter:** a purchase's charge follows its purchase, so "Eating out" counts ৳1,150.00 (as the ring).
- Kind and category counts in the Filters sheet follow the same rules as the list.
- Credit from an earlier payment that covers a later draw's extra or charges counts on that draw's day. Every filter
  that keeps the payment (an account, Spent or Received, a person, a search) also lists that draw, so its day is drawn
  with its heading.

### Search

- An add-on's words and amount find its entry (as a fee's do today), never a row of its own.
- A number also finds the figure the row and the opened row show (a purchase's total ৳1,150.00, a box's or a chip's
  figure). "More than" and "less than" compare the row's figure.
- Suggestion counts follow History's rows and the filters' rules above.
- As before this version, a number also finds an entry's own amounts on their own: a purchase by its price before
  the charge, a payback by its tip alone even when the payment also covered an extra (whose box shows their sum).

### Home

- The ring's figure is all spending, charges and worked-out spending included; each category's percentage is out of it.
  Extras are never on the ring.
- **The grey Charges part** (D9-home, without its line): one slice in `#7a8190`, after the categories' slices, true to
  size (৳657.50 of ৳178,137 is a hairline; no minimum width). It shows only when the period has charges outside
  purchases in the viewed currency, whatever the hole shows (the ring never changes with the Settings donut).
- **Its label**, not a button and not a tile: in the top right corner of the ring's square, 6 px under the account
  chips and outside the donut, a grey dot and the word **Charges**, with **the charges' amount under the word**
  ("৳657.50"). No icon, no %, and **no leader line** to the slice. The word and amount are the size of the tiles'
  names, in the app's muted text colour (the grey `#7a8190` is only the dot's and the slice's, never text). The tiles
  stand on a circle, which leaves the corner free in most rings, but not with 4 to 7 tiles at large text or in long
  words, nor with many categories on a phone held sideways. There (measured, `fitChargeLabel()`) the label takes **a line of
  its own above the ring**, right-aligned and still 6 px under the chips, and the ring moves down by it (the
  maintainer's pick, B, over leaving it out). On a phone held sideways the ring stays centred in the window's height
  and the label sits in the room above it; where that room is too small (the wider sideways phones, 720 to 932 px),
  the ring is drawn smaller by just what the label needs. The label is never left out, so the grey slice is never
  shown by its colour alone, and it never touches a tile. With no charges there is neither label nor slice.
- TalkBack: the donut's button says "Spending summary: spent ৳178,137.00, of which charges ৳657.50" (and received, when
  there is some); the label itself is hidden from TalkBack, which already heard it.
- **A new notebook's ring has no Fees tile**; an existing notebook keeps its own as an ordinary category.
- The two-pane list's and the entries sheet's day totals count what is inside their rows.

### Summary

Spending only, as in C-summary:

- Every tab's bars, total, average and comparison include charges and worked-out spending; extras are not in Summary.
- **The list ends with a Charges line** whenever the period has charges outside purchases: a grey dot where a
  category's emblem would be, **Charges**, its percentage on Months and Year ("Charges <1%"), a grey bar and the
  amount. On Days and Weeks it comes after the three top categories; on Months and Year after all of them, whatever its
  size. It is Summary's legend.
- The Months pie ends with the grey slice.
- TalkBack: "Charges, ৳158.00, less than 1%", each line one sentence (a category's alike: "Rent, ৳120,000.00, 68%";
  no share on Days and Weeks).

### Assets and Liabilities

- A lending's or loan's row and net worth use what is owed, amounts on top included: Rafi's row says ৳1,250.00
  (Active) on the day of the lend; Liabilities says ৳1,100.00 for Rafi's loan.
- Written off or forgiven: the figure is what was let go (the unpaid money), as today's "what was let go".

### The loan sheet

- **Its figure** (what is owed, or what was let go) has, under it, the chips of the whole tab: "Lent ৳1,000.00 ·
  Transfer charge ৳100.00 · Extra ৳150.00" (a borrow: "Borrowed ৳1,000.00 · Charges ৳100.00"), each only when it
  isn't 0, then the status chip and the bar, as today. A loan without add-ons shows no chips.
- **Its history lines:** a draw's line adds its parts: "Lent from ● Bkash · ৳100.00 transfer charge · ৳150.00 extra";
  a payment's line adds what it carries or covered: "৳200.00 transfer charge", "incl. ৳150.00 extra", "incl. ৳100.00
  charges", "+৳150.00 extra" (a tip); the amount and its word are kept on one line (a no-break space between them).
- **Its Edit** (the payment's or the draw's sheet) gets the form's buttons and cards, so an add-on can be added,
  changed or removed after saving (today a payment's fee can't be).
- **Got it all / Paid it all** (clearing from Assets) records a payment of everything left, amounts on top included,
  with the same message as a payment.

### The widget, the morning check and notifications

- The widget's "spent today" and the morning check's "Yesterday you spent …" include charges and worked-out spending
  (`spentOn()`); the widget's code (`TallyWidget.java`) doesn't change.
- No notification shows spending: the balance check lists balances (which already include every add-on that moves
  money). A due reminder's amount is the due amount `loanInfo()` gives, amounts on top included; the shell's code
  doesn't change.

### Paid more than owed

The decided dialog style (`choiceDialog`: the likely answer filled, the other tonal, Go back outlined), with the
approved texts (D11-words, D2-extras). What is owed now includes the amounts on top.

- **You paid back a loan with more than you owed:** title "You paid ৳500.00 more"; text "You owed Maya ৳35,000.00. Is
  the extra ৳500.00 a charge on this payment, counted as spending, or a lending to Maya that they owe you?"; answers
  **Track as charge** (filled: the payment that clears the loan, with the extra added to its transfer charge, plus any
  typed), **Track as lending** (tonal: a new lending, as today), **Go back** (outlined).
- **A lending was paid back with more than was owed:** title "Sam paid ৳150.00 more"; text "Sam owed you ৳5,000.00.
  Is the extra ৳150.00 money on top, counted as income, or a loan from Sam that you owe back?"; answers **Track as
  extra** (filled: the payment that clears the lending, with the extra added to its tip on top, plus any typed; no
  form to fill), **Track as loan** (tonal: a new loan, as today), **Go back** (outlined).
- Messages: "Loan cleared · ৳500.00 as its charge"; "Sam’s lending cleared · ৳150.00 as an extra".
- The account always gets or gives the full amount, as today. The income form is no longer opened from here.
- The cleared payment's row then reads as any payment with that add-on ("+ ৳500.00 transfer charge", "+ ৳150.00
  extra").

### CSV export

One line per entry, as today, in the same columns; each linked add-on is its own line after its entry, and an amount
on top gets a line of its own after its draw (it moves no money; its type says so).

- **type:** "transfer-fee" (a transfer's charge) and "loan-fee" (a charge on any loan payment) stay exactly as they
  are; new: "expense-fee" (a purchase's charge), "lend-fee" (a lend's transfer charge), "lend-extra" (a lend's extra,
  owed on top), "borrow-fee" (a borrow's charges, owed on top) and "loan-extra" (a tip on top of a payback). Payments
  keep their types ("lend-in", "loan-out") with their whole amount.
- **category:** a purchase's charge carries the purchase's category; every other add-on leaves it empty.
- **note:** its own note, else "Transfer charge", "Charge", "Charges" or "Extra".

### Accessibility and text

- Every figure in the cards, chips, previews and the Home label is in `rem`; cards and chips grow with the text
  (`min-height`) and wrap; at 360 px with 1.3× text in German nothing is cut and nothing scrolls sideways (B, column
  4; D9-home, D6-transfer, lend-form, borrow-form, lend-refine). `22-layout.js` gets the cards on every form (one and
  two rows), open and with the keypad, the chips in rows and on the loan sheet, and the Home label, on phones, a phone
  held sideways, foldables and tablets.
- Every button 48 dp; the grey passes 3:1 against the surface in both themes (4.3:1 dark, 3.9:1 light) and is used for
  the dot and the slice only; a word and a sign are always beside a colour (the green extra always has "+" and
  "extra").
- Every text is in the catalogue in all nine languages. The words (the maintainer has them checked by native speakers
  before the release; "transfer charge" and "charges" are built on the charge's word):

  | Language | charge | extra |
  |---|---|---|
  | de | Gebühr | Extra |
  | es | Cargo | Extra |
  | fr | Frais | Supplément |
  | id | Biaya | Tambahan |
  | pt-BR | Taxa | Extra |
  | ru | Комиссия | Доплата |
  | tr | Masraf | Ekstra |
  | zh-Hans | 费用 | 额外款 |

## Texts

English, in `l10n/web/en.json`; key names are proposals, the texts are approved.

New:
- Buttons and cards: `charge.add` "Add a charge" · `charge.label` "Charge" · `xcharge.label` "Transfer charge" ·
  `charges.add` "Add charges" · `charges.label` "Charges" · `extra.add` "Add an extra" · `extra.label` "Extra" ·
  `addOn.both` "Transfer charge and extra" (TalkBack group)
- TalkBack: `charge.calc` "Calculator for the charge" · `xcharge.calc` "Calculator for the transfer charge" ·
  `charges.calc` "Calculator for the charges" · `extra.calc` "Calculator for the extra" · `charge.remove` "Remove the
  charge" · `xcharge.remove` "Remove the transfer charge" · `charges.remove` "Remove the charges" · `extra.remove`
  "Remove the extra" · `ring.summaryCharges` "Spending summary: spent {{spent}}, of which charges {{charges}}" (and its
  form with received)
- Checks: `charge.notNumber` "That charge isn't a number" · `charge.negative` "A charge can't be negative" ·
  `extra.notNumber` "That extra isn't a number" · `extra.negative` "An extra can't be negative"
- Previews: `prev.owes` "{{who}} owes {{amount}}" · `prev.youOwe` "you owe {{amount}}" · `prev.youOweWho` "you owe
  {{who}} {{amount}}" · `prev.loanX` "loan {{amount}} + transfer charge {{charge}}" · `prev.loanCharges` "loan
  {{amount}} + charges {{charges}}" · `prev.lendExtra` "lending {{amount}} + extra {{extra}}" · `prev.lendOff` "lending
  {{amount}} − charge {{charge}}" · `prev.spend` "{{amount}} + charge {{charge}}" · `prev.plusX` "+ transfer charge
  {{charge}}"
- Rows and boxes: `tx.xchargeOn` "+ {{amount}} transfer charge" · `tx.chargeIncl` "incl. {{amount}} charge" ·
  `tx.chargesIncl` "incl. {{amount}} charges" · `tx.extraIncl` "incl. {{amount}} extra" · `tx.extraOn` "+ {{amount}}
  extra" · `tx.chargeOff` "− {{amount}} charge" · `tx.sent` "Sent" · `tx.paidBack` "Paid back" · `tx.gotBack` "Got
  back" · `tx.lent` "Lent" · `tx.borrowed` "Borrowed" · `tx.charge` "Charge" · `tx.xcharge` "Transfer charge" ·
  `tx.charges` "Charges" · `tx.extra` "Extra" · `tx.asIncome` "counted as income" · `tx.asSpending` "counted as
  spending" · `tx.leftExtra` "Left: {{money}} of the money, then the {{extra}} extra" · `tx.leftCharges` "Left:
  {{money}} of the money, then the {{charges}} charges"
- Home, Summary, History: `ring.charges` "Charges" · `summary.charges` "Charges" · `summary.say` "{{name}},
  {{amount}}" · `summary.sayShare` "{{name}}, {{amount}}, {{share}}" · `summary.under` "less than {{pct}}" (TalkBack)
  · `history.words.extras` "Extras {{amount}}"
- Loans: `loan.xchargeAmt` "{{amount}} transfer charge" · `loan.extraAmt` "{{amount}} extra" · `loan.extraIncl` "incl.
  {{amount}} extra" · `loan.chargesIncl` "incl. {{amount}} charges" · `loan.tipAmt` "+{{amount}} extra" ·
  `loan.msg.plusX` "+ {{amount}} transfer charge" · `loan.msg.plusExtra` "+ {{amount}} extra" · `loan.msg.inclExtra`
  "incl. {{amount}} extra" · `loan.msg.inclCharges` "incl. {{amount}} charges" · `loan.msg.lentOwes` "Lent {{amount}}
  to {{who}} · {{who}} owes {{owed}}" · `loan.msg.borrowedOwe` "Borrowed {{amount}} from {{who}} · you owe {{owed}}" ·
  `loan.over.asCharge` "Track as charge" · `loan.over.asExtra` "Track as extra" · `loan.over.asChargeMsg` "Loan
  cleared · {{amount}} as its charge" · `loan.over.asExtraMsg` "{{who}}’s lending cleared · {{amount}} as an extra"
- CSV: `csv.xchargeNote` "Transfer charge" · `csv.chargeNote` "Charge" · `csv.chargesNote` "Charges" · `csv.extraNote`
  "Extra"

Changed: `history.words.fees` → `history.words.charges` "Charges {{amount}}"; `loan.over.askBorrowOr` "You owed {{who}}
{{owed}}. Is the extra {{amount}} a charge on this payment, counted as spending, or a lending to {{who}} that they owe
you?"; `loan.over.askLendOr` "{{who}} owed you {{owed}}. Is the extra {{amount}} money on top, counted as income, or a
loan from {{who}} that you owe back?"; the transfer preview loses its "→".

Retired: `transfer.addFee`, `transfer.inclFee`, `transfer.feeNegative`, `fee.label`, `fee.notNumber`, `loan.addFee`,
`loan.feeNegative`, `loan.feeAmt`, `tx.feeLine`, `tx.paidInAll`, `tx.reachedYou`, `loan.over.asFee`,
`loan.over.asFeeMsg`, `loan.over.asIncome`, `loan.over.extraNote`, `loan.over.lendCleared`. Kept as they are:
`transfer.feeNote` and `loan.feeNote`, because `autoNote()` recognises the notes 1.4.1 and earlier wrote by their
values in every language.

## Tests

- **Data (first):**
  - a v7 save with a transfer fee, a loan payment's fee, a lending payment's paid fee, lendings and loans with several
    draws and part payments, a plain expense in Fees, and Fees renamed "Food" loads with every balance, amount, account
    and date unchanged, the links kept, Fees kept, and **every loan's `loanInfo()` (total, paid, left, rem, due, status)
    exactly as before**;
  - a v1-shaped save keeps its Fees entries in Fees; `blank()` has no Fees and a v8 save without it doesn't get it back;
  - a v8 save with every add-on (a transfer charge on a transfer, a loan payment and a lend; a lend's extra; a borrow's
    charges; a purchase's charge; a tip on a payback) round-trips through `migrate()` unchanged;
  - unlinked, balances and what is owed unchanged: a tip on anything but a lending payment, a charge on money received
    or on a draw, a loan transfer charge on a borrow's draw, on another loan or on a payment, a charge on a charge, two
    on one entry, a one-sided link either way; a bad `onTop` (negative, text, too big) dropped;
  - a purchase's charge takes the purchase's category;
  - older versions: the v8 notebook with every `feeOf`, `feeId` and `onTop` taken out (what 1.4.4 keeps) gives the
    same `balances()`; by the maintainer, once, before the release: a v8 backup restored in the installed 1.4.4 shows
    the same balances.
- **`loanInfo()` with add-ons:**
  - Rafi: lend ৳1,000.00 + ৳100.00 transfer charge + ৳150.00 extra: total ৳1,250.00, Bkash −৳1,100.00;
  - share-out: a payback of ৳500.00 covers ৳500.00 of money (`moneyLeft` ৳600.00, `topLeft` ৳150.00, `topPaid` 0);
    then ৳700.00 covers ৳600.00 of money and ৳100.00 of extra (`topPaid` ৳100.00); then ৳50.00 covers the rest (৳50.00);
  - several draws with due days: a payment fills the draw due soonest (its amount, its transfer charge, its extra)
    before the next; a payment before a later draw is credit, as today; due amounts include the extras;
  - a borrow ৳1,000.00 + ৳100.00 charges: total ৳1,100.00, Bank +৳1,000.00; ৳1,100.00 paid back counts ৳100.00 as
    spending on that day, in Charges;
  - write-off of Rafi's lending after ৳1,000.00 back: ৳100.00 transfer charge counted as spending on the lend's day,
    the ৳150.00 extra gone, "let go" ৳100.00; after ৳500.00 back: the charge (৳100.00) as spending, "let go" ৳600.00;
    reopening undoes both; forgiving a borrow after ৳600.00 back: ৳400.00 let go, the charges never spending;
  - net worth on the lend's day is +৳150.00 against the day before.
- **Counting:** one notebook with every add-on, in two currencies: Home's figures, the ring's parts and the corner
  label, Summary's every tab, History's default headings and the Lent, Borrowed, Transfers, Spent and Received
  headings, `spentOn()` and the widget agree; a purchase's charge is in its category; extras are in received and never
  on the ring or in Summary; renaming the Fees category ("Food") never moves a charge.
- **Forms:** each form's buttons, cards (the lend's two-row card), previews and their place, checks and messages;
  Received has no button; the keypad on each card (its bar's name and live result, the amount idle, the keyboard
  never under it); TalkBack names; Back closes the keypad first.
- **Rows:** each row of the tables above, collapsed and opened, the chips, the quiet line on a part payback, at large
  text.
- **Cascades:** delete (both answers), Undo, a payment's and a draw's edit, the loan sheet's own delete, reopening a
  cleared loan, deleting a loan, Got it all: the add-on always goes or comes with its entry; deleting a lend's only draw
  deletes the lending with its transfer charge.
- **Overpaid:** both dialogs, each answer, with and without a typed add-on, with a planned extra.
- **CSV:** the type, category and note of each kind.
- Suites that change: 26 and 27 (their rule turns: charges are spending), 02, 10 and 20 (loans, dues), 08 (overpaid),
  07 and 09 (Summary), 01 (the Fees tile), 39 (Assets), 41 and 42 (History, search), 43 (the keypad), 15 (CSV,
  migration), 22, 24, 32, 33 and the English snapshot 90. New: `45-charges.js`.

## Decided by the maintainer (2026-11-07)

- **D1** The Spent filter also lists the entries that carry spending inside them, counting only that; Received does
  the same for extras.
- **D2, D3, D4 (extras)** Money on top of what you lend is an extra: income, never negative. "+ Add an extra" on the
  "Got money back?" card is an unplanned tip; the overpaid lending asks "Track as extra" / "Track as loan" / "Go back",
  the overpaid loan "Track as charge" / "Track as lending" / "Go back". The Lent filter's words line says "Extras"; the
  others say "Charges". Extras never show on Home's donut.
- **Money received has no charge**: you write down what arrived. A transfer's charge is cut from the From account and
  To gets the amount.
- **Lend and borrow (round 3):** a lend takes "+ Transfer charge" (it leaves the account, is owed back, is not spending)
  and "+ Add an extra" (interest: it moves no money, is owed on top and is income from the last money paid back); both
  share one card with one preview at the bottom; the preview sits under the account chips until a card opens. A borrow
  takes "+ Add charges", one total for a fee and any interest, owed on top and spending from the last money you pay
  back; the account gets the amount. Writing off a lending makes its unpaid transfer charge spending and lets its
  unpaid extra go; forgiving a loan lets its unpaid charges go. Existing lendings stay as they are. Net worth counts
  what is owed, the extra included, from the day you lend.
- **Labels:** "Transfer charge" on transfer, paying back a loan and lend; "Add a charge" on spending; "Add charges" /
  "Charges" on borrow; "Add an extra" on lend and on "Got money back?".
- **Opened rows:** no "Paid in all" (or any total beside one of its parts): "Sent | Transfer charge", "Paid back |
  Transfer charge", chips "Lent · Transfer charge · Extra" inside the loan's box (also under the lending sheet's
  figure); a payback that covers the extra reads "+৳1,250.00 / incl. ৳150.00 extra", opened "Extra +৳150.00 · counted
  as income"; a part payback has the quiet line "Left: ৳600.00 of the money, then the ৳150.00 extra". The Lent filter's
  heading reads "+৳1,250.00 / −৳1,100.00 / Extras ৳150.00".
- **D5** A lending payment's new add-on is an extra; older paid fees stay paid and editable.
- **D6** The preview is a line under the last field that changes it and moves into the card once one opens.
- **D7** A number also finds the figure the row and the opened row show.
- **D8** Had no case left once a borrow's charges stopped coming off what arrives.
- **D9** Charges are a small grey part of the donut, only when the period has charges, true to size; the label is a
  grey dot and "Charges" with the amount under it, in the ring's top right corner under the account chips, outside the
  donut, with no icon, no % and no leader line.
- **D10** The CSV keeps "transfer-fee" and "loan-fee" and adds "expense-fee", "lend-fee", "lend-extra", "borrow-fee"
  and "loan-extra".
- **D11** The wording of the D11-words, D2-extras and round 3 boards; Home's received figure counts extras; the extra's
  error messages follow the charge's; the store-listing lines as the plan proposes.
- **D12** The keypad names its field only while a card is open.
- **D13** CLAUDE.md's two sentences change (the plan's docs task has them) and the store listings' lines change in nine
  languages.
- **D14** The words for "charge" and "extra" in the table above.

Settled in this spec where the boards left a detail (each follows the approved rule it extends): payments fill each
draw in turn, its extra last; a written-off lend's charge counts on its draw's day; a borrow's draw row has no small
line and its opened box has the chips "Borrowed · Charges"; a payback covering charges reads "incl. ৳100.00 charges",
opened "Charges ৳100.00 · counted as spending"; a tip's opened row reads "Got back ৳3,000.00 · Extra +৳150.00"; the
messages for a borrow, for a payback covering an extra or charges and for a loan payment's transfer charge; the
previews on the payment card; the loan sheet's lines; the CSV's "lend-extra" and its note words.

## Not in this change

- Interest rates, schedules or interest worked out by Tally: a charge or extra is typed.
- A second add-on of the same kind on one entry, or a charge on money received, a balance fix or an asset.
- Moving the built-in Fees category's plain entries anywhere: they stay in Fees.
- A "Charges" or "Extras" filter or suggestion in History: they are found through their entries.
- Day headings stay as they are: loan paybacks are not income, so there is no "got back" line on a day.
- Changing loans and lendings recorded before this version.
