# Crumble 0.1.0 release review — 19 October 2026

## Scope and evidence

This review checks the release candidate, the Cookie AutoDelete inspiration,
and the acknowledgements requested before Chrome Web Store submission.

- Code under review: `57f6b54a41d655d8f8a7181632f453b9ef34e988`.
- [Final CI run](https://github.com/rahulcv1003/crumble-cookie-cleaner/actions/runs/39217361092).
- Local verification: typecheck, lint, production build, all 118 unit tests,
  release packaging, and the six-page site build passed.
- Runtime dependency audit: `npm audit --omit=dev` found zero known vulnerabilities.
- The local Windows browser launch check stopped before executing an extension
  assertion (`browserType.launchPersistentContext: spawn UNKNOWN`). The full
  browser suite therefore runs on GitHub's isolated Linux runner.
- Final CI result: **PASS**. All 118 unit tests and 75 installed-extension browser
  tests passed. One browser test (discarded tabs) was deliberately skipped and
  remains on the manual list. There were zero unexpected or flaky browser results.
- Both screenshot-generation tests passed. The updated About section was
  visually reviewed in [light](screenshots/settings-about-light.png) and
  [dark](screenshots/settings-about-dark.png) themes: the credit and link are
  readable, with no clipped text or overlapping controls.
- The production-build smoke test passed without test hooks: fresh setup in
  manual mode, the toolbar popup, settings, and the inspiration credit work.
- Accessibility scans reported no axe violations in the tested views. The
  300-cookie performance case removed 302 cookies in 113 ms (budget: 1 second).
- CI built the 39-file package and retained the package, screenshots, and test
  reports in the `release-review` workflow artifact for 14 days.

## Release package

`release/crumble-0.1.0.zip` contains 39 files, including the Manifest V3 extension,
English messages, icons, the Crumble MIT licence, and the notices for bundled
punycode, tldts, and tldts-core. No test hooks, source maps, fixtures, private keys,
environment files, or node_modules are packaged. All manifest-referenced files
are present. The new inspiration credit and link are in the production build.

The local upload ZIP was replaced with the exact ZIP produced by the passing CI
run, after verifying the local and CI archive contents matched (only JSON line
endings differed). Its SHA-256 is:

`012505fab6ba359d8dad08101deb4338294f5078b747ab56502164fe4894e605`

The release review corrected missing bundled dependency notices: the build
previously stripped licence comments without shipping separate notices. The
build now copies both licence files, and the existing manifest contract test
verifies their contents.

## UI comparison

References inspected:

- [Cookie AutoDelete's own repository](https://github.com/Cookie-AutoDelete/Cookie-AutoDelete).
- The Popup, Settings, and Expression Table screenshots on its
  [official Firefox listing](https://addons.mozilla.org/en-US/firefox/addon/cookie-autodelete/).
- Crumble's popup and Lists screenshots in `docs/screenshots/` and the design
  specification in `docs/DESIGN.md`.

The similarity is functional: both expose an automatic-cleaning switch, cookie
counts, per-site exceptions, manual cleanup, and a rule table. Crumble uses the
names **Keep** and **Keep until restart** for the corresponding exception lists.

The visual design is distinct. The reference popup uses a dense horizontal
toolbar with colourful action buttons and a matched-expression table. Crumble
uses a vertical site-status block, outlined buttons, a separate automatic-cleaning
row, and filled/half-filled/struck-through square marks. Settings use restrained
rows, sidebar section navigation, and light/dark themes. It is a familiar workflow,
not a pixel-for-pixel reproduction. This follows the PRD's original-design requirement.

## Inspiration and thanks

Added an **Inspiration and thanks** row to Settings → About, with a direct link
to Cookie AutoDelete. The same acknowledgement appears in README.md, the store
listing copy, and the website source:

> Crumble is inspired by Cookie AutoDelete's approach to automatic cookie cleanup
> and keeping trusted sites. Thank you to its creators, maintainers and contributors
> for their work on browser privacy and for making the project open source.

The copy states that Crumble is an independent implementation with its own
interface and is not affiliated with or endorsed by Cookie AutoDelete. The
existing statement that no Cookie AutoDelete code was reused is retained.

Website-source changes require another run of **Deploy website** to reach the
live site; the website credit should not be considered deployed merely because
the source was pushed.

## Remaining acceptance and store steps

- Run `FINAL-TEST.md` in a fresh, current Chrome profile using the packaged build.
  Chromium automation does not certify the current Chrome stable release.
  The browser-control connection in this session does not permit
  `chrome-extension://` pages, so this review did not drive the already-installed
  extension in the user's personal profile.
- Complete the manual items in `docs/MANUAL-TESTS.md`, especially discarded tabs,
  install warnings, idle-worker behaviour, keyboard use, and screen-reader use.
- The homepage, privacy policy, and changelog returned HTTP 200 during this review.
  The privacy URL for the store is
  https://rahulcv1003.github.io/crumble-cookie-cleaner/privacy.html.
- Store listing artwork and text are prepared. Dashboard declarations, permission
  justifications, developer account details, and review submission still need to
  be completed by the publisher.
- The Chrome review URL remains deliberately unset until a store item ID exists;
  the extension suppresses the rating link while it is unset. Website install
  links also need the actual Chrome/Edge item IDs before public promotion.
- A public-search check did not establish name exclusivity. Do the final store
  name/branding check before submission; this review does not claim clearance.

Passing automated tests is a release-readiness signal, not a guarantee of store
approval or a substitute for the remaining manual acceptance checks.

**Verdict:** automated release checks pass; the package is ready for the final
manual Chrome acceptance pass and the store submission workflow. No automated
test failures remain open.
