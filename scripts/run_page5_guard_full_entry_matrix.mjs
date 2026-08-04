#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-guard-full-entry-matrix";
const currentFirstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const currentSecondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const runtimeButtonSelector = "#orange-script-panel-button";
const runtimePanelSelector = "#orange-script-panel";
const commonMenuTap = { x: 328, y: 740 };

const routes = [
  { page: "page1", targetId: "1682748", url: "https://m.66rpg.com/h5/1682748?ohp=v3&quality=32", steps: [{ label: "common-menu", ...commonMenuTap }, { label: "target-entry", x: 175, y: 510 }], marker: "target-read" },
  { page: "page2", targetId: "1683604", url: "https://m.66rpg.com/h5/1683604?ohp=v3&quality=32", steps: [{ label: "common-menu", ...commonMenuTap }, { label: "target-entry", x: 230, y: 540 }], marker: "target-read" },
  { page: "page3", targetId: "1683020", url: "https://m.66rpg.com/h5/1683020?ohp=v3&quality=32", steps: [{ label: "common-menu", ...commonMenuTap }, { label: "target-entry", x: 75, y: 270 }], marker: "target-read" },
  { page: "page4", targetId: "1668408", url: "https://m.66rpg.com/h5/1668408?ohp=v3&quality=32", steps: [{ label: "common-menu", ...commonMenuTap }, { label: "target-entry", x: 372, y: 515 }], marker: "visual-change" },
  { page: "page5", targetId: "1691512", url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32", steps: [{ label: "target-entry", x: 310, y: 741 }], marker: "target-read" },
];

fs.mkdirSync(outputDir, { recursive: true });

function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

function transformFirstFile(source) {
  let text = source;
  for (const old of ["https://gams-script-edge.2320006072.workers.dev/engine/stable.js", "https://preview-chat-1b176371-f9ab-4760-b15c-b9d70ed59d23.space-z.ai/game.js"]) text = text.split(old).join(virtualSecondUrl);
  return text;
}

function wrapFirstFile(source) { return `(function(){if(window.__GG_V2_CONTROL_LOADED__)return;window.__GG_V2_CONTROL_LOADED__=true;try{\n${source}\n}catch(e){window.__GG_V2_CONTROL_LOADED__=false;console.error('[GG]',e);}})();`; }

function makeCandidate(source) {
  const oldText = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(tT['sc'+'en'+'e']=new SCGMenu()),SF['Tk'+'Kw'+'f'](SAL_openMenu,";
  const newText = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(typeof SCGMenu!=='undefined'&&(tT['sc'+'en'+'e']=new SCGMenu())),SF['Tk'+'Kw'+'f'](SAL_openMenu,";
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`candidate replacement count mismatch: ${count}`);
  const candidate = source.replace(oldText, newText);
  if (!candidate.includes(newText) || candidate.includes(oldText)) throw new Error("candidate replacement verification failed");
  return { candidate, count, oldTextSha256: sha256(Buffer.from(oldText)), newTextSha256: sha256(Buffer.from(newText)) };
}

function safeUrl(raw) {
  try {
    const url = new URL(String(raw));
    const keys = [...new Set([...url.searchParams.keys()])].sort();
    return `${url.protocol}//${url.host}${url.pathname}${keys.length ? `?keys=${keys.join(",")}` : ""}`;
  } catch { return String(raw || "").slice(0, 300); }
}

function redactText(value) {
  return String(value || "")
    .replace(/([?&](?:token|access_token|auth|authorization|code|ticket|session|sid|key|password|pwd)=)[^&#\s]+/gi, "$1<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .slice(0, 5000);
}

function classifyRequest(rawUrl, method) {
  const lower = String(rawUrl || "").toLowerCase();
  if (lower === virtualSecondUrl.toLowerCase() || lower.includes("gams-script-edge.2320006072.workers.dev/engine/stable.js") || lower.includes("space-z.ai/game.js")) return "second-file";
  if (lower.includes("c2.cgyouxi.com/website/hfplayer/") && lower.includes("/bin/official/game.js")) return "official-file";
  if (lower.includes("raw.githubusercontent.com/xianyumht-cmd/gams") && (lower.includes("/remote-script/") || lower.includes("/game-engine/"))) return "forbidden-remote-runtime";
  if (lower.includes("/propshop/") && lower.includes("get_goods_list")) return "target-list-request";
  if (lower.includes("/propshop/")) return "target-read-request";
  if (lower.includes("/sso/") || lower.includes("passport.")) return "session-request";
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
  if (mutation && (lower.includes("createbuyorder") || lower.includes("createorder") || lower.includes("/order/create") || lower.includes("purchase") || lower.includes("/pay"))) return "blocked-order-mutation";
  return "page-request";
}

function isTopNavigation(request) {
  try { return request.isNavigationRequest() && request.frame().parentFrame() === null; }
  catch { return false; }
}

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

async function pageState(page, stage) {
  return page.evaluate(({ stageName, buttonSelector, panelSelector }) => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && rect.width > 2 && rect.height > 2;
    };
    const button = document.querySelector(buttonSelector);
    const panel = document.querySelector(panelSelector);
    const panelText = String(panel?.innerText || "").replace(/\s+/g, " ").trim();
    return {
      stage: stageName, at: Date.now(), url: location.href, readyState: document.readyState, visibilityState: document.visibilityState,
      runtimeLoaded: Boolean(globalThis.__GG_V2_CONTROL_LOADED__), runtimeButtonPresent: Boolean(button), runtimeButtonVisible: visible(button),
      runtimePanelVisible: visible(panel), noLoginEnabledTextPresent: /免登录[^]*?开启/.test(panelText) || /免登录[^]*?on/i.test(panelText),
      navigationGuard: globalThis.__gamsNavigationGuard || null,
    };
  }, { stageName: stage, buttonSelector: runtimeButtonSelector, panelSelector: runtimePanelSelector });
}

async function clickRuntimeButton(page, events, label) {
  const locator = page.locator(runtimeButtonSelector).first();
  await locator.waitFor({ state: "visible", timeout: 10000 });
  const box = await locator.boundingBox();
  await locator.click({ force: true, timeout: 6000 });
  events.push({ at: Date.now(), type: "runtime-button-click", label, box: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null });
  await page.waitForTimeout(800);
}

function requestWindow(requests, startIndex) {
  const window = requests.slice(startIndex);
  const kinds = {};
  for (const item of window) kinds[item.kind] = (kinds[item.kind] || 0) + 1;
  return {
    total: window.length, kinds,
    targetReadCount: window.filter((item) => item.kind === "target-read-request" || item.kind === "target-list-request").length,
    targetListCount: window.filter((item) => item.kind === "target-list-request").length,
    orderMutationCount: window.filter((item) => item.kind === "blocked-order-mutation").length,
  };
}

async function runCase(browser, pair, route, index) {
  const firstRaw = fs.readFileSync(currentFirstPath, "utf8");
  const events = [], requests = [], pageErrors = [], consoleMessages = [], requestFailures = [], dialogs = [], blockedOrders = [], blockedExternalNavigations = [], mainFrameNavigation = [];
  const runtimeLoads = { first: 1, second: 0, official: 0 };
  const targetPrefix = `https://m.66rpg.com/h5/${route.targetId}`;

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: "zh-CN", timezoneId: "Asia/Shanghai", ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  });

  await context.route("**/*", async (routeControl) => {
    const request = routeControl.request();
    const rawUrl = request.url();
    const kind = classifyRequest(rawUrl, request.method());
    const topNavigation = isTopNavigation(request);
    const entry = { at: Date.now(), kind, method: request.method(), resourceType: request.resourceType(), topNavigation, url: safeUrl(rawUrl), postDataLength: request.postDataBuffer()?.length || 0 };
    requests.push(entry);
    if (kind === "second-file") { runtimeLoads.second += 1; await routeControl.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: pair.secondSource }); return; }
    if (kind === "official-file") { runtimeLoads.official += 1; await routeControl.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: "window.__gg_official_engine_blocked__=true;" }); return; }
    if (kind === "forbidden-remote-runtime") { await routeControl.fulfill({ status: 403, contentType: "text/plain; charset=utf-8", body: "" }); return; }
    if (kind === "blocked-order-mutation") { blockedOrders.push(entry); await routeControl.abort("blockedbyclient"); return; }
    if (topNavigation && !String(rawUrl).startsWith(targetPrefix)) { blockedExternalNavigations.push(entry); await routeControl.abort("blockedbyclient"); return; }
    await routeControl.continue();
  });

  await context.addInitScript({ content: `
    (()=>{const state=globalThis.__gamsNavigationGuard=globalThis.__gamsNavigationGuard||{supported:false,blocked:[],allowed:[]};
      try{if(globalThis.navigation&&typeof globalThis.navigation.addEventListener==='function'){state.supported=true;globalThis.navigation.addEventListener('navigate',(event)=>{try{const url=new URL(event.destination.url,location.href);if(url.protocol!=='http:'&&url.protocol!=='https:'){state.blocked.push({url:url.protocol+'//'+url.host+url.pathname,at:Date.now()});if(event.cancelable)event.preventDefault();return;}state.allowed.push({url:url.protocol+'//'+url.host+url.pathname,at:Date.now()});}catch(error){state.blocked.push({url:String(event.destination?.url||'').slice(0,300),at:Date.now()});if(event.cancelable)event.preventDefault();}});}}catch(error){state.error=String(error).slice(0,300);}})();
  ` });
  await context.addInitScript({ content: wrapFirstFile(transformFirstFile(firstRaw)) });

  const page = await context.newPage();
  page.on("dialog", async (dialog) => { dialogs.push({ at: Date.now(), type: dialog.type(), message: redactText(dialog.message()) }); await dialog.dismiss().catch(() => {}); });
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: redactText(message.text()) }));
  page.on("pageerror", (error) => pageErrors.push(redactText(error?.stack || error)));
  page.on("requestfailed", (request) => requestFailures.push({ at: Date.now(), url: safeUrl(request.url()), resourceType: request.resourceType(), failure: request.failure()?.errorText || "" }));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) mainFrameNavigation.push({ at: Date.now(), url: safeUrl(frame.url()) }); });

  const prefix = `${String(index).padStart(2, "0")}-${pair.name}-${route.page}`;
  const result = {
    pair: pair.name, page: route.page, targetId: route.targetId, targetUrl: safeUrl(route.url), marker: route.marker, steps: route.steps,
    first: { size: Buffer.byteLength(firstRaw), sha256: sha256(Buffer.from(firstRaw)) },
    second: { size: Buffer.byteLength(pair.secondSource), sha256: sha256(Buffer.from(pair.secondSource)) }, states: {}, screenshots: {},
  };

  const stage = async (name) => { result.states[name] = await pageState(page, name); result.screenshots[name] = await capture(page, path.join(outputDir, `${prefix}-${name}.png`)); };

  try {
    const response = await page.goto(route.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(28000);
    await stage("initial-ready");
    await clickRuntimeButton(page, events, "runtime-open"); await stage("runtime-open");
    await clickRuntimeButton(page, events, "runtime-close"); await stage("runtime-close");
    await clickRuntimeButton(page, events, "runtime-reopen"); await stage("runtime-reopen");
    await clickRuntimeButton(page, events, "runtime-final-close"); await stage("runtime-final-close");

    for (let stepIndex = 0; stepIndex < route.steps.length; stepIndex += 1) {
      const step = route.steps[stepIndex];
      const isFinal = stepIndex === route.steps.length - 1;
      if (isFinal) result.targetWindowStartIndex = requests.length;
      const beforeHash = await capture(page, path.join(outputDir, `${prefix}-before-${step.label}.png`));
      await page.touchscreen.tap(step.x, step.y);
      events.push({ at: Date.now(), type: "route-tap", stepIndex, ...step });
      await page.waitForTimeout(isFinal ? 10000 : 5000);
      const stageName = `after-${String(stepIndex + 1).padStart(2, "0")}-${step.label}`;
      await stage(stageName);
      const afterHash = result.screenshots[stageName];
      if (isFinal) { result.targetScreenChanged = beforeHash !== afterHash; result.targetWindow = requestWindow(requests, result.targetWindowStartIndex); }
    }
  } catch (error) {
    result.fatalError = redactText(error?.stack || error);
    await capture(page, path.join(outputDir, `${prefix}-fatal.png`)).catch(() => {});
  } finally {
    result.events = events; result.requests = requests.slice(0, 6000); result.pageErrors = pageErrors.slice(0, 200); result.console = consoleMessages.slice(0, 800);
    result.requestFailures = requestFailures.slice(0, 1000); result.dialogs = dialogs; result.blockedOrders = blockedOrders;
    result.blockedExternalNavigations = blockedExternalNavigations; result.mainFrameNavigation = mainFrameNavigation; result.runtimeLoads = runtimeLoads;
    await context.close();
  }
  return result;
}

