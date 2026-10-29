/* Mightora Clicker — Cloudflare Worker and Durable Object relay. MIT licensed. */

const PAGE_HTML = __PAGE_HTML__;
const PAGE_CSS = __PAGE_CSS__;
const PAGE_JS = __PAGE_JS__;
const QR_JS = __QR_JS__;
const SCRIPT_HASH = __SCRIPT_HASH__;
const COMPANION_PY = __COMPANION_PY__;
const COMPANION_PS = __COMPANION_PS__;
const COMPANION_ZIP_BASE64 = __COMPANION_ZIP_BASE64__;

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const ALLOWED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const enc = new TextEncoder();

function randomSecret(bytes = 24) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function digest(value) {
  const result = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('');
}

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

function safeResponse(body, type, maxAge = 'no-store') {
  return new Response(body, {
    headers: {
      'content-type': type,
      'cache-control': maxAge,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'x-frame-options': 'DENY',
      'content-security-policy': `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'self' 'sha256-${SCRIPT_HASH}' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https://raw.githubusercontent.com https://techtweedie.github.io https://cdn.jsdelivr.net; connect-src 'self' wss: https://raw.githubusercontent.com https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net`,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'GET' && path === '/') return safeResponse(PAGE_HTML, 'text/html; charset=utf-8');
    if (request.method === 'GET' && path === '/assets/app.css') return safeResponse(PAGE_CSS, 'text/css; charset=utf-8');
    if (request.method === 'GET' && path === '/assets/app.js') return safeResponse(PAGE_JS, 'text/javascript; charset=utf-8');
    if (request.method === 'GET' && path === '/assets/qrcode.min.js') return safeResponse(QR_JS, 'text/javascript; charset=utf-8', 'public, max-age=86400');
    if (request.method === 'GET' && path === '/downloads/clicker.py') {
      return new Response(COMPANION_PY, {headers: {
        'content-type':'text/x-python; charset=utf-8', 'content-disposition':'attachment; filename="mightora-clicker.py"',
        'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'
      }});
    }
    if (request.method === 'GET' && path === '/downloads/clicker-windows.ps1') {
      return new Response(COMPANION_PS, {headers: {
        'content-type':'application/octet-stream', 'content-disposition':'attachment; filename="mightora-clicker-windows.ps1"',
        'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'
      }});
    }
    if (request.method === 'GET' && path === '/downloads/clicker-companion.zip') {
      const bytes = Uint8Array.from(atob(COMPANION_ZIP_BASE64), char => char.charCodeAt(0));
      return new Response(bytes, {headers: {
        'content-type':'application/zip', 'content-disposition':'attachment; filename="mightora-clicker-companion.zip"',
        'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'
      }});
    }
    if (request.method === 'GET' && path === '/api/health') return json({ ok: true, product: 'Mightora Clicker' });

    if (path === '/api/sessions' && request.method === 'POST') {
      const id = randomSecret(12);
      const hostToken = randomSecret();
      const remoteToken = randomSecret();
      const stub = env.CLICKER_ROOMS.get(env.CLICKER_ROOMS.idFromName(id));
      const init = await stub.fetch('https://room.internal/init', {
        method: 'POST',
        body: JSON.stringify({ hostHash: await digest(hostToken), remoteHash: await digest(remoteToken) }),
      });
      if (!init.ok) return json({ error: 'Unable to create a session' }, 503);
      return json({ id, hostToken, remoteToken, expiresAt: Date.now() + SESSION_TTL_MS }, 201);
    }

    const socketMatch = /^\/api\/rooms\/([A-Za-z0-9_-]{16})\/ws$/.exec(path);
    if (socketMatch && request.method === 'GET') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket required' }, 426);
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return json({ error: 'Origin not permitted' }, 403);
      const stub = env.CLICKER_ROOMS.get(env.CLICKER_ROOMS.idFromName(socketMatch[1]));
      return stub.fetch(new Request('https://room.internal/socket', request));
    }

    const closeMatch = /^\/api\/rooms\/([A-Za-z0-9_-]{16})\/close$/.exec(path);
    if (closeMatch && request.method === 'POST') {
      if ((request.headers.get('content-length') || '0') > 256) return json({ error: 'Invalid request' }, 413);
      const value = await request.json().catch(() => ({}));
      if (typeof value.hostToken !== 'string' || value.hostToken.length > 128) return json({ error: 'Invalid credential' }, 400);
      const stub = env.CLICKER_ROOMS.get(env.CLICKER_ROOMS.idFromName(closeMatch[1]));
      return stub.fetch('https://room.internal/close', { method: 'POST', body: JSON.stringify({ hash: await digest(value.hostToken) }) });
    }
    return json({ error: 'Not found' }, 404);
  },
};

