# Publishing Tally on Google Play — step by step

Everything the app needs is ready in this repository: a signed **.aab** (Android App Bundle, the file format Play
takes) attached to every GitHub Release from 1.1.1 on, the store texts in [`docs/play/listing.md`](play/listing.md) and graphics in [`fastlane/metadata/android/en-US/images/`](../fastlane/metadata/android/en-US/images/), and a
privacy policy in [`privacy-policy.md`](privacy-policy.md). What's left happens in your Google account.

Plan on **3–4 weeks** in total, mostly waiting: account verification (a few days), a required 14-day closed test, then
review (a few days).

## 1. Create a developer account (once)
1. Go to <https://play.google.com/console> and sign in with the Google account you want to own the app.
2. Choose **Personal** account (for yourself, not a company).
3. Pay the one-time **US$25** registration fee.
4. Verify your identity: legal name, address, a photo ID, and a phone number/email. This can take a few days.
5. You'll also be asked to verify you have an Android device (via the Play Console app) — install it on your phone.

## 2. Know the one big rule for new personal accounts
Before you can publish to everyone, Google requires a **closed test with at least 12 testers who stay opted in for 14
days in a row**. Line up 12+ friends or classmates with Android phones and a Google account now. They just need to
tap a link, join, and install Tally from Play (and keep it installed).

## 3. Put the privacy policy online
Play needs a public web link to your privacy policy, and this repository is private. Easiest options:
- **Make the repository public** (Settings → General → Change visibility) and use
  `https://github.com/IamAndelib/Tally-android/blob/main/docs/privacy-policy.md`, or
- create a public **GitHub Gist** (<https://gist.github.com>), paste the contents of `docs/privacy-policy.md`, and use
  its link.

## 4. Create the app
In Play Console: **Create app** → name "Tally: Pocket Money Notebook" → language English → **App** → **Free** → tick
the declarations → **Create app**.

## 5. Fill in the "Set up your app" checklist (Dashboard)
Answer each task; Tally's answers:

| Task | Answer |
| --- | --- |
| Privacy policy | the link from step 3 |
| App access | All functionality is available without special access (no login) |
| Ads | No, my app does not contain ads |
| Content rating | Start questionnaire → category **All other app types** → answer No to everything → rating Everyone |
| Target audience | **18 and over** (keeps the extra children's-app rules away) |
| News app | No |
| Data safety | Does your app collect or share any of the required user data types? **No**. Is data encrypted in transit? Not applicable (nothing is sent). Can users request deletion? Data is on-device; uninstalling deletes it |
| Government app | No |
| Financial features | Choose **"My app doesn't provide any financial features"** only if offered; otherwise pick the closest to *personal finance tracking / budgeting* and state it holds no money, gives no loans and connects to no bank |
| Health apps | Not a health app |

## 6. Store listing
**Grow → Store presence → Main store listing**: paste the texts from [`docs/play/listing.md`](play/listing.md) and
upload:
- App icon: `fastlane/metadata/android/en-US/images/icon.png`
- Feature graphic: `fastlane/metadata/android/en-US/images/featureGraphic.png`
- Phone screenshots: 4–8 from `fastlane/metadata/android/en-US/images/phoneScreenshots/`
Set **App category → Finance** and your **contact email** under Store settings.

## 7. Signing
When you create the first release, Play offers **Play App Signing** — accept it (Google keeps the final signing key).
The .aab from GitHub is signed with Tally's release key, which Play then treats as your **upload key**. Keep the
backup of that key (`tally-release.jks` + its password) safe and private: every future update must be signed with it.

## 8. Closed test (the 14 days)
1. **Test and release → Testing → Closed testing → Create track** (or use "Alpha").
2. **Testers**: create an email list with your testers' Gmail addresses.
3. **Create release** → upload `Tally-vX.Y.Z.aab` from the latest GitHub Release → release notes (copy from
   CHANGELOG) → **Review release → Start rollout**.
4. Copy the **opt-in link** and send it to your testers. Each opens it, taps "Become a tester", then installs Tally
   from the Play Store link.
5. Wait 14 days with at least 12 still opted in. Fix anything they report (a new release is just a new .aab upload to
   the same track).

## 9. Go live (Production)
1. On the Dashboard, **Apply for production** and answer the short questions about your test.
2. Once approved: **Production → Create release** → upload the same (or newer) .aab → **Start rollout**.
3. Google reviews it (usually 1–7 days). Then Tally is on the Play Store.

## 10. Updating later
Each release: bump `tallyVersion` + CHANGELOG, merge to `main` (CI builds, signs and publishes the GitHub Release with
the .aab), then in Play Console **Production → Create release** → upload the new `.aab`. Version codes increase
automatically.

## Worth knowing
- Test builds ("Tally Dev") and GitHub APKs are separate from the Play version. A phone with the GitHub-installed
  release can update from Play only if Play App Signing uses the same key; to be safe, back up (Settings → Backup),
  uninstall, install from Play, restore.
- Play requires apps to target a recent Android version; each year this moves up by one. When Play Console warns
  about it, ask for a targetSdk bump.
