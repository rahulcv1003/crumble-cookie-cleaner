# Release checklist (version 0.1.0)

| Item | Status | Notes |
|---|---|---|
| Version bumped in the manifest and changelog | Done | 0.1.0 in `manifest.json` and `site/changelog.page.html` |
| Packed zip built from a clean checkout; no source maps, tests or fixtures inside | Done (from the build workspace) | `npm run package` builds `release/crumble-0.1.0.zip` (37 files) and refuses maps, specs, fixtures and test hooks. Re-run from a clean clone of the repository once it exists |
| Installed from the zip on fresh Chrome and Edge profiles with no console errors | Waiting for you | Your final test (FINAL-TEST.md) covers Chrome; Edge is the same steps at `edge://extensions` |
| Store listing, screenshots and tiles uploaded to Chrome Web Store and Edge Add-ons | Ready, needs your developer accounts | Text: `store/listing-en.md`. Images: `store/screenshots/`, `store/promo-small-440x280.png`, `store/marquee-1400x560.png`. Icon: `assets/icons/icon-128.png`. Chrome charges a one-time $5 developer fee |
| Privacy practices form: no data collected | Ready | Single purpose: "Deletes cookies and site data for websites the user has left, except sites the user chooses to keep." See `docs/PRIVACY.md` |
| Permission justifications for cookies, browsingData, storage, alarms, notifications, contextMenus and `<all_urls>` | Done | `docs/PERMISSIONS.md`, "Store permission justifications" |
| Repository public, issue form live, licence files present | Done | `rahulcv1003/crumble-cookie-cleaner`; includes README, contributing guide, MIT licence, issue form, CI, and Pages deployment. No Cookie AutoDelete code was reused, so no `LICENSE-THIRD-PARTY.md` is needed |
| Landing site live on GitHub Pages | Ready, needs one setting | In repository **Settings → Pages**, choose **GitHub Actions** as the source, then run the **Deploy website** workflow. `.github/workflows/pages.yml` builds and deploys `dist-site/` |
| Placeholders replaced | Partly done | GitHub and Pages URLs are configured. Add the Chrome Web Store extension ID to `src/config.ts` after the listing exists, then run `npm run package` and `npm run site` again |
| Name clash check for "Crumble" | To do | Search the Chrome Web Store, Edge Add-ons and GitHub before publishing |
