#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-official-scene-contract-probe";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const officialPattern = /([A-Za-z_$][\w$]*)\['_g'\+'GM'\+'su'\+'n2'\+'Fw'\+'wT'\+'o'\]\(\)\['is'\+'Mo'\+'bi'\+'le'\]\(\)\|\|\(([A-Za-z_$][\w$]*)\['sc'\+'en'\+'e'\]=new ([A-Za-z_$][\w$]*)\(\)\)/;
const menuPoint = { nx: 1227 / 1280, ny: 115 / 720 };

fs.mkdirSync(outputDir, { recursive: true });
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const safeUrl = (raw) => {
  try {
    const url = new URL(String(raw));
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return String(raw || "").slice(0, 300);
  }
};

async function capture(page, name) {
  const file = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return sha256(fs.readFileSync(file));
}

async function canvasGeometry(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas") || document.querySelector("canvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      id: canvas.id || "",
      width: canvas.width,
      height: canvas.height,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      orientation: screen.orientation?.type || null,
    };
  });
}

function toCss(geometry, point) {
  return {
    x: geometry.rect.x + geometry.rect.width * point.nx,
    y: geometry.rect.y + geometry.rect.height * point.ny,
  };
}

const requests = [];
const blockedOrders = [];
const blockedNavigations = [];
const pageErrors = [];
const requestFailures = [];
const navigation = [];
const patchInfo = {
  matched: false,
  replacementCount: 0,
  originalSha256: null,
  patchedSha256: null,
  originalSize: null,
  patchedSize: null,
  identifiers: null,
};

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-official-scene-contract-read-only-probe",
  targetUrl: safeUrl(targetUrl),
  menuPoint,
  screenshots: {},
  patchInfo,
  apkExecuted: false,
  paymentCompleted: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
  authorizationOutcomeModified: false,
};

