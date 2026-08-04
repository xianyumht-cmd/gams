#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "latest-page-entry-shop-calibration";
const currentFirstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const currentSecondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const runtimeButtonSelector = "#orange-script-panel-button";
const runtimePanelSelector = "#orange-script-panel";
const directShopTap = { x: 105, y: 650 };
const pageMenuTap = { x: 320, y: 810 };
const targets = [
  { id: "1682748", url: "https://m.66rpg.com/h5/1682748?ohp=v3&quality=32", calibration: "direct-shop", tap: directShopTap },
  { id: "1683604", url: "https://m.66rpg.com/h5/1683604?ohp=v3&quality=32", calibration: "page-menu", tap: pageMenuTap },
  { id: "1683020", url: "https://m.66rpg.com/h5/1683020?ohp=v3&quality=32", calibration: "page-menu", tap: pageMenuTap },
  { id: "1668408", url: "https://m.66rpg.com/h5/1668408?ohp=v3&quality=32", calibration: "page-menu", tap: pageMenuTap },
  { id: "1691512", url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32", calibration: "page-menu", tap: pageMenuTap },
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

function redactText(value) {
  return String(value || "")
    .replace(/([?&](?:token|access_token|auth|authorization|code|ticket|session|sid|key|password|pwd)=)[^&#\s]+/gi, "$1<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .slice(0, 3000);
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

function requestKind(url) {
  const lower = String(url || "").toLowerCase();
  if (lower === virtualSecondUrl.toLowerCase()
      || lower.includes("gams-script-edge.2320006072.workers.dev/engine/stable.js")
      || lower.includes("space-z.ai/game.js")) return "second-file";
  if (lower.includes("c2.cgyouxi.com/website/hfplayer/") && lower.includes("/bin/official/game.js")) return "official-file";
  if (lower.includes("raw.githubusercontent.com/xianyumht-cmd/gams")
      && (lower.includes("/remote-script/") || lower.includes("/game-engine/"))) return "forbidden-remote-runtime";
  if (lower.includes("createbuyorder") || lower.includes("createorder")) return "order-request";
  return "page-request";
}

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

async function panelState(page, stage) {
  return page.evaluate(({ buttonSelector, panelSelector, stageName }) => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0
        && rect.width > 2 && rect.height > 2;
    };
    const button = document.querySelector(buttonSelector);
    const panel = document.querySelector(panelSelector);
    const text = String(panel?.innerText || "").replace(/\s+/g, " ").trim();
    const labels = [...(panel?.querySelectorAll("label") || [])].map((label) => String(label.innerText || "").replace(/\s+/g, " ").trim());
    const noLoginLabel = labels.find((value) => value.includes("免登录")) || "";
    return {
      stage: stageName,
      url: location.href,
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      runtimeLoaded: Boolean(globalThis.__GG_V2_CONTROL_LOADED__),
      buttonPresent: Boolean(button),
      buttonVisible: visible(button),
      buttonText: String(button?.innerText || "").trim().slice(0, 40),
      panelPresent: Boolean(panel),
      panelVisible: visible(panel),
      noLoginLabelPresent: Boolean(noLoginLabel),
      noLoginEnabledTextPresent: /免登录[^]*?开启/.test(text) || /免登录[^]*?on/i.test(text),
      panelTextLength: text.length,
      buttonRect: button ? (() => { const rect = button.getBoundingClientRect(); return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }; })() : null,
      panelRect: panel ? (() => { const rect = panel.getBoundingClientRect(); return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }; })() : null,
    };
  }, { buttonSelector: runtimeButtonSelector, panelSelector: runtimePanelSelector, stageName: stage });
}

async function clickRuntimeButton(page, events, stage) {
  const locator = page.locator(runtimeButtonSelector).first();
  await locator.waitFor({ state: "visible", timeout: 10000 });
  const box = await locator.boundingBox();
  await locator.click({ force: true, timeout: 6000 });
  events.push({ at: Date.now(), type: "runtime-button-click", stage, box: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null });
  await page.waitForTimeout(900);
}

async function runCase(browser, target, index) {
  const firstRaw = fs.readFileSync(currentFirstPath, "utf8");
  const secondBytes = fs.readFileSync(currentSecondPath);
  const events = [];
  const dialogs = [];
  const consoleMessages = [];
  const pageErrors = [];
  const navigation = [];
  const requestFailures = [];
  const requests = [];
  const blockedOrderRequests = [];
  const runtimeLoads = { first: 0, second: 0 };

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
    const kind = requestKind(request.url());
    requests.push({ at: Date.now(), kind, method: request.method(), resourceType: request.resourceType(), url: safeUrl(request.url()), postDataLength: request.postDataBuffer()?.length || 0 });
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
      blockedOrderRequests.push({ at: Date.now(), method: request.method(), url: safeUrl(request.url()), postDataLength: request.postDataBuffer()?.length || 0 });
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
  runtimeLoads.first += 1;
  page.on("dialog", async (dialog) => { dialogs.push({ type: dialog.type(), message: redactText(dialog.message()), at: Date.now() }); await dialog.accept().catch(() => {}); });
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: redactText(message.text()) }));
  page.on("pageerror", (error) => pageErrors.push(redactText(error?.stack || error)));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigation.push({ at: Date.now(), url: safeUrl(frame.url()) }); });
  page.on("requestfailed", (request) => requestFailures.push({ at: Date.now(), url: safeUrl(request.url()), resourceType: request.resourceType(), failure: request.failure()?.errorText || "" }));

  const prefix = `${String(index).padStart(2, "0")}-${target.id}`;
  const result = {
    targetId: target.id,
    targetUrl: safeUrl(target.url),
    calibration: target.calibration,
    calibrationTap: target.tap,
    first: { size: Buffer.byteLength(firstRaw), sha256: sha256(Buffer.from(firstRaw)) },
    second: { size: secondBytes.length, sha256: sha256(secondBytes) },
    stages: {},
    screenshots: {},
  };

  const stage = async (name) => {
    result.stages[name] = await panelState(page, name);
    result.screenshots[name] = await capture(page, path.join(outputDir, `${prefix}-${name}.png`));
  };

  try {
    const response = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(28000);
    await stage("initial-ready");

    await clickRuntimeButton(page, events, "runtime-open");
    await stage("runtime-open");
    await clickRuntimeButton(page, events, "runtime-close");
    await stage("runtime-close");
    await clickRuntimeButton(page, events, "runtime-reopen");
    await stage("runtime-reopen");
    await clickRuntimeButton(page, events, "runtime-final-close");
    await stage("runtime-final-close");

    await page.touchscreen.tap(target.tap.x, target.tap.y);
    events.push({ at: Date.now(), type: "calibration-tap", stage: target.calibration, x: target.tap.x, y: target.tap.y });
    await page.waitForTimeout(5000);
    await stage("after-calibration-tap");
  } catch (error) {
    result.fatalError = redactText(error?.stack || error);
    await capture(page, path.join(outputDir, `${prefix}-fatal.png`)).catch(() => {});
  } finally {
    result.events = events;
    result.dialogs = dialogs;
    result.console = consoleMessages.slice(0, 600);
    result.pageErrors = pageErrors.slice(0, 200);
    result.navigation = navigation;
    result.requestFailures = requestFailures.slice(0, 800);
    result.requests = requests.slice(0, 5000);
    result.blockedOrderRequests = blockedOrderRequests;
    result.runtimeLoads = runtimeLoads;
    result.navigationGuard = await page.evaluate(() => globalThis.__gamsNavigationGuard || null).catch(() => null);
    await context.close();
  }
  return result;
}

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const cases = [];
try {
  let index = 0;
  for (const target of targets) {
    cases.push(await runCase(browser, target, ++index));
    fs.writeFileSync(path.join(outputDir, "report.partial.json"), JSON.stringify({ targets: targets.map(({ id, url, calibration, tap }) => ({ id, url: safeUrl(url), calibration, tap })), cases }, null, 2) + "\n");
  }
} finally {
  await browser.close();
}

