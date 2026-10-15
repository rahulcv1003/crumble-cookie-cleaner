# Spike results

Run date: 2026-10-15. Spikes from "Things to verify before building (technical spikes)" in `crumble-cookie-cleaner-PRD.md`, plus the extra quick checks. The full raw JSON for every check is in `results/*.json`. The excerpts below are trimmed: cookie values are cut to their first 10 characters, though every test cookie value here is a single character anyway.

## Environment
- Chromium version: 141.0.7390.37 (Official Build) (64-bit), the Playwright-bundled Chromium (`chromium-1194`)
- Playwright version: 1.56.0 (npm `playwright@1.56.0`)
- OS: Ubuntu 24.04.5 LTS, Linux kernel 6.18 x86_64. This is Claude's isolated cloud sandbox: 2 vCPU Intel Xeon @ 2.10GHz, 7.8 GB RAM. Chromium ran headed under Xvfb. Node 22.22.0.
- Third-party cookies allowed in profile: yes. I set them explicitly in each fresh profile (`profile.cookie_controls_mode = 0` and `profile.block_third_party_cookies = false` in `Default/Preferences`, before launch). Confirmed by behaviour: `tracker.test` (third-party image) and the unpartitioned `plain` cookie (cross-site iframe) were both stored.
- Anything that differed from the setup instructions:
  1. **Where it ran.** Everything ran in Claude's isolated cloud sandbox, not on your Windows PC. Your real Chrome, profile, cookies and accounts were never touched. Afterwards the harness files and this report were copied into your "Cookie Remover" folder.
  2. **Port 443 instead of 8443.** With 443, origins are exactly `https://widget.test`, `https://a.test` and so on. The `browsingData` `origins` filter matches on the full origin including the port, so with 8443 the origins in the instructions (`["https://widget.test"]`) would not have matched.
  3. **No `npx playwright install chromium`.** I used the Chromium that was preinstalled for Playwright 1.56.0. Downloading a newer Chromium was blocked by the sandbox's network policy (see Problems).
  4. **Two Playwright default flags removed.** Playwright launches Chromium with `--disable-features=...ThirdPartyStoragePartitioning...`, which turns off storage partitioning and would have made Spike 2 meaningless. I kept Playwright's other disabled features and removed only that one. I also removed `--disable-extensions` so the extension could load. The final command line was checked on `chrome://version`.
  5. **Added `--no-proxy-server`.** Without it, Chromium picked up the sandbox's outbound proxy and could not reach the local `*.test` server. With it, the browser cannot reach any real site.
  6. **How the runner messages the extension.** The test runner calls the extension through a bundled bridge page (`runner.html`). The page sends `chrome.runtime.sendMessage({cmd,args})`, and the service worker's `onMessage` handler makes the API call and returns raw JSON.
  7. **Spike 4c/4d needed a second method.** Run as written, with `--load-extension` on every launch, the restart results are an artifact of how Chrome treats command-line extensions (details under 4). I re-ran 4c/4d with the extension stored as a normal "unpacked" install in the test profile and relaunched without `--load-extension`. Both results are reported.
  8. **X3 seeding.** All 500 hostnames under `*.seed.test` share one registrable domain, and Chrome kept only 164 of the 5,000 cookies. I re-ran with 500 separate registrable domains (`h0.test` … `h499.test`). Both runs are reported.
  9. **Test profiles location.** Profiles were created in `./profiles/` inside the harness folder, not in a system temp folder. They were not copied to your folder.

