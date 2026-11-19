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
vermilion fish, side view facing right; `mascot` 4 frames idle/idle/happy/sad, `mascot-idle` 3, `mascot-dive` 2), `diver`, `car`, `runner`, `plane`, `rocket`, `notebook`, `tree`, an icon per pack (16×16),
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

## 6. Amendment v2.1 (2026-11-18)
- **Tier label:** tier id `mythic` (81–100 pts) is displayed everywhere as **"ONE IN A VERMILLION"** (short form "1 in a Vermillion"). Share square ✨.
- **`matchAnswer(prompt, input)`** may also return:
  - `{ status:'match', answer, points, corrected:true, input }`: a high-confidence correction, accepted automatically.
  - `{ status:'suggest', answer, points, input }`: medium confidence. The UI asks "Did you mean X?". YES submits `answer.name` as a match, and NO keeps the timer running.
  - Ambiguity rule unchanged: if two different answers are plausible, return `{ status:'unknown' }`.
- `RunAnswer` gains `corrected: boolean`.

## 7. Amendment v2.2 (2026-11-18): everyday Daily + plain wording
- **Prompt field `everyday: boolean`** (Sol). True for prompts about common, well-known things anyone can answer
  (foods, animals, household items, jobs, colours, holidays, sports, weather, body parts, school subjects, vehicles, clothing, games, TV/film basics).
  The **Daily** (`getDailyPrompts`) draws **only** from `everyday: true` prompts (fall back to all if fewer than 7).
  Endless and packs still use everything. Need **≥ 150 everyday prompts**, each with ≥ 15 answers spanning obvious (≈5 pts) to clever-but-fair deep cuts.
  Everyday prompt text must be short and plain: "Name a fruit that is red", not "Pick a pome cultivar…".
- **Plain pack names** in `data/packs.json` (ids unchanged): movies **Movies**, sports **Sports**, geography **Geography**, language **Words**,
  science **Science**, history **History**, music **Music**, nature **Nature**, food **Food**, games **Games**, space **Space**, arts **Art**,
  myth **Mythology**, tech **Tech**. Blurbs are one plain sentence.
- **Plain UI wording** (Sonnet). Keep the brand "Vermillion", the depth/metre score and the ocean scene, but use everyday words in all labels:
  | Old | New |
  |---|---|
  | Daily Descent / THE DAILY DESCENT | Daily Game / THE DAILY RARE-ANSWER GAME |
  | START TODAY'S DESCENT | PLAY TODAY'S GAME |
  | VIEW TODAY'S RESULT | SEE TODAY'S SCORE |
  | DESCENT #N | GAME #N |
  | Endless Descent | Endless |
  | SINK ▼ | SUBMIT |
  | Deeper cuts | Rarer answers |
  | "The dark swallowed that one." / themed flavour lines | "Time's up." / plain sentences |
  | Themed packs | Topics |
  | Archive | Past games |
  | info line | "7 questions · 20 seconds each · rarer answers score more" |
  Also "prompt" → "question" in user-facing text ("QUESTION 3 OF 7"). Code identifiers stay unchanged.

## 8. v3 (2026-11-18): accounts, leaderboards, friends, live multiplayer
The backend is **Supabase** (project `bethbacmhbwinjsxhkvl`), and it is **already live**. The orchestrator owns the schema; see
`supabase/migrations/`. The game must still work 100% offline when `ONLINE.enabled` is false, when the network is down, or when
the player is a signed-out guest. Every online call fails soft: show a plain message and never break solo play.

### 8.1 Files
| File | Owner | Purpose |
|---|---|---|
| `src/config.js` | Orchestrator | `ONLINE = { enabled, url, publishableKey, functionsUrl }`. These values are public. Never add a secret key. |
| `vendor/supabase.js` | Orchestrator | supabase-js 2.119.1 bundled as one ESM file. Import it with `import { createClient } from '../vendor/supabase.js'`. Do not use a CDN. |
| `src/online.js` | **Luna** | Client, auth, profile, stats, run submission, leaderboards, friends |
| `src/rooms.js` | **Luna** | Live rooms: RPC calls, realtime subscription, server-clock sync |
| `src/score.js` | **Sol** | Pure scoring used by both the browser and the server (below) |
| `supabase/functions/submit-run/`, `room-answer/`, `_shared/` | **Luna** writes them; the orchestrator deploys them | Server-side scoring |
| `tools/sync-shared.sh` | **Luna** | Copies `src/matcher.js`, `src/score.js`, `src/rng.js` and `src/modes.js` into `supabase/functions/_shared/` |
| Screens and routes | **Sonnet** | Every UI piece listed in 8.6 |

