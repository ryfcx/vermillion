#!/bin/sh
# Upload data/source/prompts-full.json (the full master; data/prompts.json is metadata only) to the server-side question bank (Supabase table prompt_bank).
# Run after any change to data/prompts.json. Needs .seed-secret (gitignored; ask the orchestrator).
cd "$(dirname "$0")/.." || exit 1
[ -f .seed-secret ] || { echo "missing .seed-secret"; exit 1; }
curl -sS -X POST "https://bethbacmhbwinjsxhkvl.supabase.co/functions/v1/admin-seed" \
  -H "content-type: application/json" -H "x-seed-secret: $(cat .seed-secret)" \
  --data-binary @data/source/prompts-full.json
echo
