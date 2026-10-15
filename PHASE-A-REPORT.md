# Phase A report

Date: 15 October 2026. Build 0.1.0. Tested on Chromium 141.0.7390.37 (Playwright 1.56.0), Node 22.22.0, Ubuntu 24.04 (Claude's cloud sandbox).

Phase A is done: every Phase A test that can be automated passes. PER-03 is a manual test and still needs a person. The cleanup engine and the UI were not started.

Commands: `npm install`, then `npm test`. That runs typecheck, lint, the production build, 27 unit tests, the test build and 3 E2E tests. On Linux without a display, use `xvfb-run -a npm test`. Full per-test notes are in `docs/TEST-RESULTS.md`, and the reasoning behind each choice is in `docs/DECISIONS.md`.

## Phase A tests

| ID | Result | How |
|---|---|---|
| RUL-01 | PASS | Unit |
| RUL-02 | PASS | Unit |
| RUL-03 | PASS | Unit |
| RUL-04 | PASS | Unit |
| RUL-05 | PASS | Unit |
| RUL-06 | PASS | Unit |
| RUL-07 | PASS | Unit |
| RUL-08 | PASS | Unit (plus an extra time-boxed matching test) |
| RUL-09 | PASS | Unit |
| RUL-10 | PASS (unit part) | The E2E part needs the cleanup engine, so it moves to Phase B (see item 3 below) |
| RUL-11 | PASS | Unit |
| RUL-12 | PASS | Unit |
| SET-01 | PASS | Unit |
| SET-02 | PASS | E2E, restart profile (persistent install, same profile reopened) |
| SET-03 | PASS | Unit (see item 1 below) |
| SET-04 | PASS | Unit |
| SET-05 | PASS | E2E, persistent install (see item 2 below) |
| PER-01 | PASS | Unit (CI) |
| PER-02 | PASS | Unit (CI) |
| PER-03 | NOT RUN | Manual: someone needs to install the packed build and record Chrome's warnings |
| PER-04 | PASS (Phase A scope) | Unit (CI): no UI exists yet (see item 5 below) |

Extra checks, all PASS:
- **ENV-01:** a test-environment self-check. It confirms the extension loads, the partitioned cookie comes back with its full key, the third-party cookie is stored, storage partitioning is on, and the mock SSO login works.
- **Early STO-01:** name and description lengths are within the store limits.
- **Early PRF-02:** the service worker bundle is 103 KB, against a 220 KB budget.

## Unclear, contradictory or impossible in the PRD

1. **SET-03, "migration from an older schema".** There is no older schema: schema 1 is the first one.
   - What I did: settings stored without a `schema` field count as schema 0 and migrate to 1. The migration code takes a list of steps, and the test also runs a sample step that renames a key, to prove values survive a real future migration.
2. **SET-05 checks that the log survives an update and that no tab opens.** The log (Phase B/C) and the welcome page (Phase C) don't exist yet.
   - What I did: the test stores a placeholder `cleanupLog` entry and checks the update leaves it untouched. It also watches for any new page during the update.
   - The update itself is simulated by raising the version and calling `chrome.runtime.reload()`, which is how Chrome updates an unpacked extension. A real Web Store update can only be checked once the extension is published.
   - SET-05 should be re-run in Phase C, when the welcome page exists, so that "no tab opened" actually means something.
3. **RUL-10 is "Unit + E2E",** but the E2E half ("others deleted") needs the cleanup engine, which is Phase B.
   - What I did: the unit half (only `sid` and `lang` are kept) passes. The E2E half will be added in Phase B.
4. **PER-03 and `docs/PERMISSIONS.md` need a person** to install the extension and copy Chrome's exact warning text.
   - What I did: I didn't write `PERMISSIONS.md`, rather than guess the wording.
5. **PER-04, "all user-facing strings come from `_locales`".** There is no UI yet.
   - What I did: the test checks that the manifest name and description are locale references, that every message key used anywhere exists, that messages contain no `!`, "whitelist" or "greylist", and that any HTML under `src/ui/` has no literal text. It is ready for Phase C.
   - One limit: for unusual regex errors, the message includes the browser's own English description of the problem, so that part can't be translated.
6. **The regex safety rule in the PRD is not enough.** The PRD rejects regexes over 200 characters and asks for time-boxed tests. The time-boxed test caught a real hang:
   - A short regex like `/a.*a.*a.*b/` takes 1.2 seconds against a 253-character hostname. `/a.*a.*a.*a.*b/` takes 60 seconds and would freeze the service worker.
   - What I did: I also reject regexes that repeat a group that already repeats or contains `|`, such as `(a+)+` or `(a|b)+`, and regexes with more than two `*`, `+` or `{n,}`. Each gets a plain message.
   - Your call: this means a few unusual Cookie AutoDelete regexes would show as "cannot be imported" in the import preview. Please confirm this is acceptable.
7. **"Rule syntax should match the original exactly" conflicts with the PRD's own tests.** I checked the original's source (`src/services/Libs.ts`, 3.X.X branch). It differs from the PRD in these ways, and I followed the PRD each time:
   - **`*.example.com` vs `notexample.com`.** The original compiles `*.example.com` to `(^|.)example\.com$`, where the unescaped `.` means any character, so it also matches `notexample.com`. RUL-02 says it must not. I followed RUL-02.
   - **`www` variants.** The original strips `www.`, `www1.`, `www2.` and so on (`^www[a-z0-9]?\.`). The PRD says only a leading `www.` is ignored, so I strip only `www.`. Imported rules can therefore behave differently on hosts like `www2.example.com`.
   - **IP and CIDR rules.** The original supports rules like `192.168.0.0/16` and IPv6 ranges. The PRD doesn't mention them. A plain IP rule (`127.0.0.1`) works; a CIDR rule is saved but matches nothing. Your call: support CIDR, or have the importer reject it with a reason.
   - **Regex matching.** The original's regexes are case-sensitive and run only against the hostname with `www` removed. Mine are case-insensitive and run against the host with and without `www.`, in ASCII and Unicode form. That is more lenient, except on hosts like `www2.example.com`, where the different `www` stripping above applies.
   - **Special characters in plain patterns.** In the original, characters like `?`, `+` and `(` in a non-regex pattern acted as regex syntax by accident. Here they are literal characters.
   - **Commas.** The original's validator rejects commas in a non-regex expression, yet the PRD (and its description of the original's importer) splits on commas. I split on commas, except inside a `/regex/`, so `/a{1,3}\.com/` stays one rule. The PRD doesn't say what to do with a comma inside a regex.
