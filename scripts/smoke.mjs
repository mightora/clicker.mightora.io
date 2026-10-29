/** Production smoke test. Opens and closes an ephemeral session; prints no secrets. */
const origin = process.argv[2] || 'https://clicker.mightora.io';
const created = await fetch(new URL('/api/sessions', origin), { method: 'POST' });
if (!created.ok) throw new Error(`Session creation failed: ${created.status}`);
const { id, hostToken, remoteToken } = await created.json();
const path = new URL(`/api/rooms/${id}/ws`, origin);
path.protocol = path.protocol === 'https:' ? 'wss:' : 'ws:';
const sockets = [];

function join(role, token) {
  const socket = new WebSocket(path);
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${role} authentication timed out`)), 12000);
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error(`${role} socket error`)); });
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'auth', role, token })));
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.type === 'ready') { clearTimeout(timeout); resolve(socket); }
    });
  });
}

try {
  const host = await join('host', hostToken);
  const phone = await join('remote', remoteToken);
  const received = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Arrow command was not relayed')), 12000);
    host.addEventListener('message', event => {
      const value = JSON.parse(event.data);
      if (value.type === 'key') { clearTimeout(timeout); resolve(value.key); }
    });
  });
  phone.send(JSON.stringify({ type: 'key', key: 'ArrowRight' }));
  if (await received !== 'ArrowRight') throw new Error('Wrong key relayed');
  console.log('PASS: HTTPS session, authenticated WebSockets and arrow command relay');
} finally {
  for (const socket of sockets) socket.close();
  await fetch(new URL(`/api/rooms/${id}/close`, origin), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hostToken }),
  }).catch(() => {});
}
