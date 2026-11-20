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
- ✅ L9 v2.1 autocorrect + ≥200-case corpus (2026-11-18 13:06): completed conservative match/suggest confidence levels and ambiguity guards.
- v2.1 validation (2026-11-18 13:14): 398/398 corpus cases pass, including 240 fixed typo inputs, semantic variants, numeric conversions, sound-alike suggestions, ambiguity traps and negative cases. All 12,897 production labels retain exact/alias match behavior. Matcher API posted for Sonnet; Luna has integrated the corpus runner. No commit.
- ✅ L10 v2.2 everyday Daily content + plain pack names: 191 everyday questions with ≥15 answers each, including 60 new questions; plain topic names and blurbs shipped.
- Final v2.1/v2.2 checks (2026-11-18 13:25): matcher corpus 399/399 (240 fixed typos); 510 total questions, 191 everyday, 60 new `day-*` IDs, 12,383 answers and 14,573 exact/alias round trips. Everyday questions span 13 categories, have ≥15 answers and ≤80 characters, hints/facts, and broad 5–95 score spreads. All 14 pack names are plain, IDs/icons/display metadata preserved; every pack still ≥40. Content loader validates the boolean and everyday answer minimum. Shared nonvisual Node harness 12/12; current Daily selector sampled successfully using everyday-only data. Canvas/browser not exercised by this harness. No commit.
- ✅ L11 point plausibility audit (2026-11-18 13:41): reviewing all 510 questions; replacing index-based score spreads with editorial familiarity bands and compressing familiar closed sets.
- Point audit complete (2026-11-18 14:58): reviewed all 510 questions; changed 11,776 of 12,383 answer scores across all 510. Scores now use named, context-specific familiarity judgments instead of list-position interpolation. Calendar words max 25 (Saturday/Sunday 10), colours/planets max 40; 279 questions max ≤40. All questions meet ≥3 distinct values, min ≤15, max ≥25; 201 questions retain a ≥70 specialist answer. Top-tier answers reduced from 2,178 to 25. Only points changed in the bank. All 14,573 label/point round trips, 399/399 matcher corpus and 12/12 shared nonvisual checks pass (canvas excluded). No commit or push.

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
- ✅ v2.1 Luna items: share summaries append `✨ One in a Vermillion` for mythic answers; `storage.js` exposes matching stats labels while saved tier IDs remain `mythic`. Browser checks assert share, stats and `TIER_INFO` labels, corrected/suggest result shapes and Sol's corpus runner. Latest corpus passes **399/399**, including 240 typo cases. Source syntax and direct label/status checks pass.
- ✅ v2.2 everyday Daily + plain guide/FAQ wording: both Daily selectors use only `everyday: true` questions when at least seven qualify, then fall back to the full pool. Tests cover filtering/fallbacks and all 14 topic pools. Validator requires boolean flags, ≥150 everyday questions and ≥15 answers each; every question must have ≥3 distinct point values with min ≤15 and max ≥25, and ≥150 questions across the bank must include a 70+ answer. Sol's bank has 510 total / 191 everyday questions and meets these checks. Reworded 17 guides and 16 FAQ entries. Full browser-check script passes **13/13** in the Node DOM/file-fetch shim.
- ✅ Dive animation assets: `src/sprites.js` now has 3-frame streamlined `vermi-dive`, `vermi-squash`, 3-frame `vermi-land`, vertical `speedline`, 4-frame tintable `shockwave` (`drawTintedSprite`), and horizontally tileable `gate-dash`. `src/sfx.js` adds descending `dive`, indexed rising `gate`, all `land-<tier>` effects, and `bloop`. Added browser catalog/audio API checks; pixel maps, dimensions, tiling, module syntax and a WebAudio-stub check of the descending dive sweep / rising gate pitches pass. Assets are ready for Sonnet to wire into the Dive sequence.
- ✅ Mascot redraw (2026-11-18 22:11): replaced the jellyfish sprite generator with Vermi the right-facing vermilion fish. Preserved the 16×16 `mascot` four-frame order and 16×16 three-frame `mascot-idle`, added two-frame 16×16 `mascot-dive`, and redrew the related dive/squash/landing forms as fish. Updated the FAQ and regenerated the favicon/social preview from the fish sprite. Sprite dimensions, palette keys, FAQ wording and module syntax checks pass. `mascot-dive` is ready for Sonnet; `docs/CONTRACT.md` still describes the retired jellyfish and needs the Orchestrator's contract update.

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

