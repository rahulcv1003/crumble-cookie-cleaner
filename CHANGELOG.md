# Changelog

All notable changes to Crumble are recorded here.

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
