/*
 * main.js — Start-up. Runs last, after every other file has defined its part.
 */
"use strict";

loadState();
readSys();
applyTheme();
applyNativeActions();
render();
syncReminders();
syncWidget();
if (unreadable)
  askDialog(
    "Couldn't open your saved data",
    "A copy is kept on this phone. Save it as a file so it's safe?",
    "Save file",
    () => saveOut("tally-unreadable-" + today() + ".json", "application/json", unreadable),
    { cancel: "Not now" }
  );
else if (activeAccounts().length) askNotify();
/* follow the phone's light/dark switch */
{
  const mq = matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) mq.addEventListener("change", applyTheme);
}
/* hooks the Android shell (MainActivity.java) calls, installed last so they never run before the app is ready */
Object.assign(window, {
  tallyBack: goBack,
  tallyOpen: openFromNative,
  tallyResume: onAppResume,
  tallyTheme: onSystemTheme,
  tallySaved: onFileSaved,
});
