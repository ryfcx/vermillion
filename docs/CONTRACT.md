# Vermillion — Interface Contract (v2)

Owned by the Orchestrator. Propose changes in CHAT_LOG.md and don't edit this file yourself.
v2 replaces v1. Code that met v1 should be migrated, not thrown away.

## 0. Product goals (v2)
- **Same gameplay and site structure as a rare-answer trivia site** (Daily, Endless, Duel, themed packs with daily and archive challenges, guides, how-to-play, FAQ).
  **Everything is original**: name, copy, prompts, art, sounds, mascot and layout styling. Never copy another site's text or assets.
- **100% free.** No ads, no paywall, no "premium", no accounts, no locked content. Every mode, pack and archive day is playable.
- **Pixel-art identity.** Chunky pixel UI, a pixel font, sprites and an 8-bit sound palette, all made by us.
- **One consistent UI everywhere.** Every mode uses the same top bar, menu, play screen, feedback and results layout.
  Only the themed **progress display** changes per mode.
- **Much more detail.** Rich feedback after every answer, detailed results, stats, history, archive, guides and an FAQ.

## 1. Palette and style (everyone)
CSS custom properties defined once in `styles.css` `:root`:
```
--void:    #07060d   /* near-black background */
--abyss:   #0f0b24   /* deep indigo panels */
--indigo:  #1d1650
--violet:  #5b2bd6   /* primary purple */
--orchid:  #b44dff   /* light purple */
--azure:   #3d7bff   /* primary blue */
--cyan:    #5ee0ff   /* highlight blue */
--pink:    #ff4fa3   /* brand accent: "vermillion" is the logo wordmark, but brand colour is hot pink */
--blush:   #ff9ad5
--ink:     #e9e6ff   /* main text */
--muted:   #8d86b8
--good:    #5effa1   --warn: #ffd35e   --bad: #ff5e7a
```
- Rarity tiers (used everywhere: feedback, results squares, share): `none` ⬛ var(--muted), `common` 1–20 🟦 azure,
  `uncommon` 21–50 🟪 violet/orchid, `rare` 51–80 🩷 pink, `mythic` 81–100 ✨ cyan with a pixel sparkle.
- Fonts (self-hosted under `assets/fonts/`, OFL licensed): **"Press Start 2P"** for headings and labels and **"VT323"** for body and inputs.
- Pixel rules: `image-rendering: pixelated` on sprites and canvases, square borders in 4px steps, hard drop shadows (`4px 4px 0`),
  no blur or rounded corners (radius 0). Use stepped `steps()` animations for the UI.
- Display setting (toolbar → "Display"): `theme: 'neon' | 'midnight' | 'crt'` (crt adds scanlines). Easy Read: larger VT323 text,
  Press Start 2P only for the logo, higher contrast, no scanlines or motion.

## 2. Modes
| id | Name in UI | Prompts | Timer | Progress display | Limit |
|---|---|---|---|---|---|
| `daily` | Daily Descent | 7 mixed | 20 s | **Depth trench**: a pixel diver sinks; 1 pt = 10 m | 1 official attempt per UTC day; practice replays allowed but not saved as official |
| `endless` | Endless Descent | 7 mixed, avoid recent | 20 s | Depth trench | unlimited |
| `duel` | Duel | 7 mixed, shared via link | 15 s | **Split trench**: two divers | unlimited; same answer = both halved |
| `pack:<packId>` | Themed pack | 7 from pack | 20 s | pack-specific (see below) | daily per pack (1 official), plus archive of every past day since launch `2026-11-01`, plus practice |

