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
  - Home-screen widget `TallyWidget` (AppWidgetProvider, `res/layout/widget_tally.xml`, `res/xml/tally_widget_info.xml`, 4×1,
    Material You colours via `values-v31` system colours): today's total balance + "Spent today", body opens the app, + opens
    `QuickAddActivity` (small dialog: Spent / Received / Transfer → MainActivity with `open=add:out|add:in|add:tr`).
    The page is the source of truth: `syncWidget()` (from `commit()`, start, resume) sends formatted numbers through
    `Android.setWidget(json)`; the widget zeroes "Spent today" when the stored date isn't today (midnight alarm + 30-min updates).
- All app logic is one self-contained file: `app/src/main/assets/index.html` (vanilla JS, no framework, no build step).
  The only other asset is `icons.js` (see Emblems).
  - State `S = {v:6, settings:{cur, theme, lastAcc, lastAccIn, lastCheck, remind:{daily,time,dues}, notifAsked, dragTip, customCols, hiddenCols, hiddenTypes}, accounts, types, cats, txns, loans, assets}`
    in localStorage key `tally:v1`.
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
    `runBal()` (cached per render, `RBC`) = each account's balance right after each entry, plus loan-payment status; entry
    lists show it under the amount (Bluecoins-style), amounts coloured by money direction (spent red, got green, `--xfer` blue),
    and loan payments carry a "Partly paid" / "Cleared" pill.
  - Calculator: `amtField(id,cur,val,curId,label)` (quick add, transfer's main amount, loan create/payment, the draw-edit
    sheet, the account "Doesn't match?" fix) renders the amount input plus a toggle button (`calcBtn`, the bundled
    `ICONS.calculate` glyph) and a hidden 4-column keypad (`calcPanelHtml`: `7 8 9 ÷ / 4 5 6 × / 1 2 3 − / ⌫ 0 . +`).
    Tapping the toggle opens it (`calcOpen`: seeds `CALC={id,expr}` from the field's current value, makes the input
    read-only so the system keyboard doesn't fight it for space); each key (`calc-key`) appends to `CALC.expr` and
    live-writes it into the input, so the field doubles as the display. Tapping the same toggle again (`calcClose`)
    evaluates the buffer (`calcEval`: left-to-right, `×`/`÷` folded into the left operand before summing `+`/`-` terms;
    `null` on a malformed expression or ÷0, which just leaves the field as-is — no crash, no snack) and dispatches a
    real `input` event so previews (transfer, balance fix) stay in sync. Deliberately **not** applied to transfer's
    received amount/fee (`f-toamt`/`f-fee`, plain `.field` labels, not `.amtwrap`) or asset value (`f-aval`, laid out
    beside a currency picker) — scope-trimmed to avoid layout rework.
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
  - Emblems (Bluecoins-style): `icons.js` = `window.TALLY_ICONS {name: [svgPath, tags]}`, a curated subset (~220) of Google
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
    Long labels shrink/truncate so the top-bar icons always fit at 360px.
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
