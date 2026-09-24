# Tally — project context

Personal expense tracker Android app for a student in Saskatoon (also has Bangladesh accounts, e.g. bKash).
Built originally in a claude.ai chat; continue development from here.

## Goals
- Work like a pocket notebook: each morning the balances of every money source sit at the top of the page, spending is
  written down through the day by category and source, and the balances roll over live to the next day.
- Home screen = one tap per expense: a ring of 12 spending categories around a donut of the current day's spending
  (Monefy-style interaction, but Tally's own Material 3 look). Tap a category → amount → Save.
- Multiple accounts (bank, mobile wallet e.g. bKash, cash, credit card, savings), each with its own currency (CAD, BDT, ...).
- Reliable transfers ("Move") between own accounts: never count as spending; cross-currency moves require the received amount;
  optional fee (ATM, cash-out charge) saved as a linked spending entry.
- Easy correction when the app doesn't match reality: "Set actual balance" records a balance fix.
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
  - Back button calls `window.tallyBack()` (closes menu / sheet / returns to Home) before exiting.
- All app logic is one self-contained file: `app/src/main/assets/index.html` (vanilla JS, no framework, no build step, no vendored libs).
  - State `S = {v:2, settings:{cur, theme, lastAcc, lastAccIn, lastCheck}, accounts, cats, txns}` in localStorage key `tally:v1`.
    `migrate()` upgrades any saved state or backup (v1 included) on load/restore without changing balances.
  - Account: `{id, name, type, currency, opening, archived}`. Accounts with entries are archived, never deleted (deleting would change other accounts' balances through transfers).
  - Category: `{id, name, e, c, kind:'out'|'in', hidden?}`. The first 12 visible `out` categories form the home ring.
  - Transaction: `{id, ts, date:'YYYY-MM-DD', type, amount, account, note, ...}` where type is
    - `expense` / `income` (+ `cat`; a transfer fee also has `feeOf`),
    - `transfer` (+ `to`, `toAmount` when currencies differ, `feeId` of the linked fee expense),
    - `adjust` — balance fix; signed `amount`; changes the balance but never counts as spent/received.
  - `balances(before?)` = opening + all entries (optionally only entries dated before a day → "started today with").
  - Home: period (day/week/month, default Today; ‹ › and swipe on the ring), account balance strip, once-a-day
    morning check card (`settings.lastCheck`), donut + category ring, balance bar (opens the period's entries), − / Move / + buttons.
    New entries default to the day being viewed.
  - Every add/edit/delete of entries goes through `withUndo()` (snapshot of `S.txns`, Undo in the snackbar).
  - Theme: Material 3 role tokens (`--primary`, `--surface-container`, ...) on `:root` with a baseline scheme from the indigo seed
    `#2F45C9`; `applyTheme()` overrides them in `<style id="dyn">` from the phone's dynamic palette. Spent/received colours are fixed semantic tokens.
- Build: `gradle assembleDebug` (AGP 8.5.2, Gradle 8.7, JDK 17, compileSdk 34, minSdk 24). GitHub Actions workflow in `.github/workflows/build-apk.yml` uploads the debug APK as an artifact.

## Notes
- The project has not been test-built yet; first build may need small fixes.
- No Gradle wrapper jar is committed; Android Studio or `gradle` 8.7 works. Run `gradle wrapper` to add one if needed.
- UI: Material 3 (adaptive colour on Android 12+), font Onest (falls back to system font offline).
- Quick check in a browser: serve `app/src/main/assets/` with `python3 -m http.server` (no Android bridge there: baseline colours, no file saving).
