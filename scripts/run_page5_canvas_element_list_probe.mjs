#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-canvas-element-list-probe";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const menuPoint = { nx: 1227 / 1280, ny: 115 / 720 };

fs.mkdirSync(outputDir, { recursive: true });
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const safeUrl = (raw) => {
  try {
    const url = new URL(String(raw));
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return String(raw || "").slice(0, 300);
  }
};

async function capture(page, name) {
  const file = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return sha256(fs.readFileSync(file));
}

async function canvasGeometry(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas") || document.querySelector("canvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      id: canvas.id || "",
      width: canvas.width,
      height: canvas.height,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      orientation: screen.orientation?.type || null,
    };
  });
}

function toCss(geometry, point) {
  return {
    x: geometry.rect.x + geometry.rect.width * point.nx,
    y: geometry.rect.y + geometry.rect.height * point.ny,
  };
}

function summarizeRemote(remote) {
  if (!remote) return null;
  const result = {
    type: remote.type || null,
    subtype: remote.subtype || null,
    className: remote.className || null,
    description: String(remote.description || "").slice(0, 180),
    hasObjectId: Boolean(remote.objectId),
  };
  if (remote.type === "number" || remote.type === "boolean") result.value = remote.value;
  if (remote.type === "string") result.stringLength = String(remote.value || "").length;
  if (remote.subtype === "null") result.value = null;
  return result;
}

