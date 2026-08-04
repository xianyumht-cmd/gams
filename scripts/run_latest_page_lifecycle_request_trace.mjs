#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "latest-page-lifecycle-request-trace";
const currentFirstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const currentSecondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const entryTap = { x: 105, y: 650 };
const purchaseTap = { x: 187, y: 236 };
const resumeTap = { x: 142, y: 500 };
const targets = [
  "https://m.66rpg.com/h5/1682748?ohp=v3&quality=32",
  "https://m.66rpg.com/h5/1683604?ohp=v3&quality=32",
  "https://m.66rpg.com/h5/1683020?ohp=v3&quality=32",
  "https://m.66rpg.com/h5/1668408?ohp=v3&quality=32",
  "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32",
];

fs.mkdirSync(outputDir, { recursive: true });

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function transformFirstFile(source) {
  let text = source;
  for (const old of [
    "https://gams-script-edge.2320006072.workers.dev/engine/stable.js",
    "https://preview-chat-1b176371-f9ab-4760-b15c-b9d70ed59d23.space-z.ai/game.js",
  ]) text = text.split(old).join(virtualSecondUrl);
  return text;
}

function wrapFirstFile(source) {
  return `(function(){if(window.__GG_V2_CONTROL_LOADED__)return;window.__GG_V2_CONTROL_LOADED__=true;try{\n${source}\n}catch(e){window.__GG_V2_CONTROL_LOADED__=false;console.error('[GG]',e);}})();`;
}

function classifyRequest(url) {
  const lower = String(url || "").toLowerCase();
  if (lower === virtualSecondUrl.toLowerCase()
      || lower.includes("gams-script-edge.2320006072.workers.dev/engine/stable.js")
      || lower.includes("space-z.ai/game.js")) return "second-file";
  if (lower.includes("c2.cgyouxi.com/website/hfplayer/") && lower.includes("/bin/official/game.js")) return "official-file";
  if (lower.includes("raw.githubusercontent.com/xianyumht-cmd/gams")
      && (lower.includes("/remote-script/") || lower.includes("/game-engine/"))) return "forbidden-remote-runtime";
  if (lower.includes("createbuyorder") || lower.includes("createorder")) return "order-request";
  if (lower.includes("/sso/") || lower.includes("passport.")) return "session-request";
  return "page-request";
}

function safeUrl(raw) {
  try {
    const url = new URL(String(raw));
    const keys = [...new Set([...url.searchParams.keys()])].sort();
    return `${url.protocol}//${url.host}${url.pathname}${keys.length ? `?keys=${keys.join(",")}` : ""}`;
  } catch {
    return String(raw || "").slice(0, 300);
  }
}

