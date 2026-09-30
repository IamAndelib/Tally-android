# Publishing Tally on F-Droid (and IzzyOnDroid)

[F-Droid](https://f-droid.org) is the app store for free and open-source Android apps. It's free, needs no developer
account fee, and **builds the app itself from the public source code**: you never upload an APK. Tally qualifies:
- MIT licence;
- no ads, no tracking, no network use (it doesn't even ask for the Internet permission);
- its only library, AndroidX WebKit, is open source and comes from Google's Maven;
- no signing key or other unknown binary in the source tree (only the standard Gradle wrapper).

Everything F-Droid reads is already in this repository:
- `fastlane/metadata/android/en-US/`: title, short and full description, icon, feature graphic, screenshots, and a
  changelog per version (`changelogs/<versionCode>.txt`);
- `gradle.properties`: `tallyVersion` / `tallyVersionCode`, the same numbers for everyone who builds from a tag;
- git tags `vX.Y.Z`, created by CI with every release;
- [`docs/fdroid/app.tally.expenses.yml`](fdroid/app.tally.expenses.yml): the build recipe to submit. Its `commit:` is
  the full commit hash of the newest release tag (`git rev-list -n 1 vX.Y.Z`).

**Signing, in one line:** F-Droid signs its copy with **its own key**. So the F-Droid copy and the GitHub/Play copies
can't update each other; switching means Backup → uninstall → install → Restore.

## Before you start
The repository must be **public** (GitHub → Settings → General → Danger Zone → Change visibility → Public). F-Droid and
IzzyOnDroid can only use public code. Nothing secret is in it: both signing keys live only in the repository secrets.

## Option A — IzzyOnDroid (quick, a day or two)
A popular extra repository that F-Droid users can add. It uses the **signed APKs from your GitHub releases**, so its
copy keeps your signature and can update the GitHub-installed app.
1. Create a free account on <https://codeberg.org>. IzzyOnDroid moved there from GitLab.
2. Read their [App Inclusion Policy](https://izzyondroid.org/docs/general/AppInclusionPolicy/).
3. Open a new issue at <https://codeberg.org/IzzyOnDroid/repodata/issues> titled "Inclusion request: Tally", using the
   template if one is offered. Include:
   - the link to this repository and the licence (MIT);
   - a line saying the signed APK is attached to each GitHub release (`Tally-vX.Y.Z.apk`);
   - a line saying the store metadata is in `fastlane/`.
4. Answer any questions. Once added, every new GitHub release shows up there automatically.

## Option B — the main F-Droid repository (a few weeks)
You add Tally's recipe to F-Droid's data repository with a merge request. Their CI checks and builds it, then a
volunteer reviews it.

1. **Accounts.** Create a free account on <https://gitlab.com>, and turn on two-factor login (GitLab asks for it before
   you can fork).
2. **Fork.** Open <https://gitlab.com/fdroid/fdroiddata> and click **Fork** (into your own namespace).
3. **Add the recipe.** In your fork, switch to a new branch named `tally`: in the web IDE, **+ → New file**. Create
   `metadata/app.tally.expenses.yml` and paste the contents of
   [`docs/fdroid/app.tally.expenses.yml`](fdroid/app.tally.expenses.yml), without the two `#` comment lines at the
   top. Commit it with the message `New app: Tally`.
4. **Merge request.** Click **Create merge request** from your `tally` branch into `fdroid/fdroiddata` → **`master`**.
   Title: "New app: Tally". Fill in the template's checklist: the app is yours, it's FLOSS (MIT), and it has no
   tracking or non-free dependencies.
5. **Let their CI run.** It runs `fdroid lint`, `fdroid rewritemeta` and `fdroid build` on the recipe:
   - if lint only reformats the file, apply its suggestion (the job log shows the exact diff);
   - if the build fails, copy the error into this project's chat or issues and we fix it here, in a new release.
6. **Review.** A volunteer may ask questions or tweak the recipe; reply in the merge request. After it's merged, Tally
   appears in the F-Droid app within a few days, on the next index build.

**Optional, if you have a Linux computer: check the recipe before submitting.** Install `fdroidserver` and the Android
SDK, clone your fork, and in its folder run:
```sh
fdroid readmeta
fdroid rewritemeta app.tally.expenses
fdroid lint app.tally.expenses
fdroid build -v -l app.tally.expenses
```
The merge request's CI does the same, so this is only to see the results sooner.

## After it's in
Nothing to do per release. When CI publishes a new `vX.Y.Z` tag, F-Droid notices it (`UpdateCheckMode: Tags`), reads
the new version from `gradle.properties` (`UpdateCheckData`), adds the build and publishes it. Just keep the release
checklist:
- bump `tallyVersion` **and** `tallyVersionCode`;
- add the `CHANGELOG.md` section **and** `fastlane/metadata/android/en-US/changelogs/<tallyVersionCode>.txt` (CI
  refuses to release without it).

## Later (optional): reproducible builds
If F-Droid can rebuild Tally bit-for-bit, it can ship the APK with **your** signature instead of its own, so all
sources update each other. The recipe would then add `Binaries:` (the GitHub release APK URL) and
`AllowedAPKSigningKeys:` (the release certificate, `9db8c89c…fac88`). The APK already leaves out the
dependency-metadata block, which is usually the first obstacle. Try it only once the plain F-Droid build is in.
