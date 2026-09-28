# Security

Tally keeps all data on the phone and makes no network requests, so there is no server to attack — but bugs that could
expose or corrupt someone's data still matter.

## Reporting a vulnerability

Please report it privately through GitHub: **Security → Report a vulnerability** on this repository
(private vulnerability reporting). Include the app version (Settings → About), your Android version and the steps to
reproduce. Don't include a backup file with real financial data.

You can expect a reply within a week. Fixes ship as a new release, and the reporter is credited unless they'd rather
not be.

## What the app does to protect your data

- **No network:** the page's Content-Security-Policy blocks every request; nothing is ever sent anywhere.
- **The web view is locked down:** it only loads the app's own files (https, from the app itself); web links open in
  your browser, any other kind of link is ignored; it has no file, content or location access. Files (Restore,
  backups, exports) are read and written by the app's native side, only where you picked.
- **Backups:** the auto backup writes one file, only into the folder you chose, and checks it after writing. Backup
  files are plain JSON, so keep them somewhere private. Android's own backup may include Tally's data only when it is
  end-to-end encrypted.
- **Restored files are checked:** everything read from a backup is validated before use (ids, currencies, colours,
  numbers), so a crafted file can't inject code or break the app.
- **Notifications** show no names or amounts on a lock screen that hides sensitive content.

## Supported versions

Only the latest release gets fixes.

## Release signing

Release APKs are signed with this certificate. An APK signed with anything else is not an official Tally release:

```
SHA-256: 9D:B8:C8:9C:59:48:0E:D9:C6:73:D9:B9:6E:C3:F0:82:B2:83:6B:1C:ED:0E:07:A7:DD:41:8B:D1:8D:2F:AC:88
```