## Summary table
| Check | Result (PASS/FAIL/PARTIAL/NOT RUN) | One-line finding |
|---|---|---|
| 1b getAll without partitionKey returns partitioned cookie? | PASS | As expected: `getAll({})` returned only the unpartitioned `plain`; the partitioned `part` was not included. |
| 1c getAll with partitionKey {} returns it, with full key | PASS | `part` returned with `partitionKey: {"hasCrossSiteAncestor": true, "topLevelSite": "https://b.test"}`, alongside unpartitioned cookies. |
| 1d remove without key leaves it | PASS | Cookie still present afterwards. But `remove` returned a non-null details object (`{name, storeId, url}`), which looks like success. |
| 1e remove with exact key deletes it | PASS | Cookie gone; `remove` returned details including the `partitionKey`. |
| 1f third-party and unpartitioned cookies visible | PASS | `getAll({partitionKey:{}})` returned `widget.test` `plain`, `a.test` `first` and `tracker.test` `trk`. |
| 1g set with partitionKey restores it | PASS | Reappeared with an identical `partitionKey`, and the iframe could read it again (`document.cookie` = `plain=1; part=1`). |
| 2e embedded localStorage/IndexedDB cleared by origins filter | FAIL | `origins:["https://widget.test"]` did NOT clear `widget.test`'s data embedded under `b.test` (`w`="1", `wdb` still there). |
| 2f direct widget.test localStorage cleared | PASS | `direct` = null after the removal. |
| 2g what clears embedded data (if 2e failed) | PASS | `origins:["https://b.test"]` (the top-level site) cleared it. No origins filter (whole profile) also cleared it, tested separately on a fresh profile. |
| 2h Cache Storage / Service Workers cleared by origin | PASS | `origins:["https://a.test"]` cleared Cache Storage (`acache`) and the service worker registration, each tested on its own. |
| 3 publicSuffix available (or tldts used) | PARTIAL | `chrome.publicSuffix` is `undefined` in Chromium 141. The docs say it needs Chrome 153+ and the `publicSuffix` permission, which I couldn't test here. Recorded `tldts` 7.4.18 instead (128,337 B min, 47,031 B gzip). |
| 4b setTimeout fired after worker stop | FAIL | Did not fire: the 15 s `setTimeout` was lost when the worker was stopped at about 5.5 s. |
| 4b alarm fired after worker stop | PASS | The alarm woke the stopped worker and fired 60.018 s after scheduling. |
| 4d session storage after restart | PASS | As expected, the `chrome.storage.session` value was gone after the restart, with both install methods. |
| 4d local storage after restart | PASS | `chrome.storage.local` value survived (both install methods). |
| 4d alarm survived restart and fired | PARTIAL | Persisted unpacked install: survived and fired on time (60.006 s). `--load-extension` relaunch: alarm gone, never fired. |
| 4d onStartup fired | PARTIAL | Persisted unpacked install: fired. `--load-extension` relaunch: did not fire; `onInstalled` fired with reason `install` instead. |
| X1 tab URLs without tabs permission | PASS | Yes: `url` and `title` returned for the `https://a.test/` tab. Not returned for `about:blank` or for the extension's own page. |
| X2 cookie stores | PASS | One store: `[{"id":"0","tabIds":[...3 tabs]}]`. |
| X3 timings (ms) | PARTIAL | 5,000 cookies across 500 registrable domains: only 3,194 were kept. `getAll` took about 40–44 ms and removal about 5,800–6,460 ms, all removals succeeding. |

## Details per check

### Spike 1: Partitioned cookie round trip (`spike1.js` → `results/spike1.json`)

**What I did.** Opened `https://b.test/`, which embeds `https://widget.test/widget`. The widget response sets `part=1; Secure; SameSite=None; Partitioned; Path=/` and `plain=1; Secure; SameSite=None; Path=/`. Inside the iframe, `document.cookie` = `"part=1; plain=1"`.

**1b.** `chrome.cookies.getAll({})` and `getAll({domain:"widget.test"})` both returned only:
```json
[{"domain":"widget.test","hostOnly":true,"httpOnly":false,"name":"plain","path":"/","sameSite":"no_restriction","secure":true,"session":true,"storeId":"0","value":"1"}]
```

**1c.** `chrome.cookies.getAll({ partitionKey: {} })` returned:
```json
[{"domain":"widget.test","hostOnly":true,"httpOnly":false,"name":"part","partitionKey":{"hasCrossSiteAncestor":true,"topLevelSite":"https://b.test"},"path":"/","sameSite":"no_restriction","secure":true,"session":true,"storeId":"0","value":"1"},
 {"domain":"widget.test","hostOnly":true,"httpOnly":false,"name":"plain","path":"/","sameSite":"no_restriction","secure":true,"session":true,"storeId":"0","value":"1"}]
```

**1d.** `chrome.cookies.remove({url:"https://widget.test/", name:"part"})` returned:
```json
{"name":"part","storeId":"0","url":"https://widget.test/"}
```
Re-reading with `partitionKey:{}` still showed `part` with the same `partitionKey`. The cookie survived even though the call returned a non-null result.

