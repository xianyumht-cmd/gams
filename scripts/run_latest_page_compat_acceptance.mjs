#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "latest-page-compat-acceptance";
const baselineFirstPath = process.env.BASELINE_FIRST_PATH || "/tmp/noname-1.1.4-baseline.js";
const candidateFirstPath = process.env.CANDIDATE_FIRST_PATH || "remote-script/src/noname.js";
const secondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const entryTap = { x: 105, y: 650 };
const purchaseTap = { x: 187, y: 236 };
const resumeTap = { x: 142, y: 500 };
const targets = [
  "https://m.66rpg.com/h5/1682748?ohp=v3&quality=32",
  "https://m.66rpg.com/h5/1683604?ohp=v3&quality=32",
  "https://m.66rpg.com/h5/1683020?ohp=v3&quality=32",
  "https://m.66rpg.com/h5/1668408?ohp=v3&quality=32",
  "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32",
];

fs.mkdirSync(outputDir, { recursive: true });

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function transform(source) {
  let text = source;
  for (const old of [
    "https://gams-script-edge.2320006072.workers.dev/engine/stable.js",
    "https://preview-chat-1b176371-f9ab-4760-b15c-b9d70ed59d23.space-z.ai/game.js",
  ]) text = text.split(old).join(virtualSecondUrl);
  return text;
}

function wrap(source) {
  return `(function(){if(window.__GG_V2_CONTROL_LOADED__)return;window.__GG_V2_CONTROL_LOADED__=true;try{\n${source}\n}catch(e){window.__GG_V2_CONTROL_LOADED__=false;console.error('[GG]',e);}})();`;
}

function requestKind(url) {
  const lower = String(url || "").toLowerCase();
  if (lower === virtualSecondUrl.toLowerCase()
      || lower.includes("gams-script-edge.2320006072.workers.dev/engine/stable.js")
      || lower.includes("space-z.ai/game.js")) return "second";
  if (lower.includes("c2.cgyouxi.com/website/hfplayer/") && lower.includes("/bin/official/game.js")) return "official";
  if (lower.includes("raw.githubusercontent.com/xianyumht-cmd/gams")
      && (lower.includes("/remote-script/") || lower.includes("/game-engine/"))) return "forbidden";
  if (lower.includes("createbuyorder")) return "purchase-request";
  if (lower.includes("/sso/") || lower.includes("passport.")) return "session-check";
  return null;
}

async function snapshot(page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyText: String(document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 12000),
    navigationGuard: globalThis.__gamsNavigationGuard || null,
    compatibility: globalThis.__GG_LATEST_PAGE_COMPAT__ || null,
  }));
}

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

async function tap(page, events, stage, point, waitMs) {
  await page.touchscreen.tap(point.x, point.y);
  events.push({ at: Date.now(), type: "tap", stage, ...point });
  await page.waitForTimeout(waitMs);
}

async function enterPurchaseScreen(page, events, stage) {
  await tap(page, events, `${stage}:entry-first`, entryTap, 2500);
  await tap(page, events, `${stage}:entry-second`, entryTap, 3500);
}

async function prepareReentry(page, events) {
  await page.waitForTimeout(28000);
  await tap(page, events, "reentry:resume-or-continue", resumeTap, 8000);
  await enterPurchaseScreen(page, events, "reentry");
}

