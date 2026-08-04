#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-cover-transition-probe";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const probes = [
  {
    name: "single-tap-long-wait",
    actions: [
      { type: "tap", label: "cover-enter", x: 80, y: 410, waitMs: 5000 },
      { type: "wait", label: "wait-10", waitMs: 5000 },
      { type: "wait", label: "wait-20", waitMs: 10000 },
      { type: "wait", label: "wait-35", waitMs: 15000 },
    ],
  },
  {
    name: "second-center-tap",
    actions: [
      { type: "tap", label: "cover-enter", x: 80, y: 410, waitMs: 6000 },
      { type: "tap", label: "center-confirm", x: 195, y: 422, waitMs: 8000 },
      { type: "wait", label: "settled", waitMs: 15000 },
    ],
  },
  {
    name: "second-prompt-tap",
    actions: [
      { type: "tap", label: "cover-enter", x: 80, y: 410, waitMs: 6000 },
      { type: "tap", label: "prompt-confirm", x: 80, y: 410, waitMs: 8000 },
      { type: "wait", label: "settled", waitMs: 15000 },
    ],
  },
];

fs.mkdirSync(outputDir, { recursive: true });
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const safeUrl = (raw) => { try { const u = new URL(String(raw)); return `${u.protocol}//${u.host}${u.pathname}`; } catch { return String(raw || "").slice(0, 300); } };

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

async function runProbe(browser, probe, index) {
  const requests = [], blockedOrders = [], blockedNavigations = [], pageErrors = [], requestFailures = [], navigation = [], events = [];
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

  const prefix = `${String(index).padStart(2, "0")}-${probe.name}`;
  const result = { name: probe.name, actions: probe.actions, screenshots: {}, screenshotSequence: [] };
  const stage = async (name) => {
    const file = path.join(outputDir, `${prefix}-${name}.png`);
    const hash = await capture(page, file);
    result.screenshots[name] = hash;
    result.screenshotSequence.push({ stage: name, hash });
  };

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(50000);
    await stage("cover-ready");
    for (let actionIndex = 0; actionIndex < probe.actions.length; actionIndex += 1) {
      const action = probe.actions[actionIndex];
      if (action.type === "tap") {
        await page.touchscreen.tap(action.x, action.y);
        events.push({ at: Date.now(), type: "tap", ...action });
      } else {
        events.push({ at: Date.now(), type: "wait", ...action });
      }
      await page.waitForTimeout(action.waitMs);
      await stage(`${String(actionIndex + 1).padStart(2, "0")}-${action.label}`);
    }
    result.final = await page.evaluate(() => ({ url: location.href, title: document.title, readyState: document.readyState, navigationGuard: globalThis.__gamsNavigationGuard || null }));
    result.mainFrameValid = page.url().startsWith(targetPrefix);
  } catch (error) {
    result.fatalError = String(error?.stack || error).slice(0, 8000);
  } finally {
    result.events = events;
    result.requests = requests.slice(0, 5000);
    result.blockedOrders = blockedOrders;
    result.blockedNavigations = blockedNavigations;
    result.pageErrors = pageErrors;
    result.requestFailures = requestFailures.slice(0, 500);
    result.navigation = navigation;
    result.uniqueScreenshotCount = new Set(result.screenshotSequence.map((entry) => entry.hash)).size;
    result.pass = !result.fatalError && result.mainFrameValid && !pageErrors.length && !blockedOrders.length && result.uniqueScreenshotCount >= 2;
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
  passedCases: cases.filter((item) => item.pass).length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  pageErrorCases: cases.filter((item) => item.pageErrors?.length).length,
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  stronglyChangedCases: cases.filter((item) => item.uniqueScreenshotCount >= 3).length,
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-cover-transition-timing-probe",
  targetUrl: safeUrl(targetUrl),
  probes,
  cases,
  summary,
  apkExecuted: false,
  paymentCompleted: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
  authorizationOutcomeModified: false,
};
report.pass = summary.totalCases === probes.length && summary.passedCases === probes.length && summary.fatalCases === 0 && summary.pageErrorCases === 0 && summary.blockedOrderCases === 0;
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, ...summary }, null, 2));
if (!report.pass) process.exitCode = 1;