**1e.** `chrome.cookies.remove({url:"https://widget.test/", name:"part", partitionKey:{"hasCrossSiteAncestor":true,"topLevelSite":"https://b.test"}})` returned:
```json
{"name":"part","partitionKey":{"hasCrossSiteAncestor":true,"topLevelSite":"https://b.test"},"storeId":"0","url":"https://widget.test/"}
```
Re-read: only `plain` remained for `widget.test`.

**1f.** After opening `https://a.test/` (which loads `https://tracker.test/pixel.png`), `getAll({partitionKey:{}})` returned:
```json
[{"domain":"widget.test","name":"plain","sameSite":"no_restriction","secure":true,"session":true,"storeId":"0","value":"1", "...":"..."},
 {"domain":"a.test","name":"first","sameSite":"lax","secure":true,"session":true,"storeId":"0","value":"1", "...":"..."},
 {"domain":"tracker.test","name":"trk","sameSite":"no_restriction","secure":true,"session":true,"storeId":"0","value":"1", "...":"..."}]
```
(Fields elided above are `hostOnly:true, httpOnly:false, path:"/"`. The full objects are in the JSON file.) `getAll({})` returned the same three.

**1g.** `chrome.cookies.set` was called with the original values:
```json
{"url":"https://widget.test/","name":"part","value":"1","path":"/","secure":true,"httpOnly":false,"sameSite":"no_restriction","partitionKey":{"hasCrossSiteAncestor":true,"topLevelSite":"https://b.test"}}
```
It returned the cookie with `"partitionKey":{"hasCrossSiteAncestor":true,"topLevelSite":"https://b.test"}`. `getAll({partitionKey:{}})` then listed it again with that key. I reloaded `b.test` with a read-only embed that sets no cookies, and the iframe's `document.cookie` was `"plain=1; part=1"`. No `expirationDate` was passed because the original was a session cookie (`session:true`); the restored cookie is also a session cookie.

**Surprising:**
- `remove` without `partitionKey` returns a non-null object, which looks like success, but deletes nothing.
- For an iframe embedded directly in a cross-site top-level page, `hasCrossSiteAncestor` is `true`.
- I also tried `cookies.set` with `partitionKey: {topLevelSite:"https://b.test"}` and no `hasCrossSiteAncestor`. It created a cookie whose stored key has `hasCrossSiteAncestor: true`, so it defaulted to true here.

### Spike 2: Partitioned site data (`spike2.js`, `spike2g2.js` → `results/spike2.json`, `results/spike2g2.json`)

**What I did.** The reads use pages that do not write anything. `b.test/ro` embeds `widget.test/widget-ro`, `widget.test/` is the direct page, and `a.test/blank` is the a.test read page. Each read uses `localStorage.getItem` and `indexedDB.databases()`, plus `caches.keys()` and `navigator.serviceWorker.getRegistrations()` on `a.test`.

- **a.** Embedded (iframe under `b.test`) after writing: `{"ls_w":"1","idb":["wdb"],"cookie":"part=1; plain=1"}`
- **b.** `widget.test` opened directly after writing `direct`: `{"ls_direct":"1","ls_w":null,"idb":[],"cookie":"plain=1"}`. The direct context does not see the embedded `w` or `wdb`, which confirms the storage is partitioned.
- **c.** Both tabs closed. Baselines read again before removal were unchanged.
- **d.** `browsingData.remove({origins:["https://widget.test"]},{localStorage:true,indexedDB:true})` returned `{"ok":true,"ms":3}`.
- **e.** Embedded after removal: `{"ls_w":"1","idb":["wdb"],"cookie":"part=1; plain=1"}`. **The data survived.**
- **f.** Direct after removal: `{"ls_direct":null,"ls_w":null,"idb":[],"cookie":"plain=1"}`. **Cleared.**
- **g.**
  - `browsingData.remove({origins:["https://b.test"]},{localStorage:true,indexedDB:true})` returned `{"ok":true,"ms":4}`. Embedded afterwards: `{"ls_w":null,"idb":[],"cookie":"part=1; plain=1"}`. **Cleared.**
  - The no-filter call (`browsingData.remove({},{localStorage:true,indexedDB:true})`) was also run in the same session, but the data was already gone by then. So I tested it again on a fresh profile. Before: `{"ls_w":"1","idb":["wdb"]}`. Call: `{"ok":true,"ms":19}`. After: `{"ls_w":null,"idb":[]}`. **Cleared.**
