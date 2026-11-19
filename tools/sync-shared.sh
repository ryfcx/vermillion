#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/src"
DEST="$ROOT/supabase/functions/_shared"
FILES=(matcher.js score.js rng.js modes.js)

for file in "${FILES[@]}"; do
  if [[ ! -f "$SOURCE/$file" ]]; then
    printf 'Missing shared source: %s\n' "$SOURCE/$file" >&2
    exit 1
  fi
done

mkdir -p "$DEST"
for file in "${FILES[@]}"; do
  cp "$SOURCE/$file" "$DEST/$file"
done
printf 'Synced shared scoring modules to %s\n' "$DEST"
