#!/usr/bin/env node
// Diagnostic marker: page5-mobile-menu-guard-candidate
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-mobile-menu-guard-candidate";
const firstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const secondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const flowerTap = { x: 310, y: 741 };

fs.mkdirSync(outputDir, { recursive: true });

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function transformFirstFile(source) {
  let text = source;
  for (const old of [
    "https://gams-script-edge.2320006072.workers.dev/engine/stable.js",
    "https://preview-chat-1b176371-f9ab-4760-b15c-b9d70ed59d23.space-z.ai/game.js",
  ]) {
    text = text.split(old).join(virtualSecondUrl);
  }
  return text;
}

function wrapFirstFile(source) {
  return `(function(){if(window.__GG_V2_CONTROL_LOADED__)return;window.__GG_V2_CONTROL_LOADED__=true;try{\n${source}\n}catch(e){window.__GG_V2_CONTROL_LOADED__=false;console.error('[GG]',e);}})();`;
}

function makeCandidate(source) {
  const oldText = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(tT['sc'+'en'+'e']=new SCGMenu()),SF['Tk'+'Kw'+'f'](SAL_openMenu,";
  const newText = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(typeof SCGMenu!=='undefined'&&(tT['sc'+'en'+'e']=new SCGMenu())),SF['Tk'+'Kw'+'f'](SAL_openMenu,";
  const count = source.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`candidate replacement count mismatch: ${count}`);
  }
  const candidate = source.replace(oldText, newText);
  if (!candidate.includes(newText) || candidate.includes(oldText)) {
    throw new Error("candidate replacement verification failed");
  }
  return { candidate, oldText, newText, count };
}

function classifyRequest(rawUrl) {
  const lower = String(rawUrl || "").toLowerCase();
  if (
    lower === virtualSecondUrl.toLowerCase()
    || lower.includes("gams-script-edge.2320006072.workers.dev/engine/stable.js")
    || lower.includes("space-z.ai/game.js")
  ) {
    return "second-file";
  }
  if (lower.includes("c2.cgyouxi.com/website/hfplayer/") && lower.includes("/bin/official/game.js")) {
    return "official-file";
  }
  if (
    lower.includes("raw.githubusercontent.com/xianyumht-cmd/gams")
    && (lower.includes("/remote-script/") || lower.includes("/game-engine/"))
  ) {
    return "forbidden-remote-runtime";
  }
  if (lower.includes("createbuyorder") || lower.includes("createorder")) {
    return "order-request";
  }
  if (lower.includes("/propshop/") && lower.includes("get_goods_list")) {
    return "target-list-request";
  }
  if (lower.includes("/propshop/")) {
    return "target-read-request";
  }
  if (lower.includes("/sso/") || lower.includes("passport.")) {
    return "session-request";
  }
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
    .slice(0, 5000);
}

function isTopNavigation(request) {
  try {
    return request.isNavigationRequest() && request.frame().parentFrame() === null;
  } catch {
    return false;
  }
}

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

async function snapshot(page, stage) {
  return page.evaluate((stageName) => ({
    stage: stageName,
    at: Date.now(),
    url: location.href,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
    runtimeLoaded: Boolean(globalThis.__GG_V2_CONTROL_LOADED__),
    navigationGuard: globalThis.__gamsNavigationGuard || null,
  }), stage);
}

const firstRaw = fs.readFileSync(firstPath, "utf8");
const secondRaw = fs.readFileSync(secondPath, "utf8");
const patch = makeCandidate(secondRaw);
const pairs = [
  { name: "current", secondSource: secondRaw },
  { name: "candidate", secondSource: patch.candidate },
];

