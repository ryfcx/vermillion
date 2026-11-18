# Vermillion — Team Rules (READ FIRST, every agent)

Vermillion is an original browser trivia game where you score by picking **rare but correct** answers.
The gameplay is inspired by krillion.org, but all names, prompts, answers, art, and copy must be **our own**.
Do not copy Krillion's text, prompts, or answer data.

## The team
| Agent | Window | Lane (files you own) |
|---|---|---|
| **Orchestrator** (Claude Opus) | main | TEAM.md, docs/CONTRACT.md, PROGRESS.md structure, integration, review |
| **Sonnet** (Claude Sonnet) | "Sonnet" | `index.html`, `styles.css`, `src/game.js`, `src/ui.js`, `src/main.js`, `src/router.js`, `src/displays.js`, `src/scene.js` |
| **Sol** (Codex GPT-6.1-Sol) | "Codex Sol" | `data/prompts.json`, `data/packs.json`, `src/content.js`, `src/matcher.js` |
| **Luna** (Codex GPT-6-Luna) | "Codex Luna" | `src/rng.js`, `src/modes.js`, `src/storage.js`, `src/share.js`, `src/sprites.js`, `src/sfx.js`, `assets/`, `tools/`, `data/guides.json`, `data/faq.json`, `tests/` |

## Rules
1. **Stay in your lane.** Only edit files you own. If you need a change in someone else's file, ask in `CHAT_LOG.md`.
2. **The contract is law.** `docs/CONTRACT.md` defines every shared module API and data shape. Code to it exactly.
   If it must change, propose the change in `CHAT_LOG.md` and tag `@Orchestrator`. Don't change it yourself.
3. **Log your progress.** When you start or finish a task, or get blocked, update your section of `PROGRESS.md`.
4. **Talk in CHAT_LOG.md.** Append only. Never edit or delete other entries. Format:
   `### [YYYY-MM-DD HH:MM] Name → Recipient` followed by the message.
5. **No build step.** Plain HTML, CSS, and vanilla JS ES modules. No npm dependencies, frameworks, or CDNs at runtime.
   The only downloaded files allowed are the OFL fonts Press Start 2P and VT323, self-hosted in `assets/fonts/`. All art and sound must be original.
   The game is 100% free: no ads, paywalls, accounts, or locked content.
6. **Run it:** `./serve.sh`, then open http://localhost:8642.
7. **Don't git commit.** The orchestrator makes checkpoints. Don't run destructive git commands.
8. If your module depends on one that isn't written yet, code against the contract and stub it locally if needed.
   Never overwrite the real file.
9. When your lane's tasks are done, post in CHAT_LOG.md and wait for review.
