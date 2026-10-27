# Release checklist (version 0.2.0)

| Item | Status | Notes |
|---|---|---|
| Version bumped in the manifest and changelog | Done | 0.2.0 in the manifest, package metadata and changelogs |
| Full automated release verification | Done, 27 October 2026 | [CI run](https://github.com/rahulcv1003/crumble-cookie-cleaner/actions/runs/40470270618): 120 unit and 78 browser tests passed; one discarded-tab manual scenario skipped. Both themes' axe audits had zero violations; packaging and interface/store captures passed |
| Packed zip built from a clean checkout; no source maps, tests or fixtures inside | Automated in CI | `npm run package` builds `release/crumble-0.2.0.zip` (41 files), includes the project, runtime and font licences, and refuses maps, specs, fixtures and test hooks |
| Installed from the zip on fresh Chrome and Edge profiles with no console errors | Waiting for you | Your final test (FINAL-TEST.md) covers Chrome; Edge is the same steps at `edge://extensions` |
| Store listing, screenshots and tiles uploaded to Chrome Web Store and Edge Add-ons | Ready, needs your developer accounts | Text: `store/listing-en.md`. Images: `store/screenshots/`, `store/promo-small-440x280.png`, `store/marquee-1400x560.png`. Icon: `assets/icons/icon-128.png`. Chrome charges a one-time $5 developer fee |
| Privacy practices form: no data collected | Ready | Single purpose: "Deletes cookies and site data for websites the user has left, except sites the user chooses to keep." See `docs/PRIVACY.md` |
| Permission justifications for cookies, browsingData, storage, alarms, notifications, contextMenus and `<all_urls>` | Done | `docs/PERMISSIONS.md`, "Store permission justifications" |
| Repository public, issue form live, licence files present | Done | `rahulcv1003/crumble-cookie-cleaner`; includes README, contributing guide, MIT licence, third-party runtime notices, issue form, CI, and Pages deployment. Cookie AutoDelete is credited as inspiration; none of its code was reused |
| Landing site live on GitHub Pages | Done, checked 19 October 2026 | Homepage, privacy policy, and changelog return HTTP 200. Run **Deploy website** after changing site content |
| Placeholders replaced | Partly done | GitHub and Pages URLs are configured. Add the Chrome Web Store extension ID to `src/config.ts` after the listing exists, then run `npm run package` and `npm run site` again |
| Name clash check for "Crumble" | To do | Search the Chrome Web Store, Edge Add-ons and GitHub before publishing |
