# Restarting the Vermillion team

Everything lives in this folder and is committed to git. Nothing important lives only in memory.

## 1. Start the game
```sh
cd ~/Desktop/Vermillion && ./serve.sh
```
Then open http://localhost:8642 (tests: http://localhost:8642/tests/).

## 2. Reopen the agents (each one in its own cmux window)
| Window | Command (resumes the previous conversation) | Fresh start instead |
|---|---|---|
| 1 · Orchestrator (Claude Opus) | `claude --continue` | `claude` |
| 2 · Sonnet: UI & game loop | `claude --resume f2873160-74ef-4ab7-ab1b-ed3aa13945a5 --model sonnet` | `claude --model sonnet` |
| Vermillion: Sol | `codex resume --last -m gpt-6.1-sol` (pick "Vermillion: Sol") | `codex -m gpt-6.1-sol` |

Run every command from `~/Desktop/Vermillion`. If Codex asks to update, choose **Skip**. If it asks to trust the folder, choose **Yes**.

## 3. Get them working again
Tell each agent: *"Read TEAM.md, docs/CONTRACT.md, PROGRESS.md and the end of CHAT_LOG.md, then continue your tasks,
including the 13:55 queued items."*

## Where things stand
- `PROGRESS.md` is the task board, and the bottom of `CHAT_LOG.md` lists the latest requests.
- Queued at restart time: the "One in a Vermillion" top tier, and better autocorrect ("Did you mean…?").


## ⏸ Paused on 2026-11-19 (user request)
All agents are stopped and their windows closed. Luna is retired, so only **Sonnet** and **Vermillion: Sol** need reopening. Everything is committed and pushed.
**Live now:** Supabase backend (accounts, live rooms, DEPTH CHARGE, leaderboards, friends, answer-review), 761 questions with answers in `data/answers/<id>.json`
(the master is `data/source/prompts-full.json`, edited via `tools/build-bank.mjs`), calm Krillion-style UI, persistent scene, layout audit at 0 issues.
**Next steps when resuming:**
1. **Groq:** the key in `.env` started returning 403 "Access denied". Check VPN/network, or make a new key at console.groq.com, then rerun
   `node tools/groq-expand.mjs --all --concurrency 1` (resumable). For the live review, add `GROQ_API_KEY` in Supabase → Edge Functions → Secrets.
2. **Merge reviewed expansions:** Sol reviewed 4 files (`reviewed: true`). Update `tools/groq-expand.mjs --apply` to write into
   `data/source/prompts-full.json`, then run `tools/build-bank.mjs` and `tools/seed-bank.sh`.
3. Cleanup: one test guest plus one `answer_candidates` row from the 13:25 live test (user id 73920f39…). Delete when convenient.
4. Optional: host it publicly (GitHub Pages, Netlify or Cloudflare Pages), and add that URL to Supabase Auth → URL Configuration.
