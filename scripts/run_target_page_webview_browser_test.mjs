#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "target-page-webview-browser-test";
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

function wrapFirstSource(source) {
  return `(function(){if(window.__GG_V2_CONTROL_LOADED__)return;window.__GG_V2_CONTROL_LOADED__=true;try{\n${source}\n}catch(e){window.__GG_V2_CONTROL_LOADED__=false;console.error('[GG]',e);}})();`;
}

function loginIndicatorFromSnapshot(snapshot) {
  const combined = `${snapshot.url}\n${snapshot.title}\n${snapshot.bodyText}`;
  return /(?:\/login(?:[/?#]|$)|passport|账号登录|扫码登录|请先登录|立即登录|登录后)/i.test(combined);
}

async function visibleCandidates(page) {
  return page.evaluate(() => {
    const selectors = [
      "button", "a", "[role='button']", "input[type='button']", "input[type='submit']", "[onclick]",
    ].join(",");
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
    return [...document.querySelectorAll(selectors)].filter(visible).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        selector: cssPath(element),
        text: String(element.innerText || element.value || element.getAttribute("aria-label") || element.title || "")
          .replace(/\s+/g, " ").trim().slice(0, 240),
        tag: element.tagName.toLowerCase(),
        x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height),
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
    navigationGuard: globalThis.__gamsNavigationGuard || null,
    runtimeProbe: globalThis.__gamsRuntimeProbe || null,
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
    await locator.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    await locator.click({ force: true, timeout: 6000 });
    events.push({ at: Date.now(), type: "click", label, text: candidate.text, selector: candidate.selector });
    await page.waitForTimeout(900);
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
  result.navigationGuard = after.navigationGuard;
  result.runtimeProbe = after.runtimeProbe;
  result.bodyText = after.bodyText.slice(0, 8000);
  result.controlsAfter = (await visibleCandidates(page)).slice(0, 120);
  return result;
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

async function runCase(browser, pair, targetUrl, caseIndex) {
  const events = [];
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  const navigation = [];
  const dialogs = [];
  const routeEvents = [];
  const popups = [];
  const secondBytes = pair.secondPath ? fs.readFileSync(pair.secondPath) : null;
  let firstSource = null;
  let replacements = 0;
  let firstRaw = null;
  if (pair.firstPath) {
    firstRaw = fs.readFileSync(pair.firstPath, "utf8");
    const transformed = transformFirstSource(firstRaw);
    firstSource = wrapFirstSource(transformed.transformed);
    replacements = transformed.replacements;
  }

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
    if (kind === "second" && secondBytes) {
      routeEvents.push({ at: Date.now(), kind, url: route.request().url(), method: route.request().method() });
      await route.fulfill({
        status: 200,
        contentType: "application/javascript; charset=utf-8",
        headers: { "Cache-Control": "no-store, no-cache, max-age=0", "Access-Control-Allow-Origin": "*" },
        body: secondBytes,
      });
      return;
    }
    if (kind === "official" && pair.inject) {
      routeEvents.push({ at: Date.now(), kind, url: route.request().url(), method: route.request().method() });
      await route.fulfill({
        status: 200,
        contentType: "application/javascript; charset=utf-8",
        headers: { "Cache-Control": "no-store, no-cache, max-age=0" },
        body: "window.__gg_official_engine_blocked__=true;",
      });
      return;
    }
    if (kind === "forbidden" && pair.inject) {
      routeEvents.push({ at: Date.now(), kind, url: route.request().url(), method: route.request().method() });
      await route.fulfill({ status: 403, contentType: "text/plain; charset=utf-8", body: "" });
      return;
    }
    await route.continue();
  });

  const navigationGuard = `
    (() => {
      const state = globalThis.__gamsNavigationGuard = globalThis.__gamsNavigationGuard || {supported:false,blocked:[],allowed:[]};
      try {
        if (globalThis.navigation && typeof globalThis.navigation.addEventListener === 'function') {
          state.supported = true;
          globalThis.navigation.addEventListener('navigate', (event) => {
            try {
              const url = new URL(event.destination.url, location.href);
              if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                state.blocked.push({url:url.href,at:Date.now()});
                if (event.cancelable) event.preventDefault();
                return;
              }
              state.allowed.push({url:url.href,at:Date.now()});
            } catch (error) {
              state.blocked.push({url:String(event.destination?.url || ''),at:Date.now(),error:String(error)});
              if (event.cancelable) event.preventDefault();
            }
          });
        }
      } catch (error) { state.error = String(error); }
    })();
  `;
  await context.addInitScript({ content: navigationGuard });

  if (firstSource) {
    const probeStart = `globalThis.__gamsRuntimeProbe=globalThis.__gamsRuntimeProbe||{starts:0,completes:0,errors:[]};globalThis.__gamsRuntimeProbe.starts+=1;`;
    const probeEnd = `globalThis.__gamsRuntimeProbe.completes+=1;`;
    await context.addInitScript({ content: `${probeStart}\ntry{\n${firstSource}\n}catch(error){globalThis.__gamsRuntimeProbe.errors.push(String(error?.stack||error));}\n${probeEnd}` });
  }

  const page = await context.newPage();
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: message.text().slice(0, 2000) }));
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 4000)));
  page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), method: request.method(), failure: request.failure()?.errorText || "" }));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigation.push({ at: Date.now(), url: frame.url() }); });
  page.on("popup", async (popup) => {
    popups.push({ at: Date.now(), url: popup.url() });
    await popup.close().catch(() => {});
  });
  page.on("dialog", async (dialog) => {
    dialogs.push({ at: Date.now(), type: dialog.type(), message: dialog.message().slice(0, 2000) });
    await dialog.accept().catch(() => {});
  });

  const id = `${String(caseIndex).padStart(2, "0")}-${sanitize(pair.name)}-${sanitize(new URL(targetUrl).pathname)}`;
  const result = {
    pair: pair.name,
    inject: pair.inject,
    targetUrl,
    first: firstRaw ? { path: pair.firstPath, size: Buffer.byteLength(firstRaw), sha256: sha256(Buffer.from(firstRaw)), replacements } : null,
    second: secondBytes ? { path: pair.secondPath, size: secondBytes.length, sha256: sha256(secondBytes) } : null,
    startedAt: new Date().toISOString(),
    goto: null,
    attempts: [],
  };

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: page.url() };
    await page.waitForTimeout(9000);
    await page.screenshot({ path: path.join(outputDir, `${id}-initial.png`), fullPage: true });
    result.initial = await snapshot(page);
    result.initial.loginIndicator = loginIndicatorFromSnapshot(result.initial);
    result.initial.controls = (await visibleCandidates(page)).slice(0, 150);

    result.attempts.push(await attemptFlow(page, events, "same-page-first"));
    result.attempts.push(await attemptFlow(page, events, "same-page-second"));
    await page.screenshot({ path: path.join(outputDir, `${id}-after-second.png`), fullPage: true });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(9000);
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
    result.routeEvents = routeEvents;
    result.popups = popups;
    result.finishedAt = new Date().toISOString();
    await context.close();
  }
  return result;
}