try {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
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
    const method = request.method().toUpperCase();
    const lower = rawUrl.toLowerCase();
    const topNavigation = (() => {
      try {
        return request.isNavigationRequest() && request.frame().parentFrame() === null;
      } catch {
        return false;
      }
    })();
    const entry = { at: Date.now(), method, resourceType: request.resourceType(), topNavigation, url: safeUrl(rawUrl) };
    requests.push(entry);

    const order = !["GET", "HEAD", "OPTIONS"].includes(method)
      && (lower.includes("createorder") || lower.includes("createbuyorder") || lower.includes("/pay"));
    if (order) {
      blockedOrders.push(entry);
      await route.abort("blockedbyclient");
      return;
    }
    if (topNavigation && !rawUrl.startsWith(targetPrefix)) {
      blockedNavigations.push(entry);
      await route.abort("blockedbyclient");
      return;
    }

    if (lower.includes("/website/hfplayer/v3/bin/official/game.js")) {
      const response = await route.fetch();
      const original = await response.text();
      patchInfo.originalSize = Buffer.byteLength(original);
      patchInfo.originalSha256 = sha256(Buffer.from(original));
      const match = officialPattern.exec(original);
      if (!match) {
        await route.fulfill({ response, body: original });
        return;
      }
      const [oldText, controllerVar, runtimeVar, menuCtorVar] = match;
      const controllerExpression = `${controllerVar}['_g'+'GM'+'su'+'n2'+'Fw'+'wT'+'o']()`;
      const replacement = `${controllerExpression}['is'+'Mo'+'bi'+'le']()||(globalThis.__gamsOfficialSceneContract={runtime:${runtimeVar},controller:${controllerExpression},previousScene:${runtimeVar}['sc'+'en'+'e'],menuCtor:${menuCtorVar}},${runtimeVar}['sc'+'en'+'e']=new ${menuCtorVar}())`;
      const patched = original.replace(oldText, replacement);
      patchInfo.matched = true;
      patchInfo.replacementCount = patched === original ? 0 : 1;
      patchInfo.identifiers = { controllerVar, runtimeVar, menuCtorVar };
      patchInfo.patchedSize = Buffer.byteLength(patched);
      patchInfo.patchedSha256 = sha256(Buffer.from(patched));
      await route.fulfill({
        response,
        body: patched,
        headers: { ...response.headers(), "content-type": "application/javascript; charset=utf-8" },
      });
      return;
    }
    await route.continue();
  });

  await context.addInitScript({ content: `
    (() => {
      const nav = globalThis.__gamsNavigationGuard = globalThis.__gamsNavigationGuard || { supported: false, blocked: [], allowed: [] };
      try {
        if (globalThis.navigation && typeof globalThis.navigation.addEventListener === 'function') {
          nav.supported = true;
          globalThis.navigation.addEventListener('navigate', (event) => {
            try {
              const url = new URL(event.destination.url, location.href);
              if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                nav.blocked.push({ url: url.protocol + '//' + url.host + url.pathname, at: Date.now() });
                if (event.cancelable) event.preventDefault();
                return;
              }
              nav.allowed.push({ url: url.protocol + '//' + url.host + url.pathname, at: Date.now() });
            } catch (error) {
              nav.blocked.push({ url: String(event.destination?.url || '').slice(0, 300), at: Date.now() });
              if (event.cancelable) event.preventDefault();
            }
          });
        }
      } catch (error) {
        nav.error = String(error).slice(0, 300);
      }
    })();
  ` });

  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 5000)));
  page.on("requestfailed", (request) => requestFailures.push({ url: safeUrl(request.url()), failure: request.failure()?.errorText || "" }));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigation.push({ at: Date.now(), url: safeUrl(frame.url()) });
  });

  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  report.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
  await page.waitForTimeout(50000);
  report.geometry = await canvasGeometry(page);
  if (!report.geometry) throw new Error("canvas geometry unavailable");
  report.menuCssPoint = toCss(report.geometry, menuPoint);
  report.screenshots.beforeMenu = await capture(page, "before-menu");
  await page.touchscreen.tap(report.menuCssPoint.x, report.menuCssPoint.y);
  await page.waitForTimeout(7000);
  report.screenshots.afterMenu = await capture(page, "after-menu");

  report.contract = await page.evaluate(() => {
    const contract = globalThis.__gamsOfficialSceneContract;
    const primitive = (value) => {
      if (value == null || typeof value === "boolean" || typeof value === "number") return value;
      if (typeof value === "string") return value.slice(0, 300);
      return undefined;
    };
    const describe = (value, maxKeys = 120) => {
      if (value == null) return null;
      const result = {
        type: typeof value,
        constructorName: (() => { try { return value.constructor?.name || ""; } catch { return ""; } })(),
        ownKeys: [],
        prototypeKeys: [],
        fields: {},
      };
      try { result.ownKeys = Object.getOwnPropertyNames(value).slice(0, maxKeys); } catch {}
      try { result.prototypeKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(value) || {}).slice(0, maxKeys); } catch {}
      for (const key of result.ownKeys) {
        try {
          const item = value[key];
          const direct = primitive(item);
          if (direct !== undefined) result.fields[key] = direct;
          else if (Array.isArray(item)) result.fields[key] = { type: "array", length: item.length };
          else if (typeof item === "function") result.fields[key] = { type: "function", name: item.name || "" };
          else if (item && typeof item === "object") {
            const summary = { type: "object", constructorName: item.constructor?.name || "" };
            for (const geometryKey of ["x", "y", "width", "height", "visible", "alpha", "name", "text", "isShow", "enabled"]) {
              try {
                const field = primitive(item[geometryKey]);
                if (field !== undefined) summary[geometryKey] = field;
              } catch {}
            }
            try { if (Array.isArray(item.children)) summary.childrenLength = item.children.length; } catch {}
            result.fields[key] = summary;
          }
        } catch (error) {
          result.fields[key] = { type: "error", message: String(error).slice(0, 200) };
        }
      }
      return result;
    };

    const nodes = [];
    const seen = new WeakSet();
    const walk = (value, path, depth) => {
      if (!value || (typeof value !== "object" && typeof value !== "function") || depth < 0) return;
      if (seen.has(value)) return;
      seen.add(value);
      let keys = [];
      try { keys = Object.getOwnPropertyNames(value).slice(0, 160); } catch { return; }
      const lowerKeys = keys.map((key) => key.toLowerCase());
      const interactive = lowerKeys.some((key) => key.includes("click") || key.includes("touch") || key.includes("button") || key.includes("btn"));
      const geometry = {};
      for (const key of ["x", "y", "width", "height", "visible", "alpha", "name", "text", "isShow", "enabled"]) {
        try {
          const item = primitive(value[key]);
          if (item !== undefined) geometry[key] = item;
        } catch {}
      }
      if (interactive || Object.keys(geometry).length >= 2) {
        nodes.push({
          path,
          constructorName: (() => { try { return value.constructor?.name || ""; } catch { return ""; } })(),
          keys: keys.slice(0, 60),
          geometry,
          interactive,
        });
      }
      if (depth === 0) return;
      for (const key of keys) {
        if (nodes.length >= 500) break;
        let child;
        try { child = value[key]; } catch { continue; }
        if (!child || (typeof child !== "object" && typeof child !== "function")) continue;
        if (key === "parent" || key === "stage" || key === "canvas") continue;
        walk(child, `${path}.${key}`, depth - 1);
      }
    };

    if (!contract) return { available: false };
    walk(contract.previousScene, "previousScene", 4);
    return {
      available: true,
      previousScene: describe(contract.previousScene),
      currentScene: describe(contract.runtime?.scene),
      runtime: describe(contract.runtime, 160),
      runtimeCanvas: describe(contract.runtime?.canvas, 160),
      controller: describe(contract.controller, 160),
      menuCtor: describe(contract.menuCtor, 80),
      interactiveNodes: nodes.slice(0, 500),
    };
  });

  report.final = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    navigationGuard: globalThis.__gamsNavigationGuard || null,
  }));
  report.mainFrameValid = page.url().startsWith(targetPrefix);
  report.requests = requests.slice(0, 8000);
  report.blockedOrders = blockedOrders;
  report.blockedNavigations = blockedNavigations;
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures.slice(0, 800);
  report.navigation = navigation;
  report.pass = patchInfo.replacementCount === 1
    && report.contract?.available === true
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0;
  await context.close();
} catch (error) {
  report.fatalError = String(error?.stack || error).slice(0, 8000);
  report.requests = requests.slice(0, 8000);
  report.blockedOrders = blockedOrders;
  report.blockedNavigations = blockedNavigations;
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures.slice(0, 800);
  report.navigation = navigation;
  report.pass = false;
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  pass: report.pass,
  patchInfo: report.patchInfo,
  contractAvailable: report.contract?.available || false,
  interactiveNodeCount: report.contract?.interactiveNodes?.length || 0,
  mainFrameValid: report.mainFrameValid,
  pageErrorCount: report.pageErrors?.length || 0,
  blockedOrderCount: report.blockedOrders?.length || 0,
}, null, 2));
if (!report.pass) process.exitCode = 1;
