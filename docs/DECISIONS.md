# Decisions

Decisions made while building, with the reason for each. Newest phase last.

## Phase A: foundation (15 October 2026)

### Tooling
- **TypeScript (strict) + esbuild.** esbuild bundles each entry point into one minified IIFE file targeting Chrome 130. It is small and fast, and it has no runtime of its own in the bundle.
- **Two builds.** `npm run build` writes `dist/` (what ships). `npm run build:test` writes `dist-test/`, which adds a test-only page (`test-hooks.html`) that exposes the real core modules to Playwright. PER-01 checks that `dist/` contains no test hooks.
- **ESLint (flat config, typescript-eslint).** The PRD privacy rules are lint errors in `src/`: no `eval`, implied eval or `new Function`; no `fetch`, `XMLHttpRequest`, `WebSocket` or `EventSource`; no `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`; and no `.sync` (no `chrome.storage.sync` in version 1).
- **Vitest** runs the unit tests. Its global setup builds `dist/` first, because the PER tests read the production build.
- **Playwright 1.56.0 (pinned)** runs the E2E tests. It drives the same Chromium build the spikes used (141.0.7390.37). On a new machine, `npx playwright install chromium` downloads that build.

### Test environment
- Ported from the spike harness (`tests/harness/lib.js`) into `tests/e2e/support/`:
  - A persistent context in a fresh temporary profile.
  - The flags `--host-resolver-rules=MAP *.test 127.0.0.1`, `--ignore-certificate-errors` and `--no-proxy-server`.
  - Playwright's own `--disable-features` list, minus `ThirdPartyStoragePartitioning`.
  - Third-party cookies explicitly allowed in the profile's `Preferences`.
- **Test sites** on port 443 (`tests/e2e/support/server.ts`): `a.test`, `b.test`, `widget.test`, `tracker.test`, and the mock login `app.test → sso.test → app.test`. The certificate was copied from the harness to `tests/e2e/support/certs/`.
- **Restart tests** use `installAsPersistent()`. This turns the extension into a normal unpacked install (Preferences `location` 8 → 4, developer mode on) and relaunches without `--load-extension`, as the spikes required.
- **Waking the worker on relaunch.** On a plain relaunch, Chrome does not start a service worker that has no `onStartup` listener. The launcher therefore takes the known extension ID instead of waiting for a worker.
- **Simulating an update (SET-05).** The test raises the version in the installed copy's `manifest.json` and calls `chrome.runtime.reload()`. That is how Chrome delivers an update to an unpacked extension, and it fires `onInstalled` with reason `update`.

### Registrable domains (`src/core/domains.ts`)
- **Library.** `tldts` with `allowPrivateDomains: true` (per the spike results). `extractHostname` is off because callers pass hostnames, not URLs.
- **Normalising hosts.** Lowercase, then strip a leading `.` (cookie domains), a trailing `.` and IPv6 brackets. Unicode labels are converted to ASCII (punycode), because Chrome reports tab URLs and cookie domains in that form.
- **What `getRegistrableDomain` returns:**
  - an IP address returns the IP itself;
  - a host with no registrable part (`localhost`, or a public suffix such as `github.io`) returns the host itself, so every host maps to exactly one site;
  - the result is always in ASCII form.
- **IDN conversion** uses the npm `punycode` package's ES module build (`punycode/punycode.es6.js`), not Node's deprecated built-in.

### Rules (`src/core/rules.ts`)
- **Globs never become a RegExp.** `*` is matched by a linear wildcard matcher, so a pattern full of `*` cannot backtrack badly.
- **Where `www.` is ignored.** It is stripped from the hostname being tested, and from the start of a glob pattern.
- **Case.** Glob patterns are stored lowercase. Regex patterns keep their case but match case-insensitively (`i` flag).
- **IDN matching.** A host is compared in ASCII and Unicode form, with and without `www.`. A rule written as `bücher.de` or `xn--bcher-kva.de` therefore matches both forms (RUL-11).
- **Splitting on commas.** A comma inside a `/regex/` does not split it, so `/a{1,3}\.com/, b.com` gives two rules. Empty entries between commas are ignored, and duplicate patterns in one entry are saved once.
- **Rejected at entry** (each with its own locale message):
  - an empty entry;
  - an empty regex (`//`);
  - a regex missing its closing `/` (for example `/abc`);
  - a regex longer than 200 characters (measured between the slashes);
  - anything V8 cannot compile;
  - regexes that could freeze the service worker (see the next point).
