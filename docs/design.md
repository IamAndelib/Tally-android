# Tally's design

A reference for anyone designing for Tally: the principles behind the interface and how they show in the app today.
The reasons for each decision are in [decisions.md](decisions.md) and the notes per feature in [specs/](specs/);
where this page and a decision disagree, the decision wins and this page is updated. How the code is organised is in
[CONTRIBUTING.md](../CONTRIBUTING.md); the rules for changing the interface (demo first, ask before anything public)
are in [CLAUDE.md](../CLAUDE.md).

Tally is a pocket notebook for money. Balances at the top, one tap per expense, the day rolls over to the next.
Everything here follows from that picture: a notebook is quiet, fast and honest, and it never loses a page.

---

## 1. Principles

**1. One tap per expense.**
The common path is never longer than tap a category, type the amount, save. Anything new goes beside that path,
never in front of it.
*Example:* every category on Home's ring opens the entry form with that category already picked, the amount field
focused and the account preselected; payee, note and date are optional and sit below.

**2. Calm over clever.**
Nothing moves, blinks or asks for attention unless the person did something. Feedback is a light pressed layer, a
soft flash on the changed row, a snackbar with Undo and a short vibration. No ripples, scaling or page animations.
*Example:* saving an entry closes the sheet, flashes the new row once and offers "Undo" in the snackbar. That is all.

**3. Information is never cut or shrunk.**
Words wrap and take more lines; they are never cut to "…" or set smaller. Only figures may shrink to fit, and a name
on Home's ring is shown whole or left out.
*Example:* the maintainer's ruling "shortening texts don't help, it's information going missing" (2026-11-05):
Home's balance chips let a long account name take two lines, and their box is as wide as the longest line.

**4. Figures at a glance, words when needed.**
A number with a sign or a symbol is read in a moment; a sentence has to be read. Prefer the figure, and keep words
for what a figure can't say.
*Example:* the Summary's "↑ 17% vs the day before" is one arrow and one number; History's month and day headings are
a column of two signed figures, "+ $2,400.00" over "− $1,310.25", not a sentence.

**5. Say each thing once.**
No figure, name or state appears twice on one screen unless it tells two things apart.
*Example:* an opened History row shows an account name only to tell two balances apart; there is no running balance
on the collapsed row, and "History has no visible summary line, the months carry their totals" (2026-11-05). Home's
balance bar says "Total in USD" once, over the figure, and the figure does not repeat the code.

**6. Nothing by colour alone.**
Colour supports a meaning that a sign, word, icon or position already carries.
*Example:* account colour is a dot beside the account's name wherever an account is named (the name stays);
spending is "−$3.25" (sign) and red (support); a picked account chip has a ✓ as well as its tint.

**7. The thumb gets what it reaches for most.**
Frequent actions sit low and in the middle; rare and risky ones sit further away or behind a sheet.
*Example:* "Nothing matches these filters" and its Clear all sit in the middle of the window, within the thumb's
reach, and the Clear all at the top is then left out (one is enough).

**8. The person decides; Tally never guesses about money.**
Tally never files an entry under a category by itself, never changes a balance silently, and never moves money
without saying so. Where a choice changes money, the person is asked, in words that say what each answer does.
*Example:* when someone pays back more than they owed, Tally asks what the extra is; "income" opens the income form
so the person picks the category (`overpay()` in `loans.js`). Deleting an entry asks whether the account's balance
changes ("Delete and update the balance") or stays ("Delete, keep the balance").

**9. Every change can be undone, and nothing is lost.**
Every change to entries goes through Undo. Accounts with entries are archived, never deleted. Unreadable saved data is
kept and offered as a file.
*Example:* deleting an account is only offered when it has no entries; otherwise the action is Archive.

**10. One pattern per job.**
A new screen uses the app's own patterns (sheets, chips, rows, figure boxes, `askDialog`, `choiceDialog`) before
inventing one, and
those patterns follow Material 3.
*Example:* History's period chip opens the same Day | Range | Month | Year dialog as Home.