/** Each session has a single, isolated Durable Object. No user accounts or analytics. */
export class ClickerRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/init' && request.method === 'POST') {
      if (await this.ctx.storage.get('session')) return json({ error: 'Already initialised' }, 409);
      const { hostHash, remoteHash } = await request.json();
      if (!/^[0-9a-f]{64}$/.test(hostHash) || !/^[0-9a-f]{64}$/.test(remoteHash)) return json({ error: 'Invalid hashes' }, 400);
      const expiresAt = Date.now() + SESSION_TTL_MS;
      await this.ctx.storage.put('session', { hostHash, remoteHash, expiresAt });
      await this.ctx.storage.setAlarm(expiresAt);
      return json({ ok: true });
    }
    if (path === '/close' && request.method === 'POST') {
      const record = await this.ctx.storage.get('session');
      const { hash } = await request.json();
      if (!record || hash !== record.hostHash) return json({ error: 'Unauthorised' }, 403);
      await this.endSession('ended');
      return json({ ok: true });
    }
    if (path === '/socket' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const record = await this.ctx.storage.get('session');
      if (!record || Date.now() > record.expiresAt) return json({ error: 'Session expired' }, 410);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ role: 'guest', openedAt: Date.now() });
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: 'Not found' }, 404);
  }

  sockets(role) {
    return this.ctx.getWebSockets().filter(s => s.deserializeAttachment()?.role === role);
  }

  send(ws, value) {
    try { ws.send(JSON.stringify(value)); } catch { /* stale socket */ }
  }

  status() {
    const hosts = this.sockets('host');
    const remotes = this.sockets('remote');
    const nativeConnected = hosts.some(s => Boolean(s.deserializeAttachment()?.native));
    const payload = { type: 'presence', hostConnected: hosts.length > 0, remoteConnected: remotes.length > 0, nativeConnected };
    for (const ws of [...hosts, ...remotes]) this.send(ws, payload);
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 512) { ws.close(1009, 'Message too large'); return; }
    let data;
    try { data = JSON.parse(message); } catch { return; }
    const att = ws.deserializeAttachment() || { role: 'guest' };
    if (att.role === 'guest') {
      if (Date.now() - att.openedAt > 15_000 || data?.type !== 'auth' || !['host', 'remote'].includes(data?.role) || typeof data?.token !== 'string') {
        ws.close(1008, 'Authentication required'); return;
      }
      const record = await this.ctx.storage.get('session');
      if (!record || Date.now() > record.expiresAt) { ws.close(1008, 'Session expired'); return; }
      const targetHash = data.role === 'host' ? record.hostHash : record.remoteHash;
      if (data.token.length > 128 || await digest(data.token) !== targetHash) { ws.close(1008, 'Invalid credentials'); return; }
      if (data.role === 'remote') for (const old of this.sockets('remote')) old.close(1000, 'Connected on another device');
      ws.serializeAttachment({ role: data.role, native: false, windowStart: 0, commandCount: 0 });
      this.send(ws, { type: 'ready', expiresAt: record.expiresAt });
      this.status();
      return;
    }
    if (data?.type === 'ping') { this.send(ws, { type: 'pong' }); return; }
    if (att.role === 'host') {
      if (data?.type === 'host_info') {
        att.native = data.native === true;
        ws.serializeAttachment(att);
        this.status();
      }
      return;
    }
    if (att.role === 'remote' && data?.type === 'key' && ALLOWED_KEYS.has(data.key)) {
      const now = Date.now();
      if (now - att.windowStart >= 1000) { att.windowStart = now; att.commandCount = 0; }
      if (++att.commandCount > 12) { ws.serializeAttachment(att); return; }
      ws.serializeAttachment(att);
      for (const host of this.sockets('host')) this.send(host, { type: 'key', key: data.key });
      this.send(ws, { type: 'ack', key: data.key });
    }
  }

  webSocketClose() { this.status(); }
  webSocketError() { this.status(); }

  async endSession(reason) {
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, { type: reason });
      try { ws.close(1000, 'Session ended'); } catch { /* already closed */ }
    }
    await this.ctx.storage.deleteAll();
  }

  async alarm() { await this.endSession('expired'); }
}
