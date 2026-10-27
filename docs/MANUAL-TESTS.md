# Manual tests

Tests that need a person in a real browser. Each lists what to do and what to expect.
Load the extension: open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and pick the `dist/` folder.

| ID | Steps | Expected | Result |
|---|---|---|---|
| PER-03 | Pack the extension (or install from the store draft) on a fresh Chrome profile and note the install warnings | Warnings match `docs/PERMISSIONS.md` | |
| DEC-08 (browser part) | Turn on automatic cleaning. Open a site and log in. In `chrome://discards`, click "Discard" on that tab. Click "Clean now". Then turn on "Clean discarded tabs" and click "Clean now" again | First clean: still logged in. Second clean: the site's cookies are gone | |
| SWR-04 | Leave the browser idle for 10 minutes with nothing scheduled. Open `chrome://serviceworker-internals` and the extension's service worker in DevTools > Application > Background services | No alarms registered; worker stopped | |
| POP-07 | Open the popup 20 times on a normal site; time it with DevTools (Performance) or by eye on a laptop | Median under 150 ms | |
| STG-04 | Import a file with 2,000 rules (make one with any script, or ask Claude for a test file), open Lists, type in search | Page stays responsive; results update in under 100 ms | |
| BDG-04 | Turn on greyscale (Windows: Settings > Accessibility > Colour filters) and look at the toolbar icon on a kept, a kept-until-restart and an unlisted site | The three states are still distinguishable by shape (full, half, struck-through square) | |
| ACC-01 | Use the popup, settings page and welcome page with the keyboard only (Tab, Shift+Tab, Space, Enter, Esc) | Everything reachable; the focus ring is always visible | |
| ACC-02 | Turn on a screen reader (NVDA on Windows) and use the popup and settings | Switches are announced with their state; popup status changes are announced | |
| ACC-04 | Automated part passes (`tests/unit/design.test.ts`); look at the screenshots in both themes | Text is readable in light and dark | |
| UIQ-01 | Read `docs/DESIGN.md` | Palette, type, layout, principles and the review are there | |
| UIQ-02 | Look through `docs/screenshots/` against the current 0.2.0 direction in `docs/DESIGN.md` | Consistent typography, spacing, surfaces and readable controls in both themes; the owner-approved redesign supersedes the original visual restrictions | |
| Help controls | Hover an action; Tab to a setting's help button; press Escape and Enter; tap a help button on a touch display | Consequences appear before selection, help stays readable and within the window, Escape dismisses it, and reading help never changes a setting | |
| UIQ-03 | Read every string in `src/_locales/en/messages.json` (or `scripts/strings.py`, which is easier to read) | Sentence case, plain verbs, same names everywhere, no filler, no exclamation marks, no whitelist/greylist outside the importer | |
| UIQ-04 | Show the popup to someone who hasn't seen it | They can say what will happen to the current site | |
| Context menus | Settings > Display: turn on right-click menu entries; right-click a page and the toolbar icon | "Keep this site", "Keep this site until restart" and "Clean this site now" appear and work | |
| Notifications | Settings > Display: turn on notifications; run "Clean now" | A short notification "Cleaned N sites, M cookies." appears | |
