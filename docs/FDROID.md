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

**Status:** submitted on 2026-09-30 as merge request
[fdroid/fdroiddata!50680](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/50680) ("New app: Tally"). F-Droid's
reviewer marked it mostly ready, waiting for their test queue. Until it is merged, every release must also be put into
the merge request: replace the build in the branch's `metadata/app.tally.expenses.yml` with this repository's recipe
(without its `#` lines), which names the new version and its full commit hash.

## Submitting (once)
You add Tally's recipe to F-Droid's data repository, `fdroiddata` on GitLab, with a merge request. Their CI checks and
builds it, then a volunteer reviews it. This follows F-Droid's
[Quick Start Guide](https://f-droid.org/docs/Submitting_to_F-Droid_Quick_Start_Guide/):

1. **GitLab account.** Create one at <https://gitlab.com>, and turn on two-factor login (Preferences → Account).
2. **Fork.** Open <https://gitlab.com/fdroid/fdroiddata> (its display name is "Data") and click **Fork**, into your own
   namespace, **public**, with **only the default branch `master`** (the repository is huge).
3. **Add the recipe.** In your fork's `metadata` folder: **+ → Upload file**. Upload the recipe here, without its `#`
   comment lines at the top, as `app.tally.expenses.yml`. Uploading keeps it byte-exact, which pasting may not.
   Commit message `New App: app.tally.expenses`, to a **new branch** `app.tally.expenses`, without "create a merge
   request".
4. **Merge request.** Open a merge request from that branch into `fdroid/fdroiddata` → **`master`**, titled
   "New app: Tally", with "Allow commits from members who can merge" ticked. Fill in the "App inclusion" template's
   checklist, and say plainly that Tally was built with AI assistance and that you review, test and maintain it. The
   repository shows this anyway (CLAUDE.md, co-author lines).
5. **Pipeline.** F-Droid's checks (`fdroid lint`, `rewritemeta`, `fdroid build` + the reproducibility check) run on
   the merge request, not on a branch push. On a new GitLab account the pipeline may fail at once with **0 jobs**,
   because GitLab wants identity verification (phone or card) for its shared runners. Don't give either; F-Droid's
   checklist says to leave a comment asking them to trigger the CI instead. Tick the two "Pipeline" boxes only once
   it has passed.
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