const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  runtimeButtonPresentCases: cases.filter((item) => item.stages?.["initial-ready"]?.buttonPresent).length,
  runtimeOpenCases: cases.filter((item) => item.stages?.["runtime-open"]?.panelVisible).length,
  runtimeCloseCases: cases.filter((item) => !item.stages?.["runtime-close"]?.panelVisible).length,
  runtimeReopenCases: cases.filter((item) => item.stages?.["runtime-reopen"]?.panelVisible).length,
  noLoginLabelCases: cases.filter((item) => item.stages?.["runtime-open"]?.noLoginLabelPresent).length,
  noLoginEnabledTextCases: cases.filter((item) => item.stages?.["runtime-open"]?.noLoginEnabledTextPresent).length,
  secondFileLoadCases: cases.filter((item) => item.runtimeLoads?.second > 0).length,
  calibrationStageCases: cases.filter((item) => item.stages?.["after-calibration-tap"]).length,
  blockedOrderRequestCases: cases.filter((item) => item.blockedOrderRequests?.length).length,
  pageErrorCases: cases.filter((item) => item.pageErrors?.length).length,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "current-runtime-entry-and-page-shop-calibration",
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  targets: targets.map(({ id, url, calibration, tap }) => ({ id, url: safeUrl(url), calibration, tap })),
  cases,
  summary,
};
report.pass = summary.totalCases === targets.length
  && summary.fatalCases === 0
  && summary.runtimeButtonPresentCases === targets.length
  && summary.runtimeOpenCases === targets.length
  && summary.runtimeCloseCases === targets.length
  && summary.runtimeReopenCases === targets.length
  && summary.noLoginLabelCases === targets.length
  && summary.noLoginEnabledTextCases === targets.length
  && summary.secondFileLoadCases === targets.length
  && summary.calibrationStageCases === targets.length
  && summary.blockedOrderRequestCases === 0
  && summary.pageErrorCases === 0;

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, ...summary }, null, 2));
if (!report.pass) process.exitCode = 1;
