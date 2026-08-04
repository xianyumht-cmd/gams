#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "target-page-purchase-action-probe";
const currentFirstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const historicalFirstPath = process.env.HISTORICAL_FIRST_PATH || "/tmp/noname-1.1.1.js";
const secondPath = process.env.HISTORICAL_SECOND_PATH || "game-engine/release/game-1.0.2.js";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const entryTap = { x: 105, y: 650 };
const purchaseTap = { x: 187, y: 236 };
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
  return null;
}

async function snapshot(page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyText: String(document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 12000),
    navigationGuard: globalThis.__gamsNavigationGuard || null,
  }));
}

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

async function enterPurchaseScreen(page, events, stage) {
  await page.touchscreen.tap(entryTap.x, entryTap.y);
  events.push({ at: Date.now(), type: "tap", stage: `${stage}:entry-first`, ...entryTap });
  await page.waitForTimeout(2500);
  await page.touchscreen.tap(entryTap.x, entryTap.y);
  events.push({ at: Date.now(), type: "tap", stage: `${stage}:entry-second`, ...entryTap });
  await page.waitForTimeout(3500);
}

async function tapPurchase(page, events, stage) {
  await page.touchscreen.tap(purchaseTap.x, purchaseTap.y);
  events.push({ at: Date.now(), type: "tap", stage, ...purchaseTap });
  await page.waitForTimeout(4000);
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
    const kind = requestKind(route.request().url());
    if (kind === "second") {
      events.push({ at: Date.now(), type: "route", kind, url: route.request().url() });
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: secondBytes });
      return;
    }
    if (kind === "official") {
      events.push({ at: Date.now(), type: "route", kind, url: route.request().url() });
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: "window.__gg_official_engine_blocked__=true;" });
      return;
    }
    if (kind === "forbidden") {
      events.push({ at: Date.now(), type: "route", kind, url: route.request().url() });
      await route.fulfill({ status: 403, contentType: "text/plain; charset=utf-8", body: "" });
      return;
    }
    await route.continue();
  });

  await context.addInitScript({ content: `
    (()=>{const state=globalThis.__gamsNavigationGuard=globalThis.__gamsNavigationGuard||{supported:false,blocked:[]};
      try{if(globalThis.navigation&&typeof globalThis.navigation.addEventListener==='function'){state.supported=true;globalThis.navigation.addEventListener('navigate',(event)=>{try{const url=new URL(event.destination.url,location.href);if(url.protocol!=='http:'&&url.protocol!=='https:'){state.blocked.push({url:url.href,at:Date.now()});if(event.cancelable)event.preventDefault();}}catch(error){if(event.cancelable)event.preventDefault();}});}}catch(error){state.error=String(error);}})();
  ` });
  await context.addInitScript({ content: wrap(transform(firstRaw)) });

  const page = await context.newPage();
  page.on("dialog", async (dialog) => { dialogs.push({ type: dialog.type(), message: dialog.message(), at: Date.now() }); await dialog.accept().catch(() => {}); });
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: message.text().slice(0, 2000) }));
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 4000)));
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
    screenshots: {},
  };

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: page.url() };
    await page.waitForTimeout(28000);

    await enterPurchaseScreen(page, events, "initial");
    result.purchaseScreen = await snapshot(page);
    result.screenshots.purchaseScreen = await capture(page, path.join(outputDir, `${prefix}-purchase-screen.png`));

    await tapPurchase(page, events, "purchase-first");
    result.afterFirstPurchase = await snapshot(page);
    result.screenshots.afterFirstPurchase = await capture(page, path.join(outputDir, `${prefix}-after-first-purchase.png`));

    await tapPurchase(page, events, "purchase-second");
    result.afterSecondPurchase = await snapshot(page);
    result.screenshots.afterSecondPurchase = await capture(page, path.join(outputDir, `${prefix}-after-second-purchase.png`));

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(28000);
    await enterPurchaseScreen(page, events, "reenter");
    await tapPurchase(page, events, "purchase-third-after-reenter");
    result.afterThirdPurchase = await snapshot(page);
    result.screenshots.afterThirdPurchase = await capture(page, path.join(outputDir, `${prefix}-after-third-purchase.png`));
  } catch (error) {
    result.fatalError = String(error?.stack || error).slice(0, 8000);
    await capture(page, path.join(outputDir, `${prefix}-fatal.png`)).catch(() => {});
  } finally {
    result.events = events;
    result.dialogs = dialogs;
    result.console = consoleMessages.slice(0, 500);
    result.pageErrors = pageErrors.slice(0, 200);
    result.navigation = navigation;
    result.requestFailures = requestFailures.slice(0, 500);
    await context.close();
  }
  return result;
}

const pairs = [
  { name: "current-first-historical-second", firstPath: currentFirstPath },
  { name: "full-historical", firstPath: historicalFirstPath },
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

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "chromium-webview-equivalent-purchase-action-probe",
  apkExecuted: false,
  paymentCompleted: false,
  targets,
  entryTap,
  purchaseTap,
  cases,
  summary: {
    totalCases: cases.length,
    fatalCases: cases.filter((item) => item.fatalError).length,
    casesWithPageErrors: cases.filter((item) => item.pageErrors?.length).length,
    casesWithDialogs: cases.filter((item) => item.dialogs?.length).length,
    casesWithBlockedNonHttpNavigation: cases.filter((item) => [item.purchaseScreen, item.afterFirstPurchase, item.afterSecondPurchase, item.afterThirdPurchase]
      .some((snapshot) => snapshot?.navigationGuard?.blocked?.length)).length,
    firstSecondSameScreenshot: cases.filter((item) => item.screenshots?.afterFirstPurchase === item.screenshots?.afterSecondPurchase).length,
    firstThirdSameScreenshot: cases.filter((item) => item.screenshots?.afterFirstPurchase === item.screenshots?.afterThirdPurchase).length,
  },
};
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.summary, null, 2));