async function runCase(browser, pair, targetUrl, index) {
  const firstRaw = fs.readFileSync(pair.firstPath, "utf8");
  const secondBytes = fs.readFileSync(secondPath);
  const events = [];
  const dialogs = [];
  const consoleMessages = [];
  const pageErrors = [];
  const navigation = [];
  const requestFailures = [];
  const purchaseRequests = [];
  const sessionChecks = [];

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
    const url = route.request().url();
    const kind = requestKind(url);
    if (kind === "second") {
      events.push({ at: Date.now(), type: "route", kind, url });
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: secondBytes });
      return;
    }
    if (kind === "official") {
      events.push({ at: Date.now(), type: "route", kind, url });
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: "window.__gg_official_engine_blocked__=true;" });
      return;
    }
    if (kind === "forbidden") {
      events.push({ at: Date.now(), type: "route", kind, url });
      await route.fulfill({ status: 403, contentType: "text/plain; charset=utf-8", body: "" });
      return;
    }
    if (kind === "purchase-request") purchaseRequests.push({ at: Date.now(), url, method: route.request().method() });
    if (kind === "session-check") sessionChecks.push({ at: Date.now(), url, method: route.request().method() });
    await route.continue();
  });

  await context.addInitScript({ content: `
    (()=>{const state=globalThis.__gamsNavigationGuard=globalThis.__gamsNavigationGuard||{supported:false,blocked:[]};
      try{if(globalThis.navigation&&typeof globalThis.navigation.addEventListener==='function'){state.supported=true;globalThis.navigation.addEventListener('navigate',(event)=>{try{const url=new URL(event.destination.url,location.href);if(url.protocol!=='http:'&&url.protocol!=='https:'){state.blocked.push({url:url.href,at:Date.now()});if(event.cancelable)event.preventDefault();}}catch(error){if(event.cancelable)event.preventDefault();}});}}catch(error){state.error=String(error);}})();
  ` });
  await context.addInitScript({ content: wrap(transform(firstRaw)) });

  const page = await context.newPage();
  page.on("dialog", async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message(), at: Date.now() });
    await dialog.accept().catch(() => {});
  });
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: message.text().slice(0, 3000) }));
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 5000)));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigation.push({ at: Date.now(), url: frame.url() }); });
  page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || "" }));

  const prefix = `${String(index).padStart(2, "0")}-${pair.name}-${new URL(targetUrl).pathname.split('/').pop()}`;
  const result = {
    pair: pair.name,
    targetUrl,
    first: { size: Buffer.byteLength(firstRaw), sha256: sha256(Buffer.from(firstRaw)) },
    second: { size: secondBytes.length, sha256: sha256(secondBytes) },
    entryTap,
    purchaseTap,
    resumeTap,
    screenshots: {},
  };

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: page.url() };
    await page.waitForTimeout(28000);
    await enterPurchaseScreen(page, events, "initial");
    result.purchaseScreen = await snapshot(page);
    result.screenshots.purchaseScreen = await capture(page, path.join(outputDir, `${prefix}-purchase-screen.png`));

    await tap(page, events, "purchase-first", purchaseTap, 5000);
    result.afterFirstPurchase = await snapshot(page);
    result.screenshots.afterFirstPurchase = await capture(page, path.join(outputDir, `${prefix}-after-first-purchase.png`));

    await tap(page, events, "purchase-second-same-page", purchaseTap, 5000);
    result.afterSecondPurchase = await snapshot(page);
    result.screenshots.afterSecondPurchase = await capture(page, path.join(outputDir, `${prefix}-after-second-purchase.png`));

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await prepareReentry(page, events);
    result.reentryPurchaseScreen = await snapshot(page);
    result.screenshots.reentryPurchaseScreen = await capture(page, path.join(outputDir, `${prefix}-reentry-purchase-screen.png`));

    await tap(page, events, "purchase-third-after-reentry", purchaseTap, 5000);
    result.afterThirdPurchase = await snapshot(page);
    result.screenshots.afterThirdPurchase = await capture(page, path.join(outputDir, `${prefix}-after-third-purchase.png`));
  } catch (error) {
    result.fatalError = String(error?.stack || error).slice(0, 8000);
    await capture(page, path.join(outputDir, `${prefix}-fatal.png`)).catch(() => {});
  } finally {
    result.events = events;
    result.dialogs = dialogs;
    result.console = consoleMessages.slice(0, 600);
    result.pageErrors = pageErrors.slice(0, 200);
    result.navigation = navigation;
    result.requestFailures = requestFailures.slice(0, 600);
    result.purchaseRequests = purchaseRequests;
    result.sessionChecks = sessionChecks;
    await context.close();
  }
  return result;
}

const pairs = [
  { name: "baseline-1.1.4", firstPath: baselineFirstPath },
  { name: "candidate-1.1.5", firstPath: candidateFirstPath },
];

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const cases = [];
try {
  let index = 0;
  for (const targetUrl of targets) {
    const batch = pairs.map((pair) => ({ pair, targetUrl, index: ++index }));
    cases.push(...await Promise.all(batch.map((item) => runCase(browser, item.pair, item.targetUrl, item.index))));
    fs.writeFileSync(path.join(outputDir, "report.partial.json"), JSON.stringify({ targets, cases }, null, 2) + "\n");
  }
} finally {
  await browser.close();
}

function totalResponses(snapshot) {
  const value = snapshot?.compatibility;
  return Number(value?.jsonpResponses || 0) + Number(value?.fetchResponses || 0) + Number(value?.xhrResponses || 0);
}

const candidateCases = cases.filter((item) => item.pair === "candidate-1.1.5");
const baselineCases = cases.filter((item) => item.pair === "baseline-1.1.4");
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  mode: "chromium-webview-equivalent-latest-page-compatibility",
  apkExecuted: false,
  paymentCompleted: false,
  targets,
  entryTap,
  purchaseTap,
  resumeTap,
  cases,
  summary: {
    totalCases: cases.length,
    baselineCases: baselineCases.length,
    candidateCases: candidateCases.length,
    fatalCases: cases.filter((item) => item.fatalError).length,
    candidateFatalCases: candidateCases.filter((item) => item.fatalError).length,
    candidatePageErrorCases: candidateCases.filter((item) => item.pageErrors?.length).length,
    candidateFirstResponseCases: candidateCases.filter((item) => totalResponses(item.afterFirstPurchase) >= 1).length,
    candidateSecondResponseCases: candidateCases.filter((item) => totalResponses(item.afterSecondPurchase) >= 2).length,
    candidateThirdResponseCases: candidateCases.filter((item) => totalResponses(item.afterThirdPurchase) >= 1).length,
    candidateRemotePurchaseRequestCases: candidateCases.filter((item) => item.purchaseRequests?.length).length,
    baselineRemotePurchaseRequestCases: baselineCases.filter((item) => item.purchaseRequests?.length).length,
    candidateBlockedNavigationCases: candidateCases.filter((item) => [item.purchaseScreen, item.afterFirstPurchase, item.afterSecondPurchase, item.afterThirdPurchase]
      .some((snapshot) => snapshot?.navigationGuard?.blocked?.length)).length,
  },
};
report.pass = report.summary.candidateFatalCases === 0
  && report.summary.candidatePageErrorCases === 0
  && report.summary.candidateFirstResponseCases === targets.length
  && report.summary.candidateSecondResponseCases === targets.length
  && report.summary.candidateThirdResponseCases === targets.length
  && report.summary.candidateRemotePurchaseRequestCases === 0;

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, ...report.summary }, null, 2));
if (!report.pass) process.exitCode = 1;
