# Changelog

All notable changes to Tally are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.1] — 2026-09-24

### Changed

- Targets Android 15 (API 35), as Google Play requires; the app keeps clear of the status bar, navigation bar and
  keyboard now that Android draws apps edge to edge.
- Releases also include an Android App Bundle (.aab) for Google Play.
- Ready for F-Droid and IzzyOnDroid: store texts and screenshots in `fastlane/`, and release version codes fixed in
  `gradle.properties` (1.1.1 = 10101) so anyone rebuilding from source gets the same app.

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

[1.1.1]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.1.1
[1.1.0]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.1.0
[1.0.0]: https://github.com/IamAndelib/Tally-android/releases/tag/v1.0.0
