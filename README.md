# The League — Web App

A mobile-first PWA for your league ("Nocturne" design). Works as a normal
website and installs to an iPhone home screen like a real app (Share >
Add to Home Screen).

## What's in here

- `index.html`, `styles.css`, `app.js` — the actual site
- `manifest.json`, `sw.js`, `icons/` — makes it installable/offline-ready as a PWA
- `assets/mark.png` — the header logo mark
- `data.json` — real data pulled from your spreadsheet at hand-off time.
  This gets overwritten automatically once your Apps Script starts
  publishing (see below).
- `publish_to_github.gs` — paste this into the SAME Apps Script project as
  your existing `sleeper_sync.gs`. It reads your sheet directly and commits
  a fresh `data.json` to this repo — no Sheety involved, no request limits
  to worry about.

## Deploy the site (GitHub Pages)

1. Create a **public** GitHub repo (public keeps GitHub Actions/Pages
   completely free — nothing sensitive lives in this repo, since all your
   real data stays in the Google Sheet).
2. Upload every file in this folder to the repo, keeping the folder
   structure (`icons/` stays a subfolder).
3. Repo Settings > Pages > set Source to your default branch, root folder.
4. Wait a minute or two, then visit the `.github.io` link GitHub gives you
   — that's the real live site, not the repo page itself.

## Connect it to your live sheet

1. Go to **github.com/settings/tokens** > Generate new token (classic),
   scope: `public_repo`. Copy it.
2. In your Google Sheet's Apps Script editor (Extensions > Apps Script —
   same project as `sleeper_sync.gs`): paste in `publish_to_github.gs`.
3. Project Settings (gear icon) > Script Properties > add
   `GITHUB_TOKEN` = the token from step 1.
4. At the top of `publish_to_github.gs`, fill in `GITHUB_OWNER` and
   `GITHUB_REPO` with your actual GitHub username and repo name.
5. Run `publishToGithub` once manually to test — check your repo for a
   fresh commit updating `data.json`.
6. Either run `installPublishTrigger()` once to schedule it hourly on its
   own, OR (simpler) just add a line calling `publishToGithub();` at the
   end of your existing `syncPprData()` function so one trigger does both.

A **The League > Publish Now** menu also appears in your spreadsheet for
publishing on demand right after you enter scores.

## What changed in this redesign

- New "Nocturne" visual design (dark mono-purple, gold reserved for 1st
  place only) — see the Claude Design handoff doc for the full spec.
- Scoring screen now has 4 pillars (FanDuel, Sleeper, Pick'em, Playoff
  Pool) with 8 real scored categories total, each computed live in the
  browser using the same tie-aware 4/3/2/1 ranking your spreadsheet uses
  — tested against your actual spreadsheet's tie-split math to confirm
  they match exactly.
- Playoffs screen now reflects the real 27-pick bracket structure (14
  "Make the Playoffs" + 6 Wild Card + 4 Divisional + 2 Conference
  Championship + 1 Super Bowl), grouped for display but scored using
  your spreadsheet's real per-pick weights (2.0 / 1.0 / 1.25 / 1.5 /
  1.75 / 2.0) — not a flattened guess.
- MVP is its own card, shown separately, and intentionally excluded from
  the playoff bracket point total (matches your "MVP Bonus" decision).
- Bios now surface a "Lifetime" cumulative score stat.
- One flagged judgment call: the app title uses Space Grotesk while
  everything else uses Inter, per an edit in the design file that
  wasn't explicitly confirmed as intentional system-wide — flag it if
  you'd rather have the title match the body font.

## Notes

- The refresh button on the site just re-fetches `data.json` — it never
  calls Sheety, so there's no realistic way to hit any request limit here.
- If you add a new playoff pick column later, add a matching entry to
  `PLAYOFF_KEY_MAP` near the top of `publish_to_github.gs` so it gets
  picked up correctly.
