#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const outputDir = process.env.OUTPUT_DIR || "page5-candidate-mouseup-state-probe";
const currentFirstPath = process.env.CURRENT_FIRST_PATH || "remote-script/src/noname.js";
const currentSecondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const virtualSecondUrl = "https://ggv2.local/runtime/game.js";
const targetUrl = "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32";
const targetPrefix = "https://m.66rpg.com/h5/1691512";
const runtimeButtonSelector = "#orange-script-panel-button";

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

function makeCandidate(source) {
  const oldText = `Sj['pr'+'ot'+'ot'+'yp'+'e']['is'+'Mo'+'bi'+'le']=function(){if(Sg['yI'+'hA'+'A'](Sg['Yz'+'Pf'+'J'],Sg['ka'+'gG'+'p']))return this['_f'+'oc'+'us'+'Gr'+'ou'+'pI'+'d'];else{var SF=this['us'+'er'+'Da'+'ta']['pl'+'at'+'fo'+'rm']['to'+'Lo'+'we'+'rC'+'as'+'e']();return-7096*1+-2669+9765<=SF['in'+'de'+'xO'+'f']('an'+'dr'+'oi'+'d')||Sg['Lr'+'NB'+'P'](327+-13*188+2117,SF['in'+'de'+'xO'+'f'](Sg['oM'+'lO'+'f']));}},`;
  const newText = `Sj['pr'+'ot'+'ot'+'yp'+'e']['is'+'Mo'+'bi'+'le']=function(){if(Sg['yI'+'hA'+'A'](Sg['Yz'+'Pf'+'J'],Sg['ka'+'gG'+'p']))return this['_f'+'oc'+'us'+'Gr'+'ou'+'pI'+'d'];else{var SF=this['us'+'er'+'Da'+'ta']['pl'+'at'+'fo'+'rm']['to'+'Lo'+'we'+'rC'+'as'+'e']();return-7096*1+-2669+9765<=SF['in'+'de'+'xO'+'f']('an'+'dr'+'oi'+'d')||Sg['Lr'+'NB'+'P'](327+-13*188+2117,SF['in'+'de'+'xO'+'f'](Sg['oM'+'lO'+'f']))||(location['pa'+'th'+'na'+'me']['in'+'de'+'xO'+'f']('/h5/1691512')>=0&&/android|iphone|ipad|ipod|mobile/i['te'+'st'](navigator['us'+'er'+'Ag'+'en'+'t']));}},`;
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`candidate replacement count mismatch: ${count}`);
  const candidate = source.replace(oldText, newText);
  if (candidate === source || !candidate.includes(newText)) throw new Error("candidate verification failed");
  return { candidate, count, oldTextSha256: sha256(Buffer.from(oldText)), newTextSha256: sha256(Buffer.from(newText)) };
}

async function capture(page, name) {
  const file = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return sha256(fs.readFileSync(file));
}

async function valueOnFrame(cdp, callFrameId, expression) {
  try {
    const evaluated = await cdp.send("Debugger.evaluateOnCallFrame", {
      callFrameId,
      expression,
      returnByValue: true,
      silent: true,
      throwOnSideEffect: true,
      timeout: 3000,
    });
    if (evaluated.exceptionDetails) return { available: false, exception: evaluated.exceptionDetails.text || "evaluation error" };
    return { available: true, value: evaluated.result?.value ?? null, type: evaluated.result?.type || null };
  } catch (error) {
    return { available: false, exception: String(error).slice(0, 500) };
  }
}