const currentSecond = fs.readFileSync(currentSecondPath, "utf8");
const candidatePatch = makeCandidate(currentSecond);
const pairs = [{ name: "current", secondSource: currentSecond }, { name: "candidate", secondSource: candidatePatch.candidate }];

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const cases = [];
try {
  let index = 0;
  for (const route of routes) {
    const batch = pairs.map((pair) => ({ pair, route, index: ++index }));
    cases.push(...await Promise.all(batch.map((item) => runCase(browser, item.pair, item.route, item.index))));
    fs.writeFileSync(path.join(outputDir, "report.partial.json"), JSON.stringify({ routes, cases }, null, 2) + "\n");
  }
} finally { await browser.close(); }

function markerPassed(item) { return item.marker === "visual-change" ? Boolean(item.targetScreenChanged) : Number(item.targetWindow?.targetReadCount || 0) > 0; }

const currentCases = cases.filter((item) => item.pair === "current");
const candidateCases = cases.filter((item) => item.pair === "candidate");
const currentPage5 = currentCases.find((item) => item.page === "page5");
const candidatePage5 = candidateCases.find((item) => item.page === "page5");
const nonPage5Current = currentCases.filter((item) => item.page !== "page5");
const nonPage5Candidate = candidateCases.filter((item) => item.page !== "page5");

