#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const dns = require('node:dns');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const { createSafeBrowserProxy } = require('../../../shared/safe-browser-proxy.js');

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

function usage() {
  return `Usage: node asset-inspector.js <url> [options]

Options:
  --out=DIR              Output directory (default: ./asset-report)
  --download             Download discovered assets (requires permission)
  --allow-cross-origin-downloads  Include authorized CDN/third-party assets
  --no-browser           Skip runtime browser inspection
  --allow-private-network  Allow localhost/private targets you control
  --width=PX             Browser viewport width (default: 1440)
  --height=PX            Browser viewport height (default: 900)
  --wait=MS              Settle time after navigation (default: 2000)
  --timeout=MS           Request/navigation timeout (default: 30000)
  --max-bytes=N          Maximum bytes read per response (default: 20971520)
  --max-total-bytes=N    Maximum HTML/bundle bytes in one run (default: 104857600)
  --max-bundles=N        Maximum bundles fetched (default: 50)
  --max-downloads=N      Maximum files downloaded (default: 100)
  --max-download-bytes=N Maximum downloaded bytes in one run (default: 209715200)
  --help                 Show this help
`;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const options = {
    url: args[0],
    out: './asset-report',
    download: false,
    allowCrossOriginDownloads: false,
    browser: true,
    allowPrivateNetwork: false,
    width: 1440,
    height: 900,
    wait: 2000,
    timeout: 30000,
    maxBytes: DEFAULT_MAX_BYTES,
    maxTotalBytes: DEFAULT_MAX_TOTAL_BYTES,
    maxBundles: 50,
    maxDownloads: 100,
    maxDownloadBytes: DEFAULT_MAX_DOWNLOAD_BYTES,
  };

  for (const arg of args.slice(1)) {
    if (arg === '--download') {
      options.download = true;
      continue;
    }
    if (arg === '--allow-cross-origin-downloads') {
      options.allowCrossOriginDownloads = true;
      continue;
    }
    if (arg === '--no-browser') {
      options.browser = false;
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
    if (['width', 'height', 'wait', 'timeout', 'maxBytes', 'maxTotalBytes', 'maxBundles', 'maxDownloads', 'maxDownloadBytes'].includes(key)) {
      const number = Number(match[2]);
      if (!Number.isSafeInteger(number) || number <= 0) {
        throw new Error(`--${match[1]} must be a positive integer`);
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
  return options;
}

function isPrivateIp(address) {
  if (address.startsWith('::ffff:')) return isPrivateIp(address.slice(7));
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8')
    );
  }
  return true;
}

async function assertAllowedTarget(value, allowPrivateNetwork, allowedPrivateHost = null, allowedPrivatePort = null) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Blocked non-HTTP protocol: ${url.protocol}`);
  const addresses = net.isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await dns.promises.lookup(url.hostname, { all: true, verbatim: true });
  const containsPrivate = !addresses.length || addresses.some(({ address }) => isPrivateIp(address));
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const explicitlyAllowed = allowPrivateNetwork && allowedPrivateHost === hostname && allowedPrivatePort === port;
  if (containsPrivate && !explicitlyAllowed) {
    throw new Error(`Blocked private or unresolved network target: ${url.hostname}`);
  }
}

function guardedLookup(hostname, _options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) {
      callback(error);
      return;
    }
    if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
      callback(new Error(`Blocked private or unresolved network target: ${hostname}`));
      return;
    }
    const [{ address, family }] = addresses;
    callback(null, address, family);
  });
}

async function requestBuffer(value, options) {
  const url = new URL(value);
  await assertAllowedTarget(url.href, options.allowPrivateNetwork, options.privateHost, options.privatePort);
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const targetPort = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    const targetHost = url.hostname.replace(/^\[|\]$/g, '');
    const useDefaultLookup = (
      options.allowPrivateNetwork &&
      options.privateHost === targetHost &&
      options.privatePort === targetPort
    );
    const requestOptions = {
      headers: { 'user-agent': 'WebCraft-Asset-Inspector/1.0' },
      ...(useDefaultLookup ? {} : { lookup: guardedLookup }),
    };
    const request = client.get(url, requestOptions, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400) {
        const location = response.headers.location;
        response.resume();
        if (!location) {
          reject(new Error(`Redirect without Location header: ${publicUrl(url.href)}`));
          return;
        }
        resolve({ redirect: new URL(location, url).href });
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`${status} response for ${publicUrl(url.href)}`));
        return;
      }
      const declared = Number(response.headers['content-length'] || 0);
      if (declared > options.maxBytes) {
        response.destroy();
        reject(new Error(`Response exceeds --max-bytes: ${publicUrl(url.href)}`));
        return;
      }
      const chunks = [];
      let total = 0;
      let exceeded = false;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > options.maxBytes) {
          exceeded = true;
          response.destroy();
          request.destroy();
          reject(new Error(`Response exceeds --max-bytes: ${publicUrl(url.href)}`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (exceeded) return;
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: String(response.headers['content-type'] || ''),
          finalUrl: url.href,
        });
      });
      response.on('error', (error) => {
        if (!exceeded) reject(error);
      });
    });
    request.setTimeout(options.timeout, () => request.destroy(new Error('Request timed out.')));
    request.on('error', reject);
  });
}

async function fetchBuffer(initialUrl, options) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const result = await requestBuffer(url, options);
    if (result.redirect) {
      url = result.redirect;
      continue;
    }
    return result;
  }
  throw new Error(`Too many redirects: ${publicUrl(initialUrl)}`);
}

async function fetchText(url, options) {
  const result = await fetchBuffer(url, options);
  return { ...result, text: result.buffer.toString('utf8') };
}

function absoluteUrl(candidate, base) {
  try {
    const resolved = new URL(candidate, base);
    return ['http:', 'https:'].includes(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
}

function publicUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) return `${url.protocol}[redacted]`;
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

async function installNetworkPolicy(page, options, requests) {
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    try {
      const url = new URL(request.url());
      if (['data:', 'blob:', 'about:'].includes(url.protocol)) {
        await request.continue();
        return;
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        throw new Error('Blocked non-read request.');
      }
      await assertAllowedTarget(url.href, options.allowPrivateNetwork, options.privateHost, options.privatePort);
      requests.add(publicUrl(url.href));
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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function extractMatches(text, expression, group = 1) {
  return [...text.matchAll(expression)].map((match) => match[group]).filter(Boolean);
}

function classifyAssets(source, baseUrl) {
  const patterns = {
    images: /["'`]([^"'`\s]+\.(?:avif|gif|ico|jpe?g|png|svg|webp)(?:\?[^"'`\s]*)?)["'`]/gi,
    models3d: /["'`]([^"'`\s]+\.(?:3ds|dae|fbx|glb|gltf|obj|ply|stl|usdz)(?:\?[^"'`\s]*)?)["'`]/gi,
    audio: /["'`]([^"'`\s]+\.(?:aac|flac|m4a|mp3|oga|ogg|wav)(?:\?[^"'`\s]*)?)["'`]/gi,
    video: /["'`]([^"'`\s]+\.(?:m4v|mov|mp4|ogv|webm)(?:\?[^"'`\s]*)?)["'`]/gi,
    fonts: /["'`]([^"'`\s]+\.(?:eot|otf|ttf|woff2?)(?:\?[^"'`\s]*)?)["'`]/gi,
  };
  return Object.fromEntries(
    Object.entries(patterns).map(([type, expression]) => [
      type,
      uniqueSorted(extractMatches(source, expression).map((value) => absoluteUrl(value, baseUrl))),
    ]),
  );
}

function detectLibraries(javascript) {
  const checks = [
    ['React', /react-dom|__REACT/i],
    ['Vue', /vue\.runtime|__VUE/i],
    ['Angular', /ng-version|angular\.core/i],
    ['Svelte', /__SVELTE|svelte\/internal/i],
    ['Three.js', /THREE\.|WebGLRenderer|three\/build/i],
    ['Babylon.js', /BABYLON\.|babylonjs/i],
    ['PixiJS', /PIXI\.|pixi\.js/i],
    ['GSAP', /\bgsap\b|ScrollTrigger|TweenMax/i],
    ['Framer Motion', /framer-motion|AnimatePresence/i],
    ['Lottie', /lottie|bodymovin/i],
    ['D3', /d3\.select|d3\.scale/i],
    ['Howler.js', /\bHowl\(|howler/i],
    ['Tone.js', /Tone\./i],
  ];
  return checks.filter(([, expression]) => expression.test(javascript)).map(([name]) => name);
}

async function inspectRuntime(options) {
  await assertAllowedTarget(
    options.url,
    options.allowPrivateNetwork,
    options.privateHost,
    options.privatePort,
  );
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    throw new Error('Puppeteer is not installed. Run `npm ci` in this scripts directory or use --no-browser.');
  }
  const safeProxy = await createSafeBrowserProxy({
    allowPrivateNetwork: options.allowPrivateNetwork,
    allowedPrivateHost: options.privateHost,
    allowedPrivatePort: options.privatePort,
    allowUnsafeMethods: false,
    timeout: options.timeout,
  });
  let browser = null;
  let page = null;
  try {
    browser = await puppeteer.default.launch({
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
    const requests = new Set();
    await installNetworkPolicy(page, options, requests);
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument(() => {
      class BlockedLiveConnection {
        constructor() {
          throw new DOMException('Live connections are disabled for passive inspection.', 'SecurityError');
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
    await page.goto(options.url, { waitUntil: 'networkidle2', timeout: options.timeout });
    await new Promise((resolve) => setTimeout(resolve, options.wait));
    const elements = await page.evaluate(() => ({
      canvases: [...document.querySelectorAll('canvas')].map((canvas) => ({
        width: canvas.width,
        height: canvas.height,
        cssWidth: canvas.getBoundingClientRect().width,
        cssHeight: canvas.getBoundingClientRect().height,
        id: canvas.id || null,
        className: typeof canvas.className === 'string' ? canvas.className : null,
      })),
      images: [...document.images].map((image) => ({
        src: image.currentSrc || image.src,
        width: image.naturalWidth,
        height: image.naturalHeight,
        alt: image.alt.slice(0, 200),
      })),
      video: [...document.querySelectorAll('video')].map((item) => ({ src: item.currentSrc || item.src, poster: item.poster })),
      audio: [...document.querySelectorAll('audio')].map((item) => ({ src: item.currentSrc || item.src })),
      iframes: [...document.querySelectorAll('iframe')].map((item) => item.src),
      svgCount: document.querySelectorAll('svg').length,
    }));
    return {
      ...elements,
      images: elements.images.map((item) => ({ ...item, src: publicUrl(item.src) })),
      video: elements.video.map((item) => ({
        ...item,
        src: item.src ? publicUrl(item.src) : '',
        poster: item.poster ? publicUrl(item.poster) : '',
      })),
      audio: elements.audio.map((item) => ({ ...item, src: item.src ? publicUrl(item.src) : '' })),
      iframes: elements.iframes.map((item) => (item ? publicUrl(item) : '')),
      requests: uniqueSorted([...requests]),
    };
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await safeProxy.close().catch(() => {});
  }
}

function safeDownloadName(url, index) {
  const parsed = new URL(url);
  const base = path.basename(parsed.pathname) || `asset-${index}`;
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || `asset-${index}`;
  const digest = crypto.createHash('sha256').update(url).digest('hex').slice(0, 10);
  return `${digest}-${cleaned}`;
}

function hasExecutableMagic(buffer) {
  return (
    buffer.subarray(0, 2).equals(Buffer.from('MZ')) ||
    buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
    ['feedface', 'feedfacf', 'cafebabe', 'cffaedfe'].includes(buffer.subarray(0, 4).toString('hex'))
  );
}

function allowedAssetContentType(contentType) {
  const normalized = contentType.split(';', 1)[0].trim().toLowerCase();
  return (
    !normalized ||
    normalized.startsWith('image/') ||
    normalized.startsWith('font/') ||
    normalized.startsWith('audio/') ||
    normalized.startsWith('video/') ||
    normalized.startsWith('model/') ||
    ['application/octet-stream', 'application/font-woff', 'application/vnd.ms-fontobject'].includes(normalized)
  );
}

async function downloadAssets(assets, options, outputDirectory, sourceUrl) {
  const directory = path.join(outputDirectory, 'downloaded');
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
    throw new Error('Download directory cannot be a symbolic link.');
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const urls = uniqueSorted(Object.values(assets).flat());
  const sourceOrigin = new URL(sourceUrl).origin;
  const results = [];
  let totalBytes = 0;
  for (const [index, url] of urls.slice(0, options.maxDownloads).entries()) {
    try {
      if (!options.allowCrossOriginDownloads && new URL(url).origin !== sourceOrigin) {
        throw new Error('Cross-origin download requires --allow-cross-origin-downloads.');
      }
      const { buffer, contentType } = await fetchBuffer(url, options);
      if (!allowedAssetContentType(contentType)) throw new Error(`Blocked unexpected content type: ${contentType || 'unknown'}`);
      if (hasExecutableMagic(buffer)) throw new Error('Blocked executable file content.');
      if (totalBytes + buffer.length > options.maxDownloadBytes) {
        results.push({ url: publicUrl(url), error: '--max-download-bytes limit reached' });
        break;
      }
      totalBytes += buffer.length;
      const quarantineSuffix = /svg|xml/i.test(contentType) ? '.txt' : '';
      const filename = `${safeDownloadName(url, index)}${quarantineSuffix}`;
      fs.writeFileSync(path.join(directory, filename), buffer, { flag: 'wx', mode: 0o600 });
      results.push({ url: publicUrl(url), filename, contentType, bytes: buffer.length });
    } catch (error) {
      results.push({ url: publicUrl(url), error: safeError(error) });
    }
  }
  if (urls.length > options.maxDownloads) {
    results.push({ skipped: urls.length - options.maxDownloads, reason: '--max-downloads limit' });
  }
  return results;
}

function writeSummary(report, outputPath) {
  const lines = [
    `# Asset Report: ${report.url}`,
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Rendering and libraries',
    '',
    `- Canvas elements observed: ${report.runtime?.canvases?.length || 0}`,
    `- SVG elements observed: ${report.runtime?.svgCount || 0}`,
    `- Libraries detected: ${report.libraries.join(', ') || 'none'}`,
    '',
    '## Asset inventory',
    '',
  ];
  for (const [type, urls] of Object.entries(report.assets)) {
    lines.push(`### ${type} (${urls.length})`, '', ...urls.map((url) => `- ${url}`), '');
  }
  lines.push('## Bundles', '', ...report.bundles.map((url) => `- ${url}`), '');
  lines.push('## Runtime requests', '', ...(report.runtime?.requests || []).map((url) => `- ${url}`), '');
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, { flag: 'wx', mode: 0o600 });
}

async function inspectAssets(options) {
  const outputDirectory = prepareOutputDirectory(options.out);
  for (const filename of ['asset-report.json', 'asset-summary.md']) {
    if (fs.existsSync(path.join(outputDirectory, filename))) {
      throw new Error(`Refusing to overwrite existing output: ${filename}`);
    }
  }
  const htmlResult = await fetchText(options.url, options);
  const baseUrl = htmlResult.finalUrl || options.url;
  const scriptUrls = extractMatches(htmlResult.text, /<script[^>]+src=["']([^"']+)["']/gi)
    .map((value) => absoluteUrl(value, baseUrl));
  const styleUrls = extractMatches(htmlResult.text, /<link[^>]+href=["']([^"']+)["'][^>]*>/gi)
    .filter((url) => /\.css(?:\?|$)/i.test(url))
    .map((value) => absoluteUrl(value, baseUrl));
  const bundles = uniqueSorted([...scriptUrls, ...styleUrls]);
  const inspectedBundles = bundles.slice(0, options.maxBundles);

  let javascript = '';
  let css = '';
  const bundleErrors = [];
  let totalBytes = htmlResult.buffer.length;
  for (const url of inspectedBundles) {
    try {
      const result = await fetchText(url, options);
      if (totalBytes + result.buffer.length > options.maxTotalBytes) {
        bundleErrors.push({ url: publicUrl(url), error: '--max-total-bytes limit reached' });
        break;
      }
      totalBytes += result.buffer.length;
      if (/\.css(?:\?|$)/i.test(url) || /text\/css/i.test(result.contentType)) css += `\n${result.text}`;
      else javascript += `\n${result.text}`;
    } catch (error) {
      bundleErrors.push({ url: publicUrl(url), error: safeError(error) });
    }
  }
  if (bundles.length > options.maxBundles) {
    bundleErrors.push({ skipped: bundles.length - options.maxBundles, error: '--max-bundles limit' });
  }

  const combined = `${htmlResult.text}\n${javascript}\n${css}`;
  const rawAssets = classifyAssets(combined, baseUrl);
  const report = {
    url: publicUrl(options.url),
    finalUrl: publicUrl(baseUrl),
    generatedAt: new Date().toISOString(),
    viewport: options.browser ? { width: options.width, height: options.height } : null,
    bundles: bundles.map(publicUrl),
    inspectedBundleCount: inspectedBundles.length,
    analyzedBytes: totalBytes,
    bundleErrors,
    assets: Object.fromEntries(
      Object.entries(rawAssets).map(([type, urls]) => [type, uniqueSorted(urls.map(publicUrl))]),
    ),
    libraries: detectLibraries(javascript),
    css: {
      fonts: uniqueSorted(extractMatches(css, /font-family\s*:\s*["']?([^;"'}]+)/gi)),
      keyframes: uniqueSorted(extractMatches(css, /@keyframes\s+([\w-]+)/gi)),
    },
    runtime: null,
  };

  if (options.browser) report.runtime = await inspectRuntime(options);
  if (options.download) report.downloads = await downloadAssets(rawAssets, options, outputDirectory, baseUrl);

  fs.writeFileSync(
    path.join(outputDirectory, 'asset-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  writeSummary(report, path.join(outputDirectory, 'asset-summary.md'));
  return report;
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
    const report = await inspectAssets(options);
    console.log('Wrote asset-report.json and asset-summary.md in the selected output directory.');
    console.log(`Found ${Object.values(report.assets).flat().length} asset references across ${report.bundles.length} bundles.`);
    return 0;
  } catch (error) {
    console.error(`Asset inspection failed: ${safeError(error)}`);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  absoluteUrl,
  allowedAssetContentType,
  assertAllowedTarget,
  classifyAssets,
  fetchBuffer,
  hasExecutableMagic,
  inspectAssets,
  isPrivateIp,
  parseArgs,
  publicUrl,
  safeDownloadName,
  usage,
};
