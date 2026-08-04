#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-cover-hit-map-probe";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const points = [
  { name: "prompt", x: 50, y: 425 },
  { name: "title", x: 95, y: 400 },
  { name: "character", x: 240, y: 425 },
  { name: "viewport-center", x: 195, y: 422 },
  { name: "upper-cover", x: 250, y: 270 },
  { name: "lower-cover", x: 150, y: 580 },
  { name: "left-cover", x: 300, y: 420 },
  { name: "right-cover", x: 120, y: 420 },
  { name: "lower-title", x: 65, y: 470 },
];

fs.mkdirSync(outputDir, { recursive: true });
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const safeUrl = (raw) => { try { const u = new URL(String(raw)); return `${u.protocol}//${u.host}${u.pathname}`; } catch { return String(raw || "").slice(0, 300); } };

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

async function runCase(browser, point, index) {
  const requests = [], blockedOrders = [], blockedNavigations = [], pageErrors = [], requestFailures = [], navigation = [];
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

  const prefix = `${String(index).padStart(2, "0")}-${point.name}`;
  const result = { name: point.name, point, screenshots: {} };
  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(50000);
    result.screenshots.before = await capture(page, path.join(outputDir, `${prefix}-before.png`));
    result.requestStartIndex = requests.length;
    result.tappedAt = Date.now();
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(15000);
    result.screenshots.after = await capture(page, path.join(outputDir, `${prefix}-after.png`));
    result.postTapRequests = requests.slice(result.requestStartIndex);
    result.postTapRequestCount = result.postTapRequests.length;
    result.postTapResourceTypes = result.postTapRequests.reduce((acc, entry) => { acc[entry.resourceType] = (acc[entry.resourceType] || 0) + 1; return acc; }, {});
    result.screenshotChanged = result.screenshots.before !== result.screenshots.after;
    result.mainFrameValid = page.url().startsWith(targetPrefix);
    result.final = await page.evaluate(() => ({ url: location.href, title: document.title, readyState: document.readyState, navigationGuard: globalThis.__gamsNavigationGuard || null }));
  } catch (error) {
    result.fatalError = String(error?.stack || error).slice(0, 8000);
  } finally {
    result.requests = requests.slice(0, 5000);
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
let cases = [];
try {
  cases = await Promise.all(points.map((point, index) => runCase(browser, point, index + 1)));
} finally {
  await browser.close();
}

const summary = {
  totalCases: cases.length,
  passedCases: cases.filter((item) => item.pass).length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  pageErrorCases: cases.filter((item) => item.pageErrors?.length).length,
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  changedCases: cases.filter((item) => item.screenshotChanged).length,
  requestBurstCases: cases.filter((item) => Number(item.postTapRequestCount || 0) >= 3).length,
  maxPostTapRequestCount: Math.max(0, ...cases.map((item) => Number(item.postTapRequestCount || 0))),
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-cover-entry-hit-map-page-only",
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
report.pass = summary.totalCases === points.length && summary.passedCases === points.length && summary.fatalCases === 0 && summary.pageErrorCases === 0 && summary.blockedOrderCases === 0;
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, ...summary, cases: cases.map((item) => ({ name: item.name, screenshotChanged: item.screenshotChanged, postTapRequestCount: item.postTapRequestCount })) }, null, 2));
if (!report.pass) process.exitCode = 1;
