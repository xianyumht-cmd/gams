#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-title-entry-settle-probe";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const entryTap = { x: 95, y: 400 };
const waits = [15000, 15000, 15000, 15000];

fs.mkdirSync(outputDir, { recursive: true });
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const safeUrl = (raw) => { try { const u = new URL(String(raw)); return `${u.protocol}//${u.host}${u.pathname}`; } catch { return String(raw || "").slice(0, 300); } };

async function capture(page, name) {
  const file = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return sha256(fs.readFileSync(file));
}

const requests = [], blockedOrders = [], blockedNavigations = [], pageErrors = [], requestFailures = [], navigation = [];
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-title-entry-settle-probe-page-only",
  targetUrl: safeUrl(targetUrl),
  entryTap,
  waits,
  screenshots: {},
  requestWindows: [],
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
    viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: "zh-CN", timezoneId: "Asia/Shanghai", ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const rawUrl = request.url();
    const method = request.method().toUpperCase();
    const lower = rawUrl.toLowerCase();
    const topNavigation = (() => { try { return request.isNavigationRequest() && request.frame().parentFrame() === null; } catch { return false; } })();
    const entry = { at: Date.now(), method, resourceType: request.resourceType(), topNavigation, url: safeUrl(rawUrl) };
    requests.push(entry);
    const order = !["GET", "HEAD", "OPTIONS"].includes(method) && (lower.includes("createorder") || lower.includes("createbuyorder") || lower.includes("/pay"));
    if (order) { blockedOrders.push(entry); await route.abort("blockedbyclient"); return; }
    if (topNavigation && !rawUrl.startsWith(targetPrefix)) { blockedNavigations.push(entry); await route.abort("blockedbyclient"); return; }
    await route.continue();
  });
  await context.addInitScript({ content: `
    (()=>{const state=globalThis.__gamsNavigationGuard=globalThis.__gamsNavigationGuard||{supported:false,blocked:[],allowed:[]};
      try{if(globalThis.navigation&&typeof globalThis.navigation.addEventListener==='function'){state.supported=true;globalThis.navigation.addEventListener('navigate',(event)=>{try{const url=new URL(event.destination.url,location.href);if(url.protocol!=='http:'&&url.protocol!=='https:'){state.blocked.push({url:url.protocol+'//'+url.host+url.pathname,at:Date.now()});if(event.cancelable)event.preventDefault();return;}state.allowed.push({url:url.protocol+'//'+url.host+url.pathname,at:Date.now()});}catch(error){state.blocked.push({url:String(event.destination?.url||'').slice(0,300),at:Date.now()});if(event.cancelable)event.preventDefault();}});}}catch(error){state.error=String(error).slice(0,300);}})();
  ` });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 5000)));
  page.on("requestfailed", (request) => requestFailures.push({ url: safeUrl(request.url()), failure: request.failure()?.errorText || "" }));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigation.push({ at: Date.now(), url: safeUrl(frame.url()) }); });

  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  report.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
  await page.waitForTimeout(50000);
  report.screenshots.coverReady = await capture(page, "cover-ready");
  report.requestStartIndex = requests.length;
  report.tappedAt = Date.now();
  await page.touchscreen.tap(entryTap.x, entryTap.y);

  let elapsed = 0;
  let previousRequestIndex = report.requestStartIndex;
  for (const waitMs of waits) {
    await page.waitForTimeout(waitMs);
    elapsed += waitMs;
    const stage = `after-${elapsed / 1000}s`;
    report.screenshots[stage] = await capture(page, stage);
    const currentIndex = requests.length;
    report.requestWindows.push({
      stage,
      elapsedMs: elapsed,
      requestCount: currentIndex - previousRequestIndex,
      cumulativePostTapRequestCount: currentIndex - report.requestStartIndex,
    });
    previousRequestIndex = currentIndex;
  }

  report.final = await page.evaluate(() => ({ url: location.href, title: document.title, readyState: document.readyState, navigationGuard: globalThis.__gamsNavigationGuard || null }));
  report.mainFrameValid = page.url().startsWith(targetPrefix);
  report.uniqueScreenshotCount = new Set(Object.values(report.screenshots)).size;
  report.requests = requests.slice(0, 8000);
  report.blockedOrders = blockedOrders;
  report.blockedNavigations = blockedNavigations;
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures.slice(0, 1000);
  report.navigation = navigation;
  report.pass = report.mainFrameValid && !pageErrors.length && !blockedOrders.length && report.uniqueScreenshotCount >= 3;
  await context.close();
} catch (error) {
  report.fatalError = String(error?.stack || error).slice(0, 8000);
  report.pass = false;
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, mainFrameValid: report.mainFrameValid, uniqueScreenshotCount: report.uniqueScreenshotCount, requestWindows: report.requestWindows, pageErrorCount: report.pageErrors?.length || 0 }, null, 2));
if (!report.pass) process.exitCode = 1;
