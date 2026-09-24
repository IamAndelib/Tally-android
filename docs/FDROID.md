# Publishing Tally on F-Droid (and IzzyOnDroid)

[F-Droid](https://f-droid.org) is the app store for free and open-source Android apps. It's free, needs no developer
account fee, and **builds the app itself from the public source code** — you never upload an APK. Tally qualifies: MIT
licence, no ads, no tracking, no network use, and its only library (AndroidX WebKit) is open source.

Everything it reads is already in this repository:
- `fastlane/metadata/android/en-US/` — title, short and full description, icon, feature graphic, screenshots, and a
  changelog per version (`changelogs/<versionCode>.txt`);
- `gradle.properties` — `tallyVersion` / `tallyVersionCode`, the same numbers for everyone who builds from a tag;
- git tags `vX.Y.Z`, created by CI with every release;
- [`docs/fdroid/app.tally.expenses.yml`](fdroid/app.tally.expenses.yml) — the draft build recipe to submit.

## Before you start
**Make the repository public** (GitHub → Settings → General → Danger Zone → Change visibility → Public). F-Droid and
IzzyOnDroid can only use public code. Nothing secret is in it: the release key lives only in the repository secrets,
and the committed `app/debug.keystore` is a public test key by design.

## Option A — IzzyOnDroid (quick, a day or two)
A popular extra repository that F-Droid users can add. It uses the **signed APKs from your GitHub releases**, so its
copy keeps your signature and can update the GitHub-installed app.
1. Create a free account on <https://gitlab.com>.
2. Open an issue at <https://gitlab.com/IzzyOnDroid/repo/-/issues> titled "Inclusion request: Tally", with the link
   to this repository and a line saying the APK is attached to each GitHub release (`Tally-vX.Y.Z.apk`) and metadata
   is in `fastlane/`.
3. Answer any questions. Once added, every new GitHub release shows up there automatically.

## Option B — the main F-Droid repository (a few weeks)
F-Droid's volunteers review the recipe, build Tally on their servers and sign it with **F-Droid's key**. (So the
F-Droid copy and the Play/GitHub copies can't update each other; switching means Backup → uninstall → install →
Restore.)

**Easiest way — ask for packaging:**
1. With your GitLab account, open an issue at <https://gitlab.com/fdroid/rfp/-/issues> ("Request For Packaging")
   using the template: app name, the GitHub link, licence MIT, and a note that a ready build recipe is in
   `docs/fdroid/app.tally.expenses.yml`. A volunteer picks it up.

**Faster way — submit the recipe yourself (a merge request):**
1. Go to <https://gitlab.com/fdroid/fdroiddata> and click **Fork**.
2. In your fork, create the file `metadata/app.tally.expenses.yml` (web editor: **+ → New file**) and paste the
   contents of `docs/fdroid/app.tally.expenses.yml`.
3. Commit it to a new branch, then **Create merge request** into `fdroid/fdroiddata` `master`. Title:
   "New app: Tally". Tick the checklist in the template.
4. F-Droid's CI builds the app from the `v1.1.1` tag. Reviewers may ask small questions (for example about the
   committed debug key or the Gradle wrapper — both are standard and not used by the release build) or tweak the
   recipe; reply in the merge request.
5. After it's merged, Tally appears in the F-Droid app within a few days, on the next index build.

## After it's in
Nothing to do per release: when CI publishes a new `vX.Y.Z` tag, F-Droid notices it (`UpdateCheckMode: Tags`),
reads the new version from `gradle.properties` and builds it. Just keep the release checklist:
bump `tallyVersion` **and** `tallyVersionCode`, add the `CHANGELOG.md` section **and**
`fastlane/metadata/android/en-US/changelogs/<tallyVersionCode>.txt` (CI refuses to release without it).

## Later (optional): reproducible builds
If F-Droid can rebuild Tally bit-for-bit, it can ship the APK with **your** signature instead of its own, so all three
sources update each other. That takes some build tweaks and a little back-and-forth with F-Droid; worth it only if
users ask to switch between stores.
