import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8');
const html = read('index.html');
const inline = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
if (!inline) throw new Error('Missing inline bootstrap for Mightora footer');
const hash = crypto.createHash('sha256').update(inline[1]).digest('base64');
const inputs = {
  '__PAGE_HTML__': JSON.stringify(html),
  '__PAGE_CSS__': JSON.stringify(read('app.css')),
  '__PAGE_JS__': JSON.stringify(read('app.js')),
  '__QR_JS__': JSON.stringify(read('qrcode.min.js')),
  '__SCRIPT_HASH__': JSON.stringify(hash),
};
let output = read('worker.js');
for (const [placeholder, value] of Object.entries(inputs)) {
  if (!output.includes(placeholder)) throw new Error(`Missing ${placeholder}`);
  output = output.replace(placeholder, () => value);
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'worker.mjs'), output);
console.log(`Built dist/worker.mjs (${Buffer.byteLength(output)} bytes)`);
