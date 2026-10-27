# Crumble: Auto-Delete Cookies on Tab Close (Chrome Extension PRD and Build Spec)

"Crumble" is a working name. See "Still open" at the end.

> UI direction update, 27 October 2026: the product owner requested a premium interface inspired by leading technology products, updated typography, and consequence-focused tooltips. The current implementation and design specification are in `docs/DESIGN.md`. This request supersedes the original ledger-only restrictions on rounded surfaces, shadows and system-only fonts below. Functional cleanup requirements remain in force.

## Read this first (instructions for the AI building this)

This document is the single source of truth for the build. Read all of it before writing code.

- You should build only what is under "Version 1 requirements". Items marked "Later" exist so the design leaves room for them. Do not build them now.
- You should not invent features, settings, screens or copy that are not in this document. If something is unclear, stop and ask.
- The technical spikes have already been run (15 October 2026). Read "Spike results and what they changed" before anything else; several requirements below were written because of them. Copy `SPIKE-RESULTS.md` into `docs/SPIKES.md` and the spike harness into `tests/harness/`, and reuse the harness for the end-to-end setup. Do not re-run the spikes.
- You should not move to the next build phase until every test for the current phase passes.
- You should follow the "UI quality bar" section exactly. The popup, settings page and welcome page must not look like generic AI-generated or vibecoded UI. This is a hard requirement.
- This extension deletes user data. A bug can log someone out of every site they use. Correctness and safety beat speed everywhere in this document.
- When you finish, produce the release checklist with every item marked done or explained.

## What the original did (reference)

Cookie AutoDelete (CAD) was a popular open-source extension, MIT-licensed, with about 2,000 GitHub stars. Its Chrome listing was removed when Chrome ended Manifest V2. Its full documentation is public in the project's GitHub wiki. This is the feature set we are matching, summarised from that documentation:

- Automatic cleaning on three triggers: tab close, domain change within a tab, and browser restart. Off by default, so users could set up their lists first.
- A delay before cleaning (default 15 seconds) so an accidental tab close could be reopened before data was lost.
- Two lists of rules. KeepList (originally WhiteList): never clean. RestartList (originally GreyList): keep until the browser restarts.
- Rule syntax: `example.com` matches the site and its `www.` form; `*.example.com` matches the site and all subdomains; `*` wildcards anywhere; regular expressions written as `/pattern/`; several rules can be entered at once, separated by commas. KeepList takes priority over RestartList.
- Per-rule options: keep all cookies, or keep only named cookies; keep or clean each type of site data.
- Cleaning of other site data per domain: LocalStorage, IndexedDB, Cache, Service Workers (and plugin data, now obsolete).
- Manual cleaning from the popup: "Clean" (sites not open in a tab and not on a list), "Clean, include open tabs", and "Clean this site" actions.
- Optional cleanup of discarded (unloaded) tabs, and of open tabs at startup.
- A cookie count badge on the toolbar icon, and an icon colour showing which list the current site is on.
- A cleanup log showing which sites were kept or cleaned and why, with restore of deleted cookies.
- Notifications after cleanup, context menu entries, import and export of rules as JSON, font size settings, debug mode.
- Firefox container support (not relevant to Chrome).

## Why it broke, and why current replacements fall short

### The original

- CAD was built on a background page that stayed alive for the whole browser session. It kept its map of open tabs in memory and used `setTimeout` for the cleaning delay.
- Manifest V3 replaces that page with a service worker that Chrome stops after 30 seconds without activity. Any in-memory state and pending timers are lost. Ported naively, cleanups silently stop happening, or run against a stale list of open tabs.
- Its known startup issue: after a browser restart with session restore, tabs could finish loading and read their cookies before CAD's startup cleanup ran.
- Domain-change cleaning could break single sign-on flows (for example a site redirecting to Google to log in and back), because the first site's data could be cleaned mid-login.

### The replacements

- Community ports of CAD to Manifest V3 exist on GitHub, but the most complete one is still self-install only. Its README lists the Chrome Web Store release as "preparing", and users report the developer as unresponsive.
- The most-recommended Web Store alternative does not delete third-party or partitioned cookies on tab close; it only removes them on a manual or scheduled scan. CAD deleted every non-kept cookie on tab close.
- Other alternatives only handle cookies and skip LocalStorage, IndexedDB and Service Workers. Users on the Vivaldi forum say exactly this.
- The partitioned-cookie gap has one root cause. Chrome's cookie API reads only unpartitioned cookies unless the extension asks for partitions explicitly. Extensions that call `chrome.cookies.getAll()` the normal way never see partitioned cookies at all.

### How this extension fixes each one

- **Service worker lifecycle:** all state that must survive (open-site map, pending cleanups, recently seen origins) lives in `chrome.storage.session`. It is rebuilt from `chrome.tabs.query` on every wake. Pending cleanups are stored with a due time and run on any wake if overdue. Nothing depends on the worker staying alive.
- **Partitioned cookies:** every cleanup reads cookies with `partitionKey: {}`, which returns partitioned and unpartitioned cookies together. Each partitioned cookie is deleted by passing its exact `partitionKey` back to `chrome.cookies.remove`.
- **Third-party cookies:** every cleanup is a full sweep of all cookies in every cookie store, not just the closed tab's domain. Any cookie not protected by a rule or an open site is removed.
- **Other site data:** LocalStorage, IndexedDB, Cache Storage and Service Workers are cleaned with `chrome.browsingData.remove`, using the origins of the sites the user visited. This also clears what embedded content stored on those sites.
- **Startup race:** startup cleanup runs at the first possible moment. An option reloads restored tabs once after the startup clean, so sites cannot keep using data that was just removed.
- **Single sign-on breakage:** a pending cleanup for a site is cancelled if that site is opened again before the delay ends, so login redirects through another site and back do not lose data.
- **Distribution:** shipped on the Chrome Web Store and Microsoft Edge Add-ons, kept current.

## Problem statement

People who care about privacy want websites to forget them when they close the tab, except for the handful of sites where they choose to stay logged in. Chrome's built-in settings can only delete cookies when the whole browser closes, or block sites one by one, which is not the same thing. For years Cookie AutoDelete filled this gap. It was removed from the Chrome Web Store when Manifest V2 ended. People who still want it are on forums asking what to use instead. The answers point to replacements that leave partitioned and third-party cookies behind, skip other site data, or are not on the store at all.

## Solution summary

- A Manifest V3 Chrome extension that deletes cookies and site data from a site shortly after its last tab closes, unless the user has chosen to keep that site.
- Two lists, matching the original's behaviour: Keep (never clean) and Keep until restart.
- The same rule syntax as the original, and an importer for the original's export file, so existing users can move over in one step.
- Full coverage that current replacements miss: partitioned cookies, third-party cookies and site data (LocalStorage, IndexedDB, Cache Storage, Service Workers), all on every cleanup.
- Built for how Manifest V3 actually works, so cleanups do not silently stop.
- A short first-run setup that helps the user pick sites to keep before automatic cleaning starts, so nobody gets logged out of everything by surprise.
- An "Undo last cleanup" option for a short window, held in memory only.
- No account, no analytics, no servers. Nothing leaves the browser.

## Who this is for

- Former Cookie AutoDelete users on Chrome, Edge, Brave, Vivaldi and other Chromium browsers.
- Privacy-minded people who want "forget me when I leave" without blocking cookies altogether.
- People who share a computer and want sites to forget them after they close the tab.
- Not for: Firefox users (the original still exists there, and containers are out of scope), or mobile browsers.

## Spike results and what they changed

The spikes ran on 15 October 2026 in an isolated sandbox against local test sites, using Chromium 141 through Playwright. Full results are in `docs/SPIKES.md`. What was found, and what each finding changed in this document:

### Partitioned cookies: confirmed, with one trap

