#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-home-entry-probe";
const firstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const secondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const probes = [
  {
    name: "title-progress",
    taps: [
      { x: 90, y: 400 },
      { x: 90, y: 400 },
      { x: 90, y: 400 },
      { x: 90, y: 400 },
    ],
    waitAfterEachMs: 1800,
  },
  { name: "flower-icon", taps: [{ x: 310, y: 741 }], waitAfterEachMs: 5000 },
  { name: "gift-icon", taps: [{ x: 245, y: 741 }], waitAfterEachMs: 5000 },
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
  ]) {
    text = text.split(old).join(virtualSecondUrl);
  }
  return text;
}

function wrapFirstFile(source) {
  return `(function(){if(window.__GG_V2_CONTROL_LOADED__)return;window.__GG_V2_CONTROL_LOADED__=true;try{\n${source}\n}catch(e){window.__GG_V2_CONTROL_LOADED__=false;console.error('[GG]',e);}})();`;
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
    .slice(0, 3000);
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

async function pointInfo(page, point) {
  return page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      tag: String(element.tagName || "").toLowerCase(),
      id: String(element.id || "").slice(0, 120),
      className: String(element.className || "").slice(0, 240),
      text: String(element.innerText || element.getAttribute?.("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }, point).catch(() => null);
}

async function runProbe(browser, probe, index) {
  const firstRaw = fs.readFileSync(firstPath, "utf8");
  const secondBytes = fs.readFileSync(secondPath);
  const requests = [];
  const requestFailures = [];
  const consoleMessages = [];
  const pageErrors = [];
  const dialogs = [];
  const blockedOrders = [];
  const blockedExternalNavigations = [];
  const mainFrameNavigation = [];
  const popupAttempts = [];
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
      runtimeLoads.second += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript; charset=utf-8",
        body: secondBytes,
      });
      return;
    }
    if (kind === "official-file") {
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
                  error: String(error).slice(0, 300),
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
  context.on("page", async (popup) => {
    if (popup === page) return;
    popupAttempts.push({ at: Date.now(), initialUrl: safeUrl(popup.url()) });
    await popup.close().catch(() => {});
  });
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
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      mainFrameNavigation.push({ at: Date.now(), url: safeUrl(frame.url()) });
    }
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({
      at: Date.now(),
      url: safeUrl(request.url()),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText || "",
    });
  });

  const prefix = `${String(index).padStart(2, "0")}-${probe.name}`;
  const result = {
    name: probe.name,
    taps: probe.taps,
    targetUrl: safeUrl(targetUrl),
    first: {
      size: Buffer.byteLength(firstRaw),
      sha256: sha256(Buffer.from(firstRaw)),
    },
    second: {
      size: secondBytes.length,
      sha256: sha256(secondBytes),
    },
    stages: [],
    screenshots: {},
  };

  try {
    const response = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    result.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
    await page.waitForTimeout(28000);
    result.beforeUrl = safeUrl(page.url());
    result.screenshots.initial = await capture(
      page,
      path.join(outputDir, `${prefix}-initial.png`),
    );

    for (let tapIndex = 0; tapIndex < probe.taps.length; tapIndex += 1) {
      const point = probe.taps[tapIndex];
      const requestStart = requests.length;
      const tapAt = Date.now();
      const hit = await pointInfo(page, point);
      await page.touchscreen.tap(point.x, point.y);
      await page.waitForTimeout(probe.waitAfterEachMs);

      const stageName = `after-tap-${tapIndex + 1}`;
      const stageUrl = safeUrl(page.url());
      const stageRequests = requests.slice(requestStart).filter((item) => item.at >= tapAt);
      const kinds = {};
      for (const item of stageRequests) {
        kinds[item.kind] = (kinds[item.kind] || 0) + 1;
      }
      const previousName = tapIndex === 0 ? "initial" : `after-tap-${tapIndex}`;
      result.screenshots[stageName] = await capture(
        page,
        path.join(outputDir, `${prefix}-${stageName}.png`),
      );
      result.stages.push({
        stage: stageName,
        point,
        hit,
        url: stageUrl,
        mainFrameValid: stageUrl.startsWith(targetPrefix),
        screenshotChangedFromPrevious:
          result.screenshots[stageName] !== result.screenshots[previousName],
        requestWindow: {
          total: stageRequests.length,
          kinds,
          targetListCount: stageRequests.filter((item) => item.kind === "target-list-request").length,
          targetReadCount: stageRequests.filter((item) => item.kind === "target-read-request").length,
          orderCount: stageRequests.filter((item) => item.kind === "order-request").length,
        },
      });
    }
    result.afterUrl = safeUrl(page.url());
  } catch (error) {
    result.fatalError = redactText(error?.stack || error);
    await capture(page, path.join(outputDir, `${prefix}-fatal.png`)).catch(() => {});
  } finally {
    result.requests = requests.slice(0, 5000);
    result.requestFailures = requestFailures.slice(0, 1000);
    result.console = consoleMessages.slice(0, 600);
    result.pageErrors = pageErrors.slice(0, 200);
    result.dialogs = dialogs.slice(0, 100);
    result.blockedOrders = blockedOrders;
    result.blockedExternalNavigations = blockedExternalNavigations;
    result.popupAttempts = popupAttempts;
    result.runtimeLoads = runtimeLoads;
    result.mainFrameNavigation = mainFrameNavigation;
    result.navigationGuard = await page
      .evaluate(() => globalThis.__gamsNavigationGuard || null)
      .catch(() => null);
    await context.close();
  }

  result.mainFrameValidBefore = String(result.beforeUrl || "").startsWith(targetPrefix);
  result.mainFrameValidAfter = String(result.afterUrl || "").startsWith(targetPrefix);
  result.captureOk = !result.fatalError
    && result.pageErrors.length === 0
    && result.runtimeLoads.first > 0
    && result.runtimeLoads.second > 0
    && result.blockedOrders.length === 0
    && result.mainFrameValidBefore
    && result.mainFrameValidAfter
    && result.stages.length === probe.taps.length
    && result.stages.every((stage) => stage.mainFrameValid);
  return result;
}

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const cases = [];
try {
  let index = 0;
  for (const probe of probes) {
    cases.push(await runProbe(browser, probe, ++index));
    fs.writeFileSync(
      path.join(outputDir, "report.partial.json"),
      JSON.stringify({ probes, cases }, null, 2) + "\n",
    );
  }
} finally {
  await browser.close();
}

