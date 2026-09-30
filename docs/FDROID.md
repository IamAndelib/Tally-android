# Publishing Tally on F-Droid

[F-Droid](https://f-droid.org) is the app store for free and open-source Android apps. It's free, needs no developer
account fee, and **builds the app itself from the public source code**. Tally qualifies:
- MIT licence;
- no ads, no tracking, no network use (it doesn't even ask for the Internet permission);
- one library, AndroidX WebKit, which is open source and comes from Google's Maven;
- no signing key or other unknown binary in the source tree (only the standard Gradle wrapper).

**Reproducible builds: your signature on F-Droid too.** F-Droid rebuilds each release from source, checks it is
byte-for-byte the APK on the GitHub release (apart from the signature), and then ships **your** signed APK. So the
GitHub and F-Droid copies are the same app and update each other. The recipe asks for this with `Binaries` (where the
release APK is) and `AllowedAPKSigningKeys` (the release certificate). If a release ever doesn't match, F-Droid skips
that version rather than shipping something else. CI's **F-Droid reproducible build** job runs F-Droid's own build and
comparison on every push, so a mismatch shows up here first.

Everything F-Droid reads is in this repository:
- `fastlane/metadata/android/en-US/`: title, short and full description, icon, feature graphic, screenshots, and a
  changelog per version (`changelogs/<versionCode>.txt`);
- `gradle.properties`: `tallyVersion` / `tallyVersionCode`;
- git tags `vX.Y.Z`, created by CI with every release, each with its signed `Tally-vX.Y.Z.apk`;
- [`docs/fdroid/app.tally.expenses.yml`](fdroid/app.tally.expenses.yml): the build recipe to submit. Its `commit:` is
  the full commit hash of the newest release tag.

## Submitting (once)
You add Tally's recipe to F-Droid's data repository, `fdroiddata` on GitLab, with a merge request. Their CI checks and
builds it, then a volunteer reviews it. This follows F-Droid's
[Quick Start Guide](https://f-droid.org/docs/Submitting_to_F-Droid_Quick_Start_Guide/):

1. **GitLab account.** Create one at <https://gitlab.com>, and turn on two-factor login (Preferences → Account).
2. **Fork.** Open <https://gitlab.com/fdroid/fdroiddata> and click **Fork**, into your own namespace.
3. **Add the recipe.** In your fork, create the branch `app.tally.expenses`. Add the file
   `metadata/app.tally.expenses.yml` with the contents of the recipe here, without its `#` comment lines at the top.
   Commit it with the message `New App: app.tally.expenses`.
4. **Pipeline.** Pushing starts your fork's pipeline. It runs `fdroid lint`, `fdroid rewritemeta`, and the full
   `fdroid build`, including the reproducibility check. Wait for it to go green.
5. **Merge request.** Open a merge request from that branch into `fdroid/fdroiddata` → **`master`**, titled
   "New App: Tally". Fill in the template, and say plainly that Tally was built with AI assistance and that you
   review, test and maintain it. The repository shows this anyway (CLAUDE.md, co-author lines).
6. **Review.** Answer questions in the merge request. Once it's merged, Tally appears in F-Droid after the next build
   cycle, usually within a few days.

## After it's in
Nothing to do per release. When CI publishes a new `vX.Y.Z` tag, F-Droid's update checker notices it
(`UpdateCheckMode: Tags`). It reads the new version from `gradle.properties` (`UpdateCheckData`), adds a build, checks
it against `Tally-vX.Y.Z.apk` and publishes. Just keep the release checklist:
- bump `tallyVersion` **and** `tallyVersionCode`;
- add the `CHANGELOG.md` section **and** `fastlane/metadata/android/en-US/changelogs/<tallyVersionCode>.txt` (CI
  refuses to release without it);
- keep the **F-Droid reproducible build** job green: a release must be built by CI from the clean tagged commit, as it
  always is.
