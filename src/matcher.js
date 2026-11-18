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

// These are spelling corrections, not alternative answers. All candidates still
// compete against every other answer in the prompt before a correction is used.
const MISSPELLINGS = new Map(Object.entries({
  definately: 'definitely', seperately: 'separately', seperate: 'separate',
  accomodate: 'accommodate', accomodation: 'accommodation', acheive: 'achieve',
  acheivement: 'achievement', recieve: 'receive', recieved: 'received',
  wierd: 'weird', thier: 'their', tommorow: 'tomorrow', tommorrow: 'tomorrow',
  begining: 'beginning', untill: 'until', neccessary: 'necessary',
  occassion: 'occasion', occurence: 'occurrence', embarass: 'embarrass',
  embarras: 'embarrass', millenium: 'millennium', priviledge: 'privilege',
  concious: 'conscious', enviroment: 'environment', goverment: 'government',
  independant: 'independent', maintainance: 'maintenance', pronounciation: 'pronunciation',
  restaraunt: 'restaurant', restraunt: 'restaurant', rythym: 'rhythm', rythm: 'rhythm',
  cemetary: 'cemetery', calender: 'calendar', lisence: 'license', liason: 'liaison',
  vaccum: 'vacuum', vaccuum: 'vacuum', brocolli: 'broccoli', brocoli: 'broccoli',
  zuchini: 'zucchini', zuccini: 'zucchini', spagetti: 'spaghetti',
  mozarella: 'mozzarella', mozzerella: 'mozzarella', capuccino: 'cappuccino',
  expresso: 'espresso', cinammon: 'cinnamon', cinnimon: 'cinnamon',
  massachussets: 'massachusetts', massachussetts: 'massachusetts',
  conneticut: 'connecticut', connecticutt: 'connecticut',
  pennsylvannia: 'pennsylvania', philidelphia: 'philadelphia',
  cincinatti: 'cincinnati', cincinnatti: 'cincinnati',
  kyrgystan: 'kyrgyzstan', kyrgizstan: 'kyrgyzstan',
  afganistan: 'afghanistan', kazakstan: 'kazakhstan',
  azerbijan: 'azerbaijan', mozambiqe: 'mozambique',
  beethovan: 'beethoven', einstien: 'einstein',
  tchaikovski: 'tchaikovsky', tchaikovskiy: 'tchaikovsky',
  schwartzenegger: 'schwarzenegger', shakespear: 'shakespeare',
  michealangelo: 'michelangelo', michelangello: 'michelangelo',
  bournmouth: 'bournemouth', worcestor: 'worcester'
}));

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const NUMBER_VALUES = new Map([...SMALL.map((word, i) => [word, i]), ...TENS.slice(2).map((word, i) => [word, (i + 2) * 10])]);
const SCALES = new Map([['thousand', 1000], ['million', 1000000], ['billion', 1000000000]]);

function numberWords(n) {
  if (n < 20) return SMALL[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + SMALL[n % 10] : '');
  if (n < 1000) return SMALL[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberWords(n % 100) : '');
  for (const [word, scale] of [...SCALES].reverse()) {
    if (n >= scale) return numberWords(Math.floor(n / scale)) + ' ' + word + (n % scale ? ' ' + numberWords(n % scale) : '');
  }
}

function parseNumber(words) {
  const clean = words.filter(word => word !== 'and');
  if (!clean.length || words[0] === 'and' || words.at(-1) === 'and') return null;
  let total = 0, group = 0;
  for (const word of clean) {
    if (NUMBER_VALUES.has(word)) group += NUMBER_VALUES.get(word);
    else if (word === 'hundred') group *= 100;
    else if (SCALES.has(word)) { total += group * SCALES.get(word); group = 0; }
    else return null;
  }
  const n = total + group;
  // Round-tripping rejects malformed number strings such as "two three".
  return n <= 999999999999 && numberWords(n) === clean.join(' ') ? String(n) : null;
}

function foldNumbers(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length;) {
    let end = i;
    while (end < tokens.length && (NUMBER_VALUES.has(tokens[end]) || SCALES.has(tokens[end]) || tokens[end] === 'hundred' || tokens[end] === 'and')) end++;
    let value = null, consumed = i;
    for (let j = end; j > i; j--) {
      value = parseNumber(tokens.slice(i, j));
      if (value !== null) { consumed = j; break; }
    }
    if (value !== null) { out.push(value); i = consumed; }
    else { out.push(tokens[i]); i++; }
  }
  return out;
}

function semantic(str) {
  const expanded = String(str ?? '').replace(/&/g, ' and ')
    .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').replace(/ø/gi, 'o')
    .replace(/ł/gi, 'l').replace(/ß/g, 'ss');
  return foldNumbers(normalize(expanded).split(' ').map(word => word === 'st' ? 'saint' : word)).join(' ');
}

