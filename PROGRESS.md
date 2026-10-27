# Build progress (handoff file)

This file is the single place that says where the build stands, so any session can resume.
Resume rule: read `crumble-cookie-cleaner-PRD.md`, then this file, then `docs/DECISIONS.md`, then continue at "Next step".

## Status
- UI update: 0.2.0 (27 Oct 2026). Premium visual redesign, bundled Inter font, contextual help, refreshed screenshots/store assets and documentation. See `docs/UI-UPDATE-2026-10-27.md` and `docs/TEST-RESULTS.md` for current verification. Earlier phase counts below describe 0.1.0.
- Phase A: DONE (15 Oct 2026). See PHASE-A-REPORT.md.
- Phase B (cleanup engine): DONE (15 Oct 2026). 78 unit + 34 E2E pass. See docs/TEST-RESULTS.md
- Phase C (interface): DONE (15 Oct 2026). 112 unit + 68 E2E pass. Owner review pending for UIQ-02/03.
- Phase D (hardening and release prep): DONE (15 Oct 2026). Final run: 118 unit + 74 E2E pass, 1 skipped (manual).

## Owner decisions (15 Oct 2026, "go with defaults")
- Unsafe regex rules: rejected, reason shown (also in the import preview).
- IP-range (CIDR) rules from Cookie AutoDelete imports: listed as "can't be imported" with a reason.
- UI wording: Claude drafts; owner reviews all strings at the end of Phase C.
- Uninstall feedback form URL: placeholder in the config file.
- Name: "Crumble" stays the working name; clash check before release.
- Final test: owner loads dist/ into his own Chrome (Load unpacked) and runs the final checklist.

## How to build and test
- `npm install`, `npm test` (on Linux without a display: `xvfb-run -a npm test`). E2E uses port 443.

## Phase B checklist
- [x] core/decide.ts (pure decision) + unit tests DEC-01..08
- [x] background/open-sites.ts, seen-origins.ts, tab map
- [x] background/cleanup.ts (lock, batches, verify+retry, site data, log, undo buffer, progress)
- [x] background/scheduler.ts (session-stored pending cleanups, alarm + setTimeout, overdue on wake, cancel on reopen)
- [x] background/triggers.ts (tab close, domain change, startup, manual messages, command, alarms)
- [x] unit tests with fake chrome API (78 unit tests passing): DEC-09..12, PRT-07, DAT-07, SWR-05, SWR-06, LOG-02
- [x] E2E: RUL-10, DEC-09/11/13(engine), PRT-01..05, DAT-01..05/08/09/10, TRG-01..10, SWR-01..03 (DEC-08 browser half -> docs/MANUAL-TESTS.md)
- [x] docs updated, folder synced

## Phase C checklist
- [x] docs/DESIGN.md (palette, type, layout per screen with ASCII wireframes, 3 principles, review changes)
- [x] icons (scripts/icons.mjs -> assets/icons; status marks + greyscale + product icon)
- [x] popup (src/ui/popup)
- [x] settings page (src/ui/settings)
- [x] welcome + 3-step setup (src/ui/welcome)
- [x] badge + icon state, context menus, notifications, onInstalled opens welcome (install only)
- [x] import/export (core/import-export.ts + unit tests IMP-01/03/04/05, PRV-02)
- [x] tests: SUP-*, POP-*, STG-*, LOG-*, UND-*, IMP-*, BDG-*, ACC-03, PRT-06, DAT-06, DEC-13 popup part, re-run SET-05
- [x] screenshots generated (tests/e2e/screenshots.spec.ts); first review done, wording fixed
- [x] final screenshot review + record in DESIGN.md

## Phase D checklist
- [x] INC-01..03 (incognito E2E)
- [x] PRF-01 (300-cookie tab-close cleanup < 1 s), PRF-02 bundle budget test (done as early check)
- [x] PRV-01 (zero network requests from extension contexts)
- [x] CMP-03 (third-party cookies blocked)
- [x] docs/PRIVACY.md, store/listing-en.md, landing site (site/), README, CONTRIBUTING, LICENSE, issue form
- [x] packaging script (zip from dist/, no maps/tests), release checklist
- [x] final full suite, final report, final-test checklist for the owner (load dist/ in Chrome)

## Next step
Build complete. Waiting for the owner:
1. Final test in his own Chrome (FINAL-TEST.md), then report results.
2. Owner reviews: UI strings (scripts/strings.py), screenshots (docs/screenshots, store/), DESIGN.md.
3. Manual tests (docs/MANUAL-TESTS.md).
4. Release steps that need his store accounts (docs/RELEASE-CHECKLIST.md): store listings and the final store review URL in src/config.ts. The GitHub repository and Pages workflow are configured.
If the owner reports a problem: reproduce in an E2E test first, fix, run `xvfb-run -a npm test`, sync.