const firstRaw = fs.readFileSync(currentFirstPath, "utf8");
const currentSecond = fs.readFileSync(currentSecondPath, "utf8");
const candidatePatch = makeCandidate(currentSecond);
const pageErrors = [];
const requestFailures = [];
const requests = [];
const blockedOrders = [];
const blockedNavigations = [];
const debuggerErrors = [];
const pauses = [];
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-candidate-mouseup-state-read-only-probe",
  targetUrl: safeUrl(targetUrl),
  candidatePatch: {
    replacementCount: candidatePatch.count,
    oldTextSha256: candidatePatch.oldTextSha256,
    newTextSha256: candidatePatch.newTextSha256,
    currentSecondSize: Buffer.byteLength(currentSecond),
    currentSecondSha256: sha256(Buffer.from(currentSecond)),
    candidateSecondSize: Buffer.byteLength(candidatePatch.candidate),
    candidateSecondSha256: sha256(Buffer.from(candidatePatch.candidate)),
  },
  screenshots: {},
  pauses,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
  authorizationOutcomeModified: false,
  paymentCompleted: false,
  apkExecuted: false,
};

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

  await context.route("**/*", async (route) => {
    const request = route.request();
    const rawUrl = request.url();
    const lower = rawUrl.toLowerCase();
    const method = request.method().toUpperCase();
    const topNavigation = (() => {
      try { return request.isNavigationRequest() && request.frame().parentFrame() === null; }
      catch { return false; }
    })();
    const entry = { at: Date.now(), method, resourceType: request.resourceType(), topNavigation, url: safeUrl(rawUrl) };
    requests.push(entry);
    if (rawUrl === virtualSecondUrl || lower.includes("gams-script-edge.2320006072.workers.dev/engine/stable.js") || lower.includes("space-z.ai/game.js")) {
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: candidatePatch.candidate });
      return;
    }
    if (lower.includes("c2.cgyouxi.com/website/hfplayer/") && lower.includes("/bin/official/game.js")) {
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: "window.__gg_official_engine_blocked__=true;" });
      return;
    }
    const order = !["GET", "HEAD", "OPTIONS"].includes(method)
      && (lower.includes("createorder") || lower.includes("createbuyorder") || lower.includes("/order/create") || lower.includes("purchase") || lower.includes("/pay"));
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
    await route.continue();
  });

  await context.addInitScript({ content: wrapFirstFile(transformFirstFile(firstRaw)) });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error).slice(0, 5000)));
  page.on("requestfailed", (request) => requestFailures.push({ url: safeUrl(request.url()), failure: request.failure()?.errorText || "" }));

  const cdp = await context.newCDPSession(page);
  await cdp.send("Runtime.enable");
  await cdp.send("Debugger.enable", { maxScriptsCacheSize: 30_000_000 });

  const breakpointLabels = new Map();
  let resolvePauses;
  const pausesReady = new Promise((resolve) => { resolvePauses = resolve; });
  cdp.on("Debugger.paused", async (event) => {
    try {
      const frame = event.callFrames?.[0];
      if (!frame) throw new Error("pause without call frame");
      const labels = (event.hitBreakpoints || []).map((id) => breakpointLabels.get(id) || id);
      const state = await valueOnFrame(
        cdp,
        frame.callFrameId,
        "({tb:typeof tb==='undefined'?null:tb,tx:typeof tx==='undefined'?null:tx,tO:typeof tO==='undefined'?null:tO,tm:typeof tm==='undefined'?null:tm,tU:typeof tU==='undefined'?null:tU,tR:typeof tR==='undefined'?null:tR,tv:typeof tv==='undefined'?null:tv,NN:typeof NN==='undefined'?null:NN,tB:typeof tB==='undefined'?null:tB})",
      );
      pauses.push({
        at: Date.now(),
        labels,
        reason: event.reason,
        functionName: frame.functionName || "",
        location: frame.location,
        state,
      });
      await cdp.send("Debugger.resume");
      if (pauses.length >= 2) resolvePauses(true);
    } catch (error) {
      debuggerErrors.push(String(error?.stack || error).slice(0, 2000));
      try { await cdp.send("Debugger.resume"); } catch {}
      resolvePauses(false);
    }
  });

  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  report.goto = { status: response?.status() ?? null, url: safeUrl(page.url()) };
  await page.waitForTimeout(28000);
  const runtimeButton = page.locator(runtimeButtonSelector).first();
  if (await runtimeButton.isVisible().catch(() => false)) {
    await runtimeButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    await runtimeButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }

  report.screenshots.initial = await capture(page, "initial");
  await page.touchscreen.tap(195, 422);
  await page.waitForTimeout(7000);
  report.screenshots.afterCoverProgress = await capture(page, "after-cover-progress");
  await page.touchscreen.tap(50, 420);
  await page.waitForTimeout(7000);
  report.screenshots.afterTitleReveal = await capture(page, "after-title-reveal");

  const gpRemote = await cdp.send("Runtime.evaluate", {
    expression: "typeof gp === 'function' ? gp : null",
    objectGroup: "gams-page5-candidate-mouseup-state",
    returnByValue: false,
    silent: true,
  });
  if (!gpRemote.result?.objectId) throw new Error("candidate mouse-up function unavailable");
  const functionSourceRemote = await cdp.send("Runtime.callFunctionOn", {
    objectId: gpRemote.result.objectId,
    functionDeclaration: "function(){return Function.prototype.toString.call(this);}",
    returnByValue: true,
    silent: true,
  });
  const functionSource = String(functionSourceRemote.result?.value || "");
  const functionProperties = await cdp.send("Runtime.getProperties", {
    objectId: gpRemote.result.objectId,
    ownProperties: true,
    accessorPropertiesOnly: false,
    generatePreview: false,
  });
  const functionLocation = (functionProperties.internalProperties || []).find((item) => item.name === "[[FunctionLocation]]")?.value?.value;
  if (!functionLocation?.scriptId) throw new Error("candidate mouse-up function location unavailable");
  if (functionSource.length !== 1278 || sha256(Buffer.from(functionSource)) !== "8c4369715f263e16bd3d3e4654f19a51d58a66b6fc0138c446dfbde66c0cf913") {
    throw new Error(`candidate mouse-up source mismatch: ${functionSource.length}`);
  }
  const script = await cdp.send("Debugger.getScriptSource", { scriptId: functionLocation.scriptId });
  const sourceStart = script.scriptSource.indexOf(functionSource);
  if (sourceStart < 0 || script.scriptSource.indexOf(functionSource, sourceStart + 1) >= 0) throw new Error("candidate mouse-up source occurrence mismatch");
  const beforeOffset = functionSource.indexOf("tB=");
  const afterOffset = functionSource.indexOf("tU=");
  if (beforeOffset < 0 || afterOffset <= beforeOffset) throw new Error("candidate mouse-up breakpoint markers unavailable");

  for (const [label, columnNumber] of [
    ["before-core", sourceStart + beforeOffset],
    ["after-click-decision", sourceStart + afterOffset],
  ]) {
    const set = await cdp.send("Debugger.setBreakpoint", {
      location: { scriptId: functionLocation.scriptId, lineNumber: 0, columnNumber },
    });
    breakpointLabels.set(set.breakpointId, label);
    report[label] = { breakpointId: set.breakpointId, requestedColumn: columnNumber, actualLocation: set.actualLocation };
  }
  report.function = {
    sourceLength: functionSource.length,
    sourceSha256: sha256(Buffer.from(functionSource)),
    scriptId: functionLocation.scriptId,
    functionColumn: functionLocation.columnNumber,
    sourceStart,
    beforeOffset,
    afterOffset,
  };

  report.screenshots.beforeFinalTap = await capture(page, "before-final-tap");
  await page.touchscreen.tap(195, 422);
  await Promise.race([pausesReady, new Promise((resolve) => setTimeout(() => resolve(false), 15000))]);
  await page.waitForTimeout(12000);
  report.screenshots.afterFinalTap = await capture(page, "after-final-tap");
  report.final = await page.evaluate(() => ({ url: location.href, title: document.title, readyState: document.readyState }));
  report.mainFrameValid = page.url().startsWith(targetPrefix);
  report.requests = requests.slice(0, 8000);
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures.slice(0, 800);
  report.blockedOrders = blockedOrders;
  report.blockedNavigations = blockedNavigations;
  report.debuggerErrors = debuggerErrors;
  report.pass = pauses.length >= 2
    && pauses.some((item) => item.labels.includes("before-core"))
    && pauses.some((item) => item.labels.includes("after-click-decision"))
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;
  try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "gams-page5-candidate-mouseup-state" }); } catch {}
  await context.close();
} catch (error) {
  report.fatalError = String(error?.stack || error).slice(0, 8000);
  report.requests = requests.slice(0, 8000);
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures.slice(0, 800);
  report.blockedOrders = blockedOrders;
  report.blockedNavigations = blockedNavigations;
  report.debuggerErrors = debuggerErrors;
  report.pass = false;
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  pass: report.pass,
  pauseCount: pauses.length,
  pauseLabels: pauses.flatMap((item) => item.labels),
  states: pauses.map((item) => item.state?.value || null),
  pageErrorCount: pageErrors.length,
  blockedOrderCount: blockedOrders.length,
  debuggerErrorCount: debuggerErrors.length,
}, null, 2));
if (!report.pass) process.exitCode = 1;
