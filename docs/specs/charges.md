# Charges: fees, interest and tax inside their entry

Status: draft for the maintainer (2026-11-07). The model and the looks were approved in the design round
([design-round.md](design-round.md): part C, "Changes after the confirmation page", which wins over part C, and the
tonal card in "Changes after the build started"); the approved images are C-transfer, C-rows, C-home, C-summary,
C-forms, C-overpaid and the tonal card B. This spec settles the saved data and every text, and lists under
**Decisions still needed** what the maintainer has not decided yet. Wherever the images say "fee", "interest" or "tax",
the word is now **charge**.

## The model

- **A charge is part of the entry it came with.** It is entered on that entry's form, shown inside that entry's row,
  edited, deleted and undone with it, and never has a row of its own.
- **One word, "charge"**, for a fee, interest, tax, a service charge or a processing fee, in every form, row, heading
  and total.
- **Seven kinds of entry can carry one charge each:** a transfer, a loan payment (you pay back), a lending payment (you
  are paid back), money received, a lend (a lending's draw), a borrow (a loan's draw) and spending.
- **A charge you pay counts as spending; a charge you receive counts as income.** The only charge you receive is one
  paid to you on top of a lending's payment (interest, for example). Every other charge is paid.
- **Where a paid charge counts:**
  - a purchase's charge (VAT, a service charge) counts in **the purchase's own category**: a ৳1,000.00 dinner with a
    ৳150.00 charge makes Eating out ৳1,150.00;
  - every other paid charge (on a transfer, a payment, money received, a lend or a borrow) counts in one fixed grey
    part called **Charges**, which is not a category: it has no tile, can't be renamed, hidden or picked, and is
    always the same grey (`#7a8190`, the colour fees had before 1.3.2 and the balance fix's emblem colour).
- **The movement itself never counts.** A transfer, the money a loan or lending moves (draws and payments) and a
  balance fix are never spending or income, as before. Only the charge on them counts.
- **All past fees count.** Every fee already recorded on a transfer or a loan or lending payment is a charge from this
  version on and counts as spending in Charges. No amount or balance changes; the totals of past days and months go up
  by the fees already recorded. The changelog says so.
- **What is owed never changes.** A charge on a payment or a draw is not part of the loan: `loanInfo()` reads only the
  draws and payments, as today.

### Each kind of entry with its charge

The main amount keeps its meaning on every form; the charge is added to it or taken off it.

| Entry | The main amount is | The charge is | The account sees | The charge counts as |
|---|---|---|---|---|
| Transfer | what was sent | paid, from the From account | From: −(amount + charge); To: +amount (or what arrived) | spending, Charges |
| Loan payment (you pay back) | what goes off the loan | paid | −(amount + charge) | spending, Charges |
| Lending payment (you are paid back) | what goes off the lending | received | +(amount + charge) | income (received) |
| Money received | what was earned (gross) | paid, taken off what arrived | +(amount − charge) | spending, Charges; the income stays the gross amount |
| Lend | what they owe you | paid | −(amount + charge) | spending, Charges |
| Borrow | what you owe | paid, taken off what arrived | +(amount − charge) | spending, Charges |
| Spending | the price before the charge | paid | −(amount + charge) | spending, in the purchase's category |

A lending payment recorded before this version may carry a **paid** fee (a receiving or cash-out fee, stored as an
expense): it stays a paid charge, counts as spending in Charges, and the account sees +(amount − charge). New lending
payments get received charges only (see D5).

## Counting

The rule, in code terms:

- `isSpend(t)` becomes `t.type === "expense"`: every expense, paid charges included.
- A new `spendCat(t)` gives the part an expense counts in: a charge (`t.feeOf`) whose entry is spending counts in that
  entry's category; any other charge counts in `CHARGES`, a key that can never be a category id (category ids are
  `[A-Za-z0-9-]` only, through `sid()`, so `"_charges"` is safe); a plain expense counts in its own `cat`.
