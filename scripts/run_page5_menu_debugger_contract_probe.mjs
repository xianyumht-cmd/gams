#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-menu-debugger-contract-probe";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const officialUrlFragment = "/website/hfplayer/v3/bin/official/game.js";
const expressionPattern = /([A-Za-z_$][\w$]*)\['_g'\+'GM'\+'su'\+'n2'\+'Fw'\+'wT'\+'o'\]\(\)\['is'\+'Mo'\+'bi'\+'le'\]\(\)\|\|\(([A-Za-z_$][\w$]*)\['sc'\+'en'\+'e'\]=new ([A-Za-z_$][\w$]*)\(\)\)/;
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
  const summary = {
    type: remote.type || null,
    subtype: remote.subtype || null,
    className: remote.className || null,
    description: String(remote.description || "").slice(0, 180),
    hasObjectId: Boolean(remote.objectId),
  };
  if (remote.type === "number" || remote.type === "boolean") summary.value = remote.value;
  if (remote.type === "string") summary.stringLength = String(remote.value || "").length;
  if (remote.type === "undefined") summary.value = "undefined";
  if (remote.subtype === "null") summary.value = null;
  return summary;
}

function safeDescriptorValue(name, remote) {
  const lower = String(name || "").toLowerCase();
  const geometryName = ["x", "y", "width", "height", "alpha", "visible", "enabled", "isshow", "scale", "scalex", "scaley", "rotation"].includes(lower);
  const base = summarizeRemote(remote);
  if (!base) return null;
  if (!geometryName) delete base.value;
  return base;
}

async function describeObject(cdp, remote, depth = 1, visited = new Set()) {
  const summary = summarizeRemote(remote);
  if (!remote?.objectId || depth < 0 || visited.has(remote.objectId)) return summary;
  visited.add(remote.objectId);
  const response = await cdp.send("Runtime.getProperties", {
    objectId: remote.objectId,
    ownProperties: true,
    accessorPropertiesOnly: false,
    generatePreview: false,
  });
  const properties = [];
  for (const descriptor of (response.result || []).slice(0, 180)) {
    const entry = {
      name: descriptor.name,
      enumerable: Boolean(descriptor.enumerable),
      configurable: Boolean(descriptor.configurable),
      writable: Boolean(descriptor.writable),
      value: safeDescriptorValue(descriptor.name, descriptor.value),
      hasGetter: Boolean(descriptor.get),
      hasSetter: Boolean(descriptor.set),
    };
    const lower = descriptor.name.toLowerCase();
    const relevant = lower.includes("scene")
      || lower.includes("canvas")
      || lower.includes("menu")
      || lower.includes("container")
      || lower.includes("button")
      || lower.includes("btn")
      || lower.includes("click")
      || lower.includes("touch")
      || lower.includes("load")
      || lower.includes("save")
      || lower.includes("setting")
      || lower.includes("replay")
      || lower.includes("children");
    if (depth > 0 && relevant && descriptor.value?.objectId) {
      try {
        entry.child = await describeObject(cdp, descriptor.value, depth - 1, visited);
      } catch (error) {
        entry.childError = String(error).slice(0, 300);
      }
    }
    properties.push(entry);
  }
  summary.properties = properties;
  summary.propertyCount = (response.result || []).length;
  summary.internalProperties = (response.internalProperties || []).slice(0, 40).map((item) => ({
    name: item.name,
    value: summarizeRemote(item.value),
  }));
  return summary;
}

async function evaluateAtFrame(cdp, callFrameId, expression, depth = 1) {
  try {
    const evaluated = await cdp.send("Debugger.evaluateOnCallFrame", {
      callFrameId,
      expression,
      objectGroup: "gams-menu-contract-probe",
      includeCommandLineAPI: false,
      silent: true,
      returnByValue: false,
      generatePreview: false,
    });
    return {
      expressionLabel: expression.replace(/_0x[0-9a-f]+/gi, "<local>"),
      exception: evaluated.exceptionDetails ? {
        text: evaluated.exceptionDetails.text || "",
        description: String(evaluated.exceptionDetails.exception?.description || "").slice(0, 500),
      } : null,
      result: await describeObject(cdp, evaluated.result, depth),
    };
  } catch (error) {
    return {
      expressionLabel: expression.replace(/_0x[0-9a-f]+/gi, "<local>"),
      error: String(error).slice(0, 500),
    };
  }
}

