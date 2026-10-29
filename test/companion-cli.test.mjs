import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const command = (...args) => spawnSync('python3', ['companion/clicker.py', ...args], { encoding: 'utf8' });

test('companion CLI help works before installing desktop dependencies', () => {
  const result = command('--help');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--code PRIVATE_CODE/);
});

test('short six-character session reference gives actionable error, not unknown argument', () => {
  const result = command('--code', 'HZKCMH');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /six-character session reference/);
  assert.match(result.stderr, /Copy private connection code/);
  assert.doesNotMatch(result.stderr, /unrecognized arguments/);
});

test('full private code is accepted as an optional argument', () => {
  const validCode = `${'a'.repeat(16)}.${'b'.repeat(32)}`;
  const result = command('--code', validCode, '--server', 'file://not-a-web-server');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Server must be a valid/);
  assert.doesNotMatch(result.stderr, /unrecognized arguments/);
});
