# Crumble design system — 0.2.0

The product owner requested a more premium interface on 27 October 2026,
taking inspiration from the care and restraint of Apple and other technology
products. This replaces the original ledger-only visual direction. Cleanup
behaviour, permission scope, and the Cookie AutoDelete acknowledgement remain intact.

## Direction

A considered privacy utility: confident typography, quiet surfaces, deliberate
spacing, and controls that explain their consequences. The inspiration is a
quality bar, not a reproduction of Apple's branding or proprietary assets.

- Soft grey canvas, raised white surfaces, fine borders, and restrained shadows.
- Independently tuned charcoal surfaces in dark mode.
- One blue action colour, with green for Keep and amber for Keep until restart.
- Original square status marks carry the product identity across popup, toolbar,
  settings, and setup.
- Sentence-case labels and explicit action names; destructive actions retain
  confirmation and visible warnings.
- No external font requests, decorative tracking, remote code, or new permissions.

## Typography

Inter 4.1 is bundled locally as `assets/fonts/InterVariable.woff2`.
Its variable weight and optical-size axes support both compact controls and
larger headings. The font uses the SIL Open Font License 1.1; the full notice
ships in `fonts/OFL.txt` and is referenced by `LICENSE-THIRD-PARTY.md`.

The fallback stack is the device's native interface font, including Apple's
system font and Segoe UI. No Apple font files are redistributed.

- Popup: 13px body, 16px wordmark, 23px site name.
- Settings: 14px base, 31px introductory heading, 20px section headings,
  13px labels, 12px explanatory text.
- Rule tables: compact 11px entries, with monospace used only for patterns
  and cookie names.
- Setup: 35px title, 18px step headings, 14px introduction.
- Numeric counts use tabular figures. Screenshots wait for local fonts to load.

## Colours and surfaces

| Token | Light | Dark |
|---|---|---|
| Canvas | #f5f5f7 | #111216 |
| Surface | #ffffff | #1d1e23 |
| Text | #1d1d1f | #f5f5f7 |
| Secondary text | #62626b | #b0b0bc |
| Action | #005bc4 | #9ac1ff |
| Keep | #176447 | #82d6af |
| Keep until restart | #805300 | #edc477 |
| Destructive | #b42329 | #ffabae |

Text colours are checked at WCAG AA contrast on both canvas and raised surfaces.
Axe audits cover popup, settings, and setup in both themes. Form states have
visible focus rings, native semantics, and descriptive labels.

Sections use an 18px radius; the popup uses 16px; controls use 9–10px.
Depth is shallow and used to separate functional groups.

## Popup

The 380px popup has a compact brand header, a current-site surface, and a
separate cleaning surface. A clear primary Clean now button is followed by the
more consequential action for including open tabs. Site-specific cleanup is
visually quieter but retains a consequence tooltip.

Cookie counts, current status, setup warnings, cleanup progress, and Undo remain
visible in their existing workflow. Status shapes work without colour.

## Settings

A sticky sidebar groups Lists, Cleaning, Site data, Log, Display, and About.
Original line icons and an active navigation state aid orientation. Each section
is a single functional surface rather than a separate card for every setting.

Rule tables can scroll horizontally within their container; the overall page
fits narrow windows down to 380px. Sidebar navigation wraps into compact links
on smaller windows. A clipped, off-screen file input must not create page-wide
horizontal overflow.

Settings save immediately, as before. Rule editor changes are saved only when
the user chooses Save. Focus is restored after a settings rerender.

## Setup

Three numbered surfaces show the current step and completed steps. The first
screen explains that automatic cleanup stays off until setup is finished.
Consequences of selecting sites, importing rules, and choosing automatic or
manual mode are available before committing to a choice.

## Contextual help

Implementation: `src/ui/tooltip.ts`.

- A visible question-mark button accompanies setting labels and key choices.
- Action buttons and rule controls also expose help on hover or keyboard focus.
- Tooltips appear after a short pointer pause, immediately on focus, or by
  activating a help button with a keyboard or touch.
- Escape dismisses help. Moving from an anchor onto the help text keeps it open.
  Scroll, resize, outside interaction, and removal of the anchor dismiss it.
- The help bubble has `role="tooltip"` and is associated with its anchor through
  `aria-describedby`. Existing descriptions remain in place.
- Fixed positioning clamps the bubble to the viewport, including the popup.
- One shared bubble and delegated listeners avoid a listener per settings rerender.
- Help never saves a setting, creates a rule, or starts a cleanup.
- Essential warnings stay visible in explanations and confirmations; tooltips
  are supplementary, not the only place irreversible effects are explained.

The copy describes signed-in state, Keep priority, startup/open-tab effects,
discarded tabs, embedded cookies, global HTTP-cache effects, import/export data,
and the distinction between cookie Undo and irreversible site-data removal.

## Motion and accessibility

Control transitions are short (160ms) and respect `prefers-reduced-motion`.
Accessibility snapshots disable motion so audits measure a settled theme rather
than a colour mid-transition. No animation is required to understand a state.

Mouse, keyboard, tooltip hover persistence, Escape dismissal, viewport fitting,
and the absence of setting changes from help are tested in
`tests/e2e/ui-help.spec.ts`.

## Visual review and assets

`npm run screenshots` captures all popup states, each settings section, the
full settings overview, setup steps, and contextual-help examples in both themes.
It works in Windows and Linux through `scripts/capture.mjs`.

`npm run store-assets` renders the four store images and promotional artwork
using the bundled font. The website popup preview is regenerated from the real
popup screenshot with `scripts/site_assets.py --popup-only`.

The October 2026 redesign was visually inspected for hierarchy, spacing, readable
help, contrast, native control behaviour, and narrow-window overflow. Final
verification results are recorded in `docs/TEST-RESULTS.md`.