- A received charge is an `income` entry, so it counts as received wherever income does.

Every place that adds up spending follows it, with no exception:

- `spentOn()` (the widget's "spent today" and Home's morning check, "Yesterday you spent …");
- Home: the ring's slices and percentages, the figure in the hole, received, and the day totals in the two-pane list
  and the entries sheet (`dayGroups()` without History adds up only rows today, so it must count the charges inside
  them);
- History's headings (`histLines()`), which already count paid fees inside "spent"; a received charge goes into
  "received";
- Summary: every tab's bars, totals, comparisons, averages, category list and pie;
- search: the headings and counts follow History.

Totals then agree everywhere: Home's figure = Summary's = History's default heading = the widget, for the same period
and currency.

## Saved data: version 8

### How a charge is stored

A charge stays **its own entry, linked both ways to the entry it came with**, as transfer and payment fees are today:
`feeOf` on the charge, `feeId` on its entry. Version 8 extends that link to every kind in the table above. The field
names stay `feeOf` / `feeId` (they are only stored names; the screen says "charge").

- A paid charge is `{type: "expense", amount, account, date, cat, note: "", feeOf}`; a received charge is
  `{type: "income", amount, account, date, cat, note: "", feeOf}`. Its `ts` is its entry's `ts` + 1, so it sorts
  right after it, as today.
- Its `account` is the entry's paying or receiving account (a transfer's From account), its `date` the entry's date.
  Every edit of the entry moves both with it, in the same change.
- Its `cat` is only for older versions and the CSV export (version 8 counts by `spendCat()`):
  - a purchase's charge: the purchase's own category, kept equal to it whenever the purchase is saved;
  - a paid charge on anything else: `"fees"`, as today;
  - a received charge: `"otherin"` (the built-in received "Other").
- A charge has no payee and never a `feeId` of its own. An entry has at most one charge.
- Which entries may carry which charge (`migrate()` keeps only these links):
  - a paid charge (`expense`): on a transfer, a loan entry (draw or payment), an income, or an expense that is not
    itself a charge;
  - a received charge (`income`): only on a loan payment that brings money in (`type: "loan"`, not `principal`,
    `dir: "in"`).

**Why not a field on the entry** (`charge: 150` on the transfer): an older Tally rebuilds every entry from the fields
it knows (`migrate()` copies field by field), so it would drop the field and every balance with a charge would change
by its amount in that version: a v8 backup restored there would silently be wrong. A linked entry keeps its money in
every version, needs no change to `applyEntry()` or `balances()`, and the existing cascades (delete, keep the balance,
undo, a payment's edit, the CSV's one line per entry) already carry it. The cost is the link checks in `migrate()`,
which exist already and only widen.

### `migrate()` to version 8

`blank().v` becomes 8. The step never changes an amount, an account, a date or a balance.

1. **Links.** `feeId` is read on every kind that may carry a charge (today only on transfers and loan payments; draws,
   income and expenses are added), and `feeOf` on an expense or income as today. A link is kept only when both ends
   point at each other and the pair is allowed by the list above; any other link is dropped from both ends, and the
   former charge becomes a plain expense or income in its stored category, as an unlinked fee does today. An entry
   holds one `feeId`, so a second charge pointing at it is unlinked; a charge that points at another charge is
   unlinked too.
2. **A purchase's charge** takes its purchase's category (`cat`), which moves nothing.
3. **The built-in Fees category.** `"fees"` stays in `CATS` with a `retired: true` mark, so `catName()` still says it
   in Tally's language and Remove hides it (as for any built-in) rather than deleting it. Then:
   - a save older than version 8 gets it back when it is missing, as every older version did (a 1.0 save, which had
     no list of categories, keeps its Fees entries in Fees);
   - from version 8 on, it is never added back: a new notebook (`blank()`, also after Delete all data) starts without
     it, and a notebook that has it keeps it, its name, colour, place on the ring and entries as they are.