- `chrome.cookies.getAll({ partitionKey: {} })` returns partitioned cookies with their full key (`topLevelSite` and `hasCrossSiteAncestor`). A normal `getAll` does not return them.
- `chrome.cookies.remove` deletes a partitioned cookie only when given that exact key.
- **Trap:** `remove` without the key returns a non-null result, as if it worked, but deletes nothing. The return value of `remove` cannot be trusted.
- `chrome.cookies.set` with the key restores a partitioned cookie, so undo works for them.
- **Changed:** every cleanup re-reads the cookies it tried to delete and counts a cookie as deleted only if it is actually gone (see "The cleanup decision"). Undo re-reads after restoring.

### Embedded site data: cleared through the top-level site, not the embedded one

- Clearing by the embedded site's origin (`https://widget.test`) does not touch the LocalStorage and IndexedDB it stored while embedded in `b.test`.
- Clearing by the top-level site's origin (`https://b.test`) does remove them. Clearing with no origin filter also does.
- Clearing by origin works for the embedded site's own direct (non-embedded) data, and for Cache Storage and Service Workers.
- **Changed:** site data is cleaned using the origins of the top-level sites the user visited. This clears the top-level site's own data and everything embedded sites stored under it, in one call. One consequence, now stated in the UI: embedded site data always follows the top-level site's decision. If a site is kept, data that embedded sites stored under it is kept too; it cannot be cleaned separately.

### Registrable domains: use a bundled library for now

- `chrome.publicSuffix` does not exist in Chromium 141. Its documentation says it needs Chrome 153 or later and a `publicSuffix` permission. That is too new for other Chromium browsers, so version 1 does not use it.
- **Changed:** bundle `tldts` (about 128 KB minified, 47 KB gzipped) with `allowPrivateDomains: true`, so `a.github.io` and `b.github.io` count as separate sites, the same way Chrome treats them for cookies. The service worker size budget is raised to fit it.

### Service worker sleep and browser restart

- A `setTimeout` is lost when the service worker stops. An alarm wakes the worker and fires on time.
- `chrome.storage.session` is empty after a restart; `chrome.storage.local` survives.
- An alarm that came due while the browser was closed fired as soon as the browser reopened, and `chrome.runtime.onStartup` fired, when the extension was a normal install in the profile.
- An extension loaded with `--load-extension` is installed fresh on every launch, so `onStartup` does not fire and alarms are wiped. This only affects testing.
- **Changed:** a backup alarm is mandatory for every scheduled cleanup, and short delays can stretch to about 30 seconds when the worker has stopped (alarms cannot fire sooner). Restart tests use a profile where the extension is a normal install (see "Test environment").

### Cookie limits and speed