- **Patterns that could freeze the worker** are also rejected:
  - a group that repeats (`*`, `+`, `{n,}`) and itself contains a repeat or `|`, such as `(a+)+` or `(a|aa)+`;
  - more than two unbounded repeats in total.

  Measured in V8 on a 253-character hostname: two `.*` take about 20 ms worst case, three take 1.2 s, four take 60 s. The 200-character limit alone does not prevent this.
- **Regex error messages.** V8 reports common errors in fixed wording, and each of these maps to a specific locale message: unterminated class or group, unmatched `)`, nothing to repeat, range out of order, trailing `\`, and a `{}` count out of order. Anything else uses a general message that includes the browser's own English description.
- **Classifying a host.** `classifyHost` returns `keep` if any Keep rule matches, otherwise `restart` if any Keep until restart rule matches. Rule order does not matter.
- **Several Keep rules on one host.** When more than one matching rule has a cookie option, a cookie is kept if any of them keeps it ("keep all" beats "keep only these"). Cookie names are case-sensitive.
- **No Cookie AutoDelete code was copied.** The matching was written from the PRD's syntax and tests, so no `LICENSE-THIRD-PARTY.md` is needed yet.

### Settings and storage (`src/core/settings.ts`)
- **Defaults** are exactly the PRD data model; `autoClean` and `setupComplete` start false.
- **Validation on load** never throws:
  - valid keys are kept;
  - a key that is missing or the wrong type resets to its default;
  - unknown keys are dropped;
  - `delaySeconds` must be a whole number from 1 to 3600.
- **When repaired settings are written.** Loading repairs settings in memory only. The repaired version is written to storage on `onInstalled` (install or update).
- **Migrations.** These are a list of `{ from, migrate }` steps. Schema 1 is the first schema, so the only real migration treats settings stored without a `schema` field as schema 0. A newer stored schema (after a downgrade) is not migrated; it is normalised, which keeps every key this build understands.
- **Stored rules are repaired to the safest values:**
  - a bad list type becomes `keep`;
  - bad cookie options become "keep all";
  - bad site-data options become `keep`;
  - a missing or duplicate ID gets a new ID.

  A rule whose pattern is missing or invalid cannot match anything and is ignored when loading. On update it is written back unchanged, so a migration never destroys stored user data.
- **On install,** the extension writes default settings, an empty rule list and `installDate`, but never overwrites existing values (a reinstall with data present keeps that data). **On update,** it migrates and repairs settings and rules and leaves every other key untouched (the log, counters and so on).

### Manifest
- **Permissions** are exactly the PRD list, plus `<all_urls>` and `minimum_chrome_version` 130. The name and description come from `_locales`.
- **Not added yet:** no `action`, icons, commands or other entries until the phase that builds them (Phase C).

### Service worker (`src/background/index.ts`)
- **Phase A registers only `onInstalled`** (settings and rules setup and migration), at the top level. There is no cleanup engine, welcome page or UI yet.

## Phase B: cleanup engine (15 October 2026)

### Cleanup decision (`src/core/decide.ts`, pure)
- **Order of checks:**
  1. Keep rule on the cookie's own domain.
  2. Keep rule on a partitioned cookie's top-level site (when "keep embedded cookies on kept sites" is on).
  3. Keep until restart rule (except at startup).
  4. In use.
  5. Otherwise delete.
- **Named cookies.** A Keep rule with "keep only these cookies" protects only those names. Other cookies of that site fall through to the later checks, so they are kept while the site is open and deleted once it is closed (RUL-10).
- **"In use" is per cookie store.** A site open in a normal window does not protect incognito cookies, and the reverse. This prepares INC-03.
- **Partitioned cookies** are attributed to their top-level site in counts and the log, matching how the popup will count "cookies under this site".
- **"Clean this site now"** deletes every cookie whose own site or top-level site is that site, plus that site's recorded origins' data. It ignores lists and open tabs, because the user asked for exactly this.
- **Site data per origin:**
  - an open site gets nothing (unless open tabs are included);
  - a Keep or Keep until restart site gets only the types its rule marks "Clean" (if several rules match, a type is cleaned only if all of them say "Clean");
  - otherwise every enabled type.
- **HTTP cache.** When turned on, it is cleaned in the same per-origin call.

### Engine (`src/background/`)
- **Run queue.** One cleanup runs at a time. A request waits 50 ms before its run starts, so triggers that arrive together merge into one run. A request that arrives while a run is under way becomes one follow-up run. The queue is the only module state, and no decision reads it (SWR-05 audit test).
- **Deleting and checking.** Cookies are removed in parallel batches of 100, then every store is re-read. Anything still present is retried once, re-read again, and then logged as a failure. The undo buffer only holds cookies confirmed gone.
- **Progress.** For more than 300 cookies, progress is written to `storage.session` (`cleanupProgress`) after each batch; the popup will show it in Phase C.
- **Which origins get site data cleaning.** Top-level origins come from the tab map, and are recorded in `storage.session` and `storage.local`. An origin is removed from both once all its enabled types were cleaned. Kept and open origins stay on the list.
- **Scheduling.** Every scheduled cleanup goes in `storage.session` with an alarm, plus a `setTimeout` when the delay is under 30 s. Requests whose due times fall within 2 s of each other share one scheduled cleanup (DEC-09).
  - The timer and the alarm can both fire; only the first runs the cleanup.
  - Overdue cleanups run on every worker wake.
  - Reopening a site removes it from pending cleanups, and an empty one is cancelled with its alarm.
- **The tab map.** It lives in `storage.session` and records the last http(s) URL per tab, so `tabs.onRemoved` knows which site closed. It is re-synced from `tabs.query` on every wake. Storage updates are serialised per key group, so simultaneous events don't overwrite each other.
- **Automatic triggers** (tab close, domain change, startup) run only when "Automatic cleaning" is on. Startup also needs "Browser start cleaning". So nothing is cleaned automatically before setup is finished, because setup leaves automatic cleaning off.
- **Startup reload.** When "Clean open tabs at startup" and "Reload restored tabs" are both on, each http(s) tab is reloaded once after the startup cleanup.
- **Keyboard shortcut.** The manifest declares a `clean-now` command with no default key, so you assign one at `chrome://extensions/shortcuts`.
- **Messages.** The worker only answers messages from its own extension's pages.

