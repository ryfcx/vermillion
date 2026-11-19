/** DEPTH CHARGE presentation. All answers, turns, hearts and ratings belong to the server. */
const BUDDIES = [
  ['vermi', 'VERMI', 0], ['guppy', 'GUPPY', 5], ['seahorse', 'SEAHORSE', 14],
  ['octopus', 'OCTOPUS', 30], ['lanternfish', 'LANTERNFISH', 45], ['narwhal', 'NARWHAL', 60],
  ['nautilus', 'NAUTILUS', 75], ['kraken', 'KRAKEN', 100], ['abyss-king', 'ABYSS KING', 150],
];
const SIZES = [['1v1', '1V1', 2], ['3s', '3S', 3], ['4-6', '4–6', 6], ['8-10', '8–10', 10]];
let mounted = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const rowOf = data => Array.isArray(data) ? data[0] : data;
const timeOf = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const activePlayers = state => (state?.players || []).filter(p => !p.left_at);
const avatarOf = value => BUDDIES.some(([id]) => `buddy-${id}` === value) ? value : 'buddy-vermi';

export function unmountParty() {
  mounted?.destroy();
  mounted = null;
}

/** Returns {ready, destroy}; callers may ignore ready, which always settles without throwing. */
export function mountParty(host, deps) {
  unmountParty();
  if (!host?.replaceChildren) throw new TypeError('mountParty requires a DOM host.');
  const { party, online, sprites = {}, sfx = {}, bank, navigate = () => {}, settings = {} } = deps;
  const root = el('section', 'dc-root');
  root.setAttribute('aria-label', 'Depth charge');
  root.dataset.reducedMotion = String(Boolean(settings.reducedMotion));
  const screen = el('div', 'dc-screen');
  const message = el('p', 'dc-message');
  message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  root.append(screen, message); host.replaceChildren(root);
  let alive = true, user = null, profile = null, streak = 0, state = null, view = '', roomId = null;
  let size = '4-6', rated = false, isPublic = true, pending = false, answering = false, tickBusy = false, refreshBusy = false;
  let unsubscribe = null, authOff = null, motionObserver = null, publicBusy = false, publicList = [], publicError = '', roomError = '';
  let profileInput, roomsList, roomsCount, statusNode, game, waitingNode, startButton, charge, ring;
  let frame = 0, lastClock = 0, boomUntil = 0, boomUser = null, lastEvent = 0, initialEvents = true;
  let countdown = 0, modal = null, priorFocus = null, selectedAvatar = 'buddy-vermi';
  const playerNodes = new Map(), timers = new Set();
  const code = String(deps.code || globalThis.location?.hash?.match(/^#\/party\/([a-z]{4})/i)?.[1] || '').toUpperCase();

  function say(text = '', error = false) {
    if (!alive) return;
    message.textContent = text; message.classList.toggle('dc-error', error);
  }
  // The shared synthesizer owns live mute/volume settings, including toolbar changes.
  function sound(name) { try { sfx.play?.(name); } catch {} }
  function sprite(name, pixels = 44, frameIndex = 0) {
    const img = el('img', 'dc-sprite'); img.alt = ''; img.width = pixels; img.height = pixels;
    img.setAttribute('aria-hidden', 'true');
    try { img.src = sprites.spriteDataURL?.(name, 4, frameIndex) || ''; } catch { img.removeAttribute('src'); }
    return img;
  }
  function button(text, action, className = '') {
    const b = el('button', `dc-button ${className}`, text); b.type = 'button';
    b.addEventListener('click', action); return b;
  }
  function heading(text, extra) {
    const h = el('div', 'dc-panel-heading'); h.append(el('h2', '', text));
    if (extra) h.append(extra); h.append(el('span', 'dc-rule')); return h;
  }
  function title(compact = false) {
    const block = el('header', `dc-title${compact ? ' dc-title-small' : ''}`);
    block.append(el('div', 'dc-wordmark', 'VERMILLION'), el('h1', '', 'DEPTH CHARGE'));
    if (!compact) block.append(el('p', 'dc-subline', 'pass the charge · don’t let it blow on you'),
      el('p', 'dc-description', 'Keep the charge moving with a fresh answer. Play with friends or find a public room. The last player with a heart wins.'));
    return block;
  }
  function changeView(name) {
    if (!alive) return;
    closeRules(); view = name; root.dataset.view = name; screen.replaceChildren();
    game = null; charge = null; ring = null; playerNodes.clear();
  }
  async function request(fn) {
    try { return await fn(); } catch (error) { return { ok: false, error: error?.message || 'Connection lost. Please try again.' }; }
  }
  function setBusy(value) {
    pending = value; root.setAttribute('aria-busy', String(value));
    root.querySelectorAll('[data-room-action]').forEach(b => { b.disabled = value || b.dataset.unavailable === 'true'; });
  }
  function remember(room) {
    try { sessionStorage.setItem(`vermillion:party:${room.code.toUpperCase()}`, room.id); } catch { /* storage is optional */ }
  }
  async function saveName() {
    const name = profileInput?.value.trim();
    if (!name || name === profile?.username) return true;
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) { say('Use 3–16 letters, numbers or underscores for your name.', true); profileInput?.focus(); return false; }
    const r = await request(() => online.updateProfile({ username: name }));
    if (!alive) return false;
    if (!r.ok) { say(r.error || 'Could not save your name.', true); return false; }
    profile = { ...profile, ...(r.data || {}), username: name }; say('Name saved.'); return true;
  }
  async function enterRoom(room) {
    if (!alive || !room?.id) { if (alive) say('That room is unavailable. Try again.', true); return; }
    unsubscribe?.(); unsubscribe = null; state = null; roomId = room.id; lastEvent = 0; initialEvents = true; roomError = '';
    remember(room); say();
    changeView('loading'); screen.append(title(true), el('p', 'dc-empty', 'Joining the room…'));
    const r = await request(() => party.getRoomState(room.id));
    if (!alive || roomId !== room.id) return;
    if (!r.ok) { roomError = r.error; showRoomError(); return; }
    consume(r);
    unsubscribe = party.subscribe(room.id, result => { if (alive && roomId === room.id) consume(result); });
    const target = `#/party/${room.code.toUpperCase()}`;
    if (globalThis.location?.hash !== target) navigate(target);
  }
  async function roomAction(fn, needsName = true) {
    if (pending) return;
    setBusy(true); say();
    try {
      if (needsName && !await saveName()) return;
      const r = await request(fn); if (!alive) return;
      if (!r.ok) { say(r.error || 'Could not join the room.', true); return; }
      await enterRoom(rowOf(r.data));
    } finally { if (alive) setBusy(false); }
  }
  function roomButton(text, fn, className = '') {
    const b = button(text, () => roomAction(fn), className); b.dataset.roomAction = ''; return b;
  }
  async function refreshPublic() {
    if (!alive || !user || roomId || publicBusy) return;
    publicBusy = true;
    const r = await request(() => party.publicRooms(50)); publicBusy = false;
    if (!alive || roomId) return;
    if (r.ok) { publicList = Array.isArray(r.data) ? r.data : []; publicError = ''; }
    else publicError = r.error || 'Could not load public rooms.';
    paintPublic();
  }
  function paintPublic() {
    if (view !== 'home' || !roomsList) return;
    const focusedCode = [...roomsList.querySelectorAll('button')].find(b => b === document.activeElement)?.dataset.code;
    roomsList.replaceChildren(); roomsCount.textContent = `SHOWING ${publicList.length}`;
    if (publicError) roomsList.append(el('p', 'dc-empty', publicError), button('RETRY', refreshPublic));
    if (!publicList.length && !publicError) roomsList.append(el('p', 'dc-empty', 'No public rooms yet. Host one, or try Quick Play.'));
    for (const room of publicList) {
      const full = Number(room.players) >= Number(room.size_max);
      const playing = room.status !== 'lobby';
      const b = roomButton('', () => party.joinRoom(room.code), 'dc-public-room');
      b.dataset.code = String(room.code);
      b.dataset.unavailable = String(full || playing); b.disabled = pending || full || playing;
      b.append(el('span', 'dc-room-code', String(room.code).toUpperCase()));
      const info = el('span', 'dc-room-info');
      info.append(el('span', 'dc-room-name', room.host_name || 'Diver'), el('small', '', `${room.players}/${room.size_max} · ${playing ? 'PLAYING' : 'IN THE LOBBY'}`));
      b.append(info, el('span', 'dc-room-go', full ? 'FULL' : playing ? 'PLAYING' : 'JOIN ▸'));
      b.setAttribute('aria-label', `${room.code}, ${room.host_name || 'Diver'}, ${room.players} of ${room.size_max} players, ${full ? 'full' : playing ? 'game in progress' : 'join room'}`);
      roomsList.append(b);
      if (focusedCode === b.dataset.code && !b.disabled) b.focus({ preventScroll: true });
    }
  }
  function showHome() {
    changeView('home'); screen.append(title());
    const layout = el('div', 'dc-home-grid'), left = el('div', 'dc-left-column');
    const who = el('section', 'dc-panel dc-who');
    who.append(heading('WHO’S PLAYING', button('HOW TO PLAY', showRules, 'dc-link dc-howto')));
    const field = el('label', 'dc-field'); field.append(el('span', '', 'YOUR NAME'));
    profileInput = el('input', 'dc-input'); profileInput.type = 'text'; profileInput.maxLength = 16; profileInput.value = profile?.username || '';
    profileInput.placeholder = 'what the room calls you'; profileInput.autocomplete = 'nickname'; profileInput.setAttribute('aria-describedby', 'dc-name-help');
    profileInput.addEventListener('change', saveName); field.append(profileInput); who.append(field);
    const grid = el('div', 'dc-buddy-grid'); grid.setAttribute('aria-label', 'Choose your buddy');
    for (const [id, name, days] of BUDDIES) {
      const locked = streak < days, avatar = `buddy-${id}`;
      const b = button('', async () => {
        if (locked || pending) return;
        setBusy(true);
        const r = await request(() => online.updateProfile({ avatar }));
        if (alive) {
          setBusy(false);
          if (r.ok) { selectedAvatar = avatar; profile = { ...profile, avatar }; grid.querySelectorAll('button').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.avatar === avatar))); say('Buddy saved.'); }
          else say(r.error || 'Could not save your buddy.', true);
        }
      }, 'dc-buddy');
      b.disabled = locked; b.dataset.avatar = avatar; b.setAttribute('aria-pressed', String(selectedAvatar === avatar));
      b.setAttribute('aria-label', `${name}${locked ? `, locked until a ${days}-day best Daily streak` : ', select buddy'}`);
      b.title = locked ? `Unlock with a ${days}-day best Daily streak` : name;
      b.append(sprite(avatar), el('span', 'dc-buddy-name', name), el('small', '', days ? `${days}-day` : 'start'));
      if (locked) b.classList.add('dc-locked'); grid.append(b);
    }
    who.append(grid); const nameHelp = el('span', 'dc-sr-only', '3–16 letters, numbers or underscores. Buddies unlock with your best Daily streak.'); nameHelp.id = 'dc-name-help'; who.append(nameHelp);
    left.append(who);
    const play = el('section', 'dc-panel dc-play-now'); play.append(heading('PLAY NOW'));
    const tabs = el('div', 'dc-sizes'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Room size');
    const sizeHint = el('p', 'dc-size-hint');
    function updateSize() { tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === size))); sizeHint.textContent = size === '1v1' ? '2 players · head to head' : size === '3s' ? '3 players' : size === '8-10' ? '8 to 10 players' : '4 to 6 players'; }
    for (const [id, label] of SIZES) { const b = button(label, () => { size = id; updateSize(); }, 'dc-size'); b.dataset.size = id; tabs.append(b); }
    updateSize(); play.append(tabs, sizeHint);
    const quick = el('div', 'dc-quick-actions');
    for (const [isRated, label, hint] of [[true, '▶ RATED ◀', 'near your rating · it moves'], [false, 'QUICK PLAY', 'unrated · just for fun']]) {
      const group = el('div'); group.append(roomButton(label, () => { rated = isRated; return party.quickPlay({ size, rated }); }, 'dc-primary'), el('small', 'dc-action-hint', hint)); quick.append(group);
    }
    play.append(quick); left.append(play);
    const hostPanel = el('section', 'dc-panel'); hostPanel.append(heading('HOST'));
    const toggle = button('', () => { isPublic = !isPublic; setPublic(); }, 'dc-public-toggle');
    function setPublic() { toggle.textContent = isPublic ? 'PUBLIC · LISTED' : 'PRIVATE · LINK ONLY'; toggle.setAttribute('aria-pressed', String(isPublic)); }
    setPublic(); hostPanel.append(toggle, roomButton('▼ HOST A ROOM ▼', () => { rated = false; return party.createRoom({ isPublic, sizeMax: SIZES.find(x => x[0] === size)[2] }); }, 'dc-primary dc-full'));
    left.append(hostPanel);
    const join = el('form', 'dc-panel'); join.append(heading('JOIN BY CODE'));
    const joinRow = el('div', 'dc-join-row'), input = el('input', 'dc-input dc-code-input');
    input.placeholder = 'ABCD'; input.maxLength = 4; input.pattern = '[A-Za-z]{4}'; input.required = true; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', 'Four-letter room code');
    input.addEventListener('input', () => { input.value = input.value.replace(/[^a-z]/gi, '').toUpperCase(); });
    const submit = el('button', 'dc-button', 'JOIN'); submit.type = 'submit'; submit.dataset.roomAction = '';
    join.addEventListener('submit', e => { e.preventDefault(); if (input.reportValidity()) roomAction(() => party.joinRoom(input.value)); });
    joinRow.append(input, submit); join.append(joinRow); left.append(join);
    const right = el('section', 'dc-panel dc-public-panel'); roomsCount = el('small', 'dc-count', `SHOWING ${publicList.length}`); right.append(heading('PUBLIC ROOMS', roomsCount)); roomsList = el('div', 'dc-room-list'); right.append(roomsList);
    const idle = el('div', 'dc-idle-charge'); idle.setAttribute('aria-hidden', 'true'); idle.append(sprite('charge-idle', 144), el('span', 'dc-sleep', 'z z'));
    layout.append(left, idle, right); screen.append(layout); paintPublic(); refreshPublic();
  }
  function showRules() {
    if (modal) return;
    priorFocus = document.activeElement; modal = el('dialog', 'dc-dialog');
    modal.setAttribute('aria-labelledby', 'dc-rules-title');
    const eyebrow = el('p', 'dc-eyebrow', 'DEPTH CHARGE'), h = el('h2', 'dc-dialog-title', 'HOW TO PLAY'); h.id = 'dc-rules-title';
    const close = button('×', closeRules, 'dc-dialog-close'); close.setAttribute('aria-label', 'Close rules');
    const rules = el('ol', 'dc-rules');
    for (const text of ['Give a correct answer to pass the charge. If it blows while you hold it, you lose a heart.', 'Build up 100 rarity points for an extra heart, up to three. Keep your last heart to stay in.', 'Use a fresh answer each turn. Once an answer is said, nobody can use it again for that question.']) rules.append(el('li', '', text));
    modal.append(eyebrow, h, close, rules, button('GOT IT', closeRules)); root.append(modal);
    modal.addEventListener('click', e => { if (e.target === modal) { const r = modal.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeRules(); } });
    modal.addEventListener('cancel', e => { e.preventDefault(); closeRules(); }); modal.showModal(); close.focus();
  }
  function closeRules() { if (!modal) return; modal.close(); modal.remove(); modal = null; priorFocus?.focus?.(); }
  async function leave() {
    if (pending) return;
    setBusy(true); const id = roomId; const r = await request(() => party.leaveRoom(id));
    if (!alive) return; setBusy(false);
    if (!r.ok) { say(r.error || 'Could not leave the room. Try again.', true); return; }
    unsubscribe?.(); unsubscribe = null; roomId = null; state = null; say(); showHome(); navigate('#/party');
  }
  function leaveButton() { const b = button('LEAVE ROOM', leave, 'dc-link'); b.dataset.roomAction = ''; return b; }
  function roomHeader() {
    const header = el('div', 'dc-room-header');
    const label = el('span', 'dc-eyebrow', `${state.room.rated ? 'RATED' : 'JUST FOR FUN'} · ${state.room.code}`);
    header.append(label, leaveButton()); return header;
  }
  function showRoomError() {
    changeView('error'); screen.append(title(true), el('p', 'dc-empty', roomError || 'Room unavailable.'), button('RECONNECT', () => refreshRoom()), button('LOBBY', () => { roomId = null; showHome(); navigate('#/party'); }));
  }
  function showWaiting() {
    changeView('waiting'); screen.append(title(true), roomHeader());
    const panel = el('section', 'dc-panel dc-waiting'); panel.append(heading('YOUR ROOM'));
    const codeNode = el('p', 'dc-invite-code', state.room.code); panel.append(codeNode);
    const copy = button('COPY ROOM LINK', async () => {
      const link = `${location.origin}${location.pathname}#/party/${state.room.code}`;
      try { await navigator.clipboard.writeText(link); say('Room link copied.'); } catch { say(`Share this link: ${link}`); }
    }); panel.append(copy);
    const list = el('ul', 'dc-waiting-players'); list.dataset.players = ''; panel.append(list);
    waitingNode = el('p', 'dc-waiting-status'); waitingNode.setAttribute('role', 'status'); panel.append(waitingNode);
    startButton = button('▼ START ▼', async () => {
      if (pending) return; setBusy(true); const r = await request(() => party.startRoom(roomId));
      if (alive) { setBusy(false); if (!r.ok) say(r.error || 'Could not start.', true); else await refreshRoom(); }
    }, 'dc-primary dc-full'); startButton.dataset.roomAction = ''; panel.append(startButton);
    screen.append(panel); updateWaiting();
  }
  function updateWaiting() {
    const players = activePlayers(state), list = screen.querySelector('[data-players]'); list.replaceChildren();
    for (const p of players) { const li = el('li'); li.append(sprite(avatarOf(p.avatar), 40), el('span', '', p.username), el('small', '', p.user_id === state.room.host_id ? 'HOST' : p.user_id === user.id ? 'YOU' : 'READY')); list.append(li); }
    startButton.hidden = state.room.host_id !== user.id || state.room.quick; startButton.disabled = pending || players.length < 2;
    updateClock();
  }
  function showGame() {
    changeView('game'); screen.append(roomHeader());
    const card = el('section', 'dc-question-card');
    const number = el('div', 'dc-question-number'), question = el('h1', 'dc-question'), hint = el('p', 'dc-question-hint', '▼ fresh answers keep it moving ▼');
    card.append(number, question, hint); screen.append(card);
    const used = el('div', 'dc-used'); used.setAttribute('aria-label', 'Answers already said'); screen.append(used);
    statusNode = el('p', 'dc-turn-status'); statusNode.setAttribute('role', 'status'); screen.append(statusNode);
    ring = el('div', 'dc-ring'); ring.setAttribute('aria-label', 'Players around the charge'); ring.setAttribute('role', 'group');
    const chargeWrap = el('div', 'dc-charge'); chargeWrap.setAttribute('aria-hidden', 'true'); chargeWrap.append(sprite('charge-fuse', 64)); ring.append(chargeWrap); charge = chargeWrap;
    const form = el('form', 'dc-answer-form'), label = el('label', 'dc-answer-label', 'YOUR TURN'), input = el('input', 'dc-input dc-answer-input');
    input.id = 'dc-party-answer'; input.maxLength = 80; input.autocomplete = 'off'; input.spellcheck = false; input.placeholder = 'type a fresh answer…'; label.htmlFor = input.id;
    const go = el('button', 'dc-button dc-go', 'GO'); go.type = 'submit';
    const line = el('div', 'dc-answer-line'); line.append(input, go); form.append(label, line);
    const answerStatus = el('p', 'dc-answer-status'); answerStatus.setAttribute('role', 'status'); form.append(answerStatus);
    const watching = el('p', 'dc-watching'); watching.setAttribute('aria-live', 'polite');
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (answering || !isMyTurn() || !input.value.trim()) return;
      answering = true; go.disabled = true; answerStatus.textContent = '';
      const id = roomId, q = state.room.question_no, holder = state.room.holder_id;
      const r = await request(() => party.answer(id, input.value));
      if (!alive || roomId !== id || !game) return;
      answering = false; go.disabled = false;
      if (state.room.question_no !== q || state.room.holder_id !== holder) return;
      const status = r.data?.status;
      if (status === 'passed') { input.value = ''; answerStatus.textContent = `+${r.data.points} · charge passed`; sound('submit'); await refreshRoom(); }
      else if (status === 'used') answerStatus.textContent = 'already said';
      else if (status === 'miss') answerStatus.textContent = 'not on the list';
      else { answerStatus.textContent = status === 'too_early' ? 'Get ready…' : ['not_your_turn', 'too_late', 'not_playing'].includes(status) ? 'Turn changed. Updating…' : r.error || 'Could not send. Try again.'; await refreshRoom(); }
      answerStatus.classList.remove('dc-soft-flash'); void answerStatus.offsetWidth; answerStatus.classList.add('dc-soft-flash');
    });
    input.addEventListener('input', () => { if (isMyTurn()) request(() => party.sendTyping(roomId, input.value, { userId: user.id, holderId: state.room.holder_id })); });
    screen.append(form, watching, ring);
    game = { number, question, used, form, label, input, go, answerStatus, watching, questionNo: null, holderId: null };
    updateGame();
  }
  function isMyTurn() {
    const me = activePlayers(state).find(p => p.user_id === user?.id);
    return Boolean(me && me.hearts > 0 && !me.out_at && state?.room.status === 'playing' && state.room.holder_id === user?.id && timeOf(state.room.turn_started_at) <= Date.now());
  }
  function updateGame() {
    const { room } = state, people = activePlayers(state).sort((a, b) => a.seat - b.seat);
    const localPrompt = state.prompt || bank?.prompts?.find(p => p.id === room.prompt_id);
    game.number.textContent = `QUESTION ${room.question_no}`; game.question.textContent = localPrompt?.text || 'Waiting for the next question…';
    if (game.questionNo !== room.question_no || game.holderId !== room.holder_id) {
      game.input.value = ''; game.answerStatus.textContent = ''; game.watching.textContent = '';
      game.questionNo = room.question_no; game.holderId = room.holder_id; answering = false;
    }
    game.used.replaceChildren();
    for (const answer of state.used || []) { const chip = el('span', 'dc-used-chip', answer.answer_name); game.used.append(chip); }
    if (!state.used?.length) game.used.append(el('span', 'dc-used-empty', 'No answers said yet.'));
    for (const [i, p] of people.entries()) {
      let node = playerNodes.get(p.user_id);
      if (!node) { node = el('div', 'dc-player'); node.append(sprite(avatarOf(p.avatar), 44), el('span', 'dc-player-name'), el('span', 'dc-hearts'), el('div', 'dc-meter')); node.lastChild.append(el('span')); ring.append(node); playerNodes.set(p.user_id, node); }
      node.setAttribute('role', 'group');
      node.setAttribute('aria-label', `${p.username || 'Diver'}, ${p.out_at || p.hearts === 0 ? 'out' : `${p.hearts} hearts`}${p.user_id === room.holder_id ? ', holding the charge' : ''}${p.user_id === user.id ? ', you' : ''}`);
      node.querySelector('.dc-player-name').textContent = p.username || 'Diver';
      node.querySelector('.dc-hearts').textContent = `${'♥'.repeat(Math.max(0, Number(p.hearts) || 0))}${'♡'.repeat(Math.max(0, 3 - (Number(p.hearts) || 0)))}`;
      const meter = node.querySelector('.dc-meter'); meter.setAttribute('role', 'meter'); meter.setAttribute('aria-label', `${p.username} rarity points`); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '100'); meter.setAttribute('aria-valuenow', String(p.meter || 0)); meter.firstChild.style.width = `${Math.min(100, Math.max(0, p.meter || 0))}%`;
      node.classList.toggle('dc-out', Boolean(p.out_at) || p.hearts === 0); node.classList.toggle('dc-holder', p.user_id === room.holder_id); node.classList.toggle('dc-you', p.user_id === user.id);
      const angle = people.length === 2 ? (i ? 0 : Math.PI) : -Math.PI / 2 + i * Math.PI * 2 / people.length;
      node.style.setProperty('--dc-x', Math.cos(angle)); node.style.setProperty('--dc-y', Math.sin(angle));
    }
    for (const [id, node] of playerNodes) if (!people.some(p => p.user_id === id)) { node.remove(); playerNodes.delete(id); }
    updateClock();
  }
  function showWinner() {
    changeView('winner'); screen.append(title(true), roomHeader());
    const podium = el('section', 'dc-panel dc-podium');
    const ordered = [...(state.players || [])].filter(p => p.seat > 0).sort((a, b) => (a.place || 99) - (b.place || 99));
    const winner = ordered.find(p => p.user_id === state.room.winner_id) || ordered[0];
    podium.append(el('p', 'dc-eyebrow', 'LAST HEART STANDING'), sprite(avatarOf(winner?.avatar), 80), el('h2', 'dc-winner-name', winner?.username || 'Game finished'), el('p', 'dc-winner-copy', winner ? 'WINS THE GAME' : 'Thanks for playing.'));
    const list = el('ol', 'dc-standings');
    for (const p of ordered) {
      const li = el('li'); li.append(el('span', 'dc-place', String(p.place || '—')), sprite(avatarOf(p.avatar), 32), el('span', 'dc-standing-name', p.username));
      const delta = Number(p.rating_delta);
      li.append(el('small', 'dc-rating', state.room.rated && p.rating_delta !== null && p.rating_delta !== undefined ? `${delta >= 0 ? '+' : ''}${delta} ELO` : state.room.rated ? 'RATING PENDING' : '')); list.append(li);
    }
    podium.append(list);
    const actions = el('div', 'dc-winner-actions');
    actions.append(button('PLAY AGAIN', async () => {
      if (pending) return;
      const room = state.room; size = SIZES.find(x => x[2] === room.size_max)?.[0] || '4-6'; rated = room.rated;
      if (room.quick) await roomAction(() => party.quickPlay({ size, rated }), false);
      else await roomAction(() => party.createRoom({ isPublic: room.is_public, sizeMax: room.size_max }), false);
    }, 'dc-primary'), button('LOBBY', leave)); podium.append(actions); screen.append(podium);
  }
  function consume(result) {
    if (!alive) return;
    if (result.typing) {
      if (game && result.typing.user_id === state?.room.holder_id && result.typing.user_id !== user?.id) game.watching.textContent = `${activePlayers(state).find(p => p.user_id === result.typing.user_id)?.username || 'Diver'}: ${String(result.typing.text || '').slice(0, 80) || '…'}`;
      return;
    }
    if (!result.ok || !result.data?.room) { say(result.error || 'Room update failed. Reconnect to continue.', true); return; }
    const next = result.data;
    if (state && next.room.question_no < state.room.question_no) return;
    const orderedEvents = [...(next.events || [])].sort((a, b) => Number(a.id) - Number(b.id));
    if (orderedEvents.length && Number(orderedEvents.at(-1).id) < lastEvent) return;
    state = next;
    for (const event of orderedEvents) {
      if (Number(event.id) <= lastEvent) continue;
      if (!initialEvents) {
        if (event.kind === 'boom') { boomUntil = Date.now() + 1000; boomUser = event.user_id; sound('duelLose'); say(`${state.players.find(p => p.user_id === event.user_id)?.username || 'Diver'} lost a heart.`); }
        if (event.kind === 'heart') { sound('rare'); say(`${state.players.find(p => p.user_id === event.user_id)?.username || 'Diver'} earned a heart.`); }
        if (event.kind === 'win') sound('finish');
      }
      lastEvent = Number(event.id);
    }
    initialEvents = false;
    if (state.room.status === 'lobby') { if (view !== 'waiting') showWaiting(); else updateWaiting(); }
    else if (state.room.status === 'playing') { if (view !== 'game') showGame(); else updateGame(); }
    else if (state.room.status === 'finished') { if (view !== 'winner') showWinner(); }
  }
  async function refreshRoom() {
    if (!roomId || refreshBusy || !alive) return;
    refreshBusy = true; const id = roomId; const r = await request(() => party.getRoomState(id)); refreshBusy = false;
    if (alive && id === roomId) { if (r.ok) consume(r); else say(r.error || 'Room update failed. Try reconnecting.', true); }
  }
  function updateClock() {
    if (!state || !alive) return;
    if (view === 'waiting') {
      const n = activePlayers(state).length;
      const seconds = state.room.ready_at ? Math.max(0, Math.ceil((timeOf(state.room.ready_at) - Date.now()) / 1000)) : null;
      waitingNode.textContent = state.room.quick && seconds !== null ? `Starting in ${seconds}… · ${n}/${state.room.size_max} players` : `Waiting for players… · ${n}/${state.room.size_max}`;
    }
    if (!game) return;
    const now = Date.now(), holder = activePlayers(state).find(p => p.user_id === state.room.holder_id), start = timeOf(state.room.turn_started_at);
    countdown = Math.max(0, Math.ceil((start - now) / 1000));
    const mine = isMyTurn(), wasHidden = game.form.hidden;
    game.form.hidden = !mine; game.watching.hidden = mine;
    game.go.disabled = answering || !mine;
    statusNode.textContent = countdown ? `GET READY · ${countdown}` : holder?.user_id === user.id ? 'YOUR TURN · keep the charge moving' : `${holder?.username || 'Diver'} has the charge`;
    if (mine && wasHidden) game.input.focus({ preventScroll: true });
    if (!mine && !game.watching.textContent) game.watching.textContent = holder?.out_at ? 'Waiting for the next turn…' : `${holder?.username || 'Diver'} is thinking…`;
    if (charge) {
      const booming = boomUntil > now;
      const people = activePlayers(state).sort((a, b) => a.seat - b.seat);
      const anchor = booming ? boomUser : state.room.holder_id;
      const i = people.findIndex(p => p.user_id === anchor);
      if (i >= 0) {
        const angle = people.length === 2 ? (i ? 0 : Math.PI) : -Math.PI / 2 + i * Math.PI * 2 / people.length;
        charge.style.setProperty('--dc-x', Math.cos(angle) * .48);
        charge.style.setProperty('--dc-y', Math.sin(angle) * .48);
      }
      charge.classList.toggle('dc-booming', booming);
      charge.style.setProperty('--dc-spark-time', `${Math.max(.25, 1.8 - Math.max(0, now - start) / 18000)}s`);
      const name = booming ? 'charge-boom' : 'charge-fuse';
      if (charge.dataset.sprite !== name) { charge.dataset.sprite = name; charge.replaceChildren(sprite(name, 64, booming ? 2 : 0)); }
      if (booming) statusNode.textContent = `BOOM · ${state.players.find(p => p.user_id === boomUser)?.username || 'Diver'} lost a heart`;
    }
  }
  async function tick() {
    if (!alive || !state || tickBusy || !(state.room.status === 'playing' || state.room.status === 'lobby' && state.room.quick)) return;
    tickBusy = true; const id = roomId; const r = await request(() => party.tick(id)); tickBusy = false;
    if (!alive || roomId !== id) return;
    if (!r.ok) { say(r.error || 'Connection lost. Reconnecting…', true); return; }
    // Re-read authoritative players/events as tick’s result contains only a room row.
    await refreshRoom();
  }
  function animate(now) {
    if (!alive) return;
    if (now - lastClock > 100) { updateClock(); lastClock = now; }
    frame = requestAnimationFrame(animate);
  }
  async function loadAccount() {
    const [p, stats] = await Promise.all([request(() => online.getProfile()), request(() => online.getStats())]);
    if (!alive) return;
    profile = p.ok ? p.data : null; streak = stats.ok ? Number(stats.data?.best_streak || 0) : 0;
    selectedAvatar = avatarOf(profile?.avatar); showHome();
    if (code) {
      let cached; try { cached = sessionStorage.getItem(`vermillion:party:${code}`); } catch {}
      if (cached) { const r = await request(() => party.getRoomState(cached)); if (!alive) return; if (r.ok) { await enterRoom(r.data.room); return; } }
      await roomAction(() => party.joinRoom(code), false);
    }
    if (!p.ok) say(p.error || 'Could not load your profile.', true);
  }
  function showGuest() {
    changeView('guest'); screen.append(title());
    const panel = el('section', 'dc-guest dc-panel'); panel.append(el('p', '', 'Join the game with a free guest profile.'));
    const b = button('PLAY AS GUEST', async () => {
      if (pending) return; setBusy(true); b.disabled = true;
      const r = await request(() => online.signInGuest());
      if (!alive) return; setBusy(false); b.disabled = false;
      if (!r.ok) { say(r.error || 'Guest sign-in is unavailable. Try again.', true); return; }
      user = r.data?.user || r.data || await online.getUser();
      if (!alive) return;
      if (!user?.id) { say('Sign-in did not finish. Please try again.', true); return; }
      say(); await loadAccount();
    }, 'dc-primary'); panel.append(b); screen.append(panel);
  }
  function destroy() {
    if (!alive) return; alive = false; unsubscribe?.(); authOff?.(); motionObserver?.disconnect(); cancelAnimationFrame(frame);
    for (const id of timers) clearInterval(id);
    closeRules(); root.remove();
  }
  if (globalThis.MutationObserver && document.documentElement) {
    motionObserver = new MutationObserver(() => { root.dataset.reducedMotion = String(document.documentElement.classList.contains('reduce-motion')); });
    motionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  const controller = { destroy, ready: null }; mounted = controller;
  changeView('loading'); screen.append(el('p', 'dc-empty', 'Loading DEPTH CHARGE…'));
  controller.ready = (async () => {
    try {
      user = await online.getUser(); if (!alive) return;
      if (user?.id) await loadAccount(); else showGuest();
      if (!alive) return;
      authOff = online.onAuth?.(next => {
        if (!alive || next?.id === user?.id) return;
        if (!next) { unsubscribe?.(); unsubscribe = null; roomId = null; state = null; user = null; showGuest(); say('You signed out. Play as guest to rejoin.'); }
      });
      timers.add(setInterval(refreshPublic, 5000)); timers.add(setInterval(tick, 1000)); frame = requestAnimationFrame(animate);
    } catch (error) { if (alive) { showGuest(); say(error?.message || 'DEPTH CHARGE is unavailable. Please try again.', true); } }
  })();
  return controller;
}