async function runCase(browser, pair, index) {
  const requests = [];
  const pageErrors = [];
  const consoleMessages = [];
  const requestFailures = [];
  const dialogs = [];
  const blockedOrders = [];
  const blockedExternalNavigations = [];
  const mainFrameNavigation = [];
  const loads = { first: 1, second: 0, official: 0 };

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
    const topNavigation = isTopNavigation(request);
    requests.push({
      at: Date.now(),
      kind,
      method: request.method(),
      resourceType: request.resourceType(),
      topNavigation,
      url: safeUrl(rawUrl),
      postDataLength: request.postDataBuffer()?.length || 0,
    });

    if (kind === "second-file") {
      loads.second += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript; charset=utf-8",
        body: pair.secondSource,
      });
      return;
    }
    if (kind === "official-file") {
      loads.official += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript; charset=utf-8",
        body: "window.__gg_official_engine_blocked__=true;",
      });
      return;
    }
    if (kind === "forbidden-remote-runtime") {
      await route.fulfill({ status: 403, contentType: "text/plain; charset=utf-8", body: "" });
      return;
    }
    if (kind === "order-request") {
      blockedOrders.push({
        at: Date.now(),
        method: request.method(),
        url: safeUrl(rawUrl),
        postDataLength: request.postDataBuffer()?.length || 0,
      });
      await route.abort("blockedbyclient");
      return;
    }
    if (topNavigation && !String(rawUrl).startsWith(targetPrefix)) {
      blockedExternalNavigations.push({
        at: Date.now(),
        method: request.method(),
        url: safeUrl(rawUrl),
      });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  await context.addInitScript({
    content: `
      (() => {
        const state = globalThis.__gamsNavigationGuard = globalThis.__gamsNavigationGuard || {
          supported: false,
          blocked: [],
          allowed: [],
        };
        try {
          if (globalThis.navigation && typeof globalThis.navigation.addEventListener === 'function') {
            state.supported = true;
            globalThis.navigation.addEventListener('navigate', (event) => {
              try {
                const url = new URL(event.destination.url, location.href);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                  state.blocked.push({
                    url: url.protocol + '//' + url.host + url.pathname,
                    at: Date.now(),
                  });
                  if (event.cancelable) event.preventDefault();
                  return;
                }
                state.allowed.push({
                  url: url.protocol + '//' + url.host + url.pathname,
                  at: Date.now(),
                });
              } catch (error) {
                state.blocked.push({
                  url: String(event.destination?.url || '').slice(0, 300),
                  at: Date.now(),
                });
                if (event.cancelable) event.preventDefault();
              }
            });
          }
        } catch (error) {
          state.error = String(error).slice(0, 300);
        }
      })();
    `,
  });
  await context.addInitScript({ content: wrapFirstFile(transformFirstFile(firstRaw)) });

  const page = await context.newPage();
  page.on("dialog", async (dialog) => {
    dialogs.push({ at: Date.now(), type: dialog.type(), message: redactText(dialog.message()) });
    await dialog.dismiss().catch(() => {});
  });
  page.on("console", (message) => {
    consoleMessages.push({ type: message.type(), text: redactText(message.text()) });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(redactText(error?.stack || error));
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({
      at: Date.now(),
      url: safeUrl(request.url()),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText || "",
    });
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      mainFrameNavigation.push({ at: Date.now(), url: safeUrl(frame.url()) });
    }
  });

  const prefix = `${String(index).padStart(2, "0")}-${pair.name}`;
  const result = {
    name: pair.name,
    targetUrl: safeUrl(targetUrl),
    flowerTap,
    first: {
      size: Buffer.byteLength(firstRaw),
      sha256: sha256(Buffer.from(firstRaw)),
    },
    second: {
      size: Buffer.byteLength(pair.secondSource),
      sha256: sha256(Buffer.from(pair.secondSource)),
    },
    screenshots: {},
  };

  try {
    const response = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(30000);
    result.before = await snapshot(page, "before-flower");
    result.screenshots.before = await capture(
      page,
      path.join(outputDir, `${prefix}-before.png`),
    );

    const requestStart = requests.length;
    result.flowerTapAt = Date.now();
    await page.touchscreen.tap(flowerTap.x, flowerTap.y);
    await page.waitForTimeout(8000);
    result.after = await snapshot(page, "after-flower");
    result.screenshots.after = await capture(
      page,
      path.join(outputDir, `${prefix}-after.png`),
    );
    const clickRequests = requests.slice(requestStart).filter((item) => item.at >= result.flowerTapAt);
    const kinds = {};
    for (const item of clickRequests) kinds[item.kind] = (kinds[item.kind] || 0) + 1;
    result.clickWindow = {
      total: clickRequests.length,
      kinds,
      targetListCount: clickRequests.filter((item) => item.kind === "target-list-request").length,
      targetReadCount: clickRequests.filter((item) => item.kind === "target-read-request").length,
      orderCount: clickRequests.filter((item) => item.kind === "order-request").length,
    };
  } catch (error) {
    result.fatalError = redactText(error?.stack || error);
    await capture(page, path.join(outputDir, `${prefix}-fatal.png`)).catch(() => {});
  } finally {
    result.requests = requests.slice(0, 5000);
    result.pageErrors = pageErrors.slice(0, 200);
    result.console = consoleMessages.slice(0, 600);
    result.requestFailures = requestFailures.slice(0, 1000);
    result.dialogs = dialogs.slice(0, 100);
    result.blockedOrders = blockedOrders;
    result.blockedExternalNavigations = blockedExternalNavigations;
    result.mainFrameNavigation = mainFrameNavigation;
    result.loads = loads;
    await context.close();
  }

  result.mainFrameValid = String(result.after?.url || result.before?.url || "").startsWith(targetPrefix);
  result.screenshotChanged = Boolean(
    result.screenshots.before
    && result.screenshots.after
    && result.screenshots.before !== result.screenshots.after,
  );
  result.captureOk = !result.fatalError
    && result.mainFrameValid
    && result.loads.first > 0
    && result.loads.second > 0
    && result.blockedOrders.length === 0
    && Boolean(result.before)
    && Boolean(result.after);
  return result;
}

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const cases = [];
try {
  let index = 0;
  for (const pair of pairs) {
    cases.push(await runCase(browser, pair, ++index));
    fs.writeFileSync(
      path.join(outputDir, "report.partial.json"),
      JSON.stringify({ cases }, null, 2) + "\n",
    );
  }
} finally {
  await browser.close();
}