- **h.** `a.test` after its writes: `{"ls_a":"1","idb":["adb"],"caches":["acache"],"sw":["https://a.test/"],"cookie":"first=1"}`. Each removal below used `origins:["https://a.test"]`:
  - `{cacheStorage:true}` returned `{"ok":true,"ms":2}`. Afterwards: `{"ls_a":"1","idb":["adb"],"caches":[],"sw":["https://a.test/"]}`. Cache Storage cleared, nothing else touched.
  - `{serviceWorkers:true}` returned `{"ok":true,"ms":2}`. Afterwards: `{"ls_a":"1","idb":["adb"],"caches":[],"sw":[]}`. Service worker cleared.
  - `{localStorage:true,indexedDB:true}` returned `{"ok":true,"ms":2}`. Afterwards: `{"ls_a":null,"idb":[],"caches":[],"sw":[]}`.

**Surprising:**
- Filtering by the embedded origin does not reach that origin's partitioned storage.
- Filtering by the top-level site's origin does.
- `browsingData.remove` never touched cookies here; `part` and `plain` remained in every read. No `cookies` data type was passed.

**Not covered.** Cache Storage and service workers were only tested for a top-level `a.test`. They were not tested for an embedded, partitioned origin, because the instructions place them on `a.test`.

### Spike 3: Registrable domain lookup (`spike3x.js` → `results/spike3x.json`, `results/spike3_tldts.json`)

**a.** In the service worker, `typeof chrome.publicSuffix` = `"undefined"`. The manifest declared `cookies, browsingData, storage, alarms` only. The `chrome` keys in the service worker were:
```json
["alarms","browsingData","cookies","csi","dom","extension","i18n","loadTimes","management","permissions","runtime","storage","tabs","windows"]
```

