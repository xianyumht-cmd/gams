#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-cover-input-method-probe";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const point = { x: 95, y: 400 };
const methods = ["touchscreen", "mouse", "dom-click", "pointer-mouse"];

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

async function inspectPoint(page) {
  return page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    const rect = element?.getBoundingClientRect?.();
    const style = element ? getComputedStyle(element) : null;
    return {
      viewport: {
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio,
        orientation: screen.orientation?.type || null,
        visualViewport: visualViewport ? {
          width: visualViewport.width,
          height: visualViewport.height,
          scale: visualViewport.scale,
        } : null,
      },
      element: element ? {
        tag: element.tagName,
        id: element.id || "",
        className: typeof element.className === "string" ? element.className : "",
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        pointerEvents: style?.pointerEvents || null,
        transform: style?.transform || null,
        zIndex: style?.zIndex || null,
      } : null,
      canvases: [...document.querySelectorAll("canvas")].map((canvas) => {
        const itemRect = canvas.getBoundingClientRect();
        const itemStyle = getComputedStyle(canvas);
        return {
          id: canvas.id || "",
          className: typeof canvas.className === "string" ? canvas.className : "",
          width: canvas.width,
          height: canvas.height,
          rect: { x: itemRect.x, y: itemRect.y, width: itemRect.width, height: itemRect.height },
          pointerEvents: itemStyle.pointerEvents,
          transform: itemStyle.transform,
          zIndex: itemStyle.zIndex,
        };
      }),
    };
  }, point);
}

