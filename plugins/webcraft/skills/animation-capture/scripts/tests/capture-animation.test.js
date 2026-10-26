'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertAllowedTarget,
  isPrivateIp,
  parseArgs,
  publicUrl,
  scrollPositions,
} = require('../capture-animation.js');

test('parseArgs reads viewport, timing, and reduced-motion options', () => {
  const options = parseArgs([
    'https://example.com/demo',
    '--width=390',
    '--height=844',
    '--frames=12',
    '--reduced-motion',
  ]);
  assert.equal(options.width, 390);
  assert.equal(options.height, 844);
  assert.equal(options.frames, 12);
  assert.equal(options.reducedMotion, true);
});

test('parseArgs rejects unsafe filename prefixes and non-HTTP URLs', () => {
  assert.throws(() => parseArgs(['https://example.com', '--prefix=../escape']), /prefix/);
  assert.throws(() => parseArgs(['file:///tmp/page.html']), /Only http/);
});

test('parseArgs rejects URL credentials and unsafe click modes', () => {
  assert.throws(() => parseArgs(['https://user:secret@example.com']), /credentials/);
  assert.throws(() => parseArgs(['https://example.com', '--click=.menu']), /allow-actions/);
  assert.throws(
    () => parseArgs(['https://example.com', '--click=.menu', '--allow-actions']),
    /local replica/,
  );
  assert.doesNotThrow(() => parseArgs([
    'http://127.0.0.1:3000',
    '--click=.menu',
    '--allow-actions',
    '--allow-private-network',
  ]));
  assert.throws(() => parseArgs([
    'http://192.168.1.20',
    '--click=.menu',
    '--allow-actions',
    '--allow-private-network',
  ]), /loopback-hosted/);
});

test('scrollPositions includes the first and last available positions', () => {
  assert.deepEqual(scrollPositions(3000, 1000, { scrollSteps: 3, scroll: 0 }), [0, 1000, 2000]);
  assert.deepEqual(scrollPositions(500, 1000, { scrollSteps: 3, scroll: 0 }), [0, 0, 0]);
});

test('publicUrl removes credentials, query strings, and fragments', () => {
  assert.equal(publicUrl('https://user:secret@example.com/path?token=abc#part'), 'https://example.com/path');
});

test('private targets require explicit opt-in', async () => {
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('1.1.1.1'), false);
  await assert.rejects(() => assertAllowedTarget('http://127.0.0.1:3000', false), /Blocked private/);
  await assert.doesNotReject(() => assertAllowedTarget('http://127.0.0.1:3000', true, '127.0.0.1', 3000));
  await assert.rejects(
    () => assertAllowedTarget('http://169.254.169.254/latest', true, '127.0.0.1', 3000),
    /Blocked private/,
  );
});