const pairs = [
  { name: "page-baseline", inject: false, firstPath: null, secondPath: null },
  { name: "current-first-historical-second", inject: true, firstPath: currentFirstPath, secondPath: historicalSecondPath },
  { name: "full-historical", inject: true, firstPath: historicalFirstPath, secondPath: historicalSecondPath },
];

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  mode: "chromium-webview-equivalent-navigation-and-resource-policy",
  apkExecuted: false,
  paymentCompleted: false,
  targetUrls,
  pairs: pairs.map((pair) => ({ name: pair.name, inject: pair.inject })),
  cases: [],
};

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
try {
  let index = 0;
  for (const targetUrl of targetUrls) {
    const batch = pairs.map((pair) => ({ pair, targetUrl, caseIndex: ++index }));
    const completed = await Promise.all(batch.map(({ pair, targetUrl: url, caseIndex }) => runCase(browser, pair, url, caseIndex)));
    report.cases.push(...completed);
    fs.writeFileSync(path.join(outputDir, "report.partial.json"), JSON.stringify(report, null, 2) + "\n");
  }
} finally {
  await browser.close();
}

const injectedCases = report.cases.filter((item) => item.inject);
const baselineCases = report.cases.filter((item) => !item.inject);
report.summary = {
  totalCases: report.cases.length,
  baselineCases: baselineCases.length,
  injectedCases: injectedCases.length,
  fatalCases: report.cases.filter((item) => item.fatalError).length,
  baselineBlankCases: baselineCases.filter((item) => item.initial?.url === "about:blank").length,
  injectedBlankCases: injectedCases.filter((item) => item.initial?.url === "about:blank").length,
  initialLoginCases: report.cases.filter((item) => item.initial?.loginIndicator).length,
  secondAttemptLoginCases: report.cases.filter((item) => item.attempts?.[1]?.loginIndicator).length,
  reenterLoginCases: report.cases.filter((item) => item.attempts?.[2]?.loginIndicator).length,
  injectedCasesWithSecondRouteLoad: injectedCases.filter((item) => item.routeEvents?.some((entry) => entry.kind === "second")).length,
  casesWithPageErrors: report.cases.filter((item) => item.pageErrors?.length > 0).length,
  casesWithBlockedNonHttpNavigation: report.cases.filter((item) => (item.initial?.navigationGuard?.blocked?.length || 0) > 0).length,
  casesWithEntryClick: report.cases.filter((item) => item.attempts?.some((attempt) => attempt.entryClick?.ok)).length,
  casesWithActionClick: report.cases.filter((item) => item.attempts?.some((attempt) => attempt.actionClick?.ok)).length,
};
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.summary, null, 2));
