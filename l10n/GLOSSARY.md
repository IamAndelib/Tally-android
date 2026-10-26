# Translating Tally

Tally is a pocket notebook for money: balances at the top, one tap per expense. Its words are short, calm and
plain, the way a friend would say them. This page is for anyone translating it; each language's own choices for
the terms below are in `glossary/<code>.md`.

## Where the texts are

- `web/en.json`: the app's screens (i18next JSON). `web/<code>.json` holds each translation, with the same keys.
- `../app/src/main/res/values/strings.xml`: notifications, the home-screen widget and quick add (Android's own
  format). `values-<code>/strings.xml` holds each translation.
- `../fastlane/metadata/android/<locale>/`: the store listing (title, short and full description, changelogs).

Never edit `app/src/main/assets/js/i18n/*.js`: `tools/gen_i18n.py` makes them from `web/*.json`.

## Rules

- Keep every `{{value}}` exactly as it is (its name tells what goes there: `{{amount}}` a sum of money with its
  currency, `{{who}}` a person's name, `{{date}}` a short date, `{{count}}` a number). Move it wherever your
  language puts it.
- Plurals: a key ending in `_one`, `_other` (and `_few`, `_many`, `_two`, `_zero`) is one text in several forms;
  give every form your language uses (the Unicode CLDR plural rules decide which).
- No HTML, no markup. Quotes and apostrophes as your language writes them (’ “ ” « » „ “).
- Android strings: `%1$s`, `%2$s` are values; an apostrophe is written `\'`, a double quote `\"`, `&` as `&amp;`.
- Room is short: buttons and labels sit on 360-pixel-wide phones, often at large text sizes. Prefer the shorter of
  two good words. A label that's too long is cut or shrunk.
- Tone: friendly and direct, never formal or technical. Address the user the way a well-made everyday app does in
  your language (see your `glossary/<code>.md`).
- Built-in category names (`cat.*`) and account types (`type.*`) are short nouns shown under small icons.

## Terms

| English | Meaning in Tally |
|---|---|
| entry | one thing written down: a spending, money received, a transfer, a loan or a payment |
| account | a place money lives: a bank account, a mobile wallet, cash, a credit card, savings |
| balance | what an account holds now |
| balance fix | a correction so Tally matches what an account really holds; never spending or income |
| spending / spent | money that went out on something (an expense) |
| money in / received / income | money that came in |
| transfer | money moved between two of your own accounts; never spending |
| fee | a charge on a transfer or a loan payment; never counted as spending |
| loan / borrowed | money **you** borrowed from someone: you owe it |
| lending / lent | money **you** lent to someone: they owe you |
| payment / paid back / got back | money returned on a loan (you paid back) or a lending (you got back) |
| payback day / return by | the day a lending should come back / a loan should be repaid |
| due | the day a loan or lending should be paid |
| written off / forgiven | a lending you gave up on / a loan the lender let go |
| cleared | fully paid back |
| asset | something you own that isn't an account (gold, a laptop) |
| liabilities | what you owe: loans and credit cards |
| net worth | what you have and are owed, minus what you owe |
| category | what spending was for (Groceries, Rent, …) |
| archive / archived | an account put away: hidden from the totals, its entries kept |
| backup / auto backup / restore | a file copy of everything / the daily one in a folder / bringing a copy back |
| evening nudge | the evening reminder when nothing was written that day |
| balance check | the morning question "do your balances still match?" |
| notebook | everything in Tally, as a whole |

**Loan direction matters most**: "You owe Sam $20" and "Sam owes you $20" must never be swapped. Check every loan
and lending text twice.
