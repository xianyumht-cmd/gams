#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-canvas-listener-breakpoint-probe";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const menuPoint = { nx: 1227 / 1280, ny: 115 / 720 };
const listenerTypes = new Set(["touchstart", "touchend"]);
const maxPauses = 8;

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

async function listProperties(cdp, objectId, limit = 140) {
  if (!objectId) return [];
  const response = await cdp.send("Runtime.getProperties", {
    objectId,
    ownProperties: true,
    accessorPropertiesOnly: false,
    generatePreview: false,
  });
  return (response.result || []).slice(0, limit).map((descriptor) => {
    const lower = descriptor.name.toLowerCase();
    const keepValue = ["x", "y", "width", "height", "clientx", "clienty", "pagex", "pagey", "screenx", "screeny", "button", "buttons", "visible", "alpha", "type", "identifier"].includes(lower);
    const value = summarizeRemote(descriptor.value);
    if (value && !keepValue) delete value.value;
    return {
      name: descriptor.name,
      value,
      hasGetter: Boolean(descriptor.get),
      hasSetter: Boolean(descriptor.set),
    };
  });
}

async function evaluateFrame(cdp, callFrameId, expression) {
  try {
    const response = await cdp.send("Debugger.evaluateOnCallFrame", {
      callFrameId,
      expression,
      objectGroup: "gams-canvas-listener-probe",
      silent: true,
      returnByValue: false,
      generatePreview: false,
    });
    return {
      exception: response.exceptionDetails ? String(response.exceptionDetails.text || "").slice(0, 300) : null,
      value: summarizeRemote(response.result),
      properties: response.result?.objectId ? await listProperties(cdp, response.result.objectId, 120) : [],
    };
  } catch (error) {
    return { error: String(error).slice(0, 500) };
  }
}

