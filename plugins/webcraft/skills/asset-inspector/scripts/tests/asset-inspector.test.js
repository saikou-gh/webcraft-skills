'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  absoluteUrl,
  allowedAssetContentType,
  assertAllowedTarget,
  classifyAssets,
  fetchBuffer,
  hasExecutableMagic,
  isPrivateIp,
  parseArgs,
  publicUrl,
  safeDownloadName,
} = require('../asset-inspector.js');

test('parseArgs accepts portable browser and output options', () => {
  const options = parseArgs([
    'https://example.com/path',
    '--out=reports/assets',
    '--no-browser',
    '--width=390',
    '--allow-private-network',
  ]);
  assert.equal(options.url, 'https://example.com/path');
  assert.equal(options.out, 'reports/assets');
  assert.equal(options.browser, false);
  assert.equal(options.width, 390);
  assert.equal(options.allowPrivateNetwork, true);
  assert.equal(options.privateHost, 'example.com');
});

test('parseArgs rejects non-HTTP URLs', () => {
  assert.throws(() => parseArgs(['file:///etc/passwd']), /Only http/);
  assert.throws(() => parseArgs(['https://user:secret@example.com']), /credentials/);
});

test('classifyAssets resolves relative URLs and ignores data URLs', () => {
  const result = classifyAssets(
    `const hero = '/img/hero.webp'; const model = './scene.glb'; const tiny = 'data:image/png;base64,abc';`,
    'https://example.com/app/',
  );
  assert.deepEqual(result.images, ['https://example.com/img/hero.webp']);
  assert.deepEqual(result.models3d, ['https://example.com/app/scene.glb']);
});

test('absoluteUrl and safeDownloadName are deterministic', () => {
  assert.equal(absoluteUrl('../font.woff2', 'https://example.com/css/main.css'), 'https://example.com/font.woff2');
  assert.equal(safeDownloadName('https://example.com/a/icon.svg?x=1', 0), safeDownloadName('https://example.com/a/icon.svg?x=1', 9));
  assert.match(safeDownloadName('https://example.com/a/icon.svg?x=1', 0), /^[a-f0-9]{10}-icon\.svg$/);
});

test('publicUrl strips credentials and query values from reports', () => {
  assert.equal(
    publicUrl('https://user:secret@example.com/image.png?signature=private#fragment'),
    'https://example.com/image.png',
  );
});

test('private network detection covers common IPv4 and IPv6 ranges', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(isPrivateIp(address), true, address);
  }
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) {
    assert.equal(isPrivateIp(address), false, address);
  }
});

test('private targets require explicit opt-in', async () => {
  await assert.rejects(() => assertAllowedTarget('http://127.0.0.1:3000', false), /Blocked private/);
  await assert.doesNotReject(() => assertAllowedTarget('http://127.0.0.1:3000', true, '127.0.0.1', 3000));
  await assert.rejects(
    () => assertAllowedTarget('http://169.254.169.254/latest', true, '127.0.0.1', 3000),
    /Blocked private/,
  );
});

test('download checks reject executable content and active response types', () => {
  assert.equal(hasExecutableMagic(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00])), true);
  assert.equal(hasExecutableMagic(Buffer.from('plain image bytes')), false);
  assert.equal(allowedAssetContentType('image/png'), true);
  assert.equal(allowedAssetContentType('text/html; charset=utf-8'), false);
  assert.equal(allowedAssetContentType('application/javascript'), false);
});

test('streaming fetch aborts when a chunked response exceeds the byte limit', async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/octet-stream' });
    response.end(Buffer.alloc(4096, 1));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address();
  await assert.rejects(
    () => fetchBuffer(`http://127.0.0.1:${port}/large`, {
      allowPrivateNetwork: true,
      privateHost: '127.0.0.1',
      privatePort: port,
      maxBytes: 128,
      timeout: 2000,
    }),
    /max-bytes/,
  );
});
