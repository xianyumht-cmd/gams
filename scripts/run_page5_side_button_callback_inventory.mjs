#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-side-button-callback-inventory";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const triggerPoint = { nx: 1221 / 1280, ny: 72 / 720 };
const nodeIndexes = [8, 9, 10];

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
  mode: "page5-side-button-callback-inventory-read-only",
  targetUrl: safeUrl(targetUrl),
  triggerPoint,
  nodeIndexes,
  screenshots: {},
  inventory: null,
  pauseCaptured: false,
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
      try { return request.isNavigationRequest() && request.frame().parentFrame() === null; }
      catch { return false; }
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
      if (!frame?.this?.objectId) throw new Error("canvas dispatcher object unavailable");
      const serialized = await cdp.send("Runtime.callFunctionOn", {
        objectId: frame.this.objectId,
        functionDeclaration: `function(indexes) {
          const list = Array.isArray(this._elementList) ? this._elementList : [];
          const sourceOf = (value) => {
            if (typeof value !== 'function') return null;
            try { return Function.prototype.toString.call(value).slice(0, 12000); }
            catch (error) { return '[source unavailable]'; }
          };
          const describeEntry = (entry, entryIndex) => {
            if (!entry || typeof entry !== 'object') return { entryIndex, type: typeof entry };
            const result = { entryIndex, keys: Object.getOwnPropertyNames(entry).slice(0, 80), functions: {} };
            for (const key of result.keys) {
              let value;
              try { value = entry[key]; } catch { continue; }
              if (typeof value === 'function') {
                result.functions[key] = {
                  name: value.name || '',
                  length: value.length,
                  source: sourceOf(value),
                };
              } else if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                result[key] = typeof value === 'string' ? value.slice(0, 500) : value;
              } else if (value && typeof value === 'object') {
                result[key] = {
                  constructorName: (() => { try { return value.constructor?.name || ''; } catch { return ''; } })(),
                  keys: (() => { try { return Object.getOwnPropertyNames(value).slice(0, 40); } catch { return []; } })(),
                };
              }
            }
            return result;
          };
          return indexes.map((index) => {
            const node = list[index];
            if (!node) return { index, available: false };
            const map = node.eventListenerMap || {};
            const events = {};
            for (const eventName of Object.getOwnPropertyNames(map)) {
              const entries = Array.isArray(map[eventName]) ? map[eventName] : [];
              events[eventName] = entries.map((entry, entryIndex) => describeEntry(entry, entryIndex));
            }
            return {
              index,
              available: true,
              constructorName: (() => { try { return node.constructor?.name || ''; } catch { return ''; } })(),
              geometry: {
                x: node.x, y: node.y, width: node.width, height: node.height,
                zIndex: node.zIndex, visible: node._visible, touchable: node._touchable,
              },
              texture: {
                commonPath: typeof node._commonPath === 'string' ? node._commonPath.slice(-180) : null,
                activePath: typeof node._activePath === 'string' ? node._activePath.slice(-180) : null,
              },
              events,
            };
          });
        }`,
        arguments: [{ value: nodeIndexes }],
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
        },
      };
      report.inventory = serialized.result?.value || null;
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
  report.triggerCssPoint = toCss(report.geometry, triggerPoint);

  const canvasRemote = await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('canvas#canvas') || document.querySelector('canvas')",
    objectGroup: "gams-page5-side-button-inventory",
    returnByValue: false,
    silent: true,
  });
  if (!canvasRemote.result?.objectId) throw new Error("canvas remote object unavailable");
  const listenerInventory = await cdp.send("DOMDebugger.getEventListeners", {
    objectId: canvasRemote.result.objectId,
    depth: -1,
    pierce: true,
  });
  const touchstart = (listenerInventory.listeners || []).find((listener) => listener.type === "touchstart");
  if (!touchstart) throw new Error("touchstart listener unavailable");
  report.listener = {
    type: touchstart.type,
    scriptId: touchstart.scriptId,
    script: scriptMap.get(touchstart.scriptId) || null,
    lineNumber: touchstart.lineNumber,
    columnNumber: touchstart.columnNumber,
  };
  const set = await cdp.send("Debugger.setBreakpoint", {
    location: {
      scriptId: touchstart.scriptId,
      lineNumber: touchstart.lineNumber,
      columnNumber: touchstart.columnNumber,
    },
  });
  report.breakpoint = { breakpointId: set.breakpointId, actualLocation: set.actualLocation };

  report.screenshots.beforeTrigger = await capture(page, "before-trigger");
  await page.touchscreen.tap(report.triggerCssPoint.x, report.triggerCssPoint.y);
  report.pauseCaptured = await Promise.race([
    pauseReady,
    new Promise((resolve) => setTimeout(() => resolve(false), 15000)),
  ]);
  await page.waitForTimeout(7000);
  try { await cdp.send("Debugger.removeBreakpoint", { breakpointId: set.breakpointId }); } catch {}
  report.screenshots.afterTrigger = await capture(page, "after-trigger");
  report.screenshotChanged = report.screenshots.beforeTrigger !== report.screenshots.afterTrigger;
  report.mainFrameValid = page.url().startsWith(targetPrefix);
  report.final = await page.evaluate(() => ({ url: location.href, title: document.title, readyState: document.readyState }));
  report.requests = requests.slice(0, 8000);
  report.blockedOrders = blockedOrders;
  report.blockedNavigations = blockedNavigations;
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures.slice(0, 800);
  report.navigation = navigation;
  report.debuggerErrors = debuggerErrors;
  const available = Array.isArray(report.inventory) ? report.inventory.filter((item) => item?.available).length : 0;
  const clickNodes = Array.isArray(report.inventory)
    ? report.inventory.filter((item) => Array.isArray(item?.events?.["mouse click"]) && item.events["mouse click"].length > 0).length
    : 0;
  report.pass = report.pauseCaptured === true
    && available === nodeIndexes.length
    && clickNodes === nodeIndexes.length
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;
  try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "gams-page5-side-button-inventory" }); } catch {}
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
  inventoryCount: Array.isArray(report.inventory) ? report.inventory.length : 0,
  clickNodeCount: Array.isArray(report.inventory)
    ? report.inventory.filter((item) => Array.isArray(item?.events?.["mouse click"]) && item.events["mouse click"].length > 0).length
    : 0,
  pageErrorCount: report.pageErrors?.length || 0,
  blockedOrderCount: report.blockedOrders?.length || 0,
}, null, 2));
if (!report.pass) process.exitCode = 1;
