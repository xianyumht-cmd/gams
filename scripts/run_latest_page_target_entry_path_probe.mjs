#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "latest-page-target-entry-path-probe";
const currentFirstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const currentSecondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const runtimeButtonSelector = "#orange-script-panel-button";
const runtimePanelSelector = "#orange-script-panel";

const probes = [
  {
    name: "1682748-direct",
    targetId: "1682748",
    url: "https://m.66rpg.com/h5/1682748?ohp=v3&quality=32",
    sequence: [{ label: "direct-target-entry", x: 105, y: 650 }],
  },
  {
    name: "1683604-menu-entry",
    targetId: "1683604",
    url: "https://m.66rpg.com/h5/1683604?ohp=v3&quality=32",
    sequence: [
      { label: "page-menu", x: 350, y: 725 },
      { label: "target-entry", x: 138, y: 314 },
    ],
  },
  {
    name: "1683020-menu-entry",
    targetId: "1683020",
    url: "https://m.66rpg.com/h5/1683020?ohp=v3&quality=32",
    sequence: [
      { label: "page-menu", x: 350, y: 725 },
      { label: "target-entry", x: 325, y: 574 },
    ],
  },
  {
    name: "1668408-top-entry",
    targetId: "1668408",
    url: "https://m.66rpg.com/h5/1668408?ohp=v3&quality=32",
    sequence: [
      { label: "page-menu", x: 350, y: 725 },
      { label: "target-entry-top", x: 25, y: 332 },
    ],
  },
  {
    name: "1668408-image-entry",
    targetId: "1668408",
    url: "https://m.66rpg.com/h5/1668408?ohp=v3&quality=32",
    sequence: [
      { label: "page-menu", x: 350, y: 725 },
      { label: "target-entry-image", x: 250, y: 229 },
    ],
  },
  {
    name: "1691512-side-menu",
    targetId: "1691512",
    url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32",
    sequence: [{ label: "side-menu", x: 285, y: 94 }],
  },
  {
    name: "1691512-side-middle",
    targetId: "1691512",
    url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32",
    sequence: [{ label: "side-middle", x: 325, y: 94 }],
  },
  {
    name: "1691512-side-gift",
    targetId: "1691512",
    url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32",
    sequence: [{ label: "side-gift", x: 365, y: 94 }],
  },
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

function requestKind(url, method) {
  const lower = String(url || "").toLowerCase();
  if (lower === virtualSecondUrl.toLowerCase()
      || lower.includes("gams-script-edge.2320006072.workers.dev/engine/stable.js")
      || lower.includes("space-z.ai/game.js")) return "second-file";
  if (lower.includes("c2.cgyouxi.com/website/hfplayer/") && lower.includes("/bin/official/game.js")) return "official-file";
  if (lower.includes("raw.githubusercontent.com/xianyumht-cmd/gams")
      && (lower.includes("/remote-script/") || lower.includes("/game-engine/"))) return "forbidden-remote-runtime";
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
  if (mutation && (lower.includes("createbuyorder") || lower.includes("createorder") || lower.includes("/order/create")
      || lower.includes("purchase") || lower.includes("/pay"))) return "blocked-order-mutation";
  return "page-request";
}

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  return sha256(fs.readFileSync(filePath));
}

async function inspectPage(page, stage) {
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
    const panelText = String(panel?.innerText || "").replace(/\s+/g, " ").trim();
    return {
      stage: stageName,
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      runtimeLoaded: Boolean(globalThis.__GG_V2_CONTROL_LOADED__),
      buttonPresent: Boolean(button),
      buttonVisible: visible(button),
      panelPresent: Boolean(panel),
      panelVisible: visible(panel),
      noLoginEnabledTextPresent: /免登录[^]*?开启/.test(panelText) || /免登录[^]*?on/i.test(panelText),
      navigationGuard: globalThis.__gamsNavigationGuard || null,
    };
  }, { buttonSelector: runtimeButtonSelector, panelSelector: runtimePanelSelector, stageName: stage });
}

async function clickRuntimeButton(page, events, label) {
  const locator = page.locator(runtimeButtonSelector).first();
  await locator.waitFor({ state: "visible", timeout: 10000 });
  const box = await locator.boundingBox();
  await locator.click({ force: true, timeout: 6000 });
  events.push({ at: Date.now(), type: "runtime-button-click", label, box: box ? {
    x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height),
  } : null });
  await page.waitForTimeout(800);
}

