#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-title-progression-calibration";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const probes = [
  { name: "title-left", point: { x: 90, y: 400 }, attempts: 12, waitMs: 1600 },
  { name: "viewport-center", point: { x: 195, y: 422 }, attempts: 12, waitMs: 1600 },
  { name: "lower-center", point: { x: 195, y: 680 }, attempts: 8, waitMs: 1800 },
];

fs.mkdirSync(outputDir, { recursive: true });

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
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

function requestKind(url, method) {
  const lower = String(url || "").toLowerCase();
  if (lower.includes("createbuyorder") || lower.includes("createorder") || lower.includes("/order/create")) return "blocked-order-mutation";
  if (!["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase())
      && (lower.includes("purchase") || lower.includes("/pay"))) return "blocked-order-mutation";
  if (lower.includes("/propshop/")) return "target-read-request";
  return "page-request";
}

function isTopNavigation(request) {
  try {
    return request.isNavigationRequest() && request.frame().parentFrame() === null;
  } catch {
    return false;
  }
}

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

async function snapshot(page, stage) {
  return page.evaluate((stageName) => {
    const canvases = [...document.querySelectorAll("canvas")].map((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return {
        width: canvas.width,
        height: canvas.height,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    });
    return {
      stage: stageName,
      at: Date.now(),
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      bodyTextLength: String(document.body?.innerText || "").length,
      canvases,
      navigationGuard: globalThis.__gamsNavigationGuard || null,
    };
  }, stage);
}

async function runProbe(browser, probe, index) {
  const requests = [];
  const blockedOrders = [];
  const blockedExternalNavigations = [];
  const requestFailures = [];
  const pageErrors = [];
  const dialogs = [];
  const consoleMessages = [];
  const mainFrameNavigation = [];
  const events = [];

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
    const kind = requestKind(rawUrl, request.method());
    const topNavigation = isTopNavigation(request);
    const entry = {
      at: Date.now(),
      kind,
      method: request.method(),
      resourceType: request.resourceType(),
      topNavigation,
      url: safeUrl(rawUrl),
      postDataLength: request.postDataBuffer()?.length || 0,
    };
    requests.push(entry);
    if (kind === "blocked-order-mutation") {
      blockedOrders.push(entry);
      await route.abort("blockedbyclient");
      return;
    }
    if (topNavigation && !String(rawUrl).startsWith(targetPrefix)) {
      blockedExternalNavigations.push(entry);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  await context.addInitScript({ content: `
    (()=>{const state=globalThis.__gamsNavigationGuard=globalThis.__gamsNavigationGuard||{supported:false,blocked:[],allowed:[]};
      try{if(globalThis.navigation&&typeof globalThis.navigation.addEventListener==='function'){state.supported=true;globalThis.navigation.addEventListener('navigate',(event)=>{try{const url=new URL(event.destination.url,location.href);if(url.protocol!=='http:'&&url.protocol!=='https:'){state.blocked.push({url:url.protocol+'//'+url.host+url.pathname,at:Date.now()});if(event.cancelable)event.preventDefault();return;}state.allowed.push({url:url.protocol+'//'+url.host+url.pathname,at:Date.now()});}catch(error){state.blocked.push({url:String(event.destination?.url||'').slice(0,300),at:Date.now()});if(event.cancelable)event.preventDefault();}});}}catch(error){state.error=String(error).slice(0,300);}})();
  ` });

  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 5000)));
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: message.text().slice(0, 3000) }));
  page.on("requestfailed", (request) => requestFailures.push({
    at: Date.now(),
    url: safeUrl(request.url()),
    resourceType: request.resourceType(),
    failure: request.failure()?.errorText || "",
  }));
  page.on("dialog", async (dialog) => {
    dialogs.push({ at: Date.now(), type: dialog.type(), message: dialog.message().slice(0, 1000) });
    await dialog.dismiss().catch(() => {});
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigation.push({ at: Date.now(), url: safeUrl(frame.url()) });
  });

  const prefix = `${String(index).padStart(2, "0")}-${probe.name}`;
  const result = {
    name: probe.name,
    point: probe.point,
    attempts: probe.attempts,
    waitMs: probe.waitMs,
    targetUrl: safeUrl(targetUrl),
    stages: {},
    screenshots: {},
    screenshotSequence: [],
  };

  const stage = async (name) => {
    result.stages[name] = await snapshot(page, name);
    const filePath = path.join(outputDir, `${prefix}-${name}.png`);
    const hash = await capture(page, filePath);
    result.screenshots[name] = hash;
    result.screenshotSequence.push({ stage: name, hash });
  };

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(28000);
    await stage("initial-ready");

    for (let attempt = 1; attempt <= probe.attempts; attempt += 1) {
      await page.touchscreen.tap(probe.point.x, probe.point.y);
      events.push({ at: Date.now(), type: "progression-tap", attempt, ...probe.point });
      await page.waitForTimeout(probe.waitMs);
      await stage(`after-${String(attempt).padStart(2, "0")}`);
    }
    await page.waitForTimeout(8000);
    await stage("settled");
  } catch (error) {
    result.fatalError = String(error?.stack || error).slice(0, 8000);
    await capture(page, path.join(outputDir, `${prefix}-fatal.png`)).catch(() => {});
  } finally {
    result.events = events;
    result.requests = requests.slice(0, 6000);
    result.blockedOrders = blockedOrders;
    result.blockedExternalNavigations = blockedExternalNavigations;
    result.requestFailures = requestFailures.slice(0, 1000);
    result.pageErrors = pageErrors.slice(0, 200);
    result.console = consoleMessages.slice(0, 800);
    result.dialogs = dialogs;
    result.mainFrameNavigation = mainFrameNavigation;
    result.uniqueScreenshotCount = new Set(result.screenshotSequence.map((item) => item.hash)).size;
    await context.close();
  }
  return result;
}

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const cases = [];
try {
  let index = 0;
  for (const probe of probes) {
    cases.push(await runProbe(browser, probe, ++index));
    fs.writeFileSync(path.join(outputDir, "report.partial.json"), JSON.stringify({ probes, cases }, null, 2) + "\n");
  }
} finally {
  await browser.close();
}

const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  pageErrorCases: cases.filter((item) => item.pageErrors?.length).length,
  changedCases: cases.filter((item) => item.uniqueScreenshotCount > 1).length,
  stronglyChangedCases: cases.filter((item) => item.uniqueScreenshotCount >= 4).length,
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  blockedExternalNavigationCases: cases.filter((item) => item.blockedExternalNavigations?.length).length,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-title-progression-calibration-page-only",
  targetUrl: safeUrl(targetUrl),
  probes,
  cases,
  summary,
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
};
report.pass = summary.totalCases === probes.length
  && summary.fatalCases === 0
  && summary.pageErrorCases === 0
  && summary.changedCases >= 1
  && summary.blockedOrderCases === 0;

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, ...summary }, null, 2));
if (!report.pass) process.exitCode = 1;
