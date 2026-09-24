# Tally (Android)

## Get the APK without installing anything (GitHub, free)
1. Make a free account at github.com and create a new repository (any name, Private is fine).
2. On a computer, unzip this folder. In the new repository click "uploading an existing file"
   and drag in EVERYTHING inside the Tally folder (including the hidden `.github` folder).
   Tip: on Mac press Cmd+Shift+. in Finder to show hidden folders; on Windows use View > Hidden items.
3. Click "Commit changes". Open the "Actions" tab and wait about 5 minutes for "Build APK" to turn green.
4. Open that run, scroll to "Artifacts", download "Tally-apk". Unzip it to get app-debug.apk.
5. Send the APK to your phone, tap it, and allow "Install unknown apps" when Android asks.

## Or with Android Studio
Open this folder in Android Studio, wait for it to sync, then Build > Build APK(s).

## How it works
- Add your money sources once (bank, bKash, cash wallet...) with what each holds right now.
- Each morning Tally asks if the balances still match. Tap "All match", or "Fix" one.
- Spent something? Tap its category on the home screen, type the amount, Save.
- Moved money (ATM, bank → bKash)? Tap "Move". Add the fee if there was one.
- A balance looks wrong? Tap the account and type what you really have. Tally records a balance fix.

## Your data
Stored only on the phone. Use ⋮ > Settings > Save backup regularly; uninstalling deletes the data.
