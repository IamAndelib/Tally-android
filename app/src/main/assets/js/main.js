/*
 * main.js — Start-up. Runs last, after every other file has defined its part.
 */
"use strict";

loadState();
applyTextScale();
readSys();
applyTheme();
applyNativeActions();
render();
armMidnight();
syncReminders();
syncWidget();
syncBackup();
mirrorNow();
if (unreadable)
  askDialog(
    "Couldn't open your saved data",
    unreadableKept
      ? "A copy is kept on this phone. Save it as a file so it's safe?"
      : "There isn't room to keep a copy on this phone. Save it as a file now, or it's gone once you add anything.",
    "Save file",
    () => saveOut("tally-unreadable-" + today() + ".json", "application/json", unreadable),
    { cancel: "Not now" }
  );
else if (!permsIntro()) backupNudge();
/* follow the phone's light/dark switch */
{
  const mq = matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener)
    mq.addEventListener("change", () => {
      applyTheme();
      render();
    });
}
/* hooks the Android shell (MainActivity.java) calls, installed last so they never run before the app is ready */
Object.assign(window, {
  tallyBack: goBack,
  tallyOpen: openFromNative,
  tallyResume: onAppResume,
  tallyTheme: onSystemTheme,
  tallySaved: onFileSaved,
  tallyFolder: onFolderPicked,
  tallyRestore: onRestorePicked,
  tallyPerms: onPerms,
  tallyPause: flushMirror,
});
/* the page is drawn: the shell ends its launch screen (the logo). Called right away, not from requestAnimationFrame,
   which a still-hidden WebView may never run. */
try {
  if (window.Android && Android.ready) Android.ready();
} catch (e) {}