**b.** The API exists in the documentation, at [developer.chrome.com/docs/extensions/reference/api/publicSuffix](https://developer.chrome.com/docs/extensions/reference/api/publicSuffix).
- Permission: `publicSuffix`.
- Availability: "Chrome 153+".
- Methods: `getDomain(hostname, options?) → string|undefined`, `getKnownSuffix(hostname) → string|undefined`, `isKnownSuffix(hostname) → boolean`.
- Release channel and manifest version are not stated on the page.

**NOT RUN against the real API.** The tested Chromium is 141, and installing Chromium 153 or later was blocked (see Problems). The test extension also did not request the `publicSuffix` permission.

**c.** `tldts` 7.4.18 (`npm i tldts`; it also installs `tldts-core`). Output for each input:

| Input | `getDomain` | `getPublicSuffix` | Notes |
|---|---|---|---|
| `news.bbc.co.uk` | `bbc.co.uk` | `co.uk` | |
| `a.github.io` | `github.io` | `io` | Default settings. With `{allowPrivateDomains:true}`: `getDomain` = `a.github.io`. |
| `sub.example.com` | `example.com` | `com` | |
| `localhost` | `null` | `localhost` | |
| `127.0.0.1` | `null` | `null` | `parse().isIp` = `true` |
| `xn--bcher-kva.de` | `xn--bcher-kva.de` | `de` | |
| `bücher.de` (extra) | `bücher.de` | `de` | Returned as given; not converted to punycode. |
| `widget.test` (extra) | `widget.test` | `test` | `isIcann` = `false` |

Size: `dist/index.esm.min.js` is 128,337 bytes minified, and 47,031 bytes gzipped (CJS and UMD builds are about the same size).

### Spike 4: Service worker sleep and browser shutdown (`spike4.js`, `spike4v.js`, `spike4d_unpacked.js`, `spike4_missed.js` → `results/spike4*.json`)

**4a/4b.** At 06:19:32.795Z the extension called `setTimeout(15000)` and created alarm `sleeptest` at +60 s: `{"name":"sleeptest","scheduledTime":1792045232795}`.

About 5.5 s later, the worker was stopped through the Chrome DevTools Protocol (`ServiceWorker.enable`, then `ServiceWorker.stopWorker({versionId:"0"})`, sent on a CDP session attached to the extension's own page). The status log confirmed it: `running` → `stopping` → `stopped` (06:19:38.3Z). Nothing woke the worker until 06:20:32.799Z (`starting` → `running`), which is when the alarm was due.

Result:
```json
{"timeoutFiredAt":null,"alarmFiredAt":"2026-10-15T06:20:32.813Z","alarmDelayFromScheduleMs":60018,"timeoutDelayFromScheduleMs":null,
 "swBoots":["2026-10-15T06:19:32.646Z","2026-10-15T06:20:32.814Z"],"alarmsNow":[]}
```

**4c/4d, run as written (`--load-extension` on every launch).** Set `sessionVal`, `localVal`, and alarm `restarttest` at +60 s. Closed the context 0.1 s later, waited 10 s and relaunched with the same profile directory. Immediately after relaunch:
```json
{"sessionVal":null,"localVal":"L-1792045250700","alarms":[],"onStartupFiredAt":null,
 "installEvents":[{"at":"2026-10-15T06:20:50.559Z","reason":"install"},{"at":"2026-10-15T06:21:01.247Z","reason":"install"}],"alarmFired_restarttest":null}
```
At +75 s: `{"alarmFired_restarttest":null,"alarms":[]}`.

The same thing happened when the browser was closed 8 s after scheduling instead of 0.1 s (variant B). The profile's `Preferences` stores the extension with `"location": 8`, which is Chrome's COMMAND_LINE install type. When relaunched without `--load-extension` (variant C), the extension was absent: no service workers, nothing listed on `chrome://extensions`. So `--load-extension` installs the extension fresh on every launch. That explains the `install` event, the missing `onStartup` and the lost alarm.

**4c/4d, persisted unpacked install** (the profile entry changed to `"location": 4`, `extensions.ui.developer_mode: true`, relaunched without `--load-extension`):
- On the first launch in this mode, `onStartup` fired, with no new `install` event.
- Prepared values at 06:24:14.466Z, alarm `restarttest` at +60 s. Closed 5.1 s later, waited 10 s and relaunched.

Immediately after relaunch:
```json
{"sessionVal":null,"localVal":"L-1792045454466","alarms":[{"name":"restarttest","scheduledTime":1792045514466}],
 "onStartupFiredAt":"2026-10-15T06:24:30.042Z","installEvents":[{"at":"2026-10-15T06:24:12.577Z","reason":"install"}]}
```
At +75 s: `{"alarmFired":"2026-10-15T06:25:14.472Z","firedSecondsAfterPrepare":60.006,"alarms":[]}`.

**Extra (persisted unpacked install): an alarm that comes due while the browser is closed.** Created a 20 s alarm, closed the browser 3.1 s later, and relaunched 33.6 s after creating it:
```json
{"alarmFiredAt":"2026-10-15T06:26:18.941Z","firedSecondsAfterCreate":33.481,"onStartupFiredAt":"2026-10-15T06:26:18.940Z","alarms":[]}
```
The missed alarm fired at startup, 1 ms after `onStartup`.

**Surprising:**
- The test method changes the 4d results completely: command-line-loaded extensions behave like a fresh install on every launch.
- A `setTimeout` pending when the browser closes cannot fire. This was not tested separately, but 4b shows timers are lost whenever the worker stops.

### X1: Tab URLs without "tabs" permission (`results/spike3x.json`)
`chrome.tabs.query({})` with `host_permissions: ["<all_urls>"]` and no `tabs` permission:
```json
[{"id":371209637,"hasUrlKey":false,"hasTitleKey":false},
 {"id":371209638,"hasUrlKey":false,"hasTitleKey":false},
 {"id":371209639,"url":"https://a.test/","title":"a.test","hasUrlKey":true,"hasTitleKey":true}]
```
The first two tabs are Playwright's `about:blank` tab and the extension's own `chrome-extension://…/runner.html` bridge page. Neither got a `url` or `title`.

### X2: Cookie stores
`chrome.cookies.getAllCookieStores()` with one normal window and three tabs open:
```json
[{"id":"0","tabIds":[371209637,371209638,371209639]}]
```
Incognito was not opened or tested.

### X3: Timings (`x3.js` → `results/x3.json`)

**Method.** `chrome.cookies.set` in `Promise.all` batches of 100, with 10 cookies per host. Then I timed `getAll({partitionKey:{}})` and removed each cookie with `chrome.cookies.remove` in `Promise.all` batches of 100. Each run used a fresh profile; there were 3 runs per layout.

| Layout | `set` resolved OK | Cookies present after seeding | Seed ms | `getAll` ms | Remove-all ms | Removed / null / error | Left after |
|---|---|---|---|---|---|---|---|
| 500 hosts `hN.seed.test` (1 registrable domain) | 5000 | 164 | 1829 / 1756 / 1809 | 2.4 / 2.6 / 2.4 | 46.3 / 62.1 / 45.4 | 164 / 0 / 0 | 0 |
| 500 hosts `hN.test` (500 registrable domains) | 5000 | 3194 | 907 / 813 / 769 | 43.8 / 43.0 / 39.5 | 6305.4 / 5797.1 / 6461.5 | 3194 / 0 / 0 | 0 |

**Surprising:**
- Every `cookies.set` call resolved with a cookie, yet Chrome silently evicted most of them. 5,000 cookies could not be stored in one profile: about 180 per registrable domain and about 3,300 for the whole profile are Chrome's cookie store limits, and the counts seen here (164 and 3,194) match eviction at those limits.
- Removal time grew faster than the cookie count: about 0.3 ms per cookie with 164 cookies, and about 1.9 ms per cookie with 3,194.
- These times are from a 2-vCPU cloud VM running Chromium under Xvfb, not a laptop.

## Problems and workarounds
- **Folder and PRD.** No folder was connected at first. The "Cookie Remover" folder you then connected looked empty from the session, and the PRD arrived as a chat message instead. The PRD's spike section was read from that message.
- **Newer Chromium (for `chrome.publicSuffix`, Chrome 153+) could not be installed.** `npx playwright@1.64.1 install chromium` (Chrome for Testing 156.0.8078.4) failed with HTTP 403 "request blocked: no rule or allowlist entry allows host cdn.playwright.dev". A reachability check to `storage.googleapis.com` and `googlechromelabs.github.io` also returned 403. I stopped there and did not try other sources. Spike 3b remains NOT RUN against the real API.
- **Playwright disables storage partitioning by default.** Worked around as described in Environment item 4.
- **Proxy.** Chromium initially failed with `net::ERR_TUNNEL_CONNECTION_FAILED` on `https://b.test/`. Fixed with `--no-proxy-server`.
- **Playwright's internal flag list.** `require('playwright-core/lib/server/chromium/chromiumSwitches')` is blocked by the package's exports map, so I loaded it by file path to reuse Playwright's exact flag strings.
- **4c/4d with `--load-extension`.** It produces a fresh install on every launch. The workaround was to edit the test profile's `Preferences` (`location` 8 → 4, developer mode on) and relaunch without `--load-extension`. This worked on the first attempt and took about 5 minutes. It edits an internal Chrome preference, which is not a supported install path.
- **X3 seeding** hit Chrome's per-domain cap, as described above. Re-ran with distinct registrable domains.
- **Stopping the worker.** CDP `ServiceWorker.stopWorker`, sent on a session attached to the extension page, worked; `chrome://serviceworker-internals` was not needed.
- **Nothing hit the 15-minute block limit** apart from the Chromium 153+ download, which was blocked by policy rather than by time.

## Files
All of these were created in the harness folder and copied to "Cookie Remover/spike-harness/", except this report, which is at the top of "Cookie Remover". `node_modules/` and `profiles/` were not copied; run `npm install` to restore dependencies.
- `package.json`, `package-lock.json`: `playwright@1.56.0`, `tldts@7.4.18`
- `certs/cert.pem`, `certs/key.pem`: throwaway self-signed certificate for `*.test`, `a.test`, `b.test`, `widget.test`, `tracker.test`
- `sites/server.js`: local HTTPS server on port 443 routing `a.test`, `b.test` (`/`, `/ro`, `/blank`), `widget.test` (`/`, `/widget`, `/widget-ro`) and `tracker.test` (`/pixel.png`)
- `spike-extension/manifest.json`, `spike-extension/sw.js`, `spike-extension/runner.html`, `spike-extension/runner.js`: throwaway MV3 extension and its message bridge
- `lib.js`: launch helper (persistent context, flags, third-party cookie preferences, runner bridge)
- `smoke.js`: launch smoke test that prints the `chrome://version` command line
- `spike1.js`, `spike2.js`, `spike2g2.js`, `spike3x.js` (Spike 3a, X1, X2), `spike4.js`, `spike4v.js`, `spike4d_unpacked.js`, `spike4_missed.js`, `x3.js`
- `results/spike1.json`, `spike2.json`, `spike2g2.json`, `spike3x.json`, `spike3_tldts.json`, `spike4.json`, `spike4_variants.json`, `spike4_unpacked.json`, `spike4_missed.json`, `x3.json`: full raw outputs

To re-run on Linux: start `sudo node sites/server.js` (port 443), then run `xvfb-run -a node <script>.js`.
