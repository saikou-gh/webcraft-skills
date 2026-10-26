#!/usr/bin/env node
'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const net = require('node:net');

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isPrivateIp(address) {
  if (address.startsWith('::ffff:')) return isPrivateIp(address.slice(7));
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) || a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::' || normalized === '::1' ||
      normalized.startsWith('fc') || normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8')
    );
  }
  return true;
}

function defaultPort(protocol) {
  return protocol === 'https:' ? 443 : 80;
}

function isAllowedPrivateTarget(hostname, port, policy) {
  return (
    policy.allowPrivateNetwork === true &&
    normalizeHostname(hostname) === normalizeHostname(policy.allowedPrivateHost || '') &&
    Number(port) === Number(policy.allowedPrivatePort)
  );
}

async function resolveAllowedAddress(hostname, port, policy) {
  const normalized = normalizeHostname(hostname);
  const addresses = net.isIP(normalized)
    ? [{ address: normalized, family: net.isIPv4(normalized) ? 4 : 6 }]
    : await dns.lookup(normalized, { all: true, verbatim: true });
  if (!addresses.length) throw new Error(`Could not resolve target: ${normalized}`);
  const containsPrivate = addresses.some(({ address }) => isPrivateIp(address));
  if (containsPrivate && !isAllowedPrivateTarget(normalized, port, policy)) {
    throw new Error(`Blocked private network target: ${normalized}:${port}`);
  }
  return addresses[0];
}

function parseConnectTarget(authority) {
  const parsed = new URL(`http://${authority}`);
  return {
    hostname: normalizeHostname(parsed.hostname),
    port: Number(parsed.port || 443),
  };
}

function rejectHttp(response, status = 403) {
  response.writeHead(status, { connection: 'close', 'content-type': 'text/plain' });
  response.end('Blocked by WebCraft browser network policy.');
}

function rejectTunnel(socket) {
  if (socket.destroyed) return;
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
}

async function createSafeBrowserProxy(policy) {
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    void (async () => {
      let target;
      try {
        target = new URL(request.url);
      } catch {
        rejectHttp(response, 400);
        return;
      }
      if (target.protocol !== 'http:') {
        rejectHttp(response);
        return;
      }
      if (target.username || target.password) {
        rejectHttp(response);
        return;
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method || 'GET') && !policy.allowUnsafeMethods) {
        rejectHttp(response);
        return;
      }
      try {
        const port = Number(target.port || defaultPort(target.protocol));
        const { address, family } = await resolveAllowedAddress(target.hostname, port, policy);
        const headers = { ...request.headers, host: target.host, connection: 'close' };
        delete headers['proxy-authorization'];
        delete headers['proxy-connection'];
        const upstream = http.request({
          host: address,
          family,
          port,
          method: request.method,
          path: `${target.pathname}${target.search}`,
          headers,
          agent: false,
        }, (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
          upstreamResponse.pipe(response);
        });
        upstream.setTimeout(policy.timeout || 30000, () => upstream.destroy(new Error('Upstream timed out.')));
        upstream.on('error', () => {
          if (!response.headersSent) rejectHttp(response, 502);
          else response.destroy();
        });
        request.pipe(upstream);
      } catch {
        rejectHttp(response);
      }
    })();
  });

  server.on('connect', (request, clientSocket, head) => {
    void (async () => {
      try {
        const { hostname, port } = parseConnectTarget(request.url);
        const { address, family } = await resolveAllowedAddress(hostname, port, policy);
        const upstream = net.connect({ host: address, family, port });
        sockets.add(upstream);
        upstream.once('connect', () => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length) upstream.write(head);
          clientSocket.pipe(upstream);
          upstream.pipe(clientSocket);
        });
        upstream.setTimeout(policy.timeout || 30000, () => upstream.destroy());
        upstream.on('error', () => rejectTunnel(clientSocket));
        upstream.on('close', () => sockets.delete(upstream));
      } catch {
        rejectTunnel(clientSocket);
      }
    })();
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = {
  createSafeBrowserProxy,
  isPrivateIp,
  parseConnectTarget,
  resolveAllowedAddress,
};