async function runProbe(browser, probe, index) {
  const firstRaw = fs.readFileSync(currentFirstPath, "utf8");
  const secondBytes = fs.readFileSync(currentSecondPath);
  const events = [];
  const dialogs = [];
  const consoleMessages = [];
  const pageErrors = [];
  const navigation = [];
  const requestFailures = [];
  const requests = [];
  const blockedOrderMutations = [];
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
    const kind = requestKind(request.url(), request.method());
    const entry = {
      at: Date.now(),
      kind,
      method: request.method(),
      resourceType: request.resourceType(),
      url: safeUrl(request.url()),
      postDataLength: request.postDataBuffer()?.length || 0,
    };
    requests.push(entry);
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
    if (kind === "blocked-order-mutation") {
      blockedOrderMutations.push(entry);
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
  page.on("dialog", async (dialog) => {
    dialogs.push({ type: dialog.type(), message: redactText(dialog.message()), at: Date.now() });
    await dialog.accept().catch(() => {});
  });
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: redactText(message.text()) }));
  page.on("pageerror", (error) => pageErrors.push(redactText(error?.stack || error)));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigation.push({ at: Date.now(), url: safeUrl(frame.url()) });
  });
  page.on("requestfailed", (request) => requestFailures.push({
    at: Date.now(), url: safeUrl(request.url()), resourceType: request.resourceType(), failure: request.failure()?.errorText || "",
  }));

  const prefix = `${String(index).padStart(2, "0")}-${probe.name}`;
  const result = {
    name: probe.name,
    targetId: probe.targetId,
    targetUrl: safeUrl(probe.url),
    sequence: probe.sequence,
    first: { size: Buffer.byteLength(firstRaw), sha256: sha256(Buffer.from(firstRaw)) },
    second: { size: secondBytes.length, sha256: sha256(secondBytes) },
    stages: {},
    screenshots: {},
  };

  const stage = async (name) => {
    result.stages[name] = await inspectPage(page, name);
    result.screenshots[name] = await capture(page, path.join(outputDir, `${prefix}-${name}.png`));
  };

  try {
    const response = await page.goto(probe.url, { waitUntil: "domcontentloaded", timeout: 45000 });
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

    for (let stepIndex = 0; stepIndex < probe.sequence.length; stepIndex += 1) {
      const step = probe.sequence[stepIndex];
      await page.touchscreen.tap(step.x, step.y);
      events.push({ at: Date.now(), type: "probe-tap", stepIndex, ...step });
      await page.waitForTimeout(5000);
      await stage(`after-${String(stepIndex + 1).padStart(2, "0")}-${step.label}`);
    }
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
    result.blockedOrderMutations = blockedOrderMutations;
    result.runtimeLoads = runtimeLoads;
    await context.close();
  }
  return result;
}

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const cases = [];
try {
  let index = 0;
  for (const probe of probes) {
    cases.push(await runProbe(browser, probe, ++index));
    fs.writeFileSync(path.join(outputDir, "report.partial.json"), JSON.stringify({ probes, cases }, null, 2) + "\n");
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
  noLoginEnabledCases: cases.filter((item) => item.stages?.["runtime-open"]?.noLoginEnabledTextPresent).length,
  secondFileLoadCases: cases.filter((item) => item.runtimeLoads?.second > 0).length,
  completedSequenceCases: cases.filter((item) => !item.fatalError && item.sequence.every((step, stepIndex) =>
    item.stages?.[`after-${String(stepIndex + 1).padStart(2, "0")}-${step.label}`])).length,
  blockedOrderMutationCases: cases.filter((item) => item.blockedOrderMutations?.length).length,
  pageErrorCases: cases.filter((item) => item.pageErrors?.length).length,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "current-runtime-target-entry-path-probe",
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  probes: probes.map(({ name, targetId, url, sequence }) => ({ name, targetId, url: safeUrl(url), sequence })),
  cases,
  summary,
};
report.pass = summary.totalCases === probes.length
  && summary.fatalCases === 0
  && summary.runtimeButtonPresentCases === probes.length
  && summary.runtimeOpenCases === probes.length
  && summary.runtimeCloseCases === probes.length
  && summary.runtimeReopenCases === probes.length
  && summary.noLoginEnabledCases === probes.length
  && summary.secondFileLoadCases === probes.length
  && summary.completedSequenceCases === probes.length
  && summary.blockedOrderMutationCases === 0
  && summary.pageErrorCases === 0;

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, ...summary }, null, 2));
if (!report.pass) process.exitCode = 1;
