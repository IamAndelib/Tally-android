# Contributing to Tally

Thanks for helping! Bug reports, ideas and pull requests are all welcome. Tally is deliberately small and calm, so
please read *Design principles* before proposing a new feature.

## Getting set up

- **App interface** (almost every change): edit files in `app/src/main/assets` and reload a browser tab —
  `cd app/src/main/assets && python3 -m http.server 8000`. No build step.
- **Tests and checks:** `cd tests && npm ci && npx playwright install chromium`, then `npm test` and `npm run lint`
  (`npm run format` applies Prettier). If you already have Chromium, point `CHROMIUM_PATH` at it instead of installing.
- **Android app:** JDK 17+ (CI and releases use 21) + Android SDK 35, then `./gradlew assembleDebug`, or open the project
  in Android Studio.

## How the app is put together

Tally is a native Android shell around a web page.

- **`MainActivity.java`** hosts a WebView that loads `assets/index.html` from
  `https://appassets.androidplatform.net/assets/` (`WebViewAssetLoader`) and exposes a small bridge, `window.Android`:
  `ready` (ends the launch screen), `haptic`, `saveFile`, `getColors` (Material You palette), `setBars`,
  `setReminders` / `takeActions` / `requestNotifications`, `setWidget`, `getVersion`, `getLocale` / `appLanguage`
  (`Lang.java`: the texts' language and the number format), `is24h`, `fontScale`, `reminderHealth` /
  `openSetting` / `permsIntro` (permissions), `keepState` / `keptState` (the shell's own copy of every save,
  `SavedCopy.java`), the auto backup's `setBackup` / `setBackupData` / `pickBackupFolder` / `backupStatus` /
  `backupNow`, and Restore's `readAutoBackup` / `pickRestoreFile`. In the other direction it calls the page's hooks
  `window.tallyBack`, `tallyOpen`, `tallyResume`, `tallyPause`, `tallyTheme`, `tallySaved`, `tallyFolder`,
  `tallyRestore`, `tallyBackedUp`, `tallyAutoBackup` and `tallyPerms`, which `js/main.js` installs last; answers that
  arrive before the page is up wait in a queue (`callPage`), and background threads answer through the activity on
  screen (`deliver`).
- **`ReminderReceiver` / `BootReceiver`** schedule and show notifications from the reminder settings the page sends;
  **`BackupReceiver`** writes the daily backup file from the copy of the data the page mirrors to it;
  **`TallyWidget` / `QuickAddActivity` / `OpenActivity`** are the home-screen widget. The page is always the source of truth: it sends
  ready-formatted numbers to the widget and a list of due dates to the reminders.
- **The page** is plain HTML/CSS/JS. `index.html` loads `css/colors.css`, then an empty `<style id="dyn">` that
  `js/theme.js` fills with the wallpaper palette, then `css/app.css`, then the scripts in order. The scripts are
  classic scripts that share one global scope (no modules, no bundler): a file may use anything defined in any file,
  but code that *runs while loading* may only use what earlier files defined. Start-up code lives in `js/main.js`, last.

| File | What's in it |
| --- | --- |
| `js/i18n.js` | the language (`LOC`) and the text lookup: `T()` plain text, `TH()` HTML; texts in `js/i18n/<code>.js` |
| `js/core.js` | built-in categories and account types, inline icons, DOM/date/number helpers, money formatting, snackbar |
| `js/currencies.js` | every currency's English name and the countries using each (Unicode CLDR), for the currency picker |
| `js/state.js` | the data `S`, `migrate()`, load/save, balances, `withUndo()`, `guardOverdraw()`, `deleteEntries()` |
| `js/theme.js` | Material 3 colour roles from the phone's palette |
| `js/period.js` | what Home (`V`) and History (`HP`) show: day / range / month and the period dialog |
| `js/layers.js` | bottom sheets, dialogs (`askDialog`), date/time and currency pickers |
| `js/emblems.js` | emblems, colours, account types, the icon picker |
| `js/calculator.js` | the calculator under amount fields |
| `js/ring.js` | the category ring and donut on Home (and its Settings preview) |
| `js/loans.js` | loans and lendings |
| `js/sheets.js` | entry, transfer, balance-fix, account, category and asset sheets |
| `js/summary.js` | the spending summary |
| `js/screens.js` | `render()` and the Home, Assets, Liabilities, History and Settings screens |
| `js/bridge.js` | talking to the Android shell; `goBack()` |
| `js/backup.js` | CSV export, backup, restore, delete all |
| `js/gestures.js` | touch and mouse: press states, swipes, long-press, drag and drop |
| `js/events.js` | the click dispatcher and other event wiring |

### The data

All data is one object, `S`, saved as JSON in `localStorage` under `tally:v1`:
`{v, settings, accounts, types, cats, txns, loans, assets}`. Each save is numbered (`tally:v1:seq`) and also kept by
the Android shell (`SavedCopy.java`); start-up loads whichever copy is newer (see `save()` in `js/state.js`).

- An **entry** (`txns`) is `{id, ts, date: "YYYY-MM-DD", type, amount, account, note}` where `type` is `expense` /
  `income` (with `cat`), `transfer` (with `to`, and `toAmount` across currencies), `adjust` (a balance fix, signed) or
  `loan` (money moving for a loan: `dir`, `loan`, and `principal` + optional `due` for a draw). `ts` is when it was
  written (`Date.now()`, so not an amount: `migrate()` reads it with `stamp()`) and orders a day's entries, newest
  first. A transfer's or loan payment's fee is an `expense` linked both ways (`feeOf` on the fee, `feeId` on the
  transfer or payment) that is never counted as spending (`isSpend()`).
- A **loan** is a person tab, `{id, kind: "borrow" | "lend", person, account, date, note, status}`. Its amounts, what's
  left and its status are always derived from its entries by `loanInfo()`, never stored.
- Balances are never stored either: `balances()` adds every entry to each account's opening balance.
- A built-in category keeps its English default `name` until the user renames it; `catName()` shows such a name in
  Tally's language. Stored text is never translated.
- **Changing the shape of the data** means bumping `v` in `blank()` and teaching `migrate()` to upgrade older saves
  *and* older backup files without changing any balance. Add a test that loads the old shape.

### Conventions

- **Every change to entries goes through `withUndo(message, change, feedback)`**, which saves, re-renders and offers
  Undo. A save that takes money out of an account first goes through `guardOverdraw()`.
- **Clicks:** give the element `data-act="name"` (and `data-v` for a value) and add a `case` to the dispatcher in
  `js/events.js` that calls a named function. Keep logic out of the dispatcher.
- **Rendering:** screens are rebuilt by `render()`; an open sheet is built once and then patched in place
  (`setPressed`, `trSync`, …), never re-rendered while it's open. Always escape user text with `esc()`.
- **Confirmations** use `askDialog()`, never `confirm()`. Dates use `dateField()` / `datePicker()`, never native pickers.
- The calculator's minus key is the Unicode minus `−` (U+2212); any regex over keys or expressions must include it.
- No inline scripts or `on…=` attributes: the page's Content-Security-Policy blocks them.
- Formatting is Prettier's (`npm run format`); `npm run lint` must pass (it also refuses CSS selectors newer than
  WebView 87, such as `:is()`, which would drop the whole rule there).
