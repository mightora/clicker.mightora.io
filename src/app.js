(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { id: '', hostToken: '', remoteToken: '', ws: null, closing: false, live: false, nativeConnected: false, received: 0, sent: 0, reconnects: 0 };
  const arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  const wsUrl = id => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/rooms/${id}/ws`;
  const allRemoteButtons = () => [...document.querySelectorAll('[data-key]')];

  function showAlert(message) { window.alert(message); }
  async function copyText(value, button) {
    try {
      await navigator.clipboard.writeText(value);
      if (button) { const old = button.textContent; button.textContent = 'Copied ✓'; setTimeout(() => { button.textContent = old; }, 1800); }
    } catch { window.prompt('Copy this text:', value); }
  }
  function setPhonePresence(value) {
    $('phoneStatus').textContent = value ? 'Phone connected' : 'Waiting for your phone';
    $('phoneHint').textContent = value ? 'Your phone has joined the session.' : 'Scan the QR code on your phone to pair.';
    $('phoneStatusDot').classList.toggle('online', value);
  }
  function setNativePresence(value) {
    state.nativeConnected = value;
    $('nativeStatus').textContent = value ? 'Desktop companion connected ✓' : 'Companion not connected';
    $('nativeStatus').classList.toggle('online', value);
  }
  function renderHostStatus(connected) {
    $('sessionPill').textContent = connected ? 'Session live' : 'Reconnecting';
    $('sessionPill').classList.toggle('active', connected);
  }
  function connect(role, token, onMessage) {
    const ws = new WebSocket(wsUrl(state.id));
    state.ws = ws;
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'auth', role, token })));
    ws.addEventListener('message', event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      onMessage(data);
    });
    ws.addEventListener('close', () => {
      if (state.closing) return;
      state.live = false;
      if (role === 'host') renderHostStatus(false);
      else setRemoteStatus('Reconnecting', false, 'Connection lost. Trying again…');
      if (state.reconnects++ < 15) setTimeout(() => {
        if (!state.closing) connect(role, token, onMessage);
      }, Math.min(800 * 2 ** Math.min(state.reconnects, 4), 9000));
      else if (role === 'remote') setRemoteStatus('Disconnected', false, 'This session has expired or is unavailable.');
    });
    return ws;
  }

  async function startSession() {
    const buttons = [$('startSession'), $('startSessionSecondary')];
    buttons.forEach(b => { b.disabled = true; b.textContent = 'Creating session…'; });
    try {
      const res = await fetch('/api/sessions', { method: 'POST' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      state.id = data.id; state.hostToken = data.hostToken; state.remoteToken = data.remoteToken;
      const remoteLink = `${location.origin}/#remote/${data.id}/${data.remoteToken}`;
      $('emptySession').classList.add('hidden');
      $('activeSession').classList.remove('hidden');
      $('nativeNote').classList.remove('hidden');
      $('sessionCode').textContent = data.id.slice(0, 6).toUpperCase();
      $('qrCode').replaceChildren();
      if (typeof window.QRCode === 'function') {
        new window.QRCode($('qrCode'), { text: remoteLink, width: 190, height: 190, colorDark: '#12243a', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
      } else {
        $('qrCode').textContent = 'QR unavailable — use Copy phone link';
      }
      $('copyRemoteLink').onclick = () => copyText(remoteLink, $('copyRemoteLink'));
      $('copyDesktopCode').onclick = () => copyText(`${state.id}.${state.hostToken}`, $('copyDesktopCode'));
      state.closing = false; state.reconnects = 0;
      connect('host', state.hostToken, data => {
        if (data.type === 'ready') { state.live = true; state.reconnects = 0; renderHostStatus(true); state.ws.send(JSON.stringify({ type: 'host_info', native: false })); }
        if (data.type === 'presence') { setPhonePresence(data.remoteConnected); setNativePresence(data.nativeConnected); }
        if (data.type === 'key') { state.received++; $('commandCount').textContent = String(state.received); $('lastKey').textContent = `· Last: ${arrows[data.key] || data.key}`; }
        if (data.type === 'ended' || data.type === 'expired') { resetSession('Session ended'); }
      });
      $('session').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showAlert(`Unable to create a session. Please try again. ${error.message}`);
      buttons.forEach((b, i) => { b.disabled = false; b.innerHTML = i ? 'Create session <span aria-hidden="true">→</span>' : '<span class="button-icon">↗</span> Start a clicker session'; });
    }
  }

  function resetSession(message = 'Not started') {
    state.closing = true;
    state.ws?.close(); state.ws = null; state.id = ''; state.hostToken = '';
    state.remoteToken = ''; state.nativeConnected = false; state.received = 0;
    $('emptySession').classList.remove('hidden'); $('activeSession').classList.add('hidden'); $('nativeNote').classList.add('hidden');
    $('sessionPill').textContent = message; $('sessionPill').classList.remove('active');
    [$('startSession'), $('startSessionSecondary')].forEach((b, i) => { b.disabled = false; b.innerHTML = i ? 'Create session <span aria-hidden="true">→</span>' : '<span class="button-icon">↗</span> Start a clicker session'; });
  }
  async function endSession() {
    const { id, hostToken } = state;
    resetSession('Ended');
    try { await fetch(`/api/rooms/${id}/close`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hostToken }), keepalive: true }); } catch { /* expires automatically */ }
  }

  function setRemoteStatus(label, online, description) {
    $('remoteStatus').textContent = label;
    $('remoteDot').classList.toggle('online', online);
    if (description) $('remoteDescription').textContent = description;
    allRemoteButtons().forEach(b => { b.disabled = !online; });
  }
  function remoteMessage(data) {
    if (data.type === 'ready') { state.live = true; state.reconnects = 0; setRemoteStatus('Paired', false, 'Waiting for the computer companion to connect…'); }
    if (data.type === 'presence') {
      state.nativeConnected = data.nativeConnected;
      setRemoteStatus(data.nativeConnected ? 'Connected' : 'Waiting', data.nativeConnected,
        data.nativeConnected ? 'Your desktop is ready. Tap an arrow to navigate.' : 'Keep the presentation open and connect the desktop companion.');
    }
    if (data.type === 'ack') { state.sent++; $('remoteSentCount').textContent = `${state.sent} command${state.sent === 1 ? '' : 's'} sent`; }
    if (data.type === 'ended' || data.type === 'expired') { state.closing = true; state.ws?.close(); setRemoteStatus('Ended', false, 'This session has ended. Ask the presenter for a new QR code.'); }
  }
  function sendKey(key) {
    if (!state.nativeConnected || state.ws?.readyState !== WebSocket.OPEN || !state.live) return;
    state.ws.send(JSON.stringify({ type: 'key', key }));
    if (navigator.vibrate) navigator.vibrate(18);
    const b = document.querySelector(`[data-key="${key}"]`);
    if (b) { b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 105); }
  }
  function initRemote(id, token) {
    document.body.classList.add('remote-mode');
    $('remoteView').classList.remove('hidden');
    if (!/^[A-Za-z0-9_-]{16}$/.test(id) || !/^[A-Za-z0-9_-]{32}$/.test(token)) {
      setRemoteStatus('Invalid link', false, 'The pairing link is invalid. Scan the QR code again.'); return;
    }
    state.id = id; state.closing = false;
    connect('remote', token, remoteMessage);
    allRemoteButtons().forEach(b => b.addEventListener('click', () => sendKey(b.dataset.key)));
    document.addEventListener('keydown', e => {
      if (e.repeat || !Object.prototype.hasOwnProperty.call(arrows, e.key)) return;
      e.preventDefault(); sendKey(e.key);
    });
    $('remoteDisconnect').onclick = () => { state.closing = true; state.ws?.close(); setRemoteStatus('Disconnected', false, 'You have left the session.'); };
  }
  const match = /^#remote\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (match) initRemote(match[1], match[2]);
  else {
    const downloadSection = document.createElement('section');
    downloadSection.id = 'download-helper';
    downloadSection.className = 'download-helper page-wrap';
    downloadSection.setAttribute('aria-labelledby', 'downloadHeading');
    downloadSection.innerHTML = `
      <div class="download-heading"><div><div class="kicker">DESKTOP HELPERS / CHOOSE YOUR WAY</div><h2 id="downloadHeading">Get your computer ready.</h2></div><p>Phones need no app. For real PowerPoint or Keynote keyboard control, your computer needs one small helper. Pick the option that suits you.</p></div>
      <div class="helper-grid">
        <article class="helper-card featured"><div class="helper-icon" aria-hidden="true">▣</div><div class="helper-label">Easiest / No Python installation</div><h3>Standalone desktop app</h3><p>Portable Windows, macOS and Linux builds. Open the latest successful GitHub Actions run, then download your operating system's file under Artifacts.</p><a class="helper-btn emphasis" target="_blank" rel="noopener noreferrer" href="https://github.com/mightora/clicker.mightora.io/actions/workflows/desktop-releases.yml">Browse desktop downloads ↗</a></article>
        <article class="helper-card"><div class="helper-icon" aria-hidden="true">⌘</div><div class="helper-label">Windows / No Python</div><h3>PowerShell helper</h3><p>Works with Windows' built-in PowerShell, with no Python packages. Use where your computer's script execution policy allows it.</p><a class="helper-btn" href="/downloads/clicker-windows.ps1" download>Download PowerShell script ↓</a></article>
        <article class="helper-card"><div class="helper-icon" aria-hidden="true">⌨</div><div class="helper-label">Cross-platform / Python option</div><h3>Python starter kit</h3><p>One ZIP contains the Python script, setup launchers, requirements and instructions for Windows, macOS and Linux.</p><a class="helper-btn" href="/downloads/clicker-companion.zip" download>Download starter ZIP ↓</a><div class="helper-extra"><a href="/downloads/clicker.py" download>Or download only the .py script ↓</a></div></article>
      </div>
      <div class="helper-steps"><h3>How to set it up</h3><ol><li><strong>Download:</strong> choose the standalone build, Windows PowerShell file or Python starter ZIP above.</li><li><strong>Start on your computer:</strong> standalone build — open the downloaded executable. PowerShell — open the <code>.ps1</code> where your policy permits. Python ZIP — extract it, then on Windows run <code>setup-windows.bat</code>; on macOS/Linux run <code>sh setup-mac-linux.sh</code> in Terminal.</li><li><strong>Pair:</strong> start a session on this website and select <strong>Copy private connection code</strong>. Paste that code into the helper.</li><li><strong>Present:</strong> click back into PowerPoint, Keynote or your slides. Scan the QR on your phone and use the arrows.</li></ol><p>Downloaded the Python script alone? First run <code>python -m pip install "websockets>=14,<17" "pynput>=1.8,<2"</code>, then <code>python mightora-clicker.py</code>. macOS may ask for Accessibility permission. Keep the private code secret.</p></div>
      <p class="helper-note"><strong>Something not working?</strong> If you see “No module named websockets” or “pynput”, install dependencies using the ZIP setup script. If a computer blocks PowerShell, respect its policy and use the standalone app instead. Your presentation window must be in focus for arrow presses to work.</p>`;
    document.querySelector('.how-section')?.after(downloadSection);
    const companionLink = document.createElement('a');
    companionLink.href = '#download-helper';
    companionLink.textContent = 'Choose a download ↓';
    companionLink.className = 'text-button';
    document.querySelector('.desktop-connection')?.append(companionLink);
    const miniPanel = document.createElement('div');
    miniPanel.className = 'download-panel';
    miniPanel.innerHTML = `<h4>Download your helper</h4><div class="mini-downloads"><a href="/downloads/clicker-companion.zip" download>Starter ZIP ↓</a><a href="/downloads/clicker.py" download>Python script ↓</a><a href="/downloads/clicker-windows.ps1" download>Windows PowerShell ↓</a><a href="https://github.com/mightora/clicker.mightora.io/actions/workflows/desktop-releases.yml" target="_blank" rel="noopener noreferrer">Standalone builds ↗</a></div><p>Python ZIP: extract, run <code>setup-windows.bat</code> on Windows or <code>sh setup-mac-linux.sh</code> on macOS/Linux. See <a href="#download-helper">full setup instructions</a> below.</p>`;
    document.querySelector('.desktop-connection')?.after(miniPanel);
    $('startSession').addEventListener('click', startSession);
    $('startSessionSecondary').addEventListener('click', startSession);
    $('endSession').addEventListener('click', endSession);
  }
})();
