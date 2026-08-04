#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-load-entry-calibration";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const steps = [
  { label: "page-menu", x: 351, y: 741, waitMs: 3500 },
  { label: "load-entry", x: 215, y: 380, waitMs: 5000 },
];

fs.mkdirSync(outputDir, { recursive: true });
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const safeUrl = (raw) => { try { const u = new URL(String(raw)); return `${u.protocol}//${u.host}${u.pathname}`; } catch { return String(raw || "").slice(0, 300); } };
const isTopNavigation = (request) => { try { return request.isNavigationRequest() && request.frame().parentFrame() === null; } catch { return false; } };

async function capture(page, name) {
  const file = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return sha256(fs.readFileSync(file));
}

const requests = [], blockedOrders = [], blockedNavigations = [], pageErrors = [], requestFailures = [], navigation = [], events = [];
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
let result = { steps, stages: {}, screenshots: {} };
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
    const order = !["GET", "HEAD", "OPTIONS"].includes(method) && (lower.includes("createorder") || lower.includes("createbuyorder") || lower.includes("/pay"));
    const entry = { at: Date.now(), method, resourceType: request.resourceType(), url: safeUrl(rawUrl), topNavigation: isTopNavigation(request) };
    requests.push(entry);
    if (order) { blockedOrders.push(entry); await route.abort("blockedbyclient"); return; }
    if (entry.topNavigation && !rawUrl.startsWith(targetPrefix)) { blockedNavigations.push(entry); await route.abort("blockedbyclient"); return; }
    await route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 5000)));
  page.on("requestfailed", (request) => requestFailures.push({ url: safeUrl(request.url()), failure: request.failure()?.errorText || "" }));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigation.push({ at: Date.now(), url: safeUrl(frame.url()) }); });

  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
  await page.waitForTimeout(28000);
  result.screenshots.initial = await capture(page, "initial");

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    await page.touchscreen.tap(step.x, step.y);
    events.push({ at: Date.now(), type: "tap", ...step });
    await page.waitForTimeout(step.waitMs);
    result.screenshots[step.label] = await capture(page, `${String(i + 1).padStart(2, "0")}-${step.label}`);
  }
  result.final = await page.evaluate(() => ({ url: location.href, title: document.title, readyState: document.readyState }));
  result.events = events;
  result.requests = requests.slice(0, 5000);
  result.blockedOrders = blockedOrders;
  result.blockedNavigations = blockedNavigations;
  result.pageErrors = pageErrors;
  result.requestFailures = requestFailures.slice(0, 500);
  result.navigation = navigation;
  result.screenshotChangedAfterMenu = result.screenshots.initial !== result.screenshots["page-menu"];
  result.screenshotChangedAfterLoad = result.screenshots["page-menu"] !== result.screenshots["load-entry"];
  result.pass = !pageErrors.length && !blockedOrders.length && result.screenshotChangedAfterMenu && result.screenshotChangedAfterLoad;
  await context.close();
} catch (error) {
  result.fatalError = String(error?.stack || error).slice(0, 8000);
  result.pass = false;
} finally {
  await browser.close();
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-load-entry-calibration-page-only",
  apkExecuted: false,
  paymentCompleted: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
  authorizationOutcomeModified: false,
  ...result,
};
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, pageErrors: report.pageErrors?.length || 0, screenshotChangedAfterMenu: report.screenshotChangedAfterMenu, screenshotChangedAfterLoad: report.screenshotChangedAfterLoad }, null, 2));
if (!report.pass) process.exitCode = 1;