async function dispatchMethod(page, method) {
  if (method === "touchscreen") {
    await page.touchscreen.tap(point.x, point.y);
    return;
  }
  if (method === "mouse") {
    await page.mouse.click(point.x, point.y, { delay: 80 });
    return;
  }
  if (method === "dom-click") {
    await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      element?.click?.();
    }, point);
    return;
  }
  if (method === "pointer-mouse") {
    await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      if (!element) return;
      const common = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1 };
      element.dispatchEvent(new PointerEvent("pointerdown", { ...common, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      element.dispatchEvent(new MouseEvent("mousedown", common));
      element.dispatchEvent(new PointerEvent("pointerup", { ...common, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      element.dispatchEvent(new MouseEvent("mouseup", { ...common, buttons: 0 }));
      element.dispatchEvent(new MouseEvent("click", { ...common, buttons: 0 }));
    }, point);
  }
}

async function runCase(browser, method, index) {
  const requests = [];
  const blockedOrders = [];
  const blockedNavigations = [];
  const pageErrors = [];
  const requestFailures = [];
  const navigation = [];
  const prefix = `${String(index).padStart(2, "0")}-${method}`;
  const result = { method, point, screenshots: {} };
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
    const methodName = request.method().toUpperCase();
    const lower = rawUrl.toLowerCase();
    const topNavigation = (() => {
      try {
        return request.isNavigationRequest() && request.frame().parentFrame() === null;
      } catch {
        return false;
      }
    })();
    const entry = {
      at: Date.now(),
      method: methodName,
      resourceType: request.resourceType(),
      topNavigation,
      url: safeUrl(rawUrl),
    };
    requests.push(entry);
    const order = !["GET", "HEAD", "OPTIONS"].includes(methodName)
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
      const state = globalThis.__gamsInputProbe = globalThis.__gamsInputProbe || { events: [] };
      const types = ['pointerdown','pointerup','mousedown','mouseup','click','touchstart','touchend'];
      for (const type of types) {
        addEventListener(type, (event) => {
          const touch = event.changedTouches && event.changedTouches[0];
          state.events.push({
            at: Date.now(),
            type,
            target: event.target && event.target.tagName || '',
            id: event.target && event.target.id || '',
            x: touch ? touch.clientX : event.clientX,
            y: touch ? touch.clientY : event.clientY,
            trusted: event.isTrusted,
          });
          if (state.events.length > 100) state.events.shift();
        }, true);
      }
      const navigationState = globalThis.__gamsNavigationGuard = globalThis.__gamsNavigationGuard || { supported: false, blocked: [], allowed: [] };
      try {
        if (globalThis.navigation && typeof globalThis.navigation.addEventListener === 'function') {
          navigationState.supported = true;
          globalThis.navigation.addEventListener('navigate', (event) => {
            try {
              const url = new URL(event.destination.url, location.href);
              if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                navigationState.blocked.push({ url: url.protocol + '//' + url.host + url.pathname, at: Date.now() });
                if (event.cancelable) event.preventDefault();
                return;
              }
              navigationState.allowed.push({ url: url.protocol + '//' + url.host + url.pathname, at: Date.now() });
            } catch (error) {
              navigationState.blocked.push({ url: String(event.destination?.url || '').slice(0, 300), at: Date.now() });
              if (event.cancelable) event.preventDefault();
            }
          });
        }
      } catch (error) {
        navigationState.error = String(error).slice(0, 300);
      }
    })();
  ` });

  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 5000)));
  page.on("requestfailed", (request) => requestFailures.push({ url: safeUrl(request.url()), failure: request.failure()?.errorText || "" }));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigation.push({ at: Date.now(), url: safeUrl(frame.url()) });
  });

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(50000);
    result.hitBefore = await inspectPoint(page);
    result.screenshots.before = await capture(page, `${prefix}-before`);
    result.requestStartIndex = requests.length;
    result.navigationStartIndex = navigation.length;
    result.dispatchedAt = Date.now();
    await dispatchMethod(page, method);
    await page.waitForTimeout(15000);
    result.screenshots.after = await capture(page, `${prefix}-after`);
    result.hitAfter = await inspectPoint(page);
    result.final = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      inputProbe: globalThis.__gamsInputProbe || null,
      navigationGuard: globalThis.__gamsNavigationGuard || null,
    }));
    result.postInputRequests = requests.slice(result.requestStartIndex);
    result.postInputNavigation = navigation.slice(result.navigationStartIndex);
    result.postInputDocumentRequests = result.postInputRequests.filter((item) => item.resourceType === "document").length;
    result.postInputRequestCount = result.postInputRequests.length;
    result.screenshotChanged = result.screenshots.before !== result.screenshots.after;
    result.mainFrameValid = page.url().startsWith(targetPrefix);
  } catch (error) {
    result.fatalError = String(error?.stack || error).slice(0, 8000);
  } finally {
    result.requests = requests.slice(0, 6000);
    result.blockedOrders = blockedOrders;
    result.blockedNavigations = blockedNavigations;
    result.pageErrors = pageErrors;
    result.requestFailures = requestFailures.slice(0, 500);
    result.navigation = navigation;
    result.pass = !result.fatalError && result.mainFrameValid && !pageErrors.length && !blockedOrders.length;
    await context.close();
  }
  return result;
}

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const cases = [];
try {
  for (let index = 0; index < methods.length; index += 1) {
    cases.push(await runCase(browser, methods[index], index + 1));
  }
} finally {
  await browser.close();
}

const summary = {
  totalCases: cases.length,
  passedCases: cases.filter((item) => item.pass).length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  pageErrorCases: cases.filter((item) => item.pageErrors?.length).length,
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  documentReloadCases: cases.filter((item) => Number(item.postInputDocumentRequests || 0) > 0).length,
  requestCases: cases.filter((item) => Number(item.postInputRequestCount || 0) > 0).length,
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-cover-input-method-probe-page-only",
  targetUrl: safeUrl(targetUrl),
  point,
  methods,
  cases,
  summary,
  apkExecuted: false,
  paymentCompleted: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
  authorizationOutcomeModified: false,
};
report.pass = summary.totalCases === methods.length
  && summary.passedCases === methods.length
  && summary.fatalCases === 0
  && summary.pageErrorCases === 0
  && summary.blockedOrderCases === 0;
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  pass: report.pass,
  ...summary,
  cases: cases.map((item) => ({
    method: item.method,
    postInputRequestCount: item.postInputRequestCount,
    postInputDocumentRequests: item.postInputDocumentRequests,
    screenshotChanged: item.screenshotChanged,
    target: item.hitBefore?.element || null,
  })),
}, null, 2));
if (!report.pass) process.exitCode = 1;
