# Charges and extras: fees, interest and tax inside their entry

Status: approved 2026-11-07. The model and the looks come from the design round
([design-round.md](design-round.md): part C, "Changes after the confirmation page", which wins over part C, and the
tonal card in "Changes after the build started"; images C-transfer, C-rows, C-home, C-summary, C-forms, C-overpaid and
the tonal card B). The maintainer then settled every open point on 2026-11-07, with a second round of mock-ups (D9-home,
D6-transfer, D2-extras, D11-words), whose wording is approved; those answers are listed at the end and are folded into
every section. Wherever an earlier image says "fee", "interest" or "tax" for money you pay, the word is now
**charge**; money you get on top of a payback is an **extra**.

## The model

- **A charge or an extra is part of the entry it came with.** It is entered on that entry's form, shown inside that
  entry's row, edited, deleted and undone with it, and never has a row of its own.
- **A charge is money you pay with an entry:** a fee, interest, a tax, a service charge or a processing fee. One word,
  "charge", in every form, row, heading and total.
- **An extra is money you get on top of a lending's payback** (interest, a thank-you): never negative, added to the
  account.
- **Which entry carries what** (one each):
  - a charge: a transfer, a loan payment (you pay back), a lend (a lending's draw), a borrow (a loan's draw) and
    spending;
  - an extra: a lending's payment (you are paid back);
  - money received carries neither: you write down what arrived.
- **A charge counts as spending; an extra counts as income (received).**
- **Where a charge counts:**
  - a purchase's charge (VAT, a service charge) counts in **the purchase's own category**: a ৳1,000.00 dinner with a
    ৳150.00 charge makes Eating out ৳1,150.00;
  - every other charge (on a transfer, a payment, a lend or a borrow) counts in one fixed grey part called
    **Charges**, which is not a category: it has no tile, can't be renamed, hidden or picked, and is always the same
    grey (`#7a8190`, the colour fees had before 1.3.2 and the balance fix's emblem colour).
- **The movement itself never counts.** A transfer, the money a loan or lending moves (draws and payments) and a
  balance fix are never spending or income, as before; a day with only paybacks has no received total, by design. Only
  the charge or extra on them counts.
- **All past fees count.** Every fee already recorded on a transfer or a loan or lending payment is a charge from this
  version on and counts as spending in Charges. No amount or balance changes; the totals of past days and months go up
  by the fees already recorded. The changelog says so.
- **What is owed never changes.** A charge or an extra on a payment or a draw is not part of the loan: `loanInfo()`
  reads only the draws and payments, as today.

### Each kind of entry

The main amount keeps its meaning on every form; the charge or extra is added to it or taken off it.

| Entry | The main amount is | It carries | The account sees | Counts as |
|---|---|---|---|---|
| Transfer | what was sent | a charge, cut from the From account | From: −(amount + charge); To: +amount (or what arrived) | spending, Charges |
| Loan payment (you pay back) | what goes off the loan | a charge | −(amount + charge) | spending, Charges |
| Lending payment (you are paid back) | what goes off the lending | an extra | +(amount + extra) | income (received) |
| Lend | what they owe you | a charge | −(amount + charge) | spending, Charges |
| Borrow | what you owe | a charge, taken off what arrived | +(amount − charge) | spending, Charges |
| Spending | the price before the charge | a charge | −(amount + charge) | spending, in the purchase's category |
| Money received | what arrived | nothing | +amount | income, as today |

A lending payment recorded before this version may carry a **paid** fee (a receiving or cash-out fee, stored as an
expense). It stays a paid charge: it counts as spending in Charges, the account sees +(amount − charge), and the
payment's edit shows it as a charge card that can be changed or removed. Once it is removed, the payment offers Add an
extra. New lending payments carry extras only.

## Counting

The rule, in code terms:

- `isSpend(t)` becomes `t.type === "expense"`: every expense, charges included.
- A new `spendCat(t)` gives the part an expense counts in: a charge (`t.feeOf`) whose entry is spending counts in that
  entry's category; any other charge counts in `CHARGES`, a key that can never be a category id (category ids are
  `[A-Za-z0-9-]` only, through `sid()`, so `"_charges"` is safe); a plain expense counts in its own `cat`.