function redactText(value) {
  return String(value || "")
    .replace(/([?&](?:token|access_token|auth|authorization|code|ticket|session|sid|key|password|pwd)=)[^&#\s]+/gi, "$1<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .slice(0, 3000);
}

const traceInitScript = String.raw`
(() => {
  if (globalThis.__GG_PAGE_TRACE__) return;
  const state = globalThis.__GG_PAGE_TRACE__ = {
    schemaVersion: 1,
    installedAt: Date.now(),
    events: [],
    callbackCandidates: [],
    counters: {
      fetchStarted: 0,
      fetchCompleted: 0,
      xhrStarted: 0,
      xhrCompleted: 0,
      scriptAssignments: 0,
      scriptInserted: 0,
      scriptLoaded: 0,
      scriptFailed: 0,
    },
  };
  const MAX_EVENTS = 5000;
  const push = (type, detail = {}) => {
    try {
      state.events.push({ at: Date.now(), perf: Math.round(performance.now()), type, ...detail });
      if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
    } catch {}
  };
  const safeUrl = (raw) => {
    try {
      const url = new URL(String(raw), location.href);
      const keys = [...new Set([...url.searchParams.keys()])].sort();
      return url.protocol + '//' + url.host + url.pathname + (keys.length ? '?keys=' + keys.join(',') : '');
    } catch { return String(raw || '').slice(0, 300); }
  };
  const storageState = () => {
    const result = {};
    for (const [name, getter] of [['localStorage', () => localStorage], ['sessionStorage', () => sessionStorage]]) {
      try {
        const storage = getter();
        result[name] = { available: true, length: Number(storage.length || 0) };
      } catch (error) {
        result[name] = { available: false, error: String(error && error.name || error).slice(0, 120) };
      }
    }
    try { result.cookies = { available: true, readableLength: String(document.cookie || '').length }; }
    catch (error) { result.cookies = { available: false, error: String(error && error.name || error).slice(0, 120) }; }
    return result;
  };
  const callbackFromUrl = (raw) => {
    try {
      const url = new URL(String(raw), location.href);
      for (const key of ['callback', 'jsonp', 'cb']) {
        const name = url.searchParams.get(key);
        if (name && /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(name)) return name;
      }
    } catch {}
    return null;
  };
  const resolveCallback = (name) => {
    try {
      let cursor = globalThis;
      for (const part of String(name || '').split('.')) cursor = cursor?.[part];
      return typeof cursor === 'function';
    } catch { return false; }
  };
  const observeScript = (script, reason) => {
    try {
      if (!script || String(script.tagName).toLowerCase() !== 'script') return;
      const raw = script.src || script.getAttribute?.('src') || '';
      if (!raw) return;
      const url = safeUrl(raw);
      const callback = callbackFromUrl(raw);
      state.counters.scriptInserted += 1;
      if (callback && !state.callbackCandidates.includes(callback)) state.callbackCandidates.push(callback);
      push('script-observed', { reason, url, callback, callbackRegistered: callback ? resolveCallback(callback) : null });
      script.addEventListener('load', () => {
        state.counters.scriptLoaded += 1;
        push('script-load', { url, callback, callbackRegistered: callback ? resolveCallback(callback) : null });
      }, { once: true });
      script.addEventListener('error', () => {
        state.counters.scriptFailed += 1;
        push('script-error', { url, callback, callbackRegistered: callback ? resolveCallback(callback) : null });
      }, { once: true });
    } catch (error) { push('trace-error', { area: 'observeScript', error: String(error).slice(0, 300) }); }
  };

  push('trace-installed', { url: safeUrl(location.href), storage: storageState() });
  for (const type of ['DOMContentLoaded', 'load', 'pageshow', 'pagehide', 'visibilitychange', 'freeze', 'resume', 'popstate', 'hashchange', 'online', 'offline']) {
    addEventListener(type, (event) => push('lifecycle', {
      name: type,
      persisted: typeof event.persisted === 'boolean' ? event.persisted : null,
      visibilityState: document.visibilityState,
      url: safeUrl(location.href),
    }), true);
  }

  try {
    const originalFetch = globalThis.fetch;
    if (typeof originalFetch === 'function') {
      globalThis.fetch = async function(input, init) {
        const id = ++state.counters.fetchStarted;
        const method = String(init?.method || input?.method || 'GET').toUpperCase();
        const url = safeUrl(input?.url || input);
        push('fetch-start', { id, method, url, bodyPresent: Boolean(init?.body) });
        try {
          const response = await originalFetch.apply(this, arguments);
          state.counters.fetchCompleted += 1;
          push('fetch-end', { id, method, url, status: response.status, ok: response.ok, responseUrl: safeUrl(response.url) });
          return response;
        } catch (error) {
          push('fetch-error', { id, method, url, error: String(error).slice(0, 300) });
          throw error;
        }
      };
      push('patch-installed', { name: 'fetch' });
    }
  } catch (error) { push('trace-error', { area: 'fetch-patch', error: String(error).slice(0, 300) }); }

  try {
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this.__ggTrace = { id: ++state.counters.xhrStarted, method: String(method || 'GET').toUpperCase(), url: safeUrl(url) };
      push('xhr-open', this.__ggTrace);
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
      const meta = this.__ggTrace || { id: ++state.counters.xhrStarted, method: 'GET', url: '' };
      push('xhr-send', { ...meta, bodyPresent: body != null });
      this.addEventListener('loadend', () => {
        state.counters.xhrCompleted += 1;
        push('xhr-end', { ...meta, status: Number(this.status || 0), responseUrl: safeUrl(this.responseURL || meta.url) });
      }, { once: true });
      return send.apply(this, arguments);
    };
    push('patch-installed', { name: 'xhr' });
  } catch (error) { push('trace-error', { area: 'xhr-patch', error: String(error).slice(0, 300) }); }

  try {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    if (descriptor?.set && descriptor?.get) {
      Object.defineProperty(HTMLScriptElement.prototype, 'src', {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value) {
          state.counters.scriptAssignments += 1;
          push('script-src-set', { url: safeUrl(value), callback: callbackFromUrl(value) });
          return descriptor.set.call(this, value);
        },
      });
      push('patch-installed', { name: 'script-src' });
    }
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      if (String(this.tagName).toLowerCase() === 'script' && String(name).toLowerCase() === 'src') {
        state.counters.scriptAssignments += 1;
        push('script-attribute-set', { url: safeUrl(value), callback: callbackFromUrl(value) });
      }
      return setAttribute.apply(this, arguments);
    };
    for (const methodName of ['appendChild', 'insertBefore', 'replaceChild']) {
      const original = Node.prototype[methodName];
      Node.prototype[methodName] = function(node) {
        const result = original.apply(this, arguments);
        observeScript(node, methodName);
        return result;
      };
    }
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes || []) {
        observeScript(node, 'mutation');
        if (node?.querySelectorAll) for (const script of node.querySelectorAll('script[src]')) observeScript(script, 'mutation-descendant');
      }
    }).observe(document, { subtree: true, childList: true });
    push('patch-installed', { name: 'script-observation' });
  } catch (error) { push('trace-error', { area: 'script-patch', error: String(error).slice(0, 300) }); }

  state.snapshot = (stage) => {
    const callbacks = state.callbackCandidates.map((name) => ({ name, registered: resolveCallback(name) }));
    const value = {
      stage,
      at: Date.now(),
      url: safeUrl(location.href),
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      storage: storageState(),
      callbacks,
      counters: { ...state.counters },
      eventCount: state.events.length,
    };
    push('snapshot', value);
    return value;
  };
})();
`;

async function snapshot(page, stage) {
  return page.evaluate((name) => {
    const trace = globalThis.__GG_PAGE_TRACE__;
    return {
      stage: name,
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      traceInstalled: Boolean(trace),
      traceSnapshot: typeof trace?.snapshot === "function" ? trace.snapshot(name) : null,
      navigationGuard: globalThis.__gamsNavigationGuard || null,
      runtimeLoaded: Boolean(globalThis.__GG_V2_CONTROL_LOADED__),
    };
  }, stage);
}

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

async function tap(page, events, stage, point, waitMs) {
  await page.touchscreen.tap(point.x, point.y);
  events.push({ at: Date.now(), type: "tap", stage, ...point });
  await page.waitForTimeout(waitMs);
}

async function runCase(browser, mode, targetUrl, index) {
  const firstRaw = fs.readFileSync(currentFirstPath, "utf8");
  const secondBytes = fs.readFileSync(currentSecondPath);
  const events = [];
  const dialogs = [];
  const consoleMessages = [];
  const pageErrors = [];
  const mainFrameNavigation = [];
  const requestFailures = [];
  const requests = [];
  const responses = [];
  const runtimeLoads = { first: 0, second: 0 };

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  });

  await context.route("**/*", async (route) => {
    const request = route.request();
    const rawUrl = request.url();
    const kind = classifyRequest(rawUrl);
    requests.push({
      at: Date.now(),
      kind,
      method: request.method(),
      resourceType: request.resourceType(),
      url: safeUrl(rawUrl),
      postDataLength: request.postDataBuffer()?.length || 0,
    });
    if (kind === "second-file") {
      runtimeLoads.second += 1;
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: secondBytes });
      return;
    }
    if (kind === "official-file") {
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: "window.__gg_official_engine_blocked__=true;" });
      return;
    }
    if (kind === "forbidden-remote-runtime") {
      await route.fulfill({ status: 403, contentType: "text/plain; charset=utf-8", body: "" });
      return;
    }
    await route.continue();
  });

  await context.addInitScript({ content: `
    (()=>{const state=globalThis.__gamsNavigationGuard=globalThis.__gamsNavigationGuard||{supported:false,blocked:[]};
      try{if(globalThis.navigation&&typeof globalThis.navigation.addEventListener==='function'){state.supported=true;globalThis.navigation.addEventListener('navigate',(event)=>{try{const url=new URL(event.destination.url,location.href);if(url.protocol!=='http:'&&url.protocol!=='https:'){state.blocked.push({url:url.protocol+'//'+url.host+url.pathname,at:Date.now()});if(event.cancelable)event.preventDefault();}}catch(error){if(event.cancelable)event.preventDefault();}});}}catch(error){state.error=String(error);}})();
  ` });
  if (mode === "diagnostic") await context.addInitScript({ content: traceInitScript });
  await context.addInitScript({ content: wrapFirstFile(transformFirstFile(firstRaw)) });

  const page = await context.newPage();
  runtimeLoads.first += 1;
  page.on("dialog", async (dialog) => {
    dialogs.push({ type: dialog.type(), message: redactText(dialog.message()), at: Date.now() });
    await dialog.accept().catch(() => {});
  });
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: redactText(message.text()) }));
  page.on("pageerror", (error) => pageErrors.push(redactText(error?.stack || error)));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigation.push({ at: Date.now(), url: safeUrl(frame.url()) });
  });
  page.on("requestfailed", (request) => requestFailures.push({
    at: Date.now(),
    url: safeUrl(request.url()),
    resourceType: request.resourceType(),
    failure: request.failure()?.errorText || "",
  }));
  page.on("response", async (response) => {
    const headers = await response.allHeaders().catch(() => ({}));
    responses.push({
      at: Date.now(),
      url: safeUrl(response.url()),
      status: response.status(),
      resourceType: response.request().resourceType(),
      contentType: String(headers["content-type"] || "").slice(0, 160),
    });
  });

  const targetId = new URL(targetUrl).pathname.split("/").pop();
  const prefix = `${String(index).padStart(2, "0")}-${mode}-${targetId}`;
  const result = {
    mode,
    targetUrl: safeUrl(targetUrl),
    first: { size: Buffer.byteLength(firstRaw), sha256: sha256(Buffer.from(firstRaw)) },
    second: { size: secondBytes.length, sha256: sha256(secondBytes) },
    entryTap,
    purchaseTap,
    resumeTap,
    stages: {},
    screenshots: {},
  };

  const stage = async (name) => {
    result.stages[name] = await snapshot(page, name);
    result.screenshots[name] = await capture(page, path.join(outputDir, `${prefix}-${name}.png`));
  };

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(28000);
    await stage("initial-ready");

    await tap(page, events, "entry-open", entryTap, 2500);
    await stage("entry-open");
    await tap(page, events, "entry-close", entryTap, 2500);
    await stage("entry-close");
    await tap(page, events, "entry-reopen", entryTap, 2500);
    await stage("entry-reopen");
    await tap(page, events, "target-screen", entryTap, 3500);
    await stage("target-screen");

    await tap(page, events, "interaction-first", purchaseTap, 5000);
    await stage("after-first");
    await tap(page, events, "interaction-second-same-page", purchaseTap, 5000);
    await stage("after-second");

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(28000);
    await stage("reentry-ready");
    await tap(page, events, "reentry-resume", resumeTap, 8000);
    await stage("reentry-after-resume");
    await tap(page, events, "reentry-entry-first", entryTap, 2500);
    await tap(page, events, "reentry-entry-second", entryTap, 3500);
    await stage("reentry-target-screen");
    await tap(page, events, "interaction-third-after-reentry", purchaseTap, 5000);
    await stage("after-third");
  } catch (error) {
    result.fatalError = redactText(error?.stack || error);
    await capture(page, path.join(outputDir, `${prefix}-fatal.png`)).catch(() => {});
  } finally {
    result.events = events;
    result.dialogs = dialogs;
    result.console = consoleMessages.slice(0, 800);
    result.pageErrors = pageErrors.slice(0, 200);
    result.mainFrameNavigation = mainFrameNavigation;
    result.requestFailures = requestFailures.slice(0, 1000);
    result.requests = requests.slice(0, 5000);
    result.responses = responses.slice(0, 5000);
    result.runtimeLoads = runtimeLoads;
    if (mode === "diagnostic") {
      result.pageTrace = await page.evaluate(() => {
        const trace = globalThis.__GG_PAGE_TRACE__;
        if (!trace) return null;
        return {
          schemaVersion: trace.schemaVersion,
          installedAt: trace.installedAt,
          counters: trace.counters,
          callbackCandidates: trace.callbackCandidates.map((name) => ({ name, registered: (() => {
            try { let cursor = globalThis; for (const part of name.split('.')) cursor = cursor?.[part]; return typeof cursor === 'function'; }
            catch { return false; }
          })() })),
          events: trace.events,
        };
      }).catch(() => null);
    }
    await context.close();
  }
  return result;
}

