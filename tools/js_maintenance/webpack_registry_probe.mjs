#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const pageUrl = process.argv[2];
const outputPath = process.argv[3] || 'docs/js-maintenance/official-current/webpack-registry-probe.json';
if (!pageUrl) {
  console.error('Usage: webpack_registry_probe.mjs <page-url> [output-path]');
  process.exit(2);
}

const TARGET_MODULES = ['36728', '6886', '75640'];
const SAMPLE_DELAYS = [6000, 14000, 28000];
const KEYWORDS = [
  'core-js', 'regenerator', 'polyfill', 'Symbol', 'Promise', 'Object.defineProperty',
  'globalThis', 'setImmediate', 'process', 'Buffer', 'lodash', 'webpack', 'SAL_',
  'WebGL', 'AudioContext', 'crypto', 'TextEncoder', 'TextDecoder',
];

async function probeFrame(frame) {
  return frame.evaluate(async ({ targetModules, keywords }) => {
    const result = {
      frameUrl: location.href,
      globalNames: [],
      globals: {},
      errors: [],
    };
    const names = Object.getOwnPropertyNames(window)
      .filter(name => name.startsWith('webpackChunk') || name.startsWith('webpackJsonp'))
      .slice(0, 40);
    result.globalNames = names;

    async function digest(text) {
      try {
        const bytes = new TextEncoder().encode(text);
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hash)).map(value => value.toString(16).padStart(2, '0')).join('');
      } catch (error) {
        return '';
      }
    }

    for (const name of names) {
      try {
        const array = window[name];
        if (!Array.isArray(array)) {
          result.globals[name] = { isArray: false, type: typeof array };
          continue;
        }
        const entries = array.map((entry, index) => {
          const chunks = Array.isArray(entry?.[0]) ? entry[0].map(String) : [];
          const modules = entry?.[1] && typeof entry[1] === 'object' ? Object.keys(entry[1]) : [];
          return { index, chunks, moduleCount: modules.length, moduleIds: modules.slice(0, 300) };
        });

        let requireObject = window.__GG_CAPTURED_WEBPACK_REQUIRE__?.[name] || null;
        if (!requireObject && typeof array.push === 'function') {
          window.__GG_CAPTURED_WEBPACK_REQUIRE__ = window.__GG_CAPTURED_WEBPACK_REQUIRE__ || {};
          const probeChunk = `gg_registry_probe_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          array.push([[probeChunk], {}, runtimeRequire => {
            window.__GG_CAPTURED_WEBPACK_REQUIRE__[name] = runtimeRequire;
          }]);
          requireObject = window.__GG_CAPTURED_WEBPACK_REQUIRE__[name] || null;
        }

        const globalInfo = {
          isArray: true,
          entryCount: array.length,
          entries,
          requireCaptured: Boolean(requireObject),
          registryModuleCount: 0,
          registryModuleIds: [],
          targetModules: {},
        };

        if (requireObject) {
          const registry = requireObject.m && typeof requireObject.m === 'object' ? requireObject.m : {};
          const cache = requireObject.c && typeof requireObject.c === 'object' ? requireObject.c : {};
          const registryIds = Object.keys(registry);
          globalInfo.registryModuleCount = registryIds.length;
          globalInfo.registryModuleIds = registryIds.slice(0, 1000);

          for (const id of targetModules) {
            const factory = registry[id];
            const source = typeof factory === 'function'
              ? Function.prototype.toString.call(factory)
              : '';
            const cacheEntry = cache[id];
            const exportsValue = cacheEntry?.exports;
            let exportKeys = [];
            if ((typeof exportsValue === 'object' && exportsValue !== null) || typeof exportsValue === 'function') {
              try { exportKeys = Object.getOwnPropertyNames(exportsValue).slice(0, 60); } catch (_) { }
            }
            const markerHits = keywords.filter(keyword => source.includes(keyword));
            globalInfo.targetModules[id] = {
              presentInRegistry: Boolean(factory),
              sourceLength: source.length,
              sourceSha256: source ? await digest(source) : '',
              sourcePreview: source
                ? source.slice(0, 420).replace(/\s+/g, ' ')
                : '',
              markerHits,
              cached: Boolean(cacheEntry),
              exportsType: cacheEntry ? typeof exportsValue : '',
              exportKeys,
            };
          }
        }
        result.globals[name] = globalInfo;
      } catch (error) {
        result.errors.push(`${name}: ${String(error).slice(0, 700)}`);
      }
    }
    return result;
  }, { targetModules: TARGET_MODULES, keywords: KEYWORDS });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  viewport: { width: 412, height: 915 },
  locale: 'zh-CN',
});
const page = await context.newPage();
const consoleWarnings = [];
page.on('console', message => {
  if (['warning', 'error'].includes(message.type())) {
    consoleWarnings.push({ type: message.type(), text: message.text().slice(0, 700) });
  }
});

let navigationError = '';
try {
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
} catch (error) {
  navigationError = String(error).slice(0, 1000);
}

const samples = [];
let elapsed = 0;
for (const delay of SAMPLE_DELAYS) {
  const wait = Math.max(0, delay - elapsed);
  if (wait) await page.waitForTimeout(wait);
  elapsed = delay;
  const pages = context.pages();
  const sample = { afterMs: delay, pages: [] };
  for (const currentPage of pages) {
    const pageItem = {
      pageUrl: currentPage.url(),
      title: await currentPage.title().catch(() => ''),
      frames: [],
      workers: [],
    };
    for (const frame of currentPage.frames()) {
      try {
        pageItem.frames.push(await probeFrame(frame));
      } catch (error) {
        pageItem.frames.push({ frameUrl: frame.url(), error: String(error).slice(0, 800) });
      }
    }
    for (const worker of currentPage.workers()) {
      const workerItem = { url: worker.url(), probe: null, error: '' };
      try {
        workerItem.probe = await worker.evaluate(async ({ targetModules, keywords }) => {
          const names = Object.getOwnPropertyNames(self)
            .filter(name => name.startsWith('webpackChunk') || name.startsWith('webpackJsonp'));
          return { names, targetModules, keywords: keywords.filter(keyword => String(self).includes(keyword)) };
        }, { targetModules: TARGET_MODULES, keywords: KEYWORDS });
      } catch (error) {
        workerItem.error = String(error).slice(0, 800);
      }
      pageItem.workers.push(workerItem);
    }
    sample.pages.push(pageItem);
  }
  samples.push(sample);
}

const summary = Object.fromEntries(TARGET_MODULES.map(id => [id, {
  present: false,
  locations: [],
  sourceHashes: [],
  sourceLengths: [],
  markerHits: [],
  cached: false,
  exportsTypes: [],
  exportKeys: [],
}]));

for (const sample of samples) {
  for (const pageItem of sample.pages) {
    for (const frame of pageItem.frames) {
      for (const [globalName, globalInfo] of Object.entries(frame.globals || {})) {
        for (const id of TARGET_MODULES) {
          const moduleInfo = globalInfo.targetModules?.[id];
          if (!moduleInfo?.presentInRegistry) continue;
          const target = summary[id];
          target.present = true;
          target.locations.push({
            afterMs: sample.afterMs,
            pageUrl: pageItem.pageUrl,
            frameUrl: frame.frameUrl,
            globalName,
          });
          if (moduleInfo.sourceSha256) target.sourceHashes.push(moduleInfo.sourceSha256);
          if (moduleInfo.sourceLength) target.sourceLengths.push(moduleInfo.sourceLength);
          target.markerHits.push(...(moduleInfo.markerHits || []));
          target.cached ||= Boolean(moduleInfo.cached);
          if (moduleInfo.exportsType) target.exportsTypes.push(moduleInfo.exportsType);
          target.exportKeys.push(...(moduleInfo.exportKeys || []));
        }
      }
    }
  }
}
for (const target of Object.values(summary)) {
  target.sourceHashes = [...new Set(target.sourceHashes)];
  target.sourceLengths = [...new Set(target.sourceLengths)];
  target.markerHits = [...new Set(target.markerHits)];
  target.exportsTypes = [...new Set(target.exportsTypes)];
  target.exportKeys = [...new Set(target.exportKeys)];
  target.locations = target.locations.filter((value, index, array) =>
    array.findIndex(item => JSON.stringify(item) === JSON.stringify(value)) === index
  );
}

const result = {
  schemaVersion: 1,
  requestedPageUrl: pageUrl,
  navigationError,
  samples,
  targetModuleSummary: summary,
  consoleWarnings: consoleWarnings.slice(0, 100),
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ targetModuleSummary: summary, outputPath }, null, 2));
await browser.close();
