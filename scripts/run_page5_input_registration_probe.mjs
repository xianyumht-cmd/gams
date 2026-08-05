#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-input-registration-probe";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const menuPoint = { nx: 1227 / 1280, ny: 115 / 720 };
const eventTypes = ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup", "click"];

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
  return {
    type: remote.type || null,
    subtype: remote.subtype || null,
    className: remote.className || null,
    descriptionLength: String(remote.description || "").length,
    functionName: remote.type === "function" ? String(remote.description || "").match(/^(?:function\s*)?([^\s(]*)/)?.[1] || "" : "",
    hasObjectId: Boolean(remote.objectId),
  };
}

async function getEventListeners(cdp, expression, label) {
  const evaluated = await cdp.send("Runtime.evaluate", {
    expression,
    objectGroup: "gams-input-registration-probe",
    silent: true,
    returnByValue: false,
    generatePreview: false,
  });
  if (!evaluated.result?.objectId) {
    return { label, expression, target: summarizeRemote(evaluated.result), listeners: [] };
  }
  const response = await cdp.send("DOMDebugger.getEventListeners", {
    objectId: evaluated.result.objectId,
    depth: -1,
    pierce: true,
  });
  return {
    label,
    expression,
    target: summarizeRemote(evaluated.result),
    listeners: (response.listeners || []).map((listener) => ({
      type: listener.type,
      useCapture: Boolean(listener.useCapture),
      passive: Boolean(listener.passive),
      once: Boolean(listener.once),
      scriptId: listener.scriptId || null,
      lineNumber: listener.lineNumber,
      columnNumber: listener.columnNumber,
      handler: summarizeRemote(listener.handler),
      originalHandler: summarizeRemote(listener.originalHandler),
      backendNodeId: listener.backendNodeId || null,
    })),
  };
}

const requests = [];
const blockedOrders = [];
const blockedNavigations = [];
const pageErrors = [];
const requestFailures = [];
const navigation = [];
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-input-registration-read-only-probe",
  targetUrl: safeUrl(targetUrl),
  menuPoint,
  eventTypes,
  screenshots: {},
  listenerInventories: [],
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
      const state = globalThis.__gamsInputRegistration = globalThis.__gamsInputRegistration || {
        registrations: [],
        events: [],
        properties: [],
      };
      const originalAdd = EventTarget.prototype.addEventListener;
      const describeTarget = (target) => ({
        constructorName: target && target.constructor && target.constructor.name || '',
        tag: target && target.tagName || '',
        id: target && target.id || '',
        className: typeof (target && target.className) === 'string' ? target.className : '',
      });
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        try {
          state.registrations.push({
            at: Date.now(),
            type: String(type || ''),
            target: describeTarget(this),
            listenerType: typeof listener,
            listenerName: typeof listener === 'function' ? listener.name || '' : listener && listener.constructor && listener.constructor.name || '',
            listenerSourceLength: (() => { try { return Function.prototype.toString.call(listener).length; } catch { return null; } })(),
            capture: typeof options === 'boolean' ? options : Boolean(options && options.capture),
            passive: Boolean(options && typeof options === 'object' && options.passive),
            once: Boolean(options && typeof options === 'object' && options.once),
          });
          if (state.registrations.length > 2000) state.registrations.shift();
        } catch {}
        return originalAdd.apply(this, arguments);
      };
      const captureEvent = (event) => {
        try {
          const touch = event.changedTouches && event.changedTouches[0];
          state.events.push({
            at: Date.now(),
            type: event.type,
            target: describeTarget(event.target),
            currentTarget: describeTarget(event.currentTarget),
            x: touch ? touch.clientX : event.clientX,
            y: touch ? touch.clientY : event.clientY,
            trusted: event.isTrusted,
            phase: event.eventPhase,
          });
          if (state.events.length > 300) state.events.shift();
        } catch {}
      };
      for (const type of ${JSON.stringify(eventTypes)}) {
        originalAdd.call(window, type, captureEvent, true);
      }
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

  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  report.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
  await page.waitForTimeout(50000);
  report.geometry = await canvasGeometry(page);
  if (!report.geometry) throw new Error("canvas geometry unavailable");
  report.menuCssPoint = toCss(report.geometry, menuPoint);

  const targets = [
    ["window", "window"],
    ["document", "document"],
    ["body", "document.body"],
    ["canvas", "document.querySelector('canvas#canvas') || document.querySelector('canvas')"],
  ];
  for (const [label, expression] of targets) {
    report.listenerInventories.push(await getEventListeners(cdp, expression, label));
  }
  report.registrationBefore = await page.evaluate(() => globalThis.__gamsInputRegistration || null);
  report.propertyHandlersBefore = await page.evaluate((types) => {
    const targets = {
      window,
      document,
      body: document.body,
      canvas: document.querySelector('canvas#canvas') || document.querySelector('canvas'),
    };
    const result = {};
    for (const [label, target] of Object.entries(targets)) {
      result[label] = {};
      for (const type of types) {
        const name = `on${type}`;
        let value;
        try { value = target && target[name]; } catch { value = null; }
        result[label][name] = value ? {
          type: typeof value,
          name: value.name || '',
          sourceLength: (() => { try { return Function.prototype.toString.call(value).length; } catch { return null; } })(),
        } : null;
      }
    }
    return result;
  }, eventTypes);

  report.screenshots.beforeMenu = await capture(page, "before-menu");
  const eventStart = report.registrationBefore?.events?.length || 0;
  await page.touchscreen.tap(report.menuCssPoint.x, report.menuCssPoint.y);
  await page.waitForTimeout(7000);
  report.screenshots.afterMenu = await capture(page, "after-menu");
  report.registrationAfter = await page.evaluate(() => globalThis.__gamsInputRegistration || null);
  report.menuEvents = (report.registrationAfter?.events || []).slice(eventStart);
  report.menuScreenshotChanged = report.screenshots.beforeMenu !== report.screenshots.afterMenu;
  report.listenerTypeCounts = report.listenerInventories.reduce((acc, inventory) => {
    for (const listener of inventory.listeners || []) {
      const key = `${inventory.label}:${listener.type}`;
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {});
  report.registrationTypeCounts = (report.registrationAfter?.registrations || []).reduce((acc, item) => {
    const key = `${item.target?.constructorName || ''}:${item.target?.tag || ''}#${item.target?.id || ''}:${item.type}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
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
  report.pass = report.menuScreenshotChanged
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && (report.registrationAfter?.registrations?.length || 0) > 0;
  try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "gams-input-registration-probe" }); } catch {}
  await context.close();
} catch (error) {
  report.fatalError = String(error?.stack || error).slice(0, 8000);
  report.requests = requests.slice(0, 8000);
  report.blockedOrders = blockedOrders;
  report.blockedNavigations = blockedNavigations;
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures.slice(0, 800);
  report.navigation = navigation;
  report.pass = false;
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  pass: report.pass,
  inventoryCounts: Object.fromEntries(report.listenerInventories.map((item) => [item.label, item.listeners.length])),
  listenerTypeCounts: report.listenerTypeCounts,
  registrationCount: report.registrationAfter?.registrations?.length || 0,
  menuEventTypes: (report.menuEvents || []).map((item) => item.type),
  propertyHandlersBefore: report.propertyHandlersBefore,
  menuScreenshotChanged: report.menuScreenshotChanged,
  pageErrorCount: report.pageErrors?.length || 0,
  blockedOrderCount: report.blockedOrders?.length || 0,
}, null, 2));
if (!report.pass) process.exitCode = 1;
