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
| Orchestrator | `claude --continue` | `claude` |
| Sonnet | `claude --continue --model sonnet` | `claude --model sonnet` |
| Codex Sol | `codex resume --last -m gpt-6.1-sol` (pick the Sol session if asked) | `codex -m gpt-6.1-sol` |
| Codex Luna | `codex resume --last -m gpt-6-luna` (pick the Luna session if asked) | `codex -m gpt-6-luna` |

Run every command from `~/Desktop/Vermillion`. If Codex asks to update, choose **Skip**. If it asks to trust the folder, choose **Yes**.

## 3. Get them working again
Tell each agent: *"Read TEAM.md, docs/CONTRACT.md, PROGRESS.md and the end of CHAT_LOG.md, then continue your tasks,
including the 13:55 queued items."*

## Where things stand
- `PROGRESS.md` is the task board, and the bottom of `CHAT_LOG.md` lists the latest requests.
- Queued at restart time: the "One in a Vermillion" top tier, and better autocorrect ("Did you mean…?").
