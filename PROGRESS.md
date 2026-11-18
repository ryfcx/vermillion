# Vermillion — Progress

Status key: ⬜ todo · 🟦 in progress · ✅ done · 🟥 blocked
Each agent updates only its own section. Add short notes (date, what changed, anything others need to know).

## Milestones
- ⬜ M1: All modules exist and match the contract
- ⬜ M2: Daily mode playable end-to-end in the browser
- ⬜ M3: Endless + Duel + Stats + Share working
- ⬜ M4: Content ≥ 120 prompts, polish, mobile check, tests pass

## Orchestrator
- ✅ Team rules, contract, progress/chat files, serve script
- ⬜ Integration review after M1
- ⬜ Playtest + bug triage

## Sonnet — UI & game loop
- ✅ S1 `index.html` + `styles.css` (abyss theme, depth gauge, timer ring, responsive, Easy Read)
- ✅ S2 `src/game.js` pure state machine (timer, submit/retry, timeout = 0, totals/depth)
- ✅ S3 `src/ui.js` screens: Home, Play, Result flash, Summary, Duel compare, Stats, How to play
- ✅ S4 `src/main.js` wiring + `?duel=` handling
- Notes: 2026-11-17 S1–S4 written. game.js unit-checked in node (timer, retry, timeout, totals). ui.js/main.js pass syntax checks and import names match the real modules, but NOT yet run in a browser (Chrome extension unavailable). Needs a playtest.
  - 2026-11-17 review #1 fixes: `h()` now `flat(Infinity)`; `countUp` has a setTimeout fallback and skips animation when hidden; invalid/undecodable duel links and `scoreDuel` throws now show a friendly "duel link is broken" screen.

## Sol — Content & matching
- ✅ L1 `src/content.js`
- ✅ L2 `src/matcher.js` (normalize, aliases, safe typo tolerance)
- ✅ L3 `data/prompts.json` first 30 prompts (so the game is playable early)
- ✅ L4 grow to ≥ 120 prompts, ≥ 10 per category, points well spread
- Notes: 2026-11-17 14:27: L1–L4 complete. Shipped 30 prompts first, then 120 total (12/category), 3,006 answers and 770 distinct aliases. Each prompt has ≥12 answers and scores span 5–95. All 3,776 names/aliases round-trip uniquely; schema, finite-set sizes, loader failures, typo thresholds/transpositions and ambiguity checks pass. Shared tests executed under a Node DOM/fetch harness: 5/6 pass; storage failure logged for Luna. No browser UI validation claimed. Scores are editorial rarity estimates. No commit.
- Review #1 (2026-11-17 16:07): Checked point spreads across all 120 prompts. Every prompt has at least 5 answers scoring ≥60 (requirement: 3); no data changes needed. Spot-checked examples across all 10 categories. Holding the v1 contract; awaiting playtest bugs.

## Luna — Modes, persistence, sharing, tests
- ✅ U1 `src/rng.js`
- ✅ U2 `src/modes.js`
- ✅ U3 `src/storage.js`
- ✅ U4 `src/share.js`
- ✅ U5 `tests/index.html` browser checks and prompt-bank validator
- Notes (2026-11-17 14:48): Integration review fixes applied: `saveRun()` now returns false on failed writes and stores only the newest 50 run records; storage browser check covers the cap and blocked-storage behavior. U1–U5 complete.

---
# v2: Pixel Edition (started 2026-11-17). See docs/CONTRACT.md v2.

## v2 Milestones
- ⬜ V1: Fonts, palette, sprites, and sfx exist; the shell and router render every page in the new pixel style
- ⬜ V2: All modes playable (Daily, Endless, Duel, 14 packs × daily/archive/practice) with themed progress displays
- ⬜ V3: Content ≥ 450 prompts, every pack ≥ 40, hints/facts filled; guides ≥ 16, FAQ ≥ 12
- ⬜ V4: Polish: feedback detail, results, stats/history, share, sound, mobile, Easy Read, tests green

