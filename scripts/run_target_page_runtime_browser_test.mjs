#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "target-page-runtime-browser-test";
const historicalFirstPath = process.env.HISTORICAL_FIRST_PATH || "/tmp/noname-1.1.1.js";
const currentFirstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const historicalSecondPath = process.env.HISTORICAL_SECOND_PATH || "game-engine/release/game-1.0.2.js";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";

const targetUrls = [
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

function sanitize(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

function transformFirstSource(source) {
  let transformed = source;
  let replacements = 0;
  for (const address of [
    "https://gams-script-edge.2320006072.workers.dev/engine/stable.js",
    "https://preview-chat-1b176371-f9ab-4760-b15c-b9d70ed59d23.space-z.ai/game.js",
  ]) {
    const pieces = transformed.split(address);
    replacements += Math.max(0, pieces.length - 1);
    transformed = pieces.join(virtualSecondUrl);
  }
  return { transformed, replacements };
}

function loginIndicatorFromSnapshot(snapshot) {
  const combined = `${snapshot.url}\n${snapshot.title}\n${snapshot.bodyText}`;
  return /(?:\/login(?:[/?#]|$)|passport|账号登录|扫码登录|请先登录|立即登录|登录后)/i.test(combined);
}

async function visibleCandidates(page) {
  return page.evaluate(() => {
    const selectors = [
      "button",
      "a",
      "[role='button']",
      "input[type='button']",
      "input[type='submit']",
      "[onclick]",
    ].join(",");
    const nodes = [...document.querySelectorAll(selectors)];
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0
        && rect.width > 2 && rect.height > 2;
    };
    const cssPath = (element) => {
      const parts = [];
      let current = element;
      while (current && current.nodeType === 1 && parts.length < 8) {
        let part = current.tagName.toLowerCase();
        if (current.id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(current.id)) {
          part += `#${CSS.escape(current.id)}`;
          parts.unshift(part);
          break;
        }
        const parent = current.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((node) => node.tagName === current.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(" > ");
    };
    return nodes.filter(visible).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        selector: cssPath(element),
        text: String(element.innerText || element.value || element.getAttribute("aria-label") || element.title || "")
          .replace(/\s+/g, " ").trim().slice(0, 240),
        tag: element.tagName.toLowerCase(),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }).filter((entry) => entry.text).slice(0, 400);
  });
}

async function snapshot(page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyText: String(document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 30000),
    probe: globalThis.__gamsRuntimeBrowserProbe || null,
  }));
}

function selectCandidate(candidates, patterns, excluded = []) {
  for (const pattern of patterns) {
    const found = candidates.find((entry) => pattern.test(entry.text) && !excluded.some((item) => item.test(entry.text)));
    if (found) return found;
  }
  return null;
}

async function safeClick(page, candidate, events, label) {
  if (!candidate?.selector) return { ok: false, reason: "candidate_missing" };
  try {
    const locator = page.locator(candidate.selector).first();
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await locator.click({ force: true, timeout: 8000 });
    events.push({ at: Date.now(), type: "click", label, text: candidate.text, selector: candidate.selector });
    await page.waitForTimeout(1800);
    return { ok: true, text: candidate.text, selector: candidate.selector };
  } catch (error) {
    events.push({ at: Date.now(), type: "click_error", label, message: String(error?.message || error).slice(0, 1200) });
    return { ok: false, reason: String(error?.message || error).slice(0, 1200) };
  }
}

async function attemptFlow(page, events, attemptName) {
  const result = { attemptName, startedUrl: page.url() };
  let candidates = await visibleCandidates(page);
  result.controlsBefore = candidates.slice(0, 120);

  const menuCandidate = selectCandidate(candidates, [/^菜单$/i, /菜单/i, /功能/i]);
  result.menuClick = await safeClick(page, menuCandidate, events, `${attemptName}:menu`);

  candidates = await visibleCandidates(page);
  const entryCandidate = selectCandidate(
    candidates,
    [/商城/i, /商店/i, /购买/i, /道具/i, /礼包/i, /兑换/i],
    [/支付/i, /付款/i, /充值/i, /银行卡/i, /微信/i, /支付宝/i],
  );
  result.entryClick = await safeClick(page, entryCandidate, events, `${attemptName}:entry`);

  candidates = await visibleCandidates(page);
  const actionCandidate = selectCandidate(
    candidates,
    [/立即购买/i, /^购买$/i, /购买/i, /^兑换$/i, /兑换/i, /领取/i],
    [/支付/i, /付款/i, /充值/i, /银行卡/i, /微信/i, /支付宝/i, /确认支付/i],
  );
  result.actionClick = await safeClick(page, actionCandidate, events, `${attemptName}:action`);

  const after = await snapshot(page);
  result.finishedUrl = after.url;
  result.title = after.title;
  result.loginIndicator = loginIndicatorFromSnapshot(after);
  result.probe = after.probe;
  result.bodyText = after.bodyText.slice(0, 8000);
  result.controlsAfter = (await visibleCandidates(page)).slice(0, 120);
  return result;
}

async function runCase(browser, pair, targetUrl, caseIndex) {
  const events = [];
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  const navigation = [];
  const dialogs = [];
  const virtualRequests = [];
  const firstRaw = fs.readFileSync(pair.firstPath, "utf8");
  const secondBytes = fs.readFileSync(pair.secondPath);
  const { transformed: firstSource, replacements } = transformFirstSource(firstRaw);

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  });

  await context.route(virtualSecondUrl, async (route) => {
    virtualRequests.push({ at: Date.now(), url: route.request().url(), method: route.request().method() });
    await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: secondBytes });
  });

  const probeBootstrap = `
    (() => {
      const probe = globalThis.__gamsRuntimeBrowserProbe = globalThis.__gamsRuntimeBrowserProbe || {
        firstStarted: 0, firstCompleted: 0, firstErrors: [], unhandled: []
      };
      probe.firstStarted += 1;
      addEventListener('error', (event) => probe.unhandled.push({type:'error', message:String(event.message || '')}));
      addEventListener('unhandledrejection', (event) => probe.unhandled.push({type:'rejection', message:String(event.reason || '')}));
    })();
  `;
  const probeComplete = `
    (() => {
      const probe = globalThis.__gamsRuntimeBrowserProbe = globalThis.__gamsRuntimeBrowserProbe || {};
      probe.firstCompleted = Number(probe.firstCompleted || 0) + 1;
    })();
  `;
  await context.addInitScript({ content: `${probeBootstrap}\ntry {\n${firstSource}\n} catch (error) { globalThis.__gamsRuntimeBrowserProbe.firstErrors.push(String(error?.stack || error)); }\n${probeComplete}` });

  const page = await context.newPage();
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: message.text().slice(0, 2000) }));
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 4000)));
  page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), method: request.method(), failure: request.failure()?.errorText || "" }));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigation.push({ at: Date.now(), url: frame.url() }); });
  page.on("dialog", async (dialog) => {
    dialogs.push({ at: Date.now(), type: dialog.type(), message: dialog.message().slice(0, 2000) });
    await dialog.dismiss().catch(() => {});
  });

  const id = `${String(caseIndex).padStart(2, "0")}-${sanitize(pair.name)}-${sanitize(new URL(targetUrl).pathname)}`;
  const result = {
    pair: pair.name,
    targetUrl,
    first: { path: pair.firstPath, size: Buffer.byteLength(firstRaw), sha256: sha256(Buffer.from(firstRaw)), replacements },
    second: { path: pair.secondPath, size: secondBytes.length, sha256: sha256(secondBytes) },
    startedAt: new Date().toISOString(),
    goto: null,
    attempts: [],
  };

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    result.goto = { status: response?.status() ?? null, url: page.url() };
    await page.waitForTimeout(20000);
    await page.screenshot({ path: path.join(outputDir, `${id}-initial.png`), fullPage: true });
    result.initial = await snapshot(page);
    result.initial.loginIndicator = loginIndicatorFromSnapshot(result.initial);
    result.initial.controls = (await visibleCandidates(page)).slice(0, 150);

    result.attempts.push(await attemptFlow(page, events, "same-page-first"));
    result.attempts.push(await attemptFlow(page, events, "same-page-second"));
    await page.screenshot({ path: path.join(outputDir, `${id}-after-second.png`), fullPage: true });

    await page.goto("about:blank", { waitUntil: "load", timeout: 30000 });
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(20000);
    result.attempts.push(await attemptFlow(page, events, "reenter-third"));
    await page.screenshot({ path: path.join(outputDir, `${id}-after-reenter.png`), fullPage: true });
    result.final = await snapshot(page);
    result.final.loginIndicator = loginIndicatorFromSnapshot(result.final);
  } catch (error) {
    result.fatalError = String(error?.stack || error).slice(0, 8000);
    await page.screenshot({ path: path.join(outputDir, `${id}-fatal.png`), fullPage: true }).catch(() => {});
  } finally {
    result.events = events;
    result.console = consoleMessages.slice(0, 500);
    result.pageErrors = pageErrors.slice(0, 200);
    result.requestFailures = requestFailures.slice(0, 500);
    result.navigation = navigation;
    result.dialogs = dialogs;
    result.virtualRequests = virtualRequests;
    result.finishedAt = new Date().toISOString();
    await context.close();
  }
  return result;
}

