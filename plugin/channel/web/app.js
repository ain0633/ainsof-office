'use strict';
// ainsof Office — 픽셀 사무실 화면. 라이브러리 없음, 같은 출처 API(/me /pair /stream /say /verdict)만 씀.
(() => {
  const LW = 300, LH = 210;            // 사무실 논리 픽셀 크기
  const REPLAY = new URLSearchParams(location.search).get('replay') === '1';
  const FONT = '"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  const $ = (s) => document.querySelector(s);

  // ── 고양이 자리표시 그림 (16x16, 2배로 그려 32x32) ───────────────
  // o 테두리 · b 몸 · p/q 무늬(왼/오) · w 배·주둥이 · e 눈 · n 코·귀 안쪽
  const CAT = [
    '..oo........oo..',
    '.onbo......obno.',
    '.obbboooooobbbo.',
    '.obbpbbbbbbqbbo.',
    '.obbbbbbbbbbbbo.',
    '.obbbebbbbebbbo.',
    '.obbbebbbbebbbo.',
    '.obbwwwnnwwwbbo.',
    '..obwwwwwwwwbo..',
    '..obbbwwwwbbbo..',
    '.obbbwwwwwwbbbo.',
    '.obpbwwwwwwbqbo.',
    '.obbbwwwwwwbbbo.',
    '..obbbbbbbbbbo..',
    '..owwo....owwo..',
    '...oo......oo...',
  ];
  const ROLES = {
    operator: { name: 'PM', seat: [0, 0], extra: [],
      pal: { o: '#141110', b: '#2b2724', p: '#2b2724', q: '#2b2724', w: '#f2efe8', e: '#d8e86a', n: '#e79aa2' } },
    researcher: { name: '리서치봇', seat: [1, 0],
      extra: [[6, 4, 'p'], [9, 4, 'p'], [2, 10, 'p'], [13, 10, 'p'], [2, 12, 'p'], [13, 12, 'p'], [5, 13, 'p'], [10, 13, 'p']],
      pal: { o: '#3b2f25', b: '#8f7b63', p: '#5b4a39', q: '#5b4a39', w: '#e0d4bf', e: '#2a2119', n: '#d98f90' } },
    designer: { name: '디자이너봇', seat: [2, 0],
      extra: [[11, 2, 'p'], [12, 2, 'p'], [13, 2, 'p'], [11, 3, 'p'], [12, 3, 'p'], [12, 4, 'p'], [13, 4, 'p'], [3, 11, 'q'], [2, 12, 'q'], [3, 12, 'q'], [11, 13, 'p'], [12, 13, 'p']],
      pal: { o: '#3e3833', b: '#faf7f1', p: '#a39282', q: '#c9a27a', w: '#ffffff', e: '#3a5b8c', n: '#e8a0a8' } },
    developer: { name: '개발봇', seat: [0, 1],
      extra: [[7, 3, 'p'], [8, 3, 'p'], [2, 12, 'p'], [13, 12, 'p']],
      pal: { o: '#5a3016', b: '#e48b3e', p: '#b9612a', q: '#b9612a', w: '#fbf6ee', e: '#2a1c12', n: '#e68f8f' } },
    reviewer: { name: '검수봇', seat: [1, 1], extra: [],
      pal: { o: '#33373c', b: '#8d9298', p: '#6a6f76', q: '#6a6f76', w: '#f5f5f3', e: '#20242a', n: '#de9aa0' } },
    qa: { name: 'QA봇', seat: [2, 1],
      extra: [[2, 2, 'p'], [3, 2, 'p'], [2, 3, 'p'], [3, 3, 'p'], [2, 4, 'p'], [12, 2, 'q'], [13, 2, 'q'], [12, 3, 'q'], [2, 10, 'p'], [3, 10, 'p'], [2, 12, 'p'], [12, 10, 'q'], [13, 10, 'q'], [12, 12, 'q'], [3, 13, 'q'], [4, 13, 'q'], [10, 13, 'p'], [11, 13, 'p']],
      pal: { o: '#2e2620', b: '#f6f1e7', p: '#e0873a', q: '#2c2521', w: '#fffdf8', e: '#2a2119', n: '#e3949a' } },
  };
  const COL_X = [50, 150, 250], ROW_Y = [46, 126]; // 고양이 가운데 x, 머리 위 y
  const MAIL_X = 86;                                 // 결재함 (PM 책상 오른쪽)

  function makeCat(role) {
    const { pal, extra } = ROLES[role];
    const rows = CAT.map((r) => r.split(''));
    for (const [x, y, ch] of extra) rows[y][x] = ch;
    // 16×16 무늬를 처음부터 32×32 로 찍는다(한 칸 = 2×2). 키우는 단계가 없어서 브라우저가 번지게 할 틈이 없다
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    rows.forEach((row, y) => row.forEach((ch, x) => {
      if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * 2, y * 2, 2, 2); }
    }));
    return c;
  }

  const bots = {};
  for (const role of Object.keys(ROLES)) {
    bots[role] = { state: 'idle', bubble: null, popup: null, icon: makeCat(role), img: null };
    // 진짜 스프라이트가 있으면 씀: 32x32 가로 띠, 0-1 쉬기 · 2-3 일하기
    const img = new Image();
    img.onload = () => { if (img.width >= 32) bots[role].img = img; };
    img.src = `sprites/${role}.png`;
  }
  const pmIcon = bots.operator.icon.toDataURL();

  const roleOf = (s) => {
    if (typeof s !== 'string' || !s.startsWith('ainsof-office:')) return null;
    const r = s.slice('ainsof-office:'.length);
    return ROLES[r] ? r : null;
  };
  const short = (s, n) => { const a = Array.from(String(s || '')); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
  const hhmm = (ts) => {
    const d = new Date(ts);
    return isNaN(d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

  // ── 활동 기록 → 책상 상태 ───────────────────────────────────────
  const seen = new Set();
  function applyLog(ev, fresh) {
    if (!ev || typeof ev !== 'object' || !ev.type) return;
    if (ev.id) { if (seen.has(ev.id)) return; seen.add(ev.id); }
    const d = ev.data || {};
    const actor = roleOf(ev.actor && ev.actor.role);
    const now = performance.now();
    const say = (role, text, kind, ms) => {
      if (ms && !fresh) return; // 지난 기록을 다시 받을 때는 잠깐 뜨는 말풍선 생략
      bots[role].bubble = { text, kind, until: ms ? now + ms : Infinity };
    };

    switch (ev.type) {
      case 'agent.start':
        if (!actor) return;
        bots[actor].state = 'working'; bots[actor].bubble = null;
        break;
      case 'agent.stop':
        if (!actor) return;
        bots[actor].state = 'idle'; bots[actor].bubble = null;
        break;
      case 'tool.call': {
        if (!actor) return;
        const b = bots[actor];
        if (d.decision === 'ask') { b.state = 'asking'; say(actor, '🔐 승인 요청', 'ask'); }
        else if (d.decision === 'deny') { b.state = 'blocked'; say(actor, `⛔ 막힘: ${d.rule || '규칙'}`, 'deny'); }
        else { b.state = 'working'; b.bubble = null; say(actor, `🔧 ${d.tool || ''}`, 'tool', 3000); }
        if (REPLAY) { // 재생 기록엔 permission 이벤트가 없으니 ask 를 결재함 카드로 보여 줌
          if (d.decision === 'ask') addCard({ request_id: 'replay-' + actor, tool_name: `${d.tool || '?'} — ${ROLES[actor].name}`, description: `규칙 ${d.rule || '?'}${d.reason ? ' · ' + d.reason : ''}`, input_preview: d.target || '' });
          else removeCard('replay-' + actor);
        }
        break;
      }
      case 'tool.result':
        if (!actor) return;
        bots[actor].state = 'working';
        if (bots[actor].bubble && bots[actor].bubble.until === Infinity) bots[actor].bubble = null;
        break;
      case 'task.assigned': {
        const to = roleOf(d.to);
        if (!to || !actor) return;
        bots[to].state = 'assigned';
        say(to, `📋 ${short(d.card, 20)}`, 'assign');
        break;
      }
      case 'task.result': {
        const from = roleOf(d.from) || actor;
        if (!from) return;
        const b = bots[from];
        b.bubble = null;
        if (d.status === 'done') { b.state = 'idle'; if (fresh) b.popup = { text: '완료!', kind: 'done', start: now, until: now + 3000 }; }
        else if (d.status === 'blocked') { b.state = 'blocked'; if (fresh) b.popup = { text: '멈춤', kind: 'stop', start: now, until: now + 3000 }; }
        else b.state = 'idle';
        break;
      }
      case 'compact':
        if (!actor) return;
        break;
      default:
        return;
    }
    addActivity(ev);
  }

  // ── 최근 활동 ───────────────────────────────────────────────────
  const activity = $('#activity');
  function describe(ev) {
    const d = ev.data || {};
    const who = ROLES[roleOf(ev.actor && ev.actor.role)];
    const name = who ? who.name : '?';
    switch (ev.type) {
      case 'tool.call': {
        const t = `${d.tool || '?'} ${d.target || ''}`.trim();
        if (d.decision === 'ask') return `🔐 ${name} 승인 요청 · ${t}`;
        if (d.decision === 'deny') return `⛔ ${name} 막힘(${d.rule || '?'}) · ${t}`;
        return `${name} · ${t}`;
      }
      case 'tool.result': return null; // 호출 한 줄로 충분해서 목록에선 뺌
      case 'task.assigned': return `📋 ${name} → ${ROLES[roleOf(d.to)].name}: ${d.card || ''}`;
      case 'task.result': {
        const n = (ROLES[roleOf(d.from)] || who || { name: '?' }).name;
        return d.status === 'done' ? `✅ ${n} 완료` : `⏸ ${n} ${d.status === 'blocked' ? '멈춤' : (d.status || '')}`;
      }
      case 'agent.start': return `${name} 일 시작`;
      case 'agent.stop': return `${name} 쉬는 중`;
      case 'compact': return `${name} 기억 정리`;
    }
    return null;
  }
  function addActivity(ev) {
    const text = describe(ev);
    if (!text) return;
    const li = el('li');
    li.append(el('time', '', hhmm(ev.ts)), document.createTextNode(text));
    li.title = text;
    activity.prepend(li);
    while (activity.children.length > 30) activity.lastChild.remove();
  }

  // ── 결재함 ──────────────────────────────────────────────────────
  const inbox = $('#inbox'), cards = new Map();
  function updateInbox() {
    const n = cards.size, c = $('#inbox-count');
    c.textContent = n;
    c.classList.toggle('hot', n > 0);
    $('#inbox-empty').hidden = n > 0;
  }
  function addCard(p) {
    if (!p || !p.request_id || cards.has(p.request_id)) return;
    const li = el('li', 'card');
    li.append(el('strong', 'tool', p.tool_name || '(도구 이름 없음)'));
    if (p.description) li.append(el('p', 'desc', p.description));
    const preview = typeof p.input_preview === 'string' ? p.input_preview : JSON.stringify(p.input_preview ?? '', null, 2);
    const pre = el('pre', '', preview);
    pre.setAttribute('aria-label', '실행될 내용');
    pre.tabIndex = 0; // 길면 키보드로 스크롤
    li.append(pre);
    if (!REPLAY) {
      const row = el('div', 'actions');
      const ok = el('button', 'primary', '승인'), no = el('button', 'deny', '거절');
      ok.type = no.type = 'button';
      const note = el('p', 'note');
      ok.onclick = () => sendVerdict(p.request_id, 'allow', li, [ok, no], note);
      no.onclick = () => sendVerdict(p.request_id, 'deny', li, [ok, no], note);
      row.append(ok, no);
      li.append(row, note);
    }
    cards.set(p.request_id, li);
    inbox.append(li);
    updateInbox();
  }
  function removeCard(id) {
    const li = cards.get(id);
    if (!li) return;
    li.remove();
    cards.delete(id);
    updateInbox();
  }
  async function sendVerdict(id, behavior, li, btns, note) {
    btns.forEach((b) => { b.disabled = true; });
    li.classList.add('sent');
    note.textContent = behavior === 'allow' ? '승인 보냄 — 처리 기다리는 중' : '거절 보냄 — 처리 기다리는 중';
    try {
      const r = await fetch('/verdict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: id, behavior }) });
      if (r.status === 401) { showPair(); throw new Error('연결이 끊김'); }
      if (!r.ok) throw new Error(`서버 응답 ${r.status}`);
    } catch (e) {
      btns.forEach((b) => { b.disabled = false; });
      li.classList.remove('sent');
      note.textContent = `보내지 못했어요 (${e.message}) — 다시 눌러 주세요`;
    }
  }

  // ── 대화 ────────────────────────────────────────────────────────
  const chat = $('#chat'), chatSeen = new Set();
  function addChat(kind, m) {
    if (!m || typeof m.text !== 'string') return;
    const key = `${kind}|${m.ts}|${m.text}`;
    if (chatSeen.has(key)) return;
    chatSeen.add(key);
    const li = el('li', kind === 'said' ? 'me' : 'pm');
    const body = el('div');
    body.append(el('time', '', (kind === 'said' ? '나 ' : 'PM ') + hhmm(m.ts)), el('span', '', m.text));
    if (kind === 'reply') {
      const img = el('img');
      img.src = pmIcon; img.alt = '';
      li.append(img);
    }
    li.append(body);
    const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
    chat.append(li);
    if (atBottom) chat.scrollTop = chat.scrollHeight;
  }

  const sayForm = $('#say-form'), sayText = $('#say-text'), sayErr = $('#say-err');
  sayText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sayForm.requestSubmit(); }
  });
  sayForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = sayText.value.trim();
    if (!text) return;
    const btn = sayForm.querySelector('button');
    btn.disabled = true;
    sayErr.textContent = '';
    try {
      const r = await fetch('/say', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (r.status === 401) { showPair(); throw new Error('연결이 끊김'); }
      if (!r.ok) throw new Error(`서버 응답 ${r.status}`);
      sayText.value = ''; // 화면엔 서버가 돌려주는 said 로 표시
    } catch (err) {
      sayErr.textContent = `보내지 못했어요 (${err.message})`;
    } finally {
      btn.disabled = false;
    }
  });

  // ── 연결 (짝짓기 + SSE) ─────────────────────────────────────────
  const conn = $('#conn');
  const setConn = (text, cls) => { conn.textContent = text; conn.className = 'conn ' + (cls || ''); };
  let es = null, backoff = 1000, retryTimer = 0;

  function retry() {
    setConn(`다시 연결 중… (${Math.round(backoff / 1000)}초 뒤)`, 'bad');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(start, backoff);
    backoff = Math.min(backoff * 2, 30000);
  }
  async function start() {
    let r;
    try { r = await fetch('/me', { cache: 'no-store' }); } catch { return retry(); }
    if (r.status === 401) return showPair();
    if (!r.ok) return retry();
    connect();
  }
  function connect() {
    if (es) es.close();
    setConn('연결 중…');
    es = new EventSource('/stream');
    es.onopen = () => { backoff = 1000; setConn('연결됨', 'ok'); };
    es.onerror = () => { es.close(); es = null; retry(); }; // 쿠키 만료도 여기로 → start 가 /me 로 확인
    es.addEventListener('log', (e) => {
      const ev = parse(e.data);
      if (ev) applyLog(ev, !(Date.now() - Date.parse(ev.ts) > 30000));
    });
    es.addEventListener('reply', (e) => addChat('reply', parse(e.data)));
    es.addEventListener('said', (e) => addChat('said', parse(e.data)));
    es.addEventListener('permission', (e) => addCard(parse(e.data)));
    es.addEventListener('verdict', (e) => { const v = parse(e.data); if (v) removeCard(v.request_id); });
  }

  const pair = $('#pair'), pairForm = $('#pair-form'), pairCode = $('#pair-code'), pairErr = $('#pair-err');
  function showPair() {
    if (es) { es.close(); es = null; }
    clearTimeout(retryTimer);
    setConn('연결 안 됨', 'bad');
    if (!pair.open) pair.showModal();
    pairCode.focus();
  }
  pair.addEventListener('cancel', (e) => e.preventDefault()); // Esc 로 닫히지 않게
  pairForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = pairCode.value.trim();
    if (!code) { pairErr.textContent = '코드를 넣어 주세요.'; return; }
    const btn = pairForm.querySelector('button');
    btn.disabled = true;
    pairErr.textContent = '';
    try {
      const r = await fetch('/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      if (r.ok) { pair.close(); pairCode.value = ''; backoff = 1000; connect(); }
      else if (r.status === 401) { pairErr.textContent = '코드가 맞지 않아요. 디스코드에서 다시 확인해 주세요.'; pairCode.select(); }
      else pairErr.textContent = `연결하지 못했어요 (서버 응답 ${r.status}).`;
    } catch {
      pairErr.textContent = '서버에 닿지 않아요. 사무실 프로그램이 켜져 있는지 확인해 주세요.';
    } finally {
      btn.disabled = false;
    }
  });

  // ── 재생 모드 ───────────────────────────────────────────────────
  function startReplay() {
    $('#replay-banner').hidden = false;
    $('#replay-ctl').hidden = false;
    sayForm.hidden = true;
    $('#chat-note').hidden = false;
    setConn('재생 모드', 'ok');
    const playBtn = $('#play'), prog = $('#progress');
    let events = [], i = 0, speed = 1, playing = false, timer = 0;
    const ui = () => {
      playBtn.textContent = playing ? '⏸ 일시정지' : (i >= events.length && events.length ? '↺ 처음부터' : '▶ 재생');
      prog.textContent = `${i} / ${events.length}`;
    };
    const reset = () => {
      seen.clear();
      for (const b of Object.values(bots)) { b.state = 'idle'; b.bubble = null; b.popup = null; }
      activity.replaceChildren();
      for (const id of [...cards.keys()]) removeCard(id);
      i = 0;
    };
    const step = () => {
      if (!playing) return;
      if (i >= events.length) { playing = false; ui(); return; }
      applyLog(events[i++], true);
      ui();
      const gap = i < events.length ? Date.parse(events[i].ts) - Date.parse(events[i - 1].ts) : 0;
      timer = setTimeout(step, (gap > 0 ? Math.min(gap, 4000) : 0) / speed); // 긴 공백은 4초로 줄임
    };
    playBtn.onclick = () => {
      clearTimeout(timer);
      if (!playing && i >= events.length) reset();
      playing = !playing;
      ui();
      step();
    };
    document.querySelectorAll('.speed').forEach((btn) => {
      btn.onclick = () => {
        speed = Number(btn.dataset.speed);
        document.querySelectorAll('.speed').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      };
    });
    fetch('sample-events.jsonl')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
      .then((txt) => {
        events = txt.split('\n').map(parse).filter(Boolean);
        playing = true;
        step();
      })
      .catch(() => { prog.textContent = '기록을 불러오지 못했어요'; });
    ui();
  }

  // ── 사무실 그리기 ───────────────────────────────────────────────
  const view = $('#office'), v = view.getContext('2d');
  const scene = document.createElement('canvas');
  scene.width = LW; scene.height = LH;
  const g = scene.getContext('2d');
  g.imageSmoothingEnabled = false; // 16×16 고양이를 32×32 로 키울 때 번지지 않게(10/23 CEO "흐리게 보인다")
  const rect = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  let S = 1, dpr = 1; // S = 논리 픽셀 하나당 기기 픽셀(정수)

  function drawBackground() {
    const c = document.createElement('canvas');
    c.width = LW; c.height = LH;
    const x = c.getContext('2d');
    const r = (...a) => rect(x, ...a);
    // 벽
    r(0, 0, LW, 40, '#8ea37e');
    for (let i = 0; i < LW; i += 6) r(i, 3, 1, 34, '#97ab87');
    r(0, 0, LW, 3, '#738a64');
    r(0, 37, LW, 5, '#6b4a2e'); r(0, 37, LW, 1, '#8a6240');
    // 나무 바닥
    for (let y = 42, i = 0; y < LH; y += 7, i++) {
      r(0, y, LW, 7, i % 2 ? '#b2835a' : '#b98a5c');
      r(0, y + 6, LW, 1, '#94673f');
      for (let px = (i * 23) % 46; px < LW; px += 46) r(px, y, 1, 6, '#9c6e45');
    }
    // 창문
    r(118, 6, 64, 28, '#6b4a2e'); r(121, 9, 27, 22, '#cfe3e0'); r(152, 9, 27, 22, '#cfe3e0');
    r(123, 11, 8, 2, '#eef7f5'); r(154, 11, 8, 2, '#eef7f5'); r(116, 32, 68, 3, '#8a6240');
    // 시계
    r(66, 10, 12, 12, '#4d3420'); r(67, 11, 10, 10, '#f4f2ea'); r(71, 13, 1, 4, '#2a2420'); r(71, 16, 3, 1, '#2a2420');
    // 책장
    r(206, 4, 44, 34, '#6b4a2e'); r(208, 6, 40, 13, '#3e2a19'); r(208, 21, 40, 14, '#3e2a19');
    const books = ['#b0563f', '#d9b45a', '#5f8a5a', '#4f6d8f', '#e3d7bf', '#8f5a7a'];
    for (const [top, base] of [[6, 19], [21, 35]]) {
      for (let i = 0, bx = 209; bx < 245; i++) {
        const w = 3 + (i + top) % 3, h = 9 + (i * 7 + top) % 4;
        r(bx, base - h, Math.min(w, 247 - bx), h, books[(i + top) % 6]);
        bx += w + 1;
      }
    }
    // 화분
    const plant = (px, py) => {
      r(px + 2, py + 10, 10, 8, '#5d6f8a'); r(px + 2, py + 10, 10, 2, '#6f83a1');
      r(px + 6, py, 2, 10, '#4a7546'); r(px + 1, py + 3, 5, 3, '#77a26b'); r(px + 8, py + 1, 5, 3, '#77a26b');
      r(px + 3, py + 6, 4, 3, '#5f8a5a'); r(px + 7, py + 5, 5, 3, '#5f8a5a');
    };
    plant(282, 24); plant(4, 190); plant(282, 190);
    return c;
  }
  const bg = drawBackground();

  function drawMailbox(t, alert) {
    const r = (...a) => rect(g, ...a), X = MAIL_X, on = alert && Math.floor(t / 400) % 2 === 0;
    r(X + 8, 74, 3, 14, '#4d3420');                       // 기둥
    r(X - 1, 57, 21, 18, '#3b2a1c');                      // 테두리
    r(X, 58, 19, 16, on ? '#d0443c' : '#a0703f');         // 몸통
    r(X, 58, 19, 3, on ? '#e8675e' : '#b98552');          // 뚜껑
    r(X + 3, 65, 13, 2, '#2a1d12');                       // 투입구
    if (alert) r(X + 5, 61, 9, 4, '#fbf8f0');             // 삐져나온 서류
    r(X + 20, 58, 2, 10, '#4d3420');                      // 깃대
    r(X + 22, 58, 5, 3, alert ? '#d0443c' : '#7a8f6a');   // 깃발
  }

  const LED = { idle: '#8a8178', working: '#7fd16b', assigned: '#f0c24a', asking: '#f0c24a', blocked: '#e04848' };
  function drawBot(role, t, now) {
    const b = bots[role], [col, row] = ROLES[role].seat, cx = COL_X[col], top = ROW_Y[row];
    const r = (...a) => rect(g, ...a);
    const busy = b.state === 'working' || b.state === 'assigned';
    const bob = b.state === 'working' && Math.floor(t / 250) % 2 ? -2 : 0;
    if (b.img) {
      const frames = Math.max(1, Math.floor(b.img.width / 32));
      const f = (Math.floor(t / 400) % 2 + (busy ? 2 : 0)) % frames;
      g.drawImage(b.img, f * 32, 0, 32, 32, cx - 16, top + bob, 32, 32);
    } else {
      g.drawImage(b.icon, cx - 16, top + bob, 32, 32);
    }
    // 책상 (고양이 허리를 가림)
    const dy = top + 24;
    r(cx - 27, dy - 1, 54, 20, '#4d3420');
    r(cx - 26, dy, 52, 10, '#c99a63'); r(cx - 26, dy, 52, 1, '#ddb27b');
    r(cx - 26, dy + 10, 52, 8, '#95663c');
    r(cx - 24, dy + 18, 3, 4, '#4d3420'); r(cx + 21, dy + 18, 3, 4, '#4d3420');
    // 노트북 뒷면 + 머그잔
    r(cx + 15, dy - 8, 12, 10, '#2f3238'); r(cx + 16, dy - 7, 10, 8, '#3d4148');
    r(cx + 20, dy - 4, 2, 2, b.state === 'working' && Math.floor(t / 300) % 2 ? '#f5d76e' : '#6b7079');
    r(cx - 22, dy + 2, 5, 5, '#e9e4da'); r(cx - 17, dy + 3, 2, 2, '#e9e4da'); r(cx - 21, dy + 2, 3, 1, '#6b4a2e');
    if (b.state === 'assigned') { r(cx - 12, dy + 2, 9, 6, '#fbf8f0'); r(cx - 11, dy + 4, 6, 1, '#a39282'); r(cx - 11, dy + 6, 5, 1, '#a39282'); }
    // 상태 불빛
    const blinkOff = b.state === 'asking' && Math.floor(t / 300) % 2;
    r(cx - 2, dy + 12, 4, 3, '#2a1d12'); r(cx - 1, dy + 13, 2, 1, blinkOff ? '#6b5a2a' : LED[b.state]);
    // 완료 반짝이
    if (b.popup && b.popup.kind === 'done' && now - b.popup.start < 1500 && Math.floor(t / 150) % 2) {
      for (const [sx, sy] of [[-20, 2], [18, -2], [-14, -6], [22, 10]]) {
        r(cx + sx, top + sy + 1, 3, 1, '#f5d76e'); r(cx + sx + 1, top + sy, 1, 3, '#f5d76e');
      }
    }
  }

  const BUBBLE = {
    tool: { bg: '#fffaf0', fg: '#2a2420', line: '#4d3420' },
    ask: { bg: '#ffe9a8', fg: '#3a2a10', line: '#8a6a1a' },
    deny: { bg: '#f8d6d6', fg: '#7a1e25', line: '#a3343c' },
    assign: { bg: '#e3efd9', fg: '#24401f', line: '#4a7546' },
  };
  function fit(text, maxW) {
    if (v.measureText(text).width <= maxW) return text;
    const ch = Array.from(text);
    while (ch.length && v.measureText(ch.join('') + '…').width > maxW) ch.pop();
    return ch.join('') + '…';
  }
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function label(text, x, y, fs) {
    const w = v.measureText(text).width + 12 * dpr, h = fs + 8 * dpr;
    const lx = clamp(x - w / 2, 2, view.width - w - 2);
    v.fillStyle = 'rgba(43, 33, 24, .82)';
    v.fillRect(lx, y, w, h);
    v.fillStyle = '#fff7e8';
    v.fillText(text, lx + w / 2, y + h / 2 + dpr);
  }
  function bubble(bb, x, bottom, fs, alpha) {
    const st = BUBBLE[bb.kind] || BUBBLE.tool, pad = 6 * dpr, bw = 2 * dpr, h = fs + 10 * dpr;
    const text = fit(bb.text, Math.max(100 * S, 180 * dpr) - pad * 2);
    const w = v.measureText(text).width + pad * 2;
    const bx = clamp(x - w / 2, bw + 2, view.width - w - bw - 2), by = bottom - h - 4 * dpr;
    v.globalAlpha = alpha;
    v.fillStyle = st.line;
    v.fillRect(bx - bw, by - bw, w + bw * 2, h + bw * 2);
    v.fillRect(x - 3 * dpr, by + h, 6 * dpr, 4 * dpr);   // 꼬리
    v.fillStyle = st.bg;
    v.fillRect(bx, by, w, h);
    v.fillRect(x - 1 * dpr, by + h, 2 * dpr, 2 * dpr);
    v.fillStyle = st.fg;
    v.fillText(text, bx + w / 2, by + h / 2 + dpr);
    v.globalAlpha = 1;
    return by - bw;
  }

  function frame(t) {
    const now = performance.now();
    const alert = cards.size > 0 || Object.values(bots).some((b) => b.state === 'asking');
    g.drawImage(bg, 0, 0);
    drawMailbox(t, alert);
    for (const role of Object.keys(ROLES)) drawBot(role, t, now);

    v.imageSmoothingEnabled = false;
    v.drawImage(scene, 0, 0, LW * S, LH * S);

    const fs = Math.round(14 * dpr);
    v.font = `600 ${fs}px ${FONT}`;
    v.textAlign = 'center';
    v.textBaseline = 'middle';
    label(cards.size ? `결재함 ${cards.size}` : '결재함', (MAIL_X + 10) * S, 94 * S, fs);
    for (const [role, info] of Object.entries(ROLES)) {
      const [col, row] = info.seat, cx = COL_X[col] * S, top = ROW_Y[row];
      label(info.name, cx, (top + 48) * S, fs);
    }
    for (const [role, info] of Object.entries(ROLES)) {
      const b = bots[role], [col, row] = info.seat, cx = COL_X[col] * S;
      let y = (ROW_Y[row] - 1) * S;
      if (b.bubble && b.bubble.until < now) b.bubble = null;
      if (b.bubble) y = bubble(b.bubble, cx, y, fs, clamp((b.bubble.until - now) / 500, 0, 1));
      if (b.popup && b.popup.until < now) b.popup = null;
      if (b.popup) {
        const p = (now - b.popup.start) / 3000, pf = Math.round(18 * dpr);
        v.font = `800 ${pf}px ${FONT}`;
        v.globalAlpha = clamp((1 - p) * 3, 0, 1);
        v.lineWidth = 4 * dpr;
        v.strokeStyle = '#fffaf0';
        const py = y - pf / 2 - 4 * dpr - p * 14 * S;
        v.strokeText(b.popup.text, cx, py);
        v.fillStyle = b.popup.kind === 'done' ? '#2f6b2b' : '#a3343c';
        v.fillText(b.popup.text, cx, py);
        v.globalAlpha = 1;
        v.font = `600 ${fs}px ${FONT}`;
      }
    }
    requestAnimationFrame(frame);
  }

  const stage = view.parentElement;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const cs = getComputedStyle(stage);
    const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = window.innerWidth > 900 ? window.innerHeight - 110 : Infinity;
    S = Math.max(1, Math.floor(Math.min(availW / LW, availH / LH) * dpr));
    view.width = LW * S;
    view.height = LH * S;
    view.style.width = `${(LW * S) / dpr}px`;
    view.style.height = `${(LH * S) / dpr}px`;
  }
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
  updateInbox();

  if (REPLAY) startReplay();
  else start();
})();
