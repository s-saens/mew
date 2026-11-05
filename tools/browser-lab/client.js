(() => {
  'use strict';
  const config = window.LAB_CONFIG;
  const $ = (id) => document.getElementById(id);
  const screen = $('screen');
  const viewport = $('viewport');
  const ime = $('ime');
  const address = $('address');
  let socket;
  let reconnectTimer;
  let attempts = 0;
  let canPointer = false;
  let remoteWidth = 1280;
  let remoteHeight = 800;
  let composing = false;
  let committedComposition;
  let resizeTimer;
  let pendingMove;
  let moveTimer;
  let pendingWheel;
  let wheelTimer;
  let lastResize = '';
  let lastPointer;
  let heldButton = 'left';
  let lastPress = { time: 0, x: 0, y: 0, count: 0 };

  $('engine-name').textContent = config.name;
  $('port').textContent = `:${config.port}`;
  document.title = `${config.name} · Browser Lab`;
  address.value = config.initialUrl;
  for (const engine of config.engines) {
    const link = document.createElement('a');
    const target = new URL(location.href);
    target.port = String(engine.port);
    target.pathname = '/';
    target.search = '';
    target.hash = '';
    link.href = target.href;
    link.textContent = engine.name;
    if (engine.id === config.id) link.setAttribute('aria-current', 'page');
    $('engines').append(link);
  }
  function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }
  function status(message, tone = '') {
    $('status').textContent = message;
    $('status').dataset.tone = tone;
  }
  function placeholder(title, detail) {
    $('placeholder-title').textContent = title;
    $('placeholder-detail').textContent = detail;
    $('placeholder').hidden = false;
  }
  function capabilities(state) {
    canPointer = Boolean(state.canPointer && state.canScreenshot && (!state.phase || state.phase === 'ready'));
    screen.setAttribute('aria-disabled', String(!canPointer));
    if (!state.canScreenshot) {
      screen.hidden = true;
      $('interaction-hint').textContent = '텍스트와 DOM을 확인하는 엔진입니다. 실제 화면과 좌표 기반 입력은 지원하지 않습니다.';
      if ($('text-output').hidden) placeholder('텍스트 전용 · 실제 웹 화면 없음', '페이지에서 읽은 텍스트가 아래에 표시됩니다.');
    } else {
      $('interaction-hint').textContent = canPointer
        ? '화면을 클릭하면 마우스·키보드 입력이 전달됩니다. 캡챠는 직접 확인해 주세요. Shift+Esc: 주소창'
        : '화면 확인 전용 · 이 엔진의 입력 전달은 지원되지 않습니다.';
    }
    $('note').textContent = state.note || '';
    $('note').hidden = !state.note;
  }
  capabilities(config);
  function requestResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const width = Math.min(3840, Math.max(320, Math.round(viewport.clientWidth)));
      const height = Math.min(2160, Math.max(240, Math.round(viewport.clientHeight)));
      const next = `${width}x${height}`;
      if (next !== lastResize && send({ type: 'resize', width, height })) lastResize = next;
    }, 180);
  }
  function connect() {
    clearTimeout(reconnectTimer);
    if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
    status('연결 중…');
    $('reconnect').hidden = true;
    const url = new URL('/session', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', config.token);
    socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      attempts = 0;
      lastResize = '';
      status('브라우저 상태 확인 중…');
      requestResize();
    });
    socket.addEventListener('message', ({ data }) => {
      let message;
      try { message = JSON.parse(data); } catch { return; }
      if (message.type === 'state') {
        capabilities(message);
        if (document.activeElement !== address && message.url) address.value = message.url;
        $('page-title').textContent = message.title || '';
        remoteWidth = message.width || remoteWidth;
        remoteHeight = message.height || remoteHeight;
        $('dimensions').textContent = `${remoteWidth} × ${remoteHeight}`;
        const labels = { idle: '대기 중', starting: '브라우저 시작 중…', ready: '연결됨', error: '브라우저 오류' };
        status(message.error || labels[message.phase] || message.phase, message.phase === 'error' ? 'error' : message.phase === 'ready' ? 'ready' : '');
        if (message.phase === 'error') {
          placeholder('브라우저를 표시할 수 없습니다', `${message.error || '알 수 없는 오류'}\n세션 초기화로 다시 시도할 수 있습니다.`);
          screen.hidden = true;
        } else if (message.phase === 'starting') {
          screen.hidden = true;
          placeholder('브라우저 페이지를 여는 중입니다', '현재 엔진의 응답을 기다리고 있습니다.');
        }
      } else if (message.type === 'frame') {
        remoteWidth = message.width || remoteWidth;
        remoteHeight = message.height || remoteHeight;
        screen.src = `data:${message.mime || 'image/png'};base64,${message.data}`;
        screen.hidden = false;
        $('placeholder').hidden = true;
        $('text-output').hidden = true;
        $('dimensions').textContent = `${remoteWidth} × ${remoteHeight}`;
      } else if (message.type === 'text') {
        $('text-output').textContent = message.content || '페이지 텍스트가 없습니다.';
        $('text-output').hidden = false;
        $('placeholder').hidden = true;
      } else if (message.type === 'error') {
        status(message.message, 'error');
      }
    });
    socket.addEventListener('close', () => {
      status('연결이 끊겼습니다. 다시 연결 중…', 'error');
      $('reconnect').hidden = false;
      canPointer = false;
      if (attempts++ < 8) reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** (attempts - 1), 15000));
      else status('연결이 끊겼습니다. 다시 연결을 눌러 주세요.', 'error');
    });
    socket.addEventListener('error', () => status('서버에 연결할 수 없습니다.', 'error'));
  }
  $('reconnect').addEventListener('click', () => { attempts = 0; connect(); });
  $('navigation').addEventListener('submit', (event) => {
    event.preventDefault();
    let url;
    try { url = new URL(address.value); } catch { status('http:// 또는 https://로 시작하는 주소를 입력해 주세요.', 'error'); return; }
    if (!['http:', 'https:'].includes(url.protocol)) { status('HTTP와 HTTPS 주소만 열 수 있습니다.', 'error'); return; }
    if (send({ type: 'navigate', url: url.href })) status('페이지 이동 중…');
    else status('연결 후 다시 이동해 주세요.', 'error');
  });
  document.querySelectorAll('[data-target]').forEach((button) => button.addEventListener('click', () => {
    const targets = { cloudflare: config.initialUrl, mew: 'http://127.0.0.1:5000/', google: 'https://accounts.google.com/ServiceLogin' };
    const url = targets[button.dataset.target];
    address.value = url;
    if (send({ type: 'navigate', url })) status('페이지 이동 중…');
    else status('연결 후 다시 이동해 주세요.', 'error');
  }));
  document.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => send({ type: button.dataset.command })));
  $('restart').addEventListener('click', () => {
    if (window.confirm('현재 브라우저 세션을 종료하고 새로 시작할까요? 로그인과 페이지 상태가 초기화됩니다.')) send({ type: 'restart' });
  });
  function point(event) {
    const rect = screen.getBoundingClientRect();
    const width = screen.naturalWidth || remoteWidth;
    const height = screen.naturalHeight || remoteHeight;
    const scale = Math.min(rect.width / width, rect.height / height);
    const left = rect.left + (rect.width - width * scale) / 2;
    const top = rect.top + (rect.height - height * scale) / 2;
    const x = (event.clientX - left) / scale;
    const y = (event.clientY - top) / scale;
    if (x < 0 || y < 0 || x >= width || y >= height || !Number.isFinite(x + y)) return null;
    return { x: Math.round(x), y: Math.round(y) };
  }
  function pointer(event, action) {
    if (!event.isTrusted || !canPointer) return;
    const position = point(event) || (action === 'up' ? lastPointer : null);
    if (!position) return;
    lastPointer = position;
    event.preventDefault();
    if (action === 'down') {
      heldButton = ['left', 'middle', 'right'][event.button] || 'left';
      const close = performance.now() - lastPress.time < 500 && Math.abs(lastPress.x - position.x) < 5 && Math.abs(lastPress.y - position.y) < 5;
      lastPress = { time: performance.now(), ...position, count: close && lastPress.count === 1 ? 2 : 1 };
      ime.focus({ preventScroll: true });
      screen.setPointerCapture(event.pointerId);
    }
    const message = { type: 'pointer', action, ...position, button: action === 'move' ? 'left' : heldButton, clickCount: lastPress.count || 1 };
    if (action === 'move') {
      pendingMove = message;
      if (!moveTimer) moveTimer = setTimeout(() => { send(pendingMove); moveTimer = null; }, 32);
    } else {
      if (pendingMove && moveTimer) { clearTimeout(moveTimer); moveTimer = null; send(pendingMove); }
      send(message);
    }
  }
  screen.addEventListener('pointerdown', (event) => pointer(event, 'down'));
  screen.addEventListener('pointerup', (event) => pointer(event, 'up'));
  screen.addEventListener('pointercancel', (event) => pointer(event, 'up'));
  screen.addEventListener('pointermove', (event) => pointer(event, 'move'));
  screen.addEventListener('contextmenu', (event) => event.preventDefault());
  screen.addEventListener('focus', () => { if (canPointer) ime.focus({ preventScroll: true }); });
  screen.addEventListener('wheel', (event) => {
    if (!event.isTrusted || !canPointer) return;
    const position = point(event);
    if (!position) return;
    event.preventDefault();
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? remoteHeight : 1;
    if (!pendingWheel) pendingWheel = { type: 'wheel', ...position, deltaX: 0, deltaY: 0 };
    pendingWheel.deltaX += event.deltaX * multiplier;
    pendingWheel.deltaY += event.deltaY * multiplier;
    if (!wheelTimer) wheelTimer = setTimeout(() => { pendingWheel.deltaX = Math.max(-10000, Math.min(10000, pendingWheel.deltaX)); pendingWheel.deltaY = Math.max(-10000, Math.min(10000, pendingWheel.deltaY)); send(pendingWheel); pendingWheel = null; wheelTimer = null; }, 32);
  }, { passive: false });
  ime.addEventListener('keydown', (event) => {
    if (!event.isTrusted || !canPointer || composing || event.isComposing || event.key === 'Process') return;
    // Non-ASCII input follows composition/input; ordinary keys keep native key events.
    if (event.key.length === 1 && !/^[\x20-\x7e]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) return;
    if (['Shift', 'Control', 'Alt', 'Meta', 'Dead', 'Unidentified'].includes(event.key)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') return;
    // Keep an escape route to the local browser toolbar for keyboard users.
    if (event.key === 'Escape' && event.shiftKey) { event.preventDefault(); address.focus(); return; }
    event.preventDefault();
    send({ type: 'key', key: event.key, ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey, shiftKey: event.shiftKey });
  });
  ime.addEventListener('compositionstart', () => { composing = true; });
  ime.addEventListener('compositionend', (event) => {
    composing = false;
    if (canPointer && event.isTrusted && event.data) send({ type: 'text', text: event.data });
    committedComposition = event.data;
    setTimeout(() => { committedComposition = undefined; }, 0);
    ime.value = '';
  });
  ime.addEventListener('input', (event) => {
    if (composing || event.isComposing) return;
    if (committedComposition && event.data === committedComposition) { committedComposition = undefined; ime.value = ''; return; }
    if (event.inputType === 'insertFromComposition') { ime.value = ''; return; }
    if (canPointer && event.isTrusted && ime.value) send({ type: 'text', text: ime.value });
    ime.value = '';
  });
  ime.addEventListener('paste', (event) => {
    if (!event.isTrusted || !canPointer) return;
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain');
    if (text) send({ type: 'text', text });
  });
  new ResizeObserver(requestResize).observe(viewport);
  window.addEventListener('pagehide', () => { clearTimeout(reconnectTimer); socket?.close(); });
  connect();
})();
