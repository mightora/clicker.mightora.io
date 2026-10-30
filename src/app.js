(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { id: '', hostToken: '', remoteToken: '', ws: null, closing: false, live: false, nativeConnected: false, received: 0, sent: 0, reconnects: 0, privateCodeShown: false };
  const arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  const wsUrl = id => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/rooms/${id}/ws`;
  const allRemoteButtons = () => [...document.querySelectorAll('[data-key]')];

  function showAlert(message) { window.alert(message); }
  async function copyText(value, button) {
    try {
      await navigator.clipboard.writeText(value);
      if (button) { const old = button.textContent; button.textContent = 'Copied ✓'; setTimeout(() => { button.textContent = old; }, 1800); }
      return true;
    } catch { window.prompt('Copy this text:', value); return false; }
  }
  function setPhonePresence(value) {
    $('phoneStatus').textContent = value ? 'Phone connected' : 'Waiting for your phone';
    $('phoneHint').textContent = value ? 'Your phone has joined the session.' : 'Scan the QR code on your phone to pair.';
    $('phoneStatusDot').classList.toggle('online', value);
  }
  function setNativePresence(value) {
    state.nativeConnected = value;
    $('nativeStatus').textContent = value ? 'Computer helper connected ✓ — ready to present' : 'Waiting for the computer helper to connect';
    $('nativeStatus').classList.toggle('online', value);
  }
  function showPrivateCode(show) {
    state.privateCodeShown = show;
    $('desktopCodePreview').textContent = show
      ? `${state.id}.${state.hostToken}`
      : '••••••••••••••••.••••••••••••••••••••••••••••••••';
    $('desktopCodePreview').setAttribute('aria-label', show ? 'Full private connection code is visible' : 'Private connection code is hidden');
    $('toggleDesktopCode').textContent = show ? 'Hide' : 'Show';
    $('toggleDesktopCode').setAttribute('aria-pressed', String(show));
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
      showPrivateCode(false);
      $('copyDesktopCodeLabel').textContent = 'Copy private connection code';
      $('copyCodeMessage').textContent = 'This is the full code the helper needs. Keep it private and paste it into the helper with Ctrl+V (or Cmd+V on Mac).';
      $('qrCode').replaceChildren();
      if (typeof window.QRCode === 'function') {
        new window.QRCode($('qrCode'), { text: remoteLink, width: 190, height: 190, colorDark: '#12243a', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
      } else {
        $('qrCode').textContent = 'QR unavailable — use Copy phone link';
      }
      $('copyRemoteLink').onclick = () => copyText(remoteLink, $('copyRemoteLink'));
      $('copyDesktopCode').onclick = async () => {
        const copied = await copyText(`${state.id}.${state.hostToken}`);
        $('copyDesktopCodeLabel').textContent = copied ? 'Copied! Now paste into your helper' : 'Copy private connection code';
        $('copyCodeMessage').textContent = copied
          ? '✓ Copied. Go to the helper window and press Ctrl+V (or Cmd+V on Mac), then Enter.'
          : 'Your browser opened the private code for manual copying. Select all, copy, then paste it into the helper.';
      };
      $('toggleDesktopCode').onclick = () => showPrivateCode(!state.privateCodeShown);
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
    showPrivateCode(false);
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
    const platforms = {
      windows: {
        badge: 'WINDOWS · PORTABLE · NO PYTHON', title: 'Get the Windows desktop app',
        description: 'One portable EXE. No Python or installer required. Click below and open the file from your browser\'s Downloads list.',
        link: '/downloads/mightora-clicker-windows.exe', label: 'Download Clicker for Windows (.exe)', hint: 'Direct download, no GitHub account or build pipeline. This version is unsigned; Windows may warn or block it.',
        steps: ['Open the downloaded <strong>mightora-clicker-windows.exe</strong> on your computer.', 'Start a session below, then click <strong>Copy private connection code</strong>.', 'Paste the code into the EXE when asked, and return to your slides.'],
      },
      macos: {
        badge: 'MAC · NO PYTHON INSTALLATION', title: 'Get the Mac desktop app',
        description: 'Download the ready-made Mac file directly. No GitHub account or Python installation needed.',
        link: '/downloads/mightora-clicker-macos', label: 'Download Clicker for Mac', hint: 'Unsigned for now. macOS may require you to approve the app and grant Accessibility access.',
        steps: ['Download the <strong>mightora-clicker-macos</strong> app from the latest public release.', 'Run it on your Mac. macOS may ask you for Accessibility permission to control slides.', 'Start a session below, copy the <strong>private connection code</strong>, and paste it into the app.'],
      },
      linux: {
        badge: 'LINUX · NO PYTHON INSTALLATION', title: 'Get the Linux desktop app',
        description: 'Download the ready-made Linux file directly. No GitHub account or Python installation needed.',
        link: '/downloads/mightora-clicker-linux', label: 'Download Clicker for Linux', hint: 'Use an X11 desktop where possible. Wayland may block simulated keypresses.',
        steps: ['Download <strong>mightora-clicker-linux</strong> from the latest release.', 'Mark the file executable (<code>chmod +x mightora-clicker-linux</code>), then run it on your desktop.', 'Start a session below, copy the <strong>private connection code</strong>, and paste it into the app.'],
      },
    };
    function choosePlatform(platform) {
      const option = platforms[platform] || platforms.windows;
      document.querySelectorAll('[data-platform]').forEach(button => {
        const selected = button.dataset.platform === platform;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      $('downloadBadge').textContent = option.badge;
      $('downloadTitle').textContent = option.title;
      $('downloadDescription').textContent = option.description;
      $('mainDownload').href = option.link;
      $('mainDownloadLabel').textContent = option.label;
      $('downloadHint').textContent = option.hint;
      $('mainDownload').setAttribute('download', option.link.split('/').pop());
      $('mainDownload').removeAttribute('target');
      $('mainDownload').removeAttribute('rel');
      $('downloadSteps').innerHTML = option.steps.map(step => `<li>${step}</li>`).join('');
    }
    document.querySelectorAll('[data-platform]').forEach(button => button.addEventListener('click', () => choosePlatform(button.dataset.platform)));
    const system = navigator.userAgent.toLowerCase();
    choosePlatform(system.includes('mac') ? 'macos' : system.includes('linux') && !system.includes('android') ? 'linux' : 'windows');
    const header = document.querySelector('mightora-header');
    const updateHeaderHeight = () => document.documentElement.style.setProperty('--site-header-h', `${Math.ceil(header.getBoundingClientRect().height || 76)}px`);
    updateHeaderHeight();
    if (window.ResizeObserver) new ResizeObserver(updateHeaderHeight).observe(header);
    window.addEventListener('resize', updateHeaderHeight);
    $('startSession').addEventListener('click', startSession);
    $('startSessionSecondary').addEventListener('click', startSession);
    $('endSession').addEventListener('click', endSession);
  }
})();
