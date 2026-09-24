# Tally — project context

Personal expense tracker Android app for a student in Saskatoon (also has Bangladesh accounts, e.g. bKash).
Built originally in a claude.ai chat; continue development from here.

## Goals
- Work like a pocket notebook: each morning the balances of every money source sit at the top of the page, spending is
  written down through the day by category and source, and the balances roll over live to the next day.
- Home screen = one tap per expense: all spending categories (up to 24) laid out around a donut of the current day's spending
  (Monefy-style interaction, but Tally's own Material 3 look). Tap a category → amount → Save.
- Multiple accounts (bank, mobile wallet e.g. bKash, cash, credit card, savings), each with its own currency (CAD, BDT, ...).
- Reliable transfers ("Transfer") between own accounts: never count as spending; cross-currency moves require the received amount;
  optional fee (ATM, cash-out charge) saved as a linked spending entry.
- Easy correction when the app doesn't match reality: "Set actual balance" records a balance fix.
- Loans (you borrowed) and lendings (you lent): due dates, partial payments, status; Assets / Liabilities tabs with net worth.
- Reminders: evening nudge when nothing was written that day; due-day reminders with Record payment / +1 day / +1 week.
- Keep the UI small, simple and fast (user has mild ADHD; avoid clutter and long text). No budgeting, no statement import (removed on purpose; may return later).

## Architecture
- Native shell: `app/src/main/java/app/tally/expenses/MainActivity.java` — a WebView loading
  `app/src/main/assets/index.html` via WebViewAssetLoader (https://appassets.androidplatform.net/assets/index.html).
  - `onShowFileChooser` opens the system file picker (backup restore).
  - JS bridge `window.Android`:
    - `saveFile(name, mime, text)` saves CSV exports / JSON backups via ACTION_CREATE_DOCUMENT; result reported through `window.tallySaved(ok)`.
    - `getColors()` returns `{dark, a1,a2,a3,n1,n2}`: light/dark mode plus, on Android 12+, the Material You tonal palettes
      (13 hex tones each, tone 100 → 0). `onResume`/`onConfigurationChanged` push the same JSON to `window.tallyTheme(...)`.
    - `setBars(color, dark)` colours the status/navigation bars to match the page surface.
    - `setReminders(json)` / `takeActions()` / `requestNotifications()`: see `ReminderReceiver.java` (AlarmManager
      `setAndAllowWhileIdle`, channel "Reminders"; `BootReceiver` re-arms after reboot/update). Notification buttons
      queue `{type:"extend",id,days}` for the page; "Record payment" opens the app with extra `open=loan:<id>:pay`
      → `window.tallyOpen(...)`. `onResume` calls `window.tallyResume()` (applies queued actions, re-syncs).
  - Back button calls `window.tallyBack()` (closes menu / sheet / returns to Home) before exiting.
- All app logic is one self-contained file: `app/src/main/assets/index.html` (vanilla JS, no framework, no build step).
  The only other asset is `icons.js` (see Emblems).
  - State `S = {v:4, settings:{cur, theme, lastAcc, lastAccIn, lastCheck, remind:{daily,time,dues}, notifAsked}, accounts, cats, txns, loans, assets}`
    in localStorage key `tally:v1`.
    `migrate()` upgrades any saved state or backup (v1 included) on load/restore without changing balances
    (v4: emblems; built-in categories still on their old default emoji/colour get the new emblem/colour, user choices are kept).
  - Account: `{id, name, type, currency, opening, archived, i?, e?, c?}` (emblem only stored when customised; else type default). Accounts with entries are archived, never deleted (deleting would change other accounts' balances through transfers).
  - Category: `{id, name, i, e, c, kind:'out'|'in', hidden?}` (`i` emblem name, `e` emoji fallback, `c` colour). All visible `out` categories (max 24) form the home ring, in reading order.
  - Transaction: `{id, ts, date:'YYYY-MM-DD', type, amount, account, note, ...}` where type is
    - `expense` / `income` (+ `cat`; a transfer fee also has `feeOf`),
    - `transfer` (+ `to`, `toAmount` when currencies differ, `feeId` of the linked fee expense),
    - `adjust` — balance fix; signed `amount`; changes the balance but never counts as spent/received.
    - `loan` — `{dir:'in'|'out', loan:id, principal?}`: money moving for a loan/lending; changes the balance, never spent/received.
  - Loan: `{id, kind:'borrow'|'lend', person, amount, account, date, due, note, status:'open'|'writeoff'}`. Paid/left/status
    are derived in `loanInfo()` (Active, Partly paid, Overdue, Cleared, Written off/Forgiven). `extendLoan()` moves the due
    date from the later of the old due date and today (the notification's +1 day uses the same rule).
    Loan rows and the loan detail show the account the money came from (lend) or went into (borrow).
  - Other assets: `S.assets = [{id, name, i, e, c, value, currency}]` (value only, no entries).
  - Tabs (bottom nav): Home, Assets (net worth, accounts, owed to you, other assets), Liabilities (loans, credit cards).
    History and Settings are in the ⋮ menu.
  - `balances(before?)` = opening + all entries (optionally only entries dated before a day → "started today with").
  - Home: period (`V.period` day/range/month, default Today; ‹ › and swipe on the ring; tapping the label opens the
    Day | Range | Month dialog: calendar, calendar where you drag or tap start→end (`V.rs`/`V.re`), month grid),
    account balance strip, once-a-day morning check card (`settings.lastCheck`), category ring, balance bar (opens the
    period's entries), − / Transfer / + buttons. New entries default to the day being viewed.
  - Ring: `ringLayout(n, W)` spaces n tiles evenly on a circle around the donut, clockwise from just left of 12 o'clock;
    tiles shrink as n grows, so it stays round and there is never a gap.
    `ringHTML(cats, {mode})` draws tiles, donut and leader lines for Home and the Settings preview. Donut slices are ordered
    by their category's position (clockwise); the donut is rotated to the angle where slices sit nearest their categories
    with zero line crossings (crossings are heavily penalised). Lines are computed from the layout (no DOM measuring).
  - Emblems (Bluecoins-style): `icons.js` = `window.TALLY_ICONS {name: [svgPath, tags]}`, a curated subset (~220) of Google
    Material Symbols Rounded filled (Apache-2.0), generated by `tools/gen_icons.py`. `emblem(o, cls)` draws a filled circle in `o.c`
    with glyph `o.i` (white or near-black, whichever contrasts more) or the emoji `o.e` as fallback. `iconPicker()` (sheet2, search
    matches word starts of name + tags, "Use an emoji instead"), `emblemEditor()` = preview + `PALETTE` swatches in the category /
    account / asset forms. `PALETTE`'s first 12 are the default category colours, chosen so ring neighbours stay distinct under
    colour-blindness simulation (OKLab ΔE ≥ 8, normal vision ≥ 15) on the light and dark surfaces; re-check if you reorder them.
  - Dates/times never use native pickers: `dateField()` renders a field button (`data-v` = YYYY-MM-DD, optional min/max/opt),
    `datePicker()` opens a Material dialog in `#pop` built on `calGrid()` (shared with the period dialog); `timePicker()` for the nudge time.
  - Sheets are built once and then patched in place (`setPressed`, `trSync`), never re-rendered while open.
    `#sheet2` is a second layer for pickers opened from a sheet (currency picker: search, in use / popular / all ISO currencies).
  - History: hold an entry (or the select icon) for multi-select delete; `deleteEntries()` keeps transfer fees consistent.
  - Settings: spending categories are shown as the exact home ring (grey donut placeholder); tap to edit (emblem, colour),
    hold-and-drag to move between slots (touch + mouse, `pressStart/Move/End`, `RE` holds the preview layout/order).
    Money-in categories use a plain grid. Built-in or used categories are hidden, not deleted.
  - Every add/edit/delete of entries goes through `withUndo()` (snapshot of `S.txns` + `S.loans`, Undo in the snackbar).
    `commit()` also calls `syncReminders()`.
  - Theme: Material 3 role tokens (`--primary`, `--surface-container`, ...) on `:root` with a baseline scheme from the indigo seed
    `#2F45C9`; `applyTheme()` overrides them in `<style id="dyn">` from the phone's dynamic palette. Spent/received colours are fixed semantic tokens.
- Build: `gradle assembleDebug` (AGP 8.5.2, Gradle 8.7, JDK 17, compileSdk 34, minSdk 24). Debug builds are signed with the
  committed `app/debug.keystore` (android/androiddebugkey/android) and `versionCode` = `GITHUB_RUN_NUMBER`, so every CI APK
  installs as an update over the previous one. Never replace the keystore: installed copies would stop accepting updates. GitHub Actions workflow in `.github/workflows/build-apk.yml` uploads the debug APK as an artifact
  and also force-pushes it to the `builds` branch as `Tally-<branch>.apk` (one commit, replaced each build).
- Play Store later: needs a release build signed with a private upload key (kept out of the repo) and Play App Signing.
- The user tests on their phone: after every push, wait for the build, then fetch the APK
  (`git fetch origin builds && git show origin/builds:Tally-<branch>.apk > file.apk`) and send it to them.

## Notes
- The project has not been test-built yet; first build may need small fixes.
- No Gradle wrapper jar is committed; Android Studio or `gradle` 8.7 works. Run `gradle wrapper` to add one if needed.
- UI: Material 3 (adaptive colour on Android 12+), font Onest (falls back to system font offline).
- Quick check in a browser: serve `app/src/main/assets/` with `python3 -m http.server` (no Android bridge there: baseline colours, no file saving).
