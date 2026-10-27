# Test results

## Interface update: 27 October 2026 — 0.2.0

- **Final release verification passed:** [GitHub CI run 40470270618](https://github.com/rahulcv1003/crumble-cookie-cleaner/actions/runs/40470270618),
  tested source `375a79a21cbd33a94ebd13184f55ec31cfa6d838` on Ubuntu 24.04,
  Node 22.23.3 and Playwright Chromium 141.0.7390.37.
- Typecheck, lint, production build, **120 unit tests** and **78 browser tests**
  passed. The one existing discarded-tab scenario remains intentionally skipped
  for manual acceptance. No unexpected failures or retries.
- Restart, update and all three incognito tests passed on Linux. Both themes'
  popup/settings/setup axe checks reported **zero violations**. The production
  smoke and no-network tests passed.
- Packaging, **3 interface screenshot generators** and **1 store-asset generator**
  passed in the same CI run. The `release-review` artifact contains the release
  ZIP, screenshots, promotional artwork and machine-readable test results.

### Local verification and environment notes

- Typecheck, lint, production build and all **120 unit tests** passed on Windows.
- The full Windows browser attempt recorded 65 passes, 13 failures and the existing
  discarded-tab skip. Ten failures occurred before the test body because the
  persistent-install helper expects Linux's `Preferences` layout; Windows stores
  those extension entries in `Secure Preferences`. These are not counted as passes.
- Fixed a keyboard-focus scrolling issue that dismissed help, and updated the
  open-tabs confirmation assertion for its clearer cookie/site-data warning.
  A targeted run then passed all **5 tests**, covering all three help tests,
  open-tabs cleanup confirmation, and the data-type preservation test that timed
  out once in the full run.
- Both themes' axe checks passed with **zero violations**. The production-build
  setup/popup/settings smoke test and no-network test also passed.
- The 41-file `release/crumble-0.2.0.zip` includes the local Inter variable font,
  its OFL licence and runtime notices; test hooks, fixtures and source maps are absent.
- All **3 interface screenshot generators** and the **store-asset generator** passed;
  the refreshed screenshots and promotional artwork were visually reviewed.
- The successful full Linux CI run above is the authoritative
  restart/incognito/update check; the Windows fixture limitation remains documented.
- The first CI attempt stopped before tests because `ubuntu-latest` had moved
  to Ubuntu 26.04, unsupported by the pinned Playwright 1.56.0. CI now uses
  Ubuntu 24.04 explicitly, matching the earlier successful release environment.
- New help behaviour, typography and screenshots are described in
  [the interface update](UI-UPDATE-2026-10-27.md). Real Chrome, screen-reader and
  touch acceptance remain in [manual tests](MANUAL-TESTS.md).

## Pre-store release review: 19 October 2026

- Tested source: `57f6b54a41d655d8f8a7181632f453b9ef34e988`.
- [GitHub CI evidence](https://github.com/rahulcv1003/crumble-cookie-cleaner/actions/runs/39217361092): typecheck, lint, build, **118 unit tests**, **75 browser tests**, and **2 screenshot-generation tests** passed.
- One discarded-tab browser test remains intentionally skipped; zero unexpected failures and zero flaky tests.
- Added a production-build smoke test covering first-run setup, popup, settings, and the inspiration credit without test hooks.
- The 39-file release ZIP includes Crumble's licence and bundled runtime dependency notices.
- Fresh About screenshots reviewed in both themes. Full scope and remaining manual acceptance steps: [release review](RELEASE-REVIEW-2026-10-19.md).

## Phase A: 15 October 2026

- Build version: 0.1.0 (`manifest.json`)
- Browser: Chromium 141.0.7390.37, the build bundled with Playwright 1.56.0
- Node 22.22.0, Ubuntu 24.04 (Claude's cloud sandbox: 2 vCPU), Chromium headed under Xvfb
- How to run: `npm test` runs typecheck, lint, the production build, unit tests (Vitest), the test build and E2E tests (Playwright). On Linux without a display, run `xvfb-run -a npm test`. E2E serves the test sites on port 443.

### Rule matching
| ID | Result | How | Notes |
|---|---|---|---|
| RUL-01 | PASS | Unit | Also case, trailing dot, leading-dot cookie domain |
| RUL-02 | PASS | Unit | |
| RUL-03 | PASS | Unit | |
| RUL-04 | PASS | Unit | |
| RUL-05 | PASS | Unit | |
| RUL-06 | PASS | Unit | Also the PRD's `a.com, *.b.com, /c\.(com\|net)/` example and a comma inside a regex |
| RUL-07 | PASS | Unit | Message: `"/[a-/" has a [ without a closing ]. Close the character class.` |
| RUL-08 | PASS | Unit | Plus extra time-boxed check: every accepted pattern matches a 253-character hostname in under 100 ms |
| RUL-09 | PASS | Unit | |
| RUL-10 | PASS (unit part) | Unit | E2E part needs the cleanup engine; to run in Phase B |
| RUL-11 | PASS | Unit | |
| RUL-12 | PASS | Unit | |

### Settings and storage
| ID | Result | How | Notes |
|---|---|---|---|
| SET-01 | PASS | Unit | Defaults, plus what `onInstalled(install)` writes |
| SET-02 | PASS | E2E (restart profile) | Every setting changed, browser closed and reopened on the same profile |
| SET-03 | PASS | Unit | Schema-less settings (schema 0) migrate to 1; pipeline also tested with a renaming migration |
| SET-04 | PASS | Unit | |
| SET-05 | PASS | E2E (persistent install) | Update simulated by raising the version and calling `chrome.runtime.reload()`; the log is a placeholder key until the log is built |

### Permissions and manifest
| ID | Result | How | Notes |
|---|---|---|---|
| PER-01 | PASS | Unit (CI) | |
| PER-02 | PASS | Unit (CI) | Also no `WebSocket`, `sendBeacon`, `importScripts`, string timers or any `http(s)://` URL in the build |
| PER-03 | NOT RUN | Manual | Needs a person to install the packed extension and record Chrome's warnings in `docs/PERMISSIONS.md` |
| PER-04 | PASS (Phase A scope) | Unit (CI) | No UI exists yet; the check covers the manifest, every message key used, and literal text in any `src/ui` HTML |

### Extra checks (not PRD test IDs)
| Check | Result |
|---|---|
| ENV-01 test environment: extension loads; partitioned cookie with full key; third-party cookie stored; storage partitioning on; mock SSO login works | PASS |
| STO-01 early: name 41 characters, short description 115 characters | PASS |
| PRF-02 early: service worker bundle 103 KB, 105,691 bytes (budget 220 KB) | PASS |

## Phase B: 15 October 2026

- Build 0.1.0. Same environment as Phase A (Chromium 141.0.7390.37, Playwright 1.56.0, Linux cloud sandbox, 2 vCPU).
- Totals: 78 unit tests and 34 E2E tests pass; 1 E2E test is skipped (DEC-08 browser part, now manual).

### Cleanup decision
| ID | Result | How | Notes |
|---|---|---|---|
| DEC-01 | PASS | Unit | |
| DEC-02 | PASS | Unit | Every cleanup type |
| DEC-03 | PASS | Unit | |
| DEC-04 | PASS | Unit | Also: kept at startup while still open |
| DEC-05 | PASS | Unit | |
| DEC-06 | PASS | Unit | |
| DEC-07 | PASS | Unit | Open-site map built from a fake tabs.query |
| DEC-08 | PASS (unit) / MANUAL (browser) | Unit | Playwright loses the browser after `tabs.discard`; browser check moved to MANUAL-TESTS.md |
| DEC-09 | PASS | Unit + E2E | Merged runs, follow-up runs, scheduling window |
| DEC-10 | PASS | Unit | |
| DEC-11 | PASS | Unit + E2E | |
| DEC-12 | PASS | Unit | |
| DEC-13 | PASS (engine part) | E2E | 3,194 cookies (Chrome's cap) removed in 6.6 s, 61 progress readings; the popup part runs in Phase C |

### Partitioned and third-party cookies
| ID | Result | How |
|---|---|---|
| PRT-01 | PASS | E2E |
| PRT-02 | PASS | E2E |
| PRT-03 | PASS | E2E |
| PRT-04 | PASS | E2E |
| PRT-05 | PASS | E2E |
| PRT-06 | Phase C (popup) | |
| PRT-07 | PASS | Unit |

### Site data
| ID | Result | How |
|---|---|---|
| DAT-01 | PASS | E2E |
| DAT-02 | PASS | E2E |
| DAT-03 | PASS | E2E |
| DAT-04 | PASS | E2E |
| DAT-05 | PASS | E2E |
| DAT-06 | Phase C (settings UI) | |
| DAT-07 | PASS | Unit |
| DAT-08 | PASS | E2E |
| DAT-09 | PASS | E2E |
| DAT-10 | PASS | E2E (restart profile) |

### Triggers and delay
| ID | Result | How | Notes |
|---|---|---|---|
| TRG-01 | PASS | E2E | Cleaned between 15 and 20 s |
| TRG-02 | PASS | E2E | Scheduled cleanup cancelled on reopen |
| TRG-03 | PASS | E2E | Alarm at 120 s; ran 119 to 125 s after close |
| TRG-04 | PASS | E2E | |
| TRG-05 | PASS | E2E | |
| TRG-06 | PASS | E2E | |
| TRG-07 | PASS | E2E (restart profile) | |
| TRG-08 | PASS | E2E (restart profile) | |
| TRG-09 | PASS | E2E (restart profile, real session restore) | |
| TRG-10 | PASS | E2E | |

### Service worker resilience
| ID | Result | How |
|---|---|---|
| SWR-01 | PASS | E2E (worker stopped through CDP) |
| SWR-02 | PASS | E2E |
| SWR-03 | PASS | E2E |
| SWR-04 | MANUAL | docs/MANUAL-TESTS.md |
| SWR-05 | PASS | Unit (module-state audit) |
| SWR-06 | PASS | Unit |

Also re-run and passing: every Phase A test (RUL, SET, PER-01/02/04), ENV-01, and RUL-10's browser half (now automated).

## Phase C: 15 October 2026

- Build 0.1.0, same environment (Chromium 141.0.7390.37, Playwright 1.56.0).
- Totals: 112 unit tests and 68 E2E tests pass; 1 E2E test is skipped (DEC-08 browser part, manual). axe-core finds 0 violations of any impact on all three pages, in both themes.

### First-run setup
| ID | Result | How | Notes |
|---|---|---|---|
| SUP-01 | PASS | E2E | Playwright can only load an extension at launch, so the sites open right after install and the welcome page re-reads them |
| SUP-02 | PASS | E2E | |
| SUP-03 | PASS | E2E | Automatic cleaning applies at once (tab-close cleanup ran with no restart) |
| SUP-04 | PASS | E2E | |
| SUP-05 | PASS | E2E | |

### Popup
| ID | Result | How |
|---|---|---|
| POP-01 | PASS | E2E |
| POP-02 | PASS | E2E (icon checked within 1 s) |
| POP-03 | PASS | E2E |
| POP-04 | PASS | E2E (page not reloaded: in-page marker survives) |
| POP-05 | PASS | E2E |
| POP-06 | PASS | E2E |
| POP-07 | MANUAL | docs/MANUAL-TESTS.md |
| PRT-06 | PASS | E2E |
| DEC-13 (popup part) | PASS | E2E: progress line shown; popup answers in under 500 ms while 3,194 cookies are removed |

### Settings page
| ID | Result | How |
|---|---|---|
| STG-01 | PASS | E2E |
| STG-02 | PASS | E2E |
| STG-03 | PASS | E2E |
| STG-04 | MANUAL | docs/MANUAL-TESTS.md |
| DAT-06 | PASS | E2E |

### Log and undo
| ID | Result | How | Notes |
|---|---|---|---|
| LOG-01 | PASS | E2E | |
| LOG-02 | PASS | Unit | |
| LOG-03 | PASS | E2E | |
| UND-01 | PASS | E2E | |
| UND-02 | PASS | E2E | |
| UND-03 | PASS | E2E (restart profile) | Also confirms the cookie value is in no file of the profile on disk |
| UND-04 | PASS | E2E | Chrome evicts least-recently-used cookies, so restored ones (the newest) survive at the cap. The "refused restore" path is forced with cookies that expire before undo; the message shows only what came back |

### Import and export
| ID | Result | How |
|---|---|---|
| IMP-01 | PASS | Unit + E2E |
| IMP-02 | PASS | E2E |
| IMP-03 | PASS | Unit + E2E |
| IMP-04 | PASS | Unit |
| IMP-05 | PASS | Unit + E2E (malformed file in the UI) |

### Badge and icon
| ID | Result | How |
|---|---|---|
| BDG-01 | PASS | E2E |
| BDG-02 | PASS | E2E |
| BDG-03 | PASS | E2E |
| BDG-04 | MANUAL | docs/MANUAL-TESTS.md |

### Accessibility
| ID | Result | How |
|---|---|---|
| ACC-01 | MANUAL | |
| ACC-02 | MANUAL | |
| ACC-03 | PASS | E2E (axe-core: wcag2a/aa, wcag21a/aa, best-practice) |
| ACC-04 | PASS (automated part) / MANUAL | Unit: every text colour at least 4.5:1 in both themes |

### UI quality
| ID | Result | How |
|---|---|---|
| UIQ-01 | Ready for review | docs/DESIGN.md |
| UIQ-02 | Self-reviewed; owner review pending | docs/DESIGN.md "Self-review", docs/screenshots/ |
| UIQ-03 | Owner review pending | scripts/strings.py |
| UIQ-04 | MANUAL | |

Also re-run and passing: all Phase A and B tests, and SET-05 (an update opens no tab now that install opens the welcome page).

## Phase D: 15 October 2026 (final run)

- Build 0.1.0, Chromium 141.0.7390.37 (Playwright 1.56.0), Linux cloud sandbox (2 vCPU).
- Final full run (`npm test`): typecheck, lint, production build, **118 unit tests pass**, **74 E2E tests pass**, 1 skipped (DEC-08 browser part; on the manual list).

### Incognito
| ID | Result | How |
|---|---|---|
| INC-01 | PASS | E2E (persistent install, incognito not allowed: no incognito store visible, nothing cleaned there) |
| INC-02 | PASS | E2E (incognito allowed: closing an incognito tab cleans that store with the same rules) |
| INC-03 | PASS | E2E |

### Performance
| ID | Result | How | Notes |
|---|---|---|---|
| PRF-01 | PASS | E2E | 302 cookies removed in 128 ms (budget 1 s) |
| PRF-02 | PASS | Unit | Service worker 161 KB (220), popup 6.6 KB (60), settings 31 KB (150), welcome 18 KB |
| PRF-03 | MANUAL | | No content scripts, so no page-load effect is expected |
| PRF-04 | Measured here / MANUAL on a laptop | E2E | Read and decide over 3,194 cookies: about 40 ms. Removal about 6.6 s on this 2-CPU sandbox; needs a laptop measurement (budget 10 s) |

### Privacy and security
| ID | Result | How | Notes |
|---|---|---|---|
| PRV-01 | PASS | E2E | Monitors extension pages and the service worker for a full session; a deliberate request proves the monitor sees extension traffic |
| PRV-02 | PASS | Unit | |
| PRV-03 | MANUAL | | Compare docs/PRIVACY.md with behaviour |
| PER-03 | PASS (automated part) / MANUAL | E2E | Chrome's own warning list (`getPermissionWarningsByManifest`) matches docs/PERMISSIONS.md |

### Compatibility
| ID | Result | How | Notes |
|---|---|---|---|
| CMP-01 | PARTIAL | E2E | Full suite passes on Chromium 141. Chrome stable and Edge stable could not be downloaded in the sandbox; covered by the owner's final test |
| CMP-02 | MANUAL | | Brave and Vivaldi |
| CMP-03 | PASS | E2E | Third-party cookies blocked: partitioned cookie still set and cleaned; no errors |
| CMP-04 | MANUAL | | |

### Store and landing site
| ID | Result | How | Notes |
|---|---|---|---|
| STO-01 | PASS | Unit | Name 41 characters, short description 115 |
| STO-02 | Assets ready | | store/screenshots/ (four at 1280 x 800 with caption bars), store/promo-small-440x280.png, store/marquee-1400x560.png, assets/icons/icon-128.png |
| STO-03 | PASS (self-check) / owner check | | "Cookie AutoDelete" appears only in the description, the importer and the "not affiliated" lines; not in the name or icon |
| STO-04 | PASS (local) | Lighthouse 12, mobile | Every page 100 / 100 / 100 / 100 when served at its real address with a real base URL; re-run once the site is live |
| STO-05 | PASS (automated part) | Unit | JSON-LD SoftwareApplication and FAQPage present and valid JSON with the required fields; run Google's Rich Results Test once live |
| STO-06 | PASS (automated part) | Unit | Open Graph and Twitter tags with a 1200 x 630 image on every page; check real previews once live |
| STO-07 | MANUAL | | Install release/crumble-0.1.0.zip on fresh Chrome and Edge profiles |
