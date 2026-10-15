# Permissions

## Install warnings Chrome shows

Chrome reported these two warnings for the built manifest, via `chrome.management.getPermissionWarningsByManifest` on Chromium 141, 15 October 2026. The `PER-03 (automated part)` test checks the list on every run.

1. **Read and change all your data on all websites**
2. **Display notifications**

The other permissions (`cookies`, `browsingData`, `storage`, `alarms`, `contextMenus`) show no warning of their own. PER-03 also has a manual step: install the packed zip on a fresh profile and confirm the dialog shows exactly these two lines (see `docs/MANUAL-TESTS.md`).

## What each permission is for, in plain words

These explanations are also used on the landing site and in the store listing.

| Permission | Why Crumble needs it |
|---|---|
| Access to all websites (`<all_urls>`) | Chrome only lets an extension read and delete the cookies of sites it has access to. To clean any site you leave, Crumble needs access to all of them. The same access lets it see which sites your tabs are on, so it knows what is still open, without asking for your browsing history. Crumble never reads or changes page content and injects nothing into pages. |
| `cookies` | Read and delete cookies, including third-party and partitioned ones, and restore them when you click Undo. |
| `browsingData` | Clear LocalStorage, IndexedDB, Cache Storage and Service Workers for sites you've left. |
| `storage` | Save your rules, settings and the cleanup log in your browser. |
| `alarms` | Run a scheduled cleanup on time even after Chrome has paused the extension in the background. |
| `notifications` | Show a short message after a cleanup, if you turn notifications on. |
| `contextMenus` | Add "Keep this site" and similar entries to the right-click menu, if you turn them on. |

## Not requested

Crumble doesn't request `tabs`, `history`, `webRequest`, `scripting` or `declarativeNetRequest`, and it has no content scripts.

## Store permission justifications

Use these in the Chrome Web Store and Edge Add-ons forms:

- **cookies:** Deletes cookies, including partitioned and third-party cookies, for sites the user has closed and not chosen to keep; restores them on undo.
- **browsingData:** Removes LocalStorage, IndexedDB, Cache Storage and Service Workers for sites the user has closed and not chosen to keep.
- **storage:** Stores the user's keep rules, settings and a cleanup log locally. Nothing is synced or sent.
- **alarms:** Runs scheduled cleanups reliably when the Manifest V3 service worker has been stopped.
- **notifications:** Optional notification after a cleanup, controlled in settings.
- **contextMenus:** Optional right-click entries to keep or clean the current site, off by default.
- **Host permission `<all_urls>`:** The cookies API only returns and removes cookies for hosts the extension can access. The extension must clean any site the user visits, and read tab URLs to know which sites are still open. It injects no scripts and reads no page content.