const IRREGULAR = new Map(Object.entries({
  mice: 'mouse', geese: 'goose', men: 'man', women: 'woman', children: 'child',
  feet: 'foot', teeth: 'tooth', oxen: 'ox', people: 'person', leaves: 'leaf',
  knives: 'knife', wives: 'wife', wolves: 'wolf', calves: 'calf', halves: 'half',
  loaves: 'loaf', shelves: 'shelf', lives: 'life', buses: 'bus', atlases: 'atlas',
  analyses: 'analysis', crises: 'crisis', theses: 'thesis', fishes: 'fish'
}));
const SINGULAR_BASES = new Set(IRREGULAR.values());
function singular(word) {
  if (SINGULAR_BASES.has(word)) return word;
  if (IRREGULAR.has(word)) return IRREGULAR.get(word);
  if (/^(?:series|species|news)$/.test(word)) return word;
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (/(?:ches|shes|xes|zes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}
function forms(key) {
  const words = key.split(' ');
  const stems = words.map(singular);
  return {
    key,
    compact: words.join(''),
    ordered: [...words].sort().join(' '),
    stems: stems.join(' '),
    stemOrder: [...stems].sort().join(' ')
  };
}
function equivalent(a, b) {
  return a.key === b.key || (a.compact === b.compact && !/\d\s+\d/.test(a.key) && !/\d\s+\d/.test(b.key)) || a.ordered === b.ordered ||
    a.stems === b.stems || a.stemOrder === b.stemOrder;
}

// A deliberately small, original Metaphone-style consonant key. Phonetic
// equality only suggests an answer; it never silently accepts a sound-alike.
function phonetic(key) {
  return key.split(' ').map(word => {
    if (/^\d+$/.test(word)) return word;
    let s = word.replace(/^(?:kn|gn|pn)/, 'n').replace(/^wr/, 'r')
      .replace(/^x/, 's').replace(/^ch(?=r|em|or)/, 'k').replace(/ph/g, 'f').replace(/tch/g, 'ch')
      .replace(/sch/g, 'sk').replace(/sh|ch/g, 'X').replace(/th/g, '0')
      .replace(/dg(?=[eiy])/g, 'j').replace(/c(?=[eiy])/g, 's')
      .replace(/ck|qu/g, 'k').replace(/[cq]/g, 'k').replace(/v/g, 'f')
      .replace(/z/g, 's').replace(/gh(?=t|$)/g, '').replace(/(.)\1+/g, '$1');
    s = s[0] + s.slice(1).replace(/[aeiouy]/g, '');
    return s;
  }).join(' ');
}

const KEYS = new Map();
['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].forEach((row, y) => {
  [...row].forEach((letter, x) => KEYS.set(letter, [x + [0, .25, .75][y], y]));
});
function keyboardTypos(a, b) {
  if (a.length !== b.length) return false;
  let changes = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const p = KEYS.get(a[i]), q = KEYS.get(b[i]);
    if (!p || !q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1.3 || ++changes > 2) return false;
  }
  return changes > 0;
}

export function matchAnswer(prompt, input) {
  const original = String(input ?? '');
  const exactQuery = normalize(original);
  const query = exactQuery || (original.includes('&') ? semantic(original) : '');
  if (!query) return { status: 'empty' };
  if (query.length > 512) return { status: 'unknown' };
  const entries = (prompt?.answers || []).map(answer => ({
    answer, labels: [answer.name, ...(answer.aliases || [])]
  }));
  const exact = entries.filter(entry => exactQuery && entry.labels.some(label => normalize(label) === exactQuery));
  if (exact.length === 1) return { status: 'match', answer: exact[0].answer, points: exact[0].answer.points };
  if (exact.length > 1) return { status: 'unknown' };

  const key = semantic(original);
  const inputForms = forms(key);
  const rawForms = forms(query);
  const fixedForms = forms(semantic(normalize(original).split(' ').map(word => MISSPELLINGS.get(word) || word).join(' ')));
  const sound = phonetic(key);
  const tolerance = query.length >= 9 ? 2 : query.length >= 5 ? 1 : 0;
  const candidates = [];
  for (const entry of entries) {
    let confidence = 0;
    for (const label of entry.labels) {
      const normal = normalize(label);
      const otherKey = semantic(label);
      const other = forms(otherKey);
      if (equivalent(rawForms, forms(normal)) || equivalent(inputForms, other) || equivalent(fixedForms, other)) confidence = 2;
      if (tolerance && Math.abs(normal.length - query.length) <= tolerance && distance(query, normal) <= tolerance) confidence = 2;
      if (tolerance && key.includes(' ') && key.split(' ').length === otherKey.split(' ').length &&
          Math.abs(inputForms.ordered.length - other.ordered.length) <= tolerance &&
          distance(inputForms.ordered, other.ordered) <= tolerance) confidence = 2;
      if (!confidence && key.length >= 3 && keyboardTypos(key, otherKey)) confidence = 1;
      const compact = inputForms.compact;
      if (!confidence && compact.length >= 5 && compact.length >= other.compact.length * .7 && other.compact.startsWith(compact)) confidence = 1;
      const maxEdits = Math.min(6, Math.max(3, Math.ceil(Math.max(key.length, otherKey.length) * .75)));
      if (!confidence && key.length >= 4 && otherKey.length >= 4 && sound.replace(/ /g, '').length >= 2 &&
          Math.abs(key.length - otherKey.length) <= maxEdits && sound === phonetic(otherKey) &&
          distance(key, otherKey) <= maxEdits) confidence = 1;
    }
    if (confidence) candidates.push({ answer: entry.answer, confidence });
  }
  // Do not rank competing answers by score, edit distance, alias order or tier.
  if (candidates.length !== 1) return { status: 'unknown' };
  const { answer, confidence } = candidates[0];
  return confidence === 2
    ? { status: 'match', answer, points: answer.points, corrected: true, input: original }
    : { status: 'suggest', answer, points: answer.points, input: original };
}