const requests = [];
const blockedOrders = [];
const blockedNavigations = [];
const pageErrors = [];
const requestFailures = [];
const navigation = [];
const debuggerErrors = [];
const scriptMap = new Map();

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-canvas-element-list-read-only-probe",
  targetUrl: safeUrl(targetUrl),
  menuPoint,
  screenshots: {},
  listener: null,
  breakpoint: null,
  pauseCaptured: false,
  elementList: null,
  apkExecuted: false,
  paymentCompleted: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
  authorizationOutcomeModified: false,
};

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
try {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
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
    const method = request.method().toUpperCase();
    const lower = rawUrl.toLowerCase();
    const topNavigation = (() => {
      try {
        return request.isNavigationRequest() && request.frame().parentFrame() === null;
      } catch {
        return false;
      }
    })();
    const entry = { at: Date.now(), method, resourceType: request.resourceType(), topNavigation, url: safeUrl(rawUrl) };
    requests.push(entry);
    const order = !["GET", "HEAD", "OPTIONS"].includes(method)
      && (lower.includes("createorder") || lower.includes("createbuyorder") || lower.includes("/pay"));
    if (order) {
      blockedOrders.push(entry);
      await route.abort("blockedbyclient");
      return;
    }
    if (topNavigation && !rawUrl.startsWith(targetPrefix)) {
      blockedNavigations.push(entry);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  await context.addInitScript({ content: `
    (() => {
      const nav = globalThis.__gamsNavigationGuard = globalThis.__gamsNavigationGuard || { supported: false, blocked: [], allowed: [] };
      try {
        if (globalThis.navigation && typeof globalThis.navigation.addEventListener === 'function') {
          nav.supported = true;
          globalThis.navigation.addEventListener('navigate', (event) => {
            try {
              const url = new URL(event.destination.url, location.href);
              if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                nav.blocked.push({ url: url.protocol + '//' + url.host + url.pathname, at: Date.now() });
                if (event.cancelable) event.preventDefault();
                return;
              }
              nav.allowed.push({ url: url.protocol + '//' + url.host + url.pathname, at: Date.now() });
            } catch (error) {
              nav.blocked.push({ url: String(event.destination?.url || '').slice(0, 300), at: Date.now() });
              if (event.cancelable) event.preventDefault();
            }
          });
        }
      } catch (error) {
        nav.error = String(error).slice(0, 300);
      }
    })();
  ` });

  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 5000)));
  page.on("requestfailed", (request) => requestFailures.push({ url: safeUrl(request.url()), failure: request.failure()?.errorText || "" }));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigation.push({ at: Date.now(), url: safeUrl(frame.url()) });
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Runtime.enable");
  await cdp.send("Debugger.enable", { maxScriptsCacheSize: 30_000_000 });
  cdp.on("Debugger.scriptParsed", (event) => {
    scriptMap.set(event.scriptId, {
      scriptId: event.scriptId,
      url: safeUrl(event.url || ""),
      startLine: event.startLine,
      startColumn: event.startColumn,
      endLine: event.endLine,
      endColumn: event.endColumn,
    });
  });

  let resolvePause;
  const pauseReady = new Promise((resolve) => { resolvePause = resolve; });
  let captured = false;
  cdp.on("Debugger.paused", async (event) => {
    if (captured) {
      try { await cdp.send("Debugger.resume"); } catch {}
      return;
    }
    captured = true;
    try {
      const frame = event.callFrames?.[0];
      if (!frame) throw new Error("pause without call frame");
      const serialized = await cdp.send("Runtime.callFunctionOn", {
        objectId: frame.this.objectId,
        functionDeclaration: `function() {
          const list = Array.isArray(this._elementList) ? this._elementList : [];
          const primitive = (value) => {
            if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
            if (typeof value === 'string') return { type: 'string', length: value.length };
            if (typeof value === 'function') return { type: 'function', name: value.name || '', sourceLength: (() => { try { return Function.prototype.toString.call(value).length; } catch { return null; } })() };
            return undefined;
          };
          const describeNested = (value, depth = 1) => {
            if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;
            const result = {
              constructorName: (() => { try { return value.constructor && value.constructor.name || ''; } catch { return ''; } })(),
              ownKeys: [],
              primitives: {},
            };
            let descriptors = {};
            try { descriptors = Object.getOwnPropertyDescriptors(value); } catch { return result; }
            result.ownKeys = Object.keys(descriptors).slice(0, 160);
            for (const [key, descriptor] of Object.entries(descriptors).slice(0, 160)) {
              if (!('value' in descriptor)) continue;
              const direct = primitive(descriptor.value);
              if (direct !== undefined) result.primitives[key] = direct;
              if (depth > 0 && descriptor.value && typeof descriptor.value === 'object') {
                const lower = key.toLowerCase();
                if (lower.includes('event') || lower.includes('listener') || lower.includes('click') || lower.includes('touch') || lower.includes('mouse') || lower.includes('children')) {
                  result[key] = describeNested(descriptor.value, depth - 1);
                } else if (Array.isArray(descriptor.value)) {
                  result[key] = { type: 'array', length: descriptor.value.length };
                }
              }
            }
            return result;
          };
          const items = list.slice(0, 600).map((element, index) => {
            const described = describeNested(element, 2) || {};
            return { index, ...described };
          });
          return {
            length: list.length,
            items,
            viewWidth: this.viewWidth,
            viewHeight: this.viewHeight,
            left: this._left,
            top: this._top,
            deviceRatio: this._deviceRatio,
            objectKeys: Object.getOwnPropertyNames(this).slice(0, 200),
          };
        }`,
        returnByValue: true,
        awaitPromise: false,
        silent: true,
      });
      report.pauseCaptured = true;
      report.pause = {
        reason: event.reason,
        hitBreakpoints: event.hitBreakpoints || [],
        topFrame: {
          functionName: frame.functionName || "",
          script: scriptMap.get(frame.location.scriptId) || null,
          location: frame.location,
          thisValue: summarizeRemote(frame.this),
        },
      };
      report.elementList = serialized.result?.value || null;
      if (serialized.exceptionDetails) {
        report.serializationException = {
          text: serialized.exceptionDetails.text || "",
          description: String(serialized.exceptionDetails.exception?.description || "").slice(0, 1000),
        };
      }
      await cdp.send("Debugger.resume");
      resolvePause(true);
    } catch (error) {
      debuggerErrors.push(String(error?.stack || error).slice(0, 3000));
      try { await cdp.send("Debugger.resume"); } catch {}
      resolvePause(false);
    }
  });

  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  report.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
  await page.waitForTimeout(50000);
  report.geometry = await canvasGeometry(page);
  if (!report.geometry) throw new Error("canvas geometry unavailable");
  report.menuCssPoint = toCss(report.geometry, menuPoint);

  const canvasRemote = await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('canvas#canvas') || document.querySelector('canvas')",
    objectGroup: "gams-canvas-element-list-probe",
    returnByValue: false,
    silent: true,
  });
  if (!canvasRemote.result?.objectId) throw new Error("canvas remote object unavailable");
  const inventory = await cdp.send("DOMDebugger.getEventListeners", {
    objectId: canvasRemote.result.objectId,
    depth: -1,
    pierce: true,
  });
  const touchstart = (inventory.listeners || []).find((listener) => listener.type === "touchstart");
  if (!touchstart) throw new Error("touchstart listener unavailable");
  report.listener = {
    type: touchstart.type,
    scriptId: touchstart.scriptId,
    script: scriptMap.get(touchstart.scriptId) || null,
    lineNumber: touchstart.lineNumber,
    columnNumber: touchstart.columnNumber,
    handler: summarizeRemote(touchstart.handler),
  };
  const set = await cdp.send("Debugger.setBreakpoint", {
    location: {
      scriptId: touchstart.scriptId,
      lineNumber: touchstart.lineNumber,
      columnNumber: touchstart.columnNumber,
    },
  });
  report.breakpoint = {
    breakpointId: set.breakpointId,
    actualLocation: set.actualLocation,
  };

  report.screenshots.beforeMenu = await capture(page, "before-menu");
  await page.touchscreen.tap(report.menuCssPoint.x, report.menuCssPoint.y);
  report.pauseCaptured = await Promise.race([
    pauseReady,
    new Promise((resolve) => setTimeout(() => resolve(false), 15000)),
  ]);
  await page.waitForTimeout(7000);
  try { await cdp.send("Debugger.removeBreakpoint", { breakpointId: set.breakpointId }); } catch {}
  report.screenshots.afterMenu = await capture(page, "after-menu");
  report.menuScreenshotChanged = report.screenshots.beforeMenu !== report.screenshots.afterMenu;
  report.final = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    navigationGuard: globalThis.__gamsNavigationGuard || null,
  }));
  report.mainFrameValid = page.url().startsWith(targetPrefix);
  report.requests = requests.slice(0, 8000);
  report.blockedOrders = blockedOrders;
  report.blockedNavigations = blockedNavigations;
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures.slice(0, 800);
  report.navigation = navigation;
  report.debuggerErrors = debuggerErrors;
  report.pass = report.pauseCaptured === true
    && Number(report.elementList?.length || 0) > 0
    && report.menuScreenshotChanged
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;
  try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "gams-canvas-element-list-probe" }); } catch {}
  await context.close();
} catch (error) {
  report.fatalError = String(error?.stack || error).slice(0, 8000);
  report.requests = requests.slice(0, 8000);
  report.blockedOrders = blockedOrders;
  report.blockedNavigations = blockedNavigations;
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures.slice(0, 800);
  report.navigation = navigation;
  report.debuggerErrors = debuggerErrors;
  report.pass = false;
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  pass: report.pass,
  pauseCaptured: report.pauseCaptured,
  elementListLength: report.elementList?.length || 0,
  serializedItemCount: report.elementList?.items?.length || 0,
  objectKeys: report.elementList?.objectKeys || [],
  menuScreenshotChanged: report.menuScreenshotChanged,
  pageErrorCount: report.pageErrors?.length || 0,
  blockedOrderCount: report.blockedOrders?.length || 0,
  debuggerErrorCount: report.debuggerErrors?.length || 0,
}, null, 2));
if (!report.pass) process.exitCode = 1;
