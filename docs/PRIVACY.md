# Privacy

Crumble collects nothing and sends nothing.

The Inter typeface is included inside the extension. It is never downloaded from a font service while you use Crumble.

- **No account, no analytics, no telemetry, no servers.** The extension makes no network requests of any kind; the PRV-01 test monitors every extension context for a full session and finds none. The only time it opens a web page is when you click a link (changelog, privacy policy, "Report a problem", the rating request), and that page opens in a normal tab.
- **What it stores, and where.** Everything stays in your browser:
  - in `chrome.storage.local`: your rules, settings and the cleanup log, plus the install date, a cleanup counter, whether you answered the rating request, and the web addresses (origins only, no paths) of sites still waiting for their site data to be cleaned. An address is removed as soon as that site's data is cleaned.
  - in `chrome.storage.session` (memory only, cleared when the browser closes): the open-tab map, scheduled cleanups, the addresses seen this session, and for 2 minutes after a cleanup, the deleted cookies so you can undo.
- **Cookie values** are only ever held in that 2-minute, memory-only undo buffer. The log records site names, counts, cookie names of failures, and reasons, never values. Tests LOG-03, UND-02 and UND-03 check this, including that no value reaches the profile's files on disk.
- **Report a problem** opens a prefilled form with the extension version, your browser version, your settings (no rules), and the last 3 cleanups as counts only. No sites, rules or cookie data are included, and you see and edit everything before sending.
- **Uninstall** may open a short optional feedback page. No data about you is added to its address.
- **Chrome Web Store privacy form:** no user data is collected or transmitted.