4. Nothing else changes: past fees on transfers and payments are already charges in this shape; a lending payment's
   paid fee stays paid.

### What older versions do with version 8 data

Restoring a v8 backup in an older Tally shows its existing line "It was made by a newer version of Tally: update Tally
first so nothing is left out." Then, in 1.4.2–1.4.4 (data v7):

- **Every balance is right**: each charge is an ordinary entry there.
- A charge on a transfer or a payment keeps its link and shows as "+ $2.00 fee", not counted as spending (that
  version's rule).
- A charge on money received, a lend, a borrow or a purchase loses its link (v7 accepts it only on transfers and
  payments) and becomes a plain expense: a purchase's charge counts in the purchase's category, the others in the
  built-in Fees category, which that version adds back if missing. These charges count as spending there too, so only
  the transfer and payment charges are left out of that version's totals.
- A received charge on a lending payment keeps its link (v7 keeps `feeOf` on an income linked to a payment), counts
  as received, and is labelled "fee" on the row; the opened row's "Reached you" shows the amount minus it instead of
  plus. Only the words are wrong; the balance and the received total are right.

Versions before 1.4.2 also read each charge as an entry of its own (their `migrate()` keeps any expense or income it
can read), so balances stay right there too. Nothing in the file is lost when it comes back to version 8.

### The other branch

`docs/decisions.md` (2026-11-01) reserves the next number for main's own changes: the Plan branch
(`claude/plan-wip`), whose data is numbered 7 for its repeats, must be renumbered to 9 when it is rebased.

## Screens and words

Figures below are in taka, as in the images; every amount is written by `money()` in the account's currency, and
every account name has its colour dot before it (`accTag()`).

### "Add a charge" on every form

A text button with a + icon, **Add a charge**, on each form that can carry one; tapping it opens the charge card in
its place, focuses the charge field (Android's keyboard, as for any field) and closes the calculator if it was open
(1.4.4). The button's place:

| Form | Where |
|---|---|
| Transfer | under the amount (and the "arrived" field between two currencies), above note and date |
| Paying back a loan, being paid back a lending (the loan sheet's card) | under the date, above Record payment |
| Editing a payment or a draw (the loan sheet's Edit) | under the date (and Due, for a draw), above Save |
| Lend money, Borrow money | under the account chips, above Date and Due |
| Received | under the account chips, above note and date |
| Spent | under the account chips, above note and date |

On a form opened for an entry that has a charge, the card is open from the start. The old labels go: "Add a fee
(ATM, cash‑out)", "Add a fee (sending, cash‑out)", "Fee charged (USD) · not counted as spending" and "(incl. $2.00
fee)".

### The charge card

As in the tonal card image (charge/B.png):

- A soft surface-container card, full width, holding:
  - a small label **Charge**;
  - under it a medium figure, the currency code before it ("BDT 10"), the same way the amount field shows it; the code
    follows the account picked (From, for a transfer), as the amount's does;
  - at the right a round tonal calculator button (48 dp) and **✕** (48 dp), which removes the charge and closes the
    card (the Add a charge button comes back);
  - a thin line inside the card, and under it the **preview** (below).
- **The keypad on the charge:** the calculator button opens the keypad for the charge (and closes the amount's). While
  it fills the charge, the card's line and the "Charge" label take the accent colour with the caret in the figure, the
  keypad's bar names the field, **Charge**, and the main amount looks idle (a thin grey line, grey figures). The form
  scrolls so the preview stays in view above the keypad.
- **The keypad on the main amount, while the card is open:** the bar names that field (**Amount**, or **Amount sent**
  on a transfer) and the card looks idle. A form whose card is closed keeps today's keypad (decisions, 2026-11-06).
- The keypad and Android's keyboard are never on screen together (1.4.4); tapping any other field closes the keypad.
- TalkBack: the card is a group named "Charge"; the field is named "Charge"; the calculator button "Calculator for the
  charge" (today both are "Calculator"); ✕ "Remove the charge". The preview is plain text read in order.

### Previews

Inside the card, under its line, the figures in bold. Each account named has its dot.

| Form | Preview |
|---|---|
| Transfer | ● Bkash −৳1,010.00 · ● Bank +৳1,000.00 |
| Transfer between two currencies | ● Bank −$102.00 · ● Euro account +€92.00 (what arrived; "+ ?" until it is typed) |
| Paying back a loan | ● Bank −৳5,200.00 · loan ৳5,000.00 + charge ৳200.00 |
| Being paid back a lending | ● Cash +৳3,150.00 · lending ৳3,000.00 + charge ৳150.00 |
| A lending payment with an older paid fee (its edit form) | ● Cash +৳2,990.00 · lending ৳3,000.00 − charge ৳10.00 |
| Received | Reaches ● Bkash ৳9,850.00 |
| Lend money | ● Bkash −৳5,020.00 · Rafi owes ৳5,000.00 ("Someone owes" until a name is typed) |
| Borrow money | ● Bank +৳9,800.00 · you owe ৳10,000.00 (not drawn: D11) |
| Spent | ● Credit card −৳1,150.00 · ৳1,000.00 + charge ৳150.00 |

A preview is empty until the amount is a number; a charge that is empty or not yet a number previews as no charge.
Without a charge, only the transfer form has a preview today (D6).

### Saving

- An empty charge, or one that shows as 0 in the currency, saves as no charge (an existing one is removed).
- "That charge isn't a number" when it can't be read; "A charge can't be negative" when it is below 0. On money
  received and a borrow, a charge bigger than the amount is a choice still to make (D8).
- The low-balance question (`guardOverdraw`) counts the charge, as it does a transfer's fee today.
- Messages after saving (proposed, D11):
  - a payment: "Paid back ৳5,000.00 + ৳200.00 charge" / "Got back ৳3,000.00 + ৳150.00 charge" (today's pattern);
  - a lend or a borrow: "Lent ৳5,000.00 to Rafi + ৳20.00 charge" / "Borrowed ৳10,000.00 from Maya + ৳200.00 charge";
  - spending: the total, as the row shows it: "−৳1,150.00 · Eating out"; money received: unchanged, "+৳10,000.00 ·
    Income"; a transfer: unchanged.
- Editing an entry moves its charge's account and date with it, and a purchase's charge's category with the
  purchase's. Deleting an entry deletes its charge (both answers of the Delete question: with "Delete, keep the
  balance" the opening balance takes both over); Undo brings both back. A lending's payment edit keeps an older paid
  fee paid, and a new charge typed there is received.

### History rows

No icon and no dot on the charge line: the word "charge" says what it is (C-rows).

| Entry | Row, collapsed (amount, then the small line under it) |
|---|---|
| Transfer | ৳1,000.00 / + ৳10.00 charge |
| Money received | +৳10,000.00 / − ৳150.00 charge (or Reached ৳9,850.00: D2) |
| Spending | −৳1,150.00 / incl. ৳150.00 charge (the row shows the total) |
| Paid back a loan | −৳5,000.00 / + ৳200.00 charge |
| A lending paid back | +৳3,000.00 / + ৳150.00 charge, in green (received) |
| Lent | −৳5,000.00 / + ৳20.00 charge |
| Borrowed | +৳10,000.00 / − ৳200.00 charge (not drawn; follows D2) |
| A lending paid back, older paid fee | +৳3,000.00 / − ৳10.00 charge |

Opened, each charge is one more figure box beside the total (C-rows), then "Left after" as today:

| Entry | Boxes |
|---|---|
| Transfer | Paid in all ৳1,010.00 · Charge ৳10.00 |
| Money received | Reached you ৳9,850.00 · Charge ৳150.00 |
| Spending | Charge ৳150.00 · Left after |
| Paid back a loan | the loan's bar, then Paid in all ৳5,200.00 · Charge ৳200.00 |
| A lending paid back | the loan's bar, then Reached you ৳3,150.00 · Charge +৳150.00 (green) |
| Lent | the loan's bar, then Paid in all ৳5,020.00 · Charge ৳20.00 |
| Borrowed | the loan's bar, then Reached you ৳9,800.00 · Charge ৳200.00 |

"Reached you" is today's word on a lending payment; C-rows wrote "Reached" on money received (D11). "Left after" is
the balance after the entry and its charge, as today.

### History headings and filters

- **Default view:** month and day headings, "+" received over "−" spent: paid charges are inside spent (as today);
  received charges inside received.
- **Transfers filter:** "Transferred ৳1,830.00" and **"Charges ৳2.50"** in words (today "Fees ৳2.50").
- **Spent and Received filters:** whether they list the entries that carry a charge: D1.
- **Lent and Borrowed filters:** whether their headings say the charges: D3.
- **Category filter:** a purchase's charge follows its purchase, so "Eating out" counts ৳1,150.00 (as the ring).
- Kind and category counts in the Filters sheet follow the same rules as the list.

### Search

- A charge's words and amount find its entry (as a fee's do today), never a row of its own.
- Whether a number also finds the figure the row shows (a purchase's total, "Paid in all", "Reached you"): D7.
- Suggestion counts follow History's rows and the filters' rules above.

### Home

- The ring's figure is all spending, charges included; each category's percentage is out of it.
- **The grey Charges part** (C-home): one slice in `#7a8190`, after the categories' slices, with no tile and no leader
  line, true to size (a ৳10.00 charge of ৳5,990.00 is a hairline; no minimum width).
- **Its legend in the hole**, under the figure: a grey dot, then **Charges ৳10.00**. It shows only when the period
  has paid charges outside purchases, in the viewed currency; with several currencies the ⇄ chip stays under it. When
  the hole shows received or nothing (the Settings donut): D9.
- TalkBack: the donut's button says "Spending summary: spent ৳5,990.00, of which charges ৳10.00" (and the received
  part when there is one).
- **A new notebook's ring has no Fees tile**; an existing notebook keeps its own as an ordinary category (plain
  expenses in it count there, never charges).
- The two-pane list's and the entries sheet's day totals count charges.

### Summary

As in C-summary:

- Every tab's bars, total, average and comparison include charges.
- **The list ends with a Charges line** whenever the period has charges outside purchases: a grey dot where a
  category's emblem would be (so it reads as "not a category"), **Charges**, its percentage on Months and Year
  ("Charges <1%"), a grey bar and the amount. On Days and Weeks it comes after the three top categories; on Months and
  Year after all of them, whatever its size. It is the legend: Summary has no other.
- The Months pie ends with the grey slice.
- TalkBack: "Charges, ৳158.00, less than 1%".

### The widget, the morning check and notifications

- The widget's "spent today" and the morning check's "Yesterday you spent …" include charges (`spentOn()`); the
  widget's code (`TallyWidget.java`) doesn't change.
- No notification shows spending: the balance check lists balances (which already include every charge), the reminders
  show what is due (which charges never change). Nothing to change.

### Paid more than owed

The dialog takes the decided style (`choiceDialog`: the likely answer filled, the other tonal, Go back outlined), as
in C-overpaid with the new words:

- **You paid back a loan with more than you owed** — title "You paid ৳500.00 more"; text "You owed Maya ৳35,000.00.
  What is the extra ৳500.00? A charge on this payment, counted as spending, or a lending to Maya (they owe you)?"
  (proposed, D11); answers **Track as charge** (filled: the payment that clears the loan, with the extra added to its
  charge, plus any charge typed), **Track as lending** (tonal: a new lending, as today), **Go back** (outlined).
- **A lending was paid back with more than was owed** — title "Sam paid ৳500.00 more"; text "Sam owed you ৳5,000.00.
  What is the extra ৳500.00? Income on this payment, or a loan from Sam (you owe it)?" (proposed, D11); answers
  **Track as income** (filled: D4), **Track as loan** (tonal: a new loan, as today), **Go back** (outlined).
- Messages: "Loan cleared · ৳500.00 as its charge"; "Sam’s lending cleared · ৳500.00 as income" (proposed, D11).
- The account always gets or gives the full amount, as today.

### The loan sheet

- A payment's details line: "৳200.00 charge" for a paid charge, "+৳150.00 charge" for a received one (not drawn,
  D11), in place of "৳200.00 fee".
- Its Edit (the payment's or the draw's sheet) gets Add a charge and the card, so a charge can be added, changed or
  removed after saving (today a payment's fee can't be).

### CSV export

One line per entry, as today, so each charge is its own line after its entry; the columns don't change.

- **type:** today "transfer-fee" or "loan-fee" (any payment's fee). Recommended (D10): keep both values as they are
  and add "income-fee", "expense-fee", "lend-fee" and "borrow-fee" (a draw's charge) and "loan-fee-in" (a charge
  received on a lending's payment).
- **category:** a purchase's charge carries the purchase's category; other charges leave it empty, as fees do today.
- **note:** the charge's own note, else "Charge" (today "Transfer fee" / "Payment fee").

### Accessibility and text

- Every figure in the card and the previews is in `rem`; the card grows with the text (`min-height`); at 360 px with
  1.3× text in German nothing is cut and nothing scrolls sideways (B, column 4). `22-layout.js` gets the card on every
  form, open and with the keypad, on phones, a phone held sideways, foldables and tablets.
- Every button 48 dp; the grey passes 3:1 against the surface in both themes (4.3:1 dark, 3.9:1 light, measured in
  the mock-ups); the word "Charges" or "charge" is always next to the grey, so nothing is told by colour alone.
- Every text is in the catalogue in all nine languages. **Translations of "charge"** must cover a fee, interest and a
  tax in one word in each language (B used "Gebühr" in German); the words chosen go to the maintainer with the build
  (D14).

## Texts

English, in `l10n/web/en.json`; key names are proposals.

New:
- `charge.add` "Add a charge" · `charge.label` "Charge" · `charge.calc` "Calculator for the charge" · `charge.remove`
  "Remove the charge" · `charge.notNumber` "That charge isn't a number" · `charge.negative` "A charge can't be
  negative"
- `charge.prev.loan` "loan {{amount}} + charge {{charge}}" · `charge.prev.lend` "lending {{amount}} + charge
  {{charge}}" · `charge.prev.lendOff` "lending {{amount}} − charge {{charge}}" · `charge.prev.reaches` "Reaches
  {{account}} {{amount}}" · `charge.prev.owes` "{{who}} owes {{amount}}" · `charge.prev.youOwe` "you owe
  {{amount}}" · `charge.prev.spend` "{{amount}} + charge {{charge}}"
- `tx.chargeOn` "+ {{amount}} charge" · `tx.chargeOff` "− {{amount}} charge" · `tx.chargeIncl` "incl. {{amount}}
  charge" · `tx.charge` "Charge"
- `ring.charges` "Charges {{amount}}" · `ring.summaryCharges` (TalkBack, with the spent and the charges) ·
  `summary.charges` "Charges"
- `loan.chargeAmt` "{{amount}} charge" · `loan.over.asCharge` "Track as charge" · `loan.over.asChargeMsg` "Loan
  cleared · {{amount}} as its charge" · `loan.over.asIncomeMsg` "{{who}}’s lending cleared · {{amount}} as income"
- `csv.chargeNote` "Charge"

Changed: `history.words.fees` → `history.words.charges` "Charges {{amount}}"; `loan.over.askBorrowOr` and
`loan.over.askLendOr` (the texts above, with the amount owed).

Retired: `transfer.addFee`, `transfer.inclFee`, `transfer.feeNegative`, `fee.label`, `fee.notNumber`, `loan.addFee`,
`loan.feeNegative`, `loan.feeAmt`, `tx.feeLine`, `loan.over.asFee`, `loan.over.asFeeMsg`. Kept as they are:
`transfer.feeNote` and `loan.feeNote`, because `autoNote()` recognises the notes 1.4.1 and earlier wrote by their
values in every language.

## Tests

- **Data (first):** a v7 save with a transfer fee, a loan payment's fee, a lending payment's paid fee, a plain
  expense in Fees, and Fees renamed "Food" loads with every balance, amount, account and date unchanged, the links
  kept and Fees kept; a v1-shaped save keeps its Fees entries in Fees; `blank()` has no Fees and a v8 save without it
  doesn't get it back; a v8 save with a charge on each of the seven kinds round-trips through `migrate()` unchanged; a
  received charge on anything but a lending payment, a charge on a charge, two charges on one entry and a one-sided
  link are unlinked with balances unchanged; a purchase's charge takes the purchase's category.
- **Older versions:** with every `feeOf` / `feeId` taken out of a v8 notebook (what 1.4.4 does to the links it
  doesn't know), `balances()` gives the same balances as version 8, for every kind (the balance maths is the same in
  both versions). And by hand, once, before the release: a v8 backup restored in the installed 1.4.4 shows the same
  balances.
- **Counting:** one notebook with a charge of each kind, in two currencies: Home's figure, the ring's parts and the
  legend, Summary's every tab, History's default headings, `spentOn()` and the widget agree; a purchase's charge is in
  its category; a received charge is in received; renaming the Fees category ("Food") never moves a charge.
- **Forms:** each form adds, edits, removes a charge; previews; the checks and messages; the keypad on the charge
  (its bar says "Charge", the amount looks idle, the keyboard never under it); TalkBack names; Back closes the keypad
  first.
- **Cascades:** delete (both answers), Undo, a payment's and a draw's edit, the loan sheet's own delete, reopening a
  cleared loan, deleting a loan: the charge always goes or comes with its entry.
- **Overpaid:** both dialogs, each answer, with and without a typed charge.
- **CSV:** the type, category and note of each kind of charge.
- Suites that change: 26 and 27 (their rule turns: charges are spending), 08 (overpaid), 07 and 09 (Summary), 01 (the
  Fees tile), 41 and 42 (History, search), 43 (the keypad), 15 (CSV, migration), 22, 24, 32, 33 and the English
  snapshot 90. New: `45-charges.js`.

## Decisions still needed

Each is a plain choice with a recommendation; nothing in it is built until it is answered.

- **D1. Does History's Spent filter list transfers, payments, money received, lends and borrows that carry a charge?**
  - A. No: Spent lists spending only (purchases, with their charges). Its heading is then smaller than the default
    view's "spent" by the other charges.
  - **B (recommended): yes**, those rows are listed too and only their charge counts in the heading, so Spent's total
    is the same as Home's, Summary's and the default heading's. The rows look as they do anywhere ("৳1,000.00 / + ৳10.00
    charge"). The Received filter does the same for a lending payment with a received charge.
- **D2. How a charge on money received shows on its row** (and on a borrow, which works the same way):
  - **A (recommended): "+৳10,000.00" with "− ৳150.00 charge" under it.** Every row with a charge then says the
    charge's word and amount in the same place; the income figure stays what was earned; "Reached you ৳9,850.00" is in
    the opened row.
  - B: "+৳10,000.00" with "Reached ৳9,850.00" under it: what the account got, without the word "charge" on the row.
- **D3. The Lent and Borrowed filters' headings** (and Received's, with D1 B):
  - **A (recommended): a "Charges ৳20.00" line in words**, as the Transfers filter has.
  - B: no charges line; the rows show them.
- **D4. "Track as income" on a lending paid back with more than was owed:**
  - **A (recommended): the extra becomes that payment's received charge**, counted as received, with no form to fill
    (as the mock-ups drew it for interest). The row reads "+৳5,000.00 / + ৳500.00 charge".
  - B: as today, the income form opens with the extra filled in and you pick a category.
- **D5. A paid charge on a lending's payment** (a receiving or cash-out fee you pay when you are paid back):
  - **A (recommended, as decided): a lending payment's charge is always received.** Older paid fees stay paid,
    counted as spending, and can still be changed or removed on the payment's edit. A cash-out fee is recorded on the
    transfer to Cash, where it happens.
  - B: the card gets a choice between received and paid, which adds a control to one card only.
- **D6. The transfer form's preview without a charge:**
  - **A (recommended): a plain line under the amount in the same style**, "● Bkash −৳1,000.00 · ● Bank +৳1,000.00",
    as today's preview; it moves into the card once a charge is added.
  - B: no preview until a charge is added.
- **D7. Searching a number on an entry with a charge:**
  - **A (recommended): the number also finds the figure the row and the opened row show** (a purchase's total
    ৳1,150.00, "Paid in all", "Reached you"), besides the entry's and the charge's own amounts; "more than" and "less
    than" compare the row's figure.
  - B: as today, only the entry's own amount and the charge's.
- **D8. A charge bigger than what it comes off** (money received, a borrow), which would make the account go down:
  - **A (recommended): refused**, with "The charge can't be more than the amount".
  - B: allowed; the preview shows the minus.
- **D9. The legend in the hole when the Settings donut shows received or nothing:**
  - **A (recommended): the legend shows only when the hole shows the spent figure** (it explains that figure); the
    donut's TalkBack label always names the charges.
  - B: it always shows when there are charges.
- **D10. The CSV's words for charges:**
  - **A (recommended): keep "transfer-fee" and "loan-fee" exactly** and add "income-fee", "expense-fee", "lend-fee",
    "borrow-fee" and "loan-fee-in", so spreadsheets and scripts that read older exports keep working.
  - B: switch to "charge" in every value ("transfer-charge", …), which matches the screen but changes values people
    may already filter on.
- **D11. Words not drawn in the mock-ups**, proposed above for a yes or a change:
  - the two overpaid dialog texts and their two messages;
  - the Borrow preview "● Bank +৳9,800.00 · you owe ৳10,000.00" (or "you owe Maya ৳10,000.00");
  - the borrow row, opened and collapsed;
  - the loan sheet's "+৳150.00 charge" for a received charge;
  - the messages after saving a payment, a lend, a borrow and spending;
  - "Reached you" on money received (C-rows wrote "Reached");
  - TalkBack: "Calculator for the charge", "Remove the charge", "…, of which charges ৳10.00";
  - the keypad bar's name for the main amount ("Amount", "Amount sent"), and where its live result ("= 1,250") sits
    beside the field's name (proposed: right after it, before the keyboard button).
- **D12. Where the keypad names its field:** **while the charge card is open (recommended)**, which is when a form
  has two amounts; or on every form that offers Add a charge, even with the card closed.
- **D13. CLAUDE.md's scope line** (the docs task proposes the exact sentences) and **the store listings** in nine
  languages ("add an ATM or cash-out fee", "with any fees"): both are public or the project's rules, so each change
  waits for a yes.
- **D14. The word for "charge" in each of the eight other languages**, listed with the build for the maintainer (or a
  speaker) to check.

## Not in this change

- Interest rates, schedules or interest worked out by Tally: a charge is typed.
- A second charge on one entry, or a charge on a balance fix or an asset.
- Moving the built-in Fees category's plain entries anywhere: they stay in Fees.
- A "Charges" filter or suggestion in History: charges are found through their entries.
