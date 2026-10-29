import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker, { ClickerRoom } from '../dist/worker.mjs';

globalThis.crypto ||= crypto.webcrypto;

function mockRoom() {
  const entries = new Map();
  const sockets = [];
  const ctx = {
    storage: {
      get: async key => entries.get(key),
      put: async (key, value) => entries.set(key, value),
      deleteAll: async () => entries.clear(),
      setAlarm: async value => { ctx.alarm = value; },
    },
    getWebSockets: () => sockets.filter(s => !s.closed),
  };
  return { room: new ClickerRoom(ctx, {}), sockets, entries, ctx };
}

function fakeSocket() {
  let att = { role: 'guest', openedAt: Date.now() };
  return {
    sent: [], closed: false,
    deserializeAttachment() { return att; },
    serializeAttachment(value) { att = structuredClone(value); },
    send(value) { this.sent.push(JSON.parse(value)); },
    close() { this.closed = true; },
  };
}

async function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('serves app assets with a restrictive CSP and no-cache HTML', async () => {
  const env = {};
  const index = await worker.fetch(new Request('https://example.org/'), env);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /Your phone\./);
  assert.match(index.headers.get('content-security-policy'), /sha256-/);
  assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(index.headers.get('cache-control'), 'no-store');
  for (const asset of ['app.js', 'app.css', 'qrcode.min.js']) {
    const res = await worker.fetch(new Request(`https://example.org/assets/${asset}`), env);
    assert.equal(res.status, 200);
    assert.ok((await res.text()).length > 100);
  }
});

test('creates a random session and stores only hashed tokens', async () => {
  const { room, entries } = mockRoom();
  const env = { CLICKER_ROOMS: { idFromName: value => value, get: () => ({ fetch: (input, init) => room.fetch(new Request(input, init)) }) } };
  const response = await worker.fetch(new Request('https://example.org/api/sessions', { method: 'POST' }), env);
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.match(payload.id, /^[A-Za-z0-9_-]{16}$/);
  assert.match(payload.hostToken, /^[A-Za-z0-9_-]{32}$/);
  assert.match(payload.remoteToken, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(payload.hostToken, payload.remoteToken);
  const stored = entries.get('session');
  assert.equal(stored.hostHash, await sha(payload.hostToken));
  assert.equal(stored.remoteHash, await sha(payload.remoteToken));
  assert.equal(await worker.fetch(new Request('https://example.org/bad'), env).then(r => r.status), 404);
});

test('only authenticated phones can send the four arrow commands', async () => {
  const { room, sockets } = mockRoom();
  const hostToken = 'h'.repeat(32), remoteToken = 'r'.repeat(32);
  await room.fetch(new Request('https://room.internal/init', {
    method: 'POST',
    body: JSON.stringify({ hostHash: await sha(hostToken), remoteHash: await sha(remoteToken) }),
  }));
  const host = fakeSocket(), phone = fakeSocket(), stranger = fakeSocket();
  sockets.push(host, phone, stranger);
  await room.webSocketMessage(stranger, JSON.stringify({ type: 'auth', role: 'remote', token: 'wrong' }));
  assert.equal(stranger.closed, true);
  await room.webSocketMessage(host, JSON.stringify({ type: 'auth', role: 'host', token: hostToken }));
  await room.webSocketMessage(phone, JSON.stringify({ type: 'auth', role: 'remote', token: remoteToken }));
  assert.equal(host.sent.find(m => m.type === 'ready')?.type, 'ready');
  await room.webSocketMessage(host, JSON.stringify({ type: 'host_info', native: true }));
  assert.equal(phone.sent.findLast(m => m.type === 'presence')?.nativeConnected, true);
  await room.webSocketMessage(phone, JSON.stringify({ type: 'key', key: 'Enter' }));
  await room.webSocketMessage(phone, JSON.stringify({ type: 'key', key: 'ArrowRight' }));
  assert.deepEqual(host.sent.filter(m => m.type === 'key'), [{ type: 'key', key: 'ArrowRight' }]);
  for (let i = 0; i < 20; i++) await room.webSocketMessage(phone, JSON.stringify({ type: 'key', key: 'ArrowDown' }));
  assert.equal(host.sent.filter(m => m.type === 'key').length, 12);
});

test('host can close a session and revoke both sides', async () => {
  const { room, entries } = mockRoom();
  await room.fetch(new Request('https://room.internal/init', { method: 'POST', body: JSON.stringify({ hostHash: await sha('secret'), remoteHash: await sha('phone') }) }));
  const rejected = await room.fetch(new Request('https://room.internal/close', { method: 'POST', body: JSON.stringify({ hash: await sha('wrong') }) }));
  assert.equal(rejected.status, 403);
  const accepted = await room.fetch(new Request('https://room.internal/close', { method: 'POST', body: JSON.stringify({ hash: await sha('secret') }) }));
  assert.equal(accepted.status, 200);
  assert.equal(entries.size, 0);
});
