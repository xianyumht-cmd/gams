#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker mismatch: {count}")
    return text.replace(old, new, 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_page5_purchase_action_probe_guard.py",
            "--output",
            args.output,
        ],
        check=True,
    )

    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    old_execution = '''      result.purchaseProbe.listOpen = listOpen;
      result.purchaseProbe.productDetail = productDetail;
      result.purchaseProbe.attempts.push(attempt);
      result.targetWindow = attempt.requestWindow;
      result.targetScreenChanged = attempt.screenChanged;'''

    new_execution = '''      result.purchaseProbe.listOpen = listOpen;
      result.purchaseProbe.productDetail = productDetail;
      result.purchaseProbe.productDetails = [{ label: "first", ...productDetail }];
      result.purchaseProbe.attempts.push({ label: "first", ...attempt });

      const resultConfirmPoint = { x: 162, y: 427, label: "purchase-result-confirm" };
      const closePurchaseResult = async (label) => {
        const beforeConfirmHash = await capture(page, path.join(outputDir, `${prefix}-before-${label}.png`));
        await page.touchscreen.tap(resultConfirmPoint.x, resultConfirmPoint.y);
        events.push({ at: Date.now(), type: "purchase-result-confirm-touch", label, ...resultConfirmPoint });
        await page.waitForTimeout(4000);
        await stage(`after-${label}`);
        return {
          label,
          point: resultConfirmPoint,
          screenChanged: beforeConfirmHash !== result.screenshots[`after-${label}`],
          url: safeUrl(page.url()),
        };
      };

      const purchaseFromVisibleList = async (label) => {
        const productRequestIndex = requests.length;
        const productDialogIndex = dialogs.length;
        const productBlockedIndex = blockedOrders.length;
        const productErrorIndex = pageErrors.length;
        const beforeProduct = await capture(page, path.join(outputDir, `${prefix}-before-${label}-product-detail.png`));
        await page.touchscreen.tap(productPoint.x, productPoint.y);
        events.push({ at: Date.now(), type: "repeat-product-card-touch", label, ...productPoint });
        await page.waitForTimeout(7000);
        await stage(`after-${label}-product-detail`);
        const detail = {
          label,
          point: productPoint,
          screenChanged: beforeProduct !== result.screenshots[`after-${label}-product-detail`],
          requestWindow: requestWindow(requests, productRequestIndex),
          dialogs: dialogs.slice(productDialogIndex),
          blockedOrders: blockedOrders.slice(productBlockedIndex),
          pageErrors: pageErrors.slice(productErrorIndex),
          url: safeUrl(page.url()),
        };
        detail.interactionObserved = Boolean(detail.screenChanged || detail.dialogs.length || detail.blockedOrders.length || detail.requestWindow.total > 0);
        result.purchaseProbe.productDetails.push(detail);

        const finalRequestIndex = requests.length;
        const finalDialogIndex = dialogs.length;
        const finalBlockedIndex = blockedOrders.length;
        const finalErrorIndex = pageErrors.length;
        const beforeFinal = await capture(page, path.join(outputDir, `${prefix}-before-${label}-final-buy.png`));
        await page.touchscreen.tap(finalBuyPoint.x, finalBuyPoint.y);
        events.push({ at: Date.now(), type: "repeat-final-purchase-touch", label, ...finalBuyPoint });
        await page.waitForTimeout(10000);
        await stage(`after-${label}-final-buy`);
        const repeatedAttempt = {
          label,
          point: finalBuyPoint,
          screenChanged: beforeFinal !== result.screenshots[`after-${label}-final-buy`],
          requestWindow: requestWindow(requests, finalRequestIndex),
          dialogs: dialogs.slice(finalDialogIndex),
          blockedOrders: blockedOrders.slice(finalBlockedIndex),
          pageErrors: pageErrors.slice(finalErrorIndex),
          url: safeUrl(page.url()),
        };
        repeatedAttempt.interactionObserved = Boolean(
          repeatedAttempt.screenChanged
          || repeatedAttempt.dialogs.length
          || repeatedAttempt.blockedOrders.length
          || repeatedAttempt.requestWindow.total > 0
        );
        result.purchaseProbe.attempts.push(repeatedAttempt);
        return repeatedAttempt;
      };

      result.purchaseProbe.resultConfirmations = [];
      result.purchaseProbe.resultConfirmations.push(await closePurchaseResult("first-result-confirm"));
      await purchaseFromVisibleList("second");
      result.purchaseProbe.resultConfirmations.push(await closePurchaseResult("second-result-confirm"));

      const reentryStartLoads = { ...runtimeLoads };
      const reentryResponse = await page.goto(route.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      result.reentry.goto = { status: reentryResponse?.status() ?? null, url: safeUrl(page.url()) };
      await page.waitForTimeout(28000);
      await stage("purchase-reentry-initial-ready");
      await clickRuntimeButton(page, events, "purchase-reentry-runtime-open"); await stage("purchase-reentry-runtime-open");
      await clickRuntimeButton(page, events, "purchase-reentry-runtime-close"); await stage("purchase-reentry-runtime-close");
      result.reentry.engineCapture = await captureEngine("purchase-reentry");
      await page.waitForTimeout(22000);
      await stage("before-third-list-open-after-reentry");
      await openTarget("third-list-open-after-reentry");
      await purchaseFromVisibleList("third-after-reentry");
      result.reentry.runtimeLoadsDelta = {
        first: runtimeLoads.first - reentryStartLoads.first,
        second: runtimeLoads.second - reentryStartLoads.second,
        official: runtimeLoads.official - reentryStartLoads.official,
      };

      const finalAttempt = result.purchaseProbe.attempts[result.purchaseProbe.attempts.length - 1];
      result.targetWindow = finalAttempt?.requestWindow || null;
      result.targetScreenChanged = result.purchaseProbe.attempts.every((item) => item.screenChanged);'''
    text = replace_once(text, old_execution, new_execution, "repeat purchase execution")

    text = replace_once(
        text,
        'const attempts = candidateCase?.purchaseProbe?.attempts || [];',
        'const productDetails = candidateCase?.purchaseProbe?.productDetails || [];\nconst attempts = candidateCase?.purchaseProbe?.attempts || [];',
        "product details collection",
    )
    text = replace_once(
        text,
        '  productDetailInteractionObservedCount: productDetail?.interactionObserved ? 1 : 0,\n  productDetailScreenChangedCount: productDetail?.screenChanged ? 1 : 0,',
        '  productDetailInteractionObservedCount: productDetails.filter((item) => item.interactionObserved).length,\n  productDetailScreenChangedCount: productDetails.filter((item) => item.screenChanged).length,',
        "product details summary",
    )
    text = replace_once(text, '  && summary.listOpenCount === 1', '  && summary.listOpenCount === 2', "list open gate")
    text = replace_once(text, '  && summary.listTargetReadCount === 1', '  && summary.listTargetReadCount === 2', "list read gate")
    text = replace_once(text, '  && summary.listTargetListCount === 1', '  && summary.listTargetListCount === 2', "list request gate")
    text = replace_once(text, '  && summary.productDetailInteractionObservedCount === 1', '  && summary.productDetailInteractionObservedCount === 3', "detail interaction gate")
    text = replace_once(text, '  && summary.productDetailScreenChangedCount === 1', '  && summary.productDetailScreenChangedCount === 3', "detail change gate")
    text = replace_once(text, '  && summary.purchaseAttemptCount === 1', '  && summary.purchaseAttemptCount === 3', "purchase count gate")
    text = replace_once(
        text,
        'report.productDetailObserved = Boolean(productDetail?.interactionObserved && productDetail?.screenChanged);',
        'report.productDetailObserved = productDetails.length === 3 && productDetails.every((item) => item.interactionObserved && item.screenChanged);',
        "detail result gate",
    )
    text = replace_once(
        text,
        'report.purchaseActionReached = Boolean(attempt?.interactionObserved);',
        'report.purchaseActionReached = attempts.length === 3 && attempts.every((item) => item.interactionObserved);',
        "purchase action gate",
    )
    text = replace_once(
        text,
        'report.purchaseResultObserved = Boolean(attempt?.screenChanged || attempt?.dialogs?.length);',
        'report.purchaseResultObserved = attempts.length === 3 && attempts.every((item) => item.screenChanged || item.dialogs?.length);',
        "purchase result gate",
    )
    text = replace_once(
        text,
        'mode: "persisted-runtime-page5-safe-final-purchase-action-probe"',
        'mode: "persisted-runtime-page5-first-second-reentry-third-purchase-probe"',
        "mode",
    )

    page_anchor = '  const page = await context.newPage();'
    page_injection = '''  const page = await context.newPage();
  const purchaseTraceCdp = await context.newCDPSession(page);
  await purchaseTraceCdp.send("Network.enable");
  await purchaseTraceCdp.send("Runtime.enable");
  await purchaseTraceCdp.send("Debugger.enable", { maxScriptsCacheSize: 30_000_000 });
  await purchaseTraceCdp.send("Debugger.setAsyncCallStackDepth", { maxDepth: 32 }).catch(() => {});
  const loginInitiators = [];

  const classifyPurchaseTraceUrl = (raw) => {
    const value = String(raw || "");
    const lower = value.toLowerCase();
    if (lower === virtualSecondUrl.toLowerCase()) return "runtime-second";
    if (lower.includes("/bin/official/game.js")) return "official-page-runtime";
    if (lower.includes("webgllib.js")) return "official-render-library";
    if (lower.startsWith(targetPrefix.toLowerCase())) return "target-page";
    if (lower.startsWith("chrome-error://")) return "browser-error";
    if (!value) return "missing";
    return "other-script";
  };

  const flattenPurchaseTraceStack = (root) => {
    const frames = [];
    let stack = root || null;
    let depth = 0;
    while (stack && frames.length < 40 && depth < 16) {
      for (const frame of stack.callFrames || []) {
        frames.push({
          functionName: String(frame.functionName || "").slice(0, 180),
          sourceClass: classifyPurchaseTraceUrl(frame.url),
          lineNumber: Number.isFinite(frame.lineNumber) ? frame.lineNumber : null,
          columnNumber: Number.isFinite(frame.columnNumber) ? frame.columnNumber : null,
          scriptId: String(frame.scriptId || "").slice(0, 80),
        });
        if (frames.length >= 40) break;
      }
      stack = stack.parent || null;
      depth += 1;
    }
    return frames;
  };

  purchaseTraceCdp.on("Network.requestWillBeSent", (event) => {
    try {
      const raw = String(event.request?.url || "");
      const lower = raw.toLowerCase();
      const relevant = lower.includes("/sso/")
        || lower.includes("login")
        || lower.includes("crosscheck")
        || lower.includes("passport.");
      if (!relevant) return;
      const frames = flattenPurchaseTraceStack(event.initiator?.stack || null);
      loginInitiators.push({
        at: Date.now(),
        initiatorType: event.initiator?.type || null,
        requestMethod: event.request?.method || null,
        requestClass: "login-or-session",
        documentClass: classifyPurchaseTraceUrl(event.documentURL),
        frameCount: frames.length,
        frames,
      });
    } catch (error) {
      loginInitiators.push({
        at: Date.now(),
        initiatorType: "trace-error",
        requestClass: "login-or-session",
        error: redactText(error?.stack || error),
        frameCount: 0,
        frames: [],
      });
    }
  });'''
    text = replace_once(text, page_anchor, page_injection, "purchase login trace page anchor")

    final_anchor = '''    result.blockedExternalNavigations = blockedExternalNavigations; result.mainFrameNavigation = mainFrameNavigation; result.runtimeLoads = runtimeLoads;
    await context.close();'''
    final_replacement = '''    result.blockedExternalNavigations = blockedExternalNavigations; result.mainFrameNavigation = mainFrameNavigation; result.runtimeLoads = runtimeLoads;
    result.loginInitiators = loginInitiators.slice(0, 80);
    await purchaseTraceCdp.detach().catch(() => {});
    await context.close();'''
    text = replace_once(text, final_anchor, final_replacement, "purchase login trace finalizer")

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