- An extra is an `income` entry, so it counts as received wherever income does. It is never part of the donut, which
  shows spending only.

Every place that adds up spending or received follows it, with no exception:

- `spentOn()` (the widget's "spent today" and Home's morning check, "Yesterday you spent …");
- Home: the ring's slices and percentages, the spent and received figures in the hole, and the day totals in the
  two-pane list and the entries sheet (`dayGroups()` without History adds up only rows today, so it must count the
  charges inside them);
- History's headings (`histLines()`), which already count paid fees inside "spent"; an extra goes into "received";
- Summary (spending only): every tab's bars, totals, comparisons, averages, category list and pie;
- search: the headings and counts follow History.

Totals then agree everywhere: Home's figures = Summary's = History's default heading = the widget, for the same period
and currency.

## Saved data: version 8

### How a charge and an extra are stored

Each stays **its own entry, linked both ways to the entry it came with**, as transfer and payment fees are today:
`feeOf` on the charge or extra, `feeId` on its entry. Version 8 extends that link to every kind in the table above.
The field names stay `feeOf` / `feeId` (they are only stored names; the screen says "charge" or "extra").

- A charge is `{type: "expense", amount, account, date, cat, note: "", feeOf}`; an extra is
  `{type: "income", amount, account, date, cat, note: "", feeOf}`. Its `ts` is its entry's `ts` + 1, so it sorts right
  after it, as today.
- Its `account` is the entry's paying or receiving account (a transfer's From account), its `date` the entry's date.
  Every edit of the entry moves both with it, in the same change.
- Its `cat` is only for older versions and the CSV export (version 8 counts by `spendCat()` and by type):
  - a purchase's charge: the purchase's own category, kept equal to it whenever the purchase is saved;
  - any other charge: `"fees"`, as today;
  - an extra: `"otherin"` (the built-in received "Other").
- It has no payee and never a `feeId` of its own. An entry has at most one.
- Which entries may carry which (`migrate()` keeps only these links):
  - a charge (`expense`): on a transfer, a loan entry (a draw, a payment out, or an older lending payment in), or an
    expense that is not itself a charge;
  - an extra (`income`): only on a loan payment that brings money in (`type: "loan"`, not `principal`, `dir: "in"`).

**Why not a field on the entry** (`charge: 150` on the transfer): an older Tally rebuilds every entry from the fields
it knows (`migrate()` copies field by field), so it would drop the field and every balance with a charge would change
by its amount in that version: a v8 backup restored there would silently be wrong. A linked entry keeps its money in
every version, needs no change to `applyEntry()` or `balances()`, and the existing cascades (delete, keep the balance,
undo, a payment's edit, the CSV's one line per entry) already carry it. The cost is the link checks in `migrate()`,
which exist already and only widen.

### `migrate()` to version 8

`blank().v` becomes 8. The step never changes an amount, an account, a date or a balance.

1. **Links.** `feeId` is read on every kind that may carry a charge or extra (today only on transfers and loan
   payments; draws and expenses are added), and `feeOf` on an expense or income as today. A link is kept only when
   both ends point at each other and the pair is allowed by the list above; any other link is dropped from both ends,
   and the former charge or extra becomes a plain expense or income in its stored category, as an unlinked fee does
   today (so a charge on money received, which no version wrote, is unlinked). An entry holds one `feeId`, so a second
   charge pointing at it is unlinked; one that points at another charge is unlinked too.
2. **A purchase's charge** takes its purchase's category (`cat`), which moves nothing.
3. **The built-in Fees category.** `"fees"` stays in `CATS` with a `retired: true` mark, so `catName()` still says it
   in Tally's language and Remove hides it (as for any built-in) rather than deleting it. Then:
   - a save older than version 8 gets it back when it is missing, as every older version did (a 1.0 save, which had
     no list of categories, keeps its Fees entries in Fees);
   - from version 8 on, it is never added back: a new notebook (`blank()`, also after Delete all data) starts without
     it, and a notebook that has it keeps it, its name, colour, place on the ring and entries as they are (plain
     expenses in it count there, never charges).
