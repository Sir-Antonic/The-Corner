# The Move Hub — Roster Select (v2 arcade concept)

A separate design direction from the trading-card version — styled after an N64-era character-select screen instead of a collectible card. Same underlying data and features (search, sort, categories, favorites, download-driven ranks, shareable links), completely different visual language: sharp-edged tiles, scanlines, CRT vignette, and a red/cyan/gold HUD palette instead of holographic foil.

No build step — plain HTML/CSS/JS, ready for GitHub Pages, same as v1.

## Structure
Identical layout to v1: `moves.json` for data, `assets/clips/` for preview videos, `assets/downloads/` for the zips, `assets/photos/` for the small portrait thumbnail on each tile.

## Ranks instead of rarity
Same download-driven concept as v1's rarity tiers, renamed to fit the arcade theme — ROOKIE → PRO → CHAMPION → LEGEND. Thresholds live at the top of `script.js`:
```js
const RANK_THRESHOLDS = { legend: 150, champion: 50, pro: 15 };
```

## Download counting
Same as v1 — uses [CounterAPI](https://counterapi.dev) for free, backend-less counters. Set `COUNTER_NAMESPACE` in `script.js`. Falls back to `localStorage` until configured.

## What's different from v1
- No 3D tilt, holographic foil, or sparkle — replaced with hard drop-shadows, a hover glow, and a brief chromatic-aberration flicker on the video screen, closer to what an actual game UI does on selection.
- Tiles are landscape (roster-style) instead of portrait trading cards.
- Typography: Russo One (headers), Rajdhani (body), JetBrains Mono (data).

## Hosting on GitHub Pages
Same as v1 — push to a repo, enable Pages from the root, done.

## Demo data
`moves.json` ships with the same six placeholder moves as v1, download counts seeded via the demo preview so you can see all four rank tiers.
