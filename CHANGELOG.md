# Changelog

All notable changes to Tally are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- On first open Tally asks for what reminders need, each once: Android's notification prompt, the "Alarms & reminders"
  switch (so they come on time), and Android's "run in the background" popup (so the phone doesn't put Tally to sleep).

### Fixed

- The Reminders card in Settings could offer "Allow notifications" although they were allowed; it now checks Android's
  permission itself and updates the moment a permission changes.

### Changed

- Lighter on battery: the home-screen widget no longer wakes the phone every 30 minutes, the app stops all work while
  in the background, and an unchanged notebook never triggers a backup write.

## [1.2.1] — 2026-09-28

### Added

- **Daily auto backup:** pick a folder once and Tally keeps one file there, "Tally backup.json", updated every day at
  your time when something changed. It stays after an uninstall. Switching it off and on keeps the folder; "Change"
  picks another; "Back up now" backs up at once.
- **Restore from backup** offers the auto backup file first (with its date and counts), or any other file.
- **Balance check reminder:** a daily notification with your balances; tapping it opens the morning check.
- Settings shows what could keep reminders from arriving (notifications, on-time alarms, battery) with a fix for each.

### Changed

- The time picker is a scroll wheel like your phone's clock (hours : minutes, AM/PM on a 12-hour phone), with any
  minute of the day; times follow the phone's 12 / 24-hour setting.
- Loan and lending due-day reminders come at a time you pick (09:00 until you change it).
- Reminders arrive at the exact time where Android allows it, follow the local time after a time-zone change, and
  each kind has its own notification channel.
- With auto backup on, "Back up now" replaces "Save backup".

### Security

- The app's web view only loads Tally's own files and has no file, content or location access; web links open in
  the browser and any other kind of link is ignored. Files are read and written only by the app itself, where you
  picked.
- Android's own backup includes Tally's data only when it is end-to-end encrypted (no more plain `adb backup` copies).
- Notifications show no names or amounts on a lock screen that hides sensitive content.

## [1.2.0] — 2026-09-27

### Added

- **Haptics:** every tap, keypad key, long-press and save gives a crisp click, and dragging a category clicks as it
  passes each slot. Settings → Feel has an on/off switch and a 5-stop strength slider, from your phone's lightest tick
  to a strong pulse; it plays even when the phone's own touch vibration is turned down or off.
- Tap the donut in Settings to choose what the middle of the Home donut shows: spending, income, both, or nothing.
- In History, swipe sideways to move between the account filters (All → each account and back).
- After you save an expense, its category's icon on Home pops once, so you see where the money went.

### Changed

- Tally opens on its logo, in your light or dark colours, instead of a blank white flash, also from the home-screen
  widget. If Tally is already running, the widget, quick add and reminders go straight back into it.
- Arranging spending categories in Settings is smoother and more predictable: the dragged category goes to the slot
  it's over, neighbours make way the short way round, tiles slide, and the category glides into place when you let go.
- Tapping a category makes its icon pop and glow instead of showing a grey box; dragging one in Settings lifts just its
  slightly enlarged icon.
- A selected category in the pickers has room between its ring and its name; the About footer is centred.

### Fixed

- **Today** in the Day | Range | Month picker always goes back to today, also from the Month tab (it used to show the
  whole month).
- A currency sign your phone has no font for (e.g. the Kyrgyz som) no longer shows as an empty box; the code is used.
- Opening the calculator on an amount field low in a form could leave the field half hidden behind the keypad.
- Reopening Tally from Recents after Android closed it no longer pops up an old quick-add form or payment sheet again.

## [1.1.1] — 2026-09-27

### Changed

- Hold ⌫ in the calculator to keep deleting, like on a phone keyboard.
- Long-pressing labels or empty space no longer brings up text-selection handles.
- Targets Android 15 (API 35), as Google Play requires; the app keeps clear of the status bar, navigation bar and
  keyboard now that Android draws apps edge to edge.
