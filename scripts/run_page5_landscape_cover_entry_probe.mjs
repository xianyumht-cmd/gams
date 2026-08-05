#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-landscape-cover-entry-probe";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const points = [
  { name: "prompt", nx: 640 / 1280, ny: 620 / 720 },
  { name: "title", nx: 620 / 1280, ny: 550 / 720 },
  { name: "cover-center", nx: 640 / 1280, ny: 360 / 720 },
];
const unlock = { nx: 120 / 1280, ny: 120 / 720 };

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

async function runCase(browser, point, index) {
  const requests = [];
  const blockedOrders = [];
  const blockedNavigations = [];
  const pageErrors = [];
  const requestFailures = [];
  const navigation = [];
  const prefix = `${String(index).padStart(2, "0")}-${point.name}`;
  const result = { name: point.name, normalizedPoint: point, screenshots: {}, requestWindows: {} };

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
      const state = globalThis.__gamsLandscapeProbe = globalThis.__gamsLandscapeProbe || { events: [] };
      for (const type of ['pointerdown','pointerup','touchstart','touchend','click']) {
        addEventListener(type, (event) => {
          const touch = event.changedTouches && event.changedTouches[0];
          state.events.push({
            at: Date.now(), type,
            target: event.target && event.target.tagName || '',
            id: event.target && event.target.id || '',
            x: touch ? touch.clientX : event.clientX,
            y: touch ? touch.clientY : event.clientY,
            trusted: event.isTrusted,
          });
          if (state.events.length > 100) state.events.shift();
        }, true);
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

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(50000);
    result.geometry = await canvasGeometry(page);
    if (!result.geometry) throw new Error("canvas geometry unavailable");
    result.unlockPoint = toCss(result.geometry, unlock);
    result.entryPoint = toCss(result.geometry, point);
    result.screenshots.coverReady = await capture(page, `${prefix}-cover-ready`);

    const unlockIndex = requests.length;
    await page.touchscreen.tap(result.unlockPoint.x, result.unlockPoint.y);
    await page.waitForTimeout(7000);
    result.screenshots.afterUnlock = await capture(page, `${prefix}-after-unlock`);
    result.requestWindows.unlock = requests.slice(unlockIndex);

    const entryIndex = requests.length;
    const navigationIndex = navigation.length;
    await page.touchscreen.tap(result.entryPoint.x, result.entryPoint.y);
    await page.waitForTimeout(15000);
    result.screenshots.afterEntry15 = await capture(page, `${prefix}-after-entry-15s`);
    await page.waitForTimeout(15000);
    result.screenshots.afterEntry30 = await capture(page, `${prefix}-after-entry-30s`);
    result.requestWindows.entry = requests.slice(entryIndex);
    result.navigationAfterEntry = navigation.slice(navigationIndex);

    result.final = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      landscapeProbe: globalThis.__gamsLandscapeProbe || null,
      navigationGuard: globalThis.__gamsNavigationGuard || null,
    }));
    result.mainFrameValid = page.url().startsWith(targetPrefix);
    result.entryRequestCount = result.requestWindows.entry.length;
    result.entryDocumentRequestCount = result.requestWindows.entry.filter((item) => item.resourceType === "document").length;
    result.uniqueScreenshotCount = new Set(Object.values(result.screenshots)).size;
  } catch (error) {
    result.fatalError = String(error?.stack || error).slice(0, 8000);
  } finally {
    result.requests = requests.slice(0, 7000);
    result.blockedOrders = blockedOrders;
    result.blockedNavigations = blockedNavigations;
    result.pageErrors = pageErrors;
    result.requestFailures = requestFailures.slice(0, 700);
    result.navigation = navigation;
    result.pass = !result.fatalError && result.mainFrameValid && !pageErrors.length && !blockedOrders.length;
    await context.close();
  }
  return result;
}

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const cases = [];
try {
  for (let index = 0; index < points.length; index += 1) {
    cases.push(await runCase(browser, points[index], index + 1));
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
  entryRequestCases: cases.filter((item) => Number(item.entryRequestCount || 0) > 0).length,
  entryDocumentRequestCases: cases.filter((item) => Number(item.entryDocumentRequestCount || 0) > 0).length,
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-landscape-cover-entry-probe-page-only",
  targetUrl: safeUrl(targetUrl),
  points,
  cases,
  summary,
  apkExecuted: false,
  paymentCompleted: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
  authorizationOutcomeModified: false,
};
report.pass = summary.totalCases === points.length
  && summary.passedCases === points.length
  && summary.fatalCases === 0
  && summary.pageErrorCases === 0
  && summary.blockedOrderCases === 0;
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  pass: report.pass,
  ...summary,
  cases: cases.map((item) => ({
    name: item.name,
    geometry: item.geometry,
    entryPoint: item.entryPoint,
    entryRequestCount: item.entryRequestCount,
    entryDocumentRequestCount: item.entryDocumentRequestCount,
    uniqueScreenshotCount: item.uniqueScreenshotCount,
  })),
}, null, 2));
if (!report.pass) process.exitCode = 1;