const modes = ["baseline", "diagnostic"];
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const cases = [];
try {
  let index = 0;
  for (const targetUrl of targets) {
    for (const mode of modes) {
      cases.push(await runCase(browser, mode, targetUrl, ++index));
      fs.writeFileSync(path.join(outputDir, "report.partial.json"), JSON.stringify({ targets, cases }, null, 2) + "\n");
    }
  }
} finally {
  await browser.close();
}

const baselineCases = cases.filter((item) => item.mode === "baseline");
const diagnosticCases = cases.filter((item) => item.mode === "diagnostic");
const countKinds = (item, kind) => item.requests.filter((request) => request.kind === kind).length;
const stageCompleted = (item, name) => Boolean(item.stages?.[name]);
const summary = {
  totalCases: cases.length,
  baselineCases: baselineCases.length,
  diagnosticCases: diagnosticCases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  diagnosticFatalCases: diagnosticCases.filter((item) => item.fatalError).length,
  diagnosticTraceInstalledCases: diagnosticCases.filter((item) => item.pageTrace?.schemaVersion === 1).length,
  diagnosticLifecycleEventCases: diagnosticCases.filter((item) => item.pageTrace?.events?.some((event) => event.type === "lifecycle")).length,
  diagnosticFetchOrXhrCases: diagnosticCases.filter((item) => (item.pageTrace?.counters?.fetchStarted || 0) + (item.pageTrace?.counters?.xhrStarted || 0) > 0).length,
  diagnosticScriptObservationCases: diagnosticCases.filter((item) => (item.pageTrace?.counters?.scriptAssignments || 0) + (item.pageTrace?.counters?.scriptInserted || 0) > 0).length,
  diagnosticAllStageCases: diagnosticCases.filter((item) => stageCompleted(item, "after-first") && stageCompleted(item, "after-second") && stageCompleted(item, "after-third")).length,
  baselineSecondFileLoadCases: baselineCases.filter((item) => item.runtimeLoads.second > 0).length,
  diagnosticSecondFileLoadCases: diagnosticCases.filter((item) => item.runtimeLoads.second > 0).length,
  baselineOrderRequestCases: baselineCases.filter((item) => countKinds(item, "order-request") > 0).length,
  diagnosticOrderRequestCases: diagnosticCases.filter((item) => countKinds(item, "order-request") > 0).length,
  baselineSessionRequestCases: baselineCases.filter((item) => countKinds(item, "session-request") > 0).length,
  diagnosticSessionRequestCases: diagnosticCases.filter((item) => countKinds(item, "session-request") > 0).length,
  baselineBlockedNavigationCases: baselineCases.filter((item) => Object.values(item.stages || {}).some((value) => value?.navigationGuard?.blocked?.length)).length,
  diagnosticBlockedNavigationCases: diagnosticCases.filter((item) => Object.values(item.stages || {}).some((value) => value?.navigationGuard?.blocked?.length)).length,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "current-baseline-vs-diagnostics-only-lifecycle-request-trace",
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  targets: targets.map(safeUrl),
  entryTap,
  purchaseTap,
  resumeTap,
  cases,
  summary,
};
report.pass = summary.totalCases === targets.length * modes.length
  && summary.diagnosticFatalCases === 0
  && summary.diagnosticTraceInstalledCases === targets.length
  && summary.diagnosticLifecycleEventCases === targets.length
  && summary.diagnosticAllStageCases === targets.length
  && summary.baselineSecondFileLoadCases === targets.length
  && summary.diagnosticSecondFileLoadCases === targets.length;

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, ...summary }, null, 2));
if (!report.pass) process.exitCode = 1;