const current = cases.find((item) => item.name === "current");
const candidate = cases.find((item) => item.name === "candidate");
const summary = {
  totalCases: cases.length,
  captureOkCases: cases.filter((item) => item.captureOk).length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  mainFrameValidCases: cases.filter((item) => item.mainFrameValid).length,
  currentPageErrorCount: current?.pageErrors?.length || 0,
  candidatePageErrorCount: candidate?.pageErrors?.length || 0,
  currentTargetReadCount: current?.clickWindow?.targetReadCount || 0,
  candidateTargetReadCount: candidate?.clickWindow?.targetReadCount || 0,
  currentTargetListCount: current?.clickWindow?.targetListCount || 0,
  candidateTargetListCount: candidate?.clickWindow?.targetListCount || 0,
  currentScreenshotChanged: Boolean(current?.screenshotChanged),
  candidateScreenshotChanged: Boolean(candidate?.screenshotChanged),
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  replacementCount: patch.count,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-mobile-menu-guard-candidate",
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
  candidatePrepared: true,
  candidateCommitted: false,
  patch: {
    replacementCount: patch.count,
    currentSize: Buffer.byteLength(secondRaw),
    currentSha256: sha256(Buffer.from(secondRaw)),
    candidateSize: Buffer.byteLength(patch.candidate),
    candidateSha256: sha256(Buffer.from(patch.candidate)),
  },
  cases,
  summary,
  captureOk: summary.totalCases === pairs.length
    && summary.captureOkCases === pairs.length
    && summary.fatalCases === 0
    && summary.mainFrameValidCases === pairs.length
    && summary.blockedOrderCases === 0,
};
report.pass = report.captureOk
  && summary.replacementCount === 1
  && summary.currentPageErrorCount >= 1
  && summary.currentTargetReadCount === 0
  && summary.candidatePageErrorCount === 0
  && summary.candidateTargetReadCount >= 1
  && summary.candidateScreenshotChanged;

fs.writeFileSync(
  path.join(outputDir, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ pass: report.pass, captureOk: report.captureOk, ...summary }, null, 2));
if (!report.pass) process.exitCode = 1;
