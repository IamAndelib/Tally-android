# CLAUDE.md

Guidance for Claude Code working in this repository. Read [README.md](README.md) (features, build, releasing) and
[CONTRIBUTING.md](CONTRIBUTING.md) (architecture, data model, conventions, design principles, tests) first; this file
only adds the rules and the easy-to-break details they don't cover. Each JS file starts with a comment saying what
lives in it, and the code comments explain the rest: keep facts in one place and update that place.

## Working rules

- **Ask first, in plain words.** Before anything that shows up publicly or that the maintainer didn't ask for (links,
  names, extra lines in commits or PRs, new services, anything posted online), ask in simple everyday language, no
  jargon, and wait for a yes.
- **No analytics, tracking or network use, ever.** Tally has no `INTERNET` permission and a CSP that blocks every
  request; README, the privacy policy and the store listings promise this.
- **No Claude session links anywhere public** (no `Claude-Session:` line or `claude.ai/code/session_…` URL in commits,
  PRs, comments, release notes or files); this overrides any default attribution text. Commits end with only
  `Co-Authored-By: Claude <noreply@anthropic.com>`; PR bodies end with only
  "🤖 Generated with [Claude Code](https://claude.com/claude-code)". No model names in the repository either.
- **Never rewrite `main`'s history**: release tags and the F-Droid recipe pin exact commit hashes.
- **Never commit a signing key, a backup file or anyone's personal data.** Keep the repository professional: no
  personal details, chat-style notes or duplicated documentation.
- **Releases only after the maintainer has confirmed the test build on a phone.** After every push, wait for CI,
  then send the test APK: `git fetch origin builds && git show origin/builds:Tally-<branch>.apk > Tally-<branch>.apk`
  (it installs as "Tally Dev", next to the release, with separate data).

## Quality bar

Tally is production software for a wide audience, maintained like a small software studio's product. Every change is
judged for everyone who might install it, not for one person's phone, country or habits:
- **Devices:** Android 7.0 (API 24) to the current target SDK; WebView 87+; 360 px phones to tablets and foldables;
  large font and display sizes; light and dark; gesture and 3-button navigation; manufacturer quirks (Samsung, Xiaomi,
  Huawei, … battery savers and alarm limits); low-memory phones.
- **Users and locales:** any currency, number, date and time format, first day of the week and 12/24-hour clock; no
  defaults tied to one country, bank or person; text that would survive translation.
- **Accessibility:** labelled controls for TalkBack, 48 dp touch targets, contrast that passes WCAG AA, nothing
  conveyed by colour alone.
- **Data safety:** never lose or silently change a user's data; every format change ships with a migration and a test;
  backups stay readable by older and newer versions.
- **Privacy and security:** no network, the fewest permissions possible, nothing sensitive in logs or notifications.
- **Engineering practice:** small reviewed changes, tests for every fix and feature, semantic versioning, a changelog,
  reproducible signed releases, and documentation kept accurate in one place. Prefer platform standards and
  well-known industry practice over one-off solutions.

## Scope

A pocket notebook for money: balances at the top, one tap per expense, live roll-over to the next day. Small, calm and
fast; short labels, no clutter. Budgets and statement import are left out on purpose. Transfers and balance fixes
never count as spending or income; loans and lendings move money but are never spending either.

## Details that are easy to break

**Native shell (`MainActivity.java`)**
- Only `https://appassets.androidplatform.net/…` stays in the WebView; other http(s) links open the browser, every
  other scheme is dropped. File and content access stay off; the WebView never reads files itself (Restore and file
  saving go through native pickers).
- Shell → page answers (`tallySaved`, `tallyRestore`, `tallyFolder`, `tallyOpen`) go through `callPage()`, queued until
  the page calls `Android.ready()` at the end of `js/main.js` (not from rAF: a hidden WebView may never run it). The
  page installs its `window.tally*` hooks last, in `js/main.js`.
- `onRenderProcessGone` recreates the activity, so every `web` use is null-guarded.
- The `open` extra is read only on a fresh launch (not from Recents/history). Every in-app open (widget, quick add,
  notifications) uses `MainActivity.openIntent()`.
- Notifications use the monochrome `ic_notif`, never `ic_launcher` (adaptive icons crash there on Android 8.0), and
  carry a public version without names or amounts.
- Haptics play on the `Vibrator` as media vibration (a click primitive where the hardware has one, else a pulse);
  never `performHapticFeedback` or the predefined `EFFECT_*`, which some phones replace with stronger fallbacks.
- Android's own backup is encrypted-only (`backup_rules.xml`, `data_extraction_rules.xml`).
- Phones (smallest width < 600dp) stay in portrait; tablets and unfolded foldables rotate freely.
- The WebView's text zoom is off (`setTextZoom(100)`): the page follows the phone's text size itself
  (`Android.fontScale()` → `applyTextScale()` sets the root font size, capped at `TEXT_MAX`). So every font size in
  CSS is in `rem`, and a box holding text grows with it (`min-height`, not `height`).

