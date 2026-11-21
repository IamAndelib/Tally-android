# Positioning record: Tally

Status: provisional (answers from the issues and download counts, no user survey)        Last updated: 2026-11-22

What Tally's pages (README, store listings, release notes) are for, and the true things they may say. Goal set by the
maintainer (2026-11-22): more people using Tally, and at least $100 in donations.

## The six questions

1. **Who:** an Android user who writes down spending by hand or in a spreadsheet, or left an expense app that wanted an
   account, showed ads or sent data away. Many hold money in several accounts and currencies (bank, cash, mobile
   wallet) and lend or borrow with people they know. They land from F-Droid, a privacy or FOSS list, or a post.
2. **Behavior:** install Tally (F-Droid first). For someone already using it: support it (Ko-fi, Liberapay), star the
   repository or help translate.
3. **What they believe:** expense apps are cluttered, push budgets, want sign-ups and sell data; free apps vanish.
4. **Journey:** mostly comparing (browsing F-Droid or a list of private apps).
5. **What stops them:** they never see Tally (reach is the bottleneck); on the page, a long text hides what it does.
6. **Evidence:** see below.

## Who it is not for

- People who want budgets or bank-statement import (left out on purpose until 1.6.0's Plan work); people who want
  their data synced across devices through a server.

## Customer words

| They said | Where (source, date) | Use for |
|---|---|---|
| "Search is just perfect, and so is filter!" | #47, 2026-11-14 | proof that History and search land |
| "Once again, just perfect!" | #41, 2026-11-14 | proof of responsiveness to requests |
| "it's good UI/UX wise" | #56, 2026-11-19 | design |
| "Thank you for building Tally as an open-source, privacy-friendly app." | #42, 2026-10-31 | privacy angle |

Words to avoid: "budget" for today's app (Tally has none yet; the old About line said it), "secure" or "encrypted"
for backups (plain JSON until #42 ships), any user count we can't show.

## Evidence (dated; caps what any page may claim)

- No `INTERNET` permission; a Content-Security-Policy blocks every request (manifest, `index.html`).
- On F-Droid with reproducible builds (2026-10); MIT licence; nine languages.
- 45 stars, 4 forks (2026-11-22). GitHub APK downloads: about 560 in all; 1.5.1 had 170 in its first 8 days. F-Droid
  publishes no counts.
- Donations: Ko-fi only, from Settings → About and the README.

## Decisions (maintainer, 2026-11-22)

- Repository About line and topics set; README rebuilt around highlights, the full feature list folded away.
- Screenshot file names stay fixed (F-Droid keeps old names forever); no request to F-Droid for now.
- No Google Play for now. Other stores and listings: to try (IzzyOnDroid's rules, Obtainium, AlternativeTo, the
  "awesome" lists of FOSS Android apps).
- Liberapay: yes, next to Ko-fi.
- Honest asks only: no made-up counts or reviews, no fake urgency, no repeated prompts.

## Later (noted 2026-11-22, not started)

- AlternativeTo listing, as an alternative to Money Lover, Monefy, Wallet and Spendee (the maintainer signs up).
- IzzyOnDroid: ask first; its rules usually leave out apps already on F-Droid.
- Samsung Galaxy Store, Huawei AppGallery: developer accounts with an identity check.
- Not Uptodown or APKPure: their store apps carry ads and tracking.
- A Ko-fi goal (a real one, saying what the money pays for); a one-time support card in the app after real use
  (mock-up first); a support line at the end of each GitHub release note; a Supporters line in the README (donors who
  agree); launch posts on F-Droid's forum, Reddit, Lemmy, Mastodon and Show HN with releases that have real news.
- Issue labels, GitHub Discussions, a translation platform (each a new service: maintainer's call).
- Google Play: not for now.
- Awesome lists that don't take Tally yet: offa/android-foss and pluja/awesome-privacy (6 months of development:
  from about 2027-03-22), lissy93/awesome-privacy (first stable release older than 4 months: from about 2027-01-24;
  its entries and PR text must be written by a person, any AI help disclosed). Sent on 2026-11-22: see Listings.

## Listings

| Where | Section | Sent | State |
|---|---|---|---|
| pcqpcq/open-source-android-apps | Finance | 2026-11-22, pcqpcq/open-source-android-apps#578 | open |
| Psyhackological/AAA | Finance | 2026-11-22, Psyhackological/AAA#140 | open |
| Axorax/awesome-free-apps (MOBILE.md) | Finance | 2026-11-22, Axorax/awesome-free-apps#549 | open |

## How we'll know

One number a month: Ko-fi + Liberapay supporters, next to GitHub release downloads. One change at a time.

## Changelog

- 2026-11-22 · first record, from the maintainer's goal and the issues.