### Test environment additions
- **Test cookies now have a lifetime (`Max-Age=86400`).** Session cookies are removed by Chrome itself when it closes, which would make restart tests pass for the wrong reason (found while writing TRG-07).
- **TRG-09 uses Chrome's real session restore** ("continue where you left off", and Playwright's `about:blank` start page removed).
- **DEC-08's browser half can't be automated.** After `chrome.tabs.discard`, Playwright loses its connection to the browser. The decision is unit-tested; the browser check is in `docs/MANUAL-TESTS.md`.

## Phase C: interface (15 October 2026)

- **No UI library.** A 60-line DOM helper (`src/ui/dom.ts`) builds every element with `createElement` and text nodes; no `innerHTML` anywhere. Bundles: popup 6.6 KB, settings 31 KB, welcome 18 KB, service worker 161 KB.
- **UI pages don't bundle the public suffix list.** Anything that needs the registrable domain (site status, setup candidates, offers) is asked of the service worker by message. Host helpers and site data types live in small modules (`core/hosts.ts`, `core/site-data.ts`).
- **The popup's status and the toolbar icon come from the same rule matching as the cleanup decision** (`background/site-status.ts`).
- **"Keep" and "Remove from list" in the popup:**
  - "Keep" adds `*.<registrable domain>`, or moves that site's own rule to the other list if it already has one.
  - "Remove from list" removes only rules that name this site exactly (plain or `*.` form). Broad wildcards and regexes stay, and the "Edit rule" link opens them in settings.
- **The toolbar icon is drawn per tab:**
  - the status square (full, half, struck through, or dotted for "not a website");
  - a greyscale set when automatic cleaning is off;
  - the product icon when "icon colour by list" is off.

  After a rule or setting change every tab is refreshed, not just the active one. That was a bug found by POP-02. The icon shown per tab is recorded in `storage.session` (`icon:<tabId>`), because Chrome can't report it back and tests need to check it.
