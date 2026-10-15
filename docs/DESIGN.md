# Design plan

Written before any CSS, as the PRD's "UI quality bar" requires, then reviewed against the brief. Changes made by the review are at the end.

## The idea

A ledger of what stays and what goes. The product forgets things on purpose, so the UI should read like a careful record: lines, aligned columns, exact numbers, plain sentences. It should feel quiet and a little dry: the voice of a tool that tells you what will happen and then does exactly that.

The one bold element is the **status mark**: a square that is filled, half-filled or empty. It sits next to the current site's name in the popup, and the same mark is the toolbar icon. A full square is a kept site, a half square is kept until restart, and an empty square with a diagonal stroke will be cleaned. The status shows by shape before colour, so it survives greyscale and colour blindness, and the user learns the shape once and recognises it everywhere.

## Colours

Light and dark are designed separately; dark is not an inversion of light.

| Name | Light | Dark | Used for |
|---|---|---|---|
| Paper | `#F3F4F1` (cool off-white, slight green-grey) | `#1B1F22` (blue-charcoal) | Page background |
| Ink | `#1D2126` | `#E3E5E1` | Text, the status mark outline |
| Rule | `#C8CDD0` | `#3A4146` | Hairlines between rows and sections |
| Spruce (Keep) | `#1E6B5C` | `#6CC3AB` | Kept status, Keep list label |
| Ochre (Keep until restart) | `#8A5A00` | `#D9AE4E` | Kept until restart status |
| Graphite (Clean) | `#5B6168` | `#A7ADB3` | Will be cleaned status, muted text |
| Signal (actions and focus) | `#2A4E86` | `#93B3EA` | Links, primary button, focus ring |
| Alert | `#9B2C2C` | `#F09A9A` | Destructive confirmations and errors only |

Contrast (WCAG AA, 4.5:1 for text): every text colour above passes on its own Paper. Graphite on Paper is about 5.9:1 in light and 7.5:1 in dark. Checked with the `contrast()` helper in `tests/unit/design.test.ts`.

"Will be cleaned" is graphite, not red: cleaning is the normal, expected outcome, not an alarm. Red appears only on confirmations that delete things.

## Type

