# Chrome Web Store and Edge Add-ons listing (English)

**Name** (from `_locales/en/messages.json`, `extName`): Crumble: Auto-Delete Cookies on Tab Close

**Short description** (`extDescription`): Deletes cookies and site data when you close a tab. Keep the sites you trust. Imports your Cookie AutoDelete lists.

**Category:** Privacy & Security

**Single purpose:** Deletes cookies and site data for websites the user has left, except sites the user chooses to keep.

---

## Detailed description

Crumble deletes a website's cookies and site data shortly after you close its last tab, unless you've chosen to keep that site.

**Coming from Cookie AutoDelete?**
Crumble uses the same rule syntax and imports the expressions file you exported from Cookie AutoDelete: your whitelist becomes Keep and your greylist becomes Keep until restart. Crumble is an independent project and isn't affiliated with Cookie AutoDelete or its maintainers.

**What it cleans, every time**
- First-party cookies, third-party cookies, and partitioned cookies (CHIPS), which many cleaners miss
- LocalStorage, IndexedDB, Cache Storage and Service Workers
- Optionally, the browser cache

**Keep and Keep until restart**
Put the sites you want to stay logged in to on Keep, and they're never cleaned automatically. Sites on Keep until restart stay until the browser next starts. You can keep only certain cookies for a site, and choose per site which kinds of site data to clean. Rules work like Cookie AutoDelete's: example.com, *.example.com, wildcards, and /regular expressions/.

**Undo**
Closed a tab by accident? Cleaning waits 15 seconds by default, and reopening the site in time keeps everything. After a cleanup, Undo restores the deleted cookies for 2 minutes. Site data can't be restored.

**Why it asks for access to all websites**
Chrome only lets an extension read and delete cookies for sites it has access to. To clean any site you leave, Crumble needs access to all of them. It never reads or changes what's on the pages you visit, and it doesn't ask for your browsing history.

**Privacy**
No account, no analytics, no servers. Nothing leaves your browser. The code is open source: https://github.com/rahulcv1003/crumble-cookie-cleaner

**Inspiration and thanks**
Crumble is inspired by Cookie AutoDelete's approach to automatic cookie cleanup and keeping trusted sites. Thank you to its creators, maintainers and contributors for their work on browser privacy and for making the project open source. Crumble is an independent implementation with its own interface, and is not affiliated with or endorsed by Cookie AutoDelete.

## Screenshots (1280 x 800, real UI; see store/screenshots/)
1. The popup on a site that will be cleaned
2. The Keep list in settings
3. The cleanup log explaining why each site was kept or cleaned
4. The import preview for a Cookie AutoDelete file

## Links
- Homepage: https://rahulcv1003.github.io/crumble-cookie-cleaner/
- Support: https://github.com/rahulcv1003/crumble-cookie-cleaner/issues
- Privacy policy: https://rahulcv1003.github.io/crumble-cookie-cleaner/privacy.html