**11. Works for everyone who might install it.**
Any currency, number format, first weekday and clock; nine languages; 360 px phones to tablets; large text; light
and dark; TalkBack. No default is tied to one country, bank or person.
*Example:* a new notebook has no currency until the person picks one (`S.settings.cur` is `""`); week start and
12/24-hour come from Settings, never guessed from the phone after the first run.

**12. Nothing leaves the phone.**
No network, analytics or accounts. This is a design constraint too: no remote images, no web fonts, no "learn more"
links that would need the internet.
*Example:* recent searches are kept by the shell on this phone only, left out of backups and device transfer.

---

## 2. Layout and spacing

- **Window size classes (Material 3).** Below 600 px: one column and the bottom bar (Home, Assets, Liabilities).
  From 600 px: a side rail. From 840 px: two panes on Home, Assets and Liabilities, and sheets become centred dialogs.
  A phone held sideways gets the ring alone on the left at full height and everything else on the right.
- **Home, top to bottom:** app bar (period, search, history, settings) → balance chips (swipe sideways) → the
  category ring around the day's donut → the balance bar → − / Transfer / + → Borrow money / Lend money. The ring is
  the main input; it is as big as the pane allows (`RINGW`). The chip row fades at an edge where more chips wait.
- **The balance bar is stacked:** "4 entries ›" on the left; on the right "Total in USD" over the figure, or, with
  several currencies, one "Total" and a line each (the code in one column, the figures right-aligned in the other; the
  notebook's own currency first, then by code).
- **Edges and gaps.** 16 px side gutters on phones; cards and grouped rows have 16 px inside; sections are separated
  by a coloured section label, not by lines or extra cards. Rows inside a group are separated by a hairline.
- **Grouped rows.** Lists sit in one rounded surface with hairlines between rows (Assets, History days, Summary
  categories), never one card per row.
- **Vertical space is cheap; horizontal space is not.** When something doesn't fit, it wraps and grows down. Boxes
  holding text use `min-height`, not `height`.
- **Tight lists stack.** A list narrower than 20rem (small phone, large text) becomes `.tight`: the amount moves under
  the title, from the left, instead of squeezing both onto one line.
- **Sheets fill from the bottom** with the main button last, at the thumb. Content scrolls inside the sheet; the sheet
  never grows past the screen.

## 3. Type and figures

- **One family: Onest**, bundled. Sizes in `rem` so they follow the phone's text size (`applyTextScale()`, capped at
  `TEXT_MAX`); WebView text zoom is off.
- **Hierarchy by size and weight, not by colour.** App-bar title 1.35rem semibold; a sheet's hero figure large and
  bold; row title at body size; a row's second line 0.8rem in the muted colour (`.tx .s`); section labels 0.85rem
  semibold in the primary colour (`.sec`); field labels 0.8rem semibold, muted (`.lbl`). Three or four sizes per screen
  at most.
- **Figures are the heroes.** Amounts are bold, right-aligned on rows and use tabular feel. A figure may shrink to
  fit (`fitFigures()`); words never do.
- **Money is always written the currency's way** (`money()`): its own decimals, its own symbol, the phone's separators
  (`LOC.fmt`, `NUMSEP`). Amount fields show the phone's separators and read back with `evalAmt()`.
- **Signs carry direction.** "−" money left an account, "+" money arrived; a transfer has no sign and is drawn with
  "→" between its two accounts. The minus is always the true minus, U+2212 (also in negative balances and in the
  calculator). Amount fields start with the currency's own decimals ("4,167.50").
- **Chart labels are whole amounts** in every Summary tab; a compact form ("12.4K") appears only from five digits, and
  only where the language has one.
- **Two currencies are never added together.** They are listed side by side, each in its own symbol.
- **Short labels.** A label names; it doesn't explain. Explanations, if needed at all, are a muted line under the
  control (Settings rows), one sentence.

## 4. Colour and accounts