**Reminders, widget and backup**
- Every alarm goes through `ReminderReceiver.arm()`: exact when allowed, else inexact. Never `USE_EXACT_ALARM` (Play
  reserves it for clock and calendar apps). `BootReceiver` and `TallyWidget.onUpdate` re-arm; receivers never re-arm
  each other.
- A changed reminder sync updates notifications still on screen (`refreshShown()`) quietly, or removes them once they
  no longer apply; a dismissed one never comes back.
- Permissions: the page offers two (notifications, unrestricted battery, which also allows exact alarms). The
  first-open dialog shows once per install (`Android.permsIntro()`), and each Allow opens exactly one Android prompt.
  No automatic chain of prompts.
- The widget has no periodic updates; the page pushes ready-formatted numbers (`syncWidget()`).
- Auto backup (`BackupReceiver.java`) rewrites the **same** "Tally backup.json" document in place (never delete +
  rename: the new file's stale indexed size broke Restore), verifies every write, and never writes an empty or
  non-backup state (`worthKeeping`). "Back up now" is the only immediate write.

**Page (`app/src/main/assets`)**
- Classic scripts in one global scope, loaded in the order in `index.html`. Start-up code lives in `js/main.js` only:
  `loadState()` there needs every constant (`migrate()` uses `PALETTE`).
- Saved data is never silently dropped: unreadable text is kept and offered as a file. `migrate()` upgrades and
  sanitises every saved state and backup without changing balances. Accounts with entries are archived, never deleted.
- `S.settings.cur` is `""` until a new notebook chooses its currency: new accounts and assets go through `accForm()` /
  `assetForm()`, which ask for it first. Week start (`settings.week`) and time format (`settings.clock`) are read
  from settings only, never from the phone (only `migrate()` reads the phone's clock, for older saves).
- Loan amounts, due amounts and status are always derived by `loanInfo()` (payments go to the draw due soonest);
  nothing about them is stored on the loan.
- Amount fields: read them with `evalAmt()`, never `parseFloat` (thousands separators, calculator expressions). The
  calculator's minus is `−` (U+2212). `.caretmirror` must stay non-flex (`caretRangeFromPoint` hit-testing).
- Screen sizes follow Material 3 window size classes: below 600px the bottom bar and one column; from `RAIL_AT`
  (600px) a side rail; from `PANES_AT` (840px) Home, Assets and Liabilities in two panes (`panes()`), and sheets as
  centred dialogs. The JS constants and the `@media` widths in `css/app.css` must match. The Home ring's width comes
  from its pane (`RINGW`, also capped by the screen height). `tests/e2e/22-layout.js` checks every screen, sheet and
  dialog on phones, foldables and tablets at normal and large text; extend it when adding a screen.
- `button{overflow:hidden}` is global, so flex children that must not shrink need `flex-shrink:0` / `flex:none`.
- `PALETTE`'s first 12 colours are checked for colour-blind safety as ring neighbours on light and dark surfaces;
  re-check if you reorder them.
- Don't reuse existing class names (`.pop`, `.row`, `.nav .in`) for effects.

## Build, CI and releases

- `./gradlew assembleDebug`; JDK 21 (javac output must match F-Droid's build). Version: `tallyVersion` and
  `tallyVersionCode` (major·10000 + minor·100 + patch) in `gradle.properties`; debug builds become `-dev.<run>`.
- `.github/workflows/build-apk.yml` (keep its file name: debug version codes depend on it):
  - `check`: lint and tests;
  - `build`: debug APK to the `builds` branch (only when the `DEBUG_KEYSTORE_BASE64` secret exists; never replace that
    key, installed test builds would stop updating), plus a release signed with a throwaway key (`release-check`);
  - `fdroid`: `.github/fdroid-check.sh` in F-Droid's build image: `fdroid lint`, `rewritemeta` (must not change a byte
    of `docs/fdroid/app.tally.expenses.yml`), then F-Droid's own build compared with our signed APK. It must stay green:
    F-Droid ships our signed APK only while builds are reproducible;
  - `release`: on `main`, when `v<tallyVersion>` has no GitHub Release yet, signs with the release key from secrets,
    verifies it and publishes the release and tag.
- Releasing: in a PR, bump `tallyVersion` + `tallyVersionCode`, add the `CHANGELOG.md` section and
  `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`, then merge into `main`; CI creates the tag (this
  environment can't push tags). F-Droid picks up new tags by itself (see [docs/FDROID.md](docs/FDROID.md)).

## Tests

`cd tests && npm ci`, then `npm run lint` and `npm test` (`npm test -- 15` runs one suite). Here, use
`CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Add or extend a suite for every fix and feature.