const summary = {
  totalCases: cases.length, currentCases: currentCases.length, candidateCases: candidateCases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  runtimeEntryCompleteCases: cases.filter((item) => item.states?.["runtime-open"]?.runtimePanelVisible && !item.states?.["runtime-close"]?.runtimePanelVisible && item.states?.["runtime-reopen"]?.runtimePanelVisible).length,
  noLoginEnabledCases: cases.filter((item) => item.states?.["runtime-open"]?.noLoginEnabledTextPresent).length,
  secondFileLoadCases: cases.filter((item) => item.runtimeLoads?.second > 0).length,
  nonPage5CurrentMarkerCases: nonPage5Current.filter(markerPassed).length,
  nonPage5CandidateMarkerCases: nonPage5Candidate.filter(markerPassed).length,
  nonPage5CurrentPageErrorCases: nonPage5Current.filter((item) => item.pageErrors?.length).length,
  nonPage5CandidatePageErrorCases: nonPage5Candidate.filter((item) => item.pageErrors?.length).length,
  currentPage5PageErrorCount: currentPage5?.pageErrors?.length || 0,
  currentPage5ExpectedErrorObserved: Boolean(currentPage5?.pageErrors?.some((value) => value.includes("SCGMenu is not defined"))),
  currentPage5TargetReadCount: currentPage5?.targetWindow?.targetReadCount || 0,
  candidatePage5PageErrorCount: candidatePage5?.pageErrors?.length || 0,
  candidatePage5TargetReadCount: candidatePage5?.targetWindow?.targetReadCount || 0,
  candidatePage5TargetListCount: candidatePage5?.targetWindow?.targetListCount || 0,
  candidatePage5ScreenshotChanged: Boolean(candidatePage5?.targetScreenChanged),
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  replacementCount: candidatePatch.count,
};