### 8.2 Database (already applied; read-only for agents)
- `profiles(id, username, avatar, created_at)`
  - A profile is created automatically at sign-up as `diver_xxxxxxxx`.
  - Usernames match `^[A-Za-z0-9_]{3,16}$` and are unique regardless of case.
  - Users can update only their own `username` and `avatar`.
- `profile_stats(user_id, runs, total_points, best_depth, daily_streak, best_streak, last_daily_key, mythic_count, rare_count)`
  - Anyone can read it. Only the server writes it.
- `runs(id, user_id, mode, pack_id, day_key, official, prompt_ids, answers jsonb, total, depth, created_at)`
  - You can read only your own runs. Only the server writes them.
  - Each user gets one official run per (mode, pack, day).
- `friendships(user_id → friend_id, status 'pending'|'accepted')`
  - The requester inserts the row as pending, and the recipient updates `status` to `'accepted'`.
  - Either side can delete the row.
- `rooms(id, code 5 letters, host_id, status 'lobby'|'playing'|'finished', is_public, pack_id, max_players 8, timer_ms, prompt_ids, round, round_started_at)`
  - Only members can read it.
  - `round_started_at` can be **in the future**: there's a 3 s countdown before round 1 and a 6 s reveal between rounds.
- `room_players(room_id, user_id, score, joined_at, left_at)`: only members can read it.
- `room_answers(room_id, user_id, round, input, answer_name, base_points, points, shared, submitted_at)`
  - Each player sees their own answer at once.
  - Everyone's answers become visible once `rooms.round` moves past that round, or the room is finished.
- `prompt_bank`: the server-only copy of `data/prompts.json`. Clients can never read it.
  - **After any change to `data/prompts.json`, run `tools/seed-bank.sh`.** It needs `.seed-secret`, which is gitignored; the orchestrator has it.
- Realtime is on for `rooms`, `room_players` and `room_answers` (postgres_changes, filtered by RLS).

