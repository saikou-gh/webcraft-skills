#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const dns = require('node:dns').promises;
const net = require('node:net');
const path = require('node:path');
const { createSafeBrowserProxy } = require('../../../shared/safe-browser-proxy.js');

function usage() {
  return `Usage: node capture-animation.js <url> [options]

Options:
  --frames=N             Frames per position (default: 10)
  --interval=MS          Delay between frames (default: 300)
  --scroll=PX            Scroll Y position (default: 0)
  --scroll-steps=N       Evenly spaced page positions (default: 1)
  --width=PX             Viewport width (default: 1440)
  --height=PX            Viewport height (default: 900)
  --out=DIR              Output directory (default: ./animation-frames)
  --prefix=NAME          Safe filename prefix (default: frame)
  --hover=SELECTOR       Hover before capture
  --click=SELECTOR       Click once on a local replica or sandbox
  --allow-actions        Required with --click
  --allow-private-network  Allow a local/private target you control
  --wait=MS              Settle time after navigation (default: 1000)
  --scroll-wait=MS       Settle time after scrolling (default: 250)
  --timeout=MS           Navigation timeout (default: 30000)
  --reduced-motion       Emulate prefers-reduced-motion: reduce
  --help                 Show this help
`;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const options = {
    url: args[0],
    frames: 10,
    interval: 300,
    scroll: 0,
    scrollSteps: 1,
    width: 1440,
    height: 900,
    out: './animation-frames',
    prefix: 'frame',
    hover: null,
    click: null,
    wait: 1000,
    scrollWait: 250,
    timeout: 30000,
    allowActions: false,
    allowPrivateNetwork: false,
    reducedMotion: false,
  };

  for (const arg of args.slice(1)) {
    if (arg === '--reduced-motion') {
      options.reducedMotion = true;
      continue;
    }
    if (arg === '--allow-actions') {
      options.allowActions = true;
      continue;
    }
    if (arg === '--allow-private-network') {
      options.allowPrivateNetwork = true;
      continue;
    }
    const match = arg.match(/^--([a-z][a-z-]*)=(.*)$/);
    if (!match) throw new Error(`Unknown option: ${arg}`);
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!Object.hasOwn(options, key)) throw new Error(`Unknown option: --${match[1]}`);
    if (['frames', 'interval', 'scroll', 'scrollSteps', 'width', 'height', 'wait', 'scrollWait', 'timeout'].includes(key)) {
      const number = Number(match[2]);
      const minimum = key === 'scroll' ? 0 : 1;
      if (!Number.isSafeInteger(number) || number < minimum) {
        throw new Error(`--${match[1]} must be an integer of at least ${minimum}`);
      }
      options[key] = number;
    } else {
      options[key] = match[2];
    }
  }

  if (!options.url) throw new Error('A URL is required.');
  const parsed = new URL(options.url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported.');
  }
  if (parsed.username || parsed.password) throw new Error('URL credentials are not accepted.');
  options.url = parsed.href;
  options.privateHost = options.allowPrivateNetwork ? parsed.hostname.replace(/^\[|\]$/g, '') : null;
  options.privatePort = options.allowPrivateNetwork ? Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)) : null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(options.prefix)) {
    throw new Error('--prefix must contain only letters, digits, dot, underscore, or hyphen (maximum 80 characters).');
  }
  if (options.click && !options.allowActions) throw new Error('--click requires --allow-actions.');
  if (options.click && !options.allowPrivateNetwork) {
    throw new Error('--click is restricted to a local replica or sandbox and requires --allow-private-network.');
  }
  if (options.click && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.replace(/^\[|\]$/g, ''))) {
    throw new Error('--click is restricted to a loopback-hosted replica or sandbox.');
  }
  if (options.click && options.scrollSteps !== 1) throw new Error('--click cannot be combined with --scroll-steps greater than 1.');
  return options;
}

function publicUrl(value) {
  const url = new URL(value);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.href;
}

function safeError(error) {
  return String(error?.message || error).replace(/https?:\/\/[^\s)]+/g, (value) => {
    try {
      return publicUrl(value);
    } catch {
      return '[URL redacted]';
    }
  });
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