Packs (`data/packs.json`, Sol owns). Each pack has an id, name, blurb, icon sprite name, progress display and categories:
| packId | Name | Progress display |
|---|---|---|
| `movies` | Silver Screen | **Neon city journey**: a pixel car drives across a skyline, 1 pt = 1 block |
| `sports` | Arena | **Track laps**: a pixel runner circles a track, 1 pt = 10 m |
| `geography` | Atlas | **Flight path**: a pixel plane crosses a map, 1 pt = 25 km |
| `language` | Wordsmith | **Notebook**: pixel notebook pages fill with ink, 1 pt = 1 word |
| `science` | Lab | **Reactor charge**: energy bar, 1 pt = 1 kJ |
| `history` | Chronicle | **Timeline**: scroll unrolls, 1 pt = 1 year back |
| `music` | Soundcheck | **Equalizer**: bars rise, 1 pt = 1 dB |
| `nature` | Wildwood | **Growth**: pixel tree grows, 1 pt = 1 cm |
| `food` | Kitchen | **Recipe card**: plate fills, 1 pt = 1 g |
| `games` | Arcade | **Score counter**: arcade score, 1 pt = 100 |
| `space` | Orbit | **Launch**: rocket climbs, 1 pt = 10 km |
| `arts` | Gallery | **Canvas**: pixel painting fills in |
| `myth` | Mythos | **Labyrinth**: path through a maze |
| `tech` | Circuit | **Download bar**: 1 pt = 1 MB |

The Daily, Endless and Duel modes draw from **all** prompts in the bank.

## 3. Data

### `data/prompts.json` (Sol)
```json
{ "version": 2, "prompts": [ {
  "id": "geo-001", "category": "geography", "packs": ["geography"],
  "text": "Name a country whose name ends in \"-stan\"",
  "hint": "Think Central and South Asia.",
  "fact": "Optional one-line fun fact shown on the feedback screen.",
  "answers": [ { "name": "Kyrgyzstan", "aliases": ["Kirghizia"], "points": 55, "note": "optional short trivia" } ]
} ] }
```
- `category` ∈ `geography, science, film, music, sports, history, language, food, nature, pop, games, space, arts, myth, tech, animals, literature, tv`.
- `packs`: which packs include this prompt (may be empty). Every pack needs **at least 40 prompts**.
- Every prompt has ≥ 12 answers. Keep the v1 rules: unique stable ids and points from 1–100.
- `hint` is required. `fact` and `note` are optional but encouraged; they make the feedback screen detailed.
- Target: **≥ 450 prompts** total. Language-pack prompts are word puzzles
  ("a word that starts and ends with the same letter", "a 5-letter word with no vowels except Y", and so on), each with a closed answer list.

### `data/packs.json` (Sol)
`{ "packs": [ { "id", "name", "blurb", "icon", "display", "unit", "pointsPerUnit" } ] }` matching the table above.

### `data/guides.json` (Luna)
`{ "guides": [ { "slug", "title", "group": "strategy"|"category"|"practice", "summary", "body": "markdown-lite: paragraphs, ## headings, - bullets" } ] }`
At least 16 original guides. Also `data/faq.json`: `{ "faq": [ { "q", "a" } ] }` with at least 12 entries.

## 4. Modules (ES modules under `src/`, no build step)

### Content and matching (Sol): `src/content.js`, `src/matcher.js`
v1 API plus:
```js
export async function loadPacks(url='./data/packs.json')  // -> {packs: Pack[]}
export function promptsForPack(bank, packId)              // -> Prompt[]
```

### Modes, storage and share (Luna): `src/rng.js`, `src/modes.js`, `src/storage.js`, `src/share.js`
v1 API plus:
```js
// modes.js
export const LAUNCH_DAY = '2026-11-01'
export const TIMERS = { daily: 20000, endless: 20000, duel: 15000, pack: 20000 }
export function getPackDailyPrompts(bank, packId, dayKey) // deterministic per (pack, day), seeded by `${packId}:${dayKey}`
export function listArchiveDays(today = utcDayKey())      // -> ['2026-11-17', ..., LAUNCH_DAY]
// storage.js: results keyed by mode+pack+day
export function getOfficialResult({mode, packId=null, dayKey}) // -> Run|null
export function getHistory({limit=50, mode, packId})          // -> Run[] newest first
export function getStats()  // -> { runs, bestDepth, totalPoints, avgPoints, dailyStreak, bestStreak, lastDailyKey,
                            //      mythicCount, rareCount, perPack: {packId: {runs, best}}, tierCounts: {none,common,uncommon,rare,mythic} }
export function getSettings()/saveSettings() // { easyRead, reducedMotion, sound: true, volume: 0.6, theme: 'neon' }
// share.js: share text uses tier squares: ⬛🟦🟪🩷✨
```
`Run` gains: `packId: string|null`, `practice: boolean`, `official: boolean`.

