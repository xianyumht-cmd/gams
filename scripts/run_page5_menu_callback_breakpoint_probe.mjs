#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-menu-callback-breakpoint-probe";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const menuPoint = { nx: 1227 / 1280, ny: 115 / 720 };
const eventNames = ["mouse down", "mouse up", "mouse click"];

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
    description: String(remote.description || "").slice(0, 220),
    hasObjectId: Boolean(remote.objectId),
  };
  if (remote.type === "number" || remote.type === "boolean") result.value = remote.value;
  if (remote.type === "string") result.stringLength = String(remote.value || "").length;
  if (remote.subtype === "null") result.value = null;
  return result;
}

async function listProperties(cdp, objectId, limit = 160) {
  if (!objectId) return { properties: [], internalProperties: [] };
  const response = await cdp.send("Runtime.getProperties", {
    objectId,
    ownProperties: true,
    accessorPropertiesOnly: false,
    generatePreview: false,
  });
  const properties = (response.result || []).slice(0, limit).map((descriptor) => {
    const lower = descriptor.name.toLowerCase();
    const keepValue = ["x", "y", "width", "height", "clientx", "clienty", "pagex", "pagey", "screenx", "screeny", "button", "buttons", "visible", "alpha", "type", "identifier", "length"].includes(lower);
    const value = summarizeRemote(descriptor.value);
    if (value && !keepValue) delete value.value;
    return {
      name: descriptor.name,
      value,
      hasGetter: Boolean(descriptor.get),
      hasSetter: Boolean(descriptor.set),
    };
  });
  const internalProperties = (response.internalProperties || []).slice(0, 40).map((item) => ({
    name: item.name,
    value: {
      ...summarizeRemote(item.value),
      rawValue: item.value && typeof item.value.value !== "undefined" ? item.value.value : undefined,
    },
  }));
  return { properties, internalProperties };
}

async function evaluateFrame(cdp, callFrameId, expression, byValue = false) {
  try {
    const response = await cdp.send("Debugger.evaluateOnCallFrame", {
      callFrameId,
      expression,
      objectGroup: "gams-menu-callback-probe",
      silent: true,
      returnByValue: byValue,
      generatePreview: false,
    });
    const details = response.result?.objectId ? await listProperties(cdp, response.result.objectId, 180) : { properties: [], internalProperties: [] };
    return {
      exception: response.exceptionDetails ? String(response.exceptionDetails.text || "").slice(0, 300) : null,
      value: summarizeRemote(response.result),
      byValue: byValue ? response.result?.value : undefined,
      ...details,
      objectId: response.result?.objectId || null,
    };
  } catch (error) {
    return { error: String(error).slice(0, 600), objectId: null, properties: [], internalProperties: [] };
  }
}

async function findFunctionsInEventArray(cdp, callFrameId, expression, label) {
  const evaluated = await evaluateFrame(cdp, callFrameId, expression, false);
  const functions = [];
  for (const property of evaluated.properties || []) {
    if (!/^\d+$/.test(property.name)) continue;
    const child = await evaluateFrame(cdp, callFrameId, `${expression}[${property.name}]`, false);
    if (child.value?.type === "function" && child.objectId) {
      functions.push({ label: `${label}[${property.name}]`, objectId: child.objectId, remote: child.value, internalProperties: child.internalProperties });
      continue;
    }
    if (!child.objectId) continue;
    for (const nestedProperty of child.properties || []) {
      if (nestedProperty.value?.type !== "function") continue;
      const nested = await evaluateFrame(cdp, callFrameId, `${expression}[${property.name}][${JSON.stringify(nestedProperty.name)}]`, false);
      if (nested.objectId) functions.push({
        label: `${label}[${property.name}].${nestedProperty.name}`,
        objectId: nested.objectId,
        remote: nested.value,
        internalProperties: nested.internalProperties,
      });
    }
  }
  return { evaluated, functions };
}

