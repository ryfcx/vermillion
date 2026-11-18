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
