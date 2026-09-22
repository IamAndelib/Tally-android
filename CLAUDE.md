# Tally — project context

Personal expense tracker Android app for a student in Saskatoon (also has Bangladesh accounts, e.g. bKash).
Built originally in a claude.ai chat; continue development from here.

## Goals
- Track expenses/income across multiple accounts (bank, mobile wallet, cash, credit card, savings), each with its own currency (CAD, BDT, ...).
- Transfers between own accounts ("Moved") change both balances but never count as spending; optional different received amount for cross-currency moves.
- Import bank statements: CSV (parsed on-device) and PDF (sent to Claude API with the user's own key).
- Monthly spending by category on the Home screen.
- Keep the UI small, simple and fast to use (user has mild ADHD; avoid clutter and long text).

## Architecture
- Native shell: `app/src/main/java/app/tally/expenses/MainActivity.java` — a WebView loading
  `app/src/main/assets/index.html` via WebViewAssetLoader (https://appassets.androidplatform.net/assets/index.html).
  - `onShowFileChooser` opens the system file picker (statement upload, backup restore).
  - JS bridge `window.Android.saveFile(name, mime, text)` saves CSV exports / JSON backups via ACTION_CREATE_DOCUMENT;
    result reported back through `window.tallySaved(ok)`.
  - Back button calls `window.tallyBack()` (closes sheet / returns to Home) before exiting.
- All app logic is one self-contained file: `app/src/main/assets/index.html` (vanilla JS, no framework, no build step).
  - State `S = {settings, accounts, cats, rules, txns}` stored in localStorage key `tally:v1`.
  - Claude API key stored separately in localStorage `tally:apikey` (never included in backups).
  - Transactions: `{id, ts, date:'YYYY-MM-DD', type:'expense'|'income'|'transfer', amount, account, to?, toAmount?, cat?, note, src?}`.
  - Category `transfer` ("Own transfers") is excluded from spent/received totals.
  - CSV import: `parseCSV` → `detect` (auto-matches date/description/in/out/amount columns, date order) → user confirms mapping → review list with per-row category → add. Duplicates (same account+date+amount+description) are unticked.
  - Learned sorting: changing a category in review saves `S.rules[ruleKey(desc)]`; `guessCat` checks rules, then TRANSFER_RX, then KEYWORDS.
  - PDF import: whole PDF base64 → Messages API (`claude-sonnet-5`, document block) → JSON transactions. "Let Claude sort" uses `claude-haiku-4-5-20251001`. Direct browser call uses header `anthropic-dangerous-direct-browser-access: true`.
- Build: `gradle assembleDebug` (AGP 8.5.2, Gradle 8.7, JDK 17, compileSdk 34, minSdk 24). GitHub Actions workflow in `.github/workflows/build-apk.yml` uploads the debug APK as an artifact.

## Notes
- The project has not been test-built yet; first build may need small fixes.
- No Gradle wrapper jar is committed; Android Studio or `gradle` 8.7 works. Run `gradle wrapper` to add one if needed.
- UI: light/dark tokens on :root, font Onest (falls back to system font offline), account cards are the main visual element.
