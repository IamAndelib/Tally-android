# Changelog

All notable changes to Tally are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Settings → Region: choose the first day of the week (Monday, Sunday or Saturday) for calendars and weekly
  summaries, and 24- or 12-hour time. New notebooks start on Monday and 24-hour (the international standard);
  existing notebooks keep what they showed.

### Changed

- A new notebook starts by choosing its currency instead of a preset one; it becomes the main currency, which can be
  changed in Settings → Region.
- Neutral examples: the account name hint no longer names a bank, and popular currencies are listed by world use.
- Screens of every size: Tally is checked on small and large phones, foldables and tablets, with normal and large
  text. Text follows the phone's font size up to 130%, so layouts stay usable at the largest settings; long names
  shorten with "…" instead of pushing amounts off screen; buttons grow to fit larger text; the calculator keypad
  matches the sheet's width on tablets; dialogs scroll on short screens.
- Phones can be turned sideways: the ring fills the left of the screen and stays in view while the buttons, balances
  and entries scroll on the right, forms use the full height, and the calculator keypad sits beside the form instead
  of covering it.
- Tablets and unfolded foldables use their room: a side rail replaces the bottom bar, and on wide screens Home shows
  your accounts and the day's entries beside the ring, Assets and Liabilities show their lists side by side, and forms
  open as centred dialogs.
- Category names around the ring are easier to read: never smaller than 10px (9px in a full ring), they follow the
  phone's text size, and a name is shown whole or not at all, never cut off.

## [1.2.7] — 2026-09-30

### Changed

- Tally no longer asks for the Internet permission: it never used the network, and now it can't.
- The test-build signing key moved out of the repository into a CI secret, and the APK no longer carries Google's
  encrypted dependency-metadata block (both asked for by F-Droid).
- Reproducible builds: F-Droid's own build of a release is byte-for-byte the signed GitHub APK, so F-Droid can ship
  Tally with the same signature. CI checks this on every push, in F-Droid's build environment.

## [1.2.6] — 2026-09-30

### Changed

- Loan and lending reminders ask for what is due, not the whole tab. If someone owes 300 that is overdue and has
  since borrowed 1000 more, due later, the reminder says 300 and adds "1,300 in all". The loan's row, its due card and
  the suggested payment say 300 too. Payments go to the borrowing due soonest, and each borrowing shows what is left
  of it.
- "+1 day" / "+1 week" on a reminder moves every borrowing that is due by today.

### Fixed

- Once a borrowing with a due date was paid off, its date no longer keeps the whole loan or lending "Overdue". The
  next reminder moves on to the next borrowing's day.
- Reminders still on screen keep up with the app. The balance check shows the new balances after you write something
  down, without a new sound, and goes away after "All match". A due reminder shows the new amount, or goes away once
  that loan or lending is paid. The evening nudge goes away once something is written that day.

## [1.2.5] — 2026-09-28

### Changed

- The balance card on Home ("Do these still match?") appears from your Balance check time, and not at all while that
  reminder is off (it used to show from the first open of the day).

## [1.2.4] — 2026-09-28

### Added

- Once you have a few entries and the daily backup is still off, Tally suggests turning it on (at most once a week).

### Changed

- Delete all data first offers to back up (OK / No), even when a backup exists, since it may not have your latest
  entries; then it asks once more to be sure (Yes / No). If backing up into the daily backup's folder fails, it offers
  to save a backup file instead.

## [1.2.3] — 2026-09-28

### Fixed

- Vibration strength could feel reversed on some phones (the lighter levels buzzing harder than the stronger ones); it
  now always rises from Light to Strong.

## [1.2.2] — 2026-09-28

### Added

- On first open a small "Permissions" dialog asks for notifications and unrestricted battery (which also lets reminders
  come on time), each with its own "Allow", and Done. Anything left off waits in Settings.

### Changed

- Settings → Reminders shows a small "Permissions" card listing only what's denied, each with an "Allow" button; a row
  disappears once allowed. "Battery is fine" is gone. It also shows while only the daily backup is on.
- The launcher icon fills your launcher's own shape (an adaptive icon, and a themed one on Android 13+) instead of
  sitting small on a light backplate.
- Reminders aren't re-armed when nothing about them changed, and each save turns the notebook into text only once.
- Lighter on battery: the home-screen widget no longer wakes the phone every 30 minutes, the app stops all work while
  in the background, and an unchanged notebook never triggers a backup write.

### Fixed

- The Reminders card in Settings could offer "Allow notifications" although they were allowed; it now checks Android's
  permission itself and updates the moment a permission changes.
- A phone that had never shown Android's notification prompt for Tally (for example after restoring data) now gets it.
- Reminder notifications showed a plain white dot in the status bar; they now show Tally's card.
- An evening nudge delivered late, after midnight, no longer says "Nothing written today" about a day that has just
  begun; and there's no nudge before any account exists.
- On phones that clear memory aggressively, a CSV or backup export, a restore or a new backup folder chosen in Android's
  picker is no longer lost when Tally was closed in the background meanwhile.
- If Android's web engine crashes or is stopped for memory, Tally restarts its page instead of closing.
- Reminders and the backup are re-armed after a "fast boot" (some HTC, Xiaomi and older phones) and whenever the widget
  refreshes after a restart.

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

[1.2.7]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.2.7
[1.2.6]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.2.6
[1.2.5]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.2.5
[1.2.4]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.2.4
[1.2.3]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.2.3
[1.2.2]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.2.2
[1.2.1]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.2.1
[1.2.0]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.2.0
[1.1.1]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.1.1
[1.1.0]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.1.0
[1.0.0]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.0.0