- Java: keep the bridge small; anything the page can compute, it computes.
- **Every text a person sees goes through the catalogue** (see Translations): `T("area.key", {values})` for plain
  text (`snack()`, `askDialog()`, `textContent`), `TH()` inside HTML. A whole sentence is one key with `{{values}}`,
  never words joined in English order; counts use plural keys (`_one`, `_other`). Numbers, dates and names use
  `LOC.fmt` (lint refuses the web view's default locale). The shell sends codes and data; it writes its own sentences
  only for notifications and the widget, from `res/values*/strings.xml`.

## Translations

Tally follows the phone's language (or, on Android 13+, the one picked for Tally in Android's settings). The texts
live in `l10n/`: `web/<code>.json` for the page (i18next JSON, English in `en.json`) and the Android string files
`app/src/main/res/values*/strings.xml` for notifications and the widget; `l10n/GLOSSARY.md` and `l10n/glossary/`
guide translators. `tools/gen_i18n.py` turns the JSON into `app/src/main/assets/js/i18n/<code>.js` (never edit those).

Two locales are kept apart (`Lang.java`, `LOC` in `js/i18n.js`): `ui`, the language Android picked for Tally's texts
(each `values-xx` folder names it in `lang.xml`), and `fmt`, the phone's own locale for numbers and dates, so a phone
in a language Tally isn't translated into still writes numbers its own way.

**Adding a language:** `l10n/web/<code>.json` and `values-xx/strings.xml` with every text, `values-xx/lang.xml`, its
script tag in `index.html`, `res/xml/locales_config.xml`, `resourceConfigurations` in `app/build.gradle` and a store
listing in `fastlane/metadata/android/`; run `python3 tools/gen_i18n.py`. `tests/e2e/32-i18n-static.js` checks that
all of these agree, that every text has the same `{{values}}` and plural forms, and that every key the code asks for
exists. Translations marked as drafts in `l10n/glossary/<code>.md` await a native speaker's review.

## Design principles

Tally is for people who want to write things down quickly and move on:

- **One tap per expense.** Don't add steps to the common path.
- **Small and quiet.** Short labels, no clutter, no walls of text. No budgets or statement import (both left out on
  purpose).
- **Feedback is instant and calm:** a light pressed layer, a soft flash on the changed row, the snackbar with Undo, a
  short vibration. No ripples, scaling or page animations.
- **Nothing leaves the phone.** No network requests, analytics or accounts.
- **Material 3**, following the phone's own colours, in light and dark.

## Tests

`tests/e2e/NN-name.js` are plain Node scripts that drive the page in headless Chromium with a stubbed `window.Android`
and print `PASS` / `FAIL` lines; `npm test` runs them all against a throwaway local server (`npm test -- 15` runs only
suites starting with 15). They run on a fixed date, 2026-06-17, so results don't depend on the day
(`TALLY_TODAY=YYYY-MM-DD npm test` runs them on another; some suites assume a day in the middle of a month). Screenshots go to
`tests/e2e/output/`. Add or extend a suite for every fix and feature.

## Pull requests

1. Branch from `main`, keep the change focused, and describe *why* in the PR.
2. `npm run lint` and `npm test` pass (CI runs both, plus the Android build).
3. For UI changes, include before/after screenshots at phone width (360–430 px), light and dark.
4. User-facing changes get a line under *Unreleased* in `CHANGELOG.md`.

Never commit a signing key. CI signs test builds with the key in the `DEBUG_KEYSTORE_BASE64` secret; never replace it
(installed test builds would stop accepting updates).

## Reporting bugs

Open an issue with what you did, what you expected and what happened, your Android version and the app version
(Settings → About). Please don't attach a backup file with real data. For anything security-related, see
[SECURITY.md](SECURITY.md).