const requests = [];
const blockedOrders = [];
const blockedNavigations = [];
const pageErrors = [];
const requestFailures = [];
const navigation = [];
const debuggerErrors = [];
const pauses = [];
const scriptMap = new Map();
const breakpointRecords = [];

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-canvas-listener-breakpoint-read-only-probe",
  targetUrl: safeUrl(targetUrl),
  menuPoint,
  screenshots: {},
  listenerInventory: [],
  breakpoints: breakpointRecords,
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

  let resolveFirstPause;
  const firstPause = new Promise((resolve) => { resolveFirstPause = resolve; });
  let pauseProcessing = Promise.resolve();
  cdp.on("Debugger.paused", (event) => {
    pauseProcessing = pauseProcessing.then(async () => {
      try {
        if (pauses.length >= maxPauses) {
          await cdp.send("Debugger.resume");
          return;
        }
        const frames = [];
        for (const frame of (event.callFrames || []).slice(0, 10)) {
          const scopeSummary = [];
          for (const scope of (frame.scopeChain || []).slice(0, 8)) {
            let properties = [];
            if (["local", "closure", "catch", "block"].includes(scope.type) && scope.object?.objectId) {
              try { properties = await listProperties(cdp, scope.object.objectId, 120); } catch (error) { debuggerErrors.push(String(error).slice(0, 500)); }
            }
            scopeSummary.push({ type: scope.type, name: scope.name || "", properties });
          }
          const script = scriptMap.get(frame.location.scriptId);
          frames.push({
            functionName: frame.functionName || "",
            url: script?.url || safeUrl(frame.url || ""),
            location: frame.location,
            thisValue: summarizeRemote(frame.this),
            scopes: scopeSummary,
          });
        }
        const top = event.callFrames?.[0];
        pauses.push({
          index: pauses.length + 1,
          at: Date.now(),
          reason: event.reason,
          data: event.data || null,
          hitBreakpoints: event.hitBreakpoints || [],
          frames,
          thisValue: top ? await evaluateFrame(cdp, top.callFrameId, "this") : null,
          firstArgument: top ? await evaluateFrame(cdp, top.callFrameId, "arguments[0]") : null,
        });
        if (pauses.length === 1) resolveFirstPause(true);
      } catch (error) {
        debuggerErrors.push(String(error?.stack || error).slice(0, 2000));
      } finally {
        try { await cdp.send("Debugger.resume"); } catch (error) { debuggerErrors.push(String(error).slice(0, 500)); }
      }
    });
  });

  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  report.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
  await page.waitForTimeout(50000);
  report.geometry = await canvasGeometry(page);
  if (!report.geometry) throw new Error("canvas geometry unavailable");
  report.menuCssPoint = toCss(report.geometry, menuPoint);

  const canvasRemote = await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('canvas#canvas') || document.querySelector('canvas')",
    objectGroup: "gams-canvas-listener-probe",
    returnByValue: false,
    silent: true,
  });
  if (!canvasRemote.result?.objectId) throw new Error("canvas remote object unavailable");
  const inventory = await cdp.send("DOMDebugger.getEventListeners", {
    objectId: canvasRemote.result.objectId,
    depth: -1,
    pierce: true,
  });
  report.listenerInventory = (inventory.listeners || []).map((listener) => ({
    type: listener.type,
    useCapture: Boolean(listener.useCapture),
    passive: Boolean(listener.passive),
    once: Boolean(listener.once),
    scriptId: listener.scriptId || null,
    script: scriptMap.get(listener.scriptId) || null,
    lineNumber: listener.lineNumber,
    columnNumber: listener.columnNumber,
    handler: summarizeRemote(listener.handler),
    originalHandler: summarizeRemote(listener.originalHandler),
  }));

  for (const listener of (inventory.listeners || []).filter((item) => listenerTypes.has(item.type))) {
    const set = await cdp.send("Debugger.setBreakpoint", {
      location: {
        scriptId: listener.scriptId,
        lineNumber: listener.lineNumber,
        columnNumber: listener.columnNumber,
      },
    });
    breakpointRecords.push({
      type: listener.type,
      requested: {
        scriptId: listener.scriptId,
        lineNumber: listener.lineNumber,
        columnNumber: listener.columnNumber,
      },
      breakpointId: set.breakpointId,
      actualLocation: set.actualLocation,
      script: scriptMap.get(listener.scriptId) || null,
    });
  }

  report.screenshots.beforeMenu = await capture(page, "before-menu");
  await page.touchscreen.tap(report.menuCssPoint.x, report.menuCssPoint.y);
  report.firstPauseCaptured = await Promise.race([
    firstPause,
    new Promise((resolve) => setTimeout(() => resolve(false), 12000)),
  ]);
  await page.waitForTimeout(7000);
  await pauseProcessing;
  for (const record of breakpointRecords) {
    try { await cdp.send("Debugger.removeBreakpoint", { breakpointId: record.breakpointId }); } catch {}
  }
  report.screenshots.afterMenu = await capture(page, "after-menu");
  report.pauses = pauses;
  report.menuScreenshotChanged = report.screenshots.beforeMenu !== report.screenshots.afterMenu;
  report.final = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    navigationGuard: globalThis.__gamsNavigationGuard || null,
  }));
  report.mainFrameValid = page.url().startsWith(targetPrefix);
  report.scriptMap = [...scriptMap.values()].slice(0, 300);
  report.requests = requests.slice(0, 8000);
  report.blockedOrders = blockedOrders;
  report.blockedNavigations = blockedNavigations;
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures.slice(0, 800);
  report.navigation = navigation;
  report.debuggerErrors = debuggerErrors;
  report.pass = breakpointRecords.length >= 2
    && report.firstPauseCaptured === true
    && pauses.length > 0
    && report.menuScreenshotChanged
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;
  try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "gams-canvas-listener-probe" }); } catch {}
  await context.close();
} catch (error) {
  report.fatalError = String(error?.stack || error).slice(0, 8000);
  report.pauses = pauses;
  report.scriptMap = [...scriptMap.values()].slice(0, 300);
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
  listenerInventory: report.listenerInventory.map((item) => ({ type: item.type, script: item.script, lineNumber: item.lineNumber, columnNumber: item.columnNumber })),
  breakpointCount: report.breakpoints.length,
  firstPauseCaptured: report.firstPauseCaptured,
  pauseCount: report.pauses?.length || 0,
  topFrames: (report.pauses || []).map((item) => item.frames?.[0] ? {
    functionName: item.frames[0].functionName,
    url: item.frames[0].url,
    location: item.frames[0].location,
  } : null),
  menuScreenshotChanged: report.menuScreenshotChanged,
  pageErrorCount: report.pageErrors?.length || 0,
  blockedOrderCount: report.blockedOrders?.length || 0,
  debuggerErrorCount: report.debuggerErrors?.length || 0,
}, null, 2));
if (!report.pass) process.exitCode = 1;