## Sonnet (v2)
- ✅ S5 Pixel restyle of `styles.css` with the §1 palette, fonts, Display themes (neon/midnight/crt) and Easy Read
- ✅ S6 `src/router.js` + the shared shell (top bar, Play menu, toolbar) on every route
- ✅ S7 Home, Packs, Archive, Stats, History, How to play, Guides list/detail, FAQ, About pages
- ✅ S8 Unified play screen + detailed feedback + hint button + results + duel compare
- ✅ S9 `src/displays.js`: all 14 themed progress displays + depth trench + split trench, drawn with sprites
- Notes (2026-11-18): S5–S9 done and verified in headless Chrome (desktop 1280, mobile 390; no console errors, no horizontal scroll).
  - S5 `styles.css`: §1 palette tokens, Press Start 2P / VT323 via `assets/fonts/fonts.css`, hard shadows, 0 radius, stepped animation; Display themes neon/midnight/crt; Easy Read (big VT323, no scanlines/motion).
  - S6 `src/router.js` + shell: hash routes per contract, top bar with Play menu (all modes + 14 packs), toolbar on game screens (Menu/Display/Easy Read/Sound), footer settings on every page.
  - S7 pages: Home (hero+Vermi, Daily card, modes, 14-pack grid, strategy teaser, FAQ preview), Packs, Archive (daily + per pack, played ticks), Stats (tier bars, per-pack bests), History (filter, click to reopen), How to play, Guides list/detail (markdown-lite), FAQ, About, 404.
  - S8 play screen: one layout for all modes, 7 pips, pixel timer bar with low/crit states, hint button (free, recorded as `usedHint`), retry on unknown answers, detailed feedback (tier badge + sfx, points count-up with unit conversion, rarity meter, note/fact, 3 deeper cuts, most common), results (units, tier squares, PB banner, per-prompt table with rarest possible, share, play again/practice, challenge a friend, next-pack suggestion), duel invite + compare with collision highlights.
  - S9 `src/displays.js`: depth trench, split trench (rival diver), and all 14 pack displays, using Luna's sprites where they exist (diver/car/runner/plane/rocket) and hand-drawn pixel art otherwise; `createDisplay(kind, host)` -> `{update, celebrate, destroy}` plus `setRival`.
  - Official runs: Daily and pack days (today or any archive day) are saved `official: true` on first play; replays/practice are `practice: true`. `game.js` v2 adds tiers (mythic 81+), `usedHint`, `timedOut`, `useHint()`, `rejected`.

## Sol (v2)
- ✅ L5 `data/packs.json` (14 packs) + `loadPacks`/`promptsForPack`
- ✅ L6 Migrate the 120 prompts to v2 (packs, hint, fact, notes)
- ✅ L7 New categories (games, space, arts, myth, tech, animals, literature, tv), with every pack ≥ 40 prompts
- ✅ L8 Reach ≥ 450 prompts total, including ≥ 40 Language word-puzzle prompts with closed answer lists
- Notes: 2026-11-17 22:18: L5–L8 complete. 450 unique prompts across all 18 categories; all 120 v1 IDs retained. Every prompt has packs/hint/fact, ≥12 answers and ≥5 answers ≥60 points. 10,862 answers, 2,035 aliases, 1,369 answer notes. All 12,897 labels round-trip uniquely. All 14 packs have ≥40 prompts; Wordsmith has 40 finite-vocabulary puzzles with complete answer sets. Pack display IDs/icons/conversion ratios match Sonnet/Luna exports. Nine nonvisual shared checks pass under Node; dedicated loader/matcher/schema/finite-set/integration checks pass. Actual HTTP/browser check blocked by sandbox EPERM; canvas not exercised. No commit.
- Pack counts: movies 43, sports 40, geography 42, language 40, science 89, history 61, music 42, nature 40, food 41, games 40, space 41, arts 95, myth 45, tech 40.
- Restart handoff (2026-11-18 12:50): STOPPED at Orchestrator request. No edit was in flight; no files are half-written. L5–L8 remain complete as recorded above. The 2026-11-18 13:55 queued autocorrect/word-detection work (v2.1 matcher changes and ≥200-case typo corpus) has NOT been started. Resume only after Orchestrator instruction following restart; first re-read TEAM.md, docs/CONTRACT.md and the latest CHAT_LOG.md. No commit.

