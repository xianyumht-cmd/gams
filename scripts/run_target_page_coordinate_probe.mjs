#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "target-page-coordinate-probe";
const currentFirstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const historicalFirstPath = process.env.HISTORICAL_FIRST_PATH || "/tmp/noname-1.1.1.js";
const secondPath = process.env.HISTORICAL_SECOND_PATH || "game-engine/release/game-1.0.2.js";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const targetUrl = process.env.TARGET_URL || "https://m.66rpg.com/h5/1682748?ohp=v3&quality=32";
const tapX = Number(process.env.TAP_X || 240);
const tapY = Number(process.env.TAP_Y || 744);

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
    canvasCount: document.querySelectorAll("canvas").length,
    navigationGuard: globalThis.__gamsNavigationGuard || null,
  }));
}

async function runCase(browser, pair) {
  const firstRaw = fs.readFileSync(pair.firstPath, "utf8");
  const secondBytes = fs.readFileSync(secondPath);
  const events = [];
  const dialogs = [];
  const consoleMessages = [];
  const pageErrors = [];
  const navigation = [];
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

  const result = {
    pair: pair.name,
    targetUrl,
    tap: { x: tapX, y: tapY },
    first: { size: Buffer.byteLength(firstRaw), sha256: sha256(Buffer.from(firstRaw)) },
    second: { size: secondBytes.length, sha256: sha256(secondBytes) },
  };

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: page.url() };
    await page.waitForTimeout(18000);
    result.before = await snapshot(page);
    await page.screenshot({ path: path.join(outputDir, `${pair.name}-before.png`), fullPage: true });

    await page.touchscreen.tap(tapX, tapY);
    events.push({ at: Date.now(), type: "tap", x: tapX, y: tapY, stage: "first" });
    await page.waitForTimeout(3500);
    result.afterFirst = await snapshot(page);
    await page.screenshot({ path: path.join(outputDir, `${pair.name}-after-first.png`), fullPage: true });

    await page.touchscreen.tap(tapX, tapY);
    events.push({ at: Date.now(), type: "tap", x: tapX, y: tapY, stage: "second" });
    await page.waitForTimeout(3500);
    result.afterSecond = await snapshot(page);
    await page.screenshot({ path: path.join(outputDir, `${pair.name}-after-second.png`), fullPage: true });
  } catch (error) {
    result.fatalError = String(error?.stack || error).slice(0, 8000);
    await page.screenshot({ path: path.join(outputDir, `${pair.name}-fatal.png`), fullPage: true }).catch(() => {});
  } finally {
    result.events = events;
    result.dialogs = dialogs;
    result.console = consoleMessages;
    result.pageErrors = pageErrors;
    result.navigation = navigation;
    await context.close();
  }
  return result;
}

const pairs = [
  { name: "current-first-historical-second", firstPath: currentFirstPath },
  { name: "full-historical", firstPath: historicalFirstPath },
];

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
let cases;
try {
  cases = await Promise.all(pairs.map((pair) => runCase(browser, pair)));
} finally {
  await browser.close();
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "chromium-webview-equivalent-canvas-coordinate-probe",
  apkExecuted: false,
  paymentCompleted: false,
  targetUrl,
  tap: { x: tapX, y: tapY },
  cases,
};
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ cases: cases.length, fatalCases: cases.filter((item) => item.fatalError).length }, null, 2));