### Sonnet — v2.1 amendment (13:55 queue, GO) ✅
- ✅ "ONE IN A VERMILLION": `TIER_INFO.mythic.label` (internal id still `mythic`) plus a `short` form "1 in a Vermillion" for tight spots. The feedback badge, the stats tile and the tier bars use it.
- ✅ `game.js` handles the new matcher statuses. `corrected: true` matches are accepted and recorded on `RunAnswer.corrected` (kept in `last` and in the run). `suggest` stores a pending suggestion, exposed as `getState().suggestion`, with no attempt counted and the timer still running. New `acceptSuggestion()` scores it as a corrected match and `dismissSuggestion()` drops it.
- ✅ UI: the feedback card shows "Autocorrected from “…”" under the matched name, and the results table does too. The dock gets a "Did you mean X? [YES ↵] [NO]" row. Enter, or typing nothing new, accepts it. Typing again or NO dismisses it, and the timer keeps running.
- Verified at 1280 and 376 by patching the matcher in the browser to return `suggest` and `corrected` (Sol's real matcher doesn't return them yet): YES via button and Enter, NO, and an auto-corrected match all work. No console errors, no horizontal scroll. Plain `game.js` node checks pass. Not tested against Sol's real matcher once it ships.

### Sonnet — Menu search + bare home (user request) ✅
- ✅ ☰ drawer search: pixel input at the top, focused on open. "/" opens the drawer from anywhere (ignored while typing in a field), Esc closes it, ↑/↓ moves the highlight and Enter opens it. It filters live across Modes, Packs (name, blurb, pack id and display title), Pages, Guides (title, summary) and FAQ questions. Results are grouped with headings and the matched text is highlighted. Matching is case- and accent-insensitive via `normalize` from `matcher.js`, plus typo tolerance (an edit-distance check that counts swapped neighbours as one typo, 1 typo for words of 4 or more letters, 2 for 7 or more). Title and prefix matches rank first. An empty result shows "Nothing down here…". The query clears when the drawer closes. `ui.setContent({guides, faq})` feeds the index.
- ✅ Home is only the title scene: the Modes, Themed packs, guides and FAQ sections and the stats line are gone, and the site footer is hidden on home. At 1280×800, 376×800 and 376×844 the page does not scroll (scrollHeight equals the viewport); the phone layout was tightened to fit. Modes and packs are reachable through ☰ and the footer buttons only.
- Verified: "geograpy" finds Atlas plus the geography guide, "flim" finds Silver Screen, "streak" finds My stats, "arch" ranks Archive first, and an unknown word shows the empty state. Enter navigates and closes the drawer. No console errors, no horizontal scroll.

### Sonnet — Plain wording (CONTRACT §7, v2.2) ✅
- ✅ Applied the §7 table across every screen (`ui.js`, `main.js`, `index.html` meta): Daily Game, Endless, "THE DAILY RARE-ANSWER GAME", PLAY TODAY'S GAME / SEE TODAY'S SCORE, GAME #N, SUBMIT (no arrow), Rarer answers, Topics, Past games, and the info line "7 questions · 20 seconds each · rarer answers score more". The play screen reads "QUESTION N OF 7", and a timeout says "Time's up." with plain sentences.
- Also plainer: "run" is now "game" in user text (stats, history, results), "prompts" are "questions" in every message and the How to play, About and Duel copy, and the home info line and drawer groups use Topics. The depth zone names are plain ("shallow water", "deep water"…). The search index keeps the old words (archive, packs, descent) as hidden synonyms so old habits still find things.
- Code identifiers, route names, CSS classes and `RunAnswer` fields are unchanged.
- Verified at 1280 and 376: a full Daily run, Past games, Topics and home render the new wording with no console errors and no horizontal scroll. The home tagline was narrowed on phones so it clears the icon stack.
- Waiting on Sol: pack names in `packs.json` still show the old themed names (Wordsmith, Lab…) until Sol renames them. The UI reads whatever `packs.json` says, so nothing more is needed here.