## Luna (v2)
- ✅ U6 Self-host fonts in `assets/fonts/` (Press Start 2P, VT323 + OFL license files)
- ✅ U7 `src/sprites.js`: logo, Vermi mascot (animated), vehicles, pack + UI icons, tier badges
- ✅ U8 `src/sfx.js`: chiptune WebAudio effects + optional music bed
- ✅ U9 `tools/make-assets.mjs` → `assets/favicon.png`, `assets/og.png`
- ✅ U10 modes/storage/share v2 (packs, archive, practice/official, history, rich stats, tier squares)
- ✅ U11 `data/guides.json` (17 original guides) + `data/faq.json` (16)
- ✅ U12 tests updated for v2 + a validator for pack minimums
- Notes (2026-11-17): U6–U12 complete. Both local TTFs are referenced by `assets/fonts/fonts.css` and include OFL notices. The complete browser test module passes 11/11 checks in a Node DOM/fetch/canvas shim; syntax and contract smoke checks pass, and the PNG generator creates valid 32×32 and 1200×630 images. A real browser visual playtest was not available in this session.
- 2026-11-18 streak fix: archived official Daily runs save their result/history but advance `lastDailyKey` only when the key is later than the current cursor. Added regression coverage for past archive replay followed by the next consecutive Daily; full suite remains 11/11.
- 2026-11-18 home title scene request: added moon, three-frame twinkle star, two wide cloud bands, blinking two-frame buoy, tileable three-frame 32×8 wave, fish silhouettes, and 16×16 gear/palette icons. Reused menu, sound, and bubble sprites; added three-frame `mascot-idle` bobbing animation. Full test module passes 11/11; archive streak regression remains covered.

### Sonnet — Home redesign (11:20 request) ✅
- ✅ `src/scene.js` (new, my lane): `startScene(host, {getWaterY})` / `stopScene()`. One low-res canvas (4 px per logical pixel, 3 on phones) with a banded dusk sky, twinkling stars (stepped), moon with glow and water reflection, 4 drifting cloud layers, Vermi bobbing at the waterline next to a blinking-light buoy, a 3-frame wave edge, rising bubbles, dim fish silhouettes and a depth ruler (0 m at the waterline). Uses Luna's `moon`, `cloud-a/b`, `buoy`, `wave`, `mascot`, `fish-a/b` sprites, with procedural fallbacks. Pauses when the tab is hidden, draws one still frame with Reduce motion, and re-lays-out on resize, theme or class changes (neon, midnight and crt palettes).
- ✅ Home (`ui.js showHome`): the `logo` wordmark at the largest integer scale (with a pink + cyan offset shadow), the letter-spaced tagline, the info line, the inline 4-step HOW TO PLAY, FAQ, the featured-pack card (one pack per UTC day: `days since LAUNCH_DAY % 14`, no fake numbers), the START TODAY'S DESCENT button (becomes VIEW TODAY'S RESULT plus your depth once played), and a footer row with DESCENT #N, ARCHIVE, THEMED PACKS, ENDLESS and DUEL. A CRT scanline overlay is off in Easy Read and Reduce motion. The old cards (modes, packs, guides, FAQ) sit under the scene as "deeper" content.
- ✅ Shared chrome on every page: a ☰ button opens a slide-in drawer with every route (Daily, Endless, Duel, 14 packs, All packs, Archive, Stats, History, Guides, How to play, FAQ, About). The right-hand icon stack is Sound, Settings (Easy Read, Reduce motion, Sound, Volume, theme buttons) and Display theme. On home both float over the scene (stack vertical); on other pages they sit in the top bar. The old Play dropdown, footer settings and per-page toolbar buttons are removed.
- Verified at 1280×800 and 390×844: no horizontal scroll, all buttons ≥ 44 px, focus outline visible, Esc closes the drawer and settings, no console errors. Play, Packs, Archive, FAQ and Stats still render. Not tested: sound audio, real touch devices.
- ✅ Home review fixes (12:15, items 1–3): glyphs now use `glyph-archive/endless/duel/down` sprites when they exist and fall back to the text characters until Luna's land (each button keeps an aria-label); Vermi is a crisp DOM sprite at scale 6 desktop / 4 phones with a slow stepped bob and a 3-ring splash ripple drawn in the scene; DESCENT #N shares the footer row with the buttons on desktop (≥761 px). Settings icon now uses `gear`. Verified at 1280 and 390, no errors.
- 2026-11-18 home review polish: redesigned Vermi as a domed jellyfish with bright rim, glow, cute eyes, and five swaying tentacles (four general frames; first two idle for the home UI). Replaced settings/theme/sound/menu sprites with clear 16×16 icons, added four 8×8 route glyphs, and enlarged the blinking buoy to 24×24. Full suite passes 11/11.
- 2026-11-18 play-screen sprites: added translucent `ray`, two-frame `particle-glow`, five tier-indexed `vermi-pulse` frames (none/common/uncommon/rare/mythic), four-frame `sparkle`, and 16×16 `hint`; updated catalog tests. Full suite passes 11/11.

