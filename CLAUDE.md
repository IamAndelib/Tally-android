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
    - `getVersion()` returns `BuildConfig.VERSION_NAME` (`buildFeatures.buildConfig true` in `app/build.gradle`, needed for AGP 8+
      to generate `BuildConfig`), shown in Settings' About footer; called defensively (`window.Android&&Android.getVersion`,
      wrapped in try/catch) so the browser-preview case and older installed builds degrade to no version line, not "undefined".
    - `getColors()` returns `{dark, a1,a2,a3,n1,n2}`: light/dark mode plus, on Android 12+, the Material You tonal palettes
      (13 hex tones each, tone 100 → 0). `onResume`/`onConfigurationChanged` push the same JSON to `window.tallyTheme(...)`.
    - `setBars(color, dark)` colours the status/navigation bars to match the page surface.
    - `setReminders(json)` / `takeActions()` / `requestNotifications()`: see `ReminderReceiver.java` (AlarmManager
      `setAndAllowWhileIdle`, channel "Reminders"; `BootReceiver` re-arms after reboot/update). Notification buttons
      queue `{type:"extend",id,days}` for the page; "Record payment" opens the app with extra `open=loan:<id>:pay`
      → `window.tallyOpen(...)`. `onResume` calls `window.tallyResume()` (applies queued actions, re-syncs).
  - Back button calls `window.tallyBack()` (closes dialog / sheet / returns to Home) before exiting.
  - The page installs its hooks last, in `js/main.js`, so the shell can never call into a half-loaded page:
    `tallyBack`→`goBack()`, `tallyOpen`→`openFromNative()`, `tallyResume`→`onAppResume()`, `tallyTheme`→`onSystemTheme()`,
    `tallySaved`→`onFileSaved()`. Escape in a desktop browser calls `goBack()` too.
  - Home-screen widget `TallyWidget` (AppWidgetProvider, `res/layout/widget_tally.xml`, `res/xml/tally_widget_info.xml`, 4×1,
    Material You colours via `values-v31` system colours): today's total balance + "Spent today", body opens the app, + opens
    `QuickAddActivity` (small dialog: Spent / Received / Transfer → MainActivity with `open=add:out|add:in|add:tr`).
    The page is the source of truth: `syncWidget()` (from `commit()`, start, resume) sends formatted numbers through
    `Android.setWidget(json)`; the widget zeroes "Spent today" when the stored date isn't today (midnight alarm + 30-min updates).