- **System UI font stack** (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`) for everything. Nothing is downloaded.
- **System monospace** (`ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace`) only for rule patterns and cookie names, because they are code.
- **Numbers** use `font-variant-numeric: tabular-nums` so counts line up in columns.
- **Sizes:**
  - 13 px base in the popup and 14 px on the settings page;
  - the site name in the status block is 20 px, semibold;
  - section headings are 15 px semibold, sentence case;
  - no other sizes.

## Screens

### Popup (340 px wide)

One column. The status block is the bold element; everything else is quiet text and plain buttons.

```
Crumble                                  Settings
─────────────────────────────────────────────────
 ■  github.com
    Kept. 14 cookies.
    [Keep until restart]  [Remove from list]  Edit
    [Clean this site now]
─────────────────────────────────────────────────
 Automatic cleaning                        [ on ]
 [Clean now]   [Clean, including open tabs]
─────────────────────────────────────────────────
 Cleaned 14 sites, 212 cookies, 2 minutes ago.
 Undo cleanup   Details
```

Other states:
- **Kept until restart:** a half square.
- **Will be cleaned after you close it:** an empty square with a diagonal stroke.
- **Not a website:** an empty dotted square and no site actions.
- **Setup unfinished:** the automatic cleaning row is replaced by "Setup isn't finished, so nothing is cleaned automatically. Finish setup".
- **Large cleanup:** the last-cleanup line becomes "Cleaning 1,200 of 3,100 cookies" while it runs.

### Settings page (working tool, 1280 px)

A narrow left column of section links, and a wide right column of dense rows separated by hairlines. There are no cards and no shadows. Each setting is one row: label and control on one line, a one-line explanation under the label in graphite.

```
Crumble settings
┌──────────────┬──────────────────────────────────────────────────────┐
│ Lists        │ Lists                                                │
│ Cleaning     │ [search........] [All | Keep | Keep until restart]   │
│ Site data    │ [ pattern, pattern ] [Keep ▾] [Add]                  │
│ Log          │ ─────────────────────────────────────────────────────│
│ Display      │ ☐ ■ *.github.com      Keep   All cookies   Edit Delete│
│ About        │ ☐ ◧ example.com       Keep until restart  sid, lang  │
│              │ ─────────────────────────────────────────────────────│
│              │ [Delete selected (2)]  Import  Export                │
└──────────────┴──────────────────────────────────────────────────────┘
```

### Welcome and setup (one column, 640 px)

Three short lines on what the extension does, then the three numbered steps. These are a real sequence, so the numbers are allowed.

```
Crumble deletes cookies and site data shortly after you close a site's last tab.
Sites you choose to keep stay logged in.
Nothing leaves your browser.

1  Sites to keep you logged in
   ☑ github.com        (open now)
   ☐ mail.example.com  (open now)
   Sites with the most cookies:  ☐ news.test 41   ☐ shop.test 22
   [ add a site            ] [Add]
2  Coming from Cookie AutoDelete?   [Import from Cookie AutoDelete]
3  [Start cleaning automatically]   [I'll clean manually for now]
```

## Icons

There is one drawn set of SVG shapes on a 16 px grid, with a 1.5 px stroke: the status squares (full, half, empty with a stroke, dotted), plus a small search and close mark. There are no icon kits.

The toolbar icon is the same status square, with a greyscale variant when automatic cleaning is off. The product icon is a square slate with one diagonal wipe through it.

## Three principles

1. **Say what will happen before it happens.** The status line always predicts what the next cleanup will do to this site, in a full sentence.
2. **A ledger, not a dashboard.** Rows, hairlines, aligned numbers. Never cards, tiles or charts.
3. **Calm by default.** One bold element (the status mark). Motion is limited to 120 ms colour and opacity changes, and is switched off under `prefers-reduced-motion`.

## Review against the brief

Checked against "Things that must not appear":

- **Background colour.** The first draft used a warm cream (`#F5F0E6`). That is the "warm cream" the brief warns against, so it became a cool off-white (`#F3F4F1`).
- **The Clean colour.** The first draft used a vermilion. That reads as an alarm and is one of the named defaults, so "Clean" became graphite, and red is kept for destructive confirmations only.
- **Rule tables.** The first sketch put each rule in its own rounded card. That is the "identical rounded cards" default, so it became table rows with hairlines.
- **Settings section titles.** The first sketch had small caps titles ("LISTS"), which are tracked caps eyebrows. They became sentence-case headings.
- **"Next" button.** The draft had an arrow in "Next →". The arrow was removed, and the button text now says what happens.
- **Status line.** "Kept · 14 cookies" used a middle dot; it is now two short sentences: "Kept. 14 cookies."
- **Monospace.** It is used only for patterns and cookie names, never for labels.
- **Fine as drafted:** no gradients, glows, blur, emoji, mascot, filler words, or headline word picked out in another colour.

## Self-review of the built screens (15 October 2026)

Screenshots are in `docs/screenshots/` (`npm run screenshots`). They cover the popup in every state, the settings sections at 1280 px and the welcome flow, each in light and dark. Each was checked against "Things that must not appear":

- **Fixed after the first round of screenshots:**
  - The "Not a website" popup repeated its own heading in the status line; the line now just explains why.
  - The last-cleanup line read "…, now." and now reads "…, just now."
  - Setup step one said "Keep 0 sites" and "0 sites added to Keep"; with nothing ticked it now says "Continue without keeping sites" and "No sites added…".
  - The popup had no top-level heading (an axe-core finding); the small product name is now the page's `h1`, with no visual change.
  - The rule editor's site-data choices had the same accessible names as the Site data switches; they are now "LocalStorage for this rule" and so on.
  - The settings page rebuilt itself on every background cleanup; now only the Log section refreshes.
- **Checked and clear:**
  - no warm cream, serif headline, terracotta, near-black with an acid accent, or gradients;
  - no cards or shadows: the settings page is rows and hairlines, and the popup is three ruled sections;
  - no all-caps eyebrows, spaced em-dash labels, middle-dot joins, trailing arrows or emoji;
  - monospace appears only for rule patterns, site names in setup, cookie names and code placeholders;
  - every icon is drawn for this product (the status squares and the slate).
- **Is it recognisably its own?** The status square appears in the popup, the toolbar, the rule table and the welcome heading, and it carries the identity. Everything else stays quiet. Next to other privacy extensions, which tend toward shields, padlocks and cards, it reads as a calm, exact record.