### Assets, sound and art (Luna): `assets/`, `src/sprites.js`, `src/sfx.js`
All art is **made by us in code or as hand-authored pixel data**. Nothing is downloaded except the two OFL fonts.
```js
// sprites.js: sprites are defined as string pixel maps + a palette; rendered crisp at integer scale
export const SPRITES                        // { name: { w, h, frames: string[][], palette: {char: '#hex'} } }
export function drawSprite(ctx, name, x, y, scale=4, frame=0)
export function spriteDataURL(name, scale=4, frame=0)  // for <img> and CSS backgrounds
export function spriteEl(name, scale=4, {animate=false, fps=6}={}) // -> <canvas> element (animated if frames>1)
```
Required sprites: `logo` (VERMILLION wordmark in pixel letters), `mascot` (our original mascot **"Vermi"**: a small glowing pink-purple
jellyfish with 3+ frames, including idle, happy and sad), `diver`, `car`, `runner`, `plane`, `rocket`, `notebook`, `tree`, an icon per pack (16×16),
icons for `daily` `endless` `duel` `stats` `archive` `guides` `settings` `share` `menu` `close` `sound-on` `sound-off`, tier badges, `star`, `bubble`, `skyline-tile`.
Also `assets/favicon.png` (32×32) and `assets/og.png` (1200×630 pixel banner), both generated by a script `tools/make-assets.mjs` (node, no deps)
or exported from the sprite data.
```js
// sfx.js: WebAudio chiptune synthesis, no audio files
export function play(name) // 'type','submit','unknown','common','uncommon','rare','mythic','timeout','tick','next','finish','click','duelWin','duelLose'
export function setVolume(v), setMuted(b)
export function music(on) // optional gentle looping chiptune bed, off by default
```

### UI (Sonnet): `index.html`, `styles.css`, `src/game.js`, `src/ui.js`, `src/main.js`, `src/displays.js`, `src/router.js`
- **Hash router** (`src/router.js`): `#/` home, `#/play/daily`, `#/play/endless`, `#/play/duel` (and `?duel=TOKEN`), `#/play/pack/<id>[/<dayKey>]`,
  `#/packs`, `#/archive/<packId|daily>`, `#/stats`, `#/history`, `#/how-to-play`, `#/guides`, `#/guides/<slug>`, `#/faq`, `#/about`.
- **Same shell everywhere**: top bar (logo → home, Play ▾ menu with every mode and pack, Packs, Guides, How to play, FAQ),
  plus a toolbar on game screens: **Menu**, **Display** (theme), **Easy Read**, **Sound** toggle.
- **Home**: hero with animated Vermi, today's Daily Descent card (Play / see your result), mode cards (Endless, Duel),
  a pack grid (14 packs with icons, "Today" and "Archive" buttons), a strategy teaser, the FAQ preview and a footer.
- **Play screen** (identical layout for all modes): mode/pack title, prompt N/7 pips, pixel timer bar (or ring) with low-time pulse,
  category tag, prompt text, hint button (reveals `hint`, costs nothing; it's free), answer input, Submit, and the themed progress display on the side (desktop) or top (mobile).
- **Feedback after each answer**: tier badge plus sound, matched answer, points counting up, unit conversion ("+52 pts · +520 m"),
  `note`/`fact`, the "Deeper cuts" list (3 rarer answers) and "Most common" answer. On a timeout or unknown answer: retry message (retry if time remains).
- **Results**: total plus themed unit, tier squares, per-prompt table (your answer, points, rarest possible), personal best and streak, share button,
  "Play again" (endless/practice), "Challenge a friend" (makes a duel from this run), "Next pack" suggestion.
- **Duel compare**: side-by-side per-prompt table with collision highlights and a winner banner.
- `src/displays.js`: `createDisplay(kind, host)` → `{ update(points, maxPoints), celebrate(tier), destroy() }`, one per progress display in §2, all drawn with sprites.

## 5. Shared shapes
```js
RunAnswer = { promptId, input, answerName: string|null, points, tier, usedHint: boolean, timedOut: boolean }
Run = { mode, packId, dayKey, practice, official, promptIds, answers, total, depth, finishedAt }
```