- Chrome caps how many cookies it stores per registrable domain and per profile. Seeding 5,000 cookies left 164 when all were under one domain, and 3,194 when spread over 500 domains, even though every `set` call reported success.
- Reading all cookies took about 40 ms. Removing 3,194 one by one took about 6 seconds on a 2-CPU cloud machine.
- **Changed:** the performance budget now separates the normal case (closing a tab, tens to a few hundred cookies) from a full-profile cleanup (up to Chrome's cap). Full-profile cleanups run in batches, report progress, and never block the popup.

### Other checks

- Tab URLs are readable without the `tabs` permission for sites the extension has host access to. The permission list stays as written.
- With only normal windows open, there is one cookie store, `"0"`.

### Still to check later (does not block version 1)

- When Chrome 153 or later is widespread across Chromium browsers, compare `chrome.publicSuffix` with `tldts` on the same inputs and switch if they agree, to save bundle size.
- Whether `chrome.browsingData.remove({ origins }, { cookies: true })` also removes partitioned cookies, and could safely replace one-by-one removal when a whole registrable domain is being deleted with no named-cookie rules. This could make full-profile cleanups much faster. Needs its own small spike first.

## Version 1 requirements

Each feature lists its requirements and then its acceptance criteria. A feature is done only when every acceptance criterion is true and its tests pass.

### First-run setup

- On first install, open a local welcome page (bundled, no remote content). It should explain in three short lines what the extension does, then walk through setup.
- Setup step one: "Sites to keep you logged in". Show the sites from the user's currently open tabs, each with a checkbox. Below, a short list of the sites that currently hold the most cookies, unticked by default. Let the user add any site by typing it.
- Setup step two: if the user used Cookie AutoDelete before, offer "Import from Cookie AutoDelete" (see "Import and export").
- Setup step three: one clear choice: "Start cleaning automatically" or "I'll clean manually for now". Automatic cleaning must not start until the user makes this choice.
- Until setup is finished, automatic cleaning is off and the popup shows a short line linking back to setup.

Acceptance criteria:

- A fresh install never deletes any cookie before the user has finished setup or chosen manual mode.
- Ticked sites from step one are added to the Keep list with default options.
- Choosing "Start cleaning automatically" turns automatic cleaning on immediately, with no browser restart.
- Closing the welcome tab without finishing leaves automatic cleaning off, and the popup offers to resume setup.

### Rules: Keep and Keep until restart

- Two lists. **Keep**: data for matching sites is never cleaned automatically. **Keep until restart**: data for matching sites is kept until the browser next starts, then cleaned.
- Rule syntax should match the original exactly, so imported rules behave the same:
  - `example.com` matches `example.com` and `www.example.com` only.
  - `*.example.com` matches `example.com` and every subdomain.
  - `*` is a wildcard anywhere in the pattern (`gi*b.com` matches `github.com` and `gitlab.com`; a rule of just `*` matches every site).
  - `/pattern/` is a regular expression matched against the hostname.
  - Several rules can be entered at once separated by commas; spaces around commas are ignored; each becomes its own rule.
  - A leading `www.` in a hostname is ignored when matching.
- Keep takes priority over Keep until restart when both match.
- Per-rule options:
  - Cookies: "Keep all cookies" (default) or "Keep only these cookies" with a list of cookie names. For Keep until restart rules, the same options apply until restart.
  - Site data: separately for LocalStorage, IndexedDB, Cache Storage and Service Workers, "Keep" (default) or "Clean".
  - Optional note (free text, for the user's own reference).
- Users can add, edit, delete and search rules. Deleting asks for confirmation. Bulk delete is available with confirmation.
- Invalid regular expressions are rejected at entry with a plain message saying what is wrong.
- Rules are stored in `chrome.storage.local`. Rule order does not matter; matching is evaluated over the whole list.

Acceptance criteria:

- Each syntax example above matches and does not match exactly as described (see the rule-matching tests).
- A site matching both lists is treated as Keep.
- With "Keep only these cookies", named cookies survive a cleanup and all other cookies for that site are removed.
- Entering `a.com, *.b.com, /c\.(com|net)/` creates three rules.
- An invalid regex such as `/[a-/` is not saved and the message names the problem.

### What counts as "in use"

- A site is **open** if any tab in any window (including incognito, when allowed) currently shows a page whose registrable domain matches it. Registrable domain means the domain a person registers, for example `example.co.uk` for `shop.example.co.uk`.
- An unpartitioned cookie is **in use** if its domain's registrable domain matches an open site.
- A partitioned cookie is **in use** if the registrable domain of its partition's top-level site matches an open site. (A YouTube player embedded on an open news site keeps its partitioned cookie for that news site, and only for that site.)
- Discarded tabs count as open unless "Clean discarded tabs" is on.
- The open-site map must be rebuilt from `chrome.tabs.query({})` at the start of every cleanup. It must never rely on a map held in memory since the last event.

Acceptance criteria:

- A cookie for `accounts.example.com` is in use while any `example.com` page is open.
- A partitioned cookie for `widget.test` under top-level site `news.test` is in use only while `news.test` is open, even if `widget.test` itself is open in another tab.
- After the service worker has been stopped and restarted (simulate with `chrome://serviceworker-internals` or the extension's service worker "Stop" button), the next cleanup sees the correct open sites.

### The cleanup decision

For every cookie in every cookie store, a cleanup decides keep or delete in this order:

- If a Keep rule matches the cookie's domain: keep (respecting "Keep only these cookies").
- If a partitioned cookie's top-level site matches a Keep rule and "Keep embedded cookies on kept sites" is on (default on): keep.
- If a Keep until restart rule matches and this is not a startup cleanup: keep (respecting named cookies).
- If the cookie is in use and the cleanup is not "include open tabs": keep.
- Otherwise: delete.

Then for site data:

- Record every top-level origin (scheme, host and port, as shown in the tab) seen in a tab this session, in `chrome.storage.session`. Persist the same list to `chrome.storage.local` as well, without paths or query strings, so startup cleanup knows which sites to clean after a restart. Remove an origin from both lists once its data has been cleaned.
- For each recorded origin whose registrable domain is not kept and not open, clean the enabled site data types with `chrome.browsingData.remove({ origins: [...] }, types)`. Batch all such origins into one call per cleanup.
- This also clears data that embedded sites stored while embedded in that site, because Chrome keys embedded storage by the top-level site. Calling `browsingData` with an embedded site's own origin does not clear that, so do not rely on it.
- When a Keep or Keep until restart rule says to keep a type of site data, data that embedded sites stored under that site is kept too. The settings page states this under "Site data".
- Site data for a domain is never cleaned while that domain is open, except in "include open tabs" cleanups.
- Never call `browsingData` to remove cookies; Chrome removes cookies for the whole registrable domain that way, which would bypass named-cookie rules. Cookies are only removed through `chrome.cookies.remove`.

Requirements for deleting:

- Read cookies with `chrome.cookies.getAll({ storeId, partitionKey: {} })` for each store from `chrome.cookies.getAllCookieStores()`.
- Delete with `chrome.cookies.remove({ url, name, storeId, partitionKey })`, where `url` is built from the cookie's secure flag, domain (leading dot removed) and path, and `partitionKey` is copied exactly from the cookie when present.
- Do not trust the return value of `chrome.cookies.remove`; it can report success without deleting anything (for example when the partition key is missing). After the removals, re-read with `getAll({ storeId, partitionKey: {} })` and count a cookie as deleted only if it is gone. Anything still present is a failure: retry it once, then record it in the log. Never report a cookie as deleted when it was not.
- Remove cookies in parallel batches of 100. For more than 300 cookies, show progress in the popup ("Cleaning 1,200 of 3,100 cookies") and keep the popup responsive.
- Only one cleanup runs at a time. Triggers that arrive during a cleanup are merged into one follow-up run.

Acceptance criteria:

- After a cleanup, no cookie remains that the decision rules say to delete, including partitioned and third-party cookies, across all cookie stores the extension can access.
- No cookie protected by a Keep rule, an open site, or (outside startup) a Keep until restart rule is ever deleted.
- A normal tab-close cleanup (up to 300 cookies removed) completes in under 1 second on a mid-range laptop.
- A full-profile cleanup at Chrome's cookie cap (about 3,200 cookies) completes, shows progress while running, and never freezes the popup or settings page.
- Two tabs closed within the same second produce one cleanup, not two overlapping ones.

### Triggers

- **Tab close (default on once automatic cleaning is on).** When a tab closes, schedule a cleanup after the delay.
- **Domain change (default off).** When a tab navigates from one registrable domain to another, schedule a cleanup for the previous domain after the delay.
- **Browser start (default on).** On `chrome.runtime.onStartup`, run a startup cleanup immediately: everything not on the Keep list and not open, including Keep until restart sites.
- **Clean open tabs at startup (default off).** When on, the startup cleanup also cleans sites in restored tabs. When "Reload restored tabs after startup clean" is also on (default on when this is on), reload those tabs once afterwards.
- **Manual.** "Clean now" and "Clean, including open tabs" from the popup; "Clean this site" for the current site; context menu entries.

Delay:

- Default 15 seconds; user can set 1 second to 1 hour.
- Each scheduled cleanup is stored in `chrome.storage.session` with its due time and the domains it was scheduled for.
- Always create a `chrome.alarms` alarm for every scheduled cleanup; this is what survives the worker stopping. Alarms cannot fire sooner than 30 seconds after they are created, so for delays under 30 seconds also set a `setTimeout` at the exact due time. If the worker stops before that timer fires, the timer is lost and the alarm runs the cleanup at about 30 seconds instead. The settings page says so under the delay setting: "Short delays can take up to 30 seconds."
- Clear the alarm when its cleanup has run.
- On every service worker wake, run any scheduled cleanup that is overdue.
- If a scheduled domain becomes open again before the cleanup runs, remove it from that scheduled cleanup. This protects login redirects and accidental closes.

Acceptance criteria:

- Closing a tab of a non-kept site removes its cookies within delay + 5 seconds while the service worker stays running.
- If the service worker is stopped in between, the cleanup still runs, within the larger of (delay + 5 seconds) and 35 seconds.
- Reopening the same site within the delay keeps its cookies.
- Logging into a site that redirects through another domain and back (test with a local mock of this flow) keeps the user logged in with domain-change cleaning on.
- After a browser restart, Keep until restart sites are cleaned and Keep sites are untouched.
- Cleanups scheduled when the browser closed are covered by the startup cleanup.

### Popup

- Header: product name (small) and a link to settings.
- Current site block: the site's name, its status ("Kept", "Kept until restart", "Will be cleaned after you close it", or "Not a website"), and the number of cookies it has, including partitioned ones under it.
- Actions for the current site: "Keep", "Keep until restart", "Remove from list" (when listed), "Clean this site now". Adding a site from the popup uses the rule `*.<registrable domain>` by default; an "Edit" link opens the rule in settings.
- Automatic cleaning switch.
- "Clean now" and "Clean, including open tabs" (the second asks for confirmation).
- Last cleanup line: "Cleaned 14 sites, 212 cookies, 2 minutes ago", with "Undo" while undo is available and "Details" opening the log.
- When setup is unfinished, a line linking to setup replaces the automatic cleaning switch.

Acceptance criteria:

- Every action updates the popup immediately without reopening it.
- The status shown always matches what the next cleanup would do for that site.
- The popup opens in under 150 ms.

### Settings page

Sections, in this order:

- **Lists:** search, add, edit and delete rules; filter by list; bulk delete; import and export.
- **Cleaning:** automatic cleaning, delay, domain change cleaning, clean discarded tabs, browser start cleaning, clean open tabs at startup, reload restored tabs, keep embedded cookies on kept sites.
- **Site data:** LocalStorage, IndexedDB, Cache Storage, Service Workers on or off (defaults: all on). A one-line note under this section: "Data that embedded content (videos, widgets) stores on a site is kept or cleaned together with that site." The browser's HTTP cache (default off, with a note that clearing it makes sites load slower). When a type is turned on, offer once to clear existing data of that type for all non-kept sites, with confirmation.
- **Log:** the cleanup log (see below).
- **Display:** toolbar badge (cookie count, default on), icon colour by list (default on), notifications after automatic cleanups (default off), notifications after manual cleanups (default on).
- **About:** version, link to the changelog, privacy statement, "Report a problem", and the MIT licence notice for any code reused from Cookie AutoDelete.

Acceptance criteria:

- Every setting takes effect without restarting the browser.
- Every setting has a one-line plain explanation under it.
- Settings survive an extension update.

### Cleanup log and undo

- Keep the last 50 cleanups in `chrome.storage.local`. Each entry: time, trigger, sites cleaned, sites kept with the reason ("On Keep list", "Open in a tab", "Kept until restart"), cookie counts, site data types cleaned, and any failures.
- The log must never store cookie values.
- Undo: after each cleanup, hold the deleted cookies (including values and partition keys) in `chrome.storage.session` for 2 minutes, then discard them. `chrome.storage.session` is memory-only and cleared when the browser closes. "Undo" restores them with `chrome.cookies.set`. Site data cannot be restored, and the undo message says so.
- A "Clear log" button.

Acceptance criteria:

- The log explains, for any site, why it was kept or cleaned.
- After 2 minutes, or after a browser restart, no deleted cookie value exists anywhere in extension storage.
- Undo restores cookies so the user is logged back in on a test site (where that site uses only cookies).
- After undo, the extension re-reads the cookies and reports how many were actually restored. Chrome can silently drop restored cookies when a site is at its cookie limit, so the message never claims more than were confirmed.

### Import and export

- Export rules as JSON in the original Cookie AutoDelete format, so files can move between the two.
- Import accepts:
  - The original CAD expressions export: an object keyed by store ID, each holding an array of objects with `expression`, `listType` (`WHITE` or `GREY`), `storeId`, and optional `cookieNames`, `cleanAllCookies`, `cleanLocalStorage`, `id`.
  - This extension's own export.
- Mapping from CAD: `WHITE` becomes Keep, `GREY` becomes Keep until restart. Firefox container lists (store IDs other than `default`) are shown in a preview with an option to merge them into the main lists or skip them. Comma-separated expressions are split, as in CAD.
- Before importing, show a preview: number of rules to add, rules that would replace existing ones, and anything that cannot be imported, with reasons. Nothing changes until the user confirms.

Acceptance criteria:

- The example import file from the CAD documentation imports into the correct lists with correct cookie-name options.
- Exporting and importing again produces identical rules.
- A malformed file shows a plain error and changes nothing.

### Toolbar icon and badge

- Badge shows the cookie count for the current site, including partitioned cookies under it, when enabled.
- Icon colour reflects the current site's status: kept, kept until restart, or will be cleaned. Greyscale when automatic cleaning is off. Colours must also be distinguishable for colour-blind users (use shape or fill as well as hue).

Acceptance criteria:

- Badge and icon update within one second of switching tabs or changing a rule.

### Context menu and keyboard shortcuts

- Right-click on the toolbar icon and on pages: "Keep this site", "Keep this site until restart", "Clean this site now". Off by default, enabled in settings.
- Keyboard shortcut for "Clean now" (no default key; user assigns it at `chrome://extensions/shortcuts`).

### Incognito

- Works in incognito windows only if the user allows the extension there. Incognito cookies live in a separate store and are cleaned by the same rules.
- The settings page explains how to allow incognito access and that incognito data is deleted by Chrome anyway when all incognito windows close.

### Install, update and uninstall

- First install opens the welcome page. Updates never open a tab.
- Settings and rules migrate across versions without loss.
- Uninstall URL points to a short optional feedback form with no user data in the URL.

### Asking for a rating

- After at least 14 days and 30 successful automatic cleanups, show one dismissible line in the popup asking for a rating, once. Never again after dismissal or click. No incentives.

### Later (do not build in version 1)

- Sync of rules across devices with `chrome.storage.sync` (needs chunking because of per-item size limits).
- Per-tab-group or per-window cleaning profiles.
- Scheduled periodic cleanups while tabs stay open.
- Localised UI beyond English (strings must already come from `_locales`).
- Firefox version.

## Technical details

### Build approach

- Build a clean Manifest V3 codebase in TypeScript. Do not port the original's MV2 background page.
- The original Cookie AutoDelete code is MIT-licensed. You may reuse its rule-matching logic and its unit tests as a reference. If any code is copied or adapted, keep the MIT licence notice in `LICENSE-THIRD-PARTY.md` and credit it on the About page.
- Do not use the name "Cookie AutoDelete", its icon, or anything suggesting this is the original or endorsed by its maintainers. Mention it only factually ("imports your Cookie AutoDelete lists").

### Platform

- Manifest V3. `minimum_chrome_version` 130 (needed for `hasCrossSiteAncestor` in partition keys); raise it if a spike shows a later version is needed.
- Must work on Chrome, Edge, Brave, Vivaldi and Opera. Test on Chrome and Edge before every release.

### Permissions

```json
{
  "permissions": ["cookies", "browsingData", "storage", "alarms", "notifications", "contextMenus"],
  "host_permissions": ["<all_urls>"]
}
```

- `<all_urls>` is required: the cookies API only returns and removes cookies for hosts the extension has permission for, and it also lets the extension read tab URLs without the `tabs` permission.
- Do not add `tabs`, `history`, `webRequest`, `scripting` or `declarativeNetRequest`. The extension injects no scripts into pages.
- Record the exact install warnings Chrome shows in `docs/PERMISSIONS.md`, and explain each one in plain words on the landing page and in the store listing. The "read and change all your data on all websites" warning cannot be avoided for this product, so the explanation and the open-source code are what earn trust.

### Folder structure

```
/
├─ manifest.json
├─ src/
│  ├─ background/
│  │  ├─ index.ts                 # registers every listener at top level, synchronously
│  │  ├─ triggers.ts              # tab close, domain change, startup, alarms, commands, context menu
│  │  ├─ scheduler.ts             # pending cleanups in storage.session, timers + alarm backup, overdue check on wake
│  │  ├─ cleanup.ts               # the cleanup run: gather, decide, delete, site data, log, undo buffer
│  │  ├─ open-sites.ts            # builds the open-site set from chrome.tabs.query every run
│  │  ├─ seen-origins.ts          # origins seen this session, kept in storage.session
│  │  └─ badge.ts                 # badge text and icon state
│  ├─ core/
│  │  ├─ rules.ts                 # parsing and matching, identical semantics to the original
│  │  ├─ domains.ts               # registrable domain lookup with tldts (allowPrivateDomains: true)
│  │  ├─ decide.ts                # pure function: (cookie, rules, openSites, trigger, settings) -> keep | delete + reason
│  │  ├─ settings.ts              # typed settings, defaults, migrations
│  │  ├─ import-export.ts         # CAD format and own format
│  │  └─ messages.ts              # typed messages between UI and service worker
│  ├─ ui/
│  │  ├─ popup/ settings/ welcome/
│  │  └─ tokens.css               # shared design tokens
│  └─ _locales/en/messages.json
├─ assets/icons/                   # 16, 32, 48, 128 px, per-status variants, greyscale variant
├─ tests/
│  ├─ unit/                        # rules, decide, domains, import-export, scheduler (with fake clock)
│  ├─ e2e/                         # Playwright with the unpacked extension and local test sites
│  └─ fixtures/                    # CAD export samples, cookie sets
└─ docs/
   ├─ SPIKES.md  DECISIONS.md  PERMISSIONS.md  DESIGN.md  PRIVACY.md  TEST-RESULTS.md
```

### Service worker rules

- Register every event listener synchronously at the top level of the service worker, so Chrome can wake it for any of them.
- Never keep state in module-level variables that a cleanup depends on. Read from `chrome.storage.session` or `chrome.storage.local` at the start of each run.
- Do not use keep-alive tricks (open ports, repeated messages, offscreen documents) to stop the worker sleeping. The design must work when the worker sleeps.

### Data model

```ts
type ListType = "keep" | "restart";

type Rule = {
  id: string;
  pattern: string;               // as typed: "example.com", "*.example.com", "/regex/"
  list: ListType;
  cookies: { mode: "all" } | { mode: "named"; names: string[] };
  siteData: { localStorage: "keep" | "clean"; indexedDB: "keep" | "clean";
              cacheStorage: "keep" | "clean"; serviceWorkers: "keep" | "clean" };
  note?: string;
  createdAt: number;
};

type Settings = {
  schema: 1;
  setupComplete: boolean;
  autoClean: boolean;
  delaySeconds: number;           // 1..3600, default 15
  cleanOnDomainChange: boolean;   // default false
  cleanDiscardedTabs: boolean;    // default false
  cleanOnStartup: boolean;        // default true
  cleanOpenTabsOnStartup: boolean;// default false
  reloadAfterStartupClean: boolean;// default true
  keepEmbeddedOnKeptSites: boolean;// default true
  siteData: { localStorage: boolean; indexedDB: boolean; cacheStorage: boolean;
              serviceWorkers: boolean; httpCache: boolean };   // defaults true, true, true, true, false
  display: { badge: boolean; iconByList: boolean; notifyAuto: boolean; notifyManual: boolean;
             contextMenus: boolean };
};
```

Storage locations:

- `chrome.storage.local`: rules, settings, cleanup log (last 50, no cookie values), install date, cleanup counter, rating prompt state, and the list of visited origins still waiting for site data cleanup (origins only, no paths; each removed once cleaned).
- `chrome.storage.session`: scheduled cleanups, origins seen this session, undo buffer (2 minutes). Never written to disk.
- Do not use `chrome.storage.sync` in version 1.

### Performance budget

- Normal tab-close cleanup (up to 300 cookies removed): under 1 second.
- Reading and deciding over a full profile (about 3,200 cookies, Chrome's practical cap): under 200 ms.
- Full-profile removal: batched, with progress shown; measure on a mid-range laptop and record the time in `docs/TEST-RESULTS.md`. The spike measured about 6 seconds on a slow 2-CPU cloud machine; treat anything over 10 seconds on a laptop as a bug to investigate.
- Popup open: under 150 ms.
- Service worker idle between events: no timers or alarms running when nothing is scheduled.
- Bundle: popup under 60 KB, settings page under 150 KB, service worker under 220 KB (minified, most of which is the bundled public suffix list). A small UI library such as Preact is allowed for the settings page if it stays inside the budget; React, Vue, Tailwind and component kits are not.

### Privacy and security

- No analytics, no telemetry, no network requests of any kind. The only exception is opening the feedback or report pages when the user clicks those links.
- No `eval`, no `new Function`, no `innerHTML` with any dynamic data.
- Treat imported files as untrusted: validate against a schema, cap file size (1 MB) and rule count (10,000).
- Regular expressions from rules run against hostnames only, and must be protected from catastrophic backtracking: reject patterns longer than 200 characters, and time-box matching in tests.
- Cookie values are only ever held in the 2-minute in-memory undo buffer.
- `docs/PRIVACY.md` and the landing page privacy policy say this plainly. The Chrome Web Store privacy form declares that no user data is collected or transmitted.

### Accessibility

- Every screen usable by keyboard alone, with visible focus.
- Switches are real switches (`role="switch"` with `aria-checked`) or native checkboxes with labels.
- WCAG AA contrast in light and dark themes. Status never shown by colour alone.
- Popup status changes announced with `aria-live="polite"`.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

## UI quality bar (no AI slop, no vibecoded look)

This product's audience is technical, privacy-minded and sceptical. A generic, template-looking UI will read as untrustworthy, and trust is the whole product. The UI should feel like a precise, quiet tool made by someone careful.

### How to approach the design

- Write a design plan in `docs/DESIGN.md` first: four to six named colours with hex values, one or two typefaces with roles, a one-line layout idea for each screen with a rough ASCII wireframe, and three principles specific to this product.
- Review the plan against this brief. Anything that reads like the default for any extension gets changed, and you note what changed and why. Only then write CSS.
- Ground the look in the subject: cleaning up after yourself, forgetting, a clean slate, a tidy ledger of what was kept and why. Calm and exact, a little dry. Not cute, and no cookie mascot.
- Spend boldness in one place, for example the current-site status block in the popup, and keep everything else disciplined.
- The settings page is a working tool. Dense, scannable lists and clear alignment beat big cards and white space.
- Light and dark themes are both designed, not one inverted from the other.
- Use the system font stack or one typeface bundled locally. No remote fonts.

### Things that must not appear

Unless the design plan gives a reason tied to this product, none of these should appear:

- A warm cream background with a high-contrast serif headline and a terracotta or clay accent.
- A near-black background with a single bright acid-green or vermilion accent.
- Everything chopped into identical rounded cards with the same radius and the same soft shadow; gradient washes as decoration.
- Tracked-out ALL-CAPS eyebrow labels above headings.
- Labels written as "Word — fragment" with a spaced em dash; meta text joined with middle dots ("A · B · C").
- A `→` on the end of every button or link.
- One word in a headline picked out in another colour, italic or weight.
- Numbered markers (01, 02, 03) on things that are not a real sequence. (The three setup steps are a real sequence and may be numbered.)
- Emoji as icons or decoration, including cookie emoji.
- Fade-and-slide animations on every element, glows, glassmorphism, blurred backgrounds.
- Monospace used for small labels to look technical. (Monospace for rule patterns and cookie names is fine, because they are code.)
- Default icon kits dropped in without thought. Draw a small, consistent set of SVG icons for this product if icons are needed.
- Marketing filler such as "Supercharge", "Seamlessly", "Unlock", "Effortlessly", "Take control of your privacy journey".

### Writing in the UI

- Sentence case everywhere.
- Buttons say what happens: "Keep this site", "Clean now", "Undo cleanup". Never "Submit", "OK" or "Go".
- Use the same names everywhere: "Keep", "Keep until restart", "Clean". In-app names never use "whitelist" or "greylist"; the importer may mention them when describing the original's files.
- Destructive actions say what will be deleted and how many items before confirming: "Delete cookies and site data for 38 sites? This can't be undone after 2 minutes."
- Errors say what happened and what to do next. No apologies, no exclamation marks.

### Self-review before calling the UI done

- Screenshot the popup in every state (kept, kept until restart, will be cleaned, not a website, setup unfinished, automatic cleaning off) in light and dark, the settings page sections at 1280 px, and the welcome flow. Save them in `docs/screenshots/`.
- Check each screenshot against "Things that must not appear" and fix any match.
- Ask: next to ten other privacy extensions, is this recognisably its own and does it look trustworthy? If not, revise the one bold detail.

## Discoverability and SEO

The audience is already searching. They search the store and Google for the old extension's name, for "alternative", and for the behaviour itself. The listing and landing page should answer those searches directly and honestly.

### Search phrases to target

Use these naturally in the listing and landing page. Never stuff or repeat them in lists; the Chrome Web Store removes listings for keyword spam.

- auto delete cookies
- delete cookies on tab close
- cookie autodelete alternative
- cookie autodelete chrome
- clear cookies automatically
- cookie whitelist
- self-destructing cookies
- delete cookies when closing tab
- partitioned cookies
- cookie cleaner for Chrome

### Chrome Web Store listing (lives in `_locales` and `store/`)

- **Name** (`extName`, 75 characters max): put the behaviour first, because the store name carries the most ranking weight. Suggested: "Crumble: Auto-Delete Cookies on Tab Close". Do not put "Cookie AutoDelete" in the name.
- **Short description** (`extDescription`, 132 characters max). Suggested: "Deletes cookies and site data when you close a tab. Keep the sites you trust. Imports your Cookie AutoDelete lists."
- **Detailed description** (`store/listing-en.md`):
  - Open with one plain sentence: what it does.
  - A short section "Coming from Cookie AutoDelete?" explaining that it uses the same rule syntax and imports CAD export files, and that it is an independent project, not affiliated with the original.
  - What it cleans: first-party, third-party and partitioned cookies, LocalStorage, IndexedDB, Cache Storage, Service Workers.
  - How Keep and Keep until restart work, and the undo window.
  - Why it asks for access to all websites, in plain words.
  - Privacy: no data collected, nothing leaves your browser, open source with a link to the code.
- **Category**: Privacy & Security.
- **Icon**: 128 x 128 PNG, artwork inside 96 x 96 with 16 px transparent padding. Original design; no cookie emoji look-alike, and nothing resembling the original CAD icon.
- **Screenshots**: at least four at 1280 x 800, real UI only:
  - the popup on a site being cleaned,
  - the Keep list in settings,
  - the cleanup log explaining why sites were kept or cleaned,
  - the import preview from a Cookie AutoDelete file.
  Add a short caption bar to each.
- **Small promo tile** 440 x 280; **marquee** 1400 x 560 (recommended).
- **Homepage, support and privacy policy URLs** pointing to the landing site.
- **Microsoft Edge Add-ons**: publish there too with the same listing. The original was on Edge, and its users will search there.

### Landing site (GitHub Pages)

Static pages, plain HTML and CSS, no framework, no tracking cookies (a privacy product with tracking cookies on its own site would be noticed immediately). Pages:

- **Home**: one `<h1>` stating what it does ("Delete cookies when you close the tab"), how it works in three short points, install buttons for Chrome and Edge, and an FAQ.
- **"What happened to Cookie AutoDelete on Chrome?"**: a factual, respectful page explaining the Manifest V2 removal, what this extension keeps the same, what it adds (partitioned and third-party cookies on every cleanup), and step-by-step import instructions. This page targets the highest-intent searches and is the one most likely to be linked from forum threads.
- **Privacy policy**, **Permissions explained**, **Changelog** (dated entries).

Code-level SEO on every page:

- Unique `<title>` under 60 characters and `<meta name="description">` under 155 characters.
- `<link rel="canonical">`.
- Open Graph and Twitter card tags with a 1200 x 630 image, so links shared in Reddit, Vivaldi forum and GitHub threads show a proper preview.
- JSON-LD `SoftwareApplication` (name, `applicationCategory: "BrowserApplication"`, `operatingSystem: "Chrome, Edge, Brave, Vivaldi"`, `offers` price 0) on the home page, and `FAQPage` on pages with an FAQ.
- `robots.txt` and `sitemap.xml`.
- Images in WebP or AVIF with width and height set and descriptive `alt` text.
- Lighthouse 95 or higher on mobile for Performance, Accessibility, Best Practices and SEO.

FAQ questions to answer (these mirror real searches):

- "Is there a Cookie AutoDelete for Chrome now?"
- "How do I move my Cookie AutoDelete whitelist?"
- "Does it delete partitioned (CHIPS) cookies?"
- "Will it log me out of everything?"
- "Why does it need access to all websites?"
- "Does it work on Edge, Brave and Vivaldi?"
- "What's the difference between Keep and Keep until restart?"

### Launch and growth (code-level hooks)

- One-time rating request (see requirements); never nag.
- Uninstall feedback form; read responses weekly.
- Answer the existing forum and Reddit threads asking for a CAD replacement with a short, honest post and a link to the "What happened" page. Do this once per thread, not repeatedly.
- Fast fixes and a visible changelog. In this category, "stopped working" reviews are what sink a listing.

## Repository, hosting and reports

Set up at the end, in the last build phase, on the product owner's GitHub account, same as the YouTube project:

- One public repository, MIT licence (compatible with reusing CAD code), README, `CONTRIBUTING.md`, and `LICENSE-THIRD-PARTY.md` if CAD code is reused.
- GitHub Pages serves the landing site from the same repository.
- Bug reports through a GitHub issue form. The "Report a problem" link in settings prefills: extension version, browser and version, OS, the settings (no rules, no domains, no cookie data), and the last 3 log entries summarised as counts only. The user sees and edits everything before submitting.
- Until setup, use placeholders (`<github-username>`, `<repo-name>`) kept in one config file.

## Build order

Each phase ends when all of its tests pass.

### Phase A: foundation

- Copy `SPIKE-RESULTS.md` to `docs/SPIKES.md` and the spike harness to `tests/harness/` (the spikes are done; do not re-run them).
- Project setup, TypeScript, bundler, lint, Vitest, Playwright with the unpacked extension and local test sites (see "Test environment").
- Settings with defaults and migrations; rule parsing and matching; registrable domain lookup.
- Tests that must pass: "Rule matching", "Settings and storage", "Permissions and manifest".

### Phase B: cleanup engine

- Open-site detection, the decision function, cookie deletion including partitioned cookies, site data cleaning, cleanup lock.
- Scheduler with persisted pending cleanups, timers and alarm backup, overdue handling.
- Triggers: tab close, domain change, startup, manual.
- Tests that must pass: "Cleanup decision", "Partitioned and third-party cookies", "Site data", "Triggers and delay", "Service worker resilience".

### Phase C: interface

- Design plan in `docs/DESIGN.md`, then popup, settings page, welcome and setup flow, badge and icons, context menus, notifications, log and undo, import and export.
- Tests that must pass: "First-run setup", "Popup", "Settings page", "Log and undo", "Import and export", "Badge and icon", "Accessibility", "UI quality".

### Phase D: hardening and release

- Incognito, performance, privacy checks, compatibility, store assets, landing site, repository and issue form.
- Tests that must pass: "Incognito", "Performance", "Privacy and security", "Compatibility", "Store and landing site", then the full suite again.

## Test environment

Automated end-to-end tests need real cookies on several sites, including partitioned and third-party cookies. Set this up once:

- A small local HTTPS server (Node) with a self-signed certificate covering `*.test`.
- Start from the spike harness (`tests/harness/`), which already solved the setup problems below.
- Serve the test sites on port 443 so their origins carry no port number and match exactly what the extension sees in tabs.
- Use Playwright's bundled Chromium, never the user's own Chrome. Launch it with a persistent context and these flags: `--load-extension=<build>`, `--disable-extensions-except=<build>`, `--host-resolver-rules="MAP *.test 127.0.0.1"`, `--ignore-certificate-errors`, `--no-proxy-server`. Use headed mode or the new headless mode, which supports extensions.
- Playwright turns off storage partitioning by default. Turn it back on, exactly as the spike harness does; otherwise every partitioned-cookie and embedded-data test gives misleading results.
- **Restart tests are different.** An extension loaded with `--load-extension` is installed fresh on each launch, so `onStartup` never fires and alarms are wiped. Every test that closes and reopens the browser (SET-02, SET-05, TRG-07, TRG-08, TRG-09, UND-03, and any other restart test) must use a profile where the extension is a normal install, the way the spike harness re-ran its restart check, and must reuse the same profile directory across the restart.
- Allow third-party cookies in the test profile explicitly, so the tests do not depend on Chrome's default.
- Test sites:
  - `a.test` and `b.test`: set first-party cookies, LocalStorage, an IndexedDB database, Cache Storage and a Service Worker.
  - `widget.test`: an iframe page that sets a partitioned cookie (`Secure; SameSite=None; Partitioned`) and LocalStorage. `b.test` embeds it.
  - `tracker.test`: an image or script request from `a.test` that sets a third-party unpartitioned cookie.
  - `app.test` and `sso.test`: a mock login that redirects `app.test → sso.test → app.test` and sets a session cookie on `app.test` at the end.
  - `shop.example.co.test`-style hostnames are not reliable for public suffix tests; use unit tests with real hostnames (`news.bbc.co.uk`) for registrable-domain logic.
- To simulate the service worker being stopped, use the Chrome DevTools Protocol from Playwright to stop the extension's service worker, then trigger the next event.
- Each test starts from a clean profile, except restart tests, which reuse one profile across the restart.
- Chrome caps cookies per registrable domain and per profile, and `cookies.set` reports success even for cookies it then drops. When seeding cookies for a test, re-read to confirm how many actually exist, and assert against that number.

Test IDs below are identifiers, not a sequence. "How" says how each runs: **Unit** (Vitest), **E2E** (Playwright with the test sites), **Manual** (a person in a real browser).

## Test cases

### Rule matching

| ID | Scenario | Expected | How |
|---|---|---|---|
| RUL-01 | `example.com` vs `example.com`, `www.example.com`, `mail.example.com` | Matches the first two only | Unit |
| RUL-02 | `*.example.com` vs `example.com`, `a.b.example.com`, `notexample.com` | Matches the first two only | Unit |
| RUL-03 | `gi*b.com` vs `github.com`, `gitlab.com`, `gib.com`, `github.org` | Matches the first three only | Unit |
| RUL-04 | `*` vs any hostname | Matches all | Unit |
| RUL-05 | `/google\.(ca\|com)/` vs `google.ca`, `google.com`, `google.de` | Matches the first two only | Unit |
| RUL-06 | Input `a.com, *.b.com ,/c/` | Three rules created, spaces trimmed | Unit |
| RUL-07 | Invalid regex `/[a-/` | Rejected with a message naming the problem | Unit |
| RUL-08 | Regex longer than 200 characters | Rejected | Unit |
| RUL-09 | Site on both lists | Treated as Keep | Unit |
| RUL-10 | Keep rule with named cookies `sid, lang` | Only `sid` and `lang` kept; others deleted | Unit + E2E |
| RUL-11 | Internationalised domain (`bücher.de` and its punycode form) | Rule written either way matches both | Unit |
| RUL-12 | Registrable domain of `news.bbc.co.uk`, `a.github.io`, `localhost`, an IP address, `xn--bcher-kva.de` | `bbc.co.uk`, `a.github.io` (private suffixes on), `localhost`, the IP itself, `xn--bcher-kva.de` | Unit |

### Settings and storage

| ID | Scenario | Expected | How |
|---|---|---|---|
| SET-01 | Fresh install defaults | Match the defaults in the data model; `autoClean` false, `setupComplete` false | Unit |
| SET-02 | Change each setting, restart browser | All persist | E2E (restart profile) |
| SET-03 | Migration from an older schema | No values lost, schema updated | Unit |
| SET-04 | Corrupt stored settings | Invalid keys reset to defaults, valid keys kept, no crash | Unit |
| SET-05 | Extension update | Rules, settings and log intact; no tab opened | E2E |

### Permissions and manifest

| ID | Scenario | Expected | How |
|---|---|---|---|
| PER-01 | Read built manifest | Only the permissions listed in this document; `<all_urls>` host permission; no content scripts | Unit (CI) |
| PER-02 | Code search of the build | No `eval`, `new Function`, remote script URLs, `fetch` or `XMLHttpRequest` calls | Unit (CI) |
| PER-03 | Install warnings | Match `docs/PERMISSIONS.md` | Manual |
| PER-04 | All user-facing strings | Come from `_locales` | Unit (CI) |

### First-run setup

| ID | Scenario | Expected | How |
|---|---|---|---|
| SUP-01 | Fresh install with `a.test` and `b.test` open | Welcome opens; both offered in step one | E2E |
| SUP-02 | Before setup completes, close `a.test` and wait delay + 10 s | No cookies deleted anywhere | E2E |
| SUP-03 | Tick `a.test`, choose automatic | `a.test` on Keep; automatic cleaning on immediately | E2E |
| SUP-04 | Close welcome tab mid-setup | Automatic cleaning stays off; popup offers to resume | E2E |
| SUP-05 | Choose manual mode | Nothing cleans automatically; popup buttons work | E2E |

### Cleanup decision

| ID | Scenario | Expected | How |
|---|---|---|---|
| DEC-01 | Cookie for unlisted, unopened site; tab-close cleanup | Deleted, reason recorded | Unit |
| DEC-02 | Cookie for Keep site, any cleanup type | Kept, "On Keep list" | Unit |
| DEC-03 | Keep until restart site, tab-close cleanup | Kept | Unit |
| DEC-04 | Keep until restart site, startup cleanup | Deleted | Unit |
| DEC-05 | Open site, normal cleanup | Kept, "Open in a tab" | Unit |
| DEC-06 | Open site, "include open tabs" cleanup | Deleted unless on a list | Unit |
| DEC-07 | Cookie on `accounts.example.com` while `www.example.com` open | Kept | Unit |
| DEC-08 | Discarded tab, "clean discarded tabs" off then on | Kept, then deleted | Unit + E2E |
| DEC-09 | Two triggers within one second | One cleanup runs; second merged | Unit + E2E |
| DEC-10 | `chrome.cookies.remove` fails for one cookie | Others still removed; failure counted and logged; cookie not reported as deleted | Unit |
| DEC-11 | Cookie with leading-dot domain, `Secure` flag and a path | Removal URL built correctly; cookie deleted | Unit + E2E |
| DEC-12 | `remove` returns success but the cookie is still present (fake API) | Re-read catches it; retried once; then logged as a failure, not as deleted | Unit |
| DEC-13 | Full profile at Chrome's cookie cap | Progress shown in popup; popup stays responsive; all non-kept cookies gone at the end | E2E |

### Partitioned and third-party cookies

| ID | Scenario | Expected | How |
|---|---|---|---|
| PRT-01 | Visit `b.test` (embeds `widget.test`), close it | Partitioned `widget.test` cookie under `b.test` deleted | E2E |
| PRT-02 | Same, but `b.test` on Keep, "keep embedded cookies on kept sites" on | Partitioned cookie kept | E2E |
| PRT-03 | Same as PRT-02 with the option off | Partitioned cookie deleted | E2E |
| PRT-04 | `widget.test` open directly in another tab; close `b.test` | Partitioned cookie under `b.test` deleted; `widget.test`'s own unpartitioned cookie kept | E2E |
| PRT-05 | Visit `a.test` (loads `tracker.test`), close it | `tracker.test` third-party cookie deleted in the same cleanup | E2E |
| PRT-06 | Popup on `b.test` | Cookie count includes partitioned cookies under `b.test` | E2E |
| PRT-07 | Removal called without `partitionKey` (negative unit test against a fake API) | Test proves the implementation always passes the exact key | Unit |

### Site data

| ID | Scenario | Expected | How |
|---|---|---|---|
| DAT-01 | Visit `a.test`, close it, all types on | LocalStorage, IndexedDB, Cache Storage and Service Worker for `a.test` gone (verify by revisiting and reading them) | E2E |
| DAT-02 | Each type turned off in turn | That type survives; others cleaned | E2E |
| DAT-03 | Keep rule with LocalStorage set to "Clean" | Cookies kept; LocalStorage cleaned | E2E |
| DAT-04 | Site still open | Its site data untouched | E2E |
| DAT-05 | Visit `b.test` (embeds `widget.test`), close it | Embedded LocalStorage and IndexedDB of `widget.test` under `b.test` are gone when `b.test` is revisited | E2E |
| DAT-08 | Same, but `b.test` on Keep with site data kept | Embedded data under `b.test` survives | E2E |
| DAT-09 | `widget.test` opened directly earlier, then closed | Its own direct LocalStorage is cleaned by its own origin | E2E |
| DAT-10 | Restart the browser with an unkept site visited before closing | Its site data is cleaned at startup using the persisted origin list | E2E (restart profile) |
| DAT-06 | Turn on a data type | Offer to clear existing data appears once; declining clears nothing | E2E |
| DAT-07 | `browsingData` is never called with `cookies: true` | Verified by spying on the API | Unit |

### Triggers and delay

| ID | Scenario | Expected | How |
|---|---|---|---|
| TRG-01 | Close tab, delay 15 s, worker left running | Cookies gone between 15 and 20 s, not before | E2E |
| TRG-02 | Close tab, reopen same site at 5 s | Cookies kept | E2E |
| TRG-03 | Delay 120 s | Runs through an alarm at about 120 s | E2E |
| TRG-04 | Domain change on, navigate `a.test → b.test` in one tab | `a.test` cleaned after the delay | E2E |
| TRG-05 | Domain change on, mock login `app.test → sso.test → app.test` | Still logged in on `app.test` | E2E |
| TRG-06 | Domain change off, same navigation | Nothing cleaned until the tab closes | E2E |
| TRG-07 | Restart browser with a Keep until restart site | Cleaned at startup; Keep sites untouched | E2E (restart profile) |
| TRG-08 | Close browser while a cleanup is pending; restart | Startup cleanup removes the pending site's data | E2E (restart profile) |
| TRG-09 | Clean open tabs at startup on, with reload on | Restored tab's site cleaned, tab reloaded once, site no longer remembers the user | E2E |
| TRG-10 | Automatic cleaning off | Tab close cleans nothing; manual buttons still work | E2E |

### Service worker resilience

| ID | Scenario | Expected | How |
|---|---|---|---|
| SWR-01 | Stop the service worker, then close a tab | Cleanup happens on time | E2E |
| SWR-02 | Schedule a 15 s cleanup, stop the worker at 5 s | Timer lost; alarm runs the cleanup at about 30 s and no later than 35 s | E2E |
| SWR-06 | Every scheduled cleanup | Has a matching alarm; alarm cleared after the run | Unit |
| SWR-03 | Stop the worker, open three tabs, close one | Open-site map correct; other two sites kept | E2E |
| SWR-04 | Idle 10 minutes with nothing scheduled | No alarms registered; worker asleep | Manual |
| SWR-05 | Module-level state audit | No cleanup decision reads module-level variables | Unit (code review checklist) |

### Popup

| ID | Scenario | Expected | How |
|---|---|---|---|
| POP-01 | Popup on unlisted open site | Status "Will be cleaned after you close it", correct cookie count | E2E |
| POP-02 | Click "Keep" | Rule `*.<registrable domain>` added; status and icon update immediately | E2E |
| POP-03 | Click "Keep until restart", then "Remove from list" | Status updates each time | E2E |
| POP-04 | "Clean this site now" on an open site | Its cookies and enabled site data removed; page not reloaded automatically | E2E |
| POP-05 | "Clean, including open tabs" | Confirmation shows count; on confirm, open non-kept sites cleaned | E2E |
| POP-06 | Popup on `chrome://` or a PDF | "Not a website"; site actions hidden | E2E |
| POP-07 | Popup open time | Under 150 ms (median of 20) | Manual |

### Settings page

| ID | Scenario | Expected | How |
|---|---|---|---|
| STG-01 | Add, edit, search, delete a rule | Works; delete asks for confirmation | E2E |
| STG-02 | Bulk delete 50 rules | Confirmation shows 50; all removed | E2E |
| STG-03 | Change each cleaning setting | Takes effect without restart | E2E |
| STG-04 | 2,000 rules in the list | Page stays responsive; search under 100 ms | Manual |

### Log and undo

| ID | Scenario | Expected | How |
|---|---|---|---|
| LOG-01 | After a cleanup | Log entry lists sites cleaned and kept with reasons | E2E |
| LOG-02 | 60 cleanups | Only the last 50 kept | Unit |
| LOG-03 | Inspect `chrome.storage.local` after cleanups | No cookie values anywhere | E2E |
| UND-01 | Undo within 2 minutes | Deleted cookies restored, including a partitioned one; user logged back in on `app.test` | E2E |
| UND-02 | Wait 2 minutes | Undo gone; `chrome.storage.session` has no cookie values | E2E |
| UND-03 | Restart browser within 2 minutes | Undo gone; no cookie values persisted | E2E (restart profile) |
| UND-04 | Undo when a site is at Chrome's cookie limit | Message reports only the number of cookies actually restored | E2E |

### Import and export

| ID | Scenario | Expected | How |
|---|---|---|---|
| IMP-01 | Import the example file from the CAD documentation | Rules land in the right lists with cookie-name options; preview shown first | Unit + E2E |
| IMP-02 | CAD file with Firefox container lists | Preview offers merge or skip; choice respected | E2E |
| IMP-03 | Import rule that already exists | Shown as "will replace"; replaced only after confirm | E2E |
| IMP-04 | Export then import | Identical rules | Unit |
| IMP-05 | Malformed JSON, wrong types, 2 MB file, 20,000 rules | Each rejected with a plain message; nothing changed | Unit |

### Badge and icon

| ID | Scenario | Expected | How |
|---|---|---|---|
| BDG-01 | Switch between a kept, a restart and an unlisted site | Icon state changes within 1 s each time | E2E |
| BDG-02 | Automatic cleaning off | Greyscale icon | E2E |
| BDG-03 | Badge off in settings | No badge text | E2E |
| BDG-04 | Icon states in greyscale screenshot | Still distinguishable by shape or fill | Manual |

### Incognito

| ID | Scenario | Expected | How |
|---|---|---|---|
| INC-01 | Incognito access not allowed | Extension does not touch incognito; normal profile works | E2E |
| INC-02 | Incognito allowed; close an incognito tab | Incognito cookies for that site cleaned using the same rules | E2E |
| INC-03 | Same site open in normal window; incognito tab closed | Normal-profile cookies untouched | E2E |

### Accessibility

| ID | Scenario | Expected | How |
|---|---|---|---|
| ACC-01 | Keyboard-only use of popup, settings, setup | Everything reachable; focus always visible | Manual |
| ACC-02 | Screen reader (NVDA or VoiceOver) | Switches announced with state; status changes announced | Manual |
| ACC-03 | axe-core on every page | No serious or critical issues | E2E |
| ACC-04 | Contrast in both themes | WCAG AA | Manual |

### UI quality

| ID | Scenario | Expected | How |
|---|---|---|---|
| UIQ-01 | `docs/DESIGN.md` | Palette, type, layout, principles and the list of changes after review | Manual |
| UIQ-02 | Every screenshot vs "Things that must not appear" | No matches | Manual |
| UIQ-03 | Every UI string | Sentence case, plain verbs, consistent names, no filler, no exclamation marks, no "whitelist"/"greylist" | Manual |
| UIQ-04 | Show to someone unfamiliar | They can say what will happen to the current site without help | Manual |

### Performance

| ID | Scenario | Expected | How |
|---|---|---|---|
| PRF-01 | Tab-close cleanup removing 300 cookies | Under 1 s | E2E (seeded) |
| PRF-04 | Full profile at the cookie cap (seed, then confirm count by re-reading) | Read and decide under 200 ms; removal time recorded; under 10 s on a laptop | Manual (laptop) |
| PRF-02 | Bundle sizes | Within budget | Unit (CI) |
| PRF-03 | Page load with and without extension, 5 runs | No measurable difference (no content scripts) | Manual |

### Privacy and security

| ID | Scenario | Expected | How |
|---|---|---|---|
| PRV-01 | Monitor network from all extension contexts for a full session | Zero requests | E2E |
| PRV-02 | Malicious import file (script tags in notes, huge regex) | Stored as plain text or rejected; nothing executes | Unit |
| PRV-03 | Privacy policy vs behaviour | Accurate | Manual |

### Compatibility

| ID | Scenario | Expected | How |
|---|---|---|---|
| CMP-01 | Chrome stable and Edge stable | Full suite passes | E2E |
| CMP-02 | Brave and Vivaldi | Smoke test: setup, tab-close cleanup, partitioned cleanup, popup | Manual |
| CMP-03 | Chrome set to block third-party cookies | No errors; partitioned cleanup still works | E2E |
| CMP-04 | Alongside uBlock Origin Lite and a password manager | No conflicts; password manager logins on Keep sites survive | Manual |

### Store and landing site

| ID | Scenario | Expected | How |
|---|---|---|---|
| STO-01 | Name and short description lengths | Within 75 and 132 characters | Unit |
| STO-02 | Assets | Icon, four screenshots at 1280 x 800, promo tile present | Manual |
| STO-03 | Trademark check | No "Cookie AutoDelete" in name or icon; "not affiliated" line present | Manual |
| STO-04 | Landing Lighthouse (mobile) | 95+ in all four categories | Manual |
| STO-05 | Rich Results Test | `SoftwareApplication` and `FAQPage` valid | Manual |
| STO-06 | Link preview in Reddit and GitHub | Correct title, description, image | Manual |
| STO-07 | Packed zip on fresh Chrome and Edge profiles | Installs and passes the smoke test | Manual |

## Definition of done for version 1

- Every acceptance criterion in "Version 1 requirements" is met.
- Every test case passes and is recorded in `docs/TEST-RESULTS.md` with date, browser versions and build version.
- `SPIKES.md`, `DECISIONS.md`, `PERMISSIONS.md`, `DESIGN.md` and `PRIVACY.md` are complete.
- The landing site, the "What happened to Cookie AutoDelete" page, privacy policy and changelog are live.
- The release checklist is complete.

## Release checklist

- Version bumped in the manifest and changelog.
- Packed zip built from a clean checkout; no source maps, tests or fixtures inside.
- Installed from the zip on fresh Chrome and Edge profiles with no console errors.
- Store listing, screenshots and tiles uploaded to Chrome Web Store and Edge Add-ons.
- Privacy practices form: no data collected. Single purpose: "Deletes cookies and site data for websites the user has left, except sites the user chooses to keep."
- Permission justifications written for `cookies`, `browsingData`, `storage`, `alarms`, `notifications`, `contextMenus` and `<all_urls>`.
- Repository public, issue form live, licence files present.

## After launch

- Watch store reviews, GitHub issues and the forum threads where people asked for a CAD replacement, daily for the first two weeks.
- Track Chrome release notes for changes to the cookies, browsingData and alarms APIs, and to partitioning, and re-run the partitioned and site data tests on each new Chrome stable.
- Fix "stopped working" reports first, every time.

## Still open

- Final product name. "Crumble" is a working name; check the Chrome Web Store, Edge Add-ons and GitHub for clashes before deciding. Whatever the brand, keep "Auto-Delete Cookies on Tab Close" in the store name.
- Whether to offer Keep-list sync across devices in version 2.
- Switching from `tldts` to `chrome.publicSuffix` once Chrome 153+ is widespread (see "Still to check later").
- A faster cookie path through `browsingData` for whole-domain deletes, if its own spike confirms it handles partitioned cookies.
