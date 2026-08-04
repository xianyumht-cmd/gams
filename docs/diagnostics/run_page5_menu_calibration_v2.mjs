#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-menu-calibration-v2";
const firstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const secondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const menuTap = { x: 351, y: 741 };

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

const firstRaw = fs.readFileSync(firstPath, "utf8");
const secondBytes = fs.readFileSync(secondPath);
const requests = [];
const responses = [];
const requestFailures = [];
const consoleMessages = [];
const pageErrors = [];
const dialogs = [];
const blockedOrders = [];
const mainFrameNavigation = [];
const runtimeLoads = { first: 1, second: 0 };

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
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
  (() => {
    const state = globalThis.__gamsNavigationGuard = globalThis.__gamsNavigationGuard || { supported: false, blocked: [], allowed: [] };
    try {
      if (globalThis.navigation && typeof globalThis.navigation.addEventListener === 'function') {
        state.supported = true;
        globalThis.navigation.addEventListener('navigate', (event) => {
          try {
            const url = new URL(event.destination.url, location.href);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
              state.blocked.push({ url: url.protocol + '//' + url.host + url.pathname, at: Date.now() });
              if (event.cancelable) event.preventDefault();
              return;
            }
            state.allowed.push({ url: url.protocol + '//' + url.host + url.pathname, at: Date.now() });
          } catch (error) {
            state.blocked.push({ url: String(event.destination?.url || '').slice(0, 300), at: Date.now(), error: String(error).slice(0, 300) });
            if (event.cancelable) event.preventDefault();
          }
        });
      }
    } catch (error) {
      state.error = String(error).slice(0, 300);
    }
  })();
` });
await context.addInitScript({ content: wrapFirstFile(transformFirstFile(firstRaw)) });

const page = await context.newPage();
page.on("dialog", async (dialog) => {
  dialogs.push({ at: Date.now(), type: dialog.type(), message: redactText(dialog.message()) });
  await dialog.dismiss().catch(() => {});
});
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

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  mode: "page5-menu-calibration-v2-client-equivalent-navigation",
  targetUrl: safeUrl(targetUrl),
  menuTap,
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  screenshots: {},
};

try {
  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  report.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
  await page.waitForTimeout(28000);
  report.beforeUrl = safeUrl(page.url());
  report.screenshots.before = await capture(page, path.join(outputDir, "page5-before-menu.png"));
  report.menuTapAt = Date.now();
  await page.touchscreen.tap(menuTap.x, menuTap.y);
  await page.waitForTimeout(5000);
  report.afterUrl = safeUrl(page.url());
  report.screenshots.after = await capture(page, path.join(outputDir, "page5-after-menu.png"));
  report.screenshotChanged = report.screenshots.before !== report.screenshots.after;
} catch (error) {
  report.fatalError = redactText(error?.stack || error);
  await capture(page, path.join(outputDir, "page5-fatal.png")).catch(() => {});
} finally {
  report.requests = requests.slice(0, 4000);
  report.responses = responses.slice(0, 4000);
  report.requestFailures = requestFailures.slice(0, 1000);
  report.console = consoleMessages.slice(0, 500);
  report.pageErrors = pageErrors.slice(0, 200);
  report.dialogs = dialogs.slice(0, 100);
  report.blockedOrders = blockedOrders;
  report.runtimeLoads = runtimeLoads;
  report.mainFrameNavigation = mainFrameNavigation;
  report.navigationGuard = await page.evaluate(() => globalThis.__gamsNavigationGuard || null).catch(() => null);
  await context.close();
  await browser.close();
}

const windowRequests = Number.isFinite(report.menuTapAt)
  ? report.requests.filter((item) => item.at >= report.menuTapAt && item.at <= report.menuTapAt + 6000)
  : [];
const kinds = {};
for (const item of windowRequests) kinds[item.kind] = (kinds[item.kind] || 0) + 1;
report.menuWindow = {
  total: windowRequests.length,
  kinds,
  targetReadCount: windowRequests.filter((item) => item.kind === "target-read-request").length,
  orderCount: windowRequests.filter((item) => item.kind === "order-request").length,
};
report.mainFrameValidBefore = String(report.beforeUrl || "").startsWith(targetPrefix);
report.mainFrameValidAfter = String(report.afterUrl || "").startsWith(targetPrefix);
report.captureOk = !report.fatalError
  && report.pageErrors.length === 0
  && report.runtimeLoads.first > 0
  && report.runtimeLoads.second > 0
  && report.blockedOrders.length === 0
  && report.mainFrameValidBefore
  && report.mainFrameValidAfter
  && Boolean(report.screenshots.before)
  && Boolean(report.screenshots.after);
report.menuVisualValidated = false;
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  captureOk: report.captureOk,
  menuVisualValidated: false,
  mainFrameValidBefore: report.mainFrameValidBefore,
  mainFrameValidAfter: report.mainFrameValidAfter,
  screenshotChanged: report.screenshotChanged,
  blockedNavigationCount: report.navigationGuard?.blocked?.length || 0,
  menuWindow: report.menuWindow,
}, null, 2));
if (!report.captureOk) process.exitCode = 1;