const pairs = [
  { name: "current-first-historical-second", firstPath: currentFirstPath, secondPath: historicalSecondPath },
  { name: "full-historical", firstPath: historicalFirstPath, secondPath: historicalSecondPath },
];

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "chromium-document-start-with-virtual-second-route",
  paymentCompleted: false,
  targetUrls,
  pairs: [],
  cases: [],
};

for (const pair of pairs) {
  const first = fs.readFileSync(pair.firstPath);
  const second = fs.readFileSync(pair.secondPath);
  report.pairs.push({
    name: pair.name,
    first: { path: pair.firstPath, size: first.length, sha256: sha256(first) },
    second: { path: pair.secondPath, size: second.length, sha256: sha256(second) },
  });
}

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
try {
  let index = 0;
  for (const pair of pairs) {
    for (const targetUrl of targetUrls) {
      index += 1;
      report.cases.push(await runCase(browser, pair, targetUrl, index));
      fs.writeFileSync(path.join(outputDir, "report.partial.json"), JSON.stringify(report, null, 2) + "\n");
    }
  }
} finally {
  await browser.close();
}

report.summary = {
  totalCases: report.cases.length,
  fatalCases: report.cases.filter((item) => item.fatalError).length,
  initialLoginCases: report.cases.filter((item) => item.initial?.loginIndicator).length,
  secondAttemptLoginCases: report.cases.filter((item) => item.attempts?.[1]?.loginIndicator).length,
  reenterLoginCases: report.cases.filter((item) => item.attempts?.[2]?.loginIndicator).length,
  casesWithSecondRouteLoad: report.cases.filter((item) => item.virtualRequests?.length > 0).length,
  casesWithPageErrors: report.cases.filter((item) => item.pageErrors?.length > 0).length,
};
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.summary, null, 2));