8. **Two new rejection messages.** "Do not invent copy" conflicts with "invalid regexes are rejected with a plain message naming the problem": the PRD gives no wording.
   - What I did: I wrote plain locale messages for each error, including two cases the PRD doesn't name: a regex missing its closing `/` (`/abc`), and the unsafe regex shapes from item 6. Please review the wording in `src/_locales/en/messages.json`.
9. **Restart tests depend on how the service worker starts.** On a plain relaunch, Chrome only starts the worker for events it listens to. In Phase A it only listens for `onInstalled`, so the test launcher now takes the known extension ID instead of waiting for a worker. Phase B will add `onStartup`, which removes this wrinkle.
10. **Minimum Chrome version.** `minimum_chrome_version` is 130, but every test ran on Chromium 141. Nothing here was tested on 130.

## Deviations from the PRD, and why

- **Built and tested in Claude's cloud sandbox, not on your laptop.** The sandbox has Playwright's Chromium, port 443 and a virtual display (Xvfb). The project was then written into your folder.
  - Running the E2E tests on your Windows laptop is untested. It should need `npm install`, `npx playwright install chromium`, and nothing else using port 443.
- **A test-only build (`dist-test/`) with a hidden test page.** It lets E2E tests call the real settings and rules code inside the extension. The shipped build (`dist/`) never contains it, and PER-01 checks that.
- **Settings and rules are written on install and update.** The service worker registers `onInstalled` to write default settings on install and to migrate and repair stored settings and rules on update. It never overwrites existing values. This is the "settings with defaults and migrations" part of Phase A. The welcome tab is not opened yet (Phase C).
- **Damaged stored rules are repaired to the safest values,** so damage can only make the extension keep more data, never delete more. Unusable entries are written back unchanged on update, not deleted.
- **Not in the manifest yet:** icons, `action` (popup) and commands. They belong to Phase C and were left out rather than added as placeholders.
- **Extra tests.** I added an environment self-check (ENV-01), early STO-01 and PRF-02 checks, and extra edge cases inside the PRD test IDs. None replace a PRD test.
- **The test sites now also include the `app.test → sso.test → app.test` mock login,** which the spike harness didn't have.
- **No `LICENSE-THIRD-PARTY.md`.** No Cookie AutoDelete code was copied; the rule matching was written from the PRD.
- **The harness copy in `tests/harness/` leaves out its duplicate of `SPIKE-RESULTS.md`,** which now lives at `docs/SPIKES.md`. Everything else is as it was.
- **Lint rules enforce the PRD's privacy rules in `src/`:** no `eval` or `new Function`, no network calls, no `innerHTML`, and no `storage.sync`.

