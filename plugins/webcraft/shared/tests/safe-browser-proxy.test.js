'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');
const {
  createSafeBrowserProxy,
  parseConnectTarget,
  resolveAllowedAddress,
} = require('../safe-browser-proxy.js');

function proxyGet(proxyUrl, targetUrl) {
  const proxy = new URL(proxyUrl);
  return new Promise((resolve, reject) => {
    const request = http.get({
      host: proxy.hostname,
      port: proxy.port,
      path: targetUrl,
      headers: { host: new URL(targetUrl).host },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject);
  });
}

function proxyConnect(proxyUrl, authority) {
  const proxy = new URL(proxyUrl);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.hostname, port: Number(proxy.port) });
    socket.once('connect', () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    });
    socket.once('data', (chunk) => {
      resolve(chunk.toString().split('\r\n', 1)[0]);
      socket.destroy();
    });
    socket.on('error', reject);
  });
}

test('CONNECT target parsing supports hostnames and IPv6', () => {
  assert.deepEqual(parseConnectTarget('example.com:443'), { hostname: 'example.com', port: 443 });
  assert.deepEqual(parseConnectTarget('[::1]:8443'), { hostname: '::1', port: 8443 });
});

test('private addresses require an exact opted-in host and port', async () => {
  await assert.rejects(
    () => resolveAllowedAddress('127.0.0.1', 3000, {}),
    /Blocked private/,
  );
  await assert.doesNotReject(() => resolveAllowedAddress('127.0.0.1', 3000, {
    allowPrivateNetwork: true,
    allowedPrivateHost: '127.0.0.1',
    allowedPrivatePort: 3000,
  }));
  await assert.rejects(
    () => resolveAllowedAddress('127.0.0.1', 22, {
      allowPrivateNetwork: true,
      allowedPrivateHost: '127.0.0.1',
      allowedPrivatePort: 3000,
    }),
    /Blocked private/,
  );
});

test('proxy blocks private egress by default and pins an explicitly allowed endpoint', async (t) => {
  const target = http.createServer((_request, response) => response.end('fixture-ok'));
  await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
  t.after(() => target.close());
  const { port } = target.address();

  const blockedProxy = await createSafeBrowserProxy({ timeout: 2000 });
  t.after(() => blockedProxy.close());
  const blocked = await proxyGet(blockedProxy.url, `http://127.0.0.1:${port}/`);
  assert.equal(blocked.status, 403);
  assert.equal(await proxyConnect(blockedProxy.url, '169.254.169.254:80'), 'HTTP/1.1 403 Forbidden');

  const allowedProxy = await createSafeBrowserProxy({
    allowPrivateNetwork: true,
    allowedPrivateHost: '127.0.0.1',
    allowedPrivatePort: port,
    timeout: 2000,
  });
  t.after(() => allowedProxy.close());
  const allowed = await proxyGet(allowedProxy.url, `http://127.0.0.1:${port}/`);
  assert.deepEqual(allowed, { status: 200, body: 'fixture-ok' });
  const differentPort = await proxyGet(allowedProxy.url, 'http://127.0.0.1:1/');
  assert.equal(differentPort.status, 403);
});
