import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8');
const html = read('index.html');
const inline = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
if (!inline) throw new Error('Missing inline bootstrap for Mightora footer');
const hash = crypto.createHash('sha256').update(inline[1]).digest('base64');

// Reproducible, dependency-free ZIP with stored (uncompressed) files.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const [filename, content] of entries) {
    const name = Buffer.from(filename);
    const data = Buffer.from(content);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const locals = Buffer.concat(localParts);
  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(locals.length, 16);
  return Buffer.concat([locals, directory, end]);
}

const helperNames = [
  'clicker.py', 'clicker-windows.ps1', 'requirements.txt', 'README.txt',
  'setup-windows.bat', 'start-windows.bat', 'setup-mac-linux.sh', 'start-mac-linux.sh',
];
const helperFiles = helperNames.map(name => [name, fs.readFileSync(path.join(root, 'companion', name))]);
helperFiles.push(['LICENSE', fs.readFileSync(path.join(root, 'LICENSE'))]);
const zip = createZip(helperFiles);
const inputs = {
  '__PAGE_HTML__': JSON.stringify(html),
  '__PAGE_CSS__': JSON.stringify(`${read('app.css')}\n${read('download.css')}`),
  '__PAGE_JS__': JSON.stringify(read('app.js')),
  '__QR_JS__': JSON.stringify(read('qrcode.min.js')),
  '__SCRIPT_HASH__': JSON.stringify(hash),
  '__COMPANION_PY__': JSON.stringify(fs.readFileSync(path.join(root, 'companion', 'clicker.py'), 'utf8')),
  '__COMPANION_PS__': JSON.stringify(fs.readFileSync(path.join(root, 'companion', 'clicker-windows.ps1'), 'utf8')),
  '__COMPANION_ZIP_BASE64__': JSON.stringify(zip.toString('base64')),
};
let output = read('worker.js');
for (const [placeholder, value] of Object.entries(inputs)) {
  if (!output.includes(placeholder)) throw new Error(`Missing ${placeholder}`);
  output = output.replace(placeholder, () => value);
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'worker.mjs'), output);
fs.writeFileSync(path.join(root, 'dist', 'clicker-companion.zip'), zip);
console.log(`Built dist/worker.mjs (${Buffer.byteLength(output)} bytes)`);