## Folder tree

`node_modules/`, `dist/`, `dist-test/` and `test-results/` are generated and not listed.

```
Cookie Remover/
├─ crumble-cookie-cleaner-PRD.md      (yours, unchanged)
├─ SPIKE-RESULTS.md                   (yours, unchanged)
├─ spike-harness/                     (from the spikes, unchanged)
├─ spike-harness.tgz                  (leftover from the spikes; safe to delete)
├─ PHASE-A-REPORT.md
├─ docs/
│  ├─ DECISIONS.md
│  ├─ SPIKES.md
│  └─ TEST-RESULTS.md
├─ scripts/
│  └─ build.mjs
├─ src/
│  ├─ _locales/
│  │  └─ en/
│  │     └─ messages.json
│  ├─ background/
│  │  └─ index.ts
│  ├─ core/
│  │  ├─ domains.ts
│  │  ├─ rules.ts
│  │  └─ settings.ts
│  └─ types/
│     └─ punycode.d.ts
├─ tests/
│  ├─ e2e/
│  │  ├─ support/
│  │  │  ├─ certs/
│  │  │  │  ├─ cert.pem
│  │  │  │  └─ key.pem
│  │  │  ├─ browser.ts
│  │  │  └─ server.ts
│  │  ├─ environment.spec.ts
│  │  ├─ global-setup.ts
│  │  └─ settings.spec.ts
│  ├─ harness/
│  │  ├─ certs/
│  │  │  ├─ cert.pem
│  │  │  └─ key.pem
│  │  ├─ results/
│  │  │  └─ (10 spike result JSON files)
│  │  ├─ sites/
│  │  │  └─ server.js
│  │  ├─ spike-extension/
│  │  │  ├─ manifest.json
│  │  │  ├─ runner.html
│  │  │  ├─ runner.js
│  │  │  └─ sw.js
│  │  ├─ lib.js
│  │  ├─ package-lock.json
│  │  ├─ package.json
│  │  ├─ smoke.js
│  │  ├─ spike1.js
│  │  ├─ spike2.js
│  │  ├─ spike2g2.js
│  │  ├─ spike3x.js
│  │  ├─ spike4.js
│  │  ├─ spike4_missed.js
│  │  ├─ spike4d_unpacked.js
│  │  ├─ spike4v.js
│  │  └─ x3.js
│  ├─ test-hooks/
│  │  ├─ hooks.html
│  │  └─ hooks.ts
│  └─ unit/
│     ├─ domains.test.ts
│     ├─ fake-storage.ts
│     ├─ global-setup.ts
│     ├─ manifest.test.ts
│     ├─ rules.test.ts
│     └─ settings.test.ts
├─ .gitignore
├─ eslint.config.js
├─ manifest.json
├─ package-lock.json
├─ package.json
├─ playwright.config.ts
├─ tsconfig.json
└─ vitest.config.ts
```
