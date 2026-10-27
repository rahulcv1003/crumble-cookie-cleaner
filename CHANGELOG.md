# Changelog

All notable changes to Crumble are recorded here.

## 0.2.0 — 27 October 2026

### Changed

- Redesigned the popup, settings, and first-run setup with a refined light/dark palette, softer surfaces, clearer hierarchy, and more deliberate spacing.
- Bundled the Inter 4.1 variable typeface locally, including its font licence; no font service is contacted.
- Added original sidebar icons, active navigation styling, responsive settings layouts, and improved keyboard focus.
- Added contextual tooltips for settings, site rules, setup choices, cleanup actions, import/export, and Undo. Help works on hover and focus, supports touch/keyboard activation, and dismisses with Escape.
- Clarified that cookie Undo lasts two minutes and never restores deleted site data.
- Refreshed documentation and store artwork for the redesigned interface.
- Made screenshot commands work in both Windows and Linux.

Cleanup rules, defaults, storage schema, and permission scope are unchanged.

## 0.1.0 — 15 October 2026

Initial public release candidate.

### Added

- Automatic cookie and site-data cleanup after the last tab for a site closes.
- Keep and Keep until restart rule lists with domain, wildcard, and regular-expression matching.
- First-party, third-party, and partitioned-cookie cleanup with deletion verification and retry.
- LocalStorage, IndexedDB, Cache Storage, and Service Worker cleanup controls.
- Resilient scheduling across Manifest V3 service-worker suspension and browser restarts.
- Popup, settings, first-run setup, cleanup log, two-minute cookie undo, badges, and themes.
- Cookie AutoDelete list import and Crumble settings export.
- Context-menu actions, notifications, and a Clean now keyboard command.
- Store assets, a static landing site, privacy and permission documentation, and automated release packaging.
- Unit and installed-extension browser test suites.

### Known release steps

- Complete the manual Chrome and Edge checks in `FINAL-TEST.md` and `docs/MANUAL-TESTS.md`.
- Add the Chrome Web Store extension ID to `src/config.ts` after the listing exists.