async function assertAllowedTarget(value, allowPrivateNetwork, allowedPrivateHost = null, allowedPrivatePort = null) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Blocked protocol: ${url.protocol}`);
  const addresses = net.isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await dns.lookup(url.hostname, { all: true, verbatim: true });
  const containsPrivate = !addresses.length || addresses.some(({ address }) => isPrivateIp(address));
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const explicitlyAllowed = allowPrivateNetwork && allowedPrivateHost === hostname && allowedPrivatePort === port;
  if (containsPrivate && !explicitlyAllowed) {
    throw new Error(`Blocked private or unresolved network target: ${url.hostname}`);
  }
}

async function installNetworkPolicy(page, options) {
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    try {
      const url = new URL(request.url());
      if (['data:', 'blob:', 'about:'].includes(url.protocol)) {
        await request.continue();
        return;
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !options.allowActions) {
        throw new Error('Blocked non-read request.');
      }
      await assertAllowedTarget(url.href, options.allowPrivateNetwork, options.privateHost, options.privatePort);
      await request.continue();
    } catch {
      await request.abort('blockedbyclient').catch(() => {});
    }
  });
}

function prepareOutputDirectory(output) {
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
    throw new Error('Output directory cannot be a symbolic link.');
  }
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  fs.chmodSync(output, 0o700);
  return fs.realpathSync(output);
}

function scrollPositions(pageHeight, viewportHeight, options) {
  if (options.scrollSteps <= 1) return [options.scroll];
  const maximum = Math.max(0, pageHeight - viewportHeight);
  return Array.from({ length: options.scrollSteps }, (_, index) =>
    Math.round((maximum * index) / (options.scrollSteps - 1)),
  );
}

async function loadPuppeteer() {
  try {
    const module = await import('puppeteer');
    return module.default;
  } catch {
    throw new Error('Puppeteer is not installed. Run `npm ci` in this scripts directory.');
  }
}

async function captureAnimation(options) {
  await assertAllowedTarget(
    options.url,
    options.allowPrivateNetwork,
    options.privateHost,
    options.privatePort,
  );
  const puppeteer = await loadPuppeteer();
  const safeProxy = await createSafeBrowserProxy({
    allowPrivateNetwork: options.allowPrivateNetwork,
    allowedPrivateHost: options.privateHost,
    allowedPrivatePort: options.privatePort,
    allowUnsafeMethods: options.allowActions,
    timeout: options.timeout,
  });
  let browser = null;
  let page = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        `--proxy-server=${safeProxy.url}`,
        '--proxy-bypass-list=<-loopback>',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-quic',
        '--disable-sync',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--no-default-browser-check',
        '--no-first-run',
      ],
    });
    page = await browser.newPage();
    await installNetworkPolicy(page, options);
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument(() => {
    class BlockedLiveConnection {
      constructor() {
        throw new DOMException('Live connections are disabled for passive capture.', 'SecurityError');
      }
    }
    Object.defineProperty(window, 'WebSocket', { configurable: false, value: BlockedLiveConnection });
    Object.defineProperty(window, 'EventSource', { configurable: false, value: BlockedLiveConnection });
    Object.defineProperty(navigator, 'sendBeacon', { configurable: false, value: () => false });
    });
    page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
    page.on('popup', (popup) => popup.close().catch(() => {}));
    const client = await page.createCDPSession();
    await client.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    await page.setViewport({ width: options.width, height: options.height });
    if (options.reducedMotion) {
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    }

    await page.goto(options.url, { waitUntil: 'networkidle2', timeout: options.timeout });
    await new Promise((resolve) => setTimeout(resolve, options.wait));
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const positions = scrollPositions(pageHeight, options.height, options);
    const outputDirectory = prepareOutputDirectory(options.out);
    const files = [];
    const captures = [];

    for (const [positionIndex, scrollY] of positions.entries()) {
      await page.evaluate((value) => window.scrollTo(0, value), scrollY);
      await new Promise((resolve) => setTimeout(resolve, options.scrollWait));

      if (options.hover) {
        await page.waitForSelector(options.hover, { visible: true, timeout: options.timeout });
        await page.hover(options.hover);
      }
      if (options.click) {
        await page.waitForSelector(options.click, { visible: true, timeout: options.timeout });
        const clickSafety = await page.$eval(options.click, (element) => {
          const tag = element.tagName.toLowerCase();
          const type = (element.getAttribute('type') || '').toLowerCase();
          const unsafe = (
            tag === 'a' || tag === 'form' || element.hasAttribute('download') ||
            element.hasAttribute('formaction') || element.closest('form') !== null ||
            (tag === 'input' && ['file', 'image', 'submit'].includes(type))
          );
          return { unsafe, tag, type };
        });
        if (clickSafety.unsafe) throw new Error(`Refusing potentially consequential <${clickSafety.tag}> click.`);
        await page.click(options.click);
      }

      for (let frame = 0; frame < options.frames; frame += 1) {
        const positionPart = positions.length > 1 ? `-scroll${String(positionIndex).padStart(2, '0')}` : '';
        const filename = `${options.prefix}${positionPart}-${String(frame).padStart(3, '0')}.png`;
        const filepath = path.join(outputDirectory, filename);
        if (fs.existsSync(filepath)) throw new Error(`Refusing to overwrite existing capture: ${filename}`);
        const startedAt = Date.now();
        await page.screenshot({ path: filepath });
        fs.chmodSync(filepath, 0o600);
        files.push(filename);
        captures.push({ filename, positionIndex, scrollY, frame, elapsedMs: frame * options.interval });
        if (frame < options.frames - 1) {
          const spent = Date.now() - startedAt;
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, options.interval - spent)));
        }
      }
    }

    const summary = {
      url: publicUrl(options.url),
      generatedAt: new Date().toISOString(),
      viewport: { width: options.width, height: options.height },
      pageHeight,
      scrollPositions: positions,
      framesPerPosition: options.frames,
      intervalMs: options.interval,
      reducedMotion: options.reducedMotion,
      hover: options.hover,
      click: options.click,
      files,
      captures,
    };
    fs.writeFileSync(
      path.join(outputDirectory, `${options.prefix}-capture-info.json`),
      `${JSON.stringify(summary, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    return summary;
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await safeProxy.close().catch(() => {});
  }
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`Error: ${safeError(error)}\n\n${usage()}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  try {
    const result = await captureAnimation(options);
    console.log(`Captured ${result.files.length} frames in the selected output directory.`);
    return 0;
  } catch (error) {
    console.error(`Animation capture failed: ${safeError(error)}`);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  assertAllowedTarget,
  captureAnimation,
  isPrivateIp,
  parseArgs,
  publicUrl,
  scrollPositions,
  usage,
};