- **Cookie counts include partitioned cookies whose top-level site is this site.**
- **Text.** All of it comes from `_locales` (293 messages). `scripts/strings.py` is the editable source for UI strings: it turns `$1` into named placeholders. Plurals use `<key>One` and `<key>Other`.
- **Confirmations** are `<dialog>` modals in settings and welcome, and an inline `role="alertdialog"` region in the popup. Buttons say what happens.
- **"Clean, including open tabs" shows a count first.** It comes from a dry run, `previewCleanup`, which deletes nothing.
- **Setup:**
  - Sites open in tabs are ticked by default; "most cookies" sites are unticked.
  - Ticked open sites become `*.<site>` Keep rules; typed entries are saved as typed.
  - Closing the tab before step three leaves automatic cleaning off.
- **Import and export.** Export writes Cookie AutoDelete's format, plus a `crumble` field per expression holding the full rule, so exporting and importing again gives identical rules. The importer:
  - removes `//` and `/* */` comments (the documentation's example has one);
  - splits comma-separated expressions;
  - maps WHITE to Keep and GREY to Keep until restart;
  - keeps named cookies only when `cleanAllCookies` is `false`;
  - maps `cleanLocalStorage: true` to "Clean LocalStorage";
  - lists IP ranges and invalid or unsafe regexes as "can't be imported", with reasons;
  - leaves Firefox container lists out unless you choose to add them.
- **"Clear existing data" offer.** It is made once per type, counts only origins visited since install that are neither kept nor open, and is never made for open sites.
  - Supporting it: while a site data type is switched off, cleaned origins stay in the session list (never on disk) so the offer can find them. The on-disk list still drops them. This was found by DAT-06.
- **Rating request:** at least 14 days after install and at least 30 successful automatic cleanups, once. It is not shown while the store URL in `src/config.ts` is a placeholder.
- **Report a problem.**
  - What it sends: version, browser, settings (no rules), and the last 3 log entries as counts only.
  - Where it goes: it opens the GitHub issue form when the URL is set. Until then it shows the text to copy.
- **The uninstall URL is registered only when `src/config.ts` has a real one.**
- **Context menus** are created only while "Right-click menu entries" is on.
- **Notifications:** automatic cleanups notify only if something was cleaned; manual cleanups always notify, when those settings are on.
- **The settings page refreshes only the Log section when a background cleanup finishes**, so it doesn't jump while you read it.
- **Tests.** `tests/e2e/screenshots.spec.ts` is a documentation generator, not a product test (`npm run screenshots`). Popup tests open `popup.html?tabId=N` as a page for a chosen tab.

## Phase D: hardening and release prep (15 October 2026)

- **Incognito tests** use a persistent install with "Allow in Incognito" set in the profile's Preferences. Incognito windows are opened with `chrome.windows.create`.
- **PRV-01** watches every request from extension pages and the service worker (with Playwright's `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS`). It first proves the monitor works with one deliberate request.
- **PER-03's automated part** asks Chrome for the install warnings of the built manifest (`chrome.management.getPermissionWarningsByManifest`) and compares them with `docs/PERMISSIONS.md`.
- **Landing site** (`site/`, built by `npm run site` into `dist-site/`):
  - plain HTML and CSS in the extension's palette;
  - no scripts except JSON-LD, no trackers, no cookies;
  - one `h1` per page, canonical, Open Graph and Twitter tags, a 1200 x 630 share image, `robots.txt` and `sitemap.xml`;
  - the uninstall page is `noindex`.

  Lighthouse (mobile) scores 100 in all four categories on every page when served at its real address.
- **Store images** are generated from the real UI (`npm run store-assets`). The popup is rendered at 2x pixel density, and caption bars use the product's mark.
- **`npm run package`** builds `release/crumble-<version>.zip` from a fresh production build, and refuses source maps, specs, fixtures and test hooks.
- **Rule table:** patterns no longer break mid-word, and the list name never wraps. Found in the store screenshots.

## After the build (15 October 2026)

- **The source manifest moved from the project root to `src/manifest.json`.** With a `manifest.json` at the root, choosing the project folder instead of `dist/` in "Load unpacked" gave Chrome's "Could not load manifest" error. Now only `dist/` contains a manifest. The PRD's folder sketch shows `/manifest.json`; this deviates on purpose.
