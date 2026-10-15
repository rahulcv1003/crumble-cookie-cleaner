# Build report: Crumble 0.1.0

15 October 2026. All four build phases (A to D) are done. The extension is in `dist/` (load it with "Load unpacked") and the store zip is `release/crumble-0.1.0.zip`.

## Tests

The final `npm test` run passed typecheck, lint and the production build, then:

- **118 unit tests passed.**
- **74 end-to-end tests passed and 1 was skipped.** They ran on Playwright's Chromium 141 against local test sites.

The skipped test is the browser half of DEC-08 (discarded tabs). Playwright loses its connection to the browser after a tab is discarded, so it is on the manual list; the decision itself is unit-tested.

Per-test results are in `docs/TEST-RESULTS.md`. Tests that need a person are in `docs/MANUAL-TESTS.md`.

## What was built

- **Cleanup engine:**
  - It sweeps every cookie in every store, partitioned ones included, and removes them in batches of 100.
  - It re-reads to confirm each deletion and retries once.
  - It cleans site data through the top-level origin, which also clears embedded storage.
  - One run at a time; triggers that arrive mid-run are merged.
  - Every scheduled cleanup has a backup alarm and is caught up when the service worker wakes.
  - The startup cleanup uses an on-disk list of origins, and the 2-minute undo buffer lives only in memory.
- **Interface:**
  - The popup has a status mark (also used as the toolbar icon, with a greyscale set) and a cookie count badge.
  - The settings page has Lists, Cleaning, Site data, Log, Display and About sections.
  - There is a three-step welcome setup, plus context menus, notifications, a keyboard command, import from Cookie AutoDelete and export.
  - The UI follows the design plan in `docs/DESIGN.md`, in light and dark. axe-core finds 0 issues, and every text colour meets WCAG AA.
- **Release preparation:**
  - store listing text and images (`store/`);
  - landing site (`site/`, Lighthouse 100 across the board);
  - permission and privacy documents;
  - README, CONTRIBUTING, LICENSE and the issue form;
  - packaging script, release checklist, and your final-test guide (`FINAL-TEST.md`).

## Unclear or contradictory in the PRD, and what I did

1. **Original syntax vs the PRD's own tests.** Cookie AutoDelete's real matching differs from the PRD's tests in a few places: its `*.` also matched `notexample.com`, and it stripped `www1.`/`www2.` as well as `www.`. I followed the PRD each time (details in PHASE-A-REPORT.md).
   - IP-range rules are listed as "can't be imported", per your default.
2. **Regex safety.** The PRD's limits (200 characters and time-boxed tests) don't stop a short regex from freezing the extension. I also reject nested or alternating repetition, and more than two `*`/`+` repeats, per your default.
3. **Status when automatic cleaning is off.** The popup still says "Will be cleaned after you close it". That is what the next cleanup will do, although with automatic cleaning off, "next" means your next "Clean now". The switch below shows that automatic cleaning is off.
4. **"Clean this site now" ignores lists and open tabs.** It deletes everything for that site, because that is what the button says.
5. **Cookie limits.** UND-04 can't produce the "site at its cookie limit" case naturally: Chrome drops the oldest cookies, and restored ones are the newest. The same "Chrome refused some restored cookies" path is tested with cookies that expire before undo.
6. **"Clear existing data" offer (DAT-06).** It needs to know which sites had data. That information is kept in memory only (never on disk) while a site data type is switched off, so no lasting history of visited sites is created.
7. **SUP-01.** Playwright can only load an extension at browser launch, so the test opens the sites right after install and reloads the welcome page.
8. **Links in the build.** PER-02's "no remote URLs" check now allows exactly the project links in `src/config.ts` (changelog, privacy, issues, store review, uninstall form). These are opened only when you click them, and the PRD asks for them.

## Deviations, and why

- **Where it was built and tested.** Everything was built and tested in Claude's cloud sandbox on Chromium 141. Newer Chrome builds and Edge couldn't be downloaded there; your final test in current Chrome covers that gap.
- **Two test pages that never ship.** The test build (`dist-test/`) adds a hidden test page so the browser tests can drive the real code. The store build (`dist/`) never contains it.
- **One icon record for tests.** The toolbar icon chosen for each tab is recorded in memory-only session storage, because Chrome can't report it back and the tests need to check it.
- **Things you have to do.** Store submissions still need your developer accounts. The Chrome Web Store review URL remains unset in `src/config.ts` until the store provides an extension ID.

## What's left for you

1. Run `FINAL-TEST.md` in a fresh Chrome profile.
2. Review the UI text (`scripts/strings.py`) and the screenshots (`docs/screenshots/`, `store/screenshots/`).
3. Work through `docs/MANUAL-TESTS.md`.
4. Follow `docs/RELEASE-CHECKLIST.md` when you're ready to submit the extension stores.
