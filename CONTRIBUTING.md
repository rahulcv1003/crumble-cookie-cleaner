# Contributing

Thanks for helping. A few rules keep Crumble safe, because a bug here can log someone out of every site they use.

- **Start with the spec.** `crumble-cookie-cleaner-PRD.md` is the source of truth. New features or settings need an issue first.
- **Tests pass before merging.** Run `npm test`. A change to cleaning behaviour needs a test that would have failed before it.
- **Never trust `chrome.cookies.remove`'s return value.** Removal is verified by re-reading the cookies (see `docs/SPIKES.md`).
- **No network, no `eval`, no `innerHTML`.** Lint enforces these in `src/`.
- **All user-facing text goes in `_locales`.** Edit `scripts/strings.py`, then run `python3 scripts/strings.py src/_locales/en/messages.json`. Use sentence case, plain verbs, and the names Keep, Keep until restart and Clean.
- **UI changes** must follow `docs/DESIGN.md`; include before and after screenshots (`npm run screenshots`).
