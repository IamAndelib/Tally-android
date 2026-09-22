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

## Reading PDF statements
Settings > "Claude for PDF statements": paste an API key from the Claude Console.
Each PDF read is billed to that API account. CSV import works without a key.

## Your data
Stored only on the phone. Use Settings > Save backup regularly; uninstalling deletes the data.