- **Material 3 colour roles** (`css/colors.css`), following the wallpaper on Android 12+ (`theme.js`), light and dark.
  Surfaces are soft tints of the primary; the strongest colour on a screen is its main button.
- **Meaning colours, used sparingly:** red for money out and for danger (Delete), green for money in, blue (primary)
  for transfers and actions. Each always comes with a sign, a word or an icon.
- **Every category, account and asset has its own colour and emblem** from `PALETTE`. Its first 12 colours are checked
  for colour-blind safety as ring neighbours on light and dark surfaces; re-check if reordered.
- **Account colour is a recognition aid, not a label.** It shows as a dot before the account's name in every row and
  sheet line that names an account, and as a tint on a picked account chip in Filters and in forms (0.24 light / 0.38
  dark, text in the normal colour; very light colours get a weaker tint, half as strong, so the text passes WCAG AA).
  The name is always there.
- **Soft containers.** Summary cards (the net worth card, the Summary's figures) use one soft surface-container, the
  same in light and dark, with no line explaining what the figure is.
- **Defaults that tell types apart:** a credit card is purple by default so it doesn't look like a bank (2026-11-03).
- **Contrast passes WCAG AA** for every text on every surface, in both themes.

## 5. Icons and emblems

- **Material Symbols** (a generated subset in `icons.js`), filled style for emblems, outlined/regular for actions.
- **Emblems are round, coloured, with a white or dark glyph** chosen for contrast; 40–48 px in rows, 32 px on Home's
  chips, larger on a sheet's header. An emblem that can be changed is itself the button: a transparent dark tint with a
  pen icon over it (TalkBack: "Change emblem").
- **Icons are vertically centred** with the text they belong to, whatever the number of lines beside them (Home's
  chips: icon on the left in the middle, the name and balance together beside it).
- **One icon, one meaning.** ⇄ is a transfer, the loan emblem is a loan, the clock is "Added at", the calculator
  glyph opens the calculator, the outlined checklist is "Select". An icon never stands for two things.
- **Icon-only buttons have a label for TalkBack** (`aria-label`) and a 48 dp target.
- **Emoji only where it is content**, such as the welcome notebook illustration and emblems a person picks.

## 6. Chips and buttons

- **Chips fit their content**, never stretched to fill a row (2026-11-05). A chip moves to the next line only when the
  line can't hold it; its words wrap inside it rather than being cut.
- **Kinds of chip:**
  - *choice chips* in forms (account, type): emblem + name; picked = tonal fill (an account in its own colour) with a
    ✓ in place of the emblem; the category chip (▾) is the same on Spent and Received;
  - *filter chips* in the Filters sheet: compact (34 dp to see, 48 dp to tap), a count after the name, ✓ first when
    picked, dimmed and `aria-disabled` at 0;
  - *input chips* beside History's Filters button: full size (48 dp) with ✕, because people tap them often; they
    continue on the Filters line and wrap only when it is full, with Clear all as the last one;
  - *name suggestions* (people under Lend money / Borrow money, payees under Paid to / Received from): compact, each
    with its own ✕ that removes the name from the suggestions (its entries keep it) and offers Undo;
  - *dropdown chips* end in ▾ (category in the entry form, period chip, From/To).
- **Buttons, by weight:** one filled button per sheet or dialog (Save, Transfer, Record payment, Show N entries);
  tonal for secondary actions that are still common (Archive, History, Allow); text buttons for light actions
  (Add a fee, Open full history); outlined red for destructive actions at the end of a sheet
  (Delete loan, Delete all data).
- **Main button last and full width**, at the bottom of the sheet, with an icon only when it adds meaning (✓ Save).
- **Verbs on buttons**, saying what happens: "Record payment", "Update balance", "Show 96 entries". Not "OK" or "Yes"
  where a verb fits.
- **48 dp touch targets** everywhere, even where the visible shape is smaller (period ‹ ›, chip ✕).

## 7. Lists and rows

- **An entry row has two lines** (2026-11-05): line 1 what it was | how much; line 2 the category and the account as a
  dot of its colour and its name (`Groceries · ● Credit card`), a transfer `● Everyday → ● Cash`.
- **A fee lives inside what it was charged on** ("+ $2.50 fee" under the amount), never as a row of its own.
- **A loan or lending row says each thing once:** person | what's left, then the account (dot and name) and "Due"
  date | status chip (Active, Partly paid). The part-paid due amount lives on the sheet's due card, not on the row.
- **Tap opens the row in place** (one at a time) to show only what the row couldn't: "Added at 7:03 AM", figure boxes
  (Left after, Paid in all, Was / Now, the loan's bar), then Edit and Delete, centred (Edit opens a loan's own sheet).
- **Grouped by day under month headings**, newest first. The month and day headings carry a stacked column: "+"
  received (green) over "−" spent (red), one line per currency, the notebook's own first. The Transfers filter says
  "Transferred" and "Fees" in words instead.
- **Hold to select** several rows; while selecting, the period and Filters row stays where it is, dimmed and not
  tappable, so nothing moves; the app bar becomes "N selected", and with every row selected the app bar's select-all
  icon button becomes a deselect icon labelled "Clear selection".
- **Hold and drag to reorder** Assets, Liabilities and Home's chips; drag onto another section to archive, clear or
  reopen. A dragged item ticks once per switch of place.
- **Long lists draw in chunks** and nothing in how they look changes.

## 8. Sheets and dialogs

- **Three layers**, each holding one dialog: `#sheet`, `#sheet2`, `#pop`. The focus moves into the top one; what's
  behind is hidden from TalkBack (`aria-hidden`, `inert`); Back closes the top layer first; a tap right where a tap
  just closed one is dropped.
- **Bottom sheets** for anything with fields or a list (entry, transfer, account, loan, Summary, Filters, pickers).
  Title on the left, ✕ on the right, the handle on top, the main button at the foot. From 840 px they are centred
  dialogs; a phone held sideways gets them at full height.
- **Dialogs (`askDialog`, `choiceDialog`) only for a question that interrupts**: confirming something that can't be
  undone, a choice about money, or a one-time permission. Never `confirm()`.
- **A dialog's shape:** a short question as the title ("Archive Cash?"), one or two plain sentences with the facts the
  person needs to decide (the amount, the date, what is kept), then the actions. Two actions sit on one line: the way
  out on the left, the action on the right, red when it destroys something.
- **More than two answers** is a sign the question needs rethinking; where it is truly needed (`choiceDialog`: the
  backup folder that already holds a backup, a backup that can't be read, restoring a file, Delete all data, Delete
  an entry), the answers are stacked full width and each says its consequence by its colour: green keeps data, red
  loses it, tonal is a side road, outlined is the way out. The same stack is used for a two-answer question that sits
  beside those (deleting a loan's entry offers only Delete and Cancel). Where an answer is the last step before data
  is lost (restoring over the current data, Delete all data), it asks again in a second step, where Cancel and
  Android's Back both close the whole dialog. Deleting an entry does not: its red answers act at once and the
  snackbar's Undo is the way back.
- **Pickers** (date, time, period, currency, emblem) share one look: a tabbed or gridded body and "Today" / "Cancel" at
  the foot; picking a value is the confirmation where that's unambiguous (date, month, year), "OK" only on a wheel.

## 9. Empty and error states

- **An empty state is one short line and the one action that fills it, in the middle of the window** within the
  thumb's reach: "Nothing matches these filters" + Clear all; "Start your notebook" + Choose your currency + Add first
  account.
- **A near miss gets a button, never an automatic change:** "Nothing matches “cofee”" then "Search “coffee” · 19
  entries".
- **Errors say what happened and what to do, in Tally's language**: the shell sends a code (`BackupReceiver.E_*`),
  the page says it (`nativeErr()`).
- **Warnings before harm, not after:** overdraw ("Not enough in Cash · Cash has $111.10. This would make it
  −$388.90."), a negative opening balance on a non-card account, archiving an account that still holds money.
- **Saved data that can't be read is kept and offered as a file**, never dropped.
- **Nothing to set up yet, nothing to show:** an empty notebook's History has no period chip or Filters until its
  first entry (Search stays in the bar), and the welcome screen's bar holds only Settings.

## 10. Motion and haptics

- **No page animations, ripples or scaling.** Sheets and dialogs slide or fade in briefly; with "reduce motion" they
  appear at once.
- **A changed row flashes softly once** so the eye finds it.
- **Haptics on every tap**, with an on/off switch and a five-step strength slider. Played as media vibration (a click
  primitive where the phone has one); never `performHapticFeedback` or predefined effects, which some phones make
  much stronger.
- **Drag feedback** is a faded placeholder where the item was, the lifted copy at its own size, and one tick per change
  of place.

## 11. Accessibility

- **Every control has a name TalkBack can read**, in whole sentences from the catalogue ("Choose a period: June 2026",
  "Remove filter: Cash").
- **48 dp targets**, labelled; nothing smaller than 10 px text (9 px only for a full ring's names).
- **WCAG AA contrast** in light and dark; account tints are checked against every palette colour.
- **Nothing by colour alone** (principle 6).
- **Follows the phone's text size**, up to `TEXT_MAX`; layouts are checked at normal and large text on every size
  (`tests/e2e/22-layout.js`), which fails on any word cut or set smaller.
- **Free rotation** (WCAG 1.3.4): no orientation lock; the page re-renders on resize.
- **Live counts are announced** through a visually hidden status region (History's entry count after a filter
  change, search results once typing pauses).
- **Focus management** for every layer (`layerFocus()`).

## 12. Language and wording

- **Short, plain, everyday words.** "Paid to", "Received from", "Doesn't match?", "Left after". No accounting jargon
  where a plain word exists.
- **Whole sentences in the catalogue** with `{{values}}` and plural keys, so they survive translation; never words
  glued together in English order.
- **One name per thing, everywhere.** The same concept keeps the same word on Home, in forms, in History, in
  notifications and in Settings, and in every language's glossary: "Account" (never "Paid from" or "Into" on one
  form and "Account" on another), "Received" for money in (Spent | Received, Received categories), "Due" for a payback
  day, "Borrow money" and "Lend money". Helper texts are one short sentence, and every note field reads the same.
- **Write what will happen, not how it works.** "Archived accounts are left out of your totals; their entries stay in
  History."
- **Stored data stays as written.** A built-in category keeps its English name in the data; `catName()` translates it
  on screen. A renamed category keeps its id.
- **Dates and times the phone's way**, week start and clock from Settings; a date shown as the date itself
  ("Added Jun 16 at 9:03 AM"), not "Yesterday", where precision matters.
- **No exclamation marks, no blame, no cheerfulness.** "That balance isn't a number", not "Oops!".

## 13. What Tally deliberately does NOT do

- **No budgets** (until 1.5.0's planned budgeting/planning work), **no statement import**, no bank connections.
- **No network, analytics, ads, accounts or sign-up**, ever. No remote content.
- **No charts to study.** Summary shows bars (or, in its Months tab, a pie) and a category list with one comparison;
  nothing more.
- **Transfers, loan movements, fees and balance fixes never count as spending or income.**
- **No automatic categorising**, no guessed payees filed under a category, no silent rounding of balances.
- **No swipes that change data or hidden gestures for core actions** (History has no sideways swipe at all).
- **No truncation of words**, no shrinking of labels, no tooltips to reveal cut text.
- **No automatic chains of permission prompts**; each Allow opens exactly one Android prompt.
- **No notifications with names or amounts on the lock screen**; nothing sensitive in logs.
- **No ripples, bouncy motion, confetti or streaks.** Tally is not trying to make money fun, only clear.
- **No features that add a step to writing down an expense.**
