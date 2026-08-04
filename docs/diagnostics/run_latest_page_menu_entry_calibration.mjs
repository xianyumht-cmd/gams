#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "latest-page-menu-entry-calibration";
const firstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const secondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const menuTap = { x: 50, y: 180 };
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

function transformFirstFile(source) {
  let text = source;
  for (const old of [
    "https://gams-script-edge.2320006072.workers.dev/engine/stable.js",
    "https://preview-chat-1b176371-f9ab-4760-b15c-b9d70ed59d23.space-z.ai/game.js",
  ]) text = text.split(old).join(virtualSecondUrl);
  return text;
}

function wrapFirstFile(source) {
  return `(function(){if(window.__GG_V2_CONTROL_LOADED__)return;window.__GG_V2_CONTROL_LOADED__=true;try{\n${source}\n}catch(e){window.__GG_V2_CONTROL_LOADED__=false;console.error('[GG]',e);}})();`;
}

function classifyRequest(rawUrl) {
  const lower = String(rawUrl || "").toLowerCase();
  if (lower === virtualSecondUrl.toLowerCase()
      || lower.includes("gams-script-edge.2320006072.workers.dev/engine/stable.js")
      || lower.includes("space-z.ai/game.js")) return "second-file";
  if (lower.includes("c2.cgyouxi.com/website/hfplayer/") && lower.includes("/bin/official/game.js")) return "official-file";
  if (lower.includes("raw.githubusercontent.com/xianyumht-cmd/gams")
      && (lower.includes("/remote-script/") || lower.includes("/game-engine/"))) return "forbidden-remote-runtime";
  if (lower.includes("createbuyorder") || lower.includes("createorder")) return "order-request";
  if (lower.includes("/propshop/")) return "target-read-request";
  if (lower.includes("/sso/") || lower.includes("passport.")) return "session-request";
  return "page-request";
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

function redactText(value) {
  return String(value || "")
    .replace(/([?&](?:token|access_token|auth|authorization|code|ticket|session|sid|key|password|pwd)=)[^&#\s]+/gi, "$1<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .slice(0, 3000);
}

async function screenshot(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

async function runCase(browser, targetUrl, index) {
  const firstRaw = fs.readFileSync(firstPath, "utf8");
  const secondBytes = fs.readFileSync(secondPath);
  const requests = [];
  const responses = [];
  const requestFailures = [];
  const consoleMessages = [];
  const pageErrors = [];
  const mainFrameNavigation = [];
  const blockedOrders = [];
  const runtimeLoads = { first: 1, second: 0 };

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
    const kind = classifyRequest(rawUrl);
    requests.push({
      at: Date.now(),
      kind,
      method: request.method(),
      resourceType: request.resourceType(),
      url: safeUrl(rawUrl),
      postDataLength: request.postDataBuffer()?.length || 0,
    });
    if (kind === "second-file") {
      runtimeLoads.second += 1;
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: secondBytes });
      return;
    }
    if (kind === "official-file") {
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: "window.__gg_official_engine_blocked__=true;" });
      return;
    }
    if (kind === "forbidden-remote-runtime") {
      await route.fulfill({ status: 403, contentType: "text/plain; charset=utf-8", body: "" });
      return;
    }
    if (kind === "order-request") {
      blockedOrders.push({ at: Date.now(), method: request.method(), url: safeUrl(rawUrl) });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  await context.addInitScript({ content: `
    (()=>{const state=globalThis.__gamsNavigationGuard=globalThis.__gamsNavigationGuard||{supported:false,blocked:[]};
      try{if(globalThis.navigation&&typeof globalThis.navigation.addEventListener==='function'){state.supported=true;globalThis.navigation.addEventListener('navigate',(event)=>{try{const url=new URL(event.destination.url,location.href);if(url.protocol!=='http:'&&url.protocol!=='https:'){state.blocked.push({url:url.protocol+'//'+url.host+url.pathname,at:Date.now()});if(event.cancelable)event.preventDefault();}}catch(error){if(event.cancelable)event.preventDefault();}});}}catch(error){state.error=String(error);}})();
  ` });
  await context.addInitScript({ content: wrapFirstFile(transformFirstFile(firstRaw)) });

  const page = await context.newPage();
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: redactText(message.text()) }));
  page.on("pageerror", (error) => pageErrors.push(redactText(error?.stack || error)));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigation.push({ at: Date.now(), url: safeUrl(frame.url()) });
  });
  page.on("requestfailed", (request) => requestFailures.push({
    at: Date.now(),
    url: safeUrl(request.url()),
    resourceType: request.resourceType(),
    failure: request.failure()?.errorText || "",
  }));
  page.on("response", async (response) => {
    const headers = await response.allHeaders().catch(() => ({}));
    responses.push({
      at: Date.now(),
      url: safeUrl(response.url()),
      status: response.status(),
      resourceType: response.request().resourceType(),
      contentType: String(headers["content-type"] || "").slice(0, 160),
    });
  });

  const targetId = new URL(targetUrl).pathname.split("/").pop();
  const prefix = `${String(index).padStart(2, "0")}-${targetId}`;
  const result = {
    pageIndex: index,
    targetUrl: safeUrl(targetUrl),
    menuTap,
    runtimeLoads,
    screenshots: {},
  };

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(28000);
    result.before = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      navigationGuard: globalThis.__gamsNavigationGuard || null,
      runtimeLoaded: Boolean(globalThis.__GG_V2_CONTROL_LOADED__),
    }));
    result.screenshots.before = await screenshot(page, path.join(outputDir, `${prefix}-before-menu.png`));

    result.menuTapAt = Date.now();
    await page.touchscreen.tap(menuTap.x, menuTap.y);
    await page.waitForTimeout(3500);
    result.after = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      navigationGuard: globalThis.__gamsNavigationGuard || null,
      runtimeLoaded: Boolean(globalThis.__GG_V2_CONTROL_LOADED__),
    }));
    result.screenshots.after = await screenshot(page, path.join(outputDir, `${prefix}-after-menu.png`));
    result.screenshotChanged = result.screenshots.before !== result.screenshots.after;
  } catch (error) {
    result.fatalError = redactText(error?.stack || error);
    await screenshot(page, path.join(outputDir, `${prefix}-fatal.png`)).catch(() => {});
  } finally {
    result.requests = requests.slice(0, 3000);
    result.responses = responses.slice(0, 3000);
    result.requestFailures = requestFailures.slice(0, 1000);
    result.console = consoleMessages.slice(0, 500);
    result.pageErrors = pageErrors.slice(0, 200);
    result.mainFrameNavigation = mainFrameNavigation;
    result.blockedOrders = blockedOrders;
    result.runtimeLoads = runtimeLoads;
    await context.close();
  }
  return result;
}

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const cases = [];
try {
  for (let index = 0; index < targets.length; index += 1) {
    cases.push(await runCase(browser, targets[index], index + 1));
    fs.writeFileSync(path.join(outputDir, "report.partial.json"), JSON.stringify({ menuTap, cases }, null, 2) + "\n");
  }
} finally {
  await browser.close();
}

const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  pageErrorCases: cases.filter((item) => item.pageErrors.length > 0).length,
  runtimeLoadedCases: cases.filter((item) => item.runtimeLoads.first > 0 && item.runtimeLoads.second > 0).length,
  screenshotChangedCases: cases.filter((item) => item.screenshotChanged).length,
  blockedOrderCases: cases.filter((item) => item.blockedOrders.length > 0).length,
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "menu-entry-calibration-capture-only",
  menuTap,
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  menuEntryValidated: false,
  cases,
  summary,
  captureOk: summary.totalCases === targets.length
    && summary.fatalCases === 0
    && summary.runtimeLoadedCases === targets.length
    && summary.blockedOrderCases === 0,
};
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ captureOk: report.captureOk, menuEntryValidated: false, ...summary }, null, 2));
if (!report.captureOk) process.exitCode = 1;