const requests = [];
const blockedOrders = [];
const blockedNavigations = [];
const pageErrors = [];
const requestFailures = [];
const navigation = [];
const debuggerErrors = [];

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-menu-debugger-contract-read-only-probe",
  targetUrl: safeUrl(targetUrl),
  menuPoint,
  screenshots: {},
  script: null,
  breakpoint: null,
  pause: null,
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

  let resolveScript;
  let rejectScript;
  const scriptReady = new Promise((resolve, reject) => {
    resolveScript = resolve;
    rejectScript = reject;
  });
  let scriptResolved = false;
  cdp.on("Debugger.scriptParsed", async (event) => {
    if (scriptResolved || !String(event.url || "").includes(officialUrlFragment)) return;
    scriptResolved = true;
    try {
      const sourceResponse = await cdp.send("Debugger.getScriptSource", { scriptId: event.scriptId });
      const source = sourceResponse.scriptSource || "";
      const match = expressionPattern.exec(source);
      if (!match) throw new Error("target expression not found in parsed script");
      const [, controllerVar, runtimeVar, menuCtorVar] = match;
      const setResponse = await cdp.send("Debugger.setBreakpoint", {
        location: {
          scriptId: event.scriptId,
          lineNumber: 0,
          columnNumber: match.index,
        },
      });
      const scriptInfo = {
        scriptId: event.scriptId,
        url: safeUrl(event.url),
        sourceSize: Buffer.byteLength(source),
        sourceSha256: sha256(Buffer.from(source)),
        expressionIndex: match.index,
        identifiers: { controllerVar, runtimeVar, menuCtorVar },
        breakpointId: setResponse.breakpointId,
        actualLocation: setResponse.actualLocation,
      };
      report.script = {
        url: scriptInfo.url,
        sourceSize: scriptInfo.sourceSize,
        sourceSha256: scriptInfo.sourceSha256,
        expressionIndex: scriptInfo.expressionIndex,
      };
      report.breakpoint = {
        breakpointId: scriptInfo.breakpointId,
        actualLocation: scriptInfo.actualLocation,
      };
      resolveScript(scriptInfo);
    } catch (error) {
      debuggerErrors.push(String(error?.stack || error).slice(0, 3000));
      rejectScript(error);
    }
  });

  let resolvePause;
  const pauseReady = new Promise((resolve) => { resolvePause = resolve; });
  let pauseCaptured = false;
  cdp.on("Debugger.paused", async (event) => {
    if (pauseCaptured) {
      try { await cdp.send("Debugger.resume"); } catch {}
      return;
    }
    pauseCaptured = true;
    try {
      const scriptInfo = await scriptReady;
      const callFrame = event.callFrames?.[0];
      if (!callFrame) throw new Error("paused without call frame");
      const { controllerVar, runtimeVar, menuCtorVar } = scriptInfo.identifiers;
      const controllerExpression = `${controllerVar}['_g'+'GM'+'su'+'n2'+'Fw'+'wT'+'o']()`;
      const expressions = [
        { label: "runtime", expression: runtimeVar, depth: 2 },
        { label: "current-scene", expression: `${runtimeVar}['sc'+'en'+'e']`, depth: 3 },
        { label: "runtime-canvas", expression: `${runtimeVar}['ca'+'nv'+'as']`, depth: 2 },
        { label: "controller", expression: controllerExpression, depth: 2 },
        { label: "menu-constructor", expression: menuCtorVar, depth: 2 },
        { label: "open-callback", expression: "SAL_openMenu", depth: 1 },
      ];
      const inspected = {};
      for (const item of expressions) {
        inspected[item.label] = await evaluateAtFrame(cdp, callFrame.callFrameId, item.expression, item.depth);
      }
      report.pause = {
        reason: event.reason,
        hitBreakpoints: event.hitBreakpoints || [],
        topFrame: {
          functionName: callFrame.functionName || "",
          url: safeUrl(callFrame.url || ""),
          location: callFrame.location,
          scopeChain: (callFrame.scopeChain || []).map((scope) => ({
            type: scope.type,
            name: scope.name || "",
            startLocation: scope.startLocation || null,
            endLocation: scope.endLocation || null,
          })),
        },
        inspected,
      };
      if (scriptInfo.breakpointId) {
        try { await cdp.send("Debugger.removeBreakpoint", { breakpointId: scriptInfo.breakpointId }); } catch {}
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
  const scriptInfo = await Promise.race([
    scriptReady,
    new Promise((_, reject) => setTimeout(() => reject(new Error("parsed script timeout")), 30000)),
  ]);
  report.scriptReady = Boolean(scriptInfo);
  await page.waitForTimeout(50000);
  report.geometry = await canvasGeometry(page);
  if (!report.geometry) throw new Error("canvas geometry unavailable");
  report.menuCssPoint = toCss(report.geometry, menuPoint);
  report.screenshots.beforeMenu = await capture(page, "before-menu");
  await page.touchscreen.tap(report.menuCssPoint.x, report.menuCssPoint.y);
  report.pauseCaptured = await Promise.race([
    pauseReady,
    new Promise((resolve) => setTimeout(() => resolve(false), 15000)),
  ]);
  await page.waitForTimeout(7000);
  report.screenshots.afterMenu = await capture(page, "after-menu");
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
  report.pass = report.scriptReady === true
    && report.pauseCaptured === true
    && Boolean(report.pause)
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;
  try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "gams-menu-contract-probe" }); } catch {}
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
  scriptReady: report.scriptReady,
  pauseCaptured: report.pauseCaptured,
  pauseReason: report.pause?.reason || null,
  inspectedLabels: Object.keys(report.pause?.inspected || {}),
  pageErrorCount: report.pageErrors?.length || 0,
  blockedOrderCount: report.blockedOrders?.length || 0,
  debuggerErrorCount: report.debuggerErrors?.length || 0,
}, null, 2));
if (!report.pass) process.exitCode = 1;
