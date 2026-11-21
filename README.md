# Vermillion

---

A free browser trivia game where rare correct answers score more points.

> **Made by Ryan as a vibe-coding experiment.** I'm building and iterating on an original trivia game with AI assistance to explore what I can create this way.

## Play locally

Requires Python 3 and a modern browser. No install or build step is needed.

```sh
./serve.sh
```

Open [localhost:8642](http://localhost:8642). The local server serves the game and its data files; opening `index.html` directly may prevent data loading. Stop the server with Ctrl+C.

## How it works

Each round asks for a correct answer to a prompt. You have a short timer, and less obvious answers earn more points. The game includes a daily challenge, unlimited play, themed topics and archives, duels, and multiplayer modes including DEPTH CHARGE. Results, history, guides, and an FAQ are available in the game. All content and art are original, and the game is free to play.

Solo play works locally. Connected features such as accounts, leaderboards, friends, and live rooms use Supabase and require a network connection. The public browser configuration is in `src/config.js`; never place service keys or database passwords there.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `styles-party.css` | Browser entry point and styles |
| `src/` | Game, interface, matching, scoring, modes, storage, and online modules |
| `data/source/prompts-full.json` | Editable master question and answer bank |
| `data/prompts.json`, `data/answers/` | Generated question metadata and answer shards loaded by the browser |
| `data/packs.json`, `data/guides.json`, `data/faq.json` | Topic definitions and help content |
| `assets/` | Original artwork and self-hosted fonts |
| `supabase/` | Database migrations and server functions for connected play |
| `tests/`, `tools/` | Tests and maintenance scripts |

After editing the full question bank, regenerate and verify the browser files:

```sh
node tools/build-bank.mjs
node tools/build-bank.mjs --check
```

## Testing and development

Node.js is needed for the scripts below. The game itself has no runtime npm dependencies.

```sh
node tests/v3.test.mjs
node tests/party.test.mjs
node tests/party-ui.test.mjs
```

Browser tests are also available at [localhost:8642/tests/](http://localhost:8642/tests/) while the local server runs. `npm install` is only needed for optional developer tooling that uses `puppeteer-core`.

For implementation details and collaboration notes, see [the interface contract](docs/CONTRACT.md), [team rules](TEAM.md), [progress](PROGRESS.md), and [chat log](CHAT_LOG.md).