### 8.3 RPCs (call with `supabase.rpc(name, args)`)
| RPC | Who | Notes |
|---|---|---|
| `create_room({p_pack?, p_public?, p_timer_ms?})` | signed in | Returns the room row. The caller joins as host. |
| `join_room({p_code})` | signed in | Errors: `no room with that code`, `that game already started`, `room is full`. Rejoining is fine. |
| `quick_match()` | signed in | Joins the oldest public lobby from the last 10 minutes, or creates a new public room. |
| `leave_room({p_room})` | member | Passes host to the next player, or closes the room if it's empty. |
| `start_room({p_room})` | host | Picks 7 questions (everyday ones, or the room's pack). Sets round 1 to start 3 s from now. |
| `advance_round({p_room, p_round})` | member | Closes the round when time + 1.5 s is up **or** everyone has answered. Shared answers get ½ points, rounded up. Opens the next round 6 s later, or finishes the room. Safe to call repeatedly, from any client. |
| `leaderboard_daily({p_day?, p_scope:'all'|'friends', p_limit?})` | anyone | Returns `rank, user_id, username, avatar, total, depth` |
| `leaderboard_alltime({p_scope, p_limit?})` | anyone | Returns `rank, user_id, username, avatar, total, games`. Sums official Daily totals. |

### 8.4 Edge Functions (Luna writes, orchestrator deploys; `verify_jwt` on, user JWT in `Authorization`)
- **`POST submit-run`** with body `{ mode, packId, dayKey, practice, answers: [{ promptId, input }] }`. `input` is the final text the player
  submitted, which is the suggested name if they accepted "Did you mean". An empty string means a miss.
  - The server loads `prompt_bank`, which is cached per instance.
  - For an official Daily it checks that the `promptIds` match `getDailyPrompts(bank, dayKey)`. It also accepts dayKey = today ±1 day for timezones, and archive days.
  - It scores the run with `scoreRun` and inserts the run. Unique-violation → 409 `already played`.
  - It updates `profile_stats`, using the same streak rules as storage.js.
  - Returns `{ run, stats, rank }`, where `rank` is today's rank for a Daily.
- **`POST room-answer`** with body `{ roomId, round, input }`.
  - The server checks that the caller is an active member, the room is playing, `round === rooms.round`, and
    `now` is in `[round_started_at, round_started_at + timer_ms + 1000]`.
  - It scores the answer with `scoreAnswer`, then inserts into `room_answers` (`base_points`, `answer_name`). A duplicate → 409.
  - It calls `advance_round` so the round closes early once everyone has answered.
  - Returns `{ status, answerName, basePoints, tier }`.
  - **Rooms have no "Did you mean"**: suggestions count as misses, and the client sends exactly what was typed.
- Both functions import `../_shared/*.js`. They use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the function environment, and never from the repo.
  Every response has CORS headers for `*`, and `OPTIONS` is handled.

### 8.5 Client APIs
`src/score.js` (Sol) is pure and has no DOM dependency:
- `scoreAnswer(prompt, input)` returns a `RunAnswer` with `{ promptId, input, answer, points, tier, corrected }`. It uses the same tiers and
  thresholds as game.js today, and `suggest` and `unknown` count as misses.
- `scoreRun(prompts, inputs)` returns `{ answers, total, depth: total*10 }`.
- game.js should use these too, so the client and server always agree. Sonnet swaps game.js over once Sol publishes score.js.

`src/online.js` (Luna). Every function is async and never throws; each returns `{ ok, data?, error? }`.
- `online.available()` returns a boolean: `ONLINE.enabled && navigator.onLine`.
- `getUser()` returns `{ id, isGuest, email } | null`, and `onAuth(cb)` subscribes to sign-in changes.
- Sign-in: `signInEmail(email)` sends a magic link (redirect = current origin + path). `signInGuest()` signs in anonymously.
  `upgradeGuest(email)` links an email to the current guest. `signOut()` signs out.
- Profile: `getProfile(id?)` and `updateProfile({ username, avatar })`. A username clash returns `error: 'That name is taken.'`.
- `submitRun(run)` is called by the game for signed-in players after every completed run, practice excluded.
  It maps the local run to the 8.4 body. Offline, it queues the run in localStorage and retries on the next load.
  The local `storage.saveRun` still runs as before.
- Stats and leaderboards: `getStats(id?)`, `dailyBoard({ day, scope })` and `allTimeBoard({ scope })`.
- Friends: `listFriends()` returns `{ friends, incoming, outgoing }` with profiles. Also `requestFriend(username)`,
  `acceptFriend(userId)` and `removeFriend(userId)`.

`src/rooms.js` (Luna):
- Room actions: `createRoom(opts)`, `joinRoom(code)`, `quickMatch()`, `leaveRoom(id)`, `startRoom(id)`,
  `answer(id, round, input)` and `advance(id, round)`.
- `getRoomState(id)` returns `{ room, players: [{ user_id, username, avatar, score, left_at }], answers }`.
- `subscribe(id, onState)` re-fetches state on every change, tracks presence, and returns `unsubscribe()`.
- `serverNow()` is the client clock corrected by the offset taken from response `Date` headers. Use it for every countdown.
- Every player's client calls `advance(id, round)` when its local timer reaches zero. The server ignores early or duplicate calls.

### 8.6 UI (Sonnet). Use the same pixel style and plain wording, and add each new item to the menu and to menu search
- **Account** `#/account`:
  - Signed out, it shows two buttons: "Play as guest" and "Sign in with email". Email sign-in sends a magic link, then says "Check your email".
  - Signed in, it shows the username (editable), a pixel avatar picker using Luna's sprites, and the stats card from `profile_stats`.
  - A guest sees "Save your progress: add email".
  - There's also a sign-out button.
  - A small account chip goes on the home top bar.
- **Leaderboard** `#/leaderboard` has tabs Today / All time and Everyone / Friends. Highlight your own row, and show your rank even when you're outside the top 50.
- **Friends** `#/friends`: add a friend by username, see incoming requests with Accept/Decline, and see your friends list with today's score once they've played.
- **Play online** `#/online` has three choices: **Create a game** (pick Everyday or a topic), **Join with code** (5-letter input), and **Quick match**.
- **Lobby** `#/room/CODE`:
  - It shows the big room code, a copy-invite-link button for `…/#/room/CODE`, and the player list with avatars and a host crown.
  - The host gets "START GAME" (enabled with ≥2 players) and everyone gets "Leave".
  - Opening `#/room/CODE` while signed out walks the player through guest sign-in, then joins the room automatically.
- **Live round**:
  - It reuses the play screen: same layout, dive and question card.
  - It adds a compact live scoreboard rail with names, scores and a ✓ for "answered" this round.
  - The timer is `round_started_at + timer_ms` read via `serverNow()`. A pre-round 3-2-1 overlay shows when `round_started_at` is in the future.
  - There's one submission per round and no hints.
- **Round reveal (6 s)**: show everyone's answers with points, mark shared ones "SHARED ½", and animate the scoreboard reordering.
- **Final standings**: show a podium with places 1–3 and the full list. "Play again" creates a new room with the same players invited by link,
  and "Home" goes back.
- Solo **results** screen, for signed-in players: "Your rank today: #N of M" plus a link to the leaderboard.
  For signed-out players: "Sign in to join the leaderboard".
- Offline or `ONLINE.enabled=false`: online menu items show "Offline" and are disabled. Everything solo still works.

## 9. v4 (2026-11-18): Krillion parity, covering every mode and every screen layout
The user wants **every Krillion mode** and **Krillion's screen layouts** for all of them. Name, art, colours, wording and scene stay ours.
I measured krillion.io in headless Chrome. Screenshots for reference:
`/private/tmp/claude-501/-Users-ryann-Desktop-Vermillion/80087e12-8ed8-4993-a1d3-5576d3d766e2/scratchpad/kr/site/*.png` and `…/kr/site2/*.png`
(play-d/m, play-result-d/m, party-d/m, party-howto, packs-d/m, menu-open, account-d/m, friends-d/m).
Never copy their images or text. Copy layout and sizes only. Everything stays free.

### 9.1 Mode map
| Krillion | Vermillion | Status |
|---|---|---|
| Daily Dive | **Daily Game** | Exists. Timer becomes **25 s** (Luna: `TIMERS`; info line "7 questions · 25 seconds each · rarer answers score more") |
| Unlimited | **Endless** | Add a title screen and a game log (9.4) |
| Puffer Party | **DEPTH CHARGE** (new, 9.6): "pass the charge · don't let it blow on you" | New |
| Archive | **Past games** | Exists, and free |
| Themed packs | **Topics**, with chapter journeys (9.5) | Extend |
| My Krillion | **My Vermillion** (`#/account`) | Restyle (9.7) |
| Friends | **Friends**, which now also compares today's **answers** (9.7) | Extend |
| FAQ / Privacy | FAQ / **Privacy** (`#/privacy`, new) | Add Privacy |
| — | Duel, Live game (rooms), Leaderboard | Our extras. Keep them, and they go in the menu. |

### 9.2 Game screen (Sonnet). 1280×800 / 390×844. Every mode uses it: Daily, Endless, topics, chapters, duel, live rooms.
| Element | Desktop | Phone | Notes |
|---|---|---|---|
| HUD bar | centred 720 wide, y 0, h 72 | full width, h 59 | three parts |
| DEPTH box (left) | x 280+24 → box ≈120×64. Label 12 px with letter-spacing .3em, value VT323 **32 px** `--cyan` | x 10 → label 10 px, value 25 px | notched pixel box |
| Progress (centre) | 7 squares ≈14 px with a 3-px gap, then "QUESTION 1 OF 7" in 11 px with letter-spacing .22em under them, y 8–64 | same | the current square is pink |
| SCORE box (right) | mirror of DEPTH, value `--pink`, right-aligned | x 294 | |
| ☰ menu | stage-left+5, **y 75**, 44 hit area, square ≈38 | x 5, y 61 | **below** the HUD, never on it |
| Sound | stage-right−44, y 84, 34×26 | x 346, y 70 | below the HUD. **Settings, account and theme are not on the game screen.** |
| Waterline | y ≈ 213 (27%) | y ≈ 178 | the scene scrolls down as you dive (keep our dive animation) |
| Question card | centred **480×143** at y 214, notched pixel box, `--abyss` .92 fill. Inside: "QUESTION 1 OF 7" 16 px with letter-spacing .32em `--pink`; question VT323 **40 px**; "▼ rarer answers score more ▼" 15 px with letter-spacing .14em, muted | x 12, y 179, **316×116**; question 31 px | Our HINT button goes at the card's bottom-right, small |
| Vermi | x ≈ 214, y ≈ 498, 68 px | x 22, y 567 | in the water, left |
| Timer ring | 58×58 at (340, 634), digits 26 px | (12, 724) | ring drains |
| Answer input | **446×59** at (408, 633), VT323 26 px, 2-px `--cyan` border, placeholder "type one answer…", 3-px time bar under it | (80, 727) 212×53 | |
| Submit button | **76×52** at (864, 637), `--pink` fill, dark text "GO" or "SUBMIT" at 21 px with letter-spacing .12em | (302, 727) | |
| Depth ruler | right edge, labels every 100 m, a pink "YOU ◀" marker at the current depth | same | |

**Answer result (after each answer)**, replacing the card:
- Tier icon 88 px at y 162. Tier name VT323 **44 px** with letter-spacing .12em (our tier label, e.g. ONE IN A VERMILLION).
- The answer in quotes, 24 px. "+10 PTS · sink 100m" at 28 px. A one-line flavour line, 17 px muted. Sol writes these per tier, and they're ours.
- A **"NEXT ▼"** button, 178×55, centred at y 639 (phone y 723), with a cyan border.
- Misses show the quoted text with "no match. try again" in the info line, and the input stays open.

### 9.3 Menu (Sonnet). Krillion-style centred modal: 440 wide, top 16, notched border
- Header: small "VERMILLION" eyebrow, a big "MENU" in the chromatic-split style, and an X close button (40×40, top right).
- **Search box first** (the user asked for it earlier). Then the section label "PLAY", then a **2-column grid of tiles** (≈188×86, icon 16 px + label 12 px, letter-spacing .1em):
  DAILY GAME (highlighted pink), ENDLESS, DEPTH CHARGE, PAST GAMES, TOPICS, MY VERMILLION, FRIENDS, LEADERBOARD, LIVE GAME, DUEL, SETTINGS, FAQ.
- Below the grid, full-width rows (icon, title, one-line description): HOW TO PLAY, GUIDES, PRIVACY, ABOUT.
- Phone: the modal fills the width minus 8 px each side and scrolls inside itself. The drawer search results replace the grid while you type.

### 9.4 Endless (`#/play/endless`, Sonnet + Luna)
- A title screen using the **same layout as home**. Tagline "THE ENDLESS GAME". Info line "game after game · rarer answers score more".
- Primary button "▼ START ▼". Under it, "ENDLESS GAME #N" on the left, and on the right the footer buttons "PAST GAMES ⟲" and "TODAY'S GAME".
- A small link "OPEN THE GAME LOG ∞" opens a modal listing your numbered endless games (1 = NOW, then score and depth for each finished one).
  Luna stores these in `storage.js` as `getEndlessLog()` / `appendEndless(run)` and syncs them via submitRun.

### 9.5 Topics as journeys (Sol content, Luna art and progress, Sonnet UI)
- `#/packs` becomes a **single centred 460-px column of tall cards**, like theirs.
  - Each card has a **pixel banner scene** (Luna: `banner-<packId>`, 115×48, drawn at ×4) and our topic name in 24 px.
  - Below the name: "N chapters · <one-line tagline>", a dashed rule, and a right-aligned CTA in that topic's accent colour ("START THE TOPIC →").
  - Keep "Today's topic game" and Practice as links on each card.
- Sol adds **`chapters`** to `data/packs.json`: an ordered array of 7-prompt-id arrays. Make as many as the content allows, at least 10 per topic.
  Write new prompts where a topic has too few, using the same quality rules as before, and **post so I can reseed**.
- Topic page `#/packs/<id>`: a themed **chapter map**, a vertical path of numbered nodes. Chapter 1 is open. Finishing a chapter unlocks the next, with ≥1 point required.
  Each node shows its best score. Playing a chapter uses the 9.2 game screen. Luna stores progress with `getChapterProgress(packId)` / `saveChapter(packId, n, run)`.
  The mode is `chapter`, and submitRun sends it unofficially.

### 9.6 DEPTH CHARGE: party mode (backend orchestrator, `src/party.js` Luna, UI Sonnet, art Luna)
Rules (our own wording):
- 2–10 players. Each starts with **2 hearts** (max 3). One question is live at a time.
- The player **holding the charge** must type a valid answer to the current question that **nobody has used yet for this question**. A valid answer passes the charge to the next player still in.
- A hidden **fuse** of random 10–30 s runs, shared across passes. If fewer than 8 s are left when you pass, it resets to 8.
- When the fuse runs out, the holder **loses a heart (BOOM)**. Then a new question and a new fuse start with the next player.
- Every valid answer adds its points to your **rarity meter**. When it reaches 100, you get +1 heart (max 3) and the meter drops by 100.
- A player with 0 hearts is out. The **last player still in wins**.
- Lobby (`#/party`), using Krillion's lobby layout:
  - Title block: wordmark at 76 px, "DEPTH CHARGE" 22 px with letter-spacing .3em, sub line 15 px, description 17 px in a 500-px column.
  - **Left panel, 360 wide:** "WHO'S PLAYING" with a HOW TO PLAY button. "YOUR NAME" input (placeholder "what the room calls you", saved to the profile).
    Then a **buddy picker**: a 5-column grid of 59×81 keys with a 44-px sprite, a name, and an unlock text.
  - **Buddies unlock by best Daily streak** (Luna draws all 9, our own creatures):
    VERMI (start), GUPPY 5-day, SEAHORSE 14-day, OCTOPUS 30-day, LANTERNFISH 45-day, NARWHAL 60-day, NAUTILUS 75-day, KRAKEN 100-day, ABYSS KING 150-day.
  - **PLAY NOW panel:** size tabs 1V1 / 3S / 4–6 / 8–10. "▶ RATED ◀" ("near your rating · it moves") and "QUICK PLAY" ("unrated · just for fun").
    Then HOST: "▼ HOST A ROOM ▼" with a "PUBLIC · LISTED" toggle, and JOIN BY CODE (4 letters) with a JOIN button.
  - **Right panel, 360 wide:** "PUBLIC ROOMS · SHOWING N" lists real rooms only, each with code, host name, n/max, "IN THE LOBBY"/"PLAYING", and "JOIN ▸" or "FULL".
  - Centre: the depth-charge sprite idling on the seabed (`charge-idle`, `charge-fuse` lit, `charge-boom` 4 frames).
- Game screen:
  - Players sit in a **ring** around the centre, each with buddy, name, hearts ♥ and a meter bar.
  - The charge sits next to the holder and slides to the next player on a pass. The fuse spark gets faster as time runs low, but the exact time is hidden.
  - The question card sits at the top centre, styled like 9.2. The answer input appears only for the holder ("YOUR TURN"); others watch the typing.
    Luna broadcasts the holder's keystrokes over the realtime channel.
  - The used-answer list scrolls under the card.
  - A BOOM animation plays, and a heart is lost.
  - Winner screen: podium, rating change for rated games, PLAY AGAIN, LOBBY.
- Backend (orchestrator): tables `party_rooms` / `party_players` / `party_used`. RPCs `party_create`, `party_join`, `party_quick({size, rated})`, `party_public_list`,
  `party_start` and `party_tick` (applies BOOM when `now ≥ fuse_ends_at`; any member may call it). Edge function `party-answer`
  validates the turn, the question, reuse and the score, passes the charge, and applies the meter. Rating is Elo (K=24) in `profiles.party_rating`, default 1000.
  I'll post the exact API when it's live.

### 9.7 My Vermillion, Friends, Privacy (Sonnet; backend orchestrator)
- **My Vermillion** (`#/account`), following their layout: eyebrow "YOUR LOGBOOK", heading "My Vermillion", then the sign-in box (guest or email).
  - Then "Dive with your friends" with a FRIENDS LEADERBOARD → link.
  - Then the stats block "ON THIS DEVICE" or "ON YOUR ACCOUNT": Current streak, Best streak, Daily games, Best daily score.
  - Then COMPLETED GAMES (a list) and EARNED BUDDIES (the 9 buddies, with locked ones dimmed).
- **Friends**: after you finish today's Daily, each friend row expands to show **their 7 answers** with points.
  The backend RPC `friends_daily(p_day)` returns friends' answers only if you've already played that day. I'm writing it.
- **Privacy** (`#/privacy`): plain sections. What stays on your device (localStorage). What reaches our server (Supabase: profile name, avatar,
  scores and answers, friends, rooms). No ads, no tracking, no cookies beyond sign-in. How to delete your account; add a "Delete my account" button that calls RPC `delete_me()`, which I'll add.

### 9.8 Order of work
1. Sonnet: **audit fixes to 0 issues first** (CHAT_LOG 23:20). Then 9.2 → 9.3 → 9.4 → 9.7 → 9.5 → 9.6 UI.
2. Luna: timer 25 s → buddies (9) + charge sprites → `banner-*` (14) → endless log + chapter progress → `src/party.js` → tests.
3. Sol: tier flavour lines → `chapters` + new prompts → `party: true` flag on questions with ≥40 answers (party questions need deep answer pools).
4. Orchestrator: `friends_daily`, `delete_me`, room timer 25 s, then the DEPTH CHARGE backend.
Run `npm run audit:layout` after every UI change. Every new screen must pass it at all six sizes.