### Sonnet — Dive animation (user request) ✅
- ✅ `scene.js`: `ctl.dive({fromM,toM,points,tier,onProgress,onLand,onDone})`, `skip()`, `sad()`, and `setRival(m,{ms})`. Timeline: 150 ms wind-up (Vermi squashes), then a plunge of 700 ms + 18 ms per point (easeOutCubic in steps, about 30 fps while diving) with the camera following and Vermi held at 55% height, then a 400 ms landing. Speed lines, a bubble trail, passing fish and particles. The ruler scrolls and the water darkens with absolute depth.
- ✅ Rarity gates: dashed tier-coloured lines with letter labels (COMMON, UNCOMMON, RARE, ONE IN A VERMILLION) at +0/+210/+510/+810 m from where the dive began. Passing one flashes it and Vermi and calls `sfx.play('gate', step)`. Gates past the stop are drawn dim. The dive stops at exactly the answer's depth.
- ✅ Landing: a tier-coloured shockwave ring, a squash-and-bounce, and the tier banner (a sparkle burst and a small shake for ONE IN A VERMILLION). Then the feedback card fades in where the prompt card was.
- ✅ `ui.js`: the prompt card slides up and dims to 30% (6% while landing), the dock dims, and the DEPTH HUD counts up live from the dive (pack units follow the same interpolation). Enter, Space, a click or a tap skips straight to the landing. Timeout or 0 points: no dive, Vermi droops and bubbles rise, then the "Time's up." card. Reduce motion and Easy Read: no camera movement, with the final depth and banner shown directly. Duel: the rival jelly then sinks to its new depth at 2× speed. Results get a strip of 7 mini dive bars, one per question, coloured by tier.
- Sprites and sfx are stubbed procedurally: Vermi is the mascot sprite stretched or squashed. When Luna's `vermi-dive/squash/land`, `speedline`, `shockwave` and `gate-dash` sprites and the `dive`/`gate`/`land-<tier>`/`bloop` sfx land, I'll swap them in. Until the new sfx exist the calls are silent (the existing tier sound still plays at landing).
- Verified at 1280 and 376: a common, a rare and a one-in-a-vermillion answer with the dive mid-frame, wind-up and landing screenshots, a mid-dive Enter skip, a timeout and reduced motion. No console errors, no horizontal scroll. Not tested: the duel rival's dive, audio.
- ✅ Dive assets swapped in (Luna's 15:42 post): `vermi-squash` (wind-up), `vermi-dive` (3 frames, cycled every 90 ms), `vermi-land` (3 bounce frames), `speedline` (stretched with camera speed), `shockwave` (tier-tinted via `drawTintedSprite`, 4 frames stepped over the pulse) and `gate-dash` (tiled along each gate, tier colour, white on flash). Landing now plays `land-<tier>` (`land-none` for 0 points; the timeout sound is unchanged). Each procedural fallback stays in place in case a sprite is missing. Verified at 1280: common, rare and one-in-a-vermillion dives, a skip, a timeout and reduced motion; no console errors.
- ✅ Integration-review fix (mobile mid-dive): during a dive the question card (slides up) and the dock (slides down) now go to opacity 0 instead of 30%, so the gates and Vermi read cleanly. Vermi is held at 55% of the screen height on every viewport during wind-up, plunge and landing (it eases there during the wind-up, and returns to its idle position, lower on phones, afterwards). Verified at 376: mid-dive and landing frames show Vermi and gates with nothing overlapping. The dive sprite wiring was already done (see above).

---
## v3: Accounts + live multiplayer (CONTRACT §8), started 2026-11-18
Backend is live: schema, RLS, RPCs, realtime, and a 510-question server bank (orchestrator ✅, smoke-tested).

### Orchestrator
- [x] O1 Supabase schema + RLS + grants + RPCs (`supabase/migrations/`)
- [x] O2 Vendored supabase-js (`vendor/supabase.js`), `src/config.js`
- [x] O3 `admin-seed` function + `tools/seed-bank.sh`; bank loaded (510 questions, 191 everyday)
- [ ] O4 Deploy `submit-run` + `room-answer` once Luna posts them
- [ ] O5 Two-browser end-to-end test, then commit + push

### Sol
- [x] S10 `src/score.js` (`scoreAnswer`, `scoreRun`), identical tiers to game.js today
- [x] S11 Parity test: score.js vs the current game.js scoring over the matcher corpus
- [x] S12 Every pack has ≥7 prompts in the bank (needed for topic rooms); report any short packs
- 2026-11-18 17:19: S10 ready; pure scoring API smoke checks pass. S11 parity and S12 pack checks underway.
- 2026-11-18 17:36: S10–S12 complete. Captured pre-migration game.js and verified all 399 corpus cases: 353 matches have identical name/points/tier/corrected/input; 46 unresolved inputs (15 suggestions) score as misses, matching timeout scoring. Checked canonical YES submissions separately, all 9 tier boundaries, a 7-round mixed run (245 pts / 2,450 m), missing/extra inputs, nonmutation, and all 14,573 production label/point/tier round trips. All 14 packs have 40–101 questions (minimum required 7); everyday pool 191. No bank edits/reseed needed. No commit or push.

### Luna
- [x] L9 `src/online.js` (auth, profile, stats, submitRun with an offline queue, boards, friends)
- [x] L10 `src/rooms.js` (RPCs, realtime subscribe + presence, serverNow clock sync)
- [x] L11 `tools/sync-shared.sh` + `supabase/functions/submit-run` + `room-answer` (Deno, CORS, using `_shared/`)
- [x] L12 Tests: online/rooms with a fake client (no network), plus a streak-rule parity test between server and storage.js
- 2026-11-18 17:51: L9–L12 complete. `online.js` and `rooms.js` follow §8.5 with injectable fake-client factories, offline-safe results, queued solo-run submission, friend/profile APIs, room RPCs, realtime refresh/presence, and server-clock offset. `tools/sync-shared.sh` synchronizes matcher/score/RNG/modes; both edge functions use the shared scorer, validate/authenticate requests, and return CORS responses. Added `_shared/streak.js` so server stats use the same archive-safe Daily cursor rule as `storage.js`. Verification: `node tests/v3.test.mjs` passes all fake-client/queue/room/presence/server-clock/streak-parity checks; shared copies match their sources; `deno check` passes both functions using a local Supabase type stub (network unavailable); JS syntax and `bash -n` pass. No Supabase calls, deploy, commit, or push.
- 2026-11-19 14:00: Added `online.reviewAnswer(promptId,input,matchResult?)` for the deployed `answer-review` function. It skips offline/signed-out sessions, short text, matcher results other than `unknown`, and duplicate normalized candidates per sign-in session; it sends `{promptId,input}` and never throws. Fake-client tests cover each skip, session dedupe, request payload and successful result. `node tests/v3.test.mjs`, party tests, and syntax checks pass.
- 2026-11-18 21:57: Integration fix: `getRoomState()` now selects and returns `room_players.answered_round`, with a fake-client assertion covering the field. `node tests/v3.test.mjs` and syntax checks pass; no shared source changed, so no shared sync needed.
- 2026-11-19 07:04: 00:30 Luna visual assets complete: softened the 32×32 moon highlight, reduced cloud pixel coverage, and replaced the buoy with a dark silhouette and a single pink lamp pixel across its two slow-blink frames. Added atlas assertions for moon and lamp contrast. Scene-only work (gradient, placement, glow, sine wave, ruler, layers and calm animation) belongs to Sonnet's `scene.js` lane; posted integration note. Now beginning L17 with the exact 00:35 API.
- 2026-11-19 07:10: Added all 13 requested 16×16 monochrome menu sprites (`ico-daily/endless/past/topics/me/friends/gear/faq/board/live/duel/how/privacy`) and atlas assertions for dimensions and one-colour pixel data. `drawTintedSprite` supplies current-colour tint support without duplicate art. Returning to L17.

### Sonnet
- [x] U13 Account screen + home account chip (code-complete, NOT yet browser-verified)
- [x] U14 Leaderboard + Friends screens (code-complete, NOT yet browser-verified)
- [x] U15 Play online: create, join by code, quick match, lobby (code-complete, NOT yet browser-verified)
- [x] U16 Live round (scoreboard rail, synced timer, 3-2-1), round reveal, final podium (code-complete, NOT yet browser-verified)
- [x] U17 Solo results "Your rank today", submitRun hook, offline-disabled menu items, menu-search entries (code-complete, NOT yet browser-verified)
- [x] U18 Switch game.js scoring to `score.js` once Sol posts it (verified by a 600-case parity run in Node)

### Sonnet v3 notes (2026-11-18)
- Written: routes `#/account #/leaderboard #/friends #/online #/room/CODE` (router.js); account chip, Online menu group, menu-search entries and the home ONLINE button all show "Offline" and are disabled when `ONLINE.enabled` is false or the network is down; screens, lobby, live round, 6 s reveal with a reordering scoreboard, podium and the solo "Your rank today" line (ui.js, main.js, styles.css). Auth magic-link return hashes (`#access_token=…`) route to home.
- `online.js` and `rooms.js` don't exist yet, so they are imported lazily and every call fails soft ("Online play isn't available right now"). Solo play does not depend on them. `score.js` is wired: game.js takes an optional `score` function and main.js passes `scoreAnswer`.
- ⚠️ Not verified in a browser: the Chrome extension was not connected this session. Checked only with `node --check` on every file, router parsing, and a 600-case game.js vs score.js parity run. Needs a visual pass at 1280 and 376, plus a two-browser test once Luna's modules land.

### Sonnet: v3 browser pass + title screen rebuild (2026-11-18, evening)
- ✅ Aligned with the real `online.js` / `rooms.js`: room rows may arrive as an array, friends' `id` is mapped to the other player, `answered_round` drives the rail ✓, subscribe errors show a toast, accepted "Did you mean" answers now store the canonical name in `input` and the typed text in `typed` (so the server rescoring agrees).
- ✅ Checked in headless Chrome at 376 and 1280 with a temporary harness (since deleted) that fed each screen fake data: account (signed out and in), leaderboard (my row pinned past the top 50, empty, error), friends, play online (signed in and out, readable guest-sign-in error), invite sign-in, lobby, 3-2-1, live round (open and locked), reveal with SHARED ½ and the reordering scoreboard, podium, and offline page. Fixed along the way: avatar set (16×16 sprites only), stats NaN, phone top bar overflow (chip shows avatar only), rail under the HUD on phones, friends rows on phones, centred pages.
- ⚠️ Not verified: the real routes against live Supabase (headless Chrome hung on the realtime connection) and the real submit-run / room-answer calls. Guest sign-in is still disabled server-side, so no live game was played.
- ✅ Title screen rebuilt to the krillion.io measurements (part B): 920 px stage, 600 px column, waterline at 55% / 57.8%, VT323 everywhere, 124 px / 66 px wordmark with a pink/cyan split on a gentle arc, tagline, info line, featured card, 66 px primary button with ledge, 3 footer buttons, 34×26 icon stack (Sound, Settings, Account), fish in the water. Compared with `kr-desktop.png` and `kr-phone.png` by eye: elements land within a few px. The old chip and Theme button are hidden on this screen only.
- Mascot (part A, my side): "jellyfish" copy removed from ui.js and scene.js; the dive uses `mascot-dive` when present (falls back to `vermi-dive`); the sad pose uses `mascot` frame 3. `data/faq.json` still says jellyfish (Luna's file).


---
## v4: Krillion parity (CONTRACT §9), started 2026-11-18 23:40
### Orchestrator
- [ ] O6 `friends_daily(p_day)` + `delete_me()` RPCs; room timer default 25 s
- [ ] O7 DEPTH CHARGE backend (tables, RPCs, `party-answer` function, Elo)
- [x] O8 `tools/layout-audit.mjs` (`npm run audit:layout`)
### Sonnet
- [ ] U19 Layout audit to 0 issues (fix the #/online hang first)
- [ ] U20 Game screen + answer-result layout (§9.2)
- [ ] U21 Grid menu modal with search (§9.3)
- [ ] U22 Endless title screen + game log (§9.4)
- [ ] U23 My Vermillion / Friends answers / Privacy (§9.7)
- [ ] U24 Topic journey cards + chapter map (§9.5)
- [ ] U25 DEPTH CHARGE lobby + game UI (§9.6)
### Luna
- [x] L13 Timer 25 s everywhere
- [x] L14 Buddy sprites (9) + charge sprites (idle/fuse/boom)
- [x] L15 `banner-<pack>` art (14)
- [x] L16 Endless log + chapter progress in storage.js
- [x] L17 `src/party.js` + fake-client tests
- 2026-11-19 07:12: L17 complete against the 00:35 API: added `createParty()` with exact party room/quick/list/start/tick/leave RPC arguments, four-letter lower-case code validation, `party-answer` body, member room state (local prompt lookup, joined profile data, used answers and ordered events), four-table realtime refresh, typing receive/send, holder/auth gating and 10 Hz throttle. Added `tests/party.test.mjs` for payloads, input validation, state, subscriptions, broadcast and throttle. Also completed the 00:35 chapter follow-up in my lane: `online.js` now accepts unofficial chapter submissions with the topic ID; `submit-run` accepts and stores them as unofficial and verifies every question belongs to the selected topic via the bank's `packs` data. Database mode migration 08 is present. Extended fake-client coverage. Validated 116 sprite entries and all 13 new 16×16 monochrome menu icons, plus module syntax; `node tests/party.test.mjs` and `node tests/v3.test.mjs` pass. `deno check submit-run` could not resolve the npm Supabase package in the offline local Deno cache, so no Deno type-check is claimed. No network calls or deployment.
- 2026-11-18 v4 progress: L13–L16 complete and posted incrementally in `CHAT_LOG.md`. L13 sets Daily/Endless/topic/chapter timers to 25 s, keeps Duel at 15 s, defaults room creation to 25 s, and updates the FAQ. L14 adds nine buddy sprites plus charge idle/fuse/4-frame boom sprites. L15 adds all 14 115×48 topic banners. L16 adds numbered Endless log and chapter unlock/progress storage APIs. Module, fake-client and storage checks pass. L17 now uses the exact live API from the 00:35 Orchestrator post. The 00:35 chapter sync follow-up is implemented; see completion note above.
- 2026-11-19 08:55 review: toned down all 14 `banner-*` sprites while preserving names and 115×48 dimensions. Replaced bright sky/mid/deep/accent values with night-indigo/violet/navy scenes, muted topic accents and softer neutral lights; reduced speckles and floor stripes; pack icons now use the same single muted accent instead of their saturated multi-colour palettes. Added atlas palette bounds checks. Party/v3 fake-client suites, syntax checks, and direct dimensions/palette scan pass.
- 2026-11-19 09:02 Sol integration fix: `party.answer()` now parses the Supabase FunctionsHttpError response JSON for HTTP 409 and returns `{ok:false,error:'Edge Function returned a non-2xx status code',status:409,data:{status:<reason>}}`. Added fake Response coverage for all five API rejection reasons; party and v3 tests plus syntax checks pass.
### Sol
- [x] S17 Answer-bank sharding + lazy loading/build validator (13:10 job 2 first)
- [x] S18 Review Groq expansion files and rarity flags (13:10 job 1; first four available files reviewed)
- [ ] S16 DEPTH CHARGE screens (`src/party-ui.js`, `styles-party.css`) + fake-data UI tests and six-size layout audit (07:35 reassignment)
- [x] S13 Tier flavour lines for the answer-result screen
- [x] S14 `chapters` in packs.json (≥10 per topic) + new prompts
- [x] S15 `party: true` flag on questions with ≥40 answers

- 2026-11-18 22:30: S13 ready: `TIER_FLAVOUR` exported from content.js for all five internal tier IDs. S14 expansion/journey construction underway; S15 follows.

- 2026-11-19 00:12 Sol: S14 ready. Bank expanded 510 → 761 questions; all original 510 entries retained unchanged and in order. Added 159 ordered seven-question chapters (10 per topic, Science 19, Art 20), with no repeated ID within a topic journey. Content loader validates chapter shapes/uniqueness. Every reference resolves to a member of its topic, and every full seven-question group is used. All 18,906 answers / 21,148 names and aliases round-trip through matching and pure scoring. Original 191 everyday questions remain available. S15 party eligibility is next.

- 2026-11-19 00:13 Sol: S13–S15 complete, ready for integration/reseed. Final bank: 761 questions, 19,120 answers, 21,362 canonical/alias labels; 191 everyday questions; 51 party pools (13 everyday). Added answers to 12 existing everyday questions for accessible party play; all previous answers/points and all original IDs/order preserved. Each question has an explicit boolean party flag, true exactly at ≥40 answers. Loader rejects invalid flags and undersized party pools. Final checks: 399/399 matcher corpus cases; every label exact-match/score round trip; finite-set sizes and independent complete 0–99 spelling vocabulary; all 159 chapter references/membership/uniqueness/maximal count; v3 fake-client suite. Bounded Oscar/Eurovision/golf questions were tightened to complete named date ranges. No UI edits, commit or deployment. Orchestrator needs to reseed final prompts; Sonnet/Luna can consume chapters and party flags now.

- 2026-11-19 11:39 Sol: S16 implementation is ready in owned UI/CSS files; requested fake browser test/harness is in tests/party-ui.test.mjs. Guest/profile/buddy unlocks, public rooms, size/rated/quick/host/join, room copy/start/countdown, holder input/live typing, ring/hearts/meters/used answers, smooth pass/BOOM/out and rated results are implemented. Node DOM-adapter state tests, party data-layer tests, v3 tests and syntax checks pass. Browser launch/listening-port restrictions prevent a local layout run. Orchestrator supplied a first 72-issue audit; all seven reported causes have been fixed and posted for rerun. S16 remains unchecked until that browser test and six-size audit pass. Sonnet also needs to resume the existing shared scene in showPartyHost after generic mount hides it. No commit.

- 2026-11-19 11:41 Sol final code handoff: all seven first-audit findings are fixed; fixture now loads/awaits VT323 and mirrors Sonnet’s actual party shell classes. Party-specific shell styling keeps the page full width and menu/sound clear of the room header. Sonnet has resumed the shared scene, so that dependency is resolved. Preserved keyboard focus across public-list refreshes, added spoken player/out/holder status, and synchronized live reduced-motion changes; shared SFX owns live mute/volume. DOM-adapter, party and v3 suites plus syntax checks pass. The full browser fixture and six-size audit remain awaiting the Orchestrator rerun; no claim of a clean visual pass or new screenshots. S16 remains unchecked for that validation. No commit.

- 2026-11-19 11:56 Sol: Re-read the 11:20 review on request and confirmed all seven fixes are present. Added explicit browser geometry regressions for the reported failures to the six-size fixture suite. Local DOM-adapter/party/v3/syntax/whitespace checks pass; posted rerun commands in CHAT_LOG.md. Full browser/audit results remain with the Orchestrator; S16 remains unchecked pending those results. No commit.

- 2026-11-19 12:04 Sol: Addressed the 12:05 final audit item: both rules-dialog eyebrow and title now have fit-content boxes capped at the content width minus 52px, reserving the X lane. DOM-adapter/whitespace checks pass. Orchestrator reports all other party findings passed; awaiting final dialog geometry rerun. No commit.

- 2026-11-19 13:46 Sol: S17 complete. Editable full master plus 761 generated shards and 301,369-byte metadata catalogue; parallel cached loadAnswers and offline build/--check ready. All shard/master comparisons and 21,362 answer-label round trips pass; cache/retry/selected-only loading verified. API handoff posted for Sonnet/Luna and master-path change for Orchestrator. Beginning S18 expansion review; no .env access or commit.

- 2026-11-19 13:57 Sol: S18 first batch reviewed: v4-175/day-011/nat-016/sci-001 marked reviewed with 211/102/107/0 approved additions (420 total), explicit holds/removals, alias repairs and all 25 rarity decisions. Curated existing scores/aliases are applied to the master and regenerated shards; new approved additions await Orchestrator apply. In-memory merged bank validates and all 22,228 labels round-trip; build --check, 399 matcher cases, party/v3 tests, syntax/whitespace pass. Posted critical apply-tool fuzzy-dedup risks and full-master path change for Orchestrator. Stopped after all four files currently present; no .env access, commit or deployment.
