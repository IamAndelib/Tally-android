# #42 Password-protected backups (+ app lock): discovery notes

Target: 1.5.0, with budgeting / planning (docs/roadmap.md). Needs a dedicated security review.

Maintainer's decisions (2026-11-01):
- **Off by default**; the user turns it on in Settings and sets a password. Plain backups stay readable by every version.
- Rollback is rare; a one-line warning when turning it on is proposed (confirm at the spec).

Found in the code (2026-11-01):
- Only backup **files** are protected; the app's own data (localStorage + `SavedCopy.java`) is never encrypted or changed.
- Older versions refuse a protected file safely: `backupData()` (`backup.js:68`) needs `accounts`/`txns` arrays, else
  "That isn't a Tally backup file" and nothing changes. So keep the file JSON with a marker (e.g.
  `{"tally":"protected", …}`) and never a plain backup's shape.
- Android rollback = uninstall (all data gone) + restore, which is exactly when a readable backup matters. Say once when
  turning it on: older versions can't open protected backups; turning it off makes the next backup readable by all.
- Bigger real-world risk: a forgotten password (no recovery). Type it twice; warn that it can't be recovered.
- Earlier plain backups (saved or shared elsewhere) stay plain: say so. The auto-backup file becomes protected on its
  next write (`BackupReceiver.java` rewrites the same document in place; `worthKeeping()` checks plain JSON first).
- Hardest part: the nightly auto backup runs natively without asking for the password: Android Keystore, decided in
  the security review. Platform crypto only (no new dependencies, no network).

To settle in the spec: cipher and key derivation (Web Crypto in the page vs. Java), what Keystore holds, Restore's
password prompt, changing / turning off the password, test vectors, backups from a newer version (`newer` in
`restoreText()`).

App lock (maintainer's reply on #42): fingerprint / screen lock to open Tally. Research first: Android 7+ without new
dependencies (the phone's own lock-screen confirmation); behaviour of the widget, quick add and notifications while
locked.