### Sonnet — Play screen redesign (12:30 request) ✅
- ✅ `scene.js` play mode (`startScene(host, {mode:'play'})` returns `{setDepth, pulse, setRival, relayout}`): waterline at 28% of the viewport; stars, moon and clouds ride up with it. Camera depth uses 0.24 logical px per metre, easing 800 ms in 8 steps. Water goes indigo to void with depth, with faint light rays near the surface, fish, bubbles, a right-edge ruler (0m, -100, -200…) and glowing particles below ~1,200 m. Vermi sits at the lower left, bobbing. On each answer it gets a tier-tinted pulse ring and drifts lower, and mythic answers add a sparkle burst. The buoy stays on the waterline. Duel shows a cyan rival jelly at its own depth.
- ✅ `ui.js` (same API for `main.js`: `beginPlay` / `showPrompt` / `updateTimer` / `showHint` / `showReject` / `showResult` / `showRun`): a notched HUD (DEPTH panel with a count-up and an optional RIVAL line, 7 tier-coloured pips with "PROMPT N OF 7", SCORE panel). Pack modes show the pack's unit in the depth panel plus its themed mini display. Prompt card with the "▼ the rarer…" footer and a free HINT button. A bottom dock with a draining ring timer (pink pulse and tick sfx under 5 s), a wide input, "SINK ▼" and a thin timer bar. An unknown answer shakes the input and shows "Not in our bank, so try another!". Feedback replaces the card in place, with a NEXT ▼ button, and Enter advances. Results stay in the same scene at the final depth, in the same card component.
- Chrome in play mode: ☰ plus a Sound-only stack; Settings and Display moved into the drawer ("Settings & display…").
- Verified (1280×800 and 376×800, full runs): Endless, Daily, pack practice (games, geography, music) and Duel create → accept → compare. No console errors, no horizontal scroll. Keyboard-only: type → Enter → Enter → next prompt works with focus following.
- Luna's new `hint` icon is used. `ray`, `particle-glow`, `vermi-pulse` and `sparkle` aren't wired in yet, since the scene draws procedural versions. I'll swap them in once they exist and I've checked their sizes. Not tested: audio, real touch devices.
- 2026-11-18 play-screen review: flipped `glyph-down` so it widens at the top and tapers to a lower point; added a regression assertion for its direction. Full suite passes 11/11.
- ✅ Play review fixes (13:40): prompt text now uses the full card width (`text-wrap: balance` removed), with smaller fonts above 90 and 140 characters. The ruler's "0m" sits just below the waterline. Feedback now reads "Rarer than N of the M answers in our bank" (`game.js` reveal gained `rarerThan`). Deeper cuts show the 3 rarest answers rarer than yours. The down arrow is fixed (see below). Re-ran Endless at 1280 and 376 with no errors.

### Sonnet — Stopped for restart (nothing in progress)
- No edit was in progress and no file is half-written. `ui.js`, `main.js`, `scene.js`, `game.js`, `displays.js` and `router.js` all pass `node --check`.
- Last finished work: the 13:40 play-screen review fixes (items 1–4 and the down-arrow flip), which are verified and posted in CHAT_LOG.md.
- The 13:55 queued items are not started. Next step after restart: read the 13:55 entry in CHAT_LOG.md and begin there. Still open from earlier: wire in Luna's `ray`, `particle-glow`, `vermi-pulse` and `sparkle` sprites (now present) in place of the procedural versions in `scene.js` play mode.