- Releases also include an Android App Bundle (.aab) for Google Play.
- Ready for F-Droid and IzzyOnDroid: store texts and screenshots in `fastlane/`, and release version codes fixed in
  `gradle.properties` (1.1.1 = 10101) so anyone rebuilding from source gets the same app.

### Fixed

- Deleting one lending or loan entry of a person in History no longer deletes that person's whole loan and all its
  payments; only the chosen entries go.
- A loan could vanish after restarting if the account of a deleted or edited draw was later deleted. It now follows
  its remaining entries, and loans already in that state are repaired when the app starts.
- Tapping Save with the calculator still open saves its result (12×3 saved nothing before; − and ÷ didn't work either).
- Closing a form with the calculator open no longer leaves it half-active, where the next Back pressed would write
  the old result into a new form.
- The calculator can't start with × ÷ or + any more.
- Editing a loan payment or draw can't make it paid back more than was lent or borrowed (the extra was lost).
- A transfer fee that isn't a number is no longer silently dropped.
- History's account filter resets when its account is gone, instead of showing an empty list.
- A backup file that can't be read now says so.
- Backups are checked more strictly on restore: odd ids, currencies, colours and numbers are cleaned up, so a damaged
  or hand-edited file can't break the app. CSV exports can't be read by a spreadsheet as formulas.
- Faster lists: money formats are built once instead of for every row.

## [1.1.0] — 2026-09-24

### Changed

- Amounts get thousands commas as you type them (123986 reads 123,986), in every amount field. The keypad's "," key
  types the decimal point.
- Calculator: the button next to amount fields is bigger and coloured. While typing, the display scrolls so the caret
  stays in view, and the caret can be held and dragged. The + − × ÷ keys are larger. A bar above the keys shows the
  live result, with a keyboard button that applies it and switches to the phone's keyboard.

## [1.0.0] — 2026-09-24

First public release.

### Features

- **One tap per expense:** up to 24 spending categories around a donut of the day's spending. Tap a category, type the
  amount, save.
- **Accounts in any currency:** bank, mobile wallet (e.g. bKash), cash, credit card, savings, or your own account types,
  each with its own currency. Balances roll over live from day to day, with a morning check that they still match.
- **Transfers** between your own accounts that never count as spending, with the received amount for currency changes and
  an optional fee.
- **Balance fixes:** type what an account really holds and Tally records the difference.
- **Loans and lendings:** several draws per person, each with its own due date, partial payments, overpayments,
  write-offs, and Assets / Liabilities tabs with net worth.
- **History** for any day, range or month, filtered by account, with multi-select delete.
- **Spending summary:** last 7 days, 8 weeks, or a month by category, compared with the period before.
- **Reminders:** an evening nudge when nothing was written, and due-day reminders with Record payment / +1 day / +1 week.
- **Home-screen widget** with today's balance, today's spending and a quick add.
- **Built-in calculator** on amount fields, with a movable cursor.
- **Your look:** Material You colours on Android 12+, light and dark themes, emblems and colours for every category,
  account and asset.
- **Your data stays yours:** everything is stored on the phone, with JSON backup / restore and CSV export. No account,
  no ads, no tracking, and no network requests.

### Fixed (since the test builds)

- Saved data that included a hidden palette colour failed to load at start-up, showing the welcome screen; the next save
  could then overwrite the real data. Loading now happens after the app is fully set up, and data that still can't be
  read is kept aside and offered as a file instead of being dropped.
- Editing a loan draw could put its due date before the draw's own date.
- Restoring a backup that can't be read now says so.
- When no file picker is available, saving a backup or export now reports that it wasn't saved.

### Changed

- The Onest font is bundled with the app instead of loaded from Google Fonts, so it looks the same offline.
- Test builds install as a separate app, "Tally Dev", next to the release.

[1.2.1]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.2.1
[1.2.0]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.2.0
[1.1.1]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.1.1
[1.1.0]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.1.0
[1.0.0]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.0.0