const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), mode: "page5-mobile-menu-guard-full-entry-matrix",
  apkExecuted: false, paymentCompleted: false, authorizationOutcomeModified: false, runtimeFilesChanged: false,
  androidClientChanged: false, productionDefaultChanged: false,
  candidatePatch: {
    replacementCount: candidatePatch.count, oldTextSha256: candidatePatch.oldTextSha256, newTextSha256: candidatePatch.newTextSha256,
    currentSecondSize: Buffer.byteLength(currentSecond), currentSecondSha256: sha256(Buffer.from(currentSecond)),
    candidateSecondSize: Buffer.byteLength(candidatePatch.candidate), candidateSecondSha256: sha256(Buffer.from(candidatePatch.candidate)),
  },
  routes: routes.map(({ page, targetId, url, steps, marker }) => ({ page, targetId, url: safeUrl(url), steps, marker })), cases, summary,
};

report.pass = summary.totalCases === routes.length * pairs.length
  && summary.fatalCases === 0
  && summary.runtimeEntryCompleteCases === routes.length * pairs.length
  && summary.noLoginEnabledCases === routes.length * pairs.length
  && summary.secondFileLoadCases === routes.length * pairs.length
  && summary.nonPage5CurrentMarkerCases === 4
  && summary.nonPage5CandidateMarkerCases === 4
  && summary.nonPage5CurrentPageErrorCases === 0
  && summary.nonPage5CandidatePageErrorCases === 0
  && summary.currentPage5ExpectedErrorObserved
  && summary.candidatePage5PageErrorCount === 0
  && summary.candidatePage5TargetReadCount > 0
  && summary.blockedOrderCases === 0
  && summary.replacementCount === 1;

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, ...summary }, null, 2));
if (!report.pass) process.exitCode = 1;