const summary = {
  totalCases: cases.length,
  captureOkCases: cases.filter((item) => item.captureOk).length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  pageErrorCases: cases.filter((item) => item.pageErrors?.length).length,
  runtimeLoadedCases: cases.filter(
    (item) => item.runtimeLoads?.first > 0 && item.runtimeLoads?.second > 0,
  ).length,
  validMainFrameCases: cases.filter(
    (item) => item.mainFrameValidBefore && item.mainFrameValidAfter,
  ).length,
  screenshotChangedCases: cases.filter((item) =>
    item.stages?.some((stage) => stage.screenshotChangedFromPrevious),
  ).length,
  targetListCases: cases.filter((item) =>
    item.stages?.some((stage) => stage.requestWindow?.targetListCount > 0),
  ).length,
  targetReadCases: cases.filter((item) =>
    item.stages?.some((stage) => stage.requestWindow?.targetReadCount > 0),
  ).length,
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  blockedExternalNavigationCases: cases.filter(
    (item) => item.blockedExternalNavigations?.length,
  ).length,
  popupAttemptCases: cases.filter((item) => item.popupAttempts?.length).length,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-isolated-home-entry-probe",
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  targetUrl: safeUrl(targetUrl),
  probes,
  cases,
  summary,
};
report.captureOk = summary.totalCases === probes.length
  && summary.captureOkCases === probes.length
  && summary.fatalCases === 0
  && summary.pageErrorCases === 0
  && summary.runtimeLoadedCases === probes.length
  && summary.validMainFrameCases === probes.length
  && summary.blockedOrderCases === 0;
report.targetEntryVisualValidated = false;
report.ok = false;

fs.writeFileSync(
  path.join(outputDir, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({
  captureOk: report.captureOk,
  targetEntryVisualValidated: false,
  ...summary,
}, null, 2));
if (!report.captureOk) process.exitCode = 1;
