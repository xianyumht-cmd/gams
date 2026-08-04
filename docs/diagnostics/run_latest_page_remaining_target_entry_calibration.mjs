#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "latest-page-remaining-target-entry-calibration";
const firstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const secondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const commonMenuTap = { x: 328, y: 740 };
const page2TargetTap = { x: 230, y: 540 };
const page5TitleTap = { x: 90, y: 400 };
const casesConfig = [
  { pageIndex: 2, targetUrl: "https://m.66rpg.com/h5/1683604?ohp=v3&quality=32", mode: "target-retry" },
  { pageIndex: 5, targetUrl: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32", mode: "title-exploration" },
];

fs.mkdirSync(outputDir, { recursive: true });

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

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

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

function windowSummary(requests, startAt, windowMs = 7000) {
  const items = requests.filter((item) => item.at >= startAt && item.at <= startAt + windowMs);
  const kinds = {};
  for (const item of items) kinds[item.kind] = (kinds[item.kind] || 0) + 1;
  return {
    total: items.length,
    kinds,
    targetReadCount: items.filter((item) => item.kind === "target-read-request").length,
    orderCount: items.filter((item) => item.kind === "order-request").length,
  };
}

async function runCase(browser, config) {
  const firstRaw = fs.readFileSync(firstPath, "utf8");
  const secondBytes = fs.readFileSync(secondPath);
  const requests = [];
  const responses = [];
  const requestFailures = [];
  const pageErrors = [];
  const consoleMessages = [];
  const blockedOrders = [];
  const dialogs = [];
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
  page.on("dialog", async (dialog) => {
    dialogs.push({ at: Date.now(), type: dialog.type(), message: redactText(dialog.message()) });
    await dialog.dismiss().catch(() => {});
  });
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: redactText(message.text()) }));
  page.on("pageerror", (error) => pageErrors.push(redactText(error?.stack || error)));
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

  const targetId = new URL(config.targetUrl).pathname.split("/").pop();
  const prefix = `${String(config.pageIndex).padStart(2, "0")}-${targetId}`;
  const result = {
    pageIndex: config.pageIndex,
    targetUrl: safeUrl(config.targetUrl),
    mode: config.mode,
    commonMenuTap,
    page2TargetTap: config.pageIndex === 2 ? page2TargetTap : null,
    page5TitleTap: config.pageIndex === 5 ? page5TitleTap : null,
    screenshots: {},
  };

  try {
    const response = await page.goto(config.targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(28000);
    result.screenshots.initial = await capture(page, path.join(outputDir, `${prefix}-initial.png`));

    if (config.pageIndex === 2) {
      result.menuTapAt = Date.now();
      await page.touchscreen.tap(commonMenuTap.x, commonMenuTap.y);
      await page.waitForTimeout(3500);
      result.screenshots.menuOpen = await capture(page, path.join(outputDir, `${prefix}-menu-open.png`));

      result.targetTapAt = Date.now();
      await page.touchscreen.tap(page2TargetTap.x, page2TargetTap.y);
      await page.waitForTimeout(7000);
      result.screenshots.afterTarget = await capture(page, path.join(outputDir, `${prefix}-after-target.png`));
      result.targetWindow = windowSummary(requests, result.targetTapAt);
      result.targetScreenChanged = result.screenshots.menuOpen !== result.screenshots.afterTarget;
    } else {
      result.titleTap1At = Date.now();
      await page.touchscreen.tap(page5TitleTap.x, page5TitleTap.y);
      await page.waitForTimeout(4500);
      result.screenshots.afterTitle1 = await capture(page, path.join(outputDir, `${prefix}-after-title-1.png`));
      result.titleWindow1 = windowSummary(requests, result.titleTap1At, 5000);

      result.titleTap2At = Date.now();
      await page.touchscreen.tap(page5TitleTap.x, page5TitleTap.y);
      await page.waitForTimeout(6500);
      result.screenshots.afterTitle2 = await capture(page, path.join(outputDir, `${prefix}-after-title-2.png`));
      result.titleWindow2 = windowSummary(requests, result.titleTap2At);

      result.menuTapAt = Date.now();
      await page.touchscreen.tap(commonMenuTap.x, commonMenuTap.y);
      await page.waitForTimeout(3500);
      result.screenshots.menuOpen = await capture(page, path.join(outputDir, `${prefix}-menu-open.png`));
      result.menuWindow = windowSummary(requests, result.menuTapAt, 5000);
    }
  } catch (error) {
    result.fatalError = redactText(error?.stack || error);
    await capture(page, path.join(outputDir, `${prefix}-fatal.png`)).catch(() => {});
  } finally {
    result.requests = requests.slice(0, 4000);
    result.responses = responses.slice(0, 4000);
    result.requestFailures = requestFailures.slice(0, 1000);
    result.pageErrors = pageErrors.slice(0, 200);
    result.console = consoleMessages.slice(0, 500);
    result.dialogs = dialogs.slice(0, 100);
    result.blockedOrders = blockedOrders;
    result.runtimeLoads = runtimeLoads;
    await context.close();
  }
  return result;
}

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const cases = [];
try {
  for (const config of casesConfig) {
    cases.push(await runCase(browser, config));
    fs.writeFileSync(path.join(outputDir, "report.partial.json"), JSON.stringify({ casesConfig, cases }, null, 2) + "\n");
  }
} finally {
  await browser.close();
}

const page2 = cases.find((item) => item.pageIndex === 2);
const page5 = cases.find((item) => item.pageIndex === 5);
const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  pageErrorCases: cases.filter((item) => item.pageErrors.length > 0).length,
  runtimeLoadedCases: cases.filter((item) => item.runtimeLoads.first > 0 && item.runtimeLoads.second > 0).length,
  blockedOrderCases: cases.filter((item) => item.blockedOrders.length > 0).length,
  page2TargetScreenChanged: Boolean(page2?.targetScreenChanged),
  page2TargetReadCount: page2?.targetWindow?.targetReadCount || 0,
  page5Title1Changed: Boolean(page5 && page5.screenshots.initial !== page5.screenshots.afterTitle1),
  page5Title2Changed: Boolean(page5 && page5.screenshots.afterTitle1 !== page5.screenshots.afterTitle2),
  page5MenuChanged: Boolean(page5 && page5.screenshots.afterTitle2 !== page5.screenshots.menuOpen),
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "remaining-target-entry-calibration-capture-only",
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  visualValidationComplete: false,
  cases,
  summary,
  captureOk: summary.totalCases === casesConfig.length
    && summary.fatalCases === 0
    && summary.runtimeLoadedCases === casesConfig.length
    && summary.blockedOrderCases === 0,
};
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ captureOk: report.captureOk, visualValidationComplete: false, ...summary }, null, 2));
if (!report.captureOk) process.exitCode = 1;
