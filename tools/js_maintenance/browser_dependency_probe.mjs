#!/usr/bin/env node

import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const pageUrl = process.argv[2];
const outputPath = process.argv[3] || 'docs/js-maintenance/official-current/browser-probe.json';
if (!pageUrl) {
  console.error('Usage: browser_dependency_probe.mjs <page-url> [output-path]');
  process.exit(2);
}

const TARGET_MODULES = ['36728', '6886', '75640'];
const MAX_SCRIPT_BYTES = 35 * 1024 * 1024;
const clickLabels = ['无需下载', '在线看', '开始游戏', '在线玩'];
const SAFE_QUERY_VALUE_KEYS = new Set([
  'gindex', 'version', 'quality', 'action', 'engine', 'client_type', 'channel_type',
  'platform', 'plat', 'pmode', 'shop_type', 'definition', 'status', 'op',
]);
const requests = [];
const responses = [];
const consoles = [];
const pageErrors = [];
const scriptBodies = new Map();
const pages = new Set();

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sanitizeUrl(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    const entries = [];
    for (const [key, rawValue] of parsed.searchParams.entries()) {
      const normalized = key.toLowerCase();
      entries.push([key, SAFE_QUERY_VALUE_KEYS.has(normalized) ? rawValue.slice(0, 80) : '<redacted>']);
    }
    parsed.search = '';
    for (const [key, safeValue] of entries) parsed.searchParams.append(key, safeValue);
    parsed.hash = '';
    return parsed.toString();
  } catch (_) {
    return String(value).replace(/([?&][^=&\s]{1,80}=)[^&#\s]*/g, '$1<redacted>');
  }
}

function sanitizeText(value) {
  return String(value)
    .replace(/https?:\/\/[^\s"'<>]+/g, match => sanitizeUrl(match))
    .replace(/\b(token|sign|r-key|nonce|open_id|auth|session|key)=([^\s&,;]+)/gi, '$1=<redacted>')
    .slice(0, 700);
}

function moduleEvidence(buffer) {
  const text = buffer.toString('utf8');
  const result = {};
  for (const id of TARGET_MODULES) {
    const defPatterns = [
      new RegExp(`(^|[^A-Za-z0-9_$])${id}\\s*:\\s*(?:function\\s*\\(|\\([^)]{0,260}\\)\\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\\s*=>)`, 'g'),
      new RegExp(`(^|[^A-Za-z0-9_$])['\"]${id}['\"]\\s*:\\s*(?:function\\s*\\(|\\([^)]{0,260}\\)\\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\\s*=>)`, 'g'),
    ];
    let definitionCount = 0;
    for (const pattern of defPatterns) definitionCount += [...text.matchAll(pattern)].length;
    const usePattern = new RegExp(`(^|[^A-Za-z0-9_$])[A-Za-z_$][A-Za-z0-9_$]*\\(\\s*${id}\\s*\\)`, 'g');
    const useCount = [...text.matchAll(usePattern)].length;
    result[id] = {
      defined: definitionCount > 0,
      definitionCount,
      used: useCount > 0,
      useCount,
    };
  }
  return result;
}

function attachPage(page) {
  if (pages.has(page)) return;
  pages.add(page);
  page.on('console', message => {
    consoles.push({
      pageUrl: sanitizeUrl(page.url()),
      type: message.type(),
      text: sanitizeText(message.text()),
    });
  });
  page.on('pageerror', error => {
    pageErrors.push({ pageUrl: sanitizeUrl(page.url()), message: sanitizeText(error) });
  });
  page.on('request', request => {
    requests.push({
      pageUrl: sanitizeUrl(page.url()),
      method: request.method(),
      resourceType: request.resourceType(),
      url: sanitizeUrl(request.url()),
      queryKeys: (() => {
        try { return [...new Set([...new URL(request.url()).searchParams.keys()])].sort(); }
        catch (_) { return []; }
      })(),
    });
  });
  page.on('response', async response => {
    const request = response.request();
    const headers = await response.allHeaders().catch(() => ({}));
    const rawUrl = response.url();
    const item = {
      pageUrl: sanitizeUrl(page.url()),
      status: response.status(),
      resourceType: request.resourceType(),
      url: sanitizeUrl(rawUrl),
      queryKeys: (() => {
        try { return [...new Set([...new URL(rawUrl).searchParams.keys()])].sort(); }
        catch (_) { return []; }
      })(),
      contentType: headers['content-type'] || '',
      contentLength: headers['content-length'] || '',
      cacheControl: headers['cache-control'] || '',
    };
    responses.push(item);
    const isScript = request.resourceType() === 'script' || /javascript/i.test(item.contentType) || /\.js(?:\?|$)/i.test(rawUrl);
    if (!isScript || scriptBodies.has(rawUrl)) return;
    try {
      const body = await response.body();
      if (body.length > MAX_SCRIPT_BYTES) {
        scriptBodies.set(rawUrl, { skipped: true, reason: 'too_large', size: body.length });
        return;
      }
      scriptBodies.set(rawUrl, {
        skipped: false,
        size: body.length,
        sha256: sha256(body),
        targetModules: moduleEvidence(body),
        hasWebpackChunkGlobal: body.includes(Buffer.from('webpackChunk_lodash_modules')),
        salIdentifierCount: new Set(body.toString('utf8').match(/\bSAL_[A-Za-z0-9_]+\b/g) || []).size,
      });
    } catch (error) {
      scriptBodies.set(rawUrl, { skipped: true, reason: sanitizeText(error) });
    }
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  viewport: { width: 412, height: 915 },
  locale: 'zh-CN',
  ignoreHTTPSErrors: false,
});

await context.addInitScript(({ targetModules }) => {
  const state = {
    chunks: [],
    moduleIds: [],
    targetModules: Object.fromEntries(targetModules.map(id => [id, { seen: false, chunkIndexes: [] }])),
    hookErrors: [],
  };
  Object.defineProperty(window, '__GG_WEBPACK_PROBE__', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: state,
  });
  const globalName = 'webpackChunk_lodash_modules';
  let backing = [];
  const seenModules = new Set();
  function inspectEntry(entry) {
    try {
      if (!Array.isArray(entry)) return;
      const chunkIds = Array.isArray(entry[0]) ? entry[0].map(String) : [String(entry[0])];
      const modules = entry[1] && typeof entry[1] === 'object' ? entry[1] : {};
      const moduleIds = Object.keys(modules);
      const chunkIndex = state.chunks.length;
      state.chunks.push({ chunkIds, moduleIds, moduleCount: moduleIds.length });
      for (const id of moduleIds) {
        seenModules.add(String(id));
        if (state.targetModules[id]) {
          state.targetModules[id].seen = true;
          state.targetModules[id].chunkIndexes.push(chunkIndex);
        }
      }
      state.moduleIds = Array.from(seenModules).sort((a, b) => Number(a) - Number(b));
    } catch (error) {
      state.hookErrors.push(String(error).slice(0, 500));
    }
  }
  function hookArray(value) {
    if (!Array.isArray(value)) return value;
    for (const entry of value) inspectEntry(entry);
    const originalPush = value.push;
    if (!originalPush.__ggProbeWrapped) {
      const wrapped = function (...entries) {
        for (const entry of entries) inspectEntry(entry);
        return originalPush.apply(this, entries);
      };
      Object.defineProperty(wrapped, '__ggProbeWrapped', { value: true });
      value.push = wrapped;
    }
    return value;
  }
  backing = hookArray(backing);
  try {
    Object.defineProperty(window, globalName, {
      configurable: true,
      enumerable: true,
      get() { return backing; },
      set(value) { backing = hookArray(value); },
    });
  } catch (error) {
    state.hookErrors.push(String(error).slice(0, 500));
  }
}, { targetModules: TARGET_MODULES });

context.on('page', attachPage);
const page = await context.newPage();
attachPage(page);
let navigationError = '';
try {
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
} catch (error) {
  navigationError = sanitizeText(error);
}

await page.waitForTimeout(5000);
const clickAttempts = [];
for (const label of clickLabels) {
  let clicked = false;
  let errorText = '';
  for (const currentPage of [...pages]) {
    try {
      const locator = currentPage.getByText(label, { exact: true }).first();
      if (await locator.count()) {
        await locator.click({ timeout: 2500 });
        clicked = true;
        await currentPage.waitForTimeout(2500);
        break;
      }
    } catch (error) {
      errorText = sanitizeText(error);
    }
  }
  clickAttempts.push({ label, clicked, error: errorText });
}
await page.waitForTimeout(15000);

const pageSnapshots = [];
for (const currentPage of [...pages]) {
  const snapshot = {
    url: sanitizeUrl(currentPage.url()),
    title: await currentPage.title().catch(() => ''),
    probe: null,
    performanceResources: [],
  };
  snapshot.probe = await currentPage.evaluate(() => window.__GG_WEBPACK_PROBE__ || null).catch(() => null);
  const performanceItems = await currentPage.evaluate(() =>
    performance.getEntriesByType('resource').map(entry => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      duration: Math.round(entry.duration),
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0,
      decodedBodySize: entry.decodedBodySize || 0,
    }))
  ).catch(() => []);
  snapshot.performanceResources = performanceItems.map(item => ({ ...item, name: sanitizeUrl(item.name) }));
  pageSnapshots.push(snapshot);
}

const scriptInventory = [...scriptBodies.entries()].map(([rawUrl, value]) => ({ url: sanitizeUrl(rawUrl), ...value }));
const moduleDefinitions = Object.fromEntries(TARGET_MODULES.map(id => [id, scriptInventory.filter(item => item.targetModules?.[id]?.defined).map(item => item.url)]));
const moduleUses = Object.fromEntries(TARGET_MODULES.map(id => [id, scriptInventory.filter(item => item.targetModules?.[id]?.used).map(item => item.url)]));
const runtimeSeen = Object.fromEntries(TARGET_MODULES.map(id => [id, pageSnapshots.some(item => item.probe?.targetModules?.[id]?.seen)]));

const result = {
  schemaVersion: 2,
  requestedPageUrl: sanitizeUrl(pageUrl),
  privacy: {
    queryValuesRedacted: true,
    retainedStableQueryValueKeys: [...SAFE_QUERY_VALUE_KEYS].sort(),
  },
  navigationError,
  clickAttempts,
  pages: pageSnapshots,
  requestCount: requests.length,
  responseCount: responses.length,
  requests,
  responses,
  scriptInventory,
  targetModules: {
    definitionsInResponses: moduleDefinitions,
    usesInResponses: moduleUses,
    seenInWebpackRuntime: runtimeSeen,
  },
  consoleMessages: consoles.slice(0, 300),
  pageErrors: pageErrors.slice(0, 100),
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  pageCount: pageSnapshots.length,
  requestCount: requests.length,
  scriptCount: scriptInventory.length,
  queryValuesRedacted: true,
  targetModules: result.targetModules,
  outputPath,
}, null, 2));
await browser.close();