- The app is a web page in `app/src/main/assets` (vanilla JS, no framework, no build step):
  - `index.html` is only the shell: CSP meta, `css/colors.css` (Material 3 baseline roles), an empty `<style id="dyn">`
    (wallpaper palette, `js/theme.js`), `css/app.css`, then the scripts in order: `js/icons.js`, `core`, `state`, `theme`,
    `period`, `layers`, `emblems`, `calculator`, `ring`, `loans`, `sheets`, `summary`, `screens`, `bridge`, `backup`,
    `gestures`, `events`, `main`. Each file starts with a comment saying what lives in it.
  - They are **classic scripts sharing one global scope** (top-level `const`/`let`/functions are visible to every file).
    A function may use anything from any file at call time, but code that runs *while loading* may only use what earlier
    files defined. All start-up code is in `js/main.js` (last): `loadState()`, theme, native actions, first `render()`,
    reminders/widget sync, then the window hooks. Each file has `"use strict"`.
  - Format with Prettier (`.prettierrc.json`: width 120, `arrowParens: avoid`, `trailingComma: es5`); HTML is built by
    string concatenation (Prettier breaks `${}` in template literals badly, so concatenation stays). `tests/lint.js`
    lints the scripts concatenated in load order (no-undef, no-unused-vars, no-shadow, no-eval, …); keep it clean.
  - Content-Security-Policy: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self';
    img-src 'self'` — no inline scripts, no `on…=` attributes, no network. Onest is bundled in `fonts/` (OFL,
    latin + latin-ext + cyrillic, variable weight); never go back to Google Fonts.
  - The click dispatcher (`js/events.js`) maps `data-act` to named functions; keep logic out of it.
  - State `S = {v:6, settings:{cur, theme, lastAcc, lastAccIn, lastCheck, remind:{daily,time,dues}, notifAsked, dragTip, customCols, hiddenCols, hiddenTypes}, accounts, types, cats, txns, loans, assets}`
    in localStorage key `tally:v1`. `loadState()` runs from `js/main.js` (after every constant — `migrate()` needs
    `PALETTE`, which once caused a start-up ReferenceError that showed the welcome screen over real data). If the saved
    text can't be read, it is copied to `tally:v1:unreadable` (not duplicated on later starts) and a dialog offers it as a
    file (`unreadable`); the app never silently drops saved data. Restoring a backup `migrate()` can't read snacks.
    `migrate()` upgrades any saved state or backup (v1 included) on load/restore without changing balances
    (v4: emblems; built-in categories still on their old default emoji/colour get the new emblem/colour, user choices are kept.
    v6: loans become multi-draw — for each old loan with a `due`, that date moves onto its one existing principal transaction).
  - Account: `{id, name, type, currency, opening, archived, i?, e?, c?}` (emblem only stored when customised; else type default).
    `type` is a built-in key (`TYPES`: bank, wallet, cash, card, savings) or the id of a user type in `S.types = [{id, name, i, c}]`
    ("+ Add new" chip in the account form). Hold any type chip to remove it when no account uses it: built-ins are only
    hidden (`settings.hiddenTypes`) and come back when "+ Add new" gets the same name; `visTypes()` / `firstType()`. Always go through
    `typeName/typeIcon/typeCol(k)`. Only the built-in `card` counts as a liability. Accounts with entries are archived, never deleted (deleting would change other accounts' balances through transfers).
  - Category: `{id, name, i, e, c, kind:'out'|'in', hidden?}` (`i` emblem name, `e` emoji fallback, `c` colour). All visible `out` categories (max 24) form the home ring, in reading order.
  - Transaction: `{id, ts, date:'YYYY-MM-DD', type, amount, account, note, ...}` where type is
    - `expense` / `income` (+ `cat`; a transfer fee also has `feeOf`),
    - `transfer` (+ `to`, `toAmount` when currencies differ, `feeId` of the linked fee expense),
    - `adjust` — balance fix; signed `amount`; changes the balance but never counts as spent/received.
    - `loan` — `{dir:'in'|'out', loan:id, principal?, due?}`: money moving for a loan/lending; changes the balance, never
      spent/received. A `principal:true` entry is a draw (money lent/borrowed) and may carry its own optional `due`
      (`YYYY-MM-DD`); a non-principal entry is a payment against the shared pool.
  - Loan: `{id, kind:'borrow'|'lend', person, account, date, note, status:'open'|'writeoff'}` — a **person tab**, not a
    single amount. `amount`/`due` are never stored on the Loan itself, only derived; `account` is the most recently
    drawn-on account (updated whenever a new draw merges in) and `date` is the first draw's date (kept fixed).
    `loanInfo(l)` derives everything: `draws` (principal txns, oldest→newest), `pays` (payment txns), `total`/`paid`/`left`,
    `cur` (currency of the newest draw's account), `nextDue` (earliest non-empty due among draws), `st`/`open`
    (Active, Partly paid, Overdue, Cleared, Written off/Forgiven). **Trade-off:** payments reduce the shared pool, not a
    specific draw — which draw is due when is tracked, but which draw has been paid off is not. `extendLoan(l,days)`
    (only reachable via the closed-app notification's +1 day/+1 week, native side unchanged) now bumps the due date of
    the draw nearest its due (or the newest draw), from the later of that draw's due and today.
    Loan rows and the loan detail show the account the money came from (lend) or went into (borrow); the hero line reads
    "You lent from X · date" for a single draw, or "N lendings/loans since date" once merged.
    **Suggested people + merging:** typing a name in the Loan/Lend form suggests (as chips, `personCandidates()`) people
    with an already-open loan of the same kind and currency as the picked account, most recently drawn on first; picking
    one sets `F.merge` and shows a running-total hint (`mergeHint()`) — saving then adds a new principal draw onto that
    existing loan instead of starting a new one. Changing the name clears the merge target; switching the account
    re-validates it against the new currency.
    `reopenLoan()`: a written-off one just reopens; a fully paid one drops its latest payment (user's choice), with Undo.
    Paying back more than is left → `overpay()` offers to clear it and track the extra as a new loan the other way.
    The loan sheet's history rows are compact (title + status pill only) and expand on tap (`row-exp`): date, account, due
    (principal rows), what was left after that payment; each row has **Edit** (`loandraw-edit`, opens `#sheet2` with
    amount/account/date and, for a principal, an optional due — saved via `loandraw-save`, closing the whole sheet like a
    payment save) and **Delete**, hidden on a principal row when it is the loan's only remaining draw. There are no
    +1 day/+1 week chips in the sheet any more — that action is reserved for the closed-app notification.
  - Other assets: `S.assets = [{id, name, i, e, c, value, currency}]` (value only, no entries).
  - Account sheet (`accOpen`): balance, "Doesn't match?" fix, then [Archive | History] or, when archived, [Show again | History];
    Edit account below (the edit form has Delete only for accounts without entries; no archive there).
  - Tabs (bottom nav): Home, Assets (net worth, accounts, owed to you, other assets), Liabilities (loans, credit cards).
    Hold a row and drag it between sections: source lists carry `data-src`, rows `data-drag="acc:id|loan:id"`, `ZONE_TO` maps the
    source to a target slot `.dropbox[data-zone]` (an empty dashed slot, shown only while dragging; never outline existing lists or
    rows, that reads as "merge"). Archived ↔ accounts via `setArchived()`, cleared → open via `reopenLoan()`, open → cleared via
    `clearLoan()`, which always asks how (paid in full into the loan's account today, through the overdraw guard / write off). Archived accounts' sheet has "Show again" (`acc-unarch`).
    History and Settings are two icons in every top bar (`topIcons()`; no ⋮ menu).
  - `balances(before?)` = opening + all entries (optionally only entries dated before a day → "started today with").
    How one entry moves money lives in one place, `applyEntry(b, t)`, shared with `runBal()`.
    `runBal()` (cached per render, `RBC`) = each account's balance right after each entry, plus loan-payment status; entry
    lists show it under the amount (Bluecoins-style), amounts coloured by money direction (spent red, got green, `--xfer` blue),
    and loan payments carry a "Partly paid" / "Cleared" pill.
  - Calculator (`js/calculator.js`): `amtField(id,cur,val,{curId,label,placeholder})` (quick add, transfer's main amount, loan create/payment, the draw-edit
    sheet, the account "Doesn't match?" fix) renders `.amtbox` (a positioned wrapper around the amount `<input>` plus
    a `.caretmirror` sibling span, `id="cm-<id>"`), a toggle button (`calcBtn`, the bundled `ICONS.calculate` glyph),
    and a hidden 4-column keypad (`calcPanelHtml`: `7 8 9 ÷ / 4 5 6 × / 1 2 3 − / ⌫ 0 . +`; operator keys get `.op`,
    backspace gets its own `.del` in `--spent` red — matched against the actual glyphs in `CALC_KEYS`, notably the
    Unicode minus `−` U+2212, not an ASCII hyphen, which every regex touching keys/expressions has to test for too).
    Tapping the toggle opens it (`calcOpen`: seeds `CALC={id,expr,pos}` — `pos` is the cursor offset into `expr`,
    starting at the end — from the field's current value, makes the input read-only and sets `inputmode="none"` so
    the system keyboard doesn't fight it for space, and keeps it focused — but a read-only input never shows a native
    caret even when focused, so `.amtbox` gets a `calcing` class that turns the real input's text transparent, and
    `calcMirrorSync()` renders `expr` split at `pos` around a blinking `.blink` span into `.caretmirror` on top, kept
    in sync on every `calc-key` (`calcKey()`) / `calc-pos` (`calcTapCaret()`) tap; `calcToggle()` opens/closes). Tapping inside the mirror (`calc-pos`) moves the cursor there:
    `calcPosFromPoint()` resolves the tap via `document.caretRangeFromPoint`, walking `.caretmirror`'s own child text
    nodes to turn the hit DOM position back into an offset in `expr` (`.caretmirror` must stay non-flex — plain block
    text with `line-height` centering, not `display:flex` — flex items broke `caretRangeFromPoint`'s hit-testing for
    taps past the last character, snapping them to the *other* text node instead of the end). Every key then reads
    `expr`/`pos` as `before`/`after` and inserts, deletes, or (for an operator right after another) replaces at that
    split point, not just at the end, so a mid-expression tap actually lets you edit there, same as a real keyboard;
    each key appends to `CALC.expr` and live-writes it into the input, so the field's value doubles as the display
    underneath the visible mirror. Tapping the same toggle again (`calcClose`) evaluates the buffer (`calcEval`:
    left-to-right, `×`/`÷` folded into the left operand before summing `+`/`-` terms; `null` on a malformed
    expression or ÷0, which just leaves the field as-is — no crash, no snack), restores `inputmode="decimal"`, hides
    the mirror, and dispatches a real `input` event so previews (transfer, balance fix)
    stay in sync. Round 20: the toggle is a 44px tonal button (`--primary-container`); while open it is hidden
    (`.amtwrap.calcing`) and the keypad's top bar (`.calcbar`) shows the live result (`#cr-<id>`, only once the
    expression has an operator) and a keyboard button (`calc-kbd` → `calcToKeyboard()`: `calcClose(...,true)`, then focus
    the input with the system keyboard). `.caretmirror` scrolls sideways (`overflow-x:auto`, `touch-action:pan-x`,
    hidden scrollbar, 14px end padding); `calcCaretIntoView()` keeps the caret visible after every sync, so a long
    expression slides left. A press within 28px of the caret grabs it (`LP.kind==="caret"` in `js/gestures.js` →
    `calcDragCaret()`, which also scrolls near the edges); elsewhere a swipe scrolls natively and a tap places the caret.
    `calcKeepFieldVisible()` pads the sheet's `.p` by the keypad height (reset on close) and scrolls the amount line
    above the keypad. Tests close the calculator through `calc-kbd` (their `act()` routes a hidden `calc-toggle` there).
    `goBack()` (`window.tallyBack`) checks `CALC` first, before the sheet/dialog stack: closed-app-style Android
    back (or the in-app Escape/back path) while the calculator is open closes just the calculator and applies its
    result, the same as tapping the toggle again, rather than closing the sheet underneath it. Deliberately **not** applied to transfer's
    received amount/fee (`f-toamt`/`f-fee`, plain `.field` labels, not `.amtwrap`) or asset value (`f-aval`, laid out
    beside a currency picker) — scope-trimmed to avoid layout rework.
  - Amount inputs are exactly the `input[inputmode="decimal"]` ones (amtField fields, `f-open`, `f-toamt`, `f-fee`, `f-aval`):
    they show thousands commas while typing (`formatAmountInput()` from the `input` listener, skipped while read-only in
    calculator mode; caret kept beside the same digit; the keypad's "," becomes the decimal point or is dropped), and
    `openSheet`/`openSheet2` group pre-filled values (`groupAmountInputs`, `groupDigits` in `js/core.js`, groups of three
    for every currency). Readers always parse through `evalAmt()`, which strips the commas; never `parseFloat` a field.
  - Money sources other than credit cards shouldn't go below zero: every save that moves money out goes through
    `guardOverdraw(mutate, date, proceed)` (simulates on a copy; warns if an account ends below zero now or at the end of that
    day and lower than before). The user chose warn + "Save anyway", not a hard block.
  - While a sheet or dialog is open the page is locked (`html.lock`, `overscroll-behavior:contain`), the Home ring swipe is off, and
    `#ring` / `.smchart` have `touch-action:pan-y` so horizontal swipes belong to the app.
  - Confirmations use `askDialog(title, text, okText, onOk, {danger, cancel, alt:[label, fn]})` in `#pop` (with `alt` the three
    actions stack); never the browser's `confirm()`.
  - Sheet back link: an entry opened from the entries list (`#ent-list`) sets `BACKTO`; `closeSheet()` then reopens the list
    (after any save/delete, same scroll) instead of dropping to Home.
  - Home: period (`V.period` day/range/month, default Today; ‹ › and swipe on the ring; tapping the label opens the
    Day | Range | Month dialog: calendar, calendar where you drag or tap start→end (`V.rs`/`V.re`), month grid),
    account balance strip, once-a-day morning check card (`settings.lastCheck`), category ring (tapping the donut opens `summarySheet()` in the donut's currency: Days = 7 vertical bars, Weeks = 8 horizontal
    bar rows ("3–9 Aug"; no cramped x-axis), Months = a category donut of one month (‹ › one month) with a legend list of every
    category and %; tap a bar/row for its total, comparison with the one before (daily average for an unfinished week/month),
    top categories and "Open … on Home"; swipe the chart to move the window; state `SM`, patched by `smRender()`), balance bar (opens the
    period's entries; a "↺ Today" chip above it whenever Home isn't on today), − / Transfer / + buttons, then Loan / Lend
    function buttons (own pastel tokens `--loan-*` / `--lend-*`, like `--minus-*` / `--plus-*`). New entries default to the day being viewed.
  - Ring: donut size `D = 2*(r - DONUT_GAP*u)` (0.64, checked for n = 1…24 at 360/393/430px: no tile or label overlap); the centre
    text is padded into the hole and the amount's font is fitted to its length, the hint is just "Tap a category".
    `ringLayout(n, W)` spaces n tiles evenly on a circle around the donut, clockwise from just left of 12 o'clock;
    tiles shrink as n grows, so it stays round and there is never a gap.
    `ringHTML(cats, {mode})` draws tiles, donut and leader lines for Home and the Settings preview. Donut slices are ordered
    by their category's position (clockwise); the donut is rotated to the angle where slices sit nearest their categories
    with zero line crossings (crossings are heavily penalised). Lines are computed from the layout (no DOM measuring).
  - Emblems (Bluecoins-style): `js/icons.js` = `window.TALLY_ICONS {name: [svgPath, tags]}`, a curated subset (~220) of Google
    Material Symbols Rounded filled (Apache-2.0), generated by `tools/gen_icons.py`. `emblem(o, cls)` draws a filled circle in `o.c`
    with glyph `o.i` (white or near-black, whichever contrasts more) or the emoji `o.e` as fallback. `iconPicker()` (sheet2, search
    matches word starts of name + tags, "Use an emoji instead"), `emblemEditor()` = preview + `PALETTE` swatches in the category /
    account / asset forms; its last dot "+" opens a hex dialog (`hexDialog/useHex`, `normHex`), remembered in `settings.customCols` (6). Hold a dot to remove
    it (custom → dropped, palette → `settings.hiddenCols`; typing its hex brings it back; things already in that colour keep it). `PALETTE`'s first 12 are the default category colours, chosen so ring neighbours stay distinct under
    colour-blindness simulation (OKLab ΔE ≥ 8, normal vision ≥ 15) on the light and dark surfaces; re-check if you reorder them.
  - Dates/times never use native pickers: `dateField()` renders a field button (`data-v` = YYYY-MM-DD, optional min/max/opt),
    `datePicker()` opens a Material dialog in `#pop` built on `calGrid()` (shared with the period dialog); `timePicker()` for the nudge time.
  - Sheets are built once and then patched in place (`setPressed`, `trSync`), never re-rendered while open.
    `#sheet2` is a second layer for pickers opened from a sheet (currency picker: search, in use / popular / all ISO currencies).
  - History has its own period `HP` (default this month) with the same ‹ label ▾ › bar and Day | Range | Month dialog as Home:
    `range/periodLabel/shiftPeriod/canNext(p)` and `periodDialog(p)` take the period object (`V` for Home, `HP` for History).
    Long labels shrink/truncate so the top-bar icons always fit at 360px. Its per-account filter row (`.strip` of
    `.chip`s, `data-act="hacc"`) sets `.strip .chip{flex-shrink:0}` — a bare flex child would otherwise shrink below
    its own text width and get clipped, because `button{overflow:hidden}` (kept globally so the press-state layer
    stays inside each button's rounded corners) disables a flex item's usual "don't shrink past your content" floor;
    the Home account-balance strip's own buttons (`.acc`) already carried the equivalent `flex:none` for this reason.
  - History: hold an entry (or the select icon) for multi-select delete; `deleteEntries()` keeps transfer fees consistent.
  - Settings: spending categories are shown as the exact home ring (grey donut placeholder); tap to edit (emblem, colour),
    hold-and-drag to move between slots (touch + mouse, `pressStart/Move/End`, `RE` holds the preview layout/order).
    Money-in categories use a plain grid. Built-in or used categories are hidden, not deleted.
    "Delete all data" is disabled (`button:disabled`, no special-casing needed in the click dispatcher) whenever
    accounts/txns/loans/assets are all already empty — fresh install or right after wiping. Settings ends with a
    small "About" footer: app name, `Android.getVersion()`'s version, and two plain `<a href>` links (GitHub profile,
    repo) — any link whose host isn't the app's own asset host already opens in the system browser via
    `shouldOverrideUrlLoading` (`MainActivity.java`), so these need no `data-act`/bridge wiring of their own.
  - Every add/edit/delete of entries goes through `withUndo(msg, change, fx)` (snapshot of `S.txns` + `S.loans` + `S.accounts`, Undo in the snackbar);
    `fx` = one-shot feedback for the next render (`FX.row` flashes a row, `FX.cat` pops a ring tile, `FX.center` bumps the donut total).
  - Feedback must feel instant and calm (user tested ripples/scales/page animations as laggy): a 10% state layer on press, set by
    JS (`pressOn/pressOff` → `.pressed`, since `:active` is unreliable for touch in WebView), a soft background flash on the changed
    row (`FX.row`), snackbar and sheet slide in, dialog fade, haptic `buzz()` (VIBRATE). No ripple, no scale, no page animation.
    The one requested flourish: a tapped bottom-nav tab's icon flips once (`FLIP` → `.ic.flip`, not replayed on re-render).
    Calendar range: a touch only becomes a drag after 12px, so a jittery tap stays a tap. Don't reuse existing class names
    (`.pop` = dialog layer, `.row`, `.nav .in`) for effects.
    `commit()` also calls `syncReminders()`.
  - Theme: Material 3 role tokens (`--primary`, `--surface-container`, ...) on `:root` (`css/colors.css`) with a baseline scheme from the indigo seed
    `#2F45C9`; `applyTheme()` overrides them in `<style id="dyn">` from the phone's dynamic palette. Spent/received colours are fixed semantic tokens.
- Build: `./gradlew assembleDebug` (wrapper committed; AGP 8.5.2, Gradle 8.7, JDK 17, compileSdk/targetSdk 35 with
  `android.suppressUnsupportedCompileSdk=35`, minSdk 24). Android 15 forces edge-to-edge: `MainActivity` wraps the
  WebView in a `FrameLayout` (`root`) padded by the system-bar/cutout/IME insets (API 30+), and `setBars` also colours
  `root`, which shows behind the transparent bars.
- Google Play: release job also runs `bundleRelease` and attaches `Tally-vX.Y.Z.aab` (release key = Play upload key).
  User guide `docs/PLAY_STORE.md`; listing kit `docs/play/` (icon-512, feature graphic, 800×1600 screenshots,
  `listing.md`); `docs/privacy-policy.md` (must be hosted publicly).
  - Version: `tallyVersion` in `gradle.properties` (semver, now 1.1.0) is the release `versionName`; debug builds get
    `-dev.<run>`. `versionCode` = `GITHUB_RUN_NUMBER` (per workflow file — keep `build-apk.yml`'s name).
  - Debug builds: `applicationIdSuffix '.dev'` → `app.tally.expenses.dev`, labelled "Tally Dev" (`app/src/debug/res`),
    signed with the committed `app/debug.keystore` (android/androiddebugkey/android) so every CI build updates the last.
    Never replace the keystore: installed copies would stop accepting updates.
  - Release builds: `app.tally.expenses`, not minified, signed only when `TALLY_KEYSTORE` / `TALLY_KEYSTORE_PASSWORD`
    (alias `TALLY_KEY_ALIAS`, default `tally`) are set. The private key (PKCS12, alias `tally`, cert SHA-256
    `9D:B8:C8:9C:…:8D:2F:AC:88`, in README/SECURITY) is only in the repository secrets `RELEASE_KEYSTORE_BASE64` and
    `RELEASE_KEYSTORE_PASSWORD`. Never commit a key (`.gitignore` blocks `*.jks`, `*.keystore`, `*.p12` except the debug key).
  - CI `.github/workflows/build-apk.yml`: job `check` (`npm ci`, Playwright Chromium, `npm run lint`, `npm test`);
    job `build` (`assembleDebug assembleRelease`, debug APK as artifact and force-pushed to the `builds` branch as
    `Tally-<branch>.apk`, branches only); job `release` on pushes to `main` or a `v*` tag (needs `check`): if
    `v<tallyVersion>` has no GitHub Release yet (a tag must equal it), CHANGELOG must have that section; builds + signs
    from the secrets, verifies cert/versionName/non-debuggable with apksigner/aapt, and `gh release create` publishes
    `Tally-vX.Y.Z.apk` + `.sha256` with the CHANGELOG section as notes, creating the tag at that commit.
  - Releasing: bump `tallyVersion` + CHANGELOG in a PR and merge it into `main` (this session's git proxy can't push
    tags, which is why CI creates them).
- Tests: `tests/` (`npm ci`; `npm test` runs `e2e/NN-*.js` against a throwaway server, `npm test -- 15` for one suite;
  `npm run lint`; `npm run format`). Locally: `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
  Suite 15 guards start-up loading, CSP violations, the bundled font and "no requests outside the app".
- The user tests on their phone: after every push, wait for the build, then fetch the APK
  (`git fetch origin builds && git show origin/builds:Tally-<branch>.apk > file.apk`) and send it to them. Test builds
  install as "Tally Dev" next to the release (their data is separate from the release's).
- Docs: README (features, requirements, install/verify, privacy, build, layout, releasing), CONTRIBUTING (architecture,
  conventions, design principles), CHANGELOG (Keep a Changelog), SECURITY, THIRD_PARTY_NOTICES + `LICENSES/`,
  `docs/` (logo.svg from `ic_launcher.xml`, README screenshots from sample data, `social-preview.png` 1280×640).

## Notes
- License: MIT (© 2026 IamAndelib). Material Symbols are Apache-2.0, Onest is SIL OFL 1.1.
- UI: Material 3 (adaptive colour on Android 12+), font Onest (bundled; the app makes no network requests).
- Quick check in a browser: serve `app/src/main/assets/` with `python3 -m http.server` (no Android bridge there: baseline colours, no file saving).
- The app needs Android System WebView 87+ (CSS `inset`, flex `gap`, `??`).
- Play Store later: use the release key as the upload key with Play App Signing (or enrol a new upload key).
