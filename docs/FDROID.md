# Tally on F-Droid

[F-Droid](https://f-droid.org) is the app store for free and open-source Android apps. It **builds each app itself from
the public source code**. Tally is in F-Droid's catalogue as `app.tally.expenses`: it was accepted on 2026-10-08
([fdroid/fdroiddata!50680](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/50680)), starting with 1.3.1. Its
page, once F-Droid has published the first build, is <https://f-droid.org/packages/app.tally.expenses/>.

Tally qualifies because it has:
- an MIT licence;
- no ads, no tracking, no network use (it doesn't even ask for the Internet permission);
- one library, AndroidX WebKit, which is open source and comes from Google's Maven;
- no signing key or other unknown binary in the source tree (only the standard Gradle wrapper).

**Reproducible builds: your signature on F-Droid too.** F-Droid rebuilds each release from source, checks it is
byte-for-byte the APK on the GitHub release (apart from the signature), and then ships **your** signed APK. So the
GitHub and F-Droid copies are the same app and update each other. The recipe asks for this with `Binaries` (where the
release APK is) and `AllowedAPKSigningKeys` (the release certificate). If a release ever doesn't match, F-Droid skips
that version rather than shipping something else. CI's **F-Droid reproducible build** job runs F-Droid's own build and
comparison on every push, so a mismatch shows up here first.

## What F-Droid reads
- **Its own copy of the recipe**, `metadata/app.tally.expenses.yml` in
  [fdroiddata](https://gitlab.com/fdroid/fdroiddata/-/blob/master/metadata/app.tally.expenses.yml). This is the one F-Droid
  builds from. Its update bot adds a build to it for every new release.
- From this repository:
  - `fastlane/metadata/android/en-US/`: title, short and full description, icon, feature graphic, screenshots, and a
    changelog per version (`changelogs/<versionCode>.txt`). Changes here show up with the next build;
  - `gradle.properties`: `tallyVersion` / `tallyVersionCode`;
  - git tags `vX.Y.Z`, created by CI with every release, each with its signed `Tally-vX.Y.Z.apk`.

[`docs/fdroid/app.tally.expenses.yml`](fdroid/app.tally.expenses.yml) is the reference copy of the recipe, as
accepted. CI lints it and builds every commit with it, filling in that commit's version and hash, so it doesn't need
updating for a release. To change anything else in the recipe (categories, build settings, the signing certificate),
change it here, check that CI stays green, then open a merge request with the same change on `fdroiddata`.

## Releases
Nothing to do on F-Droid's side. When CI publishes a new `vX.Y.Z` tag, F-Droid's update checker notices it
(`UpdateCheckMode: Tags`). It reads the new version from `gradle.properties` (`UpdateCheckData`), adds a build, checks
it against `Tally-vX.Y.Z.apk` and publishes, usually within a few days. Just keep the release checklist:
- bump `tallyVersion` **and** `tallyVersionCode`;
- add the `CHANGELOG.md` section **and** `fastlane/metadata/android/en-US/changelogs/<tallyVersionCode>.txt` (CI
  refuses to release without it);
- keep the **F-Droid reproducible build** job green: a release must be built by CI from the clean tagged commit, as it
  always is.
