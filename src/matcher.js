/** Normalize player input and bank labels identically. */
export function normalize(str) {
  return String(str ?? '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim().replace(/\s+/g, ' ')
    .replace(/^(?:the|an|a)\s+/, '');
}

// Full Damerau–Levenshtein distance, including adjacent transpositions.
function distance(a, b) {
  const rows = a.length + 2;
  const cols = b.length + 2;
  const d = Array.from({ length: rows }, () => Array(cols).fill(0));
  const max = a.length + b.length;
  d[0][0] = max;
  for (let i = 0; i <= a.length; i++) { d[i + 1][0] = max; d[i + 1][1] = i; }
  for (let j = 0; j <= b.length; j++) { d[0][j + 1] = max; d[1][j + 1] = j; }
  const last = new Map();
  for (let i = 1; i <= a.length; i++) {
    let matchColumn = 0;
    for (let j = 1; j <= b.length; j++) {
      const lastRow = last.get(b[j - 1]) || 0;
      const lastColumn = matchColumn;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      if (!cost) matchColumn = j;
      d[i + 1][j + 1] = Math.min(
        d[i][j] + cost, d[i + 1][j] + 1, d[i][j + 1] + 1,
        d[lastRow][lastColumn] + (i - lastRow - 1) + 1 + (j - lastColumn - 1)
      );
    }
    last.set(a[i - 1], i);
  }
  return d[a.length + 1][b.length + 1];
}

export function matchAnswer(prompt, input) {
  const query = normalize(input);
  if (!query) return { status: 'empty' };
  const entries = (prompt?.answers || []).map(answer => ({
    answer, labels: [answer.name, ...(answer.aliases || [])].map(normalize)
  }));
  const exact = entries.filter(entry => entry.labels.includes(query));
  if (exact.length === 1) return { status: 'match', answer: exact[0].answer, points: exact[0].answer.points };
  if (exact.length > 1) return { status: 'unknown' };
  const tolerance = query.length >= 9 ? 2 : query.length >= 5 ? 1 : 0;
  if (!tolerance) return { status: 'unknown' };
  const fuzzy = entries.filter(entry => entry.labels.some(label =>
    Math.abs(label.length - query.length) <= tolerance &&
    distance(query, label) <= tolerance
  ));
  if (fuzzy.length !== 1) return { status: 'unknown' };
  return { status: 'match', answer: fuzzy[0].answer, points: fuzzy[0].answer.points };
}
