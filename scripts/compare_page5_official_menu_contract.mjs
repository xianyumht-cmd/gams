#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-official-menu-contract-compare";
const currentSecondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const contextRadius = 4200;
const needles = ["SCGMenu", "SAL_openMenu", "newWmMenu", "isMobile"];

fs.mkdirSync(outputDir, { recursive: true });

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function indexesOf(source, needle, limit = 50) {
  const indexes = [];
  let cursor = 0;
  while (cursor < source.length && indexes.length < limit) {
    const index = source.indexOf(needle, cursor);
    if (index < 0) break;
    indexes.push(index);
    cursor = index + Math.max(needle.length, 1);
  }
  return indexes;
}

function boundedContexts(source, needle) {
  return indexesOf(source, needle, 12).map((index) => {
    const start = Math.max(0, index - contextRadius);
    const end = Math.min(source.length, index + needle.length + contextRadius);
    const snippet = source.slice(start, end);
    return {
      index,
      start,
      end,
      prefixLength: index - start,
      suffixLength: end - index - needle.length,
      snippetSize: Buffer.byteLength(snippet),
      snippetSha256: sha256(Buffer.from(snippet)),
      snippet,
    };
  });
}

function patternCounts(source) {
  const patterns = {
    functionDeclaration: /function\s+SCGMenu\b/g,
    classDeclaration: /class\s+SCGMenu\b/g,
    directAssignment: /SCGMenu\s*=\s*function\b/g,
    constructorUse: /new\s+SCGMenu\b/g,
    typeofGuard: /typeof\s+SCGMenu/g,
  };
  return Object.fromEntries(Object.entries(patterns).map(([name, expression]) => [name, [...source.matchAll(expression)].length]));
}

function analyzeSource(name, source, url = null) {
  const counts = Object.fromEntries(needles.map((needle) => [needle, indexesOf(source, needle).length]));
  return {
    name,
    url,
    size: Buffer.byteLength(source),
    sha256: sha256(Buffer.from(source)),
    counts,
    patternCounts: patternCounts(source),
    contexts: Object.fromEntries(needles.map((needle) => [needle, boundedContexts(source, needle)])),
  };
}

const currentSource = fs.readFileSync(currentSecondPath, "utf8");
let officialBytes = null;
let officialUrl = null;
let officialStatus = null;
let officialContentType = null;
const pageErrors = [];
const requestFailures = [];
const navigation = [];

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
try {
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
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 5000)));
  page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || "" }));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigation.push(frame.url()); });
  page.on("response", async (response) => {
    const url = response.url();
    const lower = url.toLowerCase();
    if (!lower.includes("c2.cgyouxi.com/website/hfplayer/") || !lower.includes("/bin/official/game.js")) return;
    if (officialBytes) return;
    try {
      officialBytes = await response.body();
      officialUrl = url;
      officialStatus = response.status();
      const headers = await response.allHeaders().catch(() => ({}));
      officialContentType = String(headers["content-type"] || "");
    } catch (error) {
      pageErrors.push(`official-response-body: ${String(error?.stack || error).slice(0, 4000)}`);
    }
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(18000);
  await context.close();
} finally {
  await browser.close();
}

if (!officialBytes || officialBytes.length === 0) {
  throw new Error("official current file was not captured");
}

const officialSource = officialBytes.toString("utf8");
const official = analyzeSource("official-current", officialSource, officialUrl);
const current = analyzeSource("current-second", currentSource, currentSecondPath);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-official-menu-contract-bounded-compare",
  targetUrl,
  capture: {
    officialUrl,
    officialStatus,
    officialContentType,
    officialBodyCaptured: true,
    fullOfficialBodyPersisted: false,
  },
  official,
  current,
  comparison: {
    sizeDelta: official.size - current.size,
    sameSha256: official.sha256 === current.sha256,
    needleCountDelta: Object.fromEntries(needles.map((needle) => [needle, official.counts[needle] - current.counts[needle]])),
    patternCountDelta: Object.fromEntries(Object.keys(official.patternCounts).map((name) => [name, official.patternCounts[name] - current.patternCounts[name]])),
  },
  pageErrors,
  requestFailures: requestFailures.slice(0, 500),
  navigation,
  apkExecuted: false,
  paymentCompleted: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
  authorizationOutcomeModified: false,
};

report.pass = officialStatus === 200
  && official.size > 0
  && current.size > 0
  && official.contexts.SCGMenu.length > 0
  && current.contexts.SCGMenu.length > 0;

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  pass: report.pass,
  officialSize: official.size,
  currentSize: current.size,
  officialCounts: official.counts,
  currentCounts: current.counts,
  officialPatterns: official.patternCounts,
  currentPatterns: current.patternCounts,
  sizeDelta: report.comparison.sizeDelta,
}, null, 2));
if (!report.pass) process.exitCode = 1;
