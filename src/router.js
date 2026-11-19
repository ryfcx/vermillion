// Vermillion — tiny hash router. Pure parsing + a thin hashchange wrapper.
//
// Routes:
//   #/                       home
//   #/play/daily             #/play/endless          #/play/duel
//   #/play/pack/<id>[/<day>] pack daily (today) or an archive day (YYYY-MM-DD) or "practice"
//   #/packs                  #/archive/<packId|daily>
//   #/account  #/leaderboard  #/friends  #/online  #/room/<CODE>
//   #/stats  #/history  #/how-to-play  #/guides  #/guides/<slug>  #/faq  #/about

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRoute(hash) {
  if (/^#?(access_token|refresh_token|error|error_description|type)=/.test(String(hash || ''))) return { name: 'home' };   // magic-link return
  const raw = String(hash || '').replace(/^#/, '').split('?')[0];
  const parts = raw.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const [a, b, c, d] = parts;
  switch (a) {
    case undefined: return { name: 'home' };
    case 'play':
      if (b === 'daily' || b === 'endless' || b === 'duel') {
        return { name: 'play', mode: b, packId: null, dayKey: DAY_RE.test(c || '') ? c : null, practice: c === 'practice' };
      }
      if (b === 'pack' && c) {
        return { name: 'play', mode: 'pack', packId: c, dayKey: DAY_RE.test(d || '') ? d : null, practice: d === 'practice' };
      }
      return { name: 'notfound' };
    case 'packs': return { name: 'packs' };
    case 'archive': return b ? { name: 'archive', target: b } : { name: 'archive', target: 'daily' };
    case 'stats': return { name: 'stats' };
    case 'history': return { name: 'history' };
    case 'how-to-play': return { name: 'how' };
    case 'guides': return b ? { name: 'guide', slug: b } : { name: 'guides' };
    case 'faq': return { name: 'faq' };
    case 'account': return { name: 'account' };
    case 'leaderboard': return { name: 'leaderboard' };
    case 'friends': return { name: 'friends' };
    case 'online': return { name: 'online' };
    case 'room': return /^[A-Za-z]{5}$/.test(b || '') ? { name: 'room', code: b.toUpperCase() } : { name: 'notfound' };
    case 'party': return !b ? { name: 'party', code: null } : /^[A-Za-z]{4}$/.test(b) ? { name: 'party', code: b.toUpperCase() } : { name: 'notfound' };
    case 'about': return { name: 'about' };
    default: return { name: 'notfound' };
  }
}

/** Build a hash href for a route description. */
export const href = {
  home: () => '#/',
  daily: (day) => `#/play/daily${day ? `/${day}` : ''}`,
  dailyPractice: () => '#/play/daily/practice',
  endless: () => '#/play/endless',
  duel: () => '#/play/duel',
  pack: (id, day) => `#/play/pack/${encodeURIComponent(id)}${day ? `/${day}` : ''}`,
  packPractice: (id) => `#/play/pack/${encodeURIComponent(id)}/practice`,
  packs: () => '#/packs',
  archive: (target = 'daily') => `#/archive/${encodeURIComponent(target)}`,
  stats: () => '#/stats',
  history: () => '#/history',
  how: () => '#/how-to-play',
  guides: () => '#/guides',
  guide: (slug) => `#/guides/${encodeURIComponent(slug)}`,
  faq: () => '#/faq',
  about: () => '#/about',
  account: () => '#/account',
  leaderboard: () => '#/leaderboard',
  friends: () => '#/friends',
  online: () => '#/online',
  party: (code) => (code ? `#/party/${String(code).toUpperCase()}` : '#/party'),
  room: (code) => `#/room/${encodeURIComponent(String(code).toUpperCase())}`,
};

export function createRouter(onRoute) {
  let current = null;
  const handle = () => {
    current = parseRoute(location.hash);
    onRoute(current);
  };
  window.addEventListener('hashchange', handle);
  return {
    start: handle,
    reload: handle,
    get current() { return current; },
    go(h, { replace = false } = {}) {
      if (location.hash === h || (h === '#/' && !location.hash)) { handle(); return; }
      if (replace) { history.replaceState(null, '', h); handle(); } else location.hash = h;
    },
  };
}