4. Nothing else changes: past fees on transfers and payments are already charges in this shape; a lending payment's
   paid fee stays a paid charge.

### What older versions do with version 8 data

Restoring a v8 backup in an older Tally shows its existing line "It was made by a newer version of Tally: update Tally
first so nothing is left out." Then, in 1.4.2–1.4.4 (data v7):

- **Every balance is right**: each charge and extra is an ordinary entry there.
- A charge on a transfer or a payment keeps its link and shows as "+ $2.00 fee", not counted as spending (that
  version's rule).
- A charge on a lend, a borrow or a purchase loses its link (v7 accepts it only on transfers and payments) and becomes
  a plain expense: a purchase's charge counts in the purchase's category, the others in the built-in Fees category,
  which that version adds back if missing. These count as spending there too, so only the transfer and payment
  charges are left out of that version's totals.
- An extra keeps its link (v7 keeps `feeOf` on an income linked to a payment), counts as received, and is labelled
  "fee" on the row; the opened row's "Reached you" shows the amount minus it instead of plus. Only the words are
  wrong; the balance and the received total are right.

Versions before 1.4.2 also read each charge and extra as an entry of its own (their `migrate()` keeps any expense or
income it can read), so balances stay right there too. Nothing in the file is lost when it comes back to version 8.

### The other branch

`docs/decisions.md` (2026-11-01) reserves the next number for main's own changes: the Plan branch
(`claude/plan-wip`), whose data is numbered 7 for its repeats, must be renumbered to 9 when it is rebased.

## Screens and words

Figures are in taka, as in the images; every amount is written by `money()` in the account's currency, and every
account name has its colour dot before it (`accTag()`).

### "Add a charge" and "Add an extra"

A text button with a + icon, **Add a charge** (or **Add an extra** on a lending's payment); tapping it opens the card
in its place, focuses its field (Android's keyboard, as for any field) and closes the calculator if it was open
(1.4.4).

| Form | Button | Where |
|---|---|---|
| Transfer | Add a charge | under the amount (and the "arrived" field between two currencies), above note and date |
| Paying back a loan (the loan sheet's card) | Add a charge | under the date, above Record payment |
| Being paid back a lending (the loan sheet's card) | Add an extra | under the date, above Record payment |
| Editing a payment or a draw (the loan sheet's Edit) | as the payment or draw has it | under the date (and Due, for a draw), above Save |
| Lend money, Borrow money | Add a charge | under the account chips, above Date and Due |
| Spent | Add a charge | under the account chips, above note and date |
| Received | none | — |

On a form opened for an entry that has a charge or extra, the card is open from the start. The old labels go: "Add a
fee (ATM, cash‑out)", "Add a fee (sending, cash‑out)", "Fee charged (USD) · not counted as spending" and "(incl.
$2.00 fee)".

### The card

As in the tonal card image (charge/B.png); the extra card mirrors it (D2-extras):

- A soft surface-container card, full width, holding:
  - a small label, **Charge** or **Extra**;
  - under it a medium figure, the currency code before it ("BDT 10"), the same way the amount field shows it; the code
    follows the account picked (From, for a transfer), as the amount's does;
  - at the right a round tonal calculator button (48 dp) and **✕** (48 dp), which removes it and closes the card (the
    Add button comes back);
  - a thin line inside the card, and under it the **preview** (below).
- **The keypad on the card:** the calculator button opens the keypad for it (and closes the amount's). While it fills
  the card, the card's line and label take the accent colour with the caret in the figure, the keypad's bar names the
  field (**Charge** or **Extra**), and the main amount looks idle (a thin grey line, grey figures). The form scrolls so
  the preview stays in view above the keypad.
- **The keypad on the main amount, while a card is open:** the bar names that field (**Amount sent** on a transfer,
  **Amount** elsewhere) and the card looks idle. A form whose card is closed keeps today's keypad.
- **The bar's live result** ("= 15") sits right after the field's name, and the keyboard button stays at the right
  end; when the name and the result don't fit on one line (a long translation, large text), the result wraps under the
  name, never cut. The preview counts the result (−৳1,015.00 for "10+5").
- The keypad and Android's keyboard are never on screen together (1.4.4); tapping any other field closes the keypad.
- TalkBack: the card is a group named "Charge" (or "Extra"); the field has the same name; the calculator button is
  "Calculator for the charge" / "Calculator for the extra" (today both calculators are "Calculator"); ✕ is "Remove the
  charge" / "Remove the extra". The preview is plain text read in order.

### Previews

Inside the card, under its line, the figures in bold. Each account named has its dot.

| Form | Preview |
|---|---|
| Transfer | ● Bkash −৳1,010.00 · ● Bank +৳1,000.00 |
| Transfer between two currencies | ● Bank −$102.00 · ● Euro account +€92.00 (what arrived; "+ ?" until it is typed) |
| Paying back a loan | ● Bank −৳5,200.00 · loan ৳5,000.00 + charge ৳200.00 |
| Being paid back a lending | ● Bkash +৳3,150.00 · lending ৳3,000.00 + extra ৳150.00 |
| A lending payment with an older paid fee (its edit) | ● Cash +৳2,990.00 · lending ৳3,000.00 − charge ৳10.00 |
| Lend money | ● Bkash −৳5,020.00 · Rafi owes ৳5,000.00 ("Someone owes ৳5,000.00" until a name is typed) |
| Borrow money | ● Bank +৳9,800.00 · you owe Nadia ৳10,000.00 ("you owe ৳10,000.00" until a name is typed) |
| Spent | ● Credit card −৳1,150.00 · ৳1,000.00 + charge ৳150.00 |

**The transfer form's preview without a charge** stays a plain line under the amount, in the same words:
"● Bkash −৳1,000.00 · ● Bank +৳1,000.00" (no "→" any more). Once a charge is added, the line leaves that spot and
appears inside the card, counting the charge, so it is never shown twice. The other forms have a preview only inside
their card.

A preview is empty until the amount is a number; a card that is empty or not yet a number previews as nothing added.

### Saving

- An empty card, or one that shows as 0 in the currency, saves as nothing (an existing one is removed).
- "That charge isn't a number" / "That extra isn't a number" when it can't be read; "A charge can't be negative" / "An
  extra can't be negative" when it is below 0.
- On a borrow, a charge bigger than the amount is refused: "The charge can't be more than the amount".
- The low-balance question (`guardOverdraw`) counts the charge, as it does a transfer's fee today.
- Messages after saving:
  - paying back a loan: "Paid back ৳5,000.00 + ৳200.00 charge";
  - being paid back: "Got back ৳3,000.00 + ৳150.00 extra";
  - a lend: "Lent ৳5,000.00 to Rafi + ৳20.00 charge";
  - a borrow: "Borrowed ৳10,000.00 from Nadia · ৳200.00 charge" (the charge comes off what arrived);
  - spending: the total, as the row shows it: "−৳1,150.00 · Eating out";
  - a transfer: unchanged, "Transferred ৳1,000.00 to Bank".
- Editing an entry moves its charge's or extra's account and date with it, and a purchase's charge's category with
  the purchase's. Deleting an entry deletes its charge or extra (with either answer of the Delete question; keeping
  the balance moves both into the opening balance); Undo brings both back.

### History rows

No icon and no dot on the small line: the word "charge" or "extra" and the sign say what it is (C-rows, D2-extras).

| Entry | Row, collapsed (amount, then the small line under it) |
|---|---|
| Transfer | ৳1,000.00 / + ৳10.00 charge |
| Spending | −৳1,150.00 / incl. ৳150.00 charge (the row shows the total) |
| Paid back a loan | −৳5,000.00 / + ৳200.00 charge |
| A lending paid back | +৳3,000.00 / + ৳150.00 extra, in green |
| Lent | −৳5,000.00 / + ৳20.00 charge |
| Borrowed | +৳10,000.00 / − ৳200.00 charge |
| A lending paid back, older paid fee | +৳3,000.00 / − ৳10.00 charge |

Opened, each charge or extra is one more figure box beside the total, then "Left after" (the balance after the entry
and its charge or extra) as today:

| Entry | Boxes |
|---|---|
| Transfer | Paid in all ৳1,010.00 · Charge ৳10.00 |
| Spending | Charge ৳150.00 · Left after |
| Paid back a loan | the loan's bar, then Paid in all ৳5,200.00 · Charge ৳200.00 |
| A lending paid back | the loan's bar, then Reached you ৳3,150.00 · Extra +৳150.00 (green) |
| Lent | the loan's bar, then Paid in all ৳5,020.00 · Charge ৳20.00 |
| Borrowed | the loan's bar, then Reached you ৳9,800.00 · Charge ৳200.00 |
| A lending paid back, older paid fee | the loan's bar, then Reached you ৳2,990.00 · Charge ৳10.00 |

### History headings and filters

- **Default view:** month and day headings, "+" received over "−" spent: charges are inside spent (as today), extras
  inside received. Loan paybacks themselves stay out of received, so a day with only paybacks has no total.
- **The words line under the figures** names what a filter's rows carry, always in the plural (it is a total):
  - Transfers: "Transferred ৳1,830.00" and **"Charges ৳2.50"** (today "Fees ৳2.50");
  - Lent: **"Extras ৳150.00"** for the extras on paybacks, and "Charges ৳20.00" for the charges on lends (and on older
    lending payments);
  - Borrowed: "Charges ৳200.00";
  - each line only when its amount isn't 0.
- **Spent filter:** it also lists the transfers, payments, lends and borrows that carry a charge, and only their
  charge counts in its heading, so Spent's total is the same as Home's, Summary's and the default heading's. Their rows
  look as anywhere else ("৳1,000.00 / + ৳10.00 charge").
- **Received filter:** it also lists the lending payments that carry an extra, and only the extra counts in its
  heading.
- **Category filter:** a purchase's charge follows its purchase, so "Eating out" counts ৳1,150.00 (as the ring).
- Kind and category counts in the Filters sheet follow the same rules as the list.

### Search

- A charge's or extra's words and amount find its entry (as a fee's do today), never a row of its own.
- A number also finds the figure the row and the opened row show: a purchase's total (৳1,150.00), "Paid in all",
  "Reached you". "More than" and "less than" compare the row's figure.
- Suggestion counts follow History's rows and the filters' rules above.

### Home

- The ring's figure is all spending, charges included; each category's percentage is out of it. Extras are never on
  the ring.
- **The grey Charges part** (D9-home, without its line): one slice in `#7a8190`, after the categories' slices, true to
  size (৳657.50 of ৳178,137 is a hairline; no minimum width). It shows only when the period has charges outside
  purchases, in the viewed currency, whatever the hole shows (the ring never changes with the Settings donut).
- **Its label**, not a button and not a tile: in the top right corner of the ring's square, 6 px under the account
  chips and outside the donut, a grey dot and the word **Charges**, with **the charges' amount under the word**
  ("৳657.50"). No icon, no %, and **no leader line** to the slice. The word and amount are the size of the tiles'
  names, in the app's muted text colour (the grey `#7a8190` is only the dot's and the slice's, never text). The tiles
  stand on a circle, so the corner is always free; it touches no tile at 360 px with large text, nor with a few big
  tiles. With no charges there is neither label nor slice.
- TalkBack: the donut's button says "Spending summary: spent ৳178,137.00, of which charges ৳657.50" (and received, when
  there is some); the label itself is hidden from TalkBack, which already heard it.
- **A new notebook's ring has no Fees tile**; an existing notebook keeps its own as an ordinary category.
- The two-pane list's and the entries sheet's day totals count charges.

### Summary

Spending only, as in C-summary:

- Every tab's bars, total, average and comparison include charges; extras are not in Summary.
- **The list ends with a Charges line** whenever the period has charges outside purchases: a grey dot where a
  category's emblem would be (so it reads as "not a category"), **Charges**, its percentage on Months and Year
  ("Charges <1%"), a grey bar and the amount. On Days and Weeks it comes after the three top categories; on Months and
  Year after all of them, whatever its size. It is Summary's legend.
- The Months pie ends with the grey slice.
- TalkBack: "Charges, ৳158.00, less than 1%".

### The widget, the morning check and notifications

- The widget's "spent today" and the morning check's "Yesterday you spent …" include charges (`spentOn()`); the
  widget's code (`TallyWidget.java`) doesn't change.
- No notification shows spending: the balance check lists balances (which already include every charge and extra),
  the reminders show what is due (which charges and extras never change). Nothing to change.

### Paid more than owed

The decided dialog style (`choiceDialog`: the likely answer filled, the other tonal, Go back outlined), with the
approved texts (D11-words, D2-extras):

- **You paid back a loan with more than you owed:** title "You paid ৳500.00 more"; text "You owed Maya ৳35,000.00. Is
  the extra ৳500.00 a charge on this payment, counted as spending, or a lending to Maya that they owe you?"; answers
  **Track as charge** (filled: the payment that clears the loan, with the extra added to its charge, plus any charge
  typed), **Track as lending** (tonal: a new lending, as today), **Go back** (outlined).
- **A lending was paid back with more than was owed:** title "Sam paid ৳150.00 more"; text "Sam owed you ৳5,000.00.
  Is the extra ৳150.00 money on top, counted as income, or a loan from Sam that you owe back?"; answers **Track as
  extra** (filled: the payment that clears the lending, with the extra added to its extra, plus any extra typed; no
  form to fill), **Track as loan** (tonal: a new loan, as today), **Go back** (outlined).
- Messages: "Loan cleared · ৳500.00 as its charge"; "Sam’s lending cleared · ৳150.00 as an extra".
- The account always gets or gives the full amount, as today. The income form is no longer opened from here.

### The loan sheet

- A payment's details line names its charge or extra: "Wed, Jun 17 · from ● Bank · ৳200.00 charge · ৳30,000.00 left
  after this"; a payback with an extra: "… · into ● Bkash · +৳150.00 extra · …" (today "৳200.00 fee"). The amount
  and its word are kept on one line (a no-break space between them).
- Its Edit (the payment's or the draw's sheet) gets the Add button and the card, so a charge or extra can be added,
  changed or removed after saving (today a payment's fee can't be).

### CSV export

One line per entry, as today, so each charge or extra is its own line after its entry; the columns don't change.

- **type:** "transfer-fee" and "loan-fee" (any payment's paid charge) stay exactly as they are; new: "expense-fee",
  "lend-fee" and "borrow-fee" (a draw's charge), and "loan-fee-in" (an extra on a lending's payment), so spreadsheets
  and scripts that read older exports keep working.
- **category:** a purchase's charge carries the purchase's category; other charges and extras leave it empty, as fees
  do today.
- **note:** its own note, else "Charge" or "Extra" (today "Transfer fee" / "Payment fee").

### Accessibility and text

- Every figure in the cards, previews and the Home label is in `rem`; a card grows with the text (`min-height`); at
  360 px with 1.3× text in German nothing is cut and nothing scrolls sideways (B, column 4; D9-home, D6-transfer).
  `22-layout.js` gets the cards on every form, open and with the keypad, and the Home label, on phones, a phone held
  sideways, foldables and tablets.
- Every button 48 dp; the grey passes 3:1 against the surface in both themes (4.3:1 dark, 3.9:1 light) and is used
  for the dot and the slice only; the word "Charges", "charge" or "extra" and a sign are always beside the colour.
- Every text is in the catalogue in all nine languages. The words (the maintainer has them checked by native speakers
  before the release):

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
- `charge.add` "Add a charge" · `charge.label` "Charge" · `charge.calc` "Calculator for the charge" ·
  `charge.remove` "Remove the charge" · `charge.notNumber` "That charge isn't a number" · `charge.negative` "A charge
  can't be negative" · `charge.tooBig` "The charge can't be more than the amount"
- `extra.add` "Add an extra" · `extra.label` "Extra" · `extra.calc` "Calculator for the extra" · `extra.remove`
  "Remove the extra" · `extra.notNumber` "That extra isn't a number" · `extra.negative` "An extra can't be negative"
- `charge.prev.loan` "loan {{amount}} + charge {{charge}}" · `charge.prev.lendOff` "lending {{amount}} − charge
  {{charge}}" · `charge.prev.owes` "{{who}} owes {{amount}}" · `charge.prev.youOwe` "you owe {{amount}}" ·
  `charge.prev.youOweWho` "you owe {{who}} {{amount}}" · `charge.prev.spend` "{{amount}} + charge {{charge}}" ·
  `extra.prev` "lending {{amount}} + extra {{extra}}"
- `tx.chargeOn` "+ {{amount}} charge" · `tx.chargeOff` "− {{amount}} charge" · `tx.chargeIncl` "incl. {{amount}}
  charge" · `tx.charge` "Charge" · `tx.extraOn` "+ {{amount}} extra" · `tx.extra` "Extra"
- `ring.charges` "Charges" · `ring.summaryCharges` "Spending summary: spent {{spent}}, of which charges {{charges}}"
  (and its form with received) · `summary.charges` "Charges"
- `history.words.extras` "Extras {{amount}}"
- `loan.chargeAmt` "{{amount}} charge" · `loan.extraAmt` "+{{amount}} extra" · `loan.msg.plusCharge` "+ {{amount}}
  charge" · `loan.msg.plusExtra` "+ {{amount}} extra" · `loan.msg.borrowedCharge` "Borrowed {{amount}} from {{who}} ·
  {{charge}} charge" · `loan.over.asCharge` "Track as charge" · `loan.over.asExtra` "Track as extra" ·
  `loan.over.asChargeMsg` "Loan cleared · {{amount}} as its charge" · `loan.over.asExtraMsg` "{{who}}’s lending
  cleared · {{amount}} as an extra"
- `csv.chargeNote` "Charge" · `csv.extraNote` "Extra"

Changed: `history.words.fees` → `history.words.charges` "Charges {{amount}}"; `loan.over.askBorrowOr` "You owed {{who}}
{{owed}}. Is the extra {{amount}} a charge on this payment, counted as spending, or a lending to {{who}} that they owe
you?"; `loan.over.askLendOr` "{{who}} owed you {{owed}}. Is the extra {{amount}} money on top, counted as income, or a
loan from {{who}} that you owe back?"; the transfer preview loses its "→".

Retired: `transfer.addFee`, `transfer.inclFee`, `transfer.feeNegative`, `fee.label`, `fee.notNumber`, `loan.addFee`,
`loan.feeNegative`, `loan.feeAmt`, `tx.feeLine`, `loan.over.asFee`, `loan.over.asFeeMsg`, `loan.over.asIncome`,
`loan.over.extraNote`, `loan.over.lendCleared`. Kept as they are: `transfer.feeNote` and `loan.feeNote`, because
`autoNote()` recognises the notes 1.4.1 and earlier wrote by their values in every language.

## Tests

- **Data (first):** a v7 save with a transfer fee, a loan payment's fee, a lending payment's paid fee, a plain
  expense in Fees, and Fees renamed "Food" loads with every balance, amount, account and date unchanged, the links
  kept and Fees kept; a v1-shaped save keeps its Fees entries in Fees; `blank()` has no Fees and a v8 save without it
  doesn't get it back; a v8 save with a charge on each of the five kinds and an extra on a lending payment round-trips
  through `migrate()` unchanged; an extra on anything but a lending payment, a charge on money received, a charge on a
  charge, two on one entry and a one-sided link are unlinked with balances unchanged; a purchase's charge takes the
  purchase's category.
- **Older versions:** with every `feeOf` / `feeId` taken out of a v8 notebook (what 1.4.4 does to the links it
  doesn't know), `balances()` gives the same balances as version 8, for every kind (the balance maths is the same in
  both versions). And by the maintainer, once, before the release: a v8 backup restored in the installed 1.4.4 shows
  the same balances.
- **Counting:** one notebook with a charge of each kind and an extra, in two currencies: Home's figures, the ring's
  parts and the corner label, Summary's every tab, History's default headings, `spentOn()` and the widget agree; a
  purchase's charge is in its category; an extra is in received and never on the ring or in Summary; renaming the
  Fees category ("Food") never moves a charge.
- **Forms:** each form adds, edits and removes its charge or extra; Received has no Add button; previews (the
  transfer's line moving into the card); the checks and messages; the keypad on the card (its bar's name and live
  result, the amount idle, the keyboard never under it); TalkBack names; Back closes the keypad first.
- **Cascades:** delete (both answers), Undo, a payment's and a draw's edit, the loan sheet's own delete, reopening a
  cleared loan, deleting a loan: the charge or extra always goes or comes with its entry.
- **Overpaid:** both dialogs, each answer, with and without a typed charge or extra.
- **CSV:** the type, category and note of each kind.
- Suites that change: 26 and 27 (their rule turns: charges are spending), 08 (overpaid), 07 and 09 (Summary), 01 (the
  Fees tile), 41 and 42 (History, search), 43 (the keypad), 15 (CSV, migration), 22, 24, 32, 33 and the English
  snapshot 90. New: `45-charges.js`.

## Decided by the maintainer (2026-11-07)

- **D1** The Spent filter also lists the entries that carry a charge, counting only the charge; Received does the same
  for extras.
- **D2, D3, D4 (extras)** Money on top of a lending's payback is an extra: income, added to the account, never
  negative, entered with "Add an extra" in the charge card's style, shown on its row as a green "+ ৳150.00 extra" and,
  opened, "Reached you" and "Extra +৳150.00"; never on Home's donut. The overpaid lending asks "Track as extra" /
  "Track as loan" / "Go back"; the overpaid loan "Track as charge" / "Track as lending" / "Go back". The Lent filter's
  heading says "Extras ৳X"; every other filter says "Charges".
- **Money received has no charge**: you write down what arrived. A transfer's charge is cut from the From account and
  To gets the amount.
- **D5** A lending payment's new add-on is always an extra; older paid fees stay paid and editable.
- **D6** The transfer's preview is a line under the amount without a charge and moves into the card once one is added.
- **D7** A number also finds the figure the row and the opened row show.
- **D8** A charge bigger than the amount it comes off (a borrow) is refused.
- **D9** Charges are a small grey part of the donut, only when the period has charges, true to size; the label is a
  grey dot and "Charges" with the amount under it, in the ring's top right corner under the account chips, outside the
  donut, with no icon, no % and no leader line.
- **D10** The CSV keeps "transfer-fee" and "loan-fee" and adds "expense-fee", "lend-fee", "borrow-fee" and
  "loan-fee-in".
- **D11** The wording of the D11-words and D2-extras boards (above).
- **D12** The keypad names its field only while a charge or extra card is open.
- **D13** CLAUDE.md's two sentences change (the plan's docs task has them) and the store listings' lines change in
  nine languages.
- **D14** The words for "charge" and "extra" in the table above.

## Not in this change

- Interest rates, schedules or interest worked out by Tally: a charge or extra is typed.
- A second charge on one entry, or a charge on money received, a balance fix or an asset.
- Moving the built-in Fees category's plain entries anywhere: they stay in Fees.
- A "Charges" or "Extras" filter or suggestion in History: they are found through their entries.
- Day headings stay as they are: loan paybacks are not income, so there is no "got back" line on a day.
