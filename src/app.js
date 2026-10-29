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
    $('startSession').addEventListener('click', startSession);
    $('startSessionSecondary').addEventListener('click', startSession);
    $('endSession').addEventListener('click', endSession);
  }
})();