async function describeFrames(cdp, event, scriptMap) {
  const frames = [];
  for (const frame of (event.callFrames || []).slice(0, 12)) {
    const scopes = [];
    for (const scope of (frame.scopeChain || []).slice(0, 10)) {
      let details = { properties: [], internalProperties: [] };
      if (["local", "closure", "catch", "block"].includes(scope.type) && scope.object?.objectId) {
        try { details = await listProperties(cdp, scope.object.objectId, 160); } catch {}
      }
      scopes.push({ type: scope.type, name: scope.name || "", properties: details.properties });
    }
    const script = scriptMap.get(frame.location.scriptId);
    frames.push({
      functionName: frame.functionName || "",
      url: script?.url || safeUrl(frame.url || ""),
      location: frame.location,
      thisValue: summarizeRemote(frame.this),
      scopes,
    });
  }
  return frames;
}

const requests = [];
const blockedOrders = [];
const blockedNavigations = [];
const pageErrors = [];
const requestFailures = [];
const navigation = [];
const debuggerErrors = [];
const scriptMap = new Map();
const callbackBreakpoints = [];

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-menu-callback-breakpoint-read-only-probe",
  targetUrl: safeUrl(targetUrl),
  menuPoint,
  eventNames,
  screenshots: {},
  canvasBreakpoint: null,
  candidateNodes: [],
  callbackBreakpoints,
  firstPause: null,
  callbackPause: null,
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
      try { return request.isNavigationRequest() && request.frame().parentFrame() === null; } catch { return false; }
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

  let phase = "canvas";
  let resolveCanvasPause;
  let resolveCallbackPause;
  const canvasPauseReady = new Promise((resolve) => { resolveCanvasPause = resolve; });
  const callbackPauseReady = new Promise((resolve) => { resolveCallbackPause = resolve; });

  cdp.on("Debugger.paused", async (event) => {
    try {
      const frame = event.callFrames?.[0];
      if (!frame) throw new Error("pause without call frame");
      if (phase === "canvas") {
        const candidateResult = await evaluateFrame(cdp, frame.callFrameId, `(() => {
          const clickX = ${1227};
          const clickY = ${115};
          const list = Array.isArray(this._elementList) ? this._elementList : [];
          return list.map((element, index) => {
            const map = element && element.eventListenerMap || {};
            const x = Number(element && element.x || 0);
            const y = Number(element && element.y || 0);
            const width = Number(element && element.width || 0);
            const height = Number(element && element.height || 0);
            const dx = clickX < x ? x - clickX : clickX > x + width ? clickX - (x + width) : 0;
            const dy = clickY < y ? y - clickY : clickY > y + height ? clickY - (y + height) : 0;
            return {
              index, x, y, width, height,
              zIndex: Number(element && element.zIndex || 0),
              visible: Boolean(element && element._visible),
              touchable: Boolean(element && element._touchable),
              eventNames: Object.keys(map),
              distance: Math.sqrt(dx * dx + dy * dy),
            };
          }).filter(item => item.visible && item.touchable && item.eventNames.length)
            .sort((a, b) => a.distance - b.distance || b.zIndex - a.zIndex)
            .slice(0, 10);
        })()`, true);
        const candidates = Array.isArray(candidateResult.byValue) ? candidateResult.byValue : [];
        report.candidateNodes = candidates;
        const target = candidates.find((item) => item.eventNames.includes("mouse click")) || candidates[0];
        if (!target) throw new Error("interactive menu candidate unavailable");
        report.selectedNodeIndex = target.index;
        const callbackDetails = {};
        for (const eventName of eventNames) {
          const expression = `this._elementList[${target.index}].eventListenerMap[${JSON.stringify(eventName)}]`;
          const found = await findFunctionsInEventArray(cdp, frame.callFrameId, expression, eventName);
          callbackDetails[eventName] = {
            array: { value: found.evaluated.value, properties: found.evaluated.properties },
            functions: found.functions.map((item) => ({
              label: item.label,
              remote: item.remote,
              internalProperties: item.internalProperties,
            })),
          };
          for (const item of found.functions) {
            try {
              const set = await cdp.send("Debugger.setBreakpointOnFunctionCall", { objectId: item.objectId });
              callbackBreakpoints.push({ label: item.label, eventName, breakpointId: set.breakpointId, remote: item.remote, internalProperties: item.internalProperties });
            } catch (error) {
              debuggerErrors.push(`setBreakpointOnFunctionCall ${item.label}: ${String(error).slice(0, 500)}`);
            }
          }
        }
        report.callbackDetails = callbackDetails;
        report.firstPause = {
          reason: event.reason,
          hitBreakpoints: event.hitBreakpoints || [],
          frames: await describeFrames(cdp, event, scriptMap),
        };
        phase = "callback";
        if (report.canvasBreakpoint?.breakpointId) {
          try { await cdp.send("Debugger.removeBreakpoint", { breakpointId: report.canvasBreakpoint.breakpointId }); } catch {}
        }
        await cdp.send("Debugger.resume");
        resolveCanvasPause(true);
        return;
      }
      if (phase === "callback") {
        report.callbackPause = {
          reason: event.reason,
          hitBreakpoints: event.hitBreakpoints || [],
          matchedCallbacks: callbackBreakpoints.filter((item) => (event.hitBreakpoints || []).includes(item.breakpointId)).map((item) => ({ label: item.label, eventName: item.eventName, breakpointId: item.breakpointId })),
          frames: await describeFrames(cdp, event, scriptMap),
          thisValue: await evaluateFrame(cdp, frame.callFrameId, "this", false),
          firstArgument: await evaluateFrame(cdp, frame.callFrameId, "arguments[0]", false),
        };
        phase = "done";
        for (const item of callbackBreakpoints) {
          try { await cdp.send("Debugger.removeBreakpoint", { breakpointId: item.breakpointId }); } catch {}
        }
        await cdp.send("Debugger.resume");
        resolveCallbackPause(true);
        return;
      }
      await cdp.send("Debugger.resume");
    } catch (error) {
      debuggerErrors.push(String(error?.stack || error).slice(0, 3000));
      try { await cdp.send("Debugger.resume"); } catch {}
      if (phase === "canvas") resolveCanvasPause(false);
      else resolveCallbackPause(false);
      phase = "done";
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
    objectGroup: "gams-menu-callback-probe",
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
  const setCanvas = await cdp.send("Debugger.setBreakpoint", {
    location: { scriptId: touchstart.scriptId, lineNumber: touchstart.lineNumber, columnNumber: touchstart.columnNumber },
  });
  report.canvasBreakpoint = {
    breakpointId: setCanvas.breakpointId,
    actualLocation: setCanvas.actualLocation,
    script: scriptMap.get(touchstart.scriptId) || null,
  };

  report.screenshots.beforeMenu = await capture(page, "before-menu");
  await page.touchscreen.tap(report.menuCssPoint.x, report.menuCssPoint.y);
  report.canvasPauseCaptured = await Promise.race([
    canvasPauseReady,
    new Promise((resolve) => setTimeout(() => resolve(false), 12000)),
  ]);
  report.callbackPauseCaptured = await Promise.race([
    callbackPauseReady,
    new Promise((resolve) => setTimeout(() => resolve(false), 12000)),
  ]);
  await page.waitForTimeout(7000);
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
  report.pass = report.canvasPauseCaptured === true
    && report.callbackPauseCaptured === true
    && Boolean(report.callbackPause)
    && callbackBreakpoints.length > 0
    && report.menuScreenshotChanged
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;
  try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "gams-menu-callback-probe" }); } catch {}
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
  canvasPauseCaptured: report.canvasPauseCaptured,
  callbackPauseCaptured: report.callbackPauseCaptured,
  selectedNodeIndex: report.selectedNodeIndex,
  candidateNodes: report.candidateNodes,
  callbackBreakpointCount: report.callbackBreakpoints.length,
  callbackMatched: report.callbackPause?.matchedCallbacks || [],
  callbackTopFrame: report.callbackPause?.frames?.[0] ? {
    functionName: report.callbackPause.frames[0].functionName,
    url: report.callbackPause.frames[0].url,
    location: report.callbackPause.frames[0].location,
  } : null,
  menuScreenshotChanged: report.menuScreenshotChanged,
  pageErrorCount: report.pageErrors?.length || 0,
  blockedOrderCount: report.blockedOrders?.length || 0,
  debuggerErrorCount: report.debuggerErrors?.length || 0,
}, null, 2));
if (!report.pass) process.exitCode = 1;
