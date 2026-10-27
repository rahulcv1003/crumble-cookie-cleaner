# Your final test in Chrome

About 15 minutes. Use a **new Chrome profile** so your own logins are never at risk: click your profile picture in Chrome, then **Add**, then **Continue without an account**. Do every step in that profile.

## 1. Install
This checklist applies to the 0.2.0 interface. Rebuild with `npm run build` before loading `dist/`; use `release/crumble-0.2.0.zip` for the store draft.
1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked**, open your Cookie Remover folder, then open the `dist` folder and select it. Inside it you should see `manifest.json`, `background.js` and `popup.html`.
3. Expected: the welcome page opens by itself, and Chrome shows the extension with no red **Errors** button.

## 2. Setup
4. Before finishing setup, open two sites in new tabs, for example `wikipedia.org` and `bbc.co.uk`, then reload the welcome page.
5. Expected: step one lists both sites, ticked. Untick `bbc.co.uk` and click **Keep 1 site**, then **Skip this step**, then **Start cleaning automatically**.
6. Expected: "Automatic cleaning is on."

## 3. Tab-close cleaning
7. Pin the Crumble icon (the puzzle piece next to the address bar, then the pin). On `bbc.co.uk`, open the popup. Expected: "Will be cleaned after you close it." with a cookie count, and the toolbar icon is an empty square with a stroke.
8. On `wikipedia.org`, open the popup. Expected: "Kept." and a filled square.
9. Close the `bbc.co.uk` tab and wait 20 seconds. Open the popup on any site. Expected: "Cleaned N sites, M cookies, …" and an **Undo cleanup** link.
10. Click **Undo cleanup**. Expected: "Restored N cookies. Site data can't be restored."

## 4. Settings and import
Hover an action or focus a `?` help button before changing an option. Check the explanation, dismiss it with Escape, and verify that opening help has not changed the setting. Try both Windows light and dark modes.
11. Click **Settings** in the popup. Expected: your Keep rule `*.wikipedia.org` in Lists, and the cleanup in Log with reasons.
12. Click **Import rules** and choose `tests/fixtures/cad-docs-example.json` from the Cookie Remover folder. Expected: a preview with 4 rules to add, a choice for container rules, and nothing changed until you click **Import rules**.

## 5. Restart
13. Close Chrome completely, then reopen the same profile. Open Settings, Log. Expected: a "Browser started" cleanup.

## 6. Manual checks while you're there (optional)
14. Work through `docs/MANUAL-TESTS.md` (keyboard-only use, popup speed, greyscale icons, and more). Record results in the table.

If anything looks wrong, note the step number and what you saw, and I'll fix it.

When you're done, remove the test profile (profile picture, then the gear icon, then the three dots next to the profile, then **Delete**).
